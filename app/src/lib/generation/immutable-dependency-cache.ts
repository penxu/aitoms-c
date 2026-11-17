import fs from 'node:fs';
import {dependencyTreeDigest} from './dependency-copy.ts';
const verified=new Map<string,{identity:string;valid:boolean}>();
const pending=new Map<string,{identity:string;promise:Promise<boolean>}>();
function identity(source:string,digest:string,metadata:string):string {
 const stat=fs.statSync(source);return JSON.stringify([stat.ino,stat.mtimeMs,stat.ctimeMs,digest,metadata]);
}
/** 只用于平台独占发布、用户只读挂载的不可变树；每个进程首次认证完整内容。 */
export async function verifyImmutableDependencyTree(source:string,digest:string,metadata:string,signal?:AbortSignal):Promise<boolean>{
 signal?.throwIfAborted();const key=identity(source,digest,metadata),previous=verified.get(source);
 if(previous?.identity===key)return previous.valid;
 let entry=pending.get(source);
 if(entry?.identity!==key){
  const promise=dependencyTreeDigest(source).then(value=>{const valid=value===digest;verified.set(source,{identity:key,valid});return valid;});
  entry={identity:key,promise};pending.set(source,entry);
  const owned=entry;void promise.finally(()=>{if(pending.get(source)===owned)pending.delete(source);}).catch(()=>{});
 }
 if(!signal)return entry.promise;
 return new Promise((resolve,reject)=>{
  const aborted=()=>reject(signal.reason??Error('共享依赖校验已取消'));
  signal.addEventListener('abort',aborted,{once:true});
  entry.promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',aborted));
  if(signal.aborted)aborted();
 });
}
export function isImmutableDependencyTreeVerified(source:string,digest:string,metadata:string):boolean {
 const entry=verified.get(source);return entry?.valid===true&&entry.identity===identity(source,digest,metadata);
}
