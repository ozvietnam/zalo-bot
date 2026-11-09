// core/human-detector.js — đối chiếu outbox nhận diện nhân viên gõ tay (T504, Điều II, VII).

/**
 * Chuẩn hoá nội dung tin nhắn để đối chiếu:
 * - Bỏ thẻ định dạng riêng của bot Zalo/Fanpage: {b}...{/b}, {green}...{/green}
 * - Gộp các khoảng trắng liên tiếp thành một dấu cách và trim hai đầu.
 */
function cleanText(text) {
  return String(text ?? '')
    .replace(/\{\/?[a-z0-9]{1,10}\}/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tạo module phát hiện nhân viên CSKH gõ tay trực tiếp trên Fanpage/Zalo OA:
 * Phân biệt giữa echo phản chiếu do bot vừa gửi và tin do nhân viên gõ tay.
 *
 * @param {object} opts
 * @param {object} [opts.store] - Store SQLite lưu trữ bảng outbox
 * @param {object} [opts.config] - Cấu hình chứa fbAppId, zaloOaAppId
 * @param {number} [opts.windowMs=30000] - Cửa sổ đối chiếu thời gian gần nhất (mặc định 30 giây)
 * @param {Function} [opts.now] - Hàm lấy mốc thời gian hiện tại
 * @returns {{ isHumanReply: (update: object) => boolean }}
 */
export function createHumanDetector({
  store,
  config = {},
  windowMs = 30_000,
  now = () => new Date(),
} = {}) {
  const fbAppId = config.fbAppId ? String(config.fbAppId) : null;
  const zaloOaAppId = config.zaloOaAppId ? String(config.zaloOaAppId) : null;

  return {
    isHumanReply(update) {
      // 1. Không phải sự kiện echo (tin khách nhắn thường) -> không phải nhân viên gõ tay
      if (!update || update.isEcho !== true) return false;

      // 2. Tiêu chí 1: Khớp appId của bot (SC-003)
      if (update.appId) {
        const uAppId = String(update.appId);
        if ((fbAppId && uAppId === fbAppId) || (zaloOaAppId && uAppId === zaloOaAppId)) {
          return false; // Echo do chính ứng dụng bot gửi
        }
      }

      // 3. Tiêu chí 2: Đối chiếu outbox trong cửa sổ thời gian gần nhất (windowMs)
      const cur = typeof now === 'function' ? now() : new Date();
      const nowIso = typeof cur === 'string' ? cur : (cur?.toISOString ? cur.toISOString() : new Date().toISOString());
      const recentRows = store?.outbox?.findRecentByChat
        ? store.outbox.findRecentByChat(update.chatId, { withinMs: windowMs, nowIso, limit: 10 })
        : [];

      if (Array.isArray(recentRows) && recentRows.length > 0) {
        const uText = cleanText(update.text);
        const uMid = update.messageId ? String(update.messageId) : null;

        for (const row of recentRows) {
          // Tiêu chí 2a: Khớp messageId trong outbox (cột message_id hoặc ctx.messageId)
          if (uMid) {
            const rowMid = row.message_id ? String(row.message_id) : null;
            const ctxMid = row.ctx?.messageId ?? row.ctx?.message_id;
            if ((rowMid && rowMid === uMid) || (ctxMid && String(ctxMid) === uMid)) {
              return false; // Trùng messageId với tin bot vừa gửi
            }
          }

          // Tiêu chí 2b: Khớp nội dung văn bản (hoặc là đoạn con khi chia tin dài)
          if (uText && row.text) {
            const rText = cleanText(row.text);
            if (rText && (uText === rText || rText.includes(uText))) {
              return false; // Trùng nội dung với tin bot vừa gửi
            }
          }
        }
      }

      // 4. Tiêu chí 2c & Điều VII (Sai thì dừng): Không khớp tiêu chí nào -> Nhân viên CSKH gõ tay
      return true;
    },
  };
}
