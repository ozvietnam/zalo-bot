// test/core/digest.test.mjs — T028: bản tin gộp 08:00 và 17:00 giờ VN cho nhóm nhân viên.
// Bản tin đi qua cửa gửi duy nhất (core/gate.js) và có khoá idempotency theo kỳ:
// một kỳ = một tin, khởi động lại không gửi hai lần.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createOps } from '../../core/ops.js';
import { fakeChannel, fakeClock, fakeMcp } from '../helpers/fakes.mjs';

const VN_0800 = '2026-11-05T01:00:00.000Z'; // 08:00 VN ngày 05/11/2026
const VN_1700 = '2026-11-05T10:00:00.000Z'; // 17:00 VN ngày 05/11/2026
const silent = { info() {}, error() {}, warn() {} };

let seq = 0;
/** Đường dẫn db tạm cho mỗi lần dựng (để đếm dòng outbox bằng kết nối thứ hai). */
const dbTam = () => join(tmpdir(), `digest-${process.pid}-${++seq}-${Date.now()}.db`);

/** Xoá db tạm cùng các tệp phụ WAL. */
function xoaDb(path) {
  for (const s of ['', '-wal', '-shm']) rmSync(path + s, { force: true });
}

/** Đếm dòng outbox (mọi loại hoặc một loại) bằng kết nối thứ hai — store không có API liệt kê. */
function demOutbox(path, kind) {
  const raw = new DatabaseSync(path);
  try {
    const q = kind ? 'SELECT COUNT(*) AS n FROM outbox WHERE kind = ?' : 'SELECT COUNT(*) AS n FROM outbox';
    return kind ? raw.prepare(q).get(kind).n : raw.prepare(q).get().n;
  } finally {
    raw.close();
  }
}

/** Dựng store + cửa + ops trên db tạm. `gate` tuỳ chọn (thiếu thì digest() báo 'no-gate'). */
function setup({ start = VN_0800, config = { staffChatId: 'S1' }, channel, log = silent, path = dbTam() } = {}) {
  const store = openStore(path);
  const clock = fakeClock(start);
  const ch = channel ?? fakeChannel();
  const gate = createGate({ store, channel: ch, now: clock.now, log: () => {} });
  const ops = createOps({
    store, mcp: fakeMcp({}), channel: ch, config,
    startedAt: start, version: 'v-test', now: clock.now, log, gate,
  });
  return { store, clock, channel: ch, gate, ops, path, cleanup: () => { try { store.close(); } catch { /* đã đóng */ } xoaDb(path); } };
}

/** Chèn một lượt khách đã nhận (mỗi lượt vào lõi một dòng inbox). */
function themLuot(store, key, at, chatId = 'c1') {
  store.inbox.insertIgnore({ update_key: key, chat_id: chatId, user_id: 'u1', raw: '{}', status: 'done', received_at: at });
}

/** Chèn một dòng audit (loại 'error' → số lỗi trong kỳ của bản tin gộp). */
function themAudit(store, type, at, data = {}) {
  store.audit.add({ at, turn_id: null, conv_id: 'c1', chat_id: 'c1', type, data });
}

/** Chèn một dòng outbox (mô phỏng tin đã bị cửa chặn trong kỳ). */
function themOutbox(store, { idem, reason, decision, at, chatId = 'c1' }) {
  store.outbox.insert({
    idem_key: idem, conv_id: chatId, chat_id: chatId, turn_id: null, kind: 'reply',
    text: 'tin bi chan trong ky', decision, reason, status: decision === 'send' ? 'sent' : 'rejected', created_at: at,
  });
}

// ═══ 08:00 và 17:00 giờ VN ═══

test('08:00 giờ VN gửi đúng MỘT tin kind digest', async (t) => {
  const ctx = setup({ start: '2026-11-05T00:59:00.000Z' }); // 07:59 VN
  t.after(() => ctx.cleanup());
  for (let i = 0; i < 3; i += 1) { await ctx.ops.digest(); ctx.clock.advance('1m'); } // 07:59, 08:00, 08:01
  assert.equal(ctx.channel.sent.length, 1, 'chỉ một tin được gửi');
  assert.equal(ctx.channel.sent[0].chatId, 'S1');
  assert.match(ctx.channel.sent[0].text, /Bản tin OZ/);
  const dong = ctx.store.outbox.lastForChat('S1');
  assert.equal(dong.kind, 'digest');
  assert.equal(dong.idem_key, 'd:2026-11-05:08');
  assert.equal(demOutbox(ctx.path, 'digest'), 1, 'outbox có đúng một dòng digest');
});

test('17:00 giờ VN gửi đúng MỘT tin', async (t) => {
  const ctx = setup({ start: VN_1700 });
  t.after(() => ctx.cleanup());
  await ctx.ops.digest();
  assert.equal(ctx.channel.sent.length, 1);
  const dong = ctx.store.outbox.lastForChat('S1');
  assert.equal(dong.idem_key, 'd:2026-11-05:17');
  assert.equal(demOutbox(ctx.path, 'digest'), 1);
});

test('quét lặp trong cùng giờ không gửi lần hai', async (t) => {
  const ctx = setup();
  t.after(() => ctx.cleanup());
  await ctx.ops.digest();
  await ctx.ops.digest();
  await ctx.ops.digest();
  assert.equal(ctx.channel.sent.length, 1, 'vẫn chỉ một tin');
  assert.equal(demOutbox(ctx.path, 'digest'), 1, 'outbox vẫn một dòng');
});

test('khởi động lại lúc 08:00:30 không gửi lần hai', async (t) => {
  const path = dbTam();
  t.after(() => xoaDb(path));
  // Lần 1: tiến trình cũ gửi lúc 08:00 rồi chết.
  const store1 = openStore(path);
  const clock1 = fakeClock(VN_0800);
  const ch1 = fakeChannel();
  const gate1 = createGate({ store: store1, channel: ch1, now: clock1.now, log: () => {} });
  const ops1 = createOps({ store: store1, mcp: fakeMcp({}), channel: ch1, config: { staffChatId: 'S1' }, startedAt: VN_0800, version: 'v-test', now: clock1.now, log: silent, gate: gate1 });
  await ops1.digest();
  assert.equal(ch1.sent.length, 1);
  store1.close();
  // Lần 2: tiến trình mới mở lại db, đồng hồ 08:00:30.
  const store2 = openStore(path);
  const clock2 = fakeClock('2026-11-05T01:00:30.000Z');
  const ch2 = fakeChannel();
  const gate2 = createGate({ store: store2, channel: ch2, now: clock2.now, log: () => {} });
  const ops2 = createOps({ store: store2, mcp: fakeMcp({}), channel: ch2, config: { staffChatId: 'S1' }, startedAt: '2026-11-05T01:00:30.000Z', version: 'v-test', now: clock2.now, log: silent, gate: gate2 });
  const r = await ops2.digest();
  assert.equal(ch2.sent.length, 0, 'không gửi lần hai');
  assert.equal(r.status, 'skipped');
  assert.equal(r.reason, 'already-sent');
  assert.equal(demOutbox(path, 'digest'), 1, 'outbox vẫn một dòng');
  store2.close();
});

test('ngoài giờ 08:00 và 17:00 thì không gửi', async (t) => {
  const ctx = setup();
  t.after(() => ctx.cleanup());
  const ngoai = ['2026-11-05T00:59:00.000Z', '2026-11-05T02:00:00.000Z', '2026-11-05T09:59:00.000Z', '2026-11-05T11:00:00.000Z'];
  for (const iso of ngoai) {
    ctx.clock.set(iso);
    const r = await ctx.ops.digest();
    assert.equal(r.status, 'skipped', `${iso} không được gửi`);
    assert.equal(r.reason, 'not-slot');
  }
  assert.equal(ctx.channel.sent.length, 0);
  assert.equal(demOutbox(ctx.path, 'digest'), 0);
});

test('thiếu STAFF_CHAT_ID thì không gửi và không lỗi', async (t) => {
  const ctx = setup({ config: { staffChatId: '' } });
  t.after(() => ctx.cleanup());
  const r = await ctx.ops.digest();
  assert.equal(r.status, 'skipped');
  assert.equal(r.reason, 'no-staff-chat');
  assert.equal(ctx.channel.sent.length, 0);
});

// ═══ Nội dung bản tin ═══

test('bản tin có số lượt, lỗi, tin bị chặn theo lý do, phiếu chờ > 15 phút', async (t) => {
  const ctx = setup();
  t.after(() => ctx.cleanup());
  themLuot(ctx.store, 'l1', '2026-11-04T11:00:00.000Z');
  themLuot(ctx.store, 'l2', '2026-11-05T00:30:00.000Z');
  themAudit(ctx.store, 'error', '2026-11-04T12:00:00.000Z', { message: 'loi' });
  themOutbox(ctx.store, { idem: 'o-sim', reason: 'similar:0.90', decision: 'drop', at: '2026-11-04T13:00:00.000Z' });
  themOutbox(ctx.store, { idem: 'o-leak', reason: 'leak:path', decision: 'reject', at: '2026-11-04T13:05:00.000Z' });
  ctx.store.tickets.open('c1', 'c1', 'canh-bao', '2026-11-05T00:40:00.000Z'); // mở 20 phút trước
  ctx.store.tickets.open('c2', 'c2', 'canh-bao', '2026-11-05T00:55:00.000Z'); // mở 5 phút trước
  await ctx.ops.digest();
  const text = ctx.channel.sent[0].text;
  assert.match(text, /Lượt khách: 2/);
  assert.match(text, /Lỗi: 1/);
  assert.match(text, /similar 1/);
  assert.match(text, /leak:path 1/);
  assert.match(text, /Phiếu chờ > 15 phút: 1/);
});

test('kỳ báo cáo của bản tin 08:00 bắt đầu từ 17:00 hôm trước', async (t) => {
  const ctx = setup();
  t.after(() => ctx.cleanup());
  themLuot(ctx.store, 'l1', '2026-11-04T10:00:00.000Z'); // 17:00 VN hôm trước → có tính
  themLuot(ctx.store, 'l2', '2026-11-04T09:00:00.000Z'); // 16:00 VN hôm trước → không tính
  await ctx.ops.digest();
  const text = ctx.channel.sent[0].text;
  assert.match(text, /Lượt khách: 1/);
  assert.match(text, /Kỳ báo cáo: 17:00 04\/11 → 08:00 05\/11/);
});

test('kỳ báo cáo của bản tin 17:00 là 08:00 → 17:00 cùng ngày', async (t) => {
  const ctx = setup({ start: VN_1700 });
  t.after(() => ctx.cleanup());
  themLuot(ctx.store, 'l1', '2026-11-05T02:00:00.000Z'); // 09:00 VN hôm nay → có tính
  themLuot(ctx.store, 'l2', '2026-11-04T23:00:00.000Z'); // 06:00 VN hôm nay → không tính
  await ctx.ops.digest();
  const text = ctx.channel.sent[0].text;
  assert.match(text, /Lượt khách: 1/);
  assert.match(text, /Kỳ báo cáo: 08:00 05\/11 → 17:00 05\/11/);
});

test('bản tin không lộ dữ liệu khách', async (t) => {
  const ctx = setup();
  t.after(() => ctx.cleanup());
  ctx.store.inbox.insertIgnore({ update_key: 'k1', chat_id: 'c1', user_id: 'u1', raw: '{"text":"sdt 0912345678"}', status: 'done', received_at: '2026-11-04T11:00:00.000Z' });
  ctx.store.customers.upsert('c1', { chat_id: 'c1', display_name: 'Khach Thiều', phone: '0912345678' }, '2026-11-04T11:00:00.000Z');
  themAudit(ctx.store, 'error', '2026-11-04T12:00:00.000Z', { message: 'loi o /opt/oz/bot.db' });
  await ctx.ops.digest();
  const text = ctx.channel.sent[0].text;
  assert.equal(text.includes('0912345678'), false, 'không lộ số điện thoại');
  assert.equal(text.includes('Khach'), false, 'không lộ tên khách');
  assert.equal(text.includes('c1'), false, 'không lộ chat_id');
  assert.equal(text.includes('S1'), false, 'không lộ chat_id phòng nhân viên');
  assert.equal(text.includes('/opt/'), false, 'không lộ đường dẫn');
});

test('số lượt bằng 0 thì vẫn gửi bản tin', async (t) => {
  const ctx = setup();
  t.after(() => ctx.cleanup());
  await ctx.ops.digest();
  assert.equal(ctx.channel.sent.length, 1, 'bot rảnh ≠ bot chết');
  assert.match(ctx.channel.sent[0].text, /Lượt khách: 0/);
});

test('bản tin không vượt quá 2000 ký tự (vòng cắt bớt thật sự chạy)', async (t) => {
  const ctx = setup();
  t.after(() => ctx.cleanup());
  // Tên lý do DÀI: 40 lý do × tên dài ⇒ bản tin đầy đủ vượt 2000 ký tự,
  // nếu không thì vòng cắt bớt không bao giờ chạy và test này chỉ "cho qua".
  for (let i = 0; i < 40; i += 1) {
    themOutbox(ctx.store, { idem: `o-${i}`, reason: `ly-do-chan-so-${i}-${'x'.repeat(180)}`, decision: 'reject', at: '2026-11-05T00:00:00.000Z' });
  }
  await ctx.ops.digest();
  const text = ctx.channel.sent[0].text;
  assert.equal(ctx.channel.sent.length, 1, 'vẫn là MỘT tin (không bị chia)');
  assert.ok(text.length <= 2000, `bản tin dài ${text.length} ký tự`);
  // Bắt được hành vi cắt bớt: không liệt kê hết 40 lý do, và nói rõ còn bao nhiêu.
  const soTen = (text.match(/ly-do-chan-so-/g) || []).length;
  assert.ok(soTen > 0 && soTen < 40, `phải cắt bớt (đang liệt kê ${soTen}/40)`);
  const h = text.match(/\(\+(\d+) lý do khác\)/);
  assert.ok(h, `phải có dòng "… (+N lý do khác)": ${text}`);
  assert.equal(Number(h[1]), 40 - soTen, 'N = tổng lý do − số lý do đã liệt kê');
  // Không mất phần đầu bản tin khi cắt.
  assert.match(text, /Lượt khách: 0/);
  assert.match(text, /Phiếu chờ > 15 phút: 0/);
});

test('bản tin liệt kê tối đa 10 lý do chặn', async (t) => {
  const ctx = setup();
  t.after(() => ctx.cleanup());
  for (let i = 0; i < 15; i += 1) {
    themOutbox(ctx.store, { idem: `o-${i}`, reason: `ly-do-${i}`, decision: 'reject', at: '2026-11-05T00:00:00.000Z' });
  }
  await ctx.ops.digest();
  const text = ctx.channel.sent[0].text;
  const soTen = (text.match(/ly-do-\d+/g) || []).length;
  assert.equal(soTen, 10, `phải liệt kê đúng 10 lý do (đang ${soTen})`);
  assert.match(text, /\(\+5 lý do khác\)/, 'phải báo còn 5 lý do nữa');
  assert.ok(text.length <= 2000, `bản tin dài ${text.length} ký tự`);
});

test('bản tin gửi hỏng thì KHÔNG được gửi lại ngoài giờ 08:00/17:00 (kể cả giờ yên)', async (t) => {
  // Bot sập lúc 08:00 (kênh lỗi) rồi khởi động lại lúc 23:30 giờ VN:
  // bộ quét nền (gate.sweep) KHÔNG được gửi lại bản tin 08:00 lúc 23:30 (giờ yên)
  // và cũng không gửi lúc 09:00 (ngoài hai giờ bắn).
  let fail = true;
  const path = dbTam();
  t.after(() => xoaDb(path));
  const ch = fakeChannel({ failOn: () => fail });
  const ctx = setup({ path, channel: ch, start: VN_0800 });
  await ctx.ops.digest();
  assert.equal(ch.sent.length, 0, 'gửi hỏng thì không có tin nào được gửi');
  const dong = ctx.store.outbox.lastForChat('S1');
  assert.equal(dong.status, 'failed', 'dòng outbox vẫn phải là failed (báo /health là phòng nhân viên không gửi được)');
  ctx.store.close();

  const ctx2 = setup({ path, channel: ch, start: '2026-11-05T16:30:00.000Z' }); // 23:30 VN
  fail = false;
  await ctx2.gate.sweep();
  assert.equal(ch.sent.length, 0, '23:30 giờ VN (giờ yên) không được gửi bản tin cũ');
  ctx2.clock.set('2026-11-05T02:00:00.000Z'); // 09:00 VN
  await ctx2.gate.sweep();
  assert.equal(ch.sent.length, 0, '09:00 giờ VN (ngoài 08:00/17:00) không được gửi bản tin cũ');
  ctx2.store.close();
});

test('tiến trình chết GIỮA lúc gửi: bản tin không được bắn lại sau giờ của nó', async (t) => {
  // Dòng outbox còn 'queued' (chết giữa lúc gửi) → gate.recover() hồi thành 'failed'.
  // Bot khởi động lại lúc 23:30 VN: bộ quét nền KHÔNG được gửi lại bản tin 08:00.
  const path = dbTam();
  t.after(() => xoaDb(path));
  const c1 = setup({ path, start: VN_0800 });
  c1.store.outbox.insert({ idem_key: 'd:2026-11-05:08', conv_id: 'S1', chat_id: 'S1', turn_id: null, kind: 'digest',
    text: 'ban tin 08:00', decision: 'send', reason: 'ok', status: 'queued', created_at: VN_0800, ctx: { isGroup: true } });
  c1.gate.recover();
  c1.store.close();

  const c2 = setup({ path, start: '2026-11-05T16:30:00.000Z' }); // 23:30 VN
  await c2.ops.digest(); // server.js gọi digest() trước drain()
  await c2.gate.sweep();
  assert.equal(c2.channel.sent.length, 0, '23:30 giờ VN không được gửi bản tin 08:00 cũ');
  c2.store.close();
});

test('tiến trình chết giữa lúc gửi rồi khởi động lại ĐÚNG giờ: vẫn gửi được', async (t) => {
  const path = dbTam();
  t.after(() => xoaDb(path));
  const c1 = setup({ path, start: VN_0800 });
  c1.store.outbox.insert({ idem_key: 'd:2026-11-05:08', conv_id: 'S1', chat_id: 'S1', turn_id: null, kind: 'digest',
    text: 'ban tin 08:00', decision: 'send', reason: 'ok', status: 'queued', created_at: VN_0800, ctx: { isGroup: true } });
  c1.gate.recover();
  c1.store.close();

  const c2 = setup({ path, start: '2026-11-05T01:00:30.000Z' }); // 08:00:30 VN — đúng giờ
  await c2.ops.digest();
  await c2.gate.sweep();
  assert.equal(c2.channel.sent.length, 1, 'khởi động lại trong giờ của bản tin thì vẫn gửi được');
  c2.store.close();
});

test('một ngày: nhóm nhận đúng HAI tin (08:00 và 17:00) khi quét mỗi phút', async (t) => {
  const ctx = setup({ start: '2026-11-05T00:59:00.000Z' }); // 07:59 VN
  t.after(() => ctx.cleanup());
  for (let i = 0; i < 10 * 60 + 3; i += 1) { // 07:59 → 17:01
    await ctx.ops.digest();
    ctx.clock.advance('1m');
  }
  assert.equal(ctx.channel.sent.length, 2, `phải đúng 2 tin (đang ${ctx.channel.sent.length})`);
  assert.match(ctx.channel.sent[0].text, /Bản tin OZ — 08:00/);
  assert.match(ctx.channel.sent[1].text, /Bản tin OZ — 17:00/);
  assert.equal(demOutbox(ctx.path, 'digest'), 2, 'outbox có đúng hai dòng digest');
});

test('bản tin đi qua cửa gửi (có audit gate) và KHÔNG ghi vào bảng messages', async (t) => {
  const ctx = setup();
  t.after(() => ctx.cleanup());
  await ctx.ops.digest();
  const gates = ctx.store.audit.byChat('S1', 50).filter((a) => a.type === 'gate');
  assert.equal(gates.length, 1, 'phải có đúng một dòng audit loại gate');
  assert.equal(gates[0].data.idemKey, 'd:2026-11-05:08');
  assert.equal(gates[0].data.kind, 'digest');
  assert.equal(gates[0].data.decision, 'send');
  const raw = new DatabaseSync(ctx.path);
  try {
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM messages').get().n, 0, 'bản tin gộp không ghi vào messages');
  } finally { raw.close(); }
});

test('ngưỡng phiếu chờ: đúng 15 phút thì KHÔNG tính, 15 phút 1 giây thì tính', async (t) => {
  for (const [phut, mongDoi] of [[15, 0], [15 + 1 / 60, 1], [20, 1], [60, 1], [1440, 1], [10, 0]]) {
    const ctx = setup();
    t.after(() => ctx.cleanup());
    const opened = new Date(Date.parse(VN_0800) - phut * 60_000).toISOString();
    ctx.store.tickets.open('c1', 'c1', 'canh-bao', opened);
    await ctx.ops.digest();
    const m = ctx.channel.sent[0].text.match(/Phiếu chờ > 15 phút: (\d+)/);
    assert.equal(Number(m[1]), mongDoi, `mở ${phut} phút trước → mong đợi ${mongDoi}`);
  }
});

// ═══ Sự cố ═══

test('db chết thì không gửi và không ném lỗi ra ngoài', async (t) => {
  const ctx = setup();
  t.after(() => ctx.cleanup());
  ctx.store.close();
  const r = await ctx.ops.digest();
  assert.equal(r.status, 'skipped');
  assert.equal(ctx.channel.sent.length, 0);
});

test('kênh gửi hỏng thì outbox failed và không tạo dòng thứ hai', async (t) => {
  const ctx = setup({ channel: fakeChannel({ failOn: () => true }) });
  t.after(() => ctx.cleanup());
  await ctx.ops.digest();
  const dong = ctx.store.outbox.lastForChat('S1');
  assert.equal(dong.status, 'failed', 'dòng outbox phải là failed');
  assert.equal(demOutbox(ctx.path, 'digest'), 1);
  await ctx.ops.digest();
  assert.equal(demOutbox(ctx.path, 'digest'), 1, 'không tạo dòng outbox thứ hai');
});

test('giờ VN không phụ thuộc TZ của máy', async (t) => {
  const tzCu = process.env.TZ;
  const ket = [];
  try {
    for (const tz of ['UTC', 'Asia/Tokyo', 'America/New_York', 'Asia/Ho_Chi_Minh']) {
      process.env.TZ = tz;
      const ctx = setup({ start: VN_0800 });
      await ctx.ops.digest();
      assert.equal(ctx.channel.sent.length, 1, `TZ ${tz}: phải gửi đúng một tin`);
      assert.equal(ctx.store.outbox.lastForChat('S1').idem_key, 'd:2026-11-05:08', `TZ ${tz}: sai khoá idempotency`);
      ket.push(ctx.channel.sent[0].text);
      ctx.cleanup();
    }
  } finally {
    if (tzCu === undefined) delete process.env.TZ; else process.env.TZ = tzCu;
  }
  // Kết quả phải GIỐNG HỆT nhau ở mọi TZ (cùng nội dung, cùng khoá).
  assert.equal(new Set(ket).size, 1, 'nội dung bản tin phải giống hệt ở mọi TZ');
});
