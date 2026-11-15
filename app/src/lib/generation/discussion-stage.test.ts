import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as nodeModule from 'node:module';
import {validateAssessment} from './discussion-schema.ts';
const {stripTypeScriptTypes}=nodeModule as unknown as {stripTypeScriptTypes:(s:string)=>string};
const code=stripTypeScriptTypes(fs.readFileSync(new URL('./discussion.ts',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
const assessment={summary:'管理对象不明确',known:[],questions:[{id:'kind',title:'管理对象？',reason:'影响核心业务',options:[{id:'a',label:'客户',description:'管理客户'},{id:'b',label:'库存',description:'管理库存'}],recommendedId:'a'}]};
function fixture(history:unknown[]=[],output:unknown={summary:'明确的待办应用',known:['待办增删改'],questions:[]}){
 const emitted:{type:string;summary?:string}[]=[];let calls=0,paused:unknown=null;
 const store={history:()=>history,pause:(_runId:string,a:unknown)=>{paused=a;return {assessment:a,version:history.length+1};}};
 const context={sqlite:{},validateAssessment,config:{},getModel:()=>null,addRunTokens(){},DiscussionStore:class{constructor(){return store;}},generateText:async()=>{calls++;return {text:typeof output==='string'?output:JSON.stringify(output),usage:{}};}};
 const stage=vm.runInNewContext(`${code}\nrunDiscussionStage`,context);
 return {emitted,get calls(){return calls;},get paused(){return paused;},run:(signal=new AbortController().signal)=>stage({runId:'r',requirement:'需求',signal,emit:(e:{type:string})=>emitted.push(e),log(){}})};
}
test('清晰需求直接实施，不产生讨论问题',async()=>{const f=fixture();assert.equal((await f.run()).waiting,undefined);assert.equal(f.calls,1);assert.equal(f.paused,null);});
test('模糊需求持久化问题并返回等待',async()=>{const f=fixture([],assessment);assert.equal((await f.run()).waiting,true);assert.ok(f.paused);assert.ok(f.emitted.some(e=>e.type==='discussion'));});
test('明确采用推荐时不再调用模型反复提问',async()=>{const f=fixture([{assessment,answers:{kind:{optionId:'a'}},useRecommended:true}]);assert.equal((await f.run()).ok,true);assert.equal(f.calls,0);assert.equal(f.emitted[0]?.type,'assessment');});
test('两轮后仍有歧义时必须展示最终假设供确认',async()=>{const h={assessment,answers:{kind:{optionId:'a'}},useRecommended:false};const f=fixture([h,h],assessment);assert.equal((await f.run()).waiting,true);assert.equal((f.paused as {finalConfirmation:boolean}).finalConfirmation,true);});
test('格式错误不默认放行',async()=>{const f=fixture([],'bad json');await assert.rejects(f.run(),/格式无效/);assert.equal(f.paused,null);});
test('模型返回时取消，不得创建等待状态',async()=>{const f=fixture([],assessment),c=new AbortController();c.abort();await assert.rejects(f.run(c.signal));assert.equal(f.paused,null);});
