// OZV-430 điểm 1 — VÒNG SOÁT 4 (giám đốc CHẶN PR #214 lần ba): bốn nhóm lỗi còn lại.
//
// Vòng 3 vá được "tên nước có dấu rơi vào ô CÓ NHÃN" (`"Mỹ"` → US). Nhưng bộ dựng mã nước
// trong CÂU TỰ DO vẫn dùng regex ASCII `[A-Z]{2}` + ranh giới `[^A-Za-z0-9]`, nên chữ có dấu
// bị CẮT mảnh và đoạn còn lại đọc thành mã ISO thật:
//
//   câu khách gõ         | mã bot gửi Cổng | đúng ra        | vì sao sai
//   "hàng VIỆT NAM"      | VI              | VN             | "VI" là Virgin Islands (ISO thật)
//   "hàng MỸ" (NFD)      | MY              | US             | "MY" là Malaysia
//   "hàng ĐỒNG"          | NG              | không có nước  | "NG" là Nigeria
//   "hàng GHẾ"           | GH              | không có nước  | "GH" là Ghana
//   "CÀ PHÊ"              | PH              | không có nước  | "PH" là Philippines
//
// Gửi mã sai ⇒ Cổng không khớp dòng FTA nào nên ưu đãi C/O mẫu E rụng, khách đọc mức thuế
// cao hơn thật mà tưởng đã tra đúng (Điều III), và mã này đi thẳng vào `sinh_mo_ta_khai_bao`
// tức là in lên MÔ TẢ KHAI BÁO khách dán vào tờ khai (Điều VIII).
//
// Bốn nhóm giám đốc yêu cầu ở vòng này:
//   A. Bộ dựng mã phải hiểu CHỮ UNICODE (chữ + dấu) — không cắt "VIỆT" thành "VI".
//   B. Anh phải gửi "GB": Cổng so ISO alpha-2 (hs-code-api `data/iso-3166-vn.json:16`;
//      `lib/fta.js:43` UKVFTA.thanhVien = ['VN','GB']), "UK" không phải mã nước nào.
//   C. Hồng Kông phải gửi "HK" (`data/iso-3166-vn.json:18`). "XK"/"VD" KHÔNG phải nước — "XK" là
//      BIỂU THUẾ XUẤT KHẨU (`lib/customs-types.js:20`, `data/bieu-thue/README.md`), "VD" không có
//      trong danh mục Cổng ⇒ cả hai rơi về giả định có nói, không được bịa nước (vòng soát 4 bỏ alias).
//   D. "Mỹ" (CÓ DẤU) = Hoa Kỳ (US); "MY"/"my" (KHÔNG DẤU) = Malaysia (MY). Khoá `my` trong
//      từ điển phải GIỮ (xoá đi là lặp lại đúng lỗi "bác bỏ nước thật" đã bị chặn ở vòng 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countryCode, maNuocTrongCau, findCountryInText, tenNuoc, NUOC, ALIAS, xuatXuCua } from '../input.js';

// ── A. Bộ dựng mã phải hiểu chữ Unicode ───────────────────────────────────────────────────────

test('A: từ CÓ DẤU không được cắt thành mã ISO (VI/MY/NG/GH/PH)', () => {
  assert.equal(countryCode('hàng VIỆT NAM'), 'VN', '"VIỆT NAM" là Việt Nam ⇒ VN, không phải VI (Virgin Islands)');
  assert.equal(countryCode('hàng viet nam'), 'VN');
  assert.equal(countryCode('hàng MỸ'), 'US', '"MỸ" là Hoa Kỳ ⇒ US, không phải MY (Malaysia)');
  assert.equal(countryCode('hàng Mỹ'.normalize('NFD')), 'US', 'dạng NFD (dấu rời) cũng phải là US');
  for (const [s, nham] of [['hàng ĐỒNG', 'NG'], ['hàng GHẾ', 'GH'], ['CÀ PHÊ', 'PH']]) {
    assert.equal(countryCode(s), null, `"${s}" không khai nước nào — mã cũ đọc nhầm ra ${nham}`);
    assert.equal(maNuocTrongCau(s), null, `"${s}" không được ra mã nước nào`);
  }
  assert.equal(maNuocTrongCau('hàng VIỆT NAM'), null);
  assert.equal(maNuocTrongCau('hàng MỸ'), null);
});

test('A: rào ký hiệu kỹ thuật vẫn chặn, mã nước thật vẫn lấy', () => {
  for (const s of ['DN25', 'CF8M', 'SS304', 'PN16']) {
    assert.equal(maNuocTrongCau(`van bi ${s}`), null, `"${s}" là ký hiệu kỹ thuật, không phải nước`);
    assert.equal(countryCode(s), null, `"${s}" không phải nước`);
  }
  assert.equal(countryCode('Nike 64041190 CN'), 'CN', 'mã nước thật cuối câu vẫn lấy');
  assert.equal(maNuocTrongCau('Nike 64041190 CN'), 'CN');
});

// ── B. Anh = GB ───────────────────────────────────────────────────────────────────────────────

test('B: Anh phải gửi GB cho Cổng (Cổng không so "UK")', () => {
  for (const v of ['Anh', 'anh', 'UK', 'uk', 'Xuất xứ: Anh', 'Xuất xứ: UK', 'xuất xu: uk', 'Vương quốc Anh']) {
    assert.equal(countryCode(v), 'GB', `"${v}" là Vương quốc Anh ⇒ GB`);
  }
  assert.equal(countryCode('GB'), 'GB', 'mã ISO GB vẫn giữ nguyên');
  assert.equal(tenNuoc('GB'), 'Vương quốc Anh', 'tin khách phải gọi tên nước, không in mã');
});

// ── C. Hồng Kông = HK ────────────────────────────────────────────────────────────────────────

test('C: Hồng Kông phải gửi HK; XK/VD không phải nước ⇒ rơi về giả định, không bịa', () => {
  for (const v of ['Hồng Kông', 'hồng kông', 'Hong Kong', 'Xuất xứ: Hồng Kông', 'Xuất xứ: Hong Kong', 'HK', 'hk']) {
    assert.equal(countryCode(v), 'HK', `"${v}" là Hồng Kông ⇒ HK`);
  }
  assert.equal(tenNuoc('HK'), 'Hồng Kông');
  // "XK" ở Cổng là BIỂU THUẾ XUẤT KHẨU (không phải nước), "VD" không có trong danh mục Cổng
  // và không phải mã ISO — vòng soát 4 bỏ hai alias cũ XK→HK, VD→VN khỏi bảng.
  assert.equal(countryCode('XK'), null, '"XK" là biểu thuế xuất khẩu, không phải nước');
  assert.equal(countryCode('VD'), null, '"VD" không có trong danh mục Cổng, không phải nước');
  assert.ok(!('XK' in ALIAS) && !('VD' in ALIAS), 'XK/VD không được nằm trong bảng ALIAS');
  // Khách khai rác ở ô Xuất xứ ⇒ bot KHÔNG bịa nước khách chưa nói: giả định CN + nói rõ giả định.
  assert.deepEqual(xuatXuCua({ nhan: 'XK' }), { ma: 'CN', giaDinh: true });
  assert.deepEqual(xuatXuCua({ nhan: 'VD' }), { ma: 'CN', giaDinh: true });
});

// ── D. "Mỹ" có dấu = Hoa Kỳ, "MY"/"my" không dấu = Malaysia ─────────────────────────────────

test('D: "Mỹ" (có dấu) là Hoa Kỳ, "MY"/"my" (không dấu) là Malaysia', () => {
  assert.equal(countryCode('hàng Mỹ'), 'US');
  assert.equal(countryCode('hàng Mỹ'.normalize('NFD')), 'US');
  assert.equal(countryCode('hàng MY'), 'MY', '"MY" là mã ISO Malaysia');
  assert.equal(countryCode('hàng my'), 'MY', '"my" không dấu là mã ISO Malaysia, không phải Hoa Kỳ');
  assert.equal(findCountryInText('hàng Mỹ'), 'US');
  assert.equal(findCountryInText('hàng my'), 'MY');
});

// ── Ràng của bảng alias: CHỈ ở ô CÓ NHÃN, không quét trong câu tự do ───────────────────────────

test('bảng alias chỉ dùng ở ô khai một mã — không đoán trong câu tự do', () => {
  // "anh" trong câu tự do là ĐẠI TỪ ("anh gửi hàng"), không phải Vương quốc Anh.
  assert.equal(findCountryInText('anh gửi hàng'), null, '"anh" là đại từ, không được đọc thành nước');
  assert.equal(countryCode('anh gửi hàng'), null);
  assert.equal(findCountryInText('cảm ơn anh'), null);
  // Bảng alias phải là bảng RIÊNG, không nhét vào từ điển tên nước (từ điển quét trong câu).
  assert.ok(!Object.keys(NUOC).includes('anh'), '"anh" không được nằm trong từ điển quét câu');
  assert.ok(ALIAS.ANH === 'GB' && ALIAS.UK === 'GB', 'alias Anh/UK ⇒ GB');
});
