import fs from "node:fs";
import path from "node:path";
import { ensureProjectRoot, resolveInsideProject } from "@/lib/workspace/paths";
import { getProtectedRuntimeSources } from "@/lib/runner";

const candidatePrefix = ".atoms/candidates/";

/** 仅回收平台候选目录；最近版本与运行/恢复/回滚源均保留。调用方应持有工程变更锁。 */
export async function pruneCandidates(projectId: string, keep = 1, protectedRelative: string[] = []): Promise<string[]> {
  if (!Number.isSafeInteger(keep) || keep < 0) throw new Error("候选保留数量无效");
  const root = fs.realpathSync(ensureProjectRoot(projectId));
  const protectedPaths = new Set<string>();
  for (const relative of [...protectedRelative, ...getProtectedRuntimeSources(projectId)]) {
    if (relative === "." || relative === "") continue;
    if (!relative.startsWith(candidatePrefix) || relative.includes("\\") || relative.slice(candidatePrefix.length).includes("/") || [".", "..", ""].includes(relative.slice(candidatePrefix.length))) {
      throw new Error(`候选保护路径无效：${relative}`);
    }
    const resolved = resolveInsideProject(projectId, relative, { allowMissing: true });
    const expected = path.join(root, relative);
    if (resolved !== expected) throw new Error(`拒绝候选符号链接路径：${relative}`);
    protectedPaths.add(relative);
  }
  const expectedBase = path.join(root, ".atoms", "candidates");
  const base = resolveInsideProject(projectId, ".atoms/candidates", { allowMissing: true });
  if (base !== expectedBase) throw new Error("拒绝候选根目录符号链接路径");
  if (!fs.existsSync(base)) return [];
  if (fs.lstatSync(base).isSymbolicLink() || !fs.lstatSync(base).isDirectory()) throw new Error("候选根目录必须是普通目录");
  const entries: { relative: string; absolute: string; modifiedAt: number }[] = [];
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`拒绝候选符号链接：${entry.name}`);
    if (!entry.isDirectory()) continue;
    const relative = candidatePrefix + entry.name;
    const absolute = resolveInsideProject(projectId, relative);
    if (absolute !== path.join(base, entry.name)) throw new Error(`拒绝候选路径逃逸：${entry.name}`);
    entries.push({ relative, absolute, modifiedAt: fs.statSync(absolute).mtimeMs });
  }
  entries.sort((a, b) => b.modifiedAt - a.modifiedAt || b.relative.localeCompare(a.relative));
  for (const entry of entries.slice(0, keep)) protectedPaths.add(entry.relative);
  const removed: string[] = [];
  for (const entry of entries) {
    // 每次删除前重新读取保护信息，覆盖并发切换进入回滚窗口的版本。
    const live = getProtectedRuntimeSources(projectId);
    if (protectedPaths.has(entry.relative) || live.includes(entry.relative)) continue;
    if (resolveInsideProject(projectId, ".atoms/candidates") !== expectedBase || resolveInsideProject(projectId, entry.relative) !== entry.absolute || fs.lstatSync(entry.absolute).isSymbolicLink()) {
      throw new Error(`候选清理路径在执行期间变化：${entry.relative}`);
    }
    await fs.promises.rm(entry.absolute, { recursive: true });
    removed.push(entry.relative);
  }
  return removed;
}
