import { getRuntimePort } from "@/lib/runner";
import { getProject } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 子路径代理：/p/{projectId}/** → http://127.0.0.1:{port}/p/{projectId}/**
 * 项目运行时注入了 ATOMS_BASE_PATH=/p/{projectId}，因此前缀需原样透传，
 * 由项目自己的 basePath 负责路由与资源前缀。
 * 生产环境由外层 Nginx 再把 /p/ 转发到这里（见 deploy/nginx.conf）。
 */

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "accept-encoding",
]);

function notRunningPage(projectId: string): Response {
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>服务未运行</title>
<style>body{font-family:ui-sans-serif,system-ui,-apple-system,"PingFang SC",sans-serif;background:#f8f8f6;color:#0c0c0c;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{max-width:440px;padding:40px;background:#fff;border:1px solid rgba(12,12,12,.08);border-radius:20px;text-align:center;box-shadow:0 20px 44px rgba(12,12,12,.06)}
h1{font-size:20px;margin:0 0 12px}p{color:rgba(12,12,12,.64);font-size:14px;line-height:1.6;margin:0}
code{background:rgba(12,12,12,.06);padding:2px 6px;border-radius:6px;font-size:12px}</style></head>
<body><div class="card"><h1>项目服务未运行</h1>
<p>项目 <code>${projectId}</code> 当前没有运行中的服务。<br>请在对话中让 AI 启动服务，或在工作台点击「运行」。</p></div></body></html>`;
  return new Response(html, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function proxy(
  req: Request,
  ctx: { params: Promise<{ projectId: string; path?: string[] }> },
) {
  const { projectId, path } = await ctx.params;

  const project = getProject(projectId);
  if (!project) {
    return new Response("项目不存在", { status: 404 });
  }

  const port = getRuntimePort(projectId);
  if (!port) return notRunningPage(projectId);

  const url = new URL(req.url);
  // 根路径不带结尾斜杠：Next 的 basePath 根正是 /p/{id}，带斜杠会被 308 重定向
  const suffix = path && path.length > 0 ? `/${path.join("/")}` : "";
  const target = `http://127.0.0.1:${port}/p/${projectId}${suffix}${url.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
    cache: "no-store",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return notRunningPage(projectId);
  }

  const resHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    if (key.toLowerCase() === "location") {
      // 后端返回的路径本身已含 basePath（/p/{id}），只需去掉内部主机的绝对地址
      resHeaders.set("location", value.replace(`http://127.0.0.1:${port}`, ""));
      return;
    }
    resHeaders.set(key, value);
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
