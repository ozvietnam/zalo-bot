// scripts/giam-sat/digest.js — Soạn bản tin giám sát cho kênh Zalo digest (FR-010).
// Bỏ toàn bộ thẻ HTML để tương thích kênh Zalo bot. Dưới 300 dòng (Hiến pháp VI).
import { dungBanTin } from './telegram.js';

/**
 * Soạn bản tin giám sát dạng văn bản sạch (không thẻ HTML) để gửi qua cửa gate.js.
 * @param {object} params
 * @param {string} params.ngay - ngày xét (YYYY-MM-DD)
 * @param {Array} [params.phatHien] - danh sách phát hiện
 * @param {object} [params.ketQua] - kết quả xử lý issue
 * @param {string} [params.loai] - 'ngay' hoặc 'tuan'
 * @returns {string}
 */
export function soanBanTinDigest({ ngay, phatHien = [], ketQua = {}, loai = 'ngay' }) {
  const banTinHtml = dungBanTin({ ngay, phatHien, ketQua });
  return banTinHtml.replace(/<[^>]+>/g, '').trim();
}
