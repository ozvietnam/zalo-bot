// T024: phiếu vào nhóm nhân viên + gộp tin khách (FR-012, `specs/001-nen-tang-chung/spec.md:231`).
// Phiếu là tin ra → phải đi qua đúng một cửa `core/gate.js` (Điều I). Nhóm nhân viên là đồ giả:
// chưa có nhóm Zalo thật, nên test đặt `config.staffChatId = 'S1'` và đọc tin trong kênh giả.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createHandoff, TICKET_FORWARD_MS } from '../../core/handoff.js';
import { fakeChannel, fakeClock } from '../helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z'; // 10:00 giờ VN, ngoài giờ yên
const STAFF = 'S1';

function setup({ start = START, staffChatId = STAFF } = {}) {
  const clock = fakeClock(start);
  const channel = fakeChannel();
  const store = openStore();
  const loi = [];
  const gate = createGate({ store, channel, now: clock.now });
  const handoff = createHandoff({ store, gate, config: { staffChatId }, now: clock.now, log: (...a) => loi.push(a) });
  store.chats.upsertSeen('c1', 'user', 'Khách A', start);
  store.convs.upsertSeen('c1', 'c1', null, 'Khách A', start);
  return { store, clock, channel, gate, handoff, loi };
}

/** Tin nhóm nhân viên đã nhận (kênh giả ghi theo chat_id). */
const tinNhom = (channel) => channel.sent.filter((m) => m.chatId === STAFF).map((m) => m.text);

const khachNhan = (store, clock, text, convId = 'c1', chatId = 'c1') =>
  store.messages.add({ conv_id: convId, chat_id: chatId, turn_id: 't', speaker: 'khach', speaker_id: 'u1', text, at: clock.now().toISOString() });

const botNoi = (store, clock, text, convId = 'c1') =>
  store.messages.add({ conv_id: convId, chat_id: 'c1', turn_id: 't', speaker: 'bot', text, at: clock.now().toISOString() });

test('open → nhóm nhân viên nhận ĐÚNG MỘT tin kind ticket, có P<id>, tên khách và 5 tin gần nhất', async () => {
  const { store, clock, channel, handoff } = setup();
  khachNhan(store, clock, 'em muốn nhập máy bơm nước ly tâm');
  botNoi(store, clock, 'Dạ mã gợi ý 8413.70.90 ạ');
  clock.advance('1m');
  khachNhan(store, clock, 'thuế bao nhiêu ạ');
  botNoi(store, clock, 'Dạ thuế nhập khẩu 10% ạ');
  clock.advance('1m');
  khachNhan(store, clock, 'cho em gặp nhân viên');

  const r = await handoff.open('c1', 'khach-xin-nguoi');

  assert.equal(r.ticket.id, 1);
  assert.equal(r.ticket.conv_id, 'c1');
  assert.equal(r.ticket.chat_id, 'c1');
  assert.equal(r.ticket.status, 'open');
  assert.equal(r.ticket.reason, 'khach-xin-nguoi');
  assert.equal(r.daCo, false);
  assert.equal(r.sent.decision, 'send');

  const tin = tinNhom(channel);
  assert.equal(tin.length, 1, 'đúng một tin vào nhóm');
  assert.match(tin[0], /P1/);
  assert.match(tin[0], /Khách A/);
  assert.match(tin[0], /khach-xin-nguoi/);
  // 5 tin gần nhất, đủ cả hai phía, theo thứ tự thời gian tăng dần.
  for (const s of ['máy bơm nước ly tâm', '8413.70.90', 'thuế bao nhiêu ạ', 'thuế nhập khẩu 10%', 'cho em gặp nhân viên']) {
    assert.match(tin[0], new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `thiếu "${s}"`);
  }
  assert.ok(tin[0].indexOf('máy bơm') < tin[0].indexOf('cho em gặp nhân viên'), 'tin cũ ở trên');
  // Dòng outbox là kind 'ticket' và nằm ở phòng nhân viên, không ở phòng khách.
  const row = store.outbox.lastForChat(STAFF);
  assert.equal(row.kind, 'ticket');
  assert.equal(row.chat_id, STAFF);
  // Mốc gộp được đặt lúc mở phiếu: 5 tin đã nằm trong phiếu thì không chuyển lại.
  assert.equal(r.ticket.conv_id, 'c1');
  assert.equal(store.tickets.openFor('c1').last_forward_at, clock.now().toISOString());
});

test('chỉ lấy 5 tin gần nhất, tin thứ 6 trở về trước không vào phiếu', async () => {
  const { store, clock, channel, handoff } = setup();
  khachNhan(store, clock, 'tin rất cũ phải bị bỏ ra ngoài phiếu');
  for (let i = 0; i < 5; i++) {
    clock.advance('1m');
    khachNhan(store, clock, `tin mới số ${i}`);
  }
  await handoff.open('c1', 'khach-xin-nguoi');
  const t = tinNhom(channel)[0];
  assert.doesNotMatch(t, /tin rất cũ/);
  assert.match(t, /tin mới số 0/);
  assert.match(t, /tin mới số 4/);
});

test('phòng đã có phiếu open → KHÔNG mở phiếu thứ hai, nhóm không nhận tin thứ hai', async () => {
  const { store, clock, channel, handoff } = setup();
  khachNhan(store, clock, 'cho em gặp nhân viên');
  const a = await handoff.open('c1', 'khach-xin-nguoi');
  clock.advance('10m');
  const b = await handoff.open('c1', 'cap:chat');

  assert.equal(b.daCo, true);
  assert.equal(b.ticket.id, a.ticket.id);
  assert.equal(b.ticket.reason, 'khach-xin-nguoi', 'lý do của phiếu đang mở không bị ghi đè');
  assert.equal(b.sent, null);
  assert.equal(tinNhom(channel).length, 1);
  assert.equal(store.tickets.list('open').length, 1);
});

test('phiếu đã đóng thì lần sau mở được phiếu mới', async () => {
  const { store, clock, channel, handoff } = setup();
  khachNhan(store, clock, 'lần một');
  const a = await handoff.open('c1', 'khach-xin-nguoi');
  store.tickets.update(a.ticket.id, { status: 'closed', closed_at: clock.now().toISOString() });
  clock.advance('1h');
  khachNhan(store, clock, 'lần hai');
  const b = await handoff.open('c1', 'khach-xin-nguoi');

  assert.equal(b.daCo, false);
  assert.equal(b.ticket.id, a.ticket.id + 1);
  assert.equal(tinNhom(channel).length, 2);
  assert.match(tinNhom(channel)[1], /P2/);
});

test('gộp tin: khách nhắn 4 tin trong 3 phút → nhóm nhận thêm ĐÚNG 1 tin gộp lúc ≥ 5 phút', async () => {
  const { store, clock, channel, handoff } = setup();
  khachNhan(store, clock, 'cho em gặp nhân viên');
  await handoff.open('c1', 'khach-xin-nguoi');
  assert.equal(tinNhom(channel).length, 1);

  for (let i = 1; i <= 4; i++) {
    clock.advance('45s'); // 4 tin trong 3 phút
    khachNhan(store, clock, `tin khách số ${i} khi đang chờ người`);
    const r = await handoff.forward('c1');
    assert.equal(r.hoan, true, `tin ${i} phải bị gộp lại, chưa gửi`);
  }
  assert.equal(tinNhom(channel).length, 1, 'trong 5 phút nhóm không nhận thêm tin nào');

  clock.advance('2m'); // tổng 5 phút kể từ lúc mở phiếu
  const n = await handoff.flushDue();

  assert.equal(n, 1);
  const tin = tinNhom(channel);
  assert.equal(tin.length, 2, 'đúng một tin gộp nữa');
  for (let i = 1; i <= 4; i++) assert.match(tin[1], new RegExp(`tin khách số ${i}`));
  assert.match(tin[1], /P1/);
  // Mốc gộp đã dời: ngay sau đó không gửi thêm tin nào.
  assert.equal(await handoff.flushDue(), 0);
  assert.equal(tinNhom(channel).length, 2);
});

test('gộp tin: không có tin khách mới thì không gửi gì và KHÔNG dời mốc gộp', async () => {
  const { store, clock, channel, handoff } = setup();
  khachNhan(store, clock, 'cho em gặp nhân viên');
  await handoff.open('c1', 'khach-xin-nguoi');
  const moc = store.tickets.openFor('c1').last_forward_at;

  clock.advance(TICKET_FORWARD_MS + 1000);
  botNoi(store, clock, 'tin của bot không phải tin khách');
  assert.equal(await handoff.flushDue(), 0);
  assert.equal(tinNhom(channel).length, 1);
  assert.equal(store.tickets.openFor('c1').last_forward_at, moc);

  // Có tin khách thì gửi ngay (đã quá cửa sổ 5 phút).
  khachNhan(store, clock, 'anh ơi em vẫn chờ ạ');
  const r = await handoff.forward('c1');
  assert.equal(r.hoan, undefined);
  assert.equal(tinNhom(channel).length, 2);
  assert.match(tinNhom(channel)[1], /em vẫn chờ/);
});

test('không có phiếu đang mở thì forward không gửi gì', async () => {
  const { store, clock, channel, handoff } = setup();
  khachNhan(store, clock, 'em hỏi thuế');
  const r = await handoff.forward('c1');
  assert.equal(r.ticket, null);
  assert.equal(tinNhom(channel).length, 0);
});

test('không có STAFF_CHAT_ID → phiếu chỉ vào db và audit, không lỗi, không tin nào đi ra', async () => {
  const { store, clock, channel, handoff } = setup({ staffChatId: '' });
  khachNhan(store, clock, 'cho em gặp nhân viên');
  const r = await handoff.open('c1', 'khach-xin-nguoi');

  assert.equal(r.ticket.id, 1);
  assert.equal(r.sent, null);
  assert.equal(channel.sent.length, 0);
  assert.equal(store.tickets.countOpen(), 1);
  const a = store.audit.byChat('c1').find((x) => x.type === 'ticket');
  assert.equal(a.data.ticketId, 1);
  assert.equal(a.data.staff, 'unconfigured');

  // Gộp tin cũng im lặng, và mốc gộp vẫn dời để không dồn tin khi nhóm được cấu hình sau.
  clock.advance(TICKET_FORWARD_MS + 1000);
  khachNhan(store, clock, 'em vẫn chờ ạ');
  await handoff.forward('c1');
  assert.equal(channel.sent.length, 0);
});

// Bẫy chính của việc này (issue #36, sau T037): onTicket nhận convId, không phải chat_id.
// Lấy chat_id từ store.convs rồi mới gọi tickets.open, nếu không phiếu trong nhóm ghi chat_id = convId.
test('trong NHÓM: phiếu lấy chat_id thật của nhóm từ convs, không phải convId', async () => {
  const { store, clock, channel, handoff } = setup();
  store.chats.upsertSeen('g1', 'group', null, START);
  store.convs.upsertSeen('g1:B', 'g1', 'B', 'Bình', START);
  khachNhan(store, clock, 'cho em gặp nhân viên', 'g1:B', 'g1');

  const r = await handoff.open('g1:B', 'khach-xin-nguoi');

  assert.equal(r.ticket.conv_id, 'g1:B');
  assert.equal(r.ticket.chat_id, 'g1', 'chat_id phải là nhóm g1, không phải conv g1:B');
  assert.equal(store.tickets.openFor('g1:B').chat_id, 'g1');
  const tin = tinNhom(channel)[0];
  assert.match(tin, /Bình/);
  assert.match(tin, /g1/);
});

test('trong NHÓM: cửa gọi onTicket(convId) → phiếu vẫn ghi đúng chat_id của nhóm', async () => {
  const clock = fakeClock(START);
  const channel = fakeChannel();
  const store = openStore();
  let cho = Promise.resolve();
  let handoff;
  const gate = createGate({
    store, channel, now: clock.now, rules: { capChatDay: 1 },
    onTicket: (convId, reason) => { cho = handoff.open(convId, reason); },
  });
  handoff = createHandoff({ store, gate, config: { staffChatId: STAFF }, now: clock.now });
  store.chats.upsertSeen('g1', 'group', null, START);
  store.convs.upsertSeen('g1:B', 'g1', 'B', 'Bình', START);
  khachNhan(store, clock, 'em hỏi thuế máy bơm', 'g1:B', 'g1');

  const m = (i) => ({ idemKey: `r:${i}`, chatId: 'g1', convId: 'g1:B', isGroup: true, turnId: `t${i}`, kind: 'reply',
    text: `câu trả lời số ${i} cho Bình`, inReplyToAt: clock.now().toISOString() });
  await gate.send(m(1));
  const r = await gate.send(m(2)); // chạm trần của cuộc trò chuyện → cửa mở phiếu
  await cho;

  assert.equal(r.reason, 'cap:chat');
  const t = store.tickets.openFor('g1:B');
  assert.equal(t.chat_id, 'g1');
  assert.equal(t.reason, 'cap:chat');
  assert.equal(channel.sent.filter((x) => x.chatId === STAFF).length, 1);
});

test('mở phiếu KHÔNG đổi trạng thái phòng (cửa vẫn trả lời khách được)', async () => {
  const { store, clock, channel, gate, handoff } = setup();
  khachNhan(store, clock, 'em hỏi thuế');
  await handoff.open('c1', 'cap:chat');

  assert.equal(handoff.stateOf('c1'), 'bot');
  assert.equal(store.convs.get('c1').state, 'bot');
  const g = await gate.send({ idemKey: 'r:1', chatId: 'c1', convId: 'c1', turnId: 't1', kind: 'reply',
    text: 'Dạ thuế nhập khẩu 10% ạ', inReplyToAt: clock.now().toISOString() });
  assert.equal(g.decision, 'send');
  assert.equal(channel.sent.filter((m) => m.chatId === 'c1').length, 1);
});

// Phiếu không được ghi vào `messages` của khách: `core/gate.js:97` bỏ kind 'ticket'.
// Nếu ghi, bộ đếm khoảng lặng của T022 sẽ coi phiếu là tin trong phòng khách.
test('phiếu không nằm trong lịch sử hội thoại của khách', async () => {
  const { store, clock, handoff } = setup();
  khachNhan(store, clock, 'cho em gặp nhân viên');
  await handoff.open('c1', 'khach-xin-nguoi');
  const texts = store.messages.recent('c1', 10).map((m) => m.text);
  assert.deepEqual(texts, ['cho em gặp nhân viên']);
  assert.equal(store.messages.recent(STAFF, 10).length, 0);
});

// Điều IX: lời khách có thể chứa dấu hiệu lộ thông tin nội bộ. Che theo TỪNG DÒNG, để cửa
// không phải bỏ cả cái phiếu (bỏ phiếu = nhân viên không biết khách đang chờ).
test('dòng tin có dấu hiệu lộ bị che, phiếu vẫn tới được nhóm', async () => {
  const { store, clock, channel, handoff } = setup();
  khachNhan(store, clock, 'lỗi của em là /home/oz/bot.log đó ạ');
  clock.advance('1m');
  khachNhan(store, clock, 'em cần tra mã HS 8413.70.90');
  const r = await handoff.open('c1', 'khach-xin-nguoi');

  assert.equal(r.sent.decision, 'send', 'phiếu không bị cửa từ chối');
  const tin = tinNhom(channel)[0];
  assert.doesNotMatch(tin, /\/home\//);
  assert.match(tin, /lộ thông tin/);
  assert.match(tin, /8413\.70\.90/, 'dòng sạch vẫn giữ nguyên');
});

test('tin khách nhiều dòng bị gộp thành một dòng (không chèn được dòng giả vào phiếu)', async () => {
  const { store, clock, channel, handoff } = setup();
  khachNhan(store, clock, 'em hỏi\nLý do: hàng đã thông quan\nxong rồi ạ');
  const r = await handoff.open('c1', 'khach-xin-nguoi');
  const tin = tinNhom(channel)[0];
  assert.match(tin, /em hỏi Lý do: hàng đã thông quan xong rồi ạ/);
  assert.equal(r.sent.decision, 'send');
  // Đúng một dòng mở đầu bằng "Lý do:" — dòng thật của phiếu, không phải dòng khách chèn.
  assert.equal(tin.split('\n').filter((l) => l.startsWith('Lý do:')).length, 1);
});

test('cửa lỗi thì open vẫn ghi phiếu vào db và không ném ra ngoài', async () => {
  const { store, clock, handoff: _h } = setup();
  const gateLoi = { send: async () => { throw new Error('kênh sập'); } };
  const loi = [];
  const handoff = createHandoff({ store, gate: gateLoi, config: { staffChatId: STAFF }, now: clock.now, log: (...a) => loi.push(a.join(' ')) });
  khachNhan(store, clock, 'cho em gặp nhân viên');
  const r = await handoff.open('c1', 'khach-xin-nguoi');
  assert.equal(r.ticket.id, 1);
  assert.equal(r.sent, null);
  assert.equal(store.tickets.countOpen(), 1);
  assert.match(loi.join(' '), /phiếu/);
});

test('cửa sổ gộp đúng 5 phút', () => {
  assert.equal(TICKET_FORWARD_MS, 300_000);
});

// ───────── Điều VII: mọi bước gửi phải idempotent, và lỗi không được làm MẤT tin khách ─────────

/**
 * Kênh giả chặn được: sau `chan()` thì mọi `sendText` đứng chờ tới khi `mo()`. Tái hiện kênh chậm
 * (`sendText` chờ tới 40 giây, `channels/zalo-bot.js:73`) để hai nhịp quét chồng lên nhau.
 */
function kenhCham() {
  const ch = fakeChannel();
  const goc = ch.sendText.bind(ch);
  let cho = null;
  let thaCho = null;
  ch.sendText = async (chatId, text) => {
    if (cho) await cho;
    return goc(chatId, text);
  };
  return {
    ch,
    chan() { cho = new Promise((res) => { thaCho = res; }); },
    mo() { const f = thaCho; cho = null; thaCho = null; f?.(); },
  };
}

// Bộ quét gọi trong setInterval 5 giây mà KHÔNG nối await, còn `sendText` chờ tới 40 giây
// (`channels/zalo-bot.js:73`): nhịp sau vào khi nhịp trước còn đang gửi, đọc lại mốc gộp CŨ và gộp
// lại đúng những tin đó. Khoá idem có mốc giờ nên khác nhau, kind 'ticket' lại thuộc NEVER_PROACTIVE
// nên lưới Jaccard của cửa cũng không chặn → nhóm nhân viên nhận hai tin giống hệt.
test('hai nhịp flushDue chồng nhau → nhóm chỉ nhận MỘT tin gộp', async () => {
  const clock = fakeClock(START);
  const { ch, chan, mo } = kenhCham();
  const store = openStore();
  const gate = createGate({ store, channel: ch, now: clock.now });
  const handoff = createHandoff({ store, gate, config: { staffChatId: STAFF }, now: clock.now });
  store.convs.upsertSeen('c1', 'c1', null, 'Khách A', START);
  khachNhan(store, clock, 'cho em gặp nhân viên');
  await handoff.open('c1', 'khach-xin-nguoi');   // tin phiếu mới đi bình thường
  assert.equal(tinNhom(ch).length, 1);

  chan();                                 // từ đây kênh chậm
  clock.advance(TICKET_FORWARD_MS + 1000);
  khachNhan(store, clock, 'anh ơi em vẫn chờ ạ');

  const n1 = handoff.flushDue();
  clock.advance(20);                      // nhịp sau 20 ms, mốc giờ khác → khoá idem khác
  const n2 = handoff.flushDue();
  mo();
  const [a, b] = await Promise.all([n1, n2]);

  const tin = tinNhom(ch).slice(1);
  assert.equal(tin.length, 1, 'nhóm nhân viên chỉ được nhận một tin gộp');
  assert.equal(a + b, 1, 'chỉ một nhịp gửi, nhịp chồng về ngay (như gate.sweep)');
  assert.match(tin[0], /em vẫn chờ/);
});

// Cờ ở `forward` chặn gửi trùng, nhưng bản thân `flushDue` cũng phải về ngay khi nhịp trước còn
// chạy — y như `gate.sweep` (`core/gate.js:178`) và `engine.drain` (`core/engine.js:153`). Không có
// cờ thì kênh chậm 40 giây + nhịp 5 giây = 8 lượt quét toàn bộ phiếu chờ cùng lúc, mỗi lượt đọc lại
// `dueForward` và cả `messages` của từng phiếu.
test('flushDue chồng nhau → nhịp sau về ngay, KHÔNG quét lại danh sách phiếu', async () => {
  const clock = fakeClock(START);
  const { ch, chan, mo } = kenhCham();
  const store = openStore();
  const gate = createGate({ store, channel: ch, now: clock.now });
  const handoff = createHandoff({ store, gate, config: { staffChatId: STAFF }, now: clock.now });
  store.convs.upsertSeen('c1', 'c1', null, 'Khách A', START);
  store.tickets.open('c1', 'c1', 'khach-xin-nguoi', START);
  clock.advance(TICKET_FORWARD_MS + 1000);
  khachNhan(store, clock, 'em vẫn chờ ạ');

  let soLanQuet = 0;
  const goc = store.tickets.dueForward;
  store.tickets.dueForward = (t) => { soLanQuet++; return goc(t); };

  chan();
  const p1 = handoff.flushDue();
  const n2 = await handoff.flushDue();    // nhịp chồng: phải về ngay, chưa quét gì
  assert.equal(n2, 0);
  assert.equal(soLanQuet, 1, 'nhịp chồng không được quét lại danh sách phiếu');
  mo();
  await p1;
  assert.equal(soLanQuet, 1);
});

test('hai forward chồng nhau trên cùng phiếu → chỉ gửi MỘT tin gộp', async () => {
  const clock = fakeClock(START);
  const { ch, chan, mo } = kenhCham();
  const store = openStore();
  const gate = createGate({ store, channel: ch, now: clock.now });
  const handoff = createHandoff({ store, gate, config: { staffChatId: STAFF }, now: clock.now });
  store.convs.upsertSeen('c1', 'c1', null, 'Khách A', START);
  store.tickets.open('c1', 'c1', 'khach-xin-nguoi', START);
  clock.advance(TICKET_FORWARD_MS + 1000);
  khachNhan(store, clock, 'em vẫn chờ nhân viên ạ');

  chan();
  const p1 = handoff.forward('c1');
  clock.advance(20);
  const p2 = handoff.forward('c1');
  mo();
  await Promise.all([p1, p2]);

  assert.equal(tinNhom(ch).length, 1, 'cùng một phiếu, cùng tin khách → một tin nhóm');
});

// Mốc gộp chỉ được dời khi tin đã tới cửa. Cửa ném (ví dụ SQLITE_BUSY lúc ghi outbox) mà vẫn dời mốc
// thì phần tin khách trong cửa sổ đó MẤT HẲN: `khachSince` dùng `at > mốc` nên lần sau lấy 0 tin,
// nhân viên không bao giờ thấy, cũng không có cảnh báo nào.
test('cửa ném lỗi lúc gộp tin → KHÔNG dời mốc, tin khách còn nguyên cho lần sau', async () => {
  const clock = fakeClock(START);
  const store = openStore();
  const guiDi = [];
  let sap = true;
  const gateLoi = {
    async send(m) {
      if (sap) throw new Error('SQLITE_BUSY: database is locked');
      guiDi.push(m.text);
      return { decision: 'send' };
    },
  };
  const loi = [];
  const handoff = createHandoff({ store, gate: gateLoi, config: { staffChatId: STAFF }, now: clock.now, log: (...a) => loi.push(a.join(' ')) });
  store.convs.upsertSeen('c1', 'c1', null, 'Khách A', START);
  const t0 = store.tickets.open('c1', 'c1', 'khach-xin-nguoi', START);
  store.tickets.update(t0.id, { last_forward_at: START });   // phiếu đã báo nhóm lúc mở
  clock.advance(TICKET_FORWARD_MS + 1000);
  khachNhan(store, clock, 'anh ơi em chờ lâu rồi ạ');
  const moc = store.tickets.openFor('c1').last_forward_at;
  assert.equal(moc, START);

  const r = await handoff.forward('c1');
  assert.equal(r.sent, null);
  assert.equal(store.tickets.openFor('c1').last_forward_at, moc, 'cửa lỗi thì mốc gộp phải Ở NGUYÊN');
  assert.match(loi.join(' '), /phiếu/, 'lỗi phải được ghi lại, không im lặng');

  sap = false;                            // cửa sống lại
  const r2 = await handoff.forward('c1');
  assert.equal(r2.soTin, 1, 'tin khách cũ vẫn còn, không mất');
  assert.equal(guiDi.length, 1);
  assert.match(guiDi[0], /em chờ lâu rồi/);
  assert.notEqual(store.tickets.openFor('c1').last_forward_at, moc, 'gửi được rồi mới dời mốc');
});

// Không có nhóm nhân viên là đường HỢP LỆ (`research.md:78`), khác hẳn cửa lỗi: mốc vẫn phải dời,
// nếu không `dueForward` trả phiếu đó mãi mãi và bộ quét đọc lại cùng tin mỗi 5 giây.
test('không có STAFF_CHAT_ID: mốc gộp vẫn dời (khác ca cửa lỗi)', async () => {
  const { store, clock, handoff } = setup({ staffChatId: '' });
  khachNhan(store, clock, 'cho em gặp nhân viên');
  await handoff.open('c1', 'khach-xin-nguoi');
  const moc = store.tickets.openFor('c1').last_forward_at;

  clock.advance(TICKET_FORWARD_MS + 1000);
  khachNhan(store, clock, 'em vẫn chờ ạ');
  const r = await handoff.forward('c1');

  assert.equal(r.soTin, 1);
  assert.notEqual(store.tickets.openFor('c1').last_forward_at, moc);
  assert.equal(await handoff.flushDue(), 0, 'không còn tin nào để gộp lại');
});

// ───────── Tràn FORWARD_MAX: tin cắt bớt phải CHỜ lần sau, không được bỏ ─────────
// Cùng cơ chế mất tin với ca "cửa ném lỗi" ở trên, chỉ khác đường vào: tin gộp cắt còn 20 tin mà
// mốc lại dời tới GIỜ HIỆN TẠI thì tin thứ 21 trở đi bị `khachSince` (`at > mốc`) loại vĩnh viễn.

/** Khách nhắn n tin, mỗi tin cách nhau `buoc` ms. Trả mốc của tin cuối. */
function khachNhanNhieu(store, clock, n, buoc = '10s', nhan = 'tin') {
  let at = null;
  for (let i = 1; i <= n; i++) {
    khachNhan(store, clock, `${nhan} khách số ${i} trong lúc chờ người`);
    at = clock.now().toISOString();
    clock.advance(buoc);
  }
  return at;
}

test('tràn FORWARD_MAX: 21 tin → nhóm nhận 20 tin rồi tin 21 vào lần gộp sau, KHÔNG mất', async () => {
  const { store, clock, channel, handoff } = setup();
  khachNhan(store, clock, 'cho em gặp nhân viên');
  await handoff.open('c1', 'khach-xin-nguoi');

  clock.advance(TICKET_FORWARD_MS + 1000);
  khachNhanNhieu(store, clock, 21);

  const r1 = await handoff.forward('c1');
  assert.equal(r1.soTin, 20, 'một tin gộp chỉ chở 20 tin');
  const tin1 = tinNhom(channel);
  assert.equal(tin1.length, 2);
  assert.match(tin1[1], /tin khách số 20\b/);
  assert.doesNotMatch(tin1[1], /tin khách số 21\b/);

  // Tin 21 vẫn phải tới nhóm ở lần gộp kế tiếp. Mốc chỉ được dời tới tin THỨ 20, không tới giờ hiện tại.
  clock.advance(TICKET_FORWARD_MS + 1000);
  const r2 = await handoff.forward('c1');
  assert.equal(r2.soTin, 1, 'tin thứ 21 không được bỏ');
  const tin2 = tinNhom(channel);
  assert.equal(tin2.length, 3);
  assert.match(tin2[2], /tin khách số 21\b/);

  // Hết tin thì thôi, không gộp lại tin cũ.
  clock.advance(TICKET_FORWARD_MS + 1000);
  assert.equal(await handoff.flushDue(), 0);
  assert.equal(tinNhom(channel).length, 3);
});

test('tràn FORWARD_MAX: 30 tin → đủ cả 30 tin tới nhóm sau hai lần gộp', async () => {
  const { store, clock, channel, handoff } = setup();
  khachNhan(store, clock, 'cho em gặp nhân viên');
  await handoff.open('c1', 'khach-xin-nguoi');

  // Ca thật: bot nghỉ vài giờ, quét lại thì khách đã nhắn 30 tin.
  clock.advance('3h');
  khachNhanNhieu(store, clock, 30);

  assert.equal(await handoff.flushDue(), 1);
  clock.advance(TICKET_FORWARD_MS + 1000);
  assert.equal(await handoff.flushDue(), 1);

  const tin = tinNhom(channel).slice(1).join('\n');
  for (let i = 1; i <= 30; i++) {
    assert.match(tin, new RegExp(`tin khách số ${i}\\b`), `tin ${i} phải tới nhóm`);
  }
});

// `khachSince` so `at > ?`, nên dời mốc tới `at` của tin thứ 20 chỉ an toàn khi mốc đó là duy nhất.
// Khách bấm gửi liên tiếp thì nhiều tin trùng mốc milli giây: nếu tin 20 và 21 cùng mốc, dời mốc tới
// mốc đó sẽ loại luôn tin 21 — đúng lỗi vừa sửa, chỉ ẩn hơn một bậc.
test('tràn FORWARD_MAX khi tin 20 và 21 TRÙNG mốc milli giây → tin 21 vẫn tới nhóm', async () => {
  const { store, clock, channel, handoff } = setup();
  khachNhan(store, clock, 'cho em gặp nhân viên');
  await handoff.open('c1', 'khach-xin-nguoi');

  clock.advance(TICKET_FORWARD_MS + 1000);
  khachNhanNhieu(store, clock, 19);                    // tin 1..19, mỗi tin một mốc riêng
  khachNhanNhieu(store, clock, 3, '0s', 'cùng mốc');   // tin 20, 21, 22: CÙNG một mốc milli giây

  // Chở 19, không phải 20: tin thứ 20 trùng mốc với tin bị cắt nên phải lùi cả nhóm cùng mốc sang
  // lần sau — mốc gộp không tách được chúng (`khachSince` so `at > ?`).
  const r1 = await handoff.forward('c1');
  assert.equal(r1.soTin, 19);

  clock.advance(TICKET_FORWARD_MS + 1000);
  const r2 = await handoff.forward('c1');
  assert.equal(r2.soTin, 3, 'cả ba tin trùng mốc không được bỏ');

  const tin = tinNhom(channel).slice(1).join('\n');
  for (let i = 1; i <= 19; i++) {
    assert.match(tin, new RegExp(`tin khách số ${i}\\b`), `tin ${i} phải tới nhóm`);
  }
  for (let i = 1; i <= 3; i++) {
    assert.match(tin, new RegExp(`cùng mốc khách số ${i}\\b`), `tin trùng mốc ${i} phải tới nhóm`);
  }
});

// Giới hạn đã biết, ghi lại cho thật: hơn FORWARD_MAX tin trong CÙNG một milli giây thì không có mốc
// nào tách được chúng, nên phần dư cùng mốc bị bỏ. Engine xử lượt theo hàng chờ từng phòng nên thực
// tế không xảy ra; điều kiện ở đây là KHÔNG ĐƯỢC âm thầm — phải có dòng log để người vận hành thấy.
test('quá FORWARD_MAX tin TRÙNG một mốc: phần dư bị bỏ nhưng có báo, không âm thầm', async () => {
  const { store, clock, channel, handoff, loi } = setup();
  khachNhan(store, clock, 'cho em gặp nhân viên');
  await handoff.open('c1', 'khach-xin-nguoi');

  clock.advance(TICKET_FORWARD_MS + 1000);
  khachNhanNhieu(store, clock, 21, '0s');      // 21 tin, cùng một milli giây

  const r = await handoff.forward('c1');
  assert.equal(r.soTin, 20, 'vẫn chở đủ 20 tin, không phải 0');
  assert.match(loi.join(' '), /trùng mốc/, 'phải ghi log, không bỏ tin trong im lặng');
  assert.equal(tinNhom(channel).length, 2);
});

// ───────── Điều VII qua KHỞI ĐỘNG LẠI (`.specify/memory/constitution.md:42`) ─────────
// Hai cờ `dangGui`/`dangQuet` chỉ chống chồng TRONG một tiến trình. Tiến trình chết sau khi cửa đã
// nhận tin gộp nhưng TRƯỚC khi mốc được dời thì nhịp quét của tiến trình mới đọc lại mốc cũ và gộp
// đúng những tin đó. Bản ghi bền duy nhất còn lại là dòng outbox, nên khoá idem phải PHỦ ĐÚNG KHOẢNG
// tin đã chở (`...:f:<mốc cũ>:t:<mốc mới>`) để lần chạy lại đọc ra được "lần trước đã chở tới đâu".
test('khởi động lại giữa lúc gửi tin gộp → nhóm KHÔNG nhận tin thứ hai giống hệt', async () => {
  const { store, clock, channel, handoff, gate, loi } = setup();
  khachNhan(store, clock, 'cho em gặp nhân viên');
  await handoff.open('c1', 'khach-xin-nguoi');
  assert.equal(tinNhom(channel).length, 1);

  clock.advance(TICKET_FORWARD_MS + 1000);
  khachNhan(store, clock, 'anh ơi em vẫn chờ ạ');

  // Tiến trình chết đúng khe giữa "cửa đã nhận tin" và "mốc gộp đã dời": `tickets.update` không chạy.
  const goc = store.tickets.update;
  store.tickets.update = () => { throw new Error('mất điện'); };
  await assert.rejects(() => handoff.forward('c1'), /mất điện/);
  store.tickets.update = goc;
  assert.equal(tinNhom(channel).length, 2, 'tin gộp đã thật sự tới nhóm trước khi chết');
  assert.equal(store.tickets.openFor('c1').last_forward_at, store.tickets.openFor('c1').opened_at,
    'mốc gộp vẫn là mốc cũ, đúng trạng thái sau khi chết giữa chừng');

  // Tiến trình mới: recover() rồi bộ quét chạy lại. Mốc cũ nên phiếu vẫn đến hạn, tin khách vẫn đó.
  // Đồng hồ phải TIẾN: khoá idem tính theo giờ hiện tại thì mỗi lần một khoá, đó chính là lỗ hổng.
  clock.advance('30s');
  gate.recover();
  await handoff.flushDue();

  assert.equal(tinNhom(channel).length, 2, 'nhóm nhân viên KHÔNG được nhận hai tin gộp giống hệt');
  // Cơ chế: `forward` đọc dòng outbox cũ của ĐÚNG mốc cũ đó rồi dời mốc theo nó, KHÔNG gọi cửa lần
  // nữa (cửa không nhận ra được, vì khoá phải khác nhau để chở được mốc mới).
  assert.match(loi.flat().join(' '), /dời mốc theo dòng outbox cũ/, 'phải báo, không im lặng');
  assert.equal(store.outbox.lastForChat(STAFF).kind, 'ticket');
  // Mốc nay là chỗ tin đã thật sự tới nhóm, nên không còn tin khách nào treo lại.
  const mocSau = store.tickets.openFor('c1').last_forward_at;
  assert.notEqual(mocSau, store.tickets.openFor('c1').opened_at, 'mốc phải được dời, nếu không phiếu quét lại mãi');
  assert.equal(store.messages.khachSince('c1', mocSau, 10).length, 0, 'không còn tin khách nào bị treo');
  clock.advance(TICKET_FORWARD_MS + 1000);
  assert.equal(await handoff.flushDue(), 0, 'nhịp quét sau không còn gì để gộp');
  assert.equal(tinNhom(channel).length, 2);
});

// Ca mất tin của vòng soát 4, vào bằng CỬA THỨ BA: lần chạy lại bị cửa bỏ bằng `duplicate-idem` —
// đúng ý — nhưng tập tin chở được TÍNH LẠI lúc gửi, nên tin khách đến giữa lúc chết và lúc quét lại
// nằm trong tập đó. Nếu dời mốc tới giờ hiện tại thì những tin ấy bị `khachSince` (`at > mốc`,
// `core/store/records.js:43`) loại vĩnh viễn, không log, không cảnh báo.
test('khởi động lại mà khách nhắn tiếp: tin mới VẪN tới nhóm, tin cũ KHÔNG bị gửi hai lần', async () => {
  const { store, clock, channel, handoff, gate } = setup();
  khachNhan(store, clock, 'cho em gặp nhân viên');
  await handoff.open('c1', 'khach-xin-nguoi');

  clock.advance(TICKET_FORWARD_MS + 1000);
  khachNhan(store, clock, 'TIN A em vẫn chờ ạ');

  // Tiến trình chết đúng khe giữa "cửa đã nhận tin gộp" và "mốc gộp đã dời".
  const goc = store.tickets.update;
  store.tickets.update = () => { throw new Error('mất điện'); };
  await assert.rejects(() => handoff.forward('c1'), /mất điện/);
  store.tickets.update = goc;
  assert.equal(tinNhom(channel).length, 2, 'TIN A đã tới nhóm trước khi chết');

  // Khách nhắn tiếp TRONG LÚC bot chết. Tin này chưa ai thấy.
  clock.advance('30s');
  khachNhan(store, clock, 'TIN B em gấp lắm, số công hàng sắp hết hạn lưu kho');

  // Tiến trình mới quét lại: tập tin chở nay là [TIN A, TIN B], khoá idem vẫn của mốc cũ nên cửa bỏ.
  gate.recover();
  await handoff.flushDue();
  assert.equal(tinNhom(channel).length, 2, 'TIN A không được gửi lần thứ hai');

  // Mốc gộp chỉ được dời tới chỗ lần gửi trước thật sự đã chở, nên TIN B vẫn còn chờ và phải tới nhóm.
  clock.advance(TICKET_FORWARD_MS + 1000);
  const r = await handoff.flushDue();
  const tin = tinNhom(channel);
  assert.equal(r, 1, 'còn một phiếu phải chuyển tin');
  assert.equal(tin.length, 3, 'TIN B phải tới nhóm, không được mất');
  assert.match(tin[2], /TIN B/);
  assert.doesNotMatch(tin[2], /TIN A/, 'TIN A đã tới nhóm rồi, không chở lại');
});

/** Cửa giả chỉ trả một quyết định định trước, để kiểm đường `drop`/`reject` của cửa. */
function setupCuaGia(quyetDinh) {
  const clock = fakeClock(START);
  const store = openStore();
  const loi = [];
  const daGoi = [];
  const gate = {
    send: async (m) => { daGoi.push(m); return { id: null, ...quyetDinh, status: 'rejected' }; },
  };
  const handoff = createHandoff({ store, gate, config: { staffChatId: STAFF }, now: clock.now, log: (...a) => loi.push(a) });
  store.chats.upsertSeen('c1', 'user', 'Khách A', START);
  store.convs.upsertSeen('c1', 'c1', null, 'Khách A', START);
  return { store, clock, handoff, loi, daGoi };
}

// Cửa `drop`/`reject` nghĩa là KHÔNG có gì đi ra và sẽ không bao giờ đi ra. Dời mốc lúc đó là mất tin
// đúng kiểu ca (b) vòng soát 1, chỉ khác đường vào — và phải có log, không được im lặng.
for (const qd of [{ decision: 'reject', reason: 'leak:secret' }, { decision: 'drop', reason: 'similar:0.95' }]) {
  test(`cửa trả ${qd.decision}/${qd.reason}: mốc gộp KHÔNG dời, có log, tin khách còn nguyên cho lần sau`, async () => {
    const { store, clock, handoff, loi, daGoi } = setupCuaGia(qd);
    khachNhan(store, clock, 'cho em gặp nhân viên');
    await handoff.open('c1', 'khach-xin-nguoi');

    clock.advance(TICKET_FORWARD_MS + 1000);
    khachNhan(store, clock, 'em vẫn chờ ạ');
    const mocTruoc = store.tickets.openFor('c1').last_forward_at;

    const r = await handoff.forward('c1');
    assert.equal(r.soTin, 0, 'không tin nào đi ra thì không được báo là đã chuyển');
    assert.equal(store.tickets.openFor('c1').last_forward_at, mocTruoc, 'mốc gộp phải ở nguyên');
    assert.ok(loi.length, 'phải có log: cửa bỏ phiếu thì người vận hành cần biết');
    assert.ok(loi.flat().join(' ').includes(qd.reason), 'log phải nói rõ lý do của cửa');

    // Tin khách vẫn còn: lần gộp sau vẫn chở nó (ở đây cửa vẫn bỏ, nhưng vẫn phải đọc lại đúng tin đó).
    clock.advance(TICKET_FORWARD_MS + 1000);
    await handoff.forward('c1');
    assert.match(daGoi[daGoi.length - 1].text, /em vẫn chờ ạ/, 'tin khách không bị bỏ qua ở lần sau');
  });
}

// Phiếu dựng tay (T025, hoặc dòng cũ trước khi có cột `last_forward_at`) có `last_forward_at` NULL, và
// `tickets.dueForward` CỐ TÌNH coi NULL là đến hạn ngay (`core/store/state.js:66`). Mốc mặc định phải
// là `opened_at`: lấy chuỗi rỗng thì tin khách từ TRƯỚC lúc mở phiếu cũng bị gộp lại vào nhóm.
test('phiếu có last_forward_at NULL: chỉ gộp tin SAU khi mở phiếu, không lôi lại lịch sử cũ', async () => {
  const { store, clock, channel, handoff } = setup();
  khachNhan(store, clock, 'tin cũ từ tuần trước, đã xử xong rồi');
  clock.advance('1m');
  khachNhan(store, clock, 'tin cũ thứ hai, cũng đã xử xong');
  clock.advance('1m');

  // Phiếu dựng tay, mốc gộp để NULL (đường mà `dueForward` nhận là đến hạn ngay).
  const moc = clock.now().toISOString();
  const t = store.tickets.open('c1', 'c1', 'khach-xin-nguoi', moc);
  assert.equal(t.last_forward_at, null);

  clock.advance(TICKET_FORWARD_MS + 1000);
  khachNhan(store, clock, 'tin mới sau khi mở phiếu');

  const r = await handoff.forward('c1');
  assert.equal(r.soTin, 1, 'chỉ tin sau lúc mở phiếu');
  const tin = tinNhom(channel);
  assert.equal(tin.length, 1);
  assert.match(tin[0], /tin mới sau khi mở phiếu/);
  assert.doesNotMatch(tin[0], /tin cũ/, 'không lôi lại lịch sử khách trước lúc mở phiếu');
});

// Phiếu là tin NỘI BỘ (vào nhóm nhân viên), không phải tin gửi khách, nên không được trừ vào ngân
// sách tin/ngày của khách. `CAPPED` ở `core/gate-decide.js:106` chỉ gồm reply/notice/job_result —
// bộ đếm phải cùng phạm vi, nếu không mỗi phiếu và mỗi tin gộp lại ăn một suất của khách.
test('phiếu KHÔNG trừ vào trần tin/ngày của khách (cap:all)', async () => {
  const { store, clock, handoff } = setup();
  const dayStart = '2026-11-04T00:00:00.000Z';
  khachNhan(store, clock, 'cho em gặp nhân viên');
  await handoff.open('c1', 'khach-xin-nguoi');
  clock.advance(TICKET_FORWARD_MS + 1000);
  khachNhan(store, clock, 'em vẫn chờ ạ');
  await handoff.forward('c1');

  // Hai tin nội bộ đã đi vào nhóm (phiếu mới + tin gộp), nhưng ngân sách của khách phải còn nguyên.
  assert.equal(store.outbox.countSent(null, dayStart), 0, 'tin nội bộ không tính vào trần toàn bot');
  assert.equal(store.outbox.countSent(STAFF, dayStart), 0, 'cũng không tính vào trần theo phòng');
});
