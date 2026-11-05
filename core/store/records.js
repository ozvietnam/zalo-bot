// audit, messages, customers.
import { fromJson, toJson } from './util.js';

const auditOut = (r) => ({ ...r, data: fromJson(r.data) });

export function auditTable(db) {
  const ins = db.prepare('INSERT INTO audit (at, turn_id, chat_id, type, data) VALUES (?, ?, ?, ?, ?)');
  const byTurn = db.prepare('SELECT * FROM audit WHERE turn_id = ? ORDER BY id');
  const byChat = db.prepare('SELECT * FROM audit WHERE chat_id = ? ORDER BY at DESC, id DESC LIMIT ?');
  const prune = db.prepare('DELETE FROM audit WHERE at < ?');
  return {
    add: (r) => { ins.run(r.at, r.turn_id ?? null, r.chat_id ?? null, r.type, toJson(r.data)); },
    byTurn: (turnId) => byTurn.all(turnId).map(auditOut),
    byChat: (chatId, limit = 50) => byChat.all(chatId, limit).map(auditOut),
    prune: (beforeIso) => { prune.run(beforeIso); },
  };
}

export function messagesTable(db) {
  const ins = db.prepare('INSERT INTO messages (chat_id, turn_id, speaker, speaker_id, text, outbox_id, at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const recent = db.prepare('SELECT * FROM (SELECT * FROM messages WHERE chat_id = ? ORDER BY at DESC, id DESC LIMIT ?) ORDER BY at, id');
  const del = db.prepare('DELETE FROM messages WHERE chat_id = ?');
  return {
    add: (m) => Number(ins.run(m.chat_id, m.turn_id ?? null, m.speaker, m.speaker_id ?? null, m.text ?? null, m.outbox_id ?? null, m.at).lastInsertRowid),
    recent: (chatId, n) => recent.all(chatId, n),
    deleteChat: (chatId) => Number(del.run(chatId).changes),
  };
}

const custOut = (r) => (r ? { ...r, labels: fromJson(r.labels, []), interests: fromJson(r.interests, []) } : null);
const CUST_FIELDS = ['display_name', 'phone', 'labels', 'interests', 'turns', 'note'];

export function customersTable(db) {
  const get = db.prepare('SELECT * FROM customers WHERE chat_id = ?');
  const upsert = db.prepare(`INSERT INTO customers (chat_id, display_name, phone, labels, interests, first_seen_at, last_seen_at, turns, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (chat_id) DO UPDATE SET display_name = excluded.display_name, phone = excluded.phone, labels = excluded.labels,
      interests = excluded.interests, last_seen_at = excluded.last_seen_at, turns = excluded.turns, note = excluded.note`);
  const del = db.prepare('DELETE FROM customers WHERE chat_id = ?');
  return {
    get: (chatId) => custOut(get.get(chatId)),
    upsert(chatId, patch, at) {
      for (const k of Object.keys(patch)) if (!CUST_FIELDS.includes(k)) throw new Error(`unknown column customers.${k}`);
      const cur = custOut(get.get(chatId)) ?? { labels: [], interests: [], turns: 0 };
      const m = { ...cur, ...patch };
      upsert.run(chatId, m.display_name ?? null, m.phone ?? null, toJson(m.labels), toJson(m.interests), cur.first_seen_at ?? at, at, m.turns ?? 0, m.note ?? null);
    },
    deleteChat: (chatId) => { del.run(chatId); },
  };
}
