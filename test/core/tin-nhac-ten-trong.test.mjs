// issue #170, yêu cầu 2 — tin CHỈ nhắc tên bot ("@bot" trơ trọi, tin 10:00 của bài test nhóm).
// Lõi bỏ "@tên bot" trước khi đưa gói (core/mention.js), nên tin này còn lại chuỗi rỗng.
// Trước bản vá, core/engine.js trả `skipped:'empty'` TRƯỚC khi ghi sổ và trước khi gọi gói:
//   • khách gọi bot rồi chờ, bot im;
//   • dòng inbox vẫn markDone nhưng không có dòng `messages` → SC-008 lệch
//     ("tin khách vào (2) != tin khách trong messages (1)").
// Test này đo qua LÕI THẬT (không gọi pack.handle trực tiếp) nên không xanh giả được.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createRegistry } from '../../core/registry.js';
import { createEngine } from '../../core/engine.js';
import hsPack from '../../packs/hs/index.js';
import { fakeChannel, fakeClock, fakeMcp } from '../helpers/fakes.mjs';
import { plain } from '../../packs/hs/style.js';

const START = '2026-11-10T02:58:00.000Z';   // 09:58 VN — đúng mốc tin 1 của bài test
const ML = '11111111-2222-4333-8444-555555555555';
const MO_TA = 'Chốt kẹp xoay 1/4 vòng loại núm thấp (Low-Height Knob Quarter-Turn Clamp), mã QCTHL0525-10S, cố định vỏ máy và cửa bảo vệ';
const silent = { info() {}, error() {} };

function setup() {
  const store = openStore();
  const clock = fakeClock(START);
  const channel = fakeChannel();
  const mcp = fakeMcp({ phan_loai_hs: () => ({ ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } }) });
  const gate = createGate({ store, channel, now: clock.now });
  const engine = createEngine({ config: { botNames: ['bot'] }, store, channel, mcp, vision: null,
    registry: createRegistry([hsPack]), gate, now: clock.now, log: silent });
  return { store, clock, channel, engine };
}

let seq = 0;
const grp = (text) => ({ updateKey: `t${++seq}`, event: 'message.text.received', chatId: 'G', userId: 'u1',
  userName: 'Khách', chatType: 'GROUP', text, photoUrl: null, caption: null });

/** Số tin khách vào (inbox 'done') và số tin khách trong `messages` — SC-008 (eval/run.mjs) đòi bằng nhau. */
function demTinKhach(store, keys) {
  const vao = keys.filter((k) => store.inbox.get(k)?.status === 'done').length;
  const trong = store.messages.recent('G:u1', 100).filter((m) => m.speaker === 'khach').length;
  return { vao, trong };
}

test('#170 tin 10:00 "@bot" trơ trọi trong nhóm: tới gói, có phản hồi, messages không lệch', async () => {
  const { store, clock, channel, engine } = setup();
  const u1 = grp(`@bot ${MO_TA}`);
  await engine.process(u1);
  clock.advance('2m');
  const truoc = channel.sent.length;

  const u2 = grp('@bot');
  const r = await engine.process(u2);

  assert.notEqual(r.skipped, 'empty', 'tin nhắc tên bot không phải tin rỗng — phải tới gói');
  assert.equal(r.handled, 'hs', 'gói hs phải nhận lượt này');
  const moi = channel.sent.slice(truoc);
  assert.ok(moi.length, 'khách gọi "@bot" rồi chờ: bot không được im');
  assert.match(plain(moi.map((s) => s.text).join('\n')), /Chốt kẹp/i, 'phải trả lời trên hồ sơ đang xử lý');

  const { vao, trong } = demTinKhach(store, [u1.updateKey, u2.updateKey]);
  assert.equal(trong, vao, `SC-008 lệch: tin khách vào (${vao}) != tin khách trong messages (${trong})`);
});

test('#170 tin chỉ có khoảng trắng vẫn bị bỏ sớm như cũ: không ghi messages, không gửi gì', async () => {
  // Bản vá chỉ mở đường cho tin CÓ CHỮ mà chữ đó là nhắc tên bot. Tin trắng thật thì vẫn bỏ sớm.
  const { store, channel, engine } = setup();
  const r = await engine.process({ ...grp('   '), chatId: 'G:u1', chatType: 'PRIVATE' });
  assert.equal(r.skipped, 'empty');
  assert.equal(channel.sent.length, 0);
  assert.equal(store.messages.recent('G:u1', 10).length, 0);
});
