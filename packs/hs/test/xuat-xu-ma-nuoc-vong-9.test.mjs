// OZV-489 / OZV-430 điểm 1 — VÒNG SOÁT 9 PR #214 (giám đốc chặn 1 điểm ở head `6972e8b`).
//
// Vòng 8 chốt "Gói 6 chỉ nhận mã cuối câu" nhưng còn SÓT một lỗ thật: alias "UK" đứng CUỐI CÂU mà
// KHÔNG có từ dẫn xuất xứ vẫn bị đọc thành nước.
//
//   - `maNuocTrongCau` (`packs/hs/input.js`): vòng 8 cho alias đi CHUNG nhánh với mã ISO
//     ("đứng cuối ô" ⇒ nhận) ⇒ "áo size UK" ⇒ GB, trong khi "UK" ở đây là KÍCH CỠ giày.
//   - Gói 6 (`packs/hs/packages.js`): mã cuối câu "UK" đi qua `countryCode('UK')` ⇒ ALIAS ⇒ GB.
//
// Hệ quả: gói 6 "Nike 64041190 áo size UK" đẩy `xuatXu: 'GB'` lên Cổng ⇒ đèn rủi ro nhãn hiệu sai.
//
// LUẬT VÒNG 9: ALIAS ("UK") trong câu CHỈ được nhận khi đứng NGAY SAU từ dẫn xuất xứ
// ("made in UK" ⇒ GB). MÃ ISO THẬT ở cuối câu vẫn nhận như cũ ("Nike 64041190 CN" ⇒ CN),
// và ô CÓ NHÃN vẫn nhận mọi mã/alias như cũ ("Xuất xứ: UK" ⇒ GB).
//
// Ca đầu-cuối (đo qua `hs.handle`, Gói 6) nằm ở test "hồi quy 2" trong
// `xuat-xu-ma-nuoc-vong-8.test.mjs` — cùng bộ, để ca hồi quy của Gói 6 nằm chung chỗ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countryCode, findCountryInText } from '../input.js';

test('vòng 9: alias ở cuối câu KHÔNG có từ dẫn thì không phải nước — "áo size UK" ⇒ null', () => {
  assert.equal(countryCode('áo size UK'), null, '"UK" là kích cỡ giày, không phải xuất xứ');
  assert.equal(findCountryInText('áo size UK'), null);
});

test('vòng 9: alias SAU từ dẫn vẫn nhận — "made in UK" ⇒ GB', () => {
  assert.equal(countryCode('made in UK'), 'GB', '"made in UK" là Vương quốc Anh');
  assert.equal(countryCode('Xuất xứ: made in UK'), 'GB');
  assert.equal(findCountryInText('made in UK'), 'GB');
});

test('vòng 9: giữ vòng 8 — ô nhãn trần UK/ANH/Anh ⇒ GB; "size UK 10" ⇒ null', () => {
  for (const v of ['UK', 'ANH', 'Anh', 'Xuất xứ: UK']) assert.equal(countryCode(v), 'GB', `"${v}" ⇒ GB`);
  assert.equal(countryCode('size UK 10'), null, '"UK" trong cỡ áo không phải nước');
  assert.equal(findCountryInText('size UK 10'), null);
});

test('vòng 9: mã ISO THẬT ở cuối câu vẫn nhận — không vỡ luật Gói 6', () => {
  assert.equal(countryCode('Nike 64041190 CN'), 'CN');
  assert.equal(countryCode('Nike 64041190 JP'), 'JP');
});
