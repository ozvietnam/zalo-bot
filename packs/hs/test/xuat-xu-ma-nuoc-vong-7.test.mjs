// OZV-430 điểm 1 — VÒNG SOÁT 7 (giám đốc CHẶN PR #214 lần tư, sau khi #215 lên main `50907f2`).
//
// Vòng 4 đổi `findCountryInText` quét theo VỊ TRÍ trái→phải (vòng `i` ngoài, `len` trong) nên
// một TỪ ĐƠN va chạm đứng TRƯỚC thắng TÊN NƯỚC 2 TỪ đứng SAU — 6 hồi quy thật so với main,
// đều là câu mô tả hàng khách gõ hàng ngày (đối chiếu tay của giám đốc ở PR #214, soát vòng 6):
//
//   câu khách gõ         | main  | vòng 4–6 | gốc lỗi
//   "ong thép đúc Trung Quốc" | CN ✓ | DE ✗ | "đúc" rụng dấu → duc → Đức, nuốt "trung quốc" đứng sau
//   "máy hàn Nhật Bản"       | JP ✓ | KR ✗ | "hàn" → Hàn Quốc, nuốt "nhật bản"
//   "mỹ phẩm Hàn Quốc"       | KR ✓ | US ✗ | "mỹ" → Hoa Kỳ
//   "mỳ ăn liền Thái Lan"    | TH ✓ | US ✗ | "mỳ" → my → Hoa Kỳ
//   "my pham han quoc"       | KR ✓ | MY ✗ | "my" không dấu → Malaysia
//   "ổ cứng 500 GB SSD"      | null ✓ | GB ✗ | regex cuối thêm GB (vòng 4) bắt "GB" là DUNG LƯỢNG
//
// Sai nước ⇒ sai mức thuế in cho khách (Điều III) và mã đi vào mô tả khai báo (Điều VIII).
// main `50907f2` ra ĐÚNG cả 6 ca vì nó quét từ điển theo THỨ TỰ KHOÁ (khoá 2 từ đứng trước khoá
// 1 từ trong `NUOC`) nên khớp dài hơn thắng — vòng 7 đưa luật đó về tường minh: DÀI TRƯỚC, NGẮN SAU,
// bất kể vị trí. Regex mã trơ cuối câu về đúng DANH SÁCH của main (không có GB/HK): GB/HK trần
// trong câu tự do vẫn đọc được qua `maNuocTrongCau` ("hàng từ GB", "made in HK", "Nike ... HK").
//
// Ba điều vòng 4–5 phải GIỮ nguyên (có test riêng ở vòng đó, khoá lại ở đây một lần nữa):
//   "XK"/"VD" → null (rơi về giả định CN có nói); "UK"/"ANH"/"Anh" → GB (ô nhãn một mã);
//   "HK"/"Hồng Kông" → HK; "Mỹ" có dấu → US còn "my" không dấu → MY.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCountryInText, countryCode, xuatXuCua } from '../input.js';

// ── 6 hồi quy của bảng soát vòng 6 — phải ra đúng như main `50907f2` ──────────────────────────

const HOI_QUY_VONG_6 = [
  ['ong thép đúc Trung Quốc', 'CN', 'từ đơn "đúc" (Đức) không được nuốt "trung quốc" đứng sau'],
  ['máy hàn Nhật Bản', 'JP', 'từ đơn "hàn" (Hàn Quốc) không được nuốt "nhật bản" đứng sau'],
  ['mỹ phẩm Hàn Quốc', 'KR', 'từ đơn "mỹ" (Hoa Kỳ) không được nuốt "hàn quốc" đứng sau'],
  ['mỳ ăn liền Thái Lan', 'TH', 'từ đơn "mỳ" không được nuốt "thái lan" đứng sau'],
  ['my pham han quoc', 'KR', 'câu không dấu: "my" (Malaysia) không được nuốt "han quoc"'],
];

test('vòng 7: khớp TÊN NƯỚC DÀI thắng TỪ ĐƠN va chạm đứng trước — 5 ca về đúng như main', () => {
  for (const [s, mong, vi] of HOI_QUY_VONG_6) {
    assert.equal(findCountryInText(s), mong, `"${s}" phải là ${mong} — ${vi}`);
  }
});

test('vòng 7: "ổ cứng 500 GB SSD" KHÔNG có nước — "GB" là dung lượng, không phải Vương quốc Anh', () => {
  assert.equal(findCountryInText('ổ cứng 500 GB SSD'), null, '"GB" sau số là dung lượng (như main)');
  assert.equal(findCountryInText('USB 16 GB'), null, 'tương tự "16 GB"');
});

// Cùng luật đó qua ĐÚNG MỘT chỗ quyết định của gói (`xuatXuCua`) và qua ô CÓ NHÃN
// (`countryCode` cuối rơi về `findCountryInText`): sai một trong hai là sai nước gửi Cổng.
test('vòng 7: đường quyết định của gói — xuatXuCua không còn sai nước, không còn bịa GB', () => {
  assert.deepEqual(xuatXuCua('mỹ phẩm Hàn Quốc'), { ma: 'KR', giaDinh: false }, 'khách nói Hàn Quốc ⇒ KR, không phải giả định');
  assert.deepEqual(xuatXuCua('ổ cứng 500 GB SSD'), { ma: 'CN', giaDinh: true }, 'chưa nói nước ⇒ giả định CN và NÓI RÕ giả định, không bịa GB');
  assert.equal(countryCode('mỳ ăn liền Thái Lan'), 'TH', 'ô nhãn nhiều từ cũng phải qua cùng luật khớp dài');
});

// ── Không tệ hơn main: ca main đang ĐÚNG thì vẫn đúng ────────────────────────────────────────

test('vòng 7: ca main đang đúng vẫn đúng (không hồi quy mới)', () => {
  // "hàng từ Nhật" là ca của `xuat-xu.test.mjs` (issue #177) — từ đơn không va chạm thì vẫn lấy.
  assert.equal(findCountryInText('hàng từ Nhật'), 'JP');
  assert.equal(findCountryInText('hàng Trung Quốc'), 'CN');
  // Từ đơn va chạm mà KHÔNG có tên dài đứng sau thì hành vi như main ("đúc" vẫn là Đức — nợ cũ
  // chung của main và nhánh, giám đốc đã tách thẻ nợ, không thuộc vòng này).
  assert.equal(findCountryInText('ống thép đúc DN50'), 'DE');
});

// ── Ba điều của vòng 4–5 giữ nguyên ──────────────────────────────────────────────────────────

test('vòng 7: giữ vòng 5 — XK/VD không phải nước ⇒ rơi về giả định, không bịa', () => {
  assert.equal(countryCode('XK'), null);
  assert.equal(countryCode('VD'), null);
  assert.deepEqual(xuatXuCua({ nhan: 'XK' }), { ma: 'CN', giaDinh: true });
  assert.deepEqual(xuatXuCua({ nhan: 'VD' }), { ma: 'CN', giaDinh: true });
});

test('vòng 7: giữ vòng 4 — UK/ANH/Anh ⇒ GB ở ô nhãn một mã; HK/Hồng Kông ⇒ HK', () => {
  for (const v of ['UK', 'ANH', 'Anh', 'Xuất xứ: UK']) assert.equal(countryCode(v), 'GB', `"${v}" ⇒ GB`);
  for (const v of ['HK', 'hk', 'Hồng Kông', 'Hong Kong', 'Xuất xứ: Hồng Kông']) assert.equal(countryCode(v), 'HK', `"${v}" ⇒ HK`);
  // GB/HK trần trong CÂU TỰ DO vẫn đọc được qua `maNuocTrongCau` (từ dẫn / cuối câu) —
  // không cần thêm chúng vào regex mã trơ (chỗ bắt nhầm dung lượng "500 GB").
  assert.equal(countryCode('hàng từ GB'), 'GB');
  assert.equal(countryCode('made in HK'), 'HK');
  assert.equal(countryCode('Nike 64041190 HK'), 'HK');
});

test('vòng 7: nhóm D — "Mỹ" có dấu là Hoa Kỳ; luật "my" thường đổi ở vòng 8 (xem test vòng 8)', () => {
  assert.equal(findCountryInText('hàng Mỹ'), 'US');
  // Vòng soát 8 ĐỔI luật "my" không dấu: ở CÂU TỰ DO "my" thường là khách gõ thiếu dấu của
  // "Mỹ" ⇒ US; Malaysia chỉ khi viết IN HOA "MY" như mã ISO. Ca này chuyển sang test vòng 8.
  // ... nhưng trong câu có tên dài hơn thì tên dài thắng (chính là lỗi vòng 6 vừa sửa).
  assert.equal(findCountryInText('mỹ phẩm Hàn Quốc'), 'KR');
});
