import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convIdOf } from '../../core/conv.js';
import { loadConfig } from '../../core/config.js';
import { decide, DEFAULT_RULES } from '../../core/gate-decide.js';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createEngine } from '../../core/engine.js';
import { createRegistry } from '../../core/registry.js';
import { fakeChannel, fakeClock, fakeMcp } from '../helpers/fakes.mjs';

const NOW = '2026-11-04T03:00:00.000Z'; // 10:00 VN
const T = '2026-11-04T07:16:00.000Z';
const at = (min) => new Date(Date.parse(T) + min * 60_000).toISOString();
const msg = { kind: 'reply', text: 'Dạ mã 8413.70.90', inReplyToAt: NOW };
const facts = (f = {}) => ({ chatState: 'bot', idemExists: false, hasOpenJob: false, recentBotTexts: [], sentTodayChat: 0, sentTodayAll: 0, now: NOW, ...f });

test('convIdOf: chat 1-1 → chatId', () => {
  assert.equal(convIdOf({ chatId: 'u1', userId: 'u1' }), 'u1');
  assert.equal(convIdOf({ chatId: 'u1', userId: 'u2', isGroup: false }), 'u1');
});

test('convIdOf: nhóm → chatId:userId', () => {
  assert.equal(convIdOf({ chatId: 'g1', userId: 'A', isGroup: true }), 'g1:A');
  assert.equal(convIdOf({ chatId: 'g1', userId: 'A', chatType: 'group' }), 'g1:A');
});

test('convIdOf: nhóm thiếu userId → cả nhóm; thiếu chatId → ném lỗi', () => {
  assert.equal(convIdOf({ chatId: 'g1', isGroup: true }), 'g1');
  assert.throws(() => convIdOf({ userId: 'A' }), /chatId/);
});

test('config: capGroupDay mặc định 200, đọc CAP_GROUP_DAY, sai thì ném lỗi', () => {
  const min = { ZALO_BOT_TOKEN: 'x' };
  assert.equal(loadConfig(min).capGroupDay, 200);
  assert.equal(loadConfig({ ...min, CAP_GROUP_DAY: '9' }).capGroupDay, 9);
  assert.throws(() => loadConfig({ ...min, CAP_GROUP_DAY: '-1' }), /CAP_GROUP_DAY/);
  assert.throws(() => loadConfig({ ...min, CAP_GROUP_DAY: 'abc' }), /CAP_GROUP_DAY/);
});

test('decide: cap:group khi nhóm đã gửi đủ trần ngày', () => {
  const d = decide(msg, facts({ isGroup: true, sentTodayGroup: 200 }));
  assert.deepEqual(d, { decision: 'defer', reason: 'cap:group' });
  assert.equal(decide(msg, facts({ isGroup: true, sentTodayGroup: 199 })).decision, 'send');
});

test('decide: không có isGroup thì không dính cap:group', () => {
  const d = decide(msg, facts({ sentTodayGroup: 999 }));
  assert.notEqual(d.reason, 'cap:group');
});

test('decide: cap:chat đứng trước cap:group', () => {
  const d = decide(msg, facts({ isGroup: true, sentTodayChat: 8, sentTodayGroup: 999 }));
  assert.equal(d.reason, 'cap:chat');
  assert.equal(DEFAULT_RULES.capGroupDay, 200);
});

// --- Lưu trữ theo conv_id (T037) ---
const ob = (o = {}) => ({ idem_key: 'r:c:m1:0', chat_id: 'c', kind: 'reply', text: 'a', decision: 'send', status: 'queued', created_at: T, ...o });
const job = (o = {}) => ({ chat_id: 'g1', session_key: 'g1:A', pack: 'hs', ma_luot: 'L1', result_tool: 't', status: 'waiting', next_poll_at: at(1), expires_at: at(30), created_at: T, ...o });

test('convs: upsertSeen giữ state; setState tạo dòng nếu thiếu', () => {
  const s = openStore();
  assert.equal(s.convs.get('g1:A'), null);
  s.convs.upsertSeen('g1:A', 'g1', 'A', 'An', T);
  let c = s.convs.get('g1:A');
  assert.deepEqual([c.chat_id, c.user_id, c.display_name, c.state], ['g1', 'A', 'An', 'bot']);
  s.convs.upsertSeen('g1:A', 'g1', 'A', 'An', at(1));
  assert.equal(s.convs.get('g1:A').state, 'bot');
  s.convs.setState('g1:A', 'g1', 'human', 'u1', 'xin-nguoi', at(2));
  c = s.convs.get('g1:A');
  assert.deepEqual([c.state, c.state_by, c.state_reason, c.state_at], ['human', 'u1', 'xin-nguoi', at(2)]);
  s.convs.upsertSeen('g1:A', 'g1', 'A', 'An', at(3)); // gặp lại: không đụng state
  assert.equal(s.convs.get('g1:A').state, 'human');
  s.convs.setState('g1:B', 'g1', 'human', 'u1', 'x', at(4)); // conv chưa có → tự tạo dòng
  assert.equal(s.convs.get('g1:B').state, 'human');
  assert.equal(s.convs.get('g1:B').chat_id, 'g1'); // chat_id là phòng, KHÔNG phải conv_id
});

test('tickets: khoá theo conv_id, mỗi người một phiếu', () => {
  const s = openStore();
  const a = s.tickets.open('g1:A', 'g1', 'cap', T);
  const b = s.tickets.open('g1:B', 'g1', 'cap', T);
  assert.notEqual(a.id, b.id);
  assert.equal(a.chat_id, 'g1');
  assert.equal(s.tickets.openFor('g1:A').id, a.id);
  assert.equal(s.tickets.openFor('g1:B').id, b.id);
  assert.equal(s.tickets.open('g1:A', 'g1', 'cap', at(1)).id, a.id);
});

test('outbox/messages/jobs: lọc theo conv_id, đếm theo chat_id cho nhóm', () => {
  const s = openStore();
  s.outbox.insert(ob({ idem_key: 'kA', conv_id: 'g1:A', chat_id: 'g1', text: 'A', status: 'sent', sent_at: at(1) }));
  s.outbox.insert(ob({ idem_key: 'kB', conv_id: 'g1:B', chat_id: 'g1', text: 'B', status: 'sent', sent_at: at(2) }));
  assert.equal(s.outbox.countSent('g1:A', T), 1);
  assert.equal(s.outbox.countSentChat('g1', T), 2);
  assert.deepEqual(s.outbox.recentBotTexts('g1:A', T, 10), ['A']);
  s.messages.add({ conv_id: 'g1:A', chat_id: 'g1', speaker: 'khach', text: 'A', at: at(1) });
  s.messages.add({ conv_id: 'g1:B', chat_id: 'g1', speaker: 'khach', text: 'B', at: at(2) });
  assert.deepEqual(s.messages.recent('g1:A', 5).map((r) => r.text), ['A']);
  s.jobs.add(job({ conv_id: 'g1:A' }));
  assert.equal(s.jobs.openFor('g1:A', T), true);
  assert.equal(s.jobs.openFor('g1:B', T), false);
});

// ---------- Cửa: nối conv_id (T037) ----------
const START = '2026-11-04T03:00:00.000Z'; // 10:00 VN

/** Cửa giả: kênh giả + đồng hồ ảo + bắt onAlert/onTicket. */
function gsetup({ rules, start = START } = {}) {
  const store = openStore(':memory:');
  const clock = fakeClock(start);
  const ch = fakeChannel();
  const alerts = [];
  const tickets = [];
  const gate = createGate({
    store, channel: ch, rules, now: clock.now,
    onAlert: (c, r) => alerts.push([c, r]),
    onTicket: (c, r) => tickets.push([c, r]),
  });
  const gmsg = (o = {}) => ({
    idemKey: 'k1', chatId: 'g1', convId: 'g1:A', isGroup: true, turnId: 't1', kind: 'reply',
    text: 'Dạ mã 8413.70.90', inReplyToAt: clock.now().toISOString(), ...o,
  });
  /** Nạp tin đã gửi (kind 'ticket' để không dính chống trùng nội dung). */
  const seed = (n, o = {}) => {
    for (let i = 0; i < n; i++) {
      store.outbox.insert({
        idem_key: `${o.key ?? 'seed'}:${i}`, conv_id: o.conv_id ?? 'g1:X', chat_id: o.chat_id ?? 'g1',
        kind: 'ticket', text: `phiếu ${o.key ?? 'seed'} số ${i}`, decision: 'send', reason: 'ok',
        status: 'sent', created_at: START, sent_at: START,
      });
    }
  };
  return { store, clock, ch, gate, alerts, tickets, gmsg, seed };
}

test('cửa: A chạm trần 8 tin → A defer cap:chat, B vẫn send', async () => {
  const { gate, seed, gmsg, ch } = gsetup({ rules: { capChatDay: 8 } });
  seed(8, { key: 'A', conv_id: 'g1:A' });
  const a = await gate.send(gmsg({ idemKey: 'a1' }));
  assert.deepEqual([a.decision, a.reason], ['defer', 'cap:chat']);
  const b = await gate.send(gmsg({ idemKey: 'b1', convId: 'g1:B' }));
  assert.equal(b.decision, 'send');
  assert.equal(ch.sent.length, 1);
});

test('cửa: 30 người cùng câu trong 5 phút → 30 tin send, không similar', async () => {
  const { gate, ch, gmsg } = gsetup();
  for (let i = 1; i <= 30; i++) {
    const r = await gate.send(gmsg({ idemKey: `k${i}`, convId: `g1:u${i}`, text: '8413.70.90' }));
    assert.equal(r.decision, 'send', `u${i}: ${r.reason}`);
  }
  assert.equal(ch.sent.length, 30);
  const r = await gate.send(gmsg({ idemKey: 'k31', convId: 'g1:u1', text: '8413.70.90' }));
  assert.equal(r.decision, 'drop');
  assert.match(r.reason, /^similar:/);
});

test('cửa: convs.setState("g1:B","human") → A send, B reject chat-human', async () => {
  const { gate, store, gmsg } = gsetup();
  store.convs.setState('g1:B', 'g1', 'human', 'nv', 'xin-nguoi', START);
  const a = await gate.send(gmsg({ idemKey: 'a1' }));
  assert.equal(a.decision, 'send');
  const b = await gate.send(gmsg({ idemKey: 'b1', convId: 'g1:B' }));
  assert.deepEqual([b.decision, b.reason], ['reject', 'chat-human']);
});

test('cửa: chats.setState("g1","blocked") → cả A và B reject chat-blocked', async () => {
  const { gate, store, gmsg } = gsetup();
  store.chats.setState('g1', 'blocked', 'nv', 'xoá', START);
  const a = await gate.send(gmsg({ idemKey: 'a1' }));
  const b = await gate.send(gmsg({ idemKey: 'b1', convId: 'g1:B' }));
  assert.deepEqual([a.reason, b.reason], ['chat-blocked', 'chat-blocked']);
});

test('cửa: nhóm chạm CAP_GROUP_DAY → defer cap:group + onAlert(chatId)', async () => {
  const { gate, seed, gmsg, alerts } = gsetup({ rules: { capGroupDay: 200 } });
  seed(200, { key: 'G' });
  const r = await gate.send(gmsg({ idemKey: 'a1' }));
  assert.deepEqual([r.decision, r.reason], ['defer', 'cap:group']);
  assert.deepEqual(alerts, [['g1', 'cap:group']]);
});

test('cửa: msg có convId → outbox và messages ghi conv_id', async () => {
  const { gate, store, gmsg } = gsetup();
  const r = await gate.send(gmsg({ idemKey: 'a1', convId: 'g1:A', chatId: 'g1', isGroup: true }));
  assert.equal(store.outbox.get(r.id).conv_id, 'g1:A');
  const ms = store.messages.recent('g1:A', 5);
  assert.equal(ms.length, 1);
  assert.equal(ms[0].speaker, 'bot');
  assert.equal(ms[0].conv_id, 'g1:A');
});

test('cửa: phiếu send-failed khoá theo conv_id, không theo chat_id', async () => {
  const { gate, store, tickets } = gsetup();
  store.outbox.insert({
    idem_key: 'x1', conv_id: 'g1:A', chat_id: 'g1', kind: 'reply', text: 'trả lời muộn',
    decision: 'send', reason: 'ok', status: 'failed', attempts: 1, next_retry_at: START, created_at: START,
    ctx: { isGroup: true },
  });
  await gate.sweep();
  assert.deepEqual(tickets, [['g1:A', 'send-failed']]);
});

// ---------- Lõi: nối conv_id (T037) ----------
const silent = { info() {}, error() {} };

function esetup({ packs, script = {} } = {}) {
  const store = openStore(':memory:');
  const clock = fakeClock(START);
  const channel = fakeChannel();
  const mcp = fakeMcp(script);
  const registry = createRegistry(packs);
  const gate = createGate({ store, channel, now: clock.now });
  const engine = createEngine({ config: {}, store, channel, mcp, vision: null, registry, gate, now: clock.now, log: silent });
  return { store, clock, channel, mcp, engine };
}

/** Gói giả: ghi lại turn/ctx, trả một câu. */
const spyPack = (onHandle) => ({
  id: 'spy', ten: 'Spy', version: '1', audience: 'public', priority: 50, match: () => true,
  async handle(turn, ctx) { onHandle?.(turn, ctx); return { replies: [{ text: 'Dạ, bot nhận' }], evidence: [] }; },
});

const gupd = (text, userId, o = {}) => ({
  updateKey: o.id ?? `${userId}:${text}`, event: 'message.text.received',
  chatId: 'g1', userId, userName: userId, chatType: 'GROUP', text, photoUrl: null, caption: null, messageId: null, ...o,
});

test('lõi: trong nhóm idemKey r:<convId>:<turn>:<i> và turn ghi conv_id', async () => {
  const { store, engine } = esetup({ packs: [spyPack()] });
  await engine.process(gupd('xin chào', 'A', { id: 'k1' }));
  assert.ok(store.outbox.hasIdem('r:g1:A:k1:0'));
  const ms = store.messages.recent('g1:A', 5);
  assert.equal(ms.length, 2);                       // tin khách + tin bot, cùng conv
  assert.equal(ms[0].speaker, 'khach');
  assert.equal(ms[0].conv_id, 'g1:A');
});

test('lõi: closer chỉ xét tin bot cuối của chính conv', async () => {
  const { engine } = esetup({ packs: [spyPack()] });
  await engine.process(gupd('máy bơm', 'A', { id: 'm1' }));   // bot trả lời A
  const rb = await engine.process(gupd('cảm ơn ạ', 'B', { id: 'm2' }));
  assert.equal(rb.skipped, undefined);                       // B chưa có tin bot nào
  assert.equal(rb.handled, 'spy');
  const ra = await engine.process(gupd('cảm ơn ạ', 'A', { id: 'm3' }));
  assert.equal(ra.skipped, 'closer');                        // A vừa được bot trả lời
});

test('lõi: history chỉ trong conv của mình', async () => {
  const hist = [];
  const pack = spyPack((turn, ctx) => hist.push({ user: turn.userId, h: ctx.history(10).map((m) => m.text) }));
  const { engine } = esetup({ packs: [pack] });
  await engine.process(gupd('câu của A', 'A', { id: 'h1' }));
  await engine.process(gupd('câu của B', 'B', { id: 'h2' }));
  assert.deepEqual(hist[0].h, ['câu của A']);
  assert.deepEqual(hist[1].h, ['câu của B']);
});

test('việc nền: job ghi conv_id, idemKey j:<convId>:<maLuot>, openFor theo conv', async () => {
  const jobPack = {
    id: 'jp', audience: 'public', priority: 9, match: () => true,
    async handle(turn) { return { replies: [{ text: 'chờ' }], jobs: [{ maLuot: 'L1', resultTool: 'kq' }] }; },
    async onJobResult(job) { return { replies: [{ text: `Xong ${job.maLuot}` }] }; },
  };
  const { store, clock, engine } = esetup({ packs: [jobPack], script: { kq: () => ({ ok: true, trangThai: 'XONG' }) } });
  await engine.process(gupd('làm việc', 'A', { id: 'v1' }));
  assert.equal(store.jobs.openFor('g1:A', START), true);
  assert.equal(store.jobs.openFor('g1:B', START), false);
  clock.advance('6s');
  await engine.drain();
  assert.ok(store.outbox.hasIdem('j:g1:A:L1'));
});

test('lõi: dòng audit loại tool trong nhóm có conv_id', async () => {
  const toolPack = {
    id: 'tp', ten: 'Tool', version: '1', audience: 'public', priority: 50, match: () => true,
    async handle(turn, ctx) {
      await ctx.mcp.callTool('tra_thue', { maHs: '84137090' });
      return { replies: [{ text: 'Xong' }] };
    },
  };
  const { store, engine } = esetup({ packs: [toolPack], script: { tra_thue: () => ({ ok: true, data: { nk: 5 } }) } });
  await engine.process(gupd('tra thuế', 'A', { id: 't1' }));
  const tool = store.audit.byTurn('t1').find((a) => a.type === 'tool');
  assert.ok(tool, 'phải có dòng audit loại tool');
  assert.equal(tool.conv_id, 'g1:A');
  assert.equal(tool.chat_id, 'g1');
});
