// Sổ nhật ký thực thi cho Agent giám sát — spec 007 FR-011
// Lưu lịch sử các phiên giám sát vào SQLite riêng (giam-sat.db), tuyệt đối không ghi vào bot.db.
// Tệp dưới 300 dòng theo Hiến pháp Điều VI.

import { join } from 'path';
import { DatabaseSync } from 'node:sqlite';

const DDL_NHAT_KY = `
CREATE TABLE IF NOT EXISTS nhat_ky_giam_sat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ngay TEXT NOT NULL,
  nguon TEXT NOT NULL,
  so_tin INTEGER NOT NULL DEFAULT 0,
  so_phat_hien INTEGER NOT NULL DEFAULT 0,
  issue_moi INTEGER NOT NULL DEFAULT 0,
  issue_comment INTEGER NOT NULL DEFAULT 0,
  chi_tiet_issue TEXT,
  loi TEXT,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nhat_ky_ngay ON nhat_ky_giam_sat(ngay);
CREATE INDEX IF NOT EXISTS idx_nhat_ky_at ON nhat_ky_giam_sat(at);
`;

/**
 * Khởi tạo bảng cho sổ nhật ký nếu chưa có.
 * @param {DatabaseSync} db
 */
export function khoiTaoSo(db) {
  db.exec(DDL_NHAT_KY);
}

/**
 * Mở kết nối db cho sổ nhật ký từ opts.
 * @param {object} opts
 * @returns {{ db: DatabaseSync, tuDongDong: boolean }}
 */
function moDbSo(opts = {}) {
  if (opts.db) {
    khoiTaoSo(opts.db);
    return { db: opts.db, tuDongDong: false };
  }
  const DATA_DIR = process.env.DATA_DIR || './data';
  const dbPath = opts.dbPath || process.env.GIAM_SAT_DB_PATH || join(DATA_DIR, 'giam-sat.db');
  const db = new DatabaseSync(dbPath);
  khoiTaoSo(db);
  return { db, tuDongDong: true };
}

/**
 * Ghi nhận một phiên thực thi của Agent giám sát (FR-011).
 * @param {object} entry Dữ liệu phiên thực thi
 * @param {string} entry.ngay Ngày phân tích dạng YYYY-MM-DD
 * @param {string} [entry.nguon='bot.db'] Nguồn dữ liệu đã đọc
 * @param {number} [entry.soTin=0] Số tin nhắn đã quét
 * @param {number|Array} [entry.phatHien=0] Số phát hiện hoặc mảng phát hiện
 * @param {object} [entry.ketQuaIssue] Kết quả xử lý issue ({ moi, comment, boViGioiHan, loi })
 * @param {string|object|null} [entry.loi=null] Lỗi nếu gặp phải
 * @param {string} [entry.at] Mốc thời gian ISO (mặc định hiện tại UTC)
 * @param {object} [opts] Tùy chọn db ({ db, dbPath })
 * @returns {number|null} ID của bản ghi vừa chèn, hoặc null nếu lỗi
 */
export function ghiNhatKy(entry, opts = {}) {
  const { db, tuDongDong } = moDbSo(opts);
  try {
    const ngay = String(entry.ngay || new Date().toISOString().slice(0, 10));
    const nguon = String(entry.nguon || 'bot.db');
    const soTin = Number(entry.soTin || 0);

    let soPhatHien = 0;
    if (typeof entry.phatHien === 'number') {
      soPhatHien = entry.phatHien;
    } else if (Array.isArray(entry.phatHien)) {
      soPhatHien = entry.phatHien.length;
    }

    const ketQua = entry.ketQuaIssue || {};
    const issueMoi = Array.isArray(ketQua.moi) ? ketQua.moi.length : Number(entry.issueMoi || 0);
    const issueComment = Array.isArray(ketQua.comment) ? ketQua.comment.length : Number(entry.issueComment || 0);

    const chiTietIssue = ketQua && Object.keys(ketQua).length > 0 ? JSON.stringify(ketQua) : null;

    let loi = null;
    if (entry.loi) {
      loi = typeof entry.loi === 'string' ? entry.loi : JSON.stringify(entry.loi);
    } else if (ketQua.loi && ketQua.loi.length > 0) {
      loi = JSON.stringify(ketQua.loi);
    }

    const at = entry.at || new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO nhat_ky_giam_sat (ngay, nguon, so_tin, so_phat_hien, issue_moi, issue_comment, chi_tiet_issue, loi, at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(ngay, nguon, soTin, soPhatHien, issueMoi, issueComment, chiTietIssue, loi, at);
    return Number(result.lastInsertRowid);
  } catch (err) {
    console.error(`[so-nhat-ky] Lỗi khi ghi nhật ký giám sát: ${err.message}`);
    return null;
  } finally {
    if (tuDongDong) {
      db.close();
    }
  }
}

/**
 * Đọc lại danh sách nhật ký giám sát đã lưu.
 * @param {object} [opts] Tùy chọn truy vấn ({ db, dbPath, limit, ngay })
 * @returns {Array<object>}
 */
export function docNhatKy(opts = {}) {
  const { db, tuDongDong } = moDbSo(opts);
  try {
    const limit = Math.max(1, Math.min(Number(opts.limit || 50), 500));
    let rows;
    if (opts.ngay) {
      rows = db.prepare(`
        SELECT * FROM nhat_ky_giam_sat WHERE ngay = ? ORDER BY id DESC LIMIT ?
      `).all(opts.ngay, limit);
    } else {
      rows = db.prepare(`
        SELECT * FROM nhat_ky_giam_sat ORDER BY id DESC LIMIT ?
      `).all(limit);
    }

    return rows.map((r) => {
      let chiTiet = null;
      try {
        if (r.chi_tiet_issue) chiTiet = JSON.parse(r.chi_tiet_issue);
      } catch {}

      return {
        ...r,
        chi_tiet_issue: chiTiet,
      };
    });
  } catch (err) {
    console.error(`[so-nhat-ky] Lỗi khi đọc nhật ký giám sát: ${err.message}`);
    return [];
  } finally {
    if (tuDongDong) {
      db.close();
    }
  }
}
