// packs/hs/test/xuat-xu-doc-nuoc.test.mjs — [S4] của lượt soát #168, mức ĐƠN VỊ.
//
// Hai hàm đọc nước (`countryCode`, `findCountryInText`) và hàm chốt (`xuatXuLoHang`) phải phân biệt
// "khách NÓI nước" với "trong câu tình cờ có hai chữ in hoa". Mô tả hàng hoá đầy viết tắt kỹ thuật
// (DC, AC, PE, PP, UV, SS…) và đơn vị đo (KG, CM, IN) trùng dạng — và nhiều cái trùng luôn MÃ NƯỚC
// THẬT (`PE` Peru, `SS` Nam Sudan, `ID` Indonesia, `IN` Ấn Độ, `CM` Cameroon, `KG` Kyrgyzstan), nên
// lọc theo mã ISO là cần nhưng KHÔNG đủ: phải có cả danh sách loại trừ.
//
// Bẫy riêng của tiếng Việt: bỏ dấu xong thì `hàn` (hàn xì) = `han` = Hàn Quốc, `mỹ phẩm` = `my` =
// Hoa Kỳ. `máy hàn` là mặt hàng nhập rất phổ biến ⇒ không phải ca biên.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countryCode, findCountryInText, xuatXuLoHang } from '../input.js';

/** Câu mô tả hàng hoá THẬT, không khách nào có ý nói xuất xứ. Không hàm nào được ra nước. */
const KHONG_PHAI_NUOC = [
  ['tra hs máy xay sinh tố 350W động cơ DC thân nhựa', 'DC = điện một chiều'],
  ['bơm nước AC 220V', 'AC = điện xoay chiều'],
  ['máy nén khí 5HP', 'HP = mã lực'],
  ['vải PE tráng PP', 'PE = polyethylene, cũng là mã nước Peru'],
  ['ống nhựa PVC phi 40', 'PVC = nhựa'],
  ['sơn chống UV', 'UV = tia cực tím'],
  ['tấm thép SS 304', 'SS = thép không gỉ, cũng là mã nước Nam Sudan'],
  ['đèn pha IP 65', 'IP = chuẩn kín nước'],
  ['đệm mút PU dày 5 ly', 'PU = polyurethane'],
  ['vỏ nhựa ABS', 'ABS = nhựa'],
  ['màn hình LCD 15 inch', 'LCD'],
  ['đèn LED 20W', 'LED'],
  ['máy CNC 3 trục', 'CNC'],
  ['cáp USB type C', 'USB'],
  ['dây cáp XL 2 lớp', 'XL'],
  ['máy hàn que 250A', 'hàn xì — bỏ dấu thành "han" = Hàn Quốc'],
  ['mối hàn thép không gỉ', 'hàn xì'],
  ['hàng mỹ phẩm dạng kem', 'mỹ phẩm — bỏ dấu thành "my" = Hoa Kỳ'],
  ['máy in laser A4', '"in" = Ấn Độ nếu vét hai chữ'],
  ['ống đường kính 2 IN', 'IN = inch'],
  ['kiện hàng nặng 5 KG', 'KG = kilogram, cũng là mã nước Kyrgyzstan'],
  ['thanh nhôm dài 50 CM', 'CM = centimet, cũng là mã nước Cameroon'],
];

/** Khách NÓI RÕ nước — phải nhận đúng, nếu không là làm mất tính năng chứ không phải sửa lỗi. */
const CO_NOI_NUOC = [
  ['máy hút bụi cầm tay nhập từ TQ', 'CN'],
  ['máy bơm nhập từ Trung Quốc', 'CN'],
  ['hàng xuất xứ Hàn Quốc', 'KR'],
  ['máy xay made in Japan', 'JP'],
  ['nguồn gốc Thái Lan', 'TH'],
  ['xuất xứ: PE', 'PE'],
  ['made in KR', 'KR'],
];

test('[S4] mô tả hàng hoá có viết tắt kỹ thuật: KHÔNG hàm nào được ra mã nước', () => {
  for (const [cau, vi] of KHONG_PHAI_NUOC) {
    assert.equal(findCountryInText(cau), null, `findCountryInText bịa nước từ "${cau}" (${vi})`);
    assert.equal(countryCode(cau), null, `countryCode bịa nước từ "${cau}" (${vi})`);
    const r = xuatXuLoHang(cau, { session: {} });
    assert.equal(r.biet, false, `xuatXuLoHang nhận vơ là đã biết nước: "${cau}" → ${JSON.stringify(r)} (${vi})`);
  }
});

test('[S4] khách nói rõ nước thì vẫn phải nhận đúng (không chặn oan)', () => {
  for (const [cau, mong] of CO_NOI_NUOC) {
    const r = xuatXuLoHang(cau, { session: {} });
    assert.deepEqual([r.xuatXu, r.biet], [mong, true], `mất nước khách đã nói: "${cau}" → ${JSON.stringify(r)}`);
  }
});

test('[S4] mã nước đứng riêng vẫn nhận được (cách khách gõ thật)', () => {
  // Tái hiện 2 của [S3] dựa vào đường này: `85094000 KR` không có từ khoá ngữ cảnh nào.
  assert.deepEqual(xuatXuLoHang('85094000 KR', { session: {} }, { bo: /[\d.\s]{4,}/ }), { xuatXu: 'KR', biet: true });
  assert.equal(countryCode('KR'), 'KR');
  assert.equal(countryCode('jp'), 'JP');
  // Hai chữ in hoa KHÔNG phải mã nước đã gán thì không được nhận, dù đứng riêng.
  assert.equal(countryCode('XX'), null, 'XX không phải mã nước đã gán');
  assert.equal(countryCode('DC'), null, 'DC là điện một chiều, không phải nước');
});

test('[S4] không rõ ngữ cảnh thì giữ xuatXuBiet=false, không gán mã ảo vào phiên', () => {
  const r = xuatXuLoHang('máy xay sinh tố 350W động cơ DC', { session: {} });
  assert.equal(r.biet, false);
  assert.notEqual(r.xuatXu, 'DC', 'mã ảo không được vào phiên: lượt sau sẽ kế thừa và tra_thue gọi nhầm FTA');
  // Nước khách đã nói ở lượt TRƯỚC vẫn thắng (bất biến của [S3], không được vỡ khi sửa [S4]).
  const r2 = xuatXuLoHang('máy xay 350W động cơ DC', { session: { last: { xuatXu: 'KR', xuatXuBiet: true } } });
  assert.deepEqual([r2.xuatXu, r2.biet], ['KR', true]);
});
