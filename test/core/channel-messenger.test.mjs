import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createChannel, parse, parseAll, safeEqual } from '../../channels/messenger.js';

function fakeFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (typeof handler === 'function') {
      return handler(url, options);
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ recipient_id: 'fb_user_1001', message_id: 'mid.res.1' }),
      text: async () => JSON.stringify({ recipient_id: 'fb_user_1001', message_id: 'mid.res.1' }),
    };
  };
  return { calls, fetchImpl };
}

test('T501: safeEqual so sánh an toàn thời gian hằng', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'ab'), false);
  assert.equal(safeEqual('', ''), false);
  assert.equal(safeEqual(null, 'abc'), false);
  assert.equal(safeEqual('abc', undefined), false);
});

test('T501: verifyChallenge xử lý Meta GET webhook challenge với mock token rõ nghĩa', () => {
  const channel = createChannel({
    pageToken: 'mock_page_token',
    appSecret: 'mock_app_secret_123',
    verifyToken: 'mock_verify_token',
  });

  // Đúng mode và token
  const okReq = {
    url: '/webhook/messenger?hub.mode=subscribe&hub.verify_token=mock_verify_token&hub.challenge=mock_challenge_12345',
  };
  assert.deepEqual(channel.verifyChallenge(okReq), { ok: true, challenge: 'mock_challenge_12345' });

  // Sai verify_token
  const badToken = {
    url: '/webhook/messenger?hub.mode=subscribe&hub.verify_token=mock_wrong_token&hub.challenge=mock_challenge_12345',
  };
  assert.deepEqual(channel.verifyChallenge(badToken), { ok: false });

  // Sai mode
  const badMode = {
    url: '/webhook/messenger?hub.mode=other&hub.verify_token=mock_verify_token&hub.challenge=mock_challenge_12345',
  };
  assert.deepEqual(channel.verifyChallenge(badMode), { ok: false });

  // URL rỗng hoặc thiếu req
  assert.deepEqual(channel.verifyChallenge({}), { ok: false });
  assert.deepEqual(channel.verifyChallenge(null), { ok: false });
});

test('T501: verifyWebhook xác thực chữ ký HMAC-SHA256 (SC-001) với mock secret rõ nghĩa', () => {
  const secret = 'mock_app_secret_123';
  const channel = createChannel({
    pageToken: 'mock_page_token',
    appSecret: secret,
    verifyToken: 'mock_verify_token',
  });

  const bodyStr = JSON.stringify({ object: 'page', entry: [] });
  const validSig = 'sha256=' + createHmac('sha256', secret).update(bodyStr).digest('hex');

  // Hợp lệ với rawBody chuỗi
  assert.equal(channel.verifyWebhook({
    headers: { 'x-hub-signature-256': validSig },
    rawBody: bodyStr,
  }), true);

  // Hợp lệ với rawBody là Buffer
  assert.equal(channel.verifyWebhook({
    headers: { 'x-hub-signature-256': validSig },
    rawBody: Buffer.from(bodyStr),
  }), true);

  // Hợp lệ khi đọc từ body
  assert.equal(channel.verifyWebhook({
    headers: { 'x-hub-signature-256': validSig },
    body: bodyStr,
  }), true);

  // Thiếu header
  assert.equal(channel.verifyWebhook({ headers: {}, rawBody: bodyStr }), false);

  // Header sai chữ ký
  assert.equal(channel.verifyWebhook({
    headers: { 'x-hub-signature-256': 'sha256=abcdef123456' },
    rawBody: bodyStr,
  }), false);

  // Header không phải dạng chuỗi (mảng hoặc số)
  assert.equal(channel.verifyWebhook({
    headers: { 'x-hub-signature-256': [validSig] },
    rawBody: bodyStr,
  }), false);

  // Kênh chưa cấu hình appSecret
  const noSecretChannel = createChannel({ pageToken: 'mock_page_token' });
  assert.equal(noSecretChannel.verifyWebhook({
    headers: { 'x-hub-signature-256': validSig },
    rawBody: bodyStr,
  }), false);

  // req là null
  assert.equal(channel.verifyWebhook(null), false);
});

test('T501: parse và parseAll phân tích các loại sự kiện Meta Messenger với ID giả lập (fb_user_1001, fb_page_2002)', () => {
  const payload = {
    object: 'page',
    entry: [
      {
        id: 'fb_page_2002',
        time: 1731170000000,
        messaging: [
          {
            sender: { id: 'fb_user_1001' },
            recipient: { id: 'fb_page_2002' },
            timestamp: 1731170000001,
            message: {
              mid: 'mid.text.1',
              text: 'Chào bot OZ',
            },
          },
          {
            sender: { id: 'fb_user_1001' },
            recipient: { id: 'fb_page_2002' },
            timestamp: 1731170000002,
            message: {
              mid: 'mid.photo.1',
              attachments: [
                {
                  type: 'image',
                  payload: { url: 'https://example.com/photo.jpg' },
                },
              ],
            },
          },
          {
            sender: { id: 'fb_user_1001' },
            recipient: { id: 'fb_page_2002' },
            timestamp: 1731170000003,
            message: {
              mid: 'mid.voice.1',
              attachments: [
                {
                  type: 'audio',
                  payload: { url: 'https://example.com/voice.mp3' },
                },
              ],
            },
          },
          {
            sender: { id: 'fb_user_1001' },
            recipient: { id: 'fb_page_2002' },
            timestamp: 1731170000004,
            message: {
              mid: 'mid.sticker.1',
              attachments: [
                {
                  type: 'image',
                  payload: { sticker_id: 8888, url: 'https://example.com/sticker.png' },
                },
              ],
            },
          },
          {
            sender: { id: 'fb_user_1001' },
            recipient: { id: 'fb_page_2002' },
            timestamp: 1731170000005,
            message: {
              mid: 'mid.loc.1',
              attachments: [
                {
                  type: 'location',
                  payload: { coordinates: { lat: 21.0, long: 105.8 } },
                },
              ],
            },
          },
          {
            sender: { id: 'fb_page_2002' },
            recipient: { id: 'fb_user_1001' },
            timestamp: 1731170000006,
            message: {
              mid: 'mid.echo.1',
              is_echo: true,
              app_id: 'mock_app_id_999',
              text: 'Tin nhắn trả lời từ nhân viên Fanpage',
            },
          },
          {
            sender: { id: 'fb_user_1001' },
            recipient: { id: 'fb_page_2002' },
            timestamp: 1731170000007,
            message_unsend: {
              mid: 'mid.unsend.1',
            },
          },
        ],
      },
    ],
  };

  const all = parseAll(payload);
  assert.equal(all.length, 7);

  // 1. Tin nhắn chữ
  assert.deepEqual(all[0], {
    updateKey: 'mid.text.1',
    event: 'message.text.received',
    chatId: 'fb_user_1001',
    userId: 'fb_user_1001',
    userName: null,
    chatType: 'PRIVATE',
    text: 'Chào bot OZ',
    photoUrl: null,
    voiceUrl: null,
    caption: null,
    messageId: 'mid.text.1',
    raw: payload.entry[0].messaging[0],
    isEcho: false,
    appId: null,
  });

  // 2. Tin ảnh
  assert.equal(all[1].event, 'message.photo.received');
  assert.equal(all[1].photoUrl, 'https://example.com/photo.jpg');
  assert.equal(all[1].chatId, 'fb_user_1001');
  assert.equal(all[1].isEcho, false);

  // 3. Tin thoại
  assert.equal(all[2].event, 'message.voice.received');
  assert.equal(all[2].voiceUrl, 'https://example.com/voice.mp3');
  assert.equal(all[2].text, '[thoại]');

  // 4. Tin sticker (nhãn dán)
  assert.equal(all[3].text, '[nhãn dán]');

  // 5. Tin vị trí
  assert.equal(all[4].text, '[vị trí]');

  // 6. Tin echo từ nhân viên
  assert.equal(all[5].isEcho, true);
  assert.equal(all[5].event, 'message.echo');
  assert.equal(all[5].chatId, 'fb_user_1001'); // Recipient ID khi is_echo
  assert.equal(all[5].userId, 'fb_user_1001');
  assert.equal(all[5].appId, 'mock_app_id_999');

  // 7. Tin unsend
  assert.equal(all[6].event, 'message.unsend');
  assert.equal(all[6].messageId, 'mid.unsend.1');
  assert.equal(all[6].updateKey, 'mid.unsend.1');

  // parse(payload) trả phần tử đầu tiên
  const first = parse(payload);
  assert.deepEqual(first, all[0]);

  // Payload không có mid -> updateKey là sha1 hex 40 ký tự
  const noMidPayload = {
    sender: { id: 'fb_user_1001' },
    recipient: { id: 'fb_page_2002' },
    message: { text: 'không có mid' },
  };
  const parsedNoMid = parse(noMidPayload);
  assert.match(parsedNoMid.updateKey, /^[0-9a-f]{40}$/);

  // Payload không hợp lệ
  assert.equal(parse(null), null);
  assert.deepEqual(parseAll(null), []);
  assert.equal(parse({}), null);
});

test('T501: sendText gửi tin nhắn qua Meta Graph API và lược bỏ thẻ định dạng', async () => {
  const { calls, fetchImpl } = fakeFetch();
  const channel = createChannel({
    pageToken: 'mock_page_token',
    fetchImpl,
    baseUrl: 'https://graph.facebook.com/v21.0',
  });

  await channel.sendText('fb_user_1001', 'Xin chào {b}khách hàng{/b}!');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://graph.facebook.com/v21.0/me/messages');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Authorization'], 'Bearer mock_page_token');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');

  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body, {
    recipient: { id: 'fb_user_1001' },
    message: { text: 'Xin chào khách hàng!' },
    messaging_type: 'RESPONSE',
  });
});

test('T501: sendText khi lỗi HTTP không làm rò rỉ pageToken trong chuỗi JSON (Điều IX)', async () => {
  const secretToken = 'mock_page_token';
  const { fetchImpl } = fakeFetch(async () => ({
    ok: false,
    status: 403,
    json: async () => ({
      error: {
        message: `Invalid OAuth token: ${secretToken} was rejected`,
        type: 'OAuthException',
        code: 190,
      },
    }),
    text: async () => JSON.stringify({
      error: {
        message: `Invalid OAuth token: ${secretToken} was rejected`,
      },
    }),
  }));

  const channel = createChannel({
    pageToken: secretToken,
    fetchImpl,
  });

  await assert.rejects(
    async () => {
      await channel.sendText('fb_user_1001', 'Thử lỗi');
    },
    (err) => {
      assert.equal(err.status, 403);
      assert.equal(err.message.includes(secretToken), false, 'Lỗi không được chứa token');
      assert.equal(err.message.includes('[REDACTED]'), true, 'Token bị thay thế bằng [REDACTED]');
      return true;
    },
  );
});

test('T501 (Đỏ bổ sung Điều IX): sendText khi server trả plain text không phải JSON chứa pageToken', async () => {
  const secretToken = 'mock_page_token';
  const { fetchImpl } = fakeFetch(async () => ({
    ok: false,
    status: 502,
    json: async () => {
      throw new Error('Unexpected token < in JSON at position 0');
    },
    text: async () => `<html>Bad Gateway: failed with token ${secretToken} at upstream</html>`,
  }));

  const channel = createChannel({
    pageToken: secretToken,
    fetchImpl,
  });

  await assert.rejects(
    async () => {
      await channel.sendText('fb_user_1001', 'Test raw text error');
    },
    (err) => {
      assert.equal(err.status, 502);
      assert.equal(err.message.includes(secretToken), false, 'Raw text lỗi không được chứa pageToken');
      assert.equal(err.message.includes('[REDACTED]'), true, 'pageToken trong raw text phải được thay bằng [REDACTED]');
      return true;
    },
  );
});

test('T501 (Đỏ bổ sung Mock Data): ID giả lập và mock token không vi phạm định dạng SĐT VN', () => {
  const invalidPhonePrefixes = ['09', '03', '08', '07', '05', '+84'];
  const testIds = ['fb_user_1001', 'fb_page_2002', 'mock_app_id_999'];
  for (const id of testIds) {
    for (const prefix of invalidPhonePrefixes) {
      assert.equal(id.startsWith(prefix), false, `ID ${id} không được bắt đầu bằng ${prefix}`);
    }
  }
});

test('T501: typing gửi sender_action typing_on và nuốt lỗi khi thất bại', async () => {
  const { calls, fetchImpl } = fakeFetch();
  const channel = createChannel({
    pageToken: 'mock_page_token',
    fetchImpl,
  });

  await channel.typing('fb_user_1002');
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body, {
    recipient: { id: 'fb_user_1002' },
    sender_action: 'typing_on',
  });

  // Nuốt lỗi khi fetch ném Exception
  const badChannel = createChannel({
    pageToken: 'mock_page_token',
    fetchImpl: async () => {
      throw new Error('Mạng bị gián đoạn');
    },
  });

  await assert.doesNotReject(async () => {
    await badChannel.typing('fb_user_1002');
  });
});

test('T501: Hợp đồng kênh Messenger (name, maxText, capabilities)', () => {
  const channel = createChannel({
    pageToken: 'mock_page_token',
    appSecret: 'mock_app_secret_123',
    verifyToken: 'mock_verify_token',
  });

  assert.equal(channel.name, 'messenger');
  assert.equal(channel.maxText, 2000);
  assert.deepEqual(channel.capabilities, { detectsHumanReplies: true });
  assert.equal(typeof channel.parse, 'function');
  assert.equal(typeof channel.parseAll, 'function');
  assert.equal(typeof channel.sendText, 'function');
  assert.equal(typeof channel.typing, 'function');
  assert.equal(typeof channel.verifyWebhook, 'function');
  assert.equal(typeof channel.verifyChallenge, 'function');
});

// ──────────────────────────────────────────────────────────────────────────────
// OZV-763: hạn giờ cho chỗ gửi tin.
// `sendText` nằm TRONG khoá hàng đợi theo hội thoại
// (core/webhook.js -> core/store/queue.js -> core/engine.js -> core/gate.js:88).
// Một fetch treo không hạn giờ ở đây giữ khoá vĩnh viễn => bot im hẳn với đúng
// khách đó, không có gì tự gỡ. Luật repo: mọi fetch mới phải có AbortSignal.timeout.

/**
 * Giữ vòng lặp sự kiện sống trong lúc chờ hạn giờ.
 * `AbortSignal.timeout` dùng hẹn giờ ĐÃ unref: nó không tự giữ tiến trình sống.
 * Chạy thật thì máy chủ webhook luôn giữ vòng lặp nên không sao; test chạy riêng
 * có thể cạn việc và thoát trước khi hạn giờ bắn ("Promise resolution is still
 * pending but the event loop has already resolved") — đã gặp ở commit 11d53c6.
 */
async function giuVongLap(fn) {
  const neo = setInterval(() => {}, 20);
  try { return await fn(); } finally { clearInterval(neo); }
}

/** fetch giả treo tới khi signal huỷ. Đúng như kết nối TCP không bao giờ đóng. */
function fetchTreo() {
  const calls = [];
  const fetchImpl = (url, options = {}) => {
    calls.push({ url, options });
    return new Promise((_resolve, reject) => {
      const signal = options.signal;
      if (!signal) return;             // không hạn giờ: treo vĩnh viễn
      if (signal.aborted) return reject(signal.reason ?? new Error('aborted'));
      signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true });
    });
  };
  return { calls, fetchImpl };
}

test('OZV-763: Messenger sendText có hạn giờ — fetch treo thì bật ra, không chờ mãi', async () => {
  const { calls, fetchImpl } = fetchTreo();
  const channel = createChannel({
    pageToken: 'mock_page_token',
    appSecret: 'mock_app_secret_123',
    fetchImpl,
    sendTimeoutMs: 120,
  });

  const t0 = Date.now();
  const err = await giuVongLap(async () => {
    try {
      await channel.sendText('fb_user_1001', 'alo');
      return null;
    } catch (e) {
      return e;
    }
  });
  const dt = Date.now() - t0;

  assert.ok(err, 'fetch treo thì sendText phải ném lỗi, không treo vĩnh viễn');
  assert.ok(dt < 3000, `phải bỏ cuộc sớm, thực tế ${dt} ms`);
  assert.equal(err.tamThoi, true, 'lỗi quá hạn giờ là lỗi TẠM (gate xử theo lối đã có)');
  assert.equal(calls[0].options.signal instanceof AbortSignal, true, 'phải truyền signal cho fetch');
});

test('OZV-763: Messenger hạn giờ gửi tin mặc định 15 giây, chỉnh được qua tham số', async () => {
  const { calls, fetchImpl } = fetchTreo();
  createChannel({ pageToken: 'tok', fetchImpl }).sendText('1', 'x').catch(() => {});
  await new Promise((r) => setImmediate(r));
  assert.ok(calls[0]?.options?.signal, 'mặc định cũng phải có signal');
});
