import fs from "node:fs";
import path from "node:path";
import { resolveInsideProject } from "@/lib/workspace/paths";
import { runCommand } from "@/lib/workspace/command";

/**
 * 项目级 git 操作：初始化仓库、提交全部改动。
 * 只用项目级配置，不触碰全局 git 配置。
 */

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function ensureGitRepo(projectId: string): Promise<void> {
  const check = await runCommand(projectId, "test -d .git");
  if (check.exitCode === 0) return;

  const init = await runCommand(projectId, "git init -q");
  if (init.exitCode !== 0) {
    throw new Error(`git init 失败：${init.stderr || init.stdout}`);
  }
  await runCommand(projectId, 'git config user.name "Atoms"');
  await runCommand(projectId, 'git config user.email "atoms@local"');
}

export async function commitAll(projectId: string, message: string): Promise<boolean> {
  await ensureGitRepo(projectId);

  // 排除平台缓存而不把已忽略目录作为显式pathspec（Git会因此返回1）。
  const excluded = resolveInsideProject(projectId, ".git/info/exclude", { allowMissing: true });
  fs.mkdirSync(path.dirname(excluded), { recursive: true });
  const previous = fs.existsSync(excluded) ? fs.readFileSync(excluded, "utf8") : "";
  const patterns = ["acceptance", "candidates", "runtime", "dependency-backups", "recovery", "checkpoints"].map(dir => `/.atoms/${dir}/`);
  const missing = patterns.filter(pattern => !previous.split("\n").includes(pattern));
  if (missing.length) fs.appendFileSync(excluded, `\n${missing.join("\n")}\n`);
  const add = await runCommand(projectId, "git add -A");
  if (add.exitCode !== 0) {
    throw new Error(`git add 失败：${add.stderr || add.stdout}`);
  }

  const diff = await runCommand(projectId, "git diff --cached --quiet");
  if (diff.exitCode === 0) return false;

  const commit = await runCommand(projectId, `git commit -q -m ${shellQuote(message)}`);
  if (commit.exitCode !== 0) {
    throw new Error(`git commit 失败：${commit.stderr || commit.stdout}`);
  }
  return true;
}
