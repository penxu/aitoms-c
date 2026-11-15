import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'atoms-retention-')));
  const candidates = path.join(root, '.atoms/candidates'); fs.mkdirSync(candidates, { recursive: true });
  const protectedSources: string[] = [];
  const exports = {};
  const source = fs.readFileSync(new URL('./candidate-retention.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(compiled, { exports, require: (name: string) => {
    if (name === '@/lib/runner') return { getProtectedRuntimeSources: () => protectedSources };
    if (name === '@/lib/workspace/paths') return { ensureProjectRoot: () => root, resolveInsideProject: (_id: string, relative: string) => {
      const target = path.resolve(root, relative); const actual = fs.existsSync(target) ? fs.realpathSync(target) : target;
      if (actual !== root && !actual.startsWith(root + path.sep)) throw Error('路径逃逸'); return actual;
    } };
    return require(name);
  } });
  function candidate(name: string, mtime: number) {
    const dir = path.join(candidates, name); fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules/dependency'), 'fixture'); fs.utimesSync(dir, mtime, mtime);
    return `.atoms/candidates/${name}`;
  }
  return { root, candidates, protectedSources, candidate, prune: (exports as {pruneCandidates:(id:string,keep?:number,protectedRelative?:string[])=>Promise<string[]>}).pruneCandidates,
    close: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('候选保留最近三份并删除旧依赖副本，工程源码和业务数据不动', async () => {
  const f = fixture();
  try {
    for (let i = 1; i <= 6; i++) f.candidate(`run-${i}`, i);
    fs.writeFileSync(path.join(f.root, 'source.ts'), 'source'); fs.mkdirSync(path.join(f.root, 'data')); fs.writeFileSync(path.join(f.root, 'data/app.db'), 'data');
    assert.deepEqual(Array.from(await f.prune('a')).sort(), ['.atoms/candidates/run-1','.atoms/candidates/run-2','.atoms/candidates/run-3']);
    assert.equal(fs.readFileSync(path.join(f.root, 'source.ts'), 'utf8'), 'source');
    assert.equal(fs.readFileSync(path.join(f.root, 'data/app.db'), 'utf8'), 'data');
    assert.equal(fs.readdirSync(f.candidates).length, 3);
  } finally { f.close(); }
});

test('运行源、历史恢复源和显式baseline都额外保留', async () => {
  const f = fixture();
  try {
    const running = f.candidate('running', 1); const baseline = f.candidate('baseline', 2); const recovered = f.candidate('recovered', 3);
    const deleted = f.candidate('unused', 4); f.candidate('newest', 5);
    f.protectedSources.push(running, recovered);
    assert.deepEqual(Array.from(await f.prune('a', 1, [baseline])), [deleted]);
    assert.ok(fs.existsSync(path.join(f.root, running))); assert.ok(fs.existsSync(path.join(f.root, baseline))); assert.ok(fs.existsSync(path.join(f.root, recovered)));
  } finally { f.close(); }
});

test('候选根和候选目录符号链接逃逸被拒绝，外部数据不删除', async () => {
  const f = fixture(); const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'atoms-retention-outside-'));
  try {
    fs.writeFileSync(path.join(outside, 'keep'), 'safe');
    fs.symlinkSync(outside, path.join(f.candidates, 'escape'));
    await assert.rejects(f.prune('a', 0), /符号链接|逃逸/);
    assert.equal(fs.readFileSync(path.join(outside, 'keep'), 'utf8'), 'safe');
    fs.unlinkSync(path.join(f.candidates, 'escape')); fs.rmdirSync(f.candidates); fs.symlinkSync(outside, f.candidates);
    await assert.rejects(f.prune('a', 0), /符号链接|逃逸/);
  } finally { f.close(); fs.rmSync(outside, { recursive: true }); }
});

test('非法保留数量或保护路径不能触发删除', async () => {
  const f = fixture();
  try {
    f.candidate('old', 1);
    await assert.rejects(f.prune('a', -1), /保留/);
    await assert.rejects(f.prune('a', 0, ['../data']), /路径/);
    assert.ok(fs.existsSync(path.join(f.candidates, 'old')));
  } finally { f.close(); }
});
