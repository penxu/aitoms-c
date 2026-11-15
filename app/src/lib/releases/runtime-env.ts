import path from 'node:path';
import fs from 'node:fs';
import { config } from '@/lib/config';
import { projectRoot } from '@/lib/workspace/paths';

export const deliveryRoot = path.resolve(config.workspaceRoot,'..');
export function releasePath(projectId:string,id:string):string {
 projectRoot(projectId);
 if(!/^rel_[a-zA-Z0-9_-]+$/.test(id))throw new Error('非法版本 ID');
 return path.join(deliveryRoot,'releases',projectId,id);
}
export function releaseEnv(projectId:string,basePath:string):NodeJS.ProcessEnv {
 const dataDir=path.join(deliveryRoot,'runtime',projectId,'production');
 fs.mkdirSync(dataDir,{recursive:true});
 const env:NodeJS.ProcessEnv={
  LANG:'en_US.UTF-8',NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',
  ATOMS_BASE_PATH:basePath,NEXT_PUBLIC_ATOMS_BASE_PATH:basePath,ATOMS_DATA_DIR:dataDir,DATABASE_PATH:path.join(dataDir,'app.db'),
 };
 const envFile=path.join(deliveryRoot,'runtime',projectId,'env.json');
 if(fs.existsSync(envFile)) {
  const values=JSON.parse(fs.readFileSync(envFile,'utf8')) as Record<string,unknown>;
  for(const [key,value] of Object.entries(values)) {
   if(!/^[A-Z][A-Z0-9_]*$/.test(key)||key in env||/^(NODE_|LD_|DYLD_|ATOMS_|PORT$|HOSTNAME$)/.test(key)||typeof value!=='string')throw new Error(`生产环境变量不允许覆盖运行时设置：${key}`);
   env[key]=value;
  }
 }
 return env;
}
