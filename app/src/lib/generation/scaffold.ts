import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "@/lib/config";
import { runCommand } from "@/lib/workspace/command";
import { ensureProjectRoot, resolveInsideProject } from "@/lib/workspace/paths";
import { commitAll, ensureGitRepo } from "./git";

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

function cacheDir(): string {
  return path.join(config.templateCacheRoot, templateHash());
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

export function hasNodeModulesCache(): boolean {
  return fs.existsSync(path.join(cacheDir(), "node_modules"));
}

/** 用硬链接从缓存恢复 node_modules，失败时回退为普通拷贝 */
export async function restoreNodeModulesCache(projectId: string): Promise<boolean> {
  const source = path.join(cacheDir(), "node_modules");
  if (!fs.existsSync(source)) return false;

  // 先清掉可能残留的 node_modules，避免 cp 把源目录嵌套进去
  const clean = await runCommand(projectId, "rm -rf node_modules", { timeoutMs: 120_000 });
  if (clean.exitCode !== 0) return false;

  const link = await runCommand(projectId, `cp -al "${source}" node_modules`, {
    timeoutMs: 120_000,
  });
  if (link.exitCode === 0) return true;

  const copy = await runCommand(projectId, `cp -a "${source}" node_modules`, {
    timeoutMs: 120_000,
  });
  return copy.exitCode === 0;
}

/** 首次安装完成后把 node_modules 快照到模板缓存（硬链接，几乎不占空间） */
export async function saveNodeModulesCache(projectId: string): Promise<void> {
  const root = ensureProjectRoot(projectId);
  if (!fs.existsSync(path.join(root, "node_modules"))) return;

  const target = cacheDir();
  if (fs.existsSync(path.join(target, "node_modules"))) return;

  const mkdir = await runCommand(projectId, `mkdir -p "${target}"`, { timeoutMs: 120_000 });
  if (mkdir.exitCode !== 0) return;

  await runCommand(projectId, `cp -al node_modules "${path.join(target, "node_modules")}"`, {
    timeoutMs: 120_000,
  });
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

  let filesWritten = 0;
  for (const relative of listTemplateFiles()) {
    const target = resolveInsideProject(projectId, relative, { allowMissing: true });
    if (fs.existsSync(target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(source, relative), target);
    filesWritten += 1;
  }

  await ensureGitRepo(projectId);
  await commitAll(projectId, "chore: 初始化工程骨架");

  if (hasNodeModulesCache() && !fs.existsSync(path.join(root, "node_modules"))) {
    await restoreNodeModulesCache(projectId);
  }

  return {
    action: filesWritten === 0 ? "skipped" : action,
    filesWritten,
  };
}
