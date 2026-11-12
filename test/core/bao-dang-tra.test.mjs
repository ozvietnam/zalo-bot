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

function dung({ pack, congMs = 0, start = START, config = {}, mcpTraVe = null, brain = null, editor = null } = {}) {
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
    config: { botNames: ['OZ'], ...config }, store, channel: ch, mcp, brain, editor, registry: createRegistry([pack]), gate, now: clock.now,
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
  assert.equal(cauDangTra({}, null, { congCham: true }), CAU_DANG_TRA.congCham);
  for (const c of Object.values(CAU_DANG_TRA)) {
    assert.match(c, /^Dạ /);
    assert.match(c, /anh\/chị/);
    assert.ok(c.length <= 110, c);
    assert.doesNotMatch(c, /\p{Extended_Pictographic}/u);
  }
});

// ─────────── OZV-496: bot không im khi Cổng chậm (QA thật 12/11, lỗi 1 + 2) ───────────
// QA thật 12/11 (SHA d776735): G4 giọng Quyên/G5 chờ não định tuyến 5–9 giây trước lượt gọi Cổng
// đầu tiên nên câu "đang tra" chỉ ra SAU não; G4 bước 2 hỏi tiếp sau bước 1 có 45 giây thì câu
// "đang tra" bị cửa bỏ `similar:1.00` (chống trùng chữ khuôn) và Cổng treo >120 giây → khách im.
test('OZV-496 (a) não định tuyến chậm 4 giây TRƯỚC lượt gọi Cổng: câu "đang tra" vẫn ra ≤ 3 giây', async () => {
  const pack = { ...goiGia(), async handle(turn, ctx) {
    // Não hiểu câu hỏi chạy trước, mất 4 giây (Gemini thật 12/11 mất 5–9 giây) — lượt gọi Cổng chỉ
    // bắt đầu SAU não. Đánh dấu phải coi não cũng là "lượt đang đợi việc chậm", không đợi tới Cổng.
    await ctx.brain.hieu({ text: turn.text });
    await ctx.mcp.callTool('tra_thue', { maHs: '85094000' });
    return { replies: [{ text: 'Dạ mã phù hợp là 8509.40.00 ạ.' }] };
  } };
  const brain = { hieu: async () => { await ngu(4000); return null; } };
  const { engine, ch } = dung({ pack, brain });
  const t0 = Date.now();
  await engine.process(tin('m1', 'thuế 85094000'));
  assert.equal(ch.sent.length, 2, JSON.stringify(ch.sent));
  assert.ok(laDangTra(ch.sent[0].text), `tin đầu phải là câu đang tra: ${ch.sent[0].text}`);
  assert.match(ch.sent[1].text, /8509\.40\.00/);
  const sau = ch.luc[0] - t0;
  assert.ok(sau <= 3000, `câu đang tra ra sau ${sau} ms (> 3000)`);
});

test('OZV-496 (a2) não biên tập chậm (editor.chot) cũng được đánh dấu, không đợi Cổng', async () => {
  const pack = { ...goiGia({ goiCong: false }), async handle(turn, ctx) {
    await ctx.editor.chot({ text: 'mô tả', loai: 'biên tập' });
    return { replies: [{ text: 'Dạ mã phù hợp là 8509.40.00 ạ.' }] };
  } };
  const editor = { chot: async () => { await ngu(80); return null; } };
  const { engine, ch } = dung({ pack, editor, config: { dangTraSauMs: 20 } });
  await engine.process(tin('m1', 'máy xay sinh tố 350W'));
  const texts = ch.sent.map((m) => m.text);
  assert.equal(texts.length, 2, JSON.stringify(texts));
  assert.ok(laDangTra(texts[0]), texts[0]);
});

test('OZV-496 (b) Cổng treo quá hạn chờ: có câu tạm đúng giọng, KHÔNG im, KHÔNG bịa mã', async () => {
  // Hạn câu tạm thu nhỏ còn 150 ms để test nhanh; Cổng "treo" 300 ms rồi mới trả (thật: 120 giây).
  const { engine, ch } = dung({ pack: goiGia(), congMs: 300, config: { dangTraSauMs: 20, cauTamSauMs: 150 } });
  await engine.process(tin('m1', 'thuế 85094000'));
  const texts = ch.sent.map((m) => m.text);
  assert.equal(texts.length, 3, JSON.stringify(texts));
  assert.ok(laDangTra(texts[0]), `tin đầu phải là câu đang tra: ${texts[0]}`);
  assert.equal(texts[1], CAU_DANG_TRA.congCham, 'câu tạm phải ra khi Cổng treo');
  assert.match(texts[2], /8509\.40\.00/, 'kết quả vẫn tới sau khi Cổng hồi phục');
  // KHÔNG bịa mã: câu tạm không chứa số nào trông như mã HS.
  assert.doesNotMatch(CAU_DANG_TRA.congCham, /\d{4}/);
});

test('OZV-496 (b2) lượt NHANH không chờ ai: không có câu tạm (khỏi ồn), đúng một tin kết quả', async () => {
  const { engine, ch } = dung({ pack: goiGia(), congMs: 5, config: { dangTraSauMs: 10_000, cauTamSauMs: 10 } });
  await engine.process(tin('m1', 'thuế 85094000'));
  assert.deepEqual(ch.sent.map((m) => m.text), ['Dạ mã phù hợp là 8509.40.00 ạ.']);
});

test('OZV-496 (b3) gói không soạn câu (không có cauDangTra): lõi KHÔNG tự soạn câu tạm', async () => {
  const { engine, ch } = dung({ pack: goiGia({ coCau: false }), congMs: 300, config: { dangTraSauMs: 20, cauTamSauMs: 150 } });
  await engine.process(tin('m1', 'thuế 85094000'));
  assert.deepEqual(ch.sent.map((m) => m.text), ['Dạ mã phù hợp là 8509.40.00 ạ.']);
});

test('OZV-496 (c) hỏi tiếp ngay sau lượt trước: câu "đang tra" của câu MỚI không bị cửa bỏ similar', async () => {
  // QA thật 12/11 G4 bước 1→2: bước 2 nhắn sau bước 1 có 45 giây, cùng chờ Cổng → câu khuôn
  // "đang tra" bị bước 6 của cửa bỏ `similar:1.00` trong dupDirectMs 60 giây → khách im toàn lượt.
  const { engine, ch } = dung({ pack: goiGia({ viec: true }), congMs: 100 });
  await engine.process(tin('m1', 'máy xay sinh tố gia đình 350W'));
  await engine.drain();
  await engine.process(tin('m2', 'máy xay sinh tố công nghiệp 1500W'));
  await engine.drain();
  const texts = ch.sent.map((m) => m.text);
  assert.equal(texts.filter((t) => laDangTra(t)).length, 2, `mỗi câu khách một câu đang tra: ${JSON.stringify(texts)}`);
});

test('OZV-496 (d) câu tạm chỉ MỘT câu mỗi lượt, Cổng treo qua hạn rồi trả vẫn chỉ một câu tạm', async () => {
  const { engine, ch } = dung({ pack: goiGia(), congMs: 400, config: { dangTraSauMs: 20, cauTamSauMs: 100 } });
  await engine.process(tin('m1', 'thuế 85094000'));
  const texts = ch.sent.map((m) => m.text);
  assert.equal(texts.filter((t) => t === CAU_DANG_TRA.congCham).length, 1, JSON.stringify(texts));
  assert.equal(texts.length, 3);
});
