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
  fs.cpSync(source, target, { recursive: true, dereference: false, verbatimSymlinks: true });
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
    return hash.update(JSON.stringify(runtime ?? workspaceExecutionRuntime(root))).update(fs.readFileSync(path.resolve(pnpmCliPath(),'../../package.json'))).update('pnpm-hoisted-v3').digest('hex');
  } catch { return null; }
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
