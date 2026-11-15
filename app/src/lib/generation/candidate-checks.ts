import {resolveInsideProject} from "@/lib/workspace/paths";
import fs from 'node:fs';
import path from 'node:path';
import {allocatePort,releasePortReservation} from '@/lib/runner';
import {runCommand} from '@/lib/workspace/command';
import {pnpmShellCommand} from '@/lib/workspace/toolchain';
import {writeFile} from '@/lib/workspace/files';
import {config} from '@/lib/config';
import {waitForHealth} from './health';
import {runAcceptance,type AcceptanceCheck,type AcceptanceResult} from './acceptance';
import {checkPreviewHome} from './preview-home';
import type {StageContext} from './types';

/** 每项业务用例拥有独立数据库，刷新在同一用例内保持数据，其他用例从空库开始。 */
export async function checkCandidate(ctx:StageContext,relativeRoot:string,dataDir:string):Promise<AcceptanceResult[]> {
 const deadline=new AbortController();
 const timer=setTimeout(()=>deadline.abort(new Error('预览验证超时')),config.acceptanceTimeoutMs);
 const signal=AbortSignal.any([ctx.signal,deadline.signal]);
 const basePath=`/p/${ctx.projectId}`;
 const results:AcceptanceResult[]=[];
 const attemptRoot=fs.mkdtempSync(path.join(dataDir,"browser-attempt-"));
 const checkSession=async(checks:AcceptanceCheck[],session:string)=>{
  signal.throwIfAborted();
  const databaseDir=path.join(attemptRoot,session);fs.mkdirSync(databaseDir,{recursive:true});
  const port=await allocatePort();const controller=new AbortController();
  const sessionSignal=AbortSignal.any([signal,controller.signal]);
  let output='';
  const running=runCommand(ctx.projectId,`${pnpmShellCommand()} run start -p ${port} -H 127.0.0.1`,{
   cwd:relativeRoot,signal:sessionSignal,timeoutMs:config.acceptanceTimeoutMs+60000,
   env:{PORT:String(port),HOSTNAME:'127.0.0.1',NODE_ENV:'production',ATOMS_DATA_DIR:databaseDir,DATABASE_PATH:path.join(databaseDir,'app.db'),ATOMS_BASE_PATH:basePath,NEXT_PUBLIC_ATOMS_BASE_PATH:basePath},
  }).then(result=>{output=[result.stdout,result.stderr].join('\n');return result;});
  try {
   const healthy=await Promise.race([waitForHealth(port,60000,basePath,sessionSignal),running.then(()=>false)]);
   sessionSignal.throwIfAborted();
   if(!healthy){controller.abort();await running;throw Error(`候选服务未就绪：${output.slice(-6000)}`); }
   releasePortReservation(port);
   if(config.generationVerificationMode !== 'full') return await checkPreviewHome(`http://127.0.0.1:${port}${basePath}`,sessionSignal);
   return await runAcceptance(`http://127.0.0.1:${port}${basePath}`,checks,sessionSignal,undefined,config.browserChannel,config.chromiumPath,resolveInsideProject(ctx.projectId,`.atoms/acceptance/${ctx.runId}/${session}`,{allowMissing:true}));
  }finally {controller.abort();try{await running;}finally{releasePortReservation(port);}}
 };
 try {
  const full=config.generationVerificationMode === 'full';
  const checks=full?(ctx.plan?.acceptance??[]):[];
  const staticPages=(ctx.plan?.pages??['/']).filter(route=>!/[\[\]:]/.test(route));
  const smoke=staticPages.map((route,index)=>({id:`PAGE-${index+1}`,route,steps:[{action:'request' as const,path:route,method:'GET' as const,expectStatus:200}]}));
  if(full){
   ctx.log('info',`正在真实浏览器检查 ${smoke.length} 个页面和 ${checks.length} 项业务验收`);
   for(let offset=0;offset<smoke.length;offset+=20)results.push(...await checkSession(smoke.slice(offset,offset+20),`pages-${offset}`));
  }else{
   ctx.log('info','正在检查实际预览首页；自动业务验收不阻断预览');
   results.push(...await checkSession([],'preview-home'));
  }
  for(const [index,check] of checks.entries()){
   ctx.log('info',`业务验收 ${index+1}/${checks.length}：${check.description??check.id}`);
   results.push(...await checkSession([check],`business-${index}`));
  }
  signal.throwIfAborted();
  writeFile(ctx.projectId,'.atoms/ACCEPTANCE.json',JSON.stringify({runId:ctx.runId,createdAt:new Date().toISOString(),results},null,2));
  const failed=results.filter(result=>result.status==='failed');
  if(failed.length)throw Error(`${full?'浏览器/API验收失败':'预览首页检查失败'}：${failed.map(result=>`${result.id}: ${result.error?.split("实际可访问页面：")[0].slice(0,1000)}`).join('\n')}\n页面上下文：${failed.find(item=>item.error?.includes("实际可访问页面："))?.error?.split("实际可访问页面：")[1]?.slice(0,3000)??""}`);
  return results;
 }finally {clearTimeout(timer);deadline.abort();fs.rmSync(attemptRoot,{recursive:true,force:true});}
}
