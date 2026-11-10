// packs/hs/test/can-cu-luong.test.mjs — Luồng "khách xin căn cứ" (issue #136 mục B, mở lại ở #168).
// Tin đầu chỉ 3 căn cứ ngắn; khách gõ "căn cứ" / "chi tiết căn cứ" thì mới nhận danh sách đầy đủ,
// kèm văn bản KHÔNG dùng làm căn cứ chính và lý do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import hs from '../index.js';
import { route } from '../router.js';
import { plain } from '../style.js';
import { tapSoVanBanCong, kiemSoVanBanBia } from '../can-cu.js';

const ALL = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt',
  'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien'];
const ML = '11111111-2222-4333-8444-555555555555';

/** `tra_thue` giữ hình dạng lần gọi THẬT Cổng OZ mã 85094000 (10/11/2026). */
const THUE = {
  ok: true,
  data: {
    hsCode: '85094000', nameVi: '- Máy nghiền và máy trộn thực phẩm',
    taxNkPreferential: '25', taxVat: '8/10',
    taxAcftaChina: { origin: 'CN', eligible: true, rate: 5, noteVi: 'ACFTA 5% khi có C/O mẫu E hợp lệ.' },
    canCu: { mfn: { vanBan: 'NĐ 26/2025/NĐ-CP (biểu thuế 2026)', muc: '25' } },
    canCuChiTiet: {
      mfn: { vanBan: '26/2023/NĐ-CP', hieuLuc: '15/07/2023' },
      vat: { vanBan: '181/2025/NĐ-CP', hieuLuc: '01/07/2025' },
      acfta: { vanBan: '118/2022/NĐ-CP', hieuLuc: '30/12/2022' },
    },
    legalBasisRegistry: {
      citations: [
        { soHieu: '08/2023/TT-BCT', tinhTrang: 'HET_HIEU_LUC_MOT_PHAN', hetHieuLucTu: '2026-12-31', biBaiBoBoi: ['48/2026/TT-BCT'], hieuLucDaDoiChieu: true },
        { soHieu: '2711/QĐ-BKHCN', tinhTrang: 'CHUA_XAC_MINH', hieuLucDaDoiChieu: false },
      ],
    },
    hsListings: [
      { soHieu: '36/2026/TT-BKHCN', tinhTrang: 'CON_HIEU_LUC', match: { level: 'HS8', code: '85094000' }, loaiTacDong: 'CONG_BO_HOP_QUY', effectiveFrom: '2026-07-01', hieuLucDaDoiChieu: true },
    ],
  },
};
const THU_TUC = {
  ok: true,
  data: {
    maHs: '85094000', kiemTraChuyenNganh: [], giayPhep: [],
    vanBanQuanLy: [{ soHieu: '36/2026/TT-BKHCN', hieuLuc: { soHieu: '36/2026/TT-BKHCN', ten: 'Danh mục rủi ro', tinhTrang: 'CON_HIEU_LUC' } }],
    chinhSach: { policyLines: [{ text: 'Công bố hợp quy thiết bị điện gia dụng', soHieu: '36/2026/TT-BKHCN', reasonVi: 'Danh mục nhóm 2' }] },
  },
};

function fakeCtx(overrides = {}) {
  const script = Object.fromEntries(ALL.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
  for (const [k, v] of Object.entries(overrides)) script[k] = typeof v === 'function' ? v : () => v;
  const store = {};
  const ctx = {
    mcp: fakeMcp(script), tools: new Set(ALL), vision: null, customer: null, history: () => [],
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-04T03:00:00Z'), log: { info() {}, error() {} },
  };
  return { ctx, store };
}
const turn = (text) => ({ turnId: 't', chatId: 'u1', userId: 'u1', userName: 'Khách', isGroup: false, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-04T03:00:00.000Z', isStaff: false });

test('route: "căn cứ" / "căn cứ pháp lý" / "chi tiết căn cứ" → kind can-cu', () => {
  for (const t of ['căn cứ', 'can cu', 'căn cứ pháp lý', 'xem căn cứ', 'chi tiết căn cứ', 'căn cứ nào', 'dựa vào văn bản nào']) {
    assert.equal(route(t, { pkgs: [] }).kind, 'can-cu', `"${t}" phải vào nhánh can-cu`);
  }
  // Không được ăn các câu khác
  assert.notEqual(route('tra hs máy xay sinh tố', { pkgs: [] }).kind, 'can-cu');
});

test('khách gõ "căn cứ" sau khi tra: nhận danh sách đầy đủ + văn bản không dùng làm căn cứ chính', async () => {
  const { ctx } = fakeCtx({
    phan_loai_hs: { ok: true, maLuot: ML, trangThai: 'DANG_XU_LY' },
    tra_thue: THUE, tra_thu_tuc_nhap_khau: THU_TUC,
    sinh_mo_ta_khai_bao: { ok: true, data: { moTaEcus: 'Máy xay sinh tố gia dụng, mới 100%' } },
  });
  // Khách NÓI RÕ hàng Trung Quốc. Tiền đề này là bắt buộc kể từ [S1] của #168: căn cứ ưu đãi ACFTA
  // (118/2022 + điều kiện C/O mẫu E) chỉ được nêu khi biết xuất xứ lô hàng. Trước đây câu không có
  // nước vẫn ra ACFTA vì code mặc định 'CN' — đúng cái lỗi #168 chặn, nên ca phải nói nước ra.
  // Ca "không nói nước thì không nêu FTA" nằm ở `packs/hs/test/can-cu-xuat-xu.test.mjs`.
  const { jobs: [job] } = await hs.handle(turn('tra hs máy xay sinh tố 350W 220V dùng trong gia đình, hàng Trung Quốc'), ctx);
  const kq = await hs.onJobResult(job, { ok: true, trangThai: 'XONG', data: { maDeXuat: '85094000' } }, ctx);
  const tinDau = plain(kq.replies[0].text);
  // Tin đầu: 1 dòng căn cứ, tối đa 3 văn bản
  const dongCc = tinDau.split('\n').filter((d) => /^Căn cứ:/.test(d.trim()));
  assert.equal(dongCc.length, 1, `tin đầu phải có 1 dòng căn cứ:\n${tinDau}`);
  assert.ok((dongCc[0].match(/\d{1,4}\/\d{4}/g) || []).length <= 3, dongCc[0]);

  // Khách xin căn cứ → bản đầy đủ
  const r2 = await hs.handle(turn('căn cứ'), ctx);
  const day = plain(r2.replies[0].text);
  assert.match(day, /26\/2023\/NĐ-CP/);
  assert.match(day, /118\/2022\/NĐ-CP/);
  assert.match(day, /181\/2025\/NĐ-CP/);
  assert.match(day, /36\/2026\/TT-BKHCN/);
  assert.match(day, /08\/2023\/TT-BCT/);
  assert.match(day, /2711\/QĐ-BKHCN/);
  assert.match(day, /KHÔNG dùng làm căn cứ chính/i);
  assert.match(day, /C\/O/, 'căn cứ ACFTA phải kèm điều kiện C/O');
  // Chống bịa: mọi số văn bản đều có trong dữ liệu Cổng của lượt tra
  const nguon = tapSoVanBanCong([THUE, THU_TUC]);
  const kiem = kiemSoVanBanBia(`${tinDau}\n${day}`, nguon);
  assert.equal(kiem.ok, true, `số văn bản không có trong dữ liệu Cổng: ${kiem.bia.join(', ')}`);
});

test('chưa tra gì mà gõ "căn cứ": trả lời hướng dẫn, KHÔNG bịa văn bản nào', async () => {
  const { ctx } = fakeCtx();
  const r = await hs.handle(turn('căn cứ'), ctx);
  const s = plain(r.replies[0].text);
  assert.match(s, /chưa có/i);
  assert.equal(kiemSoVanBanBia(s, new Set()).ok, true, `không được nêu số văn bản nào: ${s}`);
});
