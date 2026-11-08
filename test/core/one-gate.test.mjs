// T016: một cửa gửi duy nhất — gate.send() phải trả quyết định, không ném lỗi ra ngoài.
// Bước này khoá hành vi với tin rỗng (undefined/null/rỗng/khoảng trắng).
// Phần dưới: khoá HÌNH DẠNG của server.js (đọc tệp bằng fs, KHÔNG import — import sẽ chạy server).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { fakeChannel, fakeClock } from '../helpers/fakes.mjs';

const SERVER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'server.js');
const readServer = () => readFileSync(SERVER, 'utf8');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROD_DIRS = ['core', 'packs', 'channels', 'scripts'];

/** Liệt kê đệ quy các tệp .js/.mjs trong một thư mục. */
function listJs(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...listJs(p));
    else if (/\.(js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

/** Toàn bộ tệp sản xuất quét luật một cửa gửi (KHÔNG gồm test/). */
function prodFiles() {
  return [...PROD_DIRS.flatMap((d) => listJs(join(ROOT, d))), SERVER];
}

/** Các dòng khớp regex trong một tệp, kèm đường dẫn tương đối repo. */
function grepLines(re, file) {
  return readFileSync(file, 'utf8').split('\n')
    .map((text, i) => ({ file: relative(ROOT, file), line: i + 1, text }))
    .filter((h) => re.test(h.text));
}

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
  return { store, clock, ch, gate, alerts, tickets };
}

/** id của outbox là rowid tăng dần; probe trả về id = số dòng đã có (kể cả probe). */
function probe(store, tag) {
  return store.outbox.insert({
    idem_key: `probe-${tag}`, chat_id: 'probe', kind: 'probe', text: 'probe',
    decision: 'send', reason: 'ok', status: 'queued', created_at: START,
  });
}

test('gate.send với text undefined → reject empty, không ném lỗi', async () => {
  const { gate } = setup();
  const r = await gate.send({ text: undefined });
  assert.deepEqual([r.decision, r.reason, r.status], ['reject', 'empty', 'rejected']);
  assert.equal(r.id, null);
});

test('gate.send với text undefined và idemKey → reject empty, không ném lỗi', async () => {
  const { gate } = setup();
  const r = await gate.send({ idemKey: 'k1', chatId: 'c1', kind: 'reply', text: undefined });
  assert.deepEqual([r.decision, r.reason, r.status], ['reject', 'empty', 'rejected']);
  assert.equal(r.id, null);
});

test('gate.send với text null → reject empty, không ném lỗi', async () => {
  const { gate } = setup();
  const r = await gate.send({ idemKey: 'k2', chatId: 'c1', kind: 'reply', text: null });
  assert.deepEqual([r.decision, r.reason, r.status], ['reject', 'empty', 'rejected']);
  assert.equal(r.id, null);
});

test('gate.send với text rỗng → reject empty, không ném lỗi', async () => {
  const { gate } = setup();
  const r = await gate.send({ idemKey: 'k3', chatId: 'c1', kind: 'reply', text: '' });
  assert.deepEqual([r.decision, r.reason, r.status], ['reject', 'empty', 'rejected']);
  assert.equal(r.id, null);
});

test('tin rỗng không tạo dòng nào trong outbox', async () => {
  const { gate, store } = setup();
  const p1 = probe(store, 'a');
  await gate.send({ idemKey: 'k1', chatId: 'c1', kind: 'reply', text: undefined });
  await gate.send({ idemKey: 'k2', chatId: 'c1', kind: 'reply', text: null });
  await gate.send({ idemKey: 'k3', chatId: 'c1', kind: 'reply', text: '' });
  const p2 = probe(store, 'b');
  assert.equal(p2 - p1, 1); // chỉ dòng probe thứ hai được thêm
});

test('tin rỗng có audit loại gate: decision reject, reason empty', async () => {
  const { gate, store } = setup();
  await gate.send({ idemKey: 'k1', chatId: 'c1', turnId: 't1', kind: 'reply', text: undefined });
  const gates = store.audit.byChat('c1', 50).filter((a) => a.type === 'gate');
  assert.equal(gates.length, 1);
  assert.equal(gates[0].data.decision, 'reject');
  assert.equal(gates[0].data.reason, 'empty');
});

test('tin rỗng không gửi kênh, không ghi messages, không báo cảnh báo/phiếu', async () => {
  const { gate, ch, store, alerts, tickets } = setup();
  await gate.send({ idemKey: 'k1', chatId: 'c1', kind: 'reply', text: undefined });
  assert.equal(ch.sent.length, 0);
  assert.equal(store.messages.recent('c1', 5).length, 0);
  assert.deepEqual(alerts, []);
  assert.deepEqual(tickets, []);
});

// ═══ T016: server.js nối lõi, không đi qua đường cũ lib/ ═══

test('server.js không import tệp nào trong lib/', () => {
  const hits = readServer().split('\n').filter((l) => /from\s+['"][^'"]*\/lib\//.test(l));
  assert.deepEqual(hits, [], `server.js vẫn import lib/: ${hits.join(' | ')}`);
});

test('server.js không dùng lib/bot.js (createBot) — đường cũ không qua cửa gửi', () => {
  const src = readServer();
  assert.equal(/from\s+['"][^'"]*lib\/bot\.js['"]/.test(src), false);
  assert.equal(src.includes('createBot'), false);
});

test('server.js không gọi hàm gửi tin của kênh trực tiếp (chỉ core/gate.js được gọi)', () => {
  const hits = readServer().split('\n').filter((l) => l.includes('.sendText('));
  assert.deepEqual(hits, [], `server.js gọi gửi tin trực tiếp: ${hits.join(' | ')}`);
});

test('server.js không dài quá 120 dòng', () => {
  const n = readServer().split('\n').length;
  assert.ok(n <= 120, `server.js đang ${n} dòng (giới hạn 120)`);
});

test('server.js nạp gói theo đường dẫn tương đối tới TỆP MÃ NGUỒN (không phụ thuộc cwd)', () => {
  const src = readServer();
  assert.equal(/loadPacks\(\s*['"]packs['"]\s*\)/.test(src), false,
    "server.js vẫn nạp gói bằng đường dẫn tương đối 'packs' (lệ thuộc thư mục hiện tại)");
  assert.match(src, /loadPacks\(\s*join\(\s*import\.meta\.dirname\s*,\s*['"]packs['"]\s*\)\s*\)/);
});

test('server.js CẢNH BÁO TO khi không nạp được gói nào (không được im lặng)', () => {
  const src = readServer();
  assert.match(src, /KHÔNG nạp được gói nào/, 'server.js phải có dòng cảnh báo khi nạp 0 gói');
  assert.match(src, /console\.error\([^\n]*KHÔNG nạp được gói nào/, 'cảnh báo phải đi qua console.error');
});

test('server.js có bộ quét nền setInterval mỗi 5000 ms', () => {
  const src = readServer();
  assert.match(src, /setInterval\(/);
  assert.match(src, /setInterval\([\s\S]*?,\s*5000\s*\)/);
});

// ═══ Điều IX: mã phòng/cuộc trò chuyện là dữ liệu nhận dạng khách, log chỉ được ghi 4 ký tự cuối ═══
// Soát T021 (#33) bắt được `onAlert` của server.js ghi nguyên `chat_id` ra log, trong khi
// core/engine.js:136 chỉ ghi `.slice(-4)`. Khoá lại cả hai lời gọi lại (onAlert và onTicket).

test('server.js: onAlert/onTicket chỉ ghi 4 ký tự cuối mã phòng, không ghi mã đầy đủ (Điều IX)', () => {
  const src = readServer();
  // Lấy các dòng console.* có nhắc chat/conv trong phần nối cửa gửi.
  const dong = src.split('\n')
    .map((text, i) => ({ line: i + 1, text }))
    .filter((h) => /console\.(warn|log|error)/.test(h.text) && /\b(chat|conv)=/.test(h.text));
  assert.ok(dong.length >= 2, `phải có dòng log cho cảnh báo và phiếu: ${JSON.stringify(dong)}`);
  for (const h of dong) {
    assert.doesNotMatch(h.text, /\$\{\s*(chat|chatId|convId|conv)\s*\}/,
      `server.js:${h.line} ghi nguyên mã phòng/cuộc trò chuyện ra log (Điều IX): ${h.text.trim()}`);
  }
  // Và phải có một chỗ duy nhất cắt đuôi, dùng cho cả hai.
  assert.match(src, /slice\(\s*-4\s*\)/, 'server.js phải cắt còn 4 ký tự cuối như core/engine.js');
});

// ═══ T016: khoá "một cửa gửi" trên TOÀN BỘ tệp sản xuất (đệ quy, chỉ .js/.mjs) ═══

test('chỉ core/gate.js gọi .sendText trong core/packs/channels/scripts + server.js', () => {
  const hits = prodFiles().flatMap((f) => grepLines(/\.sendText\(/, f));
  assert.deepEqual(hits.map((h) => h.file), ['core/gate.js'],
    `chỗ gọi .sendText ngoài core/gate.js: ${JSON.stringify(hits, null, 2)}`);
});

test('lib/ không còn tồn tại trên đĩa (đã xoá hẳn)', () => {
  assert.equal(existsSync(join(ROOT, 'lib')), false, 'lib/ vẫn còn tồn tại trên đĩa');
});

test('tệp sản xuất không import tệp nào trong lib/', () => {
  const hits = prodFiles().flatMap((f) => grepLines(/from\s+['"][^'"]*\/lib\//, f));
  assert.deepEqual(hits, [], `tệp sản xuất vẫn import lib/: ${JSON.stringify(hits, null, 2)}`);
});
