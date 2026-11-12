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
