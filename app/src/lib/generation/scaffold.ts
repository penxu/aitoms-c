import { dependencyFingerprint, prepareDependencyRuntime, isReusableDependencyTree, publishDependencyCache, restoreDependencyCache } from "./dependency-cache";
import { runCommand, type CommandResult } from "@/lib/workspace/command";
import { installDependenciesCommand } from "@/lib/workspace/toolchain";
import { workspaceExecutionRuntime, ensureWorkspaceRuntime } from "@/lib/workspace/execution";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "@/lib/config";
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
  try {publishDependencyCache(source, cacheDir(fingerprint), fingerprint);} catch { /* 缓存失败不影响交付 */ }
}

/** 即使命中缓存也由固定 pnpm 校验清单与锁文件，并实际安装缺失依赖。 */
export async function ensureProjectDependencies(projectId: string, signal?: AbortSignal, env?: Record<string,string>, cwd = ".", packages: string[] = []): Promise<CommandResult> {
  const command=installDependenciesCommand(packages);
  if(signal?.aborted)return {stdout:"",stderr:"",exitCode:null,timedOut:false,aborted:true};
  const root=resolveInsideProject(projectId,cwd);
  await ensureWorkspaceRuntime(root,signal);
  const modules=path.join(root,"node_modules");
  const runtime=JSON.stringify(workspaceExecutionRuntime(root));
  prepareDependencyRuntime(root,runtime);
  await restoreNodeModulesCache(projectId,cwd);
  const result = await runCommand(projectId, command, {timeoutMs:300_000,signal,env,cwd});
  if (result.exitCode === 0 && !result.aborted && !result.timedOut) {
    const npmLock=resolveInsideProject(projectId,path.join(cwd,"package-lock.json"),{allowMissing:true});
    if (fs.existsSync(npmLock)) fs.unlinkSync(npmLock);
    if(fs.existsSync(modules)) {
      const manifest=path.join(modules,".atoms-runtime.json");
      if(fs.existsSync(manifest))fs.unlinkSync(manifest);
      fs.writeFileSync(manifest,JSON.stringify({runtime,fingerprint:dependencyFingerprint(root)}));
    }
    await saveNodeModulesCache(projectId,cwd);
  }
  return result;
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
