import os from 'node:os';
/** 仅供可信 Docker CLI 使用；工程容器仍使用独立的业务环境白名单。 */
export function dockerUserHome():string {try{return os.userInfo().homedir;}catch{return os.homedir();}}
export function dockerCliEnvironment(input:Record<string,string|undefined>=process.env,home=dockerUserHome()):NodeJS.ProcessEnv {
 const result:NodeJS.ProcessEnv={PATH:'/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin',HOME:home,NODE_ENV:'production'};
 for(const name of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_CONFIG','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH','XDG_RUNTIME_DIR']) {
  if(input[name])result[name]=input[name];
 }
 return result;
}
