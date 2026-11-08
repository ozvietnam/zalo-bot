// Người trước máy trong một lượt (T026): lệnh nhân viên, phòng do người cầm, hai ý lõi tự nhận, gói xin
// chuyển người. Thi hành Điều II, Điều VIII và FR-011, FR-012, FR-014, FR-032 (`specs/001-nen-tang-chung/spec.md:229`).
// Tách khỏi `core/engine.js` để tệp đó dưới 300 dòng (Điều VI) — cùng lối `engine-ctx.js`.
// Tệp này KHÔNG tự gửi: câu cho khách đi qua `reply` của engine (tức `gate.send`), phiếu qua `handoff`.
import { wantsHuman, asksIfBot, REPLY_HANDOFF, REPLY_IS_BOT } from './intents.js';

/**
 * @param {object} o
 * @param {object} o.store
 * @param {object} o.handoff       `core/handoff.js` (stateOf, toHuman, command, open, forward)
 * @param {string} [o.staffChatId] nhóm nhân viên
 * @param {(type:string, chatId:string, convId:string|null, turnId:string, data:object)=>void} o.audit
 * @param {(turn:object, text:string, i:number|string, o?:object)=>Promise<object>} o.reply  gửi qua cửa
 * @param {(convId:string, labels:string[])=>void} [o.ganNhan]  gắn nhãn tự động vào hồ sơ khách (T035);
 *   không truyền thì bỏ qua — tệp này không dựng hồ sơ riêng, hồ sơ là việc của engine.
 */
export function createHumanRoute({ store, handoff, staffChatId = '', audit, reply, ganNhan = null }) {
  const staffChat = String(staffChatId || '').trim();
  const kq = (turn, i, g) => ({ idemKey: `r:${turn.convId}:${turn.turnId}:${i}`, decision: g?.decision, reason: g?.reason, status: g?.status });

  /**
   * Trạng thái phòng của lượt. Engine phải gọi TRƯỚC `convs.upsertSeen`: upsertSeen dời `last_inbound_at`
   * tới bây giờ, mà `stateOf` tính khoảng lặng từ mốc đó — đọc sau thì phòng 'human' đã lặng 2 giờ không
   * bao giờ tự về, bot im mãi. Chặn cả nhóm đọc thẳng `chats`: người MỚI vào nhóm chưa có dòng `convs`,
   * nên `stateOf` không suy ra được phòng của họ.
   * @returns {'bot'|'human'|'blocked'}
   */
  const phong = (chatId, convId) => (store.chats.get(chatId)?.state === 'blocked' ? 'blocked' : handoff.stateOf(convId));

  /**
   * Lệnh nhân viên (/tl /nhan /tra-bot /chan /chan-nhom /cho). `handoff.command` tự kiểm quyền (nhóm
   * STAFF_CHAT_ID + STAFF_USERS) và ghi audit. Trả null nếu lượt không phải lệnh, để lượt đi tiếp như
   * thường. Bị từ chối NGOÀI nhóm nhân viên (khách gõ "/cho") cũng null: với khách đó chỉ là chữ.
   */
  async function lenh(turn, ghiVao) {
    if (!turn.text?.startsWith('/')) return null;
    const r = await handoff.command(turn);
    if (!r.matched || (r.denied && turn.chatId !== staffChat)) return null;
    ghiVao(turn.text, { staffCmd: r.cmd });
    audit('route', turn.chatId, turn.convId, turn.turnId, { pack: null, staffCmd: r.cmd, ok: r.ok === true, reason: r.reason ?? null });
    return r.denied ? { skipped: 'staff-cmd-denied', cmd: r.cmd } : { handled: 'staff-cmd', cmd: r.cmd };
  }

  /**
   * Phòng do người cầm hoặc bị chặn: ghi tin khách (phiếu gộp đọc từ `messages`), chuyển phiếu, rồi IM —
   * không gói, không Cổng, không mô hình, không cả câu "gửi hơi nhanh" (FR-011). Phòng 'blocked' không
   * chuyển phiếu: nhân viên đã chặn người đó thì không đẩy tin của họ vào nhóm nữa.
   */
  async function im(turn, said, state, ghiVao) {
    ghiVao(said, { state });
    if (said) store.messages.add({ conv_id: turn.convId, chat_id: turn.chatId, turn_id: turn.turnId, speaker: 'khach', speaker_id: turn.userId, text: said, at: turn.receivedAt });
    const fw = state === 'human' ? await handoff.forward(turn.convId) : null;
    audit('outbound', turn.chatId, turn.convId, turn.turnId, { skipped: `chat-${state}`, results: [], forwarded: fw?.soTin ?? 0 });
    return { skipped: `chat-${state}` };
  }

  /**
   * Chuyển người (FR-014): đổi trạng thái TRƯỚC rồi mới mở phiếu — phiếu lỗi thì bot vẫn im.
   * Nhãn (T035) gắn trước `open`: phiếu mới in `summary()` của hồ sơ, nên nhãn gắn sau thì nhân viên
   * đọc phiếu không thấy chính lý do phiếu được mở.
   */
  async function chuyen(turn, by, reason, nhan = null) {
    if (nhan && ganNhan) ganNhan(turn.convId, [nhan]);
    if (handoff.stateOf(turn.convId) !== 'human') handoff.toHuman(turn.convId, by, reason, { chatId: turn.chatId });
    return handoff.open(turn.convId, reason, { chatId: turn.chatId });
  }

  /**
   * Hai ý lõi tự nhận (T023), xét TRƯỚC `registry.pick`. Xin gặp người xét trước: bỏ sót lời xin gặp người
   * nặng hơn (FR-014). Câu trả lời gửi TRƯỚC khi đổi phòng — đổi trước thì cửa chặn chính câu đó (`chat-human`).
   * Không nối footer của gói (`core/intents.js:194`).
   */
  async function y(turn) {
    // Nhóm nhân viên không phải khách: "gặp nhân viên" gõ trong đó không mở phiếu cho chính nhân viên.
    if (turn.text == null || (staffChat && turn.chatId === staffChat)) return null;
    const muon = wantsHuman(turn.text) ? 'wants-human' : asksIfBot(turn.text) ? 'asks-bot' : null;
    if (!muon) return null;
    audit('route', turn.chatId, turn.convId, turn.turnId, { pack: null, intent: muon });
    const g = await reply(turn, muon === 'wants-human' ? REPLY_HANDOFF : REPLY_IS_BOT, 0);
    // Nhãn `xin-nguoi` (T035): khách đã từng xin gặp người. Khác `co-sdt` (hồ sơ tự gắn khi thấy số),
    // nhãn này do lõi gắn vì chỉ lõi biết ý "gặp người" (`core/intents.js`).
    if (muon === 'wants-human') await chuyen(turn, 'khach', 'khach-xin-nguoi', 'xin-nguoi');
    audit('outbound', turn.chatId, turn.convId, turn.turnId, { intent: muon, results: [kq(turn, 0, g)] });
    return { handled: muon };
  }

  /**
   * Gói trả `handoff: { reason }` (`contracts/pack.md:26`): gói không tự viết câu hứa (`contracts/pack.md:69`),
   * nên lõi báo khách bằng câu cố định (khoá idem `r:<conv>:<turn>:h`) rồi chuyển người.
   * @returns {Promise<object>} kết quả cửa của câu báo, để engine ghi vào audit `outbound`
   */
  async function goiChuyen(turn, pack, h, evidence) {
    const reason = String(h?.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'handoff';
    const g = await reply(turn, REPLY_HANDOFF, 'h', { pack, evidence });
    await chuyen(turn, `pack:${pack.id}`, reason);
    return { ...kq(turn, 'h', g), handoff: reason };
  }

  return { phong, lenh, im, y, goiChuyen };
}
