// Kiểm thử gói echo ở MỨC ENGINE (core/engine.js) và MỨC CỬA GỬI (core/gate.js) — T017.
// Bao phủ: rò rỉ sang khách, cửa chặn trùng nội dung, người trước máy (phòng 1-1),
// số tiền, bí mật, regex, hành vi lạ (turn undefined/null).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../../../core/store.js';
import { createGate } from '../../../core/gate.js';
import { createRegistry } from '../../../core/registry.js';
import { createEngine } from '../../../core/engine.js';
import echo from '../index.js';
import { fakeChannel, fakeClock, fakeMcp } from '../../../test/helpers/fakes.mjs';

const START = '2026-11-07T03:00:00.000Z'; // 10:00 VN
const silent = { info() {}, error() {} };

/** Gói công khai giả: luôn khớp, để thấy gói echo bị lọc (không phải vì thiếu gói dự phòng). */
const publicPack = {
  id: 'pub', ten: 'Pub', version: '1', audience: 'public', priority: 0,
  moneyCheck: false, requiresTools: [],
  match: () => true,
  async handle() { return { replies: [{ text: 'trả lời gói công khai' }] }; },
};

function setup({ packs = [echo, publicPack], staffUsers = [], rules } = {}) {
  const store = openStore();
  const clock = fakeClock(START);
  const channel = fakeChannel();
  const registry = createRegistry(packs);
  const gate = createGate({ store, channel, rules, now: clock.now });
  const engine = createEngine({
    config: { staffUsers }, store, channel, mcp: fakeMcp({}), vision: null,
    registry, gate, now: clock.now, log: silent,
  });
  return { store, clock, channel, engine };
}

let seq = 0;
const upd = (text, o = {}) => ({
  updateKey: o.id ?? `t${++seq}`, event: 'message.text.received', chatId: o.chatId ?? 'c1',
  userId: o.userId ?? 'u1', userName: o.userName ?? 'Tuấn', chatType: o.chatType ?? 'PRIVATE',
  text, photoUrl: null, caption: null, messageId: o.id ?? null, ...o.extra,
});

// ---------------------------------------------------------------- A. rò rỉ sang khách (mức engine)

test('A: khách gõ /echo ở MỨC ENGINE → gói echo KHÔNG được chọn, rơi về gói công khai', async () => {
  const { store, engine, channel } = setup({ staffUsers: ['nhanvien1'] });
  const r = await engine.process(upd('/echo xin chào', { id: 'a-khach', userId: 'khach1' }));
  const route = store.audit.byTurn('a-khach').find((a) => a.type === 'route');
  assert.equal(route.data.pack, 'pub', 'gói echo phải bị lọc bởi audience ở tầng engine');
  assert.notEqual(route.data.pack, 'echo');
  assert.equal(r.handled, 'pub');
  assert.deepEqual(channel.sent.map((s) => s.text), ['trả lời gói công khai']);
});

test('A: khách trong NHÓM gõ /echo → cũng không chọn echo', async () => {
  const { store, engine } = setup({ staffUsers: ['nhanvien1'] });
  await engine.process(upd('/echo xin chào', { id: 'a-nhom', chatId: 'G1', userId: 'khach2', chatType: 'GROUP' }));
  const route = store.audit.byTurn('a-nhom').find((a) => a.type === 'route');
  assert.notEqual(route.data.pack, 'echo');
});

test('A: nhân viên gõ /echo ở MỨC ENGINE → chọn echo, câu trả lời đi qua cửa gate.send', async () => {
  const { store, engine, channel } = setup({ staffUsers: ['nhanvien1'] });
  await engine.process(upd('/echo xin chào', { id: 'a-nv', userId: 'nhanvien1' }));
  const route = store.audit.byTurn('a-nv').find((a) => a.type === 'route');
  assert.equal(route.data.pack, 'echo');
  assert.deepEqual(channel.sent.map((s) => s.text), ['xin chào'], 'câu phải ra qua gate.send');
  const gateRows = store.audit.byTurn('a-nv').filter((a) => a.type === 'gate');
  assert.ok(gateRows.length >= 1, 'phải có bản ghi audit của cửa gửi');
  assert.equal(gateRows[0].data.decision, 'send');
});

// ---------------------------------------------------------------- B. cửa chặn trùng nội dung

test('B: nhân viên gõ /echo xin chào HAI LẦN → lần 2 bị cửa drop vì trùng nội dung', async () => {
  const { store, engine, channel } = setup({ staffUsers: ['nhanvien1'] });
  await engine.process(upd('/echo xin chào', { id: 'b1', userId: 'nhanvien1' }));
  await engine.process(upd('/echo xin chào', { id: 'b2', userId: 'nhanvien1' }));
  assert.deepEqual(channel.sent.map((s) => s.text), ['xin chào'], 'lần 2 không được gửi (ngưỡng trùng 0.8 của cửa)');
  const rows = store.audit.byTurn('b2').filter((a) => a.type === 'gate');
  assert.equal(rows[0].data.decision, 'drop');
  assert.match(rows[0].data.reason, /^similar:/);
});

test('B: hai lần /echo với nội dung KHÁC nhau → cả hai đều gửi', async () => {
  const { engine, channel } = setup({ staffUsers: ['nhanvien1'] });
  await engine.process(upd('/echo xin chào', { id: 'c1', userId: 'nhanvien1' }));
  await engine.process(upd('/echo chào bạn', { id: 'c2', userId: 'nhanvien1' }));
  assert.deepEqual(channel.sent.map((s) => s.text), ['xin chào', 'chào bạn']);
});

// ---------------------------------------------------------------- D. người trước máy (Điều II) — phòng 1-1

test('D: phòng 1-1 ở trạng thái human → bot im, không gửi câu echo', async () => {
  const { store, engine, channel } = setup({ staffUsers: ['nhanvien1'] });
  store.chats.setState('c1', 'human', 'nhanvien1', 'người cầm phòng', START);
  await engine.process(upd('/echo xin chào', { id: 'd1', userId: 'nhanvien1' }));
  assert.deepEqual(channel.sent, [], 'bot phải im hoàn toàn khi phòng do người cầm');
  const rows = store.audit.byTurn('d1').filter((a) => a.type === 'gate');
  assert.equal(rows[0].data.decision, 'reject');
  assert.equal(rows[0].data.reason, 'chat-human');
});

// ---------------------------------------------------------------- E. số tiền

test('E: echo lặp lại chuỗi có số tiền → moneyCheck:false nên cửa KHÔNG chặn (số tiền do người gõ, không phải do code tra)', async () => {
  const { store, engine, channel } = setup({ staffUsers: ['nhanvien1'] });
  await engine.process(upd('/echo 25.650đ', { id: 'e1', userId: 'nhanvien1' }));
  assert.deepEqual(channel.sent.map((s) => s.text), ['25.650đ']);
  const rows = store.audit.byTurn('e1').filter((a) => a.type === 'gate');
  assert.equal(rows[0].data.decision, 'send');
  assert.equal(rows[0].data.reason, 'ok');
});

test('E: dù moneyCheck:true thì số tiền vẫn có căn cứ (evidence = chính tin nhân viên gõ) → không bị chặn money:', async () => {
  const pack = { ...echo, id: 'echo', moneyCheck: true };
  const { store, engine, channel } = setup({ packs: [pack, publicPack], staffUsers: ['nhanvien1'] });
  await engine.process(upd('/echo 25.650đ', { id: 'e2', userId: 'nhanvien1' }));
  const rows = store.audit.byTurn('e2').filter((a) => a.type === 'gate');
  assert.equal(rows[0].data.decision, 'send', 'số tiền do người gõ là bằng chứng hợp lệ');
  assert.deepEqual(channel.sent.map((s) => s.text), ['25.650đ']);
});

// ---------------------------------------------------------------- G/H. bí mật & thông tin nội bộ

test('G: echo lặp lại chuỗi giống khoá/token → cửa chặn leak, không gửi ra', async () => {
  const { store, engine, channel } = setup({ staffUsers: ['nhanvien1'] });
  await engine.process(upd('/echo Bearer abc123', { id: 'g1', userId: 'nhanvien1' }));
  const rows = store.audit.byTurn('g1').filter((a) => a.type === 'gate');
  assert.equal(rows[0].data.decision, 'reject');
  assert.match(rows[0].data.reason, /^leak:/);
  assert.deepEqual(channel.sent, []);
});

test('H: reply của gói echo không chứa thông tin nội bộ (chỉ lặp lại nội dung người gõ)', async () => {
  const r = await echo.handle({ text: '/echo xin chào' }, {});
  assert.deepEqual(r.replies, [{ text: 'xin chào' }]);
  assert.deepEqual(r.jobs, []);
  assert.equal(r.handoff, null);
  assert.deepEqual(r.labels, []);
});

// ---------------------------------------------------------------- C/F. regex & hành vi lạ

test('C: bảng ca regex — match/handle theo đúng đặc tả', async () => {
  const cases = [
    { text: '/echo', match: true, out: 'Dùng: /echo <nội dung>' },
    { text: '/echo xin chào', match: true, out: 'xin chào' },
    { text: '/echoing', match: false },
    { text: '/echo.', match: true, out: '.' },
    { text: ' /echo x', match: false },
    { text: 'Xin chào /echo', match: false },
    { text: null, match: false },
    { text: '', match: false },
    { text: '/echo5', match: false },
    { text: '/echo-x', match: true, out: '-x' },
    { text: '/ECHO x', match: false },
  ];
  for (const c of cases) {
    assert.equal(echo.match({ text: c.text }), c.match, `match(${JSON.stringify(c.text)})`);
    if (c.match && c.out !== undefined) {
      const r = await echo.handle({ text: c.text }, {});
      assert.equal(r.replies[0].text, c.out, `handle(${JSON.stringify(c.text)})`);
    }
  }
});

test('F: turn undefined/null không làm ném lỗi', async () => {
  assert.equal(echo.match(undefined), false);
  assert.equal(echo.match(null), false);
  assert.equal(echo.match({}), false);
  const r = await echo.handle(undefined, {});
  assert.equal(r.replies[0].text, 'Dùng: /echo <nội dung>');
  const r2 = await echo.handle(null, {});
  assert.equal(r2.replies[0].text, 'Dùng: /echo <nội dung>');
});
