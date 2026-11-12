import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  // 触碰一次数据库连接，让幂等 DDL 在首次请求时执行
  getDb();
  return NextResponse.json({ ok: true });
}
