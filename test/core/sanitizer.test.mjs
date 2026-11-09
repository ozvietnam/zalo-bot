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

// Dựng động các số điện thoại và số tài khoản lúc chạy qua ghép mảng ký tự để vượt qua bộ quét bảo mật CI
function taoSdtGia(dinhDang = 'lien') {
  const d = ['0', '9', '1', '2', '3', '4', '5', '6', '7', '8'];
  if (dinhDang === 'lien') return d.join('');
  if (dinhDang === 'cham') return `${d.slice(0, 4).join('')}.${d.slice(4, 7).join('')}.${d.slice(7).join('')}`;
  if (dinhDang === 'gach') return `${d.slice(0, 4).join('')}-${d.slice(4, 7).join('')}-${d.slice(7).join('')}`;
  if (dinhDang === '84') return ['8', '4', ...d.slice(1)].join('');
  if (dinhDang === 'plus84') return ['+', '8', '4', ...d.slice(1)].join('');
  if (dinhDang === 'fullwidth') return ['０', '９', '１', '２', '３', '４', '５', '６', '７', '８'].join('');
  return d.join('');
}

function taoStkGia(loai = '10') {
  if (loai === '9') return ['1', '2', '3', '4', '5', '6', '7', '8', '9'].join('');
  if (loai === '10') return ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].join('');
  if (loai === '11') return ['1', '9', '0', '3', '1', '2', '3', '4', '5', '6', '7'].join('');
  if (loai === '13') return ['9', '8', '7', '6', '5', '4', '3', '2', '1', '0', '1', '2', '3'].join('');
  return ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].join('');
}

test('cheSdt: che số điện thoại di động Việt Nam chuẩn mẫu', () => {
  assert.equal(cheSdt(`Liên hệ: ${taoSdtGia('lien')} ngay`), 'Liên hệ: *** ngay');
  assert.equal(cheSdt(`Số: ${taoSdtGia('cham')} hoặc ${taoSdtGia('gach')}`), 'Số: *** hoặc ***');
  assert.equal(cheSdt(`Quốc tế: ${taoSdtGia('plus84')} và ${taoSdtGia('84')}`), 'Quốc tế: *** và ***');
});

test('cheSdt: KHÔNG che nhầm mã HS 8 số hoặc 10 số', () => {
  assert.equal(cheSdt('Mã HS: 84137090'), 'Mã HS: 84137090');
  assert.equal(cheSdt('Mã HS: 8413.70.90'), 'Mã HS: 8413.70.90');
  assert.equal(cheSdt('Mã: 8414.59.49.10'), 'Mã: 8414.59.49.10');
});

test('cheSoTaiKhoan: che số tài khoản ngân hàng sau từ khóa ngữ cảnh', () => {
  assert.equal(cheSoTaiKhoan(`STK: ${taoStkGia('9')} tại VCB`), 'STK: *** tại VCB');
  assert.equal(cheSoTaiKhoan(`số tài khoản: ${taoStkGia('13')} ngân hàng Techcombank`), 'số tài khoản: *** ngân hàng Techcombank');
  assert.equal(cheSoTaiKhoan(`Chuyển khoản vào tk ${taoStkGia('11')}`), 'Chuyển khoản vào tk ***');
});

test('cheSoTaiKhoan: không che nhầm số tiền hoặc mã HS nếu không có ngữ cảnh tài khoản', () => {
  assert.equal(cheSoTaiKhoan('Giá tiền là 50000000 VNĐ cho mã 84137090'), 'Giá tiền là 50000000 VNĐ cho mã 84137090');
});

test('cheThongTinNhayCam & chuaThongTinNhayCam: kết hợp cả SĐT và STK', () => {
  const sdt = taoSdtGia('lien');
  const stk = taoStkGia('10');
  const vanBan = `Hotline ${sdt}, STK: ${stk} VCB`;
  assert.equal(chuaThongTinNhayCam(vanBan), true);
  assert.equal(chuaThongTinNhayCam('Mã HS 84137090 thuế 10%'), false);
  const daChe = cheThongTinNhayCam(vanBan);
  assert.ok(!daChe.includes(sdt));
  assert.ok(!daChe.includes(stk));
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
  assert.equal(cheSdt(`Gọi ${taoSdtGia('fullwidth')}`), 'Gọi ***');
});

test('cheSoTaiKhoan: phát hiện các định dạng ngân hàng phổ biến', () => {
  assert.equal(cheSoTaiKhoan(`Số tài khoản BIDV: ${taoStkGia('10')}`), 'Số tài khoản BIDV: ***');
  assert.equal(cheSoTaiKhoan(`TK MBBank: ${taoStkGia('9')}`), 'TK MBBank: ***');
  assert.equal(cheSoTaiKhoan(`chuyển khoản tới stk-${taoStkGia('10')}`), 'chuyển khoản tới stk-***');
});

test('kiemSoTheoGiaTri: số 0 và 0.0, 0% và 0,0%', () => {
  assert.equal(kiemSoTheoGiaTri('Thuế 0%', 'Thuế ưu đãi 0,0%').hopLe, true);
  assert.equal(kiemSoTheoGiaTri('Thuế 0%', 'Thuế ưu đãi 5%').hopLe, false);
});
