// packs/hs/test/can-cu-xuat-xu.test.mjs — [S1] của lượt soát #168.
//
// LỖI TÁI HIỆN: nhánh `can-cu` ở `packs/hs/index.js` tra LẠI Cổng trong lượt "căn cứ", nhưng xuất xứ
// lấy từ `s.last?.xuatXu` — và KHÔNG chỗ nào ghi `xuatXu` vào `session.last` (gói 1 ghi
// `{tenHang,maHs,maLuotPhanLoai}`, gói 2 suy xuất xứ theo lượt rồi bỏ). Mặc định rơi về 'CN' ⇒
// khách tra hàng Hàn Quốc (không được ACFTA) rồi gõ "căn cứ" thì bản đầy đủ lại nêu
// `118/2022/NĐ-CP — ACFTA, cần C/O mẫu E`: tự mâu thuẫn với tin trước và MỜI ƯU ĐÃI FTA cho lô hàng
// không được hưởng (trái luật 3 mục B mà `can-cu.js:6` tự khai, trái Hiến pháp VIII).
//
// Kiểm chống bịa (`kiemSoVanBanBia`) KHÔNG bắt được: số 118/2022 vẫn có thật trong dữ liệu Cổng —
// sai ở chỗ dữ liệu đó là của MỘT XUẤT XỨ KHÁC. Nên phải có ca riêng khoá hành vi này.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import hs from '../index.js';
import { plain } from '../style.js';

const ALL = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt',
  'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien'];

/**
 * `tra_thue` theo hình dạng thật của Cổng (mã 85094000), nhưng ACFTA phụ thuộc XUẤT XỨ của lượt gọi:
 * Trung Quốc được hưởng, Hàn Quốc thì không — đúng như Cổng thật trả theo `xuatXu`.
 */
const thueTheoXuatXu = ({ xuatXu }) => {
  const laCN = String(xuatXu || '').toUpperCase() === 'CN';
  return {
    ok: true,
    data: {
      hsCode: '85094000', nameVi: '- Máy nghiền và máy trộn thực phẩm',
      taxNkPreferential: '25', taxVat: '10',
      taxAcftaChina: laCN ? { origin: 'CN', eligible: true, rate: 5, noteVi: 'ACFTA 5% khi có C/O mẫu E hợp lệ.' } : null,
      canCuChiTiet: {
        mfn: { vanBan: '26/2023/NĐ-CP', hieuLuc: '15/07/2023' },
        vat: { vanBan: '181/2025/NĐ-CP', hieuLuc: '01/07/2025' },
        // Cổng vẫn trả căn cứ ACFTA trong bảng chi tiết; việc "có được hưởng hay không" nằm ở `taxAcftaChina`.
        acfta: { vanBan: '118/2022/NĐ-CP', hieuLuc: '30/12/2022' },
      },
      hsListings: [],
    },
  };
};
const THU_TUC = { ok: true, data: { maHs: '85094000', kiemTraChuyenNganh: [], giayPhep: [], vanBanQuanLy: [] } };

function fakeCtx(overrides = {}) {
  const script = Object.fromEntries(ALL.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
  for (const [k, v] of Object.entries(overrides)) script[k] = typeof v === 'function' ? v : () => v;
  const store = {};
  const mcp = fakeMcp(script);
  const ctx = {
    mcp, tools: new Set(ALL), vision: null, customer: null, history: () => [],
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-04T03:00:00Z'), log: { info() {}, error() {} },
  };
  return { ctx, store, mcp };
}
const turn = (text) => ({ turnId: 't', chatId: 'u1', userId: 'u1', userName: 'Khách', isGroup: false, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-04T03:00:00.000Z', isStaff: false });

test('[S1] gói 2 ghi xuất xứ của lượt vào session.last', async () => {
  const { ctx, store } = fakeCtx({ tra_thue: thueTheoXuatXu, tra_thu_tuc_nhap_khau: THU_TUC });
  await hs.handle(turn('85094000 KR'), ctx);
  assert.equal(store.last?.xuatXu, 'KR', `session.last phải giữ xuất xứ của lượt: ${JSON.stringify(store.last)}`);
});

test('[S1] khách tra hàng KR rồi gõ "căn cứ": tra lại Cổng ĐÚNG xuất xứ, KHÔNG mời ưu đãi ACFTA', async () => {
  const { ctx, mcp } = fakeCtx({ tra_thue: thueTheoXuatXu, tra_thu_tuc_nhap_khau: THU_TUC });

  // Lượt 1: khách tra thuế hàng Hàn Quốc → không có ACFTA.
  const r1 = await hs.handle(turn('85094000 KR'), ctx);
  const tin1 = plain(r1.replies[0].text);
  assert.doesNotMatch(tin1, /ACFTA|C\/O mẫu E/, `tin đầu hàng KR không được nêu ACFTA:\n${tin1}`);

  // Lượt 2: khách gõ "căn cứ" → phải tra lại Cổng với ĐÚNG xuất xứ KR, không phải mặc định CN.
  const r2 = await hs.handle(turn('căn cứ'), ctx);
  const day = plain(r2.replies[0].text);
  const goiThue = mcp.calls.filter((c) => c.name === 'tra_thue');
  assert.equal(goiThue.at(-1).args.xuatXu, 'KR', `lượt "căn cứ" phải hỏi Cổng theo xuất xứ KR, thực tế: ${goiThue.at(-1).args.xuatXu}`);

  // Bản đầy đủ vẫn phải có căn cứ thuế NK + VAT…
  assert.match(day, /26\/2023\/NĐ-CP/);
  assert.match(day, /181\/2025\/NĐ-CP/);
  // …nhưng TUYỆT ĐỐI không nêu căn cứ FTA cho lô hàng không được hưởng.
  assert.doesNotMatch(day, /118\/2022/, `không được nêu căn cứ ACFTA cho hàng KR:\n${day}`);
  assert.doesNotMatch(day, /ACFTA|C\/O mẫu E/, `không được mời ưu đãi FTA cho hàng KR:\n${day}`);
});

test('[S1] hàng CN thì vẫn nêu đủ căn cứ ACFTA kèm điều kiện C/O (không chặn oan)', async () => {
  const { ctx, mcp } = fakeCtx({ tra_thue: thueTheoXuatXu, tra_thu_tuc_nhap_khau: THU_TUC });
  await hs.handle(turn('85094000 CN'), ctx);
  const r2 = await hs.handle(turn('căn cứ'), ctx);
  const day = plain(r2.replies[0].text);
  assert.equal(mcp.calls.filter((c) => c.name === 'tra_thue').at(-1).args.xuatXu, 'CN');
  assert.match(day, /118\/2022\/NĐ-CP/);
  assert.match(day, /C\/O mẫu E/);
});

test('[S1] gói 1 ghi xuất xứ suy từ mô tả vào session.last; lượt "căn cứ" dùng đúng xuất xứ đó', async () => {
  const { ctx, store, mcp } = fakeCtx({
    phan_loai_hs: { ok: true, maLuot: '11111111-2222-4333-8444-555555555555', trangThai: 'DANG_XU_LY' },
    tra_thue: thueTheoXuatXu, tra_thu_tuc_nhap_khau: THU_TUC,
    sinh_mo_ta_khai_bao: { ok: true, data: { moTaEcus: 'Máy xay sinh tố gia dụng, mới 100%' } },
  });
  const { jobs: [job] } = await hs.handle(turn('tra hs máy xay sinh tố 350W 220V hàng Hàn Quốc'), ctx);
  await hs.onJobResult(job, { ok: true, trangThai: 'XONG', data: { maDeXuat: '85094000' } }, ctx);
  assert.equal(store.last?.xuatXu, 'KR', `gói 1 phải ghi xuất xứ đã dùng: ${JSON.stringify(store.last)}`);

  const r2 = await hs.handle(turn('căn cứ'), ctx);
  assert.equal(mcp.calls.filter((c) => c.name === 'tra_thue').at(-1).args.xuatXu, 'KR');
  assert.doesNotMatch(plain(r2.replies[0].text), /118\/2022|ACFTA/);
});

// ─── [S3] của lượt soát thứ hai: bản sửa [S1] chỉ bịt nhánh `can-cu`; ĐƯỜNG TRẢ LỜI ĐẦU vẫn hở ───
//
// Ba nơi dựng dòng `Căn cứ:` mà chỉ `index.js:116` truyền `boFta`:
// `giong-quyen.js:90` (gói 1, câu tự do) và `packages.js:388` (gói 2) thì không — nên tin ĐẦU vẫn dẫn
// `NĐ 118/2022 (ACFTA, cần C/O mẫu E)` cho lô khách chưa nói nước. Hai ca dưới khoá đúng hai tái hiện
// người soát nêu; xem `.van-phong/nghien-cuu.md` mục 1.

test('[S3] gói 1 câu tự do, khách CHƯA nói nước: tin đầu không được dẫn căn cứ ưu đãi ACFTA', async () => {
  const { ctx } = fakeCtx({
    phan_loai_hs: { ok: true, maLuot: '11111111-2222-4333-8444-555555555555', trangThai: 'DANG_XU_LY' },
    tra_thue: thueTheoXuatXu, tra_thu_tuc_nhap_khau: THU_TUC,
    sinh_mo_ta_khai_bao: { ok: true, data: { moTaEcus: 'Máy xay sinh tố gia dụng, mới 100%' } },
  });
  // Mô tả KHÔNG có tên nước nào.
  const { jobs: [job] } = await hs.handle(turn('tra hs máy xay sinh tố 350W 220V thân nhựa'), ctx);
  const out = await hs.onJobResult(job, { ok: true, trangThai: 'XONG', data: { maDeXuat: '85094000' } }, ctx);
  const tin = plain(out.replies.map((r) => r.text).join('\n'));

  // Dòng `Căn cứ:` là KẾT LUẬN pháp lý cho lô hàng này, nên không được nêu ưu đãi khi chưa biết xuất xứ.
  const dongCanCu = tin.split('\n').filter((d) => /Căn cứ/i.test(d)).join('\n');
  assert.doesNotMatch(dongCanCu, /118\/2022/, `chưa biết xuất xứ thì dòng Căn cứ không được dẫn 118/2022:\n${tin}`);
  assert.doesNotMatch(dongCanCu, /ACFTA|C\/O mẫu E/, `chưa biết xuất xứ thì không mời ưu đãi FTA:\n${tin}`);

  // Và hai tin liền nhau không được tự phủ nhận nhau: gõ "căn cứ" ngay sau cũng phải nhất quán.
  const r2 = await hs.handle(turn('căn cứ'), ctx);
  assert.doesNotMatch(plain(r2.replies[0].text), /118\/2022|ACFTA/);
});

test('[S3] gói 2 nối tiếp: gõ "2" sau khi đã nói KR thì KHÔNG được ghi đè thành CN', async () => {
  const { ctx, store, mcp } = fakeCtx({ tra_thue: thueTheoXuatXu, tra_thu_tuc_nhap_khau: THU_TUC });

  // Lượt 1: khách nói rõ hàng Hàn Quốc.
  await hs.handle(turn('85094000 KR'), ctx);
  assert.deepEqual([store.last?.xuatXu, store.last?.xuatXuBiet], ['KR', true], 'tiền đề: lượt 1 ghi đúng KR');

  // Lượt 2: gõ "2" — không có mã, không có nước. Nước khách ĐÃ NÓI phải thắng mặc định.
  const r2 = await hs.handle(turn('2'), ctx);
  const tin2 = plain(r2.replies[0].text);
  assert.equal(mcp.calls.filter((c) => c.name === 'tra_thue').at(-1).args.xuatXu, 'KR',
    'gói 2 nối tiếp phải tra theo nước khách đã nói, không phải mặc định CN');
  assert.doesNotMatch(tin2, /xuất xứ CN/, `không được lật sang CN khi khách đã nói KR:\n${tin2}`);
  assert.doesNotMatch(tin2, /118\/2022|ACFTA|C\/O mẫu E/, `hàng KR không được nêu ưu đãi ACFTA:\n${tin2}`);
  assert.deepEqual([store.last?.xuatXu, store.last?.xuatXuBiet], ['KR', true],
    `mặc định không được ghi đè nước đã xác định: ${JSON.stringify(store.last)}`);

  // Lượt 3: "căn cứ" vẫn còn KR (bản sửa [S1] chỉ đúng nếu dữ liệu nó dựa vào không bị xoá).
  const r3 = await hs.handle(turn('căn cứ'), ctx);
  assert.equal(mcp.calls.filter((c) => c.name === 'tra_thue').at(-1).args.xuatXu, 'KR');
  assert.doesNotMatch(plain(r3.replies[0].text), /118\/2022|ACFTA/);
});

test('[S1] chưa biết xuất xứ: lượt "căn cứ" KHÔNG mặc định CN và không nêu căn cứ FTA', async () => {
  // Khách chỉ gõ mã, không nói nước. Cổng giả ở đây coi "không có xuatXu" là không xác định được ưu đãi.
  const { ctx, mcp } = fakeCtx({
    tra_thue: (args) => (args.xuatXu ? thueTheoXuatXu(args) : thueTheoXuatXu({ xuatXu: null })),
    tra_thu_tuc_nhap_khau: THU_TUC,
  });
  await hs.handle(turn('85094000'), ctx);
  const r2 = await hs.handle(turn('căn cứ'), ctx);
  const day = plain(r2.replies[0].text);
  const args = mcp.calls.filter((c) => c.name === 'tra_thue').at(-1).args;
  assert.notEqual(args.xuatXu, 'CN', 'chưa biết xuất xứ thì không được tự nhận là Trung Quốc');
  assert.doesNotMatch(day, /118\/2022|ACFTA|C\/O mẫu E/, `chưa biết xuất xứ thì không nêu căn cứ FTA:\n${day}`);
});

// ─── [S4] của lượt soát thứ ba: mã nước BỊA RA từ viết tắt kỹ thuật ───
//
// Bản sửa [S3] chỉ cho nêu căn cứ ưu đãi khi `xuatXuBiet === true`. Nhưng hai hàm đọc nước lại coi
// "hai chữ in hoa" và "tên nước viết tắt" là bằng chứng xuất xứ mà không cần ngữ cảnh, nên cửa đó bị
// qua bằng DỮ LIỆU RÁC: `động cơ DC` → nước `DC`, `máy hàn` → `KR` (bỏ dấu "hàn" = "han" = Hàn Quốc),
// `nặng 5 KG` → Kyrgyzstan. Nước rác còn được ghi vào phiên nên các lượt sau kế thừa luôn.
// Chỉ lọc theo mã ISO là KHÔNG đủ: `PE`, `SS`, `ID`, `IN`, `CM`, `KG` đều là mã nước thật.
// Xem `.van-phong/nghien-cuu.md` mục [S4].

test('[S4] "động cơ DC" không phải xuất xứ: không áp ACFTA, không ghi nước vào phiên', async () => {
  const { ctx, store, mcp } = fakeCtx({
    phan_loai_hs: { ok: true, maLuot: '11111111-2222-4333-8444-555555555555', trangThai: 'DANG_XU_LY' },
    tra_thue: thueTheoXuatXu, tra_thu_tuc_nhap_khau: THU_TUC,
    sinh_mo_ta_khai_bao: { ok: true, data: { moTaEcus: 'Máy xay sinh tố gia dụng, mới 100%' } },
  });
  const { jobs: [job] } = await hs.handle(turn('tra hs máy xay sinh tố 350W động cơ DC thân nhựa'), ctx);
  const out = await hs.onJobResult(job, { ok: true, trangThai: 'XONG', data: { maDeXuat: '85094000' } }, ctx);
  const tin = plain(out.replies.map((r) => r.text).join('\n'));

  assert.equal(store.last?.xuatXuBiet, false,
    `"động cơ DC" là điện một chiều, không phải nước: ${JSON.stringify(store.last)}`);
  assert.notEqual(store.last?.xuatXu, 'DC', 'không được gán mã ảo "DC" làm xuất xứ');
  assert.doesNotMatch(tin, /118\/2022|ACFTA|C\/O mẫu E/, `chưa biết xuất xứ thì không mời ưu đãi:\n${tin}`);
  // Và câu hỏi gửi Cổng không được mang mã ảo: Cổng sẽ trả sự thật của một nước khác.
  for (const c of mcp.calls.filter((x) => x.name === 'tra_thue')) {
    assert.notEqual(c.args.xuatXu, 'DC', 'không gửi mã nước ảo sang Cổng');
  }
});

test('[S4] "máy hàn que 250A" không phải hàng Hàn Quốc', async () => {
  const { ctx, store } = fakeCtx({
    phan_loai_hs: { ok: true, maLuot: '11111111-2222-4333-8444-555555555555', trangThai: 'DANG_XU_LY' },
    tra_thue: thueTheoXuatXu, tra_thu_tuc_nhap_khau: THU_TUC,
    sinh_mo_ta_khai_bao: { ok: true, data: { moTaEcus: 'Máy hàn điện, mới 100%' } },
  });
  // Mô tả phải đủ dữ kiện, nếu không gói 1 hỏi lại chứ không phân loại (`dien-cho-thieu.js`).
  const { jobs: [job] } = await hs.handle(turn('tra hs máy hàn que 250A 220V công nghiệp'), ctx);
  await hs.onJobResult(job, { ok: true, trangThai: 'XONG', data: { maDeXuat: '85151100' } }, ctx);
  assert.equal(store.last?.xuatXuBiet, false,
    `"hàn" ở đây là hàn xì, không phải Hàn Quốc: ${JSON.stringify(store.last)}`);
  assert.notEqual(store.last?.xuatXu, 'KR', 'không được suy ra KR từ chữ "hàn" trong tên hàng');
});
