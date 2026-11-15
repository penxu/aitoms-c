import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRouteParams } from "./next16-routes.ts";
import { normalizeSource } from "./source-normalize.ts";

test("接口里的 params 类型补上 Promise", () => {
  const { content } = normalizeRouteParams(`interface RouteContext {\n  params: { id: string };\n}\nexport async function GET(req: Request, ctx: RouteContext) { return ctx.params.id; }`);
  assert.match(content, /params: Promise<\{ id: string \}>;/);
});

test("可选链取值改为 await", () => {
  const source = `export async function POST(request: Request, context: RouteContext) {
  const rawId = context?.params?.id ?? "";
}`;
  const { content } = normalizeRouteParams(source);
  assert.match(content, /const rawId = \(await context\.params\)\.id \?\? "";/);
});

test("解构写法补 await 且不重复", () => {
  const source = `export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = context.params;
}`;
  const { content } = normalizeRouteParams(source);
  assert.match(content, /const \{ id \} = await context\.params;/);
  assert.equal((content.match(/await/g) ?? []).length, 1);
});

test("已经正确的签名保持不变", () => {
  const source = `export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
}`;
  assert.equal(normalizeRouteParams(source).content, source);
});

test("searchParams 与普通组件不受影响", () => {
  const source = `const q = searchParams.id;`;
  assert.equal(normalizeRouteParams(source).content, source);
  assert.equal(normalizeSource("components/foo.tsx", source).content, source);
});

test("normalizeSource 只对 page/route/layout 做路由归一", () => {
  const route = `export async function POST(request: Request, context: RouteContext) {
  const rawId = context?.params?.id ?? "";
}`;
  assert.match(normalizeSource("app/api/x/route.ts", route).content, /await context\.params/);
  assert.equal(normalizeSource("app/items/[id]/page.tsx", route).content, route);
  assert.equal(normalizeSource("lib/service.ts", route).content, route);
});

test("普通局部params及业务接口不改", () => {
 const source = `export function GET() { const params = { id: "123" }; return params.id; }
interface Business { params: { id: string } }
const text = "params.id";`;
 assert.equal(normalizeRouteParams(source).content, source);
});
test("实际路由别名参数转换且同步服务端handler变async", () => {
 const source = `export function GET(req: Request, { params: routeParams }: { params: { id: string } }) { return routeParams.id; }`;
 const result = normalizeRouteParams(source).content;
 assert.match(result, /export async function GET/);
 assert.ok(result.includes('return (await routeParams).id'));
});
test("客户端page不插入非法await", () => {
 const source = `"use client";
export default function Page({ params }: { params: { id: string } }) { return <div>{params.id}</div>; }`;
 assert.equal(normalizeSource("app/[id]/page.tsx", source).content, source);
});

test("路由参数同名局部与嵌套同步闭包不插await", () => {
 const source = `export async function GET(req: Request, { params }: { params: Promise<{id: string}> }) {
 const callback = () => params.id;
 { const params = {id:"local"}; console.log(params.id); }
 return params.id;
}`;
 const result = normalizeRouteParams(source).content;
 assert.ok(result.includes('const callback = () => params.id'));
 assert.ok(result.includes('console.log(params.id)'));
 assert.ok(result.includes('return (await params).id'));
});

test("page文件只迁移默认页面，route文件只迁移HTTP处理器", () => {
 const handler = `export async function GET(req: Request, { params }: { params: { id: string } }) { return params.id; }`;
 const page = `export default function Page({ params }: { params: { id: string } }) { return <div>{params.id}</div>; }`;
 assert.equal(normalizeSource("app/[id]/page.tsx", handler).content, handler);
 assert.equal(normalizeSource("app/api/[id]/route.ts", page).content, page);
});

test("默认导出别名页面及明确返回类型安全迁移", () => {
 const source = `const Page = ({ params }: { params: { id: string } }): string => { return params.id; }; export default Page;`;
 const result = normalizeSource("app/[id]/page.tsx", source).content;
 assert.ok(result.includes('async ({ params }'));
 assert.ok(result.includes(': Promise<string> =>'));
 assert.ok(result.includes('(await params).id'));
});
