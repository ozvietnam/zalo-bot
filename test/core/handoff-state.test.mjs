// T022: core/handoff.js — trạng thái phòng (bot | human | blocked) theo NGƯỜI (conv_id).
// Điều II (hiến pháp 2.0.0, `.specify/memory/constitution.md:17`), FR-010 (spec.md:212).
// Kiểm trực tiếp createHandoff, cộng một cửa gửi thật để chứng minh bot im khi phòng do người cầm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createHandoff, HUMAN_IDLE_MS } from '../../core/handoff.js';
import { fakeChannel, fakeClock } from '../helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z'; // 10:00 giờ VN, ngoài giờ yên

function setup({ start = START, humanIdleMs } = {}) {
  const clock = fakeClock(start);
  const channel = fakeChannel();
  const store = openStore();
  const gate = createGate({ store, channel, now: clock.now });
  const handoff = createHandoff({ store, config: humanIdleMs === undefined ? {} : { humanIdleMs }, now: clock.now });
  // Phòng 1-1: conv_id = chat_id (core/conv.js:10). Lõi gặp người thì upsertSeen trước.
  store.chats.upsertSeen('c1', 'user', 'Khách A', start);
  store.convs.upsertSeen('c1', 'c1', null, 'Khách A', start);
  return { store, clock, channel, gate, handoff };
}

const stateChanges = (store, chatId = 'c1') => store.audit.byChat(chatId).filter((r) => r.type === 'state-change').reverse();

/** Tin của khách (lõi ghi ở core/engine.js:106). */
const khachNhan = (store, clock, text, convId = 'c1') =>
  store.messages.add({ conv_id: convId, chat_id: 'c1', turn_id: 't', speaker: 'khach', speaker_id: 'u1', text, at: clock.now().toISOString() });

/** Tin của nhân viên (cửa ghi khi gửi kind 'staff_relay' — core/gate.js:98). */
const nhanVienNhan = (store, clock, text, convId = 'c1') =>
  store.messages.add({ conv_id: convId, chat_id: 'c1', turn_id: 't', speaker: 'nhan-vien', speaker_id: 'nv1', text, at: clock.now().toISOString() });

/** Bot trả lời trực tiếp tin khách vừa nhắn (inReplyToAt = bây giờ): lý do chặn duy nhất còn lại là trạng thái phòng. */
const botGui = (gate, clock, text, i, convId = 'c1') =>
  gate.send({ idemKey: `r:${convId}:${i}`, chatId: 'c1', convId, turnId: `t${i}`, kind: 'reply', text, inReplyToAt: clock.now().toISOString() });

test('toHuman → human, ghi audit state-change; KHÔNG ghi human vào chats', () => {
  const { store, handoff } = setup();
  handoff.toHuman('c1', 'nv1', 'xin-nguoi');

  assert.equal(handoff.stateOf('c1'), 'human');
  assert.equal(store.convs.get('c1').state, 'human');
  assert.equal(store.convs.get('c1').state_by, 'nv1');
  assert.equal(store.convs.get('c1').state_reason, 'xin-nguoi');
  // Bẫy của việc này: cửa đọc chats cho chat 1-1 (core/gate.js:25). Ghi human vào chats thì
  // /tra-bot và tự về sẽ không mở lại được phòng. chats chỉ dùng cho blocked cả nhóm.
  assert.equal(store.chats.get('c1').state, 'bot');

  const ac = stateChanges(store);
  assert.equal(ac.length, 1);
  assert.deepEqual([ac[0].data.from, ac[0].data.to, ac[0].data.reason, ac[0].data.by], ['bot', 'human', 'xin-nguoi', 'nv1']);
});

test('toHuman rồi toBot → mỗi lần đúng một audit state-change, phòng mở lại được', async () => {
  const { store, clock, handoff, gate, channel } = setup();
  handoff.toHuman('c1', 'nv1', 'xin-nguoi');
  const bi = await botGui(gate, clock, 'bot nói khi phòng đang do người cầm', 1);
  assert.equal(bi.decision, 'reject');
  assert.equal(bi.reason, 'chat-human');

  handoff.toBot('c1', 'nv1');
  assert.equal(handoff.stateOf('c1'), 'bot');
  assert.equal(store.convs.get('c1').state, 'bot');
  assert.equal(stateChanges(store).length, 2);
  assert.equal(stateChanges(store)[1].data.to, 'bot');

  const sau = await botGui(gate, clock, 'phòng đã về bot nên câu này đi được', 2);
  assert.equal(sau.decision, 'send');
  assert.deepEqual(channel.sent.map((m) => m.text), ['phòng đã về bot nên câu này đi được']);
});

test('human tự về bot sau khoảng lặng lâu: 1 giờ vẫn human, 2 giờ thì bot, và KHÔNG gửi tin nào', () => {
  const { store, clock, channel, handoff } = setup();
  handoff.toHuman('c1', 'nv1', 'nhan');

  clock.advance('1h');
  assert.equal(handoff.stateOf('c1'), 'human');

  clock.advance('1h');
  assert.equal(handoff.stateOf('c1'), 'bot');
  assert.equal(store.convs.get('c1').state, 'bot');
  assert.equal(channel.sent.length, 0); // tự về chỉ đổi trạng thái, không nhắc khách (Điều II)

  const cuoi = stateChanges(store).at(-1);
  assert.equal(cuoi.data.to, 'bot');
  assert.equal(cuoi.data.reason, 'idle-timeout');
  assert.equal(cuoi.data.by, 'system');
  assert.equal(store.convs.get('c1').state_by, 'system');
  assert.equal(store.convs.get('c1').state_reason, 'idle-timeout');
});

test('ngưỡng mặc định đúng 2 giờ và đọc được từ config (HUMAN_IDLE_MS)', () => {
  assert.equal(HUMAN_IDLE_MS, 7_200_000);

  const a = setup();
  a.handoff.toHuman('c1', 'nv1', 'nhan');
  a.clock.advance(HUMAN_IDLE_MS - 1);
  assert.equal(a.handoff.stateOf('c1'), 'human'); // đúng mốc trước ngưỡng: chưa về
  a.clock.advance(1);
  assert.equal(a.handoff.stateOf('c1'), 'bot');

  const b = setup({ humanIdleMs: 45 * 60_000 });
  b.handoff.toHuman('c1', 'nv1', 'nhan');
  b.clock.advance(45 * 60_000);
  assert.equal(b.handoff.stateOf('c1'), 'bot'); // vận hành hạ ngưỡng được bằng env
});

test('tự về chỉ ghi audit một lần, dù stateOf được gọi nhiều lần', () => {
  const { store, clock, handoff } = setup();
  handoff.toHuman('c1', 'nv1', 'nhan');
  clock.advance('3h');
  assert.equal(handoff.stateOf('c1'), 'bot');
  assert.equal(handoff.stateOf('c1'), 'bot');
  assert.equal(handoff.stateOf('c1'), 'bot');
  assert.equal(stateChanges(store).filter((r) => r.data.reason === 'idle-timeout').length, 1);
});

test('bộ đếm tính lại khi có TIN KHÁCH', () => {
  const { store, clock, handoff } = setup();
  handoff.toHuman('c1', 'nv1', 'nhan');
  clock.advance('1h');
  khachNhan(store, clock, 'anh ơi em vẫn chờ ạ');
  clock.advance('1h');
  assert.equal(handoff.stateOf('c1'), 'human'); // 2 giờ từ lúc nhận, nhưng chỉ 1 giờ từ tin cuối
  clock.advance('1h');
  assert.equal(handoff.stateOf('c1'), 'bot');
});

test('bộ đếm tính lại khi có TIN NHÂN VIÊN', () => {
  const { store, clock, handoff } = setup();
  handoff.toHuman('c1', 'nv1', 'nhan');
  clock.advance('1h');
  nhanVienNhan(store, clock, 'Dạ anh chờ em 5 phút ạ');
  clock.advance('1h');
  assert.equal(handoff.stateOf('c1'), 'human');
  clock.advance('1h');
  assert.equal(handoff.stateOf('c1'), 'bot');
});

test('bộ đếm tính lại khi LỆNH NHÂN VIÊN chạm vào phòng (không sinh tin nào)', () => {
  const { store, clock, handoff } = setup();
  handoff.toHuman('c1', 'nv1', 'nhan');
  clock.advance('1h');
  handoff.touch('c1', 'nv2'); // ví dụ /nhan trên phòng đã human: không gửi tin, chỉ chạm
  assert.equal(store.messages.recent('c1', 10).length, 0);
  assert.equal(stateChanges(store).length, 1); // chạm không phải đổi trạng thái
  clock.advance('1h');
  assert.equal(handoff.stateOf('c1'), 'human');
  clock.advance('1h');
  assert.equal(handoff.stateOf('c1'), 'bot');
});

test('tin của BOT không tính là khoảng lặng được phá', async () => {
  const { store, clock, handoff, gate } = setup();
  handoff.toHuman('c1', 'nv1', 'nhan');
  clock.advance('1h');
  store.messages.add({ conv_id: 'c1', chat_id: 'c1', turn_id: 't', speaker: 'bot', text: 'tin cũ của bot', at: clock.now().toISOString() });
  await botGui(gate, clock, 'bot thử chen ngang', 9);
  clock.advance('1h');
  assert.equal(handoff.stateOf('c1'), 'bot'); // đủ 2 giờ không có người nói → tự về
});

test('phiếu không liên quan: phiếu còn mở vẫn tự về, đóng phiếu không làm phòng về ngay', () => {
  const a = setup();
  a.handoff.toHuman('c1', 'nv1', 'xin-nguoi');
  a.store.tickets.open('c1', 'c1', 'xin-nguoi', a.clock.now().toISOString());
  a.clock.advance('3h');
  assert.equal(a.handoff.stateOf('c1'), 'bot'); // phiếu còn open mà vẫn tự về
  assert.equal(a.store.tickets.openFor('c1').status, 'open');

  const b = setup();
  b.handoff.toHuman('c1', 'nv1', 'xin-nguoi');
  const p = b.store.tickets.open('c1', 'c1', 'xin-nguoi', b.clock.now().toISOString());
  b.clock.advance('30m');
  b.store.tickets.update(p.id, { status: 'closed', closed_at: b.clock.now().toISOString() });
  assert.equal(b.handoff.stateOf('c1'), 'human'); // đóng phiếu KHÔNG mở phòng cho bot
});

test('block → blocked kể cả khi khách nhắn tiếp; blocked không tự về', () => {
  const { store, clock, handoff } = setup();
  handoff.block('c1', 'nv1');
  khachNhan(store, clock, 'cho em hỏi lại ạ');
  assert.equal(handoff.stateOf('c1'), 'blocked');
  clock.advance('5h');
  assert.equal(handoff.stateOf('c1'), 'blocked'); // chỉ /tra-bot mở lại (data-model.md:40)
  assert.equal(store.convs.get('c1').state, 'blocked');

  handoff.toBot('c1', 'nv1');
  assert.equal(handoff.stateOf('c1'), 'bot');
});

test('chats blocked (chặn cả nhóm) đè lên trạng thái theo người, như cửa gửi', () => {
  const { store, handoff } = setup();
  store.chats.setState('c1', 'blocked', 'nv1', 'chặn nhóm', START);
  assert.equal(handoff.stateOf('c1'), 'blocked');
});

test('trong nhóm: human theo từng người, người khác vẫn bot', async () => {
  const { store, clock, gate, handoff } = setup();
  store.chats.upsertSeen('g1', 'group', null, START);
  store.convs.upsertSeen('g1:A', 'g1', 'A', 'An', START);
  store.convs.upsertSeen('g1:B', 'g1', 'B', 'Bình', START);

  handoff.toHuman('g1:A', 'nv1', 'xin-nguoi');
  assert.equal(handoff.stateOf('g1:A'), 'human');
  assert.equal(handoff.stateOf('g1:B'), 'bot');

  const a = await gate.send({ idemKey: 'g:A', chatId: 'g1', convId: 'g1:A', isGroup: true, turnId: 'ta', kind: 'reply', text: 'trả lời An', inReplyToAt: clock.now().toISOString() });
  const b = await gate.send({ idemKey: 'g:B', chatId: 'g1', convId: 'g1:B', isGroup: true, turnId: 'tb', kind: 'reply', text: 'trả lời Bình', inReplyToAt: clock.now().toISOString() });
  assert.equal(a.reason, 'chat-human');
  assert.equal(b.decision, 'send');

  clock.advance('3h');
  assert.equal(handoff.stateOf('g1:A'), 'bot');
  assert.equal(store.convs.get('g1:A').chat_id, 'g1'); // tự về không làm hỏng khoá phòng
});

test('toHuman trên conv chưa có dòng nào → tự tạo, giữ đúng chat_id', () => {
  const { store, handoff } = setup();
  handoff.toHuman('g9:U', 'nv1', 'xin-nguoi', { chatId: 'g9' });
  assert.equal(store.convs.get('g9:U').state, 'human');
  assert.equal(store.convs.get('g9:U').chat_id, 'g9');
  assert.equal(store.chats.get('g9'), null); // handoff không bịa dòng chats
});

// Sự cố #4 (specs/001-nen-tang-chung/research.md:13): 22 tin bot gửi ngay sau tin nhân viên gõ tay,
// trong 7 ngày, vì hàng chờ tự nhận lại phòng "người" sau 45 phút không ai trả lời.
test('sự cố #4: sau tin nhân viên, 45 phút lặng KHÔNG mở phòng cho bot — 22 tin bot đều bị cửa chặn', async () => {
  const { store, clock, channel, gate, handoff } = setup();
  khachNhan(store, clock, 'em cần gặp người thật ạ');
  handoff.toHuman('c1', 'nv1', 'xin-nguoi');
  clock.advance('2m');
  nhanVienNhan(store, clock, 'Dạ em là Hà, em hỗ trợ anh ngay ạ');

  clock.advance(45 * 60_000); // đúng ngưỡng cũ đã gây sự cố
  assert.equal(handoff.stateOf('c1'), 'human');

  const lyDo = new Set();
  for (let i = 0; i < 22; i++) {
    clock.advance('30s');
    const r = await botGui(gate, clock, `tin bot số ${i} chen vào phòng của nhân viên`, i);
    lyDo.add(`${r.decision}:${r.reason}`);
  }
  assert.deepEqual([...lyDo], ['reject:chat-human']);
  assert.equal(channel.sent.length, 0);
  assert.equal(handoff.stateOf('c1'), 'human'); // vẫn là người cầm phòng

  // Chỉ khi lặng đủ khoảng lặng lâu (tính từ tin cuối của NGƯỜI, không từ lúc mở phiếu) phòng mới tự về,
  // và lúc tự về không có tin nào đi ra.
  clock.advance('2h');
  assert.equal(handoff.stateOf('c1'), 'bot');
  assert.equal(channel.sent.length, 0);
});
