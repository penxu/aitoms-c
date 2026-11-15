import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import * as nodeModule from 'node:module';

const { stripTypeScriptTypes } = nodeModule as unknown as {stripTypeScriptTypes:(source:string)=>string};
function executable(file:string):string {
  return stripTypeScriptTypes(fs.readFileSync(new URL(file,import.meta.url),'utf8'))
    .replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
}

test('准备工程在运行环境不可用时只写文件，保留修改并拒绝覆盖外部工程',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-code-first-'));
  try {
    const root=path.join(temp,'project'),templates=path.join(temp,'templates');
    fs.mkdirSync(root);fs.mkdirSync(path.join(templates,'next-base','.atoms'),{recursive:true});
    fs.writeFileSync(path.join(templates,'next-base','package.json'),'{}');
    fs.writeFileSync(path.join(templates,'next-base','.atoms','CONVENTIONS.md'),'rules');
    let runtimeCalls=0;
    const blocked=()=>{runtimeCalls++;throw Error('Docker 工程工具链初始化超时');};
    const api=vm.runInNewContext(`${executable('./scaffold.ts')}\n({scaffoldProject})`,{
      fs,path,createHash,config:{templateRoot:templates},ensureProjectRoot:()=>root,
      resolveInsideProject:(_id:string,relative:string)=>path.join(root,relative),
      ensureGitRepo:blocked,commitAll:blocked,dependencyFingerprint:blocked,
    });
    const first=await api.scaffoldProject('p');
    assert.equal(first.action,'copied');assert.equal(runtimeCalls,0);
    assert.equal(fs.readFileSync(path.join(root,'package.json'),'utf8'),'{}');
    assert.equal(fs.existsSync(path.join(root,'.atoms')),true);
    fs.writeFileSync(path.join(root,'package.json'),'user edit');
    await api.scaffoldProject('p');
    assert.equal(fs.readFileSync(path.join(root,'package.json'),'utf8'),'user edit');
    assert.equal(runtimeCalls,0);
    fs.rmSync(path.join(root,'.atoms'),{recursive:true});
    await assert.rejects(api.scaffoldProject('p'),/拒绝覆盖/);
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
});

test('模板复制中断后保留工程标识，下一次准备能补齐文件',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-scaffold-retry-'));
  try {
    const root=path.join(temp,'project'),templates=path.join(temp,'templates');
    fs.mkdirSync(root);fs.mkdirSync(path.join(templates,'next-base'),{recursive:true});
    fs.writeFileSync(path.join(templates,'next-base','a.txt'),'a');
    fs.writeFileSync(path.join(templates,'next-base','b.txt'),'b');
    let fail=true;
    const api=vm.runInNewContext(`${executable('./scaffold.ts')}\n({scaffoldProject})`,{
      fs:{...fs,copyFileSync:(source:string,target:string)=>{if(fail&&target.endsWith('b.txt'))throw Error('disk interrupted');fs.copyFileSync(source,target);}},
      path,createHash,config:{templateRoot:templates},ensureProjectRoot:()=>root,
      resolveInsideProject:(_id:string,relative:string)=>path.join(root,relative),
      ensureGitRepo:async()=>{},commitAll:async()=>{},dependencyFingerprint:()=>null,
    });
    await assert.rejects(api.scaffoldProject('p'),/disk interrupted/);
    assert.equal(fs.existsSync(path.join(root,'.atoms')),true);
    fail=false;await api.scaffoldProject('p');
    assert.equal(fs.readFileSync(path.join(root,'b.txt'),'utf8'),'b');
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
});

for(const resume of [false,true]) test(resume?'仅重试验证复用计划和代码，不重跑前五阶段':'后端不可用时仍完成前五阶段，失败记录在验证阶段',async()=>{
  const stages:string[]=[],events:Record<string,unknown>[]=[],updates:Record<string,unknown>[]=[];
  let commits=0;
  const plan={items:[],pages:[],acceptance:[]};
  const context={
    config:{generationStageTimeoutMs:1000},recordProgress(){},setInterval,clearInterval,
    withDeadline:(s:AbortSignal,_ms:number,action:(s:AbortSignal)=>unknown)=>action(s),
    STAGE_ORDER:['discuss','scaffold','spec','plan','build','verify'],STAGE_ROLES:{},
    getEventBus:()=>({emit:(e:Record<string,unknown>)=>events.push(e)}),releaseEventBus(){},updateProjectStatus(){},
    updateGenerationRun:(_id:string,u:Record<string,unknown>)=>updates.push(u),
    runDiscussionStage:async()=>{stages.push('discuss');return{ok:true};},confirmedRequirement:()=> '需求',
    pinServiceToSnapshot:async()=>null,
    scaffoldProject:async()=>{stages.push('scaffold');return {action:'copied',filesWritten:1};},
    runSpecStage:async()=>{stages.push('spec');return{ok:true};},
    runPlanStage:async()=>{stages.push('plan');return{ok:true,plan};},
    runBuildStage:async()=>{stages.push('build');return{ok:true};},
    runVerifyStage:async()=>{stages.push('verify');assert.equal(commits,0,'代码生成结束前不能执行 Git');return resume?{ok:true}:{ok:false,error:'代码已生成，运行环境准备失败：Docker 初始化超时'};},
    commitAll:async()=>{commits++;},ScaffoldConflictError:class extends Error{},
    resolveInsideProject:(_id:string,relative:string)=>relative,
    fs:{existsSync:()=>true,statSync:()=>({size:2}),readFileSync:()=>JSON.stringify(plan)},
    collectSource:()=>[],listTemplateFiles:()=>[],validatePlan:()=>({errors:[]}),validateAcceptance:()=>[],requiredSpecRoutes:()=>[],
    readFile:()=>'',getOrCreateMainThread:()=> 'thread',appendMessage(){},
  };
  const execute=vm.runInNewContext(`${executable('./pipeline.ts')}\nexecuteRun`,context);
  await execute({id:'r',projectId:'p',stage:resume?'verify':'discuss',requirement:'需求'},new AbortController().signal);
  assert.deepEqual(stages,resume?['verify']:['discuss','scaffold','spec','plan','build','verify']);
  assert.equal(commits,resume?1:0);
  assert.equal(updates.at(-1)?.status,resume?'ready':'failed');
  if(!resume){
    assert.equal(updates.filter(u=>u.stage).at(-1)?.stage,'verify');
    assert.ok(events.some(e=>e.type==='stage'&&e.stage==='build'&&e.status==='done'));
    assert.equal(events.some(e=>e.type==='run'&&e.status==='ready'),false);
  }
});
