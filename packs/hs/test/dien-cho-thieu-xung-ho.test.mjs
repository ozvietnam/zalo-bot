// Mục 5 của issue #168: câu trả lời phải dùng xưng hô trong hồ sơ khách, mặc định "anh/chị".
// `giong-quyen.js` đã theo luật này (B2/B3), nhưng CÂU HỎI LẠI của `dien-cho-thieu.js` còn gọi cứng "anh"
// — khách là chị thì lượt hỏi lại gọi sai ngay từ tin đầu. Test này chốt cả hai phía: mặc định an toàn
// "anh/chị" khi chưa biết, và dùng đúng "chị" khi hồ sơ/phiên đã biết.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kiemTraThongTinPhanLoai } from '../dien-cho-thieu.js';

// Mỗi ca: mô tả hàng đi vào một nhánh hỏi lại khác nhau trong `kiemTraThongTinPhanLoai`.
const CA = [
  ['máy sấy sinh tố', 'nghi gõ nhầm'],
  ['nồi chiên', 'nồi chiên thiếu thông số'],
  ['máy bơm nước', 'máy bơm thiếu thông số'],
  ['quạt điện', 'quạt điện thiếu thông số'],
  ['máy hút bụi', 'điện gia dụng khác'],
  ['bu lông', 'cơ khí vật liệu khác'],
  ['van bi', 'van bi'],
  ['ống thép', 'ống thép'],
];

test('hỏi lại: chưa biết xưng hô thì dùng "anh/chị", không gọi cứng "anh"', () => {
  for (const [moTa, nhan] of CA) {
    const r = kiemTraThongTinPhanLoai(moTa, { vongHoi: 0 });
    assert.equal(r.canHoi, true, `${nhan}: phải hỏi lại`);
    assert.match(r.cauHoi, /anh\/chị/i, `${nhan}: phải có "anh/chị" — ${r.cauHoi}`);
    // Không còn chỗ nào gọi "anh" một mình (bỏ qua chính cụm "anh/chị").
    const conLai = r.cauHoi.replace(/anh\/chị/gi, '•');
    assert.doesNotMatch(conLai, /(?:^|[^\p{L}])anh(?!\p{L})/iu, `${nhan}: còn gọi cứng "anh" — ${r.cauHoi}`);
  }
});

test('hỏi lại: hồ sơ ghi khách là chị thì gọi "chị" ở mọi nhánh', () => {
  for (const [moTa, nhan] of CA) {
    const r = kiemTraThongTinPhanLoai(moTa, { vongHoi: 0, xungHo: 'chị' });
    assert.equal(r.canHoi, true, `${nhan}: phải hỏi lại`);
    assert.match(r.cauHoi, /(?:^|[^\p{L}])[Cc]hị(?!\p{L})/u, `${nhan}: phải gọi "chị" — ${r.cauHoi}`);
    assert.doesNotMatch(r.cauHoi, /(?:^|[^\p{L}])[Aa]nh(?!\p{L})/u, `${nhan}: không được gọi "anh" — ${r.cauHoi}`);
  }
});

test('hỏi lại: xưng hô lạ hoặc rỗng thì vẫn về mặc định an toàn, không ghép chữ lạ vào câu', () => {
  const r = kiemTraThongTinPhanLoai('máy bơm nước', { vongHoi: 0, xungHo: 'bạn hiền' });
  assert.match(r.cauHoi, /anh\/chị/i);
  assert.doesNotMatch(r.cauHoi, /bạn hiền/);
});
