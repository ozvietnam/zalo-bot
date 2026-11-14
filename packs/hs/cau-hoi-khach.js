// packs/hs/cau-hoi-khach.js — NHẬN DIỆN câu khách HỎI LẠI (không phải câu trả lời cho bot).
//
// Phân công của lớp hỏi lại, đúng Điều VI (mỗi tệp một trách nhiệm, dưới 300 dòng):
//   • `dien-cho-thieu.js` — DỰNG các nhánh hỏi theo mặt hàng;
//   • `ky-luat-hoi.js`    — ĐO điều khách đã nêu, lọc/gom câu;
//   • `doc-tra-loi.js`    — ĐỌC câu trả lời và chốt mô tả tra cứu;
//   • tệp này             — nhận diện câu khách HỎI LẠI và bóc cụm hỏi ra khi ĐO.
//
// Tách ra ở vòng soát 5 của PR #213: bản vá hai điểm người soát chặn đẩy `ky-luat-hoi.js` lên 367
// dòng, vượt trần 300 của Điều VI (cổng `test/core/wiki-no-lon-dong.test.mjs` bắt đỏ). Cùng cách
// đã làm ở vòng soát 2 (`coThongSo`/`nhanDienCuTraDi` → `ky-luat-hoi.js`) và vòng soát 3
// (`xuLyTraLoiHoiLai` → `doc-tra-loi.js`): chuyển theo đúng ranh trách nhiệm.
//
// VIỆC NÀY GIẢI QUYẾT GÌ: khách hỏi lại một câu ("là sao ạ", "nghĩa là gì ạ") mà `coTenTrong` đếm
// chữ của câu hỏi thành TÊN HÀNG MỚI ⇒ tên hàng khách đã gõ rụng hẳn và bot đi tra mã của chữ
// "sao" — mã chắc chắn sai, mà mô tả khai báo in thẳng cho khách dùng (Điều III, Điều VIII).
import { norm } from './input.js';

// Biên ĐẦU/CUỐI một từ tiếng Việt. KHÔNG dùng `\b`: `\b` của JS chỉ tính `[A-Za-z0-9_]`, nên mọi
// mẫu mở (hoặc kết) bằng chữ CÓ DẤU đều trượt (bệnh đã ghi ở `ky-luat-hoi.js`, vòng soát 3).
const DAU_TU = '(?<![\\p{L}\\p{N}])';
const CUOI_TU = '(?![\\p{L}\\p{N}])';

// Cụm chữ HỎI của khách. Viết đủ dấu MỌI chữ, và `laCauHoiKhach` còn đo thêm trên chuỗi đã
// `norm()` vì khách Zalo gõ không dấu rất nhiều ("la sao a").
//
// Mẫu "… là gì" phải viết ĐỦ cụm, đừng tách riêng "gì": chữ "gia" trong "gia dụng", "gia đình"
// khớp `g[iì]` nếu không chốt biên cuối từ, nên câu TRẢ LỜI công dụng ("không, loại gia dụng
// 350W") bị bắt oan thành câu hỏi rồi rụng mất tên hàng (đỏ `[#213-7]` khi vá vòng soát 5).
const CUM_HOI = 'l[aà]\\s*sao|th[iì]\\s*sao|t[aạ]i\\s*sao|sao\\s*(?:v[aậ]y|th[eế]|c[oơ])'
  + '|l[aà]\\s*g[iì]|g[iì]\\s*(?:v[aậ]y|c[oơ])|(?:nh[uư]\\s*)?th[eế]\\s*n[aà]o'
  + '|(?:kh[oô]ng|ch[uư]a|ko)\\s*(?:hi[eể]u|r[oõ]\\s*[yý])|hi[eể]u\\s*sao';
const HOI_RE = new RegExp(`${DAU_TU}(?:${CUM_HOI})${CUOI_TU}`, 'iu');

/**
 * Câu khách gõ là CÂU HỎI của khách, không phải câu trả lời cho bot?
 *
 * Chép cách làm của ai-live (`phong/nguon-tiktok.js:28` — `laCauHoi`): đo bằng CỤM CHỮ HỎI, không
 * đo bằng dấu "?" trơ. Dấu "?" trơ bắt oan cả câu khách sửa tên có kèm dấu hỏi ("máy sấy thực
 * phẩm?") — bỏ phần chữ của câu đó là làm rụng đúng tên khách vừa đưa.
 */
export function laCauHoiKhach(s) {
  const t = String(s || '').trim();
  return Boolean(t) && (HOI_RE.test(t) || HOI_RE.test(norm(t)));
}

// Đại từ chỉ người/vật đi kèm trong câu hỏi ("Ý EM là sao", "CÁI NÀY là gì") và chữ "nghĩa".
// Chỉ bóc khi câu ĐÃ được `laCauHoiKhach` nhận là câu hỏi, và chỉ bóc khi ĐO — không bóc khi dựng
// mô tả gửi Cổng. Bóc vô điều kiện là cắt oan tên hàng chứa từ đồng âm.
const DAI_TU_HOI = '[yý]|em|anh|ch[iị]|m[iì]nh|b[aạ]n|n[oó]|[đd][aâ]y|[đd][oó]'
  + '|c[aá]i\\s*(?:n[aà]y|[đd][oó])|ngh[iĩ]a';
const BOC_HOI_RE = new RegExp(`${DAU_TU}(?:${CUM_HOI}|${DAI_TU_HOI})${CUOI_TU}`, 'giu');

/**
 * Bóc cụm HỎI ra khỏi câu, để `coTenTrong` không đếm chữ của câu hỏi thành tên hàng.
 * Câu không phải câu hỏi thì trả NGUYÊN VĂN — không cắt oan ("máy sấy thực phẩm ạ" giữ nguyên).
 */
export function bocCumHoi(s) {
  const t = String(s || '');
  if (!laCauHoiKhach(t)) return t;
  return t.replace(BOC_HOI_RE, ' ').replace(/[?¿]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Các đại lượng là THUỘC TÍNH của mặt hàng (không phải tên món). Nhánh nào đang hỏi một trong
// những thứ này thì câu đáp của khách là thuộc tính của ĐÚNG món đó.
//
// XUẤT RA để nhánh hỏi lại tự khai cờ `hoiThuocTinh` theo ĐÚNG danh sách này (`so-tay-hoi.js`).
// CHÉP LẠI DANH SÁCH NÀY SANG TỆP KHÁC CHÍNH LÀ CÁCH SINH RA HỒI QUY OZV-782: nơi dựng cờ dùng một
// bộ chữ, nơi đọc cờ dùng một bộ chữ khác, không ai thấy cho tới khi tên hàng rụng khỏi tin gửi
// Cổng — mà mã HS + thuế in ra vẫn trông như thật nên khách không có cách nào biết (Điều III, VIII).
// Cần thêm/bớt thì sửa ĐÚNG mảng này; nơi khác nhập nó về, không gõ lại.
//
// `congSuat` + `dienAp` vào danh sách ở OZV-799: Cổng hỏi `cong_suat` / `dien_ap` / `power` /
// `voltage` thì đó là xin THÔNG SỐ của đúng món khách đang tra, không phải hỏi "hàng tên gì".
// Thiếu hai khoá này mà chúng lại CÓ trong bảng `KHOA` (`so-tay-hoi.js:32-41`) nên `m.dai` không
// rỗng ⇒ mặc định an toàn của OZV-791 không che tới ⇒ cờ `false` tường minh ⇒ `doc-tra-loi.js` đọc
// "bằng inox" thành TÊN MÓN MỚI, "van bi" rụng hẳn. Đó là lần thứ TƯ của cùng lớp lỗi
// (#213 → OZV-782 → OZV-791 → OZV-799). Rà cả `KHOA`: mọi mục quy về đúng tám đại lượng dưới đây
// (chatLieu, quyCach, congDung, kichThuoc, dungTich, congSuat, dienAp, xuatXu) — danh sách này phủ
// cả tám, không còn mục nào ngoài.
//
// `xuatXu` vào danh sách ở OZV-802 (mục 3 của #177): khi bot hỏi nước nhập, câu đáp "hàng Nhật" /
// "Trung Quốc" là THUỘC TÍNH của đúng món khách đang tra, KHÔNG BAO GIỜ là tên món mới — không ai
// đi tra mã HS cho mặt hàng tên "Nhật Bản". Thiếu dòng này thì khách đáp nước là tên hàng rụng
// khỏi tin gửi Cổng, lần thứ NĂM của cùng lớp lỗi.
export const DAI_THUOC_TINH = [
  'chatLieu', 'quyCach', 'congDung', 'kichThuoc', 'dungTich', 'congSuat', 'dienAp', 'xuatXu',
];

// THÔNG SỐ: vừa là thuộc tính (khi Cổng hỏi thẳng chúng), vừa là thứ nhánh HỎI TÊN xin kèm.
// `dien-cho-thieu.js` hỏi "hàng này tên gì" luôn kèm `thieu: ['congSuat','dienAp']`, nên chỉ riêng
// `thieu` KHÔNG phân biệt được hai nhánh — nhánh thật đã khai cờ `hoiThuocTinh` tường minh rồi.
const DAI_THONG_SO = ['congSuat', 'dienAp'];

// Danh sách cho phép SUY từ `thieu` (phiên cũ, không có cờ): hẹp hơn, bỏ phần thông số.
// Dẫn xuất từ `DAI_THUOC_TINH` chứ không gõ lại — thêm đại lượng mới vào trên là tự có ở đây.
const DAI_SUY_TU_THIEU = DAI_THUOC_TINH.filter((k) => !DAI_THONG_SO.includes(k));

/**
 * Câu bot đang treo là câu hỏi THUỘC TÍNH (chất liệu/quy cách/công dụng/kích thước) chứ không
 * phải câu hỏi về TÊN món?
 *
 * Đây là phép phân biệt mà `xuLyTraLoiHoiLai` cần để quyết "tên khách vừa gõ THAY tên cũ" hay
 * "câu đáp là thuộc tính, giữ nguyên tên hàng". Vòng soát 4 treo nó vào `hoiXacNhanTen` — một
 * biến ĐỔI GIÁ TRỊ giữa các vòng hỏi (sau lần sửa tên thứ nhất, tên là do khách gõ nên bot thôi
 * hỏi xác nhận) nên lần sửa tên thứ HAI rơi lại đúng nhánh nối hai tên (vòng soát 5 của PR #213).
 * Cờ `hoiThuocTinh` do chính NHÁNH khai lúc dựng câu hỏi, không suy từ trạng thái vòng hỏi.
 *
 * Phiên cũ (và các test gọi hàm trực tiếp) không có cờ này thì suy từ `thieu`, và phép suy đó đọc
 * `DAI_SUY_TU_THIEU` chứ không đọc cả `DAI_THUOC_TINH`: nhánh hỏi TÊN cũng xin kèm công suất/điện
 * áp (`dien-cho-thieu.js`), nên thấy `thieu: ['congSuat','dienAp']` trơ thì KHÔNG kết luận được là
 * câu hỏi thuộc tính — đoán bừa về phía thuộc tính là nối hai tên hàng lại ("máy sấy thực phẩm máy
 * sấy công nghiệp", ca `[#213-13]`). Nhánh nào hỏi THẲNG công suất/điện áp thì đã khai cờ tường
 * minh qua `DAI_THUOC_TINH` ở `so-tay-hoi.js`, không phải nhờ tới phép suy này.
 */
export function laHoiThuocTinh(phien = {}) {
  if (typeof phien.hoiThuocTinh === 'boolean') return phien.hoiThuocTinh;
  const thieu = Array.isArray(phien.thieu) ? phien.thieu : [];
  return thieu.some((k) => DAI_SUY_TU_THIEU.includes(k));
}
