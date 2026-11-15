/**
 * 预览 HMR 的同源身份映射。先验证外部 Origin，随后才替换成本机上游身份；
 * 不能把任意第三方 Origin 都改成可信来源。
 * @param {import('node:http').IncomingHttpHeaders} incoming
 * @param {number} port
 * @returns {import('node:http').IncomingHttpHeaders}
 */
export function previewUpgradeHeaders(incoming, port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('非法预览端口');
  const headers = { ...incoming };
  if (incoming.origin !== undefined) {
    if (typeof incoming.origin !== 'string' || !incoming.host) throw new Error('非法 WebSocket 来源');
    let origin;
    try { origin = new URL(incoming.origin); } catch { throw new Error('非法 WebSocket 来源'); }
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || origin.host.toLowerCase() !== incoming.host.toLowerCase()) {
      throw new Error('拒绝跨源预览 WebSocket');
    }
    headers.origin = `http://localhost:${port}`;
  }
  headers.host = `localhost:${port}`;
  headers['x-forwarded-host'] = headers.host;
  headers['x-forwarded-proto'] = 'http';
  return headers;
}
