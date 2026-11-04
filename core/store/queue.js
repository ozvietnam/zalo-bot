// inbox, outbox, jobs: các hàng đợi bền.
import { fromJson, isUniqueViolation, patchRow, toJson } from './util.js';

export function inboxTable(db) {
  const ins = db.prepare('INSERT INTO inbox (update_key, chat_id, user_id, raw, status, received_at) VALUES (?, ?, ?, ?, ?, ?)');
  const pending = db.prepare("SELECT * FROM inbox WHERE status = 'pending' ORDER BY received_at, rowid");
  const byKey = db.prepare('SELECT * FROM inbox WHERE update_key = ?');
  const done = db.prepare("UPDATE inbox SET status = 'done', done_at = ? WHERE update_key = ?");
  const failed = db.prepare("UPDATE inbox SET status = 'failed', done_at = ?, error = ? WHERE update_key = ?");
  return {
    insertIgnore(r) {
      try {
        ins.run(r.update_key, r.chat_id, r.user_id ?? null, r.raw, r.status ?? 'pending', r.received_at);
        return true;
      } catch (e) {
        if (isUniqueViolation(e)) return false;
        throw e;
      }
    },
    get: (key) => byKey.get(key) ?? null,
    pending: () => pending.all(),
    markDone: (key, at) => { done.run(at, key); },
    markFailed: (key, err, at) => { failed.run(at, String(err ?? ''), key); },
  };
}

const OUTBOX_COLS = ['turn_id', 'kind', 'text', 'decision', 'reason', 'status', 'not_before', 'parts_sent', 'attempts', 'next_retry_at', 'created_at', 'sent_at', 'ctx'];

const outOut = (r) => (r ? { ...r, ctx: fromJson(r.ctx) } : null);

export function outboxTable(db) {
  const ins = db.prepare(`INSERT INTO outbox (idem_key, chat_id, turn_id, kind, text, decision, reason, status, not_before, parts_sent, attempts, next_retry_at, created_at, sent_at, ctx)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const has = db.prepare('SELECT 1 FROM outbox WHERE idem_key = ?');
  const recent = db.prepare(`SELECT text FROM outbox WHERE chat_id = ? AND status = 'sent' AND kind IN ('reply','notice','job_result')
    AND sent_at >= ? ORDER BY sent_at DESC, id DESC LIMIT ?`);
  const cntChat = db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE status = 'sent' AND chat_id = ? AND sent_at >= ?");
  const cntAll = db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE status = 'sent' AND sent_at >= ?");
  const queued = db.prepare("SELECT * FROM outbox WHERE status = 'queued' ORDER BY id");
  const byId = db.prepare('SELECT * FROM outbox WHERE id = ?');
  const due = db.prepare(`SELECT * FROM outbox WHERE (status = 'deferred' AND not_before <= ?1)
    OR (status = 'failed' AND attempts <= 3 AND (next_retry_at IS NULL OR next_retry_at <= ?1)) ORDER BY id`);
  return {
    insert(m) {
      try {
        return Number(ins.run(m.idem_key, m.chat_id, m.turn_id ?? null, m.kind, m.text, m.decision, m.reason ?? null, m.status,
          m.not_before ?? null, m.parts_sent ?? 0, m.attempts ?? 0, m.next_retry_at ?? null, m.created_at ?? null, m.sent_at ?? null, m.ctx === undefined || m.ctx === null ? null : toJson(m.ctx)).lastInsertRowid);
      } catch (e) {
        if (isUniqueViolation(e)) throw new Error(`DUPLICATE_IDEM: ${m.idem_key}`, { cause: e });
        throw e;
      }
    },
    update: (id, patch) => patchRow(db, 'outbox', 'id', id, patch, OUTBOX_COLS, ['ctx']),
    queued: () => queued.all().map(outOut),
    get: (id) => outOut(byId.get(id)),
    hasIdem: (key) => has.get(key) !== undefined,
    recentBotTexts: (chatId, sinceIso, limit) => recent.all(chatId, sinceIso, limit).map((r) => r.text),
    countSent: (chatId, sinceIso) => (chatId === null || chatId === undefined ? cntAll.get(sinceIso) : cntChat.get(chatId, sinceIso)).n,
    due: (nowIso) => due.all(nowIso).map(outOut),
  };
}

const JOB_COLS = ['status', 'attempts', 'next_poll_at', 'expires_at', 'done_at', 'context'];
const jobOut = (r) => (r ? { ...r, context: fromJson(r.context) } : r);

export function jobsTable(db) {
  const ins = db.prepare(`INSERT INTO jobs (chat_id, session_key, pack, ma_luot, result_tool, context, status, attempts, next_poll_at, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const open = db.prepare("SELECT 1 FROM jobs WHERE chat_id = ? AND (status = 'waiting' OR (status = 'done' AND done_at >= ?)) LIMIT 1");
  const due = db.prepare("SELECT * FROM jobs WHERE status = 'waiting' AND next_poll_at <= ? ORDER BY next_poll_at, id");
  return {
    add(j) {
      try {
        return Number(ins.run(j.chat_id, j.session_key, j.pack, j.ma_luot, j.result_tool, j.context === undefined ? null : toJson(j.context),
          j.status ?? 'waiting', j.attempts ?? 0, j.next_poll_at, j.expires_at, j.created_at ?? null).lastInsertRowid);
      } catch (e) {
        if (isUniqueViolation(e)) return null;
        throw e;
      }
    },
    due: (nowIso) => due.all(nowIso).map(jobOut),
    /** Phòng còn việc nền nợ: đang 'waiting', hoặc 'done' từ sinceIso trở lại. */
    openFor: (chatId, sinceIso) => open.get(chatId, sinceIso) !== undefined,
    update: (id, patch) => patchRow(db, 'jobs', 'id', id, patch, JOB_COLS, ['context']),
  };
}
