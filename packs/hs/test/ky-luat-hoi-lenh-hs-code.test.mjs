// packs/hs/test/ky-luat-hoi-lenh-hs-code.test.mjs — OZV-2287 (lát 6 OZV-437):
// khách gõ "hs code" có khoảng trắng ("tra hs code ống thép", "mã hs code ống thép"…)
// thì lệnh bị bóc TRỌN — chữ "code" không dính vào tên hàng gửi Cổng.
// Chốt ngược: "code" đứng sau chữ khác ("mã hs của đèn code 55") vẫn còn nguyên (OZV-2266).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LENH_DAU_RE } from '../ky-luat-hoi.js';
import { kiemTraThongTinPhanLoai } from '../dien-cho-thieu.js';

const boc = (c) => c.replace(LENH_DAU_RE, '').trim();

test('LENH_DAU_RE nhận "hs code" có khoảng trắng, không rớt chữ "code" (OZV-2287)', () => {
  for (const c of [
    'tra hs code ống thép',
    'mã hs code ống thép',
    'tra cứu mã hs code ống thép',
    'xin mã hs code ống thép',
    'check mã hs code ống thép',
  ]) {
    assert.equal(boc(c), 'ống thép', `bóc sai: "${c}" → "${boc(c)}"`);
  }
  assert.equal(boc('mã hs code của van bi'), 'của van bi');
});

test('LENH_DAU_RE không hồi quy: "hscode"/"hs" dính và biên cuối từ (OZV-2287 giữ OZV-2266)', () => {
  for (const c of [
    'tra hscode ống thép',
    'tra hs ống thép',
    'tra mã hs ống thép',
  ]) {
    assert.equal(boc(c), 'ống thép', `hồi quy: "${c}" → "${boc(c)}"`);
  }
  // Biên cuối từ: không ăn NỬA chữ — "hs codien"/"hs code55" không rụt "code" rồi để "…ien/55"
  assert.equal(boc('mã hs của đèn code 55'), 'của đèn code 55', '"code" sau chữ khác bị bóc oan');
  assert.equal(boc('tra hscode'), '');
});

test('"tra hs code <tên>" → canHoi true, bot hỏi lại thay vì tự chốt (OZV-2287)', () => {
  for (const c of ['tra hs code ống thép', 'mã hs code ống thép']) {
    const r = kiemTraThongTinPhanLoai(c, { vongHoi: 1 });
    assert.equal(r.canHoi, true, `tự chốt không hỏi lại: "${c}"`);
  }
});
