export async function findAvailablePort(min:number,max:number,used:Set<number>,available:(port:number)=>Promise<boolean>):Promise<number> {
 if(!Number.isInteger(min)||!Number.isInteger(max)||min<1||max>65535||max<min)throw new Error('端口池配置无效');
 for(let port=min;port<=max;port++)if(!used.has(port)&&await available(port))return port;
 throw new Error('端口池已耗尽，无法分配新端口');
}
