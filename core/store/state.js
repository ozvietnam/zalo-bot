// chats, sessions, tickets, meta.
import { fromJson, isUniqueViolation, patchRow, toJson } from './util.js';

export function chatsTable(db) {
  const get = db.prepare('SELECT * FROM chats WHERE chat_id = ?');
  const seen = db.prepare(`INSERT INTO chats (chat_id, kind, title, last_inbound_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (chat_id) DO UPDATE SET kind = COALESCE(excluded.kind, kind), title = COALESCE(excluded.title, title), last_inbound_at = excluded.last_inbound_at`);
  const state = db.prepare(`INSERT INTO chats (chat_id, state, state_by, state_reason, state_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (chat_id) DO UPDATE SET state = excluded.state, state_by = excluded.state_by, state_reason = excluded.state_reason, state_at = excluded.state_at`);
  return {
    get: (id) => get.get(id) ?? null,
    upsertSeen: (id, kind, title, at) => { seen.run(id, kind ?? null, title ?? null, at); },
    setState: (id, st, by, reason, at) => { state.run(id, st, by ?? null, reason ?? null, at); },
  };
}

/** convs: khoá theo NGƯỜI (chatId:userId trong nhóm). state nằm ở đây, chats giữ trạng thái theo phòng. */
export function convsTable(db) {
  const get = db.prepare('SELECT * FROM convs WHERE conv_id = ?');
  const seen = db.prepare(`INSERT INTO convs (conv_id, chat_id, user_id, display_name, last_inbound_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (conv_id) DO UPDATE SET chat_id = excluded.chat_id, user_id = excluded.user_id,
      display_name = COALESCE(excluded.display_name, display_name), last_inbound_at = excluded.last_inbound_at`);
  const state = db.prepare(`INSERT INTO convs (conv_id, chat_id, state, state_by, state_reason, state_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (conv_id) DO UPDATE SET state = excluded.state, state_by = excluded.state_by,
      state_reason = excluded.state_reason, state_at = excluded.state_at`);
  return {
    get: (convId) => get.get(convId) ?? null,
    /** Gặp lại người: cập nhật ai/ở đâu/lúc nào, KHÔNG đụng state. */
    upsertSeen: (convId, chatId, userId, displayName, at) => { seen.run(convId, chatId, userId ?? null, displayName ?? null, at); },
    /** Chuyển trạng thái; conv chưa có thì tạo dòng (chat_id = phòng; không biết thì dùng conv_id).
     *  Dòng đã có thì KHÔNG đụng chat_id (đọc lại chat_id đúng sẵn có). */
    setState: (convId, chatId, st, by, reason, at) => { state.run(convId, chatId ?? convId, st, by ?? null, reason ?? null, at); },
  };
}

export function sessionsTable(db) {
  const get = db.prepare('SELECT data, updated_at FROM sessions WHERE key = ?');
  const set = db.prepare(`INSERT INTO sessions (key, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`);
  return {
    get(key, ttlMs, now) {
      const t = Date.parse(now);
      if (Number.isNaN(t)) throw new Error(`sessions.get: invalid now: ${now}`);
      const r = get.get(key);
      if (!r) return {};
      if (!(t - Date.parse(r.updated_at) <= ttlMs)) return {}; // NaN (updated_at hỏng) coi như hết hạn
      return fromJson(r.data, {}) ?? {};
    },
    set: (key, data, now) => { set.run(key, toJson(data), now); },
  };
}

const TICKET_COLS = ['reason', 'status', 'claimed_by', 'claimed_at', 'closed_at', 'last_forward_at'];

export function ticketsTable(db) {
  const byId = db.prepare('SELECT * FROM tickets WHERE id = ?');
  const openFor = db.prepare("SELECT * FROM tickets WHERE conv_id = ? AND status IN ('open','claimed') ORDER BY id DESC LIMIT 1");
  const ins = db.prepare("INSERT INTO tickets (conv_id, chat_id, reason, status, opened_at) VALUES (?, ?, ?, 'open', ?)");
  const list = db.prepare('SELECT * FROM tickets WHERE status = ? ORDER BY id');
  return {
    openFor: (convId) => openFor.get(convId) ?? null,
    /** Mở phiếu cho một cuộc trò chuyện (conv_id = khoá phiếu); chat_id = nơi gửi (phòng/nhóm). */
    open(convId, chatId, reason, at) {
      const cur = openFor.get(convId);
      if (cur) return cur;
      try {
        return byId.get(Number(ins.run(convId, chatId ?? convId, reason, at).lastInsertRowid));
      } catch (e) {
        if (isUniqueViolation(e)) return openFor.get(convId); // thua cuộc đua với ux_tickets_open
        throw e;
      }
    },
    update: (id, patch) => patchRow(db, 'tickets', 'id', id, patch, TICKET_COLS),
    list: (status) => list.all(status),
  };
}

export function metaTable(db) {
  const get = db.prepare('SELECT value FROM meta WHERE key = ?');
  const set = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value');
  return {
    get: (k) => get.get(k)?.value ?? null,
    set: (k, v) => { set.run(k, v === null || v === undefined ? null : String(v)); },
  };
}
