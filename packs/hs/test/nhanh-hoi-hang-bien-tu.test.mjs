// packs/hs/test/nhanh-hoi-hang-bien-tu.test.mjs — OZV-883: biên từ Unicode cho CO_KHI_VAT_LIEU_RE & laMayMocNgan và tách nhánh ống thép.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kiemTraThongTinPhanLoai } from '../dien-cho-thieu.js';
import { giaDinhNhomHang } from '../nhanh-hoi-hang.js';

test('[OZV-883-1] "ốc vít" và "khoá cửa" (có dấu ở đầu/cuối từ) vào nhánh cơ khí, hỏi chất liệu + quy cách kích thước', () => {
  for (const mon of ['ốc vít', 'khoá cửa', 'khóa cửa']) {
    const r = kiemTraThongTinPhanLoai(mon, { vongHoi: 0 });
    assert.equal(r.canHoi, true, `"${mon}" phải hỏi lại thuộc tính`);
    assert.match(r.cauHoi, /chất liệu gì/i, `"${mon}" phải hỏi chất liệu: "${r.cauHoi}"`);
    assert.match(r.cauHoi, /quy cách kích thước/i, `"${mon}" phải xin quy cách kích thước: "${r.cauHoi}"`);
  }
});

test('[OZV-883-2] "ống thép" (bắt đầu bằng "ố") vào nhánh ống thép, hỏi loại đúc hay hàn, có mạ kẽm không', () => {
  const r = kiemTraThongTinPhanLoai('ống thép', { vongHoi: 0 });
  assert.equal(r.canHoi, true);
  assert.match(r.cauHoi, /ống thép này là loại đúc hay hàn, có mạ kẽm không/i, `"${r.cauHoi}"`);
  assert.match(r.cauHoi, /đường kính và độ dày/i, `"${r.cauHoi}"`);
});

test('[OZV-883-3] "ống nhựa" và "ống đồng" KHÔNG bị hỏi nhầm "ống thép đúc hay hàn" và KHÔNG hỏi lại chất liệu', () => {
  for (const mon of ['ống nhựa', 'ống đồng']) {
    const r = kiemTraThongTinPhanLoai(mon, { vongHoi: 0 });
    assert.equal(r.canHoi, true, `"${mon}" phải hỏi thêm quy cách/công dụng`);
    assert.doesNotMatch(r.cauHoi, /ống thép|đúc hay hàn|mạ kẽm/i, `"${mon}" không được hỏi câu của ống thép: "${r.cauHoi}"`);
    assert.doesNotMatch(r.cauHoi, /chất liệu gì/i, `"${mon}" đã có chất liệu nên không hỏi lại chất liệu: "${r.cauHoi}"`);
    assert.ok(!r.thieu.includes('chatLieu'), `"${mon}" không được liệt kê thiếu chatLieu: ${JSON.stringify(r.thieu)}`);
    assert.match(r.cauHoi, /quy cách kích thước.*công dụng/i, `"${mon}" chỉ xin thêm quy cách kích thước hoặc công dụng: "${r.cauHoi}"`);
  }
});

test('[OZV-883-4] "thiết bị lọc nước" (kết bằng "ị" trước khoảng trắng) vào hoiDienGiaDung, hỏi gia đình/công nghiệp + công suất/điện áp', () => {
  const r = kiemTraThongTinPhanLoai('thiết bị lọc nước', { vongHoi: 0 });
  assert.equal(r.canHoi, true);
  assert.match(r.cauHoi, /thiết bị lọc nước này dùng cho gia đình hay công nghiệp/i, `"${r.cauHoi}"`);
  assert.match(r.cauHoi, /công suất \(W\) và điện áp/i, `"${r.cauHoi}"`);
});

test('[OZV-883-5] giaDinhNhomHang("ốc vít") và giaDinhNhomHang("ống thép") trả đúng giả định nhóm cơ khí / ống thép', () => {
  assert.equal(giaDinhNhomHang('ốc vít'), 'ốc vít quy cách thông dụng trong công nghiệp');
  assert.equal(giaDinhNhomHang('ống thép'), 'ống thép hàn, không mạ kẽm, quy cách thông dụng');
});
