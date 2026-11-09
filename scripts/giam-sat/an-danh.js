// Module ẩn danh bằng chứng cho agent giám sát — spec 007 (T706, FR-004, SC-002)
// Che sạch SĐT, STK ngân hàng, khoá bí mật, đường dẫn nội bộ và tên khách.
import { redact } from '../../core/redact.js';
import { cheSdt, cheSoTaiKhoan } from '../../core/sanitizer.js';

// Đường dẫn nội bộ: /home/, /opt/, ổ đĩa Windows
const DUONG_DAN = /(?:[A-Za-z]:\\[^\s"'()]*|\/(?:home|opt)\/[^\s"'()]*)/g;

// Khoá bí mật mà redact() của lõi bỏ sót: sk-... (kể cả key ngắn test sk-gia-...) và EAA...
const KHOA = /\bsk-[\w-]{6,}|\bEAA[A-Za-z0-9]{8,}/g;

// Regex nhận diện tên khách qua xưng hô tiếng Việt (bắt buộc viết hoa từng âm tiết tên)
const TEN_XUNG_HO = /(?:(?:[Kk]hách(?:\s+hàng)?|[Aa]nh|[Cc]hị|[Ee]m|[Bb]ác|[Cc]hú|[Cc]ô)\s+|[Tt]ôi là\s+|[Mm]ình là\s+|[Ee]m là\s+)(\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+){1,3})/gu;
const TEN_HE_THONG = new Set(['bot', 'nhan-vien', 'nhanvien', 'staff', 'system', 'admin', 'oz', 'zalo']);

/**
 * Sinh nhãn khách hàng theo chỉ số tuần tự: 0 -> 'Khách A', 1 -> 'Khách B', ...
 * @param {number} index
 * @returns {string}
 */
export function sinhNhanKhach(index) {
  let s = '';
  let n = index;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return `Khách ${s}`;
}

/**
 * Thu thập tên khách hàng từ danh sách hội thoại/tin nhắn và tạo Map ánh xạ tên -> nhãn
 * @param {Array<object|string>} [messages=[]]
 * @returns {Map<string, string>}
 */
export function taoBangKhach(messages = []) {
  const mapKhach = new Map();
  if (!Array.isArray(messages) || messages.length === 0) {
    return mapKhach;
  }

  let idx = 0;
  function themTen(rawTen) {
    if (!rawTen || typeof rawTen !== 'string') return;
    const ten = rawTen.trim();
    if (ten.length < 2 || TEN_HE_THONG.has(ten.toLowerCase())) return;
    if (!mapKhach.has(ten)) {
      mapKhach.set(ten, sinhNhanKhach(idx++));
    }
  }

  for (const m of messages) {
    if (!m) continue;
    if (typeof m === 'string') {
      let match;
      const re = new RegExp(TEN_XUNG_HO.source, 'gu');
      while ((match = re.exec(m)) !== null) {
        themTen(match[1]);
      }
      continue;
    }

    if (typeof m === 'object') {
      const tenTrucTiep = m.display_name || m.sender_name || m.customer_name || m.tenKhach || m.user_name;
      if (typeof tenTrucTiep === 'string') {
        themTen(tenTrucTiep);
      }

      // Chỉ quét nội dung tin nhắn nếu không phải bot / nhân viên phát ngôn
      const spk = m.speaker ? String(m.speaker).toLowerCase() : '';
      if (spk === 'bot' || spk === 'nhan-vien' || spk === 'staff') {
        continue;
      }

      if (typeof m.text === 'string') {
        let match;
        const re = new RegExp(TEN_XUNG_HO.source, 'gu');
        while ((match = re.exec(m.text)) !== null) {
          themTen(match[1]);
        }
      }
    }
  }

  return mapKhach;
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
 * - Che số tài khoản ngân hàng (9-16 chữ số cạnh STK/ngân hàng qua cheSoTaiKhoan)
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

  // 2. Số tài khoản ngân hàng (tái sử dụng từ core/sanitizer.js)
  s = cheSoTaiKhoan(s);

  // 3. Đường dẫn nội bộ
  s = s.replace(DUONG_DAN, '***');

  // 4. Khoá bí mật (redact của lõi + bổ sung sk-, EAA)
  s = redact(s).replace(KHOA, '***');

  // 5. Số điện thoại (tái sử dụng từ core/sanitizer.js)
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
