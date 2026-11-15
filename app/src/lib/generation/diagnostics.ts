/**
 * 把编译器/构建输出解析成结构化诊断（file:line），
 * 让修复阶段能拿到「精确位置 + 带行号上下文」，而不是只丢一段错误日志。
 */

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  /** TS2322 这类错误码；非 tsc 输出时为空串 */
  code: string;
  message: string;
}

/** `app/page.tsx(94,23): error TS2322: Type '"secondary"' is not assignable ...` */
const TSC_DIAGNOSTIC = /^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/;

function normalizePath(file: string): string {
  return file.trim().replace(/^\.\//, "");
}

/** 解析 tsc 输出，按 文件+行+错误码 去重，最多返回 limit 条 */
export function parseTscDiagnostics(log: string, limit = 20): Diagnostic[] {
  const out: Diagnostic[] = [];
  const seen = new Set<string>();

  for (const raw of log.split(/\r?\n/)) {
    const match = TSC_DIAGNOSTIC.exec(raw.trim());
    if (!match) continue;
    const file = normalizePath(match[1]);
    const line = Number(match[2]);
    const code = match[4];
    const key = `${file}:${line}:${code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ file, line, column: Number(match[3]), code, message: match[5].trim() });
    if (out.length >= limit) break;
  }

  return out;
}

/** `Error occurred prerendering page "/play"` / `... at page "/play"` */
const NEXT_PAGE_ERROR = /(?:prerendering page|at page)\s+"(\/[^"]*)"/;

function pageRouteToFile(route: string): string {
  const clean = route.replace(/^\/+|\/+$/g, "");
  return clean ? `app/${clean}/page.tsx` : "app/page.tsx";
}

/**
 * 解析 `next build` 的预渲染错误（tsc 查不出来）。
 * 这类错误只给出路由 `/play`，需要换算成 `app/play/page.tsx` 才能定点修复。
 */
export function parseNextBuildDiagnostics(log: string, limit = 10): Diagnostic[] {
  const out: Diagnostic[] = [];
  const seen = new Set<string>();

  for (const raw of log.split(/\r?\n/)) {
    const match = NEXT_PAGE_ERROR.exec(raw);
    if (!match) continue;
    const file = pageRouteToFile(match[1]);
    // 同一个页面会被日志重复提到，按文件去重，保留第一条（通常是最具体的原因）
    if (seen.has(file)) continue;
    seen.add(file);
    out.push({ file, line: 1, column: 1, code: "NEXT_BUILD", message: raw.trim() });
    if (out.length >= limit) break;
  }

  return out;
}

/** 在文件里定位某段代码所在行，供上下文截取使用 */
export function findLineOf(content: string, pattern: RegExp): number {
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (pattern.test(lines[index])) return index + 1;
  }
  return 1;
}

const ROUTE_IMPORT = /typeof import\("([^"]+)"\)/;

/**
 * `.next/types/validator.ts` 里的错误指向 Next 生成文件，原始信息里带着真实路由路径。
 * 把它回溯成项目内文件，修复阶段才能改到真正出问题的地方。
 */
export function resolveGeneratedDiagnostics(
  diagnostics: Diagnostic[],
  projectRootPath: string,
): Diagnostic[] {
  const root = projectRootPath.replace(/\\/g, "/");

  return diagnostics.map((item) => {
    if (!item.file.startsWith(".next/")) return item;
    const match = ROUTE_IMPORT.exec(item.message);
    if (!match) return item;

    const absolute = match[1].replace(/\\/g, "/");
    if (!absolute.startsWith(root)) return item;

    const relative = absolute.slice(root.length + 1);
    if (!relative.startsWith("app/")) return item;
    return { ...item, file: relative, line: 1 };
  });
}

/** 供提示词使用的紧凑诊断列表 */
export function formatDiagnostics(diagnostics: Diagnostic[]): string {
  return diagnostics
    .map((item) => `- ${item.file}:${item.line} ${item.code ? `${item.code} ` : ""}${item.message}`)
    .join("\n");
}

/**
 * 生成报错位置附近的带行号片段。
 * 行号前缀用 ` 123 | `，模型可以原样引用其中内容作为 find 片段。
 */
export function excerptWithLineNumbers(content: string, line: number, radius = 12): string {
  const lines = content.split(/\r?\n/);
  const target = Math.max(1, Math.min(line, lines.length));
  const start = Math.max(1, target - radius);
  const end = Math.min(lines.length, target + radius);

  const width = String(end).length;
  const body: string[] = [];
  for (let index = start; index <= end; index += 1) {
    body.push(`${String(index).padStart(width, " ")} | ${lines[index - 1]}`);
  }
  return body.join("\n");
}
