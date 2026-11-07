import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createRegistry } from '../../core/registry.js';
import { createEngine, GENERIC_ERROR_TEXT } from '../../core/engine.js';
import hsPack from '../../packs/hs/index.js';
import { fakeChannel, fakeClock, fakeMcp } from '../helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z'; // 10:00 VN
const silent = { info() {}, error() {} };

/** Câu báo lỗi chung — nguyên văn đường cũ (lib/bot.js:214, packs/hs/index.js:91): có thẻ màu {orange}. */
const CLOI_CHUAN = '{orange}⚠️ Cổng tra cứu OZ đang lỗi tạm thời{/orange}. Bạn thử lại sau ít phút nhé.';

function setup({ packs = [hsPack], script = {}, config = {}, rules, mcp, log = silent } = {}) {
  const store = openStore();
  const clock = fakeClock(START);
  const channel = fakeChannel();
  channel.typed = [];
  channel.typing = async (c) => { channel.typed.push(c); };
  const m = mcp ?? fakeMcp(script);
  const registry = createRegistry(packs);
  const gate = createGate({ store, channel, rules, now: clock.now });
  const engine = createEngine({ config, store, channel, mcp: m, vision: null, registry, gate, now: clock.now, log });
  return { store, clock, channel, mcp: m, engine };
}

let seq = 0;
const upd = (text, o = {}) => ({
  updateKey: o.id ?? `t${++seq}`, event: 'message.text.received', chatId: o.chatId ?? 'c1', userId: o.userId ?? 'u1',
  userName: o.userName ?? 'Tuấn', chatType: o.chatType ?? 'PRIVATE', text, photoUrl: null, caption: null, messageId: o.id ?? null, ...o.extra,
});
const grp = (text, userId, o = {}) => upd(text, { chatId: 'G', userId, userName: userId, chatType: 'GROUP', ...o });

/** Gói giả: ghi lại turn/ctx, trả các câu do `reply(turn, ctx, n)` dựng. */
function spyPack(reply = (turn) => [`Dạ, bot nhận: ${turn.text}`], extra = {}) {
  const seen = [];
  return {
    seen,
    pack: {
      id: 'spy', ten: 'Spy', version: '1', audience: 'public', priority: 50, match: () => true,
      async handle(turn, ctx) { seen.push({ turn, ctx }); return { replies: reply(turn, ctx, seen.length).map((text) => ({ text })), evidence: [] }; },
      ...extra,
    },
  };
}

test('mỗi lượt ghi audit inbound → route → outbound với cùng turnId', async () => {
  const { store, engine } = setup();
  const r = await engine.process(upd('xin chào', { id: 'a1' }));
  assert.equal(r.turnId, 'a1');
  assert.equal(r.handled, 'hs');
  const types = store.audit.byTurn('a1').map((a) => a.type).filter((t) => ['inbound', 'route', 'outbound'].includes(t));
  assert.deepEqual(types, ['inbound', 'route', 'outbound']);
  assert.equal(store.inbox.get('a1').status, 'done');
});

test('gói trả 2 replies → idemKey r:<chat>:<turn>:0 và :1', async () => {
  const { pack } = spyPack(() => ['Câu thứ nhất về thuế', 'Câu thứ hai khác hẳn']);
  const { store, channel, engine } = setup({ packs: [pack] });
  await engine.process(upd('hỏi', { id: 'b1' }));
  assert.ok(store.outbox.hasIdem('r:c1:b1:0'));
  assert.ok(store.outbox.hasIdem('r:c1:b1:1'));
  assert.deepEqual(channel.sent.map((s) => s.text), ['Câu thứ nhất về thuế', 'Câu thứ hai khác hẳn']);
});

test('isCloser("cảm ơn ạ") sau khi bot vừa trả lời → không gửi gì, audit skipped:closer', async () => {
  const { pack, seen } = spyPack();
  const { store, channel, engine } = setup({ packs: [pack] });
  await engine.process(upd('cảm ơn ạ', { id: 'c0' }));             // chưa có câu bot nào → vẫn tới gói
  await engine.process(upd('máy bơm', { id: 'c1' }));
  const r = await engine.process(upd('cảm ơn ạ', { id: 'c2' }));
  assert.equal(r.skipped, 'closer');
  assert.equal(seen.length, 2);
  assert.equal(channel.sent.length, 2);
  assert.ok(store.audit.byTurn('c2').some((a) => a.type === 'outbound' && a.data.skipped === 'closer'));
  assert.equal(store.messages.recent('c1', 1)[0].text, 'cảm ơn ạ');   // lời khách vẫn được lưu
});

test('"ok" khi đang chờ xác nhận ảnh (choXacNhanAnh) vẫn tới gói, không bị coi là chào kết', async () => {
  const { pack, seen } = spyPack((turn, ctx, n) => {
    if (n === 1) ctx.session.set({ choXacNhanAnh: 'Tên hàng: cảm biến' });
    return [`Câu bot số ${n}`];
  });
  const { channel, engine } = setup({ packs: [pack] });
  await engine.process(upd('ảnh đây', { id: 'o1' }));
  await engine.process(upd('ok', { id: 'o2' }));
  assert.equal(seen.length, 2);
  assert.equal(channel.sent.length, 2);
});

test('gói ném lỗi → khách nhận câu báo chung không chứa nội dung lỗi; audit error đã redact', async () => {
  const SECRET = 'Bearer abcdef0123456789abcdef0123456789';
  const boom = { id: 'boom', audience: 'public', priority: 99, match: () => true, async handle() { throw new Error(`ECONNRESET /home/oz/app.js ${SECRET}`); } };
  const { store, channel, engine } = setup({ packs: [boom, hsPack] });
  const r = await engine.process(upd('máy bơm', { id: 'e1' }));
  assert.equal(r.handled, 'error');
  assert.equal(channel.sent.length, 1);
  const s = channel.sent[0].text;
  assert.match(s, /Cổng tra cứu OZ đang lỗi tạm thời/);
  assert.doesNotMatch(s, /ECONNRESET|home|Bearer|abcdef/);
  const err = store.audit.byTurn('e1').find((a) => a.type === 'error');
  assert.ok(err);
  assert.doesNotMatch(JSON.stringify(err.data), /abcdef0123456789abcdef0123456789/);
  assert.equal(store.inbox.get('e1').status, 'failed');
});

test('câu báo lỗi chung của lõi đúng NGUYÊN VĂN đường cũ (có thẻ màu {orange})', () => {
  assert.equal(GENERIC_ERROR_TEXT, CLOI_CHUAN);
});

test('tin lỗi gửi khách: đúng câu chuẩn, KHÔNG kèm lỗi gốc', async () => {
  const boom = { id: 'boom', audience: 'public', priority: 99, match: () => true, async handle() { throw new Error('ECONNRESET /home/oz/app.js Bearer abcdef0123456789abcdef0123456789'); } };
  const { channel, engine } = setup({ packs: [boom, hsPack] });
  await engine.process(upd('máy bơm', { id: 'eX' }));
  assert.equal(channel.sent.length, 1);
  const s = channel.sent[0].text;
  assert.ok(s.startsWith(CLOI_CHUAN), `tin phải bắt đầu bằng câu chuẩn, thực tế: ${JSON.stringify(s)}`);
  assert.doesNotMatch(s, /ECONNRESET|\/home\/oz|Bearer|abcdef/);
});

test('ALLOW_USERS và rate limit 10/phút giữ như cũ', async () => {
  const { pack, seen } = spyPack((turn, ctx, n) => [`Trả lời lượt thứ ${'x'.repeat(n)} ${n}`]);
  const { channel, clock, engine } = setup({ packs: [pack], config: { allowUsers: new Set(['u1']), rateLimitPerMin: 10 }, rules: { capChatDay: 100 } });
  assert.equal((await engine.process(upd('chào', { userId: 'u2', chatId: 'c2' }))).skipped, 'not-allowed');
  assert.equal(channel.sent.length, 0);
  for (let i = 0; i < 10; i++) await engine.process(upd(`câu ${i}`));
  const r = await engine.process(upd('câu 11'));
  assert.equal(r.handled, 'rate-limited');
  assert.equal(seen.length, 10);
  assert.equal(channel.sent.at(-1).text, 'Bạn gửi hơi nhanh, đợi khoảng 1 phút rồi thử lại nhé.');
  clock.advance('61s');
  await engine.process(upd('câu 12'));
  assert.equal(seen.length, 11);
  // nhóm: quá giới hạn thì im
  const g = setup({ packs: [spyPack().pack], config: { rateLimitPerMin: 1 } });
  await g.engine.process(grp('một', 'An'));
  assert.equal((await g.engine.process(grp('hai', 'An'))).handled, 'rate-limited');
  assert.equal(g.channel.sent.length, 1);
});

test('mọi tin ra có đúng một dòng menu cuối (gói tự nhúng; câu lỗi chung của lõi nối footer của gói hs)', async () => {
  const script = { tra_thue: () => ({ ok: true }), tim_ma_hs: () => ({ ok: true }) };
  const boom = { id: 'boom', audience: 'public', priority: 99, match: (t) => t.text === 'nổ', async handle() { throw new Error('x'); } };
  const { channel, engine } = setup({ packs: [boom, hsPack], script });
  const footer = hsPack.footer({ tools: new Set(Object.keys(script)) });
  assert.ok(footer.length > 10);
  await engine.process(upd('2'));
  await engine.process(upd('0'));
  await engine.process(upd('nổ'));
  assert.equal(channel.sent.length, 3);
  for (const { text } of channel.sent) assert.equal(text.split(footer).length - 1, 1, text);
});

test('bỏ "@Tên bot" ở cả text và caption', async () => {
  const { pack, seen } = spyPack();
  const { engine } = setup({ packs: [pack], config: { botNames: ['OZ Bot'] } });
  await engine.process(upd('@OZ Bot máy bơm'));
  await engine.process(upd(null, { extra: { event: 'message.image.received', photoUrl: 'https://x.zdn.vn/a.jpg', caption: '@OZ Bot cảm biến' } }));
  assert.equal(seen[0].turn.text, 'máy bơm');
  assert.equal(seen[1].turn.caption, 'cảm biến');
  assert.equal(seen[1].turn.photoUrl, 'https://x.zdn.vn/a.jpg');
});

test('phiên: TTL, khoá chat:user trong nhóm, @tên trong nhóm, typing trước khi chạy gói', async () => {
  const { pack, seen } = spyPack((turn, ctx, n) => { const s = ctx.session.get(); ctx.session.set({ n: (s.n ?? 0) + 1 }); return [`Lượt ${n} đếm ${(s.n ?? 0) + 1}`]; });
  const { channel, clock, engine } = setup({ packs: [pack], config: { sessionTtlMs: 7_200_000 } });
  await engine.process(upd('a'));
  clock.advance('1h');
  await engine.process(upd('b'));
  assert.equal(seen[1].ctx.session.get().n, 2);
  clock.advance('2h'); clock.advance('1s');
  await engine.process(upd('c'));
  assert.match(channel.sent.at(-1).text, /đếm 1$/);                 // hết hạn → phiên mới
  await engine.process(grp('x', 'An'));
  await engine.process(grp('y', 'Binh'));
  await engine.process(grp('z', 'An'));
  assert.deepEqual(channel.sent.slice(-3).map((s) => s.text), ['@An\nLượt 4 đếm 1', '@Binh\nLượt 5 đếm 1', '@An\nLượt 6 đếm 2']);
  assert.ok(channel.typed.includes('G'));
});

test('chống trùng qua inbox: cùng updateKey lần hai → skipped duplicate', async () => {
  const { pack, seen } = spyPack();
  const { store, engine } = setup({ packs: [pack] });
  await engine.process(upd('hỏi', { id: 'd1' }));
  assert.equal((await engine.process(upd('hỏi', { id: 'd1' }))).skipped, 'duplicate');
  assert.equal(seen.length, 1);
  // server đã ghi inbox (pending) trước → vẫn xử lý
  store.inbox.insertIgnore({ update_key: 'd2', chat_id: 'c1', raw: '{}', received_at: START });
  await engine.process(upd('hỏi lại', { id: 'd2' }));
  assert.equal(seen.length, 2);
});

test('tin không phải chữ/ảnh: 1-1 trả hướng dẫn, nhóm im', async () => {
  const { pack, seen } = spyPack();
  const { channel, engine } = setup({ packs: [pack] });
  await engine.process(upd(null, { extra: { event: 'message.sticker.received' } }));
  assert.match(channel.sent[0].text, /Bot đọc tin nhắn chữ và ảnh/);
  assert.equal((await engine.process(grp(null, 'An', { extra: { event: 'message.sticker.received' } }))).skipped, 'group-non-text');
  assert.equal(channel.sent.length, 1);
  assert.equal(seen.length, 0);
});

test('ctx: lời khách vào messages, history cũ → mới, customer null, tools, mcp ghi audit tool', async () => {
  const { pack, seen } = spyPack(() => ['ok bot']);
  pack.handle = async (turn, ctx) => { seen.push({ turn, ctx, h: ctx.history(5) }); await ctx.mcp.callTool('tra_thue', { maHs: '84137090' }); return { replies: [{ text: `Đã tra ${seen.length}` }] }; };
  const { store, engine } = setup({ packs: [pack], script: { tra_thue: () => ({ ok: true, data: { nk: 5 } }) } });
  await engine.process(upd('lần một', { id: 'x1' }));
  await engine.process(upd(null, { id: 'x2', extra: { event: 'message.image.received', photoUrl: 'https://x.zdn.vn/b.jpg', caption: 'bơm' } }));
  const h = seen[1].h;
  assert.deepEqual(h.map((m) => [m.speaker, m.text]), [['khach', 'lần một'], ['bot', 'Đã tra 1'], ['khach', '[ảnh] https://x.zdn.vn/b.jpg bơm']]);
  assert.equal(seen[0].ctx.customer, null);
  assert.ok(seen[0].ctx.tools.has('tra_thue'));
  const tool = store.audit.byTurn('x1').find((a) => a.type === 'tool');
  assert.equal(tool.data.name, 'tra_thue');
  assert.equal(tool.data.ok, true);
  assert.match(tool.data.sha1, /^[0-9a-f]{40}$/);
  assert.ok(tool.data.head.length <= 500);
});

test('drain: việc nền DANG_XU_LY → hỏi lại 6 s, 12 s → xong gửi job_result j:<chat>:<maLuot>; quá 30 phút → expired', async () => {
  const ML = 'L-1';
  let polls = 0;
  const jobPack = {
    id: 'jp', audience: 'public', priority: 9, match: () => true,
    async handle(turn) { return { replies: [{ text: '⏳ Đang xử lý' }], jobs: [{ maLuot: turn.text, resultTool: 'kq', context: { goi: 1 } }] }; },
    async onJobResult(job, res) { return { replies: [{ text: res ? `Xong ${job.maLuot} ${job.context.goi}` : `Hết hạn ${job.maLuot}` }], evidence: [res] }; },
  };
  const { store, channel, clock, engine } = setup({ packs: [jobPack], script: { kq: () => (++polls < 2 ? { trangThai: 'DANG_XU_LY' } : { ok: true, trangThai: 'XONG' }) } });
  await engine.process(upd(ML));
  await engine.drain();
  assert.equal(polls, 0);                                           // chưa tới hạn 6 s
  clock.advance('6s'); await engine.drain();
  assert.equal(polls, 1);
  clock.advance('11s'); await engine.drain();
  assert.equal(polls, 1);                                           // nhịp thứ hai là 12 s
  clock.advance('1s'); await engine.drain();
  assert.equal(polls, 2);
  assert.equal(channel.sent.at(-1).text, 'Xong L-1 1');
  assert.ok(store.outbox.hasIdem(`j:c1:${ML}`));
  assert.equal(store.jobs.nextDue(), null);
  await engine.process(upd('L-2'));
  polls = -100;                                                     // luôn DANG_XU_LY
  clock.advance('31m'); await engine.drain();
  assert.equal(channel.sent.at(-1).text, 'Hết hạn L-2');
  assert.ok(store.outbox.hasIdem('j:c1:L-2'));
});

const tick = () => new Promise((r) => setTimeout(r, 5));

test('cùng updateKey hai lượt chạy song song → gói chạy đúng 1 lần, 1 bộ trả lời, 1 việc nền (inbox.claim)', async () => {
  let n = 0;
  const p = { id: 'p', audience: 'public', priority: 9, match: () => true,
    async handle() { n++; await tick(); return { replies: [{ text: '⏳ chờ' }], jobs: [{ maLuot: `L${n}`, resultTool: 'kq' }] }; } };
  const { store, channel, engine } = setup({ packs: [p] });
  const u = upd('hàng A', { id: 'X' });
  const r = await Promise.all([engine.process(u), engine.process(u)]);
  assert.equal(n, 1);
  assert.deepEqual(r.map((x) => x.skipped ?? x.handled).sort(), ['duplicate', 'p']);
  assert.equal(channel.sent.length, 1);
  assert.equal(store.jobs.due('2099-01-01T00:00:00.000Z').length, 1);
  assert.equal(store.messages.recent('c1', 10).filter((m) => m.speaker === 'khach').length, 1);
  assert.equal(store.inbox.get('X').status, 'done');
});

test('câu báo lỗi chung có khoá riêng r:<chat>:<turn>:err → vẫn tới khách khi reply 0 đã gửi', async () => {
  const p = { id: 'p', audience: 'public', priority: 9, match: () => true,
    async handle() { return { replies: [{ text: '⏳ Đang xử lý' }], jobs: [{ maLuot: 'M' }] }; } };   // thiếu resultTool → jobs.add ném
  const { store, channel, engine } = setup({ packs: [p, hsPack] });
  const r = await engine.process(upd('x', { id: 'E2' }));
  assert.equal(r.handled, 'error');
  assert.equal(channel.sent.length, 2);
  assert.match(channel.sent[1].text, /lỗi tạm thời/);
  assert.ok(store.outbox.hasIdem('r:c1:E2:err'));
});

test('lỗi trước khi gọi gói (ghi messages hỏng) → vẫn câu báo chung + inbox failed, không treo pending', async () => {
  const { store, channel, engine } = setup({ packs: [spyPack().pack, hsPack] });
  store.messages.add = () => { throw new Error('SQLITE_FULL'); };
  const r = await engine.process(upd('x', { id: 'E3' }));
  assert.equal(r.handled, 'error');
  assert.match(channel.sent[0].text, /lỗi tạm thời/);
  assert.equal(store.inbox.get('E3').status, 'failed');
});

test('hai drain() chồng nhau → hỏi Cổng 1 lần, onJobResult 1 lần', async () => {
  let polls = 0;
  let results = 0;
  const p = { id: 'p', audience: 'public', priority: 9, match: () => true,
    async handle() { return { replies: [{ text: '⏳' }], jobs: [{ maLuot: 'M1', resultTool: 'kq' }] }; },
    async onJobResult() { results++; return { replies: [{ text: 'Xong' }] }; } };
  const { channel, clock, engine } = setup({ packs: [p], script: { kq: async () => { polls++; await tick(); return { trangThai: 'XONG' }; } } });
  await engine.process(upd('x'));
  clock.advance('6s');
  await Promise.all([engine.drain(), engine.drain()]);
  assert.deepEqual([polls, results], [1, 1]);
  assert.equal(channel.sent.at(-1).text, 'Xong');
});

test('createBot cũ chỉ cho test: nằm ở test/helpers, lõi và server.js không dùng', () => {
  assert.equal(existsSync(new URL('../../core/engine-compat.js', import.meta.url)), false);
  assert.ok(existsSync(new URL('../helpers/legacy-bot.mjs', import.meta.url)));
  assert.doesNotMatch(readFileSync(new URL('../../server.js', import.meta.url), 'utf8'), /legacy-bot|engine-compat/);
});

test('no-chat vẫn trả turnId (null); ctx.log đã che bí mật', async () => {
  const logged = [];
  const p = { id: 'p', audience: 'public', priority: 9, match: () => true,
    async handle(turn, ctx) { ctx.log.error('lỗi Bearer abcdef0123456789abcdef0123456789'); return { replies: [{ text: 'ok bot đây' }] }; } };
  const { engine } = setup({ packs: [p], log: { info() {}, error: (m) => logged.push(m) } });
  assert.deepEqual(await engine.process({ updateKey: 'n', chatId: null }), { skipped: 'no-chat', turnId: null });
  await engine.process(upd('x'));
  assert.ok(logged.length);
  assert.doesNotMatch(logged.join('\n'), /abcdef0123456789/);
});
