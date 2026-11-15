import { createServer } from "node:http";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import next from "next";
import nextEnv from "@next/env";
import {markInterruptedGenerationRows} from "./recover-generations.mjs";

/**
 * 自定义服务器：
 * 1. 让 Next.js 处理普通 HTTP 请求（含 /p/ 子路径代理 Route Handler）
 * 2. 自行代理 /p/{projectId} 的 WebSocket Upgrade（HMR 等）
 */

const dev = process.env.NODE_ENV !== "production";
// 自定义服务器不会自动读取 .env*，需显式加载（否则模型凭据等变量缺失）
nextEnv.loadEnvConfig(process.cwd(), dev);

const port = Number(process.env.PORT || 3000);
const app = next({ dev });
const handle = app.getRequestHandler();

function databasePath() {
  if (process.env.DATABASE_PATH) return path.resolve(process.env.DATABASE_PATH);
  return path.resolve(process.cwd(), "..", "data", "atoms.db");
}

let sqlite = null;
async function lookupPort(projectId) {
  if (!sqlite) {
    const { default: Database } = await import("better-sqlite3");
    const dbPath = databasePath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    sqlite = new Database(dbPath, { readonly: false });
  }
  const row = sqlite
    .prepare("SELECT port, status FROM processes WHERE project_id = ?")
    .get(projectId);
  if (!row || row.status !== "running") return null;
  return row.port;
}

/** 启动时把上次进程遗留的 running 生成任务标记为 interrupted */
async function markInterruptedGenerations() {
  const dbPath = databasePath();
  if (!fs.existsSync(dbPath)) return;
  let db = null;
  try {
    const { default: Database } = await import("better-sqlite3");
    db = new Database(dbPath, { readonly: false });
    const changed = markInterruptedGenerationRows(db);
    if (changed > 0) console.log(`> 已恢复 ${changed} 个失去工作进程的生成任务`);
  } catch (error) {
    console.warn("> 启动清理生成任务失败：", error.message);
  } finally {
    if (db) db.close();
  }
}

async function main() {
  await markInterruptedGenerations();
  await app.prepare();

  const upgradeHandler = app.getUpgradeHandler();
  const server = createServer((req, res) => {
    handle(req, res);
  });

  server.on("upgrade", async (req, socket, head) => {
    const match = /^\/p\/([A-Za-z0-9_-]+)(\/.*)?$/.exec(req.url || "");
    if (!match) {
      // 交给 Next.js 自己的 HMR WebSocket
      upgradeHandler(req, socket, head);
      return;
    }

    const projectId = match[1];
    // 项目注入了 basePath，HMR 等 WebSocket 路径需原样透传前缀
    const rest = req.url || `/p/${projectId}/`;

    let targetPort = null;
    try {
      targetPort = await lookupPort(projectId);
    } catch {
      targetPort = null;
    }

    if (!targetPort) {
      socket.destroy();
      return;
    }

    const upstream = net.connect(targetPort, "127.0.0.1", () => {
      const headers = { ...req.headers };
      headers.host = `127.0.0.1:${targetPort}`;

      const headerLines = Object.entries(headers)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
        .join("\r\n");

      upstream.write(`${req.method} ${rest} HTTP/1.1\r\n${headerLines}\r\n\r\n`);
      if (head && head.length) upstream.write(head);

      upstream.pipe(socket);
      socket.pipe(upstream);
    });

    const destroy = () => {
      upstream.destroy();
      socket.destroy();
    };
    upstream.on("error", destroy);
    socket.on("error", destroy);
    socket.on("close", () => upstream.destroy());
    upstream.on("close", () => socket.destroy());
  });

  server.listen(port, () => {
    console.log(`> Atoms 平台已启动：http://localhost:${port} (${dev ? "dev" : "production"})`);
  });
}

main().catch((error) => {
  console.error("> 平台启动失败：", error);
  process.exit(1);
});
