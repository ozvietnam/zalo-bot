// test/core/engine-human-echo.test.mjs — Kiểm tra tích hợp phát hiện người gõ tay vào Engine (T505, Điều II, VII).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createRegistry } from '../../core/registry.js';
import { createHandoff, HUMAN_IDLE_MS } from '../../core/handoff.js';
import { createEngine } from '../../core/engine.js';
import { fakeChannel, fakeClock, fakeMcp } from '../helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z'; // 10:00 giờ VN
const STAFF = 'S1';
const silent = { info() {}, warn() {}, error() {}, log() {} };

function echoPack() {
  return {
    id: 'echo-test',
    ten: 'Echo Test',
    version: '1',
    audience: 'public',
    priority: 50,
    match: () => true,
    async handle(turn) {
      return { replies: [{ text: `Trả lời: ${turn.text}` }] };
    },
  };
}

function setup({ config: userConfig = {}, pack = echoPack() } = {}) {
  const store = openStore();
  const clock = fakeClock(START);
  const channel = fakeChannel();
  const mcp = fakeMcp();
  const config = {
    staffChatId: STAFF,
    staffUsers: new Set(['nv1']),
    botNames: ['Bot OZ'],
    fbAppId: '123456',
    zaloOaAppId: '654321',
    ...userConfig,
  };
  const gate = createGate({ store, channel, now: clock.now });
  const handoff = createHandoff({ store, gate, config, now: clock.now });
  const engine = createEngine({
    config,
    store,
    channel,
    mcp,
    registry: createRegistry([pack]),
    gate,
    handoff,
    now: clock.now,
    log: silent,
  });
  return { store, clock, channel, gate, handoff, engine, config };
}

let seq = 0;
const mkEchoUpdate = (over = {}) => ({
  updateKey: `echo-key-${++seq}`,
  event: 'message.echo',
  chatId: 'c1',
  userId: 'page',
  userName: 'Fanpage Admin',
  chatType: 'PRIVATE',
  text: 'Chào bạn, nhân viên đang hỗ trợ bạn đây',
  photoUrl: null,
  caption: null,
  messageId: `mid-${seq}`,
  isEcho: true,
  appId: null,
  ...over,
});

const mkCustomerUpdate = (text, over = {}) => ({
  updateKey: `cust-key-${++seq}`,
  event: 'message.text.received',
  chatId: 'c1',
  userId: 'u1',
  userName: 'Khách Hàng',
  chatType: 'PRIVATE',
  text,
  photoUrl: null,
  caption: null,
  messageId: `mid-${seq}`,
  isEcho: false,
  appId: null,
  ...over,
});

test('T505: 1. Echo của bot (trùng appId) bị bỏ qua, phòng vẫn bot, không ghi vào messages', async () => {
  const { engine, store, channel } = setup();

  const u = mkEchoUpdate({ appId: '123456', text: 'Tin bot vừa gửi' });
  const res = await engine.process(u);

  assert.equal(res.skipped, 'bot-echo');
  assert.equal(res.turnId, u.updateKey);

  // Trạng thái phòng vẫn là bot
  const conv = store.convs.get('c1');
  assert.equal(conv?.state || 'bot', 'bot');

  // Không có tin nào trong messages
  const msgs = store.messages.recent('c1', 10);
  assert.equal(msgs.length, 0);

  // Không gửi tin nào ra khách
  assert.equal(channel.sent.length, 0);
});

test('T505: 1b. Echo của bot (trùng outbox trong cửa sổ thời gian) bị bỏ qua', async () => {
  const { engine, store, clock, channel } = setup();

  // Giả lập bot vừa gửi tin ra outbox
  store.outbox.insert({
    idem_key: 'test-idem-1',
    chat_id: 'c1',
    kind: 'reply',
    decision: 'send',
    text: 'Cảm ơn quý khách đã hỏi thông tin',
    parts_total: 1,
    parts_sent: 1,
    status: 'sent',
    created_at: clock.now().toISOString(),
    sent_at: clock.now().toISOString(),
  });

  const u = mkEchoUpdate({ text: 'Cảm ơn quý khách đã hỏi thông tin' });
  const res = await engine.process(u);

  assert.equal(res.skipped, 'bot-echo');
  const msgs = store.messages.recent('c1', 10);
  assert.equal(msgs.length, 0);
  assert.equal(channel.sent.length, 0);
});

test('T505: 2. Echo của nhân viên gõ tay: chuyển phòng human, ghi messages speaker=nhan-vien, audit đầy đủ, 0 tin ra', async () => {
  const { engine, store, channel, handoff } = setup();

  const u = mkEchoUpdate({
    text: 'Chào em, chị là tư vấn viên hải quan OZ',
    appId: null,
  });

  const res = await engine.process(u);

  // 1. Kết quả trả về
  assert.equal(res.handled, 'human-echo-detected');
  assert.equal(res.convId, 'c1');

  // 2. Phòng chuyển sang human
  assert.equal(handoff.stateOf('c1'), 'human');

  // 3. Tin nhắn được ghi vào messages với speaker = 'nhan-vien', speaker_id = 'page'
  const msgs = store.messages.recent('c1', 10);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].speaker, 'nhan-vien');
  assert.equal(msgs[0].speaker_id, 'page');
  assert.equal(msgs[0].text, 'Chào em, chị là tư vấn viên hải quan OZ');
  assert.equal(msgs[0].outbox_id, null);

  // 4. Audit ghi nhận state-change và echo-human
  const audits = store.audit.byChat('c1', 10);
  const stateChangeAudit = audits.find((a) => a.type === 'state-change');
  assert.ok(stateChangeAudit, 'phải có audit state-change');
  assert.equal(stateChangeAudit.data.to, 'human');
  assert.equal(stateChangeAudit.data.reason, 'echo-detected');

  const echoAudit = audits.find((a) => a.type === 'echo-human');
  assert.ok(echoAudit, 'phải có audit echo-human');

  // 5. Tuyệt đối 0 tin gửi ra khách (Điều II)
  assert.equal(channel.sent.length, 0);
});

test('T505: 3. Khách nhắn tiếp ngay sau khi nhân viên gõ tay -> bot im hoàn toàn (skipped: chat-human, 0 tin ra)', async () => {
  const { engine, store, channel } = setup();

  // Nhân viên gõ tay
  await engine.process(mkEchoUpdate({ text: 'Nhân viên hỗ trợ bạn' }));
  assert.equal(channel.sent.length, 0);

  // Khách nhắn tiếp
  const res = await engine.process(mkCustomerUpdate('Em muốn hỏi mã HS mặt hàng này'));
  assert.equal(res.skipped, 'chat-human');

  // Bot vẫn im hoàn toàn (0 tin ra)
  assert.equal(channel.sent.length, 0);

  // Tin nhắn của khách vẫn được lưu vào messages
  const msgs = store.messages.recent('c1', 10);
  assert.equal(msgs.length, 2);
  const khachMsg = msgs.find((m) => m.speaker === 'khach');
  assert.ok(khachMsg);
  assert.equal(khachMsg.text, 'Em muốn hỏi mã HS mặt hàng này');
});

test('T505: 4. Sau khoảng lặng 2 giờ (humanIdleMs), khách nhắn lại -> phòng tự về bot và bot trả lời bình thường', async () => {
  const { engine, store, channel, clock, handoff } = setup();

  // Nhân viên gõ tay
  await engine.process(mkEchoUpdate({ text: 'Nhân viên hỗ trợ' }));
  assert.equal(handoff.stateOf('c1'), 'human');

  // Thời gian trôi qua quá 2 giờ (HUMAN_IDLE_MS + 1 phút)
  clock.advance(HUMAN_IDLE_MS + 60_000);

  // Khách nhắn lại
  const res = await engine.process(mkCustomerUpdate('Alo bot ơi tra giúp em'));

  // Phòng đã tự về bot và engine xử lý bình thường
  assert.equal(handoff.stateOf('c1'), 'bot');
  assert.notEqual(res.skipped, 'chat-human');

  // Bot đã trả lời khách qua channel
  assert.equal(channel.sent.length, 1);
  assert.match(channel.sent[0].text, /Trả lời: Alo bot ơi tra giúp em/);
});
