// Tra ĐÍCH của một lệnh nhân viên: `P<n>` / `p<n>` / `<n>` (mã phiếu), hoặc `conv_id` gõ thẳng.
// Tách khỏi `core/handoff.js` ở T036: lệnh hồ sơ (`core/handoff-hoso.js`) cần đúng cách tra đích của
// `/tl`, `/nhan`, `/chan` (T025) — chép lại thì hai bản sẽ lệch nhau, và `core/handoff.js` đã sát trần
// 300 dòng của Điều VI.
//
// Đích luôn gồm cả `convId` (khoá theo NGƯỜI, FR-030) và `chatId` (nơi gửi tin). Trong nhóm hai thứ
// này KHÁC nhau (`g1:B` vs `g1`); lấy nhầm thì lệnh trả lời vào một phòng không tồn tại, hoặc xoá dữ
// liệu của cả nhóm thay vì của một người.

/**
 * @param {object} o
 * @param {object} o.store
 * @param {(convId: string, row: object|null, hint: string|null) => string} o.chatIdOf
 */
export function taoTraDich({ store, chatIdOf }) {
  /** Phiếu theo id, kể cả phiếu đã đóng (nhân viên vẫn tra hồ sơ sau khi đóng phiếu). */
  function findTicket(id) {
    if (typeof store.tickets.get === 'function') return store.tickets.get(id);
    for (const st of ['open', 'claimed', 'closed']) {
      const found = store.tickets.list(st).find((t) => t.id === id);
      if (found) return found;
    }
    return null;
  }

  /**
   * @param {string} rawMa chuỗi người gõ sau tên lệnh
   * @returns {{ticket: object|null, convId: string, chatId: string, row: object|null}|null} null nếu không tra ra đích
   */
  function resolveTarget(rawMa) {
    const s = String(rawMa ?? '').trim();
    if (!s) return null;
    const m = /^#?[Pp]?(\d+)$/.exec(s);
    if (m) {
      const ticket = findTicket(Number(m[1]));
      if (!ticket) return null;
      const row = store.convs.get(ticket.conv_id);
      return { ticket, convId: ticket.conv_id, chatId: ticket.chat_id ?? chatIdOf(ticket.conv_id, row, null), row };
    }
    const ticket = store.tickets.openFor(s);
    const row = store.convs.get(s);
    if (!ticket && !row && !store.chats.get(s)) return null;
    const convId = ticket?.conv_id ?? s;
    return { ticket, convId, chatId: ticket?.chat_id ?? chatIdOf(convId, row, null), row: row ?? store.convs.get(convId) };
  }

  return { findTicket, resolveTarget };
}
