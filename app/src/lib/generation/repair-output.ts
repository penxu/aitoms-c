/**
 * 修复阶段的输出协议：增量片段而不是整文件。
 *
 * 之前的格式要求把每个文件的完整内容塞进 JSON 字符串，长文件很容易被输出上限截断，
 * `JSON.parse` 直接抛 `Unterminated string`，三轮修复全部空转。
 * 现在改为 { path, find, replace } 的最小改动，并对截断输出做容错：能解析的先用上。
 */
/** 仅用于兼容旧格式：去掉整体包裹的 Markdown 代码围栏 */
function stripFence(text: string): string {
  const match = /```[^\n]*\n([\s\S]*?)(?:\n?```|$)/.exec(text.trim());
  return (match ? match[1] : text).trim();
}

export interface RepairFix {
  path: string;
  /** 文件中已存在的原文片段；与 replace 成对出现 */
  find?: string;
  /** 替换后的片段，允许为空字符串表示删除 */
  replace?: string;
  /** 兼容旧格式：整文件内容 */
  content?: string;
}

export interface RepairOutput {
  fixes: RepairFix[];
  /** 输出被截断或含坏片段，末尾不完整的内容已丢弃 */
  truncated: boolean;
}

/** 从 `start` 处的 `{` 找到配对的 `}`；跳过字符串与转义，找不到返回 -1 */
function matchBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function normalizeFix(raw: unknown): RepairFix | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.path !== "string") return null;

  const path = record.path.trim();
  if (!path) return null;

  const find = typeof record.find === "string" && record.find.length > 0 ? record.find : undefined;
  const replace = typeof record.replace === "string" ? record.replace : undefined;
  const content =
    typeof record.content === "string" && record.content.length > 0 ? record.content : undefined;

  if (!find && !content) return null;
  return { path, find, replace, content };
}

/** 解析模型输出；优先整体 JSON，失败则逐个抓取完整对象，容忍尾部截断 */
export function parseRepairOutput(text: string): RepairOutput {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { fixes?: unknown })?.fixes)
          ? (parsed as { fixes: unknown[] }).fixes
          : null;
      if (list) {
        const fixes = list.map(normalizeFix).filter((fix): fix is RepairFix => fix !== null);
        return { fixes, truncated: false };
      }
    } catch {
      /* 进入容错解析 */
    }
  }

  const fixes: RepairFix[] = [];
  let truncated = false;
  const anchor = text.indexOf('"fixes"');
  let cursor = anchor === -1 ? Math.max(start, 0) : anchor;

  while (cursor < text.length) {
    const open = text.indexOf("{", cursor);
    if (open === -1) break;
    const close = matchBrace(text, open);
    if (close === -1) {
      truncated = true;
      break;
    }
    const chunk = text.slice(open, close + 1);
    cursor = close + 1;
    try {
      const fix = normalizeFix(JSON.parse(chunk));
      if (fix) fixes.push(fix);
    } catch {
      truncated = true;
    }
  }

  return { fixes, truncated };
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

export interface AppliedFix {
  content: string;
  applied: number;
  matched: "exact" | "trimmed" | "normalized" | "whole-file" | "none";
}

/** 模型常把提示词里的行号前缀一起复制进片段，这里去掉 */
function stripLineNumberPrefix(text: string): string {
  return text.replace(/^[ \t]*\d+[ \t]*\|[ \t]?/gm, "");
}

/** 把连续空白折叠成单个空格，并记录每个字符回到原文的下标 */
function buildLooseIndex(text: string): { text: string; map: number[] } {
  let result = "";
  const map: number[] = [];
  let inWhitespace = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/\s/.test(char)) {
      if (!inWhitespace) {
        result += " ";
        map.push(index);
        inWhitespace = true;
      }
      continue;
    }
    result += char;
    map.push(index);
    inWhitespace = false;
  }

  return { text: result, map };
}

/** 忽略缩进/换行差异定位片段，返回原文区间；模型复制片段时格式常与文件不完全一致 */
function findLooseRange(content: string, find: string): { start: number; end: number } | null {
  const haystack = buildLooseIndex(content);
  const needle = buildLooseIndex(find).text.trim();
  if (!needle) return null;

  const at = haystack.text.indexOf(needle);
  if (at === -1) return null;

  const last = at + needle.length - 1;
  return { start: haystack.map[at] ?? 0, end: (haystack.map[last] ?? content.length - 1) + 1 };
}

/** 把一条 fix 应用到文件内容上；find 阶段支持精确匹配、去空白与忽略缩进兜底 */
export function applyRepairFix(fileContent: string, fix: RepairFix): AppliedFix {
  const find = fix.find ? stripLineNumberPrefix(fix.find) : undefined;
  const replace = fix.replace === undefined ? undefined : stripLineNumberPrefix(fix.replace);

  if (find) {
    const exactHits = countOccurrences(fileContent, find);
    if (exactHits > 0) {
      return {
        content: fileContent.split(find).join(replace ?? ""),
        applied: exactHits,
        matched: "exact",
      };
    }

    const trimmed = find.trim();
    const hits = countOccurrences(fileContent, trimmed);
    if (trimmed && hits > 0) {
      return {
        content: fileContent.split(trimmed).join((replace ?? "").trim()),
        applied: hits,
        matched: "trimmed",
      };
    }

    const loose = findLooseRange(fileContent, find);
    if (loose) {
      return {
        content: fileContent.slice(0, loose.start) + (replace ?? "") + fileContent.slice(loose.end),
        applied: 1,
        matched: "normalized",
      };
    }
    return { content: fileContent, applied: 0, matched: "none" };
  }

  if (fix.content) {
    return { content: stripFence(fix.content), applied: 1, matched: "whole-file" };
  }
  return { content: fileContent, applied: 0, matched: "none" };
}
