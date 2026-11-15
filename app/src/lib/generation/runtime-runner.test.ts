import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import ts from 'typescript';
import Database from 'better-sqlite3';
import { RuntimeGate } from '../workspace/runtime-gate.ts';
import { RuntimeIdentities } from '../workspace/runtime-identities.ts';
import { sameProcess, type ProcessIdentity } from '../workspace/process-identity.ts';
import { findAvailablePort } from '../workspace/ports.ts';

const require = createRequire(import.meta.url);
function fixture(options: { nextBuild?:boolean; containerAlive?:boolean; fail?: boolean; allocate?: () => Promise<number>; ready?: () => Promise<void> } = {}) {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE release_processes(port INTEGER,status TEXT)');
  const identities = new Map<number, ProcessIdentity>();
  const children = new Map<number, EventEmitter>();
  const rows = new Map<string, { pid: number | null; port: number; status: string; startedAt: Date }>();
  const signals: number[] = []; let spawns = 0; let cleanups = 0; let runtimeEnv: Record<string,string> = {};
  const context = { exports: {}, globalThis: {}, setTimeout, Promise, process: { kill(pid: number) {
    signals.push(pid); const actual = Math.abs(pid); identities.delete(actual); queueMicrotask(() => children.get(actual)?.emit('exit', 0));
  } } };
  const imports: Record<string, unknown> = {
    './workspace/runtime-start': { waitForPreviewStart: async (_url: string, failure: () => string | null) => {
      if (options.ready) await options.ready(); if (options.fail) throw Error('startup failed');
      const error = failure(); if (error) throw Error(error);
    } },
    'node:child_process': { spawn: (_command: string, _args: string[], options: { cwd: string }) => {
      spawns++; const child = Object.assign(new EventEmitter(), { pid: 100 + spawns, stdout: new EventEmitter(), stderr: new EventEmitter(), exitCode: null, signalCode: null, kill: () => true });
      identities.set(child.pid, { pid: child.pid, startToken: `token-${spawns}`, startedAt: Date.now(), cwd: options.cwd });
      children.set(child.pid, child); return child;
    } },
    'node:fs': { ...fs, realpathSync: (p: string) => p, existsSync: () => true, statSync: () => ({ isDirectory: () => true }), readFileSync: () => options.nextBuild ? '{"dependencies":{"next":"16"},"scripts":{"dev":"next dev","start":"next start"}}' : '{"dependencies":{"vite":"1"},"scripts":{"dev":"vite"}}' },
    'node:net': { createServer: () => {
      const server = new EventEmitter(); return Object.assign(server, { listen: () => queueMicrotask(() => server.emit('listening')), close: (done: () => void) => done() });
    } },
    '@/lib/config': { config: { portRangeMin: 4000, portRangeMax: 4005 } },
    '@/lib/db': { sqlite: db },
    './workspace/package-manager': { scriptArguments: (_pm:string,script:string,args:string[]) => ['run', script,...args] },
    './workspace/toolchain': { pnpmShellCommand: () => 'pnpm' },
    './workspace/ports': { findAvailablePort: options.allocate ?? findAvailablePort },
    '@/lib/workspace/paths': { ensureProjectRoot: () => '/tmp/project', resolveInsideProject: (_id: string, relative: string) => path.resolve('/tmp/project', relative) },
    './workspace/runtime-gate': { RuntimeGate }, './workspace/runtime-identities': { RuntimeIdentities },
    './workspace/process-identity': { sameProcess, readProcessIdentity: (pid: number) => identities.get(pid) ?? null },
    './workspace/execution': { isWorkspaceExecutionRunning:()=>options.containerAlive??false, ensureWorkspaceRuntime: async () => {}, createWorkspaceExecution: (_root: string, command: string, env: Record<string,string>) => { runtimeEnv = env; return { command, args: [], env, cleanupId: '/tmp/project/.atoms/runtime/containers/fixture.cid', cleanup: () => { cleanups++; } }; }, cleanupWorkspaceExecution: () => { cleanups++; } },
    '@/lib/db/queries': {
      getProcessByProject: (id: string) => rows.get(id), listRunningProcesses: () => [...rows].filter(([, p]) => p.status === 'running').map(([projectId, p]) => ({ ...p, projectId })),
      updateProcessStatus: (id: string, status: string, opts: { clearPid?: boolean }) => { const row = rows.get(id); if (row) { row.status = status; if (opts?.clearPid) row.pid = null; } },
      updateProjectStatus: () => undefined,
      upsertProcess: (row: { projectId: string; pid: number; port: number }) => rows.set(row.projectId, { ...row, status: 'running', startedAt: new Date() }),
    },
  };
  const source = fs.readFileSync(new URL('../runner.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(compiled, { ...context, require: (name: string) => imports[name] ?? require(name) });
  const api = context.exports as {
    startService: (id: string, options?: { sourceDir: string }) => Promise<{ port: number; pid: number }>;
    restartService: (id: string, options: { sourceDir: string; validate?: (result: { port: number; pid: number }) => Promise<void> }) => Promise<{ port: number; pid: number }>;
    getRuntimePort: (id:string)=>number|null;
    getProtectedRuntimeSources: (id: string) => string[];
    pinServiceToSnapshot: (id: string, createSnapshot: () => Promise<{relativeRoot:string}>) => Promise<unknown>;
    stopService: (id: string) => unknown; cleanupOrphans: () => string[];
  };
  return { api, db, rows, identities, signals, context, children, spawns: () => spawns, cleanups: () => cleanups, runtimeEnv: () => runtimeEnv };
}

test('runner并发start仅创建一个进程，启动失败释放预约端口并清理状态', async () => {
  const f = fixture();
  try {
    const [a, b] = await Promise.all([f.api.startService('a'), f.api.startService('a')]);
    assert.equal(a.pid, b.pid); assert.equal(f.spawns(), 1);
    f.api.stopService('a'); assert.deepEqual(f.signals, [-a.pid]);
  } finally { f.db.close(); }
  const failed = fixture({ fail: true });
  try {
    await assert.rejects(failed.api.startService('a'), /startup failed/);
    assert.equal(failed.rows.get('a')?.status, 'stopped');
    assert.equal((failed.context.globalThis as { __atomsPortReservations: Set<number> }).__atomsPortReservations.size, 0);
    assert.equal(failed.identities.size, 0);
  } finally { failed.db.close(); }
});

test('停止尚在分配端口的runner不能随后启动游离进程', async () => {
  let allocate!: (port: number) => void;
  let allocated!:()=>void;
  const allocationStarted=new Promise<void>(resolve=>{allocated=resolve;});
  const f = fixture({ allocate: () => new Promise<number>(resolve => { allocate = resolve;allocated(); }) });
  try {
    const started = f.api.startService('a');
    await allocationStarted;
    f.api.stopService('a'); allocate(4000);
    await assert.rejects(started, /停止/); assert.equal(f.spawns(), 0);
    assert.equal((f.context.globalThis as { __atomsPortReservations: Set<number> }).__atomsPortReservations.size, 0);
  } finally { f.db.close(); }
});

test('平台Map丢失后可恢复并停止SQLite中的进程；PID复用不发信号', async () => {
  const f = fixture();
  try {
    const started = await f.api.startService('a');
    const global = f.context.globalThis as { __atomsRuntimes: Map<string, unknown> };
    global.__atomsRuntimes.clear(); assert.deepEqual(Array.from(f.api.cleanupOrphans()), []);
    f.api.stopService('a'); assert.deepEqual(f.signals, [-started.pid]);
    const second = await f.api.startService('a'); global.__atomsRuntimes.clear();
    f.identities.set(second.pid, { ...f.identities.get(second.pid)!, startToken: 'reused' });
    f.api.stopService('a'); assert.deepEqual(f.signals, [-started.pid]);
  } finally { f.db.close(); }
});


test('候选预览共享工程业务数据，stop与重启恢复清理执行容器', async () => {
  const f = fixture();
  try {
    await f.api.startService('a', { sourceDir: '.atoms/candidates/ready' });
    assert.equal(f.runtimeEnv().ATOMS_DATA_DIR, '/tmp/project/data');
    f.api.stopService('a'); assert.equal(f.cleanups(), 1);
    await f.api.startService('a');
    const global = f.context.globalThis as { __atomsRuntimes: Map<string, unknown> };
    global.__atomsRuntimes.clear(); f.api.stopService('a');
    assert.equal(f.cleanups(), 2);
  } finally { f.db.close(); }
});

test('启动失败也清理执行容器', async () => {
  const f = fixture({ fail: true });
  try { await assert.rejects(f.api.startService('a')); assert.equal(f.cleanups(), 1); }
  finally { f.db.close(); }
});


test('Docker CLI已退出的记录在平台恢复时仍清理容器，不向复用PID发信号', async () => {
  const f = fixture();
  try {
    const service = await f.api.startService('a');
    (f.context.globalThis as { __atomsRuntimes: Map<string, unknown> }).__atomsRuntimes.clear();
    f.identities.delete(service.pid);
    assert.deepEqual(Array.from(f.api.cleanupOrphans()), ['a']);
    assert.equal(f.cleanups(), 1); assert.deepEqual(f.signals, []);
  } finally { f.db.close(); }
});

test('运行进程退出和启动期间取消均清理容器', async () => {
  const f = fixture();
  try {
    const service = await f.api.startService('a');
    f.children.get(service.pid)!.emit('exit', 1);
    assert.equal(f.cleanups(), 1);
  } finally { f.db.close(); }
  let ready!: () => void;
  const paused = fixture({ ready: () => new Promise<void>(resolve => { ready = resolve; }) });
  try {
    const start = paused.api.startService('a');
    for (let i = 0; i < 20 && !ready; i++) await Promise.resolve();
    paused.api.stopService('a'); ready();
    await assert.rejects(start); assert.equal(paused.cleanups(), 1);
  } finally { paused.db.close(); }
});


test('候选健康验收失败自动恢复上一运行源码，错误仍返回调用者', async () => {
  const f = fixture();
  try {
    await f.api.startService('a', { sourceDir: '.atoms/candidates/stable' });
    await assert.rejects(f.api.restartService('a', { sourceDir: '.atoms/candidates/broken', validate: async () => { throw Error('candidate rejected'); } }), /candidate rejected/);
    const row = f.rows.get('a')!;
    assert.equal(row.status, 'running');
    assert.equal(f.identities.get(row.pid!)?.cwd, '/tmp/project/.atoms/candidates/stable');
    assert.equal(f.spawns(), 3); assert.equal(f.cleanups(), 2);
  } finally { f.db.close(); }
});

test('BUILD前仅将根目录预览固定一次，复制失败保持原预览', async () => {
  const f = fixture(); let snapshots = 0;
  try {
    await f.api.startService('a');
    await assert.rejects(f.api.pinServiceToSnapshot('a', async () => { throw Error('copy failed'); }), /copy failed/);
    assert.equal(f.identities.get(f.rows.get('a')!.pid!)?.cwd, '/tmp/project');
    assert.equal(f.cleanups(), 0);
    const snapshot = async () => { snapshots++; return { relativeRoot: '.atoms/candidates/baseline' }; };
    await f.api.pinServiceToSnapshot('a', snapshot);
    await f.api.pinServiceToSnapshot('a', snapshot);
    assert.equal(snapshots, 1);
    assert.equal(f.identities.get(f.rows.get('a')!.pid!)?.cwd, '/tmp/project/.atoms/candidates/baseline');
  } finally { f.db.close(); }
});


test('候选验收期间用户停止时不自动恢复旧服务', async () => {
  const f = fixture(); let release!: () => void;
  try {
    await f.api.startService('a', { sourceDir: '.atoms/candidates/stable' });
    const switching = f.api.restartService('a', { sourceDir: '.atoms/candidates/new', validate: async () => { await new Promise<void>(resolve => { release = resolve; }); } });
    for (let i = 0; i < 100 && !release; i++) await Promise.resolve();
    assert.ok(release); f.api.stopService('a'); release();
    await assert.rejects(switching, /停止/);
    assert.equal(f.rows.get('a')?.status, 'stopped'); assert.equal(f.spawns(), 2);
  } finally { f.db.close(); }
});


test('候选清理保护切换窗口的旧回滚源和新运行源', async () => {
  const f = fixture(); let release!: () => void;
  try {
    await f.api.startService('a', { sourceDir: '.atoms/candidates/stable' });
    const switching = f.api.restartService('a', { sourceDir: '.atoms/candidates/new', validate: async () => { await new Promise<void>(resolve => { release = resolve; }); } });
    for (let i = 0; i < 100 && !release; i++) await Promise.resolve();
    const protectedSources = Array.from(f.api.getProtectedRuntimeSources('a'));
    assert.ok(protectedSources.includes('.atoms/candidates/stable'));
    assert.ok(protectedSources.includes('.atoms/candidates/new'));
    release(); await switching;
    assert.deepEqual(Array.from(f.api.getProtectedRuntimeSources('a')), ['.atoms/candidates/new']);
    f.api.stopService('a');
    assert.deepEqual(Array.from(f.api.getProtectedRuntimeSources('a')), ['.atoms/candidates/new']);
  } finally { f.db.close(); }
});

test('Docker CLI退出后恢复仍存活容器，停止按容器身份清理且不误杀PID',async()=>{
 const f=fixture({containerAlive:true});try{const service=await f.api.startService('a');(f.context.globalThis as {__atomsRuntimes:Map<string,unknown>}).__atomsRuntimes.clear();f.identities.delete(service.pid);assert.equal(f.api.getRuntimePort('a'),service.port);assert.deepEqual(Array.from(f.api.cleanupOrphans()),[]);f.api.stopService('a');assert.equal(f.cleanups(),1);assert.deepEqual(f.signals,[]);}finally{f.db.close();}
});

test('已构建Next候选启动生产产物，避免dev/HMR与实际验收行为不同',async()=>{const f=fixture({nextBuild:true});try{const service=await f.api.startService('a');assert.match((service as unknown as {command:string}).command,/run start/);assert.equal(f.runtimeEnv().NODE_ENV,'production');f.api.stopService('a');}finally{f.db.close();}});
