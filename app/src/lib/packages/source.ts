import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export interface SourceFile { path: string; content: Buffer }
const DIRECTORIES = new Set(['app','src','pages','components','lib','public','styles','hooks','assets','types','utils','context','contexts','prisma','drizzle','.atoms']);
const ROOT_FILES = /^(index\.html|style\.css|script\.js|package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig(?:\.[\w-]+)?\.json|next-env\.d\.ts|(?:next|postcss|tailwind|vite|eslint)\.config\.[\w]+|components\.json|(?:middleware|proxy|instrumentation(?:-client)?|auth|mdx-components)\.[cm]?[jt]sx?|README(?:\.md)?|LICENSE(?:\.md)?)$/i;
const CODE = /\.(?:[cm]?[jt]sx?|css|scss|sass|less|json|md|mdx|yaml|yml|sql|prisma|html)$/i;
const ASSET = /\.(?:svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf|mp4|webm)$/i;
const BLOCKED = /(?:^|\/)(?:node_modules|\.git|\.next|dist|build|data|logs|\.cache|coverage|\.turbo|\.ssh|\.aws)(?:\/|$)|(?:^|\/)(?:\.env[^/]*|[^/]*(?:secret|credential|private[._-]?key|privatekey)[^/]*|id_rsa[^/]*|id_ed25519[^/]*|env\.json)$|\.(?:pem|key|p12|pfx|db|sqlite\d?|log)(?:-[\w]+)?$/i;

/** Intentional allowlist; symlinks and special files are never followed. */
export function collectSource(root: string): SourceFile[] {
 if (!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) throw new Error('项目源码目录无效');
 const result: SourceFile[]=[];
 let total=0;
 function walk(dir:string,prefix:string) {
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
   const rel=prefix?`${prefix}/${entry.name}`:entry.name;
   if(BLOCKED.test(rel)||/^\.atoms\/(?:acceptance|candidates|dependency-backups|runtime|recovery|checkpoints)(?:\/|$)/.test(rel)||entry.isSymbolicLink()) continue;
   if(entry.isDirectory()) {
    if(!prefix && !DIRECTORIES.has(entry.name)) continue;
    walk(path.join(dir,entry.name),rel);
   } else if(entry.isFile()) {
    if(!prefix ? !ROOT_FILES.test(entry.name) : (rel.startsWith('public/')||rel.startsWith('assets/')) ? !ASSET.test(entry.name) : !CODE.test(entry.name)) continue;
    const abs=path.join(dir,entry.name);
    const stat=fs.lstatSync(abs);
    if(!stat.isFile() || stat.isSymbolicLink()) continue;
    total+=stat.size;
    if(total>100*1024*1024) throw new Error('源码超过 100MB，请移除不必要的资源后重试');
    const content=fs.readFileSync(abs);
    result.push({path:rel,content});
   }
  }
 }
 walk(root,'');
 return result.sort((a,b)=>a.path.localeCompare(b.path,'en'));
}
export function sourceHash(files:SourceFile[]):string {
 const hash=createHash('sha256');
 for(const file of files.filter(file=>!/^\.atoms\/(?:VERIFICATION|ACCEPTANCE)\.json$/.test(file.path))) hash.update(file.path).update('\0').update(String(file.content.length)).update('\0').update(file.content);
 return hash.digest('hex');
}
export function snapshotSource(root:string,destination:string,options:{allowStatic?:boolean}={}):{sourceHash:string;files:SourceFile[]} {
 const files=collectSource(root);
 if(!files.some(f=>f.path==='package.json')&&!(options.allowStatic&&files.some(f=>f.path==='index.html'))) throw new Error('缺少 package.json，尚无可发布的应用');
 if(fs.existsSync(destination)) throw new Error('快照目录已存在');
 for(const file of files) {
  const abs=path.join(destination,file.path);
  fs.mkdirSync(path.dirname(abs),{recursive:true});
  fs.writeFileSync(abs,file.content,{flag:'wx'});
 }
 return {sourceHash:sourceHash(files),files};
}
/** Verification reports cannot hash themselves. All callers use this same boundary. */
export function computeProjectHash(root:string):string {
 return sourceHash(collectSource(root).filter(file=>file.path!=='.atoms/VERIFICATION.json'));
}
