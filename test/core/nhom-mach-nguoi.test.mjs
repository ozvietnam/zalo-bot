// test/core/nhom-mach-nguoi.test.mjs — issue #201 (QA G2 bước 4).
//
// Trong NHÓM, mỗi người có mạch riêng (`convId = chatId:userId`, `core/conv.js:22`), nhưng cửa gửi
// đếm trần theo CẢ PHÒNG (`capGroupDay`) và chống trùng Jaccard trên `recentBotTexts` của mạch.
// Kịch bản thật của khách: An hỏi mã HS → Bình chen ngang hỏi mã khác → An quay lại hỏi tiếp
// ("@OZ Tra cứu HS thuế bao nhiêu?"). Bước 4 bot phải trả lời ĐÚNG mạch của An, gắn thẻ @An.
//
// Bẫy đo được ở đây: hai lượt của CÙNG một người trong nhóm, cùng một mã HS (lượt 2 tự kèm phần
// thuế, lượt 4 hỏi lại thuế) ra chữ gần như nhau → `core/gate-decide.js:136` quyết `drop` vì
// `similar:…`, và khách thấy bot IM. `dupDirectMs` không cứu được vì lượt 4 cũng là câu trả lời
// trực tiếp, nhưng cửa sổ 60 giây của nó tính từ mốc tin khách — khách hỏi tiếp trong vòng một
// phút (đúng như trong nhóm đông) thì tin thứ hai rơi vào cửa sổ và bị bỏ.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createRegistry } from '../../core/registry.js';
import { createEngine } from '../../core/engine.js';
import { fakeChannel, fakeClock, fakeMcp } from '../helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z'; // 10:00 VN
const silent = { info() {}, warn() {}, error() {} };

/** Gói giả soạn câu trả lời THUẾ cho một mã HS — cùng khuôn chữ như `packs/hs` dựng. */
function goiThue() {
  const traLoi = (ma) => [
    `{b}💰 Thuế — ${ma} (giả định xuất xứ Trung Quốc){/b}`,
    `📦 {b}${ma}{/b} — Máy bơm ly tâm khác`,
    '{b}💰 Thuế suất{/b}',
    '• NK ưu đãi (MFN): 0%',
    '• ACFTA (C/O mẫu E, xuất xứ CN): 0%',
    '• VAT: 10%',
    '',
    '{b}📋 Chính sách nhập khẩu{/b}',
    '✅ Cổng OZ chưa ghi nhận chính sách quản lý chuyên ngành cho mã này.',
  ].join('\n');

  return {
    id: 'thue-gia', ten: 'Thuế giả', version: '1', audience: 'public', priority: 50,
    match: () => true,
    async handle(turn, ctx) {
      const ma = (String(turn.text || '').match(/(?<!\d)\d{8}(?!\d)/) || [])[0] || ctx.session.get().maHs;
      if (!ma) return { replies: [], evidence: [] };
      ctx.session.set({ ...ctx.session.get(), maHs: ma });
      return { replies: [{ text: traLoi(ma) }], evidence: [] };
    },
  };
}

function setup({ rules } = {}) {
  const store = openStore();
  const clock = fakeClock(START);
  const channel = fakeChannel();
  channel.typing = async () => {};
  const mcp = fakeMcp({});
  const gate = createGate({ store, channel, rules, now: clock.now, log: () => {} });
  const engine = createEngine({
    config: { botNames: ['OZ Tra cứu HS', 'Bot OZ'], capChatDay: 100, capGroupDay: 500, capAllDay: 1000 },
    store, channel, mcp, registry: createRegistry([goiThue()]), gate, now: clock.now, log: silent,
  });
  return { store, clock, channel, engine };
}

let seq = 0;
/** Một tin trong nhóm `nhom_xnk_01`, có nhắc tên bot như khách gõ thật. */
const tinNhom = (text, userId, userName) => ({
  updateKey: `g2_${++seq}`, event: 'message.text.received', chatId: 'nhom_xnk_01',
  userId, userName, chatType: 'GROUP', text, photoUrl: null, caption: null, messageId: `m${seq}`,
});

test('G2 bước 4 (#201): An hỏi tiếp sau khi Bình chen ngang → bot vẫn trả lời mạch của An, gắn @An', async () => {
  const { channel, clock, engine } = setup();

  // Bước 1: Cường nói chuyện, không nhắc bot → bot im.
  await engine.process(tinNhom('Mọi người kiểm tra giúp tiến độ lô hàng với nhé', 'u_cuong', 'Cường'));
  await engine.drain();
  assert.equal(channel.sent.length, 0, 'bước 1: không nhắc bot thì bot phải im');

  // Bước 2: An gọi bot hỏi mã HS của An.
  clock.advance('30s');
  await engine.process(tinNhom('@OZ Tra cứu HS tra giúp mã 84137090', 'u_an', 'An'));
  await engine.drain();
  assert.equal(channel.sent.length, 1, 'bước 2: An gọi bot thì phải có đúng 1 tin');
  assert.ok(channel.sent[0].text.startsWith('@An'), 'bước 2: phải gắn thẻ @An');

  // Bước 3: Bình chen ngang, hỏi một mã khác.
  clock.advance('30s');
  await engine.process(tinNhom('@OZ Tra cứu HS tra giúp mã 85044090', 'u_binh', 'Bình'));
  await engine.drain();
  assert.equal(channel.sent.length, 2, 'bước 3: Bình gọi bot thì phải có thêm 1 tin');
  assert.ok(channel.sent[1].text.startsWith('@Bình'), 'bước 3: phải gắn thẻ @Bình');

  // Bước 4: An quay lại hỏi tiếp mạch của mình — ĐÂY là bước issue #201 báo bot im.
  clock.advance('30s');
  await engine.process(tinNhom('@OZ Tra cứu HS thuế bao nhiêu?', 'u_an', 'An'));
  await engine.drain();

  const moi = channel.sent.slice(2);
  assert.equal(moi.length, 1, `bước 4: An hỏi tiếp thì bot phải trả lời, thực tế gửi ${moi.length} tin`);
  assert.ok(moi[0].text.startsWith('@An'), 'bước 4: phải gắn thẻ @An, không phải @Bình');
  assert.match(moi[0].text, /8413/, 'bước 4: phải trả lời mã 8413 của mạch An, không phải mã của Bình');
});

test('khách bấm gửi HAI LẦN cùng một câu trong nhóm → vẫn chỉ một câu trả lời (sự cố #2)', async () => {
  // Mặt đối của #201, giữ nguyên lớp chặn sinh ra từ sự cố #2 (`research.md:11`: một khách nhận 3 tin
  // gần giống nhau trong 4 phút). Bấm gửi hai lần thì Zalo cho HAI updateKey KHÁC nhau nhưng CHỮ
  // KHÁCH GIỐNG nhau — nên dấu hiệu của bước 6 phải là CHỮ, không phải mã lượt. Nếu ai đổi
  // `askKey` về `turnId` thì test này đỏ.
  const { channel, clock, engine } = setup();

  clock.advance('30s');
  await engine.process(tinNhom('@OZ Tra cứu HS tra giúp mã 84137090', 'u_an', 'An'));
  await engine.drain();
  assert.equal(channel.sent.length, 1, 'lần bấm thứ nhất phải được trả lời');

  clock.advance('20s');
  await engine.process(tinNhom('@OZ Tra cứu HS tra giúp mã 84137090', 'u_an', 'An'));
  await engine.drain();
  assert.equal(channel.sent.length, 1, 'lần bấm thứ hai cùng một câu thì KHÔNG được gửi thêm');
});

test('cửa gửi không được bỏ câu trả lời thứ hai cùng mã của cùng một người trong nhóm (#201)', async () => {
  const { store, channel, clock, engine } = setup();

  clock.advance('30s');
  await engine.process(tinNhom('@OZ Tra cứu HS tra giúp mã 84137090', 'u_an', 'An'));
  await engine.drain();

  // An hỏi lại ngay trong vòng một phút (nhóm đông khách hay vậy): câu trả lời gần như trùng chữ,
  // nhưng là câu trả lời cho một câu hỏi MỚI của khách → không được rơi vào `drop similar:…`.
  clock.advance('20s');
  await engine.process(tinNhom('@OZ Tra cứu HS thuế bao nhiêu?', 'u_an', 'An'));
  await engine.drain();

  assert.equal(channel.sent.length, 2, 'hai câu hỏi của An phải có hai câu trả lời');
  const quyetDinh = store.audit.byChat('nhom_xnk_01', 200)
    .filter((a) => a.type === 'gate')
    .map((a) => `${a.data.decision}:${a.data.reason}`);
  assert.ok(
    !quyetDinh.some((q) => q.startsWith('drop:similar')),
    `cửa gửi không được bỏ vì trùng chữ, quyết định thật: ${quyetDinh.join(', ')}`,
  );
});
