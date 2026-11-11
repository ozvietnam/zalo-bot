// test/core/bao-dang-tra.test.mjs — câu "đang tra" trong ≤ 3 giây (issue #168, phần 1).
// QA thật 10/11: bot im 30–55 giây trong lúc tra Cổng. Lõi phải gửi MỘT câu ngắn trước kết quả khi lượt
// phải đợi Cổng / việc nền; không gửi cho lời chào hay lượt nhanh; nhóm chỉ khi được gọi; giờ yên thì bỏ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../../core/store.js';
import { createGate, decide } from '../../core/gate.js';
import { createEngine } from '../../core/engine.js';
import { createRegistry } from '../../core/registry.js';
import { createBaoDangTra } from '../../core/bao-dang-tra.js';
import { cauDangTra, CAU_DANG_TRA } from '../../packs/hs/dang-tra.js';
import { fakeChannel, fakeClock } from '../helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z';   // 10:00 VN
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));
const laDangTra = (t) => /đang tra|tra cho anh\/chị|đang kiểm|đang xem ảnh|đang phân tích/.test(t);

/** Kênh giả có đóng dấu giờ THẬT cho từng tin (đo ≤ 3 giây). */
function kenhDoGio() {
  const ch = fakeChannel();
  const goc = ch.sendText.bind(ch);
  ch.luc = [];
  ch.sendText = async (chatId, text) => { ch.luc.push(Date.now()); return goc(chatId, text); };
  return ch;
}

/** Gói giả: tuỳ chọn gọi Cổng (chậm `congMs`), trả việc nền, có/không có `cauDangTra`. */
function goiGia({ goiCong = true, congMs = 0, viec = false, coCau = true, traLoi = 'Dạ mã phù hợp là 8509.40.00 ạ.' } = {}) {
  return {
    id: 'hs', priority: 0, match: () => true, moneyCheck: false,
    async handle(turn, ctx) {
      if (goiCong) await ctx.mcp.callTool('tra_thue', { maHs: '85094000' });
      return viec
        ? { replies: [], jobs: [{ maLuot: `ml-${turn.turnId}`, resultTool: 'ket_qua_phan_loai' }] }
        : { replies: [{ text: traLoi }] };
    },
    async onJobResult() { return { replies: [{ text: 'Dạ em chốt mã 8509.40.00 ạ.' }] }; },
    ...(coCau ? { cauDangTra } : {}),
  };
}

function dung({ pack, congMs = 0, start = START, config = {}, mcpTraVe = null } = {}) {
  const store = openStore();
  const clock = fakeClock(start);
  const ch = kenhDoGio();
  const gate = createGate({ store, channel: ch, now: clock.now, rules: { capChatDay: config.capChatDay ?? 8 } });
  let soLanHoi = 0;
  const mcp = {
    async callTool(name) {
      if (congMs) await ngu(congMs);
      if (name === 'ket_qua_phan_loai') { soLanHoi++; return mcpTraVe ? mcpTraVe(soLanHoi) : { ok: true, trangThai: 'XONG' }; }
      return { ok: true, data: {} };
    },
    async listTools() { return [{ name: 'tra_thue' }, { name: 'ket_qua_phan_loai' }]; },
  };
  const engine = createEngine({
    config: { botNames: ['OZ'], ...config }, store, channel: ch, mcp, registry: createRegistry([pack]), gate, now: clock.now,
    log: { info() {}, warn() {}, error() {} }, advance: (ms) => { if (ms > clock.now().getTime()) clock.set(ms); },
  });
  return { store, clock, ch, gate, engine };
}

const tin = (id, text, extra = {}) => ({ updateKey: id, event: 'message.text.received', chatId: 'c1', userId: 'u1', userName: 'Khách', chatType: 'PRIVATE', text, messageId: id, ...extra });

test('Cổng chậm 2,5 giây: câu "đang tra" ra trong ≤ 3 giây, TRƯỚC kết quả (đồng hồ thật, cấu hình mặc định)', async () => {
  const { engine, ch } = dung({ pack: goiGia(), congMs: 2500 });
  const t0 = Date.now();
  await engine.process(tin('m1', 'thuế 85094000'));
  assert.equal(ch.sent.length, 2, JSON.stringify(ch.sent));
  assert.ok(laDangTra(ch.sent[0].text), `tin đầu phải là câu đang tra: ${ch.sent[0].text}`);
  assert.match(ch.sent[1].text, /8509\.40\.00/);
  const sau = ch.luc[0] - t0;
  assert.ok(sau <= 3000, `câu đang tra ra sau ${sau} ms (> 3000)`);
  assert.ok(ch.luc[0] <= ch.luc[1], 'câu đang tra phải đi trước kết quả');
});

test('Cổng nhanh, không việc nền: KHÔNG gửi câu "đang tra" (khỏi ồn)', async () => {
  const { engine, ch } = dung({ pack: goiGia(), config: { dangTraSauMs: 200 } });
  await engine.process(tin('m1', 'thuế 85094000'));
  assert.deepEqual(ch.sent.map((m) => m.text), ['Dạ mã phù hợp là 8509.40.00 ạ.']);
});

test('lời chào (không gọi Cổng) chạy lâu: KHÔNG gửi câu "đang tra"', async () => {
  const pack = { ...goiGia({ goiCong: false, traLoi: 'Dạ em chào anh/chị ạ.' }) };
  const goc = pack.handle;
  pack.handle = async (turn, ctx) => { await ngu(80); return goc(turn, ctx); };
  const { engine, ch } = dung({ pack, config: { dangTraSauMs: 20 } });
  await engine.process(tin('m1', 'chào em'));
  assert.deepEqual(ch.sent.map((m) => m.text), ['Dạ em chào anh/chị ạ.']);
});

test('việc nền: câu "đang tra" đi NGAY khi lượt xong (Cổng nhanh vẫn gửi), kết quả tới sau', async () => {
  const { engine, ch } = dung({ pack: goiGia({ viec: true }), config: { dangTraSauMs: 10_000 } });
  await engine.process(tin('m1', 'máy xay sinh tố gia đình 350W'));
  assert.equal(ch.sent.length, 1);
  assert.ok(laDangTra(ch.sent[0].text));
  await engine.drain();
  assert.equal(ch.sent.length, 2);
  assert.match(ch.sent[1].text, /8509\.40\.00/);
});

test('gói không soạn câu (không có cauDangTra): lõi KHÔNG tự soạn chữ cho khách', async () => {
  const { engine, ch } = dung({ pack: goiGia({ viec: true, coCau: false }), congMs: 60, config: { dangTraSauMs: 10 } });
  await engine.process(tin('m1', 'máy xay'));
  assert.equal(ch.sent.length, 0);
});

test('nhóm: không gọi bot → im hoàn toàn; gọi bot → câu "đang tra" có @tên người hỏi', async () => {
  const { engine, ch } = dung({ pack: goiGia({ viec: true }) });
  const nhom = { chatId: 'g1', chatType: 'GROUP', userId: 'u7', userName: 'Hương' };
  await engine.process(tin('n1', 'máy xay sinh tố bao nhiêu thuế', nhom));
  assert.equal(ch.sent.length, 0, 'không gọi bot thì không được báo đang tra');
  await engine.process(tin('n2', '@OZ máy xay sinh tố gia đình 350W', nhom));
  assert.equal(ch.sent.length, 1);
  assert.match(ch.sent[0].text, /^@Hương\n/);
  assert.ok(laDangTra(ch.sent[0].text));
});

test('giờ yên: câu "đang tra" bị BỎ (không hoãn), sáng ra không gửi bù — chỉ kết quả được gửi lúc 07:00', async () => {
  const { engine, ch, clock, gate } = dung({ pack: goiGia({ viec: true }), start: '2026-11-04T16:30:00.000Z' });   // 23:30 VN
  await engine.process(tin('m1', 'máy xay sinh tố gia đình 350W'));
  await engine.drain();
  assert.equal(ch.sent.length, 0, 'đêm không nhắn gì');
  clock.set('2026-11-05T00:05:00.000Z');   // 07:05 VN
  await gate.sweep();
  await engine.drain();
  assert.deepEqual(ch.sent.map((m) => m.text), ['Dạ em chốt mã 8509.40.00 ạ.']);
});

test('câu "đang tra" KHÔNG ăn suất trần tin/ngày của khách', async () => {
  const { engine, ch, clock } = dung({ pack: goiGia({ viec: true }), config: { capChatDay: 2 } });
  await engine.process(tin('m1', 'máy xay sinh tố gia đình 350W'));
  await engine.drain();
  clock.advance('5m');
  await engine.process(tin('m2', 'máy xay sinh tố công nghiệp 1500W'));
  await engine.drain();
  // 2 kết quả (đủ trần 2) + 2 câu đang tra: kết quả thứ hai KHÔNG bị hoãn sang ngày mai
  assert.equal(ch.sent.filter((m) => !laDangTra(m.text)).length, 2, JSON.stringify(ch.sent));
});

test('việc nền quá 60 giây chưa xong → báo tiến độ ĐÚNG MỘT lần, rồi mới tới kết quả', async () => {
  const { engine, ch } = dung({ pack: goiGia({ viec: true }), mcpTraVe: (n) => (n < 6 ? { ok: true, trangThai: 'DANG_XU_LY' } : { ok: true, trangThai: 'XONG' }) });
  await engine.process(tin('m1', 'máy xay sinh tố gia đình 350W'));
  await engine.drain();
  const texts = ch.sent.map((m) => m.text);
  assert.equal(texts.filter((t) => t === CAU_DANG_TRA.tienDo).length, 1, JSON.stringify(texts));
  assert.equal(texts.length, 3);
  assert.ok(laDangTra(texts[0]));
  assert.equal(texts[1], CAU_DANG_TRA.tienDo);
  assert.match(texts[2], /8509\.40\.00/);
});

test('cửa: progress không bị trần ngày hoãn; giờ yên thì drop, kể cả là câu trả lời trực tiếp', () => {
  const base = { kind: 'progress', text: 'Dạ em đang tra ạ', inReplyToAt: '2026-11-04T02:59:59.000Z' };
  const d1 = decide(base, { now: '2026-11-04T03:00:00.000Z', sentTodayChat: 99, sentTodayAll: 999 });
  assert.equal(d1.decision, 'send');
  const dem = { ...base, inReplyToAt: '2026-11-04T16:29:59.000Z' };
  const d2 = decide(dem, { now: '2026-11-04T16:30:00.000Z' });
  assert.deepEqual([d2.decision, d2.reason], ['drop', 'progress:quiet-hours']);
});

test('createBaoDangTra: mỗi lượt tối đa một câu, kể cả gọi Cổng nhiều lần + có việc nền', async () => {
  const gui = [];
  let hen = null;
  const b = createBaoDangTra({ turn: {}, pack: { cauDangTra: () => 'Dạ em đang tra ạ' }, send: async (t) => { gui.push(t); },
    dongHo: { hen: (fn) => { hen = fn; return 1; }, huy: () => {} } });
  const ctx = b.boc({ mcp: { callTool: async () => ({ ok: true }) } });
  await b.chay(async () => {
    await ctx.mcp.callTool('phan_loai_hs', {});
    hen();   // quá mốc khi đang đợi Cổng
    await ctx.mcp.callTool('tra_thue', {});
    return { jobs: [{ maLuot: 'x', resultTool: 'y' }] };
  });
  assert.deepEqual(gui, ['Dạ em đang tra ạ']);
});

test('chữ câu đang tra: giọng Quyên, ngắn, không emoji, đúng loại việc', () => {
  assert.equal(cauDangTra({}, null, { congCu: 'phan_loai_hs' }), CAU_DANG_TRA.phanLoai);
  assert.equal(cauDangTra({}, null, { congCu: 'anh' }), CAU_DANG_TRA.anh);
  assert.equal(cauDangTra({}, null, { congCu: 'kiem_ma_to_khai', viecNen: true }), CAU_DANG_TRA.viecNen);
  assert.equal(cauDangTra({}, null, { congCu: 'tra_thue' }), CAU_DANG_TRA.chung);
  for (const c of Object.values(CAU_DANG_TRA)) {
    assert.match(c, /^Dạ /);
    assert.match(c, /anh\/chị/);
    assert.ok(c.length <= 110, c);
    assert.doesNotMatch(c, /\p{Extended_Pictographic}/u);
  }
});
