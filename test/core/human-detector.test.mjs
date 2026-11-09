import test from 'node:test';
import assert from 'node:assert/strict';
import { createHumanDetector } from '../../core/human-detector.js';
import { openStore } from '../../core/store.js';

test('T504: update không phải echo hoặc rỗng -> isHumanReply = false', () => {
  const store = {
    outbox: {
      findRecentByChat: () => [{ text: 'Bot chào khách', status: 'sent', decision: 'send' }],
    },
  };
  const detector = createHumanDetector({ store, config: { fbAppId: 'app-123' } });

  assert.equal(detector.isHumanReply(null), false);
  assert.equal(detector.isHumanReply(undefined), false);
  assert.equal(detector.isHumanReply({}), false);
  assert.equal(detector.isHumanReply({ isEcho: false, chatId: 'c1', text: 'Khách nhắn' }), false);
  assert.equal(detector.isHumanReply({ chatId: 'c1', text: 'Khách nhắn' }), false);
});

test('T504: Tiêu chí 1 — Echo trùng appId của bot (fbAppId / zaloOaAppId) -> isHumanReply = false (SC-003)', () => {
  const store = {
    outbox: {
      findRecentByChat: () => [], // Dù outbox rỗng, nếu trùng appId bot vẫn là bot echo
    },
  };
  const detector = createHumanDetector({
    store,
    config: { fbAppId: 'fb-bot-app-1', zaloOaAppId: 'zalo-oa-app-2' },
  });

  const fbEcho = { isEcho: true, chatId: 'c1', text: 'Tin do bot FB gửi', appId: 'fb-bot-app-1' };
  assert.equal(detector.isHumanReply(fbEcho), false);

  const zaloEcho = { isEcho: true, chatId: 'c2', text: 'Tin do Zalo OA bot gửi', appId: 'zalo-oa-app-2' };
  assert.equal(detector.isHumanReply(zaloEcho), false);

  // appId khác của bot -> không khớp tiêu chí 1, xét tiếp tiêu chí 2
  const otherEcho = { isEcho: true, chatId: 'c1', text: 'Nhân viên chat qua app khác', appId: 'other-app' };
  assert.equal(detector.isHumanReply(otherEcho), true);
});

test('T504: Tiêu chí 2a — Echo khớp messageId trong outbox (cột message_id hoặc ctx.messageId) -> isHumanReply = false', () => {
  const store = {
    outbox: {
      findRecentByChat: (chatId) => [
        { text: 'Tin bot 1', message_id: 'mid-row-001', decision: 'send' },
        { text: 'Tin bot 2', ctx: { messageId: 'mid-ctx-002' }, decision: 'send' },
        { text: 'Tin bot 3', ctx: { message_id: 'mid-ctx-003' }, decision: 'send' },
      ],
    },
  };
  const detector = createHumanDetector({ store, config: {} });

  assert.equal(detector.isHumanReply({ isEcho: true, chatId: 'c1', messageId: 'mid-row-001', text: 'Nội dung khác' }), false);
  assert.equal(detector.isHumanReply({ isEcho: true, chatId: 'c1', messageId: 'mid-ctx-002', text: 'Nội dung khác' }), false);
  assert.equal(detector.isHumanReply({ isEcho: true, chatId: 'c1', messageId: 'mid-ctx-003', text: 'Nội dung khác' }), false);
});

test('T504: Tiêu chí 2b — Echo khớp nội dung văn bản (bỏ thẻ {b}..., chuẩn hoá khoảng trắng, tin dài chia mảnh) -> isHumanReply = false', () => {
  const store = {
    outbox: {
      findRecentByChat: () => [
        { text: '{b}Mã HS{/b} của bạn là: {green}8413.70.90{/green}\n{i}Thuế suất:{/i} 0%', decision: 'send' },
        { text: '   Tin nhắn   có   khoảng   trắng   lộn   xộn   ', decision: 'send' },
        { text: 'Phần 1 của tin nhắn rất dài được gate chia thành nhiều phần. ' + 'A'.repeat(500), decision: 'send' },
      ],
    },
  };
  const detector = createHumanDetector({ store });

  // Khớp sau khi loại thẻ định dạng
  assert.equal(
    detector.isHumanReply({
      isEcho: true,
      chatId: 'c1',
      text: 'Mã HS của bạn là: 8413.70.90\nThuế suất: 0%',
    }),
    false,
  );

  // Khớp sau khi chuẩn hoá khoảng trắng
  assert.equal(
    detector.isHumanReply({
      isEcho: true,
      chatId: 'c1',
      text: 'Tin nhắn có khoảng trắng lộn xộn',
    }),
    false,
  );

  // Khớp một phần đoạn con của tin dài
  assert.equal(
    detector.isHumanReply({
      isEcho: true,
      chatId: 'c1',
      text: 'Phần 1 của tin nhắn rất dài được gate chia thành nhiều phần.',
    }),
    false,
  );
});

test('T504: Tiêu chí 2c & Điều VII — Echo không có trong outbox hoặc khác nội dung -> isHumanReply = true (nhân viên CSKH gõ tay)', () => {
  const store = {
    outbox: {
      findRecentByChat: () => [{ text: 'Dạ em chào anh, bot OZ hỗ trợ gì ạ?', decision: 'send' }],
    },
  };
  const detector = createHumanDetector({ store, config: { fbAppId: 'bot-app' } });

  // Nội dung khác hoàn toàn do nhân viên gõ tay trực tiếp
  const humanUpdate = {
    isEcho: true,
    chatId: 'c1',
    text: 'Chào anh, em là Hằng nhân viên phụ trách hồ sơ này, em sẽ hỗ trợ anh ngay nhé!',
    appId: null,
  };
  assert.equal(detector.isHumanReply(humanUpdate), true);

  // Outbox rỗng -> luôn trả true (nhân viên gõ tay, nhường phòng an toàn)
  const detectorEmpty = createHumanDetector({
    store: { outbox: { findRecentByChat: () => [] } },
  });
  assert.equal(
    detectorEmpty.isHumanReply({
      isEcho: true,
      chatId: 'c1',
      text: 'Anh đợi chút em kiểm tra tờ khai',
    }),
    true,
  );
});

test('T504: Stress / Accuracy — 50 tin nhân viên gõ tay liên tiếp đạt 100% isHumanReply = true và 0 false-positive cho tin bot', () => {
  const botHistory = [
    { text: 'Xin chào quý khách, em là trợ lý tự động OZ.', decision: 'send', message_id: 'bot-m-1' },
    { text: '{b}Tra cứu mã HS:{/b} 8413', decision: 'send', message_id: 'bot-m-2' },
  ];
  const store = {
    outbox: {
      findRecentByChat: () => botHistory,
    },
  };
  const detector = createHumanDetector({
    store,
    config: { fbAppId: 'bot-app-fb' },
  });

  // 1. Kiểm tra 50 tin nhân viên gõ tay: 100% phải là true
  for (let i = 1; i <= 50; i++) {
    const staffText = `Nhân viên CSKH trả lời tư vấn câu hỏi thứ ${i} của khách hàng`;
    const res = detector.isHumanReply({
      isEcho: true,
      chatId: 'chat-001',
      text: staffText,
      messageId: `staff-msg-${i}`,
      appId: null,
    });
    assert.equal(res, true, `Tin nhân viên #${i} phải được nhận diện là human reply`);
  }

  // 2. Kiểm tra 50 tin bot phản hồi: 0 false-positive (100% phải là false)
  for (let i = 1; i <= 50; i++) {
    const isByAppId = i % 3 === 0;
    const isByMessageId = i % 3 === 1;
    const update = {
      isEcho: true,
      chatId: 'chat-001',
      text: isByMessageId ? `Tin bot messageId test ${i}` : 'Tra cứu mã HS: 8413',
      appId: isByAppId ? 'bot-app-fb' : null,
      messageId: isByMessageId ? 'bot-m-2' : `mid-bot-${i}`,
    };
    const res = detector.isHumanReply(update);
    assert.equal(res, false, `Tin bot #${i} không được nhận diện nhầm thành human reply (0 false-positive)`);
  }
});

test('T504: Tích hợp với SQLite store thật (openStore(":memory:")) và outbox.findRecentByChat', () => {
  const store = openStore(':memory:');
  const now = new Date('2026-11-09T12:00:00.000Z');
  const detector = createHumanDetector({
    store,
    config: { fbAppId: 'fb-bot-prod' },
    windowMs: 30_000,
    now: () => now,
  });

  // Ban đầu outbox chưa có tin nào cho chatId = 'c-real-1'
  assert.equal(
    detector.isHumanReply({
      isEcho: true,
      chatId: 'c-real-1',
      text: 'Tin đầu tiên của nhân viên CSKH',
    }),
    true,
  );

  // Bot gửi 1 tin cách đây 10 giây (nằm trong cửa sổ 30s)
  const sentAt10sAgo = new Date(now.getTime() - 10_000).toISOString();
  store.outbox.insert({
    idem_key: 'test:idem:001',
    conv_id: 'c-real-1',
    chat_id: 'c-real-1',
    kind: 'reply',
    text: '{b}Chào bạn!{/b} OZ có thể giúp gì về thủ tục xuất nhập khẩu?',
    decision: 'send',
    status: 'sent',
    created_at: sentAt10sAgo,
    sent_at: sentAt10sAgo,
    ctx: { messageId: 'real-bot-mid-1' },
  });

  // 1. Echo phản chiếu tin vừa gửi của bot (khớp text đã gỡ thẻ) -> false
  assert.equal(
    detector.isHumanReply({
      isEcho: true,
      chatId: 'c-real-1',
      text: 'Chào bạn! OZ có thể giúp gì về thủ tục xuất nhập khẩu?',
    }),
    false,
  );

  // 2. Echo phản chiếu khớp messageId trong ctx -> false
  assert.equal(
    detector.isHumanReply({
      isEcho: true,
      chatId: 'c-real-1',
      messageId: 'real-bot-mid-1',
      text: 'Nội dung bất kỳ',
    }),
    false,
  );

  // 3. Tin nhân viên gõ tay vào cùng chat_id -> true
  assert.equal(
    detector.isHumanReply({
      isEcho: true,
      chatId: 'c-real-1',
      text: 'Chào bạn, mình là tư vấn viên hải quan OZ.',
      messageId: 'staff-mid-new',
    }),
    true,
  );

  // 4. Tin echo ở chat_id khác ('c-real-2') -> true (vì outbox c-real-2 chưa có gì)
  assert.equal(
    detector.isHumanReply({
      isEcho: true,
      chatId: 'c-real-2',
      text: 'Chào bạn! OZ có thể giúp gì về thủ tục xuất nhập khẩu?',
    }),
    true,
  );

  // 5. Bot gửi 1 tin cũ hơn 30s trước (cách đây 45 giây)
  const sentAt45sAgo = new Date(now.getTime() - 45_000).toISOString();
  store.outbox.insert({
    idem_key: 'test:idem:002',
    conv_id: 'c-real-3',
    chat_id: 'c-real-3',
    kind: 'reply',
    text: 'Tin cũ hơn 30 giây',
    decision: 'send',
    status: 'sent',
    created_at: sentAt45sAgo,
    sent_at: sentAt45sAgo,
    ctx: { messageId: 'real-bot-mid-old' },
  });

  // Echo tới sau 45s (nằm ngoài cửa sổ 30s) -> coi như human reply để an toàn
  assert.equal(
    detector.isHumanReply({
      isEcho: true,
      chatId: 'c-real-3',
      text: 'Tin cũ hơn 30 giây',
    }),
    true,
  );
});
