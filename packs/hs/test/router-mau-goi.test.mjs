// Ca KB5 và KB8 của #168 (mục C) đo được hai lỗi lái gói trong `chonGoi` (`packs/hs/router.js:52`):
//
//  1. KB5 "viết mô tả khai báo": khách nói RÕ ý muốn ("viết mô tả khai báo giúp em") nhưng trong tin có
//     nhãn "Thương hiệu:" → luật nhãn hiệu (gói 6) chặn trước luật mô tả (gói 3), khách xin mô tả khai báo
//     lại nhận bản đánh giá rủi ro nhãn hiệu. Ý khách nói thẳng phải thắng một nhãn thuộc tính đi kèm.
//
//  2. KB8 "bị Hải quan áp mã khác": MẪU NHẬP LIỆU do chính bot in ra cho gói 7
//     ("Mã khai: … / Mã Hải quan áp: …") không chứa từ khoá nào của gói 7 → rơi vào gói 1, bot trả
//     "mã phù hợp nhất là <chính mã khách đã khai>" mà không hề nhắc tới việc đang tranh chấp mã.
//
// Luật chốt ở đây: mẫu nhập liệu bot tự in ra phải lái về đúng gói đã in nó.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chonGoi } from '../router.js';
import { PACKAGES } from '../packages.js';

/** Mẫu nhập liệu của một gói, bỏ các dòng chú thích trong ngoặc (hướng dẫn, khách không gõ lại). */
function mauCuaGoi(so) {
  const p = PACKAGES.find((x) => x.so === so);
  return p.mau.split('\n').filter((l) => !/^\s*\(/.test(l)).join('\n');
}

test('KB5: khách nói rõ "viết mô tả khai báo" thì nhãn "Thương hiệu:" không được lái sang gói nhãn hiệu', () => {
  const tin = 'viết mô tả khai báo giúp em\nMã HS: 85094000\nTên hàng: Máy xay thực phẩm\nThương hiệu: Philips\nModel: HR2051\nXuất xứ: CN\nTình trạng: mới 100%';
  const r = chonGoi(tin, PACKAGES);
  assert.equal(r.pkg.id, 'mo-ta', `phải vào gói 3 (viết mô tả khai báo), thực tế gói ${r.pkg.so} ${r.pkg.id}`);
});

test('KB8: mẫu nhập liệu của gói 7 phải lái về đúng gói 7 (hồ sơ giải trình)', () => {
  const r = chonGoi(mauCuaGoi(7), PACKAGES);
  assert.equal(r.pkg.id, 'giai-trinh', `mẫu gói 7 phải vào gói 7, thực tế gói ${r.pkg.so} ${r.pkg.id}`);
  // Khách gõ nhãn rút gọn "Mã HQ:" cũng là mẫu của gói 7.
  const gon = chonGoi('Mã khai: 85094000\nMã HQ: 85098000\nMô tả hàng: Máy xay thực phẩm gia dụng', PACKAGES);
  assert.equal(gon.pkg.id, 'giai-trinh', `nhãn "Mã HQ:" phải vào gói 7, thực tế gói ${gon.pkg.so} ${gon.pkg.id}`);
});

test('không hồi quy: các đường lái gói đã đúng vẫn giữ nguyên', () => {
  // Gói 6: khách chỉ nêu nhãn hiệu, không nói gì tới mô tả khai báo.
  assert.equal(chonGoi(mauCuaGoi(6), PACKAGES).pkg.id, 'shtt');
  // Gói 1, 2, 5: mẫu của chúng vẫn tự lái đúng.
  assert.equal(chonGoi(mauCuaGoi(1), PACKAGES).pkg.id, 'phan-loai');
  assert.equal(chonGoi(mauCuaGoi(2), PACKAGES).pkg.id, 'thue-thu-tuc');
  assert.equal(chonGoi(mauCuaGoi(5), PACKAGES).pkg.id, 'phap-luat');
  // Chỉ có mã HS → gói 2, và bộ dò đã đủ chắc (không cần hỏi não).
  const chiMa = chonGoi('85094000', PACKAGES);
  assert.equal(chiMa.pkg.id, 'thue-thu-tuc');
  assert.equal(chiMa.chac, true);
  // Câu "soát tờ khai" vẫn về gói 4.
  assert.equal(chonGoi('soát tờ khai giúp em\nMã HS: 85094000\nMô tả: Máy xay 350W', PACKAGES).pkg.id, 'kiem-tra');
  // Câu tranh chấp mã nói bằng lời vẫn về gói 7.
  assert.equal(chonGoi('hải quan áp mã khác với mã em khai', PACKAGES).pkg.id, 'giai-trinh');
});
