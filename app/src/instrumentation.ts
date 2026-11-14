/**
 * 平台启动钩子：清理数据库中已无对应进程的孤儿记录。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { cleanupOrphans } = await import("@/lib/runner");
    const cleaned = cleanupOrphans();
    if (cleaned.length > 0) {
      console.log(`[atoms] 已清理孤儿进程记录：${cleaned.join(", ")}`);
    }
  } catch (err) {
    console.error("[atoms] 孤儿进程清理失败", err);
  }
}
