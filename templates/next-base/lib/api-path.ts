/**
 * 构建期注入的部署子路径（平台以 /p/{id} 挂载项目时非空）。
 * 浏览器端的 fetch 不会被 Next 自动加上 basePath，因此统一用 apiPath() 拼接。
 */
const BASE_PATH = process.env.NEXT_PUBLIC_ATOMS_BASE_PATH ?? "";

export function apiPath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${normalized}`;
}
