import test from 'node:test';
import assert from 'node:assert/strict';
import {execute} from './commands.ts';
test('build command preserves production environment instead of forcing development',async(t)=>{
 let output='';try {await execute(process.cwd(),process.execPath,['-e','process.stdout.write(process.env.NODE_ENV)'],{PATH:process.env.PATH,NODE_ENV:'production'},s=>{output+=s;});} catch(error) {if(error instanceof Error && /安全隔离(初始化失败|不可用|不支持)|Docker 隔离不可用/.test(error.message)){t.skip(error.message);return;}throw error;}
 assert.equal(output,'production');
});
