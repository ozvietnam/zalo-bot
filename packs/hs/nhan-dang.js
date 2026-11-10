// packs/hs/nhan-dang.js — LỚP NHẬN DẠNG: tin khách gõ là gì?
//
// Tách khỏi `ho-so.js` (Điều VI — mỗi tệp một trách nhiệm, dưới 300 dòng):
// ở đây chỉ có các PHÉP THỬ trên văn bản (lệnh ngắn, lệnh cấu trúc, câu hỏi, món khác, cùng món…),
// không đụng tới cấu trúc hồ sơ. Hồ sơ nằm ở `ho-so.js`, bộ lọc tạp âm ở `loc-tap-am.js`.

import { norm, parseLabeled, dai } from './input.js';

/** Lệnh ngắn trỏ vào hồ sơ đang xử lý — KHÔNG phải tên hàng. */
const LENH_TRO = [
  /^$/,
  /^(tra|tra\s*(hs|hscode|hs\s*code|ma\s*hs|ma)?|tra\s*(giup|ho|cho)(\s+(em|minh|toi|anh|chi))?)$/,
  /^(ok|oke|okie|okay|dung|chuan|xac nhan|dong y|yes|y|uh|u|vang|da)$/,
  /^(day|day nhe|day a|nay|nay nhe)$/,
  /^(tiep|tiep tuc|lam tiep|chay di|tra di|tra tiep)$/,
];

/** Những chuỗi KHÔNG BAO GIỜ được dùng làm tên hàng gửi Cổng (lỗi "phân loại hàng tên là tra"). */
const TEN_CAM = [
  ...LENH_TRO,
  /^(hs|hs\s*code|hscode|ma\s*hs|ma\s*so\s*hs|ma\s*so|ma)$/,
  /^(xem lai|xem lai tu dau|xem lai toan bo|phan loai lai|lam lai)$/,
  /^(hang moi|hang khac|bo qua|menu|chi tiet)$/,
  /^(co|khong|chua|roi|a|u|the|vay)$/,
];

/**
 * Từ KHÔNG mang thông tin mặt hàng: lời nhờ vả, đại từ chỉ trỏ, tên vật đựng thông tin (tem, nhãn, ảnh).
 * Câu chỉ gồm những từ này mà lại có một từ nhờ/hỏi thì KHÔNG phải tên hàng — đó là câu nhờ
 * ("Nhờ bot đọc tem nhãn này"). Chú thích ảnh dạng đó từng chiếm ô tên hàng, loại mất tên AI đọc được.
 */
const TU_VO_NGHIA = new Set(('nho bot em minh toi anh chi ban ad shop giup ho cho coi doc xem kiem check tra'
  + ' cai nay no do kia day tem nhan san pham mon hang la gi a ah nhe nha voi u um di duoc khong ma thu'
  + ' va vay the oi oi1 gium giup1 mot chut xin lam on').split(/\s+/));
/** Trong các từ trên, nhóm NHỜ/HỎI — phải có mặt mới coi là câu nhờ (để "tem nhãn" đứng một mình vẫn là hàng). */
const TU_NHO_HOI = new Set('nho giup ho coi doc xem kiem check tra gi xin lam'.split(/\s+/));

/** Câu chỉ nhờ bot xem/đọc, không nêu mặt hàng nào → không bao giờ dùng làm tên hàng. */
function laCauNhoVa(s) {
  const tu = chuan(s).split(/[^a-z0-9]+/).filter(Boolean);
  if (!tu.length || tu.length > 12) return false;
  if (!tu.every((w) => TU_VO_NGHIA.has(w))) return false;
  return tu.some((w) => TU_NHO_HOI.has(w));
}

/** Câu yêu cầu dựng lại hồ sơ từ đầu mạch. */
const XEM_LAI = /(xem\s*lai|doc\s*lai|ra\s*soat\s*lai|phan\s*loai\s*lai|lam\s*lai)/;
const XEM_LAI_PHAM_VI = /(tu\s*dau|toan\s*bo|tat\s*ca|het|moi\s*thong\s*tin|tu\s*truoc)/;

/** Dấu hiệu món hàng là CƠ KHÍ (chốt, kẹp, bản lề…) — dùng để bắt mâu thuẫn với chữ ON/OFF trên ảnh. */
export const CO_KHI_RE = /\b(chot|kep|khoa|ban le|tay nam|num|ke|gioang|vit|bu long|oc|lo xo|xoay|quarter.?turn|clamp|latch|hinge)\b/;
/** Dấu hiệu AI đọc ảnh đã hiểu sang hướng ĐIỆN. */
export const DIEN_RE = /\b(on\s*\/?\s*off|bat tat|cong tac|switch|dien|electric|relay|aptomat)\b/;

/** Chuẩn hoá chữ: bỏ dấu, bỏ dấu câu, gộp khoảng trắng. */
export const chuan = (s) => norm(s).replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Bỏ LỜI CHÀO/LỜI XÃ GIAO ở đầu tin ("đây nhé, …", "dạ …", "vâng …").
 *
 * Lời chào không phải dữ kiện mặt hàng: để nó lọt vào tên hàng gửi Cổng thì Cổng đọc cả câu
 * chào của khách ("đây nhé, chốt kẹp …") và có thể kéo mã sai (điểm [S26] của người soát).
 * Dùng CHUNG cho cả mô tả chữ (`themChu`) lẫn câu sửa (`themSua`) để hai đường bỏ giống nhau.
 */
export function boLoiChao(s) {
  return dai(s).replace(/^\s*(đây nhé|day nhe|đây|day|dạ|da|vâng|vang)\s*[,.:-]*\s*/i, '').trim();
}

/**
 * Bỏ LỜI NHỜ ở đầu mô tả: "tra hs máy xay sinh tố" → "máy xay sinh tố".
 *
 * "Tra hs" là câu khách nói VỚI BOT (lời nhờ tra mã), không phải món hàng. Để nó lọt vào
 * `tenHang` gửi Cổng thì Cổng đọc cả lời nhờ của khách (điểm [S25] của người soát: lệnh/lời
 * nhờ không bao giờ thành tên hàng). CHỈ bỏ dạng "tra + (mã|hs)"; KHÔNG bỏ chữ "tra" trần vì
 * "tra sứ đồ gốm" là tên hàng (tra = gốm).
 */
export function boYeuCauDau(s) {
  const t = String(s ?? '');
  const out = t.replace(/^\s*tra\s+(?:m[ãa]\s+s[oố]\s+hs|m[ãa]\s+hs|hs\s*code|hs)\b\s*[:,.-]*\s*/i, '').trim();
  return out || t.trim();
}

/** Tin chỉ trỏ vào hồ sơ đang xử lý (lệnh ngắn), không mang mô tả hàng mới. */
export function laLenhTroHoSo(s) {
  const n = chuan(s);
  if (n.length > 24) return false;
  return LENH_TRO.some((re) => re.test(n));
}

/** Chuỗi không được dùng làm tên hàng gửi Cổng. */
export function laTenHangCam(s) {
  const n = chuan(s);
  if (!n) return true;
  if (laCauNhoVa(s)) return true;
  return TEN_CAM.some((re) => re.test(n));
}

/** Khách/nhân viên yêu cầu xem lại toàn bộ thông tin đã gửi. */
export function laCauXemLai(s) {
  const n = chuan(s);
  return XEM_LAI.test(n) && XEM_LAI_PHAM_VI.test(n);
}

/**
 * Từ quá chung để nhận ra một món: chất liệu, vật đựng, từ nối. Trùng những từ này KHÔNG phải
 * dấu hiệu cùng món ("nước ép trái cây" ↔ "máy bơm nước ly tâm" chỉ chung chữ "nước").
 */
const TU_CHUNG = new Set(('nhua thep kim loai inox nhom gang dong sat gom thuy tinh cao su go giay vai nuoc dien'
  + ' hang mon cai bo chiec loai dung cho vao ban moi cu 100 may thiet bi dung cu phu kien linh'
  + ' kien chat lieu cong thong hs code ma').split(/\s+/));

/**
 * Danh từ chỉ LOẠI VẬT — dùng cho phép thử "tin này có gọi tên một vật không?" (`laMonKhac`).
 *
 * Phải là một tập RIÊNG, không được dùng `TU_CHUNG`: `TU_CHUNG` là tập từ cần **loại bỏ** khi so
 * khớp hai mô tả (nghĩa ngược hẳn) và nó chứa cả từ hội thoại ("hang", "ban", "cho", "moi"), nên
 * lấy nó làm phép thử thì câu "bên em nhập hàng này về bán lẻ ạ" cũng tính là gọi tên một vật →
 * `laMonKhac` trả true → hồ sơ bị xoá và chính câu đó thành tên hàng gửi Cổng (điểm [S16]).
 * Cố ý KHÔNG chứa tên trường (`chat lieu`, `model`): câu chỉ khai một trường không phải món khác.
 * Cố ý NGẮN và chỉ gồm danh từ KHÔNG trùng từ hội thoại sau khi bỏ dấu: "van" (↔ "vẫn"),
 * "hop" (↔ "hợp"), "chao" (↔ "chào"), "tui" (↔ "tui"), "cap" (↔ "cấp") bị loại khỏi tập này. Thiếu
 * một loại vật thì hậu quả là tin đó ở lại hồ sơ cũ (khách vẫn thoát được bằng "hàng mới: …") —
 * nhẹ hơn hẳn chiều ngược lại: xoá hồ sơ rồi tra mã trên một câu hội thoại.
 */
const TU_LOAI_VAT = new Set(('chot kep khoa gioang vit bulong oc num nut truc bom quat phich'
  + ' relay contactor piston phot xilanh puly motor but giuong').split(/\s+/));

/** Mã/model riêng: có cả chữ và số, đủ dài để không trùng ngẫu nhiên (QCTHL0525, E2B). */
export const laMaRieng = (w) => w.length >= 5 && /[a-z]/.test(w) && /\d/.test(w);
/** Tách câu thành từ (bỏ dấu). */
export const tachTu = (s) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Tin mới có nói về CÙNG MỘT MÓN với lượt đang chờ bổ sung? (issue #170, yêu cầu 3)
 *
 * Chỉ coi là cùng món khi tin mới nhắc lại ĐẶC TRƯNG của món cũ: một mã/model riêng,
 * hoặc ít nhất HAI từ nội dung (bỏ chất liệu và từ phổ thông). Trùng một từ chung là không đủ:
 * khách hỏi món MỚI trong lúc lượt `CAN_DU_KIEN` của món cũ còn mở sẽ bị nhồi vào lượt cũ
 * và nhận mã của món khác — sai mã, sai thuế (Hiến pháp Điều III).
 */
export function cungMonVoi(text, tenHangCu) {
  const n = ` ${tachTu(text).join(' ')} `;
  if (n.trim().length === 0) return false;
  const co = (w) => n.includes(` ${w} `);
  const tu = [...new Set(tachTu(tenHangCu).filter((w) => w.length >= 3))];
  if (!tu.length) return false;
  if (tu.some((w) => laMaRieng(w) && co(w))) return true;
  const dacTrung = tu.filter((w) => !TU_CHUNG.has(w));
  return dacTrung.filter((w) => co(w)).length >= 2;
}

/**
 * LỆNH CẤU TRÚC của bot (menu, chọn gói, lời chào, "chi tiết", xem kết quả lượt).
 * Hồ sơ đang mở KHÔNG được nuốt những tin này: nuốt là khách mất đường thoát — gõ "menu"
 * không ra menu, gõ "4" không chọn được gói (issue #170, người soát đo trên Lõi thật).
 * Các mẫu dưới đây đi theo `packs/hs/router.js`: sửa router thì soát lại chỗ này.
 */
const LENH_CAU_TRUC = [
  /^\/?(start|help|menu|goi|cac goi|huong dan|hd|\?)$/,
  /^(hi|hello|xin chao|chao|alo)( bot| ban)?$/,
  /^(chi tiet|xem chi tiet|chi tiet day du|chi tiet day|giay to|xem giay to|giay to chi tiet)$/,
  /^(?:(?:chon|dung|vao|mo|sang|chuyen)\s+)?goi\s*(?:so\s*)?\d\b/,
  /^(?:chon|dung)\s+\d\b/,
  /^\d$/,
  /^(ket qua|kq)\b.*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
  // Nhờ bot làm VIỆC KHÁC (gói 4-7): là yêu cầu chuyển việc, không phải dữ kiện của mặt hàng.
  /\b(soat|kiem tra) (to khai|mo ta)\b/,
  /\b(giai trinh|ap ma|tham van|tranh chap)\b/,
  /\b(nhan hieu|so huu tri tue|shtt|hang gia)\b/,
  /\b(mo ta khai|viet mo ta|soan mo ta)\b/,
  /\b(chu giai|tien le|hieu luc|thong tu|nghi dinh)\b/,
];

/** Tin là lệnh cấu trúc của bot, không phải dữ kiện mặt hàng. */
export function laLenhCauTruc(s) {
  const n = chuan(s);
  if (!n || n.length > 40) return false;
  return LENH_CAU_TRUC.some((re) => re.test(n));
}

/** Khách tự báo đổi món ("hàng mới", "hàng khác", "bỏ qua") → mở hồ sơ mới, không gộp vào hồ sơ cũ. */
const HANG_MOI_RE = /^(hang moi|hang khac|mon moi|mon khac|doi hang|bo qua|chuyen sang)\b/;
export function laCauHangMoi(s) {
  return HANG_MOI_RE.test(chuan(s));
}

/** Bỏ tiền tố "hàng mới:" trước khi gửi Cổng — "hàng mới" không phải một phần tên hàng. */
export function boTienToHangMoi(s) {
  const t = String(s || '');
  if (!laCauHangMoi(t)) return t;
  return t.replace(/^\s*\S+\s+\S+\s*[:,.-]*\s*/, '').trim() || t;
}

/**
 * Tin là MỘT MÓN KHÁC HẲN hồ sơ đang mở?
 *
 * Chỉ đúng khi khách tự báo đổi món, hoặc tin vừa GỌI TÊN một loại vật khác loại vật của hồ sơ cũ,
 * vừa đủ dài, vừa không nhắc lại đặc trưng nào của món cũ. Câu hỏi thêm về món cũ
 * ("thuế nhập khẩu bao nhiêu phần trăm ạ", "bên em nhập hàng này về bán lẻ ạ") KHÔNG gọi tên vật
 * nào nên vẫn là món cũ. Nhận lầm thì `index.js` xoá hồ sơ và tra mã HS trên chính câu hội thoại
 * đó — gắn mã + số thuế vào một thứ không phải mặt hàng (Điều III, VIII; người soát đo, điểm [S16]).
 *
 * `hoSo` là hồ sơ đang mở (đọc thẳng ô `moTa`) — lớp nhận dạng không cần biết cấu trúc hồ sơ.
 */
export function laMonKhac(text, hoSo) {
  const moTaCu = String(hoSo?.moTa ?? '').replace(/\s+/g, ' ').trim();
  if (!moTaCu) return false;
  if (laLenhTroHoSo(text) || laTenHangCam(text) || laCauXemLai(text)) return false;
  if (laCauHangMoi(text)) return true;
  const tu = tachTu(text);
  // Phép thử "tin có gọi tên một vật không" phải dùng `TU_LOAI_VAT`. Bản cũ dùng `TU_CHUNG` —
  // tập từ cần LOẠI khi so khớp, chứa cả từ hội thoại ("hang", "ban", "cho", "moi") — nên gần như
  // câu nào cũng "gọi tên một vật" và thành món khác.
  const vat = tu.filter((w) => TU_LOAI_VAT.has(w));
  if (!vat.length) return false;
  // Gọi đúng loại vật của hồ sơ cũ ("chốt kẹp này bằng thép…") → vẫn là món cũ, nói thêm thông số.
  const vatCu = new Set(tachTu(moTaCu).filter((w) => TU_LOAI_VAT.has(w)));
  if (vat.every((w) => vatCu.has(w))) return false;
  const noiDung = tu.filter((w) => !TU_CHUNG.has(w) && w.length >= 2);
  if (noiDung.length < 4) return false;            // câu ngắn bổ sung thông số thì vẫn là món cũ
  return !cungMonVoi(text, moTaCu);
}

/** Các ô hồ sơ có NHÃN khi khách gõ ("chất liệu: …", "model: …"). */
export const TRUONG = [
  { key: 'moTa', nhan: ['tên hàng', 'ten', 'hàng', 'sản phẩm', 'mặt hàng', 'tên', 'mô tả'] },
  { key: 'chatLieu', nhan: ['chất liệu', 'vật liệu', 'chat lieu'] },
  { key: 'congDung', nhan: ['công dụng', 'dùng để', 'mục đích', 'chức năng'] },
  { key: 'thongSo', nhan: ['thông số', 'thông số kỹ thuật', 'spec', 'quy cách'] },
  { key: 'thuongHieu', nhan: ['thương hiệu', 'nhãn hiệu', 'hiệu', 'brand'] },
  { key: 'model', nhan: ['model', 'mã model', 'ký hiệu'] },
];

/** Tin khai theo nhãn ("chất liệu: …", "model: …") → dữ kiện của ô đó, không phải chữ tự do. */
export function coNhanTruong(text) {
  const { values } = parseLabeled(String(text || ''), TRUONG);
  return Object.keys(values).length > 0;
}
