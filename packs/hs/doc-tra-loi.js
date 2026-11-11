// packs/hs/doc-tra-loi.js — ĐỌC câu khách trả lời câu hỏi lại, dựng mô tả gửi Cổng.
//
// Phân công của lớp hỏi lại, đúng Điều VI (mỗi tệp một trách nhiệm, dưới 300 dòng):
//   • `dien-cho-thieu.js` — DỰNG các nhánh hỏi theo mặt hàng;
//   • `ky-luat-hoi.js`    — ĐO điều khách đã nêu, lọc/gom câu;
//   • tệp này             — ĐỌC câu trả lời (xác nhận / phủ định / buông) và chốt mô tả tra cứu.
//
// Tách ra ở vòng soát 3 của PR #213: bản vá hai điểm người soát chặn đẩy `dien-cho-thieu.js` lên
// 332 dòng, vượt trần 300 của Điều VI (cổng `test/core/wiki-no-lon-dong.test.mjs` bắt đỏ). Cùng
// cách đã làm ở vòng soát 2 khi `coThongSo`/`nhanDienCuTraDi` chuyển sang `ky-luat-hoi.js`:
// chuyển theo đúng ranh trách nhiệm, và `dien-cho-thieu.js` XUẤT LẠI để mọi chỗ nhập cũ
// (`packages.js`, bốn tệp test) không phải đổi đường dẫn.
import { norm } from './input.js';
import {
  LENH_DAU_RE, nhanDienCuTraDi, docTraLoiTen, bocXaGiao, giuThongSo, chuTrong, laXacNhan,
} from './ky-luat-hoi.js';

/**
 * Xử lý khi khách phản hồi câu hỏi lại của bot.
 *
 * Bot vừa hỏi "em hiểu là {tenGoiY} đúng không ạ?" nên câu này có thể là XÁC NHẬN ("đúng, 350W"),
 * PHỦ ĐỊNH ("không, là máy sấy thực phẩm"), hay buông ("cứ tra đi"). Phủ định thì tên bot đoán
 * KHÔNG được vào mô tả gửi Cổng — hỏi mà không nghe câu trả lời "không" thì câu hỏi thành vô ích.
 *
 * @param {string} text Câu khách gõ
 * @param {object} sessionHoiLai Trạng thái hỏi lại trong session
 */
export function xuLyTraLoiHoiLai(text, sessionHoiLai = {}) {
  const s = String(text || '').trim();

  // Khách PHỦ ĐỊNH tên bot đoán → đọc tên khách nói, lùi về tên khách đã gõ nếu khách chỉ nói "không".
  // Xét TRƯỚC `nhanDienCuTraDi` vì mẫu "không rõ/không biết" của nó cũng khớp chữ "không" mở đầu.
  const traLoiTen = docTraLoiTen(s, sessionHoiLai);
  if (traLoiTen.phuDinh && traLoiTen.ten && !nhanDienCuTraDi(s)) {
    // `tenBacBo`: tên khách VỪA NÓI "KHÔNG". Người gọi phải ghi nó lại cho cả mạch, nếu không thì
    // vòng hỏi sau lại gợi ý đúng tên đó và nó tới Cổng (điểm 1 vòng soát 2 của PR #213).
    return {
      sanSangTra: true, giaDinh: null, moTaTraCuu: traLoiTen.ten,
      tenBacBo: String(sessionHoiLai.tenGoiY || '').trim(),
    };
  }

  // Khách nói "không rõ, cứ tra đi"
  if (nhanDienCuTraDi(s)) {
    const giaDinh = sessionHoiLai.giaDinhMacDinh || `${sessionHoiLai.tenGoiY || sessionHoiLai.tenGoc || 'hàng'} theo thông số phổ biến`;
    return {
      sanSangTra: true,
      giaDinh,
      moTaTraCuu: giaDinh,
    };
  }

  // Khách XÁC NHẬN tên, có thể bổ sung thông số (vd: "đúng, 350W 220V" hoặc "350W 220V")
  const tenGoc = String(sessionHoiLai.tenGoc || '').replace(LENH_DAU_RE, '').trim();
  // Tên bot ĐOÁN (`tenGoiY`) chỉ được thay tên KHÁCH GÕ khi khách XÁC NHẬN RÕ ("đúng ạ", "chuẩn").
  // Khách đáp mỗi thông số ("350W 220V") là trả lời câu XIN THÔNG SỐ, không phải đồng ý đổi tên
  // món: coi im lặng là đồng ý thì bot lặng lẽ tráo "máy sấy sinh tố" thành "máy xay sinh tố" rồi
  // in mã + thuế của món khách không hỏi, mà không nói một câu (vòng soát 3 PR #213; Điều III,
  // Điều VIII). Chỉ xét ở nhánh CÓ hỏi xác nhận tên — nhánh hỏi THUỘC TÍNH thì `tenGoiY` chính là
  // tên khách gõ, không phải tên bot đoán.
  const botDoanTen = sessionHoiLai.hoiXacNhanTen && !laXacNhan(s);
  const tenChuan = (botDoanTen ? tenGoc : sessionHoiLai.tenGoiY) || sessionHoiLai.tenGoiY || tenGoc;
  // Lược bỏ các từ xã giao ("đúng", "oke", "chuẩn", "vâng", "… ạ")
  const thongSoMoi = bocXaGiao(s);

  // Câu khách vừa gõ ĐÃ CHỨA tên món rồi ("máy sấy" → khách gõ "máy sấy sinh tố") thì không dán
  // tên cũ lên đầu nữa: Cổng nhận "máy sấy máy sấy sinh tố" — mô tả rác, mà mô tả khai báo này in
  // thẳng cho khách dùng (Điều VIII).
  const trung = thongSoMoi && norm(thongSoMoi).includes(norm(chuTrong(tenChuan)));

  // Giữ THÔNG SỐ khách đã gõ ở tin trước: mô tả tra cứu dựng lại từ `tenGoiY` nên thông số nằm
  // trong `tenGoc` sẽ rụng, Cổng mất dữ kiện khách đã cung cấp (nợ ghi ở PR #203).
  const moTaTraCuu = giuThongSo([trung ? '' : tenChuan, thongSoMoi].filter(Boolean).join(' ').trim(), tenGoc);

  return {
    sanSangTra: true,
    giaDinh: null,
    moTaTraCuu,
  };
}
