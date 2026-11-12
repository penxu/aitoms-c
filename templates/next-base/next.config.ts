import type { NextConfig } from "next";

/**
 * 平台通过 ATOMS_BASE_PATH（形如 /p/{projectId}）注入子路径。
 * 本地独立运行时该变量为空，应用挂在根路径。
 */
const basePath = process.env.ATOMS_BASE_PATH || "";
const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  ...(basePath ? { basePath, assetPrefix: `${basePath}/` } : {}),
};

export default nextConfig;
