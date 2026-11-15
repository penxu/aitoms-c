import ts from 'typescript';
/** 保留完整公开类型/签名，长实现可以省略，但不能按字符切掉接口。 */
export function dependencyContext(source:string,path='dependency.ts'):string{
 if(source.length<=60000)return source;
 const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const contracts:string[]=[];
 for(const node of ast.statements){
  if(ts.isImportDeclaration(node)||ts.isInterfaceDeclaration(node)||ts.isTypeAliasDeclaration(node)||ts.isEnumDeclaration(node)||ts.isExportDeclaration(node)){contracts.push(node.getText(ast));continue}
  if(!ts.canHaveModifiers(node)||!ts.getModifiers(node)?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))continue;
  if(ts.isFunctionDeclaration(node)){contracts.push(source.slice(node.getStart(ast),node.body?.getStart(ast)??node.end).trim()+';');continue}
  if(ts.isVariableStatement(node))for(const d of node.declarationList.declarations)contracts.push(`export declare const ${d.name.getText(ast)}: ${d.type?.getText(ast)??'unknown'};`);
 }
 return `/* 完整公开契约；实现超过上下文预算，不能臆造省略部分 */\n${contracts.join('\n')}\n/* 实现参考 */\n${source.slice(0,12000)}`;
}
