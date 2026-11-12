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
 * ISO-3166-1 alpha-2 — 249 mã nước/vùng lãnh thổ được gán chính thức (OZV-430 điểm 1).
 *
 * Đây là cửa dữ liệu của ô "Xuất xứ": mã ngoài bảng này KHÔNG được coi là nước. Trước đây
 * `countryCode` chỉ kiểm HÌNH ("hai chữ cái") nên mọi viết tắt khách gõ đều lọt thành mã nước và
 * đi thẳng tới Cổng OZ: "SX tại TQ" → `SX`, "QC tại VN" → `QC`, "hàng CE" → `CE`, "TQ" → `TQ`.
 * Hậu quả: Cổng không khớp dòng FTA nào nên ưu đãi C/O mẫu E rụng, khách đọc mức thuế cao hơn
 * thật (Điều III); mã này còn đi vào `sinh_mo_ta_khai_bao`, tức in lên MÔ TẢ KHAI BÁO khách dán
 * vào chỉ tiêu 1.78 tờ khai (Điều VIII).
 *
 * VÌ SAO LÀ BẢNG ĐẦY ĐỦ, KHÔNG PHẢI DANH SÁCH BẠN HÀNG QUEN (bài học soát PR #214):
 * bản vá đầu dùng 56 mã viết tay nên bác bỏ 12 nước CÓ FTA với Việt Nam — `SK SI BG HR LT LV EE
 * LU MT CY` (EVFTA), `BN` (ATIGA + CPTPP), `IS`. Khách khai Slovakia thì `countryCode` trả `null`,
 * `xuatXuCua` rơi về `XUAT_XU_MAC_DINH = 'CN'` ⇒ bot tra thuế TRUNG QUỐC và còn nói "giả định".
 * Nặng hơn bệnh đang chữa: sai sang một nước CÓ THẬT, có FTA khác, nên Cổng trả về con số trông
 * như thật. Danh sách cho phép viết tay luôn hỏng ở chỗ "có thật mà ngoài danh sách".
 *
 * Bảng này KHÔNG gồm mã dành riêng/đặc biệt (`EU` `UK` `UN` `XK` `ZZ` `QO` `AC` `TA` `IC` `EA`…)
 * và mã đã xoá (`SU` `YU` `AN` `CS`…) — chỉ 249 mã đang được gán. Dùng `Intl.DisplayNames` sinh
 * ra bảng thì lẫn hết nhóm trên, nên bảng nằm thẳng trong mã nguồn; test `xuat-xu-ma-nuoc` đếm
 * đúng 249 và đối chiếu lại với `Intl.DisplayNames` để bảng không trôi.
 */
const MA_ISO2 = new Set(['AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ',
  'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ',
  'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR',
  'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY',
  'HK', 'HM', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT',
  'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ',
  'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY',
  'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ',
  'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM',
  'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA',
  'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ',
  'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ',
  'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW']);

/** Mã 2 chữ có phải mã nước ISO-3166-1 alpha-2 không? */
export const laMaIso2 = (ma) => MA_ISO2.has(String(ma || '').toUpperCase());

/**
 * Mã ISO THẬT nhưng khi nó chỉ là một chữ LẪN trong câu thì gần như luôn là viết tắt kỹ
 * thuật/tiếng Việt, không phải nước khách khai. Chỉ dùng cho ngữ cảnh 2 (quét mã trong câu) —
 * khách gõ riêng đúng một mã vào ô "Xuất xứ" thì vẫn đọc là nước, vì lúc đó khách CỐ Ý khai mã.
 *
 *   SX  "sản xuất" (Sint Maarten)      IN  giới từ "in"/"in ấn" — "made in JP" phải ra JP, không ra Ấn Độ
 *   CO  chứng nhận xuất xứ C/O (Colombia)   CF  thép đúc CF8M (Trung Phi)
 *   PN  áp lực danh nghĩa PN16 (Pitcairn)   SS  inox SS304 (Nam Sudan)       GI  tôn GI (Gibraltar)
 *
 * CỐ Ý không chặn `KH` `MM` `KG` `MT` `PE` `CM` `ML` `KW` dù cũng trùng đơn vị/viết tắt: đó là
 * bạn hàng thật của khách (Campuchia, Myanmar, Kyrgyzstan, Malta, Peru…), chặn đi là lặp lại
 * đúng lỗi "bác bỏ nước thật" mà vòng soát PR #214 đã chặn. Mã dính liền chữ số (`PN16`, `DN25`,
 * `CF8M`) đã bị rào bằng hình ở `maNuocTrongCau`, không cần ghi tên vào đây.
 */
const VIET_TAT_KHONG_PHAI_NUOC = new Set(['SX', 'IN', 'CO', 'CF', 'PN', 'SS', 'GI']);

/** Từ dẫn xuất xứ: mã nước đứng NGAY SAU một trong các chữ này là nước khách khai. */
const DAN_XUAT_XU = new Set(['in', 'tai', 'tu', 'from', 'origin', 'xu', 'nuoc', 'hang', 'made', 'o', 'cua']);

/** Bỏ nhãn ô xuất xứ ở đầu giá trị ("Xuất xứ: SK", "origin: HR", "xx TQ") để còn lại phần khách khai. */
const boNhanXuatXu = (n) => n.replace(/^(xuat xu|xuatxu|xx|origin|nuoc)\s*[:\-]?\s*/, '');

/**
 * Mã nước LẪN giữa chữ khác trong ô ("SX tại SK", "made in BN", "van bi DN25 PN16 CF8M").
 *
 * Đây là ngữ cảnh NGUY HIỂM: mã nước trùng hàng loạt viết tắt kỹ thuật, nên không thể chấp cả
 * bảng ISO như ô khai riêng một mã (`SX` là Sint Maarten, `CF` Trung Phi, `PN` Pitcairn — chấp
 * hết thì rác mục tiêu của chính thẻ này lọt lại). Ba rào, theo thứ tự:
 *
 *   1. HÌNH — mã dính liền chữ số không phải nước: `PN16`, `DN25`, `CF8M`, `SS304` (rào này không
 *      cần danh sách tên nào, nên không bị trôi khi khách gõ ký hiệu kỹ thuật mới).
 *   2. TÊN — bỏ nhóm trùng viết tắt tiếng Việt/kỹ thuật (`VIET_TAT_KHONG_PHAI_NUOC`).
 *   3. VỊ TRÍ — chỉ nhận mã đứng ngay sau từ dẫn xuất xứ ("tại SK", "made in BN", "từ BG") hoặc
 *      đứng cuối ô ("nước MT"). Mã nằm lửng giữa câu không phải khai xuất xứ.
 *
 * Chỉ quét mã IN HOA, như mã gốc trên `main` vẫn làm: cặp chữ thường hai ký tự là từ trong câu.
 * @returns {string|null}
 */
export function maNuocTrongCau(s) {
  const t = String(s || '');
  for (const m of t.matchAll(/(?:^|[^A-Za-z0-9])([A-Z]{2})(?![A-Za-z0-9])/g)) {
    const ma = m[1];
    if (!laMaIso2(ma) || VIET_TAT_KHONG_PHAI_NUOC.has(ma)) continue;
    const truoc = norm(t.slice(0, m.index + m[0].length - 2)).replace(/[^a-z0-9 ]/g, ' ').trim().split(' ').pop();
    const laCuoi = t.slice(m.index + m[0].length).replace(/[^A-Za-z0-9]/g, '') === '';
    if (DAN_XUAT_XU.has(truoc) || laCuoi) return ma;
  }
  return null;
}

/**
 * Đọc giá trị ô "Xuất xứ:" (ô CÓ NHÃN — khách cố ý khai nước) thành mã ISO-2.
 *
 * Hai ngữ cảnh, hai luật — gộp làm một là gốc lỗi chặn của PR #214:
 *   1. Ô chỉ có đúng một mã 2 chữ ("SK", "BN", "Xuất xứ: MT"): khách CỐ Ý khai mã nước ⇒ chấp
 *      BẢNG ISO ĐẦY ĐỦ. Không ai gõ riêng một mã "SX" vào ô Xuất xứ để nói "sản xuất".
 *   2. Mã lẫn giữa chữ khác ⇒ `maNuocTrongCau` với ba rào hình/tên/vị trí.
 *
 * Dùng lại cách của repo `hs-code-api` (`scripts/import-oz-declarations.mjs:87` `mapOriginToIso2`):
 * tra từ điển tên nước rồi mới chấp mã 2 chữ.
 */
export function countryCode(s) {
  const t = String(s || '').trim();
  const nGoc = boNhanXuatXu(norm(t));
  // Ngữ cảnh 1 — ô khai riêng một mã. Xét TRƯỚC từ điển tên nước: tra từ điển trước thì `norm`
  // đưa "MY" về "my" và từ điển đọc thành "Mỹ" ⇒ US, sai hẳn nước (Malaysia thành Hoa Kỳ).
  if (/^[a-z]{2}$/.test(nGoc) && laMaIso2(nGoc)) return nGoc.toUpperCase();
  // Tên nước (có dấu hay không) và viết tắt tiếng Việt: "TQ" không phải mã ISO nên tới đây, và
  // phải ra CN chứ không ra mã "TQ". "Mỹ" có dấu cũng về đây (không khớp hình hai chữ cái).
  if (NUOC[nGoc]) return NUOC[nGoc];
  if (/^[A-Za-z]{2}$/.test(nGoc)) return null;
  // Ngữ cảnh 2 — mã lẫn trong câu.
  const trongCau = maNuocTrongCau(t);
  if (trongCau) return trongCau;
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
