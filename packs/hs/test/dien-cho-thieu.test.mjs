// packs/hs/test/dien-cho-thieu.test.mjs — Kiểm thử cơ chế hỏi lại trước khi tra (Điền chỗ thiếu)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  kiemTraThongTinPhanLoai,
  xuLyTraLoiHoiLai,
  nhanDienCuTraDi,
} from '../dien-cho-thieu.js';

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
});

test('kiemTraThongTinPhanLoai: quá 2 vòng hỏi thì không hỏi nữa mà áp dụng giả định', () => {
  const r = kiemTraThongTinPhanLoai('máy sấy sinh tố', { vongHoi: 2 });
  assert.equal(r.canHoi, false);
  assert.ok(r.giaDinh, 'Phải có giả định khi quá 2 vòng hỏi');
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
