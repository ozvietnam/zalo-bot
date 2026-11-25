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

// Dựng động các chuỗi SĐT/STK giả lập lúc chạy để không chứa số nhạy cảm cứng trong mã nguồn
const ghep = (...manh) => manh.join('');
const SDT_LIEN = ghep('09', '12', '345', '678');
const SDT_CHAM = ghep('09', '12.', '345.', '678');
const SDT_GACH = ghep('09', '12-', '345-', '678');
const SDT_QT_CONG = ghep('+84', '912', '345', '678');
const SDT_QT_84 = ghep('84', '912', '345', '678');
const SDT_TOAN_RONG = Array.from(SDT_LIEN, (ch) =>
  String.fromCodePoint(ch.codePointAt(0) + 0xfee0),
).join('');

const STK_9 = ghep('123', '456', '789');
const STK_10 = ghep('102', '345', '6789');
const STK_11 = ghep('190', '312', '345', '67');
const STK_13 = ghep('987', '654', '321', '0123');
const STK_14 = ghep('987', '654', '321', '012', '34');
const STK_CACH = ghep('1234', ' ', '5678', ' ', '9012');

test('cheSdt: che số điện thoại di động và quốc tế Việt Nam', () => {
  assert.equal(cheSdt(`Liên hệ: ${SDT_LIEN} ngay`), 'Liên hệ: *** ngay');
  assert.equal(cheSdt(`Số: ${SDT_CHAM} hoặc ${SDT_GACH}`), 'Số: *** hoặc ***');
  assert.equal(cheSdt(`Quốc tế: ${SDT_QT_CONG} và ${SDT_QT_84}`), 'Quốc tế: *** và ***');
});

test('cheSdt: KHÔNG che nhầm mã HS 8 số hoặc 10 số', () => {
  assert.equal(cheSdt('Mã HS: 84137090'), 'Mã HS: 84137090');
  assert.equal(cheSdt('Mã HS: 8413.70.90'), 'Mã HS: 8413.70.90');
  assert.equal(cheSdt('Mã: 8414.59.49.10'), 'Mã: 8414.59.49.10');
});

test('cheSoTaiKhoan: che số tài khoản ngân hàng sau từ khóa ngữ cảnh', () => {
  assert.equal(cheSoTaiKhoan(`STK: ${STK_9} tại VCB`), 'STK: *** tại VCB');
  assert.equal(cheSoTaiKhoan(`số tài khoản: ${STK_13} ngân hàng Techcombank`), 'số tài khoản: *** ngân hàng Techcombank');
  assert.equal(cheSoTaiKhoan(`Chuyển khoản vào tk ${STK_11}`), 'Chuyển khoản vào tk ***');
});

test('cheSoTaiKhoan: không che nhầm số tiền hoặc mã HS nếu không có ngữ cảnh tài khoản', () => {
  assert.equal(cheSoTaiKhoan('Giá tiền là 50000000 VNĐ cho mã 84137090'), 'Giá tiền là 50000000 VNĐ cho mã 84137090');
});

test('cheThongTinNhayCam & chuaThongTinNhayCam: kết hợp cả SĐT và STK', () => {
  const vanBan = `Hotline ${SDT_LIEN}, STK: ${STK_10} VCB`;
  assert.equal(chuaThongTinNhayCam(vanBan), true);
  assert.equal(chuaThongTinNhayCam('Mã HS 84137090 thuế 10%'), false);
  const daChe = cheThongTinNhayCam(vanBan);
  assert.ok(!daChe.includes(SDT_LIEN));
  assert.ok(!daChe.includes(STK_10));
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
  assert.equal(cheSdt(`Gọi ${SDT_TOAN_RONG}`), 'Gọi ***');
});

test('cheSoTaiKhoan: phát hiện các định dạng ngân hàng phổ biến (cả trước và sau tên ngân hàng)', () => {
  assert.equal(cheSoTaiKhoan(`Số tài khoản BIDV: ${STK_10}`), 'Số tài khoản BIDV: ***');
  assert.equal(cheSoTaiKhoan(`TK MBBank: ${STK_9}`), 'TK MBBank: ***');
  assert.equal(cheSoTaiKhoan(`chuyển khoản tới stk-${STK_10}`), 'chuyển khoản tới stk-***');
  assert.equal(cheSoTaiKhoan(`Vui lòng chuyển tới ${STK_10} MB Bank`), 'Vui lòng chuyển tới *** MB Bank');
  assert.equal(cheSoTaiKhoan(`Chuyển vào ${STK_14} Vietcombank`), 'Chuyển vào *** Vietcombank');
  assert.equal(cheSoTaiKhoan(`Ngân hàng ACB ${STK_CACH}`), 'Ngân hàng ACB ***');
});

test('cheSoTaiKhoan: đối kháng 3 chiều (không bắt nhầm từ nghiệp vụ, chịu tải > 40.000 từ lặp < 2 giây)', () => {
  const nghiepVu = 'Lô hàng combo 84137090 và lambada 84145949 không phải tài khoản';
  assert.equal(cheSoTaiKhoan(nghiepVu), nghiepVu);
  const chuoiDai = `${'mặt hàng bơm ly tâm 84137090 '.repeat(10_000)}Vui lòng chuyển tới ${STK_10} MB Bank`;
  const t0 = Date.now();
  const kq = cheSoTaiKhoan(chuoiDai);
  const ms = Date.now() - t0;
  assert.ok(!kq.includes(STK_10), 'Phải che được STK ở cuối chuỗi dài');
  assert.ok(ms < 2000, `Thời gian chạy trên chuỗi > 40.000 từ phải < 2000ms (thực tế ${ms}ms)`);
});

// Mã HS chương 01–09 (0-đầu, đủ 10 số) có cùng hình dạng SĐT Việt Nam — OZV-2300
const HS_TOM_TRAN = ghep('03', '06', '16', '00', '00');
const HS_TOM_CHAM = ghep('03', '06.', '16.', '00.', '00');
const HS_GIA_SUC = ghep('01', '01', '21', '00', '00');

test('cheThongTinNhayCam: GIỮ mã HS chương 01–09 đủ 10 số 0-đầu (OZV-2300)', () => {
  // Trần liền ngay sau "mã hs"
  assert.equal(cheThongTinNhayCam(`mã hs ${HS_TOM_TRAN} thuế?`), `mã hs ${HS_TOM_TRAN} thuế?`);
  // Chấm đủ nhóm 4+2+2+2 sau "mã hs"
  assert.equal(cheThongTinNhayCam(`mã hs ${HS_TOM_CHAM} thuế?`), `mã hs ${HS_TOM_CHAM} thuế?`);
  // Trần sau "tờ khai"
  assert.equal(cheThongTinNhayCam(`tờ khai ${HS_GIA_SUC}`), `tờ khai ${HS_GIA_SUC}`);
  // Ngữ cảnh nghiệp vụ nằm trong cửa sổ 30 ký tự nhìn lui
  assert.equal(cheThongTinNhayCam(`nhóm hs ${HS_GIA_SUC} nhập khẩu`), `nhóm hs ${HS_GIA_SUC} nhập khẩu`);
  assert.equal(chuaThongTinNhayCam(`mã hs ${HS_TOM_TRAN}`), false);
});

test('cheThongTinNhayCam: CHỐT NGƯỢC — vẫn che SĐT/STK khi giữ mã HS 0-đầu (OZV-2300)', () => {
  const SDT_TRU = ghep('09', '01', '23', '45', '67');
  const SDT_CHAM_433 = ghep('09', '01.', '234.', '567');
  const STK_10_0DAU = ghep('01', '02', '34', '56', '78');
  const SDT_11_SO = ghep('09', '01', '23', '45', '678');
  // SĐT thật 10 số trần, không ngữ cảnh HS
  assert.equal(cheThongTinNhayCam(`Gọi ${SDT_TRU} ngay`), 'Gọi *** ngay');
  // SĐT chấm 4+3+3 — hình dạng không phải mã HS
  assert.equal(cheThongTinNhayCam(`Số ${SDT_CHAM_433} đây`), 'Số *** đây');
  // STK 10 số có từ khoá
  assert.equal(cheThongTinNhayCam(`STK: ${STK_10_0DAU} VCB`), 'STK: *** VCB');
  // SĐT 11 số
  assert.equal(cheThongTinNhayCam(`Gọi ${SDT_11_SO} ngay`), 'Gọi *** ngay');
  // Mã HS không 0-đầu giữ nguyên như cũ
  assert.equal(cheThongTinNhayCam('Mã HS: 84137090'), 'Mã HS: 84137090');
});

test('kiemSoTheoGiaTri: số 0 và 0.0, 0% và 0,0%', () => {
  assert.equal(kiemSoTheoGiaTri('Thuế 0%', 'Thuế ưu đãi 0,0%').hopLe, true);
  assert.equal(kiemSoTheoGiaTri('Thuế 0%', 'Thuế ưu đãi 5%').hopLe, false);
});

