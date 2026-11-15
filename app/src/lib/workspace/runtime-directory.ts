import fs from 'node:fs';
import path from 'node:path';

/** 运行目录由宿主创建，必须在进入隔离前拒绝任一组件的符号链接。 */
export function ensureRuntimeDirectory(root:string,relative:string):string {
  const realRoot=fs.realpathSync(root);
  const parts=relative.split('/');
  if(path.isAbsolute(relative)||parts.some(value=>!value||value==='.'||value==='..'))throw new Error('运行目录必须位于项目目录内');
  let current=realRoot;
  for(const part of parts) {
    current=path.join(current,part);
    try {fs.mkdirSync(current,{mode:0o700});} catch(error) {if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
    const stat=fs.lstatSync(current);
    if(stat.isSymbolicLink()||!stat.isDirectory()||fs.realpathSync(current)!==current)throw new Error('运行目录不允许符号链接或逃逸项目目录');
  }
  return current;
}
