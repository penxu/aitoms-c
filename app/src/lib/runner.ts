import {RuntimeLogs} from "./workspace/runtime-logs";
import {dependencyFingerprint} from "./generation/dependency-cache";
import { waitForPreviewSocket, waitForPreviewStart } from "./workspace/runtime-start";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { config } from "@/lib/config";
import { sqlite } from "@/lib/db";
import { scriptArguments } from "./workspace/package-manager";
import { pnpmShellCommand } from "./workspace/toolchain";
import { findAvailablePort } from "./workspace/ports";
import { ensureProjectRoot, resolveInsideProject } from "@/lib/workspace/paths";
import { RuntimeGate } from "./workspace/runtime-gate";
import { RuntimeIdentities } from "./workspace/runtime-identities";
import { readProcessIdentity, sameProcess, type ProcessIdentity } from "./workspace/process-identity";
import { createWorkspaceExecution, ensureWorkspaceRuntime, cleanupWorkspaceExecution, isWorkspaceExecutionRunning } from "./workspace/execution";
import { setTimeout as delay } from "node:timers/promises";
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
  child?: ChildProcess;
  cleanup?: () => void;
  identity: ProcessIdentity;
  port: number;
  startedAt: number;
}

declare global {
  var __atomsRuntimeLogs:RuntimeLogs|undefined;
  var __atomsRollbackSources: Map<string, string> | undefined;
  var __atomsRuntimeGate: RuntimeGate | undefined;
  var __atomsStoppingRuntimes: Map<string, ProcessIdentity> | undefined;
  var __atomsRuntimes: Map<string, RuntimeEntry> | undefined;
}

const runtimes: Map<string, RuntimeEntry> =
  globalThis.__atomsRuntimes ?? new Map<string, RuntimeEntry>();
globalThis.__atomsRuntimes = runtimes;
const gate = globalThis.__atomsRuntimeGate ??= new RuntimeGate();
const identities = new RuntimeIdentities(sqlite);
const stopping = globalThis.__atomsStoppingRuntimes ??= new Map<string, ProcessIdentity>();
const runtimeLogs=globalThis.__atomsRuntimeLogs??=new RuntimeLogs();
export function getRuntimeLogs(projectId:string):string{return runtimeLogs.read(projectId);}
const rollbackSources = globalThis.__atomsRollbackSources ??= new Map<string, string>();

function portAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

declare global {
  var __atomsPortReservations: Set<number> | undefined;
  var __atomsPortQueue: Promise<void> | undefined;
}
const reservations = globalThis.__atomsPortReservations ??= new Set<number>();
export function releasePortReservation(port:number):void { reservations.delete(port); }
export async function allocatePort(): Promise<number> {
  const previous=globalThis.__atomsPortQueue ?? Promise.resolve();
  let unlock!:()=>void;
  globalThis.__atomsPortQueue=new Promise<void>(resolve=>{unlock=resolve;});
  await previous;
  try {
    const production=sqlite.prepare("SELECT port FROM release_processes WHERE status='running'").all() as {port:number}[];
    const used=new Set([...listRunningProcesses().map(p=>p.port),...production.map(p=>p.port),...reservations]);
    const port=await findAvailablePort(config.portRangeMin,config.portRangeMax,used,portAvailable);
    reservations.add(port);
    const timer=setTimeout(()=>reservations.delete(port),10000);timer.unref();
    return port;
  } finally {unlock();}
}

/** 项目包管理器：存在 pnpm-lock.yaml 时优先 pnpm */
function packageManager(root: string): "pnpm" | "npm" {
  return fs.existsSync(path.join(root, "pnpm-lock.yaml")) ? "pnpm" : "npm";
}

function buildStartCommand(root: string, port: number): string {
  const pm = packageManager(root);
  const executable = pm === "pnpm" ? pnpmShellCommand() : "npm";
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

  if (config.generationVerificationMode === "full" && deps.next && scripts.start && fs.existsSync(path.join(root,".next","BUILD_ID"))) {
    return `${executable} ${scriptArguments(pm,"start",["-p",String(port),"-H","127.0.0.1"]).join(" ")}`;
  }
  if (deps.next && scripts.dev) {
    return `${executable} ${scriptArguments(pm,"dev",["--webpack","-p",String(port),"-H","127.0.0.1"]).join(" ")}`;
  }
  if (deps.vite && scripts.dev) {
    return `${executable} ${scriptArguments(pm,"dev",["--port",String(port),"--host","127.0.0.1"]).join(" ")}`;
  }
  if (scripts.dev) {
    return `PORT=${port} ${executable} run dev`;
  }
  if (scripts.start) {
    return `PORT=${port} ${executable} run start`;
  }
  // 纯静态项目：用内置静态服务器
  return `npx --yes serve@14 . -l ${port} --no-clipboard`;
}

export interface StartResult {
  port: number;
  pid: number;
  command: string;
}

export interface ServiceOptions { sourceDir?: string; signal?:AbortSignal }

export interface ServiceSwitchOptions extends ServiceOptions {
  /** 放在切换事务内执行；失败自动恢复切换前的源码。 */
  validate?: (result: StartResult, signal: AbortSignal) => Promise<void>;
}

function sourceRoot(projectId: string, options: ServiceOptions): string {
  const root = fs.realpathSync(ensureProjectRoot(projectId));
  const requested = options.sourceDir ?? path.relative(root, identities.get(projectId)?.cwd ?? root);
  if (path.isAbsolute(requested) || requested.split(/[\\/]/).includes("..")) throw new Error("预览源码路径无效");
  const cwd = resolveInsideProject(projectId, requested || ".");
  if (cwd !== root && !cwd.startsWith(path.join(root, ".atoms", "candidates") + path.sep)) throw new Error("预览源码必须是工程或候选快照");
  if (!fs.statSync(cwd).isDirectory()) throw new Error("预览源码目录不存在");
  return cwd;
}

function recoverRuntime(projectId: string): RuntimeEntry | undefined {
  const entry = runtimes.get(projectId);
  const saved=identities.get(projectId);
  const row = getProcessByProject(projectId);
  if(saved?.cleanupId&&row?.status==="running") {
    try {
      const cwd=sourceRoot(projectId,{});
      if(cwd===saved.cwd&&isWorkspaceExecutionRunning(cwd,saved.cleanupId,row.port)) {
        const recovered={...entry,identity:saved,port:row.port,startedAt:row.startedAt.getTime()};
        runtimes.set(projectId,recovered);return recovered;
      }
    }catch{/* 容器信息不可验证时仍按原生进程身份检查，绝不采纳陌生容器。 */}
  }
  const cached = entry?.identity;
  if (cached && sameProcess(cached, readProcessIdentity(cached.pid))) return entry;
  if (entry && !cached) {
    // 缓存条目缺少进程身份时直接丢弃，否则整个项目列表都会因读 pid 崩掉
    console.warn(`[runner] 运行时缓存缺少身份信息，已丢弃：${projectId}`);
  }
  if (entry) runtimes.delete(projectId);
  if (row?.status !== "running" || !row.pid) return undefined;
  try {
    const cwd = sourceRoot(projectId, {});
    const identity = identities.recover(projectId, row.pid, cwd, row.startedAt.getTime(), readProcessIdentity);
    if (identity) {
      const recovered = { identity, port: row.port, startedAt: row.startedAt.getTime() };
      runtimes.set(projectId, recovered);
      return recovered;
    }
  } catch { /* 路径或进程身份失效 */ }
  return undefined;
}

function cleanupRuntime(projectId: string, entry?: RuntimeEntry): void {
  const stored = identities.get(projectId);
  if (entry?.cleanup) {
    const cleanup = entry.cleanup; entry.cleanup = undefined;
    cleanup();
  } else if (stored?.cleanupId) {
    // 重启后不依赖已丢失的ChildProcess/closure，按持久化容器身份清理。
    const cwd = sourceRoot(projectId, {});
    cleanupWorkspaceExecution(cwd, stored.cleanupId);
  }
  identities.clearCleanup(projectId);
}

function stopCurrent(projectId: string): ProcessIdentity | undefined {
  const entry = recoverRuntime(projectId);
  cleanupRuntime(projectId, entry);
  if (entry?.identity && sameProcess(entry.identity, readProcessIdentity(entry.identity.pid))) {
    // 只向已核对启动标识与cwd的原进程组发送信号。
    try { process.kill(-entry.identity.pid, "SIGTERM"); }
    catch { try { process.kill(entry.identity.pid, "SIGTERM"); } catch { /* 已退出 */ } }
  }
  if (entry) stopping.set(projectId, entry.identity);
  runtimes.delete(projectId);
  updateProcessStatus(projectId, "stopped", { clearPid: true });
  updateProjectStatus(projectId, "stopped", { assignedPort: null });
  return entry?.identity;
}

async function waitForStopped(identity?: ProcessIdentity): Promise<void> {
  if (!identity) return;
  for (let i = 0; i < 20; i++) {
    if (!sameProcess(identity, readProcessIdentity(identity.pid))) return;
    await delay(100);
  }
  if (sameProcess(identity, readProcessIdentity(identity.pid))) {
    try { process.kill(-identity.pid, "SIGKILL"); } catch { /* 已退出 */ }
  }
}

async function startCurrent(projectId: string, options: ServiceOptions, signal: AbortSignal): Promise<StartResult> {
  signal.throwIfAborted();
  const cwd = sourceRoot(projectId, options);
  const previous = stopping.get(projectId);
  await waitForStopped(previous);
  if (stopping.get(projectId) === previous) stopping.delete(projectId);
  const existing = recoverRuntime(projectId);
  const dependencyKey=dependencyFingerprint(cwd);
  if (existing?.identity.cwd === cwd && (identities.get(projectId)?.dependencyKey??null)===dependencyKey) return { port: existing.port, pid: existing.identity.pid, command: "already-running" };
  // 跨源码目录或依赖变化也走切换事务；不能先丢掉旧候选再尝试启动。
  if (existing) return replaceCurrent(projectId,options,signal);
  signal.throwIfAborted();
  await ensureWorkspaceRuntime(cwd, signal);
  signal.throwIfAborted();
  const port = await allocatePort();
  let child: ChildProcess | undefined;
  let identity: ProcessIdentity | null = null;
  let startupFailure: string | null = null;
  let startupLog = "";
  let cleanup: (() => void) | undefined;
  const cleanExecution = () => { const owned = cleanup; cleanup = undefined; owned?.(); };
  try {
    signal.throwIfAborted();
    const command = buildStartCommand(cwd, port);
    const execution = createWorkspaceExecution(cwd, command, {
      NODE_ENV: command.includes(" run start") && fs.existsSync(path.join(cwd,".next","BUILD_ID")) ? "production" : "development", ATOMS_DATA_DIR: resolveInsideProject(projectId, "data", { allowMissing: true }), PORT: String(port), HOSTNAME: "127.0.0.1",
      ATOMS_BASE_PATH: `/p/${projectId}`, NEXT_PUBLIC_ATOMS_BASE_PATH: `/p/${projectId}`,
    });
    cleanup = execution.cleanup;
    child = spawn(execution.command, execution.args, { cwd, detached: true, env: execution.env, stdio: ["ignore", "pipe", "pipe"] });
    const ownedChild = child;
    const logToken=runtimeLogs.begin(projectId);
    const capture = (chunk: Buffer) => { startupLog = (startupLog + chunk.toString()).slice(-8000);runtimeLogs.append(projectId,logToken,chunk.toString()); };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    child.once("error", error => { startupFailure = error.message; runtimeLogs.append(projectId,logToken,`\n${error.message}`);cleanExecution(); });
    child.once("exit", code => {
      startupFailure = startupLog.trim() || `进程退出（${code ?? "signal"}）`;
      runtimeLogs.append(projectId,logToken,`\n进程退出（${code ?? "signal"}）`);
      if (runtimes.get(projectId)?.child !== ownedChild) return;
      cleanupRuntime(projectId, runtimes.get(projectId));
      runtimes.delete(projectId);
      updateProcessStatus(projectId, code === 0 ? "stopped" : "crashed", { clearPid: true });
      updateProjectStatus(projectId, code === 0 ? "stopped" : "error", { assignedPort: null });
    });
    for (let i = 0; i < 20 && !identity && !startupFailure; i++) {
      if (child.pid) identity = readProcessIdentity(child.pid);
      if (!identity) await delay(25);
      signal.throwIfAborted();
    }
    if (!identity || identity.cwd !== cwd) throw new Error(`无法核对预览进程身份：${startupFailure ?? "工作目录或启动标识不可用"}`);
    identities.save(projectId, identity, execution.cleanupId,dependencyFingerprint(cwd));
    runtimes.set(projectId, { child, identity, port, startedAt: Date.now(), cleanup: cleanExecution });
    upsertProcess({ id: `proc_${projectId}`, projectId, pid: identity.pid, port, command });
    updateProjectStatus(projectId, "running", { assignedPort: port });
    let nextProject = false;
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
      nextProject = Boolean(pkg.dependencies?.next || pkg.devDependencies?.next);
    } catch { /* 静态项目 */ }
    const startupError = () => signal.aborted ? "服务启动已停止" : startupFailure;
    if (config.generationVerificationMode === "full") {
      // 生产产物：必须真的响应页面，才能确认构建结果可用。
      await waitForPreviewStart(`http://127.0.0.1:${port}${nextProject ? `/p/${projectId}` : ""}/`, startupError);
    } else {
      // 开发预览：只等端口监听。首次请求会触发编译，不能把它算进启动等待。
      await waitForPreviewSocket(port, startupError, signal);
    }
    signal.throwIfAborted();
    return { port, pid: identity.pid, command };
  } catch (error) {
    if (child) {
      if (runtimes.get(projectId)?.child === child) await waitForStopped(stopCurrent(projectId));
      else if (child.exitCode === null && child.signalCode === null) {
        // 尚未登记的直接子进程仍由当前启动拥有。
        try { if (child.pid) process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
      }
    }
    cleanExecution();
    if (!signal.aborted) updateProjectStatus(projectId, "error", { assignedPort: null });
    throw error;
  } finally { releasePortReservation(port); }
}

export function startService(projectId: string, options: ServiceOptions = {}): Promise<StartResult> {
  return gate.start(projectId, signal => startCurrent(projectId, options, options.signal?AbortSignal.any([signal,options.signal]):signal), options.sourceDir);
}

export function stopService(projectId: string): { stopped: boolean } {
  gate.cancel(projectId);
  stopCurrent(projectId);
  return { stopped: true };
}

async function replaceCurrent(projectId: string, options: ServiceSwitchOptions, signal: AbortSignal): Promise<StartResult> {
  // 先校验候选路径，非法输入不能停止当前可用服务。
  sourceRoot(projectId, options);
  const previous = recoverRuntime(projectId);
  const root = fs.realpathSync(ensureProjectRoot(projectId));
  const previousSource = previous ? path.relative(root, previous.identity.cwd) || "." : null;
  if (previous) rollbackSources.set(projectId, previous.identity.cwd);
  await waitForStopped(stopCurrent(projectId));
  try {
    signal.throwIfAborted();
    const result = await startCurrent(projectId, options, signal);
    await options.validate?.(result, signal);
    signal.throwIfAborted();
    rollbackSources.delete(projectId);
    return result;
  } catch (error) {
    // 用户主动停止优先；不能在停止请求之后擅自重新启动旧版本。
    if (signal.aborted) throw error;
    await waitForStopped(stopCurrent(projectId));
    if (previousSource !== null) {
      try {
        await startCurrent(projectId, { sourceDir: previousSource }, signal);
        rollbackSources.delete(projectId);
      } catch (restoreError) {
        throw new AggregateError([error, restoreError], `预览切换失败，上一版本恢复也失败：${String(error)}；${String(restoreError)}`);
      }
      throw new Error(`预览切换失败，已恢复上一版本：${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    throw error;
  }
}

export function restartService(projectId: string, options: ServiceSwitchOptions = {}): Promise<StartResult> {
  return gate.restart(projectId, () => undefined, signal => replaceCurrent(projectId, options, options.signal?AbortSignal.any([signal,options.signal]):signal));
}

/** BUILD写源码前将旧根目录服务固定到独立快照；复制失败不触碰旧服务。 */
export function pinServiceToSnapshot(
  projectId: string,
  createSnapshot: () => Promise<{ relativeRoot: string }>,
  validate?: (result: StartResult, signal: AbortSignal) => Promise<void>,
): Promise<StartResult | null> {
  return gate.restart(projectId, () => undefined, async signal => {
    const existing = recoverRuntime(projectId);
    if (!existing) return null;
    const root = fs.realpathSync(ensureProjectRoot(projectId));
    if (existing.identity.cwd !== root) return { port: existing.port, pid: existing.identity.pid, command: "already-pinned" };
    const snapshot = await createSnapshot();
    signal.throwIfAborted();
    return replaceCurrent(projectId, { sourceDir: snapshot.relativeRoot, validate }, signal);
  });
}

/** 候选回收必须保护当前预览、持久化恢复源及尚在停止/回滚窗口的源码。 */
export function getProtectedRuntimeSources(projectId: string): string[] {
  const root = fs.realpathSync(ensureProjectRoot(projectId));
  const sources = [runtimes.get(projectId)?.identity.cwd, identities.get(projectId)?.cwd,
    stopping.get(projectId)?.cwd, rollbackSources.get(projectId)];
  const result = new Set<string>();
  for (const source of sources) {
    if (!source) continue;
    const relative = path.relative(root, source).split(path.sep).join("/") || ".";
    try {
      if (sourceRoot(projectId, { sourceDir: relative }) === source) result.add(relative);
    } catch { /* 已失效或越界的身份不能作为源码路径使用 */ }
  }
  return [...result];
}

export function getRuntimePort(projectId: string): number | null {
  try {
    return recoverRuntime(projectId)?.port ?? null;
  } catch (error) {
    console.warn(`[runner] 读取运行时端口失败：${projectId}`, error);
    return null;
  }
}

/** 平台启动时恢复存活且身份相符的进程；失效记录不向原PID发信号。 */
export function cleanupOrphans(): string[] {
  const cleaned: string[] = [];
  for (const row of listRunningProcesses()) {
    if (recoverRuntime(row.projectId)) continue;
    cleanupRuntime(row.projectId);
    updateProcessStatus(row.projectId, "stopped", { clearPid: true });
    updateProjectStatus(row.projectId, "stopped", { assignedPort: null });
    cleaned.push(row.projectId);
  }
  return cleaned;
}
