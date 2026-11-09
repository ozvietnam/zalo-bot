// scripts/giam-sat/sc-002.js
// Bộ kiểm chứng tự động tiêu chí SC-002 (spec 007, tasks.md:51):
// 0 issue chứa SĐT, STK, token hay tên khách thật.
import { findPhoneSpans } from '../../core/sdt.js';

const TU_KHOA_TK = '(?:stk|số\\s+tài\\s+khoản|so\\s+tai\\s+khoan|tài\\s+khoản|tai\\s+khoan|tk)';
const NGAN_HANG = '(?:vietcombank|vcb|techcombank|tcb|mbbank|mb\\s+bank|mb|acb|bidv|agribank|tpbank|vpbank|sacombank|vietinbank|vib|ocb|shb|msb|hdbank|eximbank|scb|lienvietpostbank|lpbank|bac\\s*a\\s*bank|baoviet\\s*bank|pvcombank|kienlongbank|nam\\s*a\\s*bank|seabank|pg\\s*bank|saigonbank|shinhan(?:\\s*bank)?|woori(?:\\s*bank)?)';
const TU_KHOA_NGAN_HANG = `(?:${TU_KHOA_TK}|${NGAN_HANG})`;
const STK_SAU = new RegExp(`(?:\\b${TU_KHOA_NGAN_HANG}\\b\\s*[:#-]?\\s*)(\\d[\\d\\s.-]{7,22}\\d)\\b`, 'i');
const STK_TRUOC = new RegExp(`\\b(\\d[\\d\\s.-]{7,22}\\d)(?:\\s*[:#-]?\\s*\\b${TU_KHOA_NGAN_HANG}\\b)`, 'i');
const KHOA_REGEX = /\bsk-[\w-]{6,}|\bEAA[A-Za-z0-9]{8,}|\bBearer\s+[A-Za-z0-9_-]{8,}/i;

/**
 * Trích xuất toàn bộ văn bản từ đối tượng, mảng hoặc chuỗi issue
 * @param {*} issues
 * @returns {string[]}
 */
export function trichXuatVanBan(issues) {
  const vanBans = [];
  if (!issues) return vanBans;
  if (typeof issues === 'string') return [issues];
  if (Array.isArray(issues)) {
    for (const it of issues) {
      if (typeof it === 'string') vanBans.push(it);
      else if (it && typeof it === 'object') {
        if (it.title) vanBans.push(it.title);
        if (it.tieuDe) vanBans.push(it.tieuDe);
        if (it.body) vanBans.push(it.body);
        if (it.moTa) vanBans.push(it.moTa);
        if (it.text) vanBans.push(it.text);
      }
    }
    return vanBans;
  }
  if (typeof issues === 'object') {
    for (const nhom of [issues.moi, issues.comment, issues.reopen, issues.boViGioiHan]) {
      if (Array.isArray(nhom)) vanBans.push(...trichXuatVanBan(nhom));
    }
    if (issues.body) vanBans.push(issues.body);
    if (issues.title || issues.tieuDe) vanBans.push(issues.title || issues.tieuDe);
  }
  return vanBans;
}

/**
 * Quét toàn bộ tiêu đề + nội dung issue đảm bảo 0 rò rỉ SĐT, STK, token, tên khách thật (SC-002)
 * @param {*} issues
 * @param {object} [opts]
 * @param {Map<string, string>} [opts.mapKhach]
 * @returns {{ hopLe: boolean, viPham: Array<{ loai: string, manh: string }> }}
 */
export function kiemTraSc002(issues, { mapKhach } = {}) {
  const vanBans = trichXuatVanBan(issues);
  const viPham = [];

  for (const vb of vanBans) {
    if (!vb || typeof vb !== 'string') continue;

    // 1. Kiểm tra SĐT qua core/sdt.js
    const spans = findPhoneSpans(vb);
    if (spans.length > 0) {
      for (const [s, e] of spans) {
        viPham.push({ loai: 'SDT', manh: vb.slice(s, e) });
      }
    }

    // 2. Kiểm tra STK ngân hàng
    const mStk = STK_SAU.exec(vb) || STK_TRUOC.exec(vb);
    if (mStk) {
      const d = mStk[1].replace(/\D/g, '');
      if (d.length >= 9 && d.length <= 16) {
        viPham.push({ loai: 'STK', manh: mStk[0] });
      }
    }

    // 3. Kiểm tra token / khoá bí mật
    const mKhoa = vb.match(KHOA_REGEX);
    if (mKhoa) {
      viPham.push({ loai: 'TOKEN', manh: mKhoa[0].slice(0, 10) + '...' });
    }

    // 4. Kiểm tra tên khách thật trong mapKhach
    if (mapKhach && (mapKhach instanceof Map || typeof mapKhach === 'object')) {
      const danhSachTen = mapKhach instanceof Map ? [...mapKhach.keys()] : Object.keys(mapKhach);
      for (const ten of danhSachTen) {
        if (ten && typeof ten === 'string' && ten.length >= 2 && vb.includes(ten)) {
          viPham.push({ loai: 'TEN_KHACH', manh: ten });
        }
      }
    }
  }

  return { hopLe: viPham.length === 0, viPham };
}
