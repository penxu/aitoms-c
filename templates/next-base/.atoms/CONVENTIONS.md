# 工程分层约定

本工程由 Atoms 生成，后续人工与 AI 修改都必须遵守以下四条约定。

## 1. 目录分层

- `app/`：路由与页面（Next.js App Router），只负责页面组装与数据获取入口
- `components/ui/`：基础 UI 组件（button / card / input 等），不含业务逻辑
- `components/<feature>/`：业务组件，按功能域分目录
- `lib/`：纯逻辑与数据访问，不依赖 React

## 2. 链接与跳转

所有跳转使用 `next/link` 与 `useRouter`，**禁止手写以 `/` 开头的绝对地址**。应用部署在子路径（`/p/{projectId}`）下，硬编码绝对地址会导致跳转失效。

## 3. 数据访问

数据访问只经 `lib/db`。新增表时：

1. 在 `lib/db/index.ts` 的 `DDL` 数组追加幂等建表语句（`CREATE TABLE IF NOT EXISTS ...`），**保留原有的 `getDb()` 导出与 DDL 数组结构，不要整体重写该文件**
2. 在 `lib/db/schema.ts` 的 `TABLES` 中登记表名

禁止使用 `drizzle-orm`、`prisma`、`drizzle-kit` 或任何迁移工具；数据访问一律通过 `getDb().prepare(...)`。

## 4. 依赖白名单

只能使用 `package.json` 中已声明的依赖（next、react、better-sqlite3、clsx、tailwind-merge、class-variance-authority）。禁止引入任何未安装的第三方包，也不得修改 `package.json`。

## 5. 探活接口

`app/api/health/route.ts` 必须保持返回 `{ "ok": true }`，不得删除或改写。

## 6. 客户端组件

组件默认是服务端组件；**仅在有交互（事件、状态、副作用）时才添加 `"use client"`**。

## 7. UI 组件属性白名单

`components/ui/` 只用模板提供的实现，属性写错会直接 `tsc --noEmit` 失败。可用的只有下面这些，**不要按 shadcn 的习惯臆造**：

| 组件 | 可用属性 | 不存在的值 |
|---|---|---|
| `Button` | `variant`: `default` \| `outline` \| `ghost`；`size`: `sm` \| `md` \| `lg` | `secondary`、`destructive`、`link`、`icon`、`xs`、`xl` |
| `Card` / `CardHeader` / `CardTitle` / `CardContent` | 仅原生元素属性 + `className` | `variant`、`size` |
| `Input` | 仅原生 `input` 属性 + `className` | `variant`、`size` |

对照关系：需要次要按钮用 `variant="outline"`，需要文字按钮用 `variant="ghost"`。要改样式用 `className`，不要新增变体。

导入写法同样固定：**命名导入 + 全小写文件名**。

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
```

禁止 `import Button from "@/components/ui/Button"`：模板没有默认导出，且大小写不一致在 macOS 上会触发 TS1149。

## 8. 动态路由签名（Next 16）

`params` 是 `Promise`，**必须 await**，否则会触发 `.next/types/validator.ts` 的 TS2344：

```ts
// app/api/items/[id]/route.ts
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
}

// app/items/[id]/page.tsx
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
}
```

## 9. 依赖 URL 的 hook

`useSearchParams()` 必须在 `<Suspense>` 边界内，否则 `next build` 预渲染阶段直接失败：

```tsx
"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function Board() {
  const query = useSearchParams();
  return <div>{query.get("id")}</div>;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Board />
    </Suspense>
  );
}
```
