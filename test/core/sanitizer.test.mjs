// test/core/sanitizer.test.mjs — Test mô-đun thuần che nhạy cảm & kiểm số theo giá trị
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cheSdt,
  cheSoTaiKhoan,
  cheThongTinNhayCam,
  chuaThongTinNhayCam,
  chuanHoaGiaTriSo,
  trichXuatCacSo,
  kiemSoTheoGiaTri,
} from '../../core/sanitizer.js';

test('cheSdt: che số điện thoại Việt Nam chuẩn mẫu 0912345678', () => {
  assert.equal(cheSdt('Liên hệ: 0912345678 ngay'), 'Liên hệ: *** ngay');
  assert.equal(cheSdt('Số: 0912.345.678 hoặc 0912-345-678'), 'Số: *** hoặc ***');
  assert.equal(cheSdt('Quốc tế: +84912345678 và 84912345678'), 'Quốc tế: *** và ***');
});

test('cheSdt: KHÔNG che nhầm mã HS 8 số hoặc 10 số', () => {
  assert.equal(cheSdt('Mã HS: 84137090'), 'Mã HS: 84137090');
  assert.equal(cheSdt('Mã HS: 8413.70.90'), 'Mã HS: 8413.70.90');
  assert.equal(cheSdt('Mã: 8414.59.49.10'), 'Mã: 8414.59.49.10');
});

test('cheSoTaiKhoan: che số tài khoản ngân hàng sau từ khóa ngữ cảnh', () => {
  assert.equal(cheSoTaiKhoan('STK: 123456789 tại VCB'), 'STK: *** tại VCB');
  assert.equal(cheSoTaiKhoan('số tài khoản: 9876543210123 ngân hàng Techcombank'), 'số tài khoản: *** ngân hàng Techcombank');
  assert.equal(cheSoTaiKhoan('Chuyển khoản vào tk 19031234567'), 'Chuyển khoản vào tk ***');
});

test('cheSoTaiKhoan: không che nhầm số tiền hoặc mã HS nếu không có ngữ cảnh tài khoản', () => {
  assert.equal(cheSoTaiKhoan('Giá tiền là 50000000 VNĐ cho mã 84137090'), 'Giá tiền là 50000000 VNĐ cho mã 84137090');
});

test('cheThongTinNhayCam & chuaThongTinNhayCam: kết hợp cả SĐT và STK', () => {
  const vanBan = 'Hotline 0912345678, STK: 1234567890 VCB';
  assert.equal(chuaThongTinNhayCam(vanBan), true);
  assert.equal(chuaThongTinNhayCam('Mã HS 84137090 thuế 10%'), false);
  const daChe = cheThongTinNhayCam(vanBan);
  assert.ok(!daChe.includes('0912345678'));
  assert.ok(!daChe.includes('1234567890'));
});

test('chuanHoaGiaTriSo: chuẩn hoá số thập phân dấu chấm, phẩy và phần trăm', () => {
  assert.deepEqual(chuanHoaGiaTriSo('2.5%'), { raw: '2.5%', value: 2.5, isPercent: true, normalized: '2.5%' });
  assert.deepEqual(chuanHoaGiaTriSo('2,5%'), { raw: '2,5%', value: 2.5, isPercent: true, normalized: '2.5%' });
  assert.deepEqual(chuanHoaGiaTriSo('25%'), { raw: '25%', value: 25, isPercent: true, normalized: '25%' });
  assert.deepEqual(chuanHoaGiaTriSo('2.5'), { raw: '2.5', value: 2.5, isPercent: false, normalized: '2.5' });
  assert.deepEqual(chuanHoaGiaTriSo('2,5'), { raw: '2,5', value: 2.5, isPercent: false, normalized: '2.5' });
  assert.deepEqual(chuanHoaGiaTriSo('8/10'), { raw: '8/10', value: null, isFraction: true, normalized: '8/10' });
});

test('trichXuatCacSo: trích xuất danh sách các số theo giá trị từ văn bản', () => {
  const ds = trichXuatCacSo('Thuế NK 2,5%, ACFTA 0%, VAT 8/10, mã HS 8413.70.90');
  const normalizedList = ds.map((item) => item.normalized);
  assert.ok(normalizedList.includes('2.5%'));
  assert.ok(normalizedList.includes('0%'));
  assert.ok(normalizedList.includes('8/10'));
  assert.ok(normalizedList.includes('84137090'));
});

test('kiemSoTheoGiaTri: phân biệt chính xác 2.5% và 25% theo giá trị số học', () => {
  // Gốc có 2.5% (hoặc 2,5%), chốt có 2.5% hoặc 2,5% -> ĐẠT
  assert.equal(kiemSoTheoGiaTri('Thuế 2.5%', 'Thuế gốc 2,5%').hopLe, true);
  assert.equal(kiemSoTheoGiaTri('Thuế 2,5%', 'Thuế gốc 2.5%').hopLe, true);

  // Gốc có 2.5%, chốt tự ý đổi thành 25% -> VI PHẠM (không hợp lệ)
  const kqViPham1 = kiemSoTheoGiaTri('Thuế 25%', 'Thuế gốc 2.5%');
  assert.equal(kqViPham1.hopLe, false);

  // Gốc có 25%, chốt tự ý đổi thành 2.5% -> VI PHẠM
  const kqViPham2 = kiemSoTheoGiaTri('Thuế 2.5%', 'Thuế gốc 25%');
  assert.equal(kqViPham2.hopLe, false);

  // Gốc có phân số 8/10, chốt chỉ ghi 8% hoặc 8 -> VI PHẠM
  assert.equal(kiemSoTheoGiaTri('VAT 8%', 'VAT 8/10').hopLe, false);
  assert.equal(kiemSoTheoGiaTri('VAT 8/10', 'VAT 8/10').hopLe, true);

  // Gốc có số tiền 1000000, chốt ghi 1000000 -> ĐẠT
  assert.equal(kiemSoTheoGiaTri('Tổng 1.000.000 đ', 'Số tiền 1,000,000 đ').hopLe, true);
});

test('cheSdt: hỗ trợ ký tự số toàn rộng (Fullwidth NFKC)', () => {
  assert.equal(cheSdt('Gọi ０９１２３４５６７８'), 'Gọi ***');
});

test('cheSoTaiKhoan: phát hiện các định dạng ngân hàng phổ biến', () => {
  assert.equal(cheSoTaiKhoan('Số tài khoản BIDV: 1234567890'), 'Số tài khoản BIDV: ***');
  assert.equal(cheSoTaiKhoan('TK MBBank: 987654321'), 'TK MBBank: ***');
  assert.equal(cheSoTaiKhoan('chuyển khoản tới stk-1234567890'), 'chuyển khoản tới stk-***');
});

test('kiemSoTheoGiaTri: số 0 và 0.0, 0% và 0,0%', () => {
  assert.equal(kiemSoTheoGiaTri('Thuế 0%', 'Thuế ưu đãi 0,0%').hopLe, true);
  assert.equal(kiemSoTheoGiaTri('Thuế 0%', 'Thuế ưu đãi 5%').hopLe, false);
});

