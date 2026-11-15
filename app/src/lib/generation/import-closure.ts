import fs from'node:fs';import path from'node:path';import ts from'typescript';
/** 只检查工程内模块；第三方包交给依赖安装和编译器。 */
export function checkImportClosure(root:string):string[]{
 const errors:string[]=[];let visited=0;
 const exists=(target:string)=>['','.ts','.tsx','.js','.jsx','.mjs','.json','/index.ts','/index.tsx'].some(s=>{try{return fs.statSync(target+s).isFile()}catch{return false}});
 function walk(dir:string){if(!fs.existsSync(dir))return;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  if(entry.isSymbolicLink()||entry.name.startsWith('.')||['node_modules','data'].includes(entry.name))continue;
  const abs=path.join(dir,entry.name);if(entry.isDirectory()){walk(abs);continue}
  if(!/\.[jt]sx?$/.test(entry.name)||++visited>300||fs.statSync(abs).size>500000)continue;
  const source=ts.createSourceFile(abs,fs.readFileSync(abs,'utf8'),ts.ScriptTarget.Latest,true);
  const check=(value:string)=>{if(!value.startsWith('@/')&&!value.startsWith('.'))return;const target=value.startsWith('@/')?path.join(root,value.slice(2)):path.resolve(dir,value);if(target!==root&&!target.startsWith(root+path.sep)){errors.push(`${path.relative(root,abs)}: 导入越过工程边界 ${value}`);return}if(!exists(target))errors.push(`${path.relative(root,abs)}: 找不到模块 ${value}`)};
  const visit=(node:ts.Node)=>{if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))check(node.moduleSpecifier.text);if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))check(node.arguments[0].text);ts.forEachChild(node,visit)};visit(source);
 }}
 for(const dir of ['app','components','lib','hooks','src'])walk(path.join(root,dir));return errors.slice(0,30);
}
