import archiver from 'archiver';
import { collectSource, sourceHash } from './source.ts';

export interface PackageMetadata {projectId:string;kind:'source'|'deploy';releaseId?:string;verified?:boolean;expectedHash?:string}
export async function createProjectArchive(root:string,metadata:PackageMetadata,signal?:AbortSignal):Promise<Buffer> {
 const files=collectSource(root);
 const pkg=files.find(f=>f.path==='package.json');
 if(!pkg)throw new Error('项目尚无可导出的源码');
 const hash=sourceHash(files.filter(f=>f.path!=='.atoms/VERIFICATION.json'));
 if(metadata.expectedHash&&metadata.expectedHash!==hash)throw new Error('版本源码与验证记录不一致，请重新发布');
 if(metadata.kind==='deploy'&&(!metadata.releaseId||!metadata.verified))throw new Error('部署包需要选择已发布版本');
 const pnpm=files.some(f=>f.path==='pnpm-lock.yaml');
 const npm=files.some(f=>f.path==='package-lock.json');
 if(metadata.kind==='deploy'&&!pnpm&&!npm)throw new Error('部署包缺少依赖锁文件');
 const pm=pnpm?'pnpm':'npm';
 const lock=files.find(f=>f.path==='pnpm-lock.yaml')?.content.toString()??'';
 const lockVersion=Number(lock.match(/lockfileVersion:\s*['"]?(\d+)/)?.[1]??9);
 const pnpmVersion=lockVersion<6?'7.33.7':lockVersion<9?'8.15.9':'10.13.1';
 const install=pnpm?'pnpm install --ignore-scripts --frozen-lockfile --config.node-linker=hoisted':'npm ci --ignore-scripts --include=dev';
 const build=`${pm} run build`;
 const start=pnpm?'["pnpm", "run", "start", "-p", "3000", "-H", "0.0.0.0"]':'["npm", "run", "start", "--", "-p", "3000", "-H", "0.0.0.0"]';
 const generated:Record<string,string>={
  '.env.example':'# 仅示例。应用需要的第三方密钥请在部署环境单独配置。\nATOMS_DATA_DIR=/app/data\n# ATOMS_BASE_PATH 默认为空：独立部署在根路径。\n',
  'atoms-manifest.json':JSON.stringify({schemaVersion:1,projectId:metadata.projectId,releaseId:metadata.releaseId??null,sourceHash:hash,kind:metadata.kind,createdAt:new Date().toISOString(),verification:{productionBuild:metadata.kind==='deploy'&&Boolean(metadata.verified),healthCheck:metadata.kind==='deploy'&&Boolean(metadata.verified),standaloneBuild:false,businessFlows:false},runtime:'Node.js 22, Linux with glibc',note:'平台发布验证不等于独立服务器已验证；业务流程请按应用需求验收。'},null,2),
  'DEPLOYMENT.md':`# 独立部署\n\n此包包含源码，不包含密钥、数据库、Git历史、依赖或平台构建缓存。\n\n## 本地\n\n安装与服务器架构一致的 Node.js 22（Apple Silicon 使用 ARM64）。${pnpm?`启用 corepack，并安装 pnpm ${pnpmVersion}（与本包锁文件兼容）。`:''}\n\n\`\`\`sh\n${install}\n${build}\n${pm} run start\n\`\`\`\n\n默认在 http://localhost:3000/ 运行，健康检查 /api/health。不要设置 ATOMS_BASE_PATH，除非明确需要子路径部署；该变量必须在构建和启动时一致。\n\n## 容器\n\n\`\`\`sh\ndocker compose up --build -d\n\`\`\`\n\n应用数据保存在 app-data 卷；重建容器保留数据。首次部署数据库为空，不含开发预览数据。按需在 Compose 的 environment/env_file 配置应用自身第三方服务密钥，不要复制平台密钥。\n\n## 验证状态\n\n查看 atoms-manifest.json。已发布版本通过平台上的生产构建和健康检查，独立根路径仍需在目标环境实际构建、访问和验证业务流程。草稿包未经生产验证。数据库备份和迁移由部署者负责；代码回滚不回滚业务数据。\n`,
  'Dockerfile':`FROM node:22-bookworm-slim\nWORKDIR /app\nRUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*\n${pnpm?`RUN corepack enable && corepack prepare pnpm@${pnpmVersion} --activate\n`:''}COPY . .\nRUN ${install}\nENV NEXT_TELEMETRY_DISABLED=1\nRUN ${build}\nENV NODE_ENV=production ATOMS_DATA_DIR=/app/data PORT=3000\nRUN mkdir -p /app/data && chown -R node:node /app\nUSER node\nEXPOSE 3000\nHEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"\nCMD ${start}\n`,
  'compose.yaml':'services:\n  app:\n    build: .\n    ports:\n      - "3000:3000"\n    environment:\n      NODE_ENV: production\n      ATOMS_DATA_DIR: /app/data\n    volumes:\n      - app-data:/app/data\n    restart: unless-stopped\nvolumes:\n  app-data:\n',
  '.dockerignore':'node_modules\n.next\n.git\n.env*\ndata\n*.db*\n*.sqlite*\n*.log\n*.zip\n',
 };
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(new Error('下载已取消'));return;}
  const archive=archiver('zip',{zlib:{level:6}});const chunks:Buffer[]=[];
  const abort=()=>{archive.abort();reject(new Error('下载已取消'));};
  const cleanup=()=>signal?.removeEventListener('abort',abort);
  signal?.addEventListener('abort',abort,{once:true});
  archive.on('data',(chunk:Buffer)=>chunks.push(chunk));
  archive.once('error',error=>{cleanup();reject(error);});
  archive.once('warning',error=>{cleanup();archive.abort();reject(error);});
  archive.once('end',()=>{
   cleanup();const buffer=Buffer.concat(chunks);
   if(buffer.length<22||buffer.readUInt32LE(buffer.length-22)!==0x06054b50)reject(new Error('归档校验失败'));
   else resolve(buffer);
  });
  for(const file of files)if(!(file.path in generated))archive.append(file.content,{name:file.path});
  for(const [name,content] of Object.entries(generated))archive.append(content,{name});
  void archive.finalize().catch(error=>{cleanup();reject(error);});
 });
}
