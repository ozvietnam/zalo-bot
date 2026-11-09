// scripts/giam-sat/digest.js — spec 007 T704 (FR-010, B2b)
// Soạn bản tin giám sát và lưu vào hộp thư riêng: mỗi bản tin một tệp theo idemKey.
// Bỏ đọc-sửa-ghi chung một tệp (B2b). Không ghi vào bot.db (FR-005).
// Tệp dưới 300 dòng theo Hiến pháp Điều VI.

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export const THU_MUC_HOP_THU = 'hop-thu-digest';

/**
 * Tạo khoá idempotent cho bản tin giám sát theo kỳ.
 * @param {object} opts
 * @param {string} opts.ngay Ngày (YYYY-MM-DD) hoặc mã tuần (YYYY-Www)
 * @param {string} [opts.loai='ngay'] 'ngay' hoặc 'tuan'
 * @returns {string} Ví dụ 'digest:ngay:2026-11-06' hoặc 'digest:tuan:2026-W45'
 */
export function taoIdemKeyDigest({ ngay, loai = 'ngay' }) {
  const k = String(ngay || new Date().toISOString().slice(0, 10));
  return `digest:${loai}:${k}`;
}

/**
 * Tên tệp an toàn theo idemKey.
 * @param {string} idemKey
 * @returns {string}
 */
export function tenTepHopThu(idemKey) {
  const anToan = String(idemKey).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${anToan}.json`;
}

/**
 * Soạn nội dung bản tin tiếng Việt không chứa HTML tags.
 * @param {object} param0
 * @param {string} param0.ngay Ngày hoặc kỳ giám sát
 * @param {Array} [param0.phatHien=[]] Danh sách phát hiện
 * @param {object} [param0.ketQua={}] Kết quả issue
 * @param {string} [param0.loai='ngay'] 'ngay' hoặc 'tuan'
 * @param {Array} [param0.vongLap=[]] Danh sách đo lường vòng lặp trước/sau
 * @returns {string} Nội dung bản tin định dạng Markdown / text
 */
export function soanBanTin({ ngay, phatHien = [], ketQua = {}, loai = 'ngay', vongLap = [] }) {
  const tieuDeLoai = loai === 'tuan' ? 'Bản tin tuần' : 'Bản tin ngày';
  const icon = phatHien.length === 0 ? '✅' : phatHien.length <= 3 ? '⚠️' : '🔴';

  const lines = [
    `${icon} [Giám sát bot] ${tieuDeLoai} — ${ngay}`,
    '',
    `Phát hiện: ${phatHien.length}`,
  ];

  if (phatHien.length === 0) {
    lines.push('✓ Ngày sạch — 0 phát hiện lỗi vượt ngưỡng.');
  } else {
    lines.push('');
    for (const p of phatHien) {
      const e = p.ma.startsWith('GATE') ? '🚫' : p.ma.startsWith('TOOL') ? '🔧' : '💬';
      const cheDoStr = p.cheDo ? `/${p.cheDo}` : '';
      lines.push(`${e} ${p.ma}${cheDoStr}: ${p.soDo} → ${p.repo}`);
    }
  }

  if (ketQua?.moi?.length) lines.push('', `↗ Issue mới: ${ketQua.moi.length}`);
  if (ketQua?.comment?.length) lines.push(`↗ Comment cũ: ${ketQua.comment.length}`);
  if (ketQua?.boViGioiHan?.length) lines.push(`⊘ Bỏ giới hạn: ${ketQua.boViGioiHan.length}`);
  if (ketQua?.loi) lines.push('', `⚠️ ${ketQua.loi}`);

  if (Array.isArray(vongLap) && vongLap.length > 0) {
    lines.push('', 'Vòng lặp cải tiến (trước/sau 7 ngày):');
    for (const v of vongLap) {
      const num = v.issueNumber ?? v.number ?? '?';
      const ma = v.maLoi || v.ma || 'KHONG-RO';
      if (v.chuaDu7Ngay || v.ghiChu === 'Chưa đủ 7 ngày sau khi đóng để đo') {
        lines.push(`• #${num} ${ma}: Chưa đủ 7 ngày sau khi đóng để đo`);
      } else {
        const truoc = v.truoc7Ngay ?? v.soDoTruoc ?? 0;
        const sau = v.sau7Ngay ?? v.soDoSau ?? 0;
        let ptStr = v.phanTramThayDoi;
        if (!ptStr) {
          const nT = Number(truoc) || 0;
          const nS = Number(sau) || 0;
          if (nT > 0) {
            const pt = Math.round(Math.abs(nT - nS) / nT * 100);
            ptStr = nS < nT ? `giảm ${pt}%` : nS > nT ? `tăng ${pt}%` : 'không đổi';
          } else {
            ptStr = nS === 0 ? 'không đổi' : `tăng ${nS}`;
          }
        }
        lines.push(`• #${num} ${ma}: ${truoc} → ${sau} (${ptStr})`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Ghi bản tin vào hộp thư riêng: mỗi bản tin một tệp theo idemKey (B2b, atomic rename).
 * @param {object} opts
 * @param {string} opts.banTin Nội dung bản tin đã ẩn danh
 * @param {string} opts.ngay Ngày (YYYY-MM-DD) hoặc kỳ (YYYY-Www)
 * @param {string} [opts.loai='ngay'] 'ngay' hoặc 'tuan'
 * @param {string} [opts.idemKey] Khoá ghi đè nếu có
 * @param {string} [opts.dataDir] Thư mục dữ liệu (mặc định ./data)
 * @param {string} [opts.hopThuDir] Thư mục hộp thư riêng (ghi đè dataDir/hop-thu-digest)
 * @param {Function} [opts.now] Hàm lấy mốc giờ
 * @returns {{ ok: boolean, idemKey: string, inserted: boolean, filePath?: string, error?: string }}
 */
export function ghiHopThuDigest(opts = {}) {
  const DATA_DIR = opts.dataDir || process.env.DATA_DIR || './data';
  const thuMuc = opts.hopThuDir || join(DATA_DIR, THU_MUC_HOP_THU);
  const ngay = String(opts.ngay || new Date().toISOString().slice(0, 10));
  const loai = String(opts.loai || 'ngay');
  const idemKey = opts.idemKey || taoIdemKeyDigest({ ngay, loai });
  const text = String(opts.banTin || '');
  const nowFn = opts.now || (() => new Date());

  try {
    mkdirSync(thuMuc, { recursive: true });
    const filePath = join(thuMuc, tenTepHopThu(idemKey));

    // Chống trùng: nếu tệp đã tồn tại thì giữ nguyên, không nhân bản (idempotent)
    if (existsSync(filePath)) {
      return { ok: true, idemKey, inserted: false, filePath };
    }

    const payload = {
      idemKey,
      loai,
      ky: ngay,
      text,
      status: 'pending',
      createdAt: nowFn().toISOString(),
      attempts: 0,
      sentAt: null,
      lastError: null,
    };

    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
    renameSync(tmpPath, filePath);

    return { ok: true, idemKey, inserted: true, filePath };
  } catch (err) {
    console.error(`[digest] Lỗi khi ghi tệp hộp thư: ${err.message}`);
    return { ok: false, idemKey, inserted: false, error: err.message };
  }
}

/**
 * Gửi trực tiếp bản tin qua cửa gate.send với kind: 'digest' (hỗ trợ kiểm thử/contract).
 * @param {object} param0
 * @param {string} param0.banTin
 * @param {object} param0.gate Cửa gửi
 * @param {string} param0.staffChatId ID nhóm nhân viên
 * @param {string} [param0.ngay]
 * @param {string} [param0.loai='ngay']
 * @param {string} [param0.idemKey]
 * @returns {Promise<{ ok: boolean, decision?: string, [key: string]: any }>}
 */
export async function guiBanTinDigest({ banTin, gate, staffChatId, ngay, loai = 'ngay', idemKey }) {
  if (!gate || typeof gate.send !== 'function') {
    throw new Error('guiBanTinDigest: thiếu gate.send');
  }
  const key = idemKey || taoIdemKeyDigest({ ngay, loai });
  const res = await gate.send({
    kind: 'digest',
    chatId: staffChatId,
    isGroup: true,
    idemKey: key,
    text: banTin,
  });
  return {
    ok: res?.decision === 'send',
    decision: res?.decision,
    reason: res?.reason,
    status: res?.status,
  };
}
