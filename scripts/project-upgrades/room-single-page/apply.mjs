import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const directory=path.dirname(fileURLToPath(import.meta.url));
const base=new URL(process.argv[2]??'http://127.0.0.1:3000');
if(!['http:','https:'].includes(base.protocol)||base.username||base.password)throw Error('平台地址必须是不含凭据的HTTP(S)地址');
const id='p_mwhm79h1fjqv1c';
const endpoint=`/api/projects/${id}`;
const digest=value=>createHash('sha256').update(value).digest('hex');
async function request(url,options={}){
 const response=await fetch(new URL(url,base),{...options,signal:AbortSignal.timeout(600_000)});
 const body=await response.json();if(!response.ok)throw Error(`${response.status}: ${body.error??JSON.stringify(body)}`);return body;
}
const manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));
const pending=[];
for(const item of manifest){
 if(!/^(?:app|components)\/.+\.tsx$/.test(item.path)&&item.path!=='next.config.ts')throw Error('迁移清单路径越界');
 if(item.path.split('/').includes('..'))throw Error('迁移清单路径越界');
 const content=await fs.readFile(path.join(directory,'files',item.path),'utf8');
 if(digest(content)!==item.after)throw Error(`本地补丁摘要不一致：${item.path}`);
 const response=await fetch(new URL(`${endpoint}/files?path=${encodeURIComponent(item.path)}`,base),{signal:AbortSignal.timeout(20_000)});
 const body=await response.json();
 if(response.ok){
  const current=digest(body.file.content);
  if(current===item.after)continue;
  if(current!==item.before)throw Error(`线上文件已被修改，停止覆盖：${item.path}`);
 }else if(item.before!==null||response.status!==400||!String(body.error).includes('ENOENT'))throw Error(`无法确认文件状态：${item.path} ${JSON.stringify(body)}`);
 pending.push({path:item.path,content});
}
console.log(`校验完成，待更新${pending.length}个文件；开发预览直接使用项目源码。`);
for(const item of pending){
 console.log(`正在写入：${item.path}`);
 await request(`${endpoint}/files`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(item)});
 console.log(`已写入：${item.path}`);
}
console.log('源码更新完成，正在启动开发预览（不请求生产构建）');
const result=await request(`${endpoint}/service`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'restart'})});
console.log(JSON.stringify(result));
