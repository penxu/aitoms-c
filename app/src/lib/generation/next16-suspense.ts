import ts from "typescript";
import { applySourceEdits, isClientSource, parseSource, type SourceEdit } from "./source-ast.ts";

/** 仅根据真实导入绑定和默认导出构建边界，不匹配字符串/注释。 */
export function normalizeSuspenseBounds(content: string): { content: string; notes: string[] } {
  const { source, checker, valid } = parseSource(content);
  if (!valid || !isClientSource(source)) return { content, notes: [] };
  const hooks = new Set<ts.Symbol>();
  const suspense = new Set<ts.Symbol>();
  let reactImport: ts.NamedImports | undefined;
  let suspenseName: string | undefined;
  const names = new Set<string>();
  const identifiers = (node: ts.Node) => { if (ts.isIdentifier(node)) names.add(node.text); ts.forEachChild(node, identifiers); };
  identifiers(source);
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.importClause?.isTypeOnly) continue;
    const named = statement.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    if (statement.moduleSpecifier.text === "react") reactImport = named;
    for (const spec of named.elements) {
      if (spec.isTypeOnly) continue;
      const imported = (spec.propertyName ?? spec.name).text;
      const symbol = checker.getSymbolAtLocation(spec.name);
      if (!symbol) continue;
      if (statement.moduleSpecifier.text === "next/navigation" && imported === "useSearchParams") hooks.add(symbol);
      if (statement.moduleSpecifier.text === "react" && imported === "Suspense") { suspense.add(symbol); suspenseName = spec.name.text; }
    }
  }
  let usesHook = false;
  let hasBoundary = false;
  const walk = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && hooks.has(checker.getSymbolAtLocation(node.expression)!)) usesHook = true;
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName) && suspense.has(checker.getSymbolAtLocation(node.tagName)!)) hasBoundary = true;
    ts.forEachChild(node, walk);
  };
  walk(source);
  if (!usesHook || hasBoundary) return { content, notes: [] };
  const unique = (base: string) => { let name = base; for (let i = 2; names.has(name); i++) name = `${base}${i}`; names.add(name); return name; };
  const edits: SourceEdit[] = [];
  let componentName: string | undefined;
  let hasProps = false;
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) {
      componentName = statement.name.text;
      hasProps = statement.parameters.length > 0;
      for (const modifier of statement.modifiers) if (modifier.kind === ts.SyntaxKind.DefaultKeyword || modifier.kind === ts.SyntaxKind.ExportKeyword) {
        edits.push({ start: modifier.getStart(source), end: modifier.end + (content[modifier.end] === " " ? 1 : 0), text: "" });
      }
    } else if (ts.isExportAssignment(statement) && !statement.isExportEquals && ts.isIdentifier(statement.expression)) {
      const symbol = checker.getSymbolAtLocation(statement.expression);
      const decl = symbol?.valueDeclaration;
      const component = decl && ts.isVariableDeclaration(decl) ? decl.initializer : decl;
      if (!component || (!ts.isArrowFunction(component) && !ts.isFunctionExpression(component) && !ts.isFunctionDeclaration(component))) continue;
      componentName = statement.expression.text;
      hasProps = component.parameters.length > 0;
      edits.push({ start: statement.getStart(source), end: statement.end, text: "" });
    }
  }
  if (!componentName) return { content, notes: [] };
  if (!suspenseName) {
    suspenseName = unique("Suspense");
    const specifier = suspenseName === "Suspense" ? "Suspense" : `Suspense as ${suspenseName}`;
    if (reactImport) {
      const items = reactImport.elements.map((item) => item.getText(source));
      edits.push({ start: reactImport.getStart(source), end: reactImport.end, text: `{ ${[...items, specifier].join(", ")} }` });
    } else {
      edits.push({ start: source.end, end: source.end, text: `\nimport { ${specifier} } from "react";\n` });
    }
  }
  const root = unique("SuspenseRoot");
  const propsType = hasProps ? `props: import("react").ComponentProps<typeof ${componentName}>` : "";
  // 与末尾新增 import 合并成同一插入，避免相同偏移处覆盖。
  const wrapper = `\n\nexport default function ${root}(${propsType}) {\n  return (\n    <${suspenseName} fallback={null}>\n      <${componentName}${hasProps ? " {...props}" : ""} />\n    </${suspenseName}>\n  );\n}\n`;
  const last = edits.find((edit) => edit.start === source.end && edit.end === source.end);
  if (last) last.text += wrapper;
  else edits.push({ start: source.end, end: source.end, text: wrapper });
  const next = applySourceEdits(content, edits);
  return { content: next, notes: next === content ? [] : [`useSearchParams 页面补 Suspense 边界（${componentName}）`] };
}
