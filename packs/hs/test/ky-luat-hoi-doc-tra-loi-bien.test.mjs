// packs/hs/test/ky-luat-hoi-doc-tra-loi-bien.test.mjs — Test TDD cho OZV-885 (cụm lỗi #12 trong OZV-694):
//   1. `XAC_NHAN_DAU_RE` trong `packs/hs/doc-tra-loi.js`: gắn biên từ Unicode `HET_TU` và chỉ nhận
//      từ xác nhận có dấu ('đúng'/'dúng'/'đung', 'vâng', 'ừ', 'dạ(?!\s*d[aà]y)') để không cắt nhầm
//      chữ đầu của tên hàng ("uốn ống", "dung dịch", "vang đỏ", "u nhôm", "dạ dày").
//   2. `KICH_THUOC_RE` trong `packs/hs/ky-luat-hoi.js`: dùng biên Unicode và nhận `phi 60`, `ø60`, `DN 50`.
//   3. `CONG_DUNG_RE` trong `packs/hs/ky-luat-hoi.js`: sửa `gia đình` và bổ sung `dân dụng`, `di động`, `mini`.
//   4. `LOAI_HANG_RE` trong `packs/hs/ky-luat-hoi.js`: bổ sung nhãn đại lượng (`công suất`, `điện áp`,
//      `dung tích`, `kích thước`, `quy cách`, `đường kính`, `độ dày`, `chiều cao`, `công dụng`) để
//      `coTenTrong` không nhận nhầm nhãn đại lượng thành tên hàng mới.
import test from 'node:test';
import assert from 'node:assert/strict';

import { bocXaGiao, laXacNhan, xuLyTraLoiHoiLai } from '../doc-tra-loi.js';
import { daNeu, thongSoTrong, coTenTrong, giuThongSo } from '../ky-luat-hoi.js';

test('[OZV-885-1] bocXaGiao và laXacNhan không cắt nhầm chữ đầu của tên hàng nhưng vẫn nhận câu xác nhận thật', () => {
  const tenHang = [
    'uốn ống thép',
    'dung dịch tẩy rửa',
    'vang đỏ Pháp',
    'u nhôm định hình',
    'dạ dày heo đông lạnh',
  ];
  for (const s of tenHang) {
    assert.equal(bocXaGiao(s), s, `bocXaGiao('${s}') phải giữ nguyên 100% chuỗi gốc`);
    assert.equal(laXacNhan(s), false, `laXacNhan('${s}') phải trả false`);
  }

  const cauXacNhan = ['đúng, 350W', 'vâng ạ', 'ừ, 220V', 'dạ 350W'];
  for (const s of cauXacNhan) {
    assert.equal(laXacNhan(s), true, `laXacNhan('${s}') phải trả true`);
  }
  assert.equal(bocXaGiao('đúng, 350W'), '350W');
  assert.equal(bocXaGiao('dạ 350W'), '350W');
});

test('[OZV-885-2] KICH_THUOC_RE nhận diện phi 60, ø60, DN 50 và thongSoTrong giữ đủ cả phi 60 lẫn 3mm', () => {
  assert.equal(daNeu('ống thép phi 60').kichThuoc, true);
  assert.equal(daNeu('ống thép ø60').kichThuoc, true);
  assert.equal(daNeu('van bi DN 50').kichThuoc, true);

  const ds = thongSoTrong('ống thép phi 60, dày 3mm');
  assert.ok(ds.includes('phi 60'), `thongSoTrong phải chứa 'phi 60', nhận được: ${JSON.stringify(ds)}`);
  assert.ok(ds.includes('3mm'), `thongSoTrong phải chứa '3mm', nhận được: ${JSON.stringify(ds)}`);

  const gop = giuThongSo('ống thép hàn', 'ống thép phi 60');
  assert.ok(gop.includes('phi 60'), `giuThongSo phải giữ được 'phi 60', nhận được: ${gop}`);
});

test('[OZV-885-3] CONG_DUNG_RE nhận diện gia đình, dân dụng, di động, mini đồng nhất giữa daNeu và coTenTrong', () => {
  assert.equal(daNeu('máy bơm gia đình').congDung, true);
  assert.equal(daNeu('quạt mini').congDung, true);
  assert.equal(daNeu('máy bơm dân dụng').congDung, true);
  assert.equal(daNeu('máy nén khí di động').congDung, true);

  assert.equal(coTenTrong('loại gia đình 350W'), false);
  assert.equal(coTenTrong('loại dân dụng 350W'), false);
  assert.equal(coTenTrong('loại di động 350W'), false);
  assert.equal(coTenTrong('loại mini 50W'), false);
});

test('[OZV-885-4] LOAI_HANG_RE bóc nhãn đại lượng để coTenTrong và xuLyTraLoiHoiLai không làm rụng tên hàng gốc', () => {
  assert.equal(coTenTrong('công suất 350W, điện áp 220V'), false);
  assert.equal(coTenTrong('dung tích 5L, công suất 1500W'), false);
  assert.equal(coTenTrong('đường kính phi 60, độ dày 3mm'), false);
  assert.equal(coTenTrong('chiều cao 12cm, kích thước 20cm, quy cách hàn, công dụng gia dụng'), false);

  const kq = xuLyTraLoiHoiLai('công suất 350W, điện áp 220V', {
    tenGoc: 'máy sấy',
    tenGoiY: 'máy sấy',
    hoiXacNhanTen: false,
  });
  assert.ok(
    kq.moTaTraCuu.startsWith('máy sấy'),
    `moTaTraCuu phải giữ nguyên 'máy sấy' ở đầu, nhận được: '${kq.moTaTraCuu}'`,
  );
  assert.ok(kq.moTaTraCuu.includes('350W') && kq.moTaTraCuu.includes('220V'));
});
