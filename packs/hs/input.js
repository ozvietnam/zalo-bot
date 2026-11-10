// packs/hs/input.js — đọc thông tin người dùng gõ trên Zalo thành các trường có tên.
// Hỗ trợ cả dạng có nhãn ("Mã HS: 84137090", "Tên hàng = máy bơm") lẫn gõ tự do.

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();

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
  'dai loan': 'TW', 'thai lan': 'TH', 'my': 'US', 'hoa ky': 'US', duc: 'DE', 'an do': 'IN', 'viet nam': 'VN', 'malaysia': 'MY', 'indonesia': 'ID',
  // Tên tiếng Anh đủ chữ: khách gõ "made in Japan" là rất thường, mà bảng cũ chỉ có `china` nên
  // trước đây câu đó ra `null` ⇒ rơi về mốc CN, tức SAI NƯỚC ([S4] của #168, chỗ sót đo được).
  japan: 'JP', korea: 'KR', thailand: 'TH', taiwan: 'TW', germany: 'DE', india: 'IN', usa: 'US', vietnam: 'VN' };

// Tên nước viết TẮT trùng từ tiếng Việt thông dụng: sau khi bỏ dấu, "hàn" (hàn xì) = "han" = Hàn Quốc,
// "mỹ phẩm" = "my" = Hoa Kỳ. `máy hàn` là mặt hàng nhập rất phổ biến ⇒ các khoá này chỉ được nhận khi
// có TỪ KHOÁ NGỮ CẢNH đi kèm ([S4] của #168).
const NUOC_CAN_NGU_CANH = new Set(['tq', 'nhat', 'han', 'my', 'duc']);

// Từ khoá cho biết khách đang NÓI VỀ XUẤT XỨ, không phải đọc thông số hàng.
// KHÔNG có `hang`: "hàng" đi trước mọi thứ trong câu mô tả, nên nó khớp cả `hàng mỹ phẩm` ⇒ Hoa Kỳ
// (đo được ở [S4]). "hàng Trung Quốc" vẫn nhận vì tên đủ chữ không cần ngữ cảnh.
const NGU_CANH_XX = '(?:xuat xu|xuatxu|xx|nguon goc|made in|origin|c/o|tu)';

/**
 * Mã ISO 3166-1 alpha-2 ĐÃ ĐƯỢC GÁN (gõ tay theo danh sách chuẩn, không tải từ mạng).
 * Dùng để chặn hai chữ in hoa không phải nước: `XX`, `DC`, `AC`, `HP`… Cần, nhưng KHÔNG đủ — xem
 * `BO_QUA_2_CHU` ngay dưới.
 */
const ISO2 = new Set(('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS '
  + 'BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI '
  + 'FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR '
  + 'IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM '
  + 'MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT '
  + 'PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM '
  + 'TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' '));

/**
 * Viết tắt kỹ thuật / vật liệu / đơn vị đo mà khách gõ trong MÔ TẢ HÀNG, không phải xuất xứ.
 * Vì sao cần dù đã lọc theo `ISO2`: nhiều cái **trùng mã nước thật** — `PE` Peru, `SS` Nam Sudan,
 * `ID` Indonesia, `IN` Ấn Độ, `CM` Cameroon, `KG` Kyrgyzstan, `AL` Albania, `ML` Mali, `LA` Lào.
 * Chỉ áp cho đường KHÔNG có ngữ cảnh: `xuất xứ PE` vẫn ra Peru ([S4] của #168, quyết định mục 2–3).
 */
const BO_QUA_2_CHU = new Set(['HP', 'DC', 'AC', 'IP', 'PE', 'PP', 'UV', 'XL', 'PU', 'SS', 'PA', 'PC', 'PS', 'MS',
  'KG', 'CM', 'MM', 'ML', 'LA', 'IN', 'ID', 'AL', 'CR', 'KW', 'VA', 'GB', 'MF', 'AG', 'BA']);

/** Hai chữ in hoa chỉ là mã nước khi ĐÃ GÁN và KHÔNG nằm trong danh sách loại trừ. */
const laMaNuoc = (x) => ISO2.has(x) && !BO_QUA_2_CHU.has(x);

export function countryCode(s) {
  const t = String(s || '').trim();
  const n = norm(t).replace(new RegExp(`^${NGU_CANH_XX}\\s*:?\\s*`), '');
  // Chuỗi CHỈ gồm hai chữ (hoặc sau khi bỏ nhãn "Xuất xứ:") là khách đưa mã thẳng ⇒ nhận cả mã bị
  // loại trừ: ở đây không có mô tả hàng nào để lẫn, và `Xuất xứ: PE` nghĩa là Peru.
  if (/^[A-Za-z]{2}$/.test(n)) return ISO2.has(n.toUpperCase()) ? n.toUpperCase() : null;
  if (NUOC[n]) return NUOC[n];
  // Nhánh vét `/([A-Z]{2})/` giữa câu đã BỎ ([S4] của #168): nó biến "động cơ DC" thành nước `DC`,
  // "bơm AC 220V" thành `AC`. Chỉ nhận khi là mã nước đã gán, không bị loại trừ, và có ngữ cảnh
  // xuất xứ đứng ngay trước — hoặc đứng cuối chuỗi (cách khách gõ thật: "Nike 64041190 CN").
  const coNguCanh = t.match(new RegExp(`${NGU_CANH_XX}\\s*:?\\s*([A-Za-z]{2})(?![A-Za-z])`, 'i'));
  if (coNguCanh && ISO2.has(coNguCanh[1].toUpperCase())) return coNguCanh[1].toUpperCase();
  const cuoi = t.match(/(?:^|\s)([A-Z]{2})\s*$/);
  return cuoi && laMaNuoc(cuoi[1]) ? cuoi[1] : null;
}

export function findCountryInText(s) {
  const n = norm(s);
  for (const [k, v] of Object.entries(NUOC)) {
    // Tên nước viết tắt trùng từ thông dụng thì BẮT BUỘC có ngữ cảnh; tên đủ chữ ("trung quoc",
    // "hoa ky") thì không, vì không trùng từ nào ([S4] của #168).
    const nguCanh = NUOC_CAN_NGU_CANH.has(k) ? `(?:^|\\s)${NGU_CANH_XX}\\s+` : `(?:^|\\s)(?:${NGU_CANH_XX}\\s+)?`;
    if (new RegExp(`${nguCanh}${k}(?:\\s|$|,|\\.)`).test(n)) return v;
  }
  const m = String(s || '').match(/(?:^|\s)([A-Z]{2})(?=\s|$|,)/g);
  for (const x of m || []) {
    const ma = x.trim().toUpperCase();
    if (laMaNuoc(ma)) return ma;
  }
  return null;
}

/** Mốc xuất xứ để tra bảng thuế tham chiếu khi khách chưa nói nước. Luôn đi kèm nhãn "(xuất xứ CN)". */
export const XX_MOC = 'CN';

/**
 * Xuất xứ của LÔ HÀNG — một nơi quyết định cho mọi gói ([S3] của #168).
 *
 * Trả về `{ xuatXu, biet }`:
 * - `xuatXu` = giá trị gửi Cổng và in trong nhãn bảng thuế. Chưa biết thì là mốc `'CN'`: bảng thuế
 *   của Cổng phải tra theo MỘT xuất xứ nào đó mới có số MFN/VAT, và chữ gửi khách luôn dán nhãn
 *   "(xuất xứ CN)" nên đó là tham chiếu, không phải kết luận về lô hàng.
 * - `biet` = khách CÓ NÓI nước hay không. Chỉ khi `biet === true` mới được dựng CĂN CỨ ưu đãi FTA
 *   hay mời C/O: dòng `Căn cứ:` không có nhãn xuất xứ nên khách đọc như kết luận cho lô hàng mình.
 *
 * Thứ tự: nước trong câu lượt này → nước khách đã nói trong phiên → mốc. Nước đã xác định trong
 * phiên THẮNG mốc, nếu không thì khách gõ `85094000 KR` rồi gõ `2` sẽ bị lật sang CN ([S3] tái hiện 2).
 * @param {string} text câu khách gõ trong lượt này
 * @param {object} ctx pctx của gói (chỉ đọc `ctx.session.last`)
 * @param {{bo?:RegExp}} o `bo` = đoạn phải bỏ khỏi `text` trước khi dò nước (ví dụ mã HS 8 số)
 */
export function xuatXuLoHang(text, ctx, { bo = null } = {}) {
  const s = String(text || '');
  const sachMa = bo ? s.replace(bo, ' ') : s;
  // `findCountryInText` TRƯỚC `countryCode`: nó tra bảng tên nước nên "nhập từ TQ" ra `CN` (mã ISO
  // thật), còn `countryCode` có nhánh vét hai chữ in hoa nên trả nguyên chữ `TQ` — một mã không tồn
  // tại, gửi sang Cổng là hỏi sai. Thứ tự này giữ đúng hành vi cũ của gói 1 (`hs.test.mjs:382`).
  const trongLuot = findCountryInText(s) || countryCode(sachMa.trim()) || null;
  if (trongLuot) return { xuatXu: trongLuot, biet: true };
  const phien = ctx?.session?.last;
  if (phien?.xuatXuBiet && phien.xuatXu) return { xuatXu: phien.xuatXu, biet: true };
  return { xuatXu: XX_MOC, biet: false };
}
