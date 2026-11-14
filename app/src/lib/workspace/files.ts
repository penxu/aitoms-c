import fs from "node:fs";
import path from "node:path";
import { config } from "@/lib/config";
import {
  IGNORED_DIRS,
  projectRoot,
  resolveInsideProject,
  toRelative,
} from "./paths";

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  children?: FileNode[];
}

function truncate(text: string): string {
  if (text.length <= config.maxToolOutputChars) return text;
  return `${text.slice(0, config.maxToolOutputChars)}\n\n... [内容已截断，共 ${text.length} 字符]`;
}

export function readFile(projectId: string, filePath: string): string {
  const abs = resolveInsideProject(projectId, filePath);
  if (!fs.existsSync(abs)) throw new Error(`文件不存在：${filePath}`);
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) throw new Error(`这是一个目录，无法读取：${filePath}`);
  return truncate(fs.readFileSync(abs, "utf8"));
}

export function writeFile(projectId: string, filePath: string, content: string): void {
  const abs = resolveInsideProject(projectId, filePath, { allowMissing: true });
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

/**
 * 行级替换编辑（对标 harness agent 的 edit 语义）。
 * oldString 必须唯一匹配，否则拒绝以避免误改。
 */
export function editFile(
  projectId: string,
  filePath: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): string {
  const abs = resolveInsideProject(projectId, filePath);
  const original = fs.readFileSync(abs, "utf8");
  if (!original.includes(oldString)) {
    throw new Error(`未找到要替换的内容（oldString 不匹配）`);
  }
  if (!replaceAll) {
    const occurrences = original.split(oldString).length - 1;
    if (occurrences > 1) {
      throw new Error(`oldString 匹配到 ${occurrences} 处，请提供更多上下文使其唯一`);
    }
  }
  const updated = replaceAll
    ? original.split(oldString).join(newString)
    : original.replace(oldString, newString);
  fs.writeFileSync(abs, updated, "utf8");
  return `已更新 ${filePath}（${original.length} → ${updated.length} 字符）`;
}

export function deleteFile(projectId: string, filePath: string): string {
  const abs = resolveInsideProject(projectId, filePath);
  if (!fs.existsSync(abs)) throw new Error(`文件不存在：${filePath}`);
  fs.rmSync(abs, { recursive: true, force: true });
  return `已删除 ${filePath}`;
}

function walk(root: string, dir: string, depth: number, maxDepth: number): FileNode[] {
  if (depth > maxDepth) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes: FileNode[] = [];
  for (const entry of entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs).split(path.sep).join("/");
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: rel,
        type: "dir",
        children: walk(root, abs, depth + 1, maxDepth),
      });
    } else {
      let size = 0;
      try {
        size = fs.statSync(abs).size;
      } catch {
        /* ignore */
      }
      nodes.push({ name: entry.name, path: rel, type: "file", size });
    }
  }
  return nodes;
}

export function listFiles(projectId: string, maxDepth = 4): FileNode[] {
  const root = fs.realpathSync(projectRoot(projectId));
  return walk(root, root, 0, maxDepth);
}

/** 简单 glob 搜索：支持 * 与 ** */
export function searchFiles(
  projectId: string,
  pattern: string,
  contentQuery?: string,
): Array<{ path: string; match?: string }> {
  const root = fs.realpathSync(projectRoot(projectId));
  const regex = globToRegex(pattern);
  const results: Array<{ path: string; match?: string }> = [];

  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      const rel = toRelative(projectId, abs);
      if (entry.isDirectory()) {
        visit(abs);
        continue;
      }
      if (!regex.test(rel)) continue;
      if (contentQuery) {
        let text = "";
        try {
          text = fs.readFileSync(abs, "utf8");
        } catch {
          continue;
        }
        const idx = text.indexOf(contentQuery);
        if (idx === -1) continue;
        results.push({
          path: rel,
          match: text.slice(Math.max(0, idx - 80), idx + contentQuery.length + 80),
        });
      } else {
        results.push({ path: rel });
      }
      if (results.length > 200) return;
    }
  };
  visit(root);
  return results;
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, "(?:.*/)?");
  return new RegExp(`^${escaped}$`);
}

export function readFileForEditor(projectId: string, filePath: string) {
  const abs = resolveInsideProject(projectId, filePath);
  const stat = fs.statSync(abs);
  return {
    path: filePath,
    size: stat.size,
    content: stat.size > 1024 * 1024 ? "" : fs.readFileSync(abs, "utf8"),
    truncated: stat.size > 1024 * 1024,
  };
}
