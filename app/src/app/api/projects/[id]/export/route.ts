import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";
import { NextResponse } from "next/server";
import { getProject } from "@/lib/db/queries";
import { projectRoot } from "@/lib/workspace/paths";

export const runtime = "nodejs";

/** 导出时整体跳过的目录（体积大且可再生成） */
const SKIP_DIRS = new Set(["node_modules", ".next"]);

function addDirectory(archive: archiver.Archiver, dir: string, prefix: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      addDirectory(archive, abs, name);
    } else if (entry.isFile()) {
      archive.file(abs, { name });
    }
    // 符号链接与特殊文件跳过，避免把项目外内容打进包里
  }
}

/** 导出项目 zip：包含 .git 与 .atoms/，排除 node_modules / .next */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }

  const root = projectRoot(id);
  if (!fs.existsSync(root)) {
    return NextResponse.json({ error: "项目目录不存在" }, { status: 404 });
  }

  const archive = archiver("zip", { zlib: { level: 6 } });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      archive.on("data", (chunk: Buffer) => controller.enqueue(chunk));
      archive.on("end", () => {
        try {
          controller.close();
        } catch {
          /* 已关闭 */
        }
      });
      archive.on("error", (error) => controller.error(error));

      addDirectory(archive, root, "");
      void archive.finalize();
    },
    cancel() {
      archive.abort();
    },
  });

  const filename = encodeURIComponent(`${project.name || id}.zip`);
  return new Response(stream, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename*=UTF-8''${filename}`,
      "cache-control": "no-store",
    },
  });
}
