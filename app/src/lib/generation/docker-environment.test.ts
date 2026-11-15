import test from 'node:test';
import assert from 'node:assert/strict';
import {dockerCliEnvironment} from '../workspace/docker-environment.ts';
test('Docker CLI 使用真实用户主目录，保留控制面连接设置但不传平台密钥',()=>{
 const env=dockerCliEnvironment({HOME:'/root',DOCKER_HOST:'unix:///run/user/1000/docker.sock',DOCKER_CONFIG:'/srv/atoms/.docker',DOCKER_CONTEXT:'rootless',OPENAI_API_KEY:'never-forward',AWS_SECRET_ACCESS_KEY:'never-forward'},'/home/atoms');
 assert.equal(env.HOME,'/home/atoms');assert.equal(env.DOCKER_HOST,'unix:///run/user/1000/docker.sock');assert.equal(env.DOCKER_CONFIG,'/srv/atoms/.docker');assert.equal(env.DOCKER_CONTEXT,'rootless');assert.equal(env.OPENAI_API_KEY,undefined);assert.equal(env.AWS_SECRET_ACCESS_KEY,undefined);
});
