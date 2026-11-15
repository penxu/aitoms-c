import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as toolchain from '../workspace/toolchain.ts';

test('安装参数拒绝 shell 注入、选项和远程安装源', () => {
  assert.equal(typeof toolchain.installDependenciesCommand, 'function');
  for (const input of ['next;touch /tmp/pwn', '--dir=/tmp', 'https://evil/x', '../sibling', 'foo$(id)', 'foo\nbar']) assert.throws(() => toolchain.installDependenciesCommand([input]));
  assert.match(toolchain.installDependenciesCommand(['@types/node@^20', 'zod@3.25.0']), /add/);
});

test('异步工具链初始化共享任务且等待期间事件循环持续响应',async(t)=>{
  const {ensureWorkspaceRuntime}=await import('../workspace/execution.ts');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-runtime-async-'));
  let heartbeats=0;const heartbeat=setInterval(()=>{heartbeats++;},1);
  try {
    const [first,second]=await Promise.all([ensureWorkspaceRuntime(root),ensureWorkspaceRuntime(root)]);
    assert.deepEqual(first,second);
    if(first.backend==='docker')assert.ok(heartbeats>0,'Docker初始化期间心跳必须可运行');
  } catch(error) {
    if(error instanceof Error && /安全隔离|Docker 隔离不可用/.test(error.message)){t.skip(error.message);return;}throw error;
  } finally {clearInterval(heartbeat);fs.rmSync(root,{recursive:true,force:true});}
});

test('真实隔离允许项目内读写但拒绝兄弟目录和平台凭据', async (t) => {
  const { createWorkspaceExecution, ensureWorkspaceRuntime } = await import('../workspace/execution.ts');
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'atoms-execution-'));
  const root = path.join(fixture, 'project'); const sibling = path.join(fixture, 'secret.txt');
  fs.mkdirSync(root); fs.writeFileSync(sibling, 'private');
  const original = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = 'fixture-platform-secret';
  try {
    const script = `const fs=require('fs');fs.writeFileSync('allowed.txt','ok');console.log(fs.readFileSync('allowed.txt','utf8'));for(const op of [()=>fs.readFileSync(${JSON.stringify(sibling)}),()=>fs.writeFileSync(${JSON.stringify(sibling)},'bad')]){try{op();process.exit(9)}catch{}}if(process.env.OPENAI_API_KEY)process.exit(10);`;
    let invocation;
    try {await ensureWorkspaceRuntime(root);invocation = createWorkspaceExecution(root, `${toolchain.shellQuote(process.execPath)} -e ${toolchain.shellQuote(script)}`);} catch(error) {
      if(error instanceof Error && /安全隔离(初始化失败|不可用|不支持)|Docker 隔离不可用/.test(error.message)) {t.skip(error.message);return;}
      throw error;
    }
    assert.equal(invocation.env.OPENAI_API_KEY, undefined);
    const result = spawnSync(invocation.command, invocation.args, {cwd: root, env: invocation.env, encoding:'utf8'});
    assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout.trim(), 'ok');
    assert.equal(fs.readFileSync(sibling,'utf8'), 'private');
    fs.mkdirSync(path.join(root,'fixture-package'));
    fs.writeFileSync(path.join(root,'fixture-package/package.json'),JSON.stringify({name:'fixture-local',version:'1.0.0',main:'index.js',scripts:{install:`node -e "require('fs').writeFileSync('installed.txt','ready')"`}}));
    fs.writeFileSync(path.join(root,'fixture-package/index.js'),'module.exports=42;');
    fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'fixture-app',version:'1.0.0',dependencies:{'fixture-local':'file:./fixture-package'},scripts:{build:`node -e "require('fs').writeFileSync('build-output.txt',String(require('fixture-local')))"`}}));
    const install=createWorkspaceExecution(root,`git init && git add package.json && git -c user.name=Atoms -c user.email=fixture@example.invalid commit -m fixture && ${toolchain.installDependenciesCommand()} && ${toolchain.pnpmShellCommand()} run build`);
    const built=spawnSync(install.command,install.args,{cwd:root,env:install.env,encoding:'utf8',timeout:60000});
    assert.equal(built.status,0,built.stderr+'\n'+built.stdout);
    assert.equal(fs.readFileSync(path.join(root,'build-output.txt'),'utf8'),'42');
    assert.equal(fs.readFileSync(path.join(root,'node_modules/fixture-local/installed.txt'),'utf8'),'ready');
  } finally {
    if (original === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = original;
    fs.rmSync(fixture,{recursive:true,force:true});
  }
});

test('工程环境不继承任意平台变量，业务值仅由显式参数传入', async () => {
  const {workspaceEnvironment}=await import('../workspace/execution.ts');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-env-'));
  const saved=process.env.ATOMS_TEST_PLATFORM_SECRET;
  process.env.ATOMS_TEST_PLATFORM_SECRET='fixture-secret';
  try {
    const environment=workspaceEnvironment(root,{BUSINESS_TOKEN:'explicit',NODE_ENV:'production'});
    assert.equal(environment.ATOMS_TEST_PLATFORM_SECRET,undefined);
    assert.equal(environment.OPENAI_API_KEY,undefined);
    assert.equal(environment.BUSINESS_TOKEN,'explicit');
    assert.equal(environment.NODE_ENV,'production');
    assert.ok(environment.HOME?.startsWith(fs.realpathSync(root)+path.sep));
    assert.ok(environment.TMPDIR?.startsWith(fs.realpathSync(root)+path.sep));
  } finally {
    if(saved===undefined)delete process.env.ATOMS_TEST_PLATFORM_SECRET;else process.env.ATOMS_TEST_PLATFORM_SECRET=saved;
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('Docker 清理协议杀死容器且拒绝越界 cidfile', async(t) => {
  const {createWorkspaceExecution,cleanupWorkspaceExecution,ensureWorkspaceRuntime}=await import('../workspace/execution.ts');
  const {spawn}=await import('node:child_process');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-container-cleanup-'));
  let invocation;
  try {await ensureWorkspaceRuntime(root); invocation=createWorkspaceExecution(root,'exec sleep 30'); } catch(error) {
    fs.rmSync(root,{recursive:true,force:true});
    if(error instanceof Error && /安全隔离|Docker 隔离不可用/.test(error.message)){t.skip(error.message);return;}throw error;
  }
  if(!invocation.cleanupId){fs.rmSync(root,{recursive:true,force:true});t.skip('当前为native后端');return;}
  const child=spawn(invocation.command,invocation.args,{cwd:root,env:invocation.env,stdio:'ignore'});
  const exited=new Promise(resolve=>child.once('close',resolve));
  try {
    const deadline=Date.now()+10000;
    while(!fs.existsSync(invocation.cleanupId)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(fs.existsSync(invocation.cleanupId),true);
    assert.throws(()=>cleanupWorkspaceExecution(root,path.join(root,'outside.cid')));
    invocation.cleanup?.();
    await Promise.race([exited,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('容器清理后CLI仍未退出')),5000);timer.unref();})]);
    assert.equal(fs.existsSync(invocation.cleanupId),false);
  } finally {invocation.cleanup?.();child.kill();fs.rmSync(root,{recursive:true,force:true});}
});

test('Docker 只发布loopback端口且不挂平台目录或Docker socket', async(t) => {
  const {createWorkspaceExecution,ensureWorkspaceRuntime}=await import('../workspace/execution.ts');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-container-args-'));
  try {
    let invocation;
    try {await ensureWorkspaceRuntime(root);invocation=createWorkspaceExecution(root,"node server.js '-H' '127.0.0.1' --database=http://127.0.0.1:9000",{PORT:'4998',HOSTNAME:'127.0.0.1'});} catch(error) {
      if(error instanceof Error && /安全隔离|Docker 隔离不可用/.test(error.message)){t.skip(error.message);return;}throw error;
    }
    if(!invocation.cleanupId){t.skip('当前为native后端');return;}
    const command=invocation.args.at(-1)!;
    assert.ok(invocation.args.includes('127.0.0.1:4998:4998'));
    assert.match(command,/'-H' '0\.0\.0\.0'/);
    assert.match(command,/--database=http:\/\/127\.0\.0\.1:9000/);
    assert.equal(invocation.args.some(value=>value.includes('docker.sock')),false);
    assert.ok(invocation.args.includes('--read-only'));
    assert.ok(invocation.args.includes('--cap-drop=ALL'));
    assert.ok(invocation.args.includes('--pids-limit=256'));
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('显式临时数据目录的宿主路径别名在容器内可创建数据库',async(t)=>{
  const {createWorkspaceExecution,ensureWorkspaceRuntime}=await import('../workspace/execution.ts');
  const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-data-alias-'));
  const root=path.join(fixture,'project'),data=path.join(fixture,'runtime-data');fs.mkdirSync(root);fs.mkdirSync(data);
  let execution;
  try {
    await ensureWorkspaceRuntime(root);
    execution=createWorkspaceExecution(root,`node -e ${toolchain.shellQuote("const fs=require('fs');fs.mkdirSync(process.env.ATOMS_DATA_DIR,{recursive:true});fs.writeFileSync(process.env.DATABASE_PATH,'persisted');")}`,{ATOMS_DATA_DIR:data,DATABASE_PATH:path.join(data,'app.db')});
    const result=spawnSync(execution.command,execution.args,{cwd:root,env:execution.env,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.equal(fs.readFileSync(path.join(data,'app.db'),'utf8'),'persisted');
  } catch(error) {
    if(error instanceof Error && /安全隔离|Docker 隔离不可用/.test(error.message)){t.skip(error.message);return;}throw error;
  } finally {execution?.cleanup?.();fs.rmSync(fixture,{recursive:true,force:true});}
});

test('创建隔离HOME前拒绝runtime目录符号链接逃逸',async()=>{
  const {workspaceEnvironment}=await import('../workspace/execution.ts');
  const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-runtime-escape-'));
  const root=path.join(fixture,'project'),sibling=path.join(fixture,'sibling');
  fs.mkdirSync(path.join(root,'.atoms'),{recursive:true});fs.mkdirSync(sibling);
  fs.symlinkSync(sibling,path.join(root,'.atoms/runtime'));
  try {
    assert.throws(()=>workspaceEnvironment(root),/符号链接|项目目录/);
    assert.deepEqual(fs.readdirSync(sibling),[]);
  } finally {fs.rmSync(fixture,{recursive:true,force:true});}
});
