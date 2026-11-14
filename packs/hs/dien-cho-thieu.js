// packs/hs/dien-cho-thieu.js — cơ chế điền chỗ thiếu & hỏi lại trước khi tra cứu HS.
// Yêu cầu issue #136, #138 (GQ-02): thiếu ý quan trọng hoặc nghi gõ nhầm → hỏi tối đa 2 câu trong 1 tin ngắn,
// tối đa 2 vòng hỏi. Khách nói "không rõ / cứ tra đi" → tra luôn và nói rõ giả định.
//
// KỶ LUẬT HỎI (yêu cầu 2 của issue #177): máy tự xác định tối đa trước khi hỏi, không hỏi lại
// điều khách đã nêu, tối đa 3 câu trong một tin. Phần ĐO điều khách đã nêu và lọc/gom câu nằm ở
// `ky-luat-hoi.js`; tệp này chỉ dựng các nhánh hỏi theo mặt hàng và cho mọi câu đi qua `gomCau`.
// Phần ĐỌC câu khách trả lời (`xuLyTraLoiHoiLai`) nằm ở `doc-tra-loi.js`.
import { norm } from './input.js';
import {
  coThongSo, nhanDienCuTraDi, daNeu, gomCau, cauXinThem, ketQuaHoi, chuTrong, bocCumXuatXu,
} from './ky-luat-hoi.js';
import { xuLyTraLoiHoiLai } from './doc-tra-loi.js';
import {
  kemXuatXu, giaDinhNhomHang, hoiAcQuy, hoiDienGiaDung, hoiCoKhiVatLieu,
} from './nhanh-hoi-hang.js';

// `coThongSo` và `nhanDienCuTraDi` là hàm ĐO thuần nên đã chuyển sang `ky-luat-hoi.js`;
// `xuLyTraLoiHoiLai` là phần ĐỌC câu trả lời nên chuyển sang `doc-tra-loi.js` (đúng phân công ghi
// ở đầu các tệp: tệp này điều phối và hỏi XÁC NHẬN TÊN, `nhanh-hoi-hang.js` dựng nhánh hỏi THUỘC
// TÍNH theo mặt hàng, `ky-luat-hoi.js` ĐO, `doc-tra-loi.js` ĐỌC câu trả lời).
// Xuất lại ở đây để `packages.js`, `loc-tap-am.js` và các test cũ không phải đổi đường dẫn nhập.
export { coThongSo, nhanDienCuTraDi, xuLyTraLoiHoiLai };

// Nhận diện lỗi gõ nhầm thường gặp
const GOI_Y_GO_NHAM = [
  {
    regex: /m[aáàảãạ]y\s*(s[aấầẩẫậâ]y|say)\s*sinh\s*t[oốồổỗộ]/i,
    normRegex: /may\s*(say)\s*sinh\s*to/i,
    chuan: 'máy xay sinh tố',
    moRong: 'xay trái cây',
    giaDinh: 'máy xay sinh tố gia dụng (công suất ~350W, 220V)',
    linhVuc: 'dien-gia-dung',
  },
  {
    regex: /m[aáàảãạ]y\s*(s[aấầẩẫậâ]y|say)\s*th[uự]c\s*ph[aẩ]m/i,
    normRegex: /may\s*(say)\s*thuc\s*pham/i,
    chuan: 'máy sấy thực phẩm',
    moRong: 'sấy hoa quả, nông sản',
    giaDinh: 'máy sấy thực phẩm gia đình, điện áp 220V',
    linhVuc: 'dien-gia-dung',
  },
];

const FORM_NHAN_RE = /^(t[eê]n\s*h[aà]ng|ten\s*hang|m[oô]\s*t[aả]|mo\s*ta|ch[aấ]t\s*li[eệ]u|chat\s*lieu|th[oô]ng\s*s[oố]|thong\s*so|model)\s*:/im;

/**
 * Kiểm tra xem mô tả hàng có thiếu thông tin cốt lõi hoặc nghi gõ nhầm không.
 * @param {string} text Mô tả hàng khách gửi
 * @param {{ vongHoi?: number, goi?: number, hoSo?: object }} opts `hoSo`: hồ sơ mạch (#170) —
 *   điều khách đã nêu ở tin trước thì KHÔNG hỏi lại (kỷ luật hỏi, yêu cầu 2 của issue #177).
 */
// `tenKhachTuGo`: tên trong `text` do KHÁCH VỪA GÕ (vòng hỏi 2) → BỎ câu xác nhận tên, chỉ xin
// phần còn thiếu. Hỏi "em hiểu là máy sấy thực phẩm đúng không ạ?" ngay sau khi khách vừa gõ đúng
// chữ đó là hỏi lại điều khách đã nêu (luật 2 của kỷ luật hỏi), và khách không tới được mã.
//
// `tenBiBacBo`: những tên KHÁCH ĐÃ NÓI "KHÔNG" trong mạch — CẤM CỬA cả ở `tenGoiY` lẫn ở giả định.
// Ẩn riêng câu HỎI là chưa đủ: nhánh nghi gõ nhầm vẫn trả `tenGoiY: item.chuan` và `giaDinh` mang
// tên đó, `{...ktTiep}` ghi đè vào `session.hoiLai`, nên lượt sau tên bị phủ định SỐNG LẠI và tới
// Cổng — bot in mã + thuế của món khách nói KHÔNG, mà im lặng (vòng soát 2 PR #213; Điều III, VIII).
// `tenDaHoi`: tên bot ĐÃ hỏi xác nhận trong mạch này ("em hiểu là máy xay sinh tố đúng không ạ?").
// Khách đáp mà không nói "đúng" cũng không nói "không" (chỉ đưa thông số) thì câu hỏi đó ĐÃ HỎI
// RỒI: hỏi lại y nguyên là treo khách giữa hai vòng, không bao giờ tới được mã (Điều II). Tên bot
// đoán vẫn không được dùng — `xuLyTraLoiHoiLai` giữ tên khách gõ khi khách chưa xác nhận rõ.
export function kiemTraThongTinPhanLoai(text, {
  vongHoi = 0, goi = null, hoSo = null, tenKhachTuGo = false, tenBiBacBo = [], tenDaHoi = null,
} = {}) {
  const laMot = (a, b) => Boolean(a) && norm(String(a)) === norm(String(b || ''));
  const daBacBo = (ten) => (Array.isArray(tenBiBacBo) ? tenBiBacBo : [tenBiBacBo])
    .some((x) => laMot(x, ten));
  const s = String(text || '').trim();
  if (!s) return { canHoi: false, giaDinh: null, thieu: [] };

  // Khách đang chọn gói số 1 hoặc gõ form có nhãn chuẩn: không hỏi lại
  if (goi === 1 || FORM_NHAN_RE.test(s)) {
    return { canHoi: false, giaDinh: null, thieu: [] };
  }

  const sSach = s.replace(/^(tra\s*hs|m[aã]\s*hs|t[iì]m\s*m[aã]|ph[aâ]n\s*lo[aạ]i)\s*/i, '').trim();
  const cacTu = bocCumXuatXu(sSach).split(/\s+/).filter(Boolean);
  const soTu = cacTu.length;

  // 1. Nếu đã hỏi đủ 2 vòng: không hỏi nữa, áp dụng giả định phổ biến nhất
  if (vongHoi >= 2) {
    let giaDinh = null;
    for (const item of GOI_Y_GO_NHAM) {
      // `item.giaDinh` MANG tên bot đoán ("máy xay sinh tố gia dụng …"). Khách đã bác bỏ tên đó thì
      // giả định cũng không được dùng, nếu không bot lại tra đúng món khách nói KHÔNG.
      if (daBacBo(item.chuan)) continue;
      // Khách TỰ GÕ một tên KHÁC mà chưa xác nhận tên bot đoán → giả định cũng không được mang tên
      // bot đoán. Hết vòng hỏi thì tra theo TÊN KHÁCH, không tra món bot tự chọn (Điều VIII).
      if (tenKhachTuGo && norm(chuTrong(sSach)) !== norm(item.chuan)) continue;
      if (item.regex.test(s) || (item.normRegex && item.normRegex.test(norm(s)))) {
        giaDinh = item.giaDinh;
        break;
      }
    }
    if (!giaDinh) giaDinh = giaDinhNhomHang(sSach);
    return { canHoi: false, giaDinh, thieu: [] };
  }

  // Điều khách ĐÃ NÊU (chữ lượt này + hồ sơ mạch) — kỷ luật hỏi: không hỏi lại những điều này.
  const co = daNeu(sSach, hoSo);

  // 2. Kiểm tra nghi gõ nhầm
  for (const item of GOI_Y_GO_NHAM) {
    // Khách ĐÃ NÓI "KHÔNG" với tên này → bỏ hẳn nhánh: không gợi ý lại, không giả định theo nó.
    if (daBacBo(item.chuan)) continue;
    // Đã hỏi xác nhận đúng tên này ở vòng trước → không hỏi lại câu y nguyên (Điều II).
    if (laMot(tenDaHoi, item.chuan)) continue;
    if (item.regex.test(s) || (item.normRegex && item.normRegex.test(norm(s)))) {
      // KHÔNG còn cổng `if (co.congSuat && co.dienAp) break`: cổng đó làm thông số đủ thì rụng luôn
      // câu xác nhận TÊN — mà tên đổi hẳn dòng thuế ("máy xay sinh tố" 8509.40.00 ≠ "máy sấy" nhóm
      // 8419/8516), nên càng đủ thông số bot càng im, đúng ngược cái cần (nợ ghi ở PR #203).
      // Thông số khách đã nêu vẫn không bị xin lại: `cauXinThem` rút hết, `gomCau` bỏ câu vô ích.
      const thieu = [];
      if (!co.congSuat) thieu.push('congSuat');
      if (!co.dienAp) thieu.push('dienAp');
      // `xuatXu` CỐ Ý không vào `thieu` ở nhánh này: `thieu` của nhánh XÁC NHẬN TÊN là danh sách
      // "còn thiếu thì mới hỏi tiếp", chỗ gọi đọc nó để biết đã đủ dữ kiện đi tra chưa. Nhét nước
      // vào đây thì mạch không bao giờ "đủ" (khách có thể không bao giờ nói nước) nên lượt sau
      // không gọi Cổng nữa — khách treo luôn, không tới được mã (`xac-nhan-ten.test.mjs`, Điều II).
      // Câu hỏi nước vẫn ra khi câu xin-thêm còn sống: xem `kemXuatXu` ngay dưới (OZV-802/814).
      const mucThem = kemXuatXu(
        [{ khoa: 'congSuat', chu: 'công suất (W)' }, { khoa: 'dienAp', chu: 'điện áp' }], co);

      // Câu xác nhận tên món LUÔN hỏi (không phải đại lượng, máy không tự đoán thay khách được:
      // "sấy" ↔ "xay" đổi hẳn dòng thuế). Câu xin thông số chỉ nêu phần CÒN THIẾU.
      //
      // `tenKhachTuGo` chỉ được bỏ câu xác nhận khi tên KHÁCH GÕ ĐÚNG BẰNG tên bot định gợi ý —
      // lúc đó hỏi lại là hỏi điều khách vừa nêu (luật 2 của kỷ luật hỏi). Tên khách gõ KHÁC tên
      // bot đoán thì vẫn phải HỎI: bỏ câu hỏi mà vẫn trả `tenGoiY`/`giaDinh` mang tên bot đoán là
      // LẶNG LẼ TRÁO món của khách ("máy sấy sinh tố" → Cổng nhận "máy xay sinh tố"), bot in mã +
      // thuế của món khách không hỏi mà không nói một câu (vòng soát 3 PR #213; Điều III, VIII).
      // So phần CHỮ (bóc thông số) để "máy sấy thực phẩm 500W" vẫn khớp "máy sấy thực phẩm".
      const tenKhachKhac = tenKhachTuGo && norm(chuTrong(sSach)) !== norm(item.chuan);
      const xacNhanTen = !tenKhachTuGo || tenKhachKhac;
      return ketQuaHoi({
        s,
        tenGoiY: item.chuan,
        thieu,
        // CHỈ tin CÓ câu "em hiểu là <tên> đúng không ạ?" mới được đọc câu "không…" của khách là
        // phủ định TÊN. Các nhánh dưới hỏi THUỘC TÍNH ("có mạ kẽm không ạ?") — đọc "không mạ kẽm"
        // thành phủ định tên là bot nói ngược khách (điểm 2 người soát nêu).
        hoiXacNhanTen: xacNhanTen,
        // Nhánh này hỏi TÊN món (và xin thông số) — câu đáp có tên mới là khách SỬA TÊN.
        hoiThuocTinh: false,
        cauHoi: gomCau([
          { cau: xacNhanTen
            ? `Dạ anh/chị ơi, em hiểu là {b}${item.chuan}{/b}${item.moRong ? ` (${item.moRong})` : ''} đúng không ạ?`
            : '', dai: [] },
          { cau: cauXinThem(mucThem, co, 'có thì em chốt mã chuẩn hơn, mô tả khai báo cũng đủ ý luôn ạ.'),
            dai: mucThem.map((m) => m.khoa) },
        ], co),
        // `item.giaDinh` MANG tên bot đoán. Khách tự gõ tên KHÁC mà chưa xác nhận thì giả định phải
        // dựng từ TÊN KHÁCH: khách buông "cứ tra đi" là bot tra ngay theo giả định, nên để nguyên
        // chuỗi cũ là tráo món của khách qua đúng cái cửa vừa khoá ở `tenGoiY`.
        giaDinh: tenKhachKhac ? `${sSach} loại thông dụng trong gia đình, điện áp 220V` : item.giaDinh,
      });
    }
  }

  // 2b. Nhóm ắc quy axit chì (85.07, OZV-837): xét trước cổng thoát sớm `soChiTiet >= 2` vì câu tự
  // nhiên về ắc quy hay có sẵn điện áp/công dụng hoặc ≥ 10 từ nhưng vẫn thiếu chiều cao bình (mốc
  // ≤ 13 cm ở 8507.20.94 ↔ > 23 cm ở 8507.20.99).
  const kqAcQuy = hoiAcQuy({ s, sSach, co, hoSo });
  if (kqAcQuy) return kqAcQuy;

  // 3. Đánh giá độ chi tiết của mô tả — tính CẢ dữ kiện trong hồ sơ mạch (kỷ luật hỏi: máy tự
  // xác định tối đa từ dữ kiện sẵn có trước khi hỏi; khách đã gõ thông số ở tin trước thì đủ rồi).
  const { congSuat: coCongSuat, dienAp: coDienAp, dungTich: coDungTich, kichThuoc: coKichThuoc,
    chatLieu: coChatLieu, congDung: coCongDung, quyCach: coQuyCach } = co;
  const soChiTiet = [coCongSuat, coDienAp, coDungTich, coKichThuoc, coChatLieu, coCongDung, coQuyCach].filter(Boolean).length;

  // Nếu đã có từ 2 thông số/chi tiết trở lên hoặc có điện áp rõ ràng + công dụng: đủ thông số
  if (soChiTiet >= 2 || (coDienAp && coCongDung) || (coCongSuat && coCongDung) || (soTu >= 10 && soChiTiet >= 1)) {
    return { canHoi: false, giaDinh: null, thieu: [] };
  }

  // 4. Nhóm máy móc / thiết bị điện / gia dụng thiếu thông số
  const kqDien = hoiDienGiaDung({ s, sSach, soTu, co });
  if (kqDien) return kqDien;

  // 5. Nhóm cơ khí / vật liệu / linh kiện chỉ nêu tên cụt (1–4 từ)
  const kqCoKhi = hoiCoKhiVatLieu({ s, sSach, soTu, co, vongHoi });
  if (kqCoKhi) return kqCoKhi;

  return { canHoi: false, giaDinh: null, thieu: [] };
}
