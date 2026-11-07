// audit, messages, customers.
import { fromJson, toJson } from './util.js';

const auditOut = (r) => ({ ...r, data: fromJson(r.data) });

export function auditTable(db) {
  const ins = db.prepare('INSERT INTO audit (at, turn_id, conv_id, chat_id, type, data) VALUES (?, ?, ?, ?, ?, ?)');
  const byTurn = db.prepare('SELECT * FROM audit WHERE turn_id = ? ORDER BY id');
  const byChat = db.prepare('SELECT * FROM audit WHERE chat_id = ? ORDER BY at DESC, id DESC LIMIT ?');
  const prune = db.prepare('DELETE FROM audit WHERE at < ?');
  const cntInvalidGate = db.prepare("SELECT COUNT(*) AS n FROM audit WHERE type = 'gate' AND at >= ? AND json_valid(data) = 0");
  return {
    add: (r) => { ins.run(r.at, r.turn_id ?? null, r.conv_id ?? null, r.chat_id ?? null, r.type, toJson(r.data)); },
    byTurn: (turnId) => byTurn.all(turnId).map(auditOut),
    byChat: (chatId, limit = 50) => byChat.all(chatId, limit).map(auditOut),
    prune: (beforeIso) => { prune.run(beforeIso); },
    /**
     * Đếm các lý do chặn sớm theo từng lý do.
     * Dòng audit có JSON HỎNG phải bị BỎ QUA, không được làm hỏng cả endpoint: `json_extract`
     * trên JSON hỏng ném lỗi "malformed JSON". Vì vậy chỉ gọi json_extract trên dữ liệu đã qua
     * `json_valid` (SQLite short-circuit trong CASE + điều kiện lọc ở WHERE).
     */
    countGateReasons: (sinceIso, reasons) => {
      if (!reasons?.length) return [];
      const q = `SELECT CASE WHEN json_valid(data) THEN json_extract(data, '$.reason') END AS reason, COUNT(*) AS n FROM audit
        WHERE type = 'gate' AND at >= ? AND json_valid(data)
          AND CASE WHEN json_valid(data) THEN json_extract(data, '$.reason') END IN (${reasons.map(() => '?').join(',')})
        GROUP BY 1`;
      return db.prepare(q).all(sinceIso, ...reasons);
    },
    /** Số dòng audit loại 'gate' có JSON hỏng kể từ `sinceIso` — để vận hành biết mà không phải mở db. */
    countInvalidGate: (sinceIso) => cntInvalidGate.get(sinceIso).n,
  };
}

export function messagesTable(db) {
  const ins = db.prepare('INSERT INTO messages (conv_id, chat_id, turn_id, speaker, speaker_id, text, outbox_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const recent = db.prepare('SELECT * FROM (SELECT * FROM messages WHERE conv_id = ? ORDER BY at DESC, id DESC LIMIT ?) ORDER BY at, id');
  const del = db.prepare('DELETE FROM messages WHERE chat_id = ?');
  return {
    add: (m) => Number(ins.run(m.conv_id ?? m.chat_id, m.chat_id, m.turn_id ?? null, m.speaker, m.speaker_id ?? null, m.text ?? null, m.outbox_id ?? null, m.at).lastInsertRowid),
    recent: (convId, n) => recent.all(convId, n),
    deleteChat: (chatId) => Number(del.run(chatId).changes),
  };
}

const custOut = (r) => (r ? { ...r, labels: fromJson(r.labels, []), interests: fromJson(r.interests, []) } : null);
const CUST_FIELDS = ['chat_id', 'display_name', 'phone', 'labels', 'interests', 'turns', 'note'];

export function customersTable(db) {
  const get = db.prepare('SELECT * FROM customers WHERE conv_id = ?');
  const upsert = db.prepare(`INSERT INTO customers (conv_id, chat_id, display_name, phone, labels, interests, first_seen_at, last_seen_at, turns, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (conv_id) DO UPDATE SET chat_id = excluded.chat_id, display_name = excluded.display_name, phone = excluded.phone,
      labels = excluded.labels, interests = excluded.interests, last_seen_at = excluded.last_seen_at, turns = excluded.turns, note = excluded.note`);
  const del = db.prepare('DELETE FROM customers WHERE conv_id = ?');
  return {
    get: (convId) => custOut(get.get(convId)),
    upsert(convId, patch, at) {
      for (const k of Object.keys(patch)) if (!CUST_FIELDS.includes(k)) throw new Error(`unknown column customers.${k}`);
      const cur = custOut(get.get(convId)) ?? { labels: [], interests: [], turns: 0 };
      const m = { ...cur, ...patch };
      upsert.run(convId, m.chat_id ?? null, m.display_name ?? null, m.phone ?? null, toJson(m.labels), toJson(m.interests), cur.first_seen_at ?? at, at, m.turns ?? 0, m.note ?? null);
    },
    deleteChat: (convId) => { del.run(convId); },
  };
}
