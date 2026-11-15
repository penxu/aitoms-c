import test from "node:test";
import assert from "node:assert/strict";
import { describeModelError, formatErrorDetail } from "./model-errors.ts";

test("鉴权、模型名、限流、网络异常分别给出可操作提示", () => {
  assert.match(describeModelError(new Error("401 Unauthorized")), /OPENAI_API_KEY/);
  assert.match(describeModelError(new Error("404 model not found")), /CHAT_MODEL/);
  assert.match(describeModelError(new Error("429 rate limit exceeded")), /限流/);
  assert.match(describeModelError(new Error("fetch failed")), /OPENAI_BASE_URL/);
});

test("未知异常保留原始信息且不超长", () => {
  const message = describeModelError(new Error("x".repeat(1000)));
  assert.match(message, /模型调用失败/);
  assert.ok(message.length <= 240, `长度 ${message.length}`);
});

test("对象形式的错误不再显示 [object Object]", () => {
  assert.equal(
    formatErrorDetail({ code: "TypeError", message: "Failed to fetch" }),
    "请求没有发出去：请确认平台服务仍在运行、网络正常，然后重试。",
  );
  assert.equal(formatErrorDetail({ status: 500, detail: "boom" }), '{"status":500,"detail":"boom"}');
  assert.equal(formatErrorDetail("普通字符串"), "普通字符串");
  assert.equal(formatErrorDetail(undefined), "");
});

test("system 角色被拒时提示刷新页面", () => {
  assert.match(
    describeModelError(new Error("Invalid prompt: System messages are not allowed")),
    /刷新页面/,
  );
});
