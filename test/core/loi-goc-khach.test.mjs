// test/core/loi-goc-khach.test.mjs — Hiến pháp Điều IX: khách KHÔNG được thấy lỗi gốc (bí mật nội bộ).
// lib/bot.js bắt lỗi khi gọi Cổng OZ: tin gửi khách phải là câu chuẩn, KHÔNG kèm e.message.
// Chi tiết lỗi gốc CHỈ được ghi vào log (lib/bot.js:213 và :131), không bao giờ vào tin gửi khách.
//
// Cảnh báo khoá hành vi: nếu sau này ai đó đổi câu chuẩn ở lib/bot.js:214 (thêm lại e.message,
// đổi câu chữ, thêm nội dung), các test dưới đây sẽ ĐỎ. Đó là chủ ý — sửa cả code lẫn test
// trong cùng một PR.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBot } from '../../lib/bot.js';
import { menuText } from '../../lib/packages.js';

/**
 * Lỗi gốc giả — cố tình nhồi NHIỀU dấu hiệu bí mật cùng lúc để một hồi quy rò (kể cả chỉ rò
 * đuôi message) đều bị bắt:
 *   - đường dẫn nội bộ:  /home/oz
 *   - tên biến môi trường: OZ_MCP_TOKEN
 *   - chuỗi giống khoá:   sk-gia-loi-goc
 *   - mảnh chữ trùng:     tra_thue (tên công cụ Cổng OZ — lọt ra là lộ hạ tầng)
 */
const LOI_GOC = 'ECONNREFUSED /home/oz/.env OZ_MCP_TOKEN=sk-gia-loi-goc tra_thue failed';

/** Mọi mảnh của lỗi gốc trên mà tin gửi khách KHÔNG được chứa. */
const MANH_LOI_GOC = ['/home/oz', 'OZ_MCP_TOKEN', 'sk-gia-loi-goc', 'tra_thue', 'ECONNREFUSED'];

/** Lỗi gốc giả cho nhánh ảnh (Gemini) — cũng nhiều dấu hiệu. */
const LOI_GOC_ANH = 'Gemini lỗi 400 (API_KEY=/home/oz/.env GEMINI_KEY=sk-gia-loi-goc read_specs)';
const MANH_LOI_GOC_ANH = ['/home/oz', 'API_KEY', 'GEMINI_KEY', 'sk-gia-loi-goc', 'read_specs', 'Gemini', '400'];

/** Câu báo chuẩn cho khách khi Cổng OZ lỗi (nguyên văn ở lib/bot.js:214). */
const CLOI_CHUAN = '{orange}⚠️ Cổng tra cứu OZ đang lỗi tạm thời{/orange}. Bạn thử lại sau ít phút nhé.';

/** Footer (menu gọn) mọi tin có — lấy từ mã nguồn để không phải chép lại. */
const FOOTER = menuText(null);

/** Tin khách duy nhất khi Cổng OZ lỗi. */
const TIN_LOI_CHUAN = `${CLOI_CHUAN}\n\n${FOOTER}`;

/** Tin khách khi đọc ảnh lỗi (lib/bot.js:130-136 → packs/hs/vision.js:26-33). */
const TIN_ANH_LOI = `⚠️ Bot chưa đọc được ảnh này, hoặc gõ tên hàng + thông số bằng chữ giúp bot nhé.\n\n${FOOTER}`;

function fakeZalo() {
  const sent = [];
  return { sent, sendText: async (c, x) => { sent.push([c, x]); }, sendChatAction: () => {} };
}

/** Log giả: gom dòng vào mảng thay vì in ra stdout (và để assert "chi tiết chỉ ghi log"). */
function fakeLog() {
  const lines = [];
  const ghi = (m) => lines.push(String(m));
  return { lines, error: ghi, info: ghi, warn: ghi };
}

/** MCP giả: mọi công cụ đều ném lỗi gốc (dùng để mô phỏng Cổng OZ hỏng). */
function fakeMcp({ names = ['phan_loai_hs', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs'], loi = LOI_GOC } = {}) {
  return {
    listTools: async () => names.map((name) => ({ name })),
    callTool: async (name) => { throw new Error(loi); },
  };
}

/** Vision giả: đọc ảnh thì ném lỗi gốc. */
function fakeVision(loi = LOI_GOC_ANH) {
  return { readSpecs: async () => { throw new Error(loi); } };
}

/** Dựng bot + đồ giả; trả về cả bot lẫn tin đã gửi / dòng log để assert. */
function taoBot({ mcp = fakeMcp(), vision = null } = {}) {
  const zalo = fakeZalo();
  const log = fakeLog();
  const bot = createBot({ zalo, mcp, vision, log });
  return { zalo, log, bot };
}

/** Tin khách không được chứa BẤT KỲ mảnh nào của lỗi gốc. */
function assertKhongLoLoiGoc(sent, manh) {
  assert.ok(sent.length >= 1, 'phải có ít nhất 1 tin gửi khách');
  for (const [, text] of sent) {
    const t = String(text).toLowerCase();
    for (const m of manh) {
      assert.ok(!t.includes(String(m).toLowerCase()), `tin khách lộ "${m}": ${text}`);
    }
  }
}

/** Log phải có chi tiết lỗi gốc (đúng yêu cầu issue: chi tiết chỉ ghi log). */
function assertLogCoLoiGoc(log, loi) {
  assert.ok(log.lines.some((l) => l.includes(loi)),
    `log phải ghi chi tiết lỗi gốc, thực tế: ${JSON.stringify(log.lines)}`);
}

const update = (text, id) => ({ ok: true, result: { event_name: 'message.text.received',
  message: { message_id: id, text, chat: { id: 'u1', chat_type: 'PRIVATE' }, from: { id: 'u1', display_name: 'Khách' } } } });

const MA_LUOT = '550e8400-e29b-41d4-a716-446655440000';

const updateAnh = (id) => ({ ok: true, result: { event_name: 'message.photo.received',
  message: { message_id: id, photo: { url: 'https://example.invalid/anh.jpg' }, caption: 'nhãn máy bơm',
    chat: { id: 'u1', chat_type: 'PRIVATE' }, from: { id: 'u1', display_name: 'Khách' } } } });

test('nhánh chạy gói: lỗi gốc của Cổng OZ không lọt ra tin khách (chỉ câu chuẩn)', async () => {
  const { zalo, log, bot } = taoBot();

  await bot.handleUpdate(update('84137090', 'm1'));

  assertKhongLoLoiGoc(zalo.sent, MANH_LOI_GOC);
  assert.equal(zalo.sent.length, 1, `chỉ được gửi 1 tin, thực tế: ${JSON.stringify(zalo.sent.map(([, t]) => t))}`);
  assert.equal(zalo.sent[0][1], TIN_LOI_CHUAN, 'tin khách phải đúng câu chuẩn + hướng dẫn thử lại');
  assertLogCoLoiGoc(log, LOI_GOC);
});

test('nhánh mở lại lượt (ket-qua): lỗi gốc của Cổng OZ không lọt ra tin khách', async () => {
  // Nhánh này ĐÃ an toàn sẵn (rơi vào cùng catch ở lib/bot.js:212) → test khoá hành vi, không phải test đỏ trước.
  const mcp = fakeMcp({ names: ['phan_loai_hs', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'ket_qua_phan_loai'] });
  const { zalo, log, bot } = taoBot({ mcp });

  await bot.handleUpdate(update(`kết quả ${MA_LUOT}`, 'm2'));

  assertKhongLoLoiGoc(zalo.sent, MANH_LOI_GOC);
  assert.equal(zalo.sent.length, 1, `chỉ được gửi 1 tin, thực tế: ${JSON.stringify(zalo.sent.map(([, t]) => t))}`);
  assert.equal(zalo.sent[0][1], TIN_LOI_CHUAN, 'tin khách phải đúng câu chuẩn + hướng dẫn thử lại');
  assertLogCoLoiGoc(log, LOI_GOC);
});

test('nhánh ảnh: lỗi gốc khi đọc ảnh không lọt ra tin khách', async () => {
  // Nhánh này ĐÃ an toàn sẵn (lib/bot.js:130-136 → packs/hs/vision.js:26-33) → test khoá hành vi, không phải test đỏ trước.
  const { zalo, log, bot } = taoBot({ vision: fakeVision() });

  await bot.handleUpdate(updateAnh('m3'));

  assertKhongLoLoiGoc(zalo.sent, MANH_LOI_GOC_ANH);
  assert.equal(zalo.sent.length, 1, `chỉ được gửi 1 tin, thực tế: ${JSON.stringify(zalo.sent.map(([, t]) => t))}`);
  assert.equal(zalo.sent[0][1], TIN_ANH_LOI, 'tin khách phải đúng câu báo lỗi ảnh (không kèm lỗi gốc)');
  assertLogCoLoiGoc(log, LOI_GOC_ANH);
});
