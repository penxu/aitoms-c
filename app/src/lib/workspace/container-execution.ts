import { dockerCliEnvironment } from "./docker-environment.ts";
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { pnpmCliPath, shellQuote } from './toolchain.ts';
import { ensureRuntimeDirectory } from './runtime-directory.ts';

export interface ExecutionRuntime {node:string;platform:string;arch:string;backend:string;image:string}
const imageRuntimes=new Map<string,ExecutionRuntime>();
function workspaceLabel(root:string):string {return createHash('sha256').update(fs.realpathSync(root)).digest('hex');}
function containerName(root:string,cleanupId:string):string {return `atoms-${workspaceLabel(root).slice(0,16)}-${path.basename(cleanupId,'.cid')}`;}
function dockerEnvironment(): NodeJS.ProcessEnv {
  return dockerCliEnvironment();
}
const DEFAULT_BASE_IMAGE='node:22-bookworm-slim';
const TOOLCHAIN_DOCKERFILE=`FROM ${DEFAULT_BASE_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates python3 make g++ && rm -rf /var/lib/apt/lists/*
`;
function preparedImage(image:string):string {
  return image===DEFAULT_BASE_IMAGE ? `atoms-workspace:node22-${createHash('sha256').update(TOOLCHAIN_DOCKERFILE).digest('hex').slice(0,12)}` : image;
}
const initializations=new Map<string,Promise<ExecutionRuntime>>();
function dockerAsync(args:string[],input?:string,timeoutMs=10000):Promise<{code:number|null;stdout:string;stderr:string}> {
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',args,{env:dockerEnvironment(),stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='';let expired=false;
    const timer=setTimeout(()=>{expired=true;child.kill('SIGKILL');},timeoutMs);
    child.stdout.on('data',chunk=>{stdout=(stdout+chunk.toString()).slice(-6000);});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-6000);});
    child.once('error',error=>{clearTimeout(timer);reject(new Error(`Docker 隔离不可用：${error.message}`));});
    child.once('close',code=>{clearTimeout(timer);if(expired)reject(new Error('Docker 工程工具链初始化超时'));else resolve({code,stdout,stderr});});
    child.stdin.end(input);
  });
}
/** 镜像首次初始化共享一个异步任务；构建期间平台仍可响应心跳与取消请求。 */
export function ensureContainerRuntime(image:string):Promise<ExecutionRuntime> {
  const existing=initializations.get(image);if(existing)return existing;
  const initialization=(async()=>{
    const tag=preparedImage(image);
    const inspect=await dockerAsync(['image','inspect',tag]);
    if(inspect.code!==0) {
      if(image!==DEFAULT_BASE_IMAGE || !/No such image/i.test(inspect.stderr))throw new Error(`Docker 隔离不可用：${inspect.stderr}`);
      const context=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-workspace-image-'));
      try {
        const built=await dockerAsync(['build','--tag',tag,'--file','-',context],TOOLCHAIN_DOCKERFILE,600000);
        if(built.code!==0)throw new Error(`Docker 工程工具链镜像初始化失败：${built.stderr}`);
      } finally {fs.rmSync(context,{recursive:true,force:true});}
    }
    return dockerRuntime(image);
  })();
  initializations.set(image,initialization);
  void initialization.catch(()=>{initializations.delete(image);});
  return initialization;
}
export function dockerRuntime(image:string): ExecutionRuntime {
  const cached=imageRuntimes.get(image);if(cached)return cached;
  const resolvedImage=preparedImage(image);
  const result=spawnSync('docker',['image','inspect',resolvedImage,'--format','{{json .Config.Env}}|{{.Os}}|{{.Architecture}}|{{.Id}}'],{env:dockerEnvironment(),encoding:'utf8',timeout:3000});
  if(result.status!==0)throw new Error(`Docker 隔离不可用或工具链尚未异步初始化：${image}；${result.stderr?.trim()||result.error?.message||result.signal}`);
  const [values,platform,architecture,id]=result.stdout.trim().split('|');
  const node=(JSON.parse(values) as string[]).find(value=>value.startsWith('NODE_VERSION='))?.slice(13);
  if(!node||platform!=='linux')throw new Error('Docker 隔离镜像必须提供 Linux Node 运行环境');
  const runtime={node:`v${node}`,platform,arch:architecture==='amd64'?'x64':architecture,backend:'docker',image:`${resolvedImage}@${id}`};
  imageRuntimes.set(image,runtime);return runtime;
}

/** Docker CLI 为可信宿主进程；只有 --env 列出的工程环境才会进入容器。 */
export function createContainerExecution(root:string,command:string,env:NodeJS.ProcessEnv,image:string): {command:string;args:string[];env:NodeJS.ProcessEnv;cleanupId:string;cleanup:()=>void} {
  const runtime=dockerRuntime(image);
  const immutableImage=runtime.image.slice(runtime.image.lastIndexOf("@")+1);
  const realRoot=fs.realpathSync(root);
  const directory=ensureRuntimeDirectory(realRoot,'.atoms/runtime/containers');
  const cleanupId=path.join(directory,`${randomUUID()}.cid`);
  const cliRoot=fs.realpathSync(path.resolve(pnpmCliPath(),'../..'));
  const args=['run','--name',containerName(realRoot,cleanupId),'--label',`atoms.workspace=${workspaceLabel(realRoot)}`,'--rm','--init','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=256','--memory=4g','--cpus=2','--cidfile',cleanupId,
    '--user',`${process.getuid?.()??1000}:${process.getgid?.()??1000}`,
    '--mount',`type=bind,src=${realRoot},dst=${realRoot}`,'--mount',`type=bind,src=${cliRoot},dst=${cliRoot},readonly`,
    '--tmpfs','/tmp:rw,nosuid,nodev,size=256m','--tmpfs','/run:rw,nosuid,nodev,size=16m','--workdir',realRoot];
  const containerEnv:NodeJS.ProcessEnv={...env,PATH:'/usr/local/bin:/usr/bin:/bin'};
  if(env.ATOMS_DATA_DIR) {
    const data=fs.realpathSync(env.ATOMS_DATA_DIR);
    if(data!==realRoot && !data.startsWith(realRoot+path.sep))args.push('--mount',`type=bind,src=${data},dst=${data}`);
    // macOS /var 与 /private/var 是同一宿主路径，但 Linux 镜像没有该别名。
    containerEnv.ATOMS_DATA_DIR=data;
    if(env.DATABASE_PATH) {
      const relative=path.relative(path.resolve(env.ATOMS_DATA_DIR),path.resolve(env.DATABASE_PATH));
      if(relative!==".."&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative))containerEnv.DATABASE_PATH=path.join(data,relative);
    }
  }
  if(env.PORT) {
    if(!/^\d+$/.test(env.PORT)||Number(env.PORT)<1024||Number(env.PORT)>65535)throw new Error('非法容器服务端口');
    args.push('--publish',`127.0.0.1:${env.PORT}:${env.PORT}`);
    containerEnv.HOSTNAME='0.0.0.0';
    command=command.replace(/((?:-H|--hostname)['"]?(?:\s+['"]?|=))127\.0\.0\.1/g,(_match,prefix:string)=>`${prefix}0.0.0.0`);
  }
  for(const [key,value] of Object.entries(containerEnv)) {
    if(value!==undefined)args.push('--env',`${key}=${value}`);
  }
  command=command.replaceAll(shellQuote(process.execPath),shellQuote('/usr/local/bin/node'));
  args.push(immutableImage,'/bin/bash','--noprofile','--norc','-c',command);
  return {command:'docker',args,env:dockerEnvironment(),cleanupId,cleanup:()=>cleanupWorkspaceExecution(realRoot,cleanupId)};
}

/** cidfile 必须是工程中的普通文件，禁止以任意容器 ID 删除其他租户。 */
export function cleanupWorkspaceExecution(root:string,cleanupId:string): void {
  cleanupContainer(root,cleanupId,0);
}
function cleanupContainer(root:string,cleanupId:string,attempt:number):void {
  const directory=path.join(fs.realpathSync(root),'.atoms','runtime','containers');
  if(path.dirname(cleanupId)!==directory || !/^[a-f0-9-]+\.cid$/.test(path.basename(cleanupId)))throw new Error('非法容器清理路径');
  let id=containerName(root,cleanupId);
  for(const key of runningContainers.keys())if(key.startsWith(`${id}:`))runningContainers.delete(key);
  if(fs.existsSync(cleanupId)) {
    if(!fs.lstatSync(cleanupId).isFile()||fs.realpathSync(cleanupId)!==cleanupId)throw new Error('非法容器清理文件');
    const content=fs.readFileSync(cleanupId,'utf8').trim();
    if(content && !/^[a-f0-9]{64}$/.test(content))throw new Error('非法容器标识');
    if(content)id=content;
  }
  const inspect=spawnSync('docker',['inspect','--format','{{index .Config.Labels "atoms.workspace"}}',id],{env:dockerEnvironment(),encoding:'utf8',timeout:3000});
  if(inspect.status===0) {
    if(inspect.stdout.trim()!==workspaceLabel(root))throw new Error('容器不属于当前工程，拒绝清理');
    const removed=spawnSync('docker',['rm','--force',id],{env:dockerEnvironment(),encoding:'utf8',timeout:3000});
    if(removed.status!==0)return; // 保留cidfile，重启后仍可重试清理。
  } else if(!/No such (object|container)/i.test(inspect.stderr??''))return;
  else if(attempt<2) {const timer=setTimeout(()=>{try{cleanupContainer(root,cleanupId,attempt+1);}catch{}},250);timer.unref();}
  fs.rmSync(cleanupId,{force:true});
}

const runningContainers=new Map<string,{until:number;running:boolean}>();
/** 容器生命期独立于宿主docker CLI；恢复时核对归属、cwd及loopback端口。 */
export function isWorkspaceExecutionRunning(root:string,cleanupId:string,port:number):boolean {
  const realRoot=fs.realpathSync(root);
  const directory=path.join(realRoot,'.atoms','runtime','containers');
  if(path.dirname(cleanupId)!==directory||!/^[a-f0-9-]+\.cid$/.test(path.basename(cleanupId)))return false;
  if(fs.existsSync(cleanupId)&&(!fs.lstatSync(cleanupId).isFile()||fs.realpathSync(cleanupId)!==cleanupId))return false;
  const name=containerName(realRoot,cleanupId);const key=`${name}:${port}`;
  const cached=runningContainers.get(key);if(cached&&cached.until>Date.now())return cached.running;
  const result=spawnSync('docker',['inspect',name],{env:dockerEnvironment(),encoding:'utf8',timeout:3000,maxBuffer:1024*1024});
  let running=false;
  if(result.status===0)try {
    const value=JSON.parse(result.stdout)[0];
    running=value.State?.Running===true&&value.Config?.Labels?.['atoms.workspace']===workspaceLabel(realRoot)&&value.Config?.WorkingDir===realRoot&&value.NetworkSettings?.Ports?.[`${port}/tcp`]?.some((binding:{HostIp:string;HostPort:string})=>binding.HostIp==='127.0.0.1'&&binding.HostPort===String(port));
  }catch{}
  runningContainers.set(key,{until:Date.now()+1000,running:Boolean(running)});return Boolean(running);
}
