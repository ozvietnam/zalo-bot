// Module ẩn danh bằng chứng cho agent giám sát — spec 007 (T706, FR-004, SC-002)
// Che sạch SĐT, STK ngân hàng, khoá bí mật, đường dẫn nội bộ và tên khách.
import { redact } from '../../core/redact.js';
import { cheSdt } from '../../core/sdt.js';

// Đường dẫn nội bộ: /home/, /opt/, ổ đĩa Windows
const DUONG_DAN = /(?:[A-Za-z]:\\[^\s"'()]*|\/(?:home|opt)\/[^\s"'()]*)/g;

// Khoá bí mật mà redact() của lõi bỏ sót: sk-... (kể cả key ngắn test sk-gia-...) và EAA...
const KHOA = /\bsk-[\w-]{6,}|\bEAA[A-Za-z0-9]{8,}/g;

// Từ khoá STK và danh sách các ngân hàng phổ biến tại Việt Nam
const TU_KHOA_TK = '(?:stk|số\\s+tài\\s+khoản|so\\s+tai\\s+khoan|tài\\s+khoản|tai\\s+khoan|tk)';
const NGAN_HANG = '(?:vietcombank|vcb|techcombank|tcb|mbbank|mb\\s+bank|mb|acb|bidv|agribank|tpbank|vpbank|sacombank|vietinbank|vib|ocb|shb|msb|hdbank|eximbank|scb|lienvietpostbank|lpbank|bac\\s*a\\s*bank|baoviet\\s*bank|pvcombank|kienlongbank|nam\\s*a\\s*bank|seabank|pg\\s*bank|saigonbank|shinhan(?:\\s*bank)?|woori(?:\\s*bank)?)';
const TU_KHOA_NGAN_HANG = `(?:${TU_KHOA_TK}|${NGAN_HANG})`;

// Regex nhận diện dãy số đứng sau từ khoá ngân hàng / STK
const STK_SAU_TU_KHOA = new RegExp(`(\\b${TU_KHOA_NGAN_HANG}\\b\\s*[:#-]?\\s*)(\\d[\\d\\s.-]{7,22}\\d)\\b`, 'gi');

// Regex nhận diện dãy số đứng trước từ khoá ngân hàng / STK
const STK_TRUOC_TU_KHOA = new RegExp(`\\b(\\d[\\d\\s.-]{7,22}\\d)(\\s*[:#-]?\\s*\\b${TU_KHOA_NGAN_HANG}\\b)`, 'gi');

/**
 * Sinh nhãn khách hàng theo chỉ số tuần tự: 0 -> 'Khách A', 1 -> 'Khách B', ...
 * @param {number} index
 * @returns {string}
 */
function sinhNhanKhach(index) {
  let s = '';
  let n = index;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return `Khách ${s}`;
}

/**
 * Che số tài khoản ngân hàng (9-16 chữ số đứng cạnh tên ngân hàng hoặc chữ STK)
 * @param {string} text
 * @returns {string}
 */
function cheStk(text) {
  let s = text;
  // 1. Trường hợp từ khoá đứng trước dãy số
  s = s.replace(STK_SAU_TU_KHOA, (match, prefix, numStr) => {
    const digits = numStr.replace(/\D/g, '');
    if (digits.length >= 9 && digits.length <= 16) {
      return `${prefix}***`;
    }
    return match;
  });

  // 2. Trường hợp từ khoá đứng sau dãy số
  s = s.replace(STK_TRUOC_TU_KHOA, (match, numStr, suffix) => {
    const digits = numStr.replace(/\D/g, '');
    if (digits.length >= 9 && digits.length <= 16) {
      return `***${suffix}`;
    }
    return match;
  });

  return s;
}

/**
 * Thay thế tên khách bằng nhãn 'Khách A', 'Khách B' dựa trên mapKhach
 * @param {string} text
 * @param {Map<string, string>} [mapKhach]
 * @returns {string}
 */
function anDanhTenKhach(text, mapKhach) {
  if (!mapKhach || !(mapKhach instanceof Map) || mapKhach.size === 0) {
    return text;
  }

  // Tập hợp các nhãn đã được sử dụng
  const daDung = new Set([...mapKhach.values()].filter(Boolean));

  // Ưu tiên thay tên dài trước tên ngắn để tránh xung đột tiền tố
  const danhSachTen = [...mapKhach.keys()].sort((a, b) => b.length - a.length);

  let ketQua = text;
  for (const ten of danhSachTen) {
    if (!ten || !ketQua.includes(ten)) continue;

    let nhan = mapKhach.get(ten);
    if (!nhan) {
      // Tìm nhãn tuần tự nhỏ nhất chưa dùng
      let idx = 0;
      while (daDung.has(sinhNhanKhach(idx))) {
        idx++;
      }
      nhan = sinhNhanKhach(idx);
      daDung.add(nhan);
      mapKhach.set(ten, nhan);
    }
    ketQua = ketQua.replaceAll(ten, nhan);
  }

  return ketQua;
}

/**
 * Ẩn danh toàn diện một đoạn văn bản:
 * - Thay tên khách trong mapKhach thành 'Khách A', 'Khách B'
 * - Che số tài khoản ngân hàng (9-16 chữ số cạnh STK/ngân hàng)
 * - Che đường dẫn nội bộ (/home/..., /opt/...)
 * - Che token / khoá bí mật (sk-..., EAA..., Bearer, bot...)
 * - Che số điện thoại di động VN qua cheSdt (không mất mã HS)
 *
 * @param {string} text
 * @param {Map<string, string>} [mapKhach]
 * @returns {string}
 */
export function anDanhVanBan(text, mapKhach) {
  let s = String(text ?? '');

  // 1. Tên khách hàng theo map
  s = anDanhTenKhach(s, mapKhach);

  // 2. Số tài khoản ngân hàng
  s = cheStk(s);

  // 3. Đường dẫn nội bộ
  s = s.replace(DUONG_DAN, '***');

  // 4. Khoá bí mật (redact của lõi + bổ sung sk-, EAA)
  s = redact(s).replace(KHOA, '***');

  // 5. Số điện thoại (dùng chung ngữ pháp với lõi)
  s = cheSdt(s);

  return s;
}

/**
 * Ẩn danh đệ quy các trường trong đối tượng / mảng bằng chứng
 * @param {*} val
 * @param {Map<string, string>} [mapKhach]
 * @returns {*}
 */
function anDanhGiaTri(val, mapKhach) {
  if (typeof val === 'string') {
    return anDanhVanBan(val, mapKhach);
  }
  if (Array.isArray(val)) {
    return val.map((item) => anDanhGiaTri(item, mapKhach));
  }
  if (val && typeof val === 'object') {
    const res = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = anDanhGiaTri(v, mapKhach);
    }
    return res;
  }
  return val;
}

/**
 * Ẩn danh mảng bằng chứng trước khi xuất bản ra issue hoặc log công khai
 * @param {Array<any>} bangChung
 * @param {Map<string, string>} [mapKhach]
 * @returns {Array<any>}
 */
export function anDanhBangChung(bangChung, mapKhach = new Map()) {
  if (!Array.isArray(bangChung)) return bangChung;
  return bangChung.map((b) => anDanhGiaTri(b, mapKhach));
}
