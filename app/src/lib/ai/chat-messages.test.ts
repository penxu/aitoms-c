import test from "node:test";
import assert from "node:assert/strict";
import type { UIMessage } from "ai";
import { toChatMessages } from "./chat-messages.ts";

function message(id: string, role: UIMessage["role"], text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

test("system 消息改写为 assistant，避免模型接口拒绝", () => {
  const result = toChatMessages([
    message("m1", "system", "生成摘要"),
    message("m2", "user", "把标题改大一些"),
  ]);

  assert.equal(result.length, 2);
  assert.equal(result[0].role, "assistant");
  assert.equal(result[1].role, "user");
});

test("丢弃空消息，保留真实对话顺序", () => {
  const result = toChatMessages([
    message("m1", "user", "你好"),
    { id: "m2", role: "assistant", parts: [] } as UIMessage,
    message("m3", "assistant", "好的"),
  ]);

  assert.deepEqual(
    result.map((item) => item.id),
    ["m1", "m3"],
  );
});
