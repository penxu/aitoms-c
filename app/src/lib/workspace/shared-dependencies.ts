import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import Database from 'better-sqlite3';
import {config} from '../config.ts';
import {ensureRuntimeDirectory} from './runtime-directory.ts';
import {pnpmCliPath} from './toolchain.ts';
import {verifyImmutableDependencyTree,isImmutableDependencyTreeVerified} from '../generation/immutable-dependency-cache.ts';

type Runtime={node:string;platform:string;arch:string;backend?:string;image?:string};
export interface SharedDependencyMount {source:string;target:string;key:string}
function ordinaryDirectory(value:string):void {
 const stat=fs.lstatSync(value);
 if(!stat.isDirectory()||stat.isSymbolicLink()||fs.realpathSync(value)!==value)throw Error('共享依赖目录不允许符号链接或路径逃逸');
}
function hash(value:string):string{return createHash('sha256').update(value).digest('hex');}
function smallFile(file:string):string {
 const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>10_000_000)throw Error('共享依赖缓存元数据非法');
 return fs.readFileSync(file,'utf8');
}
function projectInputs(root:string):string {
 const digest=createHash('sha256');
 for(const name of ['package.json','pnpm-lock.yaml','.npmrc','.pnpmfile.cjs','.pnpmfile.mjs','pnpm-workspace.yaml','yarn.lock','package-lock.json']){
  const filename=path.join(root,name);try{digest.update(name).update(smallFile(filename));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT'||['package.json','pnpm-lock.yaml'].includes(name))throw error;}
 }
 return digest.digest('hex');
}
/** 绑定仅来自平台SQLite；项目内文件不能指定任何外部挂载路径。 */
export class SharedDependencyRegistry {
 private db:Database.Database;
 private cacheRoot:string;
 private workspaceRoot:string;
 private environmentIdentity:()=>string;
 constructor(db:Database.Database,cacheRoot:string,workspaceRoot:string,environmentIdentity:()=>string=()=> ''){
  this.db=db;
  this.environmentIdentity=environmentIdentity;
  this.cacheRoot=fs.realpathSync(cacheRoot);this.workspaceRoot=fs.realpathSync(workspaceRoot);
  ordinaryDirectory(this.cacheRoot);ordinaryDirectory(this.workspaceRoot);
  if(this.cacheRoot===this.workspaceRoot||this.cacheRoot.startsWith(this.workspaceRoot+path.sep))throw Error('共享依赖缓存必须位于用户工作区之外');
  db.exec(`CREATE TABLE IF NOT EXISTS shared_dependency_bindings(root TEXT PRIMARY KEY, cache_key TEXT NOT NULL, runtime TEXT NOT NULL, inputs TEXT NOT NULL, metadata TEXT NOT NULL)`);
 }
 private root(root:string):string {
  const real=fs.realpathSync(root);if(real===this.workspaceRoot||!real.startsWith(this.workspaceRoot+path.sep))throw Error('共享依赖绑定必须位于项目工作区');ordinaryDirectory(real);return real;
 }
 private cache(key:string):{source:string;metadata:string;lock:string;treeHash:string}{
  if(!/^[a-f0-9]{64}$/.test(key))throw Error('共享依赖缓存key非法');
  ordinaryDirectory(this.cacheRoot);
  const directory=path.join(this.cacheRoot,'template-shared-v1-'+key),source=path.join(directory,'node_modules');ordinaryDirectory(directory);ordinaryDirectory(source);
  const metadata=smallFile(path.join(directory,'manifest.json')),lock=smallFile(path.join(directory,'pnpm-lock.yaml'));
  const manifest=JSON.parse(metadata) as {key:string;lockHash:string;treeHash:string};
  if(manifest.key!==key||manifest.lockHash!==hash(lock)||!/^[a-f0-9]{64}$/.test(manifest.treeHash))throw Error('共享依赖缓存元数据不匹配');
  return{source,metadata:hash(JSON.stringify(manifest)+'\0'+lock),lock,treeHash:manifest.treeHash};
 }
 bind(root:string,key:string,runtime:Runtime):void {
  const real=this.root(root),cache=this.cache(key);
  if(smallFile(path.join(real,'pnpm-lock.yaml'))!==cache.lock)throw Error('共享依赖缓存锁文件不匹配');
  const inputs=hash(projectInputs(real)+this.environmentIdentity());ensureRuntimeDirectory(real,'node_modules');
  this.db.prepare('INSERT INTO shared_dependency_bindings VALUES(?,?,?,?,?) ON CONFLICT(root) DO UPDATE SET cache_key=excluded.cache_key,runtime=excluded.runtime,inputs=excluded.inputs,metadata=excluded.metadata').run(real,key,JSON.stringify(runtime),inputs,cache.metadata);
 }
 mount(root:string,runtime?:Runtime,requireVerified=false):SharedDependencyMount|null {
  const real=this.root(root),row=this.db.prepare('SELECT cache_key,runtime,inputs,metadata FROM shared_dependency_bindings WHERE root=?').get(real) as {cache_key:string;runtime:string;inputs:string;metadata:string}|undefined;
  if(!row)return null;
  if(runtime&&JSON.stringify(runtime)!==row.runtime)return null;
  try{if(hash(projectInputs(real)+this.environmentIdentity())!==row.inputs)return null;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
  const cache=this.cache(row.cache_key);if(cache.metadata!==row.metadata)throw Error('共享依赖缓存身份已改变，拒绝挂载');
  if(requireVerified&&!isImmutableDependencyTreeVerified(cache.source,cache.treeHash,cache.metadata))return null;
  return{source:cache.source,target:ensureRuntimeDirectory(real,'node_modules'),key:row.cache_key};
 }
 async verify(root:string,runtime:Runtime,signal?:AbortSignal):Promise<boolean>{
  try{
   // auto 模式会先探测其他后端；不适用的绑定不能因此被删除。
   const mount=this.mount(root,runtime);if(!mount)return true;
   const cache=this.cache(mount.key);
   if(await verifyImmutableDependencyTree(cache.source,cache.treeHash,cache.metadata,signal))return true;
  }catch(error){if(signal?.aborted)throw error;}
  this.detach(root);return false;
 }
 detach(root:string):void {this.db.prepare('DELETE FROM shared_dependency_bindings WHERE root=?').run(this.root(root));}
 inUse(key:string):boolean{return !!this.db.prepare('SELECT 1 FROM shared_dependency_bindings WHERE cache_key=? LIMIT 1').get(key);}
 async reclaim(root:string):Promise<void>{
  const mount=this.mount(root);if(!mount)return;
  // 仅在旧进程停止、新服务启动成功后调用。宿主挂载点与共享源不是同一目录。
  for(const entry of await fs.promises.readdir(mount.target)){
   if(this.mount(root)?.key!==mount.key)throw Error('共享依赖绑定变化，停止回收');
   ordinaryDirectory(mount.target);await fs.promises.rm(path.join(mount.target,entry),{recursive:true,force:true});
  }
 }
}
let registry:SharedDependencyRegistry|undefined;
function store(create=false):SharedDependencyRegistry|undefined {
 if(registry)return registry;
 const file=config.sharedDependencyDatabasePath;
 if(!create&&!fs.existsSync(file))return undefined;
 fs.mkdirSync(config.templateCacheRoot,{recursive:true});fs.mkdirSync(config.workspaceRoot,{recursive:true});
 const root=fs.realpathSync(config.workspaceRoot),database=path.resolve(file);
 if(database===root||database.startsWith(root+path.sep))throw Error('共享依赖数据库必须位于用户工作区之外');
 fs.mkdirSync(path.dirname(database),{recursive:true});
 const db=new Database(database);db.pragma('journal_mode = WAL');registry=new SharedDependencyRegistry(db,config.templateCacheRoot,config.workspaceRoot,()=>config.packageRegistry+'\0'+smallFile(path.resolve(pnpmCliPath(),'../../package.json')));return registry;
}
export function bindSharedDependencies(root:string,key:string,runtime:Runtime):void {store(true)!.bind(root,key,runtime);}
export function sharedDependencyMount(root:string,runtime?:Runtime):SharedDependencyMount|null {
 if(config.sharedTemplateDependencies===false)return null;
 // 工具链独立临时工程/发布目录没有注册绑定，也不应扩大工作区白名单。
 const base=path.resolve(config.workspaceRoot),real=fs.realpathSync(root);if(real===base||!real.startsWith(base+path.sep))return null;
 return store()?.mount(real,runtime,true)??null;
}
export async function verifySharedDependencies(root:string,runtime:Runtime,signal?:AbortSignal):Promise<boolean>{
 if(config.sharedTemplateDependencies===false)return true;
 const base=fs.existsSync(config.workspaceRoot)?fs.realpathSync(config.workspaceRoot):path.resolve(config.workspaceRoot),real=fs.realpathSync(root);if(real===base||!real.startsWith(base+path.sep))return true;
 return await store()?.verify(real,runtime,signal)??true;
}
export function detachSharedDependencies(root:string):void{store()?.detach(root);}
export function sharedDependencyCacheInUse(key:string):boolean{return store()?.inUse(key)??false;}
export async function reclaimSharedDependencyCopies(root:string,mountedKey?:string):Promise<void>{
 if(!mountedKey||config.sharedTemplateDependencies===false)return;
 const registry=store();if(registry?.mount(root)?.key===mountedKey)await registry.reclaim(root);
}
