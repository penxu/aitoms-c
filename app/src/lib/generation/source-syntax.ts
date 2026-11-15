import ts from 'typescript';

function parse(file:string,content:string) {
 return ts.createSourceFile(file,content,ts.ScriptTarget.Latest,true,file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS) as ts.SourceFile & {parseDiagnostics:readonly ts.Diagnostic[]};
}
export function sourceSyntaxErrors(file:string,content:string):string[] {
 if(!/\.[cm]?[jt]sx?$/.test(file))return [];
 const source=parse(file,content);
 return source.parseDiagnostics.slice(0,5).map(item=>{const position=source.getLineAndCharacterOfPosition(item.start??0);return `${file}:${position.line+1}:${position.character+1} ${ts.flattenDiagnosticMessageText(item.messageText,' ')}`;});
}
/** 先确认原文有语法错误；仅在移除孤立的外层协议尾标记后完全有效时清理。 */
export function stripInvalidProtocolTail(file:string,content:string):{content:string;notes:string[]} {
 if(!sourceSyntaxErrors(file,content).length)return {content,notes:[]};
 const cleaned=content.replace(/(?:\r?\n\s*<\/(?:parameter|tool_call|function|invoke|antml:parameter)>\s*)+$/,'').trimEnd();
 if(cleaned!==content&&!sourceSyntaxErrors(file,cleaned).length)return {content:cleaned,notes:['移除无效协议尾标记']};
 return {content,notes:[]};
}
