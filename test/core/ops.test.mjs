// test/core/ops.test.mjs — T027: /health và /metrics (US5 — vận hành nhìn thấy được).
// Dựng engine THẬT với gói giả để có lượt thật rồi đếm từ db (outbox/audit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createRegistry } from '../../core/registry.js';
import { createEngine } from '../../core/engine.js';
import { createOps } from '../../core/ops.js';
import { fakeChannel, fakeClock, fakeMcp } from '../helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z'; // 10:00 VN (không phải giờ yên)
const silent = { info() {}, error() {}, warn() {} };

/** Gói giả: mỗi lượt trả một câu, lấy theo thứ tự trong `cau` (hết thì dùng câu cuối). */
function packGui(cau = []) {
  let i = 0;
  return {
    id: 'p', ten: 'P', version: '1', audience: 'public', priority: 50, match: () => true,
    async handle() {
      const text = cau[Math.min(i, cau.length - 1)] ?? 'Dạ mình tra cứu giúp bạn nhé';
      i += 1;
      return { replies: [{ text }], evidence: [] };
    },
  };
}

function setup({ cau = [], config = {}, mcp, channel, version = 'v-test', path, log = silent } = {}) {
  const store = openStore(path);
  const clock = fakeClock(START);
  const ch = channel ?? fakeChannel();
  const m = mcp ?? fakeMcp({ tra_cuu: async () => ({ ok: true }) });
  const registry = createRegistry([packGui(cau)]);
  const gate = createGate({ store, channel: ch, now: clock.now });
  const engine = createEngine({ config, store, channel: ch, mcp: m, vision: null, registry, gate, now: clock.now, log: silent });
  const ops = createOps({ store, mcp: m, channel: ch, config, startedAt: START, version, now: clock.now, log });
  return { store, clock, channel: ch, mcp: m, engine, gate, ops };
}

let seq = 0;
const upd = (text, o = {}) => ({
  updateKey: o.id ?? `t${++seq}`, event: 'message.text.received', chatId: o.chatId ?? 'c1', userId: o.userId ?? 'u1',
  userName: o.userName ?? 'Khach', chatType: 'PRIVATE', text, photoUrl: null, caption: null, ...o,
});

/** Ba câu trả lời: câu 2 gần như trùng câu 1 (Jaccard ~1) → drop similar; câu 3 có đường dẫn giả → reject leak:path. */
const CAU_A = 'Dạ mình tra cứu giúp bạn mã hàng cụ thể nhé';
const CAU_B = 'Dạ mình tra cứu giúp bạn mã hàng cụ thể nhé!';
const CAU_C = 'Dạ đường dẫn bot nằm ở /opt/oz-test/bot.db bạn xem nhé';

/**
 * Chạy 3 lượt nghiệm thu: 1 send, 1 drop similar, 1 reject leak:path.
 * Lượt 1 và 2 cùng MỘT CHỮ của khách (khách bấm gửi hai lần — sự cố #2, `research.md:11`): đó là ca
 * bước 6 của cửa sinh ra để chặn, nên câu trả lời gần trùng của lượt 2 bị `drop similar`. Hai lượt
 * với chữ KHÁC nhau thì nay không còn bị chặn vì trùng chữ nữa (issue #201).
 */
async function baLuot(ctx) {
  await ctx.engine.process(upd('cho em tra ma hang nay', { id: 'l1' }));
  await ctx.engine.process(upd('cho em tra ma hang nay', { id: 'l2' }));
  await ctx.engine.process(upd('cho em tra ma hang so 3', { id: 'l3' }));
  return ctx;
}

// ═══ Nghiệm thu chính (tasks.md T027 bước 1) ═══

test('3 lượt (send, drop similar, reject leak) → metrics().gate đếm đúng, byReason gom nhóm', async () => {
  const ctx = await baLuot(setup({ cau: [CAU_A, CAU_B, CAU_C] }));
  const m = ctx.ops.metrics();
  assert.equal(m.gate.send, 1, 'lượt 1 gửi được');
  assert.equal(m.gate.drop, 1, 'lượt 2 bị chặn trùng nội dung');
  assert.equal(m.gate.reject, 1, 'lượt 3 bị từ chối vì lộ đường dẫn');
  assert.equal(m.gate.byReason.similar, 1, 'lý do similar:* gom thành khoá "similar"');
  assert.equal(m.gate.byReason['leak:path'], 1, 'lý do leak:path giữ nguyên');
  assert.equal(m.turns, 3, 'mỗi lượt vào lõi một bản ghi audit inbound');
});

test('metrics() có đúng hình dạng: turns, gate{send,drop,defer,reject,byReason}, tickets{open}, jobs{waiting}', async () => {
  const { ops } = setup();
  const m = ops.metrics();
  assert.deepEqual(Object.keys(m).sort(), ['gate', 'jobs', 'tickets', 'turns']);
  assert.deepEqual(Object.keys(m.gate).sort(), ['byReason', 'defer', 'drop', 'reject', 'send']);
  assert.deepEqual(Object.keys(m.tickets), ['open']);
  assert.deepEqual(Object.keys(m.jobs), ['waiting']);
});

// ═══ health() ═══

test('health(): db còn sống → ok=true, có mode/startedAt/version/mcp.tools/zalo/inboxPending', async () => {
  const { ops } = setup({ config: { mode: 'webhook' } });
  const h = await ops.health();
  assert.equal(h.ok, true);
  assert.equal(h.db, 'ok');
  assert.equal(h.mode, 'webhook');
  assert.equal(typeof h.startedAt, 'string');
  assert.equal(new Date(h.startedAt).toISOString(), h.startedAt, 'startedAt là ISO');
  assert.equal(h.version, 'v-test');
  assert.equal(typeof h.mcp.tools, 'number');
  assert.equal(h.zalo, 'ok');
  assert.equal(typeof h.inboxPending, 'number');
});

test('health(): db đóng → KHÔNG ném lỗi, ok=false, db=error', async () => {
  const { store, ops } = setup();
  store.close();
  const h = await ops.health();
  assert.equal(h.ok, false, 'db hỏng thì không sống');
  assert.equal(h.db, 'error');
  assert.equal(h.inboxPending, null, 'không đọc được db thì không đoán số');
});

test('health(): Cổng OZ lỗi → mcp.tools=null, không treo', async () => {
  const mcpLoi = { listTools: async () => { throw new Error('cong oz loi'); }, callTool: async () => ({}) };
  const { ops } = setup({ mcp: mcpLoi });
  const h = await ops.health();
  assert.equal(h.mcp.tools, null);
  assert.equal(h.ok, true, 'Cổng OZ hỏng không làm bot chết');
});

test('health(): Cổng OZ treo → vẫn trả lời trong vài giây (mốc chặn)', async () => {
  const mcpTreo = { listTools: () => new Promise(() => {}), callTool: async () => ({}) };
  const { ops } = setup({ mcp: mcpTreo });
  const t0 = Date.now();
  const h = await ops.health();
  assert.equal(h.mcp.tools, null);
  assert.equal(Date.now() - t0 < 6000, true, 'health phải có mốc chặn, không treo');
});

test('health(): channel.getMe() lỗi → zalo=unreachable nhưng ok vẫn true', async () => {
  const ch = fakeChannel();
  ch.getMe = async () => { throw new Error('zalo loi'); };
  const { ops } = setup({ channel: ch });
  const h = await ops.health();
  assert.equal(h.zalo, 'unreachable');
  assert.equal(h.ok, true, 'Zalo lỗi không chặn bot trả lời');
});

test('health().staff: unconfigured / unknown / ok / unreachable', async () => {
  const a = setup({});
  assert.equal((await a.ops.health()).staff, 'unconfigured', 'không có staffChatId');

  const b = setup({ config: { staffChatId: 'S1' } });
  assert.equal((await b.ops.health()).staff, 'unknown', 'có id nhưng chưa gửi gì');

  const c = setup({ config: { staffChatId: 'S1' } });
  c.store.outbox.insert({ idem_key: 's-1', conv_id: 'S1', chat_id: 'S1', turn_id: null, kind: 'ticket', text: 'x', decision: 'send', reason: 'ok', status: 'sent', created_at: START });
  assert.equal((await c.ops.health()).staff, 'ok', 'dòng gần nhất đã gửi');

  const d = setup({ config: { staffChatId: 'S1' } });
  d.store.outbox.insert({ idem_key: 's-2', conv_id: 'S1', chat_id: 'S1', turn_id: null, kind: 'ticket', text: 'x', decision: 'send', reason: 'ok', status: 'failed', created_at: START });
  assert.equal((await d.ops.health()).staff, 'unreachable', 'dòng gần nhất lỗi → bot có thể đã bị xoá khỏi nhóm');
});

test('health().inboxPending đếm cả dòng pending và dòng processing', async () => {
  const { store, ops, clock } = setup();
  const at = clock.now().toISOString();
  store.inbox.insertIgnore({ update_key: 'k1', chat_id: 'c1', user_id: 'u1', raw: '{}', status: 'pending', received_at: at });
  store.inbox.insertIgnore({ update_key: 'k2', chat_id: 'c1', user_id: 'u1', raw: '{}', status: 'pending', received_at: at });
  store.inbox.claim('k2', at);
  const h = await ops.health();
  assert.equal(h.inboxPending, 2);
});

test('health(): payload không lộ dữ liệu khách (Điều IX)', async () => {
  const ctx = await baLuot(setup({ cau: [CAU_A, CAU_B, CAU_C] }));
  const h = await ctx.ops.health();
  const s = JSON.stringify(h);
  assert.equal(s.includes('0912345678'), false);
  assert.equal(s.includes('Khach'), false);
  assert.equal(s.includes('mã hàng'), false);
});

// ═══ metrics() ═══

test('metrics(): đếm bù 2 nhánh không tạo dòng outbox (empty, duplicate-idem)', async () => {
  const { gate, clock, ops } = setup({ cau: ['Dạ tin rỗng đây'] });
  // Nhánh 1: tin rỗng → reject, KHÔNG có dòng outbox (chỉ audit loại 'gate').
  await gate.send({ idemKey: 'k-empty', chatId: 'c1', convId: 'c1', kind: 'reply', text: '   ', inReplyToAt: clock.now().toISOString() });
  // Nhánh 2: gửi lại cùng idemKey → drop duplicate-idem, cũng KHÔNG có dòng outbox.
  const tin = { idemKey: 'k-dup', chatId: 'c1', convId: 'c1', kind: 'reply', text: 'Dạ tin này chỉ gửi một lần thôi nhé', inReplyToAt: clock.now().toISOString() };
  await gate.send(tin);
  await gate.send(tin);
  const m = ops.metrics();
  assert.equal(m.gate.reject, 1, 'empty phải được cộng vào reject');
  assert.equal(m.gate.byReason.empty, 1);
  assert.equal(m.gate.drop, 1, 'duplicate-idem phải được cộng vào drop');
  assert.equal(m.gate.byReason['duplicate-idem'], 1);
  assert.equal(m.gate.send, 1, 'lần gửi đầu tạo dòng outbox');
});

test('metrics(): lọc theo sinceIso — tin ngoài cửa sổ không được tính', async () => {
  const ctx = await baLuot(setup({ cau: [CAU_A, CAU_B, CAU_C] }));
  const m = ctx.ops.metrics('2099-01-01T00:00:00.000Z');
  assert.equal(m.turns, 0);
  assert.equal(m.gate.send, 0);
  assert.equal(m.gate.drop, 0);
  assert.equal(m.gate.reject, 0);
  assert.deepEqual(m.gate.byReason, {});
});

test('metrics(): không lộ dữ liệu khách (tên, số điện thoại, nội dung tin, chat_id, token)', async () => {
  const ctx = setup({ cau: [CAU_A] });
  await ctx.engine.process(upd('số điện thoại của tôi là 0912345678', { id: 'p1', userName: 'Khach Thiều' }));
  const s = JSON.stringify(ctx.ops.metrics());
  assert.equal(s.includes('0912345678'), false);
  assert.equal(s.includes('Khach Thiều'), false);
  assert.equal(s.includes('số điện thoại'), false);
  assert.equal(s.includes('c1'), false, 'không lộ chat_id');
});

test('metrics(): tickets.open tính cả open và claimed; jobs.waiting đếm đúng', async () => {
  const { store, clock, ops } = setup();
  const at = clock.now().toISOString();
  store.tickets.open('c1', 'c1', 'canh-bao', at);
  const t2 = store.tickets.open('c2', 'c2', 'canh-bao', at);
  store.tickets.update(t2.id, { status: 'claimed', claimed_by: 'nv1' });
  store.jobs.add({ conv_id: 'c1', chat_id: 'c1', session_key: 's1', pack: 'p', ma_luot: 'm1', result_tool: 't', context: null, status: 'waiting', attempts: 0, next_poll_at: at, expires_at: at, created_at: at });
  const m = ops.metrics();
  assert.equal(m.tickets.open, 2);
  assert.equal(m.jobs.waiting, 1);
});

// ═══ metrics(): turns đếm LƯỢT ĐÃ NHẬN (mọi lượt vào lõi), không chỉ lượt ghi audit 'inbound' ═══

test('metrics(): tin không phải chữ ở chat riêng → bot gửi 1 tin và turns = 1', async () => {
  const ctx = setup({ cau: ['Dạ mình tra cứu giúp bạn nhé'] });
  // Tin không phải chữ ở chat riêng (không có ảnh) → lõi gửi NON_TEXT_TEXT qua cửa.
  const r = await ctx.engine.process(upd(null, { id: 'nt1', event: 'message.photo.received', text: null }));
  assert.equal(r.handled, 'non-text', 'lõi đã trả lời bằng tin báo');
  const m = ctx.ops.metrics();
  assert.equal(m.turns, 1, 'lượt đã nhận phải được đếm');
  assert.equal(m.gate.send, 1, 'bot đã gửi 1 tin');
});

test('metrics(): 12 lượt (2 lượt vượt tần suất) → turns = 12, gate.send = 12', async () => {
  const ctx = setup({ cau: ['Dạ mình tra cứu giúp bạn nhé'], config: { rateLimitPerMin: 10 } });
  const kq = [];
  for (let i = 1; i <= 12; i++) {
    // Mỗi lượt ở phòng riêng (cửa tính trùng theo phòng) nhưng CÙNG một người (giới hạn tần suất theo người).
    kq.push(await ctx.engine.process(upd('cho em tra ma hang so ' + i, { id: 'x' + i, chatId: 'c' + i })));
  }
  const biChan = kq.filter((r) => r.handled === 'rate-limited').length;
  assert.equal(biChan, 2, 'đúng 2 lượt vượt tần suất');
  const m = ctx.ops.metrics();
  assert.equal(m.turns, 12, 'lượt bị chặn tần suất VẪN đã nhận → phải được đếm');
  assert.equal(m.gate.send, 12, 'lượt bị chặn tần suất vẫn gửi tin qua cửa');
});

// ═══ metrics(): audit hỏng KHÔNG được làm chết endpoint ═══

test('metrics(): db đóng → PHẢI NÉM (không trả số 0 — số 0 nói dối là bot rảnh rác)', () => {
  const { store, ops } = setup();
  store.close();
  assert.throws(() => ops.metrics(), 'db chết thì /metrics phải báo lỗi (500), không trả 200 toàn số 0');
});

test('metrics(): dòng audit loại gate có JSON hỏng → không ném, đếm lý do hợp lệ, có log.warn', () => {
  const dbPath = join(tmpdir(), `ops-hong-${process.pid}-${Date.now()}.db`);
  const warns = [];
  const log = { info() {}, error() {}, warn: (m) => warns.push(String(m)) };
  const ctx = setup({ path: dbPath, log });
  try {
    // Một dòng audit 'gate' hợp lệ (lý do 'empty').
    ctx.store.audit.add({ at: START, turn_id: null, conv_id: null, chat_id: 'c1', type: 'gate', data: { reason: 'empty' } });
    // Một dòng audit 'gate' có data là JSON HỎNG — chèn ở mức db thô.
    const raw = new DatabaseSync(dbPath);
    raw.prepare('INSERT INTO audit (at, turn_id, conv_id, chat_id, type, data) VALUES (?, ?, ?, ?, ?, ?)')
      .run(START, null, null, 'c1', 'gate', '{khong phai json');
    raw.close();

    let m;
    assert.doesNotThrow(() => { m = ctx.ops.metrics(); }, 'metrics() không được ném vì dòng audit hỏng');
    assert.equal(m.gate.byReason.empty, 1, 'lý do hợp lệ vẫn được đếm');
    assert.equal(m.turns, 0);
    assert.ok(warns.length > 0, 'phải cảnh báo có dòng audit hỏng (vận hành không phải mở db)');
  } finally {
    ctx.store.close();
    rmSync(dbPath, { force: true });
    rmSync(`${dbPath}-wal`, { force: true });
    rmSync(`${dbPath}-shm`, { force: true });
  }
});
