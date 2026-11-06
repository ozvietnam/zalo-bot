// Phần "chính sách nhập khẩu" gọn, tiếng Việt: có dính chính sách không + văn bản dẫn tới chính sách.
// Dữ liệu mẫu rút từ tra_thu_tuc_nhap_khau thật (8504.40.90, 06/11/2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPolicy, renderTax } from '../render.js';
import { plain } from '../style.js';

const THAT = {
  maHs: '85044090',
  kiemTraChuyenNganh: [{ code: 'chat-luong', label: 'Kiểm tra nhà nước về chất lượng / công bố hợp quy (khung 3 mức rủi ro từ 01/7/2026)', labelShort: 'KTCL', severity: 'MEDIUM' }],
  giayPhep: [],
  vanBanQuanLy: [
    { soHieu: '29/2025/TT-BKHCN', hieuLuc: { soHieu: '29/2025/TT-BKHCN', ten: 'Quy định Danh mục sản phẩm, hàng hóa có khả năng gây mất an toàn lĩnh vực công nghệ thông tin và viễn thông thuộc trách nhiệm quản lý của Bộ Khoa học và Công nghệ', tinhTrang: 'HET_HIEU_LUC', hetHieuLucTu: '2026-07-01', biThayTheBoi: ['36/2026/TT-BKHCN'] } },
    { soHieu: '36/2026/TT-BKHCN', hieuLuc: { soHieu: '36/2026/TT-BKHCN', ten: 'Ban hành Danh mục sản phẩm, hàng hóa có mức độ rủi ro trung bình, mức độ rủi ro cao thuộc trách nhiệm quản lý của Bộ Khoa học và Công nghệ', tinhTrang: 'CON_HIEU_LUC', hetHieuLucTu: null, biThayTheBoi: [] } },
    { soHieu: '29/2025/TT-BKHCN-PL2', hieuLuc: null },
  ],
  chinhSach: {
    policyLines: [
      { text: 'Phải công bố hợp quy (rủi ro trung bình) — 36/2026/TT-BKHCN', level: 'BLOCKING', soHieu: '36/2026/TT-BKHCN' },
      { text: 'SPHH lĩnh vực CNTT và VT bắt buộc phải công bố hợp quy (29/2025/TT-BKHCN-PL2)', level: 'BLOCKING' },
    ],
    policyLevel: 'BLOCKING',
    policyBasisReview: { status: 'OUTDATED_BASIS', noteVi: 'Chính sách của mã này đang dẫn văn bản đã hết hiệu lực…' },
    asOf: '2026-11-06', dataVersion: '2026-10-04',
  },
  warnings: { requiresLicense: false, requiresInspection: true, dualUseControl: true, summary: 'Sản phẩm hóa chất thuộc lĩnh vực CNTT…', nhanAi: 'AI_CHUA_KIEM' },
};

test('renderPolicy: có chính sách → nói rõ CÓ, liệt kê chính sách + văn bản (hiệu lực bằng tiếng Việt), không chữ Anh/kỹ thuật', () => {
  const s = plain(renderPolicy(THAT));
  assert.match(s, /^📋 Chính sách nhập khẩu — 8504\.40\.90/);
  assert.match(s, /CÓ chính sách quản lý chuyên ngành/);
  assert.match(s, /• Phải công bố hợp quy \(rủi ro trung bình\)\n/);                    // bỏ số hiệu đuôi, số hiệu nằm ở mục văn bản
  assert.match(s, /• SPHH lĩnh vực CNTT và VT bắt buộc phải công bố hợp quy \(căn cứ đã hết hiệu lực\)/);
  assert.match(s, /Văn bản dẫn tới chính sách:/);
  assert.match(s, /• 36\/2026\/TT-BKHCN — Ban hành Danh mục sản phẩm, hàng hóa có mức độ rủi ro trung bình.*\(còn hiệu lực\)/);
  assert.match(s, /• 29\/2025\/TT-BKHCN — Quy định Danh mục.*\(hết hiệu lực từ 01\/07\/2026, thay bởi 36\/2026\/TT-BKHCN\)/);
  assert.equal((s.match(/29\/2025\/TT-BKHCN —/g) || []).length, 1);                         // -PL2 gộp vào văn bản gốc
  assert.match(s, /đối chiếu văn bản mới trước khi khai/);
  assert.doesNotMatch(s, /Policy|Status|Requires|Dual Use|BLOCKING|OUTDATED|Raw Text|Registry|hóa chất/);   // không chữ Anh, không dòng AI chưa kiểm
});

test('renderPolicy: không có dòng chính sách nhưng có kiểm tra chuyên ngành / giấy phép → vẫn là CÓ', () => {
  const s = plain(renderPolicy({ maHs: '84137090', kiemTraChuyenNganh: [{ label: 'Kiểm tra hiệu suất năng lượng' }], giayPhep: [{ ten: 'Giấy phép nhập khẩu tự động' }], vanBanQuanLy: [] }));
  assert.match(s, /CÓ chính sách/);
  assert.match(s, /• Kiểm tra hiệu suất năng lượng/);
  assert.match(s, /• Giấy phép: Giấy phép nhập khẩu tự động/);
  assert.doesNotMatch(s, /Văn bản dẫn tới/);                                                  // không có văn bản thì không in mục rỗng
});

test('renderPolicy: không có dữ liệu chính sách → nói chưa ghi nhận, KHÔNG khẳng định miễn thủ tục', () => {
  const s = plain(renderPolicy({ maHs: '39269099', kiemTraChuyenNganh: [], giayPhep: [], vanBanQuanLy: [], chinhSach: { policyLines: [] } }));
  assert.match(s, /chưa ghi nhận chính sách quản lý chuyên ngành/);
  assert.match(s, /không có nghĩa là chắc chắn miễn thủ tục/);
  assert.equal(renderPolicy(null), null);
});

test('renderTax: bỏ dòng "Chính sách" do AI tổng hợp chưa kiểm (AI_CHUA_KIEM); giữ khi Cổng không gắn nhãn AI', () => {
  const x = { hsCode: '85044090', nameVi: '- - Loại khác', taxNkPreferential: '0', taxVat: '8/10' };
  assert.doesNotMatch(plain(renderTax({ ...x, warnings: { summary: 'Sản phẩm hóa chất…', severity: 'HIGH', nhanAi: 'AI_CHUA_KIEM' } })), /Chính sách/);
  assert.match(plain(renderTax({ ...x, warnings: { summary: 'Kiểm tra hiệu suất năng lượng.', severity: 'MEDIUM' } })), /Chính sách: Kiểm tra hiệu suất năng lượng/);
});
