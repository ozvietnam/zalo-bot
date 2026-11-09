// test/core/gate-voice.test.mjs — kiểm thử gửi tin thoại qua cửa duy nhất gate.send (issue #125)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { fakeChannel, fakeClock } from '../helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z'; // 10:00 VN

function setup({ channel, rules = {}, start = START } = {}) {
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
  return { store, clock, ch, gate, alerts, tickets };
}

test('gate.send gửi tin thoại qua channel.sendVoice và ghi messages', async () => {
  const { gate, ch, store } = setup();
  const voiceUrl = 'https://zalo-bot.uythacnhapkhau.com/am-thanh/1234567890abcdef.aac';
  const text = 'Mã HS tám bốn một ba, thuế suất mười phần trăm';

  const r = await gate.send({
    idemKey: 'v1', chatId: 'c1', convId: 'c1', kind: 'voice',
    text, voiceUrl, inReplyToAt: START,
  });

  assert.equal(r.decision, 'send');
  assert.equal(r.status, 'sent');
  assert.equal(ch.voices.length, 1);
  assert.deepEqual(ch.voices[0], { chatId: 'c1', voiceUrl });

  // Kiểm tra lưu vào messages
  const msgs = store.messages.recent('c1', 5);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0].text, /\[thoại\]/);
  assert.match(msgs[0].text, /1234567890abcdef\.aac/);
});

test('gate.send tin thoại: phòng human thì reject chat-human, bot im hoàn toàn', async () => {
  const { gate, ch, store } = setup();
  store.convs.setState('c1', 'c1', 'human', 'nv', 'khach xin nguoi', START);

  const r = await gate.send({
    idemKey: 'v2', chatId: 'c1', convId: 'c1', kind: 'voice',
    text: 'câu đọc', voiceUrl: 'https://zalo-bot.uythacnhapkhau.com/am-thanh/abc.aac',
    inReplyToAt: START,
  });

  assert.equal(r.decision, 'reject');
  assert.equal(r.reason, 'chat-human');
  assert.equal(ch.voices.length, 0);
});

test('gate.send tin thoại chủ động trong giờ yên thì defer quiet-hours', async () => {
  // 01:00 VN (18:00 UTC hôm trước) là trong giờ yên (23:00 - 07:00 VN)
  const NIGHT = '2026-11-04T18:00:00.000Z';
  const { gate, ch } = setup({ start: NIGHT });

  const r = await gate.send({
    idemKey: 'v3', chatId: 'c1', convId: 'c1', kind: 'voice',
    text: 'thông báo đêm', voiceUrl: 'https://zalo-bot.uythacnhapkhau.com/am-thanh/abc.aac',
    // Tin chủ động: không có inReplyToAt hoặc cũ
  });

  // Không có việc nền nợ -> proactive-no-debt; nếu có nợ -> defer quiet-hours
  assert.ok(r.decision === 'reject' || r.decision === 'defer');
  assert.equal(ch.voices.length, 0);
});

test('gate.send tin thoại: áp trần capVoiceDay thì defer cap:voice', async () => {
  const { gate, ch } = setup({ rules: { capVoiceDay: 1 } });
  const voiceUrl = 'https://zalo-bot.uythacnhapkhau.com/am-thanh/abc.aac';

  // Lần 1: trong hạn mức (0 < 1)
  const r1 = await gate.send({
    idemKey: 'v4', chatId: 'c1', convId: 'c1', kind: 'voice',
    text: 'câu 1', voiceUrl, inReplyToAt: START,
  });
  assert.equal(r1.decision, 'send');
  assert.equal(ch.voices.length, 1);

  // Lần 2: vượt trần ngày của voice (đã gửi 1 >= 1)
  const r2 = await gate.send({
    idemKey: 'v5', chatId: 'c1', convId: 'c1', kind: 'voice',
    text: 'câu 2', voiceUrl, inReplyToAt: START,
  });
  assert.equal(r2.decision, 'defer');
  assert.equal(r2.reason, 'cap:voice');
  assert.equal(ch.voices.length, 1);
});
