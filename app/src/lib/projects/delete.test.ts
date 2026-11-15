import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import * as nodeModule from "node:module";

const { stripTypeScriptTypes } = nodeModule as unknown as { stripTypeScriptTypes: (source: string) => string };
const source = fs.readFileSync(new URL("./delete.ts", import.meta.url), "utf8");

type Fakes = {
  projectRoot?: (id: string) => string;
  project?: unknown;
  pendingRelease?: unknown;
  runs?: string[];
  threads?: string[];
  releaseProcesses?: string[];
  cancelling?: boolean;
};

function load(fakes: Fakes) {
  const js = stripTypeScriptTypes(source).replace(/^import[\s\S]*?;\n/gm, "").replace(/^export /gm, "");
  const statements: string[] = [];
  const removed: string[] = [];
  const killed: string[] = [];

  const sqlite = {
    prepare(sql: string) {
      return {
        all: () => {
          if (sql.includes("generation_runs")) return (fakes.runs ?? []).map((id) => ({ id }));
          if (sql.includes("FROM threads")) return (fakes.threads ?? []).map((id) => ({ id }));
          if (sql.includes("release_processes")) return (fakes.releaseProcesses ?? []).map((id) => ({ id }));
          return [];
        },
        get: () => fakes.pendingRelease ?? undefined,
        run: (...args: unknown[]) => {
          statements.push(`${sql} :: ${args.slice(1).join(",")}`);
          return { changes: 1 };
        },
      };
    },
    transaction: (fn: () => void) => () => fn(),
  };

  const context = {
    fs: { rmSync: (target: string) => removed.push(target) },
    path,
    console,
    config: { workspaceRoot: "/data/projects" },
    sqlite,
    getProject: () => ("project" in fakes ? fakes.project : { id: "p1" }),
    projectRoot: fakes.projectRoot ?? ((id: string) => `/data/projects/${id}`),
    deliveryRoot: "/data",
    stopService: (id: string) => killed.push(`service:${id}`),
    stopProduction: (id: string) => killed.push(`release:${id}`),
    cancelGeneration: () => fakes.cancelling ?? false,
  };

  const deleteProject = vm.runInNewContext(`${js}\ndeleteProject`, context) as (id: string) => {
    ok: boolean;
    reason?: string;
    releases?: number;
  };

  return { deleteProject, statements, removed, killed };
}

test("删除项目：停进程、清全部关联记录、删三个目录", () => {
  const { deleteProject, statements, removed, killed } = load({
    runs: ["run_1"],
    threads: ["thr_1"],
    releaseProcesses: ["rel_1"],
  });

  const result = deleteProject("p1");
  assert.equal(result.ok, true);
  assert.equal(result.releases, 1);

  assert.deepEqual(killed, ["service:p1", "release:rel_1"]);
  assert.deepEqual(removed, ["/data/projects/p1", "/data/releases/p1", "/data/runtime/p1"]);

  const deleted = statements.map((item) => item.split(" ::")[0]);
  for (const table of [
    "messages",
    "threads",
    "generation_events",
    "generation_runs",
    "release_events",
    "release_processes",
    "releases",
    "project_deployments",
    "processes",
    "projects",
  ]) {
    assert.ok(
      deleted.some((sql) => sql.includes(`DELETE FROM ${table}`)),
      `缺少 ${table} 的清理`,
    );
  }
});

test("生成进行中先拒绝删除，且不动数据", () => {
  const { deleteProject, statements, removed } = load({ cancelling: true });
  const result = deleteProject("p1");

  assert.equal(result.ok, false);
  assert.equal(result.reason, "generating");
  assert.equal(statements.length, 0);
  assert.equal(removed.length, 0);
});

test("发布进行中拒绝删除", () => {
  const { deleteProject } = load({ pendingRelease: { id: "rel_pending" } });
  const result = deleteProject("p1");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "releasing");
});

test("项目不存在时返回 not-found，也不删目录", () => {
  const { deleteProject, removed } = load({ project: null });
  const result = deleteProject("p1");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "not-found");
  assert.equal(removed.length, 0);
});

test("路径越界时拒绝 rmSync", () => {
  const { deleteProject, removed } = load({ projectRoot: () => "/etc" });
  deleteProject("p1");
  assert.equal(removed.includes("/etc"), false);
  // 仍然会清理 releases / runtime 这两个合法目录
  assert.deepEqual(removed, ["/data/releases/p1", "/data/runtime/p1"]);
});
