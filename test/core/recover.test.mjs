// T020: khôi phục khi khởi động. Hai tầng, gọi theo đúng thứ tự lúc boot:
//   1. gate.recover()   — outbox 'queued' bỏ lại (chết giữa lúc gửi) → 'failed' để sweep gửi tiếp phần thiếu.
//   2. engine.recover() — inbox 'pending'/'processing' bỏ lại (webhook đã ack 200 rồi tiến trình chết) → chạy lại lượt.
// Mọi test mở store trên TỆP THẬT trong thư mục tạm, vì "khởi động lại" = đóng store rồi mở lại cùng tệp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createRegistry } from '../../core/registry.js';
import { createEngine } from '../../core/engine.js';
import { parse as zaloParse } from '../../channels/zalo-bot.js';
import { fakeChannel, fakeClock } from '../helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z'; // 10:00 VN — ngoài giờ yên
const silent = { info() {}, warn() {}, error() {} };
const SERVER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'server.js');

/** Gói giả: mỗi lượt trả một câu mang turnId, nên hai lượt khác nhau không bị luật trùng nội dung chặn. */
const echoPack = {
  id: 'spy', ten: 'Spy', version: '1', audience: 'public', priority: 50, match: () => true,
  async handle(turn) { return { replies: [{ text: `Dạ đã nhận lượt ${turn.turnId}` }], evidence: [] }; },
};

/** Một "máy chủ" giả lập: mở store trên cùng tệp db, dựng gate + engine. boot() lại = khởi động lại. */
function may({ dbPath, channel, clock, rules, config = {}, runTask, pack = echoPack } = {}) {
  const store = openStore(dbPath);
  const gate = createGate({ store, channel, rules, now: clock.now, log: () => {} });
  const engine = createEngine({
    config, store, channel, mcp: null, registry: createRegistry([pack]), gate, now: clock.now, log: silent, runTask,
  });
  return { store, gate, engine };
}

function setup({ rules = { capChatDay: 100 }, config = {}, runTask } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'oz-recover-'));
  const dbPath = join(dir, 'bot.db');
  const clock = fakeClock(START);
  const channel = fakeChannel();
  let cur = may({ dbPath, channel, clock, rules, config, runTask });
  return {
    clock, channel, dir,
    get store() { return cur.store; },
    get gate() { return cur.gate; },
    get engine() { return cur.engine; },
    /** Khởi động lại: đóng store (mất hết trong bộ nhớ), mở lại cùng tệp db. KHÔNG tự gọi recover. */
    boot() { cur.store.close(); cur = may({ dbPath, channel, clock, rules, config, runTask }); return cur; },
    xong() { try { cur.store.close(); } catch { /* đã đóng */ } rmSync(dir, { recursive: true, force: true }); },
  };
}

let seq = 0;
/** Update đã parse, dạng webhook ghi vào inbox.raw. */
const upd = (o = {}) => ({
  updateKey: o.id ?? `t${++seq}`, event: 'message.text.received', chatId: o.chatId ?? 'c1', userId: o.userId ?? 'u1',
  userName: o.userName ?? 'Tuấn', chatType: o.chatType ?? 'PRIVATE', text: o.text ?? 'máy bơm nước', photoUrl: null,
  caption: null, messageId: o.id ?? null,
});

/** Ghi inbox đúng như core/webhook.js làm (pending, chưa xử lý) rồi để tiến trình "chết". */
function ghiInbox(store, u, at = START) {
  store.inbox.insertIgnore({
    update_key: u.updateKey, chat_id: u.chatId, user_id: u.userId ?? null, raw: JSON.stringify(u), received_at: at,
  });
}

test('engine.recover(): 2 dòng pending khác phòng + 1 done → trả 2, kênh nhận đúng 2 câu; lần hai trả 0', async () => {
  const s = setup();
  try {
    ghiInbox(s.store, upd({ id: 'p1', chatId: 'c1', userId: 'u1' }), '2026-11-04T02:59:00.000Z');
    ghiInbox(s.store, upd({ id: 'p2', chatId: 'c2', userId: 'u2' }), '2026-11-04T02:59:30.000Z');
    ghiInbox(s.store, upd({ id: 'd1', chatId: 'c3', userId: 'u3' }));
    s.store.inbox.markDone('d1', START);

    const n = await s.boot().engine.recover();
    assert.equal(n, 2, 'chỉ 2 dòng pending được nhặt lại');
    assert.deepEqual(s.channel.sent.map((m) => m.chatId), ['c1', 'c2'], 'theo thứ tự received_at');
    assert.deepEqual(s.store.inbox.pending(), []);
    assert.equal(s.store.inbox.get('p1').status, 'done');
    assert.equal(s.store.inbox.get('p2').status, 'done');

    assert.equal(await s.engine.recover(), 0, 'không còn gì để nhặt');
    assert.equal(s.channel.sent.length, 2, 'kênh không nhận thêm');
  } finally { s.xong(); }
});

test('engine.recover(): dòng processing bỏ lại (chết giữa lượt) được chạy lại', async () => {
  const s = setup();
  try {
    ghiInbox(s.store, upd({ id: 'x1' }));
    assert.equal(s.store.inbox.claim('x1', START), true);   // claim rồi tiến trình chết
    assert.equal(s.store.inbox.get('x1').status, 'processing');
    assert.equal(s.store.inbox.pending().length, 0, 'claim xong thì pending() không thấy nữa');

    assert.equal(await s.boot().engine.recover(), 1);
    assert.equal(s.channel.sent.length, 1);
    assert.equal(s.store.inbox.get('x1').status, 'done');
  } finally { s.xong(); }
});

test('engine.recover(): raw hỏng / thiếu chatId / updateKey lệch → failed, KHÔNG nhặt lại lần sau', async () => {
  const s = setup();
  try {
    const at = (n) => new Date(Date.parse(START) + n).toISOString();
    s.store.inbox.insertIgnore({ update_key: 'bad1', chat_id: 'c1', user_id: 'u1', raw: '{khong-phai-json', received_at: at(1) });
    s.store.inbox.insertIgnore({ update_key: 'bad2', chat_id: 'c1', user_id: 'u1', raw: JSON.stringify({ updateKey: 'bad2', text: 'hi' }), received_at: at(2) });
    s.store.inbox.insertIgnore({ update_key: 'bad3', chat_id: 'c1', user_id: 'u1', raw: JSON.stringify(upd({ id: 'KHAC', chatId: 'c1' })), received_at: at(3) });
    ghiInbox(s.store, upd({ id: 'ok1', chatId: 'c1' }), at(4));

    assert.equal(await s.boot().engine.recover(), 1, 'chỉ dòng dùng được mới tính là đã xử lý');
    assert.equal(s.channel.sent.length, 1);
    for (const k of ['bad1', 'bad2', 'bad3']) {
      assert.equal(s.store.inbox.get(k).status, 'failed', `${k} phải thành failed`);
      assert.match(s.store.inbox.get(k).error, /recover/);
    }
    assert.equal(s.store.inbox.get('KHAC'), null, 'updateKey lệch thì KHÔNG được tạo dòng mới');
    assert.equal(await s.engine.recover(), 0, 'dòng hỏng không được nhặt lại vòng sau');
  } finally { s.xong(); }
});

test('engine.recover(): chạy lại đi qua runTask với khoá convId (theo người, không theo phòng)', async () => {
  const khoa = [];
  const s = setup({ runTask: (key, fn) => { khoa.push(key); return fn(); } });
  try {
    ghiInbox(s.store, upd({ id: 'g1', chatId: 'G', userId: 'u1', chatType: 'GROUP' }), '2026-11-04T02:59:00.000Z');
    ghiInbox(s.store, upd({ id: 'g2', chatId: 'G', userId: 'u2', chatType: 'GROUP' }), '2026-11-04T02:59:30.000Z');
    ghiInbox(s.store, upd({ id: 'r1', chatId: 'c9', userId: 'u9' }));

    assert.equal(await s.boot().engine.recover(), 3);
    assert.deepEqual(khoa, ['G:u1', 'G:u2', 'c9']);
  } finally { s.xong(); }
});

test('engine.recover(): một lượt lỗi thì các lượt còn lại vẫn chạy', async () => {
  const s = setup({ runTask: (key, fn) => (key === 'c1' ? Promise.reject(new Error('hàng đợi sập')) : fn()) });
  try {
    ghiInbox(s.store, upd({ id: 'e1', chatId: 'c1', userId: 'u1' }), '2026-11-04T02:59:00.000Z');
    ghiInbox(s.store, upd({ id: 'e2', chatId: 'c2', userId: 'u2' }));

    // Trả 1, không phải 2: chỉ đếm lượt CHẠY ĐƯỢC, đúng chữ "số tin pending ĐÃ XỬ LÝ" (`tasks.md:344`).
    assert.equal(await s.boot().engine.recover(), 1);
    assert.deepEqual(s.channel.sent.map((m) => m.chatId), ['c2']);
    assert.equal(s.store.inbox.get('e1').status, 'pending', 'lượt lỗi còn pending để boot sau nhặt lại');
  } finally { s.xong(); }
});

test('boot đủ bộ: gate.recover() TRƯỚC rồi sweep → chỉ gửi các phần CÒN THIẾU của tin dài', async () => {
  const s = setup();
  try {
    // Tiến trình cũ chết giữa lúc gửi tin 3 phần: phần 1 đã bay, dòng outbox còn 'queued'.
    const text = `${'a'.repeat(1990)}\n\n${'b'.repeat(1990)}\n\n${'c'.repeat(100)}`;
    const id = s.store.outbox.insert({
      idem_key: 'r:c1:t9:0', conv_id: 'c1', chat_id: 'c1', turn_id: 't9', kind: 'reply', text,
      decision: 'send', reason: 'ok', status: 'queued', parts_sent: 1, created_at: START,
      ctx: { inReplyToAt: START, pack: null, evidenceNumbers: [], debt: false, isGroup: false },
    });

    const m = s.boot();
    assert.equal(m.gate.recover(), 1, 'dòng queued mồ côi thành failed');
    assert.equal(s.store.outbox.get(id).status, 'failed');
    assert.equal(await m.gate.sweep(), 1);

    assert.equal(s.channel.sent.length, 2, 'chỉ phần 2 và 3');
    assert.match(s.channel.sent[0].text, /^b+$/);
    assert.match(s.channel.sent[1].text, /^c+$/);
    assert.equal(s.store.outbox.get(id).status, 'sent');
    assert.equal(s.store.outbox.get(id).parts_sent, 3);
  } finally { s.xong(); }
});

test('boot đủ bộ: inbox pending + outbox queued cùng tồn tại → khách nhận đủ, không nhận trùng', async () => {
  const s = setup();
  try {
    s.store.outbox.insert({
      idem_key: 'r:c1:t9:0', conv_id: 'c1', chat_id: 'c1', turn_id: 't9', kind: 'reply', text: 'Câu dở dang của lượt trước',
      decision: 'send', reason: 'ok', status: 'queued', parts_sent: 0, created_at: START,
      ctx: { inReplyToAt: START, pack: null, evidenceNumbers: [], debt: false, isGroup: false },
    });
    ghiInbox(s.store, upd({ id: 'n1', chatId: 'c2', userId: 'u2' }));

    const m = s.boot();
    assert.equal(m.gate.recover(), 1);
    assert.equal(await m.engine.recover(), 1);
    await m.gate.sweep();

    assert.deepEqual(s.channel.sent.map((x) => x.chatId).sort(), ['c1', 'c2']);
    // Chạy lại cả vòng boot: idempotency của cửa chặn tin thứ hai.
    const m2 = s.boot();
    assert.equal(m2.gate.recover(), 0);
    assert.equal(await m2.engine.recover(), 0);
    await m2.gate.sweep();
    assert.equal(s.channel.sent.length, 2);
  } finally { s.xong(); }
});

// Quan trọng: `core/webhook.js:64` lưu `inbox.raw` là payload GỐC của Zalo (chưa parse), không phải
// update đã parse. recover() phải parse lại bằng ĐÚNG kênh thật và ra lại updateKey y như cũ — nếu
// không thì process() ghi một dòng inbox khác và dòng cũ treo lại mãi.
for (const [ten, payload] of [
  ['có message_id', { event_name: 'message.text.received', message: { message_id: 'mid-1', chat: { id: 'c1', chat_type: 'PRIVATE' }, from: { id: 'u1', display_name: 'Tuấn' }, text: 'máy bơm nước' } }],
  ['KHÔNG có message_id (updateKey = sha1 raw)', { event_name: 'message.text.received', message: { chat: { id: 'c1', chat_type: 'PRIVATE' }, from: { id: 'u1', display_name: 'Tuấn' }, text: 'máy bơm nước' } }],
]) {
  test(`engine.recover(): dựng lại từ payload GỐC của Zalo — ${ten}`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'oz-recover-raw-'));
    try {
      const dbPath = join(dir, 'bot.db');
      const clock = fakeClock(START);
      const channel = { ...fakeChannel(), parse: zaloParse };   // kênh THẬT ở chỗ parse
      const u = zaloParse(payload);
      // Gói trả câu KHÔNG mang turnId: khi không có message_id thì turnId là sha1, mà chuỗi sha1
      // trong tin ra bị cửa chặn đúng luật `leak:secret` (Điều IX) — không liên quan tới T020.
      const pack = { ...echoPack, async handle() { return { replies: [{ text: 'Dạ bot đã nhận' }], evidence: [] }; } };
      let m = may({ dbPath, channel, clock, rules: { capChatDay: 100 }, pack });
      // Webhook: ghi payload gốc vào inbox.raw rồi tiến trình chết trước khi xử lý.
      m.store.inbox.insertIgnore({ update_key: u.updateKey, chat_id: u.chatId, user_id: u.userId, raw: JSON.stringify(payload), received_at: START });
      m.store.close();

      m = may({ dbPath, channel, clock, rules: { capChatDay: 100 }, pack });
      assert.equal(await m.engine.recover(), 1);
      assert.equal(channel.sent.length, 1);
      assert.equal(m.store.inbox.get(u.updateKey).status, 'done', 'phải đánh dấu ĐÚNG dòng cũ');
      assert.equal(m.store.inbox.pending().length, 0, 'không được sinh dòng inbox mới');
      m.store.close();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

// ----------------------------------------------------------------------------------------------
// Mốc giờ của lượt phát lại. Lượt phát lại phải mang mốc khách nhắn THẬT (`inbox.received_at`),
// không phải lúc bot lên lại: nếu đóng dấu now() thì cửa coi mọi tin phát lại là "trả lời trực tiếp"
// (`core/gate-decide.js:27-31`) và bỏ qua cả giờ yên — khách nhắn 22:50 bị bot nhắn lúc 1 giờ sáng.
// Khe này mở ra khi thời gian khởi động lại > directReplyMs (10 phút): crash-loop có backoff, VPS
// sập đêm, deploy kẹt.
const NHAN_2250 = '2026-11-04T15:50:00.000Z'; // 22:50 VN
const LEN_0100 = '2026-11-04T18:00:00.000Z';  // 01:00 VN — giữa giờ yên 23:00–07:00
const SANG_0700 = '2026-11-05T00:00:00.000Z'; // 07:00 VN hôm sau

test('phát lại trong giờ yên: khách nhắn 22:50 VN, bot lên lại 01:00 VN → KHÔNG gửi ngay, hoãn tới 07:00', async () => {
  const s = setup();
  try {
    ghiInbox(s.store, upd({ id: 'q1', chatId: 'c1', userId: 'u1' }), NHAN_2250);

    s.clock.set(LEN_0100);
    assert.equal(await s.boot().engine.recover(), 1, 'dòng vẫn phải được nhặt lại (không bỏ rơi tin khách)');
    assert.deepEqual(s.channel.sent, [], 'KHÔNG được gửi lúc 1 giờ sáng (giờ yên, hiến pháp "Ràng buộc kỹ thuật")');

    // Phải là 'defer quiet-hours', KHÔNG phải 'reject proactive-no-debt': tin khách chưa ai trả lời là
    // một món nợ với khách, khác hẳn ca FR-015 (khách im mà máy tự nhắn). Reject ở đây là mất tin (SC-001).
    const o = s.store.outbox.get(1);
    assert.equal(o.decision, 'defer');
    assert.equal(o.reason, 'quiet-hours');
    assert.equal(o.not_before, SANG_0700);

    // 07:00 VN: bộ quét chạy lại decide đầy đủ và giao tin — khách vẫn nhận được, chỉ muộn hơn.
    s.clock.set(SANG_0700);
    assert.equal(await s.gate.sweep(), 1);
    assert.equal(s.channel.sent.length, 1, 'tới sáng thì khách nhận đúng một lần');
    assert.equal(s.store.outbox.get(1).status, 'sent');
  } finally { s.xong(); }
});

test('phát lại ngoài giờ yên sau khe dài hơn 10 phút → vẫn gửi ngay, không bị reject proactive-no-debt', async () => {
  const s = setup();
  try {
    ghiInbox(s.store, upd({ id: 'q2', chatId: 'c1', userId: 'u1' }), '2026-11-04T02:00:00.000Z'); // 09:00 VN

    s.clock.set('2026-11-04T03:00:00.000Z'); // 10:00 VN — khe 1 giờ, quá directReplyMs
    assert.equal(await s.boot().engine.recover(), 1);
    assert.equal(s.channel.sent.length, 1, 'ban ngày thì trả lời ngay, đừng bắt khách chờ');
    assert.equal(s.store.outbox.get(1).reason, 'ok');
  } finally { s.xong(); }
});

test('Điều IV: bản ghi của lượt phát lại ghi mốc khách nhắn THẬT, không phải lúc bot lên lại', async () => {
  const s = setup();
  try {
    ghiInbox(s.store, upd({ id: 'q3', chatId: 'c1', userId: 'u1', text: 'máy bơm nước' }), NHAN_2250);

    s.clock.set(LEN_0100);
    assert.equal(await s.boot().engine.recover(), 1);

    const khach = s.store.messages.recent('c1', 5).find((m) => m.speaker === 'khach');
    assert.equal(khach.at, NHAN_2250, 'lịch sử hội thoại phải ghi 22:50, không phải 01:00');

    // Dòng audit giữ `at` = lúc ghi sổ (đúng sự thật), và mang thêm mốc khách nhắn để tra lại được.
    const vao = s.store.audit.byTurn('q3').find((a) => a.type === 'inbound');
    assert.equal(vao.data.receivedAt, NHAN_2250);
    assert.equal(s.store.convs.get('c1').last_inbound_at, NHAN_2250);
  } finally { s.xong(); }
});

test('phát lại giờ yên: không có dòng outbox nào bị reject (tin khách không được âm thầm mất)', async () => {
  const s = setup();
  try {
    for (const i of [1, 2, 3]) ghiInbox(s.store, upd({ id: `z${i}`, chatId: `c${i}`, userId: `u${i}` }), NHAN_2250);

    s.clock.set(LEN_0100);
    assert.equal(await s.boot().engine.recover(), 3);
    for (const i of [1, 2, 3]) {
      assert.equal(s.store.outbox.get(i).decision, 'defer', `dòng ${i} phải hoãn, không được reject`);
    }
    s.clock.set(SANG_0700);
    await s.gate.sweep();
    assert.deepEqual(s.channel.sent.map((m) => m.chatId).sort(), ['c1', 'c2', 'c3']);
  } finally { s.xong(); }
});

// ----------------------------------------------------------------------------------------------
// Bộ chặn tốc độ (`core/engine.js:38-45`) là cửa sổ 60 giây theo now() trong bộ nhớ. recover() chạy
// cả tồn đọng ở CÙNG một mốc now(), nên tin thứ 11 trở đi của cùng một người bị coi là "gửi quá nhanh"
// — dù khách đã rải chúng ra hàng giờ. Đường thường không bao giờ gộp nhiều giờ lưu lượng vào một cửa
// sổ 60 giây; chỉ đường phát lại mới gộp. Để nguyên thì lượt 11 nhận câu "gửi hơi nhanh", lượt 12+ bị
// cửa drop similar:1.00, và cả 4 dòng inbox vẫn markDone → câu hỏi thật MẤT VĨNH VIỄN (phá SC-001).
test('phát lại: tồn đọng 14 tin của CÙNG một người → trả lời đủ 14, không ai bị "gửi hơi nhanh"', async () => {
  const s = setup({ rules: { capChatDay: 1000 } });
  try {
    // Khách rải 14 tin trên gần 2 giờ (ca "VPS sập đêm"): 8 phút một tin, không hề spam.
    const T0 = Date.parse('2026-11-04T00:00:00.000Z');
    for (let i = 1; i <= 14; i++) {
      ghiInbox(s.store, upd({ id: `rl${i}`, chatId: 'c1', userId: 'u1', text: `câu hỏi số ${i}` }), new Date(T0 + i * 8 * 60_000).toISOString());
    }

    s.clock.set('2026-11-04T03:00:00.000Z');   // 10:00 VN — ngoài giờ yên, mọi lượt đáng được trả lời ngay
    assert.equal(await s.boot().engine.recover(), 14);

    assert.equal(s.channel.sent.length, 14, 'đủ 14 câu trả lời — không lượt nào bị bộ chặn tốc độ ăn mất');
    const nhanh = s.channel.sent.filter((m) => /gửi hơi nhanh/i.test(m.text));
    assert.deepEqual(nhanh, [], 'không được gửi câu "Bạn gửi hơi nhanh…" cho tin phát lại');
    // Mỗi lượt phải có đúng câu trả lời của nó (không bị drop similar vì trùng câu "gửi hơi nhanh").
    for (let i = 1; i <= 14; i++) {
      assert.ok(s.channel.sent.some((m) => m.text.includes(`lượt rl${i}`)), `thiếu câu trả lời cho lượt rl${i}`);
    }
  } finally { s.xong(); }
});

test('phát lại: bộ chặn tốc độ vẫn còn tác dụng với tin MỚI vào sau khi recover xong', async () => {
  const s = setup({ rules: { capChatDay: 1000 } });
  try {
    const T0 = Date.parse('2026-11-04T00:00:00.000Z');
    for (let i = 1; i <= 12; i++) {
      ghiInbox(s.store, upd({ id: `k${i}`, chatId: 'c1', userId: 'u1', text: `câu hỏi số ${i}` }), new Date(T0 + i * 8 * 60_000).toISOString());
    }
    s.clock.set('2026-11-04T03:00:00.000Z');
    const m = s.boot();
    assert.equal(await m.engine.recover(), 12);
    assert.equal(s.channel.sent.length, 12);

    // Giờ khách spam thật 11 tin trong cùng một phút trên ĐƯỜNG THƯỜNG (ngưỡng là 10): bộ chặn phải
    // chặn lại. Nếu bản vá tắt bộ chặn cho cả đường thường thì test này đỏ.
    // Lượt phát lại ở trên KHÔNG được tính vào cửa sổ 60 giây, nếu không tin thứ nhất đã bị chặn.
    for (let i = 1; i <= 11; i++) await m.engine.process(upd({ id: `spam${i}`, chatId: 'c1', userId: 'u1', text: `spam ${i}` }));
    const nhanh = s.channel.sent.filter((x) => /gửi hơi nhanh/i.test(x.text));
    assert.equal(nhanh.length, 1, 'khách spam thật trên đường thường vẫn phải nhận đúng một câu nhắc');
  } finally { s.xong(); }
});

test('phát lại trong giờ yên: KHÔNG được hoãn câu "gửi hơi nhanh" tới 07:00 (Điều VIII)', async () => {
  const s = setup({ rules: { capChatDay: 1000 } });
  try {
    // 14 tin rải 2 giờ tối, bot lên lại lúc 01:00 VN. Không lượt nào được sinh ra câu "gửi hơi nhanh";
    // nếu có, nó mang debt:true nên sẽ được hoãn tới 07:00 rồi giao — khách nhận một câu vô nghĩa
    // sáng hôm sau THAY CHO câu trả lời cho tin đã gửi từ đêm trước.
    const T0 = Date.parse('2026-11-04T14:00:00.000Z'); // 21:00 VN
    for (let i = 1; i <= 14; i++) {
      ghiInbox(s.store, upd({ id: `n${i}`, chatId: 'c1', userId: 'u1', text: `câu hỏi số ${i}` }), new Date(T0 + i * 8 * 60_000).toISOString());
    }

    s.clock.set(LEN_0100);
    assert.equal(await s.boot().engine.recover(), 14);
    s.clock.set(SANG_0700);
    for (let q = 0; q < 10 && (await s.gate.sweep()) > 0; q++) { /* giao hết tin đã hoãn */ }

    const nhanh = s.channel.sent.filter((m) => /gửi hơi nhanh/i.test(m.text));
    assert.deepEqual(nhanh, [], 'không được giao câu "gửi hơi nhanh" cho khách sáng hôm sau');
    assert.equal(s.channel.sent.length, 14, 'khách nhận đủ 14 câu trả lời thật');
  } finally { s.xong(); }
});

test('server.js gọi gate.recover() TRƯỚC engine.recover() lúc khởi động', () => {
  const src = readFileSync(SERVER, 'utf8');
  const g = src.indexOf('gate.recover()');
  const e = src.indexOf('engine.recover()');
  assert.ok(g >= 0, 'server.js phải gọi gate.recover()');
  assert.ok(e >= 0, 'server.js phải gọi engine.recover()');
  assert.ok(g < e, 'gate.recover() phải đứng trước engine.recover() (contracts/send-gate.md:52)');
});
