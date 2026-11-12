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

/**
 * Mã ISO-3166 alpha-2 bot BIẾT NÓI TÊN (OZV-430 điểm 1). Đây là cửa dữ liệu: mã nào không có
 * trong đây thì KHÔNG được coi là nước.
 *
 * Trước đây `countryCode` chỉ kiểm HÌNH ("hai chữ cái") nên mọi viết tắt khách gõ trong ô
 * "Xuất xứ:" đều lọt thành mã nước và đi thẳng tới Cổng OZ: "SX tại TQ" → `SX`, "QC tại VN" →
 * `QC`, "hàng CE" → `CE`, và cả "TQ" → `TQ` (TQ không có trong ISO-3166; Cổng không khớp dòng FTA
 * nào nên ưu đãi C/O mẫu E rụng, khách đọc mức thuế cao hơn thật — Điều III). Mã này còn đi vào
 * `sinh_mo_ta_khai_bao`, tức in lên MÔ TẢ KHAI BÁO khách dán vào chỉ tiêu 1.78 tờ khai (Điều VIII).
 *
 * Dùng lại cách của repo `hs-code-api` (`scripts/import-oz-declarations.mjs:87` `mapOriginToIso2`):
 * tra từ điển tên nước trước, rồi mới chấp mã 2 chữ — và chỉ chấp mã trong danh sách.
 * Danh sách = đúng những mã `tenNuoc` nói được tên tiếng Việt, cộng các nước bạn hàng hay gặp.
 */
const MA_NUOC_BIET = new Set(['CN', 'JP', 'KR', 'TW', 'TH', 'US', 'DE', 'IN', 'VN', 'MY', 'ID',
  'SG', 'PH', 'KH', 'LA', 'MM', 'HK', 'MO', 'AU', 'NZ', 'CA', 'MX', 'BR', 'RU', 'TR',
  'GB', 'FR', 'IT', 'ES', 'NL', 'BE', 'CH', 'AT', 'SE', 'NO', 'DK', 'FI', 'PL', 'CZ', 'IE', 'PT',
  'AE', 'SA', 'IL', 'EG', 'ZA', 'BD', 'PK', 'LK', 'CL', 'AR', 'PE', 'UA', 'HU', 'RO', 'GR']);

/** Mã 2 chữ có phải nước bot biết không? Đây là cửa duy nhất quyết định "mã này là nước". */
export const laMaNuoc = (ma) => MA_NUOC_BIET.has(String(ma || '').toUpperCase());

export function countryCode(s) {
  const t = String(s || '').trim();
  // Ô chỉ có hai chữ cái: là NƯỚC khi mã đó có thật. "MY" phải giữ nghĩa Malaysia — nếu tra từ
  // điển trước thì `norm` đưa "MY" về "my" và từ điển đọc thành "Mỹ" ⇒ US, sai hẳn nước.
  if (/^[A-Za-z]{2}$/.test(t) && laMaNuoc(t)) return t.toUpperCase();
  // Tên nước (có dấu hay không) và viết tắt tiếng Việt: "TQ" không phải mã ISO nên tới đây, và
  // phải ra CN chứ không ra mã "TQ". "Mỹ" có dấu cũng về đây (không khớp hình hai chữ cái).
  const n = norm(t).replace(/^(xuat xu|xx|origin)\s*/, '');
  if (NUOC[n]) return NUOC[n];
  if (/^[A-Za-z]{2}$/.test(t)) return null;
  // Chữ kèm trong ô ("SX tại TQ", "QC tại VN", "made in JP"): quét cả câu, lấy mã NƯỚC THẬT đầu
  // tiên — không lấy chữ viết tắt đứng đầu chỉ vì nó có hai chữ cái.
  // Chỉ quét mã IN HOA, như mã gốc vẫn làm: chữ thường hai ký tự là từ trong câu, không phải mã
  // ("made in JP" mà quét cả chữ thường thì "in" thành Ấn Độ và đè mất JP).
  for (const m of t.matchAll(/(?:^|[^A-Za-z])([A-Z]{2})(?=$|[^A-Za-z])/g)) {
    if (laMaNuoc(m[1])) return m[1];
  }
  // Còn lại để `findCountryInText` đọc tên nước/viết tắt tiếng Việt trong câu ("SX tại TQ" ⇒ CN).
  return findCountryInText(t);
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

/**
 * Chữ của HỒ SƠ MẠCH (#170) để quét xuất xứ: nước khách nêu ở lượt TRƯỚC phải còn giá trị ở lượt
 * sau. Thiếu nguồn này thì khách nói "máy sấy sinh tố hàng Nhật" rồi đáp "350W 220V" là bot tra
 * thuế theo CN và báo "giả định xuất xứ Trung Quốc" — in mức thuế của một nước khách KHÔNG nói,
 * trong khi khách đã nói nước khác (điểm 5 người soát PR #203 nêu; chạm Điều III và Điều VIII).
 *
 * Hồ sơ không có ô "xuất xứ" riêng, nên nước nằm trong `moTa` / các câu khách nói thêm (`sua`).
 * Trả về chuỗi tự do — chỉ quét bằng `findCountryInText`, KHÔNG dùng `countryCode` (xem ghi chú
 * của `xuatXuCua`: mô tả "van bi DN25 PN16 CF8M" sẽ bị đọc thành mã nước).
 * @param {object|null} hoSo
 * @returns {string} chuỗi rỗng khi không có gì để quét
 */
export function chuHoSoChoXuatXu(hoSo) {
  const h = hoSo && typeof hoSo === 'object' ? hoSo : {};
  return [h.moTa, h.congDung, h.chuAnh, ...(Array.isArray(h.sua) ? h.sua : [])]
    .map((x) => String(x || '').trim()).filter(Boolean).join(' ');
}
