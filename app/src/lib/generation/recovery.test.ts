import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import nodeModule,{createRequire} from 'node:module';
// stripTypeScriptTypes 是 Node 22.13+ 的运行时 API，@types/node 20 尚无类型声明
const {stripTypeScriptTypes}=nodeModule as unknown as {stripTypeScriptTypes:(code:string)=>string};
const require=createRequire(import.meta.url);
const Database=require('better-sqlite3');

test('启动恢复终结死亡worker，保留活worker与刚创建的任务',()=>{
 const sqlite=new Database(':memory:');
 try {
  sqlite.exec('CREATE TABLE generation_runs(id TEXT,project_id TEXT,status TEXT,started_at INTEGER,error TEXT,finished_at INTEGER)');
  const insert=sqlite.prepare('INSERT INTO generation_runs VALUES(?,?,?, ?,NULL,NULL)');
  for(const id of ['alive','dead','legacy-old','legacy-new'])insert.run(id,id,'running',Date.now()-(id==='legacy-new'?100:120000));
  const source=stripTypeScriptTypes(fs.readFileSync(new URL('./recovery.ts',import.meta.url),'utf8')).replace(/^import[^;]*;\n/gm,'').replace(/^export /gm,'');
  const updates:string[]=[];
  const recover=vm.runInNewContext(`${source}\nrecoverInterruptedGenerations`,{sqlite,Date,updateProjectStatus:(id:string)=>updates.push(id),getProgress:(id:string)=>id==='alive'?{workerPid:1}:id==='dead'?{workerPid:2}:null,process:{kill:(pid:number)=>{if(pid===2)throw Object.assign(new Error('gone'),{code:'ESRCH'});}}});
  assert.deepEqual(Array.from(recover()),['dead','legacy-old']);
  assert.deepEqual(updates,['dead','legacy-old']);
  assert.equal(sqlite.prepare("SELECT status FROM generation_runs WHERE id='alive'").get().status,'running');
  assert.deepEqual(Array.from(recover()),[]);
 }finally{sqlite.close();}
});

test('自定义服务器启动恢复同样保留活跃worker，不批量打断其他任务',()=>{
 const db=new Database(':memory:');try{
  db.exec('CREATE TABLE generation_runs(id TEXT,project_id TEXT,status TEXT,started_at INTEGER,error TEXT,finished_at INTEGER);CREATE TABLE generation_progress(run_id TEXT,worker_pid INTEGER);CREATE TABLE projects(id TEXT,status TEXT)');
  for(const [id,pid] of [['alive',1],['dead',2]] as const){db.prepare("INSERT INTO generation_runs VALUES(?,?,'running',0,NULL,NULL)").run(id,id);db.prepare('INSERT INTO generation_progress VALUES(?,?)').run(id,pid);db.prepare("INSERT INTO projects VALUES(?,'generating')").run(id);}
  const source=fs.readFileSync(new URL('../../../recover-generations.mjs',import.meta.url),'utf8').replace(/^export /gm,'');
  const recover=vm.runInNewContext(`${source}\nmarkInterruptedGenerationRows`);
  assert.equal(recover(db,(pid:number)=>pid===1,100000),1);
  assert.equal(db.prepare("SELECT status FROM generation_runs WHERE id='alive'").get().status,'running');
  assert.equal(db.prepare("SELECT status FROM generation_runs WHERE id='dead'").get().status,'interrupted');
 }finally{db.close();}
});

test('两种启动恢复均保留等待用户的任务',()=>{
 const db=new Database(':memory:');try{
  db.exec("CREATE TABLE generation_runs(id TEXT,project_id TEXT,status TEXT,started_at INTEGER,error TEXT,finished_at INTEGER);CREATE TABLE projects(id TEXT,status TEXT);INSERT INTO generation_runs VALUES('wait','p','waiting',0,NULL,NULL);INSERT INTO projects VALUES('p','generating')");
  const ts=stripTypeScriptTypes(fs.readFileSync(new URL('./recovery.ts',import.meta.url),'utf8')).replace(/^import[^;]*;\n/gm,'').replace(/^export /gm,'');
  const recover=vm.runInNewContext(`${ts}\nrecoverInterruptedGenerations`,{sqlite:db,Date,updateProjectStatus(){throw new Error('不应更改等待任务');},getProgress(){return null;},process:{kill(){throw new Error('不应检查等待任务进程');}}});
  assert.deepEqual(Array.from(recover()),[]);
  const source=fs.readFileSync(new URL('../../../recover-generations.mjs',import.meta.url),'utf8').replace(/^export /gm,'');
  const startup=vm.runInNewContext(`${source}\nmarkInterruptedGenerationRows`);
  assert.equal(startup(db,()=>false,1000000),0);
  assert.equal(db.prepare("SELECT status FROM generation_runs WHERE id='wait'").get().status,'waiting');
 }finally{db.close();}
});
