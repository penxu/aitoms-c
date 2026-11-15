import test from 'node:test';
import assert from 'node:assert/strict';
import type {CommandResult} from '../workspace/command';

test('聊天安装在完成前持续给出进度，最后才标记结束',async()=>{
 const subject=await import('./install-progress.ts').catch(()=>null);assert.ok(subject);
 let report:(message:string)=>void=()=>{};let finish:(result:CommandResult)=>void=()=>{};
 const stream=subject.streamInstall(async notify=>{report=notify;return await new Promise<CommandResult>(resolve=>{finish=resolve;});},new AbortController().signal);
 const initial=await stream.next();assert.equal(initial.value?.installing,true);
 const pending=stream.next();report('Progress: downloaded 5\n');
 const update=await pending;assert.equal(update.value?.installing,true);assert.match(update.value?.stdout??'',/downloaded 5/);
 finish({stdout:'done',stderr:'',exitCode:0,timedOut:false,aborted:false});
 const final=await stream.next();assert.equal(final.value?.installing,false);assert.equal(final.value?.exitCode,0);
 assert.equal((await stream.next()).done,true);
});
test('停止消费进度时中止实际安装，不留下计时器',async()=>{
 const subject=await import('./install-progress.ts').catch(()=>null);assert.ok(subject);
 let signal:AbortSignal|undefined;
 const stream=subject.streamInstall(async(_notify,s)=>{signal=s;return await new Promise<CommandResult>(resolve=>s.addEventListener('abort',()=>resolve({stdout:'',stderr:'',exitCode:null,timedOut:false,aborted:true}),{once:true}));},new AbortController().signal);
 await stream.next();await stream.return(undefined);assert.equal(signal?.aborted,true);
});
test('安装进度移除终端控制码及常见凭据',async()=>{
 const {sanitizeInstallOutput}=await import('./install-progress.ts');
 const output=sanitizeInstallOutput('\x1b[31mhttps://user:secret@registry.invalid/file\x1b[0m authorization: Bearer abc123 token=private api_key=key456');
 assert.doesNotMatch(output,/secret|abc123|private|key456|\x1b/);
 assert.match(output,/registry\.invalid/);
});
