import { tool } from "ai";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { runCommand } from "@/lib/workspace/command";
import {
  deleteFile,
  editFile,
  listFiles,
  readFile,
  searchFiles,
  writeFile,
} from "@/lib/workspace/files";
import { ensureProjectRoot } from "@/lib/workspace/paths";
import { restartService, startService, stopService } from "@/lib/runner";

/**
 * Harness Agent 工具集：AI 在项目目录内拥有完整读写与执行能力。
 * 所有工具通过 createHarnessTools(projectId) 绑定到单一项目。
 */

const STATIC_TEMPLATE: Record<string, string> = {
  "index.html": `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>我的应用</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main class="container">
    <h1>你好，世界</h1>
    <p>这是由 Atoms AI 生成的页面。</p>
  </main>
</body>
</html>
`,
  "style.css": `*{margin:0;padding:0;box-sizing:border-box}
body{font-family:ui-sans-serif,system-ui,-apple-system,"PingFang SC",sans-serif;background:#f8f8f6;color:#0c0c0c;line-height:1.6}
.container{max-width:720px;margin:15vh auto;padding:0 24px}
h1{font-size:40px;letter-spacing:-.02em}
p{margin-top:14px;color:rgba(12,12,12,.64)}
`,
};

const VITE_TEMPLATE: Record<string, string> = {
  "package.json": JSON.stringify(
    {
      name: "vite-app",
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
      dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
      devDependencies: {
        "@vitejs/plugin-react": "^4.3.4",
        vite: "^6.0.0",
      },
    },
    null,
    2,
  ),
  "index.html": `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite 应用</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
  "src/main.jsx": `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(<App />);
`,
  "src/App.jsx": `export default function App() {
  return (
    <main style={{ padding: 48, fontFamily: "system-ui" }}>
      <h1>Vite + React</h1>
      <p>由 Atoms AI 生成。</p>
    </main>
  );
}
`,
  "src/index.css": `body{margin:0;background:#f8f8f6;color:#0c0c0c}
`,
  "vite.config.js": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()] });
`,
};

export function createHarnessTools(projectId: string) {
  return {
    init_project: tool({
      description:
        "在项目目录中初始化脚手架。template 可选：static（纯静态 HTML）、vite（Vite + React）。如果目录已有文件会跳过。",
      inputSchema: z.object({
        template: z.enum(["static", "vite"]).describe("脚手架类型"),
      }),
      execute: async ({ template }) => {
        const root = ensureProjectRoot(projectId);
        const files = template === "static" ? STATIC_TEMPLATE : VITE_TEMPLATE;
        const created: string[] = [];
        for (const [rel, content] of Object.entries(files)) {
          const abs = path.join(root, rel);
          if (fs.existsSync(abs)) continue;
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, content, "utf8");
          created.push(rel);
        }
        return {
          template,
          created,
          message:
            created.length > 0
              ? `已初始化 ${template} 脚手架，创建 ${created.length} 个文件`
              : "目录已有文件，未做改动",
        };
      },
    }),

    read_file: tool({
      description: "读取项目内某个文件的完整内容（过大时自动截断）。",
      inputSchema: z.object({
        path: z.string().describe("相对项目根目录的文件路径"),
      }),
      execute: async ({ path: p }) => ({ path: p, content: readFile(projectId, p) }),
    }),

    write_file: tool({
      description:
        "写入（覆盖）项目内文件，父目录不存在会自动创建。适合新建文件或整体重写。",
      inputSchema: z.object({
        path: z.string().describe("相对项目根目录的文件路径"),
        content: z.string().describe("完整文件内容"),
      }),
      execute: async ({ path: p, content }) => {
        writeFile(projectId, p, content);
        return { path: p, bytes: Buffer.byteLength(content), message: `已写入 ${p}` };
      },
    }),

    edit_file: tool({
      description:
        "对已有文件做精确字符串替换。oldString 必须在文件中唯一匹配（或设置 replaceAll）。",
      inputSchema: z.object({
        path: z.string().describe("相对项目根目录的文件路径"),
        oldString: z.string().describe("要被替换的原文片段"),
        newString: z.string().describe("替换后的内容"),
        replaceAll: z.boolean().optional().describe("是否替换全部匹配"),
      }),
      execute: async ({ path: p, oldString, newString, replaceAll }) => ({
        message: editFile(projectId, p, oldString, newString, replaceAll ?? false),
      }),
    }),

    list_files: tool({
      description: "以树形列出项目文件结构（自动忽略 node_modules 等目录）。",
      inputSchema: z.object({
        maxDepth: z.number().optional().describe("最大递归深度，默认 4"),
      }),
      execute: async ({ maxDepth }) => ({ tree: listFiles(projectId, maxDepth ?? 4) }),
    }),

    search_files: tool({
      description: "按 glob 模式搜索文件；提供 contentQuery 时同时做内容匹配。",
      inputSchema: z.object({
        pattern: z.string().describe("glob 模式，例如 **/*.tsx"),
        contentQuery: z.string().optional().describe("需要包含的文本片段"),
      }),
      execute: async ({ pattern, contentQuery }) => ({
        results: searchFiles(projectId, pattern, contentQuery),
      }),
    }),

    delete_file: tool({
      description: "删除项目内的文件或目录。",
      inputSchema: z.object({
        path: z.string().describe("相对项目根目录的路径"),
      }),
      execute: async ({ path: p }) => ({ message: deleteFile(projectId, p) }),
    }),

    run_command: tool({
      description:
        "在项目目录内执行 bash 命令（如 npm install、npm run build）。危险命令会被拒绝，超时会强制终止。",
      inputSchema: z.object({
        command: z.string().describe("要执行的命令"),
        timeoutMs: z.number().optional().describe("超时时间（毫秒）"),
      }),
      execute: async ({ command, timeoutMs }) => {
        const result = await runCommand(projectId, command, { timeoutMs });
        return result;
      },
    }),

    install_deps: tool({
      description: "安装项目依赖（自动在 npm / pnpm 之间选择可用的包管理器）。",
      inputSchema: z.object({
        packages: z.array(z.string()).optional().describe("要安装的包，留空则安装全部依赖"),
      }),
      execute: async ({ packages }) => {
        const cmd =
          packages && packages.length > 0
            ? `npm install ${packages.join(" ")}`
            : "npm install";
        const result = await runCommand(projectId, cmd, { timeoutMs: 300_000 });
        return { command: cmd, ...result };
      },
    }),

    start_service: tool({
      description:
        "在服务器上启动该项目的服务并分配端口，之后用户可通过 /p/{projectId}/ 访问。",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await startService(projectId);
        return {
          ...result,
          previewUrl: `/p/${projectId}/`,
          message: `服务已启动在端口 ${result.port}`,
        };
      },
    }),

    stop_service: tool({
      description: "停止该项目的运行服务并释放端口。",
      inputSchema: z.object({}),
      execute: async () => stopService(projectId),
    }),

    restart_service: tool({
      description: "重启该项目的运行服务（代码修改后可调用）。",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await restartService(projectId);
        return { ...result, previewUrl: `/p/${projectId}/` };
      },
    }),
  };
}

export const HARNESS_SYSTEM_PROMPT = `你是一个全栈 AI 工程师，运行在 Atoms 云平台上。

## 你的能力
你在服务器上拥有一个专属项目目录，并配备了完整工具集：
- 文件：read_file / write_file / edit_file / list_files / search_files / delete_file
- 执行：run_command / install_deps
- 项目：init_project（static 或 vite 脚手架）
- 运行时：start_service / stop_service / restart_service

## 工作规范
1. 先读后写：修改文件前先用 read_file 了解现状，不要凭猜测写代码。
2. 小步修改：优先用 edit_file 做精确替换，避免整文件重写丢失内容。
3. 空目录时：先调用 init_project 生成脚手架，再逐步写入业务代码。
4. 写完后验证：需要依赖时调用 install_deps，然后 start_service，并告知用户预览地址。
5. 每次根目录结构变化后，简要告知用户当前文件结构。
6. 所有路径都使用相对项目根目录的路径，禁止引用项目外路径。
7. 若工具报错，分析错误并修正后重试，不要重复完全相同的调用。
8. 首次构建由平台流水线完成；后续修改前先读 .atoms/SPEC.md 与 .atoms/PLAN.json，遵循其中的页面、数据模型与文件分层。
9. 不得删除模板约定文件（app/layout.tsx、app/api/health/route.ts、lib/db/index.ts、.atoms/CONVENTIONS.md）；页面跳转用 next/link，禁止手写绝对地址或完整域名。

## 输出风格
- 用简体中文回答，简洁专业。
- 说明"做了什么"和"预览在哪里"，不要粘贴大段代码（用户可在文件树中查看）。
- 完成后给出一句下一步建议。`;
