// packs/hs/input.js — đọc thông tin người dùng gõ trên Zalo thành các trường có tên.
// Hỗ trợ cả dạng có nhãn ("Mã HS: 84137090", "Tên hàng = máy bơm") lẫn gõ tự do.

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();

/** Gộp khoảng trắng + cắt đầu/cuối (giữ nguyên dấu). Dùng chung cho lớp nhận dạng và lớp hồ sơ. */
export const dai = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// Chữ khách hay gõ vào ô "thương hiệu" nhưng KHÔNG phải nhãn hiệu (issue #169): gửi đi kiểm sở hữu trí tuệ
// thì Cổng trả đèn ĐỎ sai (có doanh nghiệp đăng ký đúng chữ "OEM") và trừ điểm vô ích.
const NHAN_CHUNG = new Set(['oem', 'odm', 'no brand', 'nobrand', 'no-brand', 'noname', 'no name',
  'khong nhan hieu', 'khong co nhan hieu', 'khong hieu', 'khong co nhan', 'khong nhan', 'generic', 'n/a', 'none']);

// Cụm tình trạng/nhãn dán khách gõ kèm trong cùng ô ("OEM, mới 100%", "hiệu oem") — bóc ra trước khi so,
// nếu không thì "OEM, mới 100%" vẫn bị gửi đi kiểm như nhãn thật và trừ điểm (soát #169 [S6]).
const BO_KEM = /\b(?:hang\s+)?(?:moi|cu|nguyen\s+seal|nguyen\s+hop)\b|\b\d{1,3}\s?%|\bmoi\b/g;
const NHAN_O = /^(thuong hieu|thuong hieu la|nhan hieu|nhan|hieu|brand|thuonghieu)\s+/;

/** Giá trị ô thương hiệu là từ chung chung, không phải một nhãn hiệu cụ thể? */
export function laNhanChung(s) {
  const n = norm(String(s || '').replace(/["'()[\].,;:!?/\\]/g, ' '));
  if (n === '') return false;
  if (NHAN_CHUNG.has(n)) return true;
  // "n/a" mất dấu "/" ở bước trên nên so riêng trước khi bóc cụm tình trạng.
  const goc = norm(String(s || '').replace(/["'()[\].,;:!?]/g, ' '));
  if (NHAN_CHUNG.has(goc)) return true;
  const loi = norm(n.replace(NHAN_O, '').replace(BO_KEM, ' ').replace(/\s[-–—]\s/g, ' '));
  return loi !== '' && NHAN_CHUNG.has(loi);
}

export const HS8 = /(?<!\d)(\d{4})[.\s]?(\d{2})[.\s]?(\d{2})(?!\d)/;
export const HS_ANY = /(?<!\d)\d{4}(?:[.\s]?\d{2}){0,2}(?!\d)/g;
// Số hiệu văn bản: 57/2022/NĐ-CP, 38/2015/TT-BTC, 1810/TB-TCHQ, 121/2025/TT-BTC
export const SO_HIEU = /\b\d{1,5}\/(?:\d{4}\/)?[A-ZĐa-zđ]{1,6}(?:-[A-ZĐa-zđ]{1,10}){0,3}\b/g;

/** Mã HS 8 số đầu tiên trong chuỗi (bỏ dấu chấm/cách). */
export function firstHs8(s) {
  const m = String(s || '').match(HS8);
  return m ? m[1] + m[2] + m[3] : null;
}

export function allHs8(s) {
  const out = [];
  const re = new RegExp(HS8.source, 'g');
  let m;
  while ((m = re.exec(String(s || '')))) out.push(m[1] + m[2] + m[3]);
  return out;
}

export function soHieuList(s) {
  return [...new Set((String(s || '').match(SO_HIEU) || []).map((x) => x.replace(/\s/g, '')))]
    .filter((x) => /[A-Za-zĐđ]/.test(x));
}

/**
 * fields: [{ key, nhan: ['mã hs', 'hs'] }] → { values: {key: str}, conLai: 'chữ không có nhãn' }
 * Nhận dòng "nhãn: giá trị" / "nhãn = giá trị" / "nhãn - giá trị".
 */
export function parseLabeled(text, fields) {
  const values = {};
  const rest = [];
  const aliases = [];
  for (const f of fields) for (const a of [f.key, ...(f.nhan || [])]) aliases.push([norm(a), f.key]);
  aliases.sort((a, b) => b[0].length - a[0].length);

  for (const rawLine of String(text || '').split(/\r?\n|;(?=\s*[^\d])/)) {
    const line = rawLine.trim().replace(/^[-•*+]\s*/, '');
    if (!line) continue;
    const m = line.match(/^([^:=]{1,40}?)\s*[:=]\s*(.+)$/);
    let hit = null;
    if (m) {
      const label = norm(m[1]);
      hit = aliases.find(([a]) => label === a || label.startsWith(`${a} `) || label.endsWith(` ${a}`));
      if (hit && !(hit[1] in values)) { values[hit[1]] = m[2].trim(); continue; }
    }
    rest.push(line);
  }
  return { values, conLai: rest.join('\n').trim() };
}

/** Mã nước 2 chữ in hoa đứng riêng (CN, JP, KR…) hoặc tên nước thường gặp. */
const NUOC = { 'trung quoc': 'CN', tq: 'CN', china: 'CN', 'nhat ban': 'JP', nhat: 'JP', 'han quoc': 'KR', han: 'KR',
  'dai loan': 'TW', 'thai lan': 'TH', 'my': 'US', 'hoa ky': 'US', duc: 'DE', 'an do': 'IN', 'viet nam': 'VN', 'malaysia': 'MY', 'indonesia': 'ID' };

export function countryCode(s) {
  const t = String(s || '').trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  const n = norm(t).replace(/^(xuat xu|xx|origin)\s*/, '');
  if (NUOC[n]) return NUOC[n];
  const m = t.match(/(?:^|\s)([A-Z]{2})(?:\s|$)/);
  return m ? m[1] : null;
}

export function findCountryInText(s) {
  const n = norm(s);
  for (const [k, v] of Object.entries(NUOC)) if (new RegExp(`(^|\\s)(xuat xu |tu |hang )?${k}(\\s|$|,)`).test(n)) return v;
  const m = String(s || '').match(/(?:^|\s)(CN|JP|KR|TW|TH|US|DE|IN|MY|ID|VN)(?=\s|$|,)/);
  return m ? m[1] : null;
}

/** Nước mặc định khi khách chưa nói — chỉ dùng kèm cờ `giaDinh` của `xuatXuCua`. */
export const XUAT_XU_MAC_DINH = 'CN';
/** Tên tiếng Việt của mã nước (để nói với khách), không có thì trả lại chính mã. */
export const tenNuoc = (ma) => {
  const m = String(ma || '').toUpperCase();
  const hoa = { CN: 'Trung Quốc', JP: 'Nhật Bản', KR: 'Hàn Quốc', TW: 'Đài Loan', TH: 'Thái Lan',
    US: 'Hoa Kỳ', DE: 'Đức', IN: 'Ấn Độ', VN: 'Việt Nam', MY: 'Malaysia', ID: 'Indonesia' };
  return hoa[m] || m;
};

/**
 * Xuất xứ của một lượt + CÓ PHẢI GIẢ ĐỊNH KHÔNG (issue #177, yêu cầu 3).
 *
 * Trước đây mỗi chỗ gọi tự viết `findCountryInText(...) || 'CN'` rồi in thẳng "xuất xứ CN" ra tin
 * khách. Khách chưa hề nói nước nào mà tin lại nói như đã biết — chạm Điều VIII (trung thực) và,
 * vì mức MFN/ACFTA in ra phụ thuộc nước, chạm cả Điều III (số tiền phải có căn cứ trong lượt).
 *
 * Hàm này là ĐÚNG MỘT chỗ quyết định: trả cả mã nước để gọi Cổng (vẫn phải có một nước, Cổng đòi)
 * và cờ `giaDinh` để lớp dựng chữ nói rõ đó là giả định. Bỏ cờ đi là lại nói dối khách.
 *
 * Mỗi nguồn là một chuỗi tự do (quét bằng `findCountryInText`) hoặc `{ nhan: '<giá trị ô Xuất xứ>' }`
 * cho ô đã có nhãn (quét bằng `countryCode`, chấp cả mã trơ "JP"). KHÔNG chạy `countryCode` trên
 * chuỗi tự do: nhánh dự phòng của nó bắt mọi cặp chữ in hoa đứng riêng, nên mô tả hàng kiểu
 * "van bi DN25 PN16 CF8M" sẽ bị đọc thành một mã nước.
 *
 * @param {...(string|{nhan?: string})} nguon Theo thứ tự ưu tiên.
 * @returns {{ ma: string, giaDinh: boolean }}
 */
export function xuatXuCua(...nguon) {
  for (const n of nguon) {
    const laNhan = n && typeof n === 'object';
    const s = laNhan ? n.nhan : n;
    if (!dai(s)) continue;
    const ma = laNhan ? (countryCode(s) || findCountryInText(s)) : findCountryInText(s);
    if (ma) return { ma, giaDinh: false };
  }
  return { ma: XUAT_XU_MAC_DINH, giaDinh: true };
}
