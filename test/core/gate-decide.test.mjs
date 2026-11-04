import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../../core/gate.js';

const NOW = '2026-11-04T03:00:00.000Z'; // 10:00 VN
const base = { kind: 'reply', text: 'Dạ mã 8413.70.90', inReplyToAt: NOW };
const baseFacts = {
  chatState: 'bot', idemExists: false, hasOpenJob: false,
  recentBotTexts: [], sentTodayChat: 0, sentTodayAll: 0, now: NOW,
};
const run = (f = {}, m = {}, r) => decide({ ...base, ...m }, { ...baseFacts, ...f }, r);

test('1 duplicate-idem -> drop (mọi kind)', () => {
  assert.deepEqual(run({ idemExists: true }), { decision: 'drop', reason: 'duplicate-idem' });
  assert.equal(run({ idemExists: true }, { kind: 'staff_relay' }).reason, 'duplicate-idem');
});

test('2 chat-human / chat-blocked -> reject; staff_relay/ticket/digest vẫn qua', () => {
  assert.deepEqual(run({ chatState: 'human' }), { decision: 'reject', reason: 'chat-human' });
  assert.deepEqual(run({ chatState: 'blocked' }), { decision: 'reject', reason: 'chat-blocked' });
  for (const kind of ['staff_relay', 'ticket', 'digest']) {
    assert.equal(run({ chatState: 'human' }, { kind }).decision, 'send');
  }
});

test('3a job_result không nợ -> proactive-no-debt', () => {
  assert.deepEqual(run({}, { kind: 'job_result' }), { decision: 'reject', reason: 'proactive-no-debt' });
});

test('3a notice cũ 2 giờ không nợ -> proactive-no-debt; thiếu inReplyToAt cũng là chủ động', () => {
  const old = '2026-11-04T01:00:00.000Z';
  assert.equal(run({}, { kind: 'notice', inReplyToAt: old }).reason, 'proactive-no-debt');
  assert.equal(run({}, { inReplyToAt: undefined }).reason, 'proactive-no-debt');
});

test('3b giờ yên -> defer tới 07:00 VN', () => {
  const r = run({ hasOpenJob: true, now: '2026-11-04T16:30:00Z' }, { kind: 'job_result' });
  assert.deepEqual(r, { decision: 'defer', reason: 'quiet-hours', notBefore: '2026-11-05T00:00:00.000Z' });
});

test('3b trả lời trực tiếp trong giờ yên vẫn gửi', () => {
  const r = run({ now: '2026-11-04T16:30:00Z' }, { kind: 'reply', inReplyToAt: '2026-11-04T16:28:00Z' });
  assert.equal(r.decision, 'send');
});

test('4 cap:chat', () => {
  assert.deepEqual(run({ sentTodayChat: 8 }), { decision: 'defer', reason: 'cap:chat' });
  assert.equal(run({ sentTodayChat: 7 }).decision, 'send');
  assert.equal(run({ sentTodayChat: 99 }, { kind: 'ticket' }).decision, 'send');
});

test('5 cap:all', () => {
  assert.deepEqual(run({ sentTodayAll: 300 }), { decision: 'defer', reason: 'cap:all' });
});

test('6 similar:<điểm>', () => {
  const r = run({ recentBotTexts: ['Dạ mã 8413.70.90 ạ'] });
  assert.equal(r.decision, 'drop');
  assert.match(r.reason, /^similar:\d\.\d\d$/);
});

test('7 leak', () => {
  assert.deepEqual(run({}, { text: 'xem /home/oz/a.log' }), { decision: 'reject', reason: 'leak:path' });
  assert.equal(run({}, { text: 'xem /home/oz/a.log', kind: 'ticket' }).reason, 'leak:path');
});

test('7 staff_relay không kiểm leak', () => {
  assert.equal(run({}, { kind: 'staff_relay', text: 'xem /home/oz/a.log' }).decision, 'send');
});

test('7 bannedPatterns từ rules', () => {
  const r = run({}, { text: 'liên hệ nội bộ XYZ' }, { bannedPatterns: [/XYZ/] });
  assert.equal(r.reason, 'leak:banned');
});

test('6 đứng trước 7 (thứ tự bảng)', () => {
  const text = 'xem /home/oz/a.log';
  assert.match(run({ recentBotTexts: [text] }, { text }).reason, /^similar:/);
});

test('8 money không có trong evidence -> reject', () => {
  const m = { text: 'Cước 27.000đ/kg', pack: { moneyCheck: true }, evidence: [{ donGia: 25650 }] };
  assert.deepEqual(run({}, m), { decision: 'reject', reason: 'money:27000' });
});

test('8 money có trong evidence -> send; chuỗi số và lồng sâu', () => {
  const m = { text: 'Cước 25.650đ/kg', pack: { moneyCheck: true }, evidence: [{ donGia: 25650 }] };
  assert.equal(run({}, m).decision, 'send');
  assert.equal(run({}, { ...m, evidence: [{ a: { b: ['25.650'] } }] }).decision, 'send');
  assert.equal(run({}, { ...m, evidence: ['giá 25,650 đ'] }).decision, 'send');
});

test('8 chỉ chạy khi moneyCheck', () => {
  assert.equal(run({}, { text: 'Cước 27.000đ/kg', evidence: [] }).decision, 'send');
});

test('staff_relay/ticket/digest bỏ qua dòng 2-6 và 8', () => {
  const m = { kind: 'digest', text: 'Cước 27.000đ', pack: { moneyCheck: true }, inReplyToAt: undefined };
  assert.deepEqual(run({ sentTodayChat: 50, sentTodayAll: 999, recentBotTexts: ['Cước 27.000đ'] }, m), { decision: 'send', reason: 'ok' });
});

test('ok mặc định, rules mặc định khi bỏ qua', () => {
  assert.deepEqual(run(), { decision: 'send', reason: 'ok' });
});

test('rules tuỳ chỉnh: capChatDay, directReplyMs', () => {
  assert.equal(run({ sentTodayChat: 2 }, {}, { capChatDay: 2 }).reason, 'cap:chat');
  const old = '2026-11-04T02:55:00.000Z'; // 5 phút trước
  assert.equal(run({}, { inReplyToAt: old }, { directReplyMs: 60_000 }).reason, 'proactive-no-debt');
});

test('thời gian: facts.now thiếu thì dùng msg.now, Date được chấp nhận; không có thì throw', () => {
  assert.equal(decide({ ...base, now: NOW }, { ...baseFacts, now: undefined }).decision, 'send');
  assert.equal(run({ now: new Date(NOW) }).decision, 'send');
  assert.throws(() => decide(base, { ...baseFacts, now: undefined }));
});
