import fs from "node:fs";
import path from "node:path";
import { config } from "@/lib/config";

/**
 * 路径安全层：所有文件/命令工具强制限制在项目目录内。
 * 使用 realpath 解析，拒绝 `../` 逃逸与符号链接逃逸。
 */

export class PathEscapeError extends Error {
  constructor(requested: string) {
    super(`拒绝访问项目目录之外的路径：${requested}`);
    this.name = "PathEscapeError";
  }
}

export function projectRoot(projectId: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(projectId)) {
    throw new PathEscapeError(`非法项目 ID：${projectId}`);
  }
  return path.join(config.workspaceRoot, projectId);
}

export function ensureProjectRoot(projectId: string): string {
  const root = projectRoot(projectId);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

/** 解析真实路径并校验仍在项目根目录内 */
export function resolveInsideProject(
  projectId: string,
  relativePath: string,
  opts: { allowMissing?: boolean } = {},
): string {
  const root = ensureProjectRoot(projectId);
  const realRoot = fs.realpathSync(root);
  const target = path.resolve(realRoot, relativePath || ".");

  // 先做词法校验（目标不必存在）
  if (target !== realRoot && !target.startsWith(realRoot + path.sep)) {
    throw new PathEscapeError(relativePath);
  }

  if (fs.existsSync(target)) {
    // 符号链接逃逸校验
    const real = fs.realpathSync(target);
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
      throw new PathEscapeError(relativePath);
    }
    return real;
  }

  if (!opts.allowMissing) return target;

  // 目标不存在：校验最近的已存在祖先目录也不逃逸
  let ancestor = path.dirname(target);
  while (ancestor !== realRoot && ancestor.startsWith(realRoot)) {
    if (fs.existsSync(ancestor)) {
      const realAncestor = fs.realpathSync(ancestor);
      if (realAncestor !== realRoot && !realAncestor.startsWith(realRoot + path.sep)) {
        throw new PathEscapeError(relativePath);
      }
      break;
    }
    ancestor = path.dirname(ancestor);
  }
  return target;
}

export function toRelative(projectId: string, absolute: string): string {
  const root = fs.realpathSync(projectRoot(projectId));
  return path.relative(root, absolute).split(path.sep).join("/");
}

/** 忽略的目录（体积大且无意义） */
export const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".turbo",
  ".cache",
]);
