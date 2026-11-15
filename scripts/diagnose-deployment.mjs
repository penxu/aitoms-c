#!/usr/bin/env -S node --experimental-strip-types
/** 只读诊断：不输出密钥、Docker 地址或配置文件内容，不更改权限。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {getModelConfigurationError} from '../app/src/lib/generation/model-configuration.ts';
import {dockerCliEnvironment,dockerUserHome} from '../app/src/lib/workspace/docker-environment.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const app=path.join(root,'app');
const require=createRequire(path.join(app,'package.json'));
require('@next/env').loadEnvConfig(app,process.env.NODE_ENV!=='production',{info(){},error(){}});
let user;try{user=os.userInfo();}catch{user={username:`uid:${process.getuid?.()??'unknown'}`,homedir:dockerUserHome()};}
const backend=process.env.WORKSPACE_EXECUTION_BACKEND??'auto';
const modelError=getModelConfigurationError();
const report={node:process.version,user:{name:user.username,uid:process.getuid?.(),gid:process.getgid?.(),groups:process.getgroups?.(),home:user.homedir},runningInContainer:fs.existsSync('/.dockerenv'),backend,model:{ok:!modelError,code:modelError?.code??null,message:modelError?.error??null},native:{ok:false,message:''},docker:{ok:false,message:'',configuredConnectionVariables:[]},warnings:[]};
if(process.platform==='linux'){
 const probe=spawnSync('bwrap',['--unshare-user','--unshare-pid','--ro-bind','/','/','--','/usr/bin/true'],{encoding:'utf8',timeout:5000});
 report.native={ok:probe.status===0,message:probe.status===0?'bubblewrap 用户命名空间可用':'bubblewrap 不存在或用户命名空间被面板/容器运行时限制'};
}else if(process.platform==='darwin'){
 const probe=spawnSync('/usr/bin/sandbox-exec',['-p','(version 1)(deny default)(allow process*)(allow file-read*)','/usr/bin/true'],{encoding:'utf8',timeout:5000});
 report.native={ok:probe.status===0,message:probe.status===0?'sandbox-exec 可用':'sandbox-exec 不可用'};
}else report.native.message='当前系统未提供受支持的 native 隔离';
const env=dockerCliEnvironment();
report.docker.configuredConnectionVariables=Object.keys(env).filter(name=>name.startsWith('DOCKER_'));
const probe=spawnSync('docker',['version','--format','{{.Server.Version}}'],{env,encoding:'utf8',timeout:10000});
report.docker.ok=probe.status===0;
report.docker.message=probe.status===0?'当前用户可连接 Docker daemon':probe.error?.code==='ENOENT'?'当前用户 PATH 中没有 Docker CLI':/permission denied|eacces/i.test(probe.stderr??'')?'当前 UID 无权读取 Docker 配置或连接 daemon/socket':'Docker daemon 不可达或连接配置无效';
if(process.env.HOME&&process.env.HOME!==user.homedir)report.warnings.push('平台继承的 HOME 与真实 UID 不一致；工程控制面已使用真实用户主目录。');
if(report.runningInContainer&&(backend==='docker'||backend==='auto'&&!report.native.ok))report.warnings.push('容器内调用宿主 Docker 还必须核对工程/pnpm 的宿主路径一致性及 loopback 网络代理；仅挂 socket 或改权限不足以证明可部署。');
if(backend==='native'&&!report.native.ok)report.warnings.push('native 后端不可用：需支持用户命名空间的运行时，或改用宿主机 Node/PM2 部署；不会自动降低隔离。');
const runtimeOk=backend==='docker'?report.docker.ok:backend==='native'?report.native.ok:report.native.ok||report.docker.ok;
console.log(JSON.stringify({...report,ready:report.model.ok&&runtimeOk},null,2));
if(!report.model.ok||!runtimeOk)process.exitCode=1;
