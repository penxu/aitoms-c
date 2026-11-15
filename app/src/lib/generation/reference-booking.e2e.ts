/**
 * Repeatable acceptance for the generated reference booking application.
 * ATOMS_REFERENCE_BASE_URL=http://127.0.0.1:3000/p/<projectId> \
 *   node --experimental-strip-types --test src/lib/generation/reference-booking.e2e.ts
 * Uses synthetic records for preview, release and standalone checks alike.
 */
import test from "node:test";
import assert from "node:assert/strict";

const configuredBase = process.env.ATOMS_REFERENCE_BASE_URL;
if (!configuredBase) throw new Error("请设置 ATOMS_REFERENCE_BASE_URL 为参考预约应用完整挂载地址");
const base = configuredBase.replace(/\/$/, "");
const uniqueName = `流程验收${Date.now()}`;
const payload = {
  name: uniqueName,
  phone: "13800000000",
  pet_name: uniqueName,
  service: "bath",
  appointment_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
};

async function request(route: string, init?: RequestInit) {
  return fetch(`${base}${route}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
}

test("预约提交→成功摘要→刷新后台查询；无效输入被拒绝且不新增", async () => {
  const health = await request("/api/health");
  assert.equal(health.status, 200, "服务健康检查");
  await health.body?.cancel();
  const createdResponse = await request("/api/bookings", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  const created = await createdResponse.json();
  assert.equal(createdResponse.status, 201, JSON.stringify(created));
  assert.equal(typeof created.id, "number");
  const success = await request(`/booking/success?id=${created.id}`);
  assert.equal(success.status, 200);
  assert.ok((await success.text()).includes(uniqueName), "成功页显示刚提交的数据");
  const query = `/api/bookings?${new URLSearchParams({ pet_name: uniqueName })}`;
  for (let refresh = 0; refresh < 2; refresh += 1) {
    const response = await request(query);
    assert.equal(response.status, 200);
    const listed = await response.json();
    assert.equal(listed.total, 1);
    const record = listed.rows.find((row: { id: number }) => row.id === created.id);
    assert.ok(record, "后台重新请求仍可查询相同预约");
    assert.equal(record.pet_name, payload.pet_name);
    assert.equal(record.phone, payload.phone);
  }
  const invalid = await request("/api/bookings", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, phone: "123" }),
  });
  assert.equal(invalid.status, 400);
  assert.ok((await invalid.json()).errors?.phone, "返回可定位到手机号字段的错误");
  const afterInvalid = await request(query);
  assert.equal((await afterInvalid.json()).total, 1, "无效输入未写入数据库");
  console.log(JSON.stringify({ base, bookingId: created.id, status: "core-flow-passed", syntheticRecord: uniqueName }));
});
