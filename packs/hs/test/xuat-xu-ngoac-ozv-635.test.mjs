// OZV-635 — "(MADE IN JP)" bị đọc thành IN (Ấn Độ): tách từ theo chữ Unicode trước khi so 'made'.
//
// Gốc lỗi: bước quét mã trơ cuối `findCountryInText` (`packs/hs/input.js:521-527`) vẫn dùng regex
// `/(?:^|\s)(CN|JP|KR|TW|TH|US|DE|IN|MY|ID|VN)(?=\s|$|,)/g` và lấy token trước bằng
// `raw.slice(0, mm.index).trim().split(/\s+/).pop()`.
//   1. Khi khách gõ "(MADE IN JP)" / "[MADE IN JP]", token trước "IN" là "(MADE" / "[MADE" (dính
//      ngoặc mở) nên `norm(truoc) === 'made'` trả false ⇒ lọt chữ "IN" (Ấn Độ).
//   2. Khi khách gõ "(made in JP)" (hoặc sau khi bỏ qua "IN" trong ngoặc), sau "JP" là dấu đóng
//      ngoặc `)` / `]` nên lookahead `(?=\s|$|,)` không khớp ⇒ mất "JP", `xuatXuCua` rơi về mặc
//      định CN (`giaDinh: true`).
//
// Vá: dùng danh sách từ đã tách theo chữ Unicode `tu = tachTu(raw)` (`tachTuViTri`) ở đầu hàm
// `findCountryInText` — cùng cách với `maNuocTrongCau` và `maCuoiCau` (PR #262 / OZV-634).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import hs from '../index.js';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import { xuatXuCua, findCountryInText, countryCode, maNuocTrongCau } from '../input.js';

const ALL = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt',
  'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien'];
const ML = '11111111-2222-4333-8444-555555555555';
const KQ = { results: [{ hs: '84381000', confidence: 0.8, reason: 'máy chế biến thực phẩm' }] };
const THUE = { results: [{ hsCode: '84381000', nameVi: 'Máy xay', unitVi: 'Cái', taxNkPreferential: 10, taxVat: 8 }] };

function fakeCtx() {
  const script = Object.fromEntries(ALL.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
  script.phan_loai_hs = () => ({ ok: true, data: { maLuot: ML, trangThai: 'XONG', ketQua: KQ } });
  script.ket_qua_phan_loai = () => ({ ok: true, data: { trangThai: 'XONG', ketQua: KQ } });
  script.tra_thue = () => ({ ok: true, data: THUE });
  const store = {};
  const ctx = {
    mcp: fakeMcp(script), tools: new Set(ALL), vision: null, customer: null, history: () => [],
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-25T03:00:00Z'), log: { info() {}, error() {} },
  };
  return { ctx, calls: ctx.mcp.calls };
}
const turn = (text) => ({ turnId: 't', chatId: 'u1', userId: 'u1', userName: 'Khách', isGroup: false, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-25T03:00:00.000Z', isStaff: false });

test('OZV-635: bảng 7 câu chuẩn — "(MADE IN JP)", "(made in JP)", "[MADE IN JP]", "MADE IN JP," ra JP và không hồi quy', () => {
  const BANG_CHUAN = [
    ['(MADE IN JP)', { ma: 'JP', giaDinh: false }, 'JP'],
    ['(made in JP)', { ma: 'JP', giaDinh: false }, 'JP'],
    ['[MADE IN JP]', { ma: 'JP', giaDinh: false }, 'JP'],
    ['MADE IN JP,', { ma: 'JP', giaDinh: false }, 'JP'],
    ['MADE IN JP', { ma: 'JP', giaDinh: false }, 'JP'],
    ['hàng made in CN', { ma: 'CN', giaDinh: false }, 'CN'],
    // "made in India": bảng tên nước hiện chưa có "india" (lớp lỗi khác, ngoài phạm vi OZV-635) → giữ nguyên hiện trạng.
    ['made in India', { ma: 'CN', giaDinh: true }, null],
  ];
  for (const [cau, mongXuatXu, mongFind] of BANG_CHUAN) {
    assert.deepEqual(xuatXuCua(cau), mongXuatXu, `xuatXuCua(${JSON.stringify(cau)}) phải ra ${JSON.stringify(mongXuatXu)}`);
    assert.equal(findCountryInText(cau), mongFind, `findCountryInText(${JSON.stringify(cau)}) phải ra ${JSON.stringify(mongFind)}`);
    assert.equal(countryCode(cau), mongFind, `countryCode(${JSON.stringify(cau)}) phải ra ${JSON.stringify(mongFind)}`);
    assert.equal(maNuocTrongCau(cau), mongFind, `maNuocTrongCau(${JSON.stringify(cau)}) phải ra ${JSON.stringify(mongFind)}`);
  }
});

test('OZV-635: cụm xuất xứ bọc trong ngoặc / dấu câu giữa câu mô tả hàng tự do', () => {
  const CAU_MO_TA = [
    ['Máy bơm nước 350W 220V (MADE IN JP)', 'JP'],
    ['Máy bơm nước 350W 220V (made in JP)', 'JP'],
    ['Van bi inox 304 DN25 [MADE IN KR]', 'KR'],
    ['Ổ bi SKF (MADE IN DE), mới 100%', 'DE'],
    ['Linh kiện điện tử "MADE IN TW"', 'TW'],
    ['Hàng gia vị (MADE IN IN)', 'IN'],
  ];
  for (const [cau, mong] of CAU_MO_TA) {
    assert.deepEqual(xuatXuCua(cau), { ma: mong, giaDinh: false }, `xuatXuCua(${JSON.stringify(cau)}) phải ra ${mong}`);
    assert.equal(findCountryInText(cau), mong, `findCountryInText(${JSON.stringify(cau)}) phải ra ${mong}`);
  }
});

test('OZV-635: đường thật qua hs.handle — khách gõ "(MADE IN JP)" / "[MADE IN JP]" / "(made in JP)" thì tra_thue nhận JP', async () => {
  for (const cụm of ['(MADE IN JP)', '[MADE IN JP]', '(made in JP)', 'MADE IN JP,']) {
    const { ctx, calls } = fakeCtx();
    await hs.handle(turn(`Tên hàng: máy xay sinh tố gia dụng 350W 220V ${cụm}`), ctx);
    const xx = calls.filter((c) => c.name === 'tra_thue').map((c) => c.args.xuatXu);
    assert.deepEqual(xx, ['JP'], `"${cụm}": tra_thue phải nhận xuất xứ JP thay vì ${JSON.stringify(xx)}`);
  }
});
