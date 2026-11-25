// OZV-644 — hai nhóm mã ISO bị đọc nhầm thành nước ở `packs/hs/input.js` (lỗi có sẵn ở main).
//
// Nhóm A: bản KHÔNG DẤU của từ dẫn (`tu`/`tai`/`o`/`cua`) đứng sau TÊN HÀNG / THƯƠNG HIỆU
//   ("vong o BI" = vòng ổ bi, "khung cua AL" = khung cửa nhôm, "Hoa Phat tu BT" = tủ BT,
//   "may tu nuoc RO") bị coi là "từ/tại/ở/của" ⇒ mã sau nó thành nước.
// Nhóm B: đơn vị đo / hậu tố kỹ thuật đứng sau CON SỐ nhưng ngoài `DON_VI_DO`
//   ("500 MG", "100 VA", "6205 LU", "110 PE", "304 BA") bị đọc thành nước.
//
// Đo trên cả 3 đường thật: `countryCode` (ô có nhãn, brain), luật gói 6 (`maCuoiCau`,
// đường vào `kiem_tra_shtt`) và `xuatXuCua`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countryCode, maCuoiCau, aliasCuoiCau, xuatXuCua, VIET_TAT_KHONG_PHAI_NUOC, ALIAS_TRONG_CAU } from '../input.js';

// Đúng luật gói 6 (`packs/hs/packages.js` — `kiem_tra_shtt`) khi khách không có ô "Xuất xứ:".
const goi6 = (conLai) => {
  const cuoi = maCuoiCau(conLai);
  return (cuoi && !VIET_TAT_KHONG_PHAI_NUOC.has(cuoi)
    ? (ALIAS_TRONG_CAU[cuoi] ? aliasCuoiCau(conLai) : countryCode(cuoi)) : null) || null;
};
const nhan = (s) => { const x = xuatXuCua({ nhan: s }); return x.giaDinh ? null : x.ma; };

const KHONG_PHAI_NUOC = [
  // Nhóm A — danh từ hàng không dấu đứng sau tên hàng / thương hiệu
  '84821000 vong o BI', '76101000 khung cua AL', '85371099 Hoa Phat tu BT', 'may tu nuoc RO',
  // Nhóm B — đơn vị đo / hậu tố kỹ thuật sau số
  'thuốc 500 MG', 'biến áp 100 VA', 'vòng bi 6205 LU', 'ống 110 PE', 'inox 304 BA',
];

for (const s of KHONG_PHAI_NUOC) {
  test(`OZV-644: "${s}" không bị đọc thành mã nước`, () => {
    assert.equal(countryCode(s), null, 'countryCode');
    assert.equal(goi6(s), null, 'gói 6 (maCuoiCau)');
    assert.equal(nhan(s), null, 'xuatXuCua({nhan})');
    assert.deepEqual(xuatXuCua(s), { ma: 'CN', giaDinh: true }, 'xuatXuCua tự do');
  });
}

test('OZV-644: không hồi quy — từ dẫn không dấu sau từ ngữ cảnh vẫn nhận nước', () => {
  for (const [s, ma] of [['hàng tu GB', 'GB'], ['hang tu BG', 'BG'], ['SX tai TQ', 'CN'], ['SX tai SK', 'SK'],
    ['hàng tai SK', 'SK'], ['hang cua UK', 'GB'], ['hang o UK', 'GB'], ['nhap tu JP', 'JP'],
    ['san xuat tai KR', 'KR']]) {
    assert.equal(countryCode(s), ma, s);
  }
});

test('OZV-644: không hồi quy — danh sách trong thẻ', () => {
  assert.equal(countryCode('hàng tu GB'), 'GB');
  assert.equal(goi6('hàng tu GB'), 'GB');
  assert.equal(countryCode('hàng từ GB'), 'GB');
  assert.equal(goi6('hàng từ GB'), 'GB');
  assert.equal(countryCode('made in UK'), 'GB');
  assert.deepEqual(xuatXuCua('made in UK'), { ma: 'GB', giaDinh: false });
  assert.equal(countryCode('Nike 64041190 CN'), 'CN');
  assert.equal(goi6('Nike 64041190 CN'), 'CN');
  assert.equal(countryCode('Xuất xứ: MM'), 'MM');
});

test('OZV-644: mã nước thật đứng sau MÃ HS 8 số vẫn là nước (rào số lượng giữ nguyên)', () => {
  for (const ma of ['PE', 'LU', 'BA', 'MG', 'VA']) {
    assert.equal(goi6(`Nike 64041190 ${ma}`), ma, `64041190 ${ma}`);
    assert.equal(countryCode(`Nike 6404.11.90 ${ma}`), ma, `6404.11.90 ${ma}`);
  }
  // Ô khai riêng một mã: khách cố ý khai ⇒ vẫn là nước.
  for (const ma of ['PE', 'LU', 'BA', 'MG', 'VA']) assert.equal(countryCode(`Xuất xứ: ${ma}`), ma);
});
