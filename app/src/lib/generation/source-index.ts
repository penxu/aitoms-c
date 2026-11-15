/**
 * 项目内可复用的导出清单。
 *
 * 修复阶段常见的死循环是：路由 import 了一个仓库里不存在的函数名，
 * 模型每轮改一个名字（getFeedbackForEvent ↔ getFeedbackByEvent）却始终对不上。
 * 把「每个文件实际导出了什么」直接列给模型，能从根上消除这类猜测。
 */
import fs from "node:fs";
import path from "node:path";

export interface FileExports {
  path: string;
  names: string[];
}

const EXPORT_DECL =
  /export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
const EXPORT_LIST = /export\s+(?:type\s+)?\{([^}]*)\}/g;

/** 提取一个文件里可被 import 的名字 */
export function extractExportNames(content: string): string[] {
  const names = new Set<string>();

  for (const match of content.matchAll(EXPORT_DECL)) {
    names.add(match[1]);
  }
  for (const match of content.matchAll(EXPORT_LIST)) {
    for (const piece of match[1].split(",")) {
      const name = piece.trim().split(/\sas\s/).pop()?.trim();
      if (name) names.add(name);
    }
  }

  return [...names].sort();
}

const SOURCE = /\.(ts|tsx)$/;

/** 扫描目录，返回「文件 → 导出名」，用于在提示词里给出可用的函数名 */
export function collectExports(
  root: string,
  dirs: string[] = ["lib", "app/api"],
  maxFiles = 60,
): FileExports[] {
  const out: FileExports[] = [];

  const walk = (dir: string) => {
    if (out.length >= maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= maxFiles) return;
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!SOURCE.test(entry.name)) continue;
      try {
        if (fs.statSync(abs).size > 200_000) continue;
        const names = extractExportNames(fs.readFileSync(abs, "utf8"));
        if (names.length === 0) continue;
        out.push({
          path: path.relative(root, abs).split(path.sep).join("/"),
          names: names.slice(0, 25),
        });
      } catch {
        /* 忽略读取失败的文件 */
      }
    }
  };

  for (const dir of dirs) walk(path.join(root, dir));

  return out.sort((a, b) => a.path.localeCompare(b.path));
}
