// Trạng thái phòng theo NGƯỜI (T022): bot | human | blocked. Thi hành Điều II của hiến pháp
// (`.specify/memory/constitution.md:17`) và FR-010 (`specs/001-nen-tang-chung/spec.md:212`).
//
// stateOf(convId)                  → trạng thái hiệu dụng; phòng 'human' lặng quá HUMAN_IDLE_MS thì TỰ VỀ 'bot'
// toHuman(convId, by, reason, o)   → nhân viên (hoặc khách xin người) cầm phòng
// toBot(convId, by)                → nhân viên trả phòng (/tra-bot); mở lại cả phòng 'blocked'
// block(convId, by, reason?)       → chặn một người (/chan)
// touch(convId, by?)               → lệnh nhân viên chạm vào phòng mà không sinh tin: đếm lại khoảng lặng
//
// Phần PHIẾU của T024 (`open`, `forward`, `flushDue`) nằm ở `core/handoff-ticket.js` — mỗi tệp một
// trách nhiệm, dưới 300 dòng (Điều VI). Tệp này nhận `gate` chỉ để chuyển tiếp xuống đó.
//
// Ba điều dễ sai, đã khoá bằng test ở `test/core/handoff-state.test.mjs`:
//  1. Trạng thái theo người chỉ ghi vào `convs`. Cửa gửi đọc `chats` cho chat 1-1 (`core/gate.js:27`),
//     nên 'human' nằm ở `chats` thì `/tra-bot` và tự về KHÔNG mở lại được phòng. `chats` chỉ giữ
//     'blocked' cấp nhóm (FR-032).
//  2. Khoảng lặng tính từ tin cuối của NGƯỜI (khách hoặc nhân viên) hoặc lần chạm cuối, KHÔNG từ lúc
//     mở phiếu: sự cố #4 (`specs/001-nen-tang-chung/research.md:13`) là 22 tin bot chen ngang nhân viên
//     vì hàng chờ tự nhận lại phòng sau 45 phút. Phiếu còn mở không chặn tự về; đóng phiếu không
//     làm phòng về ngay.
//  3. Tự về KHÔNG gửi tin nào. Phần trạng thái phòng không chạm tới `channel` lẫn `gate` (`gate` vào
//     tệp này từ T024 nhưng chỉ để chuyển xuống phần phiếu). Bot im tới tin khách kế tiếp.
import { redact } from './redact.js';
import { createTickets, TICKET_FORWARD_MS } from './handoff-ticket.js';

/** Khoảng lặng mặc định để phòng 'human' tự về 'bot': 2 giờ (anh Thắng chốt 06/11, research.md:71). */
export const HUMAN_IDLE_MS = 7_200_000;

export { TICKET_FORWARD_MS };

const STATES = new Set(['bot', 'human', 'blocked']);

/**
 * @param {object} o
 * @param {object} o.store                 `core/store.js`
 * @param {object} [o.gate]                cửa gửi duy nhất (`core/gate.js`) — phiếu là tin ra (Điều I)
 * @param {{ humanIdleMs?: number, staffChatId?: string, bannedPatterns?: RegExp[] }} [o.config]
 * @param {() => Date} o.now
 */
export function createHandoff({ store, gate = null, config = {}, now, log = () => {} }) {
  const idleMs = config.humanIdleMs ?? HUMAN_IDLE_MS;
  const staffChatId = config.staffChatId || '';
  const banned = config.bannedPatterns ?? [];

  const nowIso = () => now().toISOString();
  const ms = (s) => {
    const t = s == null ? NaN : Date.parse(s);
    return Number.isNaN(t) ? null : t;
  };

  /** Phòng (chat_id) của một cuộc trò chuyện; dòng chưa có thì lấy từ người gọi, cuối cùng là chính convId. */
  const chatIdOf = (convId, row, hint) => row?.chat_id ?? hint ?? convId;

  const phieu = createTickets({ store, gate, staffChatId, banned, now, chatIdOf, log });

  function audit(convId, chatId, from, to, by, reason) {
    store.audit.add({
      at: nowIso(), turn_id: null, conv_id: convId, chat_id: chatId, type: 'state-change',
      data: { from, to, by: by ?? null, reason: reason ?? null },
    });
  }

  /**
   * Mốc hoạt động cuối của phòng, lấy mốc MUỘN NHẤT trong ba nguồn:
   *  - `state_at`: lúc phòng sang 'human' (mốc bắt đầu đếm);
   *  - `last_inbound_at`: tin khách mới nhất, và lần `touch()` của lệnh nhân viên;
   *  - `messages.lastPersonAt`: tin cuối của người trong phòng — khách HOẶC nhân viên (`/tl` ghi
   *    speaker 'nhan-vien' qua cửa, `core/gate.js:98`). Tin bot không tính.
   * Phiếu (`tickets`) không có mặt ở đây: khoảng lặng không phụ thuộc phiếu.
   */
  function lastActiveMs(convId, row) {
    const mocs = [row?.state_at, row?.last_inbound_at, store.messages.lastPersonAt(convId)]
      .map(ms)
      .filter((t) => t !== null);
    return mocs.length ? Math.max(...mocs) : null;
  }

  /**
   * Trạng thái hiệu dụng của một cuộc trò chuyện, cùng thứ tự ưu tiên với cửa gửi (`core/gate.js:22`):
   * `chats.blocked` (cả nhóm) → trạng thái theo người → 'bot'.
   * Phòng 'human' đã lặng quá ngưỡng thì tự về 'bot' NGAY TRONG LƯỢT ĐỌC NÀY (ghi `convs` + audit,
   * không gửi tin). Gọi lại nhiều lần chỉ ghi audit một lần, vì lần đầu đã đổi `convs.state`.
   * @returns {'bot'|'human'|'blocked'}
   */
  function stateOf(convId) {
    const row = store.convs.get(convId);
    const chatId = chatIdOf(convId, row, null);
    if (store.chats.get(chatId)?.state === 'blocked') return 'blocked'; // chặn cấp nhóm (FR-032)
    const st = row?.state ?? 'bot';
    if (st !== 'human') return STATES.has(st) ? st : 'bot';             // 'blocked' chỉ /tra-bot mở lại

    const last = lastActiveMs(convId, row);
    if (last === null || now().getTime() - last < idleMs) return 'human';
    try {
      store.tx(() => {
        store.convs.setState(convId, chatId, 'bot', 'system', 'idle-timeout', nowIso());
        audit(convId, chatId, 'human', 'bot', 'system', 'idle-timeout');
      });
    } catch (e) {
      // Không ghi được thì giữ 'human': thà bot im thêm một lúc còn hơn chen ngang nhân viên (Điều II, VII).
      log('handoff idle-timeout lỗi', redact(e?.message));
      return 'human';
    }
    return 'bot';
  }

  /** Đổi trạng thái theo người + một audit `state-change`. `chats` không bị đụng tới. */
  function setState(convId, to, by, reason, { chatId = null } = {}) {
    if (!STATES.has(to)) throw new Error(`handoff: trạng thái lạ "${to}"`);
    const row = store.convs.get(convId);
    const cid = chatIdOf(convId, row, chatId);
    const from = row?.state ?? 'bot';
    const at = nowIso();
    store.tx(() => {
      store.convs.setState(convId, cid, to, by, reason, at);
      audit(convId, cid, from, to, by, reason);
    });
    return { convId, chatId: cid, from, to };
  }

  return {
    stateOf,
    /** Phiếu cho nhóm nhân viên (T024) — mã ở `core/handoff-ticket.js`. */
    open: phieu.open,
    forward: phieu.forward,
    flushDue: phieu.flushDue,
    TICKET_FORWARD_MS,
    /** Người cầm phòng: khách xin gặp người, `/nhan`, `/tl`, hoặc gói yêu cầu chuyển người (FR-014). */
    toHuman: (convId, by, reason = 'handoff', o = {}) => setState(convId, 'human', by, reason, o),
    /** Nhân viên trả phòng (`/tra-bot`): mở lại cả phòng 'human' và 'blocked' (data-model.md:40). */
    toBot: (convId, by, o = {}) => setState(convId, 'bot', by, 'tra-bot', o),
    /** Chặn một người (`/chan`, FR-032). Phòng 'blocked' KHÔNG tự về theo khoảng lặng. */
    block: (convId, by, reason = 'chan', o = {}) => setState(convId, 'blocked', by, reason, o),
    /**
     * Lệnh nhân viên chạm vào phòng mà không sinh tin nào (ví dụ `/nhan` trên phòng đã 'human'):
     * đếm lại khoảng lặng, không đổi trạng thái, không ghi `state-change`.
     */
    touch(convId, by = null, { chatId = null } = {}) {
      const row = store.convs.get(convId);
      const cid = chatIdOf(convId, row, chatId);
      const at = nowIso();
      store.convs.upsertSeen(convId, cid, row?.user_id ?? null, row?.display_name ?? null, at);
      store.audit.add({ at, turn_id: null, conv_id: convId, chat_id: cid, type: 'handoff-touch', data: { by: by ?? null } });
      return at;
    },
    HUMAN_IDLE_MS: idleMs,
  };
}
