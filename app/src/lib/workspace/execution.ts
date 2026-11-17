import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pnpmCliPath } from './toolchain.ts';
import { ensureRuntimeDirectory } from './runtime-directory.ts';
import { config } from '../config.ts';
import {sharedDependencyMount,verifySharedDependencies} from './shared-dependencies.ts';
import { createContainerExecution, dockerRuntime, ensureContainerRuntime, type ExecutionRuntime } from './container-execution.ts';
export { cleanupWorkspaceExecution, isWorkspaceExecutionRunning } from './container-execution.ts';
export interface WorkspaceExecution {command:string;args:string[];env:NodeJS.ProcessEnv;cleanupId?:string;cleanup?:()=>void;sharedDependencyKey?:string}

/** 仅把运行工具链所需变量带给工程；业务变量必须由调用者显式传入。 */
export function workspaceEnvironment(root: string, extraEnv: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const home=ensureRuntimeDirectory(root,'.atoms/runtime/home');
  const temp=ensureRuntimeDirectory(root,'.atoms/runtime/tmp');
  return {
    PATH: [path.dirname(process.execPath), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(path.delimiter),
    LANG: 'en_US.UTF-8', HOME: home, TMPDIR: temp, TMP: temp, TEMP: temp,
    NEXT_TELEMETRY_DISABLED: '1', CI: '1', NODE_ENV: 'development', ...extraEnv,
  };
}

/** 未安装内核隔离工具时拒绝执行，不能退化为仅修改 cwd。 */
function createNativeExecution(root: string, command: string, extraEnv: Record<string, string | undefined> = {}): WorkspaceExecution {
  const realRoot = fs.realpathSync(root);
  const env = workspaceEnvironment(realRoot, extraEnv);
  const readRoots = ['/usr/bin', '/usr/sbin', '/usr/lib', '/usr/lib64', '/usr/include', '/usr/local/include', '/usr/libexec', '/usr/share', '/usr/local/bin', '/usr/local/lib', '/bin', '/sbin', '/lib', '/lib64', '/System', '/Library', '/private/etc', '/etc', '/dev',
    path.dirname(fs.realpathSync(process.execPath)), path.resolve(pnpmCliPath(), '../../..')]
    .filter(value => fs.existsSync(value));
  // 生产数据目录由平台显式传入；普通命令没有额外可写挂载。
  const writeRoots = [realRoot];
  if (extraEnv.ATOMS_DATA_DIR) {
    fs.mkdirSync(extraEnv.ATOMS_DATA_DIR, {recursive:true});
    writeRoots.push(fs.realpathSync(extraEnv.ATOMS_DATA_DIR));
  }
  if (process.platform === 'darwin') {
    const executable = '/usr/bin/sandbox-exec';
    if (!fs.existsSync(executable)) throw new Error('安全隔离不可用：macOS 需要 sandbox-exec；已拒绝执行工程命令');
    const literal = (value:string) => JSON.stringify(value);
    const profile = ['(version 1)', '(deny default)', '(allow process*)', '(allow signal (target children))',
      '(allow sysctl-read)', '(allow mach-lookup)', '(allow network*)', '(allow file-read-metadata)',
      ...readRoots.map(value => `(allow file-read* file-map-executable (subpath ${literal(value)}))`),
      ...writeRoots.map(value => `(allow file-read* file-write* file-map-executable (subpath ${literal(value)}))`),
      '(allow file-write* (literal "/dev/null") (literal "/dev/tty") (literal "/dev/dtracehelper"))',
    ].join('\n');
    return checkedExecution({command:executable,args:['-p',profile,'/bin/bash','--noprofile','--norc','-c',command],env}, realRoot);
  }
  if (process.platform === 'linux') {
    const executable = ['/usr/bin/bwrap','/bin/bwrap'].find(value => fs.existsSync(value));
    if (!executable) throw new Error('安全隔离不可用：Linux 需要 bubblewrap（bwrap）与可用的用户命名空间；已拒绝执行工程命令');
    const args = ['--die-with-parent','--unshare-user','--new-session','--unshare-pid','--unshare-ipc','--unshare-uts','--proc','/proc','--dev','/dev','--tmpfs','/tmp'];
    for (const value of [...new Set(readRoots)].filter(value => value !== '/dev')) args.push('--ro-bind',value,value);
    for (const value of [...new Set(writeRoots)]) args.push('--bind',value,value);
    const shared=sharedDependencyMount(realRoot,{node:process.version,platform:process.platform,arch:process.arch,backend:'native',image:''});
    if(shared)args.push('--ro-bind',shared.source,shared.target);
    args.push('--chdir',realRoot,'--','/bin/bash','--noprofile','--norc','-c',command);
    return {...checkedExecution({command:executable,args,env}, realRoot),sharedDependencyKey:shared?.key};
  }
  throw new Error(`安全隔离不支持当前系统 ${process.platform}，已拒绝执行工程命令`);
}

function checkedExecution(invocation: {command:string;args:string[];env:NodeJS.ProcessEnv}, root:string): typeof invocation {
  const probe=spawnSync(invocation.command,[...invocation.args.slice(0,-1),'/usr/bin/true'],{cwd:root,env:invocation.env,encoding:'utf8',timeout:5000});
  if(probe.status!==0 || probe.error) {
    throw new Error(`安全隔离初始化失败，已拒绝执行工程命令（${probe.signal ?? probe.status ?? probe.error?.message}）：${probe.stderr?.trim() || '系统不允许当前隔离策略；请检查 sandbox-exec / bwrap 与宿主机权限'}`);
  }
  return invocation;
}

export function createWorkspaceExecution(root:string,command:string,extraEnv:Record<string,string|undefined>={}): WorkspaceExecution {
  if(config.workspaceExecutionBackend!=='docker') {
    try {return createNativeExecution(root,command,extraEnv);} catch(error) {
      if(config.workspaceExecutionBackend==='native')throw error;
    }
  }
  return createContainerExecution(root,command,workspaceEnvironment(root,extraEnv),config.workspaceContainerImage);
}

export function workspaceExecutionRuntime(root:string):ExecutionRuntime {
  if(config.workspaceExecutionBackend!=='docker') {
    try {createNativeExecution(root,'/usr/bin/true');return {node:process.version,platform:process.platform,arch:process.arch,backend:'native',image:''};} catch(error) {
      if(config.workspaceExecutionBackend==='native')throw error;
    }
  }
  return dockerRuntime(config.workspaceContainerImage);
}

export async function ensureWorkspaceRuntime(root:string,signal?:AbortSignal):Promise<ExecutionRuntime> {
  signal?.throwIfAborted();
  if(config.workspaceExecutionBackend!=='docker') {
    try {
      const runtime={node:process.version,platform:process.platform,arch:process.arch,backend:'native',image:''};
      await verifySharedDependencies(root,runtime,signal);
      createNativeExecution(root,'/usr/bin/true');return runtime;
    } catch(error) {
      if(signal?.aborted)throw error;
      if(config.workspaceExecutionBackend==='native')throw error;
    }
  }
  const pending=ensureContainerRuntime(config.workspaceContainerImage);
  const runtime=await (!signal?pending:new Promise<ExecutionRuntime>((resolve,reject)=>{
    const aborted=()=>reject(signal.reason??new Error('工程初始化已取消'));
    signal.addEventListener('abort',aborted,{once:true});
    pending.then(resolve,reject).finally(()=>signal.removeEventListener('abort',aborted));
    if(signal.aborted)aborted();
  }));
  signal?.throwIfAborted();
  await verifySharedDependencies(root,runtime,signal);
  return runtime;
}
