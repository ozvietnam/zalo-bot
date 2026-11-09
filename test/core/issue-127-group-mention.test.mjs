// test/core/issue-127-group-mention.test.mjs — Test TDD cho Issue #127
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createRegistry } from '../../core/registry.js';
import { createEngine } from '../../core/engine.js';
import { hasMention, stripMention, isGroup } from '../../core/mention.js';
import hsPack from '../../packs/hs/index.js';
import { chonGoi } from '../../packs/hs/router.js';
import { fakeChannel, fakeClock, fakeMcp } from '../helpers/fakes.mjs';

const START = '2026-11-09T03:00:00.000Z'; // 10:00 VN

function setupEngine({ botNames = ['OZ Tra cứu HS', 'Bot OZ'], packs = [hsPack], script = {}, log } = {}) {
  const store = openStore();
  const clock = fakeClock(START);
  const channel = fakeChannel();
  channel.typed = [];
  channel.typing = async (c) => { channel.typed.push(c); };
  const logs = { info: [], error: [] };
  const logger = log || {
    info(...a) { logs.info.push(a.join(' ')); },
    error(...a) { logs.error.push(a.join(' ')); },
  };
  const mcp = fakeMcp(script);
  const registry = createRegistry(packs);
  const config = {
    botNames,
    capChatDay: 100,
    capGroupDay: 500,
    capAllDay: 1000,
    staffChatId: 'staff_group',
    staffUsers: new Set(['nv01']),
  };
  const gate = createGate({ store, channel, now: clock.now });
  const engine = createEngine({ config, store, channel, mcp, vision: null, registry, gate, now: clock.now, log: logger });
  return { store, clock, channel, engine, logs, mcp };
}

test('hasMention: nhận diện chính xác nhắc tên bot trong nhóm (có hoặc không có @)', () => {
  const names = ['OZ Tra cứu HS', 'Bot OZ'];

  // Có @ ở đầu
  assert.equal(hasMention('@OZ Tra cứu HS tra giúp mã 84137090', names), true);
  assert.equal(hasMention('@Bot OZ xem giá', names), true);
  assert.equal(hasMention('@bot oz', names), true);

  // Không có @ ở đầu
  assert.equal(hasMention('OZ Tra cứu HS tra giúp mã 84137090', names), true);
  assert.equal(hasMention('bot oz cho hỏi', names), true);
  assert.equal(hasMention('Nhờ OZ Tra cứu HS kiểm tra', names), true);

  // Không nhắc bot
  assert.equal(hasMention('Mọi người kiểm tra giúp tiến độ lô hàng với nhé', names), false);
  assert.equal(hasMention('Chào cả nhà', names), false);
  assert.equal(hasMention('', names), false);
  assert.equal(hasMention(null, names), false);

  // Khi danh sách botNames rỗng
  assert.equal(hasMention('@OZ Tra cứu HS tra mã', []), false);
});

test('Lõi nhóm: tin không nhắc bot thì im lặng (skipped: group-unmentioned), có nhắc thì trả lời đúng người', async () => {
  const script = {
    tra_thue: () => ({
      ok: true,
      data: { hsCode: '84137090', nameVi: 'Bơm ly tâm', taxNkPreferential: 0, taxVat: 10 },
    }),
    tim_ma_hs: () => ({ ok: true, results: [] }),
  };
  const { engine, channel } = setupEngine({ script });

  // 1. Cường gửi tin không nhắc bot trong nhóm
  const r1 = await engine.process({
    updateKey: 'u_cuong_1',
    event: 'message.text.received',
    chatId: 'nhom_xnk_01',
    userId: 'u_cuong',
    userName: 'Cường',
    chatType: 'GROUP',
    text: 'Mọi người kiểm tra giúp tiến độ lô hàng với nhé',
  });

  assert.equal(r1.skipped, 'group-unmentioned', 'Tin không nhắc bot phải bị bỏ qua với skipped: group-unmentioned');
  assert.equal(channel.sent.length, 0, 'Bot phải im lặng (0 tin gửi ra kênh)');

  // 2. An gọi bot có nhắc tên @OZ Tra cứu HS
  const r2 = await engine.process({
    updateKey: 'u_an_1',
    event: 'message.text.received',
    chatId: 'nhom_xnk_01',
    userId: 'u_an',
    userName: 'An',
    chatType: 'GROUP',
    text: '@OZ Tra cứu HS 84137090',
  });

  assert.equal(r2.handled, 'hs');
  assert.equal(channel.sent.length, 1, 'Bot phải phản hồi khi được gọi');
  assert.match(channel.sent[0].text, /^@An\n/, 'Tin phản hồi phải bắt đầu bằng @An');
});

test('Gói 2: nhận diện câu hỏi nối tiếp về thuế (thuế bao nhiêu, thuế bn, bao nhiêu %, thuế suất thế nào) kế thừa mã HS', async () => {
  const TAX = {
    ok: true,
    data: { hsCode: '84137090', nameVi: 'Bơm ly tâm', taxNkPreferential: 0, taxVat: 10 },
  };
  const script = { tra_thue: () => TAX, tim_ma_hs: () => ({ ok: true, results: [] }) };
  const { engine, channel } = setupEngine({ script });

  // Bước 1: An hỏi mã 84137090
  await engine.process({
    updateKey: 'step_1',
    event: 'message.text.received',
    chatId: 'nhom_xnk_01',
    userId: 'u_an',
    userName: 'An',
    chatType: 'GROUP',
    text: '@OZ Tra cứu HS 84137090',
  });

  assert.equal(channel.sent.length, 1);
  assert.match(channel.sent[0].text, /8413\.70\.90/);

  // Bước 2: An hỏi nối tiếp 'thuế bao nhiêu?'
  await engine.process({
    updateKey: 'step_2',
    event: 'message.text.received',
    chatId: 'nhom_xnk_01',
    userId: 'u_an',
    userName: 'An',
    chatType: 'GROUP',
    text: '@OZ Tra cứu HS thuế bao nhiêu?',
  });

  assert.equal(channel.sent.length, 2);
  const rep2 = channel.sent[1].text;
  assert.match(rep2, /^@An\n/, 'Phải gắn tag @An');
  assert.match(rep2, /8413\.70\.90/, 'Phải kế thừa mã HS 84137090 từ phiên trước của An');
  assert.match(rep2, /Thuế suất|VAT/i, 'Phải trả lời đúng mạch thuế');
});

test('Lỗi Cổng OZ: ghi rõ thông điệp và nguyên nhân thật vào ctx.log.error khi tra_thue / tra_thu_tuc_nhap_khau lỗi', async () => {
  const script = {
    tra_thue: () => { throw new Error('Cổng OZ lỗi HTTP 502 Bad Gateway tra_thue timeout'); },
    tra_thu_tuc_nhap_khau: () => ({ ok: false, thongBao: 'Dịch vụ thủ tục đang bảo trì', loi: 'MAINTENANCE' }),
  };
  const { engine, logs } = setupEngine({ script });

  await engine.process({
    updateKey: 'err_test_1',
    event: 'message.text.received',
    chatId: 'nhom_xnk_01',
    userId: 'u_an',
    userName: 'An',
    chatType: 'GROUP',
    text: '@OZ Tra cứu HS 84137090',
  });

  const errLogs = logs.error.join('\n');
  assert.match(errLogs, /tra_thue/, 'Log lỗi phải chỉ rõ công cụ tra_thue');
  assert.match(errLogs, /502|Bad Gateway|timeout/i, 'Log lỗi phải chứa nguyên nhân thật từ lỗi gốc');
});
