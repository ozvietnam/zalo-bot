// Lược đồ v1, đúng specs/001-nen-tang-chung/data-model.md.
// Ghi chú: outbox có thêm `attempts`, `next_retry_at` (thử lại tin 'failed') và `ctx` (JSON, bối cảnh để chạy lại decide).
// T037 (US8): sửa v1 tại chỗ trước lần triển khai đầu (chưa có db thật): bảng `convs`, cột `conv_id` ở các bảng
// theo người, `customers` khoá theo `conv_id`. `chat_id` vẫn giữ vì tin gửi tới chat_id.
import { DatabaseSync } from 'node:sqlite';

export const SCHEMA_VERSION = '1';

const DDL = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS inbox (
  update_key TEXT PRIMARY KEY, chat_id TEXT NOT NULL, user_id TEXT, raw TEXT NOT NULL,
  status TEXT NOT NULL, received_at TEXT NOT NULL, claimed_at TEXT, done_at TEXT, error TEXT);
CREATE TABLE IF NOT EXISTS chats (
  chat_id TEXT PRIMARY KEY, kind TEXT, title TEXT, state TEXT NOT NULL DEFAULT 'bot',
  state_by TEXT, state_at TEXT, state_reason TEXT, last_inbound_at TEXT, last_outbound_at TEXT);
CREATE TABLE IF NOT EXISTS convs (
  conv_id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, user_id TEXT, display_name TEXT, state TEXT NOT NULL DEFAULT 'bot',
  state_by TEXT, state_at TEXT, state_reason TEXT, last_inbound_at TEXT, last_outbound_at TEXT);
CREATE TABLE IF NOT EXISTS sessions (
  key TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY, idem_key TEXT UNIQUE NOT NULL, conv_id TEXT NOT NULL, chat_id TEXT NOT NULL, turn_id TEXT,
  kind TEXT NOT NULL, text TEXT NOT NULL, decision TEXT NOT NULL, reason TEXT,
  status TEXT NOT NULL, not_before TEXT, parts_sent INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0, next_retry_at TEXT, created_at TEXT, sent_at TEXT, ctx TEXT);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY, conv_id TEXT NOT NULL, chat_id TEXT NOT NULL, session_key TEXT NOT NULL, pack TEXT NOT NULL,
  ma_luot TEXT NOT NULL, result_tool TEXT NOT NULL, context TEXT, status TEXT NOT NULL,
  attempts INTEGER DEFAULT 0, next_poll_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  created_at TEXT, done_at TEXT, UNIQUE (pack, ma_luot));
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY, conv_id TEXT NOT NULL, chat_id TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL,
  claimed_by TEXT, opened_at TEXT, claimed_at TEXT, closed_at TEXT, last_forward_at TEXT);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY, at TEXT NOT NULL, turn_id TEXT, conv_id TEXT, chat_id TEXT, type TEXT NOT NULL,
  data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, conv_id TEXT NOT NULL, chat_id TEXT NOT NULL, turn_id TEXT, speaker TEXT NOT NULL,
  speaker_id TEXT, text TEXT, outbox_id INTEGER, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS customers (
  conv_id TEXT PRIMARY KEY, chat_id TEXT, display_name TEXT, phone TEXT, labels TEXT NOT NULL DEFAULT '[]',
  interests TEXT NOT NULL DEFAULT '[]', first_seen_at TEXT, last_seen_at TEXT,
  turns INTEGER DEFAULT 0, note TEXT);
CREATE INDEX IF NOT EXISTS ix_inbox_status ON inbox (status, received_at);
CREATE INDEX IF NOT EXISTS ix_convs_chat ON convs (chat_id);
CREATE INDEX IF NOT EXISTS ix_outbox_chat ON outbox (chat_id, created_at);
CREATE INDEX IF NOT EXISTS ix_outbox_conv ON outbox (conv_id, sent_at);
CREATE INDEX IF NOT EXISTS ix_outbox_status ON outbox (status, not_before);
CREATE INDEX IF NOT EXISTS ix_jobs_status ON jobs (status, next_poll_at);
CREATE INDEX IF NOT EXISTS ix_jobs_conv ON jobs (conv_id, status);
CREATE INDEX IF NOT EXISTS ix_tickets_status ON tickets (status);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tickets_open ON tickets (conv_id) WHERE status IN ('open','claimed');
CREATE INDEX IF NOT EXISTS ix_audit_turn ON audit (turn_id);
CREATE INDEX IF NOT EXISTS ix_audit_chat ON audit (chat_id, at);
CREATE INDEX IF NOT EXISTS ix_audit_conv ON audit (conv_id, at);
CREATE INDEX IF NOT EXISTS ix_messages_chat ON messages (chat_id, at);
CREATE INDEX IF NOT EXISTS ix_messages_conv ON messages (conv_id, at);
CREATE INDEX IF NOT EXISTS ix_customers_phone ON customers (phone);
`;

const OUTDATED = 'schema v1 đổi trước lần triển khai đầu — xoá db cũ (data/bot.db) rồi chạy lại';

const cols = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => `${c.name}${c.pk ? '*' : ''}`);

let expected = null;
/** Cột (và khoá chính, đánh dấu *) của từng bảng theo DDL hiện tại, dựng một lần trên db :memory:. */
function expectedLayout() {
  if (expected) return expected;
  const mem = new DatabaseSync(':memory:');
  try {
    mem.exec(DDL);
    const tables = mem.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
    expected = new Map(tables.map((t) => [t, cols(mem, t)]));
  } finally {
    mem.close();
  }
  return expected;
}

/** Bảng đã có mà khác lược đồ hiện tại (db tạo bởi bản v1 cũ hơn) → ném lỗi rõ ràng thay vì CREATE INDEX hỏng giữa chừng. */
function assertLayout(db) {
  for (const [table, want] of expectedLayout()) {
    const have = cols(db, table);
    if (!have.length) continue; // bảng chưa có: DDL sẽ tạo
    const diff = want.filter((c) => !have.includes(c));
    if (diff.length) throw new Error(`${OUTDATED} (bảng ${table} thiếu cột ${diff.join(', ')})`);
  }
}

export function migrate(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    assertLayout(db);
    db.exec(DDL);
    db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', ?)").run(SCHEMA_VERSION);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
