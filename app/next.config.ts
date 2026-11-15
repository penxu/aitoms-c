import type { NextConfig } from "next";

/**
 * dev 模式下允许访问 /_next/hmr 等开发资源的主机。
 * 默认只放行本机；用公网 IP / 域名调试开发服务器时，
 * 通过 ALLOWED_DEV_ORIGINS=1.2.3.4,example.com 追加，避免跨源拦截。
 * 生产构建不使用该配置。
 */
const allowedDevOrigins = (
  process.env.ALLOWED_DEV_ORIGINS ?? "127.0.0.1,localhost"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["better-sqlite3"],
  allowedDevOrigins,
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
