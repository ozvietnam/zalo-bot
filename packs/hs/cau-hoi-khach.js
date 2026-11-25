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
// Nhập về để `bocCumHoi` ĐO lại câu hỏi bằng một bộ đo duy nhất (`thongSoTrong`, `ky-luat-hoi.js`)
// thay vì chép lại danh sách thông số ở đây — chép lại chính là cách sinh hồi quy OZV-782 (bộ chữ
// nơi dựng khác bộ chữ nơi đọc, không ai thấy cho tới khi tên hàng rụng khỏi tin gửi Cổng).
// Vòng nhập hai chiều `cau-hoi-khach ↔ ky-luat-hoi` an toàn: hai bên chỉ GỌI hàm của nhau bên
// trong thân hàm lúc chạy, không gọi lúc nạp mô-đun, mà cả hai bên đều khai báo bằng `function`
// (hỗ nội tuyến của ESM giữ liên kết sẵn từ lúc nạp).
import { thongSoTrong } from './ky-luat-hoi.js';

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
// Dấu ngắt và từ xã giao đứng SAU câu hỏi ngược: "phải không ạ?", "đúng không em?", "phai khong
// a?" (bản norm — khách Zalo gõ không dấu). Chỉ từ này và "?" được phép đứng giữa cặp hỏi và
// cuối câu; chữ khác ("mạ kẽm", "máy sấy") là câu trả lời, không được nhận là câu hỏi.
const NGAT_HOI = '[\\s,.!:;-]*';
const TAN_GIAO_HOI = '(?:[ạa]|em|anh|ch[iị]|nh[ỉi]|nh[ée]|h[ảa]|v[ậâ]y|th[ếe])';
const CUM_HOI = 'l[aà]\\s*sao|th[iì]\\s*sao|t[aạ]i\\s*sao|sao\\s*(?:v[aậ]y|th[eế]|c[oơ])'
  + '|l[aà]\\s*g[iì]|g[iì]\\s*(?:v[aậ]y|c[oơ])|(?:nh[uư]\\s*)?th[eế]\\s*n[aà]o'
  + '|(?:kh[oô]ng|ch[uư]a|ko)\\s*(?:hi[eể]u|r[oõ]\\s*[yý])|hi[eể]u\\s*sao'
  // OZV-2263 (lát 2c OZV-437): các câu hỏi thông dụng bộ trên bỏ sót — "xem ở đâu ạ?", "chỗ nào?",
  // "bao nhiêu?", "làm gì/làm sao?". Thiếu thì `laCauHoiKhach` trả false ⇒ `coTenTrong` đếm chữ
  // câu hỏi thành TÊN MỚI ⇒ tenGoc rụng hẳn khỏi mô tả gửi Cổng ("xem công suất ở đâu ạ?" →
  // mô tả thành "phải không ạ?"), mà mã + thuế in ra là của món khác (Điều III, VIII).
  + '|[oở]\\s*[đd][aâ]u|ch[oỗ]\\s*n[aà]o|bao\\s*nhi[eê]u|l[aà]m\\s*(?:g[iì]|sao)'
  // OZV-2305 (lát 10 OZV-437): "làm chi" (miền Nam) = "làm gì"; "tác dụng gì" = hỏi công dụng.
  // Thiếu hai cụm này thì `laCauHoiKhach` false ⇒ chữ "chi"/"tác dụng" bị `coTenTrong` đếm thành
  // TÊN MỚI ⇒ tenGoc rụng khỏi mô tả gửi Cổng — cùng lớp lỗi OZV-2263. "làm chi" PHẢI neo cuối
  // câu (như neo câu hỏi ngược dưới): bản norm() bỏ dấu làm "chi tiết" thành "chi tiet" — hai
  // từ — nên "máy làm chi tiết gỗ" (TÊN HÀNG) vẫn khớp `l[aà]m\s*chi` nếu không chốt đuôi. Còn
  // "tác dụng" phải viết ĐỦ cụm kèm "gì": câu TRẢ LỜI mô tả công dụng ("có tác dụng làm sạch")
  // không được nhận là hỏi.
  + `|l[aà]m\\s*chi(?=${NGAT_HOI}(?:${TAN_GIAO_HOI}${NGAT_HOI})?\\?*\\s*$)`
  + '|t[aá]c\\s*d[uụ]ng\\s*g[iì]'
  // Câu hỏi ngược xác nhận ("phải không ạ?", "đúng không em?", "đúng không nhỉ?"). Bắt buộc neo
  // CUỐI câu — sau cặp "(đúng|phải|chính xác|chuẩn) (không|chưa|ko|kg)" chỉ được còn từ xã giao
  // và dấu "?" — nếu không sẽ bắt oan câu TRẢ LỜI phủ định thuộc tính: "đúng, không mạ kẽm"
  // (dấu phẩy ngắt cặp), "đúng không mạ kẽm" (sau cặp còn cả câu trả lời), "phải, không có màn
  // hình" — mà đọc thành câu hỏi là bóc chữ "không" của khách ⇒ bot nói NGƯỢC điều khách vừa
  // nói (lỗi điểm 2 nặng nhất của PR #213).
  + '|(?:ph[aả]i|[đd][uú]ng|ch[ií]nh\\s*x[aá]c|chu[aẩ]n)(?:\\s*r[oồ]i)?\\s+'
  + `(?:kh[oô]ng|ch[uư]a|ko|kg)(?=${NGAT_HOI}(?:${TAN_GIAO_HOI}${NGAT_HOI})?\\?*\\s*$)`;
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

/**
 * Bóc cụm HỎI ra khỏi câu, để `coTenTrong` không đếm chữ của câu hỏi thành tên hàng.
 * Câu không phải câu hỏi thì trả NGUYÊN VĂN — không cắt oan ("máy sấy thực phẩm ạ" giữ nguyên).
 *
 * OZV-2263 (lát 2c OZV-437): khi câu ĐÃ được nhận là câu hỏi thì chữ của câu hỏi KHÔNG phải tên
 * hàng hay thuộc tính — chỉ giữ lại ĐÚNG các thông số đo được khách nêu kèm ("350W thì sao ạ" →
 * "350W"), mọi chữ khác đều bỏ. Bóc bằng replace từng cụm hỏi/đại từ là SÓT chủ ngữ câu hỏi
 * ("đúc hay hàn là gì ạ" → còn "đúc hay hàn", "mạ kẽm là sao ạ" → còn "mạ kẽm") ⇒ bot tự chốt
 * tra món khách chưa từng chốt (canHoi:false); đo lại bằng `thongSoTrong` — một bộ đo thông số
 * duy nhất, cùng nguồn với `ky-luat-hoi.js` — là hết chỗ lọt.
 */
export function bocCumHoi(s) {
  const t = String(s || '');
  if (!laCauHoiKhach(t)) return t;
  return thongSoTrong(t).join(' ');
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
