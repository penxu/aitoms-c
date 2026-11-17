import {pruneInstalledDownloadCache} from "./install-cache";
import { dependencyFingerprint, prepareDependencyRuntime, isReusableDependencyTree, publishDependencyCacheAsync as publishDependencyCache, restoreDependencyCacheAsync as restoreDependencyCache, hasInstalledDependencies } from "./dependency-cache";
import { runCommand, type CommandResult } from "@/lib/workspace/command";
import {reuseTemplateDependencies,TemplateDependencyInstallError} from "./template-dependencies";
import {pnpmCliPath} from "@/lib/workspace/toolchain";
import { installDependenciesCommand } from "@/lib/workspace/toolchain";
import { workspaceExecutionRuntime, ensureWorkspaceRuntime } from "@/lib/workspace/execution";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "@/lib/config";
import {bindSharedDependencies,sharedDependencyMount,detachSharedDependencies,sharedDependencyCacheInUse,verifySharedDependencies} from "../workspace/shared-dependencies.ts";
import { ensureProjectRoot, resolveInsideProject } from "@/lib/workspace/paths";

/**
 * SCAFFOLD 阶段：把模板整目录拷贝到项目工作区。
 * 规则：空目录直接拷贝；已有 `.atoms/` 视为本平台工程（幂等补齐）；
 * 其余非空目录一律拒绝，绝不覆盖用户已有内容。
 */

export class ScaffoldConflictError extends Error {
  constructor(projectId: string) {
    super(`项目 ${projectId} 的工作目录非空且不是 Atoms 工程，拒绝覆盖`);
    this.name = "ScaffoldConflictError";
  }
}

export interface ScaffoldResult {
  action: "copied" | "merged" | "skipped";
  filesWritten: number;
}

/** 拷贝时忽略的目录（模板自身不依赖这些） */
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

function templateDir(): string {
  return path.join(config.templateRoot, "next-base");
}

/** 模板指纹：package.json 内容哈希前 16 位，模板升级后缓存自动失效 */
export function templateHash(): string {
  const pkgPath = path.join(templateDir(), "package.json");
  return createHash("sha256").update(fs.readFileSync(pkgPath)).digest("hex").slice(0, 16);
}

function cacheDir(fingerprint: string): string {
  return path.join(config.templateCacheRoot, `pnpm-v3-${fingerprint}`);
}

/** 模板内全部文件的相对路径（posix 风格，已排序） */
export function listTemplateFiles(): string[] {
  const root = templateDir();
  const files: string[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile()) {
        files.push(path.relative(root, abs).split(path.sep).join("/"));
      }
    }
  };

  walk(root);
  return files.sort();
}

export function hasNodeModulesCache(projectId: string): boolean {
  const fingerprint = dependencyFingerprint(ensureProjectRoot(projectId));
  return !!fingerprint && isReusableDependencyTree(path.join(cacheDir(fingerprint), "node_modules"));
}

export async function restoreNodeModulesCache(projectId: string, cwd = "."): Promise<boolean> {
  const root = resolveInsideProject(projectId, cwd);
  const fingerprint = dependencyFingerprint(root);
  if (!fingerprint) return false;
  const target = resolveInsideProject(projectId, path.join(cwd, "node_modules"), {allowMissing:true});
  return restoreDependencyCache(cacheDir(fingerprint), target, fingerprint);
}

export async function saveNodeModulesCache(projectId: string, cwd = "."): Promise<void> {
  const root = resolveInsideProject(projectId, cwd);
  const fingerprint = dependencyFingerprint(root);
  const source = resolveInsideProject(projectId, path.join(cwd, "node_modules"), {allowMissing:true});
  if (!fingerprint || !isReusableDependencyTree(source)) return;
  try {await publishDependencyCache(source, cacheDir(fingerprint), fingerprint);} catch { /* 缓存失败不影响交付 */ }
}

/** 精确复用成功安装；其他缓存仍由固定 pnpm 校验和补齐依赖。 */
export async function ensureProjectDependencies(projectId: string, signal?: AbortSignal, env?: Record<string,string>, cwd = ".", packages: string[] = [], onProgress?: (message:string)=>void): Promise<CommandResult & {dependenciesChanged?:boolean}> {
  const command=installDependenciesCommand(packages);
  if(signal?.aborted)return {stdout:"",stderr:"",exitCode:null,timedOut:false,aborted:true};
  const root=resolveInsideProject(projectId,cwd);
  await ensureWorkspaceRuntime(root,signal);
  const modules=path.join(root,"node_modules");
  const executionRuntime=workspaceExecutionRuntime(root);
  const runtime=JSON.stringify(executionRuntime);
  const sharing=config.sharedTemplateDependencies===true&&config.templateDependencyReuse!==false&&executionRuntime.platform==='linux';
  const installed=!packages.length&&hasInstalledDependencies(root,executionRuntime);
  const reuseInstalled=()=>{
    const stdout="依赖清单、锁文件与运行环境匹配，复用已安装依赖，无需重复下载";
    onProgress?.(stdout);
    return {stdout,stderr:"",exitCode:0,timedOut:false,aborted:false,dependenciesChanged:false};
  };
  if(installed&&(!sharing||sharedDependencyMount(root,executionRuntime)))return reuseInstalled();
  if(!packages.length && config.templateDependencyReuse !== false) {
    try {
      const result=await reuseTemplateDependencies({
        root,cacheRoot:config.templateCacheRoot,
        template:await fs.promises.readFile(path.join(templateDir(),"package.json"),"utf8"),
        runtime:templateRuntimeIdentity(executionRuntime),toolchain:await fs.promises.readFile(path.resolve(pnpmCliPath(),"../../package.json"),"utf8"),
        registry:config.packageRegistry,signal,onProgress,
        share:sharing?async(_cache,key)=>{
          bindSharedDependencies(root,key,executionRuntime);
          if(!await verifySharedDependencies(root,executionRuntime,signal))throw Error('共享依赖完整性检查失败，改用项目独立安装');
        }:undefined,
        cacheInUse:sharing?sharedDependencyCacheInUse:undefined,
        // 隔离的临时项目不挂载到任何现有应用中，避免运行进程篡改全局缓存来源。
        createStage:async()=>{
          const stage=await fs.promises.mkdtemp(path.join(config.workspaceRoot,"atoms_template_"));
          return resolveInsideProject(path.basename(stage),".");
        },
        install:stage=>runCommand(path.basename(stage),command,{
          timeoutMs:300_000,signal,
          onOutput:chunk=>onProgress?.(chunk),
        }),
      });
      if(result) {
        if(!sharing||!sharedDependencyMount(root,executionRuntime))writeInstalledMarker(root,runtime,true);
        await reclaimInstallCache(root,onProgress);
        return {...result,dependenciesChanged:true};
      }
    } catch(error) {
      if(signal?.aborted)return {stdout:"",stderr:"",exitCode:null,timedOut:false,aborted:true};
      if(error instanceof TemplateDependencyInstallError)return error.result;
      onProgress?.(`模板依赖未能复用，回退独立安装：${error instanceof Error?error.message:String(error)}`);
    }
  }
  // 已定制但仍有效的独立依赖不能仅因尝试共享而重新安装。
  if(installed)return reuseInstalled();
  if(sharing)detachSharedDependencies(root);
  onProgress?.("正在检查运行环境与依赖缓存");
  // 模板快照的 pnpm store 位置属于已回收的独立预热工程；定制安装必须重新生成本项目的链接元数据。
  let templateInstalled=false;
  try{templateInstalled=JSON.parse(fs.readFileSync(path.join(modules,".atoms-runtime.json"),"utf8")).templateCache===true;}catch{}
  if(templateInstalled){
    resolveInsideProject(projectId,path.join(cwd,"node_modules"));
    onProgress?.("依赖已定制，正在切换到项目独立安装环境");
    await fs.promises.rm(modules,{recursive:true,force:true});
  }
  prepareDependencyRuntime(root,runtime);
  if(!packages.length)await restoreNodeModulesCache(projectId,cwd);
  onProgress?.("正在安装依赖：下载、链接或编译原生模块，日志将实时更新");
  const result = await runCommand(projectId, command, {timeoutMs:300_000,signal,env,cwd,onOutput:chunk=>onProgress?.(chunk)});
  if (result.exitCode === 0 && !result.aborted && !result.timedOut) {
    const npmLock=resolveInsideProject(projectId,path.join(cwd,"package-lock.json"),{allowMissing:true});
    if (fs.existsSync(npmLock)) fs.unlinkSync(npmLock);
    if(fs.existsSync(modules)) writeInstalledMarker(root,runtime);
    onProgress?.("依赖安装完成，正在保存可复用缓存");
    await saveNodeModulesCache(projectId,cwd);
    await reclaimInstallCache(root,onProgress);
  }
  if(result.timedOut)result.stderr+= "\n依赖安装超过5分钟已终止；请查看最后日志，区分下载超时与原生模块编译失败。";
  return {...result,dependenciesChanged:true};
}

/** 目录已有内容但没有 .atoms/：视为用户已有成果，禁止覆盖 */
export function hasScaffoldConflict(projectId: string): boolean {
  const root = ensureProjectRoot(projectId);
  const entries = fs.readdirSync(root).filter((name) => name !== ".git");
  return entries.length > 0 && !entries.includes(".atoms");
}

export async function scaffoldProject(projectId: string): Promise<ScaffoldResult> {
  const root = ensureProjectRoot(projectId);
  const source = templateDir();
  if (!fs.existsSync(source)) {
    throw new Error(`模板目录不存在：${source}`);
  }

  if (hasScaffoldConflict(projectId)) {
    throw new ScaffoldConflictError(projectId);
  }
  const entries = fs.readdirSync(root).filter((name) => name !== ".git");
  const action: ScaffoldResult["action"] = entries.length === 0 ? "copied" : "merged";

  // 在首个模板文件之前落盘标识，复制中断后可补齐；此阶段不探测执行环境。
  fs.mkdirSync(resolveInsideProject(projectId, ".atoms", { allowMissing: true }), { recursive: true });
  let filesWritten = 0;
  for (const relative of listTemplateFiles()) {
    const target = resolveInsideProject(projectId, relative, { allowMissing: true });
    if (fs.existsSync(target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(source, relative), target);
    filesWritten += 1;
  }

  return {
    action: filesWritten === 0 ? "skipped" : action,
    filesWritten,
  };
}

async function reclaimInstallCache(root:string,onProgress?:(message:string)=>void):Promise<void>{
  try{
    onProgress?.("正在回收安装下载缓存，保留已安装依赖");
    await pruneInstalledDownloadCache(root);
  }catch(error){onProgress?.(`下载缓存暂未回收：${error instanceof Error?error.message:String(error)}`);}
}

function writeInstalledMarker(root:string,runtime:string,templateCache=false):void{
  const manifest=path.join(root,"node_modules/.atoms-runtime.json");
  if(fs.existsSync(manifest))fs.unlinkSync(manifest);
  fs.writeFileSync(manifest,JSON.stringify({runtime,fingerprint:dependencyFingerprint(root),templateCache}));
}

/** 原生运行时额外区分 ABI 与 libc；容器由不可变镜像 ID 区分用户态。 */
function templateRuntimeIdentity(runtime:ReturnType<typeof workspaceExecutionRuntime>):string{
  if(runtime.backend!=="native")return JSON.stringify(runtime);
  const header=(process.report?.getReport() as {header?:{glibcVersionRuntime?:string}})?.header;
  return JSON.stringify({runtime,abi:process.versions.modules,libc:header?.glibcVersionRuntime??`${process.platform}-unknown`});
}
