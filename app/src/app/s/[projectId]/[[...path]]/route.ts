import { getProject } from '@/lib/db/queries';
import { releases } from '@/lib/releases/context';
import { productionPort } from '@/lib/releases/process';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const HOP=new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade','host','accept-encoding','content-length','content-encoding']);
async function proxy(req:Request,ctx:{params:Promise<{projectId:string;path?:string[]}>}) {
 const {projectId,path}=await ctx.params;
 if(!getProject(projectId))return new Response('项目不存在',{status:404});
 const active=releases.active(projectId);const port=active?productionPort(active.id):null;
 if(!port)return new Response('应用尚未发布或生产服务暂不可用，请在工作台查看发布记录。',{status:503,headers:{'content-type':'text/plain; charset=utf-8'}});
 const url=new URL(req.url);const suffix=path?.length?'/'+path.map(encodeURIComponent).join('/'):'';
 const headers=new Headers();req.headers.forEach((value,key)=>{if(!HOP.has(key.toLowerCase()))headers.set(key,value);});
 headers.set('accept-encoding','identity');
 headers.set('x-forwarded-host',url.host);headers.set('x-forwarded-proto',url.protocol.slice(0,-1));
 try {
  const upstream=await fetch(`http://127.0.0.1:${port}/s/${projectId}${suffix}${url.search}`,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:await req.arrayBuffer(),redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(30000)});
  const out=new Headers();upstream.headers.forEach((value,key)=>{if(!HOP.has(key.toLowerCase())&&key.toLowerCase()!=='set-cookie')out.set(key,key.toLowerCase()==='location'?value.replace(`http://127.0.0.1:${port}`,''):value);});
  for(const cookie of upstream.headers.getSetCookie())out.append('set-cookie',cookie);
  return new Response(upstream.body,{status:upstream.status,headers:out});
 }catch{return new Response('生产服务暂不可用，请稍后重试。',{status:503});}
}
export const GET=proxy;export const POST=proxy;export const PUT=proxy;export const PATCH=proxy;export const DELETE=proxy;export const HEAD=proxy;export const OPTIONS=proxy;
