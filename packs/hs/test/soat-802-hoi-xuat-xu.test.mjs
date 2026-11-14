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

// OZV-814: cái đỏ số 2 của OZV-802. Câu hỏi nước CHỈ được đi KÈM một câu xin-thêm đã tồn tại; nó
// không bao giờ TỰ DỰNG ra câu hỏi mới. Vì `canHoi` bật ngay khi `cauHoi` không rỗng
// (`ky-luat-hoi.js:212`), một câu nước tự dựng làm hồ sơ ĐÃ ĐỦ dữ kiện vẫn `canHoi: true` ⇒
// `packages.js:217` không bao giờ gọi Cổng ⇒ khách treo giữa hai vòng hỏi, không tới được mã
// (Điều II). Khách vẫn được mời cho biết nước, nhưng ở tin KẾT QUẢ (`giong-quyen.js:100`).
test('[OZV-814] hồ sơ đủ thông số + khách chưa nói nước → tra luôn, KHÔNG dựng thêm lượt hỏi', () => {
  // Ba ca: nhánh điện gia dụng, nhánh cơ khí, nhánh quạt. KHÔNG lấy "máy sấy sinh tố" làm ca ở
  // đây — chuỗi đó rơi vào nhánh NGHI GÕ NHẦM nên còn câu "em hiểu là máy xay sinh tố đúng không
  // ạ?", mà câu xác nhận TÊN thì phải treo thật (tên sai là sai hẳn dòng thuế), không phải lỗi.
  for (const s of ['máy bơm nước 1.5HP 220V gia đình', 'van bi inox DN25 dùng cho đường ống nước',
    'quạt điện gia dụng 50W 220V']) {
    assert.equal(xuatXuCua(s).giaDinh, true, `ca này phải là ca khách CHƯA nói nước: ${s}`);
    const kt = kiemTraThongTinPhanLoai(s, { vongHoi: 0, hoSo: null });
    assert.equal(kt.canHoi, false,
      `đủ dữ kiện rồi mà còn treo câu hỏi nước ⇒ lượt sau không gọi Cổng, khách treo: "${kt.cauHoi}"`);
  }
});

// OZV-851: cùng lớp lỗi với ca "van bi" dưới đây, nhưng ở NHÁNH XÁC NHẬN TÊN (nghi gõ nhầm).
// Khách đáp câu hỏi nước mà OZV-802 vừa thêm ("hàng Nhật", "từ Trung Quốc") thì `coTenTrong` đếm
// chữ tên NƯỚC thành TÊN HÀNG MỚI ⇒ `phanTen` rỗng ⇒ tên hàng rụng hẳn khỏi mô tả gửi Cổng: bot
// in mã HS và số thuế của một mặt hàng khác, mà khách không có cách nào biết (Điều III, VIII).
// Đi ĐƯỜNG THẬT: đo chính `tenHang` tới Cổng qua `phan_loai_hs` (`packages.js:320`).
const dapOHoiXacNhanTen = async (dap) => {
  const { ctx, calls } = fakeCtx(hoiMotLuot([]));
  const r1 = await hs.handle(turn('Tra hs máy sấy sinh tố'), ctx);
  const tin1 = (r1?.replies || []).map((x) => x.text).join('\n');
  assert.match(tin1, /m[aá]y xay sinh t[oố]/i, `ca này phải rơi vào nhánh xác nhận tên: ${tin1}`);
  await hs.handle(turn(dap), ctx);
  const tenHang = tenHangDaGui(calls);
  assert.ok(tenHang.length >= 1, `phải gọi Cổng sau khi khách đáp "${dap}"`);
  return tenHang[0];
};

test('[OZV-851] khách XÁC NHẬN tên kèm thông số + nước → tên bot gợi ý vẫn tới Cổng', async () => {
  const ten = await dapOHoiXacNhanTen('đúng, 350W 220V hàng Nhật');
  assert.match(ten, /m[aá]y xay sinh t[oố]/i, `TÊN HÀNG rụng khỏi tin gửi Cổng: "${ten}"`);
  assert.match(ten, /350\s*W/i, `rụng công suất khách vừa gõ: "${ten}"`);
  assert.match(ten, /220\s*V/i, `rụng điện áp khách vừa gõ: "${ten}"`);
  assert.equal(xuatXuCua(ten).ma, 'JP', `nước khách nêu không tới Cổng: "${ten}"`);
});

test('[OZV-851] khách chỉ đáp thông số + nước/chất liệu → giữ TÊN KHÁCH GÕ, không rụng', async () => {
  for (const [dap, maNuoc] of [
    ['350W 220V từ Trung Quốc', 'CN'],
    ['350W 220V xuất xứ Hàn Quốc', 'KR'],
    ['350W 220V bằng inox', 'CN'],
  ]) {
    const ten = await dapOHoiXacNhanTen(dap);
    assert.match(ten, /m[aá]y s[aấ]y sinh t[oố]/i,
      `khách chưa xác nhận tên bot đoán thì phải giữ tên khách gõ ("${dap}"), đang là: "${ten}"`);
    assert.match(ten, /350\s*W/i, `rụng công suất khách vừa gõ ("${dap}"): "${ten}"`);
    assert.match(ten, /220\s*V/i, `rụng điện áp khách vừa gõ ("${dap}"): "${ten}"`);
    assert.equal(xuatXuCua(ten).ma, maNuoc, `sai mã nước cho "${dap}": "${ten}"`);
  }
});

test('[OZV-851] khách SỬA TÊN kèm nước → tên mới THAY tên cũ, không nối hai tên', async () => {
  const ten = await dapOHoiXacNhanTen('máy sấy thực phẩm 500W 220V hàng Nhật');
  assert.match(ten, /m[aá]y s[aấ]y th[uự]c ph[aẩ]m/i, `rụng tên mới khách vừa sửa: "${ten}"`);
  assert.doesNotMatch(ten, /sinh t[oố]/i, `nối hai tên thành mặt hàng lai: "${ten}"`);
  assert.match(ten, /500\s*W/i, `rụng công suất khách vừa gõ: "${ten}"`);
  assert.equal(xuatXuCua(ten).ma, 'JP', `nước khách nêu không tới Cổng: "${ten}"`);
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
