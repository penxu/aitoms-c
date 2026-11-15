import type { AcceptanceResult } from "./acceptance";
/** A technical smoke test is evidence of buildability, not business acceptance. */
export function createVerificationReport(input: { runId: string; sourceHash: string; spec: string; acceptance?: AcceptanceResult[]; expectedChecks?: string[]; developmentPreview?: boolean }) {
  const sections = input.spec.split(/^## /m);
  const acceptance = sections.find((part) => part.startsWith("验收清单\n"))?.replace(/^验收清单\n/, "").trim();
  const dependencies = sections.find((part) => part.startsWith("外部依赖\n"))?.replace(/^外部依赖\n/, "").trim();
  const businessVerified = Boolean(input.expectedChecks?.length && input.expectedChecks.every(id => input.acceptance?.some(result => result.id === id && result.status === "passed")));
  return {
    schemaVersion: 1,
    runId: input.runId,
    sourceHash: input.sourceHash,
    status: businessVerified ? "business-checks-passed" : "technical-checks-passed",
    createdAt: new Date().toISOString(),
    businessVerified,
    previewMode: input.developmentPreview ? "development" : "production",
    acceptance: input.acceptance ?? [],
    checked: [
      { id: "dependencies", status: "passed", detail: "依赖安装或模板缓存恢复成功" },
      { id: "typecheck", status: "passed", detail: "tsc --noEmit" },
      { id: "build", status: input.developmentPreview ? "skipped" : "passed", detail: input.developmentPreview ? "开发预览未执行生产构建" : "生产构建通过；不代表独立生产发布" },
      { id: "health", status: "passed", detail: "预览服务 /api/health 返回成功" },
    ],
    pendingManual: [
      ...(input.developmentPreview ? ["生产构建及全站预渲染尚未执行；当前为开发环境预览"] : []),
      ...(!businessVerified ? [acceptance ? `核心业务验收（尚未执行）：\n${acceptance}` : "核心业务流程、数据持久化及刷新后查询尚未验证"] : []),
      ...(!dependencies || /^(?:[-*]\s*)?无[。.\s]*$/.test(dependencies) ? [] : [`外部依赖及凭据配置（尚未验证）：\n${dependencies}`]),
      "响应式细节、完整键盘路径及错误状态的人工体验仍需审阅",
      "独立生产部署及服务器外公网页面、资源、API 访问尚未验证",
    ],
  };
}
