// T025: Lệnh nhân viên trong nhóm STAFF_CHAT_ID (/tl, /nhan, /tra-bot, /chan, /chan-nhom, /cho).
// Thi hành Điều I (một cửa gửi), Điều II (người trước máy), Điều IV (audit), Điều VII (idempotent),
// Điều IX (không lộ bí mật) và FR-013, FR-014, FR-032 (`specs/001-nen-tang-chung/spec.md:232`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createHandoff, HUMAN_IDLE_MS } from '../../core/handoff.js';
import { fakeChannel, fakeClock } from '../helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z'; // 10:00 giờ VN, ngoài giờ yên
const STAFF_CHAT = 'S1';
const STAFF_USERS = new Set(['nv1', 'nv2']);

function setup({ start = START, staffChatId = STAFF_CHAT, staffUsers = STAFF_USERS, botNames = ['Bot OZ'] } = {}) {
  const clock = fakeClock(start);
  const channel = fakeChannel();
  const store = openStore();
  const loi = [];
  const gate = createGate({ store, channel, now: clock.now });
  const handoff = createHandoff({
    store,
    gate,
    config: { staffChatId, staffUsers, botNames },
    now: clock.now,
    log: (...a) => loi.push(a.join(' ')),
  });
  for (const [id, ten] of [['c1', 'Khách A'], ['c2', 'Khách B'], ['c3', 'Khách C']]) {
    store.chats.upsertSeen(id, 'user', ten, start);
    store.convs.upsertSeen(id, id, null, ten, start);
  }
  return { store, clock, channel, gate, handoff, loi };
}

/** Mở 3 phiếu để có sẵn P1, P2, P3 (xóa tin thông báo mở phiếu trên kênh giả để test tập trung vào lệnh). */
async function moBaPhieu(handoff, channel) {
  await handoff.open('c1', 'khach-xin-nguoi');
  await handoff.open('c2', 'khach-xin-nguoi');
  await handoff.open('c3', 'khach-xin-nguoi');
  channel.sent.length = 0;
}

const tinKhach = (channel, chatId = 'c3') => channel.sent.filter((m) => m.chatId === chatId).map((m) => m.text);
const tinNhom = (channel) => channel.sent.filter((m) => m.chatId === STAFF_CHAT).map((m) => m.text);

test('/tl P3 Dạ em đây ạ → khách nhận đúng "Dạ em đây ạ" (kind staff_relay), phòng sang human, speaker nhan-vien, gọi touch', async () => {
  const { store, clock, channel, handoff } = setup();
  await moBaPhieu(handoff, channel);
  assert.equal(handoff.stateOf('c3'), 'bot');

  clock.advance('5m');
  const r = await handoff.command({
    turnId: 'u-tl-1',
    chatId: STAFF_CHAT,
    userId: 'nv1',
    userName: 'Hà',
    text: '/tl P3 Dạ em đây ạ',
  });

  assert.equal(r.ok, true);
  assert.deepEqual(tinKhach(channel, 'c3'), ['Dạ em đây ạ']);
  assert.equal(handoff.stateOf('c3'), 'human');
  assert.equal(store.convs.get('c3').state, 'human');

  // Outbox ghi kind 'staff_relay' và khoá idempotency có tiền tố s:<ticketId>:<turnId>.
  const out = store.outbox.lastForChat('c3');
  assert.equal(out.kind, 'staff_relay');
  assert.equal(out.idem_key, 's:3:u-tl-1');

  // Bảng messages ghi nhận speaker='nhan-vien' và speaker_id='nv1'.
  const msgs = store.messages.recent('c3', 10);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].speaker, 'nhan-vien');
  assert.equal(msgs[0].speaker_id, 'nv1');
  assert.equal(msgs[0].text, 'Dạ em đây ạ');

  // Bộ đếm khoảng lặng 2 giờ được đặt lại qua touch(convId, staffId).
  const audits = store.audit.byChat('c3', 20);
  assert.ok(audits.some((a) => a.type === 'handoff-touch' && a.data.by === 'nv1'), 'phải gọi touch(convId, staffId)');
  assert.ok(audits.some((a) => a.type === 'staff-cmd' && a.data.cmd === 'tl' && a.data.by === 'nv1'));
});

test('/tl hỗ trợ mã phiếu p3 (chữ thường) và 3 (số nguyên trực tiếp), đồng thời đặt lại bộ đếm khoảng lặng 2 giờ', async () => {
  const { store, clock, channel, handoff } = setup();
  await moBaPhieu(handoff, channel);

  handoff.toHuman('c3', 'nv1', 'nhan');
  clock.advance('90m'); // đã lặng 1 giờ 30 phút

  const r1 = await handoff.command({
    turnId: 'u-tl-p3',
    chatId: STAFF_CHAT,
    userId: 'nv1',
    text: '/tl p3 Em gửi anh tờ khai nháp ạ',
  });
  assert.equal(r1.ok, true);

  // Nếu không đặt lại bộ đếm thì sau 30 phút nữa (tổng 2 giờ từ lúc toHuman) phòng sẽ tự về bot.
  clock.advance('90m');
  assert.equal(handoff.stateOf('c3'), 'human', 'touch trong /tl phải đặt lại bộ đếm khoảng lặng 2 giờ');

  const r2 = await handoff.command({
    turnId: 'u-tl-3',
    chatId: STAFF_CHAT,
    userId: 'nv2',
    text: '/tl 3 Em bổ sung thêm thuế suất nhé',
  });
  assert.equal(r2.ok, true);
  assert.deepEqual(tinKhach(channel, 'c3'), ['Em gửi anh tờ khai nháp ạ', 'Em bổ sung thêm thuế suất nhé']);

  clock.advance(HUMAN_IDLE_MS);
  assert.equal(handoff.stateOf('c3'), 'bot', 'đủ 2 giờ lặng kể từ lần /tl cuối mới tự về bot');
});

test('/tl idempotent theo turnId: phát lại cùng lệnh nhân viên không gửi trùng tới khách', async () => {
  const { channel, handoff } = setup();
  await moBaPhieu(handoff, channel);

  const turn = { turnId: 'u-dup', chatId: STAFF_CHAT, userId: 'nv1', text: '/tl P3 Dạ em nghe ạ' };
  await handoff.command(turn);
  await handoff.command(turn);

  assert.equal(tinKhach(channel, 'c3').length, 1);
});

test('/tl vào cuộc trò chuyện trong nhóm khách (g1:B) → gửi vào nhóm g1 có @tên và chỉ g1:B sang human', async () => {
  const { store, channel, handoff } = setup();
  store.chats.upsertSeen('g1', 'group', 'Nhóm XNK', START);
  store.convs.upsertSeen('g1:A', 'g1', 'A', 'An', START);
  store.convs.upsertSeen('g1:B', 'g1', 'B', 'Bình', START);
  const { ticket } = await handoff.open('g1:B', 'khach-xin-nguoi');
  channel.sent.length = 0;

  const r = await handoff.command({
    turnId: 'u-grp-1',
    chatId: STAFF_CHAT,
    userId: 'nv1',
    text: `/tl P${ticket.id} Dạ anh Bình gửi giúp em hình tem phụ nhé`,
  });

  assert.equal(r.ok, true);
  assert.deepEqual(tinKhach(channel, 'g1'), ['@Bình\nDạ anh Bình gửi giúp em hình tem phụ nhé']);
  assert.equal(handoff.stateOf('g1:B'), 'human');
  assert.equal(handoff.stateOf('g1:A'), 'bot');
});

test('/nhan P3 hai người → người đầu được (status=claimed, claimed_by), người sau nhận "P3 đã có <tên> nhận"', async () => {
  const { store, clock, channel, handoff } = setup();
  await moBaPhieu(handoff, channel);

  // Người đầu tiên nhận P3
  const r1 = await handoff.command({
    turnId: 'u-nhan-1',
    chatId: STAFF_CHAT,
    userId: 'nv1',
    userName: 'Hà',
    text: '/nhan P3',
  });
  assert.equal(r1.ok, true);
  const p3 = store.tickets.openFor('c3');
  assert.equal(p3.id, 3);
  assert.equal(p3.status, 'claimed');
  assert.equal(p3.claimed_by, 'nv1');
  assert.ok(p3.claimed_at);
  assert.equal(handoff.stateOf('c3'), 'human');

  // Người thứ hai nhận cùng P3
  clock.advance('1m');
  const r2 = await handoff.command({
    turnId: 'u-nhan-2',
    chatId: STAFF_CHAT,
    userId: 'nv2',
    userName: 'Minh',
    text: '/nhan P3',
  });
  assert.equal(r2.ok, false);
  assert.equal(r2.alreadyClaimed, true);
  assert.equal(store.tickets.openFor('c3').claimed_by, 'nv1', 'người nhận đầu không bị ghi đè');

  const nhom = tinNhom(channel);
  assert.equal(nhom.length, 1);
  assert.match(nhom[0], /P3 đã có Hà nhận/);

  // Tin phản hồi nội bộ không trừ hạn mức tin nhắn của khách và không ghi vào messages khách.
  assert.equal(store.outbox.countSent(null, '2026-11-04T00:00:00.000Z'), 0);
  assert.equal(store.messages.recent('c3', 10).length, 0);
  assert.equal(store.messages.recent(STAFF_CHAT, 10).length, 0);
});

test('/tra-bot P3 → phòng về bot, phiếu closed; bot không trả lời bù tin cũ', async () => {
  const { store, clock, channel, handoff } = setup();
  await moBaPhieu(handoff, channel);

  // Nhân viên nhận P3, khách nhắn 3 tin trong lúc chờ người
  await handoff.command({ turnId: 'u-n1', chatId: STAFF_CHAT, userId: 'nv1', text: '/nhan P3' });
  for (let i = 1; i <= 3; i++) {
    clock.advance('30s');
    store.messages.add({
      conv_id: 'c3',
      chat_id: 'c3',
      turn_id: `kh-${i}`,
      speaker: 'khach',
      speaker_id: 'u3',
      text: `tin khách cũ số ${i} khi phòng đang human`,
      at: clock.now().toISOString(),
    });
  }
  assert.equal(handoff.stateOf('c3'), 'human');

  // Nhân viên trả phòng về cho bot
  clock.advance('1m');
  const r = await handoff.command({
    turnId: 'u-tra-1',
    chatId: STAFF_CHAT,
    userId: 'nv1',
    text: '/tra-bot P3',
  });

  assert.equal(r.ok, true);
  assert.equal(handoff.stateOf('c3'), 'bot');
  assert.equal(store.convs.get('c3').state, 'bot');
  assert.equal(store.tickets.openFor('c3'), null, 'phiếu P3 đã đóng nên không còn openFor');
  const closed = store.tickets.list('closed').find((t) => t.id === 3);
  assert.ok(closed, 'P3 phải có trong danh sách closed');
  assert.equal(closed.status, 'closed');
  assert.ok(closed.closed_at);

  // Không gửi tin trả lời bù cho khách và bộ quét phiếu cũng không đẩy lại tin cũ.
  assert.equal(tinKhach(channel, 'c3').length, 0);
  clock.advance('10m');
  assert.equal(await handoff.flushDue(), 0);
  assert.equal(tinKhach(channel, 'c3').length, 0);
});

test('/chan P3 → blocked; /cho → danh sách phiếu open + phút chờ (không gồm phiếu claimed/closed)', async () => {
  const { store, clock, channel, handoff } = setup();
  // Mở P1 lúc t=0, P2 lúc t=+5m, P3 lúc t=+10m
  await handoff.open('c1', 'khach-xin-nguoi');
  clock.advance('5m');
  await handoff.open('c2', 'cap:chat');
  clock.advance('5m');
  await handoff.open('c3', 'khach-xin-nguoi');
  channel.sent.length = 0;

  // Chặn P3 bằng /chan P3
  const rChan = await handoff.command({
    turnId: 'u-chan-1',
    chatId: STAFF_CHAT,
    userId: 'nv1',
    text: '/chan P3',
  });
  assert.equal(rChan.ok, true);
  assert.equal(handoff.stateOf('c3'), 'blocked');
  assert.equal(store.convs.get('c3').state, 'blocked');

  // Nhận P2 bằng /nhan P2 (status='claimed' → không còn trong danh sách 'open' của /cho)
  await handoff.command({ turnId: 'u-nhan-p2', chatId: STAFF_CHAT, userId: 'nv1', text: '/nhan P2' });
  channel.sent.length = 0;

  // Tiến thêm 15 phút: P1 đã chờ 25 phút, P3 đã chờ 15 phút
  clock.advance('15m');
  const rCho = await handoff.command({
    turnId: 'u-cho-1',
    chatId: STAFF_CHAT,
    userId: 'nv1',
    text: '/cho',
  });

  assert.equal(rCho.ok, true);
  const nhom = tinNhom(channel);
  assert.equal(nhom.length, 1);
  assert.match(nhom[0], /P1\b[\s\S]*25\s*phút/);
  assert.match(nhom[0], /P3\b[\s\S]*15\s*phút/);
  assert.doesNotMatch(nhom[0], /P2\b/, 'phiếu đã claimed không nằm trong danh sách open của /cho');

  // Không trừ hạn mức tin nhắn của khách
  assert.equal(store.outbox.countSent(null, '2026-11-04T00:00:00.000Z'), 0);

  // /chan-nhom chặn cả nhóm khách
  store.chats.upsertSeen('g1', 'group', 'Nhóm 1', clock.now().toISOString());
  store.convs.upsertSeen('g1:A', 'g1', 'A', 'An', clock.now().toISOString());
  const rChanNhom = await handoff.command({
    turnId: 'u-chan-nhom-1',
    chatId: STAFF_CHAT,
    userId: 'nv1',
    text: '/chan-nhom g1',
  });
  assert.equal(rChanNhom.ok, true);
  assert.equal(store.chats.get('g1').state, 'blocked');
  assert.equal(handoff.stateOf('g1:A'), 'blocked');
});

test('lệnh từ người không thuộc STAFF_USERS hoặc ngoài STAFF_CHAT_ID → bỏ qua, audit staff-cmd:denied', async () => {
  const { store, channel, handoff } = setup();
  await moBaPhieu(handoff, channel);

  // 1. Người không thuộc STAFF_USERS nhắn ngay trong STAFF_CHAT_ID
  const r1 = await handoff.command({
    turnId: 'u-deny-1',
    chatId: STAFF_CHAT,
    userId: 'khach-la',
    userName: 'Người Lạ',
    text: '/tl P3 Tôi giả làm nhân viên',
  });
  assert.equal(r1.ok, false);
  assert.equal(r1.denied, true);
  assert.equal(tinKhach(channel, 'c3').length, 0);
  assert.equal(handoff.stateOf('c3'), 'bot');

  const auditStaffChat = store.audit.byChat(STAFF_CHAT, 10);
  assert.ok(
    auditStaffChat.some((a) => a.type === 'staff-cmd:denied' && a.data.userId === 'khach-la'),
    'phải ghi audit type="staff-cmd:denied" khi người gửi không thuộc STAFF_USERS',
  );

  // 2. Nhân viên thuộc STAFF_USERS nhưng gõ lệnh ở ngoài STAFF_CHAT_ID (trong phòng khách c3)
  const r2 = await handoff.command({
    turnId: 'u-deny-2',
    chatId: 'c3',
    userId: 'nv1',
    userName: 'Hà',
    text: '/tra-bot P3',
  });
  assert.equal(r2.ok, false);
  assert.equal(r2.denied, true);

  const auditC3 = store.audit.byChat('c3', 10);
  assert.ok(
    auditC3.some((a) => a.type === 'staff-cmd:denied' && a.data.userId === 'nv1'),
    'phải ghi audit type="staff-cmd:denied" khi lệnh gửi ngoài STAFF_CHAT_ID',
  );

  // 3. Tin thường hoặc lệnh của gói khác (/echo) không phải lệnh handoff → matched: false, không ghi staff-cmd:denied
  const r3 = await handoff.command({
    turnId: 'u-echo',
    chatId: 'c1',
    userId: 'khach-1',
    text: '/echo xin chào',
  });
  assert.equal(r3.matched, false);
  assert.equal(store.audit.byChat('c1', 10).filter((a) => a.type === 'staff-cmd:denied').length, 0);
});

test('tên khách có chứa đường dẫn nội bộ không làm cửa từ chối bản tin /cho', async () => {
  const { store, clock, channel, handoff } = setup();
  store.convs.upsertSeen('c1', 'c1', null, 'Khách /home/oz/secret.log', START);
  await handoff.open('c1', 'khach-xin-nguoi');
  channel.sent.length = 0;

  clock.advance('10m');
  const r = await handoff.command({
    turnId: 'u-cho-leak',
    chatId: STAFF_CHAT,
    userId: 'nv1',
    text: '/cho',
  });

  assert.equal(r.ok, true);
  assert.equal(tinNhom(channel).length, 1);
  assert.doesNotMatch(tinNhom(channel)[0], /\/home\/oz\//);
  assert.match(tinNhom(channel)[0], /P1\b[\s\S]*10\s*phút/);
});

test('/nhan giữ tên người nhận qua khởi động lại và hỗ trợ gỡ @Bot trước lệnh', async () => {
  const { store, clock, channel, gate, handoff } = setup();
  await moBaPhieu(handoff, channel);

  await handoff.command({
    turnId: 'u-r1',
    chatId: STAFF_CHAT,
    userId: 'nv1',
    userName: 'Hà',
    text: '@Bot OZ /nhan P3',
  });

  // Mô phỏng khởi động lại tiến trình: tạo handoff mới trên cùng store
  const handoff2 = createHandoff({
    store,
    gate,
    config: { staffChatId: STAFF_CHAT, staffUsers: STAFF_USERS, botNames: ['Bot OZ'] },
    now: clock.now,
  });

  clock.advance('1m');
  const r2 = await handoff2.command({
    turnId: 'u-r2',
    chatId: STAFF_CHAT,
    userId: 'nv2',
    userName: 'Minh',
    text: '@Bot OZ /nhan P3',
  });

  assert.equal(r2.alreadyClaimed, true);
  assert.match(tinNhom(channel)[0], /P3 đã có Hà nhận/);
});

test('lệnh thiếu tham số hoặc mã phiếu không tồn tại trả ok=false và không ném lỗi', async () => {
  const { channel, handoff } = setup();
  const rEmptyTl = await handoff.command({ turnId: 'u-e1', chatId: STAFF_CHAT, userId: 'nv1', text: '/tl P3' });
  assert.equal(rEmptyTl.ok, false);
  assert.equal(rEmptyTl.reason, 'invalid-args');

  const rMissingTicket = await handoff.command({ turnId: 'u-e2', chatId: STAFF_CHAT, userId: 'nv1', text: '/tl P999 Alo' });
  assert.equal(rMissingTicket.ok, false);
  assert.equal(rMissingTicket.reason, 'ticket-not-found');

  const rMissingNhan = await handoff.command({ turnId: 'u-e3', chatId: STAFF_CHAT, userId: 'nv1', text: '/nhan P999' });
  assert.equal(rMissingNhan.ok, false);
  assert.equal(rMissingNhan.reason, 'ticket-not-found');

  const rChoEmpty = await handoff.command({ turnId: 'u-e4', chatId: STAFF_CHAT, userId: 'nv1', text: '/cho' });
  assert.equal(rChoEmpty.ok, true);
  assert.equal(rChoEmpty.tickets.length, 0);
  assert.match(tinNhom(channel)[0], /0 phiếu open/);
});
