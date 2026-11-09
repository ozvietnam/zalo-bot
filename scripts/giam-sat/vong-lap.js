// Module đo lường đối chiếu số đo trước/sau cho các issue đã đóng (Spec 007, US6, SC-005)
// So sánh số đo 7 ngày trước khi đóng và 7 ngày sau khi đóng để đánh giá việc giải quyết lỗi.
// Tệp dưới 300 dòng theo Hiến pháp Điều VI.

import { jaccard, laKhach, laNhanVien } from './tinh-hieu.js';

const MS_MOT_NGAY = 24 * 60 * 60 * 1000;
const CUA_SO_THEO_DOI_MS = 14 * MS_MOT_NGAY;
const KHOANG_DO_MS = 7 * MS_MOT_NGAY;
const BUC_PATTERN = /chả hiểu|cha hieu|không hiểu|ko hiểu|lần thứ \d|bot à|người hay máy|thật sự|gtgt|!!!{2,}/i;

/**
 * Đếm số lượng tín hiệu trong khoảng thời gian bằng SQLite thật nếu có.
 * @param {object} db Kết nối DatabaseSync
 * @param {string} ma Mã tín hiệu (GATE-LEAK, TOOL-ERR, ...)
 * @param {string} from Mốc bắt đầu ISO
 * @param {string} to Mốc kết thúc ISO
 * @param {string} [cheDo] Tên công cụ / chế độ
 * @returns {number}
 */
function demTinHieuSqlite(db, ma, from, to, cheDo) {
  try {
    if (ma === 'GATE-LEAK' || ma === 'CHUA-LOC-NOI-BO') {
      const row = db.prepare(`
        SELECT COUNT(*) as count FROM outbox
        WHERE decision IN ('block', 'reject') AND reason LIKE 'leak:%' AND created_at BETWEEN ? AND ?
      `).get(from, to);
      return Number(row?.count || 0);
    }

    if (ma === 'GATE-MONEY' || ma === 'SAI-SO') {
      const row = db.prepare(`
        SELECT COUNT(*) as count FROM outbox
        WHERE decision IN ('block', 'reject') AND reason LIKE 'money%' AND created_at BETWEEN ? AND ?
      `).get(from, to);
      return Number(row?.count || 0);
    }

    if (ma === 'TOOL-ERR') {
      if (cheDo) {
        const row = db.prepare(`
          SELECT COUNT(*) as count FROM audit
          WHERE type = 'tool_error' AND at BETWEEN ? AND ? AND json_extract(data, '$.tool') = ?
        `).get(from, to, cheDo);
        return Number(row?.count || 0);
      }
      const row = db.prepare(`
        SELECT COUNT(*) as count FROM audit
        WHERE type = 'tool_error' AND at BETWEEN ? AND ?
      `).get(from, to);
      return Number(row?.count || 0);
    }

    if (ma === 'TOOL-EMPTY') {
      if (cheDo) {
        const row = db.prepare(`
          SELECT COUNT(*) as count FROM audit
          WHERE type = 'tool_empty' AND at BETWEEN ? AND ? AND json_extract(data, '$.tool') = ?
        `).get(from, to, cheDo);
        return Number(row?.count || 0);
      }
      const row = db.prepare(`
        SELECT COUNT(*) as count FROM audit
        WHERE type = 'tool_empty' AND at BETWEEN ? AND ?
      `).get(from, to);
      return Number(row?.count || 0);
    }

    if (ma === 'JOB-EXPIRED') {
      const row = db.prepare(`
        SELECT COUNT(*) as count FROM jobs
        WHERE expires_at BETWEEN ? AND ?
      `).get(from, to);
      return Number(row?.count || 0);
    }

    if (['HOI-LAI', 'NGUOI-THAY', 'KHACH-BUC', 'XIN-LOI-TAY'].includes(ma)) {
      const msgs = db.prepare(`
        SELECT chat_id, turn_id, speaker, text, at
        FROM messages
        WHERE at BETWEEN ? AND ?
        ORDER BY at ASC
      `).all(from, to);

      if (!msgs || msgs.length === 0) return 0;

      const byChat = {};
      for (const m of msgs) {
        (byChat[m.chat_id] ||= []).push(m);
      }

      if (ma === 'HOI-LAI') {
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
              if (jaccard(m.text, m2.text) >= 0.8) {
                phong.add(chat);
                break;
              }
            }
          }
        }
        return phong.size;
      }

      if (ma === 'NGUOI-THAY') {
        const phong = new Set();
        for (const [chat, cMsgs] of Object.entries(byChat)) {
          cMsgs.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
          for (let i = 0; i < cMsgs.length; i++) {
            if (cMsgs[i].speaker !== 'bot') continue;
            for (let j = i + 1; j < cMsgs.length; j++) {
              const m = cMsgs[j];
              if (laNhanVien(m)) {
                const dt = new Date(m.at) - new Date(cMsgs[i].at);
                if (dt >= 0 && dt <= 15 * 60_000) {
                  phong.add(chat);
                }
                break;
              }
              if (laKhach(m)) break;
            }
          }
        }
        return phong.size;
      }

      if (ma === 'KHACH-BUC') {
        const phong = new Set();
        for (const m of msgs) {
          if (laKhach(m) && m.text && BUC_PATTERN.test(m.text)) {
            phong.add(m.chat_id);
          }
        }
        return phong.size;
      }

      if (ma === 'XIN-LOI-TAY') {
        const phong = new Set();
        for (const [chat, cMsgs] of Object.entries(byChat)) {
          cMsgs.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
          for (let i = 1; i < cMsgs.length; i++) {
            if (laNhanVien(cMsgs[i]) && /xin lỗi|gửi nhầm|sorry/i.test(cMsgs[i].text || '')
                && cMsgs[i - 1].speaker === 'bot') {
              phong.add(chat);
            }
          }
        }
        return phong.size;
      }
    }

    return 0;
  } catch {
    return 0;
  }
}

/**
 * Đếm số lượng tín hiệu theo hàm tiêm hoặc kết nối db.
 * @param {object} db Đối tượng db (chứa demTinHieu hoặc prepare)
 * @param {string} ma Mã tín hiệu
 * @param {string} from Mốc bắt đầu ISO
 * @param {string} to Mốc kết thúc ISO
 * @param {string} [cheDo] Chế độ / công cụ
 * @returns {number|string}
 */
function laySoDo(db, ma, from, to, cheDo) {
  if (typeof db?.demTinHieu === 'function') {
    return db.demTinHieu(ma, from, to, cheDo);
  }
  if (typeof db?.prepare === 'function') {
    return demTinHieuSqlite(db, ma, from, to, cheDo);
  }
  return 0;
}

/**
 * Đo lường đối chiếu số đo trước/sau cho các issue đã đóng trong 14 ngày (SC-005).
 * @param {object} params
 * @param {Array<object>} params.issueDaDong Danh sách các issue đã đóng
 * @param {object} params.db Kết nối db hoặc mock db có hàm demTinHieu
 * @param {string} [params.ngayHienTai] Mốc thời gian hiện tại ISO
 * @returns {Array<{ issueNumber: number, ma: string, maLoi: string, repo: string, cheDo?: string|null, soDoTruoc: string, soDoSau: string, truoc7Ngay: number, sau7Ngay: number, chuaDu7Ngay: boolean, phanTramThayDoi: string|null, ghiChu: string|null, giamThanhCong: boolean }>}
 */
export function doLuongTruocSau({ issueDaDong = [], db, ngayHienTai = new Date().toISOString() }) {
  const mocHienTai = new Date(ngayHienTai).getTime();
  const ketQua = [];

  for (const issue of issueDaDong) {
    if (!issue || !issue.closed_at) continue;

    const mocDong = new Date(issue.closed_at).getTime();
    if (Number.isNaN(mocDong)) continue;

    const dt = mocHienTai - mocDong;
    // Chỉ xem xét các issue đóng trong vòng 14 ngày gần nhất
    if (dt < 0 || dt > CUA_SO_THEO_DOI_MS) continue;

    const chuaDu7Ngay = dt < KHOANG_DO_MS;

    const truocFrom = new Date(mocDong - KHOANG_DO_MS).toISOString();
    const truocTo = new Date(mocDong).toISOString();

    const sauFrom = new Date(mocDong).toISOString();
    const sauTo = new Date(Math.min(mocDong + KHOANG_DO_MS, mocHienTai)).toISOString();

    const rawTruoc = laySoDo(db, issue.ma, truocFrom, truocTo, issue.cheDo);
    const rawSau = laySoDo(db, issue.ma, sauFrom, sauTo, issue.cheDo);

    const numTruoc = Number(rawTruoc) || 0;
    const numSau = Number(rawSau) || 0;

    const giamThanhCong = numSau < numTruoc;

    let phanTramThayDoi = null;
    if (numTruoc > 0) {
      const pt = Math.round(Math.abs(numTruoc - numSau) / numTruoc * 100);
      if (numSau < numTruoc) {
        phanTramThayDoi = `giảm ${pt}%`;
      } else if (numSau > numTruoc) {
        phanTramThayDoi = `tăng ${pt}%`;
      } else {
        phanTramThayDoi = 'không đổi';
      }
    } else if (numSau === 0) {
      phanTramThayDoi = 'không đổi';
    } else {
      phanTramThayDoi = `tăng ${numSau}`;
    }

    const ghiChu = chuaDu7Ngay ? 'Chưa đủ 7 ngày sau khi đóng để đo' : null;

    ketQua.push({
      issueNumber: issue.number ?? issue.issueNumber ?? 0,
      ma: issue.ma,
      maLoi: issue.ma,
      repo: issue.repo,
      cheDo: issue.cheDo || null,
      soDoTruoc: String(rawTruoc),
      soDoSau: String(rawSau),
      truoc7Ngay: numTruoc,
      sau7Ngay: numSau,
      chuaDu7Ngay,
      phanTramThayDoi,
      ghiChu,
      giamThanhCong,
    });
  }

  return ketQua;
}
