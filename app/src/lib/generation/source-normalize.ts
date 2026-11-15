import {stripInvalidProtocolTail} from "./source-syntax.ts";
/** 写入磁盘前的统一归一入口：UI 约定 + Next 16 路由签名 + Suspense 边界 */
import { normalizeRouteParams } from "./next16-routes.ts";
import { normalizeSuspenseBounds } from "./next16-suspense.ts";
import { normalizeUiSource } from "./ui-contracts.ts";

/** 只对页面/路由/布局做框架层归一，避免误改普通组件里的变量名 */
const ROUTE_FILE = /^app\/.*(route\.ts|page\.tsx|layout\.tsx)$/;
const PAGE_FILE = /^app\/.*page\.tsx$/;

export function normalizeSource(relPath: string, content: string): { content: string; notes: string[] } {
  const protocol=stripInvalidProtocolTail(relPath,content);
  const ui = normalizeUiSource(protocol.content);
  ui.notes.unshift(...protocol.notes);
  if (!ROUTE_FILE.test(relPath)) return ui;

  const route = normalizeRouteParams(ui.content, relPath.endsWith("/route.ts") ? "route" : "page");
  let result = route.content;
  const notes = [...ui.notes, ...route.notes];

  if (PAGE_FILE.test(relPath)) {
    const suspense = normalizeSuspenseBounds(result);
    result = suspense.content;
    notes.push(...suspense.notes);
  }

  return { content: result, notes };
}
