import type { NextConfig } from "next";

/**
 * 平台通过 ATOMS_BASE_PATH（形如 /p/{projectId}）注入子路径。
 * 本地独立运行时该变量为空，应用挂在根路径。
 */
const basePath = process.env.ATOMS_BASE_PATH || "";
const nextConfig: NextConfig = {
  // 当前已授权预览入口；平台代理更新后上游会使用本机Origin。
  allowedDevOrigins: ["119.29.93.214", "127.0.0.1"],
  serverExternalPackages: ["better-sqlite3"],
  ...(basePath ? { basePath, assetPrefix: `${basePath}/` } : {}),
};

export default nextConfig;
