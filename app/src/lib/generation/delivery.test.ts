import test from "node:test";
import assert from "node:assert/strict";
import { SPEC_SYSTEM_PROMPT, BUILD_SYSTEM_PROMPT, PLAN_SYSTEM_PROMPT } from "./prompts.ts";

test("模型缺失和占位配置可操作错误", async () => {
  const subject = await import("./model-configuration.ts").catch(() => null);
  assert.ok(subject, "需要模型配置校验");
  for (const key of [undefined, "", "  ", "stub", " stub "]) {
    const error = subject.getModelConfigurationError({ OPENAI_API_KEY: key });
    assert.equal(error?.code, "MODEL_NOT_CONFIGURED");
    assert.match(error?.error ?? "", /OPENAI_API_KEY/);
    assert.match(error?.error ?? "", /重启/);
  }
  assert.equal(subject.getModelConfigurationError({ OPENAI_API_KEY: "valid-local-key" }), null);
});
test("技术检查通过仍明确业务、外部服务和公网待验证", async () => {
  const subject = await import("./verification-report.ts").catch(() => null);
  assert.ok(subject, "需要真实验证报告");
  const report = subject.createVerificationReport({ runId: "run-1", sourceHash: "abc123", spec: "## 验收清单\n- 提交预约并刷新后台查询\n## 外部依赖\n- 邮件服务需要 SMTP 配置" });
  assert.equal(report.businessVerified, false);
  assert.equal(report.sourceHash, "abc123");
  assert.deepEqual(report.checked.map((item) => item.id), ["dependencies", "typecheck", "build", "health"]);
  assert.match(report.pendingManual.join("\n"), /提交预约并刷新后台查询/);
  assert.match(report.pendingManual.join("\n"), /SMTP/);
  assert.match(report.pendingManual.join("\n"), /公网/);
});
test("各阶段复用相同设计及业务交付约束", () => {
  for (const heading of ["设计规则", "核心流程", "验收清单", "外部依赖"]) assert.ok(SPEC_SYSTEM_PROMPT.includes(heading));
  for (const prompt of [PLAN_SYSTEM_PROMPT, BUILD_SYSTEM_PROMPT]) {
    assert.match(prompt, /设计规则/);
    assert.match(prompt, /核心流程/);
  }
  assert.match(BUILD_SYSTEM_PROMPT, /ATOMS_DATA_DIR/);
  assert.match(BUILD_SYSTEM_PROMPT, /force-dynamic/);
});

test('中文占位密钥与控制字符在模型调用前拦截且不泄露值',async()=>{
 const {getModelConfigurationError}=await import('./model-configuration.ts');
 for(const key of ['sk-把你的Key填这里','sk-line\nbreak','sk-with space','sk-é']){
  const error=getModelConfigurationError({OPENAI_API_KEY:key});
  assert.equal(error?.code,'MODEL_CONFIGURATION_INVALID');assert.match(error?.error??'',/OPENAI_API_KEY/);assert.equal(error?.error.includes(key),false);
 }
 assert.equal(getModelConfigurationError({OPENAI_API_KEY:' valid-local-key '}),null);
 assert.throws(()=>new Headers({Authorization:'Bearer sk-把你的Key填这里'}),/ByteString/);
});
