import ts from "typescript";
import { applySourceEdits, parseSource, type SourceEdit } from "./source-ast.ts";

/**
 * 模板 UI 组件的属性白名单与确定性归一。
 *
 * 模型常按 shadcn 的肌肉记忆写 `variant="secondary"`（模板 Button 只有 default/outline/ghost），
 * 这类错误不影响逻辑却会让 `tsc --noEmit` 整轮失败，修复阶段又要重写整个文件。
 * 这里在写入磁盘前把可确定的别名映射回合法值，把「生成质量问题」挡在构建之前。
 */

/** templates/next-base/components/ui/button.tsx 中定义的变体 */
export const BUTTON_VARIANTS = ["default", "outline", "ghost"] as const;
/** templates/next-base/components/ui/button.tsx 中定义的尺寸 */
export const BUTTON_SIZES = ["sm", "md", "lg"] as const;

const VARIANT_ALIASES: Record<string, string> = {
  secondary: "outline",
  destructive: "outline",
  danger: "outline",
  error: "outline",
  link: "ghost",
  quiet: "ghost",
  plain: "ghost",
  text: "ghost",
};

const SIZE_ALIASES: Record<string, string> = {
  xs: "sm",
  icon: "md",
  default: "md",
  xl: "lg",
};

/** 只接受模板模块的真实命名导入绑定。 */
function visitUiValues(content: string, visit: (node: ts.StringLiteral, name: string) => void) {
  const { source, checker, valid } = parseSource(content);
  if (!valid) return;
  const bindings = new Map<ts.Symbol, string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.moduleSpecifier.text !== "@/components/ui/button" || statement.importClause?.isTypeOnly) continue;
    const named = statement.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    for (const element of named.elements) {
      const symbol = checker.getSymbolAtLocation(element.name);
      if (symbol && !element.isTypeOnly) bindings.set(symbol, (element.propertyName ?? element.name).text);
    }
  }
  const binding = (node: ts.Node, name: string) => ts.isIdentifier(node) && bindings.get(checker.getSymbolAtLocation(node)!) === name;
  const values = (node: ts.Node, name: string) => {
    if (ts.isStringLiteral(node)) visit(node, name);
    else if (ts.isParenthesizedExpression(node)) values(node.expression, name);
    else if (ts.isConditionalExpression(node)) { values(node.whenTrue, name); values(node.whenFalse, name); }
  };
  const walk = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && binding(node.tagName, "Button")) {
      for (const attr of node.attributes.properties) {
        if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name) || !["variant", "size"].includes(attr.name.text) || !attr.initializer) continue;
        if (ts.isJsxExpression(attr.initializer)) {
          if (attr.initializer.expression) values(attr.initializer.expression, attr.name.text);
        } else values(attr.initializer, attr.name.text);
      }
    }
    if (ts.isCallExpression(node) && binding(node.expression, "buttonVariants")) {
      const arg = node.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) for (const prop of arg.properties) {
        if (ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) && ["variant", "size"].includes(prop.name.text)) values(prop.initializer, prop.name.text);
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(source);
}

export function normalizeUiProps(content: string): { content: string; notes: string[] } {
  const notes: string[] = [];
  const edits: SourceEdit[] = [];
  visitUiValues(content, (node, name) => {
    const allowed: readonly string[] = name === "variant" ? BUTTON_VARIANTS : BUTTON_SIZES;
    const aliases = name === "variant" ? VARIANT_ALIASES : SIZE_ALIASES;
    if (allowed.includes(node.text)) return;
    const key = node.text.trim().toLowerCase();
    const mapped = Object.hasOwn(aliases, key) ? aliases[key] : allowed[0];
    edits.push({ start: node.getStart() + 1, end: node.end - 1, text: mapped });
    notes.push(`${name}="${node.text}" → "${mapped}"`);
  });
  const next = applySourceEdits(content, edits);
  return { content: next, notes: next === content ? [] : notes };
}

const UI_MODULES: Record<string, string> = { button: "Button", card: "Card", input: "Input" };

export function normalizeUiImports(content: string): { content: string; notes: string[] } {
  const { source, valid } = parseSource(content);
  if (!valid) return { content, notes: [] };
  const edits: SourceEdit[] = [];
  const notes: string[] = [];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const match = /^@\/components\/ui\/([A-Za-z]+)$/.exec(statement.moduleSpecifier.text);
    if (!match) continue;
    const canonical = match[1].toLowerCase();
    const exported = UI_MODULES[canonical];
    if (!exported) continue;
    const clause = statement.importClause;
    if (clause?.name && (!clause.namedBindings || ts.isNamedImports(clause.namedBindings))) {
      const local = clause.name.text;
      const names = [local === exported ? exported : `${exported} as ${local}`];
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) names.push(...clause.namedBindings.elements.map((item) => item.getText(source)));
      edits.push({ start: clause.getStart(source), end: clause.end, text: `${clause.isTypeOnly ? "type " : ""}{ ${[...new Set(names)].join(", ")} }` });
      notes.push(`默认导入改为命名导入：${local}`);
    }
    if (canonical !== match[1]) {
      edits.push({ start: statement.moduleSpecifier.getStart(source), end: statement.moduleSpecifier.end, text: `"@/components/ui/${canonical}"` });
      notes.push(`路径大小写修正：${match[1]} → ${canonical}`);
    }
  }
  const next = applySourceEdits(content, edits);
  return { content: next, notes: next === content ? [] : notes };
}

export function normalizeUiSource(content: string): { content: string; notes: string[] } {
  const imports = normalizeUiImports(content);
  const props = normalizeUiProps(imports.content);
  return { content: props.content, notes: [...imports.notes, ...props.notes] };
}

export function findUiViolations(content: string): string[] {
  const violations: string[] = [];
  visitUiValues(content, (node, name) => {
    const allowed: readonly string[] = name === "variant" ? BUTTON_VARIANTS : BUTTON_SIZES;
    if (!allowed.includes(node.text)) violations.push(`${name === "size" ? "Button " : ""}${name}="${node.text}"`);
  });
  return violations;
}
