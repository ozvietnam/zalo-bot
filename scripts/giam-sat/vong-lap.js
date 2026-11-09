// Module đo lường đối chiếu số đo trước/sau cho các issue đã đóng (Spec 007, US6, SC-005)
// So sánh số đo 7 ngày trước khi đóng và 7 ngày sau khi đóng để đánh giá việc giải quyết lỗi.
// Tệp dưới 300 dòng theo Hiến pháp Điều VI.

import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { jaccard, laKhach, laNhanVien } from './tinh-hieu.js';

const MS_MOT_NGAY = 24 * 60 * 60 * 1000;
const CUA_SO_THEO_DOI_MS = 14 * MS_MOT_NGAY;
const KHOANG_DO_MS = 7 * MS_MOT_NGAY;
const BUC_PATTERN = /chả hiểu|cha hieu|không hiểu|ko hiểu|lần thứ \d|bot à|người hay máy|thật sự|gtgt|!!!{2,}/i;

/**
 * Đếm số lượng tín hiệu trong khoảng thời gian bằng SQLite thật nếu có.
 */
export function demTinHieuSqlite(db, ma, from, to, cheDo) {
  try {
    const maChuan = String(ma || '').toUpperCase().replace(/_/g, '-');

    if (maChuan === 'GATE-LEAK' || maChuan === 'CHUA-LOC-NOI-BO') {
      return Number(db.prepare("SELECT COUNT(*) as count FROM outbox WHERE decision IN ('block', 'reject') AND reason LIKE 'leak:%' AND created_at BETWEEN ? AND ?").get(from, to)?.count || 0);
    }
    if (maChuan === 'GATE-MONEY' || maChuan === 'SAI-SO') {
      return Number(db.prepare("SELECT COUNT(*) as count FROM outbox WHERE decision IN ('block', 'reject') AND reason LIKE 'money%' AND created_at BETWEEN ? AND ?").get(from, to)?.count || 0);
    }
    if (maChuan === 'TOOL-ERR' || maChuan === 'TOOL-ERROR') {
      const sql = cheDo ? "SELECT COUNT(*) as count FROM audit WHERE type = 'tool_error' AND at BETWEEN ? AND ? AND json_extract(data, '$.tool') = ?" : "SELECT COUNT(*) as count FROM audit WHERE type = 'tool_error' AND at BETWEEN ? AND ?";
      return Number((cheDo ? db.prepare(sql).get(from, to, cheDo) : db.prepare(sql).get(from, to))?.count || 0);
    }
    if (maChuan === 'TOOL-EMPTY') {
      const sql = cheDo ? "SELECT COUNT(*) as count FROM audit WHERE type = 'tool_empty' AND at BETWEEN ? AND ? AND json_extract(data, '$.tool') = ?" : "SELECT COUNT(*) as count FROM audit WHERE type = 'tool_empty' AND at BETWEEN ? AND ?";
      return Number((cheDo ? db.prepare(sql).get(from, to, cheDo) : db.prepare(sql).get(from, to))?.count || 0);
    }
    if (maChuan === 'JOB-EXPIRED') {
      return Number(db.prepare("SELECT COUNT(*) as count FROM jobs WHERE expires_at BETWEEN ? AND ?").get(from, to)?.count || 0);
    }

    if (['HOI-LAI', 'NGUOI-THAY', 'KHACH-BUC', 'XIN-LOI-TAY'].includes(maChuan)) {
      const rows = db.prepare("SELECT rowid as _rowid, * FROM messages WHERE at BETWEEN ? AND ? ORDER BY at ASC").all(from, to);
      if (!rows || rows.length === 0) return 0;

      const byChat = {};
      for (const r of rows) {
        const chat = String(r.chat_id ?? r.conv_id ?? r.thread_id ?? 'default');
        (byChat[chat] ||= []).push({
          chat_id: chat,
          speaker: String(r.speaker ?? r.sender_type ?? r.sender ?? ''),
          text: String(r.text ?? r.content ?? r.message ?? r.body ?? ''),
          at: String(r.at ?? r.created_at ?? r.ts ?? ''),
        });
      }

      if (maChuan === 'HOI-LAI') {
        const phong = new Set();
        for (const [chat, cMsgs] of Object.entries(byChat)) {
          cMsgs.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
          for (let i = 0; i < cMsgs.length; i++) {
            const m = cMsgs[i];
            if (!laKhach(m) || !m.text) continue;
            let botReply = null;
            for (let j = i + 1; j < cMsgs.length; j++) {
              if (cMsgs[j].speaker === 'bot') { botReply = cMsgs[j]; break; }
              if (laKhach(cMsgs[j])) break;
            }
            if (!botReply) continue;
            const botIdx = cMsgs.indexOf(botReply);
            for (let j = botIdx + 1; j < cMsgs.length; j++) {
              const m2 = cMsgs[j];
              if (!laKhach(m2)) continue;
              const dt = new Date(m2.at) - new Date(botReply.at);
              if (dt > 30 * 60_000) break;
              if (jaccard(m.text, m2.text) >= 0.8) { phong.add(chat); break; }
            }
          }
        }
        return phong.size;
      }

      if (maChuan === 'NGUOI-THAY') {
        const phong = new Set();
        for (const [chat, cMsgs] of Object.entries(byChat)) {
          cMsgs.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
          for (let i = 0; i < cMsgs.length; i++) {
            if (cMsgs[i].speaker !== 'bot') continue;
            for (let j = i + 1; j < cMsgs.length; j++) {
              const m = cMsgs[j];
              if (laNhanVien(m)) {
                const dt = new Date(m.at) - new Date(cMsgs[i].at);
                if (dt >= 0 && dt <= 15 * 60_000) phong.add(chat);
                break;
              }
              if (laKhach(m)) break;
            }
          }
        }
        return phong.size;
      }

      if (maChuan === 'KHACH-BUC') {
        const phong = new Set();
        for (const chatMsgs of Object.values(byChat)) {
          for (const m of chatMsgs) {
            if (laKhach(m) && m.text && BUC_PATTERN.test(m.text)) phong.add(m.chat_id);
          }
        }
        return phong.size;
      }

      if (maChuan === 'XIN-LOI-TAY') {
        let soLan = 0;
        for (const [, cMsgs] of Object.entries(byChat)) {
          cMsgs.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
          for (let i = 1; i < cMsgs.length; i++) {
            if (laNhanVien(cMsgs[i]) && /xin lỗi|gửi nhầm|sorry/i.test(cMsgs[i].text || '') && cMsgs[i - 1].speaker === 'bot') {
              soLan++;
            }
          }
        }
        return soLan;
      }
    }
    return 0;
  } catch {
    return 0;
  }
}

function laySoDo(db, ma, from, to, cheDo) {
  if (typeof db?.demTinHieu === 'function') return db.demTinHieu(ma, from, to, cheDo);
  if (typeof db?.prepare === 'function') return demTinHieuSqlite(db, ma, from, to, cheDo);
  return 0;
}

/**
 * Đo lường đối chiếu số đo trước/sau cho các issue đã đóng trong 14 ngày (SC-005).
 * Hỗ trợ cả chữ ký object lẫn chữ ký vị trí (db, danhSachThe, opts).
 */
export function doLuongTruocSau(arg1 = {}, arg2, arg3) {
  let issueDaDong = [];
  let db = null;
  let ngayHienTai = new Date().toISOString();

  if (typeof arg1 === 'string' || (arg1 && typeof arg1 === 'object' && (arg1.prepare || arg1.demTinHieu))) {
    db = arg1;
    issueDaDong = Array.isArray(arg2) ? arg2 : [];
    if (arg3 && typeof arg3 === 'object') ngayHienTai = arg3.ngayHienTai || arg3.now || arg3.hienTai || ngayHienTai;
    else if (typeof arg3 === 'string') ngayHienTai = arg3;
  } else if (Array.isArray(arg1)) {
    issueDaDong = arg1;
    db = arg2;
    if (arg3 && typeof arg3 === 'object') ngayHienTai = arg3.ngayHienTai || arg3.now || arg3.hienTai || ngayHienTai;
    else if (typeof arg3 === 'string') ngayHienTai = arg3;
  } else if (arg1 && typeof arg1 === 'object') {
    issueDaDong = arg1.issueDaDong || arg1.danhSachThe || arg1.issues || [];
    db = arg1.db || arg1.dbPath || null;
    ngayHienTai = arg1.ngayHienTai || arg1.now || arg1.hienTai || ngayHienTai;
  }

  let localDb = null;
  let dbConn = db;
  if (typeof db === 'string' && existsSync(db)) {
    try {
      localDb = new DatabaseSync(db, { readOnly: true });
      dbConn = localDb;
    } catch {
      dbConn = null;
    }
  }

  try {
    const mocHienTai = new Date(ngayHienTai).getTime();
    const ketQua = [];

    for (const issue of issueDaDong) {
      if (!issue) continue;
      const mocDongStr = issue.closed_at || issue.closedAt || issue.dongLuc;
      if (!mocDongStr) continue;

      const mocDong = new Date(mocDongStr).getTime();
      if (Number.isNaN(mocDong)) continue;

      const dt = mocHienTai - mocDong;
      if (dt < 0 || dt > CUA_SO_THEO_DOI_MS) continue;

      const chuaDu7Ngay = dt < KHOANG_DO_MS;
      const truocFrom = new Date(mocDong - KHOANG_DO_MS).toISOString();
      const truocTo = new Date(mocDong).toISOString();
      const sauFrom = new Date(mocDong).toISOString();
      const sauTo = new Date(Math.min(mocDong + KHOANG_DO_MS, mocHienTai)).toISOString();

      const ma = issue.ma || issue.maLoi || issue.signal;
      const cheDo = issue.cheDo || issue.tool || null;
      const repo = issue.repo || issue.repository || 'zalo-bot';
      const num = issue.number ?? issue.issueNumber ?? issue.id ?? 0;

      const rawTruoc = laySoDo(dbConn, ma, truocFrom, truocTo, cheDo);
      const rawSau = laySoDo(dbConn, ma, sauFrom, sauTo, cheDo);
      const numTruoc = Number(rawTruoc) || 0;
      const numSau = Number(rawSau) || 0;
      const giamThanhCong = numSau < numTruoc;

      let phanTramThayDoi = null;
      if (numTruoc > 0) {
        const pt = Math.round(Math.abs(numTruoc - numSau) / numTruoc * 100);
        phanTramThayDoi = numSau < numTruoc ? `giảm ${pt}%` : numSau > numTruoc ? `tăng ${pt}%` : 'không đổi';
      } else if (numSau === 0) {
        phanTramThayDoi = 'không đổi';
      } else {
        phanTramThayDoi = `tăng ${numSau}`;
      }

      const ghiChu = chuaDu7Ngay ? 'Chưa đủ 7 ngày sau khi đóng để đo' : null;

      ketQua.push({
        issueNumber: num, number: num,
        ma, maLoi: ma, repo, cheDo,
        soDoTruoc: String(rawTruoc), soDoSau: String(rawSau),
        truoc7Ngay: numTruoc, sau7Ngay: numSau,
        chuaDu7Ngay, phanTramThayDoi, ghiChu, giamThanhCong,
      });
    }

    return ketQua;
  } finally {
    if (localDb) {
      try { localDb.close(); } catch {}
    }
  }
}
