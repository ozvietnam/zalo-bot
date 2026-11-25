// packs/hs/test/ky-luat-hoi-lenh-tra-ma-hs.test.mjs — OZV-2266 (lát 3 OZV-437):
// khách gõ lệnh tra kèm tên hàng ("tra mã hs ống thép", "tra hscode ống thép"…) thì bóc ĐÚNG lệnh
// — còn nguyên tên hàng — và bot hỏi lại thông tin thiếu thay vì tự chốt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LENH_DAU_RE } from '../ky-luat-hoi.js';
import { kiemTraThongTinPhanLoai } from '../dien-cho-thieu.js';

const boc = (c) => c.replace(LENH_DAU_RE, '').trim();

test('LENH_DAU_RE bóc đúng lệnh tra mã HS, còn nguyên tên hàng (OZV-2266)', () => {
  for (const c of [
    'tra hscode ống thép',
    'tra hs ống thép',
    'tra mã hs ống thép',
    'tra cứu mã hs ống thép',
    'xin mã hs ống thép',
    'check mã hs ống thép',
    'mã hs ống thép',
    'mã hscode ống thép',
    'tìm mã ống thép',
    'phân loại ống thép',
  ]) {
    assert.equal(boc(c), 'ống thép', `bóc sai: "${c}" → "${boc(c)}"`);
  }
  // Biên cuối từ: "tra hscode" bóc TRỌN, không rụt lại nửa chữ "hs"
  assert.equal(boc('tra hscode'), '');
});

test('LENH_DAU_RE không bóc oan câu không phải lệnh tra mã HS (chốt ngược OZV-2266)', () => {
  for (const c of ['xin chào', 'tra cứu hải quan', 'tra giúp em ống thép']) {
    assert.equal(boc(c), c, `bóc oan: "${c}" → "${boc(c)}"`);
  }
});

test('lệnh tra kèm tên hàng → canHoi true, bot hỏi lại thay vì tự chốt (OZV-2266)', () => {
  for (const c of [
    'tra hscode ống thép',
    'tra mã hs ống thép',
    'tra cứu mã hs ống thép',
    'xin mã hs ống thép',
    'check mã hs ống thép',
  ]) {
    const r = kiemTraThongTinPhanLoai(c, { vongHoi: 1 });
    assert.equal(r.canHoi, true, `tự chốt không hỏi lại: "${c}"`);
  }
  // Đúng hiện nay không được hỏng
  for (const c of ['tra hs ống thép', 'tìm mã ống thép', 'phân loại ống thép']) {
    assert.equal(kiemTraThongTinPhanLoai(c, { vongHoi: 1 }).canHoi, true, `mất canHoi: "${c}"`);
  }
});
