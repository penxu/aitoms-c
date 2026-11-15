import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { downloadProject } from "./download-project.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("download displays a server rejection instead of saving its JSON as a ZIP", async () => {
  globalThis.fetch = async () => Response.json({ error: "该版本尚未发布" }, { status: 409 });
  await assert.rejects(downloadProject("project-one", "deploy", "release-one"), /该版本尚未发布/);
});

test("download reports an unreadable server error using the HTTP status", async () => {
  globalThis.fetch = async () => new Response("upstream unavailable", { status: 503 });
  await assert.rejects(downloadProject("project-one", "source"), /503/);
});

test("download refuses an empty successful response", async () => {
  globalThis.fetch = async () => new Response(new Blob([]));
  await assert.rejects(downloadProject("project-one", "source"), /下载内容为空/);
});

test("deploy download targets the selected immutable release and waits for the full body", async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const originalTimeout = globalThis.setTimeout;
  let clicked = false;
  let removed = false;
  let appended = false;
  let savedSize = 0;
  const anchor = { href: "", download: "", click: () => { clicked = true; }, remove: () => { removed = true; } };
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "/api/projects/project-one/export?kind=deploy&releaseId=release-one");
    return new Response(new Blob(["complete-archive"]));
  };
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => anchor, body: { append: () => { appended = true; } } } });
  URL.createObjectURL = (blob) => { savedSize = (blob as Blob).size; return "blob:test-archive"; };
  URL.revokeObjectURL = (url) => assert.equal(url, "blob:test-archive");
  globalThis.setTimeout = ((callback: () => void) => { callback(); return 1; }) as unknown as typeof setTimeout;
  try {
    await downloadProject("project-one", "deploy", "release-one");
    assert.ok(clicked && removed && appended);
    assert.equal(savedSize, 16);
    assert.equal(anchor.download, "project-one-deploy-release-one.zip");
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    globalThis.setTimeout = originalTimeout;
  }
});
