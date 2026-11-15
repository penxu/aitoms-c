import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

const root = path.resolve(import.meta.dirname, "../../../..");
const template = path.join(root, "templates/next-base");
const profileFile = path.join(import.meta.dirname, "application-profile.ts");
const components = ["app-shell", "page-header", "empty-state", "metric-card", "form-field"];

test("需求profile区分四类应用，后台业务优先于营销描述，未命中使用展示骨架", async () => {
  assert.ok(existsSync(profileFile), "尚缺结构化UI profile实现");
  const { getApplicationProfile } = await import("./application-profile.ts");
  for (const [requirement, kind] of [
    ["为咖啡品牌做官网，介绍产品和门店", "showcase"],
    ["订单管理后台，展示销售指标和客户列表", "admin"],
    ["制作宠物预约表单，填写信息并提交", "form"],
    ["制作一个带分数和重新开始按钮的消除小游戏", "game"],
    ["Build a dashboard for inventory and customer management", "admin"],
    ["Create an event registration form", "form"],
    ["Build a snake game with keyboard controls", "game"],
    ["新项目", "showcase"],
  ] as const) {
    const profile = getApplicationProfile(requirement);
    assert.equal(profile.kind, kind);
    assert.ok(profile.layout.sections.length >= 3);
    assert.ok(profile.tokens["--primary"]);
    assert.ok(profile.components.some((item) => item.exports.includes("AppShell")));
    assert.ok(profile.responsiveRules.length >= 2);
    assert.ok(profile.stateRules.some((rule) => /错误|失败/.test(rule)));
    assert.ok(profile.accessibilityRules.some((rule) => /键盘/.test(rule)));
  }
});

test("每个profile描述的组件都在模板中存在，tokens直接对应CSS变量", async () => {
  assert.ok(existsSync(profileFile), "尚缺结构化UI profile实现");
  const { getApplicationProfile } = await import("./application-profile.ts");
  const css = readFileSync(path.join(template, "app/globals.css"), "utf8");
  for (const input of ["官网", "后台", "预约表单", "游戏"]) {
    const profile = getApplicationProfile(input);
    for (const component of profile.components) {
      assert.ok(existsSync(path.join(template, `${component.importPath.replace("@/", "")}.tsx`)), component.importPath);
    }
    for (const variable of Object.keys(profile.tokens)) assert.ok(css.includes(`${variable}:`), variable);
  }
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});

function renderComponent(name: string, props: Record<string, unknown>) {
  const require = createRequire(import.meta.url);
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const load = (filename: string): Record<string, unknown> => {
    const cached = cache.get(filename);
    if (cached) return cached.exports;
    const fixtureModule = { exports: {} as Record<string, unknown> };
    cache.set(filename, fixtureModule);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = (id: string): unknown => {
      if (id.startsWith("@/")) {
        const target = path.join(template, id.slice(2));
        return load(`${target}${existsSync(`${target}.tsx`) ? ".tsx" : ".ts"}`);
      }
      return require(id);
    };
    const run = vm.runInThisContext(`(function(require,module,exports){${code}\n})`);
    run(localRequire, fixtureModule, fixtureModule.exports);
    return fixtureModule.exports;
  };
  const file = path.join(template, `components/app/${name}.tsx`);
  assert.ok(existsSync(file), `尚缺组合组件：${name}`);
  const fixtureExports = load(file);
  const exported = Object.values(fixtureExports)[0] as React.ComponentType<Record<string, unknown>>;
  return renderToStaticMarkup(createElement(exported, props));
}

test("组合组件真实SSR渲染覆盖导航、指标、空态与字段的可访问关联", () => {
  const shell = renderComponent("app-shell", { children: "正文", navigation: createElement("a", { href: "/" }, "首页") });
  assert.match(shell, /<main[^>]*id="main-content"/);
  assert.match(shell, /href="#main-content"/);
  assert.match(shell, /<nav[^>]*aria-label="主导航"/);
  assert.match(renderComponent("page-header", { title: "订单中心", description: "处理今日订单" }), /<h1[^>]*>订单中心<\/h1>/);
  assert.match(renderComponent("metric-card", { label: "本周订单", value: 42 }), /42/);
  assert.match(renderComponent("empty-state", { title: "还没有订单", description: "新订单会显示在这里" }), /role="status"/);
  const field = renderComponent("form-field", { id: "email", label: "邮箱", hint: "用于通知", error: "请输入有效邮箱", required: true, children: createElement("input", { type: "email" }) });
  assert.match(field, /<label[^>]*for="email"/);
  assert.match(field, /<input[^>]*id="email"/);
  assert.match(field, /aria-invalid="true"/);
  assert.match(field, /aria-describedby="email-hint email-error"/);
  assert.match(field, /role="alert"/);
});

test("组合组件按模板别名与React类型进行严格编译", () => {
  for (const component of components) assert.ok(existsSync(path.join(template, `components/app/${component}.tsx`)), `尚缺组合组件：${component}`);
  const modules = path.join(root, "app/node_modules");
  const program = ts.createProgram(components.map((name) => path.join(template, `components/app/${name}.tsx`)), {
    strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, types: [],
    baseUrl: template, paths: { "@/*": ["./*"], react: [path.join(modules, "@types/react/index.d.ts")], "react/jsx-runtime": [path.join(modules, "@types/react/jsx-runtime.d.ts")], "*": [path.join(modules, "*")] },
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")), []);
});

test("按主要交互识别骨架，游戏行业官网和报名后台不误识别为游戏", async () => {
  const { getApplicationProfile } = await import("./application-profile.ts");
  assert.equal(getApplicationProfile("为游戏工作室做官网和作品展示").kind, "showcase");
  assert.equal(getApplicationProfile("游戏活动报名管理后台").kind, "admin");
  assert.equal(getApplicationProfile("游戏比赛报名表单").kind, "form");
  assert.equal(getApplicationProfile("A landing page for a game studio").kind, "showcase");
  assert.equal(getApplicationProfile("品牌活动消除小游戏，显示得分").kind, "game");
});

test("FormField保留原有描述和required语义，指标不渲染虚假趋势", () => {
  const field = renderComponent("form-field", { id: "name", label: "姓名", children: createElement("input", { required: true, "aria-describedby": "external-note" }) });
  assert.match(field, /aria-describedby="external-note"/);
  assert.match(field, /required=""/);
  assert.doesNotMatch(field, /aria-invalid="true"|role="alert"/);
  const card = renderComponent("metric-card", { label: "订单", value: 0 });
  assert.match(card, /<dt[^>]*>订单<\/dt>/);
  assert.match(card, /<dd[^>]*>0<\/dd>/);
  assert.doesNotMatch(card, /%|增长/);
});

test("英文form只匹配完整单词，platform与performance不是表单应用", async () => {
  const { getApplicationProfile } = await import("./application-profile.ts");
  assert.equal(getApplicationProfile("A platform to showcase performance art").kind, "showcase");
  assert.equal(getApplicationProfile("订单管理和客户管理工具").kind, "admin");
});
