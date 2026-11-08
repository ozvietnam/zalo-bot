// inbox, outbox, jobs: các hàng đợi bền.
import { fromJson, isUniqueViolation, patchRow, toJson } from './util.js';

export function inboxTable(db) {
  const ins = db.prepare('INSERT INTO inbox (update_key, chat_id, user_id, raw, status, received_at) VALUES (?, ?, ?, ?, ?, ?)');
  const pending = db.prepare("SELECT * FROM inbox WHERE status = 'pending' ORDER BY received_at, rowid");
  const byKey = db.prepare('SELECT * FROM inbox WHERE update_key = ?');
  const done = db.prepare("UPDATE inbox SET status = 'done', done_at = ? WHERE update_key = ?");
  const failed = db.prepare("UPDATE inbox SET status = 'failed', done_at = ?, error = ? WHERE update_key = ?");
  const claim = db.prepare("UPDATE inbox SET status = 'processing', claimed_at = ? WHERE update_key = ? AND status = 'pending'");
  const cntPending = db.prepare("SELECT COUNT(*) AS n FROM inbox WHERE status IN ('pending','processing')");
  const cntSince = db.prepare('SELECT COUNT(*) AS n FROM inbox WHERE received_at >= ?');
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
    /** Số tin đang chờ xử lý (pending) hoặc đang chạy (processing) — số liệu cho /health. */
    countPending: () => cntPending.get().n,
    /** Số lượt ĐÃ NHẬN kể từ `sinceIso` (mỗi lượt vào lõi một dòng inbox) — số liệu cho /metrics. */
    countSince: (sinceIso) => cntSince.get(sinceIso).n,
    /** pending → processing nguyên tử; chỉ người gọi nhận true mới được chạy gói. (T020: processing quá 5 phút coi như pending.) */
    claim: (key, at) => Number(claim.run(at, key).changes) === 1,
    markDone: (key, at) => { done.run(at, key); },
    markFailed: (key, err, at) => { failed.run(at, String(err ?? ''), key); },
  };
}

const OUTBOX_COLS = ['turn_id', 'kind', 'text', 'decision', 'reason', 'status', 'not_before', 'parts_sent', 'attempts', 'next_retry_at', 'created_at', 'sent_at', 'ctx'];

const outOut = (r) => (r ? { ...r, ctx: fromJson(r.ctx) } : null);

export function outboxTable(db) {
  const ins = db.prepare(`INSERT INTO outbox (idem_key, conv_id, chat_id, turn_id, kind, text, decision, reason, status, not_before, parts_sent, attempts, next_retry_at, created_at, sent_at, ctx)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const has = db.prepare('SELECT 1 FROM outbox WHERE idem_key = ?');
  // Dòng MỚI NHẤT mà cửa đã nhận gửi, tìm theo TIỀN TỐ khoá idem. Khoá idem là thứ bền duy nhất còn
  // lại sau khi một tiến trình chết giữa lúc gửi, nên người gọi đặt khoá theo quy ước
  // "việc:khoảng-đã-làm" thì đọc lại được "lần trước đã làm tới đâu" (T024 dùng cho mốc gộp tin).
  // Chỉ lấy `decision = 'send'`: dòng đó cửa đã nhận trách nhiệm giao (`gate.sweep` thử lại từ
  // `parts_sent`), còn dòng bị cửa bỏ thì KHÔNG bao giờ đi ra nên không được tính là đã làm.
  const lastSend = db.prepare(`SELECT * FROM outbox WHERE idem_key LIKE ? ESCAPE '\\' AND decision = 'send'
    ORDER BY id DESC LIMIT 1`);
  const recent = db.prepare(`SELECT text, sent_at FROM outbox WHERE conv_id = ? AND status = 'sent' AND kind IN ('reply','notice','job_result')
    AND sent_at >= ? ORDER BY sent_at DESC, id DESC LIMIT ?`);
  // Trần tin/ngày là ngân sách tin TỚI KHÁCH, nên không đếm tin NỘI BỘ: `ticket` đi vào nhóm nhân
  // viên và `digest` là bản tin cho người vận hành — khách không nhận. Hai loại đó tự được miễn trần
  // (`CAPPED` ở `core/gate-decide.js:106`) nên không tự chặn mình, nhưng nếu đếm thì mỗi phiếu và mỗi
  // tin gộp lại ăn một suất của khách: `CAP_ALL_DAY=300` hụt dần theo số phiếu trong ngày.
  // `staff_relay` VẪN đếm: lời nhân viên được chuyển tới chính khách, có tiêu tốn ngân sách đó.
  const CAP_KINDS = "kind NOT IN ('ticket','digest')";
  const cntConv = db.prepare(`SELECT COUNT(*) AS n FROM outbox WHERE status = 'sent' AND ${CAP_KINDS} AND conv_id = ? AND sent_at >= ?`);
  const cntChat = db.prepare(`SELECT COUNT(*) AS n FROM outbox WHERE status = 'sent' AND ${CAP_KINDS} AND chat_id = ? AND sent_at >= ?`);
  const cntAll = db.prepare(`SELECT COUNT(*) AS n FROM outbox WHERE status = 'sent' AND ${CAP_KINDS} AND sent_at >= ?`);
  const queued = db.prepare("SELECT * FROM outbox WHERE status = 'queued' ORDER BY id");
  const byId = db.prepare('SELECT * FROM outbox WHERE id = ?');
  const due = db.prepare(`SELECT * FROM outbox WHERE (status = 'deferred' AND not_before <= ?1)
    OR (status = 'failed' AND attempts <= 3 AND (next_retry_at IS NULL OR next_retry_at <= ?1)) ORDER BY id`);
  const cntDecision = db.prepare('SELECT decision, reason, COUNT(*) AS n FROM outbox WHERE created_at >= ? GROUP BY decision, reason');
  const lastChat = db.prepare('SELECT * FROM outbox WHERE chat_id = ? ORDER BY created_at DESC, id DESC LIMIT 1');
  return {
    insert(m) {
      try {
        return Number(ins.run(m.idem_key, m.conv_id ?? m.chat_id, m.chat_id, m.turn_id ?? null, m.kind, m.text, m.decision, m.reason ?? null, m.status,
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
    /**
     * Dòng MỚI NHẤT mà cửa đã nhận gửi (`decision = 'send'`) có khoá idem bắt đầu bằng `prefix`,
     * hoặc null. Dùng khi người gọi đặt khoá theo quy ước "việc:khoảng-đã-làm": sau khi tiến trình
     * chết giữa lúc gửi, dòng outbox là bản ghi bền duy nhất trả lời được "lần trước đã chở tới đâu".
     */
    lastSentByIdemPrefix: (prefix) => outOut(lastSend.get(`${String(prefix).replace(/[\\%_]/g, '\\$&')}%`) ?? null),
    /** Tin bot gần đây kèm mốc gửi, để cửa tự lọc cửa sổ chống trùng theo loại tin (gate-decide bước 6). */
    recentBotMsgs: (convId, sinceIso, limit) => recent.all(convId, sinceIso, limit).map((r) => ({ text: r.text, at: r.sent_at })),
    countSent: (convId, sinceIso) => (convId === null || convId === undefined ? cntAll.get(sinceIso) : cntConv.get(convId, sinceIso)).n,
    /** Đếm tin đã gửi theo phòng (cả nhóm, không tách theo người) — dùng cho trần ngày của nhóm. */
    countSentChat: (chatId, sinceIso) => cntChat.get(chatId, sinceIso).n,
    due: (nowIso) => due.all(nowIso).map(outOut),
    /** Đếm theo quyết định của cửa từ lúc `sinceIso` — số liệu cho /metrics. */
    countsByDecision: (sinceIso) => cntDecision.all(sinceIso),
    /** Dòng outbox mới nhất của một phòng (để biết bot còn gửi được vào phòng đó không). */
    lastForChat: (chatId) => outOut(lastChat.get(chatId)),
  };
}

const JOB_COLS = ['status', 'attempts', 'next_poll_at', 'expires_at', 'done_at', 'context'];
const jobOut = (r) => (r ? { ...r, context: fromJson(r.context) } : r);

export function jobsTable(db) {
  const ins = db.prepare(`INSERT INTO jobs (conv_id, chat_id, session_key, pack, ma_luot, result_tool, context, status, attempts, next_poll_at, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const open = db.prepare("SELECT 1 FROM jobs WHERE conv_id = ? AND (status IN ('waiting','polling') OR (status = 'done' AND done_at >= ?)) LIMIT 1");
  const claimJob = db.prepare("UPDATE jobs SET status = 'polling' WHERE id = ? AND status = 'waiting'");
  const due = db.prepare("SELECT * FROM jobs WHERE status = 'waiting' AND next_poll_at <= ? ORDER BY next_poll_at, id");
  const next = db.prepare("SELECT MIN(next_poll_at) AS t FROM jobs WHERE status = 'waiting'");
  const polling = db.prepare("SELECT * FROM jobs WHERE status = 'polling' ORDER BY id");
  const cntWaiting = db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'waiting'");
  return {
    add(j) {
      try {
        return Number(ins.run(j.conv_id ?? j.chat_id, j.chat_id, j.session_key, j.pack, j.ma_luot, j.result_tool, j.context === undefined ? null : toJson(j.context),
          j.status ?? 'waiting', j.attempts ?? 0, j.next_poll_at, j.expires_at, j.created_at ?? null).lastInsertRowid);
      } catch (e) {
        if (isUniqueViolation(e)) return null;
        throw e;
      }
    },
    due: (nowIso) => due.all(nowIso).map(jobOut),
    /** waiting → polling nguyên tử trước khi hỏi Cổng; xong thì về waiting/done/expired/failed. */
    claim: (id) => Number(claimJob.run(id).changes) === 1,
    /** Mốc hỏi sớm nhất của việc đang 'waiting', hoặc null. */
    nextDue: () => next.get()?.t ?? null,
    /** Dòng còn 'polling': lúc khởi động đều là của tiến trình đã chết giữa lượt hỏi (T021 jobs.recover). */
    polling: () => polling.all().map(jobOut),
    /** Phòng còn việc nền nợ: đang 'waiting'/'polling', hoặc 'done' từ sinceIso trở lại. */
    openFor: (convId, sinceIso) => open.get(convId, sinceIso) !== undefined,
    /** Số việc nền đang chờ — số liệu cho /metrics. */
    countWaiting: () => cntWaiting.get().n,
    update: (id, patch) => patchRow(db, 'jobs', 'id', id, patch, JOB_COLS, ['context']),
  };
}
