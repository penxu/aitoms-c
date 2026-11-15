import {setTimeout as delay} from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";
import {chromium,type Browser} from 'playwright';

export type AcceptanceStep =
 | {action:'fill'|'select';label:string;value:string}
 | {action:'check';label:string;checked:boolean}
 | {action:'click';role:'button'|'link';name:string}
 | {action:'press';key:string;label?:string;role?:'button'|'link'|'textbox';name?:string}
 | {action:'expectText'|'expectAbsent';text:string}
 | {action:'expectValue';label:string;value:string}
 | {action:'expectRole'|'expectFocused';role:'button'|'link'|'textbox';name:string}
 | {action:'mockRequest';path:string;status:number;body?:unknown}
 | {action:'restoreRequests'}
 | {action:'reload'}
 | {action:'goto';route:string}
 | {action:'request';path:string;method:'GET'|'POST'|'PATCH'|'DELETE';body?:unknown;expectStatus:number;jsonContains?:Record<string,unknown>};
export interface AcceptanceCheck {id:string;route:string;description?:string;steps:AcceptanceStep[]}
export interface AcceptanceResult {id:string;status:'passed'|'failed';durationMs:number;error?:string;screenshots?:{width:number;file:string}[]}
const safeRoute=(route:unknown)=>{
 if(typeof route!=='string'||!route.startsWith('/')||route.startsWith('//')||/[\\\s]/.test(route))return false;
 try {const decoded=decodeURIComponent(route);return !decoded.split(/[/?#]/).includes('..')&&!decoded.startsWith('//')&&!decoded.includes('\\');}catch{return false;}
};
const validStatus=(value:unknown)=>Number.isInteger(value)&&Number(value)>=100&&Number(value)<=599;
export function validateAcceptance(input:unknown):string[] {
 if(!Array.isArray(input)||!input.length)return ['缺少可执行验收步骤'];
 const errors:string[]=[];const ids=new Set<string>();
 if(input.length>20)return ['验收最多20项'];
 for(const check of input){
  if(!check||typeof check.id!=='string'||ids.has(check.id)||!safeRoute(check.route)||!Array.isArray(check.steps)||!check.steps.length||check.steps.length>25){errors.push('验收ID、路由或步骤不合法');continue;}
  ids.add(check.id);let assertion=false;
  for(const step of check.steps){
   if(!step||typeof step.action!=='string'){errors.push('验收步骤不合法');continue;}
   if(step.action==='expectText'||step.action==='expectAbsent'){assertion=true;if(typeof step.text!=='string'||!step.text.trim())errors.push('文本断言为空');}
   else if(step.action==='expectRole'||step.action==='expectFocused'){assertion=true;if(!['button','link','textbox'].includes(step.role)||typeof step.name!=='string'||!step.name.trim())errors.push('可访问控件断言不合法');}
   else if(step.action==='expectValue'){assertion=true;if(typeof step.label!=='string'||typeof step.value!=='string')errors.push('字段断言不合法');}
   else if(step.action==='request'){assertion=true;if(!safeRoute(step.path)||!['GET','POST','PATCH','DELETE'].includes(step.method)||!validStatus(step.expectStatus))errors.push('接口断言不合法');}
   else if(step.action==='mockRequest'){if(!safeRoute(step.path)||!validStatus(step.status))errors.push('错误注入不合法');}
   else if(step.action==='check'){if(typeof step.label!=='string'||typeof step.checked!=='boolean')errors.push('勾选步骤不合法');}
   else if(step.action==='fill'||step.action==='select'){if(typeof step.label!=='string'||typeof step.value!=='string')errors.push('填写步骤不合法');}
   else if(step.action==='click'){if(!['button','link'].includes(step.role)||typeof step.name!=='string')errors.push('点击步骤不合法');}
   else if(step.action==='press'){if(typeof step.key!=='string'||!step.key.trim()||(step.label!==undefined&&typeof step.label!=='string')||(step.role!==undefined&&(!['button','link','textbox'].includes(step.role)||typeof step.name!=='string'||!!step.label)))errors.push('键盘步骤不合法');}
   else if(step.action==='goto'){if(!safeRoute(step.route))errors.push('验收禁止跳转到外部地址');}
   else if(!['reload','restoreRequests'].includes(step.action))errors.push('未知验收动作');
  }
  if(!assertion)errors.push(`${check.id} 缺少可观察结果断言`);
 }
 return errors;
}
/** 标签的必填星号是装饰文字；保持完整标签匹配，兼容原生label文本。 */
export function fieldLabelPattern(label:string):RegExp {
 return new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:\\s*\\*)?$`);
}
/** jsonContains 是递归子集，允许接口另外返回 message/id 等字段。 */
export function containsJson(actual:unknown,expected:unknown):boolean {
 if(expected===null||typeof expected!=='object')return Object.is(actual,expected);
 if(actual===null||typeof actual!=='object')return false;
 if(Array.isArray(expected))return Array.isArray(actual)&&expected.length===actual.length&&expected.every((value,index)=>containsJson(actual[index],value));
 return Object.entries(expected).every(([key,value])=>containsJson((actual as Record<string,unknown>)[key],value));
}
/** 操作仅指向候选服务；调用方为各业务用例提供独立测试数据库。 */
export async function runAcceptance(baseUrl:string,checks:AcceptanceCheck[],signal:AbortSignal,launch?:()=>Promise<Browser>,channel='',executablePath='',artifactDir?:string):Promise<AcceptanceResult[]> {
 const errors=validateAcceptance(checks);if(errors.length)throw new Error(errors.join('；'));
 signal.throwIfAborted();
 const browser=await(launch??(()=>chromium.launch({headless:true,...(executablePath?{executablePath}:channel?{channel}:{})})))();
 const abort=()=>{void browser.close();};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 const results:AcceptanceResult[]=[];
 try {
  for(const check of checks){
   const started=Date.now();let page:Awaited<ReturnType<Browser['newPage']>>|undefined;
   try {
    signal.throwIfAborted();page=await browser.newPage();page.setDefaultTimeout(10000);
    const browserErrors:string[]=[];page.on('pageerror',error=>browserErrors.push(error.message));
    await page.goto(baseUrl+check.route,{waitUntil:'networkidle',timeout:20000});
    for(const step of check.steps){
     signal.throwIfAborted();
     if(step.action==='fill')await page.getByLabel(fieldLabelPattern(step.label)).fill(step.value);
     else if(step.action==='select')await page.getByLabel(fieldLabelPattern(step.label)).selectOption(step.value);
     else if(step.action==='check')await page.getByLabel(fieldLabelPattern(step.label)).setChecked(step.checked);
     else if(step.action==='click')await page.getByRole(step.role,{name:step.name,exact:true}).click();
     else if(step.action==='press'){if(step.label)await page.getByLabel(fieldLabelPattern(step.label)).press(step.key);else if(step.role&&step.name)await page.getByRole(step.role,{name:step.name,exact:true}).press(step.key);else await page.keyboard.press(step.key);}
     else if(step.action==='expectText')await page.getByText(step.text,{exact:false}).first().waitFor({state:'visible'});
     else if(step.action==='expectAbsent')await page.getByText(step.text,{exact:false}).first().waitFor({state:'hidden'});
     else if(step.action==='expectRole'||step.action==='expectFocused'){const target=page.getByRole(step.role,{name:step.name,exact:true});await target.waitFor({state:'visible'});if(step.action==='expectFocused'&&!await target.evaluate(node=>node===document.activeElement))throw Error(`控件 ${step.name} 未获得焦点`);}
     else if(step.action==='expectValue'){const actual=await page.getByLabel(fieldLabelPattern(step.label)).inputValue();if(actual!==step.value)throw Error(`字段 ${step.label} 的值不匹配`);}
     else if(step.action==='mockRequest'){const target=new URL(baseUrl+step.path);await page.route(url=>url.origin===target.origin&&url.pathname===target.pathname,route=>route.fulfill({status:step.status,contentType:'application/json',body:JSON.stringify(step.body??{error:'验收注入错误'})}));}
     else if(step.action==='restoreRequests')await page.unrouteAll();
     else if(step.action==='reload')await page.reload({waitUntil:'networkidle'});
     else if(step.action==='goto')await page.goto(baseUrl+step.route,{waitUntil:'networkidle'});
     else if(step.action==='request'){
      const deadline=Date.now()+(step.method==='GET'?5000:0);
      while(true){
       signal.throwIfAborted();
       const response=await page.request.fetch(baseUrl+step.path,{method:step.method,data:step.body});
       const body=step.jsonContains?await response.json().catch(()=>null):undefined;
       if(response.status()===step.expectStatus&&(!step.jsonContains||containsJson(body,step.jsonContains)))break;
       if(step.method!=='GET'||Date.now()>=deadline)throw Error(`API ${step.path}: 状态 ${response.status()}，期望 ${step.expectStatus}；预期JSON ${JSON.stringify(step.jsonContains)}；实际JSON ${JSON.stringify(body)?.slice(0,2000)}`);
       await delay(150,undefined,{signal});
      }
     }
    }
    const screenshots:{width:number;file:string}[]=[];
    for(const width of [375,768,1440]){
     await page.setViewportSize({width,height:900});
     if(artifactDir){fs.mkdirSync(artifactDir,{recursive:true});const file=path.join(artifactDir,`${check.id.replace(/[^A-Za-z0-9_-]/g,"_")}-${width}.png`);await page.screenshot({path:file,fullPage:true});screenshots.push({width,file});}
     if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2))throw Error(`页面在 ${width}px 视口发生横向溢出`);
    }
    if(browserErrors.length)throw Error(browserErrors.join('\n'));
    results.push({id:check.id,status:'passed',durationMs:Date.now()-started,...(screenshots.length?{screenshots}:{})});
   }catch(error){
    let context='';try{context=page?`\n实际可访问页面：\n${(await page.locator('body').ariaSnapshot()).slice(0,3500)}`:'';}catch{}
    results.push({id:check.id,status:'failed',durationMs:Date.now()-started,error:(error instanceof Error?error.message:String(error))+context});if(signal.aborted)throw error;
   }
   finally {await page?.close();}
  }
 }finally {signal.removeEventListener('abort',abort);await browser.close();}
 return results;
}
