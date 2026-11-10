// Issue #168 vòng 4 (quyết định `oz-quyet`) — khối rủi ro nhãn hiệu phải DẪN LẠI kết luận của Cổng,
// không được thay bằng câu mặc định nhẹ hơn. Tách khỏi `shtt.test.mjs` (của #169) để giữ Điều VI:
// thêm ba ca này vào đó làm tệp lên 307 dòng, quá mức 300.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderShtt } from '../render-shtt.js';
import { plain } from '../style.js';

// ---- Soát #168 vòng 4: kết luận của Cổng không được bị câu mặc định đè ----
// Cổng trả `ketLuan` là KẾT LUẬN của nó ("cần giấy uỷ quyền hoặc hợp đồng phân phối"), nhưng
// viecNenLam chỉ đọc suggestions/goiY/khuyenNghi/hanhDong, nên câu đó bị bỏ và thay bằng câu
// mặc định theo đèn ("gửi ảnh nhãn in trên hàng") — NHẸ HƠN việc Cổng yêu cầu. Điều V: tri thức
// nằm ở Cổng, bot chỉ dẫn lại. Khuôn này là khuôn mock KB7 (`scripts/qa-that-cong-gia.mjs:191`).
const KET_LUAN = {
  ok: true,
  data: {
    tenNhan: 'Philips',
    maHs: '85094000',
    den: 'VANG',
    nhanRuiRo: 'Nhãn hiệu đã đăng ký tại Việt Nam, chưa thấy yêu cầu kiểm soát biên giới',
    ketLuan: 'Cần giấy uỷ quyền hoặc hợp đồng phân phối để tránh bị tạm giữ',
  },
};

test('renderShtt [#168 vòng 4]: ketLuan của Cổng được dẫn lại, không bị câu mặc định theo đèn đè', () => {
  const s = plain(renderShtt(KET_LUAN, { tenNhan: 'Philips' }));
  assert.match(s, /giấy uỷ quyền hoặc hợp đồng phân phối/, s);
  // Câu mặc định của đèn VANG chỉ được dùng khi Cổng KHÔNG nói gì.
  assert.doesNotMatch(s, /gửi ảnh nhãn in trên hàng/, s);
});

// `nhanRuiRo` của KB7 là Ô ĐÈN (xem danh sách khoá đèn ở render-shtt.js:125), không phải câu
// soạn cho khách: dán nguyên văn nó vào khối là quay lại đúng kiểu đổ dữ liệu thô mà #169 bỏ.
// Nên ca này đo Ý, không đo nguyên văn: mức rủi ro VÀNG + "đã đăng ký ở VN" phải tới được khách.
// Nửa trấn an của câu gốc ("chưa thấy yêu cầu kiểm soát biên giới") bị lược đi là phía AN TOÀN.
test('renderShtt [#168 vòng 4]: nhận định của Cổng tới khách bằng tiếng Việt, không dán nguyên văn ô đèn', () => {
  const s = plain(renderShtt(KET_LUAN, { tenNhan: 'Philips' }));
  assert.match(s, /^🟡/m, s);
  assert.match(s, /đăng ký gần giống ở VN/, s);
  assert.doesNotMatch(s, /VANG|nhanRuiRo/, s);
});

test('renderShtt [#168 vòng 4]: không có ketLuan/suggestions thì câu mặc định theo đèn vẫn chạy', () => {
  const s = plain(renderShtt({ ok: true, data: { tenNhan: 'Philips', den: 'VANG' } }, { tenNhan: 'Philips' }));
  assert.match(s, /gửi ảnh nhãn in trên hàng/, s);
});
