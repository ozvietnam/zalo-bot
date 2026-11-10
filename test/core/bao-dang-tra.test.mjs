// Báo "đang tra" (issue #136 mục 5, mở lại ở #168):
//  1. Lượt nào phải nhờ Cổng chạy nền (khách sẽ chờ 1–3 phút) thì TRONG 3 GIÂY khách nhận một câu ngắn.
//  2. Quá 60 giây chưa có kết quả thì báo tiến độ ĐÚNG MỘT LẦN, không nhắc lại mỗi nhịp hỏi.
// Thời gian ở test 1 là đo THẬT (đồng hồ treo tường), không phải đồng hồ giả.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createRegistry } from '../../core/registry.js';
import { createEngine } from '../../core/engine.js';
import { createJobs } from '../../core/jobs.js';
import hsPack from '../../packs/hs/index.js';
import { fakeChannel, fakeClock, fakeMcp } from '../helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z';   // 10:00 giờ VN
const silent = { info() {}, error() {} };
const ML = 'ml-dang-tra-0001';

/** Cổng giả: phân loại luôn còn chạy → lượt khách chắc chắn sinh việc nền. */
const SCRIPT_CHAY_NEN = {
  phan_loai_hs: () => ({ ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } }),
  ket_qua_phan_loai: () => ({ ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } }),
};

function setup({ script = SCRIPT_CHAY_NEN, start = START } = {}) {
  const store = openStore();
  const clock = fakeClock(start);
  const channel = fakeChannel();
  const mcp = fakeMcp(script);
  const gate = createGate({ store, channel, now: clock.now });
  const engine = createEngine({
    config: {}, store, channel, mcp, registry: createRegistry([hsPack]), gate, now: clock.now, log: silent,
    advance: (ms) => { if (ms > clock.now().getTime()) clock.set(ms); },
  });
  return { store, clock, channel, mcp, gate, engine };
}

let seq = 0;
const upd = (text, o = {}) => ({
  updateKey: o.id ?? `t${++seq}`, event: 'message.text.received', chatId: o.chatId ?? 'c1', userId: o.userId ?? 'u1',
  userName: o.userName ?? 'Tuấn', chatType: 'PRIVATE', text, photoUrl: null, caption: null, messageId: o.id ?? null,
});
const toKhach = (channel) => channel.sent.filter((m) => m.chatId === 'c1').map((m) => m.text);

test('đang tra: lượt sinh việc nền → khách nhận câu chờ trong ≤ 3 giây (đo thật)', async () => {
  const { channel, engine } = setup();
  const t0 = process.hrtime.bigint();
  // KHÔNG drain: chỉ tính phần khách thấy ngay trong lượt của mình.
  await engine.process(upd('tra hs máy xay sinh tố 350W, thân nhựa, dùng trong gia đình', { id: 'd1' }));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;

  const sent = toKhach(channel);
  assert.equal(sent.length, 1, `phải có đúng 1 câu chờ, có: ${JSON.stringify(sent)}`);
  assert.match(sent[0], /chờ em tra/i);
  assert.ok(sent[0].length <= 120, `câu chờ phải NGẮN, dài ${sent[0].length} ký tự`);
  assert.ok(ms <= 3000, `câu chờ phải ra trong 3 giây, đo được ${ms.toFixed(0)} ms`);
});

test('đang tra: khách gõ mô tả tự do (không chọn gói) cũng được báo chờ, không im lặng', async () => {
  const { channel, engine } = setup();
  await engine.process(upd('máy bơm nước ly tâm 1.5HP thân gang, bơm nước sinh hoạt', { id: 'd2' }));
  const sent = toKhach(channel);
  assert.equal(sent.length, 1, `mô tả tự do phải được báo chờ, có: ${JSON.stringify(sent)}`);
  assert.match(sent[0], /chờ em tra/i);
});

test('đang tra: câu chờ dùng xưng hô của khách, không gọi cứng "anh"', async () => {
  const { channel, engine } = setup();
  await engine.process(upd('chị cần tra hs máy xay sinh tố 350W thân nhựa', { id: 'd3' }));
  const sent = toKhach(channel);
  assert.equal(sent.length, 1, JSON.stringify(sent));
  assert.match(sent[0], /chị/);
  assert.doesNotMatch(sent[0], /(?:^|[^\p{L}])anh(?!\/)/u, `khách tự nhận là chị thì không được gọi "anh": ${sent[0]}`);
});

test('đang tra: khách không nói xưng hô → mặc định "anh/chị"', async () => {
  const { channel, engine } = setup();
  await engine.process(upd('tra hs máy xay sinh tố 350W thân nhựa', { id: 'd4' }));
  assert.match(toKhach(channel)[0], /anh\/chị/);
});

test('tiến độ: quá 60 giây chưa xong → báo ĐÚNG 1 lần, nhịp hỏi sau không nhắc lại', async () => {
  const { store, clock, channel, engine } = setup();
  await engine.process(upd('tra hs máy xay sinh tố 350W thân nhựa', { id: 'd5' }));
  assert.equal(toKhach(channel).length, 1);                  // [0] câu chờ

  // Nhịp hỏi của lõi: 6 → 18 → 42 → 90 giây (core/jobs.js backoff). Mốc 42 s còn dưới 60 s: chưa báo.
  clock.advance('45s');
  await engine.jobs.tick();
  assert.equal(toKhach(channel).length, 1, `dưới 60 s chưa được báo tiến độ: ${JSON.stringify(toKhach(channel))}`);

  clock.advance('60s');                                       // đã quá 60 s kể từ lúc nhận việc
  await engine.jobs.tick();
  const sau = toKhach(channel);
  assert.equal(sau.length, 2, `quá 60 s phải báo tiến độ: ${JSON.stringify(sau)}`);
  assert.match(sau[1], /(vẫn đang|đang tra|chút nữa|lâu hơn)/i);
  assert.ok(sau[1].length <= 200, `câu báo tiến độ phải ngắn, dài ${sau[1].length}`);

  // Mọi nhịp hỏi tiếp theo: KHÔNG nhắc lại (không spam khách).
  for (let i = 0; i < 4; i++) { clock.advance('60s'); await engine.jobs.tick(); }
  assert.equal(toKhach(channel).length, 2, `chỉ báo tiến độ 1 lần, có: ${JSON.stringify(toKhach(channel))}`);
  assert.ok(store.jobs.due('2099-01-01T00:00:00.000Z').length === 1, 'việc vẫn còn chờ, chưa bị đánh dấu xong');
});

test('tiến độ: gói không có onJobProgress → lõi không tự soạn chữ, không gửi gì', async () => {
  const store = openStore();
  const clock = fakeClock(START);
  const channel = fakeChannel();
  const pack = {
    id: 'jp', ten: 'Gói việc nền', version: '1', audience: 'public', priority: 9, match: () => true,
    async handle() { return {}; },
    async onJobResult(job, res) { return { replies: [{ text: `Xong ${job.maLuot}` }], evidence: res ? [res] : [] }; },
  };
  const gate = createGate({ store, channel, now: clock.now });
  const jobs = createJobs({
    store, registry: createRegistry([pack]), gate, now: clock.now, log: silent,
    mcp: fakeMcp({ kq: () => ({ trangThai: 'DANG_XU_LY' }) }), tools: async () => new Set(['kq']),
  });
  jobs.add({ turnId: 't1', chatId: 'c1', convId: 'c1', userId: 'u1', userName: 'Tuấn', isGroup: false, receivedAt: START },
    'c1', 'jp', { maLuot: 'L-no-progress', resultTool: 'kq' });
  for (let i = 0; i < 5; i++) { clock.advance('60s'); await jobs.tick(); }
  assert.deepEqual(channel.sent, [], 'gói không có hook báo tiến độ thì lõi im');
});
