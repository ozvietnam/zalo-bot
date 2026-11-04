// chats, sessions, tickets, meta.
import { fromJson, patchRow, toJson } from './util.js';

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

export function sessionsTable(db) {
  const get = db.prepare('SELECT data, updated_at FROM sessions WHERE key = ?');
  const set = db.prepare(`INSERT INTO sessions (key, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`);
  return {
    get(key, ttlMs, now) {
      const r = get.get(key);
      if (!r || Date.parse(now) - Date.parse(r.updated_at) > ttlMs) return {};
      return fromJson(r.data, {}) ?? {};
    },
    set: (key, data, now) => { set.run(key, toJson(data), now); },
  };
}

const TICKET_COLS = ['reason', 'status', 'claimed_by', 'claimed_at', 'closed_at', 'last_forward_at'];

export function ticketsTable(db) {
  const byId = db.prepare('SELECT * FROM tickets WHERE id = ?');
  const openFor = db.prepare("SELECT * FROM tickets WHERE chat_id = ? AND status IN ('open','claimed') ORDER BY id DESC LIMIT 1");
  const ins = db.prepare("INSERT INTO tickets (chat_id, reason, status, opened_at) VALUES (?, ?, 'open', ?)");
  const list = db.prepare('SELECT * FROM tickets WHERE status = ? ORDER BY id');
  return {
    openFor: (chatId) => openFor.get(chatId) ?? null,
    open: (chatId, reason, at) => byId.get(Number(ins.run(chatId, reason, at).lastInsertRowid)),
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
