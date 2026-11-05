// Lớp lưu trữ SQLite (node:sqlite, không phụ thuộc ngoài). Lược đồ: specs/001-nen-tang-chung/data-model.md.
// Chỉ prepare + tham số; mã che bí mật nằm ở người gọi (store không redact).
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './store/schema.js';
import { inboxTable, outboxTable, jobsTable } from './store/queue.js';
import { chatsTable, sessionsTable, ticketsTable, metaTable } from './store/state.js';
import { auditTable, messagesTable, customersTable } from './store/records.js';

export function openStore(path = ':memory:') {
  const db = new DatabaseSync(path);
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);

  let depth = 0;
  const tx = (fn) => {
    if (depth > 0) return fn(); // lồng nhau: dùng giao dịch ngoài cùng
    db.exec('BEGIN IMMEDIATE');
    depth++;
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    } finally {
      depth--;
    }
  };

  return {
    inbox: inboxTable(db),
    chats: chatsTable(db),
    sessions: sessionsTable(db),
    outbox: outboxTable(db),
    jobs: jobsTable(db),
    tickets: ticketsTable(db),
    audit: auditTable(db),
    messages: messagesTable(db),
    customers: customersTable(db),
    meta: metaTable(db),
    tx,
    close: () => db.close(),
  };
}
