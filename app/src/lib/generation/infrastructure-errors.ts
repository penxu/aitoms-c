/** 基础设施拦截交给用户处理，不让模型反复修改无关业务代码。 */
export function infrastructureFailure(log: string): string | null {
  if (/SAFE_DELETE_BULK_CONFIRM_REQUIRED/.test(log)) {
    return "构建被 CodeBuddy 的批量文件删除保护拦截。请在 CodeBuddy 中确认本次构建缓存清理，再点击重新验证；应用源码已保留。";
  }
  if (/PREVIEW-HOME:\s*首页访问检查超时/.test(log)) {
    return `预览首页响应超时，尚未确认是代码错误，已停止自动修改代码。应用源码已保留，请查看预览服务编译日志与服务器负载后重新验证；首页尚未通过访问检查。\n诊断信息：${log.slice(-5000)}`;
  }
  return null;
}
