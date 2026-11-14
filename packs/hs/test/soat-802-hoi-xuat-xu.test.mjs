// packs/hs/test/soat-802-hoi-xuat-xu.test.mjs — OZV-802 (mục 3 còn lại của #177): chưa biết nước
// nhập thì HỎI ngay trong lượt hỏi lại đang có, đừng âm thầm giả định Trung Quốc rồi mới chú thích.
//
// Trước việc này: `xuatXuCua()` trả `{ ma: 'CN', giaDinh: true }`, `giong-quyen.js:100` nói rõ là
// giả định — nhưng khách KHÔNG hề được hỏi, nên mức thuế in ra là của một nước khách chưa nói
// (Điều III, Điều VIII). Nay thêm đúng MỘT câu vào lượt hỏi SẴN CÓ: vẫn tối đa 3 câu, một tin.
//
// Đi ĐƯỜNG THẬT `hs.handle` → `packages.js` → `dien-cho-thieu.js`, dùng lại bộ đồ nghề
// `giup-duong-that-hs.mjs` (không dựng mạch kiểu thứ hai — lớp lỗi rụng tên hàng tái xuất bốn lần
// vì mỗi chỗ đo một kiểu: #213 → OZV-782 → OZV-791 → OZV-799).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeCtx, turn, hoiMotLuot, tenHangDaGui } from './giup-duong-that-hs.mjs';
import { kiemTraThongTinPhanLoai } from '../dien-cho-thieu.js';
import { daNeu } from '../ky-luat-hoi.js';
import { xuatXuCua } from '../input.js';
import hs from '../index.js';

/** Câu hỏi nước nhập, dù chữ nào, cũng phải chứa một trong các cụm này. */
const HOI_NUOC_RE = /(n[uư][oơ]́?c\s*n[aà]o|nh[aậ]p\s*t[uừ]|xu[aấ]t\s*x[uứ])/i;
const soCau = (tin) => (tin.match(/\?/g) || []).length;

test('[OZV-802] khách chưa nói nước → tin hỏi lại CÓ hỏi nước nhập, vẫn ≤3 câu trong 1 tin', async () => {
  const { ctx } = fakeCtx(hoiMotLuot([]));
  const r = await hs.handle(turn('Tra hs máy sấy sinh tố'), ctx);
  const tins = (r?.replies || []).map((x) => x.text);
  assert.equal(tins.length, 1, `phải gom vào MỘT tin, đang ${tins.length} tin: ${JSON.stringify(tins)}`);
  assert.match(tins[0], HOI_NUOC_RE, `tin hỏi lại không hỏi nước nhập → thuế in ra là của nước khách chưa nói: ${tins[0]}`);
  assert.ok(soCau(tins[0]) <= 3, `quá trần 3 câu một tin (kỷ luật hỏi #177): ${tins[0]}`);
});

test('[OZV-802] khách đã nói "hàng Nhật" → KHÔNG hỏi lại xuất xứ, và tra theo JP chứ không CN', async () => {
  const { ctx } = fakeCtx(hoiMotLuot([]));
  const r = await hs.handle(turn('Tra hs máy sấy sinh tố hàng Nhật'), ctx);
  const tin = (r?.replies || []).map((x) => x.text).join('\n');
  assert.doesNotMatch(tin, HOI_NUOC_RE, `hỏi lại điều khách đã nêu (luật 2 của kỷ luật hỏi): ${tin}`);
  // Nước dùng để tra là của `xuatXuCua` — một phép dò duy nhất, không có phép dò thứ hai.
  assert.deepEqual(xuatXuCua('máy sấy sinh tố hàng Nhật'), { ma: 'JP', giaDinh: false });
  assert.equal(daNeu('máy sấy sinh tố hàng Nhật', null).xuatXu, true);
});

test('[OZV-802] nước nêu ở lượt TRƯỚC (hồ sơ mạch #170) → lượt sau không hỏi lại nước', () => {
  const hoSo = { moTa: 'máy sấy sinh tố hàng Nhật', sua: [] };
  assert.equal(daNeu('máy sấy sinh tố', hoSo).xuatXu, true);
  const kt = kiemTraThongTinPhanLoai('máy sấy sinh tố', { vongHoi: 0, hoSo });
  if (kt.canHoi) {
    assert.doesNotMatch(kt.cauHoi, HOI_NUOC_RE, `hỏi lại nước khách đã nêu lượt trước: ${kt.cauHoi}`);
  }
});

test('[OZV-802] khách KHÔNG trả lời nước → vẫn ra kết quả theo giả định CN, nói rõ là giả định', () => {
  assert.deepEqual(xuatXuCua('máy sấy sinh tố'), { ma: 'CN', giaDinh: true });
  const kt = kiemTraThongTinPhanLoai('máy sấy sinh tố 350W 220V inox', { vongHoi: 2, hoSo: null });
  assert.equal(kt.canHoi, false, 'hết vòng hỏi mà vẫn treo câu hỏi là khách không bao giờ tới được mã (Điều II)');
});

test('[OZV-802] khách đáp về NƯỚC/chất liệu → tên hàng "van bi" vẫn tới Cổng', async () => {
  const { ctx, calls } = fakeCtx(hoiMotLuot([]));
  const r1 = await hs.handle(turn('Tra hs van bi'), ctx);
  const tin1 = (r1?.replies || []).map((x) => x.text).join('\n');
  assert.match(tin1, HOI_NUOC_RE, `nhánh cơ khí cũng phải hỏi nước nhập: ${tin1}`);

  await hs.handle(turn('inox, hàng Trung Quốc'), ctx);
  const tenHang = tenHangDaGui(calls);
  assert.ok(tenHang.length >= 1, 'phải gọi Cổng sau khi khách đáp');
  assert.match(tenHang[0], /van bi/i,
    `TÊN HÀNG rụng khỏi tin gửi Cổng khi khách đáp về nước/chất liệu: "${tenHang[0]}"`);
});
