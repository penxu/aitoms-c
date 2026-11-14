import { NextResponse } from "next/server";
import { listFiles, readFileForEditor, writeFile } from "@/lib/workspace/files";
import { ensureProjectRoot } from "@/lib/workspace/paths";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  ensureProjectRoot(id);
  const url = new URL(req.url);
  const filePath = url.searchParams.get("path");

  try {
    if (filePath) {
      return NextResponse.json({ file: readFileForEditor(id, filePath) });
    }
    return NextResponse.json({ tree: listFiles(id, 6) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as { path?: string; content?: string };
  if (!body.path || typeof body.content !== "string") {
    return NextResponse.json({ error: "缺少 path 或 content" }, { status: 400 });
  }
  try {
    writeFile(id, body.path, body.content);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
