import ts from "typescript";

export interface SourceEdit { start: number; end: number; text: string }

/** 内存源码绑定分析，不读取或执行生成工程。 */
export function parseSource(content: string) {
  const source = ts.createSourceFile("source.tsx", content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const host = ts.createCompilerHost({ noLib: true });
  host.getSourceFile = (name) => name === source.fileName ? source : undefined;
  const program = ts.createProgram([source.fileName], { noLib: true, jsx: ts.JsxEmit.Preserve }, host);
  return { source, checker: program.getTypeChecker(), valid: program.getSyntacticDiagnostics(source).length === 0 };
}

/** 只修改明确的语法区间，保留其他字节；语法无效时拒绝修改。 */
export function applySourceEdits(content: string, edits: SourceEdit[]): string {
  let result = content;
  let boundary = content.length + 1;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    if (edit.end > boundary) return content;
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    boundary = edit.start;
  }
  return parseSource(result).valid ? result : content;
}

export function isClientSource(source: ts.SourceFile): boolean {
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    if (statement.expression.text === "use client") return true;
  }
  return false;
}
