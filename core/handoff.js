// Trạng thái phòng theo NGƯỜI (T022): bot | human | blocked. Thi hành Điều II của hiến pháp
// (`.specify/memory/constitution.md:17`) và FR-010 (`specs/001-nen-tang-chung/spec.md:212`).
//
// stateOf(convId)                  → trạng thái hiệu dụng; phòng 'human' lặng quá HUMAN_IDLE_MS thì TỰ VỀ 'bot'
// toHuman(convId, by, reason, o)   → nhân viên (hoặc khách xin người) cầm phòng
// toBot(convId, by)                → nhân viên trả phòng (/tra-bot); mở lại cả phòng 'blocked'
// block(convId, by, reason?)       → chặn một người (/chan)
// touch(convId, by?)               → lệnh nhân viên chạm vào phòng mà không sinh tin: đếm lại khoảng lặng
// command(turn)                    → xử lý lệnh nhân viên (/tl, /nhan, /tra-bot, /chan, /chan-nhom, /cho) (T025)
//
// Phần PHIẾU của T024 (`open`, `forward`, `flushDue`, và `note` của T026) nằm ở `core/handoff-ticket.js` — mỗi tệp một
// trách nhiệm, dưới 300 dòng (Điều VI). Tệp này nhận `gate` cho phần phiếu và lệnh nhân viên, và dựng
// hồ sơ khách (T035) để phiếu mới kèm `summary()`.
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
import { redact, findLeak } from './redact.js';
import { groupNameTag, stripMention } from './mention.js';
import { createTickets, TICKET_FORWARD_MS } from './handoff-ticket.js';
import { createCustomers } from './customers.js';
import { taoTraDich } from './handoff-dich.js';
import { createHoSoCmds } from './handoff-hoso.js';

/** Khoảng lặng mặc định để phòng 'human' tự về 'bot': 2 giờ (anh Thắng chốt 06/11, research.md:71). */
export const HUMAN_IDLE_MS = 7_200_000;

export { TICKET_FORWARD_MS };

const STATES = new Set(['bot', 'human', 'blocked']);
// Mọi lệnh nhân viên qua MỘT cửa nhận lệnh, để luật quyền (nhóm STAFF_CHAT_ID + STAFF_USERS) chỉ có
// một bản. Thứ tự trong nhánh lựa chọn có nghĩa: tên dài phải đứng TRƯỚC tên là tiền tố của nó
// (`chan-nhom` trước `chan`), nếu không `/chan-nhom g1` khớp thành `chan` với phần dư "-nhom g1".
const CMD_RE = /^\/(tl|nhan|tra-bot|chan-nhom|chan|cho|ho-so|gan|go|ghi|xoa-du-lieu)(?:\s+([\s\S]*))?$/i;
/** Lệnh hồ sơ (T036) — phần thân nằm ở `core/handoff-hoso.js`. */
const HOSO_CMDS = new Set(['ho-so', 'gan', 'go', 'ghi', 'xoa-du-lieu']);
const toSet = (v) => new Set((typeof v === 'string' ? v.split(',') : [...(v ?? [])]).map((s) => String(s).trim()).filter(Boolean));

/**
 * @param {object} o
 * @param {object} o.store                 `core/store.js`
 * @param {object} [o.gate]                cửa gửi duy nhất (`core/gate.js`) — phiếu là tin ra (Điều I)
 * @param {{ humanIdleMs?: number, staffChatId?: string, staffUsers?: Iterable<string>|string, bannedPatterns?: RegExp[], botNames?: string[] }} [o.config]
 * @param {() => Date} o.now
 */
export function createHandoff({ store, gate = null, config = {}, now, log = () => {} }) {
  const idleMs = config.humanIdleMs ?? HUMAN_IDLE_MS;
  const staffChatId = String(config.staffChatId || '').trim();
  const staffUsers = toSet(config.staffUsers);
  const banned = config.bannedPatterns ?? [];
  const botNames = config.botNames ?? [];
  let cmdSeq = 0;

  const nowIso = () => now().toISOString();
  const ms = (s) => { const t = s == null ? NaN : Date.parse(s); return Number.isNaN(t) ? null : t; };
  const cleanName = (s) => {
    const r = redact(String(s ?? '')).replace(/\s+/g, ' ').trim();
    return findLeak(r, banned) ? '(đã che)' : r;
  };

  /** Phòng (chat_id) của một cuộc trò chuyện; dòng chưa có thì lấy từ người gọi, cuối cùng là chính convId. */
  const chatIdOf = (convId, row, hint) => row?.chat_id ?? hint ?? convId;
  // Bản hồ sơ riêng: được, vì `createCustomers` chỉ đọc/ghi `store.customers` (xem `core/engine.js:46`).
  const hoSoKhach = createCustomers({ store, config, now });
  const phieu = createTickets({ store, gate, staffChatId, banned, now, chatIdOf, log, hoSo: (c) => hoSoKhach.summary(c) });
  // Tra đích (`P<n>` hoặc `conv_id`) dùng chung cho mọi lệnh nhân viên — một bản duy nhất (T036).
  const { resolveTarget } = taoTraDich({ store, chatIdOf });

  const audit = (convId, chatId, from, to, by, reason) => store.audit.add({
    at: nowIso(), turn_id: null, conv_id: convId, chat_id: chatId, type: 'state-change',
    data: { from, to, by: by ?? null, reason: reason ?? null },
  });

  /**
   * Mốc hoạt động cuối của phòng, lấy mốc MUỘN NHẤT trong ba nguồn:
   *  - `state_at`: lúc phòng sang 'human' (mốc bắt đầu đếm);
   *  - `last_inbound_at`: tin khách mới nhất, và lần `touch()` của lệnh nhân viên;
   *  - `messages.lastPersonAt`: tin cuối của người trong phòng — khách HOẶC nhân viên (`/tl` ghi
   *    speaker 'nhan-vien' qua cửa, `core/gate.js:98`). Tin bot không tính.
   * Phiếu (`tickets`) không có mặt ở đây: khoảng lặng không phụ thuộc phiếu.
   */
  function lastActiveMs(convId, row) {
    const mocs = [row?.state_at, row?.last_inbound_at, store.messages.lastPersonAt(convId)].map(ms).filter((t) => t !== null);
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

  /** Người cầm phòng: khách xin gặp người, `/nhan`, `/tl`, hoặc gói yêu cầu chuyển người (FR-014). */
  const toHuman = (convId, by, reason = 'handoff', o = {}) => setState(convId, 'human', by, reason, o);
  /** Nhân viên trả phòng (`/tra-bot`): mở lại cả phòng 'human' và 'blocked' (data-model.md:40). */
  const toBot = (convId, by, o = {}) => setState(convId, 'bot', by, 'tra-bot', o);
  /** Chặn một người (`/chan`, FR-032). Phòng 'blocked' KHÔNG tự về theo khoảng lặng. */
  const block = (convId, by, reason = 'chan', o = {}) => setState(convId, 'blocked', by, reason, o);

  /**
   * Lệnh nhân viên chạm vào phòng mà không sinh tin nào (ví dụ `/nhan` trên phòng đã 'human'):
   * đếm lại khoảng lặng, không đổi trạng thái, không ghi `state-change`.
   */
  function touch(convId, by = null, { chatId = null } = {}) {
    const row = store.convs.get(convId);
    const cid = chatIdOf(convId, row, chatId);
    const at = nowIso();
    store.convs.upsertSeen(convId, cid, row?.user_id ?? null, row?.display_name ?? null, at);
    store.audit.add({ at, turn_id: null, conv_id: convId, chat_id: cid, type: 'handoff-touch', data: { by: by ?? null } });
    return at;
  }

  async function guiNhom(idemKey, turnId, text) {
    if (!staffChatId || !gate) return null;
    const an = findLeak(text, banned) ? '⚠️ Nội dung phản hồi lệnh bị che vì có dấu hiệu lộ thông tin nội bộ.' : text;
    try { return await gate.send({ idemKey, chatId: staffChatId, convId: staffChatId, turnId, kind: 'ticket', text: an }); }
    catch (e) { log('không gửi được phản hồi lệnh nhân viên', redact(e?.message)); return null; }
  }

  const auditCmd = (turnId, convId, chatId, data, type = 'staff-cmd') =>
    store.audit.add({ at: nowIso(), turn_id: turnId, conv_id: convId, chat_id: chatId, type, data });

  // Lệnh hồ sơ (T036) ở tệp riêng; nhận lại đúng đường gửi, tra đích và audit của tệp này nên luật
  // quyền và luật che chỉ có MỘT bản.
  const hoSoCmds = createHoSoCmds({
    store, hoSoKhach, banned, resolveTarget, guiNhom, auditCmd, nowIso,
    audit: (r) => store.audit.add(r),
  });

  /**
   * Xử lý lệnh nhân viên trong nhóm STAFF_CHAT_ID: `/tl`, `/nhan`, `/tra-bot`, `/chan`, `/chan-nhom`,
   * `/cho` (T025) và `/ho-so`, `/gan`, `/go`, `/ghi`, `/xoa-du-lieu` (T036).
   */
  async function command(turn) {
    const raw = String(turn?.text ?? '').trim();
    const m = CMD_RE.exec(raw.startsWith('/') ? raw : stripMention(raw, botNames));
    if (!m) return { matched: false, handled: false, ok: false };
    const cmd = m[1].toLowerCase();
    const rest = (m[2] ?? '').trim();
    const userId = turn?.userId != null ? String(turn.userId).trim() : '';
    const userName = cleanName(turn?.userName);
    const fromChatId = turn?.chatId != null ? String(turn.chatId).trim() : '';
    const turnId = turn?.turnId ?? turn?.updateKey ?? turn?.id ?? null;
    const inStaffChat = Boolean(staffChatId) && fromChatId === staffChatId;
    const isStaffUser = staffUsers.size > 0 ? Boolean(userId) && staffUsers.has(userId) && turn?.isStaff !== false : turn?.isStaff === true;
    if (!inStaffChat || !isStaffUser) {
      const reason = !isStaffUser ? 'not-staff-user' : 'not-staff-chat';
      auditCmd(turnId, turn?.convId ?? (fromChatId || null), fromChatId || null, { cmd, userId: userId || null, chatId: fromChatId || null, reason }, 'staff-cmd:denied');
      return { matched: true, handled: false, ok: false, denied: true, cmd, reason };
    }
    if (userId && userName) store.convs.upsertSeen(`${staffChatId}:${userId}`, staffChatId, userId, userName, nowIso());

    // Lệnh hồ sơ (T036): xét sau khi đã kiểm quyền, trước các lệnh phòng. Không đụng trạng thái phòng
    // và không gọi `touch` — đọc/sửa sổ hồ sơ không phải là "nhân viên đang trả lời khách", nên không
    // được đặt lại bộ đếm khoảng lặng 2 giờ của phòng 'human' (Điều II; sự cố #4 `research.md:13`).
    if (HOSO_CMDS.has(cmd)) return hoSoCmds.command(`/${cmd}${rest ? ` ${rest}` : ''}`, { userId, turnId });

    if (cmd === 'cho') {
      const nowMs = now().getTime();
      const list = store.tickets.list('open').map((t) => {
        const openMs = ms(t.opened_at);
        const waitMinutes = openMs === null ? 0 : Math.max(0, Math.floor((nowMs - openMs) / 60_000));
        const ten = cleanName(store.convs.get(t.conv_id)?.display_name) || t.conv_id;
        return { id: t.id, code: `P${t.id}`, convId: t.conv_id, chatId: t.chat_id, reason: t.reason, openedAt: t.opened_at, waitMinutes, ten };
      });
      const text = list.length
        ? [`📋 Hàng chờ (${list.length} phiếu open):`, ...list.map((x) => `- ${x.code} · ${x.ten} (${x.convId}) · ${x.reason} · chờ ${x.waitMinutes} phút`)].join('\n')
        : '📋 Hàng chờ: 0 phiếu open.';
      const sent = await guiNhom(`cmd:cho:${turnId ?? `auto-${++cmdSeq}`}`, turnId, text);
      auditCmd(turnId, staffChatId, staffChatId, { cmd: 'cho', by: userId, openCount: list.length });
      return { matched: true, handled: true, ok: true, cmd: 'cho', tickets: list, text, sent };
    }

    if (cmd === 'chan-nhom') {
      if (!rest) return { matched: true, handled: true, ok: false, cmd, reason: 'invalid-args' };
      const targetChatId = resolveTarget(rest)?.chatId ?? rest.split(/\s+/)[0];
      const from = store.chats.get(targetChatId)?.state ?? 'bot';
      store.tx(() => {
        store.chats.setState(targetChatId, 'blocked', userId, 'chan-nhom', nowIso());
        audit(null, targetChatId, from, 'blocked', userId, 'chan-nhom');
        auditCmd(turnId, null, targetChatId, { cmd: 'chan-nhom', by: userId, chatId: targetChatId });
      });
      return { matched: true, handled: true, ok: true, cmd: 'chan-nhom', chatId: targetChatId };
    }

    if (cmd === 'tl') {
      const parts = /^(\S+)\s+([\s\S]+)$/.exec(rest);
      const body = parts?.[2]?.trim() ?? '';
      if (!parts || !body) return { matched: true, handled: true, ok: false, cmd: 'tl', reason: 'invalid-args' };
      const target = resolveTarget(parts[1]);
      if (!target) return { matched: true, handled: true, ok: false, cmd: 'tl', reason: 'ticket-not-found' };
      const { ticket, convId, chatId, row } = target;
      const isGroup = convId !== chatId;
      const prefix = isGroup
        ? groupNameTag({ isGroup: true, userName: row?.display_name ?? null, userId: row?.user_id ?? (convId.startsWith(`${chatId}:`) ? convId.slice(chatId.length + 1) : null), members: store.convs.listByChat(chatId) })
        : '';
      const textToSend = prefix && !body.startsWith(prefix.trim()) ? prefix + body : body;
      const idemKey = `s:${ticket?.id ?? convId}:${turnId ?? `auto-${++cmdSeq}`}`;
      let sent = null;
      if (gate) {
        try { sent = await gate.send({ idemKey, chatId, convId, isGroup, turnId, kind: 'staff_relay', text: textToSend, staffId: userId }); }
        catch (e) { log('lệnh /tl gửi lỗi', redact(e?.message)); return { matched: true, handled: true, ok: false, cmd: 'tl', reason: 'send-error', sent: null }; }
      }
      const ok = !gate || sent?.decision === 'send' || sent?.reason === 'duplicate-idem';
      if (ok) {
        if (stateOf(convId) !== 'human') toHuman(convId, userId, 'tl', { chatId });
        touch(convId, userId, { chatId });
      }
      auditCmd(turnId, convId, chatId, { cmd: 'tl', by: userId, ticketId: ticket?.id ?? null, idemKey, decision: sent?.decision ?? null });
      return { matched: true, handled: true, ok, cmd: 'tl', ticketId: ticket?.id ?? null, convId, chatId, sent };
    }

    const target = resolveTarget(rest.split(/\s+/)[0]);
    if (!target) return { matched: true, handled: true, ok: false, cmd, reason: 'ticket-not-found' };
    const { ticket, convId, chatId } = target;

    if (cmd === 'nhan') {
      if (!ticket) return { matched: true, handled: true, ok: false, cmd: 'nhan', reason: 'ticket-not-found' };
      if (ticket.status === 'claimed') {
        const owner = ticket.claimed_by;
        const ten = cleanName(store.convs.get(`${staffChatId}:${owner}`)?.display_name ?? store.convs.get(owner)?.display_name) || owner;
        const text = ten && ten !== owner ? `P${ticket.id} đã có ${ten} nhận (${owner})` : `P${ticket.id} đã có ${owner} nhận`;
        if (stateOf(convId) === 'human') touch(convId, userId, { chatId });
        const sent = await guiNhom(`cmd:nhan:${ticket.id}:${turnId ?? `auto-${++cmdSeq}`}`, turnId, text);
        auditCmd(turnId, convId, chatId, { cmd: 'nhan', by: userId, ticketId: ticket.id, status: 'already-claimed', claimedBy: owner });
        return { matched: true, handled: true, ok: false, alreadyClaimed: true, cmd: 'nhan', ticketId: ticket.id, claimedBy: owner, text, sent };
      }
      if (ticket.status !== 'open') return { matched: true, handled: true, ok: false, cmd: 'nhan', ticketId: ticket.id, reason: 'ticket-closed' };
      store.tickets.update(ticket.id, { status: 'claimed', claimed_by: userId, claimed_at: nowIso() });
      if (stateOf(convId) !== 'human') toHuman(convId, userId, 'nhan', { chatId });
      else touch(convId, userId, { chatId });
      auditCmd(turnId, convId, chatId, { cmd: 'nhan', by: userId, ticketId: ticket.id, status: 'claimed' });
      return { matched: true, handled: true, ok: true, cmd: 'nhan', ticketId: ticket.id, convId, chatId, claimedBy: userId };
    }

    if (cmd === 'tra-bot') {
      const openTicket = ticket && ticket.status !== 'closed' ? ticket : store.tickets.openFor(convId);
      if (openTicket && openTicket.status !== 'closed') store.tickets.update(openTicket.id, { status: 'closed', closed_at: nowIso() });
      if (convId === chatId && store.chats.get(chatId)?.state === 'blocked') store.chats.setState(chatId, 'bot', userId, 'tra-bot', nowIso());
      toBot(convId, userId, { chatId });
      auditCmd(turnId, convId, chatId, { cmd: 'tra-bot', by: userId, ticketId: (openTicket ?? ticket)?.id ?? null, status: 'closed' });
      return { matched: true, handled: true, ok: true, cmd: 'tra-bot', ticketId: (openTicket ?? ticket)?.id ?? null, convId, chatId };
    }

    block(convId, userId, 'chan', { chatId });
    auditCmd(turnId, convId, chatId, { cmd: 'chan', by: userId, ticketId: ticket?.id ?? null });
    return { matched: true, handled: true, ok: true, cmd: 'chan', ticketId: ticket?.id ?? null, convId, chatId };
  }

  return {
    stateOf, open: phieu.open, forward: phieu.forward, flushDue: phieu.flushDue, note: phieu.note, TICKET_FORWARD_MS,
    toHuman, toBot, block, touch, command, HUMAN_IDLE_MS: idleMs,
  };
}
