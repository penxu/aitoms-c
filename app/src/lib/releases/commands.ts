import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { packageInvocation, shellQuote } from '../workspace/toolchain.ts';
import { createWorkspaceExecution, ensureWorkspaceRuntime } from '../workspace/execution.ts';

export function packageCommands(root:string):{command:string;install:string[];build:string[];start:string[]} {
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 if(!pkg.dependencies?.next || !pkg.scripts?.build || !pkg.scripts?.start) throw new Error('生产发布需要 Next.js 工程及 build/start 脚本');
 // Never fall back to dev, and keep executable/arguments separate from the shell.
 if(fs.existsSync(path.join(root,'pnpm-lock.yaml')))return {command:'pnpm',install:['install','--config.dangerouslyAllowAllBuilds=true','--frozen-lockfile','--config.node-linker=hoisted','--registry=https://registry.npmjs.org'],build:['run','build'],start:['run','start']};
 throw new Error('缺少依赖锁文件，请先完成应用生成和依赖安装');
}
export async function execute(root:string,command:string,args:string[],env:NodeJS.ProcessEnv,log:(s:string)=>void,timeoutMs=600_000):Promise<void> {
 await ensureWorkspaceRuntime(root);
 return new Promise((resolve,reject)=>{
  const invocation=packageInvocation(command,args);
  const execution=createWorkspaceExecution(root,[invocation.command,...invocation.args].map(shellQuote).join(' '),env);
  const child=spawn(execution.command,execution.args,{cwd:root,env:execution.env,detached:true,stdio:['ignore','pipe','pipe']});
  let last='';let timedOut=false;
  const output=(chunk:Buffer)=>{last=(last+chunk.toString()).slice(-12000);log(chunk.toString().slice(-8000));};
  child.stdout.on('data',output);child.stderr.on('data',output);
  const timer=setTimeout(()=>{timedOut=true;try{if(child.pid)process.kill(-child.pid,'SIGKILL');}catch{}execution.cleanup?.();},timeoutMs);
  child.once('error',error=>{clearTimeout(timer);execution.cleanup?.();reject(error);});
  child.once('close',code=>{clearTimeout(timer);execution.cleanup?.();if(code===0&&!timedOut)resolve();else reject(new Error(timedOut?'命令超时':`${command} ${args.join(' ')} 失败（${code}）\n${last}`));});
 });
}
