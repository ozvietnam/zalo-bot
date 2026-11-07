// Gói mẫu `echo` theo specs/001-nen-tang-chung/contracts/pack.md.
// Gói chỉ trả dữ liệu, không tự gửi tin (Hiến pháp Điều I).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPacks, createRegistry } from '../../../core/registry.js';
import echo from '../index.js';

/** ctx giả: gói echo không gọi công cụ nào nên chỉ cần mcp rỗng + phiên + log. */
function fakeCtx(overrides = {}) {
  const store = {};
  return {
    mcp: { callTool: async () => ({ ok: true }), listTools: async () => [] },
    tools: null,
    customer: null,
    history: () => [],
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-07T03:00:00Z'),
    log: { info() {}, error() {} },
    ...overrides,
  };
}

const turn = (text, extra = {}) => ({
  turnId: 't1', chatId: 'u1', convId: 'u1', userId: 'u1', userName: 'Tuấn',
  isGroup: false, text, photoUrl: null, caption: null,
  receivedAt: '2026-11-07T03:00:00.000Z', isStaff: false, ...extra,
});

test('manifest: id echo, audience staff, priority 100; match/handle là hàm', () => {
  assert.deepEqual(
    { id: echo.id, ten: echo.ten, version: echo.version, audience: echo.audience, moneyCheck: echo.moneyCheck, requiresTools: echo.requiresTools, priority: echo.priority },
    { id: 'echo', ten: 'Echo (gói mẫu)', version: '1.0.0', audience: 'staff', moneyCheck: false, requiresTools: [], priority: 100 },
  );
  assert.equal(typeof echo.match, 'function');
  assert.equal(typeof echo.handle, 'function');
});

test('registry nạp được gói echo từ packs/', async () => {
  const packs = await loadPacks('packs');
  assert.ok(packs.some((p) => p.id === 'echo'), 'packs/echo/index.js phải được loadPacks nạp');
});

test('match: chỉ nhận tin bắt đầu bằng /echo; null và chuỗi lạ thì false, không ném lỗi', () => {
  const ctx = fakeCtx();
  assert.equal(echo.match(turn('/echo xin chào'), ctx), true);
  assert.equal(echo.match(turn('/echo'), ctx), true);
  assert.equal(echo.match(turn('/echoing x'), ctx), false);
  assert.equal(echo.match(turn('xin chào /echo'), ctx), false);
  assert.equal(echo.match(turn(''), ctx), false);
  assert.equal(echo.match(turn(null), ctx), false);
});

test('nhân viên gõ /echo xin chào → gói echo được chọn và trả lại "xin chào"', async () => {
  const reg = createRegistry(await loadPacks('packs'));
  const ctx = fakeCtx();
  const t = turn('/echo xin chào', { isStaff: true });
  const picked = reg.pick(t, ctx);
  assert.ok(picked, 'phải chọn được gói');
  assert.equal(picked.id, 'echo');
  const r = await echo.handle(t, ctx);
  assert.equal(r.replies[0].text, 'xin chào');
  assert.deepEqual(r.jobs, []);
  assert.equal(r.handoff, null);
  assert.deepEqual(r.labels, []);
});

test('nhân viên gõ /echo (không có nội dung) → trả câu hướng dẫn', async () => {
  const ctx = fakeCtx();
  const r = await echo.handle(turn('/echo', { isStaff: true }), ctx);
  assert.match(r.replies[0].text, /\/echo/);
  assert.ok(r.replies[0].text.length > 0);
});

test('khách gõ /echo xin chào → gói echo KHÔNG được chọn', async () => {
  const reg = createRegistry(await loadPacks('packs'));
  const ctx = fakeCtx();
  const picked = reg.pick(turn('/echo xin chào', { isStaff: false }), ctx);
  assert.ok(picked, 'gói dự phòng (hs) vẫn được chọn');
  assert.notEqual(picked.id, 'echo');
});
