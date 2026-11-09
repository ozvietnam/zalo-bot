import test from 'node:test';
import assert from 'node:assert/strict';
import { parse as parseZalo, parseUpdate } from '../../channels/zalo-bot.js';

test('T503: parseUpdate bổ sung isEcho: false và appId: null', () => {
  const raw = {
    event_name: 'message.text.received',
    message: {
      chat_id: 'c1',
      from: { id: 'u1', display_name: 'User 1' },
      text: 'xin chào',
      message_id: 'm1',
    },
  };
  const u = parseUpdate(raw);
  assert.ok(u);
  assert.equal(u.text, 'xin chào');
  assert.equal(u.chatId, 'c1');
  assert.equal(u.userId, 'u1');
  assert.equal(u.userName, 'User 1');
  assert.equal(u.messageId, 'm1');
  assert.equal(u.isEcho, false);
  assert.equal(u.appId, null);
});

test('T503: parse giữ nguyên cấu trúc Update và bổ sung isEcho: false, appId: null', () => {
  const raw = {
    event_name: 'message.text.received',
    message: {
      chat_id: 'c1',
      from: { id: 'u1' },
      text: 'alo',
    },
  };
  const u = parseZalo(raw);
  assert.ok(u);
  assert.equal(u.text, 'alo');
  assert.equal(u.isEcho, false);
  assert.equal(u.appId, null);
  assert.ok(u.updateKey);
  assert.deepEqual(u.raw, raw);
});

test('T503: parseUpdate trả về null khi đầu vào không hợp lệ', () => {
  assert.equal(parseUpdate(null), null);
  assert.equal(parseUpdate(undefined), null);
  assert.equal(parseUpdate('not-object'), null);
});
