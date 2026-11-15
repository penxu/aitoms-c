import ts from "typescript";
import { applySourceEdits, isClientSource, parseSource, type SourceEdit } from "./source-ast.ts";

/** 仅迁移实际导出处理器/页面的参数绑定，客户端交给模型修复。 */
export function normalizeRouteParams(content: string, kind?: "route" | "page"): { content: string; notes: string[] } {
  const { source, checker, valid } = parseSource(content);
  if (!valid || isClientSource(source)) return { content, notes: [] };
  const edits: SourceEdit[] = [];
  const notes: string[] = [];
  const typed = new Set<ts.Node>();
  const hasModifier = (node: ts.Node, kind: ts.SyntaxKind) => ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === kind);
  const typeParams = (type: ts.TypeNode | undefined) => {
    if (!type || typed.has(type)) return;
    typed.add(type);
    if (ts.isTypeReferenceNode(type)) {
      const symbol = checker.getSymbolAtLocation(type.typeName);
      for (const decl of symbol?.declarations ?? []) {
        if (ts.isInterfaceDeclaration(decl)) members(decl.members);
        else if (ts.isTypeAliasDeclaration(decl)) typeParams(decl.type);
      }
    } else if (ts.isTypeLiteralNode(type)) members(type.members);
  };
  const members = (items: ts.NodeArray<ts.TypeElement>) => {
    for (const member of items) {
      if (!ts.isPropertySignature(member) || !member.type || !member.name || member.name.getText(source) !== "params" || !ts.isTypeLiteralNode(member.type)) continue;
      edits.push({ start: member.type.getStart(source), end: member.type.end, text: `Promise<${member.type.getText(source)}>` });
      notes.push("params 类型补 Promise");
    }
  };
  const handle = (fn: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression, page: boolean) => {
    if (!fn.body) return;
    const parameter = fn.parameters[page ? 0 : 1];
    if (!parameter) return;
    const params = new Set<ts.Symbol>();
    const contexts = new Set<ts.Symbol>();
    if (ts.isObjectBindingPattern(parameter.name)) {
      for (const element of parameter.name.elements) {
        if ((element.propertyName ?? element.name).getText(source) !== "params" || !ts.isIdentifier(element.name)) continue;
        const symbol = checker.getSymbolAtLocation(element.name);
        if (symbol) params.add(symbol);
      }
    } else if (ts.isIdentifier(parameter.name)) {
      const symbol = checker.getSymbolAtLocation(parameter.name);
      if (symbol) contexts.add(symbol);
    }
    if (!params.size && !contexts.size) return;
    typeParams(parameter.type);
    let needsAsync = false;
    const isParams = (node: ts.Node) => (ts.isIdentifier(node) && params.has(checker.getSymbolAtLocation(node)!)) ||
      (ts.isPropertyAccessExpression(node) && node.name.text === "params" && ts.isIdentifier(node.expression) && contexts.has(checker.getSymbolAtLocation(node.expression)!));
    const walk = (node: ts.Node) => {
      // 不能把 await 插入嵌套同步函数、类方法或回调。
      if (node !== fn.body && (ts.isFunctionLike(node) || ts.isClassLike(node))) return;
      if (ts.isPropertyAccessExpression(node) && isParams(node.expression)) {
        const value = node.expression;
        const text = ts.isPropertyAccessExpression(value) ? `${value.expression.getText(source)}.params` : value.getText(source);
        edits.push({ start: value.getStart(source), end: node.end, text: `(await ${text}).${node.name.text}` });
        notes.push("路由 params 取值补 await");
        needsAsync = true;
        return;
      }
      if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer && isParams(node.initializer)) {
        edits.push({ start: node.initializer.getStart(source), end: node.initializer.getStart(source), text: "await " });
        notes.push("路由 params 解构补 await");
        needsAsync = true;
      }
      ts.forEachChild(node, walk);
    };
    walk(fn.body);
    if (needsAsync && !hasModifier(fn, ts.SyntaxKind.AsyncKeyword)) {
      if (fn.type && !(ts.isTypeReferenceNode(fn.type) && fn.type.typeName.getText(source) === "Promise")) {
        edits.push({ start: fn.type.getStart(source), end: fn.type.end, text: `Promise<${fn.type.getText(source)}>` });
      }
      const token = fn.getChildren(source).find((n) => n.kind === ts.SyntaxKind.FunctionKeyword);
      edits.push({ start: token?.getStart(source) ?? fn.getStart(source), end: token?.getStart(source) ?? fn.getStart(source), text: "async " });
    }
  };
  const handlers = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      const page = !!hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
      if ((page && kind !== "route") || (!page && kind !== "page" && statement.name && handlers.has(statement.name.text))) handle(statement, page);
    }
    if (kind !== "page" && ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && handlers.has(decl.name.text) && decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) handle(decl.initializer, false);
      }
    }
    if (kind !== "route" && ts.isExportAssignment(statement) && !statement.isExportEquals && ts.isIdentifier(statement.expression)) {
      const decl = checker.getSymbolAtLocation(statement.expression)?.valueDeclaration;
      const fn = decl && ts.isVariableDeclaration(decl) ? decl.initializer : decl;
      if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) || ts.isFunctionDeclaration(fn))) handle(fn, true);
    }
  }
  const next = applySourceEdits(content, edits);
  return { content: next, notes: next === content ? [] : notes };
}
