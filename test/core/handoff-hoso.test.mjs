// T036: lệnh hồ sơ cho nhân viên trong nhóm STAFF_CHAT_ID (/ho-so, /gan, /go, /ghi, /xoa-du-lieu).
// Thi hành FR-027 (`specs/001-nen-tang-chung/spec.md:252`), Điều I (một cửa gửi), Điều II, Điều IV
// (audit), Điều IX (không lộ bí mật) và Review Focus 3 (`specs/001-nen-tang-chung/tasks.md:34`:
// trong nhóm mọi thứ theo `conv_id`, không theo nhóm).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createHandoff } from '../../core/handoff.js';
import { fakeChannel, fakeClock } from '../helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z'; // 10:00 giờ VN, ngoài giờ yên
const STAFF_CHAT = 'S1';
const STAFF_USERS = new Set(['nv1', 'nv2']);

function setup({ start = START, staffChatId = STAFF_CHAT, staffUsers = STAFF_USERS, bannedPatterns = [] } = {}) {
  const clock = fakeClock(start);
  const channel = fakeChannel();
  const store = openStore();
  const loi = [];
  const gate = createGate({ store, channel, now: clock.now, rules: { bannedPatterns } });
  const handoff = createHandoff({
    store, gate,
    config: { staffChatId, staffUsers, bannedPatterns, botNames: ['Bot OZ'] },
    now: clock.now,
    log: (...a) => loi.push(a.join(' ')),
  });
  store.chats.upsertSeen('c1', 'user', 'Khách A', start);
  store.convs.upsertSeen('c1', 'c1', null, 'Khách A', start);
  return { store, clock, channel, gate, handoff, loi };
}

const tinNhom = (channel) => channel.sent.filter((m) => m.chatId === STAFF_CHAT).map((m) => m.text);

/** Mở phiếu P1 cho c1 rồi xoá tin đã gửi, để mỗi test chỉ thấy phản hồi của lệnh mình gọi. */
async function moPhieu(handoff, channel, convId = 'c1') {
  const { ticket } = await handoff.open(convId, 'khach-xin-nguoi');
  channel.sent.length = 0;
  return ticket;
}

const lenh = (text, o = {}) => ({ turnId: `u-${Math.random().toString(36).slice(2, 8)}`, chatId: STAFF_CHAT, userId: 'nv1', userName: 'Hà', text, ...o });

// ═══ /ho-so ═══

test('/ho-so P1 → nhóm nhân viên nhận hồ sơ + 20 tin gần nhất theo giờ VN, qua cửa gửi', async () => {
  const { store, channel, handoff, clock } = setup();
  store.customers.upsert('c1', {
    chat_id: 'c1', display_name: 'Khách A', phone: '0912345678',
    labels: [{ nhan: 'tra-cuu-hs', nguon: 'auto', at: START }], turns: 7,
    interests: [{ mon: 'máy bơm ly tâm 1.5HP', hs: '84137090', at: START }],
  }, START);
  // 25 tin: chỉ 20 tin MỚI NHẤT được đưa vào, cũ trước mới sau.
  for (let i = 0; i < 25; i++) {
    store.messages.add({ conv_id: 'c1', chat_id: 'c1', speaker: i % 2 ? 'bot' : 'khach', text: `tin ${i}`, at: new Date(Date.parse(START) + i * 60_000).toISOString() });
  }
  await moPhieu(handoff, channel);
  clock.advance('5m');

  const r = await handoff.command(lenh('/ho-so P1'));
  assert.equal(r.ok, true);
  assert.equal(r.cmd, 'ho-so');

  const tin = tinNhom(channel);
  assert.equal(tin.length, 1, 'đúng MỘT tin vào nhóm nhân viên');
  const t = tin[0];
  assert.match(t, /P1/);
  assert.match(t, /Hồ sơ khách: Khách A/);
  assert.match(t, /Số điện thoại: 0912345678/);
  assert.match(t, /Nhãn: tra-cuu-hs/);
  assert.match(t, /máy bơm ly tâm 1\.5HP/);
  assert.match(t, /Số lượt: 7/);
  // 20 tin gần nhất: còn "tin 5" … "tin 24", không còn "tin 0".
  assert.match(t, /20 tin gần nhất/);
  assert.ok(!/\btin 4\b/.test(t), `không được lấy quá 20 tin: ${t}`);
  assert.match(t, /\btin 5\b/);
  assert.match(t, /\btin 24\b/);
  assert.ok(t.indexOf('tin 5') < t.indexOf('tin 24'), 'tin cũ trước, mới sau');
  // Giờ VN (UTC+7), KHÔNG theo giờ máy: tin 0 lúc 03:00Z = 10:00 VN ngày 04/11, nên tin i là 10:0i.
  // Người nói: `i % 2` nên tin lẻ là 'bot', tin chẵn là 'khach' (hiện ra là "bot" và "khách").
  assert.match(t, /- 10:05 04\/11 bot: tin 5/);
  assert.match(t, /- 10:06 04\/11 khách: tin 6/);

  // Tin ra đi qua đúng một cửa (Điều I): có dòng outbox kind 'ticket' vào nhóm nhân viên.
  const out = store.outbox.lastForChat(STAFF_CHAT);
  assert.equal(out.kind, 'ticket');
  assert.match(out.idem_key, /^cmd:ho-so:/);
});

test('/ho-so trên cuộc trò chuyện chưa có hồ sơ → vẫn trả lời, nói rõ chưa có hồ sơ', async () => {
  const { channel, handoff } = setup();
  await moPhieu(handoff, channel);

  const r = await handoff.command(lenh('/ho-so P1'));
  assert.equal(r.ok, true);
  assert.match(tinNhom(channel)[0], /Chưa có hồ sơ khách/);
});

test('/ho-so mã phiếu không có → ok=false, không gửi tin nào', async () => {
  const { channel, handoff } = setup();
  await moPhieu(handoff, channel);

  const r = await handoff.command(lenh('/ho-so P99'));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'ticket-not-found');
  assert.deepEqual(tinNhom(channel), []);
});

test('/ho-so che TỪNG DÒNG: tên khách có dạng đường dẫn máy chủ không làm mất cả tin', async () => {
  const { store, channel, handoff } = setup();
  store.customers.upsert('c1', { chat_id: 'c1', display_name: '/home/oz/bot', phone: '0912345678', turns: 2 }, START);
  store.messages.add({ conv_id: 'c1', chat_id: 'c1', speaker: 'khach', text: 'cho em hỏi thuế', at: START });
  await moPhieu(handoff, channel);

  const r = await handoff.command(lenh('/ho-so P1'));
  assert.equal(r.ok, true);
  const t = tinNhom(channel)[0];
  assert.ok(!t.includes('/home/oz/bot'), `tên bẩn phải bị che: ${t}`);
  assert.match(t, /bị che/);
  assert.match(t, /cho em hỏi thuế/, 'các dòng sạch vẫn phải còn (Điều II: nhân viên cần thấy khách)');
  assert.match(t, /Số điện thoại: 0912345678/);
});

// ═══ /gan và /go ═══

test('/gan P1 khoa-hoc → nhãn nguồn staff:nv1; máy không gỡ được nhãn đó', async () => {
  const { store, channel, handoff } = setup();
  await moPhieu(handoff, channel);

  const r = await handoff.command(lenh('/gan P1 khoa-hoc'));
  assert.equal(r.ok, true);
  assert.equal(r.cmd, 'gan');
  const nhan = store.customers.get('c1').labels;
  assert.deepEqual(nhan.map((l) => [l.nhan, l.nguon]), [['khoa-hoc', 'staff:nv1']]);
  assert.match(tinNhom(channel)[0], /khoa-hoc/);

  // Nhãn của nhân viên: `removeLabel(..., 'auto')` phải giữ lại (FR-026).
  const { createCustomers } = await import('../../core/customers.js');
  const may = createCustomers({ store, now: () => new Date(START) });
  may.removeLabel('c1', 'khoa-hoc', 'auto');
  assert.equal(store.customers.get('c1').labels.length, 1, 'máy không được gỡ nhãn của nhân viên');
});

test('/gan nhận nhiều nhãn một lần, chuẩn hoá tên (bỏ dấu, khoảng trắng → gạch), không trùng mục', async () => {
  const { store, channel, handoff } = setup();
  await moPhieu(handoff, channel);

  await handoff.command(lenh('/gan P1 khoa-hoc  "Hàng Dễ Vỡ"'));
  const nhan = store.customers.get('c1').labels.map((l) => l.nhan);
  assert.deepEqual(nhan, ['khoa-hoc', 'hang-de-vo']);

  await handoff.command(lenh('/gan P1 khoa-hoc'));
  assert.equal(store.customers.get('c1').labels.length, 2, 'gắn lại nhãn đã có thì không thêm mục mới');
});

test('/gan thiếu tên nhãn → ok=false, không đụng hồ sơ', async () => {
  const { store, channel, handoff } = setup();
  await moPhieu(handoff, channel);

  const r = await handoff.command(lenh('/gan P1'));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid-args');
  assert.equal(store.customers.get('c1'), null, 'không được tạo hồ sơ rỗng');
});

test('/go P1 khoa-hoc → gỡ được cả nhãn do nhân viên khác gắn', async () => {
  const { store, channel, handoff } = setup();
  await moPhieu(handoff, channel);
  await handoff.command(lenh('/gan P1 khoa-hoc', { userId: 'nv2' }));
  channel.sent.length = 0;

  const r = await handoff.command(lenh('/go P1 khoa-hoc'));
  assert.equal(r.ok, true);
  assert.equal(r.cmd, 'go');
  assert.deepEqual(store.customers.get('c1').labels, []);
  assert.match(tinNhom(channel)[0], /khoa-hoc/);
});

test('/go nhãn không có trong hồ sơ → ok=true, nói rõ hồ sơ không có nhãn đó', async () => {
  const { store, channel, handoff } = setup();
  await moPhieu(handoff, channel);
  await handoff.command(lenh('/gan P1 khoa-hoc'));
  channel.sent.length = 0;

  const r = await handoff.command(lenh('/go P1 de-vo'));
  assert.equal(r.ok, true);
  assert.equal(r.daGo, false);
  assert.deepEqual(store.customers.get('c1').labels.map((l) => l.nhan), ['khoa-hoc']);
});

// ═══ /ghi ═══

test("/ghi P1 khách hẹn thứ 6 → note của hồ sơ giữ ĐÚNG nội dung, kèm người ghi", async () => {
  const { store, channel, handoff, clock } = setup();
  await moPhieu(handoff, channel);
  clock.advance('10m');

  const r = await handoff.command(lenh('/ghi P1 khách hẹn thứ 6'));
  assert.equal(r.ok, true);
  assert.equal(r.cmd, 'ghi');
  const note = JSON.parse(store.customers.get('c1').note);
  assert.equal(note.text, 'khách hẹn thứ 6');
  assert.equal(note.by, 'staff:nv1');
  assert.equal(note.at, '2026-11-04T03:10:00.000Z'); // mốc lưu là UTC ISO
  assert.match(tinNhom(channel)[0], /khách hẹn thứ 6/);

  // Ghi chú phải hiện trong `/ho-so` để nhân viên khác đọc được.
  channel.sent.length = 0;
  await handoff.command(lenh('/ho-so P1'));
  assert.match(tinNhom(channel)[0], /Ghi chú: khách hẹn thứ 6/);
});

test('/ghi P1 (bỏ trống) → xoá ghi chú cũ', async () => {
  const { store, channel, handoff } = setup();
  await moPhieu(handoff, channel);
  await handoff.command(lenh('/ghi P1 ghi tạm'));

  const r = await handoff.command(lenh('/ghi P1'));
  assert.equal(r.ok, true);
  assert.equal(store.customers.get('c1').note, null);
});

test('/ghi giữ nguyên last_seen_at của hồ sơ (mốc đó là lần cuối KHÁCH nhắn, FR-025)', async () => {
  const { store, channel, handoff, clock } = setup();
  store.customers.upsert('c1', { chat_id: 'c1', display_name: 'Khách A', turns: 3 }, START);
  await moPhieu(handoff, channel);
  clock.advance('2h');

  await handoff.command(lenh('/ghi P1 khách hẹn thứ 6'));
  assert.equal(store.customers.get('c1').last_seen_at, START);
});

// ═══ /xoa-du-lieu ═══

test('/xoa-du-lieu P1 → messages và customers của cuộc trò chuyện về 0; audit erase nêu người xoá, KHÔNG chứa lời khách', async () => {
  const { store, channel, handoff, clock } = setup();
  store.customers.upsert('c1', { chat_id: 'c1', display_name: 'Khách A', phone: '0912345678', turns: 4 }, START);
  for (const t of ['số em 0912345678', 'cho em hỏi thuế máy bơm']) {
    store.messages.add({ conv_id: 'c1', chat_id: 'c1', speaker: 'khach', text: t, at: START });
  }
  await moPhieu(handoff, channel);
  clock.advance('5m');

  const r = await handoff.command(lenh('/xoa-du-lieu P1'));
  assert.equal(r.ok, true);
  assert.equal(r.cmd, 'xoa-du-lieu');
  assert.equal(r.soTin, 2);

  assert.equal(store.messages.recent('c1', 50).length, 0);
  assert.equal(store.customers.get('c1'), null);

  // Audit giữ bản ghi 'erase' nêu người xoá (Điều IV) nhưng KHÔNG giữ nội dung tin của khách.
  const erase = store.audit.byChat('c1', 50).filter((a) => a.type === 'erase');
  assert.equal(erase.length, 1);
  assert.equal(erase[0].data.by, 'nv1');
  assert.equal(erase[0].data.convId, 'c1');
  assert.equal(erase[0].data.messages, 2);
  assert.equal(erase[0].data.customers, true);
  const json = JSON.stringify(erase[0]);
  assert.ok(!json.includes('cho em hỏi thuế'), `audit erase không được chứa lời khách: ${json}`);
  assert.ok(!json.includes('0912345678'), `audit erase không được chứa số của khách: ${json}`);

  // Phản hồi vào nhóm cũng không được nhắc lại nội dung đã xoá.
  const t = tinNhom(channel)[0];
  assert.match(t, /P1/);
  assert.ok(!t.includes('cho em hỏi thuế'), `phản hồi không được chứa lời khách: ${t}`);
});

test('/xoa-du-lieu trong nhóm hai người: xoá của A KHÔNG xoá tin và hồ sơ của B (Review Focus 3)', async () => {
  const { store, channel, handoff } = setup();
  store.chats.upsertSeen('g1', 'group', 'Nhóm XNK', START);
  store.convs.upsertSeen('g1:A', 'g1', 'A', 'An', START);
  store.convs.upsertSeen('g1:B', 'g1', 'B', 'Bình', START);
  store.customers.upsert('g1:A', { chat_id: 'g1', display_name: 'An', turns: 2 }, START);
  store.customers.upsert('g1:B', { chat_id: 'g1', display_name: 'Bình', phone: '0912345678', turns: 5 }, START);
  store.messages.add({ conv_id: 'g1:A', chat_id: 'g1', speaker: 'khach', text: 'A hỏi thuế', at: START });
  store.messages.add({ conv_id: 'g1:A', chat_id: 'g1', speaker: 'bot', text: 'bot trả lời A', at: START });
  store.messages.add({ conv_id: 'g1:B', chat_id: 'g1', speaker: 'khach', text: 'B hỏi cước', at: START });
  const ticket = await moPhieu(handoff, channel, 'g1:A');

  const r = await handoff.command(lenh(`/xoa-du-lieu P${ticket.id}`));
  assert.equal(r.ok, true);
  assert.equal(r.convId, 'g1:A');
  assert.equal(r.soTin, 2);

  assert.equal(store.messages.recent('g1:A', 50).length, 0);
  assert.equal(store.customers.get('g1:A'), null);
  // B không bị đụng tới: đây là chỗ `messages.deleteChat(chat_id)` làm sai.
  assert.deepEqual(store.messages.recent('g1:B', 50).map((m) => m.text), ['B hỏi cước']);
  assert.equal(store.customers.get('g1:B').display_name, 'Bình');
});

test('/xoa-du-lieu giữ convs, tickets và audit (chỉ xoá messages + customers)', async () => {
  const { store, channel, handoff } = setup();
  store.customers.upsert('c1', { chat_id: 'c1', display_name: 'Khách A', turns: 1 }, START);
  const ticket = await moPhieu(handoff, channel);

  await handoff.command(lenh('/xoa-du-lieu P1'));
  assert.equal(store.convs.get('c1').conv_id, 'c1');
  assert.equal(store.tickets.openFor('c1')?.id, ticket.id);
  assert.ok(store.audit.byChat('c1', 50).length > 0);
});

test('/xoa-du-lieu trên cuộc trò chuyện không có dữ liệu → ok=true, soTin=0, vẫn ghi audit erase', async () => {
  const { store, channel, handoff } = setup();
  await moPhieu(handoff, channel);

  const r = await handoff.command(lenh('/xoa-du-lieu P1'));
  assert.equal(r.ok, true);
  assert.equal(r.soTin, 0);
  assert.equal(store.audit.byChat('c1', 50).filter((a) => a.type === 'erase').length, 1);
});

// ═══ Quyền: lệnh hồ sơ chịu đúng luật của T025 ═══

test('người ngoài STAFF_USERS gõ lệnh hồ sơ trong nhóm nhân viên → từ chối, không đổi dữ liệu', async () => {
  const { store, channel, handoff } = setup();
  store.messages.add({ conv_id: 'c1', chat_id: 'c1', speaker: 'khach', text: 'tin của khách', at: START });
  await moPhieu(handoff, channel);

  for (const text of ['/ho-so P1', '/gan P1 khoa-hoc', '/go P1 khoa-hoc', '/ghi P1 abc', '/xoa-du-lieu P1']) {
    const r = await handoff.command(lenh(text, { userId: 'ke-la' }));
    assert.equal(r.denied, true, text);
    assert.equal(r.reason, 'not-staff-user');
  }
  assert.equal(store.customers.get('c1'), null);
  assert.equal(store.messages.recent('c1', 5).length, 1);
  assert.deepEqual(tinNhom(channel), []);
  assert.equal(store.audit.byChat(STAFF_CHAT, 50).filter((a) => a.type === 'staff-cmd:denied').length, 5);
});

test('lệnh hồ sơ gõ NGOÀI nhóm nhân viên (khách gõ trong phòng mình) → từ chối, không xoá gì', async () => {
  const { store, channel, handoff } = setup();
  store.messages.add({ conv_id: 'c1', chat_id: 'c1', speaker: 'khach', text: 'tin của khách', at: START });
  await moPhieu(handoff, channel);

  const r = await handoff.command(lenh('/xoa-du-lieu P1', { chatId: 'c1', userId: 'nv1' }));
  assert.equal(r.denied, true);
  assert.equal(r.reason, 'not-staff-chat');
  assert.equal(store.messages.recent('c1', 5).length, 1);
});

test('chưa đặt STAFF_CHAT_ID → mọi lệnh hồ sơ bị từ chối (không có nhóm nào là nhóm nhân viên)', async () => {
  const { store, handoff } = setup({ staffChatId: '' });
  store.messages.add({ conv_id: 'c1', chat_id: 'c1', speaker: 'khach', text: 'tin của khách', at: START });

  const r = await handoff.command(lenh('/xoa-du-lieu c1'));
  assert.equal(r.denied, true);
  assert.equal(store.messages.recent('c1', 5).length, 1);
});

test('lệnh hồ sơ ghi audit staff-cmd nêu lệnh và người gõ (Điều IV)', async () => {
  const { store, channel, handoff } = setup();
  await moPhieu(handoff, channel);

  await handoff.command(lenh('/gan P1 khoa-hoc'));
  await handoff.command(lenh('/ghi P1 hẹn thứ 6', { userId: 'nv2' }));
  const a = store.audit.byChat('c1', 50).filter((x) => x.type === 'staff-cmd');
  assert.deepEqual(a.map((x) => [x.data.cmd, x.data.by]).sort(), [['gan', 'nv1'], ['ghi', 'nv2']]);
});

test('lệnh hồ sơ tra đích được bằng conv_id trực tiếp, không cần mã phiếu', async () => {
  const { store, handoff, channel } = setup();
  store.customers.upsert('c1', { chat_id: 'c1', display_name: 'Khách A', turns: 1 }, START);

  const r = await handoff.command(lenh('/gan c1 khoa-hoc'));
  assert.equal(r.ok, true);
  assert.deepEqual(store.customers.get('c1').labels.map((l) => l.nhan), ['khoa-hoc']);
  assert.equal(tinNhom(channel).length, 1);
});

test('lệnh không phải lệnh nhân viên (/abc) vẫn không khớp — lệnh hồ sơ không làm rộng cửa', async () => {
  const { handoff } = setup();
  const r = await handoff.command(lenh('/abc P1'));
  assert.equal(r.matched, false);
});
