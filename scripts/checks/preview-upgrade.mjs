// 回归真实平台首个 HTTP 请求后的升级归属。先构建平台；不构建任何用户应用。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../app');
const require=createRequire(path.join(app,'package.json'));
const Database=require('better-sqlite3');
const {WebSocket,WebSocketServer}=require('next/dist/compiled/ws');
if(!fs.existsSync(path.join(app,'.next/BUILD_ID')))throw Error('请先在 app/ 执行 npm run build（仅平台）');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'atoms-upgrade-regression-'));
const database=path.join(directory,'platform.db');
const db=new Database(database);
const ddl=fs.readFileSync(path.join(app,'src/lib/db/index.ts'),'utf8').match(/const DDL = `([\s\S]*?)`;/);
if(!ddl)throw Error('未找到平台数据库 DDL');
db.exec(ddl[1]);
const upstream=http.createServer((_request,response)=>response.end('ok'));
const sockets=new WebSocketServer({server:upstream});
sockets.on('connection',socket=>socket.send('preview-ready'));
let child,output='';
try{
 await new Promise((resolve,reject)=>{upstream.once('error',reject);upstream.listen(4997,'127.0.0.1',resolve);});
 child=spawn(process.execPath,['server.mjs'],{cwd:app,env:{...process.env,NODE_ENV:'production',PORT:'3009',DATABASE_PATH:database},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',chunk=>output=(output+chunk).slice(-8000));child.stderr.on('data',chunk=>output=(output+chunk).slice(-8000));
 let ready=false;
 for(let attempt=0;attempt<80;attempt++){
  if(child.exitCode!==null)throw Error(`测试平台提前退出：${output}`);
  try{await fetch('http://127.0.0.1:3009/favicon.ico',{signal:AbortSignal.timeout(1000)});ready=true;break;}
  catch{await new Promise(resolve=>setTimeout(resolve,250));}
 }
 if(!ready)throw Error(`测试平台启动超时：${output}`);
 // 必须在首个 HTTP 请求及启动恢复之后登记探针端口；避免被孤儿回收。
 db.prepare('INSERT INTO processes(id,project_id,port,status) VALUES(?,?,?,?)').run('proc_hmr_probe','p_hmr_probe',4997,'running');
 await new Promise((resolve,reject)=>{
  const socket=new WebSocket('ws://127.0.0.1:3009/p/p_hmr_probe/_next/hmr?id=regression',{headers:{Origin:'http://127.0.0.1:3009'},handshakeTimeout:5000});
  socket.once('message',message=>{if(String(message)!=='preview-ready')reject(Error('握手消息异常'));else resolve();socket.close();});
  socket.once('error',reject);
 });
 console.log('真实平台 HMR 升级通过：首个 HTTP 请求后，预览连接仍由代理独占。');
}finally{
 if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>{child.once('exit',resolve);setTimeout(()=>{child.kill('SIGKILL');resolve();},2000).unref();});}
 for(const socket of sockets.clients)socket.terminate();sockets.close();upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));
 db.close();fs.rmSync(directory,{recursive:true,force:true});
}
