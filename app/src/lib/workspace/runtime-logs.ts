/** 内存中保留有限项目的最近输出，进程换代后忽略旧回调。 */
export class RuntimeLogs{
 private entries=new Map<string,{token:symbol;output:string}>();
 private maxProjects:number;private maxChars:number;
 constructor(maxProjects=64,maxChars=12000){this.maxProjects=maxProjects;this.maxChars=maxChars;}
 begin(id:string):symbol{
  const token=Symbol(id);this.entries.delete(id);this.entries.set(id,{token,output:''});
  while(this.entries.size>this.maxProjects)this.entries.delete(this.entries.keys().next().value!);
  return token;
 }
 append(id:string,token:symbol,chunk:string):void{
  const entry=this.entries.get(id);if(entry?.token!==token)return;
  entry.output=(entry.output+chunk).slice(-this.maxChars);
 }
 read(id:string):string{return this.entries.get(id)?.output??'';}
}
