import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ensureRuntimeDirectory } from '../workspace/runtime-directory.ts';
import { copyDependencyTreeAsync, dependencyTreeDigest } from './dependency-copy.ts';
import { isReusableDependencyTree } from './dependency-cache.ts';
type InstallResult = {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
    aborted: boolean;
};
export class TemplateDependencyInstallError extends Error {
    readonly result: InstallResult;
    constructor(result: InstallResult) { super('统一模板依赖安装失败'); this.name = 'TemplateDependencyInstallError'; this.result = result; }
}
interface CacheIdentity {
    template: string;
    runtime: string;
    toolchain: string;
    registry: string;
}
interface Options extends CacheIdentity {
    root: string;
    cacheRoot: string;
    signal?: AbortSignal;
    onProgress?: (message: string) => void;
    /** 由平台创建独立临时项目，不能放在用户进程的可写挂载下。 */
    createStage: () => Promise<string>;
    install: (root: string) => Promise<InstallResult>;
}
function canonical(value: unknown): string {
    if (Array.isArray(value))
        return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object')
        return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
    return JSON.stringify(value);
}
function manifest(text: string): Record<string, unknown> {
    const value = JSON.parse(text);
    if (!value || Array.isArray(value) || typeof value !== 'object')
        throw Error('依赖清单必须是对象');
    for (const key of ['name', 'version', 'description'])
        delete value[key];
    return value;
}
export function templateManifestMatches(template: string, project: string): boolean {
    try {
        return canonical(manifest(template)) === canonical(manifest(project));
    }
    catch {
        return false;
    }
}
export function templateDependencyKey(identity: CacheIdentity): string {
    return createHash('sha256').update(canonical({ template: manifest(identity.template), runtime: identity.runtime, toolchain: identity.toolchain, registry: identity.registry, format: 'template-cow-v1' })).digest('hex');
}
async function ordinary(filename: string, kind: 'file' | 'directory'): Promise<boolean> {
    try {
        const stat = await fs.promises.lstat(filename);
        if (stat.isSymbolicLink() || (kind === 'file' ? !stat.isFile() : !stat.isDirectory()))
            throw Error('模板缓存路径不允许符号链接或特殊文件');
        return true;
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return false;
        throw error;
    }
}
async function readCache(cache: string, key: string, signal?: AbortSignal): Promise<string | null> {
    if (!await ordinary(cache, 'directory'))
        return null;
    try {
        const metadata = path.join(cache, 'manifest.json'), lock = path.join(cache, 'pnpm-lock.yaml');
        if (!await ordinary(metadata, 'file') || !await ordinary(lock, 'file') || !await ordinary(path.join(cache, 'node_modules'), 'directory'))
            return null;
        if ((await fs.promises.stat(lock)).size > 10000000 || (await fs.promises.stat(metadata)).size > 100000)
            return null;
        const data = JSON.parse(await fs.promises.readFile(metadata, 'utf8'));
        if (data.key !== key || !isReusableDependencyTree(path.join(cache, 'node_modules')))
            return null;
        const lockText = await fs.promises.readFile(lock, 'utf8');
        if (data.lockHash !== createHash('sha256').update(lockText).digest('hex') || data.treeHash !== await dependencyTreeDigest(path.join(cache, 'node_modules'), signal))
            return null;
        return lockText;
    }
    catch (error) {
        if (signal?.aborted)
            throw error;
        return null;
    }
}
const warming = new Map<string, Promise<string | null>>();
async function prepareCache(options: Options, cache: string, key: string): Promise<string | null> {
    // 损坏缓存先隔离再回收；项目已经恢复的 CoW 副本不受影响。
    const current = await readCache(cache, key, options.signal);
    if (current !== null)
        return current;
    if (await ordinary(cache, 'directory')) {
        const invalid = cache + '.invalid-' + randomUUID();
        try {
            await fs.promises.rename(cache, invalid);
            await fs.promises.rm(invalid, { recursive: true, force: true });
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                throw error;
        }
    }
    const stage = await options.createStage();
    let temporary: string | undefined;
    try {
        options.signal?.throwIfAborted();
        await fs.promises.writeFile(path.join(stage, 'package.json'), options.template);
        options.onProgress?.('首次准备统一模板依赖：仅安装可信模板，相同环境后续项目直接复用');
        const result = await options.install(stage);
        options.signal?.throwIfAborted();
        if (result.exitCode !== 0 || result.aborted || result.timedOut)
            throw new TemplateDependencyInstallError(result);
        if (!isReusableDependencyTree(path.join(stage, 'node_modules')) || !await ordinary(path.join(stage, 'pnpm-lock.yaml'), 'file'))
            return null;
        const lock = await fs.promises.readFile(path.join(stage, 'pnpm-lock.yaml'), 'utf8');
        // node-gyp 留下的 Python 绝对链接只用于编译，不属于运行依赖。
        let scratch = stage;
        for (const part of ['node_modules', 'better-sqlite3', 'build', 'node_gyp_bins']) {
            scratch = path.join(scratch, part);
            if (!await ordinary(scratch, 'directory')) {
                scratch = '';
                break;
            }
        }
        if (scratch)
            await fs.promises.rm(scratch, { recursive: true, force: true });
        temporary = await fs.promises.mkdtemp(cache + '.tmp-');
        await copyDependencyTreeAsync(path.join(stage, 'node_modules'), path.join(temporary, 'node_modules'), options.signal);
        await fs.promises.writeFile(path.join(temporary, 'pnpm-lock.yaml'), lock);
        await fs.promises.writeFile(path.join(temporary, 'manifest.json'), JSON.stringify({ key, lockHash: createHash('sha256').update(lock).digest('hex'), treeHash: await dependencyTreeDigest(path.join(temporary, 'node_modules'), options.signal) }));
        options.signal?.throwIfAborted();
        try {
            await fs.promises.rename(temporary, cache);
        }
        catch (error) {
            if (!await ordinary(cache, 'directory'))
                throw error;
        }
        return readCache(cache, key, options.signal);
    }
    finally {
        if (temporary)
            await fs.promises.rm(temporary, { recursive: true, force: true });
        await fs.promises.rm(stage, { recursive: true, force: true });
    }
}
/** 不放宽 realpath：复用后的目录与文件仍属于项目，没有外部软链接或可写硬链接。 */
export async function reuseTemplateDependencies(options: Options): Promise<InstallResult | null> {
    options.signal?.throwIfAborted();
    const root = await fs.promises.realpath(options.root);
    if (!await ordinary(path.join(root, 'package.json'), 'file'))
        return null;
    if (!templateManifestMatches(options.template, await fs.promises.readFile(path.join(root, 'package.json'), 'utf8')))
        return null;
    // 项目级安装配置也会改变解析结果，不能仅比较 package.json 后跳过安装。
    for (const name of ['.npmrc', '.pnpmfile.cjs', '.pnpmfile.mjs', 'pnpm-workspace.yaml', 'yarn.lock', 'package-lock.json']) {
        try {
            await fs.promises.lstat(path.join(root, name));
            return null;
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                throw error;
        }
    }
    // 项目路径错误不能当成缓存缺失吞掉；不接触异常路径后的外部文件。
    ensureRuntimeDirectory(root, '.atoms/runtime');
    await ordinary(path.join(root, 'node_modules'), 'directory');
    const lockPath = path.join(root, 'pnpm-lock.yaml');
    const hasLock = await ordinary(lockPath, 'file');
    await fs.promises.mkdir(options.cacheRoot, { recursive: true });
    if (!await ordinary(options.cacheRoot, 'directory'))
        return null;
    const cacheRoot = await fs.promises.realpath(options.cacheRoot);
    const key = templateDependencyKey(options), cache = path.join(cacheRoot, 'template-v1-' + key);
    options.onProgress?.('正在校验统一模板依赖缓存完整性');
    let lock = await readCache(cache, key, options.signal);
    if (lock === null) {
        // 有用户锁文件时，不为比较而冷安装模板，直接交还原安装流程。
        if (hasLock)
            return null;
        let pending = warming.get(cache);
        const owner = !pending;
        if (!pending) {
            pending = prepareCache({ ...options, root }, cache, key);
            warming.set(cache, pending);
            void pending.finally(() => { if (warming.get(cache) === pending)
                warming.delete(cache); }).catch(() => { });
        }
        lock = await (owner ? pending : waitForCache(pending, options.signal));
    }
    options.signal?.throwIfAborted();
    if (lock === null)
        return null;
    if (hasLock && await fs.promises.readFile(lockPath, 'utf8') !== lock)
        return null;
    options.onProgress?.('命中统一模板依赖，正在写时复制恢复；无需再次下载或编译原生模块');
    // 恢复也在独立平台 staging 进行，用户运行进程不能替换复制中的目标路径。
    const stage = await options.createStage();
    let previous = false, installed = false, wroteLock = false;
    try {
        await copyDependencyTreeAsync(path.join(cache, 'node_modules'), path.join(stage, 'node_modules'), options.signal);
        options.signal?.throwIfAborted();
        // 安装和文件修改通过项目 mutation lease 串行；提交前再次拒绝链接替换。
        if (await ordinary(path.join(root, 'node_modules'), 'directory')) {
            await fs.promises.rename(path.join(root, 'node_modules'), path.join(stage, 'previous'));
            previous = true;
        }
        if (!hasLock) {
            await fs.promises.writeFile(lockPath, lock, { flag: 'wx' });
            wroteLock = true;
        }
        await fs.promises.rename(path.join(stage, 'node_modules'), path.join(root, 'node_modules'));
        installed = true;
        return { stdout: '已复用统一模板依赖，跳过安装，可继续启动开发预览', stderr: '', exitCode: 0, timedOut: false, aborted: false };
    }
    finally {
        if (!installed) {
            if (wroteLock)
                await fs.promises.unlink(lockPath);
            if (previous)
                await fs.promises.rename(path.join(stage, 'previous'), path.join(root, 'node_modules'));
        }
        await fs.promises.rm(stage, { recursive: true, force: true });
    }
}
async function waitForCache(pending: Promise<string | null>, signal?: AbortSignal): Promise<string | null> {
    if (!signal)
        return pending;
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason ?? Error('模板依赖准备已取消'));
        signal.addEventListener('abort', abort, { once: true });
        pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
        if (signal.aborted)
            abort();
    });
}
