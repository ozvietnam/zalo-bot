// packs/hs/test/dien-cho-thieu.test.mjs — Kiểm thử cơ chế hỏi lại trước khi tra (Điền chỗ thiếu)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  kiemTraThongTinPhanLoai,
  xuLyTraLoiHoiLai,
  nhanDienCuTraDi,
} from '../dien-cho-thieu.js';
import { fakeCtx, turn, hoiMotLuot, tenHangDaGui } from './giup-duong-that-hs.mjs';
import hs from '../index.js';

test('nhanDienCuTraDi: nhận diện chính xác các câu muốn tra luôn / không rõ', () => {
  assert.equal(nhanDienCuTraDi('không rõ, cứ tra đi'), true);
  assert.equal(nhanDienCuTraDi('cứ tra đi em'), true);
  assert.equal(nhanDienCuTraDi('tra luôn đi'), true);
  assert.equal(nhanDienCuTraDi('chịu, ko biết'), true);
  assert.equal(nhanDienCuTraDi('mặc định đi'), true);
  assert.equal(nhanDienCuTraDi('cứ làm theo phổ biến'), true);
  assert.equal(nhanDienCuTraDi('350W 220V'), false);
  assert.equal(nhanDienCuTraDi('đúng rồi'), false);
});

test('kiemTraThongTinPhanLoai: phát hiện nghi gõ nhầm "máy sấy sinh tố" và thiếu công suất/điện áp', () => {
  const r = kiemTraThongTinPhanLoai('máy sấy sinh tố', { vongHoi: 0 });
  assert.equal(r.canHoi, true);
  assert.equal(r.tenGoiY, 'máy xay sinh tố');
  assert.ok(r.thieu.includes('congSuat'));
  assert.ok(r.thieu.includes('dienAp'));
  // Câu hỏi ngắn, tối đa 2 câu, giọng Quyên
  assert.match(r.cauHoi, /máy xay sinh tố/);
  assert.match(r.cauHoi, /công suất/i);
  assert.match(r.cauHoi, /điện áp/i);
  // Đếm số câu hỏi (kết thúc bằng ? hoặc dấu chấm)
  const soCau = r.cauHoi.split(/[?.]\s+/).filter(Boolean).length;
  assert.ok(soCau <= 2, `Phải có tối đa 2 câu trong 1 tin ngắn, hiện có ${soCau} câu`);
});

test('kiemTraThongTinPhanLoai: đủ thông số thì không hỏi lại', () => {
  const r1 = kiemTraThongTinPhanLoai('máy xay sinh tố 350W 220V', { vongHoi: 0 });
  assert.equal(r1.canHoi, false);

  const r2 = kiemTraThongTinPhanLoai('Điều khiển cầm tay (Teaching Box) kết nối dây, dùng cho máy gắn chip tự động, có màn hình và các phím điều khiển, điện áp 24V DC', { vongHoi: 0 });
  assert.equal(r2.canHoi, false);

  const r3 = kiemTraThongTinPhanLoai('máy bơm nước ly tâm gang 1.5HP 220V', { vongHoi: 0 });
  assert.equal(r3.canHoi, false);

  const r4 = kiemTraThongTinPhanLoai('van bi inox 304 DN50 tay gạt', { vongHoi: 0 });
  assert.equal(r4.canHoi, false);

  const r5 = kiemTraThongTinPhanLoai('nồi chiên không dầu 5L 1500W 220V', { vongHoi: 0 });
  assert.equal(r5.canHoi, false);

  const r6 = kiemTraThongTinPhanLoai('Tên hàng: máy bơm nước\nChất liệu: gang', { vongHoi: 0 });
  assert.equal(r6.canHoi, false);

  const r7 = kiemTraThongTinPhanLoai('máy bơm nước', { vongHoi: 0, goi: 1 });
  assert.equal(r7.canHoi, false);
});

test('kiemTraThongTinPhanLoai: phát hiện thiếu thông số ở nhiều mặt hàng khác nhau (không hardcode)', () => {
  // 1. Máy bơm nước
  const rBom = kiemTraThongTinPhanLoai('máy bơm nước', { vongHoi: 0 });
  assert.equal(rBom.canHoi, true, 'máy bơm nước phải hỏi lại');
  assert.match(rBom.cauHoi, /máy bơm|công suất|gia đình|công nghiệp/i);
  const soCauBom = rBom.cauHoi.split(/[?.]\s+/).filter(Boolean).length;
  assert.ok(soCauBom <= 2, `Máy bơm: tối đa 2 câu, thực tế: ${soCauBom}`);

  // 2. Van bi
  const rVan = kiemTraThongTinPhanLoai('van bi', { vongHoi: 0 });
  assert.equal(rVan.canHoi, true, 'van bi phải hỏi lại');
  assert.match(rVan.cauHoi, /chất liệu|đồng|inox|nhựa|kích thước|đường kính/i);
  const soCauVan = rVan.cauHoi.split(/[?.]\s+/).filter(Boolean).length;
  assert.ok(soCauVan <= 2, `Van bi: tối đa 2 câu, thực tế: ${soCauVan}`);

  // 3. Nồi chiên
  const rNoi = kiemTraThongTinPhanLoai('nồi chiên', { vongHoi: 0 });
  assert.equal(rNoi.canHoi, true, 'nồi chiên phải hỏi lại');
  assert.match(rNoi.cauHoi, /dung tích|công suất|gia đình|công nghiệp/i);
  const soCauNoi = rNoi.cauHoi.split(/[?.]\s+/).filter(Boolean).length;
  assert.ok(soCauNoi <= 2, `Nồi chiên: tối đa 2 câu, thực tế: ${soCauNoi}`);

  // 4. Ống thép
  const rOng = kiemTraThongTinPhanLoai('ống thép', { vongHoi: 0 });
  assert.equal(rOng.canHoi, true, 'ống thép phải hỏi lại');
  assert.match(rOng.cauHoi, /đúc|hàn|mạ kẽm|đường kính|độ dày/i);
  const soCauOng = rOng.cauHoi.split(/[?.]\s+/).filter(Boolean).length;
  assert.ok(soCauOng <= 2, `Ống thép: tối đa 2 câu, thực tế: ${soCauOng}`);

  // 5. Quạt điện
  const rQuat = kiemTraThongTinPhanLoai('quạt điện', { vongHoi: 0 });
  assert.equal(rQuat.canHoi, true, 'quạt điện phải hỏi lại');
  assert.match(rQuat.cauHoi, /công suất|điện áp|gia dụng|công nghiệp/i);
  const soCauQuat = rQuat.cauHoi.split(/[?.]\s+/).filter(Boolean).length;
  assert.ok(soCauQuat <= 2, `Quạt điện: tối đa 2 câu, thực tế: ${soCauQuat}`);
});

test('kiemTraThongTinPhanLoai: quá 2 vòng hỏi thì không hỏi nữa mà áp dụng giả định', () => {
  const r1 = kiemTraThongTinPhanLoai('máy sấy sinh tố', { vongHoi: 2 });
  assert.equal(r1.canHoi, false);
  assert.ok(r1.giaDinh, 'Phải có giả định khi quá 2 vòng hỏi');

  const r2 = kiemTraThongTinPhanLoai('máy bơm nước', { vongHoi: 2 });
  assert.equal(r2.canHoi, false);
  assert.ok(r2.giaDinh, 'máy bơm nước phải có giả định');

  const r3 = kiemTraThongTinPhanLoai('van bi', { vongHoi: 2 });
  assert.equal(r3.canHoi, false);
  assert.ok(r3.giaDinh, 'van bi phải có giả định');
});

test('xuLyTraLoiHoiLai: khách xác nhận thông số cho van bi và máy bơm → cập nhật thông số và sẵn sàng tra', () => {
  // Van bi
  const sessionVan = {
    tenGoc: 'van bi',
    tenGoiY: 'van bi',
    vongHoi: 1,
    thieu: ['chatLieu', 'kichThuoc'],
    giaDinhMacDinh: 'van bi đồng dùng cho đường ống nước thông thường',
  };
  const resVan = xuLyTraLoiHoiLai('inox 304 DN50', sessionVan);
  assert.equal(resVan.sanSangTra, true);
  assert.match(resVan.moTaTraCuu, /van bi inox 304 DN50/i);

  // Máy bơm nước
  const sessionBom = {
    tenGoc: 'máy bơm nước',
    tenGoiY: 'máy bơm nước',
    vongHoi: 1,
    thieu: ['congSuat', 'dienAp'],
    giaDinhMacDinh: 'máy bơm nước gia đình, điện áp 220V',
  };
  const resBom = xuLyTraLoiHoiLai('loại gia đình 1HP 220V', sessionBom);
  assert.equal(resBom.sanSangTra, true);
  assert.match(resBom.moTaTraCuu, /máy bơm nước.*1HP.*220V/i);
});

test('xuLyTraLoiHoiLai: khách xác nhận "đúng, 350W 220V" → cập nhật thông số và sẵn sàng tra', () => {
  const sessionHoiLai = {
    tenGoc: 'máy sấy sinh tố',
    tenGoiY: 'máy xay sinh tố',
    vongHoi: 1,
    thieu: ['congSuat', 'dienAp'],
    giaDinhMacDinh: 'máy xay sinh tố gia dụng (công suất ~350W, 220V)',
  };

  const res = xuLyTraLoiHoiLai('đúng, 350W 220V', sessionHoiLai);
  assert.equal(res.sanSangTra, true);
  assert.equal(res.giaDinh, null);
  assert.match(res.moTaTraCuu, /máy xay sinh tố/i);
  assert.match(res.moTaTraCuu, /350W/i);
  assert.match(res.moTaTraCuu, /220V/i);
});

test('xuLyTraLoiHoiLai: khách nói "không rõ, cứ tra" → áp dụng giả định nêu rõ và sẵn sàng tra', () => {
  const sessionHoiLai = {
    tenGoc: 'máy sấy sinh tố',
    tenGoiY: 'máy xay sinh tố',
    vongHoi: 1,
    thieu: ['congSuat', 'dienAp'],
    giaDinhMacDinh: 'máy xay sinh tố gia dụng (công suất ~350W, 220V)',
  };

  const res = xuLyTraLoiHoiLai('không rõ, cứ tra đi', sessionHoiLai);
  assert.equal(res.sanSangTra, true);
  assert.ok(res.giaDinh, 'Phải có giả định');
  assert.match(res.giaDinh, /máy xay sinh tố gia dụng/i);
  assert.match(res.moTaTraCuu, /máy xay sinh tố gia dụng/i);
});

const CA_85072094 = 'Bộ pin khô (ắc quy axit chì kín, sealed lead-acid battery) model 6-DZF-12 dùng cho xe đạp điện';

test('[OZV-837] (a) "ắc quy axit chì 12V" → hỏi cả công dụng và chiều cao bình (kèm nước nhập), hoiThuocTinh=true', () => {
  for (const mau of ['ắc quy axit chì 12V', 'ac quy axit chi 12V', 'bình lead-acid 12V', 'pin khô axit chì 12V']) {
    const r = kiemTraThongTinPhanLoai(mau, { vongHoi: 0 });
    assert.equal(r.canHoi, true, `phải hỏi lại với "${mau}"`);
    assert.equal(r.hoiThuocTinh, true, 'nhánh ắc quy phải đặt hoiThuocTinh=true');
    assert.ok(r.thieu.includes('congDung'), `thiếu congDung với "${mau}": ${JSON.stringify(r.thieu)}`);
    assert.ok(r.thieu.includes('kichThuoc'), `thiếu kichThuoc với "${mau}": ${JSON.stringify(r.thieu)}`);
    assert.match(r.cauHoi, /khởi động động cơ/i);
    assert.match(r.cauHoi, /xe đạp điện|lưu điện|ups/i);
    assert.match(r.cauHoi, /chiều cao bình.*13\s*cm/i);
    assert.match(r.cauHoi, /nước nhập|xuất xứ/i);
  }
});

test('[OZV-837] (b) câu ca 85072094 đã có "dùng cho xe đạp điện" → không hỏi lại công dụng, chỉ xin chiều cao bình + nước nhập', () => {
  const r = kiemTraThongTinPhanLoai(CA_85072094, { vongHoi: 0 });
  assert.equal(r.canHoi, true, 'ca 85072094 gõ tự do thiếu chiều cao bình phải hỏi lại');
  assert.equal(r.hoiThuocTinh, true);
  assert.ok(!r.thieu.includes('congDung'), `đã có công dụng, không được liệt kê congDung vào thieu: ${JSON.stringify(r.thieu)}`);
  assert.deepEqual(r.thieu, ['kichThuoc', 'xuatXu']);
  assert.doesNotMatch(r.cauHoi, /khởi động động cơ/i, `không được hỏi lại công dụng: "${r.cauHoi}"`);
  assert.match(r.cauHoi, /chiều cao bình.*13\s*cm/i);
  assert.match(r.cauHoi, /nước nhập|xuất xứ/i);

  for (const cd of ['khởi động', 'đề nổ', 'xe đạp điện', 'xe điện', 'lưu điện', 'ups', 'khoi dong', 'de no']) {
    const rCd = kiemTraThongTinPhanLoai(`ắc quy axit chì 12V ${cd}`, { vongHoi: 0 });
    assert.equal(rCd.canHoi, true);
    assert.ok(!rCd.thieu.includes('congDung'), `từ khoá "${cd}" phải được nhận là đã nêu công dụng`);
    assert.doesNotMatch(rCd.cauHoi, /khởi động động cơ/i, `không hỏi lại công dụng khi đã có "${cd}"`);
  }
});

test('[OZV-837] (c) khách đáp "cao 12cm" qua xuLyTraLoiHoiLai → giữ tên hàng + nối cao 12cm, canHoi=false; "cứ tra đi" / vongHoi>=2 giả định ≤ 13 cm', () => {
  const kt1 = kiemTraThongTinPhanLoai(CA_85072094, { vongHoi: 0 });
  assert.equal(kt1.canHoi, true);

  const xl = xuLyTraLoiHoiLai('cao 12cm', kt1);
  assert.equal(xl.sanSangTra, true);
  assert.equal(xl.giaDinh, null);
  assert.match(xl.moTaTraCuu, /Bộ pin khô \(ắc quy axit chì kín, sealed lead-acid battery\) model 6-DZF-12 dùng cho xe đạp điện/i);
  assert.match(xl.moTaTraCuu, /cao 12cm/i);

  const kt2 = kiemTraThongTinPhanLoai(xl.moTaTraCuu, { vongHoi: 1, tenKhachTuGo: true });
  assert.equal(kt2.canHoi, false, `đã đủ công dụng + chiều cao thì không hỏi nữa: "${kt2.cauHoi}"`);

  const buong = xuLyTraLoiHoiLai('cứ tra đi', kt1);
  assert.equal(buong.sanSangTra, true);
  assert.match(buong.giaDinh, /13\s*cm/i);
  assert.match(buong.giaDinh, /đầu cực/i);

  const hetVong = kiemTraThongTinPhanLoai('ắc quy axit chì 12V', { vongHoi: 2 });
  assert.equal(hetVong.canHoi, false);
  assert.match(hetVong.giaDinh, /13\s*cm/i);
  assert.match(hetVong.giaDinh, /đầu cực/i);
});

test('[OZV-837] (d) form có nhãn "Tên hàng: Bộ pin khô..." → canHoi=false', () => {
  const rForm = kiemTraThongTinPhanLoai(`Tên hàng: ${CA_85072094}`, { vongHoi: 0 });
  assert.equal(rForm.canHoi, false);
  const rGoi1 = kiemTraThongTinPhanLoai(CA_85072094, { vongHoi: 0, goi: 1 });
  assert.equal(rGoi1.canHoi, false);
});

test('[OZV-837] đường thật hs.handle: ca 85072094 hỏi chiều cao bình → khách đáp "cao 12cm" → gọi phan_loai_hs đủ tên hàng + cao 12cm', async () => {
  const { ctx, calls } = fakeCtx(hoiMotLuot([]));
  const r1 = await hs.handle(turn(`Tra hs ${CA_85072094}`), ctx);
  const tin1 = (r1?.replies || []).map((x) => x.text).join('\n');
  assert.match(tin1, /chiều cao bình.*13\s*cm/i);
  assert.doesNotMatch(tin1, /khởi động động cơ/i);
  assert.equal(tenHangDaGui(calls).length, 0, 'lượt 1 chưa biết chiều cao bình thì chưa gọi phan_loai_hs');

  await hs.handle(turn('cao 12cm'), ctx);
  const daGui = tenHangDaGui(calls);
  assert.equal(daGui.length, 1, 'lượt 2 khách đáp chiều cao thì gọi phan_loai_hs đúng 1 lần');
  assert.match(daGui[0], /Bộ pin khô.*6-DZF-12.*xe đạp điện/i);
  assert.match(daGui[0], /cao 12cm/i);
});


