/**
 * PLAN 校验与最小计划（纯函数，无运行时依赖，可单测）。
 * 模型给出的计划必须经过这里校验后才能落盘与执行。
 */
import type { GenerationPlan } from "./types";

export const MAX_PLAN_ITEMS = 40;

export const PLAN_JSON_PATH = ".atoms/PLAN.json";

/** 校验失败时的兜底：只重写首页，保证后续阶段仍能跑通 */
export const MINIMAL_PLAN: GenerationPlan = {
  pages: ["/"],
  items: [
    {
      path: "app/page.tsx",
      action: "modify",
      purpose: "按需求实现首页",
      dependsOn: [],
    },
  ],
  dataModel: [],
};

export interface PlanValidation {
  ok: boolean;
  errors: string[];
}

const MAX_ERRORS = 8;
const MAX_PAGES = 12;

/**
 * 路径安全规则（BUILD / VERIFY 复用）：
 * 相对路径、不以上 / 开头、不含 `..`、不含反斜杠、字符集受限。
 */
export function isSafePlanPath(p: unknown): p is string {
  if (typeof p !== "string") return false;
  if (p.length === 0 || p.length > 200) return false;
  if (p.startsWith("/")) return false;
  if (p.includes("..")) return false;
  if (p.includes("\\")) return false;
  return /^[\w.\-@/[\]]+$/.test(p);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validatePlan(plan: unknown, templateFiles: string[]): PlanValidation {
  const errors: string[] = [];
  const push = (message: string) => {
    if (errors.length < MAX_ERRORS) errors.push(message);
  };

  if (!isRecord(plan)) {
    return { ok: false, errors: ["计划不是合法的 JSON 对象"] };
  }

  // pages
  const pages = plan.pages;
  if (!Array.isArray(pages) || pages.length === 0) {
    push("pages 必须是非空数组");
  } else if (pages.length > MAX_PAGES) {
    push(`pages 最多 ${MAX_PAGES} 个，当前 ${pages.length} 个`);
  } else {
    for (const page of pages) {
      if (typeof page !== "string" || !page.startsWith("/")) {
        push(`页面路由必须以 / 开头：${String(page)}`);
      }
    }
  }

  // items
  const items = plan.items;
  const itemPaths: string[] = [];
  if (!Array.isArray(items) || items.length === 0) {
    push("items 必须是非空数组");
  } else if (items.length > MAX_PLAN_ITEMS) {
    push(`items 最多 ${MAX_PLAN_ITEMS} 条，当前 ${items.length} 条`);
  } else {
    items.forEach((item, index) => {
      if (!isRecord(item)) {
        push(`第 ${index + 1} 条计划不是对象`);
        return;
      }
      const path = item.path;
      if (!isSafePlanPath(path)) {
        push(`第 ${index + 1} 条计划路径不合法：${String(path)}`);
      } else if (path === PLAN_JSON_PATH) {
        push(`计划不能写入自身：${PLAN_JSON_PATH}`);
      } else {
        itemPaths.push(path);
      }

      if (item.action !== "create" && item.action !== "modify") {
        push(`${String(path)} 的 action 必须是 create 或 modify`);
      }

      const dependsOn = item.dependsOn;
      if (!Array.isArray(dependsOn) || dependsOn.some((d) => typeof d !== "string")) {
        push(`${String(path)} 的 dependsOn 必须是字符串数组`);
        return;
      }
      for (const dep of dependsOn) {
        const earlier = itemPaths.slice(0, -1).includes(dep);
        if (!templateFiles.includes(dep) && !earlier) {
          push(`${String(path)} 依赖了不存在或尚未产出的文件：${dep}`);
        }
      }
    });
  }

  if (!itemPaths.includes("app/page.tsx")) {
    push("items 必须包含 app/page.tsx（首页）");
  }

  // dataModel
  const dataModel = plan.dataModel;
  if (!Array.isArray(dataModel)) {
    push("dataModel 必须是数组");
  } else {
    for (const table of dataModel) {
      if (!isRecord(table) || typeof table.table !== "string" || !Array.isArray(table.columns)) {
        push("dataModel 每项必须是 { table, columns } 结构");
      }
    }
    if (dataModel.length > 0 && !itemPaths.includes("lib/db/index.ts")) {
      push("声明了数据模型，但 items 中没有 lib/db/index.ts");
    }
  }

  return { ok: errors.length === 0, errors };
}
