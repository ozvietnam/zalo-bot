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
  assert.equal(store.outbox.get(r.id).not_before, '2026-11-04T17:00:00.000Z'); // 00:00 VN 05/11
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

test('tin giống tin vừa gửi (15 phút) → drop similar', async () => {
  const { gate, ch, msg, clock } = setup();
  await gate.send(msg({ idemKey: 'a', text: 'Dạ mã HS là 8413.70.90 thuế 10%' }));
  clock.advance('5m');
  const r = await gate.send(msg({ idemKey: 'b', text: 'Dạ mã HS là 8413.70.90 thuế 10%', inReplyToAt: clock.now().toISOString() }));
  assert.equal(r.decision, 'drop');
  assert.match(r.reason, /^similar:/);
  assert.equal(ch.sent.length, 1);
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

test('sweep: tin defer cap:chat gửi sau khi sang ngày mới (qua giờ yên)', async () => {
  const { gate, ch, clock, tickets, msg, store } = setup({ rules: { capChatDay: 1 } });
  await gate.send(msg({ idemKey: 'a', text: 'alpha bravo charlie' }));
  const r = await gate.send(msg({ idemKey: 'b', text: 'delta echo foxtrot' }));
  assert.equal(r.reason, 'cap:chat');
  assert.equal(tickets.length, 1);
  clock.set('2026-11-04T17:00:00.000Z'); // 00:00 VN: quá not_before nhưng còn giờ yên → hoãn tiếp tới 07:00
  assert.equal(await gate.sweep(), 1);
  assert.equal(store.outbox.get(r.id).status, 'deferred');
  assert.equal(store.outbox.get(r.id).not_before, SEVEN);
  assert.equal(ch.sent.length, 1);
  clock.set(SEVEN);
  assert.equal(await gate.sweep(), 1);
  assert.equal(ch.sent.length, 2);
  assert.equal(store.outbox.get(r.id).status, 'sent');
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

test('sweep: failed thử lại sau 1, 5, 15 phút rồi dừng ở attempts=3, onAlert 1 lần', async () => {
  let calls = 0;
  const ch = { ...fakeChannel(), async sendText() { calls++; throw new Error('down'); } };
  const { gate, clock, store, alerts, msg } = setup({ channel: ch });
  const r = await gate.send(msg());
  const o = () => store.outbox.get(r.id);
  assert.equal(calls, 1);
  assert.equal(o().attempts, 1);
  clock.advance('59s');
  assert.equal(await gate.sweep(), 0);
  clock.advance('1s'); // +1 phút
  assert.equal(await gate.sweep(), 1);
  assert.equal(calls, 2);
  assert.equal(o().attempts, 2);
  assert.equal(o().next_retry_at, new Date(clock.now().getTime() + 5 * 60_000).toISOString());
  clock.advance('4m');
  assert.equal(await gate.sweep(), 0);
  clock.advance('1m');
  assert.equal(await gate.sweep(), 1);
  assert.equal(calls, 3);
  assert.equal(o().attempts, 3);
  assert.equal(o().status, 'failed');
  assert.deepEqual(alerts, [['c1', 'send-failed']]);
  clock.advance('1d');
  assert.equal(await gate.sweep(), 0);
  assert.equal(calls, 3);
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
