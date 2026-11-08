// test/core/webhook.test.mjs — khoá hành vi handler HTTP tách khỏi server.js (T018 bước B1).
// Dựng HTTP thật ở cổng 0 rồi gọi bằng fetch: không import server.js (server.js chạy side-effect lúc import).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { createWebhookHandler } from '../../core/webhook.js';
import { parse as zaloParse } from '../../channels/zalo-bot.js';
import { openStore } from '../../core/store.js';
import { createOps } from '../../core/ops.js';

const SECRET = 'bi-mat-du-dai';

/** config tối thiểu mà handler dùng tới (core/config.js:34-50). */
const cfg = (over = {}) => ({ mode: 'webhook', webhookPath: '/webhook/zalo', webhookSecret: SECRET, port: 0, ...over });

/** kênh giả: verifyWebhook giả + parse THẬT của kênh Zalo (updateKey = message_id) — handler KHÔNG gửi tin (Điều I). */
const fakeChannel = (over = {}) => ({
  parse: zaloParse,
  verifyWebhook(req) {
    const h = req?.headers?.['x-bot-api-secret-token'];
    return typeof h === 'string' && h === SECRET;
  },
  ...over,
});

/** engine giả: ghi lại update đã nhận. */
const fakeEngine = () => {
  const calls = [];
  return { calls, process: async (p) => { calls.push(p); return { ok: true }; } };
};

/** engine giả TREO: ghi lại update rồi không bao giờ xong, tới khi gọi release(). */
const engineTreo = () => {
  const calls = [];
  let moKhoa;
  const cho = new Promise((r) => { moKhoa = r; });
  return { calls, release: () => moKhoa(), process: async (p) => { calls.push(p); await cho; return { ok: true }; } };
};

/** Update Zalo thật-thu-nhỏ: chat 1-1, có message_id (→ updateKey). */
const update = (over = {}) => ({
  event_name: 'message.text.received',
  message: { message_id: 'm-1', chat: { id: 'c1', chat_type: 'USER' }, from: { id: 'c1', display_name: 'Khach' }, text: 'chào', ...over },
});

/** log giả: thu lại mọi lời gọi để test xem lỗi có được ghi hay không. */
const fakeLog = () => {
  const calls = { log: [], error: [], warn: [] };
  return {
    calls,
    log: (...a) => calls.log.push(a.join(' ')),
    error: (...a) => calls.error.push(a.join(' ')),
    warn: (...a) => calls.warn.push(a.join(' ')),
  };
};

/**
 * Dựng server với handler, trả { url, engine, store, log, server }; tự đóng khi test xong.
 * `boc` (nếu có) được gọi với (req, res) trước handler: chỗ để test gắn mốc vào res.
 */
async function dung(t, { config = cfg(), engine = fakeEngine(), channel = fakeChannel(), health, metrics, store, now, runTask, log = fakeLog(), debug = false, boc } = {}) {
  let st = store;
  if (!st) { st = openStore(':memory:'); t.after(() => st.close()); }
  const handler = createWebhookHandler({
    config, channel, engine, store: st, now, runTask,
    health: health || (() => ({ ok: true, mode: config.mode, startedAt: '2026-11-07T00:00:00.000Z' })),
    metrics,
    debug,
    log,
  });
  const server = createServer((req, res) => { boc?.(req, res); return handler(req, res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  return { url: `http://127.0.0.1:${server.address().port}`, port: server.address().port, engine, config, store: st, log, server };
}

/**
 * Gửi POST thô qua node:net, tách body thành NHIỀU gói TCP tại các mốc byte cho trước.
 * Dùng để ép ký tự UTF-8 nhiều byte bị cắt giữa ranh giới gói (fetch tự gộp nên không ép được).
 */
function postThoChiaGoi(port, bodyBuf, mocCat, headers = {}) {
  const dongHeader = Object.entries({ 'x-bot-api-secret-token': SECRET, ...headers })
    .map(([k, v]) => `${k}: ${v}\r\n`).join('');
  const head = Buffer.from(
    `POST /webhook/zalo HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n${dongHeader}Content-Length: ${bodyBuf.length}\r\nConnection: close\r\n\r\n`,
    'latin1',
  );
  const phan = [];
  let truoc = 0;
  for (const m of mocCat) { phan.push(bodyBuf.subarray(truoc, m)); truoc = m; }
  phan.push(bodyBuf.subarray(truoc));
  return new Promise((giai, loi) => {
    const sock = connect(port, '127.0.0.1', async () => {
      sock.write(head);
      for (const p of phan) {
        sock.write(p);
        await new Promise((r) => setTimeout(r, 15));   // ép mỗi phần thành một gói TCP riêng
      }
    });
    const chunks = [];
    sock.on('data', (c) => chunks.push(c));
    sock.on('error', loi);
    sock.on('close', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      const status = Number(text.match(/^HTTP\/1\.1 (\d+)/)?.[1] ?? 0);
      giai({ status, text });
    });
  });
}

const post = (url, body, headers = {}) => fetch(url, { method: 'POST', body, headers });

/**
 * fetch có hạn chờ: lỗi không lường được làm handler treo (không bao giờ trả phản hồi) thì
 * test phải ĐỎ nhanh với thông báo rõ, không treo cả bộ test.
 */
async function fetchCoHan(url, opts = {}, hanMs = 3000) {
  try {
    return await fetch(url, { ...opts, signal: AbortSignal.timeout(hanMs) });
  } catch (e) {
    assert.fail(`request treo hoặc đứt sau ${hanMs} ms (${e?.name}: ${e?.message}) — handler phải luôn trả phản hồi`);
  }
}

test('GET /health → 200, body có ok:true và mode', async (t) => {
  const { url } = await dung(t);
  const res = await fetch(`${url}/health`);
  assert.equal(res.status, 200);
  const b = await res.json();
  assert.equal(b.ok, true);
  assert.equal(b.mode, 'webhook');
});

test('GET / → 200 giống /health', async (t) => {
  const { url } = await dung(t);
  const res = await fetch(`${url}/`);
  assert.equal(res.status, 200);
  const b = await res.json();
  assert.equal(b.ok, true);
  assert.equal(b.mode, 'webhook');
});

// ───── T027: /health báo db hỏng → 503; /metrics ─────

test('GET /health khi health() trả ok:false → 503 kèm payload đó', async (t) => {
  const { url } = await dung(t, { health: () => ({ ok: false, mode: 'webhook', db: 'error' }) });
  const res = await fetch(`${url}/health`);
  assert.equal(res.status, 503);
  const b = await res.json();
  assert.equal(b.ok, false);
  assert.equal(b.db, 'error');
});

test('GET /metrics → 200 với payload đúng hình dạng', async (t) => {
  const payload = { turns: 3, gate: { send: 1, drop: 1, defer: 0, reject: 1, byReason: { similar: 1, 'leak:path': 1 } }, tickets: { open: 0 }, jobs: { waiting: 0 } };
  const { url } = await dung(t, { metrics: () => payload });
  const res = await fetch(`${url}/metrics`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), payload);
});

test('GET /metrics khi không truyền metrics → 404 {ok:false}', async (t) => {
  const { url } = await dung(t);
  const res = await fetch(`${url}/metrics`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { ok: false });
});

test('GET /metrics khi metrics() ném lỗi → 500 {ok:false}, có log', async (t) => {
  const { url, log } = await dung(t, { metrics: () => { throw new Error('metrics-no'); } });
  const res = await fetchCoHan(`${url}/metrics`);
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { ok: false });
  assert.equal(log.calls.error.length >= 1, true);
});

test('GET /metrics khi db đóng (ops thật) → 500 {ok:false}; GET /health → 503', async (t) => {
  // ops THẬT + db đã đóng: /metrics phải báo lỗi (không trả 200 toàn số 0), /health vẫn 503.
  const store = openStore(':memory:');
  const ops = createOps({
    store,
    mcp: { listTools: async () => [] },
    channel: { getMe: async () => ({ id: 'bot' }) },
    config: { mode: 'webhook' },
    startedAt: '2026-11-07T00:00:00.000Z',
    version: 'v-test',
    log: fakeLog(),
  });
  store.close();
  const { url } = await dung(t, { metrics: () => ops.metrics(), health: () => ops.health() });

  const resM = await fetchCoHan(`${url}/metrics`);
  assert.equal(resM.status, 500, 'db chết thì /metrics phải 500, không phải 200 số 0');
  assert.deepEqual(await resM.json(), { ok: false });

  const resH = await fetch(`${url}/health`);
  assert.equal(resH.status, 503, '/health báo db hỏng thì 503');
  const b = await resH.json();
  assert.equal(b.ok, false);
  assert.equal(b.db, 'error');
});

test('GET /metrics?since=<ISO> → 200 và metrics() nhận đúng chuỗi ISO đó', async (t) => {
  const daNhan = [];
  const { url } = await dung(t, { metrics: (sinceIso) => { daNhan.push(sinceIso); return { turns: 0 }; } });
  const res = await fetch(`${url}/metrics?since=2026-11-07T00:00:00.000Z`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { turns: 0 });
  assert.deepEqual(daNhan, ['2026-11-07T00:00:00.000Z']);
});

test('GET /metrics?since=abc → 400 {ok:false} (lỗi tham số, không phải 500)', async (t) => {
  const { url, log } = await dung(t, { metrics: () => ({ turns: 0 }) });
  const res = await fetch(`${url}/metrics?since=abc`);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { ok: false });
  assert.equal(log.calls.warn.length >= 1, true, 'phải có log.warn cho tham số sai');
});

test('GET /metrics không có since → 200 và metrics() được gọi KHÔNG có tham số', async (t) => {
  const daNhan = [];
  const { url } = await dung(t, { metrics: (...args) => { daNhan.push(args); return { turns: 0 }; } });
  const res = await fetch(`${url}/metrics`);
  assert.equal(res.status, 200);
  assert.equal(daNhan.length, 1);
  assert.deepEqual(daNhan[0], [], 'không truyền tham số nào');
});

test('GET vào đường webhook (sai method) → 404 ok:false', async (t) => {
  const { url } = await dung(t);
  const res = await fetch(`${url}/webhook/zalo`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { ok: false });
});

test('POST sai đường dẫn → 404 ok:false', async (t) => {
  const { url } = await dung(t);
  const res = await post(`${url}/khong-co`, '{}', { 'x-bot-api-secret-token': SECRET });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { ok: false });
});

test('mode=polling → POST đúng đường dẫn vẫn 404', async (t) => {
  const { url, engine } = await dung(t, { config: cfg({ mode: 'polling' }) });
  const res = await post(`${url}/webhook/zalo`, '{}', { 'x-bot-api-secret-token': SECRET });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { ok: false });
  assert.equal(engine.calls.length, 0);
});

test('POST thiếu secret → 403 ok:false, engine không chạy', async (t) => {
  const { url, engine } = await dung(t);
  const res = await post(`${url}/webhook/zalo`, '{}');
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { ok: false });
  assert.equal(engine.calls.length, 0);
});

test('POST sai secret → 403 ok:false', async (t) => {
  const { url, engine } = await dung(t);
  const res = await post(`${url}/webhook/zalo`, '{}', { 'x-bot-api-secret-token': 'sai-be-bet' });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { ok: false });
  assert.equal(engine.calls.length, 0);
});

test('POST đúng secret, body JSON hỏng → 400 ok:false, engine không chạy', async (t) => {
  const { url, engine } = await dung(t);
  const res = await post(`${url}/webhook/zalo`, '{khong-phai-json', { 'x-bot-api-secret-token': SECRET });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { ok: false });
  assert.equal(engine.calls.length, 0);
});

// (Test "engine.process gọi đúng 1 lần với payload đã parse" của bước B1 đã xoá: B3 khoá đúng việc đó
//  và chặt hơn — xem 'B3: engine nhận object ĐÃ PARSE (có updateKey), không phải payload thô'.)

test('đường dẫn có query string vẫn khớp webhookPath (không phải 404)', async (t) => {
  const { url, engine } = await dung(t);
  const res = await post(`${url}/webhook/zalo?x=1`, '{"a":1}', { 'x-bot-api-secret-token': SECRET });
  assert.equal(res.status, 200, '?x=1 vẫn phải khớp webhookPath — 404 là sai');
  assert.deepEqual(await res.json(), { ok: true });
  await new Promise((r) => setTimeout(r, 30));
  // engine không chạy vì body {"a":1} không có chatId (cùng luật với test 'B2: update thiếu chatId').
  // Test này chỉ khoá việc khớp đường dẫn, không khoá việc xử lý.
  assert.deepEqual(engine.calls, []);
});

// ───── T018 bước B2: ghi inbox XONG rồi mới ack (Điều VII "sai thì dừng": ack trước = mất tin nếu chết ở khe hở) ─────

test('B2: POST đúng secret → inbox ĐÃ GHI XONG trước khi res.end được gọi (bắt được đảo thứ tự)', async (t) => {
  // L4: bản cũ của test này đo "dòng inbox đã có lúc fetch trả về" nên KHÔNG bắt được đột biến
  // `json(res,200)` trước `insertIgnore`: res.end() chỉ đẩy vào bộ đệm socket, insertIgnore chạy
  // ngay sau trong cùng tick, nên client luôn thấy dòng đã có.
  //
  // Cách đo đúng: ghi NHẬT KÝ THỨ TỰ ngay trong handler — mốc 'ghi-xong' trong insertIgnore và
  // mốc 'ack' khi res.end được gọi. So sánh thứ tự là xác định, không phụ thuộc đồng hồ hay
  // lịch event loop. (Đo wall-clock phía client không dùng được: client nằm cùng tiến trình/
  // event loop với server, nên vòng lặp bận trong handler chặn luôn cả client → mốc client
  // lúc nào cũng lớn hơn, cả khi code đã bị đảo thứ tự. Đã tự kiểm: xanh ở CẢ hai thứ tự.)
  const nhatKy = [];
  const engine = engineTreo();
  const store = openStore(':memory:');
  t.after(() => store.close());
  const ghiGoc = store.inbox.insertIgnore.bind(store.inbox);
  store.inbox.insertIgnore = (row) => {
    const kq = ghiGoc(row);
    const han = performance.now() + 50;
    while (performance.now() < han);   // chậm có chủ ý: chặn event loop để khe hở đủ rộng
    nhatKy.push('ghi-xong');
    return kq;
  };

  const { url } = await dung(t, {
    engine, store,
    boc: (req, res) => {
      const endGoc = res.end.bind(res);
      res.end = (...a) => { nhatKy.push('ack'); return endGoc(...a); };
    },
  });
  t.after(() => engine.release());

  const res = await post(`${url}/webhook/zalo`, JSON.stringify(update()), { 'x-bot-api-secret-token': SECRET });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });

  assert.deepEqual(nhatKy, ['ghi-xong', 'ack'],
    'phải ghi inbox XONG rồi mới ack; ["ack","ghi-xong"] là ack trước khi bền hoá = mất tin');

  const rows = store.inbox.pending();
  assert.equal(rows.length, 1, 'inbox phải có đúng 1 dòng ngay lúc 200 đã trả');
  assert.equal(rows[0].update_key, 'm-1');
  assert.equal(rows[0].chat_id, 'c1');
  assert.equal(rows[0].status, 'pending');
  assert.equal(store.inbox.get('m-1').status, 'pending');
});

test('B2: secret sai → 403 và inbox 0 dòng (chưa xác thực thì không ghi gì)', async (t) => {
  const { url, store, engine } = await dung(t);
  const res = await post(`${url}/webhook/zalo`, JSON.stringify(update()), { 'x-bot-api-secret-token': 'sai-be-bet' });
  assert.equal(res.status, 403);
  assert.equal(store.inbox.pending().length, 0);
  assert.equal(store.inbox.get('m-1'), null);
  assert.equal(engine.calls.length, 0);
});

test('B2: store.inbox.insertIgnore ném lỗi → 503, thân phản hồi không chứa lỗi gốc, engine không chạy', async (t) => {
  const store = openStore(':memory:');
  t.after(() => store.close());
  store.inbox.insertIgnore = () => { throw new Error('db-gia-loi'); };
  const { url, engine } = await dung(t, { store });
  const res = await post(`${url}/webhook/zalo`, JSON.stringify(update()), { 'x-bot-api-secret-token': SECRET });
  assert.equal(res.status, 503, 'db ghi không được thì phải 503 để Zalo gửi lại');
  const text = await res.text();
  assert.equal(text.includes('db-gia-loi'), false, 'Điều IX: không lộ thông báo lỗi gốc ra ngoài');
  assert.deepEqual(JSON.parse(text), { ok: false });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(engine.calls.length, 0, '503 thì không được xử lý (chưa bền hoá)');
});

test('B2: JSON hợp lệ nhưng channel.parse trả null → 200, không ghi inbox, không ném lỗi', async (t) => {
  // Quyết định: update bot không hiểu được thì ack 200 — gửi lại cũng vẫn không hiểu, 503 sẽ làm Zalo thử mãi.
  const { url, store, engine } = await dung(t, { channel: fakeChannel({ parse: () => null }) });
  const res = await post(`${url}/webhook/zalo`, '{}', { 'x-bot-api-secret-token': SECRET });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(store.inbox.pending().length, 0);
  assert.equal(engine.calls.length, 0);
});

test('B2: update thiếu chatId → 200, không ghi inbox (cột chat_id là NOT NULL)', async (t) => {
  const { url, store, engine } = await dung(t, { channel: fakeChannel({ parse: () => ({ updateKey: 'k1', chatId: null }) }) });
  const res = await post(`${url}/webhook/zalo`, '{"message":{"text":"chào"}}', { 'x-bot-api-secret-token': SECRET });
  assert.equal(res.status, 200);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(store.inbox.pending().length, 0);
  assert.equal(store.inbox.get('k1'), null);
  assert.equal(engine.calls.length, 0);
});

// ───── T018 bước B3: chỉ xử lý khi insertIgnore vừa chèn mới (lần hai là trùng) ─────

test('B3: POST lại cùng update → 200, inbox vẫn 1 dòng, engine.process gọi đúng 1 lần', async (t) => {
  const { url, store, engine } = await dung(t);
  const body = JSON.stringify(update());
  const r1 = await post(`${url}/webhook/zalo`, body, { 'x-bot-api-secret-token': SECRET });
  const r2 = await post(`${url}/webhook/zalo`, body, { 'x-bot-api-secret-token': SECRET });
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.deepEqual(await r2.json(), { ok: true });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(store.inbox.get('m-1') !== null, true);
  assert.equal(engine.calls.length, 1, 'update trùng không được xử lý lại');
});

test('B3: engine nhận object ĐÃ PARSE (có updateKey), không phải payload thô', async (t) => {
  const { url, engine } = await dung(t);
  const payload = update();
  await post(`${url}/webhook/zalo`, JSON.stringify(payload), { 'x-bot-api-secret-token': SECRET });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(engine.calls.length, 1);
  assert.equal(engine.calls[0].updateKey, 'm-1');
  assert.equal(engine.calls[0].chatId, 'c1');
  assert.deepEqual(engine.calls[0].raw, payload);
});

test('B3: khoá hàng đợi là convId theo người (nhóm → chatId:userId), chạy qua runTask', async (t) => {
  const keys = [];
  const runTask = (key, fn) => { keys.push(key); return fn(); };
  const { url, engine } = await dung(t, { runTask });
  const payload = update({ message_id: 'm-2', chat: { id: 'g9', chat_type: 'GROUP' }, from: { id: 'u7', display_name: 'Khach' } });
  await post(`${url}/webhook/zalo`, JSON.stringify(payload), { 'x-bot-api-secret-token': SECRET });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(keys, ['g9:u7']);
  assert.equal(engine.calls.length, 1);
});

test('B3: chat 1-1 → khoá hàng đợi là chatId', async (t) => {
  const keys = [];
  const { url } = await dung(t, { runTask: (key, fn) => { keys.push(key); return fn(); } });
  await post(`${url}/webhook/zalo`, JSON.stringify(update()), { 'x-bot-api-secret-token': SECRET });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(keys, ['c1']);
});

test('B3: now được tiêm → received_at dùng đồng hồ đó (UTC ISO)', async (t) => {
  const { url, store } = await dung(t, { now: () => new Date('2026-11-07T01:02:03.000Z') });
  await post(`${url}/webhook/zalo`, JSON.stringify(update()), { 'x-bot-api-secret-token': SECRET });
  assert.equal(store.inbox.get('m-1').received_at, '2026-11-07T01:02:03.000Z');
});

// ───── L1: ký tự UTF-8 nhiều byte bị cắt giữa ranh giới gói TCP không được hỏng ─────

test('L1: ký tự tiếng Việt bị cắt giữa hai gói TCP → text giữ nguyên, không có ký tự thay thế', async (t) => {
  // `body += c` ép TỪNG gói Buffer sang chuỗi riêng, nên 3 byte của `ẫ` nằm ở hai gói
  // thành 3 ký tự U+FFFD. Phải gom Buffer rồi mới decode một lần.
  const { url, port, engine, store } = await dung(t);
  const goc = 'nguyễn văn ẫ hàng hoá nhập khẩu';
  const bodyBuf = Buffer.from(JSON.stringify(update({ text: goc })), 'utf8');
  // cắt đúng giữa một ký tự nhiều byte: tìm byte tiếp-nối (10xxxxxx) đầu tiên.
  let moc = -1;
  for (let i = 1; i < bodyBuf.length; i++) if ((bodyBuf[i] & 0xC0) === 0x80) { moc = i; break; }
  assert.ok(moc > 0, 'body phải có ký tự nhiều byte để cắt');

  const res = await postThoChiaGoi(port, bodyBuf, [moc]);
  assert.equal(res.status, 200, `phải 200, nhận ${res.status}`);
  await new Promise((r) => setTimeout(r, 60));

  assert.equal(engine.calls.length, 1, 'update hợp lệ phải được xử lý');
  assert.equal(engine.calls[0].text, goc, 'text phải đúng bằng chuỗi gốc');
  assert.equal(engine.calls[0].text.includes('�'), false, 'không được có ký tự thay thế U+FFFD');
  const raw = store.inbox.get('m-1')?.raw ?? '';
  assert.equal(raw.includes('�'), false, 'inbox.raw đã bền hoá cũng không được hỏng');
  assert.equal(JSON.parse(raw).message.text, goc, 'inbox.raw phải giữ đúng chữ gốc');
  void url;
});

test('L1: body chia thành nhiều gói, mỗi gói cắt giữa ký tự → vẫn nguyên văn', async (t) => {
  const { port, engine } = await dung(t);
  const goc = 'ẫẫẫ ữữữ ơơơ đường biển hàng hoá';
  const bodyBuf = Buffer.from(JSON.stringify(update({ text: goc })), 'utf8');
  const mocs = [];
  for (let i = 1; i < bodyBuf.length && mocs.length < 4; i++) {
    if ((bodyBuf[i] & 0xC0) === 0x80 && (mocs.at(-1) ?? -5) < i - 1) mocs.push(i);
  }
  assert.ok(mocs.length >= 2, 'cần ít nhất 2 mốc cắt giữa ký tự');
  const res = await postThoChiaGoi(port, bodyBuf, mocs);
  assert.equal(res.status, 200);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(engine.calls.length, 1);
  assert.equal(engine.calls[0].text, goc, `chia ${mocs.length + 1} gói vẫn phải nguyên văn`);
});

test('L1: giới hạn 1 MB đếm theo BYTE — body nhiều byte quá hạn bị cắt kết nối', async (t) => {
  // Chuỗi tiếng Việt 600_000 ký tự nhưng > 1 MB khi mã hoá UTF-8: đếm theo ký tự sẽ cho qua.
  const { port } = await dung(t);
  const cuc = 'ẫ'.repeat(600_000);   // 3 byte/ký tự → ~1.8 MB
  const bodyBuf = Buffer.from(JSON.stringify(update({ text: cuc })), 'utf8');
  assert.ok(bodyBuf.length > 1_000_000, 'body phải > 1 MB theo byte');
  let kq;
  try { kq = await postThoChiaGoi(port, bodyBuf, [500_000]); } catch { kq = { status: 0 }; }
  assert.notEqual(kq.status, 200, 'body > 1 MB không được ack 200');
});

// ───── L2: lỗi ĐỒNG BỘ từ runTask không được làm sập tiến trình ─────

/** Bọc res.end để đếm số lần phản hồi bị kết thúc (phát hiện `loi500` gọi end lần hai). */
const demResEnd = () => {
  const o = { so: 0 };
  o.boc = (req, res) => {
    const goc = res.end.bind(res);
    res.end = (...a) => { o.so++; return goc(...a); };
  };
  return o;
};

test('L2: runTask ném lỗi đồng bộ → 200, lỗi vào .catch riêng, không đụng phản hồi đã gửi', async (t) => {
  // Lỗi đồng bộ của runTask phải đi vào .catch RIÊNG (đường lỗi CỦA VIỆC), không được rơi
  // vào try/catch của callback 'end' — rơi vào đó thì lỗi bị gán nhầm nhãn "lỗi không lường
  // được" và `loi500` gọi res.end() LẦN HAI trên phản hồi đã trả 200.
  // Đếm res.end là cách bắt đúng khác biệt này: cách sai (runTask gọi đồng bộ) → 2 lần
  // ⇒ ĐỎ; cách đúng (`Promise.resolve().then(() => runTask(...))`) → 1 lần ⇒ xanh.
  const bat = [];
  const batUncaught = (e) => bat.push(e?.message ?? String(e));
  const batUnhandled = (e) => bat.push('unhandledRejection: ' + (e?.message ?? String(e)));
  process.on('uncaughtException', batUncaught);
  process.on('unhandledRejection', batUnhandled);
  t.after(() => { process.off('uncaughtException', batUncaught); process.off('unhandledRejection', batUnhandled); });

  const dem = demResEnd();
  const runTask = () => { throw new Error('dong-bo-no'); };
  const { url, log } = await dung(t, { runTask, boc: dem.boc });
  const res = await post(`${url}/webhook/zalo`, JSON.stringify(update()), { 'x-bot-api-secret-token': SECRET });
  assert.equal(res.status, 200, 'đã bền hoá thì vẫn phải ack 200');
  assert.deepEqual(await res.json(), { ok: true });
  await new Promise((r) => setTimeout(r, 60));

  assert.deepEqual(bat, [], 'lỗi đồng bộ của runTask không được thành uncaughtException/unhandledRejection');
  assert.equal(dem.so, 1, `phải gọi res.end đúng 1 lần (đã gọi ${dem.so}) — 2 lần nghĩa là lỗi rơi vào loi500`);
  assert.equal(log.calls.error.length >= 1, true, 'lỗi phải được ghi vào log.error');
  assert.equal(log.calls.error.join(' ').includes('dong-bo-no'), true, 'log phải nêu nguyên nhân');
  assert.equal(log.calls.error.join(' ').includes('lỗi không lường được'), false,
    'lỗi của việc KHÔNG được gán nhãn "lỗi không lường được" của handler');
});

test('L2: engine.process ném lỗi đồng bộ (runTask mặc định) → 200, lỗi đi .catch riêng, res.end 1 lần', async (t) => {
  // runTask mặc định gọi `fn()` thẳng, nên lỗi đồng bộ của engine.process là lỗi đồng bộ của
  // runTask: cũng phải vào .catch riêng, không được đụng phản hồi đã trả 200.
  const bat = [];
  const batUncaught = (e) => bat.push(e?.message ?? String(e));
  const batUnhandled = (e) => bat.push('unhandledRejection: ' + (e?.message ?? String(e)));
  process.on('uncaughtException', batUncaught);
  process.on('unhandledRejection', batUnhandled);
  t.after(() => { process.off('uncaughtException', batUncaught); process.off('unhandledRejection', batUnhandled); });

  const dem = demResEnd();
  const engine = { calls: [], process: () => { throw new Error('engine-dong-bo-no'); } };
  const { url, log } = await dung(t, { engine, boc: dem.boc });
  const res = await post(`${url}/webhook/zalo`, JSON.stringify(update()), { 'x-bot-api-secret-token': SECRET });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(bat, [], 'không được sập tiến trình, không được bỏ rơi promise');
  assert.equal(dem.so, 1, `phải gọi res.end đúng 1 lần (đã gọi ${dem.so}) — 2 lần nghĩa là lỗi rơi vào loi500`);
  assert.equal(log.calls.error.length >= 1, true, 'phải có log.error');
  assert.equal(log.calls.error.join(' ').includes('engine-dong-bo-no'), true, 'log phải nêu nguyên nhân');
  assert.equal(log.calls.error.join(' ').includes('lỗi không lường được'), false,
    'lỗi của việc KHÔNG được gán nhãn "lỗi không lường được" của handler');
});

// ───── L3: lỗi không lường được trong thân handler → 500, không sập ─────

test('L3: channel.verifyWebhook ném lỗi → 500 ok:false, không treo, không sập, có log', async (t) => {
  const bat = [];
  const batUncaught = (e) => bat.push(e?.message ?? String(e));
  process.on('uncaughtException', batUncaught);
  t.after(() => process.off('uncaughtException', batUncaught));

  const channel = fakeChannel({ verifyWebhook: () => { throw new Error('verify-no'); } });
  const { url, log } = await dung(t, { channel });
  const res = await fetchCoHan(`${url}/webhook/zalo`, { method: 'POST', body: JSON.stringify(update()), headers: { 'x-bot-api-secret-token': SECRET } });
  assert.equal(res.status, 500, 'lỗi không lường được → 500 (không treo request)');
  assert.deepEqual(await res.json(), { ok: false });
  assert.deepEqual(bat, [], 'không được thành uncaughtException');
  assert.equal(log.calls.error.length >= 1, true, 'phải ghi log.error');
});

test('L3: health() ném lỗi → GET /health trả 500, không sập', async (t) => {
  const bat = [];
  const batUncaught = (e) => bat.push(e?.message ?? String(e));
  process.on('uncaughtException', batUncaught);
  t.after(() => process.off('uncaughtException', batUncaught));

  const { url, log } = await dung(t, { health: () => { throw new Error('health-no'); } });
  const res = await fetchCoHan(`${url}/health`);
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { ok: false });
  assert.deepEqual(bat, []);
  assert.equal(log.calls.error.length >= 1, true);
});

test('L3: thân phản hồi 500 không lộ thông báo lỗi gốc (Điều IX)', async (t) => {
  const bat = [];
  const batUncaught = (e) => bat.push(e?.message ?? String(e));
  process.on('uncaughtException', batUncaught);
  t.after(() => process.off('uncaughtException', batUncaught));

  const channel = fakeChannel({ verifyWebhook: () => { throw new Error('bi-mat-trong-loi'); } });
  const { url } = await dung(t, { channel });
  const res = await fetchCoHan(`${url}/webhook/zalo`, { method: 'POST', body: '{}', headers: { 'x-bot-api-secret-token': SECRET } });
  const text = await res.text();
  assert.equal(res.status, 500);
  assert.equal(text.includes('bi-mat-trong-loi'), false, 'không lộ lỗi gốc ra ngoài');
  assert.deepEqual(bat, []);
});

test('L3: mã HTTP các nhánh ĐÃ BIẾT không đổi sau khi thêm try/catch', async (t) => {
  const { url } = await dung(t);
  assert.equal((await fetch(`${url}/health`)).status, 200, '/health → 200');
  assert.equal((await fetch(`${url}/webhook/zalo`)).status, 404, 'GET đường webhook → 404');
  assert.equal((await post(`${url}/khong-co`, '{}', { 'x-bot-api-secret-token': SECRET })).status, 404, 'sai path → 404');
  assert.equal((await post(`${url}/webhook/zalo`, '{}')).status, 403, 'thiếu secret → 403');
  assert.equal((await post(`${url}/webhook/zalo`, '{xxx', { 'x-bot-api-secret-token': SECRET })).status, 400, 'JSON hỏng → 400');
  assert.equal((await post(`${url}/webhook/zalo`, '{}', { 'x-bot-api-secret-token': SECRET })).status, 200, 'không parse được → 200');
});

// ───── L7: nhánh "update không hiểu được" phải để lại dấu vết trong log ─────

test('L7: update không parse được → 200 và CÓ log cảnh báo, không in cả body', async (t) => {
  // Zalo đổi định dạng payload mà bot ack mọi thứ rồi im lặng thì không ai biết.
  const noiDungKhach = 'toi muon tra cuu ma HS cua mat hang ca phe rang xay dong goi 500g';
  const { url, log } = await dung(t, { channel: fakeChannel({ parse: () => null }) });
  const res = await post(`${url}/webhook/zalo`, JSON.stringify({ message: { text: noiDungKhach } }), { 'x-bot-api-secret-token': SECRET });
  assert.equal(res.status, 200);

  const ghi = [...log.calls.warn, ...log.calls.error].join('\n');
  assert.notEqual(ghi, '', 'phải có log.warn (hoặc log.error) cho nhánh không parse được');
  assert.equal(ghi.includes(noiDungKhach), false, 'Điều IX: không in nội dung tin khách vào log');
});

test('L7: update thiếu chatId → 200 và có log cảnh báo', async (t) => {
  const { url, log } = await dung(t, { channel: fakeChannel({ parse: () => ({ updateKey: 'k1', chatId: null }) }) });
  const res = await post(`${url}/webhook/zalo`, '{"message":{"text":"chào"}}', { 'x-bot-api-secret-token': SECRET });
  assert.equal(res.status, 200);
  assert.notEqual([...log.calls.warn, ...log.calls.error].join('\n'), '', 'thiếu chatId cũng phải có dấu vết');
});

test('L7: log giả KHÔNG có warn → không được sập (dùng optional call)', async (t) => {
  const bat = [];
  const batUncaught = (e) => bat.push(e?.message ?? String(e));
  process.on('uncaughtException', batUncaught);
  t.after(() => process.off('uncaughtException', batUncaught));

  const logThieuWarn = { log() {}, error() {} };   // không có .warn
  const { url } = await dung(t, { channel: fakeChannel({ parse: () => null }), log: logThieuWarn });
  const res = await post(`${url}/webhook/zalo`, '{}', { 'x-bot-api-secret-token': SECRET });
  assert.equal(res.status, 200, 'log thiếu warn vẫn phải 200');
  assert.deepEqual(bat, [], 'không được sập vì log.warn không tồn tại');
});

// ───── T018 bước B4: hiệu năng (tasks.md:332) — ghi trước ack không được làm chậm ack ─────

test('B4a: 50 POST đồng thời → tất cả 200, inbox đúng 50 dòng, thời gian PHỤC VỤ một request p95 < 200 ms', async (t) => {
  // Test này đo THỜI GIAN PHỤC VỤ một request (request vào handler → res.end được gọi), tức
  // chi phí xử lý của handler cho MỘT lượt. Nó KHÔNG khoá mục tiêu plan.md:27 ("webhook ack
  // p95 < 200 ms"): phép đo này mù với thời gian XẾP HÀNG — 50 request nối đuôi nhau, mỗi
  // request tốn 150 ms thì tổng p95 phía khách là ~7 giây mà test này vẫn xanh (đã tiêm thử).
  // Mục tiêu p95 phía khách do B4b khoá. Giữ test này vì chi phí phục vụ là số độc lập có ích:
  // nó đỏ khi handler tự nó chậm, không phụ thuộc chi phí client.
  const N = 50;
  const mocVao = new WeakMap();
  const doMs = [];
  const { url, store, engine } = await dung(t, {
    boc: (req, res) => {
      mocVao.set(res, performance.now());
      const endGoc = res.end.bind(res);
      res.end = (...a) => { doMs.push(performance.now() - mocVao.get(res)); return endGoc(...a); };
    },
  });
  const dos = Array.from({ length: N }, (_, i) => async () => {
    const body = JSON.stringify(update({ message_id: `m-${i}` }));
    const res = await post(`${url}/webhook/zalo`, body, { 'x-bot-api-secret-token': SECRET });
    return { status: res.status, ok: (await res.json()).ok };
  });
  const kq = await Promise.all(dos.map((f) => f()));   // đồng thời: bắn hết rồi mới chờ
  assert.deepEqual([...new Set(kq.map((r) => r.status))], [200], 'mọi POST phải 200');
  assert.deepEqual([...new Set(kq.map((r) => r.ok))], [true]);
  assert.equal(store.inbox.get('m-0') !== null, true);
  assert.equal(store.inbox.pending().length, N, `inbox phải có đúng ${N} dòng`);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(engine.calls.length, N, 'mỗi update mới đều được xử lý đúng 1 lần');

  assert.equal(doMs.length, N, `phải đo được ${N} mốc phục vụ trong handler`);
  const sorted = [...doMs].sort((a, b) => a - b);
  const p = (q) => sorted[Math.ceil(q * N) - 1];
  assert.ok(p(0.95) < 200,
    `thời gian phục vụ p95 (trong handler) = ${p(0.95).toFixed(1)} ms (ngưỡng 200 ms); p50 = ${p(0.5).toFixed(1)} ms, max = ${sorted.at(-1).toFixed(1)} ms`);
});

test('B4b: 50 POST đồng thời → độ trễ ack PHÍA KHÁCH p95 < 200 ms (plan.md:27)', async (t) => {
  // Đây là test khoá mục tiêu plan.md:27. Đo phía khách nên TÍNH CẢ thời gian xếp hàng: nếu
  // handler chậm thì request thứ 50 phải đợi 49 request trước, và p95 vọt lên vài giây.
  //
  // Dùng `node:net` socket thô chứ không 50 `fetch` song song: chi phí undici quá lớn (handler
  // rỗng đã p50 ~95 ms phía client) nên ngưỡng 200 ms mất hết nghĩa. Với socket thô, chi phí
  // sàn đo được là p95 ~40-44 ms (handler thật) / ~40 ms (handler rỗng) — còn ~5 lần dư địa
  // dưới ngưỡng 200 ms, nên phép đo có nghĩa.
  //
  // Mở hết 50 kết nối TRƯỚC rồi mới ghi request: chi phí TCP connect không tính vào độ trễ ack.
  // Mốc đầu = sau `write()`; mốc cuối = BYTE PHẢN HỒI ĐẦU TIÊN (`socket.once('data')`).
  const N = 50;
  const { port, store, engine } = await dung(t);

  const socks = await Promise.all(Array.from({ length: N }, () => new Promise((giai, loi) => {
    const s = connect(port, '127.0.0.1', () => giai(s));
    s.on('error', loi);
  })));
  t.after(() => socks.forEach((s) => s.destroy()));   // đóng hết, không để treo runner

  const mocGhi = new Array(N);
  // Đăng ký chờ phản hồi TRƯỚC khi ghi: nếu đăng ký sau, phản hồi về sớm có thể bị bỏ lỡ.
  const chos = socks.map((sock, i) => new Promise((giai, loi) => {
    sock.once('data', (c) => giai({ ms: performance.now() - mocGhi[i], dong1: c.toString('latin1').split('\r\n')[0] }));
    sock.on('error', loi);
  }));
  for (const [i, sock] of socks.entries()) {   // bắn hết 50 rồi mới chờ: đồng thời thật
    const b = Buffer.from(JSON.stringify(update({ message_id: `m-${i}` })), 'utf8');
    const head = Buffer.from(
      `POST /webhook/zalo HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n`
      + `x-bot-api-secret-token: ${SECRET}\r\nContent-Type: application/json\r\n`
      + `Content-Length: ${b.length}\r\n\r\n`, 'latin1');
    sock.write(Buffer.concat([head, b]));
    mocGhi[i] = performance.now();
  }
  const kq = await Promise.all(chos);

  assert.deepEqual([...new Set(kq.map((r) => r.dong1))], ['HTTP/1.1 200 OK'], 'mọi phản hồi phải 200');
  assert.equal(store.inbox.pending().length, N, `inbox phải có đúng ${N} dòng`);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(engine.calls.length, N, 'mỗi update mới đều được xử lý đúng 1 lần');

  const sorted = kq.map((r) => r.ms).sort((a, b) => a - b);
  const p = (q) => sorted[Math.ceil(q * N) - 1];
  assert.ok(p(0.95) < 200,
    `ack p95 PHÍA KHÁCH = ${p(0.95).toFixed(1)} ms (ngưỡng plan.md:27 là 200 ms); `
    + `p50 = ${p(0.5).toFixed(1)} ms, max = ${sorted.at(-1).toFixed(1)} ms`);
});
