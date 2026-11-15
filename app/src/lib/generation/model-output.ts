import { parseSource } from "./source-ast.ts";

/** 代码起始行特征：用于裁掉模型在代码前写的说明文字 */
const CODE_START =
  /^(?:"use client"|'use client'|import\b|export\b|const\b|let\b|function\b|interface\b|type\b|class\b|@|\.|#|\/\/|\/\*|<!--|<!DOCTYPE|<)/;

/** 去掉文件头部的说明性文字，从第一行代码开始 */
function stripLeadingProse(text: string): string {
  const lines = text.split("\n");
  const index = lines.findIndex((line) => CODE_START.test(line.trim()));
  return index > 0 ? lines.slice(index).join("\n").trim() : text;
}

/**
 * 提取模型输出中的文件内容。
 * 只移除包裹单文件的围栏；歧义或源码内嵌围栏保持原样。
 */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim().replace(/(?:\r?\n<\/｜｜DSML｜｜(?: (?:parameter|invoke|calls))?>)+\s*$/, "").trim();
  if (!/^(?:`{3,}|~{3,})/.test(trimmed) && parseSource(trimmed).valid) return trimmed;
  // 只移除响应外层的一对围栏，源码内部的示例围栏属于文件本身。
  const lines = trimmed.split("\n");
  const opening = lines.findIndex((line) => /^\s*(`{3,}|~{3,})[^`~]*$/.test(line));
  if (opening >= 0) {
    const prefix = lines.slice(0, opening).join("\n");
    const marker = /^\s*(`{3,}|~{3,})/.exec(lines[opening])![1];
    const closes = lines.map((line, index) => index > opening && line.trim() === marker ? index : -1).filter((index) => index >= 0);
    const closing = closes[0];
    const suffix = closing === undefined ? "" : lines.slice(closing + 1).join("\n");
    const prefixIsCode = prefix.split("\n").some((line) => CODE_START.test(line.trim()));
    const suffixIsCode = suffix.split("\n").some((line) => CODE_START.test(line.trim()) || /^\s*(`{3,}|~{3,})/.test(line));
    if (!prefixIsCode && !suffixIsCode && closes.length === 1) return lines.slice(opening + 1, closing).join("\n").trim();
    return trimmed;
  }
  return stripLeadingProse(trimmed);
}

/** 从模型输出中解析 JSON 对象：容忍说明文字与代码块围栏 */
export function extractJson<T = unknown>(text: string): T {
  const content = stripCodeFence(text);
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("模型输出中没有 JSON 对象");
  return JSON.parse(content.slice(start, end + 1)) as T;
}
