import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChannel } from '../../channels/zalo-bot.js';

const IMG = { result: { event_name: 'message.image.received', message: { chat: { id: 1 }, photo_url: 'u' } } };

function fake(reply = { ok: true, result: {} }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => reply };
  };
  return { calls, fetchImpl };
}

test('parse: updateKey = sha1 ổn định khi không có message_id', () => {
  const ch = createChannel({ token: 't', secret: 's' });
  const a = ch.parse(IMG);
  const b = ch.parse(JSON.parse(JSON.stringify(IMG)));
  assert.match(a.updateKey, /^[0-9a-f]{40}$/);
  assert.equal(a.updateKey, b.updateKey);
  assert.deepEqual(a.raw, IMG);
});

test('parse: có message_id thì updateKey = message_id', () => {
  const ch = createChannel({ token: 't', secret: 's' });
  const u = ch.parse({ result: { event_name: 'message.text.received', message: { chat: { id: 1 }, text: 'hi', message_id: 9 } } });
  assert.equal(u.updateKey, '9');
  assert.equal(u.messageId, '9');
  assert.equal(ch.parse(null), null);
});

test('verifyWebhook: đúng/sai/secret rỗng', () => {
  const ch = createChannel({ token: 't', secret: 's' });
  assert.equal(ch.verifyWebhook({ headers: { 'x-bot-api-secret-token': 's' } }), true);
  assert.equal(ch.verifyWebhook({ headers: { 'x-bot-api-secret-token': 'x' } }), false);
  assert.equal(ch.verifyWebhook({ headers: {} }), false);
  const open = createChannel({ token: 't', secret: '' });
  assert.equal(open.verifyWebhook({ headers: { 'x-bot-api-secret-token': '' } }), false);
});

test('sendText: một lần POST tới <base>/bot<token>/sendMessage, không chia', async () => {
  const { calls, fetchImpl } = fake();
  const ch = createChannel({ token: 'TOK', baseUrl: 'https://api.test/', fetchImpl, secret: 's' });
  const long = 'a'.repeat(5000);
  await ch.sendText('42', long);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.test/botTOK/sendMessage');
  assert.deepEqual(calls[0].body, { chat_id: '42', text: long });
});

test('typing: gọi sendChatAction và nuốt lỗi', async () => {
  const { calls, fetchImpl } = fake();
  const ch = createChannel({ token: 'TOK', baseUrl: 'https://api.test', fetchImpl, secret: 's' });
  await ch.typing('42');
  assert.equal(calls[0].url, 'https://api.test/botTOK/sendChatAction');
  assert.equal(calls[0].body.action, 'typing');
  const bad = createChannel({ token: 'TOK', fetchImpl: async () => { throw new Error('x'); }, secret: 's' });
  await bad.typing('42');
});

test('hợp đồng: name, maxText, capabilities, getMe, lỗi không chứa token', async () => {
  const { fetchImpl } = fake({ ok: true, result: { id: '1', name: 'bot' } });
  const ch = createChannel({ token: 'SECRETTOK', fetchImpl, secret: 's' });
  assert.equal(ch.name, 'zalo-bot');
  assert.equal(ch.maxText, 2000);
  assert.deepEqual(ch.capabilities, { detectsHumanReplies: false });
  assert.deepEqual(await ch.getMe(), { id: '1', name: 'bot' });
  const err = createChannel({ token: 'SECRETTOK', secret: 's', fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({ description: 'boom' }) }) });
  await assert.rejects(() => err.sendText('1', 'x'), (e) => e.status === 500 && !e.message.includes('SECRETTOK'));
  assert.throws(() => createChannel({ secret: 's' }), /ZALO_BOT_TOKEN/);
});
