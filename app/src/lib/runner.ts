import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { config } from "@/lib/config";
import { ensureProjectRoot } from "@/lib/workspace/paths";
import {
  getProcessByProject,
  listRunningProcesses,
  updateProcessStatus,
  updateProjectStatus,
  upsertProcess,
} from "@/lib/db/queries";

/**
 * 项目运行时管理：端口池分配、子进程启动/停止/重启、崩溃回写。
 */

interface RuntimeEntry {
  child: ChildProcess;
  port: number;
  startedAt: number;
}

declare global {
  var __atomsRuntimes: Map<string, RuntimeEntry> | undefined;
}

const runtimes: Map<string, RuntimeEntry> =
  globalThis.__atomsRuntimes ?? new Map<string, RuntimeEntry>();
globalThis.__atomsRuntimes = runtimes;

function portAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

export async function allocatePort(): Promise<number> {
  const used = new Set(
    listRunningProcesses()
      .map((p) => p.port)
      .concat([...runtimes.values()].map((r) => r.port)),
  );
  for (let port = config.portRangeMin; port <= config.portRangeMax; port++) {
    if (used.has(port)) continue;
    if (await portAvailable(port)) return port;
  }
  throw new Error("端口池已耗尽，无法分配新端口");
}

/** 项目包管理器：存在 pnpm-lock.yaml 时优先 pnpm */
function packageManager(root: string): "pnpm" | "npm" {
  return fs.existsSync(path.join(root, "pnpm-lock.yaml")) ? "pnpm" : "npm";
}

function buildStartCommand(projectId: string, port: number): string {
  const root = ensureProjectRoot(projectId);
  const pm = packageManager(root);
  const pkgPath = path.join(root, "package.json");
  let deps: Record<string, string> = {};
  let scripts: Record<string, string> = {};
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      scripts = pkg.scripts ?? {};
    } catch {
      /* ignore */
    }
  }

  if (deps.next && scripts.dev) {
    return `${pm} run dev -- -p ${port} -H 127.0.0.1`;
  }
  if (deps.vite && scripts.dev) {
    return `${pm} run dev -- --port ${port} --host 127.0.0.1`;
  }
  if (scripts.dev) {
    return `PORT=${port} ${pm} run dev`;
  }
  if (scripts.start) {
    return `PORT=${port} ${pm} run start`;
  }
  // 纯静态项目：用内置静态服务器
  return `npx --yes serve@14 . -l ${port} --no-clipboard`;
}

export interface StartResult {
  port: number;
  pid: number;
  command: string;
}

export async function startService(projectId: string): Promise<StartResult> {
  const existing = runtimes.get(projectId);
  if (existing) {
    return { port: existing.port, pid: existing.child.pid ?? 0, command: "already-running" };
  }

  const port = await allocatePort();
  const command = buildStartCommand(projectId, port);
  const cwd = ensureProjectRoot(projectId);

  const child = spawn("bash", ["-lc", command], {
    cwd,
    detached: true,
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      // 子路径部署契约：模板 next.config.ts 读取该值设置 basePath
      ATOMS_BASE_PATH: `/p/${projectId}`,
    },
    stdio: "ignore",
  });

  runtimes.set(projectId, { child, port, startedAt: Date.now() });

  upsertProcess({
    id: `proc_${projectId}`,
    projectId,
    pid: child.pid ?? 0,
    port,
    command,
  });
  updateProjectStatus(projectId, "running", { assignedPort: port });

  child.on("exit", (code) => {
    runtimes.delete(projectId);
    const isClean = code === 0;
    updateProcessStatus(projectId, isClean ? "stopped" : "crashed", { clearPid: true });
    updateProjectStatus(projectId, isClean ? "stopped" : "error", { assignedPort: null });
  });

  return { port, pid: child.pid ?? 0, command };
}

export function stopService(projectId: string): { stopped: boolean } {
  const entry = runtimes.get(projectId);
  if (entry?.child.pid) {
    try {
      process.kill(-entry.child.pid, "SIGTERM");
    } catch {
      try {
        entry.child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
    runtimes.delete(projectId);
  }
  updateProcessStatus(projectId, "stopped", { clearPid: true });
  updateProjectStatus(projectId, "stopped", { assignedPort: null });
  return { stopped: true };
}

export async function restartService(projectId: string): Promise<StartResult> {
  stopService(projectId);
  await new Promise((r) => setTimeout(r, 400));
  return startService(projectId);
}

export function getRuntimePort(projectId: string): number | null {
  const entry = runtimes.get(projectId);
  if (entry) return entry.port;
  const row = getProcessByProject(projectId);
  if (row?.status === "running" && row.port) return row.port;
  return null;
}

/** 平台启动时清理孤儿进程记录 */
export function cleanupOrphans(): string[] {
  const running = listRunningProcesses();
  const cleaned: string[] = [];
  for (const p of running) {
    let alive = false;
    if (p.pid) {
      try {
        process.kill(p.pid, 0);
        alive = true;
      } catch {
        alive = false;
      }
    }
    if (!alive && !runtimes.has(p.projectId)) {
      updateProcessStatus(p.projectId, "stopped", { clearPid: true });
      updateProjectStatus(p.projectId, "stopped", { assignedPort: null });
      cleaned.push(p.projectId);
    }
  }
  return cleaned;
}
