export function sanitizeInstallOutput(message:string):string {
  return message.replace(/\x1b\[[0-9;]*[a-zA-Z]/g,'')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi,'$1[redacted]@')
    .replace(/(authorization\s*[:=]\s*)(?:Bearer\s+)?[^\s]+/gi,'$1[redacted]')
    .replace(/((?:_authToken|password|token|api[_-]?key)\s*[:=]\s*)[^\s&]+/gi,'$1[redacted]');
}

type Progress={installing:true;stdout:string;progress:string;elapsedMs:number;exitCode?:never};


/** SDK preliminary 工具结果只更新界面，最后一项才作为最终安装结果。 */
export async function* streamInstall<T extends object>(start:(report:(message:string)=>void,signal:AbortSignal)=>Promise<T>,signal?:AbortSignal,label="正在检查和安装依赖"):AsyncGenerator<Progress|(T&{installing:false}),void,unknown> {
  const controller=new AbortController();
  const combined=AbortSignal.any(signal?[signal,controller.signal]:[controller.signal]);
  let tail='',done=false,result:T|undefined,error:unknown;
  let wake:(()=>void)|undefined;
  const started=Date.now();
  const report=(message:string)=>{tail=(tail+sanitizeInstallOutput(message)+'\n').slice(-4000);wake?.();wake=undefined;};
  const work=Promise.resolve().then(()=>{combined.throwIfAborted();return start(report,combined);})
    .then(value=>{result=value;},cause=>{error=cause;})
    .finally(()=>{done=true;wake?.();wake=undefined;});
  const heartbeat=setInterval(()=>{wake?.();wake=undefined;},5000);
  try{
    yield {installing:true,progress:label,stdout:'',elapsedMs:0};
    while(!done){
      await new Promise<void>(resolve=>{wake=resolve;if(done)resolve();});
      if(!done)yield {installing:true,progress:`${label}，已等待 ${Math.floor((Date.now()-started)/1000)} 秒`,stdout:tail,elapsedMs:Date.now()-started};
    }
    await work;
    if(error!==undefined)throw error;
    if(!result)throw new Error('工程准备没有返回结果');
    yield {...result,installing:false};
  }finally{clearInterval(heartbeat);controller.abort();}
}
