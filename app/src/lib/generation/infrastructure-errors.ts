/** 基础设施拦截交给用户处理，不让模型反复修改无关业务代码。 */
export function infrastructureFailure(log: string): string | null {
  if (/SAFE_DELETE_BULK_CONFIRM_REQUIRED/.test(log)) {
    return "构建被 CodeBuddy 的批量文件删除保护拦截。请在 CodeBuddy 中确认本次构建缓存清理，再点击重新验证；应用源码已保留。";
  }
  return null;
}
