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

/** Câu "cho em xin thêm …" CHỈ nêu đại lượng còn thiếu — không xin lại điều khách vừa gõ. */
export function cauXinThem(muc, co, duoi) {
  const con = muc.filter((m) => !co[m.khoa]);
  if (!con.length) return '';
  return `Anh/chị cho em xin thêm ${con.map((m) => m.chu).join(' và ')} nhé — ${duoi}`;
}

/**
 * Kết quả một nhánh hỏi lại. Kỷ luật hỏi lọc HẾT câu (khách đã nêu đủ) → không hỏi lượt nào nữa,
 * trả giả định như khi hết vòng hỏi: gửi tin rỗng thì khách mất lượt (Điều II).
 */
export function ketQuaHoi({ s, tenGoiY, thieu, cauHoi, giaDinh }) {
  if (!String(cauHoi || '').trim()) return { canHoi: false, giaDinh, thieu: [] };
  return { canHoi: true, tenGoc: s, tenGoiY, thieu, cauHoi, giaDinhMacDinh: giaDinh };
}
