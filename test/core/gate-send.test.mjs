import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { fakeChannel, fakeClock } from '../helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z'; // 10:00 VN

function setup({ channel, rules, start = START } = {}) {
  const store = openStore();
  const clock = fakeClock(start);
  const ch = channel ?? fakeChannel();
  const alerts = [];
  const tickets = [];
  const gate = createGate({
    store, channel: ch, rules, now: clock.now,
    onAlert: (c, r) => alerts.push([c, r]),
    onTicket: (c, r) => tickets.push([c, r]),
  });
  const msg = (o = {}) => ({
    idemKey: 'k1', chatId: 'c1', turnId: 't1', kind: 'reply', text: 'Dạ mã 8413.70.90',
    inReplyToAt: clock.now().toISOString(), ...o,
  });
  return { store, clock, ch, gate, alerts, tickets, msg };
}

test('ghi outbox trước khi gọi kênh (status queued tại lúc gửi)', async () => {
  let seen;
  const store0 = { id: null };
  const ctx = setup({
    channel: {
      ...fakeChannel(),
      async sendText() { seen = ctx.store.outbox.get(store0.id)?.status; },
    },
  });
  // id đầu tiên của outbox mới là 1
  store0.id = 1;
  const r = await ctx.gate.send(ctx.msg());
  assert.equal(seen, 'queued');
  assert.equal(r.status, 'sent');
  assert.equal(r.decision, 'send');
  assert.equal(ctx.store.outbox.get(r.id).status, 'sent');
  assert.equal(ctx.store.outbox.get(r.id).parts_sent, 1);
  assert.equal(ctx.store.outbox.get(r.id).sent_at, START);
});

test('hai send cùng idemKey song song → kênh nhận 1 lần', async () => {
  const { gate, ch, msg } = setup();
  const m = msg();
  const [a, b] = await Promise.all([gate.send(m), gate.send(m)]);
  assert.equal(ch.sent.length, 1);
  const dup = [a, b].find((x) => x.status === 'dropped');
  assert.equal(dup.reason, 'duplicate-idem');
  assert.equal(dup.decision, 'drop');
});

test('gửi lại sau khi xong → drop duplicate-idem, kênh vẫn 1 lần', async () => {
  const { gate, ch, msg } = setup();
  await gate.send(msg());
  const r = await gate.send(msg());
  assert.deepEqual([r.decision, r.reason, r.status], ['drop', 'duplicate-idem', 'dropped']);
  assert.equal(ch.sent.length, 1);
});

test('tin 4.500 ký tự → 3 phần; kênh lỗi phần 2 → status failed, parts_sent 1', async () => {
  const text = Array.from({ length: 3 }, (_, i) => `${i + 1}`.repeat(1500)).join('\n\n').slice(0, 4500);
  const ch = fakeChannel({ failOn: (_c, _t, n) => n === 2 });
  const { gate, store, clock } = setup({ channel: ch });
  const r = await gate.send({ idemKey: 'k1', chatId: 'c1', turnId: 't1', kind: 'reply', text, inReplyToAt: clock.now().toISOString() });
  assert.equal(r.status, 'failed');
  const o = store.outbox.get(r.id);
  assert.equal(o.parts_sent, 1);
  assert.equal(o.attempts, 1);
  assert.equal(o.next_retry_at, new Date(Date.parse(START) + 60_000).toISOString());
  assert.equal(ch.sent.length, 1);
  assert.equal(store.messages.recent('c1', 10).length, 0); // chưa 'sent' thì chưa ghi messages
  const err = store.audit.byChat('c1').find((a) => a.type === 'error');
  assert.match(err.data.message, /fake channel/);
});

test('lỗi kênh được che bí mật trong audit và không ném ra', async () => {
  const ch = { ...fakeChannel(), async sendText() { throw new Error('boom Bearer abc.def.ghi'); } };
  const { gate, store } = setup({ channel: ch });
  const r = await gate.send({ idemKey: 'k1', chatId: 'c1', turnId: 't1', kind: 'reply', text: 'x ok', inReplyToAt: START });
  assert.equal(r.status, 'failed');
  const err = store.audit.byChat('c1').find((a) => a.type === 'error');
  assert.ok(!err.data.message.includes('abc.def'));
});

test('reject leak → onAlert 1 lần, không có gì tới kênh', async () => {
  const { gate, ch, alerts, tickets, store, msg } = setup();
  const r = await gate.send(msg({ text: 'file ở /home/claude/x.js' }));
  assert.equal(r.decision, 'reject');
  assert.equal(r.reason, 'leak:path');
  assert.equal(r.status, 'rejected');
  assert.equal(ch.sent.length, 0);
  assert.deepEqual(alerts, [['c1', 'leak:path']]);
  assert.equal(tickets.length, 0);
  assert.equal(store.outbox.get(r.id).status, 'rejected');
});

test('cap:chat → defer, onTicket(chatId, reason), not_before ngày VN kế tiếp', async () => {
  const { gate, ch, tickets, alerts, store, msg } = setup({ rules: { capChatDay: 2 } });
  await gate.send(msg({ idemKey: 'a', text: 'alpha bravo charlie' }));
  await gate.send(msg({ idemKey: 'b', text: 'delta echo foxtrot' }));
  const r = await gate.send(msg({ idemKey: 'c', text: 'golf hotel india' }));
  assert.deepEqual([r.decision, r.reason, r.status], ['defer', 'cap:chat', 'deferred']);
  assert.equal(ch.sent.length, 2);
  assert.deepEqual(tickets, [['c1', 'cap:chat']]);
  assert.equal(alerts.length, 0);
  assert.equal(store.outbox.get(r.id).not_before, '2026-11-05T00:00:00.000Z'); // 07:00 VN 05/11, một bước
});

test('cap:all → defer và onAlert', async () => {
  const { gate, alerts, tickets, msg } = setup({ rules: { capAllDay: 1 } });
  await gate.send(msg({ idemKey: 'a', chatId: 'x', text: 'alpha bravo charlie' }));
  const r = await gate.send(msg({ idemKey: 'b', chatId: 'y', text: 'delta echo foxtrot' }));
  assert.equal(r.reason, 'cap:all');
  assert.deepEqual(alerts, [['y', 'cap:all']]);
  assert.equal(tickets.length, 0);
});

test('money:* → reject và onTicket', async () => {
  const { gate, tickets, ch, msg } = setup();
  const r = await gate.send(msg({ text: 'Giá 25.650đ', pack: { moneyCheck: true }, evidence: [] }));
  assert.equal(r.decision, 'reject');
  assert.match(r.reason, /^money:/);
  assert.equal(tickets.length, 1);
  assert.equal(ch.sent.length, 0);
});

test('chat human → reject chat-human; không gọi onAlert/onTicket', async () => {
  const { gate, store, alerts, tickets, msg } = setup();
  store.chats.setState('c1', 'human', 'nv', 'x', START);
  const r = await gate.send(msg());
  assert.equal(r.reason, 'chat-human');
  assert.equal(alerts.length + tickets.length, 0);
});

test('tin chủ động giống tin vừa gửi (15 phút) → drop similar', async () => {
  const { gate, store, ch, msg, clock } = setup();
  store.jobs.add({ chat_id: 'c1', session_key: 'c1', pack: 'hs', ma_luot: 'L1', result_tool: 't', status: 'waiting', next_poll_at: START, expires_at: START, created_at: START });
  // inReplyToAt: null = chủ động thật (msg() mặc định gắn mốc "vừa xong", tức trả lời trực tiếp).
  await gate.send(msg({ idemKey: 'a', kind: 'job_result', text: 'Dạ mã HS là 8413.70.90 thuế 10%', inReplyToAt: null }));
  clock.advance('5m');
  const r = await gate.send(msg({ idemKey: 'b', kind: 'job_result', text: 'Dạ mã HS là 8413.70.90 thuế 10%', inReplyToAt: null }));
  assert.equal(r.decision, 'drop');
  assert.match(r.reason, /^similar:/);
  assert.equal(ch.sent.length, 1);
});

test('khách hỏi lại đúng câu đó sau 3 phút → vẫn được trả lời', async () => {
  const { gate, ch, msg, clock } = setup();
  await gate.send(msg({ idemKey: 'a', text: 'Dạ mã HS là 8413.70.90 thuế 10%', inReplyToAt: clock.now().toISOString() }));
  clock.advance('3m');
  const r = await gate.send(msg({ idemKey: 'b', text: 'Dạ mã HS là 8413.70.90 thuế 10%', inReplyToAt: clock.now().toISOString() }));
  assert.equal(r.decision, 'send');
  assert.equal(ch.sent.length, 2);
});

test('khách bấm gửi hai lần trong 20 giây → chỉ một câu trả lời', async () => {
  const { gate, ch, msg, clock } = setup();
  await gate.send(msg({ idemKey: 'a', text: 'Dạ mã HS là 8413.70.90 thuế 10%', inReplyToAt: clock.now().toISOString() }));
  clock.advance('20s');
  const r = await gate.send(msg({ idemKey: 'b', text: 'Dạ mã HS là 8413.70.90 thuế 10%', inReplyToAt: clock.now().toISOString() }));
  assert.equal(r.decision, 'drop');
  assert.match(r.reason, /^similar:/);
  assert.equal(ch.sent.length, 1);
});

test('ba lượt tra ba mã khác nhau liên tiếp → đều được gửi', async () => {
  const { gate, ch, msg, clock } = setup();
  const texts = [
    'Dạ mã HS là 8413.70.90 thuế NK 10% VAT 8%',
    'Dạ mã HS là 8516.90.00 thuế NK 15% VAT 8%',
    'Dạ mã HS là 6404.11.90 thuế NK 20% VAT 8%',
  ];
  for (const [i, text] of texts.entries()) {
    if (i > 0) clock.advance('10s');
    const r = await gate.send(msg({ idemKey: `k${i}`, text, inReplyToAt: clock.now().toISOString() }));
    assert.deepEqual([i, r.decision, r.reason], [i, 'send', 'ok']);
  }
  assert.equal(ch.sent.length, 3);
});

test('job_result có việc nền nợ → gửi; không nợ → proactive-no-debt', async () => {
  const { gate, store, msg } = setup();
  const r1 = await gate.send(msg({ kind: 'job_result', idemKey: 'a' }));
  assert.equal(r1.reason, 'proactive-no-debt');
  store.jobs.add({ chat_id: 'c1', session_key: 'c1', pack: 'hs', ma_luot: 'L1', result_tool: 't', status: 'waiting', next_poll_at: START, expires_at: START, created_at: START });
  const r2 = await gate.send(msg({ kind: 'job_result', idemKey: 'b' }));
  assert.equal(r2.status, 'sent');
});

test('quiet-hours → defer với not_before 07:00 VN', async () => {
  const { gate, store, msg } = setup({ start: '2026-11-04T16:30:00.000Z' }); // 23:30 VN
  store.jobs.add({ chat_id: 'c1', session_key: 'c1', pack: 'hs', ma_luot: 'L1', result_tool: 't', status: 'waiting', next_poll_at: START, expires_at: START, created_at: START });
  const r = await gate.send(msg({ kind: 'job_result' }));
  assert.deepEqual([r.decision, r.reason, r.status], ['defer', 'quiet-hours', 'deferred']);
  assert.equal(store.outbox.get(r.id).not_before, '2026-11-04T00:00:00.000Z'.replace('04T00', '05T00'));
});

test('messages chỉ ghi sau khi sent: bot / nhan-vien; ticket và digest thì không', async () => {
  const { gate, store, msg } = setup();
  const r1 = await gate.send(msg({ idemKey: 'a' }));
  const r2 = await gate.send(msg({ idemKey: 'b', kind: 'staff_relay', staffId: 'nv7', text: 'Em chào anh' }));
  await gate.send(msg({ idemKey: 'c', kind: 'ticket', chatId: 'staff', text: 'Phiếu mới' }));
  await gate.send(msg({ idemKey: 'd', kind: 'digest', chatId: 'staff', text: 'Bản tin' }));
  const ms = store.messages.recent('c1', 10);
  assert.deepEqual(ms.map((m) => [m.speaker, m.speaker_id, m.outbox_id]), [['bot', null, r1.id], ['nhan-vien', 'nv7', r2.id]]);
  assert.equal(ms[0].turn_id, 't1');
  assert.equal(store.messages.recent('staff', 10).length, 0);
});

test('audit gate: một dòng mỗi quyết định; staff_relay ghi bỏ qua kiểm lộ', async () => {
  const { gate, store, msg } = setup();
  await gate.send(msg({ idemKey: 'a' }));
  await gate.send(msg({ idemKey: 'a' }));
  await gate.send(msg({ idemKey: 'b', kind: 'staff_relay', text: 'xin chào /home/x' }));
  const gates = store.audit.byChat('c1', 50).filter((a) => a.type === 'gate').reverse();
  assert.equal(gates.length, 3);
  assert.deepEqual(gates[0].data, { idemKey: 'a', decision: 'send', reason: 'ok', kind: 'reply' });
  assert.deepEqual(gates[1].data, { idemKey: 'a', decision: 'drop', reason: 'duplicate-idem', kind: 'reply' });
  assert.equal(gates[2].data.leakCheck, 'skipped');
  assert.equal(gates[2].data.decision, 'send');
});

test('cửa không sửa text', async () => {
  const { gate, ch, msg } = setup();
  const text = '  Dạ  mã   8413  ';
  await gate.send(msg({ text }));
  assert.equal(ch.sent[0].text, text.trim()); // splitText chỉ trim, không đổi nội dung
});

// ---------- T010: sweep ----------
const WAITING_JOB = { chat_id: 'c1', session_key: 'c1', pack: 'hs', ma_luot: 'L1', result_tool: 't', status: 'waiting', next_poll_at: START, expires_at: START, created_at: START };
const LATE = '2026-11-04T16:30:00.000Z'; // 23:30 VN
const SEVEN = '2026-11-05T00:00:00.000Z'; // 07:00 VN 05/11

async function deferredAtNight() {
  const ctx = setup({ start: LATE });
  ctx.store.jobs.add(WAITING_JOB);
  const r = await ctx.gate.send(ctx.msg({ kind: 'job_result', text: 'Kết quả phân loại xong' }));
  assert.equal(r.status, 'deferred');
  return { ...ctx, r };
}

test('sweep: tin defer 07:00 không gửi lúc 06:59, gửi lúc 07:00', async () => {
  const { gate, ch, clock, store, r } = await deferredAtNight();
  clock.set('2026-11-04T23:59:00.000Z'); // 06:59 VN
  assert.equal(await gate.sweep(), 0);
  assert.equal(ch.sent.length, 0);
  clock.set(SEVEN);
  assert.equal(await gate.sweep(), 1);
  assert.equal(ch.sent.length, 1);
  const o = store.outbox.get(r.id);
  assert.equal(o.status, 'sent');
  assert.equal(o.decision, 'send');
  assert.equal(store.messages.recent('c1', 5).length, 1);
  assert.equal(await gate.sweep(), 0);
  assert.equal(ch.sent.length, 1);
});

test('sweep: phòng sang human trước 07:00 → rejected chat-human', async () => {
  const { gate, ch, clock, store, r } = await deferredAtNight();
  store.chats.setState('c1', 'human', 'nv', 'tiếp quản', LATE);
  clock.set(SEVEN);
  assert.equal(await gate.sweep(), 1);
  const o = store.outbox.get(r.id);
  assert.deepEqual([o.status, o.decision, o.reason], ['rejected', 'reject', 'chat-human']);
  assert.equal(ch.sent.length, 0);
  assert.equal(store.messages.recent('c1', 5).length, 0);
});

test('sweep: tin defer cap:chat có nợ → gửi đúng 07:00 hôm sau, một bước, không hoãn lần hai', async () => {
  const { gate, ch, clock, tickets, msg, store } = setup({ rules: { capChatDay: 1 } });
  store.jobs.add(WAITING_JOB); // có nợ việc nền → sáng hôm sau vẫn được gửi
  await gate.send(msg({ idemKey: 'a', text: 'alpha bravo charlie' }));
  const r = await gate.send(msg({ idemKey: 'b', text: 'delta echo foxtrot' }));
  assert.equal(r.reason, 'cap:chat');
  assert.equal(tickets.length, 1);
  clock.set('2026-11-04T23:59:00.000Z');
  assert.equal(await gate.sweep(), 0);
  clock.set(SEVEN);
  assert.equal(await gate.sweep(), 1);
  assert.equal(store.outbox.get(r.id).status, 'sent');
  assert.equal(ch.sent.length, 2);
  assert.equal(tickets.length, 1);
  assert.equal(store.audit.byChat('c1', 50).filter((x) => x.type === 'gate' && x.data.idemKey === 'b').length, 2); // 1 lúc hoãn + 1 lúc gửi
});

test('sweep sau lỗi → gửi tiếp phần 2 và 3, không gửi lại phần 1', async () => {
  const text = Array.from({ length: 3 }, (_, i) => `${i + 1}`.repeat(1500)).join('\n\n').slice(0, 4500);
  let fail = true;
  const ch = fakeChannel({ failOn: (_c, _t, n) => fail && n === 2 });
  const { gate, clock, store } = setup({ channel: ch });
  const r = await gate.send({ idemKey: 'k1', chatId: 'c1', turnId: 't1', kind: 'reply', text, inReplyToAt: START });
  assert.equal(r.status, 'failed');
  assert.equal(await gate.sweep(), 0); // chưa tới next_retry_at
  fail = false;
  clock.advance('1m');
  assert.equal(await gate.sweep(), 1);
  assert.equal(ch.sent.length, 3);
  assert.deepEqual(ch.sent.map((s) => s.text[0]), ['1', '2', '3']);
  assert.equal(new Set(ch.sent.map((s) => s.text)).size, 3);
  const o = store.outbox.get(r.id);
  assert.deepEqual([o.status, o.parts_sent], ['sent', 3]);
  assert.equal(store.messages.recent('c1', 5).length, 1);
});

test('sweep: 3 lần thử lại sau lỗi 1/2/3 ở +1, +5, +15 phút; lỗi thứ 4 thì dừng và onAlert đúng 1 lần', async () => {
  let calls = 0;
  const ch = { ...fakeChannel(), async sendText() { calls++; throw new Error('down'); } };
  const { gate, clock, store, alerts, msg } = setup({ channel: ch });
  const r = await gate.send(msg({ inReplyToAt: null, kind: 'ticket', chatId: 'staff' })); // tin miễn kiểm chủ động: giữ nguyên qua nhiều phút
  const o = () => store.outbox.get(r.id);
  const at = (min) => new Date(Date.parse(START) + min * 60_000).toISOString();
  assert.equal(calls, 1);
  assert.deepEqual([o().attempts, o().next_retry_at], [1, at(1)]);
  clock.set(at(0.98)); assert.equal(await gate.sweep(), 0);
  clock.set(at(1)); assert.equal(await gate.sweep(), 1);
  assert.deepEqual([calls, o().attempts, o().next_retry_at], [2, 2, at(6)]);
  clock.set(at(5.9)); assert.equal(await gate.sweep(), 0);
  clock.set(at(6)); assert.equal(await gate.sweep(), 1);
  assert.deepEqual([calls, o().attempts, o().next_retry_at], [3, 3, at(21)]);
  assert.equal(alerts.length, 0);
  clock.set(at(20.9)); assert.equal(await gate.sweep(), 0);
  clock.set(at(21)); assert.equal(await gate.sweep(), 1);
  assert.deepEqual([calls, o().attempts, o().status, o().next_retry_at], [4, 4, 'failed', null]);
  assert.deepEqual(alerts, [['staff', 'send-failed']]);
  clock.advance('1d');
  assert.equal(await gate.sweep(), 0);
  assert.equal(calls, 4);
  assert.equal(alerts.length, 1);
});

test('g: cap:all còn vướng khi quét → hoãn tiếp, KHÔNG báo lại mỗi lần quét', async () => {
  const { gate, clock, store, alerts, msg } = setup({ rules: { capAllDay: 1 } });
  store.jobs.add({ ...WAITING_JOB, chat_id: 'y', ma_luot: 'L2' });
  await gate.send(msg({ idemKey: 'a', chatId: 'x', text: 'alpha bravo charlie' }));
  const r = await gate.send(msg({ idemKey: 'b', chatId: 'y', text: 'delta echo foxtrot' }));
  assert.equal(r.reason, 'cap:all');
  assert.deepEqual(alerts, [['y', 'cap:all']]);
  clock.set(SEVEN);
  await gate.send(msg({ idemKey: 'z', chatId: 'x', text: 'golf hotel india', inReplyToAt: SEVEN })); // chiếm trần ngày mới
  await gate.sweep();
  await gate.sweep();
  assert.equal(store.outbox.get(r.id).status, 'deferred');
  assert.equal(store.outbox.get(r.id).not_before, '2026-11-06T00:00:00.000Z');
  assert.equal(alerts.length, 1);
});

test('sweep: chạy chồng → lần sau trả 0 ngay', async () => {
  const { gate, clock, ch, store, r } = await deferredAtNight();
  clock.set(SEVEN);
  const [a, b] = await Promise.all([gate.sweep(), gate.sweep()]);
  assert.deepEqual([a, b], [1, 0]);
  assert.equal(ch.sent.length, 1);
  assert.equal(store.outbox.get(r.id).status, 'sent');
  assert.equal(await gate.sweep(), 0);
});

// ---------- Fix round 1 (review B2) ----------
test('C-1 money: job_result ban đêm có số tiền không bằng chứng → 07:00 bị reject money:*, onTicket', async () => {
  const { store, clock, gate, ch, tickets } = setup({ start: LATE });
  store.jobs.add(WAITING_JOB);
  const r = await gate.send({ idemKey: 'a', chatId: 'c1', turnId: 't', kind: 'job_result', text: 'Thuế 12.345.000đ', pack: { id: 'hs', moneyCheck: true }, evidence: [] });
  assert.equal(r.status, 'deferred');
  clock.set(SEVEN);
  assert.equal(await gate.sweep(), 1);
  const o = store.outbox.get(r.id);
  assert.deepEqual([o.status, o.reason], ['rejected', 'money:12345000']);
  assert.equal(ch.sent.length, 0);
  assert.deepEqual(tickets, [['c1', 'money:12345000']]);
});

test('C-1 money: số tiền CÓ trong evidence → 07:00 vẫn gửi; ctx chỉ chứa số, không chứa chữ của khách', async () => {
  const { store, clock, gate, ch } = setup({ start: LATE });
  store.jobs.add(WAITING_JOB);
  const r = await gate.send({
    idemKey: 'a', chatId: 'c1', turnId: 't', kind: 'job_result', text: 'Thuế 12.345.000đ',
    pack: { id: 'hs', moneyCheck: true }, evidence: [{ tool: 'tra_thue', out: 'Khách Nguyễn Văn A 0912345678 thuế 12.345.000đ' }],
  });
  const raw = JSON.stringify(store.outbox.get(r.id).ctx);
  assert.ok(!raw.includes('Nguyễn') && !raw.includes('tra_thue'));
  assert.ok(store.outbox.get(r.id).ctx.evidenceNumbers.includes(12345000));
  clock.set(SEVEN);
  await gate.sweep();
  assert.equal(store.outbox.get(r.id).status, 'sent');
  assert.equal(ch.sent.length, 1);
});

test('C-1 proactive: reply bị cap:chat, khách im, không có nợ → sáng hôm sau rejected proactive-no-debt', async () => {
  const { gate, ch, clock, store, msg } = setup({ rules: { capChatDay: 1 } });
  await gate.send(msg({ idemKey: 'a', text: 'alpha bravo' }));
  const r = await gate.send(msg({ idemKey: 'b', text: 'delta echo' }));
  assert.equal(r.reason, 'cap:chat');
  clock.set(SEVEN);
  await gate.sweep();
  clock.advance('1d');
  await gate.sweep();
  const o = store.outbox.get(r.id);
  assert.deepEqual([o.status, o.reason], ['rejected', 'proactive-no-debt']);
  assert.equal(ch.sent.length, 1);
});

test('C-3 failed retry vào phòng đã sang human → rejected chat-human, không gửi', async () => {
  let fail = true;
  const ch = { ...fakeChannel(), sent: [], async sendText(c, t) { if (fail) throw new Error('down'); this.sent.push(t); } };
  const { store, clock, gate, msg } = setup({ channel: ch });
  const r = await gate.send(msg());
  store.chats.setState('c1', 'human', 'nv', 'x', START);
  fail = false;
  clock.advance('1m');
  await gate.sweep();
  const o = store.outbox.get(r.id);
  assert.deepEqual([o.status, o.reason], ['rejected', 'chat-human']);
  assert.equal(ch.sent.length, 0);
});

test('C-3 failed job_result thử lại trong giờ yên → hoãn tới 07:00', async () => {
  let fail = true;
  const ch = { ...fakeChannel(), sent: [], async sendText(c, t) { if (fail) throw new Error('down'); this.sent.push(t); } };
  const { store, clock, gate, msg } = setup({ channel: ch, start: '2026-11-04T15:58:00.000Z' }); // 22:58 VN
  store.jobs.add(WAITING_JOB);
  const r = await gate.send(msg({ kind: 'job_result' }));
  assert.equal(r.status, 'failed');
  fail = false;
  clock.advance('5m'); // 23:03
  await gate.sweep();
  const o = store.outbox.get(r.id);
  assert.deepEqual([o.status, o.reason, o.not_before], ['deferred', 'quiet-hours', SEVEN]);
  assert.equal(ch.sent.length, 0);
  clock.set(SEVEN);
  await gate.sweep();
  assert.equal(ch.sent.length, 1);
});

test('I-2 staff_relay thử lại vẫn ghi speaker_id', async () => {
  let fail = true;
  const ch = { ...fakeChannel(), async sendText() { if (fail) throw new Error('x'); } };
  const { store, clock, gate, msg } = setup({ channel: ch });
  await gate.send(msg({ idemKey: 's', kind: 'staff_relay', staffId: 'nv7', text: 'chào anh' }));
  fail = false;
  clock.advance('1m');
  await gate.sweep();
  assert.deepEqual(store.messages.recent('c1', 5).map((m) => [m.speaker, m.speaker_id]), [['nhan-vien', 'nv7']]);
});

test('M-1 text rỗng/khoảng trắng → rejected empty, không messages, không kênh', async () => {
  const { gate, ch, store, msg } = setup();
  const r = await gate.send(msg({ text: '   \n ' }));
  assert.deepEqual([r.decision, r.reason, r.status], ['reject', 'empty', 'rejected']);
  assert.equal(ch.sent.length, 0);
  assert.equal(store.messages.recent('c1', 5).length, 0);
});

test('C-2 recover(): queued bị bỏ lại sau sập → failed, sweep gửi tiếp phần thiếu, onAlert crash-mid-send', async () => {
  const text = Array.from({ length: 3 }, (_, i) => `${i + 1}`.repeat(1500)).join('\n\n').slice(0, 4500);
  const store = openStore();
  const clock = fakeClock(START);
  const hang = { ...fakeChannel(), sent: [], async sendText(c, t) { if (this.sent.length === 1) return new Promise(() => {}); this.sent.push(t); } };
  const g1 = createGate({ store, channel: hang, now: clock.now });
  g1.send({ idemKey: 'k1', chatId: 'c1', turnId: 't', kind: 'reply', text, inReplyToAt: START }); // "sập" giữa phần 2: không bao giờ xong
  await Promise.resolve();
  await new Promise((r) => setImmediate(r));
  assert.equal(store.outbox.get(1).status, 'queued');
  assert.equal(store.outbox.get(1).parts_sent, 1);
  // khởi động lại: cổng mới, cùng db
  const ch2 = fakeChannel();
  const alerts = [];
  const g2 = createGate({ store, channel: ch2, now: clock.now, onAlert: (c, r) => alerts.push([c, r]) });
  clock.advance('2m');
  assert.equal(await g2.sweep(), 0); // sweep KHÔNG tự nhặt dòng queued
  assert.equal(g2.recover(), 1);
  const o = store.outbox.get(1);
  assert.deepEqual([o.status, o.attempts, o.next_retry_at], ['failed', 0, clock.now().toISOString()]);
  assert.deepEqual(alerts, [['c1', 'crash-mid-send']]);
  assert.equal(await g2.sweep(), 1);
  assert.deepEqual(ch2.sent.map((x) => x.text[0]), ['2', '3']); // không gửi lại phần 1
  assert.equal(store.outbox.get(1).status, 'sent');
  assert.equal(store.messages.recent('c1', 5).length, 1);
});

test('C-2 recover(): có nợ việc nền → phần 2 và 3 được gửi, không gửi lại phần 1; không báo khi parts_sent = 0', async () => {
  const text = Array.from({ length: 3 }, (_, i) => `${i + 1}`.repeat(1500)).join('\n\n').slice(0, 4500);
  const { store, clock, ch, alerts, gate, msg } = setup();
  store.jobs.add(WAITING_JOB);
  store.outbox.insert({ idem_key: 'p1', chat_id: 'c1', kind: 'reply', text, decision: 'send', reason: 'ok', status: 'queued', parts_sent: 1, created_at: START, ctx: { inReplyToAt: START, debt: true } });
  store.outbox.insert({ idem_key: 'p0', chat_id: 'c2', kind: 'ticket', text: 'phiếu', decision: 'send', reason: 'ok', status: 'queued', parts_sent: 0, created_at: START });
  clock.advance('2m');
  assert.equal(gate.recover(), 2);
  assert.deepEqual(alerts, [['c1', 'crash-mid-send']]);
  assert.equal(await gate.sweep(), 2);
  assert.deepEqual(ch.sent.map((x) => x.text[0]), ['2', '3', 'p']);
  assert.equal(gate.recover(), 0);
  void msg;
});

test('R2: failed rồi quét lại bị reject proactive-no-debt → onTicket(chat, "send-failed") đúng 1 lần', async () => {
  const ch = { ...fakeChannel(), async sendText() { throw new Error('down'); } };
  const { gate, clock, store, tickets, msg } = setup({ channel: ch });
  const r = await gate.send(msg());
  assert.equal(r.status, 'failed');
  clock.advance('15m'); // quá 10 phút kể từ tin khách → tin chủ động, không có nợ
  assert.equal(await gate.sweep(), 1);
  assert.equal(store.outbox.get(r.id).reason, 'proactive-no-debt');
  assert.deepEqual(tickets, [['c1', 'send-failed']]);
  clock.advance('1d');
  await gate.sweep();
  assert.equal(tickets.length, 1);
});

test('R2: tin hoãn (chưa từng failed) bị reject proactive-no-debt → KHÔNG mở phiếu send-failed', async () => {
  const { gate, clock, tickets, msg } = setup({ rules: { capChatDay: 1 } });
  await gate.send(msg({ idemKey: 'a', text: 'alpha bravo' }));
  await gate.send(msg({ idemKey: 'b', text: 'delta echo' }));
  const before = tickets.length; // 1: cap:chat
  clock.set(SEVEN);
  await gate.sweep();
  assert.equal(tickets.length, before);
});

test('cửa sổ 60 giây qua cửa thật + store: 59 giây thì bỏ, 61 giây thì gửi', async () => {
  const { gate, ch, msg, clock } = setup();
  await gate.send(msg({ idemKey: 'a' }));
  clock.advance('59s');
  const r1 = await gate.send(msg({ idemKey: 'b' }));
  assert.equal(r1.decision, 'drop');
  assert.match(r1.reason, /^similar:/);
  clock.advance('2s'); // tổng 61 giây kể từ tin bot gửi trước
  const r2 = await gate.send(msg({ idemKey: 'c' }));
  assert.deepEqual([r2.decision, r2.reason], ['send', 'ok']);
  assert.equal(ch.sent.length, 2);
});
