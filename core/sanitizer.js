// core/sanitizer.js — Mô-đun thuần che thông tin nhạy cảm & kiểm số theo giá trị.
// Tuân thủ Điều VI Hiến pháp: hàm thuần túy, không I/O, không thư viện ngoài, < 300 dòng.
// Dùng chung cho packs/hs/editor.js (soDungChuan) và scripts/giam-sat/an-danh.js (cheSdt, cheSoTaiKhoan).
const LOP_DAU = '.\\-\\s()';
const CHAY_SO = new RegExp(`\\d+(?:[${LOP_DAU}]*\\d+)*`, 'g');
const TU_KHOA_TK = '(?:stk|số\\s+tài\\s+khoản|so\\s+tai\\s+khoan|tài\\s+khoản|tai\\s+khoan|tk|ngân\\s+hàng|ngan\\s+hang|bank|vietcombank|vcb|techcombank|tcb|mbbank|mb\\s+bank|mb|acb|bidv|agribank|tpbank|vpbank|sacombank|vietinbank|ctg|vib|ocb|shb|msb|hdbank|eximbank|scb|lienvietpostbank|lpbank|bac\\s*a\\s*bank|baoviet\\s*bank|pvcombank|kienlongbank|nam\\s*a\\s*bank|seabank|pg\\s*bank|saigonbank|shinhan(?:\\s*bank)?|woori(?:\\s*bank)?)';
const SO_STK = '(\\d[\\d\\s.\\-]{4,20}\\d|\\d{6,19})';
// Nhóm 1 = từ khoá, nhóm 2 = dãy số (STK_SAU); nhóm 1 = dãy số, nhóm 2 = từ khoá (STK_TRUOC)
const STK_SAU = new RegExp(`(?<![\\p{L}\\p{N}])(${TU_KHOA_TK})(?![\\p{L}\\p{N}])(?:\\s+[\\p{L}]+){0,3}\\s*[:#-]?\\s*${SO_STK}(?!\\d)`, 'giu');
const STK_TRUOC = new RegExp(`(?<!\\d)${SO_STK}\\s*[:#-]?\\s*(?<![\\p{L}\\p{N}])(${TU_KHOA_TK})(?![\\p{L}\\p{N}])`, 'giu');
// Mã HS viết có dấu chấm (8437.10.99) không bao giờ là số tài khoản
const RE_MA_HS_CHAM = /^\d{4}\.\d{2}\.\d{2}(?:\.\d{2})?$/;
// Ngữ cảnh nghiệp vụ hải quan ngay trước dãy số: tờ khai, mã HS, mã hàng...
// `(?:\s*tk)?` để nhìn qua được cụm `tk` xen giữa: `tờ khai tk <số>` vẫn được bảo vệ
const RE_NGHIEP_VU = /(?:tờ\s*khai|to\s*khai|mã\s*hs|ma\s*hs|hs\s*code|nhóm\s*hs|nhom\s*hs|mã\s*hàng|ma\s*hang)(?:\s*tk)?\s*[:#-]?\s*$/i;
// 'tk' đứng một mình là từ khoá yếu (còn là viết tắt của "tờ khai"), đòi >= 9 chữ số
const RE_TU_KHOA_YEU = /^tk$/i;

/** Mã HS có phải không? Dài 8 hoặc 10 số, không bắt đầu bằng `0`. */
export function looksLikeHs(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length !== 8 && d.length !== 10) return false;
  if (d.startsWith('0')) return false;
  const groups = String(raw).split(/[^\d]+/).filter(Boolean);
  if (groups.length > 1) {
    const shape = groups.map((g) => g.length).join('+');
    if (shape !== '4+2+2' && shape !== '4+2+2+2') return false;
  }
  return true;
}

const laSdtVn = (d, coMaHs) => {
  if ((d.length === 10 || d.length === 11) && d[0] === '0') return true;
  if (d.length === 11 && d.startsWith('84')) {
    if (coMaHs && !'35789'.includes(d[2])) return false;
    return true;
  }
  if (d.length === 12 && d.startsWith('84')) return !coMaHs;
  if (d.length === 13 && d.startsWith('0084')) return true;
  return false;
};

/** Tìm các khoảng span [từ, đến) là số điện thoại trong văn bản. */
export function timKhoangSdt(text) {
  const src = String(text ?? '').normalize('NFKC');
  const spans = [];
  const dich = new RegExp(`([${LOP_DAU}]+)`);
  for (const c of src.matchAll(CHAY_SO)) {
    const run = c[0];
    const goc = c.index;
    const nhom = [];
    let vi = 0;
    for (const phan of run.split(dich)) {
      if (phan === undefined) continue;
      if (/^\d+$/.test(phan)) nhom.push({ s: goc + vi, e: goc + vi + phan.length, d: phan });
      vi += phan.length;
    }
    for (let i = 0; i < nhom.length; i += 1) {
      for (let j = i; j < nhom.length; j += 1) {
        let d = '';
        for (let k = i; k <= j; k += 1) d += nhom[k].d;
        if (d.length > 13) break;
        const coMaHs = (d.length === 11 || d.length === 12) && d.startsWith('84')
          && looksLikeHs(nhom.slice(i, j + 1).map((g) => g.d).join('.'));
        if (laSdtVn(d, coMaHs)) {
          let start = nhom[i].s;
          if (start > 0 && src[start - 1] === '+' && src.startsWith('84', start)) start -= 1;
          spans.push([start, nhom[j].e]);
        }
      }
    }
  }
  return gopKhoang(spans);
}
function gopKhoang(spans) {
  const gop = [];
  for (const [s, e] of spans.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const cuoi = gop[gop.length - 1];
    if (cuoi && s <= cuoi[1]) cuoi[1] = Math.max(cuoi[1], e);
    else gop.push([s, e]);
  }
  return gop;
}

/** Che số điện thoại Việt Nam trong văn bản. */
export function cheSdt(text, mask = '***') {
  const src = String(text ?? '').normalize('NFKC');
  const spans = timKhoangSdt(src);
  if (!spans.length) return src;
  let ra = '';
  let cur = 0;
  for (const [s, e] of spans) {
    ra += src.slice(cur, s) + mask;
    cur = e;
  }
  return ra + src.slice(cur);
}

/** Tìm các khoảng span [từ, đến) là số tài khoản ngân hàng. */
export function timKhoangStk(text) {
  const src = String(text ?? '');
  const spans = [];
  for (const [re, min, sau] of [[STK_SAU, 6, true], [STK_TRUOC, 8, false]]) {
    for (const m of src.matchAll(re)) {
      const soRaw = sau ? m[2] : m[1];
      const tuKhoa = sau ? m[1] : m[2];
      // Mã HS viết có dấu chấm: không bao giờ che
      if (RE_MA_HS_CHAM.test(soRaw)) continue;
      // Ngữ cảnh nghiệp vụ hải quan ngay trước (cửa sổ 30 ký tự nhìn lui)
      if (RE_NGHIEP_VU.test(src.slice(Math.max(0, m.index - 30), m.index))) continue;
      // `tk` đứng một mình là từ khoá yếu: đòi >= 9 chữ số mới coi là STK
      const nguong = RE_TU_KHOA_YEU.test(tuKhoa) ? 9 : min;
      const soChuan = soRaw.replace(/\D/g, '');
      if (soChuan.length >= nguong && soChuan.length <= 19) {
        const idx = sau ? m.index + m[0].lastIndexOf(soRaw) : m.index;
        spans.push([idx, idx + soRaw.length]);
      }
    }
  }
  return gopKhoang(spans);
}

/** Che số tài khoản ngân hàng trong văn bản khi có ngữ cảnh từ khóa. */
export function cheSoTaiKhoan(text, mask = '***') {
  const src = String(text ?? '');
  const spans = timKhoangStk(src);
  if (!spans.length) return src;
  let ra = '';
  let cur = 0;
  for (const [s, e] of spans) {
    ra += src.slice(cur, s) + mask;
    cur = e;
  }
  return ra + src.slice(cur);
}

/** Che cả số điện thoại và số tài khoản ngân hàng. */
export function cheThongTinNhayCam(text, mask = '***') {
  return cheSoTaiKhoan(cheSdt(text, mask), mask);
}

/** Kiểm tra xem văn bản có chứa số điện thoại hoặc số tài khoản hay không. */
export function chuaThongTinNhayCam(text) {
  const src = String(text ?? '');
  if (timKhoangSdt(src).length > 0) return true;
  if (timKhoangStk(src).length > 0) return true;
  return false;
}

/** Chuẩn hoá một token số học (thập phân, phần trăm, phân số, mã HS) về dạng giá trị so sánh. */
export function chuanHoaGiaTriSo(raw) {
  const s = String(raw ?? '').trim();
  // 1. Phân số (vd: 8/10)
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (frac) {
    return { raw: s, value: null, isFraction: true, normalized: `${frac[1]}/${frac[2]}` };
  }
  // 2. Mã HS 8 số (vd: 8413.70.90 hoặc 84137090)
  const hs = /^(\d{4})[.\s]?(\d{2})[.\s]?(\d{2})$/.exec(s);
  if (hs && !s.includes('%')) {
    return { raw: s, value: Number(`${hs[1]}${hs[2]}${hs[3]}`), isHs: true, normalized: `${hs[1]}${hs[2]}${hs[3]}` };
  }
  // 3. Số có phần trăm (vd: 2.5%, 2,5%, 25%)
  const isPercent = s.endsWith('%');
  const cleanNum = (isPercent ? s.slice(0, -1) : s).trim().replace(',', '.');
  const val = Number(cleanNum);
  if (Number.isFinite(val)) {
    return {
      raw: s,
      value: val,
      isPercent,
      normalized: isPercent ? `${val}%` : String(val),
    };
  }
  return { raw: s, value: null, normalized: s };
}

/** Trích xuất toàn bộ các số theo giá trị từ văn bản. */
export function trichXuatCacSo(text) {
  const src = String(text ?? '');
  const out = [];
  // Regex bắt mã HS, phân số, hoặc số thực có/không có phần trăm, dấu phẩy/chấm
  const re = /(\d{4}[.\s]\d{2}[.\s]\d{2}|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?\s*%|\d{1,3}(?:[.,]\d{3})+(?!\d)|\d+(?:[.,]\d+)?)/g;
  for (const m of src.match(re) ?? []) {
    const raw = m.trim();
    // Bỏ qua dấu phân cách nghìn trong số nguyên (vd: 1.000.000 hoặc 1,000,000)
    if (/^\d{1,3}(?:[.,]\d{3})+$/.test(raw)) {
      const soNguyen = raw.replace(/[.,]/g, '');
      out.push({ raw, value: Number(soNguyen), isPercent: false, normalized: String(Number(soNguyen)) });
      continue;
    }
    const token = chuanHoaGiaTriSo(raw);
    if (token) out.push(token);
  }
  return out;
}

/**
 * Kiểm tra mọi số trong chuỗi đích có xuất hiện trong chuỗi nguồn theo giá trị số học hay không.
 * Phân biệt chính xác giữa 2.5% và 25%, chuẩn hoá 2,5% == 2.5%.
 * @param {string} chuoiCanKiem
 * @param {string} chuoiNguon
 * @returns {{ hopLe: boolean, viPham: string[] }}
 */
export function kiemSoTheoGiaTri(chuoiCanKiem, chuoiNguon) {
  const danhSachKiem = trichXuatCacSo(chuoiCanKiem);
  const danhSachNguon = trichXuatCacSo(chuoiNguon);

  const tapNguon = new Set(danhSachNguon.map((item) => item.normalized));
  const viPham = [];

  for (const item of danhSachKiem) {
    if (!tapNguon.has(item.normalized)) {
      // Thử so khớp giá trị số học tương đương nếu cả hai cùng là số thực
      let khopGiaTri = false;
      if (item.value != null) {
        for (const ng of danhSachNguon) {
          if (ng.value != null && ng.isPercent === item.isPercent && Math.abs(ng.value - item.value) < 1e-9) {
            khopGiaTri = true;
            break;
          }
        }
      }
      if (!khopGiaTri) {
        viPham.push(item.raw);
      }
    }
  }

  return {
    hopLe: viPham.length === 0,
    viPham,
  };
}
