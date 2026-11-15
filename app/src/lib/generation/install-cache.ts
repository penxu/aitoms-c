import fs from 'node:fs';
import path from 'node:path';

/** 仅回收成功安装后可再生的下载仓库；不清理HOME、TMP或安装后的依赖。 */
export async function pruneInstalledDownloadCache(root:string):Promise<boolean> {
 const realRoot=fs.realpathSync(root);
 let target=realRoot;
 for(const segment of ['.atoms','runtime','pnpm-store']){
  target=path.join(target,segment);
  let stat:fs.Stats;
  try{stat=await fs.promises.lstat(target);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}
  if(stat.isSymbolicLink()||!stat.isDirectory()||await fs.promises.realpath(target)!==target)throw Error('下载缓存必须位于普通目录，拒绝符号链接');
 }
 await fs.promises.rm(target,{recursive:true,force:true});
 return true;
}
