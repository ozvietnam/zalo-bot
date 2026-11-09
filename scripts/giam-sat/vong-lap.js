// Module đo lường đối chiếu số đo trước/sau cho các issue đã đóng (Spec 007, US6, SC-005)
// So sánh số đo 7 ngày trước khi đóng và 7 ngày sau khi đóng để đánh giá việc giải quyết lỗi.
// Tệp dưới 300 dòng theo Hiến pháp Điều VI.

const MS_MOT_NGAY = 24 * 60 * 60 * 1000;
const CUA_SO_THEO_DOI_MS = 14 * MS_MOT_NGAY;
const KHOANG_DO_MS = 7 * MS_MOT_NGAY;

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
    if (ma === 'GATE-LEAK') {
      const row = db.prepare(`
        SELECT COUNT(*) as count FROM outbox
        WHERE decision = 'block' AND reason LIKE 'leak:%' AND created_at BETWEEN ? AND ?
      `).get(from, to);
      return Number(row?.count || 0);
    }

    if (ma === 'GATE-MONEY') {
      const row = db.prepare(`
        SELECT COUNT(*) as count FROM outbox
        WHERE decision = 'block' AND reason LIKE 'money%' AND created_at BETWEEN ? AND ?
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
 * @returns {Array<{ issueNumber: number, ma: string, repo: string, cheDo?: string|null, soDoTruoc: string, soDoSau: string, giamThanhCong: boolean }>}
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

    const truocFrom = new Date(mocDong - KHOANG_DO_MS).toISOString();
    const truocTo = new Date(mocDong).toISOString();

    const sauFrom = new Date(mocDong).toISOString();
    const sauTo = new Date(Math.min(mocDong + KHOANG_DO_MS, mocHienTai)).toISOString();

    const rawTruoc = laySoDo(db, issue.ma, truocFrom, truocTo, issue.cheDo);
    const rawSau = laySoDo(db, issue.ma, sauFrom, sauTo, issue.cheDo);

    const numTruoc = Number(rawTruoc) || 0;
    const numSau = Number(rawSau) || 0;

    const giamThanhCong = numSau < numTruoc;

    ketQua.push({
      issueNumber: issue.number ?? issue.issueNumber ?? 0,
      ma: issue.ma,
      repo: issue.repo,
      cheDo: issue.cheDo || null,
      soDoTruoc: String(rawTruoc),
      soDoSau: String(rawSau),
      giamThanhCong,
    });
  }

  return ketQua;
}
