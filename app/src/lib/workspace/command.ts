import { spawn } from "node:child_process";
import { config } from "@/lib/config";
import { resolveInsideProject } from "./paths";
import { createWorkspaceExecution, ensureWorkspaceRuntime } from "./execution";

/**
 * 命令执行：cwd 锁定项目目录、超时强制终止、输出截断、黑名单拦截。
 */

const BLOCKED_PATTERNS: RegExp[] = [
  /\brm\s+(-[a-zA-Z]*\s+)*\/(\s|$)/, // rm -rf /
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bhalt\b/,
  /:\(\)\s*\{.*\};/, // fork bomb
  /\bchmod\s+-R\s+777\s+\//,
  /\bcurl\b[^|]*\|\s*(ba)?sh/, // curl | sh
  /\bwget\b[^|]*\|\s*(ba)?sh/,
  /\bnc\b.*-e\b/,
  />\s*\/dev\/sd/,
];

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  /** 是否因 AbortSignal 被取消 */
  aborted: boolean;
}

export function assertCommandAllowed(command: string): void {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`命令被安全策略拒绝：${command}`);
    }
  }
}

function truncate(text: string): string {
  if (text.length <= config.maxToolOutputChars) return text;
  return `[较早输出已截断]\n${text.slice(-config.maxToolOutputChars)}`;
}

export async function runCommand(
  projectId: string,
  command: string,
  opts: { timeoutMs?: number; env?: Record<string, string>; signal?: AbortSignal; cwd?: string; onOutput?: (chunk:string,channel:"stdout"|"stderr")=>void } = {},
): Promise<CommandResult> {
  assertCommandAllowed(command);

  if (opts.signal?.aborted) {
    return Promise.resolve({
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut: false,
      aborted: true,
    });
  }

  const cwd = resolveInsideProject(projectId, opts.cwd ?? ".");
  await ensureWorkspaceRuntime(cwd, opts.signal);
  if (opts.signal?.aborted) return {stdout:"",stderr:"",exitCode:null,timedOut:false,aborted:true};
  const execution = createWorkspaceExecution(cwd, command, opts.env);
  const timeoutMs = opts.timeoutMs ?? config.commandTimeoutMs;

  return new Promise((resolve) => {
    const child = spawn(execution.command, execution.args, {
      cwd,
      env: execution.env,
      detached: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    let settled = false;

    const killGroup = (signal: NodeJS.Signals) => {
      try {
        if (child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
        try {
          child.kill(signal);
        } catch {
          /* 进程已退出 */
        }
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup("SIGKILL");
      execution.cleanup?.();
    }, timeoutMs);

    // 取消：先 SIGTERM 整个子进程组，3 秒后仍未退出则 SIGKILL
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      if (settled || aborted) return;
      aborted = true;
      killGroup("SIGTERM");
      execution.cleanup?.();
      killTimer = setTimeout(() => killGroup("SIGKILL"), 3000);
      killTimer.unref?.();
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    if(opts.signal?.aborted) onAbort();

    child.stdout.on("data", (chunk: Buffer) => {
      const text=chunk.toString();
      stdout=(stdout+text).slice(-config.maxToolOutputChars*2);
      try { opts.onOutput?.(text,"stdout"); } catch { /* 观察者不能中断工程进程。 */ }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text=chunk.toString();
      stderr=(stderr+text).slice(-config.maxToolOutputChars*2);
      try { opts.onOutput?.(text,"stderr"); } catch { /* 观察者不能中断工程进程。 */ }
    });

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      execution.cleanup?.();
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      opts.signal?.removeEventListener("abort", onAbort);
      resolve({
        stdout: truncate(stdout),
        stderr: truncate(stderr),
        exitCode,
        timedOut,
        aborted,
      });
    };

    child.on("error", (err) => {
      stderr += `\n${err.message}`;
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}
