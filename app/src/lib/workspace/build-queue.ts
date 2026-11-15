declare global {var __atomsBuildQueue:Promise<void>|undefined}
/** One heavy build per platform process, shared by generation and production. */
export async function withBuildSlot<T>(action:()=>Promise<T>):Promise<T> {
 const previous=globalThis.__atomsBuildQueue??Promise.resolve();
 let release!:()=>void;globalThis.__atomsBuildQueue=new Promise<void>(resolve=>{release=resolve;});
 await previous;
 try{return await action();}finally{release();}
}
