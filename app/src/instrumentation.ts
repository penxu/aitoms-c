/**
 * 平台启动钩子：清理数据库中已无对应进程的孤儿记录。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { cleanupOrphans } = await import("@/lib/runner");
    const cleaned = cleanupOrphans();
    const { recoverInterruptedGenerations } = await import("@/lib/generation/recovery");
    recoverInterruptedGenerations();
    const { recoverReleases } = await import("@/lib/releases/pipeline");
    // Recovery runs in the background; a slow application does not block platform startup.
    void recoverReleases().catch(error => console.error("[atoms] 发布恢复失败", error));
    if (cleaned.length > 0) {
      console.log(`[atoms] 已清理孤儿进程记录：${cleaned.join(", ")}`);
    }
  } catch (err) {
    console.error("[atoms] 孤儿进程清理失败", err);
  }
}
