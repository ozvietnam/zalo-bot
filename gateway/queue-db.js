// Hàng đợi SQLite bền vững trên VPS cho Cổng AI Studio (Spec 008, FR-001, FR-003, US1)
// Cung cấp cơ chế thuê việc nguyên tử (atomic lease), nhịp tim và tự thu hồi lượt thuê quá hạn 120s.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

/**
 * Khởi tạo tầng lưu trữ hàng đợi SQLite cho Gateway AI Studio.
 * @param {string | DatabaseSync} [dbPathOrInstance=':memory:']
 */
export function createQueueDb(dbPathOrInstance = ':memory:') {
  const isInstance = typeof dbPathOrInstance === 'object' && dbPathOrInstance !== null;
  const db = isInstance ? dbPathOrInstance : new DatabaseSync(dbPathOrInstance || ':memory:');

  /**
   * Khởi tạo cấu trúc bảng gateway_jobs và gateway_cache cùng các index.
   */
  function init() {
    if (typeof dbPathOrInstance === 'string' && dbPathOrInstance !== ':memory:') {
      db.exec('PRAGMA journal_mode = WAL');
    }
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('PRAGMA foreign_keys = ON');

    db.exec(`
      CREATE TABLE IF NOT EXISTS gateway_jobs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL DEFAULT 'khach',
        priority INTEGER NOT NULL DEFAULT 0,
        prompt TEXT NOT NULL,
        system_instruction TEXT,
        schema_json TEXT,
        timeout_ms INTEGER NOT NULL DEFAULT 45000,
        status TEXT NOT NULL DEFAULT 'queued',
        assigned_tab TEXT,
        lease_expires_at TEXT,
        result_text TEXT,
        error_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_gateway_jobs_queue
        ON gateway_jobs(status, priority, created_at);

      CREATE INDEX IF NOT EXISTS idx_gateway_jobs_reclaim
        ON gateway_jobs(status, lease_expires_at);

      CREATE TABLE IF NOT EXISTS gateway_cache (
        prompt_hash TEXT PRIMARY KEY,
        result_text TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_gateway_cache_expires
        ON gateway_cache(expires_at);
    `);
  }

  /**
   * Thêm một việc vào hàng đợi.
   */
  function createJob({
    id = randomUUID(),
    kind = 'khach',
    priority,
    prompt,
    systemInstruction = null,
    schemaJson = null,
    timeoutMs = 45000,
  } = {}) {
    const prio = priority !== undefined && priority !== null
      ? Number(priority)
      : (kind === 'nhan-vien' ? 1 : (kind === 'lo' ? 9 : 0));
    const tMs = Number(timeoutMs) || 45000;
    const p = prompt ?? '';

    const stmt = db.prepare(`
      INSERT INTO gateway_jobs (id, kind, priority, prompt, system_instruction, schema_json, timeout_ms, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'queued')
      RETURNING *
    `);
    return stmt.get(id, kind, prio, p, systemInstruction, schemaJson, tMs);
  }

  /**
   * Lấy thông tin một công việc theo mã id.
   */
  function getJob(id) {
    if (!id) return null;
    const stmt = db.prepare('SELECT * FROM gateway_jobs WHERE id = ?');
    return stmt.get(id) || null;
  }

  /**
   * Thuê việc nguyên tử bằng SQL transaction BEGIN IMMEDIATE với RETURNING.
   * Ưu tiên việc theo priority ASC (0: khach trước 9: lo), created_at ASC.
   * Thời hạn thuê mặc định 120s (FR-003).
   */
  function leaseJob(tabId) {
    if (!tabId) throw new Error('tabId là bắt buộc khi thuê việc');

    db.exec('BEGIN IMMEDIATE');
    try {
      const stmt = db.prepare(`
        UPDATE gateway_jobs
        SET status = 'leased',
            assigned_tab = ?,
            lease_expires_at = datetime('now', '+120 seconds'),
            updated_at = datetime('now')
        WHERE id = (
          SELECT id FROM gateway_jobs
          WHERE status = 'queued'
          ORDER BY priority ASC, created_at ASC
          LIMIT 1
        )
        RETURNING *
      `);
      const leased = stmt.get(tabId);
      db.exec('COMMIT');
      return leased || null;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  /**
   * Gia hạn thời hạn thuê cho tab đang giữ việc (nhịp tim).
   */
  function heartbeatJob(id, tabId, extendSeconds = 120) {
    if (!id || !tabId) return false;
    const sec = Number(extendSeconds) || 120;
    const stmt = db.prepare(`
      UPDATE gateway_jobs
      SET lease_expires_at = datetime('now', '+' || ? || ' seconds'),
          updated_at = datetime('now')
      WHERE id = ? AND status = 'leased' AND assigned_tab = ?
    `);
    const info = stmt.run(sec, id, tabId);
    return info.changes > 0;
  }

  /**
   * Đánh dấu công việc đã hoàn thành và lưu kết quả.
   */
  function completeJob(id, tabId, resultText = '') {
    if (!id || !tabId) return false;
    const stmt = db.prepare(`
      UPDATE gateway_jobs
      SET status = 'completed',
          result_text = ?,
          updated_at = datetime('now')
      WHERE id = ? AND status = 'leased' AND assigned_tab = ?
    `);
    const info = stmt.run(resultText, id, tabId);
    return info.changes > 0;
  }

  /**
   * Đánh dấu công việc thất bại và lưu lý do lỗi.
   */
  function failJob(id, tabId, errorReason = '') {
    if (!id || !tabId) return false;
    const stmt = db.prepare(`
      UPDATE gateway_jobs
      SET status = 'failed',
          error_reason = ?,
          updated_at = datetime('now')
      WHERE id = ? AND status = 'leased' AND assigned_tab = ?
    `);
    const info = stmt.run(errorReason, id, tabId);
    return info.changes > 0;
  }

  /**
   * Thu hồi các lượt thuê quá hạn 120s về lại trạng thái 'queued'.
   */
  function reclaimExpiredLeases() {
    const stmt = db.prepare(`
      UPDATE gateway_jobs
      SET status = 'queued',
          assigned_tab = NULL,
          lease_expires_at = NULL,
          updated_at = datetime('now')
      WHERE status = 'leased' AND lease_expires_at < datetime('now')
    `);
    const info = stmt.run();
    return info.changes;
  }

  /**
   * Đóng kết nối cơ sở dữ liệu.
   */
  function close() {
    try {
      db.close();
    } catch {
      // Bỏ qua nếu db đã đóng
    }
  }

  return {
    db,
    init,
    createJob,
    getJob,
    leaseJob,
    heartbeatJob,
    completeJob,
    failJob,
    reclaimExpiredLeases,
    close,
  };
}
