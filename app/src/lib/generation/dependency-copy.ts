import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
/** 独立 inode + 写时复制；不支持 reflink 的文件系统由 Node 回退为普通复制。 */
export async function copyDependencyTreeAsync(source: string, target: string, signal?: AbortSignal): Promise<void> {
    const root = await fs.promises.realpath(source);
    if (!(await fs.promises.lstat(source)).isDirectory())
        throw Error('依赖缓存必须为普通目录');
    const inspect = async (directory: string): Promise<void> => {
        signal?.throwIfAborted();
        for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) {
            signal?.throwIfAborted();
            const filename = path.join(directory, entry.name);
            if (entry.isSymbolicLink()) {
                const link = await fs.promises.readlink(filename);
                const destination = path.resolve(directory, link);
                if (path.isAbsolute(link) || !destination.startsWith(root + path.sep) || !(await fs.promises.realpath(filename)).startsWith(root + path.sep))
                    throw Error('依赖缓存包含越界符号链接');
            }
            else if (entry.isDirectory())
                await inspect(filename);
            else if (!entry.isFile())
                throw Error('依赖缓存包含不支持的特殊文件');
        }
    };
    await inspect(root);
    await fs.promises.cp(root, target, {
        recursive: true, dereference: false, verbatimSymlinks: true, mode: fs.constants.COPYFILE_FICLONE,
        filter: () => { signal?.throwIfAborted(); return true; },
    });
    signal?.throwIfAborted();
}
/** 完整内容摘要用于检测删包、截断和同大小篡改，不依赖少数编译器哨兵。 */
export async function dependencyTreeDigest(source: string, signal?: AbortSignal): Promise<string> {
    const root = await fs.promises.realpath(source), hash = createHash('sha256');
    if (!(await fs.promises.lstat(source)).isDirectory())
        throw Error('依赖缓存必须为普通目录');
    const visit = async (directory: string): Promise<void> => {
        for (const entry of (await fs.promises.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
            signal?.throwIfAborted();
            const filename = path.join(directory, entry.name), relative = path.relative(root, filename);
            hash.update(JSON.stringify([relative, entry.isSymbolicLink() ? 'link' : entry.isDirectory() ? 'dir' : 'file', entry.isSymbolicLink() ? null : (await fs.promises.stat(filename)).mode & 0o777]));
            if (entry.isDirectory())
                await visit(filename);
            else if (entry.isSymbolicLink()) {
                const link = await fs.promises.readlink(filename);
                if (path.isAbsolute(link) || !(await fs.promises.realpath(filename)).startsWith(root + path.sep))
                    throw Error('依赖缓存包含越界符号链接');
                hash.update(JSON.stringify(link));
            }
            else if (entry.isFile()) {
                const content = createHash('sha256');
                for await (const chunk of fs.createReadStream(filename)) {
                    signal?.throwIfAborted();
                    content.update(chunk);
                }
                hash.update(content.digest());
            }
            else
                throw Error('依赖缓存包含不支持的特殊文件');
        }
    };
    await visit(root);
    return hash.digest('hex');
}
