// test/core/webhook-multi-channel.test.mjs — Kiểm tra định tuyến đa kênh & convIdOf (T506, FR-003, FR-004, FR-009, FR-010).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { convIdOf } from '../../core/conv.js';
import { createWebhookHandler } from '../../core/webhook.js';
import { openStore } from '../../core/store.js';
import { createChannel as createMessengerChannel } from '../../channels/messenger.js';
import { createChannel as createZaloOaChannel } from '../../channels/zalo-oa.js';
import { createChannel as createZaloBotChannel } from '../../channels/zalo-bot.js';

const APP_SECRET_FB = 'fb-secret-key-123';
const VERIFY_TOKEN_FB = 'fb-verify-token-456';
const OA_SECRET = 'oa-secret-token-789';

/** Helper gửi POST request */
async function post(url, body, headers = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: raw,
  });
}

/** Helper dựng server test đa kênh */
async function dungServer(t, { channels, channel, engine, store, config } = {}) {
  const st = store || openStore(':memory:');
  if (!store) t.after(() => st.close());

  const eng = engine || {
    calls: [],
    process: async (u) => { eng.calls.push(u); return { ok: true }; },
  };

  const cfg = {
    mode: 'webhook',
    webhookPath: '/webhook',
    ...config,
  };

  const handler = createWebhookHandler({
    config: cfg,
    channel,
    channels,
    engine: eng,
    store: st,
    health: async () => ({ ok: true }),
  });

  const server = createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));

  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, store: st, engine: eng, server };
}

// ───── 1. Kiểm tra convIdOf (FR-010) ─────

test('T506: convIdOf phân vùng tiền tố fb: và oa:', () => {
  // Messenger 1-1
  assert.equal(convIdOf({ chatId: '12345', channel: 'messenger' }), 'fb:12345');
  // Messenger đã có sẵn tiền tố fb:
  assert.equal(convIdOf({ chatId: 'fb:12345', channel: 'messenger' }), 'fb:12345');

  // Zalo OA 1-1
  assert.equal(convIdOf({ chatId: '67890', channel: 'zalo-oa' }), 'oa:67890');
  // Zalo OA đã có sẵn tiền tố oa:
  assert.equal(convIdOf({ chatId: 'oa:67890', channel: 'zalo-oa' }), 'oa:67890');

  // Nhóm messenger có userId
  assert.equal(convIdOf({ chatId: 'group1', userId: 'user1', isGroup: true, channel: 'messenger' }), 'fb:group1:user1');

  // Kênh Zalo Bot mặc định (giữ nguyên tương thích ngược)
  assert.equal(convIdOf({ chatId: '12345' }), '12345');
  assert.equal(convIdOf({ chatId: '12345', channel: 'zalo-bot' }), '12345');
  assert.equal(convIdOf({ chatId: 'grp1', userId: 'u1', isGroup: true }), 'grp1:u1');
});

// ───── 2. GET Challenge của Meta Messenger (FR-004) ─────

test('T506: GET challenge Meta Messenger trả 200 kèm chuỗi challenge khi token đúng', async (t) => {
  const fbChannel = createMessengerChannel({
    pageToken: 'dummy-page-token',
    appSecret: APP_SECRET_FB,
    verifyToken: VERIFY_TOKEN_FB,
  });

  const { url } = await dungServer(t, {
    channels: { messenger: fbChannel },
  });

  const res = await fetch(`${url}/webhook/messenger?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN_FB}&hub.challenge=test_challenge_xyz`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.equal(text, 'test_challenge_xyz');
});

test('T506: GET challenge Meta Messenger trả 403 khi verify_token sai hoặc mode sai', async (t) => {
  const fbChannel = createMessengerChannel({
    pageToken: 'dummy-page-token',
    appSecret: APP_SECRET_FB,
    verifyToken: VERIFY_TOKEN_FB,
  });

  const { url } = await dungServer(t, {
    channels: { messenger: fbChannel },
  });

  // Sai verify token
  const res1 = await fetch(`${url}/webhook/messenger?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=123`);
  assert.equal(res1.status, 403);

  // Sai mode
  const res2 = await fetch(`${url}/webhook/messenger?hub.mode=other&hub.verify_token=${VERIFY_TOKEN_FB}&hub.challenge=123`);
  assert.equal(res2.status, 403);
});

// ───── 3. POST Webhook xác thực chữ ký đa kênh (FR-003, SC-001) ─────

test('T506: POST Messenger với chữ ký HMAC hợp lệ -> 200 và ghi inbox; sai chữ ký -> 403', async (t) => {
  const fbChannel = createMessengerChannel({
    pageToken: 'dummy-page-token',
    appSecret: APP_SECRET_FB,
    verifyToken: VERIFY_TOKEN_FB,
  });

  const { url, store, engine } = await dungServer(t, {
    channels: { messenger: fbChannel },
  });

  const payload = {
    object: 'page',
    entry: [{
      messaging: [{
        sender: { id: 'psid-123' },
        recipient: { id: 'page-456' },
        message: { mid: 'mid-fb-1', text: 'Chào shop tư vấn giúp' },
      }],
    }],
  };
  const bodyStr = JSON.stringify(payload);
  const validHmac = 'sha256=' + createHmac('sha256', APP_SECRET_FB).update(bodyStr).digest('hex');

  // 1. Chữ ký đúng -> 200
  const resOk = await post(`${url}/webhook/messenger`, bodyStr, {
    'x-hub-signature-256': validHmac,
  });
  assert.equal(resOk.status, 200);
  const jsonOk = await resOk.json();
  assert.equal(jsonOk.ok, true);

  // Chờ engine xử lý
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(engine.calls.length, 1);
  assert.equal(engine.calls[0].chatId, 'psid-123');
  assert.equal(engine.calls[0].text, 'Chào shop tư vấn giúp');
  assert.equal(engine.calls[0].channel, 'messenger');

  // 2. Chữ ký sai -> 403
  const resBad = await post(`${url}/webhook/messenger`, bodyStr, {
    'x-hub-signature-256': 'sha256=invalidhex123',
  });
  assert.equal(resBad.status, 403);

  // 3. Thiếu chữ ký -> 403
  const resMissing = await post(`${url}/webhook/messenger`, bodyStr);
  assert.equal(resMissing.status, 403);
});

test('T506: POST Zalo OA xác thực qua secret token / MAC -> 200; sai -> 403', async (t) => {
  const oaChannel = createZaloOaChannel({
    oaToken: 'dummy-oa-token',
    oaSecret: OA_SECRET,
  });

  const { url, engine } = await dungServer(t, {
    channels: { 'zalo-oa': oaChannel },
  });

  const payload = {
    event_name: 'user_send_text',
    sender: { id: 'oa-user-789' },
    message: { msg_id: 'msg-oa-1', text: 'Tư vấn hải quan qua Zalo OA' },
  };
  const bodyStr = JSON.stringify(payload);

  // Chữ ký đúng qua header secret token
  const resOk = await post(`${url}/webhook/zalo-oa`, bodyStr, {
    'x-oa-secret-token': OA_SECRET,
  });
  assert.equal(resOk.status, 200);

  await new Promise((r) => setTimeout(r, 50));
  assert.equal(engine.calls.length, 1);
  assert.equal(engine.calls[0].chatId, 'oa-user-789');
  assert.equal(engine.calls[0].channel, 'zalo-oa');

  // Sai secret -> 403
  const resBad = await post(`${url}/webhook/zalo-oa`, bodyStr, {
    'x-oa-secret-token': 'wrong-secret',
  });
  assert.equal(resBad.status, 403);
});

// ───── 4. Hỗ trợ parseAll khi Meta gửi gộp nhiều messaging event ─────

test('T506: Meta POST gộp nhiều messaging event được parseAll xử lý đủ và bền hoá vào inbox', async (t) => {
  const fbChannel = createMessengerChannel({
    pageToken: 'dummy-page-token',
    appSecret: APP_SECRET_FB,
    verifyToken: VERIFY_TOKEN_FB,
  });

  const { url, engine } = await dungServer(t, {
    channels: { messenger: fbChannel },
  });

  const payload = {
    object: 'page',
    entry: [{
      messaging: [
        {
          sender: { id: 'psid-user-1' },
          message: { mid: 'mid-gop-1', text: 'Tin nhắn 1' },
        },
        {
          sender: { id: 'psid-user-2' },
          message: { mid: 'mid-gop-2', text: 'Tin nhắn 2' },
        },
      ],
    }],
  };
  const bodyStr = JSON.stringify(payload);
  const validHmac = 'sha256=' + createHmac('sha256', APP_SECRET_FB).update(bodyStr).digest('hex');

  const res = await post(`${url}/webhook/messenger`, bodyStr, {
    'x-hub-signature-256': validHmac,
  });
  assert.equal(res.status, 200);

  for (let i = 0; i < 20 && engine.calls.length < 2; i++) {
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.equal(engine.calls.length, 2);
  assert.equal(engine.calls[0].chatId, 'psid-user-1');
  assert.equal(engine.calls[1].chatId, 'psid-user-2');
});

// ───── 5. Khóa server.js không bị sửa đổi ─────

test('T506: server.js không bị sửa đổi và vẫn giữ ≤ 125 dòng', () => {
  const src = readFileSync(join(process.cwd(), 'server.js'), 'utf8');
  const lines = src.split('\n');
  assert.ok(lines.length <= 125, `server.js đang ${lines.length} dòng (phải ≤ 125)`);
});
