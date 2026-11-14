// packs/hs/test/soat-795-moi-khoa-cong.test.mjs — OZV-795: chốt bằng SỐ, cho TỪNG khoá câu hỏi
// thật của Cổng, rằng tên hàng khách gõ không rụng khỏi tin gửi Cổng.
//
// Lớp lỗi này đã tái xuất ba lần (#213 → #228/OZV-782 → OZV-791) và lần nào cũng IM LẶNG: mã HS và
// thuế in ra cho khách vẫn trông như thật, không test nào đỏ (Điều III, Điều VIII). PR #231 bịt
// bằng mặc định an toàn (`m.dai` rỗng ⇒ tính là thuộc tính) nhưng chỉ chứng minh trên 2 khoá.
// Bảng `KHOA` gõ tay (`so-tay-hoi.js:32-41`, 28 mục) khớp rất ít trong số khoá Cổng THẬT sinh ra,
// nên phần lớn khoá đi đúng vào nhánh "không biết câu này hỏi gì" — đúng chỗ lỗi từng nằm.
//
// Đi ĐƯỜNG THẬT `hs.handle` → `packages.js` → `so-tay-hoi.js` → `doc-tra-loi.js` → `phan_loai_hs`;
// gọi `so-tay-hoi.js` một mình không bắt được lỗi này. Bộ đồ nghề dùng lại `giup-duong-that-hs.mjs`
// (tách từ `soat-791-khoa-cong-la.test.mjs`), không dựng mạch kiểu thứ hai.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeCtx, turn, hoiMotLuot, tenHangDaGui } from './giup-duong-that-hs.mjs';
import { CAU_HOI_CONG, KHOA_DONG_BIEU, KHOA_CONG, KHOA_TT39, KHOA_LA } from './khoa-cong-that.mjs';
import hs from '../index.js';

const TIN_1 = 'Tra hs 8481.80.87 van bi';
const DAP = 'bằng inox';

// DANH SÁCH `DANG_DO` ĐÃ BỎ HẲN Ở OZV-799 — đừng dựng lại.
//
// Bản đầu của tệp này (PR #232) treo `todo` cho bốn khoá `cong_suat` / `dien_ap` / `power` /
// `voltage`: chúng CÓ trong bảng `KHOA` nên `m.dai` không rỗng, mặc định an toàn của OZV-791
// (`dai` rỗng ⇒ tính là thuộc tính) không che tới, mà `congSuat` / `dienAp` lại thiếu trong
// `DAI_THUOC_TINH` ⇒ `hoiThuocTinh: false` tường minh ⇒ `doc-tra-loi.js` đọc "bằng inox" thành
// TÊN MÓN MỚI, tên "van bi" rụng khỏi tin gửi Cổng. OZV-799 sửa đúng chỗ đó (thêm `congSuat`,
// `dienAp` vào `DAI_THUOC_TINH`), nên cả 125 ca phải XANH THẬT.
//
// Khoá nào rụng tên hàng về sau thì phải làm ĐỎ cổng, không được treo `todo` cho im: lớp lỗi này
// đã tái xuất bốn lần và lần nào cũng im lặng (mã + thuế in ra vẫn trông như thật).

test('[OZV-795] fixture khoá Cổng: đủ ba `loai` thật, không có chữ bịa `thuoc_tinh`', () => {
  assert.equal(CAU_HOI_CONG.length, KHOA_DONG_BIEU.length + KHOA_CONG.length + KHOA_TT39.length + KHOA_LA.length);
  const loai = new Set(CAU_HOI_CONG.map((q) => q.loai));
  assert.deepEqual([...loai].sort(), ['CONG', 'DONG_BIEU', 'TT39']);
  assert.equal(new Set(CAU_HOI_CONG.map((q) => q.key)).size, CAU_HOI_CONG.length, 'khoá trùng trong fixture');
  for (const q of CAU_HOI_CONG) assert.ok(q.questionVi, `câu rỗng thì test xanh giả: ${q.key}`);
});

// MỘT ca cho MỖI khoá: khoá nào rụng tên hàng thì tên khoá đó hiện thẳng trong tên ca test đỏ.
for (const cau of CAU_HOI_CONG) {
  test(`[OZV-795] Cổng hỏi "${cau.key}" (${cau.loai}) → tên hàng khách gõ vẫn tới Cổng`, async () => {
    const { ctx, calls } = fakeCtx(hoiMotLuot([cau]));
    const r1 = await hs.handle(turn(TIN_1), ctx);
    const tin1 = (r1?.replies || []).map((x) => x.text).join('\n');
    assert.ok(tin1.includes(cau.key), `tin 1 phải là câu của Cổng cho khoá này: ${tin1}`);

    await hs.handle(turn(DAP), ctx);
    const tenHang = tenHangDaGui(calls);
    assert.ok(tenHang.length >= 1, `phải gọi Cổng sau khi khách đáp (khoá ${cau.key})`);
    assert.match(tenHang[0], /van bi/i,
      `TÊN HÀNG khách gõ rụng khỏi tin gửi Cổng ở khoá "${cau.key}" — mã + thuế in ra là của thứ khác: "${tenHang[0]}"`);
  });
}

test('[OZV-795] Cổng hỏi NHIỀU khoá một lượt (cả ba `loai`) → vẫn giữ tên hàng', async () => {
  const chon = [
    CAU_HOI_CONG.find((q) => q.key === 'chat_lieu'),
    CAU_HOI_CONG.find((q) => q.key === 'gate_SO_TAY_NGUONG'),
    CAU_HOI_CONG.find((q) => q.key === 'valveType'),
  ];
  const { ctx, calls } = fakeCtx(hoiMotLuot(chon));
  await hs.handle(turn(TIN_1), ctx);
  await hs.handle(turn(DAP), ctx);
  const tenHang = tenHangDaGui(calls);
  assert.ok(tenHang.length >= 1, 'phải gọi Cổng sau khi khách đáp');
  assert.match(tenHang[0], /van bi/i, `tên hàng rụng khi Cổng hỏi nhiều khoá một lượt: "${tenHang[0]}"`);
});
