import fs from "node:fs";
import { createHash } from "node:crypto";
import { pnpmCliPath } from "../workspace/toolchain.ts";
import { workspaceExecutionRuntime } from "../workspace/execution.ts";
import path from "node:path";

/** pnpm 会重建 .bin；npm 的符号链接会让重建操作覆写真正的 JS 入口。 */
export function isReusableDependencyTree(root: string): boolean {
  try {
    for (const [bin, entry] of [["tsc", "typescript/bin/tsc"], ["next", "next/dist/bin/next"]]) {
      if (!fs.lstatSync(path.join(root, ".bin", bin)).isFile()) return false;
      if (!fs.readFileSync(path.join(root, entry), "utf8").startsWith("#!/usr/bin/env node")) return false;
    }
    return true;
  } catch { return false; }
}

/** 不共享可写 inode；相对符号链接必须保持相对，不能指回缓存。 */
export function copyDependencyTree(source: string, target: string): void {
  const root = fs.realpathSync(source);
  const inspect = (directory: string) => {
    for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
      const filename=path.join(directory,entry.name);
      if (entry.isSymbolicLink()) {
        const link=fs.readlinkSync(filename);
        const destination=path.resolve(directory,link);
        if (path.isAbsolute(link) || !destination.startsWith(root+path.sep)) throw new Error("依赖缓存包含越界符号链接");
        const real=fs.realpathSync(filename);
        if (!real.startsWith(root+path.sep)) throw new Error("依赖缓存包含越界符号链接");
      } else if(entry.isDirectory()) inspect(filename);
      else if(!entry.isFile()) throw new Error("依赖缓存包含不支持的特殊文件");
    }
  };
  inspect(root);
  fs.cpSync(source, target, { recursive: true, dereference: false, verbatimSymlinks: true, mode:fs.constants.COPYFILE_FICLONE });
}

/** 键以实际工程为准，不能用模板指纹代替依赖安装状态。 */
export function dependencyFingerprint(root: string, runtime?: {node:string;platform:string;arch:string;backend?:string;image?:string}): string | null {
  try {
    const hash = createHash('sha256');
    for (const filename of ['package.json','pnpm-lock.yaml']) {
      const file=path.join(root,filename);
      if (!fs.lstatSync(file).isFile()) return null;
      hash.update(filename).update(fs.readFileSync(file));
    }
    for(const filename of ['.npmrc','.pnpmfile.cjs','.pnpmfile.mjs','pnpm-workspace.yaml','yarn.lock','package-lock.json']){
      const file=path.join(root,filename);
      try{
        if(!fs.lstatSync(file).isFile())return null;
        hash.update(filename).update(fs.readFileSync(file));
      }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    }
    return hash.update(JSON.stringify(runtime ?? workspaceExecutionRuntime(root))).update(fs.readFileSync(path.resolve(pnpmCliPath(),'../../package.json'))).update('pnpm-hoisted-v3').digest('hex');
  } catch { return null; }
}

/** 精确匹配已成功安装的清单与工具链；复制到候选后不再触发 pnpm 更换 store 重建。 */
export function hasInstalledDependencies(root:string,runtime:NonNullable<Parameters<typeof dependencyFingerprint>[1]>):boolean {
  try {
    const modules=path.join(root,'node_modules');
    if(fs.lstatSync(modules).isSymbolicLink()||!isReusableDependencyTree(modules))return false;
    const marker=JSON.parse(fs.readFileSync(path.join(modules,'.atoms-runtime.json'),'utf8'));
    const fingerprint=dependencyFingerprint(root,runtime);
    if(!fingerprint||marker.runtime!==JSON.stringify(runtime)||marker.fingerprint!==fingerprint)return false;
    const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
    for(const name of Object.keys({...pkg.dependencies,...pkg.devDependencies})){
      if(!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name))return false;
      const entry=path.join(modules,name,'package.json');
      if(!fs.lstatSync(entry).isFile())return false;
      const real=fs.realpathSync(entry),realModules=fs.realpathSync(modules);
      if(!real.startsWith(realModules+path.sep))return false;
    }
    return true;
  }catch{return false;}
}

/** 完整副本先在同目录完成，rename 后才向读者发布。 */
export function publishDependencyCache(source: string, target: string, fingerprint: string): void {
  fs.mkdirSync(path.dirname(target),{recursive:true});
  if (fs.existsSync(target)) return;
  const temporary=fs.mkdtempSync(`${target}.tmp-`);
  try {
    copyDependencyTree(source,path.join(temporary,'node_modules'));
    fs.writeFileSync(path.join(temporary,'manifest.json'),JSON.stringify({fingerprint}));
    try {fs.renameSync(temporary,target);} catch(error) {if(!fs.existsSync(target))throw error;}
  } finally {fs.rmSync(temporary,{recursive:true,force:true});}
}

export function restoreDependencyCache(source: string, target: string, fingerprint: string): boolean {
  try {
    const manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8'));
    if (manifest.fingerprint!==fingerprint || !isReusableDependencyTree(path.join(source,'node_modules'))) return false;
    if (fs.existsSync(target)) return false;
    const stage=fs.mkdtempSync(path.join(path.dirname(target),'.atoms-deps-'));
    try {
      copyDependencyTree(path.join(source,'node_modules'),path.join(stage,'node_modules'));
      fs.renameSync(path.join(stage,'node_modules'),target);
    } finally {fs.rmSync(stage,{recursive:true,force:true});}
    return true;
  } catch {return false;}
}

/** 只清理调用者指定工程中的不兼容依赖；迁移调用方必须传候选目录。 */
export function prepareDependencyRuntime(root:string,runtime:string):boolean {
  const modules=path.join(root,'node_modules');
  if(!fs.existsSync(modules))return false;
  if(fs.lstatSync(modules).isSymbolicLink())throw new Error('依赖目录不允许使用符号链接');
  const manifest=path.join(modules,'.atoms-runtime.json');
  let previous:string|undefined;
  try {
    if(fs.lstatSync(manifest).isFile())previous=JSON.parse(fs.readFileSync(manifest,'utf8')).runtime;
  } catch { /* 旧依赖缺少标识，必须重新安装 */ }
  if(previous===runtime)return true;
  fs.rmSync(modules,{recursive:true,force:true});
  return false;
}

/** 大树复制走异步 I/O，避免阻塞平台心跳、取消与日志轮询。 */
export async function publishDependencyCacheAsync(source:string,target:string,fingerprint:string):Promise<void>{
  const {copyDependencyTreeAsync}=await import('./dependency-copy.ts');
  await fs.promises.mkdir(path.dirname(target),{recursive:true});
  if(fs.existsSync(target))return;
  const temporary=await fs.promises.mkdtemp(`${target}.tmp-`);
  try{
    await copyDependencyTreeAsync(source,path.join(temporary,'node_modules'));
    await fs.promises.writeFile(path.join(temporary,'manifest.json'),JSON.stringify({fingerprint}));
    try{await fs.promises.rename(temporary,target);}catch(error){if(!fs.existsSync(target))throw error;}
  }finally{await fs.promises.rm(temporary,{recursive:true,force:true});}
}
export async function restoreDependencyCacheAsync(source:string,target:string,fingerprint:string):Promise<boolean>{
  const {copyDependencyTreeAsync}=await import('./dependency-copy.ts');
  try{
    const manifest=JSON.parse(await fs.promises.readFile(path.join(source,'manifest.json'),'utf8'));
    if(manifest.fingerprint!==fingerprint||!isReusableDependencyTree(path.join(source,'node_modules'))||fs.existsSync(target))return false;
    const stage=await fs.promises.mkdtemp(path.join(path.dirname(target),'.atoms-deps-'));
    try{
      await copyDependencyTreeAsync(path.join(source,'node_modules'),path.join(stage,'node_modules'));
      await fs.promises.rename(path.join(stage,'node_modules'),target);
    }finally{await fs.promises.rm(stage,{recursive:true,force:true});}
    return true;
  }catch{return false;}
}
