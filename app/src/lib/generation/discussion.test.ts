import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { DiscussionStore } from './discussion-store.ts';
import { validateAssessment, normalizeAnswers } from './discussion-schema.ts';
const assessment = { summary:'需要确定管理对象', known:['浏览器应用'], questions:[{id:'scope',title:'管理什么？',reason:'决定核心数据与页面',options:[{id:'customer',label:'客户管理',description:'客户档案与跟进'},{id:'stock',label:'库存管理',description:'商品与出入库'}],recommendedId:'customer'}] };
function fixture(){const db=new Database(':memory:');db.exec("CREATE TABLE generation_runs(id TEXT PRIMARY KEY,project_id TEXT,status TEXT,requirement TEXT,finished_at INTEGER,error TEXT); INSERT INTO generation_runs VALUES('r','p','running','做个管理系统',NULL,NULL)");return {db,store:new DiscussionStore(db)};}
test('分析结构有界且推荐选项必须存在',()=>{
 assert.equal(validateAssessment(assessment).questions.length,1);
 assert.throws(()=>validateAssessment({...assessment,questions:[{...assessment.questions[0],recommendedId:'missing'}]}));
 assert.throws(()=>validateAssessment({...assessment,questions:Array(4).fill(assessment.questions[0])}));
});
test('选项与自定义回答校验，推荐不能隐式提交',()=>{
 assert.throws(()=>normalizeAnswers(assessment,{},false));
 assert.throws(()=>normalizeAnswers(assessment,{scope:{optionId:'missing'}},false));
 assert.equal(normalizeAnswers(assessment,{},true).scope.optionId,'customer');
 assert.equal(normalizeAnswers(assessment,{scope:{text:'项目管理'}},false).scope.text,'项目管理');
});
test('暂停持久化、原始需求不变、重开store仍能恢复',()=>{const {db,store}=fixture();const d=store.pause('r',assessment);assert.equal(d.version,1);assert.equal(new DiscussionStore(db).pending('r')?.assessment.summary,assessment.summary);assert.equal((db.prepare('SELECT status,requirement FROM generation_runs').get() as {status:string;requirement:string}).status,'waiting');assert.equal((db.prepare('SELECT requirement FROM generation_runs').get() as {status:string;requirement:string}).requirement,'做个管理系统');db.close();});
test('同版本重复提交幂等，冲突与过期提交拒绝',()=>{const {db,store}=fixture();store.pause('r',assessment);const a={scope:{optionId:'stock'}};assert.equal(store.answer('r',1,a,false).reused,false);assert.equal(store.answer('r',1,a,false).reused,true);assert.throws(()=>store.answer('r',1,{scope:{optionId:'customer'}},false));assert.equal(store.history('r').length,1);store.pause('r',assessment);assert.throws(()=>store.answer('r',1,a,false));db.close();});
test('取消后的回答不能复活任务',()=>{const {db,store}=fixture();store.pause('r',assessment);db.prepare("UPDATE generation_runs SET status='cancelled'").run();assert.throws(()=>store.answer('r',1,{},true));assert.equal((db.prepare('SELECT status FROM generation_runs').get() as {status:string;requirement:string}).status,'cancelled');db.close();});
test('同一项目等待回答时不能再创建运行任务',()=>{const {db,store}=fixture();store.pause('r',assessment);assert.throws(()=>db.prepare("INSERT INTO generation_runs VALUES('other','p','running','其他',NULL,NULL)").run());db.close();});
test('失败续跑复制已确认决定，规格上下文包含选择而不覆盖原始需求',async()=>{
 const {discussionContext}=await import('./discussion-schema.ts');
 const {db,store}=fixture();store.pause('r',assessment);store.answer('r',1,{scope:{optionId:'stock',text:'支持低库存提醒'}},false);
 db.prepare("UPDATE generation_runs SET status='failed'").run();
 db.prepare("INSERT INTO generation_runs VALUES('retry','p','running','做个管理系统',NULL,NULL)").run();
 store.copyAnswers('r','retry');
 assert.match(discussionContext('做个管理系统',store.history('retry')),/库存管理/);
 assert.match(discussionContext('做个管理系统',store.history('retry')),/低库存提醒/);
 db.close();
});
test('最终确认选择自定义时必须填写明确决定',()=>{
 const final={summary:'尚需决定',known:[],finalConfirmation:true,questions:[{...assessment.questions[0],id:'final_scope',options:[{id:'accept',label:'采用建议',description:'确认'},{id:'custom',label:'自定义',description:'补充说明'}],recommendedId:'accept'}]};
 assert.throws(()=>normalizeAnswers(final,{final_scope:{optionId:'custom'}},false));
 assert.equal(normalizeAnswers(final,{final_scope:{text:'只做库存，不做客户'}},false).final_scope.text,'只做库存，不做客户');
});

test('关闭数据库后重开仍保留问题与答案',async()=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-discussion-'));const file=path.join(dir,'state.db');
 const first=new Database(file);
 try{
  first.exec("CREATE TABLE generation_runs(id TEXT PRIMARY KEY,project_id TEXT,status TEXT,requirement TEXT,finished_at INTEGER,error TEXT);INSERT INTO generation_runs VALUES('r','p','running','原始需求',NULL,NULL)");
  new DiscussionStore(first).pause('r',assessment);first.close();
  const reopened=new Database(file);try{const store=new DiscussionStore(reopened);assert.equal(store.pending('r')?.version,1);store.answer('r',1,{scope:{text:'库存盘点'}},false);}finally{reopened.close();}
  const third=new Database(file);try{assert.equal(new DiscussionStore(third).history('r')[0].answers?.scope.text,'库存盘点');}finally{third.close();}
 }finally{if(first.open)first.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('不接受会污染回答字典的保留标识',()=>{
 assert.throws(()=>validateAssessment({...assessment,questions:[{...assessment.questions[0],id:'__proto__'}]}));
});
