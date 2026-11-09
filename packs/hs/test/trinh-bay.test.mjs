// Trình bày cho khách Zalo — sửa theo dữ liệu THẬT từ Cổng OZ (tra cứu 06–07/11/2026).
// Mỗi test khoá một lỗi khách thấy được, không phải chi tiết bên trong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPolicy, renderTax, phanTichChinhSach } from '../render.js';
import { soDungChuan } from '../editor.js';
import { route } from '../router.js';
import { availablePackages, menuText } from '../packages.js';
import { plain } from '../style.js';

const TOOLS = new Set(['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs',
  'sinh_mo_ta_khai_bao', 'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban',
  'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt', 'soan_ho_so_giai_trinh', 'bo_sung_du_kien']);
const PKGS = availablePackages(TOOLS);

// ─── Văn bản hết hiệu lực: không được im lặng coi như còn hiệu lực ───
const VB_THAT = {
  maHs: '84137042',
  kiemTraChuyenNganh: [],
  giayPhep: [],
  vanBanQuanLy: [
    { soHieu: '42/2019/TT-BCT', hieuLuc: { soHieu: '42/2019/TT-BCT', ten: 'Sửa đổi, bổ sung một số quy định', tinhTrang: 'HET_HIEU_LUC_MOT_PHAN', biBaiBoBoi: ['48/2026/TT-BCT'], biTamNgungBoi: [] } },
    { soHieu: '34/2025/TT-BCT', hieuLuc: { soHieu: '34/2025/TT-BCT', ten: 'Sửa đổi, bổ sung một số điều', tinhTrang: 'CON_HIEU_LUC' } },
    { soHieu: '125/2026/TT-BCA', hieuLuc: { soHieu: '125/2026/TT-BCA', ten: 'Ban hành Danh mục', tinhTrang: 'CON_HIEU_LUC' } },
  ],
  chinhSach: {
    policyLines: [
      { text: 'Có thể: phải kiểm tra chất lượng nhà nước (rủi ro trung bình) — 125/2026/TT-BCA', level: 'NOTICE', soHieu: '125/2026/TT-BCA', reasonVi: 'Bảng danh mục ghi theo nhóm 841370 — mã này CÓ THỂ thuộc diện, chưa đối chiếu bản gốc.' },
      { text: 'Danh mục liên quan — 34/2025/TT-BCT', level: 'INFO', soHieu: '34/2025/TT-BCT', reasonVi: 'Danh mục ghi theo nhóm 841370 — cần đối chiếu bản gốc.' },
      { text: 'Hàng hóa được nhập khẩu dưới hình thức mua bán, trao đổi của cư dân biên giới (42/2019/TT-BCT & 34/2025/TT-BCT )', level: 'INFO' },
    ],
  },
};

test('văn bản hết hiệu lực một phần: nêu rõ + nêu văn bản đã bãi bỏ (không im lặng coi như còn hiệu lực)', () => {
  const s = plain(renderPolicy(VB_THAT));
  assert.match(s, /42\/2019\/TT-BCT/);
  assert.match(s, /hết hiệu lực một phần/i);
  assert.match(s, /48\/2026\/TT-BCT/);                       // văn bản đã bãi bỏ nó
  assert.match(s, /34\/2025\/TT-BCT — Sửa đổi.*\(còn hiệu lực\)/);
});

test('dòng chính sách chỉ có tiêu đề ("Danh mục liên quan"): kèm lý do thật thay vì để trống', () => {
  const s = plain(renderPolicy(VB_THAT));
  assert.doesNotMatch(s, /^• Danh mục liên quan$/m);           // tiêu đề trần, khách không hiểu
  assert.match(s, /Danh mục liên quan.*cần đối chiếu bản gốc/i);
});

test('số hiệu văn bản nhồi cuối câu chính sách: bỏ (đã có mục "Văn bản dẫn tới chính sách")', () => {
  const s = plain(renderPolicy(VB_THAT));
  assert.doesNotMatch(s, /\(42\/2019\/TT-BCT & 34\/2025\/TT-BCT \)/);   // lặp + dấu cách thừa
  assert.doesNotMatch(s, / \)/);                                       // không còn " )" lơ lửng
});

test('chính sách chưa được Cổng đối chiếu bản gốc: nói "có thể" chứ không khẳng định', () => {
  const cs = phanTichChinhSach(VB_THAT);
  assert.equal(cs.chacChan, true);                                  // Cổng tự nói "chưa xác minh"
  const s = plain(renderPolicy(VB_THAT));
  assert.match(s, /có thể/i);
  assert.doesNotMatch(s, /CÓ chính sách quản lý chuyên ngành/);      // không khẳng định quá tay
});

// ─── Nhãn trong khối thuế ───
test('khối thuế: cảnh báo của Cổng ghi "Lưu ý", không ghi "Chính sách" (đọc như thuế suất)', () => {
  const thue = { hsCode: '84137042', nameVi: 'Loại khác', taxNkTt: '15', taxVat: '8/10',
    warnings: { summary: 'Kiểm tra hiệu suất năng lượng.', severity: 'MEDIUM' } };
  const s = plain(renderTax(thue));
  assert.match(s, /Lưu ý: Kiểm tra hiệu suất năng lượng/);
  assert.doesNotMatch(s, /Chính sách:/);
});

// ─── Não: không hỏi khi regex đã đủ chắc ───
test('não KHÔNG được hỏi khi câu CHỈ CÓ mã HS — phỏ biến nhất, não thêm được gì (tiết kiệm lượt, giảm độ trễ)', () => {
  for (const cau of ['84137090', '84137090 JP', '8413.70.90']) {
    const r = route(cau, { pkgs: PKGS });
    assert.equal(r.kind, 'chay', `${cau} phải vào gói`);
    assert.notEqual(r.tuDong, true, `${cau}: chỉ có mã thì không cần hỏi não`);
  }
});

test('não VẪN được hỏi khi câu có từ khoá — regex không đọc được ("tra thuế mã X" không khớp, não sửa được)', () => {
  for (const cau of ['tra thuế mã 84137090', 'nhãn hiệu Pentax', 'giải trình mã 84137090']) {
    const r = route(cau, { pkgs: PKGS });
    assert.equal(r.tuDong, true, `${cau}: não phải hỏi`);
  }
});

test('não ĐƯỢC hỏi khi câu tự do (mô tả hàng) — đó là chỗ não thật sự giúp', () => {
  const r = route('máy bơm nước ly tâm 1.5HP dùng cho hộ gia đình', { pkgs: PKGS });
  assert.equal(r.tuDong, true);
});

test('chào hỏi: không nuốt mất, trả lời ngắn chứ không dán menu 900 ký tự', () => {
  const r = route('xin chào', { pkgs: PKGS });
  assert.equal(r.kind, 'chao');
});

test('menu đầy đủ vẫn còn khi khách gõ "menu"', () => {
  const r = route('menu', { pkgs: PKGS });
  assert.equal(r.kind, 'menu');
  assert.match(plain(menuText(PKGS, { full: true })), /CHỌN GÓI TRA CỨU/);
});

test('menu rút gọn: tên gói + mô tả MỘT dòng, không dán mô tả dài', () => {
  const gon = plain(menuText(PKGS, { compact: true }));
  assert.match(gon, /Phân loại mã HS/);
  assert.ok(gon.length < 500, `menu rút gọn vẫn dài ${gon.length} ký tự`);
});

// ─── So số của não biên tập: so theo GIÁ TRỊ, không theo chuỗi chữ ───
test('so số: 2.5% KHÔNG khớp 25% (lệch 10 lần), 8/10 KHÔNG khớp 8', () => {
  assert.equal(soDungChuan('thuế 25%', 'Thuế NK thông thường: 2.5%'), false);
  assert.equal(soDungChuan('thuế 2,5%', 'Thuế NK thông thường: 25%'), false);
  assert.equal(soDungChuan('VAT 10', 'VAT: 8/10'), false);
  assert.equal(soDungChuan('VAT 8', 'VAT: 8/10'), false);
  assert.equal(soDungChuan('VAT 8/10', 'VAT: 8/10'), true);         // khớp cả tử và mẫu
  assert.equal(soDungChuan('thuế 15%', 'Thuế NK thông thường: 15%'), true);
});

test('so số: mã HS 8 số khớp dù viết khác dấu chấm; mã cắt lở thì KHÔNG khớp', () => {
  assert.equal(soDungChuan('Mã 8414.59.49, MFN 15%', 'Mã đề xuất 8414.59.49 · MFN 15%'), true);
  assert.equal(soDungChuan('Mã 84145949', 'Mã đề xuất 8414.59.49'), true);
  assert.equal(soDungChuan('Mã 8414.59', 'Mã đề xuất 8414.59.49'), false);
});
