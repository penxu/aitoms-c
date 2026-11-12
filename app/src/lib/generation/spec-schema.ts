/**
 * SPEC.md 校验（纯函数，无运行时依赖，可单测）。
 * 只做「够不够生成计划」的结构性检查，不评判需求本身的业务合理性。
 */

export interface SpecValidation {
  ok: boolean;
  errors: string[];
}

/** 正文最小长度：低于该值基本无法支撑后续 PLAN/BUILD */
const MIN_SPEC_CHARS = 120;

/** 取某个二级标题下的正文（到下一个二级标题为止） */
function sectionBody(markdown: string, heading: string): string | null {
  const lines = markdown.split("\n");
  const index = lines.findIndex((line) => line.trim() === heading);
  if (index === -1) return null;
  const body: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (line.startsWith("## ")) break;
    body.push(line);
  }
  return body.join("\n").trim();
}

export function validateSpec(markdown: string): SpecValidation {
  const errors: string[] = [];
  const text = markdown.trim();

  if (text.length < MIN_SPEC_CHARS) {
    errors.push(`内容过短（${text.length} 字符），至少需要 ${MIN_SPEC_CHARS} 字符`);
  }

  const pages = sectionBody(text, "## 页面");
  if (pages === null) {
    errors.push("缺少「## 页面」段落：需要列出页面及其路由路径");
  } else if (!pages) {
    errors.push("「## 页面」段落为空：需要列出页面及其路由路径");
  }

  const dataModel = sectionBody(text, "## 数据模型");
  if (dataModel === null) {
    errors.push("缺少「## 数据模型」段落：需要列出表名与列名");
  } else if (!dataModel) {
    errors.push("「## 数据模型」段落为空：需要列出表名与列名");
  }

  return { ok: errors.length === 0, errors };
}
