import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import * as nodeModule from "node:module";
const { stripTypeScriptTypes } = nodeModule as unknown as { stripTypeScriptTypes: (source: string) => string };

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const template = fs.readFileSync(new URL("../../../../templates/next-base/lib/db/index.ts", import.meta.url), "utf8");
function openTemplate(cwd: string, env: Record<string, string>) {
  const js = stripTypeScriptTypes(template).replace(/^import .*;$/gm, "").replace(/^export /gm, "").replace(/\{ DDL \};?/, "");
  const context = { Database, fs, path, process: { cwd: () => cwd, env }, globalThis: {} };
  return vm.runInNewContext(`${js}\ngetDb()`, context);
}

test("模板数据库 ATOMS_DATA_DIR 隔离且默认保留旧 data/app.db，显式 DATABASE_PATH 优先", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atoms-template-db-"));
  try {
    const legacy = openTemplate(root, {});
    legacy.exec("CREATE TABLE existing (id INTEGER); INSERT INTO existing VALUES (7)");
    legacy.close();
    const old = openTemplate(root, {});
    assert.equal(old.prepare("SELECT id FROM existing").get().id, 7);
    old.close();
    const isolatedDir = path.join(root, "production");
    const isolated = openTemplate(root, { ATOMS_DATA_DIR: isolatedDir });
    assert.equal(isolated.name, path.join(isolatedDir, "app.db"));
    assert.equal(isolated.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='existing'").get().n, 0);
    isolated.close();
    const explicitPath = path.join(root, "explicit.db");
    const explicit = openTemplate(root, { ATOMS_DATA_DIR: isolatedDir, DATABASE_PATH: explicitPath });
    assert.equal(explicit.name, explicitPath);
    explicit.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
