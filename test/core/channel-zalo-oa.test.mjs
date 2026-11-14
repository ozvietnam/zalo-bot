import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createChannel, parse } from '../../channels/zalo-oa.js';

function fakeFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const callRecord = {
      url,
      method: init?.method,
      headers: init?.headers,
      body: init?.body ? JSON.parse(init.body) : null,
    };
    calls.push(callRecord);
    if (handler) return handler(url, init, callRecord);
    return {
      ok: true,
      status: 200,
      json: async () => ({ error: 0, message: 'Success' }),
    };
  };
  return { calls, fetchImpl };
}

test('T502: hợp đồng kênh Zalo OA', () => {
  const ch = createChannel({ oaToken: 'oa-tok', oaSecret: 'oa-sec', appId: 'app-1' });
  assert.equal(ch.name, 'zalo-oa');
  assert.equal(ch.maxText, 2000);
  assert.equal(ch.capabilities?.detectsHumanReplies, true);
  assert.equal(typeof ch.parse, 'function');
  assert.equal(typeof ch.sendText, 'function');
  assert.equal(typeof ch.typing, 'function');
  assert.equal(typeof ch.verifyWebhook, 'function');
  assert.equal(typeof parse, 'function');
});

test('T502: parse user_send_text chuẩn hoá Update (isEcho: false)', () => {
  const ch = createChannel({ oaToken: 'oa-tok', oaSecret: 'oa-sec', appId: 'app-1' });
  const raw = {
    event_name: 'user_send_text',
    app_id: 'app-1',
    sender: { id: 'u123', name: 'Nguyen Van A' },
    recipient: { id: 'oa999' },
    message: { text: 'xin chào bot', msg_id: 'msg-01' },
    timestamp: 1700000000,
  };
  const u = ch.parse(raw);
  assert.ok(u);
  assert.equal(u.updateKey, 'msg-01');
  assert.equal(u.event, 'message.text.received');
  assert.equal(u.chatId, 'u123');
  assert.equal(u.userId, 'u123');
  assert.equal(u.userName, 'Nguyen Van A');
  assert.equal(u.chatType, 'PRIVATE');
  assert.equal(u.text, 'xin chào bot');
  assert.equal(u.photoUrl, null);
  assert.equal(u.voiceUrl, null);
  assert.equal(u.caption, null);
  assert.equal(u.messageId, 'msg-01');
  assert.equal(u.isEcho, false);
  assert.equal(u.appId, 'app-1');
  assert.deepEqual(u.raw, raw);
});

test('T502: parse user_send_image chuẩn hoá Update photoUrl', () => {
  const ch = createChannel({ oaToken: 'oa-tok', oaSecret: 'oa-sec' });
  const raw = {
    event_name: 'user_send_image',
    sender: { id: 'u123' },
    message: {
      attachments: [{ payload: { url: 'https://img.test/pic.png' } }],
      msg_id: 'msg-img',
    },
  };
  const u = ch.parse(raw);
  assert.ok(u);
  assert.equal(u.event, 'message.image.received');
  assert.equal(u.chatId, 'u123');
  assert.equal(u.photoUrl, 'https://img.test/pic.png');
  assert.equal(u.isEcho, false);
});

test('T502: parse user_send_audio/voice chuẩn hoá Update voiceUrl', () => {
  const ch = createChannel({ oaToken: 'oa-tok', oaSecret: 'oa-sec' });
  const raw = {
    event_name: 'user_send_audio',
    sender: { id: 'u123' },
    message: {
      attachments: [{ payload: { url: 'https://audio.test/sample.aac' } }],
      msg_id: 'msg-voice',
    },
  };
  const u = ch.parse(raw);
  assert.ok(u);
  assert.equal(u.event, 'message.voice.received');
  assert.equal(u.chatId, 'u123');
  assert.equal(u.voiceUrl, 'https://audio.test/sample.aac');
  assert.equal(u.isEcho, false);
});

test('T502: parse oa_send_text chuẩn hoá Update thành isEcho: true và event: message.echo', () => {
  const ch = createChannel({ oaToken: 'oa-tok', oaSecret: 'oa-sec', appId: 'app-oa' });
  const raw = {
    event_name: 'oa_send_text',
    recipient: { id: 'u123' },
    sender: { id: 'oa999' },
    message: { text: 'nhân viên đang hỗ trợ bạn', msg_id: 'msg-oa-01' },
    timestamp: 1700000010,
  };
  const u = ch.parse(raw);
  assert.ok(u);
  assert.equal(u.event, 'message.echo');
  assert.equal(u.isEcho, true);
  assert.equal(u.chatId, 'u123');
  assert.equal(u.userId, 'u123');
  assert.equal(u.text, 'nhân viên đang hỗ trợ bạn');
  assert.equal(u.messageId, 'msg-oa-01');
  assert.equal(u.appId, 'app-oa');
});

test('T502: parse thiếu chatId hoặc raw không hợp lệ trả về null', () => {
  const ch = createChannel({ oaToken: 'oa-tok', oaSecret: 'oa-sec' });
  assert.equal(ch.parse(null), null);
  assert.equal(ch.parse(undefined), null);
  assert.equal(ch.parse('invalid'), null);
  assert.equal(ch.parse({ event_name: 'user_send_text', message: { text: 'thiếu sender' } }), null);
  assert.equal(ch.parse({ event_name: 'oa_send_text', message: { text: 'thiếu recipient' } }), null);
});

test('T502: verifyWebhook xác thực chữ ký MAC SHA256 (x-zevent-signature)', () => {
  const oaSecret = 'secret-key-1';
  const appId = '11223344';
  const ch = createChannel({ oaToken: 'oa-tok', oaSecret, appId });

  const rawBody = JSON.stringify({ event_name: 'user_send_text', app_id: appId, message: { text: 'test' } });
  const timestamp = '1700000000';
  const dataToSign = `${appId}${rawBody}${timestamp}${oaSecret}`;
  const validMac = createHash('sha256').update(dataToSign).digest('hex');

  // Khớp với mac=<hex>
  const req1 = {
    headers: {
      'x-zevent-signature': `mac=${validMac}`,
      'x-zevent-timestamp': timestamp,
    },
    rawBody,
  };
  assert.equal(ch.verifyWebhook(req1), true);

  // Khớp với <hex> thuần
  const req2 = {
    headers: {
      'x-zevent-signature': validMac,
      'x-zevent-timestamp': timestamp,
    },
    rawBody,
  };
  assert.equal(ch.verifyWebhook(req2), true);

  // Sai chữ ký MAC
  const reqBad = {
    headers: {
      'x-zevent-signature': 'mac=0000000000000000000000000000000000000000000000000000000000000000',
      'x-zevent-timestamp': timestamp,
    },
    rawBody,
  };
  assert.equal(ch.verifyWebhook(reqBad), false);
});

test('T502: verifyWebhook xác thực secret token (x-oa-secret-token / x-bot-api-secret-token)', () => {
  const oaSecret = 'oa-secret-token-xyz';
  const ch = createChannel({ oaToken: 'oa-tok', oaSecret });

  assert.equal(ch.verifyWebhook({ headers: { 'x-oa-secret-token': oaSecret } }), true);
  assert.equal(ch.verifyWebhook({ headers: { 'x-bot-api-secret-token': oaSecret } }), true);
  assert.equal(ch.verifyWebhook({ headers: { 'x-oa-secret-token': 'wrong-token' } }), false);
  assert.equal(ch.verifyWebhook({ headers: {} }), false);
});

test('T502: verifyWebhook xử lý an toàn khi thiếu oaSecret hoặc input lỗi (không ném lỗi)', () => {
  const chNoSecret = createChannel({ oaToken: 'oa-tok' });
  assert.equal(chNoSecret.verifyWebhook({ headers: { 'x-oa-secret-token': 'abc' } }), false);
  assert.equal(chNoSecret.verifyWebhook(null), false);
  assert.equal(chNoSecret.verifyWebhook(undefined), false);

  const ch = createChannel({ oaToken: 'oa-tok', oaSecret: 'sec' });
  assert.equal(ch.verifyWebhook(null), false);
  assert.equal(ch.verifyWebhook({ headers: null }), false);
  assert.equal(ch.verifyWebhook({ headers: { 'x-oa-secret-token': 123 } }), false);
  assert.equal(ch.verifyWebhook({ headers: { 'x-oa-secret-token': ['sec'] } }), false);
});

test('T502: sendText gọi POST /message/cs với header access_token và body chuẩn', async () => {
  const { calls, fetchImpl } = fakeFetch();
  const ch = createChannel({
    oaToken: 'test-oa-token',
    oaSecret: 'sec',
    baseUrl: 'https://openapi.zalo.me/v3.0/oa',
    fetchImpl,
  });

  await ch.sendText('123456', 'Chào bạn {b}Nguyễn{/b}');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://openapi.zalo.me/v3.0/oa/message/cs');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.access_token, 'test-oa-token');
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(calls[0].body, {
    recipient: { user_id: '123456' },
    message: { text: 'Chào bạn Nguyễn' },
  });
});

test('T502: sendText ném lỗi có err.status và tuyệt đối không lộ oaToken trong err.message (Điều IX)', async () => {
  const secretToken = 'sk-gia-loi-goc';
  const { fetchImpl } = fakeFetch(async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: -216, message: `Invalid token ${secretToken}` }),
  }));

  const ch = createChannel({
    oaToken: secretToken,
    oaSecret: 'sec',
    fetchImpl,
  });

  await assert.rejects(
    () => ch.sendText('123', 'alo'),
    (err) => {
      assert.equal(err.status, 401);
      assert.equal(err.message.includes(secretToken), false, 'Lỗi không được chứa token (Điều IX)');
      return true;
    },
  );
});

test('T502: typing nuốt lỗi an toàn không ném ra ngoài', async () => {
  const ch = createChannel({ oaToken: 'oa-tok', oaSecret: 'sec' });
  await assert.doesNotReject(() => ch.typing('123'));
  await assert.doesNotReject(() => ch.typing(null));
});

// ──────────────────────────────────────────────────────────────────────────────
// OZV-763: hạn giờ cho chỗ gửi tin (xem ghi chú dài ở test/core/channel-messenger.test.mjs).
// Riêng kênh này try/catch cũ chỉ bọc lại lỗi rồi throw — nó KHÔNG chặn treo.

async function giuVongLap(fn) {
  const neo = setInterval(() => {}, 20);
  try { return await fn(); } finally { clearInterval(neo); }
}

function fetchTreo() {
  const calls = [];
  const fetchImpl = (url, init = {}) => {
    calls.push({ url, init });
    return new Promise((_resolve, reject) => {
      const signal = init.signal;
      if (!signal) return;
      if (signal.aborted) return reject(signal.reason ?? new Error('aborted'));
      signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true });
    });
  };
  return { calls, fetchImpl };
}

test('OZV-763: Zalo OA sendText có hạn giờ — fetch treo thì bật ra, không chờ mãi', async () => {
  const { calls, fetchImpl } = fetchTreo();
  const ch = createChannel({ oaToken: 'oa-tok', oaSecret: 'sec', fetchImpl, sendTimeoutMs: 120 });

  const t0 = Date.now();
  const err = await giuVongLap(async () => {
    try {
      await ch.sendText('123456', 'alo');
      return null;
    } catch (e) {
      return e;
    }
  });
  const dt = Date.now() - t0;

  assert.ok(err, 'fetch treo thì sendText phải ném lỗi');
  assert.ok(dt < 3000, `phải bỏ cuộc sớm, thực tế ${dt} ms`);
  assert.equal(err.tamThoi, true, 'lỗi quá hạn giờ là lỗi TẠM');
  assert.equal(err.message.includes('oa-tok'), false, 'không lộ token (Điều IX)');
  assert.equal(calls[0].init.signal instanceof AbortSignal, true, 'phải truyền signal cho fetch');
});

test('OZV-763: Zalo OA mặc định vẫn có signal hạn giờ', async () => {
  const { calls, fetchImpl } = fetchTreo();
  createChannel({ oaToken: 'oa-tok', fetchImpl }).sendText('1', 'x').catch(() => {});
  await new Promise((r) => setImmediate(r));
  assert.ok(calls[0]?.init?.signal, 'mặc định cũng phải có signal');
});
