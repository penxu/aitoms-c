import test from'node:test';import assert from'node:assert/strict';
import{validateAcceptance,runAcceptance,containsJson,fieldLabelPattern}from'./acceptance.ts';
test('验收必须有断言，且不能跳转到工程外域名',()=>{assert.equal(validateAcceptance([{id:'AC-01',route:'/',steps:[{action:'click',role:'button',name:'提交'}]}]).length>0,true);assert.equal(validateAcceptance([{id:'AC-01',route:'https://evil',steps:[{action:'expectText',text:'完成'}]}]).length>0,true)});
test('业务操作失败不能记为通过，仍关闭浏览器',async()=>{let closed=false;const browser={newPage:async()=>({goto:async()=>{},setDefaultTimeout(){},close:async()=>{},getByText:()=>({first:()=>({waitFor:async()=>{throw Error('missing')}})}),on(){}}),close:async()=>{closed=true}};const result=await runAcceptance('http://localhost:4000/p/p1',[{id:'AC-01',route:'/',steps:[{action:'expectText',text:'成功'}]}],new AbortController().signal,async()=>browser as never);assert.equal(result[0].status,'failed');assert.equal(closed,true)});

test('接口子集断言递归匹配错误码而不要求服务端删掉message',()=>{assert.equal(containsJson({error:{code:'INVALID_TITLE',message:'书名过长'}},{error:{code:'INVALID_TITLE'}}),true);assert.equal(containsJson({error:{code:'OTHER'}},{error:{code:'INVALID_TITLE'}}),false)});
test('编码的越界路径拒绝，键盘与错误注入步骤可执行',()=>{assert.ok(validateAcceptance([{id:'AC-1',route:'/%2e%2e/secret',steps:[{action:'expectText',text:'x'}]}]).length);assert.deepEqual(validateAcceptance([{id:'AC-1',route:'/',steps:[{action:'mockRequest',path:'/api/books',status:500},{action:'reload'},{action:'expectText',text:'重试'},{action:'restoreRequests'},{action:'press',label:'书名',key:'Enter'},{action:'expectValue',label:'书名',value:''}]}]),[])});

test('完整字段名容忍装饰必填星号，拒绝相似标签误命中',()=>{const pattern=fieldLabelPattern('书名');assert.equal(pattern.test('书名 *'),true);assert.equal(pattern.test('书名'),true);assert.equal(pattern.test('原书名'),false);assert.equal(fieldLabelPattern('标题(可选)').test('标题(可选) *'),true)});

test('可访问控件断言、下拉与复选框保留真实交互语义',()=>{assert.deepEqual(validateAcceptance([{id:'AC-1',route:'/',steps:[{action:'select',label:'服务',value:'bath'},{action:'check',label:'同意',checked:true},{action:'expectRole',role:'button',name:'提交'},{action:'expectFocused',role:'textbox',name:'姓名'}]}]),[]);assert.ok(validateAcceptance([{id:'AC-1',route:'/',steps:[{action:'expectRole',role:'arbitrary',name:'提交'}]}]).length)});

test('API断言使用浏览器会话与请求拦截，并保留实际错误JSON',async()=>{
 let nodeRequestUsed=false;let browserRequest:unknown;
 const page={goto:async()=>{},setDefaultTimeout(){},on(){},close:async()=>{},setViewportSize:async()=>{},
  request:{fetch:async()=>{nodeRequestUsed=true;return {status:()=>401};}},
  evaluate:async(_fn:unknown,args?:unknown)=>{if(args){browserRequest=args;return {status:400,body:{error:'备注过长'}};}return false;},
  locator:()=>({ariaSnapshot:async()=>''})};
 const browser={newPage:async()=>page,close:async()=>{}};
 const result=await runAcceptance('http://127.0.0.1:4000/p/p1',[{id:'AC-1',route:'/',steps:[{action:'request',path:'/api/bookings',method:'POST',body:{note:'x'},expectStatus:400,jsonContains:{error:'备注过长'}}]}],new AbortController().signal,async()=>browser as never);
 assert.equal(result[0].status,'passed');assert.equal(nodeRequestUsed,false);assert.deepEqual(browserRequest,{url:'http://127.0.0.1:4000/p/p1/api/bookings',method:'POST',body:{note:'x'}});
});

test('没有JSON子集断言时也报告实际接口错误，避免undefined诊断',async()=>{
 const page={goto:async()=>{},setDefaultTimeout(){},on(){},close:async()=>{},evaluate:async()=>({status:401,body:{error:'请先登录'}}),locator:()=>({ariaSnapshot:async()=>''})};
 const results=await runAcceptance('http://localhost:4000/p/p1',[{id:'AC-1',route:'/',steps:[{action:'request',path:'/api/bookings',method:'POST',expectStatus:400}]}],new AbortController().signal,async()=>({newPage:async()=>page,close:async()=>{}}) as never);
 assert.equal(results[0].status,'failed');assert.match(results[0].error??'',/请先登录/);
});
