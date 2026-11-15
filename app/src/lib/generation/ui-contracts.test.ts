import test from "node:test";
import assert from "node:assert/strict";
import { findUiViolations, normalizeUiImports, normalizeUiProps, normalizeUiSource } from "./ui-contracts.ts";

test("Button 的 shadcn 习惯变体被归一为模板合法值", () => {
  const { content, notes } = normalizeUiProps(
    `import { Button } from "@/components/ui/button";
const first = <Button variant="secondary" size="icon">确定</Button>;\nconst second = <Button variant="destructive">删除</Button>;`,
  );

  assert.match(content, /variant="outline"/);
  assert.match(content, /size="md"/);
  assert.equal(content.includes('variant="secondary"'), false);
  assert.equal(content.includes('variant="destructive"'), false);
  assert.equal(notes.length, 3);
  assert.deepEqual(findUiViolations(content), []);
});

test("buttonVariants 调用同样归一", () => {
  const { content } = normalizeUiProps(
    `import { buttonVariants } from "@/components/ui/button";
const cls = buttonVariants({ variant: "link", size: "xs" });`,
  );
  assert.match(content, /variant: "ghost"/);
  assert.match(content, /size: "sm"/);
});

test("Input 的原生 size 不被误改", () => {
  const source = `<Input size="md" name="email" />`;
  const { content, notes } = normalizeUiProps(source);
  assert.equal(content, source);
  assert.deepEqual(notes, []);
});

test("合法值保持不变", () => {
  const source = `import { Button } from "@/components/ui/button";
<Button variant="ghost" size="lg">取消</Button>`;
  const { content, notes } = normalizeUiProps(source);
  assert.equal(content, source);
  assert.deepEqual(notes, []);
});

test("未归一的非法值可被检出", () => {
  assert.deepEqual(findUiViolations(`import { Button } from "@/components/ui/button";
<Button variant="secondary" size="icon" />`), [
    'variant="secondary"',
    'Button size="icon"',
  ]);
});

test("JSX 三元表达式里的非法变体也会归一", () => {
  const { content, notes } = normalizeUiProps(
    'import { Button } from "@/components/ui/button";\n<Button variant={tool === "remove" ? "danger" : "secondary"}>删除</Button>',
  );
  assert.ok(content.includes('variant={tool === "remove" ? "outline" : "outline"}'));
  assert.ok(content.includes('"remove"'), "比较用的字符串不应被改写");
  assert.equal(notes.length, 2);
});

test("整体为字面量的表达式同样归一", () => {
  assert.ok(
    normalizeUiProps(`import { Button } from "@/components/ui/button";
<Button variant={"secondary"}>确定</Button>`).content.includes(
      `variant={"outline"}`,
    ),
  );
});

test("默认导入改写为命名导入，路径统一小写", () => {
  const { content, notes } = normalizeUiImports(
    'import Button from "@/components/ui/Button";\nimport Card from "@/components/ui/Card";\n',
  );
  assert.match(content, /import \{ Button \} from "@\/components\/ui\/button";/);
  assert.match(content, /import \{ Card \} from "@\/components\/ui\/card";/);
  assert.equal(content.includes("ui/Button"), false);
  assert.equal(notes.length, 4);
});

test("默认导入与命名导入混用时合并", () => {
  const { content } = normalizeUiImports(
    'import Button, { buttonVariants } from "@/components/ui/Button";',
  );
  assert.equal(content, 'import { Button, buttonVariants } from "@/components/ui/button";');
});

test("已符合约定的导入保持原样", () => {
  const source = 'import { Card, CardContent } from "@/components/ui/card";';
  const { content, notes } = normalizeUiImports(source);
  assert.equal(content, source);
  assert.deepEqual(notes, []);
});

test("只修路径大小写，不动其他模块", () => {
  assert.equal(
    normalizeUiImports('import { Input } from "@/components/ui/Input";').content,
    'import { Input } from "@/components/ui/input";',
  );
  const other = 'import GameBoard from "@/components/game/GameBoard";';
  assert.equal(normalizeUiImports(other).content, other);
});

test("normalizeUiSource 同时处理属性与导入", () => {
  const { content, notes } = normalizeUiSource(
    'import Button from "@/components/ui/Button";\nexport function A(){ return <Button variant="secondary" size="icon" />; }\n',
  );
  assert.match(content, /import \{ Button \} from "@\/components\/ui\/button";/);
  assert.match(content, /variant="outline"/);
  assert.match(content, /size="md"/);
  assert.ok(notes.length >= 3);
});


test("业务variant、字符串及注释不改", () => {
 const source = `export const product = { variant: "premium" };
const text = '<Button variant="danger" />';
// variant="danger"`;
 assert.equal(normalizeUiSource(source).content, source);
 assert.deepEqual(findUiViolations(source), []);
});
test("模板别名按绑定归一且不改遮蔽变量", () => {
 const source = `import { Button as Action, buttonVariants as styles } from "@/components/ui/button";
const view = <Action variant="secondary" size="icon" />;
const cls = styles({variant: "link", size: "xs"});
function inner(Action: unknown) { return <Action variant="premium" />; }`;
 const result = normalizeUiSource(source).content;
 assert.ok(result.includes('<Action variant="outline" size="md" />'));
 assert.ok(result.includes('styles({variant: "ghost", size: "sm"})'));
 assert.ok(result.includes('<Action variant="premium" />'));
});
test("默认导入别名保留且不改注释伪导入", () => {
 const source = `// import Button from "@/components/ui/Button";
import Action from "@/components/ui/Button";
const view = <Action variant="danger" />;`;
 const result = normalizeUiSource(source).content;
 assert.ok(result.startsWith('// import Button from "@/components/ui/Button";'));
 assert.ok(result.includes('import { Button as Action } from "@/components/ui/button";'));
 assert.ok(result.includes('variant="outline"'));
});

test("未知variant不读取别名对象原型", () => {
 const source = 'import { Button } from "@/components/ui/button";\nconst x = <Button variant="constructor" />;';
 assert.ok(normalizeUiSource(source).content.includes('variant="default"'));
});
