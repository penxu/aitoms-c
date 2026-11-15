import type {AcceptanceResult} from './acceptance.ts';
import {withDeadline} from './deadline.ts';

/** 仅证明真实首页可访问；不冒充浏览器渲染或业务验收。 */
export async function checkPreviewHome(baseUrl:string,signal:AbortSignal,request:typeof fetch=fetch,timeoutMs=15000):Promise<AcceptanceResult[]> {
  signal.throwIfAborted();
  const started=Date.now();
  const base=new URL(baseUrl);
  const prefix=base.pathname.replace(/\/$/,'');
  const deadline=AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]);
  let url=new URL(`${baseUrl.replace(/\/$/,'')}/`);
  try {
    for(let redirects=0;redirects<=5;redirects++){
      deadline.throwIfAborted();
      if(url.origin!==base.origin || (url.pathname!==prefix&&!url.pathname.startsWith(`${prefix}/`))) throw Error('首页跳转超出当前应用');
      const response=await withDeadline(deadline,timeoutMs,requestSignal=>request(url,{signal:requestSignal,redirect:'manual',cache:'no-store'}));
      const location=response.headers.get('location');
      const html=response.headers.get('content-type')?.toLowerCase().includes('text/html');
      if([301,302,303,307,308].includes(response.status)&&location){void response.body?.cancel().catch(()=>{});url=new URL(location,url);continue;}
      if(!response.ok){void response.body?.cancel().catch(()=>{});throw Error(`首页返回 HTTP ${response.status}`);}
      if(!html){void response.body?.cancel().catch(()=>{});throw Error('首页未返回 HTML 页面');}
      const reader=response.body?.getReader();
      if(!reader)throw Error('首页响应为空');
      try{
        await withDeadline(deadline,timeoutMs,async readSignal=>{
          let bytes=0,visible=false;
          const decoder=new TextDecoder();
          for(;;){
            readSignal.throwIfAborted();
            const chunk=await reader.read();
            if(chunk.done)break;
            bytes+=chunk.value.byteLength;
            if(bytes>2*1024*1024)throw Error('首页 HTML 超过 2MB 检查上限');
            if(decoder.decode(chunk.value,{stream:true}).trim())visible=true;
          }
          if(!visible&&!decoder.decode().trim())throw Error('首页响应为空');
        });
      }finally{void reader.cancel().catch(()=>{});}
      signal.throwIfAborted();
      return [{id:'PREVIEW-HOME',status:'passed',durationMs:Date.now()-started}];
    }
    throw Error('首页重定向次数超过上限');
  }catch(error){
    signal.throwIfAborted();
    return [{id:'PREVIEW-HOME',status:'failed',durationMs:Date.now()-started,error:deadline.aborted?'首页访问检查超时':error instanceof Error?error.message:String(error)}];
  }
}
