// packs/hs/loc-tap-am.js — BỘ LỌC TẠP ÂM: phần nào của tin khách nói về MẶT HÀNG?
//
// Tách khỏi `ho-so.js` (Điều VI — mỗi tệp một trách nhiệm, dưới 300 dòng).
// Bộ lọc này dùng CHUNG cho chú thích ảnh VÀ tin chữ: cùng một luật, một chỗ (điểm [S16]).

import { dai } from './input.js';
import { chuan, tachTu, laMaRieng, coNhanTruong } from './nhan-dang.js';
import { coThongSo } from './dien-cho-thieu.js';

/**
 * TẠP ÂM trong chú thích ảnh — chữ khách gõ kèm ảnh mà KHÔNG nói gì về mặt hàng:
 * thời gian, cảm thán/xã giao, nói về chính tấm ảnh, nhờ việc khác, giục.
 */
const TAP_AM_RE = [
  /\d{1,2}\s*(h|gio|giờ)\s*\d{0,2}\b/,                      // "10h03", "3 giờ"
  /\b(sang|trua|chieu|toi|hom|ngay|mai|nay|qua|tuan|thang|luc|vua|roi)\b.*\b(nay|qua|truoc|sau|mai|roi)\b/,
  /\b(can gap|gap nhe|gap qua|som nhe|nhanh nhe|giup em voi|nhanh giup|cho em som)\b/,
  /\b(thong cam|xin loi|cam on|thanks|nhe anh|nhe chi|a nhe|em cam on)\b/,
  /\b(anh|hinh|pic|photo)\b.*\b(mo|xau|toi|nghieng|xoa|khong ro|hong|loi)\b/,  // nói về chính tấm ảnh
  /\b(chup|gui|up|dang)\b.*\b(lai|them|sau|nua|gium|giup)\b/,
  /\b(bao gia|gia bao nhieu|chi phi|thanh toan|cong no|chuyen khoan)\b/,
];
/** SO SÁNH BÊN LỀ ("giống công tắc điện", "như cái này") — luôn bỏ, kể cả khi có từ hàng hoá. */
const SO_SANH_RE = /\b(giong|nhu|tuong tu|kieu nhu|na na|trong giong|nhin giong)\b/;
/**
 * Từ mang nghĩa HÀNG HOÁ: loại vật, chất liệu, công dụng, quy cách. Mệnh đề không có từ nào → bỏ.
 *
 * Tập này KHÔNG được chứa từ hay gặp trong hội thoại. Bỏ dấu xong "bán" và "bản" thành cùng một
 * chuỗi ("ban"), "thông" của "thông tin" cũng vậy — từng làm câu hội thoại ("hàng này em nhập từ
 * Trung Quốc về bán lẻ ạ", "anh ơi cho em hỏi thêm thông tin gì nữa không") sống sót và đi thẳng
 * vào `tenHang` gửi Cổng (người soát đo, điểm [S16]). Thiếu một từ thì hậu quả nhẹ hơn chiều
 * ngược lại: mệnh đề đó bị bỏ (khách gõ lại là được), còn thừa một từ thì tạp âm lọt vào tên hàng.
 */
const TU_HANG_HOA = new Set(('chot kep khoa num nut truc vit bulong oc xo bom quat pich relay contactor piston phot'
  + ' xilanh puly motor but giuong gioang vo may nhua thep inox nhom gang sat gom thuy tinh cao su go giay vai'
  + ' kim composite abs pvc dien xuat xu model').split(/\s+/));

/**
 * Cụm từ mang nghĩa HÀNG HOÁ gồm nhiều từ — so TRÊN CHỮ CÓ DẤU, không bỏ dấu: "bản lề" và
 * "bán lẻ" khác nhau ở dấu, bỏ dấu là trùng ("ban le"). Khách gõ không dấu thì cụm không khớp →
 * mệnh đề bị bỏ — hướng an toàn (thiếu dữ liệu còn hơn dữ liệu sai).
 */
const TU_HANG_HOA_CUM = ['chất liệu', 'công dụng', 'dùng để', 'mục đích', 'chức năng', 'công suất', 'áp điện',
  'áp suất', 'thông số', 'quy cách', 'kích thước', 'đường kính', 'thương hiệu', 'ký hiệu', 'nhãn hiệu',
  'mã hiệu', 'thiết bị', 'bản lề', 'tay nắm', 'xuất xứ', 'đóng gói', 'bao bì', 'trọng lượng', 'cơ khí',
  'linh kiện', 'phụ kiện', 'mô tả', 'mặt hàng', 'hàng hóa', 'nước sản xuất', 'đóng mở'];

/**
 * "10h03" lọt `laMaRieng` (có chữ + số, ≥5 ký tự) nên mệnh đề "em gửi ảnh lúc 10h03" từng được
 * giữ làm "có mã hàng". Giờ/phút không bao giờ là mã hàng → loại khỏi phép thử mã.
 */
const GIO_RE = /^\d{1,2}(h|g)\d{0,2}$/;
const laMaHangHoa = (w) => laMaRieng(w) && !GIO_RE.test(w);

/** Mệnh đề chú thích có mang nghĩa hàng hoá? */
function coNghiaHangHoa(s) {
  const th = String(s || '').toLowerCase();
  if (TU_HANG_HOA_CUM.some((c) => th.includes(c))) return true;
  // Chỉ có thông số đo được ("350W 220V", "1.5HP") cũng là dữ kiện MẶT HÀNG: đây chính là câu
  // trả lời khách gõ cho câu hỏi lại của bot. Bỏ nó thì hồ sơ mất thông tin và "xem lại toàn
  // bộ từ đầu" dựng lại thiếu thông số (yêu cầu 1 và 4 của issue #170).
  if (coThongSo(s)) return true;
  const tu = tachTu(s);
  if (tu.some((w) => laMaHangHoa(w))) return true;
  return tu.some((w) => TU_HANG_HOA.has(w));
}

/**
 * Lọc chú thích ảnh VÀ tin chữ: giữ phần nói về MẶT HÀNG, bỏ tạp âm hội thoại
 * (quyết thay CEO, điểm [S15]; mở rộng sang tin chữ ở điểm [S16]).
 *
 * Trước bản vá này `themAnh` nối THẲNG chú thích vào `moTa` qua `themChu`, nên `phan_loai_hs.tenHang`
 * mang cả "em gửi lúc 10h03, ảnh hơi mờ anh thông cảm, cái này giống công tắc điện". Mệnh đề so sánh
 * bên lề là nặng nhất: nó bơm đúng từ khoá hàng ĐIỆN vào mô tả — cơ chế đã đẩy issue #170 ra mã
 * 8538.90. Mô tả bẩn đi Cổng là lệch mã, lệch thuế (Hiến pháp Điều III).
 *
 * Tách theo MỆNH ĐỀ (dấu `,;.` và từ nối "nhưng/mà") rồi quyết từng mệnh đề, vì khách hay gõ dữ kiện
 * thật lẫn trong câu xã giao ("ảnh hơi mờ nhé anh, chất liệu thép không gỉ").
 * → { sach, bo }: `sach` để gộp vào hồ sơ, `bo` chỉ để log/đối chiếu, KHÔNG gửi Cổng.
 *
 * LUẬT 5 ("không mang nghĩa hàng hoá nào → bỏ") áp cho CẢ hai đường. Ở đường tin chữ, đây là đúng
 * lớp lỗi [S16]: câu hội thoại ("hàng này em nhập từ Trung Quốc về bán lẻ ạ") còn trong hồ sơ thì
 * đi vào mục "khách nói thêm" — mục in CÙNG DÒNG `Tên hàng:` — và thành tên hàng gửi Cổng. Câu SỬA
 * thật của khách vẫn sống vì có từ hàng hoá ("chữ on/off là đóng mở, không liên quan dòng điện" →
 * "điện"), còn đường trả lời câu hỏi mâu thuẫn (`themSua`) không đi qua bộ lọc này nên không mất gì.
 */
export function locTapAmAnh(caption) {
  const raw = dai(caption);
  if (!raw) return { sach: '', bo: [] };
  const menh = raw.split(/;+|(?<!\d)[,.]+|[,.]+(?!\d)|\s+(?:nhưng|nhung|mà|ma)\s+/i).map((x) => dai(x)).filter(Boolean);
  const sach = [];
  const bo = [];
  for (const m of menh) {
    const n = chuan(m);
    if (!n) continue;
    // 1-2. Khai theo nhãn, hoặc có mã/model riêng → GIỮ, kể cả khi lẫn chữ xã giao.
    if (coNhanTruong(m) || tachTu(m).some((w) => laMaHangHoa(w))) { sach.push(m); continue; }
    // 3. So sánh bên lề: bỏ kể cả khi có từ hàng hoá — đó chính là đường bơm từ khoá sai hướng.
    if (SO_SANH_RE.test(n)) { bo.push(m); continue; }
    // 4. Tạp âm hội thoại.
    if (TAP_AM_RE.some((re) => re.test(n))) { bo.push(m); continue; }
    // 5. Không mang nghĩa hàng hoá nào → bỏ (lời nhờ, cảm thán lạ, chữ vô nghĩa).
    if (!coNghiaHangHoa(m)) { bo.push(m); continue; }
    sach.push(m);
  }
  return { sach: sach.join(', '), bo };
}
