// Lớp lưu trữ SQLite (node:sqlite, không phụ thuộc ngoài). Lược đồ: specs/001-nen-tang-chung/data-model.md.
// Chỉ prepare + tham số; mã che bí mật nằm ở người gọi (store không redact).
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './store/schema.js';
import { inboxTable, outboxTable, jobsTable } from './store/queue.js';
import { chatsTable, convsTable, sessionsTable, ticketsTable, metaTable } from './store/state.js';
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
    convs: convsTable(db),
    sessions: sessionsTable(db),
    outbox: outboxTable(db),
    jobs: jobsTable(db),
    tickets: ticketsTable(db),
    audit: auditTable(db),
    messages: messagesTable(db),
    customers: customersTable(db),
    meta: metaTable(db),
    tx,
    /**
     * db còn mở không (dùng cho /health: db hỏng thì ok=false, không ném lỗi ra ngoài).
     * CHỈ kiểm tra kết nối ĐỌC được — KHÔNG phát hiện được db bị khoá ghi bởi tiến trình khác
     * (vẫn đọc được trong WAL). Cố thử ghi trên đường /health sẽ vượt mốc 5 s của HEALTHCHECK.
     */
    ping: () => { try { db.prepare('SELECT 1 AS x').get(); return true; } catch { return false; } },
    /**
     * Sao nguyên db sang một tệp khác (`core/backup.js`, FR-028). Đường dẫn đi bằng THAM SỐ BUỘC, không
     * nối vào chuỗi SQL: `VACUUM INTO '<path>'` với dấu nháy trong tên tệp là một câu SQL khác hẳn.
     * Đây là đường DUY NHẤT ra ngoài cho `db` thô — `core/backup.js` không cần thấy handle db.
     * Ném nếu tệp đích đã có (SQLite không ghi đè) hoặc db hỏng; người gọi tự xử.
     */
    vacuumInto: (path) => { db.prepare('VACUUM INTO ?').run(String(path)); },
    close: () => db.close(),
  };
}
