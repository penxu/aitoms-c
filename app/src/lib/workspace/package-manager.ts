/** npm consumes a separator; pnpm passes it through to the application. */
export function scriptArguments(manager:'npm'|'pnpm',script:string,args:string[]):string[] {
 return ['run',script,...(manager==='npm'?['--']:[]),...args];
}
