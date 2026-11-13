// packs/hs/input.js — đọc thông tin người dùng gõ trên Zalo thành các trường có tên.
// Hỗ trợ cả dạng có nhãn ("Mã HS: 84137090", "Tên hàng = máy bơm") lẫn gõ tự do.

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();

/** Gộp khoảng trắng + cắt đầu/cuối (giữ nguyên dấu). Dùng chung cho lớp nhận dạng và lớp hồ sơ. */
export const dai = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/**
 * Chuỗi có chữ mang DẤU tiếng Việt (hoặc "đ") không?
 *
 * Dùng làm rào cho ô "Xuất xứ": mã ISO-3166 không bao giờ có dấu, nên chữ có dấu không thể là mã
 * — `"Mỹ"` là Hoa Kỳ, không phải `MY` (Malaysia). Xem `countryCode`.
 *
 * So trên dạng NFD (dấu tách rời) để bắt cả chữ Zalo/iOS gửi ở dạng tách dấu: `"Mỹ"` dạng NFC là
 * một ký tự, dạng NFD là "M" + "y" + dấu ngã rời — cả hai đều phải tính là CÓ DẤU.
 */
export const coDau = (s) => /[̀-ͯ]|[đĐ]/.test(String(s || '').normalize('NFD'));

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
/**
 * Tên nước/viết tắt tiếng Việt → mã ISO-2. Khoá là bản ĐÃ RỤNG DẤU (so bằng `norm`).
 *
 * Xuất ra để test neo được "mọi khoá đều có ca, cả bản có dấu": lỗ đó làm `"Mỹ"` lọt thành `MY`
 * (Malaysia) qua hai vòng soát PR #214 — xem `test/xuat-xu-ma-nuoc.test.mjs`.
 */
export const NUOC = { 'trung quoc': 'CN', tq: 'CN', china: 'CN', 'nhat ban': 'JP', nhat: 'JP', 'han quoc': 'KR', han: 'KR',
  'dai loan': 'TW', 'thai lan': 'TH', 'my': 'US', 'hoa ky': 'US', duc: 'DE', 'an do': 'IN', 'viet nam': 'VN', 'malaysia': 'MY',
  'indonesia': 'ID', 'vuong quoc anh': 'GB', 'hong kong': 'HK' };

/**
 * Cách ghi mà khách hay dùng ở ô "Xuất xứ:" nhưng Cổng OZ KHÔNG so như vậy.
 *
 * CHỈ áp ở ô CÓ NHÃN — tức chỗ khách CỐ Ý khai đúng một mã/tên nước (`countryCode`), KHÔNG áp
 * khi quét trong câu tự do: "anh" trong "anh gửi hàng" là đại từ, "UK" trong "size UK 10" là
 * kích cỡ áo. Bảng này tách riêng khỏi `NUOC` (từ điển tên nước) chính vì vậy.
 *
 *   UK  → GB : Cổng so ISO alpha-2 — `hs-code-api/data/iso-3166-vn.json:16` (`GB`/Vương quốc Anh)
 *             và `hs-code-api/lib/fta.js:43` (UKVFTA.thanhVien = ['VN','GB']). "UK" không phải mã
 *             nước nào: gửi "UK" thì Cổng báo mã quốc gia không có trong danh mục ISO, không khớp ưu đãi.
 *   ANH → GB : "Anh" là Vương quốc Anh; cùng hình với tên chính thức trong danh mục Cổng.
 *
 * KHÔNG map — vòng soát 4 giám đốc chặn hai alias cũ `XK → HK` và `VD → VN`:
 *   - "XK" không phải nước: ở Cổng OZ nó là BIỂU THUẾ XUẤT KHẨU (`hs-code-api/lib/customs-types.js:20`
 *     chiều xuất khẩu; `hs-code-api/data/bieu-thue/README.md` sheet `XK` = "Biểu thuế xuất khẩu",
 *     `EV-XK`/`UKV-XK`/`CPTPP-XK` = "Biểu XK ưu đãi theo hiệp định"). Hồng Kông là `HK`
 *     (`hs-code-api/data/iso-3166-vn.json:18`) và không thuộc FTA nào (`hs-code-api/lib/fta.js:30-48`)
 *     ⇒ `XK → HK` không đổi mức thuế, chỉ khai một nước khách chưa nói.
 *   - "VD" không có trong danh mục Cổng (`grep '"VD"'` toàn repo `hs-code-api` không ra) và không
 *     phải mã ISO ⇒ `VD → VN` là bịa nước.
 *   Cả hai rơi về giả định có nói của `xuatXuCua` (`{ ma: XUAT_XU_MAC_DINH, giaDinh: true }`) —
 *   bot vẫn tra được nhưng nói rõ là giả định, không bịa nước (Điều VIII).
 */
export const ALIAS = { UK: 'GB', ANH: 'GB' };

/**
 * Khoá của `NUOC` nhóm theo SỐ TỪ rồi giữ đúng thứ tự khai báo (vòng soát 8 PR #214).
 *
 * `findCountryInText` quét THEO ƯU TIÊN KHOÁ — duyệt từng khoá (nhóm 3 từ → 2 từ → 1 từ) trên
 * MỌI vị trí — chứ không quét theo vị trí trái→phải. Quét theo vị trí thì một từ đơn va chạm
 * đứng trước nuốt tên nước 1 từ đứng sau: "máy hàn Nhật" dừng ở "hàn" (Hàn Quốc ⇒ KR) nên
 * không bao giờ tới "nhật" (⇒ JP); "mỹ phẩm Hàn" dừng ở "mỹ" (⇒ US) nên không tới "hàn" (⇒ KR).
 * main `50907f2` ra đúng cả nhóm ca này vì nó duyệt `NUOC` theo thứ tự khoá — khoá "han"/"nhat"
 * khai báo TRƯỚC khoá "my" nên thắng ở mọi vị trí. Bộ này đưa luật đó về tường minh để test neo.
 */
export const NHOM_KHOA = (() => {
  const g = { 1: [], 2: [], 3: [] };
  for (const k of Object.keys(NUOC)) { const n = k.split(' ').length; if (g[n]) g[n].push(k); }
  return g;
})();

/**
 * Alias dùng được TRONG CÂU TỰ DO (vòng soát 8 PR #214) — ngược với `ALIAS` chỉ dùng ở ô có nhãn.
 *
 * Chỉ có `UK`: "made in UK" là khách nói Vương quốc Anh mà không viết mã Cổng (`GB`), không đọc
 * được thì rơi về giả định CN — còn main gửi mã rác `UK` ra Cổng, Cổng không khớp ưu đãi nào.
 *
 * KHÔNG áp `ANH` ở đây: "anh" là ĐẠI TỪ ("anh gửi hàng", "cảm ơn anh") — đọc thành Vương quốc Anh
 * là bịa nước. UK an toàn hơn vì "UK" thường không phải từ tiếng Việt.
 */
export const ALIAS_TRONG_CAU = { UK: 'GB' };

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
export const VIET_TAT_KHONG_PHAI_NUOC = new Set(['SX', 'IN', 'CO', 'CF', 'PN', 'SS', 'GI']);

/**
 * TỪ DẪN XUẤT XỨ — mã nước đứng NGAY SAU một trong các từ này là nước khách khai.
 *
 * Tách làm HAI TẦNG vì "so trên chuỗi đã rụng dấu" làm từ dẫn trùng DANH TỪ HÀNG (OZV-535
 * nhóm 2): `"ổ"`→`o`, `"tủ"`→`tu`, `"cửa"`→`cua` — rụng dấu xong trùng đúng từ dẫn, nên
 * `"ổ BI"` / `"tủ BT"` / `"cửa AL"` bị đọc thành nước. Tầng "giữ dấu" loại được ba ca đó.
 *
 *   TẦNG 1 — tiếng Anh (`DAN_XUAT_XU_EN`): so trên chuỗi đã rụng dấu, không trùng danh từ hàng.
 *   TẦNG 2 — tiếng Việt (`DAN_XUAT_XU_VN`): so trên chuỗi GIỮ DẤU, nên "tủ" ≠ "từ",
 *     "ổ" ≠ "ở", "cửa" ≠ "của". Bản KHÔNG dấu chỉ nhận ở `DAN_XUAT_XU_ASCII` (chỉ "hang").
 *   TẦNG 3 — từ dẫn YẾU (`DAN_XUAT_XU_VN_YEU` = "nước"): "nước" vừa là từ dẫn ("nước GB",
 *     "hàng nước GB") vừa là DANH TỪ HÀNG cực phổ biến ("máy lọc nước", "nước RO" = nước
 *     thấm ngược) — nên chỉ được nhận khi đứng ở ĐẦU giá trị ("nước GB") hoặc sau một từ dẫn
 *     khác ("hàng nước GB"); đứng sau danh từ hàng thì không được nhận ("máy lọc nước RO").
 */
const DAN_XUAT_XU_EN = new Set(['made', 'in', 'from', 'origin', 'xu']);
const DAN_XUAT_XU_VN = new Set(['tại', 'từ', 'ở', 'của', 'hàng']);
const DAN_XUAT_XU_ASCII = new Set(['hang']);
/**
 * Từ dẫn YẾU — có "nước" (giữ dấu) và "nuoc" (KHÔNG dấu).
 *
 * Khách gõ tiếng Việt không dấu trên Zalo là chuyện thường: "hàng nuoc UK" mà không nhận
 * "nuoc" là MẤT nước ⇒ bot rơi về giả định Trung Quốc + báo "giả định Trung Quốc" (Điều III).
 * `nuoc` nhận đúng luật của "nước": đứng đầu giá trị ("nuoc GB") hoặc sau một từ dẫn khác
 * ("hàng nuoc GB"); đứng sau danh từ hàng thì không ("may loc nuoc RO").
 */
const DAN_XUAT_XU_VN_YEU = new Set(['nước', 'nuoc']);
/**
 * Bản KHÔNG DẤU của từ dẫn tiếng Việt mà KHÔNG được đứng đầu câu ("tu BT" = "tủ BT"!)
 * và KHÔNG được đứng ngay sau MÃ/SỐ ("85371099 tu BT" = mã HS + "tủ BT", KHÔNG phải
 * "từ Belarus").
 *
 * Chỉ nhận khi đứng sau MỘT TỪ: "hàng tu GB", "hang tu BG", "SX tai TQ" — còn "tu BT" (đầu
 * câu) và "85371099 tu BT" (sau mã HS) thì không nhận. Đây là cùng lớp lỗi với danh từ hàng
 * có dấu ("tủ BT", "cửa AL") — mã đứng sau danh từ hàng là viết tắt kỹ thuật, không phải nước.
 */
const DAN_XUAT_XU_ASCII_KHONG_DAU_DAU = new Set(['tu', 'tai', 'o', 'cua']);

/**
 * ĐƠN VỊ ĐO hay gặp ở CUỐI câu mô tả hàng — mã 2 chữ trùng mã nước ISO-2 (OZV-535 nhóm 1).
 *
 * Chỉ loại khi mã đứng NGAY SAU một CON SỐ: "ổ cứng 500 GB" là 500 gigabyte, không phải
 * Vương quốc Anh. Ô CÓ NHÃN không đổi: "Xuất xứ: MM" vẫn là Malta (khách CỐ Ý khai mã).
 */
export const DON_VI_DO = new Set(['GB', 'KG', 'MM', 'CM', 'ML', 'KW', 'MT', 'LT']);

/**
 * Mã đứng ngay sau một CON SỐ LƯỢNG và nằm trong danh sách đơn vị đo ⇒ đơn vị đo, không phải nước.
 *
 * RÀO SỐ LƯỢNG vs MÃ HS (vòng soát OZV-535): con số TRƯỚC mã có thể là MÃ HS 8 số của Cổng
 * ("Nike 64041190 GB"), không phải số lượng ("500 GB" là 500 gigabyte). Nếu không rào, mã nước
 * đứng sau mã HS bị nuốt: khách khai Vương quốc Anh (`GB`) / Malta (`MT`) / Litva (`LT`) ⇒ bot
 * rơi về giả định Trung Quốc, khách đọc ra mức thuế sai (Điều III). Mã HS của Cổng có 8 số
 * (`packs/hs/packages.js:40` `/^\d{8}$/`) ⇒ số từ 8 chữ số trở lên KHÔNG phải số lượng.
 *
 * `truoc` là NGUYÊN VĂN phần chữ trước mã (KHÔNG phải token đã tách): `tachTu` cắt
 * "6404.11.90" thành "6404" "11" "90", nên token ngay trước mã nước là "90" (2 chữ số) ⇒ tưởng
 * là SỐ LƯỢNG ⇒ nuốt mất mã nước đứng sau mã HS CÓ DẤU CHẤM (vòng soát 3 PR #216).
 */
const laDonViDoSauSo = (ma, truoc) => {
  if (!DON_VI_DO.has(ma)) return false;
  const so = (String(truoc || '').trim().match(/(\d[\d.,]*)$/) || [])[1] || '';
  if (!so) return false;
  return so.replace(/\D/g, '').length < 8;
};

/** Token trước có phải con số không? ("Nike 64041190 CN" ⇒ "CN" đứng sau mã HS). */
const laSo = (tok) => /^\d+(?:[.,]\d+)?$/.test(String(tok || '').trim());

/**
 * Token `tu[i]` có phải TỪ DẪN XUẤT XỨ không? (xem chú thích `DAN_XUAT_XU_EN`).
 *
 * KHÔNG phân biệt HOA/THƯỜNG (vòng soát OZV-535): so trực tiếp thì "Từ GB" / "Tại SK" /
 * "SX TẠI SG" / "HÀNG TỪ UK" bị bỏ qua ⇒ khách gõ CAPS trên Zalo là chuyện thường, mà rơi về
 * giả định Trung Quốc thì khách đọc ra mức thuế sai (Điều III).
 *
 * Hạ chữ thường KHÔNG làm mất phân biệt "giữ dấu" — "từ" ≠ "tủ", "tại" ≠ "tai", "của" ≠ "cửa":
 * bảng tiếng Việt so trên chuỗi GIỮ DẤU nên "TỦ" → "tủ" vẫn không khớp khoá "từ".
 *
 * Bản KHÔNG DẤU ("tu" "tai" "o" "cua") chỉ nhận khi đứng sau MỘT TỪ, không phải sau con số:
 * "hàng tu GB" / "SX tai TQ" là từ dẫn thật; "85371099 tu BT" là mã HS + "tủ BT" (danh từ hàng)
 * ⇒ mã nước đứng sau nó KHÔNG phải xuất xứ (vòng soát 3 PR #216).
 * @param {string[]} tu danh sách từ đã tách
 * @param {number} i vị trí từ đang xét
 */
const laTuDanXuatXu = (tu, i) => {
  const t = String(tu[i] || '').trim();
  const tK = t.toLowerCase();
  if (DAN_XUAT_XU_EN.has(norm(t))) return true;
  if (DAN_XUAT_XU_VN.has(tK)) return true;
  if (DAN_XUAT_XU_ASCII.has(tK)) return true;
  if (DAN_XUAT_XU_VN_YEU.has(tK)) return i === 0 || (i > 0 && laTuDanXuatXu(tu, i - 1));
  if (DAN_XUAT_XU_ASCII_KHONG_DAU_DAU.has(tK)) return i > 0 && !laSo(tu[i - 1]);
  return false;
};

/**
 * Alias trong câu tự do, rào VỊ TRÍ: chỉ nhận khi mã alias đứng NGAY SAU từ dẫn xuất xứ
 * ("made in UK"), không nhận mã đứng cuối câu — "áo size UK" là kích cỡ, không phải nước.
 */
const maAliasTrongCau = (s) => {
  const tu = tachTu(s);
  for (let i = 1; i < tu.length; i++) {
    const a = ALIAS_TRONG_CAU[tu[i]];
    if (a && laTuDanXuatXu(tu, i - 1)) return a;
  }
  return null;
};

/**
 * ALIAS ở CUỐI câu — chỉ nhận khi đứng NGAY SAU từ dẫn xuất xứ ("made in UK" ⇒ GB).
 *
 * Cùng luật với `maNuocTrongCau` (vòng soát 9 PR #214): alias cuối câu mà không có từ dẫn thì
 * KHÔNG phải nước — "áo size UK" là kích cỡ giày. Gói 6 dùng hàm này cho luật "mã cuối câu".
 * @returns {string|null}
 */
export const aliasCuoiCau = (s) => {
  const tu = tachTu(s);
  const i = tu.length - 1;
  if (i < 1) return null;
  const a = ALIAS_TRONG_CAU[tu[i]];
  return a && laTuDanXuatXu(tu, i - 1) ? a : null;
};

/**
 * Mã 2 chữ IN HOA đứng CUỐI câu — nhưng KHÔNG phải ĐƠN VỊ ĐO đứng sau số (OZV-535 nhóm 1)
 * và KHÔNG phải mã đứng sau DANH TỪ HÀNG (OZV-535 nhóm 2).
 *
 * Gói 6 lấy mã cuối câu theo luật "mã 2 chữ in hoa đứng cuối tin"; "ổ cứng 500 GB" thì "GB"
 * là gigabyte, không phải Vương quốc Anh; "84212100 máy lọc nước RO" thì "RO" là nước lọc
 * thấm ngược, không phải Romania.
 *
 * Vì vậy mã cuối câu CHỈ được nhận khi đứng ngay sau MÃ/SỐ ("Nike 64041190 CN" ⇒ CN) hoặc
 * ngay sau TỪ DẪN xuất xứ ("hàng từ GB" ⇒ GB, "made in UK" ⇒ UK) — cùng luật với
 * `maNuocTrongCau` (vòng soát 9 PR #214), nên gói 6 không tự gán nước cho danh từ hàng.
 * @returns {string|null}
 */
export const maCuoiCau = (s) => {
  const t = String(s || '');
  const m = t.match(/\b([A-Z]{2})\s*$/);
  if (!m) return null;
  const truoc = t.slice(0, m.index).trim();
  if (laDonViDoSauSo(m[1], truoc)) return null;
  const tu = tachTu(t);
  const i = tu.length - 1;
  const truocToken = i > 0 ? tu[i - 1] : '';
  const sauMaHoacTuDan = laSo(truocToken) || (i > 0 && laTuDanXuatXu(tu, i - 1));
  return sauMaHoacTuDan ? m[1] : null;
};

/** Bỏ nhãn ô xuất xứ ở đầu giá trị ("Xuất xứ: SK", "origin: HR", "xx TQ") để còn lại phần khách khai. */
const boNhanXuatXu = (n) => n.replace(/^(xuat xu|xuatxu|xx|origin|nuoc)\s*[:\-]?\s*/, '');

/**
 * Tách chuỗi thành "từ" theo CHỮ UNICODE (chữ + dấu): "Mỹ" dạng NFD ("M" + "y" + dấu rời) là
 * MỘT từ, không phải "My". Bỏ `\p{M}` khỏi mẫu thì dấu rời bị tách mất và "Mỹ" trở lại thành
 * "my" — đúng lỗi "Mỹ = Malaysia" mà vòng soát 3 của PR #214 đã chặn.
 */
/**
 * Như `tachTu` nhưng kèm VỊ TRÍ bắt đầu trong chuỗi gốc — cần khi rào theo NGUYÊN VĂN
 * (mã HS có dấu chấm "6404.11.90" bị `tachTu` cắt thành ba token).
 */
const tachTuViTri = (s) => [...String(s || '').matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu)].map((m) => ({ tu: m[0], viTri: m.index }));

const tachTu = (s) => tachTuViTri(s).map((x) => x.tu);

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
 *      đứng cuối ô ("nước MT"). Mã nằm lửng giữa câu không phải khai xuất xứ. ALIAS ("UK") thì
 *      PHẢI có từ dẫn — alias cuối câu không từ dẫn là kích cỡ ("áo size UK"), không phải nước.
 *
 * Chỉ quét mã IN HOA, như mã gốc trên `main` vẫn làm: cặp chữ thường hai ký tự là từ trong câu.
 * @returns {string|null}
 */
export function maNuocTrongCau(s) {
  const t = String(s || '');
  // Tách "từ" theo CHỮ UNICODE (chữ + dấu): "VIỆT" là MỘT từ, không phải "VI" + "ỆT".
  // Regex ASCII cũ (`[A-Z]{2}` + ranh giới `[^A-Za-z0-9]`) cắt mảnh từ có dấu rồi đọc phần
  // còn lại thành mã ISO THẬT: "VIỆT NAM" → "VI" (Virgin Islands), "MỸ" (dạng NFD) → "MY"
  // (Malaysia), "ĐỒNG" → "NG" (Nigeria), "GHẾ" → "GH" (Ghana), "PHÊ" → "PH" (Philippines).
  const dsTu = tachTuViTri(t);
  const tu = dsTu.map((x) => x.tu);
  for (let i = 0; i < tu.length; i++) {
    const ma = tu[i];
    if (/[\p{M}]/u.test(ma)) continue;          // từ có dấu ⇒ KHÔNG phải mã ISO
    if (!/^[A-Z]{2}$/.test(ma)) continue;        // mã ISO: đúng 2 chữ IN HOA, không dấu
    const alias = ALIAS_TRONG_CAU[ma];           // "made in UK" ⇒ GB (vòng soát 8)
    if (!alias && (!laMaIso2(ma) || VIET_TAT_KHONG_PHAI_NUOC.has(ma))) continue;
    const truoc = i > 0 ? tu[i - 1] : '';
    const laCuoi = i === tu.length - 1;
    // RÀO ĐƠN VỊ ĐO (OZV-535 nhóm 1): mã đứng ngay sau CON SỐ và mã nằm trong `DON_VI_DO`
    // ⇒ "500 GB" là gigabyte, không phải Vương quốc Anh. Đếm chữ số trên NGUYÊN VĂN phần
    // chữ trước mã: token trước mã trong "6404.11.90 GB" chỉ là "90" ⇒ tưởng số lượng ⇒
    // nuốt mất mã nước đứng sau mã HS có dấu chấm (vòng soát 3 PR #216).
    const truocGoc = i > 0 ? t.slice(0, dsTu[i].viTri).trim() : '';
    if (laDonViDoSauSo(ma, truocGoc)) continue;
    // TỪ DẪN XUẤT XỨ (OZV-535 nhóm 2): so theo tầng, từ tiếng Việt GIỮ DẤU — "ổ BI", "tủ BT",
    // "cửa AL" là DANH TỪ HÀNG trùng từ dẫn, không phải xuất xứ.
    const tuDan = i > 0 && laTuDanXuatXu(tu, i - 1);
    // ALIAS ("UK") chỉ được nhận khi đứng NGAY SAU từ dẫn xuất xứ ("made in UK") — đứng cuối
    // câu mà không có từ dẫn thì KHÔNG phải nước ("áo size UK" là kích cỡ giày, không phải xuất
    // xứ; đọc thành GB là bịa nước ⇒ đèn rủi ro nhãn hiệu sai — vòng soát 9 PR #214).
    if (alias) { if (tuDan) return alias; continue; }
    if (tuDan) return ma;
    // Ô khai chỉ có MỘT mã ("SK", "MM"): khách CỐ Ý khai mã nước ⇒ nhận, như `main`.
    if (tu.length === 1) return ma;
    // MÃ ISO THẬT ở cuối câu: chỉ nhận khi đứng NGAY SAU MÃ/SỐ ("Nike 64041190 CN" ⇒ CN).
    // Đứng sau DANH TỪ HÀNG ("tủ BT", "cửa AL", "máy lọc nước RO") thì mã đó là viết tắt kỹ
    // thuật, KHÔNG phải nước (OZV-535 nhóm 2) — trước đây mọi mã ISO ở cuối câu đều lọt.
    if (laCuoi && laSo(truoc)) return ma;
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
 * Dùng lại cách của repo `hs-code-api`: danh mục nước Cổng so là ISO-3166-1 alpha-2
 * (`hs-code-api/data/iso-3166-vn.json`) và danh sách ưu đãi so mã 2 chữ (`hs-code-api/lib/fta.js:30-48`, `thanhVien`).
 * KHÔNG dùng `hs-code-api/scripts/import-oz-declarations.mjs:87` `mapOriginToIso2` làm chuẩn — hàm đó
 * nhận MỌI cặp chữ 2 ký tự nên không phải bảng tra nước (cũng là nơi gốc của việc gửi mã rác lên Cổng).
 */
export function countryCode(s) {
  const t = String(s || '').trim();
  const nGoc = boNhanXuatXu(norm(t));
  // Ngữ cảnh 1 — ô khai riêng MỘT mã/tên. Xét TRƯỚC từ điển tên nước, vì `norm` đưa "MY" về "my" và
  // từ điển có khoá `my` = Hoa Kỳ, tra từ điển trước thì Malaysia thành Hoa Kỳ.
  //
  // Nhưng hình mã phải xét thêm một rào: GIÁ TRỊ KHÁCH KHAI KHÔNG ĐƯỢC CÓ DẤU. Mã ISO không bao
  // giờ có dấu, nên chữ có dấu không thể là mã. Xét hình chỉ trên `nGoc` (đã rụng dấu) là lỗi chặn
  // vòng soát 3 của PR #214 — `"Mỹ"` rụng dấu thành `"my"`, trùng mã ISO Malaysia, nên không bao
  // giờ xuống tới `NUOC['my'] = 'US'`: khách khai Mỹ mà bot tra thuế Malaysia, lại `giaDinh:false`
  // nên không hề nói là giả định (Điều III + Điều VIII — số sai trông như thật).
  //
  // So dấu trên TOKEN CUỐI của giá trị còn dấu, không so trên cả chuỗi: nhãn ô cũng có dấu
  // ("Xuất xứ: MY"), so cả chuỗi thì mã thật sau nhãn lại bị bác bỏ.
  //
  // Bảng ALIAS ("UK" → "GB", "Anh" → "GB") chỉ dùng ở đây — ô CÓ NHÃN,
  // tức chỗ khách cố ý khai MỘT mã/tên. Trong câu tự do thì không dùng (xem `ALIAS`).
  if (nGoc && !/\s/.test(nGoc) && !coDau(dai(t).split(/[\s:\-]+/).filter(Boolean).pop() || '')) {
    const chu = nGoc.toUpperCase();
    if (ALIAS[chu]) return ALIAS[chu];
    if (laMaIso2(chu)) return chu;
  }
  // Tên nước (có dấu hay không) và viết tắt tiếng Việt: "TQ" không phải mã ISO nên tới đây, và
  // phải ra CN chứ không ra mã "TQ". "Mỹ" có dấu cũng về đây (còn dấu nên không khớp hình trên).
  if (NUOC[nGoc]) return NUOC[nGoc];
  if (/^[A-Za-z]{2}$/.test(nGoc)) return null;
  // Ngữ cảnh 2 — mã lẫn trong câu.
  const trongCau = maNuocTrongCau(t);
  if (trongCau) return trongCau;
  // Còn lại để `findCountryInText` đọc tên nước/viết tắt tiếng Việt trong câu ("SX tại TQ" ⇒ CN).
  return findCountryInText(t);
}

export function findCountryInText(s) {
  const raw = String(s || '');
  // So từng CỬA SỔ từ (1–3 từ) trên chuỗi CHƯA rụng dấu — không rụng dấu cả câu, vì "Mỹ"
  // (Hoa Kỳ) và "my" (mã ISO Malaysia) là HAI nước khác nhau, chỉ khác nhau ở dấu.
  //
  // QUÉT THEO ƯU TIÊN KHOÁ, KHÔNG THEO VỊ TRÍ (vòng soát 8 PR #214): vòng 7 đưa luật "dài
  // trước" vào THỨ TỰ DUYỆT CỬA SỔ (len ngoài, vị trí trong) nên vẫn còn ca từ đơn va chạm
  // đứng trước nuốt TÊN NƯỚC 1 TỪ đứng sau: "máy hàn Nhật" quét trái→phải gặp "hàn" (KR)
  // trước "Nhật" (JP); "mỹ phẩm Hàn" gặp "mỹ" (US) trước "Hàn" (KR); "my pham han" gặp
  // "my" trước "han". main `50907f2` ra đúng cả nhóm này vì nó duyệt `NUOC` theo THỨ TỰ
  // KHOÁ — "han"/"nhat" khai báo trước "my" nên thắng ở MỌI vị trí. Vòng 8 y nguyên luật
  // đó: duyệt KHOÁ (qua `NHOM_KHOA`, nhóm 3→2→1 từ, trong nhóm giữ thứ tự khai báo) trên
  // mọi vị trí của câu.
  const tu = tachTu(raw);
  for (const len of [3, 2, 1]) {
    for (const khoa of NHOM_KHOA[len]) {
      for (let i = 0; i + len <= tu.length; i++) {
        const phan = tu.slice(i, i + len);
        if (norm(phan.join(' ')) !== khoa) continue;
        // Luật "my" (vòng soát 8): khách gõ không dấu là chuyện thường — "hàng my" là
        // "hàng Mỹ" (Hoa Kỳ), còn Malaysia thì viết in hoa "MY" như mọi mã ISO. Ở Ô CÓ NHÃN
        // ("Xuất xứ: MY", "Xuất xứ: my") vẫn là MY — chỗ đó do `countryCode` quyết.
        if (khoa === 'my') {
          if (phan.some((w) => coDau(w))) return 'US';   // "Mỹ"/"mỹ" (có dấu) ⇒ Hoa Kỳ
          return phan[0] === 'MY' ? 'MY' : 'US';          // "MY" in hoa ⇒ Malaysia; "my" thường ⇒ "mỹ"
        }
        return NUOC[khoa];
      }
    }
  }
  // Alias trong câu tự do ("made in UK" ⇒ GB) — có rào vị trí, xem `maAliasTrongCau`.
  const alias = maAliasTrongCau(raw);
  if (alias) return alias;
  // Regex mã trơ cuối cùng GIỮ DANH SÁCH CỦA MAIN (không GB/HK — vòng soát 7 PR #214): thêm
  // "GB" vào đây là bắt "500 GB" của "ổ cứng 500 GB SSD" thành Vương quốc Anh (dung lượng).
  // GB/HK trần trong câu vẫn đọc được qua `maNuocTrongCau` ("hàng từ GB", "made in HK",
  // "Nike ... HK" cuối câu) — chỗ đó có rào vị trí, không bắt bừa mã đứng giữa câu.
  //
  // OZV-535 nhóm 3: "MADE IN JP" — chữ "IN" trong cụm "made in" là GIỚI TỪ, không phải mã nước
  // Ấn Độ; mã nước là chữ sau nó ("JP"). Bỏ qua "IN" đứng ngay sau "made" rồi lấy mã kế tiếp.
  const re = /(?:^|\s)(CN|JP|KR|TW|TH|US|DE|IN|MY|ID|VN)(?=\s|$|,)/g;
  let mm;
  while ((mm = re.exec(raw)) !== null) {
    const truoc = raw.slice(0, mm.index).trim().split(/\s+/).pop() || '';
    if (mm[1] === 'IN' && norm(truoc) === 'made') continue;
    return mm[1];
  }
  return null;
}

/** Nước mặc định khi khách chưa nói — chỉ dùng kèm cờ `giaDinh` của `xuatXuCua`. */
export const XUAT_XU_MAC_DINH = 'CN';
/** Tên tiếng Việt của mã nước (để nói với khách), không có thì trả lại chính mã. */
export const tenNuoc = (ma) => {
  const m = String(ma || '').toUpperCase();
  const hoa = { CN: 'Trung Quốc', JP: 'Nhật Bản', KR: 'Hàn Quốc', TW: 'Đài Loan', TH: 'Thái Lan',
    US: 'Hoa Kỳ', DE: 'Đức', IN: 'Ấn Độ', VN: 'Việt Nam', MY: 'Malaysia', ID: 'Indonesia',
    GB: 'Vương quốc Anh', HK: 'Hồng Kông' };
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
