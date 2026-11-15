import fs from 'node:fs';
import path from 'node:path';
import {config} from '../config.ts';

/** 平台固定 pnpm CLI，避免宿主机不同版本或架构影响生成工程。 */
export function pnpmCliPath(): string {
  const cli = path.join(process.cwd(), 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
  if (!fs.existsSync(cli)) throw new Error('平台 pnpm 工具链未安装，请在 app 目录执行 npm install');
  return cli;
}
export function shellQuote(value: string): string { return "'" + value.replaceAll("'", "'\\''") + "'"; }
export function pnpmShellCommand(): string { return `${shellQuote(process.execPath)} ${shellQuote(pnpmCliPath())}`; }
export function packageInvocation(command: string, args: string[]): {command:string;args:string[]} {
  return command === 'pnpm' ? {command:process.execPath,args:[pnpmCliPath(),...args]} : {command,args};
}

/** 仅接受 registry 包名及普通版本范围，拒绝选项、本地路径和可执行 shell 字符。 */
export function installDependenciesCommand(packages: string[] = [], frozen = false, registry = config.packageRegistry): string {
  let source:URL;
  try { source=new URL(registry); } catch { throw new Error('PACKAGE_REGISTRY 必须是 HTTP(S) 地址'); }
  if(/[\r\n\x00-\x1f]/.test(registry)||!['https:','http:'].includes(source.protocol)||source.username||source.password||source.search||source.hash)throw new Error('PACKAGE_REGISTRY 必须是不含凭据和查询参数的 HTTP(S) 地址');
  for (const value of packages) {
    if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:@[a-zA-Z0-9*^~.+<>=| -]+)?$/.test(value) || value.length > 214) {
      throw new Error(`不支持的依赖名称或版本：${value}`);
    }
  }
  const action = packages.length ? `add -- ${packages.map(shellQuote).join(' ')}` : `install ${frozen ? '--frozen-lockfile' : '--no-frozen-lockfile'}`;
  // store 在隔离的项目 HOME 中，不与其他租户共享可写文件。
  // 安装文件独立于下载仓库，成功后可安全回收仓库。
  return `${pnpmShellCommand()} --config.node-linker=hoisted --config.store-dir=.atoms/runtime/pnpm-store --package-import-method=copy --config.dangerouslyAllowAllBuilds=true --registry=${shellQuote(source.toString())} --reporter=append-only --fetch-retries=1 --fetch-timeout=30000 --fetch-retry-mintimeout=1000 --fetch-retry-maxtimeout=5000 ${action}`;
}
