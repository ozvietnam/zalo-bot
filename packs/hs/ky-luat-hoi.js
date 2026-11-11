// packs/hs/ky-luat-hoi.js — KỶ LUẬT HỎI của lớp hỏi lại (yêu cầu 2 của issue #177).
//
// Chép cách làm của erp-xnk (`src/lib/portal-review-questions.ts`, spec
// `docs/superpowers/specs/2026-10-24-ky-luat-hoi-chi-hoi-dieu-may-khong-tu-xac-dinh-duoc-design.md`).
// Luật CEO 10/11, phần đo được ở bot Zalo:
//   1. máy TỰ XÁC ĐỊNH tối đa từ dữ kiện sẵn có TRƯỚC KHI hỏi;
//   2. KHÔNG hỏi lại điều khách đã nêu — trong chữ lượt này, hoặc trong HỒ SƠ MẠCH (#170);
//   3. tối đa `TRAN_CAU` câu, gom trong MỘT tin.
//
// Trách nhiệm của tệp này: ĐO xem khách đã nêu gì, và lọc/gom câu hỏi theo đó.
// Các nhánh hỏi lại theo mặt hàng (nghi gõ nhầm, điện gia dụng, cơ khí) nằm ở `dien-cho-thieu.js`
// (Điều VI: mỗi tệp một trách nhiệm, dưới 300 dòng).

// Các ĐẠI LƯỢNG lớp hỏi lại có thể hỏi. Mỗi khoá dưới đây là một đại lượng; câu hỏi khai báo nó
// hỏi những đại lượng nào, nhờ đó `gomCau` biết câu nào đã thành vô ích.
export const CONG_SUAT_RE = /\b(\d+(?:[.,]\d+)?)\s*(w|kw|hp|wats?|watt|m[aã]\s*l[uự]c)\b/i;
export const DIEN_AP_RE = /\b(\d+)\s*(v|volt|volts?|vdc|vac)\b/i;
export const DUNG_TICH_RE = /\b(\d+(?:[.,]\d+)?)\s*(l|l[ií]t|liters?|ml)\b/i;
export const KICH_THUOC_RE = /\b(dn\d+|\d+(?:[.,]\d+)?\s*(mm|cm|m|inch|in|phi|ø|bar|mpa|psi|kg|g|tan|tấn))\b/i;
export const CHAT_LIEU_RE = /\b(inox(\s*\d+)?|th[eé]p(\s*kh[oô]ng\s*g[iỉ])?|gang|nh[uự]a|nh[oô]m|[đd][oồ]ng|g[oỗ]|cao\s*su|da|s[uứ]|th[uỷ]y\s*tinh|cotton|poly|polyester)\b/i;
export const CONG_DUNG_RE = /\b(d[uù]ng\s*cho|d[uù]ng\s*trong|d[uù]ng\s*[đd][eể]|chuy[eê]n\s*d[uù]ng|gia\s*d[uụ]ng|c[oô]ng\s*nghi[eệ]p|t[uự]\s*[đd][oộ]ng|c[aâ]m\s*tay|g[ií]a\s*[đd][iì]nh|ly\s*t[aâ]m)\b/i;
export const QUY_CACH_RE = /\b(tay\s*g[aạ]t|m[aạ]\s*k[eẽ]m|[đd][uú]c|h[aà]n|kh[oô]ng\s*d[aầ]u)\b/i;

/** Trần số câu trong MỘT tin hỏi lại. */
export const TRAN_CAU = 3;

/**
 * Dữ kiện khách ĐÃ NÊU: chữ của lượt này + HỒ SƠ MẠCH (#170 — thông số khách gõ ở tin trước,
 * ô có nhãn, câu khách nói thêm). Máy tự xác định được điều gì thì không hỏi lại điều đó.
 * @returns {Record<string, boolean>} theo khoá đại lượng (`congSuat`, `dienAp`, …)
 */
export function daNeu(sSach, hoSo) {
  const h = hoSo && typeof hoSo === 'object' ? hoSo : {};
  // Đọc CẢ mô tả hồ sơ, không chỉ các ô có nhãn: khách gõ "máy bơm 1.5HP" ở tin trước thì thông
  // số nằm trong `moTa`, không nằm ở ô `thongSo` (`ho-so.js` chỉ tách ô khi tin có nhãn).
  const them = [h.moTa, h.chatLieu, h.congDung, h.thongSo, h.model, ...(Array.isArray(h.sua) ? h.sua : [])]
    .map((x) => String(x || '').trim()).filter(Boolean).join(' ');
  const t = `${sSach} ${them}`.trim();
  return {
    congSuat: CONG_SUAT_RE.test(t),
    dienAp: DIEN_AP_RE.test(t),
    dungTich: DUNG_TICH_RE.test(t),
    kichThuoc: KICH_THUOC_RE.test(t),
    chatLieu: CHAT_LIEU_RE.test(t) || Boolean(String(h.chatLieu || '').trim()),
    congDung: CONG_DUNG_RE.test(t) || Boolean(String(h.congDung || '').trim()),
    quyCach: QUY_CACH_RE.test(t),
  };
}

/**
 * Gom các câu hỏi thành MỘT tin: bỏ câu nào mà MỌI đại lượng nó hỏi khách đã nêu, rồi cắt theo
 * trần `TRAN_CAU`. Chỉ trùng MỘT PHẦN thì GIỮ — bỏ câu còn hỏi dở là mất một dữ kiện khách chưa
 * khai, nặng hơn hỏi thừa một câu (bài học V4 của erp-xnk).
 * @param {Array<{cau: string, dai?: string[]}>} cacCau `dai`: khoá đại lượng câu đó hỏi; rỗng = luôn hỏi.
 */
export function gomCau(cacCau, co) {
  return cacCau
    .filter((c) => c && c.cau && (!(c.dai || []).length || !c.dai.every((k) => co[k])))
    .slice(0, TRAN_CAU)
    .map((c) => c.cau)
    .join(' ');
}

/**
 * Câu "cho em xin thêm …" CHỈ nêu đại lượng còn thiếu — không xin lại điều khách vừa gõ.
 * Mỗi mục là MỘT đại lượng (đúng cách erp-xnk làm ở `buildQuestionsFromFields`: một field một câu,
 * field khách đã có thì bỏ). Câu hỏi gộp hai đại lượng thì khai hai mục, `noi` là từ nối giữa
 * chúng — khách đã nêu một trong hai thì chữ còn lại tự rút đúng phần còn thiếu.
 * @param {Array<{khoa: string, chu: string}>} muc
 * @param {string} [noi] Từ nối khi còn nhiều mục (' và ' mặc định, ' hoặc ' cho câu "cái này hoặc cái kia").
 */
export function cauXinThem(muc, co, duoi, noi = ' và ') {
  const con = muc.filter((m) => !co[m.khoa]);
  if (!con.length) return '';
  return `Anh/chị cho em xin thêm ${con.map((m) => m.chu).join(noi)} nhé — ${duoi}`;
}

/** Lệnh mở đầu tin khách ("Tra hs …", "mã hs …") — không phải tên hàng, không gửi Cổng. */
export const LENH_DAU_RE = /^(?:tra\s*hs|m[aã]\s*hs|t[iì]m\s*m[aã]|ph[aâ]n\s*lo[aạ]i)\s*/i;

/** Các LOẠI đại lượng đo được. Chia theo LOẠI để số MỚI của khách thắng số CŨ cùng loại. */
const RE_THONG_SO = [CONG_SUAT_RE, DIEN_AP_RE, DUNG_TICH_RE, KICH_THUOC_RE];

/** Các đoạn THÔNG SỐ có trong một chuỗi (dùng để không làm rụng thông số khách đã gõ). */
export function thongSoTrong(s) {
  const t = String(s || '');
  const out = [];
  for (const re of RE_THONG_SO) {
    const m = t.match(new RegExp(re.source, 'gi'));
    if (m) out.push(...m.map((x) => x.trim()).filter(Boolean));
  }
  return [...new Set(out)];
}

/** Phần CHỮ của một chuỗi: bỏ hết các đoạn thông số đo được ("máy bơm 1.5HP" → "máy bơm"). */
export function chuTrong(s) {
  let t = String(s || '');
  for (const x of thongSoTrong(t)) t = t.split(x).join(' ');
  return t.replace(/\s+/g, ' ').trim();
}

/**
 * Chuỗi này có TÊN HÀNG không? Tên hàng nằm ở phần CHỮ, nên phải bóc thông số ra trước khi đo.
 * Đo thẳng "có ≥ 2 chữ cái" trên cả chuỗi là nhận lầm ĐƠN VỊ (kW, VAC, mm, kg, ml) thành tên —
 * "không, 0.5kW 220V" bị coi là đã có tên mới nên tên thật của khách rụng hẳn (điểm 1 của người
 * soát PR #213: Cổng nhận "0.5kW 220V 350W" rồi trả về một mã bịa).
 */
export function coTenTrong(s) {
  return /\p{L}{2}/u.test(chuTrong(s).replace(/[^\p{L}\s]/gu, ' '));
}

/**
 * Nối thông số của `nguon` vào `moTa` — nhưng CHỈ những LOẠI đại lượng `moTa` chưa nêu.
 * Mô tả gửi Cổng không được rụng dữ kiện khách đã gõ, mà cũng không được mang HAI con số cùng
 * loại đánh nhau: khách sửa "0.5kW" thì "350W" của tin trước phải mất, không phải nối thêm.
 */
export function giuThongSo(moTa, nguon) {
  const t = String(moTa || '').trim();
  const them = [];
  for (const re of RE_THONG_SO) {
    if (re.test(t)) continue;                      // câu mới đã nêu loại này → số MỚI thắng
    const m = String(nguon || '').match(new RegExp(re.source, 'gi'));
    if (m) them.push(...m.map((x) => x.trim()).filter(Boolean));
  }
  const co = t.toLowerCase();
  return [t, ...[...new Set(them)].filter((x) => !co.includes(x.toLowerCase()))].filter(Boolean).join(' ');
}

// Biên CUỐI MỘT TỪ tiếng Việt. Không dùng `\b`: `\b` của JS chỉ tính chữ ASCII, nên sau "không"
// hay "là" (kết bằng chữ có dấu) nó KHÔNG thấy biên và cả mẫu trượt.
const HET_TU = '(?![\\p{L}\\p{N}])';
const NGAT = '[\\s,.!:;-]*';

// Tiền tố lễ phép đứng TRƯỚC chữ phủ định ("Dạ không…", "vâng không phải…", "ừ không…").
// Thiếu nó thì "Dạ không, là máy sấy thật ạ" — câu người Việt nói hàng ngày — trượt hẳn khỏi
// PHU_DINH_RE và rơi lại đúng lỗi PR #213 đi sửa (điểm 3 của người soát).
const LE_PHEP_DAU = `(?:(?:d[aạ]|v[aâ]ng|[uừ]|[oơ]k?e?)${HET_TU}${NGAT})?`;
// Câu khách PHỦ ĐỊNH tên bot vừa đoán ("không", "không phải", "sai rồi", "ko ạ", "nhầm").
const PHU_DINH_RE = new RegExp(
  `^\\s*${LE_PHEP_DAU}(?:kh[oô]ng|ko|kg|sai|nh[aầ]m|ch[uư]a\\s*[đd][uú]ng)${HET_TU}${NGAT}`
  + `(?:(?:ph[aả]i|[đd][uú]ng|r[oồ]i)${HET_TU}${NGAT})?`, 'iu');
// Từ đệm mở đầu phần tên khách nói lại ("là máy sấy…", "mà máy sấy…").
const DEM_DAU_RE = new RegExp(`^(?:l[aà]|m[aà]|n[oó]\\s*l[aà]|[đd][aâ]y\\s*l[aà])${HET_TU}${NGAT}`, 'iu');
// Từ xã giao ở cuối câu ("… ạ", "… nhé", "thật ạ"). Phải có dấu ngắt hoặc đầu chuỗi ở trước, nếu
// không thì "mica" bị cắt đuôi thành "mic". KHÔNG có "da" không dấu: "túi da", "ví bằng da" là
// CHẤT LIỆU, mà chất liệu đổi chương thuế (túi da 4202 ≠ túi nhựa) — điểm 3 của người soát PR #213.
const XA_GIAO_CUOI_RE = /(?:^|[\s,.!:;-])(?:ạ|a|nh[eé]|nha|nh[aá]|[oơ]i|th[eế]|v[aậ]y|dạ)\s*$/iu;
// Từ xã giao mở đầu câu XÁC NHẬN ("đúng, 350W" → "350W"). Cũng không nhận "da" không dấu.
const XAC_NHAN_DAU_RE = /^(?:[đd][uú]ng|oke|ok|chu[aẩ]n|v[aâ]ng|[uừ]|dạ)[,.\s]*/iu;

/** Bỏ từ xã giao đầu và cuối câu, giữ lại phần DỮ KIỆN khách nói. */
export function bocXaGiao(s) {
  let t = String(s || '').replace(XAC_NHAN_DAU_RE, '').trim();
  for (let i = 0; i < 3 && XA_GIAO_CUOI_RE.test(t); i += 1) t = t.replace(XA_GIAO_CUOI_RE, '').trim();
  return t;
}

/**
 * Khách có PHỦ ĐỊNH tên bot vừa đoán không, và nếu có thì tên nào được gửi Cổng?
 *
 * Bot hỏi "em hiểu là máy xay sinh tố đúng không ạ?" mà khách đáp "không, là máy sấy thật" thì
 * trước đây bot vẫn dán `tenGoiY` lên đầu rồi nối cả câu phủ định vào sau — Cổng nhận một tên
 * hàng lai mang CẢ HAI món và chữ "không" ("máy xay sinh tố không, là máy sấy thật ạ"). Hỏi xác
 * nhận tên mà không nghe câu trả lời "không" thì câu hỏi thành vô ích, và mã + số thuế in ra là
 * của món khách KHÔNG hỏi (Hiến pháp Điều III và VIII).
 *
 * CHỈ đọc khi câu bot đang treo ĐÚNG là câu xác nhận tên (`hoiXacNhanTen`). Không có cổng này thì
 * câu trả lời THUỘC TÍNH mở đầu bằng "không" cũng bị cắt mất chữ "không" và mất luôn tên hàng:
 * "không mạ kẽm, đúc DN50" → "mạ kẽm, đúc DN50" — bot nói NGƯỢC điều khách vừa nói, rồi in mã và
 * số thuế của mặt hàng khác mà khách không có cách nào biết (điểm 2, nặng nhất, của người soát
 * PR #213; Điều III và Điều VIII).
 *
 * @param {string} text Câu khách gõ
 * @param {{ tenGoiY?: string, tenGoc?: string, hoiXacNhanTen?: boolean }} phien Trạng thái hỏi lại
 * @returns {{ phuDinh: boolean, ten: string }} `ten`: tên dùng để gửi Cổng (rỗng = không đổi)
 */
export function docTraLoiTen(text, { tenGoiY = '', tenGoc = '', hoiXacNhanTen = false } = {}) {
  const s = String(text || '').trim();
  if (!hoiXacNhanTen) return { phuDinh: false, ten: '' };
  if (!PHU_DINH_RE.test(s)) return { phuDinh: false, ten: '' };
  // Phần SAU chữ phủ định là tên khách nói lại ("không phải, máy sấy thực phẩm 500W").
  const con = bocXaGiao(s.replace(PHU_DINH_RE, '').replace(DEM_DAU_RE, ''));
  // Khách chỉ nói "không", hoặc chỉ sửa THÔNG SỐ ("không, 0.5kW 220V") mà không nêu tên nào →
  // quay về tên KHÁCH ĐÃ GÕ (`tenGoc`), không dùng tên bot đoán (`tenGoiY`): tên vừa bị phủ định
  // không được tới Cổng. Phép thử là `coTenTrong` (đo phần CHỮ sau khi bóc thông số), không phải
  // "có ≥ 2 chữ cái" — đơn vị đo cũng có 2 chữ cái nên phép cũ làm tên hàng rụng hẳn (điểm 1
  // người soát PR #213 nêu). Thông số MỚI của khách vẫn được giữ, và thắng số cũ cùng loại.
  const goc = String(tenGoc || '').replace(LENH_DAU_RE, '').trim();
  const ten = coTenTrong(con) ? con : `${chuTrong(goc)} ${con}`.trim();
  return { phuDinh: true, ten: giuThongSo(ten, goc) || String(tenGoiY || '').trim() };
}

/**
 * Kết quả một nhánh hỏi lại. Kỷ luật hỏi lọc HẾT câu → khách đã NÊU đủ dữ kiện, nên tra luôn
 * (gửi tin rỗng thì khách mất lượt — Điều II) và KHÔNG gán giả định: chuỗi `giaDinh` của nhánh là
 * lời dành cho trường hợp khách TỪ CHỐI trả lời ("cứ tra đi"). Nói "em giả định 350W" khi khách
 * vừa tự gõ 350W là nói sai điều khách đã nói (Điều VIII) — điểm 4 người soát PR #203 nêu.
 *
 * `hoiXacNhanTen`: tin này CÓ hỏi "em hiểu là <tên> đúng không ạ?" hay không. Chỉ nhánh đó mới
 * được đọc câu "không…" của khách là phủ định TÊN (xem `docTraLoiTen`).
 */
export function ketQuaHoi({ s, tenGoiY, thieu, cauHoi, giaDinh, hoiXacNhanTen = false }) {
  if (!String(cauHoi || '').trim()) return { canHoi: false, giaDinh: null, thieu: [] };
  return { canHoi: true, tenGoc: s, tenGoiY, thieu, cauHoi, giaDinhMacDinh: giaDinh, hoiXacNhanTen };
}
