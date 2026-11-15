import test from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeGate } from '../workspace/runtime-gate.ts';
import { sameProcess, readProcessIdentity } from '../workspace/process-identity.ts';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';

test('同项目并发启动共享任务，停止取消尚未分配完端口的启动', async () => {
  const gate = new RuntimeGate(); let count = 0;
  let resume!: () => void;
  const pending = new Promise<void>(resolve => { resume = resolve; });
  const start = () => gate.start('a', async signal => { count++; await pending; signal.throwIfAborted(); return 4000; });
  const first = start(); const second = start();
  await Promise.resolve(); gate.cancel('a'); resume();
  await assert.rejects(first, /停止/); await assert.rejects(second, /停止/);
  assert.equal(count, 1);
  assert.equal(await gate.start('a', async () => 4001), 4001);
});

test('重启与普通启动互斥，取消失败任务不会污染下次启动', async () => {
  const gate = new RuntimeGate(); const trace: string[] = [];
  let resume!: () => void;
  const pending = new Promise<void>(resolve => { resume = resolve; });
  const first = gate.start('a', async signal => { trace.push('old'); await pending; signal.throwIfAborted(); return 1; });
  const restart = gate.restart('a', () => { trace.push('stop'); }, async () => { trace.push('new'); return 2; });
  resume(); await assert.rejects(first); assert.equal(await restart, 2);
  assert.deepEqual(trace, ['old', 'stop', 'new']);
});

test('PID相同但启动标识或cwd变化时不属于原进程', () => {
  const identity = { pid: 10, startToken: 'boot:100', cwd: '/tmp/a', startedAt: 1000 };
  assert.equal(sameProcess(identity, { ...identity }), true);
  assert.equal(sameProcess(identity, { ...identity, startToken: 'boot:101' }), false);
  assert.equal(sameProcess(identity, { ...identity, cwd: '/tmp/b' }), false);
});

test('真实fixture进程可读取启动身份和工作目录', async () => {
  const root = fs.mkdtempSync(`${os.tmpdir()}/atoms-runtime-`);
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { cwd: root });
  try {
    await once(child, 'spawn'); const identity = readProcessIdentity(child.pid!);
    assert.ok(identity); assert.equal(identity.cwd, fs.realpathSync(root));
    assert.ok(identity.startToken); assert.ok(identity.startedAt > Date.now() - 10_000);
  } finally { child.kill(); await once(child, 'exit'); fs.rmSync(root, { recursive: true }); }
});

import Database from 'better-sqlite3';
import { RuntimeIdentities } from '../workspace/runtime-identities.ts';
test('重启平台后从SQLite恢复身份，PID复用时拒绝恢复和发送停止信号', () => {
  const db = new Database(':memory:');
  try {
    const identity = { pid: 10, startToken: 'boot:100', cwd: '/tmp/a', startedAt: 1000 };
    new RuntimeIdentities(db).save('a', identity);
    const recovered = new RuntimeIdentities(db);
    assert.deepEqual(recovered.recover('a', 10, '/tmp/a', 1000, () => identity), identity);
    assert.equal(recovered.recover('a', 10, '/tmp/a', 1000, () => ({ ...identity, startToken: 'boot:101' })), null);
    assert.equal(recovered.recover('old', 10, '/tmp/a', 10000, () => identity), null);
    assert.deepEqual(recovered.recover('old', 10, '/tmp/a', 1000, () => identity), identity);
  } finally { db.close(); }
});

test('显式切换源码时取消旧启动，不复用旧源码的待完成任务', async () => {
  const gate = new RuntimeGate(); let resume!: () => void;
  const first = gate.start('a', async signal => { await new Promise<void>(resolve => { resume = resolve; }); signal.throwIfAborted(); return 'old'; }, 'old');
  const second = gate.start('a', async () => 'new', 'new');
  resume(); await assert.rejects(first); assert.equal(await second, 'new');
});
