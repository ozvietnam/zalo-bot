// Test cho lamGonCauHoi bóc LỆNH HS theo LENH_DAU_RE dùng chung (OZV-2307, lát 11 OZV-437).
// Đỏ trước: bảng `bo` trong packages.js chép tay các mẫu lệnh HS nên lạc hậu sau khi lát 6
// (OZV-2287) thêm lệnh mới vào LENH_DAU_RE — 'phân loại', 'tra cứu', 'check', 'xin', 'tìm mã'
// ở đầu câu dính vào TÊN HÀNG gửi Cổng ("phân loại máy xay sinh tố" → tra món "phân loại máy xay").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lamGonCauHoi } from '../packages.js';

test('lệnh HS ở ĐẦU câu lấy từ LENH_DAU_RE — chữ lệnh không dính tên hàng gửi Cổng', () => {
  // 5 lệnh LAT 6 thêm vào LENH_DAU_RE mà bảng chép tay `bo` không có → đỏ trước khi vá.
  assert.equal(lamGonCauHoi('phân loại máy xay sinh tố'), 'máy xay sinh tố');
  assert.equal(lamGonCauHoi('tra cứu mã hs gạo st25'), 'gạo st25');
  assert.equal(lamGonCauHoi('check mã hs cảm biến tiệm cận'), 'cảm biến tiệm cận');
  assert.equal(lamGonCauHoi('xin mã hs máy sấy thực phẩm'), 'máy sấy thực phẩm');
  assert.equal(lamGonCauHoi('tìm mã thỏi vàng 9999'), 'thỏi vàng 9999');
});

test('"hs code/hscode/mã số hs" đứng LẠI giữa câu vẫn bỏ — tên hàng không mang chữ "hs"', () => {
  // Dạng giữa câu vẫn phải bỏ như bảng cũ: "hs"/"hscode" không bao giờ là chữ của MÓN HÀNG.
  assert.equal(lamGonCauHoi('cảm biến tiệm cận hs code bao nhiêu em'), 'cảm biến tiệm cận');
  assert.equal(lamGonCauHoi('hs code ống thép'), 'ống thép');
  assert.equal(lamGonCauHoi('hscode ống thép'), 'ống thép');
  assert.equal(lamGonCauHoi('mã số hs ống thép'), 'ống thép');
  assert.equal(lamGonCauHoi('mã hs code van bi'), 'van bi');
});

test('"phân loại"/"tìm mã" GIỮA tên hàng là chữ của MÓN HÀNG — giữ nguyên', () => {
  // "máy phân loại gạo" (chương 8437), "máy tìm mã vạch": lệnh chỉ tính khi đứng ĐẦU câu,
  // còn giữa câu đó là tên hàng — bóc nhầm là gửi Cổng một nửa món hàng.
  assert.equal(lamGonCauHoi('máy phân loại gạo'), 'máy phân loại gạo');
  assert.equal(lamGonCauHoi('máy tìm mã vạch'), 'máy tìm mã vạch');
});

test('lời nhờ "tra …" và chữ xã giao cũ vẫn bỏ như trước (không hồi quy)', () => {
  assert.equal(lamGonCauHoi('tra hs máy xay sinh tố'), 'máy xay sinh tố');
  assert.equal(lamGonCauHoi('tra mã số hs ống thép'), 'ống thép');
  assert.equal(lamGonCauHoi('tra hscode ống thép'), 'ống thép');
  assert.equal(lamGonCauHoi('cho em hỏi mã hs của áo khoác là bao nhiêu'), 'áo khoác');
  // "em" của "trẻ em" là chữ của món hàng (xe đạp trẻ em khác xe đạp người lớn) — phải giữ.
  assert.equal(lamGonCauHoi('xe đạp trẻ em'), 'xe đạp trẻ em');
  assert.equal(lamGonCauHoi('máy sấy thực phẩm 500W'), 'máy sấy thực phẩm 500W');
});

test('packages.js hết bảng lệnh HS chép tay — nguồn lệnh là LENH_DAU_RE dùng chung', () => {
  const src = readFileSync(new URL('../packages.js', import.meta.url), 'utf8');
  // Mảng `bo` chỉ còn chữ đệm hỏi/xã giao, hết mẫu lệnh HS ('mã hs', 'hs code', 'hscode'…):
  // chỗ đó là nơi bảng đã lạc hậu sau lát 6 (OZV-2287) — đúng lỗi OZV-2307 đang vá.
  const bo = src.match(/const bo = \[[^\]]*\]/s);
  assert.ok(bo, 'phải còn mảng `bo` trong lamGonCauHoi');
  assert.doesNotMatch(bo[0], /hs/i, '`bo` còn mẫu lệnh HS chép tay — phải bóc lệnh bằng LENH_DAU_RE chung');
  assert.match(src, /LENH_DAU_RE/, 'packages.js phải nhập LENH_DAU_RE từ ky-luat-hoi.js làm nguồn lệnh');
});
