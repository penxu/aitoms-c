import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as nodeModule from 'node:module';
const {stripTypeScriptTypes}=nodeModule as unknown as {stripTypeScriptTypes:(source:string)=>string};
const source=fs.readFileSync(new URL('../../app/api/projects/[id]/files/route.ts',import.meta.url),'utf8');
const js=stripTypeScriptTypes(source).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
for(const mode of ['preview','full'])test(`${mode}文件保存保留租约和路径工具，仅full保护快照`,async()=>{
 const calls:string[]=[];
 const put=vm.runInNewContext(`${js}\nPUT`,{config:{generationVerificationMode:mode},acquireProjectMutation:()=>{calls.push('lease');return()=>calls.push('release');},ProjectBusyError:class extends Error{},pinServiceToSnapshot:async()=>{calls.push('snapshot');},writeFile:(_id:string,p:string)=>{calls.push('write:'+p);},NextResponse:{json:(value:unknown)=>value}});
 await put({json:async()=>({path:'app/page.tsx',content:'new source'})},{params:Promise.resolve({id:'p'})});
 assert.deepEqual(calls,mode==='full'?['lease','snapshot','write:app/page.tsx','release']:['lease','write:app/page.tsx','release']);
});
