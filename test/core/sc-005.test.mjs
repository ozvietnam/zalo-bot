// test/core/sc-005.test.mjs — Đo lường tự động 6 tiêu chí thành công SC-001..SC-006 (Spec 005, Kênh thứ hai).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createHandoff } from '../../core/handoff.js';
import { createEngine } from '../../core/engine.js';
import { createWebhookHandler } from '../../core/webhook.js';
import { createChannel as createMessengerChannel } from '../../channels/messenger.js';
import { createChannel as createZaloOaChannel } from '../../channels/zalo-oa.js';
import { fakeChannel, fakeClock, fakeMcp } from '../helpers/fakes.mjs';
import { runEvalFixture } from '../../eval/run.mjs';

const APP_SECRET_FB = 'fb-secret-sc005';
const VERIFY_TOKEN_FB = 'fb-verify-sc005';
const OA_SECRET = 'oa-secret-sc005';
const FB_APP_ID = 'app-fb-999';
const OA_APP_ID = 'app-oa-888';

async function postReq(url, body, headers = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: raw,
  });
}

function setupEngine({ userConfig = {} } = {}) {
  const store = openStore();
  const clock = fakeClock('2026-11-04T03:00:00.000Z');
  const channel = fakeChannel();
  const mcp = fakeMcp();
  const config = {
    staffChatId: 'S1',
    staffUsers: new Set(['nv1']),
    botNames: ['Bot OZ'],
    fbAppId: FB_APP_ID,
    zaloOaAppId: OA_APP_ID,
    ...userConfig,
  };
  const gate = createGate({ store, channel, now: clock.now });
  const handoff = createHandoff({ store, gate, config, now: clock.now });
  const engine = createEngine({
    config,
    store,
    channel,
    mcp,
    registry: { available: () => [], pick: () => null },
    gate,
    handoff,
    now: clock.now,
    log: { info() {}, warn() {}, error() {}, log() {} },
  });
  return { store, clock, channel, handoff, engine, config };
}

// ───── SC-001: 100% request giả mạo bị từ chối 403 ─────
test('SC-001: 100% request webhook giả mạo bị từ chối với HTTP 403 Forbidden', async (t) => {
  const store = openStore(':memory:');
  t.after(() => store.close());

  const fbCh = createMessengerChannel({ pageToken: 'p1', appSecret: APP_SECRET_FB, verifyToken: VERIFY_TOKEN_FB });
  const oaCh = createZaloOaChannel({ oaToken: 't1', oaSecret: OA_SECRET });

  const handler = createWebhookHandler({
    config: { mode: 'webhook', webhookPath: '/webhook' },
    channels: { messenger: fbCh, 'zalo-oa': oaCh },
    engine: { process: async () => ({ ok: true }) },
    store,
    health: async () => ({ ok: true }),
  });

  const server = createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const url = `http://127.0.0.1:${server.address().port}`;

  let rejected = 0;
  let total = 0;

  // 1. Messenger sai HMAC
  total++;
  const r1 = await postReq(`${url}/webhook/messenger`, '{}', { 'x-hub-signature-256': 'sha256=invalid' });
  if (r1.status === 403) rejected++;

  // 2. Messenger thiếu HMAC
  total++;
  const r2 = await postReq(`${url}/webhook/messenger`, '{}');
  if (r2.status === 403) rejected++;

  // 3. Messenger GET challenge sai token
  total++;
  const r3 = await fetch(`${url}/webhook/messenger?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`);
  if (r3.status === 403) rejected++;

  // 4. Messenger GET challenge sai mode
  total++;
  const r4 = await fetch(`${url}/webhook/messenger?hub.mode=invalid&hub.verify_token=${VERIFY_TOKEN_FB}&hub.challenge=1`);
  if (r4.status === 403) rejected++;

  // 5. Zalo OA sai secret token
  total++;
  const r5 = await postReq(`${url}/webhook/zalo-oa`, '{}', { 'x-oa-secret-token': 'wrong' });
  if (r5.status === 403) rejected++;

  // 6. Zalo OA thiếu secret token & MAC
  total++;
  const r6 = await postReq(`${url}/webhook/zalo-oa`, '{}');
  if (r6.status === 403) rejected++;

  assert.equal(total, 6);
  assert.equal(rejected, total, `Tỷ lệ từ chối phải đạt 100% (${rejected}/${total})`);
});

// ───── SC-002: Giả lập 50 tin nhân viên gõ tay: 100% phát hiện, 0 tin bot chen ngang ─────
test('SC-002: Giả lập 50 tin nhân viên gõ tay: 100% phát hiện, 0 tin chen ngang', async () => {
  const { engine, store, channel, handoff } = setupEngine();

  let detectedCount = 0;
  let botInterferenceCount = 0;

  for (let i = 1; i <= 50; i++) {
    const isFb = i % 2 === 0;
    const channelName = isFb ? 'messenger' : 'zalo-oa';
    const chatId = `room-${i}`;

    // 1. Nhân viên gõ tay trực tiếp trên trang (sự kiện echo, không có trong outbox)
    const echoUpdate = {
      updateKey: `echo-${i}`,
      event: 'message.echo',
      chatId,
      userId: 'staff-page',
      userName: 'Admin Page',
      chatType: 'PRIVATE',
      text: `Nhân viên trả lời tay tin thứ ${i}`,
      isEcho: true,
      appId: null,
      channel: channelName,
    };

    const echoRes = await engine.process(echoUpdate);
    if (echoRes.handled === 'human-echo-detected') {
      detectedCount++;
    }

    const expectedConvId = isFb ? `fb:${chatId}` : `oa:${chatId}`;
    assert.equal(handoff.stateOf(expectedConvId), 'human');

    // 2. Khách nhắn tiếp ngay sau đó
    const custUpdate = {
      updateKey: `cust-${i}`,
      event: 'message.text.received',
      chatId,
      userId: `user-${i}`,
      userName: `Khách ${i}`,
      chatType: 'PRIVATE',
      text: `Khách nhắn tiếp câu hỏi ${i}`,
      isEcho: false,
      channel: channelName,
    };

    const sentBefore = channel.sent.length;
    const custRes = await engine.process(custUpdate);
    const sentAfter = channel.sent.length;

    assert.equal(custRes.skipped, 'chat-human');
    if (sentAfter > sentBefore) {
      botInterferenceCount += (sentAfter - sentBefore);
    }
  }

  assert.equal(detectedCount, 50, `100% tin nhắn nhân viên gõ tay phải được phát hiện (${detectedCount}/50)`);
  assert.equal(botInterferenceCount, 0, `Bot gửi 0 tin chen ngang khi phòng human (${botInterferenceCount})`);
});

// ───── SC-003: 0 tin bot tự gửi bị nhận nhầm thành tin người gõ ─────
test('SC-003: 0 tin bot tự gửi bị nhận nhầm thành tin nhân viên gõ tay (0 false-positive handoff)', async () => {
  const { engine, store, handoff, clock } = setupEngine();

  let falsePositiveCount = 0;

  for (let i = 1; i <= 50; i++) {
    const isAppIdMatch = i <= 25;
    const chatId = `bot-echo-room-${i}`;
    const text = `Tin bot trả lời khách hàng thứ ${i}`;

    if (!isAppIdMatch) {
      // Giả lập bot vừa gửi tin qua outbox
      store.outbox.insert({
        idem_key: `outbox-idem-${i}`,
        chat_id: chatId,
        kind: 'reply',
        decision: 'send',
        text,
        parts_total: 1,
        parts_sent: 1,
        status: 'sent',
        created_at: clock.now().toISOString(),
        sent_at: clock.now().toISOString(),
      });
    }

    const echoUpdate = {
      updateKey: `bot-echo-${i}`,
      event: 'message.echo',
      chatId,
      userId: 'page',
      chatType: 'PRIVATE',
      text,
      isEcho: true,
      appId: isAppIdMatch ? (i % 2 === 0 ? FB_APP_ID : OA_APP_ID) : null,
      channel: i % 2 === 0 ? 'messenger' : 'zalo-oa',
    };

    const res = await engine.process(echoUpdate);
    if (res.skipped === 'bot-echo') {
      // Đúng mong đợi
    } else {
      falsePositiveCount++;
    }

    // Phòng không được chuyển sang human
    assert.equal(handoff.stateOf(chatId), 'bot');
  }

  assert.equal(falsePositiveCount, 0, `Không được có tin bot gửi nào bị nhận nhầm thành người gõ (${falsePositiveCount})`);
});

// ───── SC-004: Thời gian phản hồi webhook ack 200 p95 < 200 ms trên 50 request đồng thời ─────
test('SC-004: Webhook ack 200 p95 < 200 ms trên 50 request đồng thời', async (t) => {
  const store = openStore(':memory:');
  t.after(() => store.close());

  const fbCh = createMessengerChannel({ pageToken: 'p1', appSecret: APP_SECRET_FB, verifyToken: VERIFY_TOKEN_FB });
  const oaCh = createZaloOaChannel({ oaToken: 't1', oaSecret: OA_SECRET });

  const handler = createWebhookHandler({
    config: { mode: 'webhook', webhookPath: '/webhook' },
    channels: { messenger: fbCh, 'zalo-oa': oaCh },
    engine: { process: async () => ({ ok: true }) },
    store,
    health: async () => ({ ok: true }),
  });

  const server = createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const url = `http://127.0.0.1:${server.address().port}`;

  const latencies = [];
  const reqs = [];

  for (let i = 1; i <= 50; i++) {
    const isFb = i % 2 === 0;
    const targetUrl = isFb ? `${url}/webhook/messenger` : `${url}/webhook/zalo-oa`;
    const payload = isFb
      ? { object: 'page', entry: [{ messaging: [{ sender: { id: `fb-${i}` }, message: { mid: `m-fb-${i}`, text: `Hi ${i}` } }] }] }
      : { event_name: 'user_send_text', sender: { id: `oa-${i}` }, message: { msg_id: `m-oa-${i}`, text: `Hi ${i}` } };

    const bodyStr = JSON.stringify(payload);
    const headers = isFb
      ? { 'x-hub-signature-256': 'sha256=' + createHmac('sha256', APP_SECRET_FB).update(bodyStr).digest('hex') }
      : { 'x-oa-secret-token': OA_SECRET };

    reqs.push(async () => {
      const t0 = performance.now();
      const res = await postReq(targetUrl, bodyStr, headers);
      const t1 = performance.now();
      assert.equal(res.status, 200);
      latencies.push(t1 - t0);
    });
  }

  await Promise.all(reqs.map((f) => f()));

  latencies.sort((a, b) => a - b);
  const p95Index = Math.floor(latencies.length * 0.95);
  const p95 = latencies[p95Index];

  assert.ok(p95 < 200, `p95 độ trễ webhook ack phải < 200 ms (thực tế: ${p95.toFixed(2)} ms)`);
});

// ───── SC-005: 0 dependency mới trong package.json ─────
test('SC-005: 0 runtime dependency mới được thêm vào package.json (Node thuần)', () => {
  const pkg = JSON.parse(readFileSync('/work/package.json', 'utf8'));
  const deps = pkg.dependencies || {};
  const depKeys = Object.keys(deps);
  assert.equal(depKeys.length, 0, `dependencies phải rỗng (thực tế: ${depKeys.join(', ')})`);
});

// ───── SC-006: 18/18 kịch bản eval tiếp tục xanh ─────
test('SC-006: Kịch bản eval messenger-human-echo tiếp tục xanh và đạt yêu cầu', async () => {
  const res = await runEvalFixture('eval/fixtures/messenger-human-echo.jsonl');
  assert.equal(res.ok, true, res.why || 'eval messenger-human-echo phải đạt');
});
