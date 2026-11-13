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
 * 模型有时会先写一段说明再给代码块，因此优先取最长的 Markdown 代码块，否则裁掉代码前的说明。
 */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const blocks = [...trimmed.matchAll(/```[^\n]*\n([\s\S]*?)(?:\n?```|$)/g)].map((match) => match[1]);
  if (blocks.length > 0) {
    return blocks.sort((a, b) => b.length - a.length)[0].trim();
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
