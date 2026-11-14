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
// `xuatXuCua` + `chuHoSoChoXuatXu` là PHÉP DÒ NƯỚC DUY NHẤT của gói (`input.js:559`), cũng là phép
// mà `packages.js:31` dùng để chốt nước đem đi tra. Nhập về đây để lớp ĐO hỏi đúng một câu hỏi:
// "khách đã nêu nước chưa?" — viết phép dò thứ hai là tự tạo chỗ cho hai nơi lệch nhau (OZV-802).
import { norm, NUOC, xuatXuCua, chuHoSoChoXuatXu } from './input.js';
// Nhận diện câu khách HỎI LẠI nằm ở `cau-hoi-khach.js` (Điều VI: mỗi tệp một trách nhiệm, dưới
// 300 dòng — bản vá vòng soát 5 đẩy tệp này lên 367 dòng). Xuất lại ở đây để `doc-tra-loi.js` và
// các test nhập từ một cửa như trước.
import { laCauHoiKhach, bocCumHoi, laHoiThuocTinh } from './cau-hoi-khach.js';

export { laCauHoiKhach, bocCumHoi, laHoiThuocTinh };

// Các ĐẠI LƯỢNG lớp hỏi lại có thể hỏi. Mỗi khoá dưới đây là một đại lượng; câu hỏi khai báo nó
// hỏi những đại lượng nào, nhờ đó `gomCau` biết câu nào đã thành vô ích.
export const CONG_SUAT_RE = /\b(\d+(?:[.,]\d+)?)\s*(w|kw|hp|wats?|watt|m[aã]\s*l[uự]c)\b/i;
export const DIEN_AP_RE = /\b(\d+)\s*(v|volt|volts?|vdc|vac)\b/i;
export const DUNG_TICH_RE = /\b(\d+(?:[.,]\d+)?)\s*(l|l[ií]t|liters?|ml)\b/i;
export const KICH_THUOC_RE = /\b(dn\d+|\d+(?:[.,]\d+)?\s*(mm|cm|m|inch|in|phi|ø|bar|mpa|psi|kg|g|tan|tấn))\b/i;
// Biên ĐẦU/CUỐI một từ tiếng Việt. KHÔNG dùng `\b`: `\b` của JS chỉ tính `[A-Za-z0-9_]`, nên mọi
// mẫu kết (hoặc mở) bằng chữ CÓ DẤU đều trượt — `CHAT_LIEU_RE.test('van bi đồng')`, `'tủ gỗ'`,
// `'chén sứ'`, `QUY_CACH_RE.test('ống thép đúc')`, `CONG_DUNG_RE.test('dùng để sấy')` đều trả
// `false` trong khi bản KHÔNG dấu trả `true` (vòng soát 3 của PR #213). Ba mẫu này là mẫu ĐO của
// `daNeu`: đo ra `false` thì bot hỏi lại đúng điều khách vừa nêu, và `coTenTrong` không bóc được
// cụm công dụng nên đếm nó thành tên mới ⇒ TÊN HÀNG RỤNG HẲN khỏi tin gửi Cổng.
const DAU_TU = '(?<![\\p{L}\\p{N}])';
const CUOI_TU = '(?![\\p{L}\\p{N}])';
/** Mẫu ĐO một cụm từ tiếng Việt: biên từ tính cả chữ có dấu. */
const tu = (than) => new RegExp(`${DAU_TU}(?:${than})${CUOI_TU}`, 'iu');

// Mỗi nhánh viết ĐỦ dấu của mọi chữ ("thuỷ" lẫn "thủy", "cầm" lẫn "cam"): lớp ĐO chạy trên chữ
// NGUYÊN VĂN của khách, không chạy trên chuỗi đã `norm()`, vì `coTenTrong` còn dùng chính mẫu này
// để bóc cụm công dụng ra khỏi chữ nguyên văn trước khi đo phần tên.
export const CHAT_LIEU_RE = tu('inox(\\s*\\d+)?|th[eé]p(\\s*kh[oô]ng\\s*g[iỉ])?|gang|nh[uự]a|nh[oô]m'
  // "thuỷ" và "thủy" là HAI cách đặt dấu của cùng một chữ (dấu trên `u` hay trên `y`), người Việt
  // gõ cả hai — mẫu phải ăn cả hai, không thì "bình thuỷ tinh" đo ra `false`.
  + '|[đd][oồ]ng|g[oỗ]|cao\\s*su|da|s[uứ]|th[uủ][yỷ]\\s*tinh|cotton|poly|polyester');
export const CONG_DUNG_RE = tu('d[uù]ng\\s*cho|d[uù]ng\\s*trong|d[uù]ng\\s*[đd][eể]|chuy[eê]n\\s*d[uù]ng'
  + '|gia\\s*d[uụ]ng|c[oô]ng\\s*nghi[eệ]p|t[uự]\\s*[đd][oộ]ng|c[aâầ]m\\s*tay|g[ií]a\\s*[đd][iì]nh|ly\\s*t[aâ]m');
export const QUY_CACH_RE = tu('tay\\s*g[aạ]t|m[aạ]\\s*k[eẽ]m|[đd][uúự]c|h[aà]n|kh[oô]ng\\s*d[aầ]u');

/** Trần số câu trong MỘT tin hỏi lại. */
export const TRAN_CAU = 3;

/**
 * Mệnh đề có THÔNG SỐ ĐO ĐƯỢC không (công suất, điện áp, dung tích, kích thước)?
 * Dùng ở `loc-tap-am.js`: một mệnh đề chỉ có thông số ("350W 220V") là DỮ KIỆN MẶT HÀNG,
 * không phải tạp âm hội thoại — bỏ nó thì hồ sơ mất thông tin khách vừa cung cấp
 * (yêu cầu 1 và 4 của issue #170: hồ sơ tích luỹ, "xem lại từ đầu" phải dựng lại được).
 */
export function coThongSo(s) {
  const t = String(s || '');
  return CONG_SUAT_RE.test(t) || DIEN_AP_RE.test(t) || DUNG_TICH_RE.test(t) || KICH_THUOC_RE.test(t);
}

const CU_TRA_RE = /(khong|ko)\s*(ro|biet|chac|quan\s*tam|sao)|cu\s*(tra|lam|chay|tim|cho)|tra\s*(luon|di|nhanh)|mac\s*dinh|sao\s*cung\s*duoc|chiu/i;

/** Nhận diện câu khách nói "không rõ / cứ tra đi / tra luôn đi". */
export function nhanDienCuTraDi(text) {
  const n = norm(String(text || ''));
  return CU_TRA_RE.test(n);
}

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
    // Nước nhập: KHÔNG regex riêng. `xuatXuCua` trả `giaDinh: true` đúng khi không tìm thấy nước
    // nào trong chữ của khách, tức "chưa nêu" — đảo cờ đó ra là xong (OZV-802, mục 3 của #177).
    // Hồ sơ mạch đọc qua `chuHoSoChoXuatXu` (gồm cả `chuAnh`) nên nước khách nói ở LƯỢT TRƯỚC vẫn
    // tính là đã nêu, bot không hỏi lại (#170).
    xuatXu: !xuatXuCua(sSach, chuHoSoChoXuatXu(h)).giaDinh,
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

/** Bỏ các đoạn thông số đo được khỏi một chuỗi, giữ nguyên phần chữ còn lại. */
export function boThongSo(s) {
  let t = String(s || '');
  for (const x of thongSoTrong(t)) t = t.split(x).join(' ');
  return t.replace(/\s+/g, ' ').trim();
}

const TU_DAN_XX_RE = /^(?:xu[aấ]t|x[uứ]|xx|nh[aậ]p|kh[aẩ]u|s[aả]n|sx|h[aà]ng|t[uừ]|c[uủ]a|[oở]|t[aạ]i|made|in|from|origin)$/iu;
const TU_DAN_XX_DAU_RE = /^(?:n[uư][oớ]c|nuoc|tu|tai|o|cua)$/iu;
const sachTu = (w) => String(w || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
const laCumNuoc = (phan, sau = '', coTuDan = false) => {
  if (!phan.length || xuatXuCua(phan.join(' ')).giaDinh) return false;
  if (phan.length > 1) {
    if (NUOC[norm(phan.join(' '))]) return true;
    return xuatXuCua(phan.slice(1).join(' ')).giaDinh && xuatXuCua(phan.slice(0, -1).join(' ')).giaDinh;
  }
  const w = sachTu(phan[0]);
  if (/^(?:nh[aấ]t|[đd][uúụ]c)$/iu.test(w)) return false;
  if (/^m[yỹ]$/iu.test(w) && /^ph[aẩ]m$/iu.test(sachTu(sau))) return false;
  if (/^h[aà]n$/iu.test(w)) return /^H[aà]n$/u.test(w) || coTuDan;
  return true;
};

/**
 * Bóc CỤM XUẤT XỨ ("hàng Nhật", "từ Trung Quốc", "xuất xứ Hàn Quốc", "made in China") khỏi chuỗi.
 * Dùng chính `xuatXuCua` (phép dò nước duy nhất của gói, OZV-802) trên đoạn tối tiểu 3 → 2 → 1 từ
 * rồi lùi bóc các từ dẫn xuất xứ đứng ngay trước nó. Chỉ dùng khi ĐO tên hàng, không dùng để cắt
 * chữ gửi Cổng (nước đổi mức thuế nên phải đi nguyên văn tới Cổng).
 */
export function bocCumXuatXu(s) {
  const cacTu = String(s || '').split(/\s+/).filter(Boolean);
  const giu = [];
  const laTuDanCuoi = () => {
    if (!giu.length) return false;
    const w = sachTu(giu[giu.length - 1]);
    if (TU_DAN_XX_RE.test(w)) return true;
    return TU_DAN_XX_DAU_RE.test(w) && giu.slice(0, -1).every((x) => TU_DAN_XX_RE.test(sachTu(x)));
  };
  for (let i = 0; i < cacTu.length;) {
    let dai = 0;
    const coTuDan = laTuDanCuoi();
    for (const k of [3, 2, 1]) {
      if (i + k <= cacTu.length && laCumNuoc(cacTu.slice(i, i + k), cacTu[i + k], coTuDan)) { dai = k; break; }
    }
    if (dai) {
      while (laTuDanCuoi()) giu.pop();
      i += dai;
      continue;
    }
    giu.push(cacTu[i]);
    i += 1;
  }
  return giu.join(' ');
}

/** Phần CHỮ tên hàng của một chuỗi: bỏ hết thông số đo được và cụm xuất xứ ("máy bơm 1.5HP hàng Nhật" → "máy bơm"). */
export function chuTrong(s) {
  return bocCumXuatXu(boThongSo(s)).replace(/\s+/g, ' ').trim();
}

// Cụm chữ là CÂU TRẢ LỜI cho câu bot vừa hỏi, KHÔNG phải tên hàng. Nhánh nghi gõ nhầm hỏi kèm
// phần `moRong` ("Gia dụng hay công nghiệp?"), nhánh điện gia dụng hỏi "dùng cho gia đình hay
// công nghiệp" — khách đáp "không, loại gia dụng 350W" là trả lời CÔNG DỤNG, mà `coTenTrong` cũ
// đếm nó thành tên mới nên tên hàng thật rụng hẳn (điểm 3 vòng soát 2 của PR #213). Công dụng là
// một ĐẠI LƯỢNG riêng trong `daNeu`, không phải tên món, nên bóc nó ra trước khi ĐO phần chữ.
// Chỉ bóc khi ĐO, không bóc khi dựng mô tả gửi Cổng: "máy sấy thực phẩm công nghiệp" vẫn phải đi
// nguyên văn tới Cổng vì công dụng có thể đổi dòng thuế.
const LOAI_HANG_RE = new RegExp(`${DAU_TU}(?:lo[aạ]i|ki[eể]u|d[aạ]ng|h[aà]ng|m[oó]n|c[aá]i|b[aằ]ng|ch[aấ]t\\s*li[eệ]u)${CUOI_TU}`, 'giu');

/**
 * Chuỗi này có TÊN HÀNG không? Tên hàng nằm ở phần CHỮ, nên phải bóc thông số, xuất xứ và các đại
 * lượng thuộc tính (`CONG_DUNG_RE`, `CHAT_LIEU_RE`, `QUY_CACH_RE`) ra trước khi đo (OZV-851).
 * Đo thẳng "có ≥ 2 chữ cái" trên cả chuỗi là nhận lầm ĐƠN VỊ (kW, VAC, mm, kg, ml), NƯỚC NHẬP
 * ("hàng Nhật", "từ Trung Quốc") hay CHẤT LIỆU ("bằng inox") thành tên mới ⇒ tên thật rụng hẳn.
 */
export function coTenTrong(s) {
  const chu = chuTrong(bocCumHoi(s))
    .replace(new RegExp(CONG_DUNG_RE.source, 'giu'), ' ')
    .replace(new RegExp(CHAT_LIEU_RE.source, 'giu'), ' ')
    .replace(new RegExp(QUY_CACH_RE.source, 'giu'), ' ')
    .replace(LOAI_HANG_RE, ' ');
  return /\p{L}{2}/u.test(chu.replace(/[^\p{L}\s]/gu, ' '));
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

// Các hàm ĐỌC câu khách trả lời (`docTraLoiTen`, `bocXaGiao`, `laXacNhan`, `bocDemDau`) và các
// mẫu chữ của chúng nằm ở `doc-tra-loi.js` — đúng phân công ghi ở đầu bốn tệp: tệp này ĐO điều
// khách đã nêu, `doc-tra-loi.js` ĐỌC câu trả lời. Chuyển ở vòng soát 5 của PR #213 vì bản vá hai
// điểm người soát chặn đẩy tệp này lên 367 dòng, vượt trần 300 của Điều VI.

/**
 * Kết quả một nhánh hỏi lại. Kỷ luật hỏi lọc HẾT câu → khách đã NÊU đủ dữ kiện, nên tra luôn
 * (gửi tin rỗng thì khách mất lượt — Điều II) và KHÔNG gán giả định: chuỗi `giaDinh` của nhánh là
 * lời dành cho trường hợp khách TỪ CHỐI trả lời ("cứ tra đi"). Nói "em giả định 350W" khi khách
 * vừa tự gõ 350W là nói sai điều khách đã nói (Điều VIII) — điểm 4 người soát PR #203 nêu.
 *
 * `hoiXacNhanTen`: tin này CÓ hỏi "em hiểu là <tên> đúng không ạ?" hay không. Chỉ nhánh đó mới
 * được đọc câu "không…" của khách là phủ định TÊN (xem `docTraLoiTen`).
 *
 * `hoiThuocTinh`: tin này hỏi THUỘC TÍNH của mặt hàng (chất liệu / quy cách / công dụng) chứ không
 * hỏi TÊN món. Nhánh thuộc tính thì câu đáp của khách là thuộc tính của ĐÚNG món đó, nên không
 * được đọc thành tên món mới (xem `laHoiThuocTinh` và `xuLyTraLoiHoiLai`).
 */
export function ketQuaHoi({ s, tenGoiY, thieu, cauHoi, giaDinh, hoiXacNhanTen = false, hoiThuocTinh = false }) {
  if (!String(cauHoi || '').trim()) return { canHoi: false, giaDinh: null, thieu: [] };
  return {
    canHoi: true, tenGoc: s, tenGoiY, thieu, cauHoi, giaDinhMacDinh: giaDinh, hoiXacNhanTen, hoiThuocTinh,
  };
}
