// T026: cắm handoff vào engine — người trước máy (Điều II), trung thực (Điều VIII), FR-011, FR-012,
// FR-014, FR-032. Kèm hai sửa từ lần soát T021 (#33): việc nền KHÔNG gọi Cổng/gói khi phòng đã có người
// cầm, và kết quả đã hứa với khách không mất im lặng mà vào phiếu cho nhân viên.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createRegistry } from '../../core/registry.js';
import { createHandoff, HUMAN_IDLE_MS } from '../../core/handoff.js';
import { createEngine } from '../../core/engine.js';
import { REPLY_HANDOFF, REPLY_IS_BOT } from '../../core/intents.js';
import { fakeChannel, fakeClock, fakeMcp } from '../helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z'; // 10:00 giờ VN, ngoài giờ yên
const STAFF = 'S1';
const silent = { info() {}, warn() {}, error() {} };

/** Gói giả GỌI CỔNG mỗi lượt: phòng có người cầm mà lõi vẫn gọi gói thì `mcp.calls` tăng. */
function traPack(extra = {}) {
  const seen = { handle: 0, onJobResult: 0 };
  const pack = {
    id: 'tra', ten: 'Tra', version: '1', audience: 'public', priority: 50, match: () => true,
    async handle(turn, ctx) {
      seen.handle++;
      const r = await ctx.mcp.callTool('tra', { q: turn.text });
      return { replies: [{ text: `Kết quả số ${r.n} cho: ${turn.text}` }], evidence: [r] };
    },
    async onJobResult(job, res) {
      seen.onJobResult++;
      return { replies: [{ text: `Xong ${job.maLuot}: mã ${res?.hs ?? 'chưa có'}` }], evidence: [res] };
    },
    ...extra,
  };
  return { pack, seen };
}

/** Như `server.js`: một `handoff` dùng chung cho cửa và engine. `passHandoff:false` → engine tự dựng. */
function setup({ pack = traPack().pack, script = {}, passHandoff = true } = {}) {
  const store = openStore();
  const clock = fakeClock(START);
  const channel = fakeChannel();
  let n = 0;
  const mcp = fakeMcp({ tra: () => ({ n: ++n }), kq: () => ({ trangThai: 'XONG', hs: '84137090' }), ...script });
  const config = { staffChatId: STAFF, staffUsers: new Set(['nv1']), botNames: ['Bot OZ'] };
  const gate = createGate({ store, channel, now: clock.now });
  const handoff = createHandoff({ store, gate, config, now: clock.now });
  const engine = createEngine({ config, store, channel, mcp, registry: createRegistry([pack]), gate, now: clock.now, log: silent, ...(passHandoff ? { handoff } : {}) });
  return { store, clock, channel, mcp, handoff, engine };
}

let seq = 0;
const upd = (text, o = {}) => ({
  updateKey: `k${++seq}`, event: o.event ?? 'message.text.received', chatId: o.chatId ?? 'c1', userId: o.userId ?? 'u1',
  userName: o.userName ?? 'Tuấn', chatType: o.chatType ?? 'PRIVATE', text, photoUrl: o.photoUrl ?? null, caption: null, messageId: null,
});
const grp = (text, userId, userName) => upd(text, { chatId: 'G', userId, userName, chatType: 'GROUP' });
const lenh = (text, userId = 'nv1') => upd(text, { chatId: STAFF, userId, userName: 'Hà', chatType: 'GROUP' });
const tin = (channel, chatId) => channel.sent.filter((m) => m.chatId === chatId).map((m) => m.text);
const goiCong = (mcp, name) => mcp.calls.filter((c) => name == null || c.name === name).length;

test('phòng human: 10 tin khách → kênh nhận 0 tin tới khách, mcp.calls.length === 0, nhóm nhận 1 phiếu + ≤ 2 tin gộp', async () => {
  const { store, clock, channel, mcp, handoff, engine } = setup();
  store.convs.upsertSeen('c1', 'c1', 'u1', 'Tuấn', START);
  await handoff.open('c1', 'tiep-quan');
  handoff.toHuman('c1', 'nv1', 'nhan');
  channel.sent.length = 0; // dọn tin thông báo mở phiếu
  const loi = [];
  for (let i = 1; i <= 10; i++) {
    clock.advance('1m');
    const u = i === 4
      ? upd(null, { event: 'message.image.received', photoUrl: 'https://anh.example/hang-4.jpg' })
      : upd(`tin thứ ${i} của khách`);
    loi.push(i === 4 ? 'https://anh.example/hang-4.jpg' : `tin thứ ${i} của khách`);
    const r = await engine.process(u);
    assert.equal(r.skipped, 'chat-human');
    assert.equal(store.inbox.get(u.updateKey).status, 'done');
  }
  clock.advance('6m');
  await engine.drain();   // drain() chạy cả bộ quét phiếu (flushDue)

  assert.deepEqual(tin(channel, 'c1'), [], 'không tin nào của bot tới khách khi người cầm phòng');
  assert.equal(mcp.calls.length, 0, 'không gọi Cổng OZ');
  const nhom = tin(channel, STAFF);
  const gop = nhom.filter((t) => t.includes('khách nhắn tiếp'));
  assert.ok(gop.length >= 1 && gop.length <= 2, `cần 1–2 tin gộp, có ${gop.length}`);
  for (const s of loi) assert.ok(gop.join('\n').includes(s), `mất tin khách: ${s}`);
  assert.equal(store.convs.get('c1').state, 'human');
});

test('"cho em gặp nhân viên" → khách nhận REPLY_HANDOFF (chứa hotline), phòng vẫn bot, không mở phiếu, tin kế tiếp vẫn được trả lời', async () => {
  const { pack, seen } = traPack();
  const { store, channel, mcp, handoff, engine } = setup({ pack });
  const r = await engine.process(upd('cho em gặp nhân viên'));
  assert.equal(r.handled, 'wants-human');
  assert.deepEqual(tin(channel, 'c1'), [REPLY_HANDOFF]);
  assert.match(tin(channel, 'c1')[0], /0972 433 318/);
  assert.equal(handoff.stateOf('c1'), 'bot');
  assert.equal(store.tickets.openFor('c1'), null, 'không mở phiếu vào nhóm');
  assert.deepEqual(tin(channel, STAFF), []);
  assert.equal(seen.handle, 0, 'không gọi gói');
  assert.equal(mcp.calls.length, 0);
  const labels = (store.customers.get('c1')?.labels ?? []).map((l) => l.nhan);
  assert.ok(labels.includes('xin-nguoi'), 'vẫn gắn nhãn xin-nguoi');
  // Tin kế tiếp: bot vẫn trả lời bình thường (không bị im).
  await engine.process(upd('thuế máy bơm nước'));
  assert.equal(seen.handle, 1);
  assert.match(tin(channel, 'c1')[1], /^Kết quả số 1 cho: thuế máy bơm nước/);
});

test('HOTLINE thay đổi được qua config/env khi khách xin gặp người', async () => {
  const { pack } = traPack();
  const store = openStore();
  const clock = fakeClock(START);
  const channel = fakeChannel();
  const mcp = fakeMcp({ tra: () => ({ n: 1 }) });
  const config = { staffChatId: STAFF, staffUsers: new Set(['nv1']), hotline: '0912 345 678' };
  const gate = createGate({ store, channel, now: clock.now });
  const handoff = createHandoff({ store, gate, config, now: clock.now });
  const engine = createEngine({ config, store, channel, mcp, registry: createRegistry([pack]), gate, now: clock.now, log: silent, handoff });

  await engine.process(upd('gặp nhân viên'));
  assert.match(tin(channel, 'c1')[0], /0912 345 678/);
  assert.equal(handoff.stateOf('c1'), 'bot');
});

test('"bạn là người hay máy" → khách nhận REPLY_IS_BOT, phòng vẫn bot', async () => {
  const { pack, seen } = traPack();
  const { store, channel, handoff, engine } = setup({ pack });
  const r = await engine.process(upd('bạn là người hay máy'));
  assert.equal(r.handled, 'asks-bot');
  assert.deepEqual(tin(channel, 'c1'), [REPLY_IS_BOT]);
  assert.equal(handoff.stateOf('c1'), 'bot');
  assert.equal(store.tickets.openFor('c1'), null, 'không mở phiếu');
  assert.deepEqual(tin(channel, STAFF), []);
  assert.equal(seen.handle, 0);
  // Phòng vẫn bot: câu hỏi nghiệp vụ kế tiếp tới gói.
  await engine.process(upd('thuế máy bơm nước'));
  assert.equal(seen.handle, 1);
  assert.match(tin(channel, 'c1')[1], /^Kết quả số 1 cho: thuế máy bơm nước/);
});

test('nhóm khách: /tl vào conv g1:B gửi vào nhóm với @tên của B; chỉ conv B sang human, A vẫn được bot trả lời; /chan-nhom chặn cả nhóm', async () => {
  const { pack, seen } = traPack();
  const { store, channel, handoff, engine } = setup({ pack });
  await engine.process(grp('hỏi thuế máy bơm', 'uA', 'An'));
  await engine.process(grp('hỏi thuế máy nén', 'uB', 'Bình'));
  assert.equal(seen.handle, 2);
  channel.sent.length = 0;

  // Người KHÔNG thuộc STAFF_USERS gõ lệnh trong nhóm nhân viên: bị từ chối, không ai nhận tin, không gọi gói.
  const tu = await engine.process(lenh('/tl G:uB tin giả mạo', 'la1'));
  assert.equal(tu.skipped, 'staff-cmd-denied');
  assert.deepEqual(channel.sent, []);

  const r = await engine.process(lenh('/tl G:uB Dạ em đây ạ'));
  assert.equal(r.handled, 'staff-cmd');
  assert.deepEqual(tin(channel, 'G'), ['@Bình\nDạ em đây ạ']);
  assert.deepEqual(tin(channel, STAFF), [], 'lệnh không đi vào gói ở nhóm nhân viên');
  assert.equal(seen.handle, 2);
  assert.equal(handoff.stateOf('G:uB'), 'human');
  assert.equal(handoff.stateOf('G:uA'), 'bot');

  channel.sent.length = 0;
  assert.equal((await engine.process(grp('còn gì nữa không em', 'uB', 'Bình'))).skipped, 'chat-human');
  await engine.process(grp('thuế máy hàn bao nhiêu', 'uA', 'An'));
  assert.deepEqual(tin(channel, 'G'), ['@An\nKết quả số 3 cho: thuế máy hàn bao nhiêu']);

  await engine.process(lenh('/chan-nhom G'));
  channel.sent.length = 0;
  assert.equal((await engine.process(grp('alo bot ơi', 'uA', 'An'))).skipped, 'chat-blocked');
  assert.equal((await engine.process(grp('người mới vào nhóm', 'uC', 'Cường'))).skipped, 'chat-blocked');
  assert.deepEqual(channel.sent, []);
  assert.equal(seen.handle, 3);
});

test('gói trả handoff:{reason} → bot gửi hotline, phòng vẫn bot, không mở phiếu, gắn nhãn xin-nguoi', async () => {
  let goiCount = 0;
  const { pack } = traPack({
    async handle() {
      goiCount++;
      return { replies: [{ text: 'Dạ câu này cần kiểm tra hồ sơ gốc.' }], handoff: { reason: 'can-kiem-ho-so' } };
    },
  });
  const { store, channel, handoff, engine } = setup({ pack });
  const r = await engine.process(upd('lô hàng của em bị giữ ở cảng'));
  assert.equal(r.handled, 'tra');
  assert.deepEqual(tin(channel, 'c1'), ['Dạ câu này cần kiểm tra hồ sơ gốc.', REPLY_HANDOFF]);
  assert.equal(handoff.stateOf('c1'), 'bot');
  assert.equal(store.tickets.openFor('c1'), null);
  assert.deepEqual(tin(channel, STAFF), []);
  const labels = (store.customers.get('c1')?.labels ?? []).map((l) => l.nhan);
  assert.ok(labels.includes('xin-nguoi'), 'vẫn gắn nhãn xin-nguoi');
  assert.equal(goiCount, 1);
  // Tin kế tiếp vẫn được xử lý bình thường
  await engine.process(upd('thuế máy bơm nước'));
  assert.equal(goiCount, 2);
});

test('phòng human lặng quá 2 giờ: tin khách kế tiếp được bot trả lời (đọc trạng thái TRƯỚC khi ghi mốc tin mới)', async () => {
  const { channel, handoff, engine, clock, store } = setup();
  store.convs.upsertSeen('c1', 'c1', 'u1', 'Tuấn', START);
  handoff.toHuman('c1', 'nv1', 'nhan');
  clock.advance(HUMAN_IDLE_MS + 60_000);
  const r = await engine.process(upd('thuế máy bơm nước'));
  assert.equal(r.handled, 'tra');
  assert.equal(handoff.stateOf('c1'), 'bot');
  assert.match(tin(channel, 'c1').at(-1), /^Kết quả số 1/);
});

test('engine không được truyền handoff vẫn tự dựng: phòng human thì không gọi gói, không gọi Cổng', async () => {
  const { store, channel, mcp, engine } = setup({ passHandoff: false });
  store.convs.setState('c1', 'c1', 'human', 'nv1', 'nhan', START);
  const r = await engine.process(upd('thuế máy bơm'));
  assert.equal(r.skipped, 'chat-human');
  assert.deepEqual(channel.sent, []);
  assert.equal(mcp.calls.length, 0);
});

/** Gói trả một việc nền; kết quả gói soạn ở onJobResult. */
function jobSetup(onJobResult) {
  const t = traPack({
    async handle() { return { replies: [{ text: '⏳ Đang tra cứu, bot sẽ gửi kết quả ngay khi xong.' }], jobs: [{ maLuot: 'L1', resultTool: 'kq' }] }; },
    ...(onJobResult ? { onJobResult } : {}),
  });
  return { ...setup({ pack: t.pack }), seen: t.seen };
}

test('việc nền: phòng sang human trước lượt hỏi → không gọi Cổng, không gọi onJobResult; phiếu báo nhân viên mã lượt', async () => {
  const { store, clock, channel, mcp, engine, seen } = jobSetup();
  await engine.process(upd('tra mã HS máy bơm'));
  await engine.process(lenh('/tl c1 Dạ để em kiểm tra giúp anh'));
  clock.advance('10s');
  await engine.drain();
  assert.equal(goiCong(mcp, 'kq'), 0, 'không hỏi Cổng khi người cầm phòng');
  assert.equal(seen.onJobResult, 0, 'không gọi gói (có thể gọi mô hình biên tập)');
  assert.ok(!tin(channel, 'c1').some((t) => t.startsWith('Xong')));
  const note = tin(channel, STAFF).find((t) => t.includes('việc nền'));
  assert.ok(note, 'nhân viên phải nhận phiếu về việc nền');
  assert.match(note, /L1/);
  assert.match(note, /\/tl P1/);
  assert.equal(store.jobs.openFor('c1', '2099-01-01T00:00:00.000Z'), false, 'việc không còn treo');
  assert.ok(store.audit.byChat('c1', 50).some((a) => a.type === 'job-handoff' && a.data.action === 'staff'));
  clock.advance('5m');
  await engine.drain();
  assert.equal(tin(channel, STAFF).filter((t) => t.includes('việc nền')).length, 1, 'không báo lặp');
});

test('việc nền: phòng sang human trong lúc gói soạn kết quả → cửa reject chat-human, nội dung vào phiếu cho nhân viên', async () => {
  let ho;
  const { channel, engine, clock, handoff, store } = jobSetup(async (job, res) => {
    ho.toHuman('c1', 'nv1', 'nhan');   // nhân viên nhận phòng đúng lúc mô hình đang soạn
    return { replies: [{ text: `Xong ${job.maLuot}: mã ${res.hs}` }], evidence: [res] };
  });
  ho = handoff;
  await engine.process(upd('tra mã HS máy bơm'));
  clock.advance('10s');
  await engine.drain();
  assert.ok(!tin(channel, 'c1').some((t) => t.startsWith('Xong')));
  const note = tin(channel, STAFF).find((t) => t.includes('Xong L1: mã 84137090'));
  assert.ok(note, 'kết quả đã soạn phải tới nhân viên, không mất im lặng');
  assert.ok(store.audit.byChat('c1', 50).some((a) => a.type === 'gate' && a.data.reason === 'chat-human'));
});

test('việc nền: phòng bị /chan → không gọi Cổng, không gửi ai, việc dừng', async () => {
  const { channel, engine, clock, mcp, seen, store } = jobSetup();
  await engine.process(upd('tra mã HS máy bơm'));
  await engine.process(lenh('/chan c1'));
  channel.sent.length = 0;
  clock.advance('10s');
  await engine.drain();
  assert.equal(goiCong(mcp, 'kq'), 0);
  assert.equal(seen.onJobResult, 0);
  assert.deepEqual(channel.sent, []);
  assert.equal(store.jobs.openFor('c1', '2099-01-01T00:00:00.000Z'), false);
});
