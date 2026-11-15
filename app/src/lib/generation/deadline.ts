/** 即使上游忽略 AbortSignal，也必须结束等待；源操作同时收到取消。 */
export async function withDeadline<T>(signal:AbortSignal,timeoutMs:number,action:(signal:AbortSignal)=>Promise<T>):Promise<T>{
 const controller=new AbortController();
 const stop=()=>controller.abort(signal.reason??new Error('任务已取消'));
 signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();
 const timer=setTimeout(()=>controller.abort(new Error('生成阶段等待超时，请从当前阶段继续')),timeoutMs);
 let aborted:()=>void=()=>{};
 try{return await Promise.race([Promise.resolve().then(()=>{controller.signal.throwIfAborted();return action(controller.signal)}),new Promise<never>((_,reject)=>{aborted=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',aborted,{once:true});if(controller.signal.aborted)aborted()})])}
 finally{clearTimeout(timer);signal.removeEventListener('abort',stop);controller.signal.removeEventListener('abort',aborted)}
}
