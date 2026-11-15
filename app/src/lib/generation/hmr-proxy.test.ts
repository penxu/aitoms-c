import test from 'node:test';
import assert from 'node:assert/strict';
import {previewUpgradeHeaders} from '../../../preview-proxy-headers.mjs';

test('同源公网HMR升级转为本机身份，保留WebSocket握手与cookie',()=>{
 const headers=previewUpgradeHeaders({host:'119.29.93.214:3000',origin:'http://119.29.93.214:3000',upgrade:'websocket',connection:'Upgrade','sec-websocket-key':'fixture',cookie:'session=fixture','x-forwarded-host':'spoof.invalid'},4001);
 assert.equal(headers.host,'localhost:4001');assert.equal(headers.origin,'http://localhost:4001');assert.equal(headers['x-forwarded-host'],'localhost:4001');assert.equal(headers['x-forwarded-proto'],'http');assert.equal(headers['sec-websocket-key'],'fixture');assert.equal(headers.cookie,'session=fixture');
});
test('HMR拒绝跨源、非法Origin和端口，兼容HTTPS反代及无Origin工具连接',()=>{
 assert.throws(()=>previewUpgradeHeaders({host:'app.example',origin:'https://foreign.example'},4001));
 assert.throws(()=>previewUpgradeHeaders({host:'app.example',origin:'null'},4001));
 assert.equal(previewUpgradeHeaders({host:'app.example',origin:'https://app.example'},4001).origin,'http://localhost:4001');
 assert.equal(previewUpgradeHeaders({host:'app.example'},4001).host,'localhost:4001');
 assert.throws(()=>previewUpgradeHeaders({host:'app.example'},0));
});
