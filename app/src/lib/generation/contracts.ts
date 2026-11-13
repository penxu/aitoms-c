/** 模板契约：允许模型改写这些文件，但不得破坏关键导出与探活接口 */
const TEMPLATE_CONTRACTS: { path: string; must: RegExp[]; forbid: RegExp[] }[] = [
  {
    path: "lib/db/index.ts",
    must: [/export function getDb/, /const DDL/],
    forbid: [/drizzle-orm/, /prisma/],
  },
  {
    path: "lib/db/schema.ts",
    must: [/export const TABLES/],
    forbid: [/drizzle-orm/, /prisma/],
  },
  {
    path: "app/api/health/route.ts",
    must: [/ok:\s*true/, /getDb\(\)/],
    forbid: [],
  },
];

/** 校验写入内容是否仍然满足模板契约；返回错误说明，通过时返回 null */
export function checkTemplateContract(relPath: string, content: string): string | null {
  const rule = TEMPLATE_CONTRACTS.find((item) => item.path === relPath);
  if (!rule) return null;
  for (const pattern of rule.must) {
    if (!pattern.test(content)) {
      return `${relPath} 丢失了模板约定内容（需匹配 ${pattern.source}）`;
    }
  }
  for (const pattern of rule.forbid) {
    if (pattern.test(content)) {
      return `${relPath} 使用了模板未安装的依赖（${pattern.source.replace(/\\/g, "")}）`;
    }
  }
  return null;
}
