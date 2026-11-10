// packs/hs/test/can-cu.test.mjs — Căn cứ pháp lý trong câu trả lời (issue #136 mục B, mở lại ở #168).
// Dữ liệu mẫu lấy từ lần gọi THẬT Cổng OZ `tra_thue` mã 85094000 ngày 10/11/2026
// (gồm đúng lỗi lệch canCu vs canCuChiTiet của mục E) nên test phản ánh hình dạng thật, không tự bịa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  soVanBanTrongText,
  tapSoVanBanCong,
  kiemSoVanBanBia,
  phanTichCanCu,
  dongCanCu,
  khoiCanCuDayDu,
} from '../can-cu.js';

/** Dữ liệu `tra_thue` thật (đã rút gọn, giữ nguyên các trường căn cứ). */
const THUE = {
  ok: true,
  data: {
    hsCode: '85094000',
    nameVi: '- Máy nghiền và máy trộn thực phẩm; máy ép quả hoặc rau',
    taxNkTt: '37.5',
    taxNkPreferential: '25',
    taxVat: '8/10',
    taxAcftaChina: { origin: 'CN', eligible: true, rate: 5, noteVi: 'ACFTA 5% khi có C/O mẫu E hợp lệ.' },
    vatReduction: { noteVi: 'giảm 8% đến 31/12/2026' },
    // Mục E: canCu ghi sai số hiệu (NĐ 26/2025) so với canCuChiTiet (26/2023) → phải ưu tiên canCuChiTiet.
    canCu: {
      tt: { vanBan: 'NĐ 26/2025/NĐ-CP (biểu thuế 2026)', muc: '37.5' },
      mfn: { vanBan: 'NĐ 26/2025/NĐ-CP (biểu thuế 2026)', muc: '25' },
      vat: { vanBan: 'NĐ 174/2025/NĐ-CP (giảm 8% cho đến 31/12/2026)', muc: '8/10' },
      acfta: { vanBan: 'Hiệp định ACFTA (ASEAN–Trung Quốc)', muc: '5 (-BN, TH)' },
    },
    canCuChiTiet: {
      tt: { vanBan: '15/2023/QĐ-TTg', hieuLuc: '15/07/2023' },
      mfn: { vanBan: '26/2023/NĐ-CP', hieuLuc: '15/07/2023' },
      vat: { vanBan: '181/2025/NĐ-CP', hieuLuc: '01/07/2025' },
      acfta: { vanBan: '118/2022/NĐ-CP', hieuLuc: '30/12/2022' },
    },
    legalBasisRegistry: {
      citations: [
        {
          soHieu: '08/2023/TT-BCT', ten: 'Danh mục chi tiết theo mã số HS', coQuan: 'BCT',
          tinhTrang: 'HET_HIEU_LUC_MOT_PHAN', hetHieuLucTu: '2026-12-31',
          biThayTheBoi: [], biBaiBoBoi: ['48/2026/TT-BCT'], biTamNgungBoi: [],
          hieuLucDaDoiChieu: true,
        },
        {
          soHieu: '2711/QĐ-BKHCN', ten: 'Công bố sản phẩm, hàng hóa nhóm 2', coQuan: 'BKHCN',
          tinhTrang: 'CHUA_XAC_MINH', hetHieuLucTu: null,
          biThayTheBoi: [], biBaiBoBoi: [], biTamNgungBoi: [],
          hieuLucDaDoiChieu: false,
        },
      ],
      counts: { total: 2, found: 2, notFound: 0, expired: 0, unverified: 1 },
    },
    hsListings: [
      {
        soHieu: '36/2026/TT-BKHCN', ten: 'Danh mục sản phẩm, hàng hóa có mức độ rủi ro',
        tinhTrang: 'CON_HIEU_LUC', active: true, match: { level: 'HS8', code: '85094000' },
        loaiTacDong: 'CONG_BO_HOP_QUY', effectiveFrom: '2026-07-01', hieuLucDaDoiChieu: true,
      },
    ],
  },
};

const THU_TUC = {
  ok: true,
  data: {
    maHs: '85094000',
    kiemTraChuyenNganh: [],
    giayPhep: [],
    vanBanQuanLy: [
      { soHieu: '36/2026/TT-BKHCN', hieuLuc: { soHieu: '36/2026/TT-BKHCN', ten: 'Danh mục rủi ro', tinhTrang: 'CON_HIEU_LUC' } },
    ],
    chinhSach: {
      policyLines: [
        { text: 'Công bố hợp quy thiết bị điện gia dụng', level: 'ACTION', soHieu: '36/2026/TT-BKHCN', reasonVi: 'Danh mục nhóm 2' },
      ],
    },
  },
};

const TIEN_LE = {
  ok: true,
  data: { items: [{ tbTchqNumber: '5676/TCHQ-TXNK', hsCode: '85094000', girRule: 'GIR 1', issuedDate: '2023-11-02' }] },
};

test('soVanBanTrongText: nhận cả dạng đầy đủ, dạng không năm và dạng viết ngắn trong câu trả lời', () => {
  const found = soVanBanTrongText(
    'Căn cứ: NĐ 26/2023 (thuế NK), 118/2022/NĐ-CP, 2711/QĐ-BKHCN, TB 5676/TCHQ-TXNK — hiệu lực 15/07/2023, VAT 8/10, mã 8509.40.00'
  );
  assert.ok(found.includes('NĐ 26/2023'), `thiếu dạng viết ngắn: ${found.join(' | ')}`);
  assert.ok(found.includes('118/2022/NĐ-CP'), `thiếu dạng đầy đủ: ${found.join(' | ')}`);
  assert.ok(found.includes('2711/QĐ-BKHCN'), `thiếu dạng không năm: ${found.join(' | ')}`);
  assert.ok(found.includes('5676/TCHQ-TXNK'), `thiếu số TB-TCHQ: ${found.join(' | ')}`);
  // Ngày tháng, thuế suất, mã HS KHÔNG phải số hiệu văn bản
  assert.equal(found.filter((s) => /15\/07\/2023|8\/10|8509/.test(s)).length, 0, `nhận nhầm: ${found.join(' | ')}`);
});

test('kiemSoVanBanBia: số văn bản có trong dữ liệu Cổng của lượt thì đạt, số lạ thì trượt', () => {
  const nguon = tapSoVanBanCong([THUE, THU_TUC, TIEN_LE]);

  const that = kiemSoVanBanBia('Căn cứ: NĐ 26/2023 (thuế NK), NĐ 118/2022 (ACFTA, cần C/O mẫu E)', nguon);
  assert.equal(that.ok, true, `không được báo bịa: ${that.bia.join(', ')}`);

  const thatDay = kiemSoVanBanBia('Theo 36/2026/TT-BKHCN và TB 5676/TCHQ-TXNK ạ', nguon);
  assert.equal(thatDay.ok, true, `không được báo bịa: ${thatDay.bia.join(', ')}`);

  const bia = kiemSoVanBanBia('Căn cứ: NĐ 99/2021 (thuế NK) và 12/2019/TT-BCT', nguon);
  assert.equal(bia.ok, false);
  assert.deepEqual(bia.bia.sort(), ['12/2019/TT-BCT', 'NĐ 99/2021']);

  // Số khách tự gõ trong lượt (ví dụ nhờ kiểm hiệu lực) không phải bot bịa
  const echo = kiemSoVanBanBia('Dạ 57/2022/NĐ-CP thì Cổng chưa ghi nhận ạ', tapSoVanBanCong([THUE], ['kiểm hiệu lực 57/2022/NĐ-CP giúp em']));
  assert.equal(echo.ok, true, `không được báo bịa số khách gõ: ${echo.bia.join(', ')}`);
});

test('phanTichCanCu: ưu tiên canCuChiTiet hơn canCu (lỗi lệch mục E)', () => {
  const cc = phanTichCanCu({ thue: THUE, thuTuc: THU_TUC, tienLe: TIEN_LE });
  const mfn = cc.chinh.find((x) => x.khoa === 'mfn');
  assert.ok(mfn, 'phải có căn cứ thuế NK');
  assert.equal(mfn.so, '26/2023/NĐ-CP');
  assert.equal(mfn.hieuLuc, '15/07/2023');
  // Số hiệu sai của canCu không được dùng
  assert.equal(cc.chinh.some((x) => /26\/2025/.test(x.so)), false);
});

test('phanTichCanCu: văn bản hết hiệu lực / chưa kiểm hiệu lực không làm căn cứ chính', () => {
  const cc = phanTichCanCu({ thue: THUE, thuTuc: THU_TUC, tienLe: TIEN_LE });
  const soChinh = cc.chinh.map((x) => x.so);
  assert.equal(soChinh.includes('08/2023/TT-BCT'), false, 'văn bản hết hiệu lực một phần (đã bị bãi bỏ) không được làm căn cứ chính');
  assert.equal(soChinh.includes('2711/QĐ-BKHCN'), false, 'văn bản chưa đối chiếu hiệu lực không được làm căn cứ chính');
  // Nhưng vẫn phải nêu được khi khách hỏi chi tiết, kèm lý do
  const bo = cc.bo.map((x) => x.so);
  assert.deepEqual(bo.sort(), ['08/2023/TT-BCT', '2711/QĐ-BKHCN']);
  assert.match(cc.bo.find((x) => x.so === '08/2023/TT-BCT').vi, /hết hiệu lực/i);
  assert.match(cc.bo.find((x) => x.so === '2711/QĐ-BKHCN').vi, /chưa (đối chiếu|xác minh)/i);
});

test('dongCanCu: 1 dòng, tối đa 3 căn cứ, thuế FTA luôn kèm điều kiện C/O', () => {
  const cc = phanTichCanCu({ thue: THUE, thuTuc: THU_TUC, tienLe: TIEN_LE });
  const dong = dongCanCu(cc);
  assert.ok(dong, 'phải có dòng căn cứ');
  assert.equal(dong.includes('\n'), false, `phải là 1 dòng: ${dong}`);
  assert.match(dong, /^Căn cứ: /);
  assert.match(dong, /NĐ 26\/2023/);
  assert.match(dong, /NĐ 118\/2022/);
  assert.match(dong, /C\/O/, 'căn cứ ACFTA phải kèm điều kiện C/O');
  // Tối đa 3 căn cứ
  const soLuong = (dong.match(/\d{1,4}\/\d{4}/g) || []).length;
  assert.ok(soLuong <= 3, `tin đầu tối đa 3 căn cứ, đang có ${soLuong}: ${dong}`);
  // Không được lọt văn bản hết hiệu lực / chưa kiểm vào tin đầu
  assert.doesNotMatch(dong, /08\/2023/);
  assert.doesNotMatch(dong, /2711/);
});

test('dongCanCu: không có dữ liệu căn cứ thì trả null (không bịa dòng căn cứ rỗng)', () => {
  assert.equal(dongCanCu(phanTichCanCu({})), null);
  assert.equal(dongCanCu(phanTichCanCu({ thue: { ok: false, loi: 'LOI' } })), null);
});

test('dongCanCu: ACFTA không được hưởng thì không nêu căn cứ FTA (tránh hiểu sai là có ưu đãi)', () => {
  const thue2 = {
    ok: true,
    data: {
      ...THUE.data,
      taxAcftaChina: { origin: 'CN', eligible: false, rate: null },
    },
  };
  const dong = dongCanCu(phanTichCanCu({ thue: thue2 }));
  assert.doesNotMatch(dong, /118\/2022/, `không được nêu căn cứ ACFTA khi không đủ điều kiện: ${dong}`);
  assert.match(dong, /NĐ 26\/2023/);
});

test('khoiCanCuDayDu: liệt kê đủ căn cứ chính + văn bản không dùng làm căn cứ chính kèm lý do', () => {
  const cc = phanTichCanCu({ thue: THUE, thuTuc: THU_TUC, tienLe: TIEN_LE });
  const khoi = khoiCanCuDayDu(cc);
  assert.match(khoi, /26\/2023\/NĐ-CP/);
  assert.match(khoi, /118\/2022\/NĐ-CP/);
  assert.match(khoi, /181\/2025\/NĐ-CP/);
  assert.match(khoi, /36\/2026\/TT-BKHCN/);
  assert.match(khoi, /5676\/TCHQ-TXNK/);
  assert.match(khoi, /08\/2023\/TT-BCT/);
  assert.match(khoi, /2711\/QĐ-BKHCN/);
  assert.match(khoi, /C\/O/, 'căn cứ ACFTA phải kèm điều kiện C/O');
});

test('khoiCanCuDayDu: mọi số văn bản nêu ra đều có trong dữ liệu Cổng của lượt (chống bịa)', () => {
  const cc = phanTichCanCu({ thue: THUE, thuTuc: THU_TUC, tienLe: TIEN_LE });
  const nguon = tapSoVanBanCong([THUE, THU_TUC, TIEN_LE]);
  const kq = kiemSoVanBanBia(`${dongCanCu(cc)}\n${khoiCanCuDayDu(cc)}`, nguon);
  assert.equal(kq.ok, true, `số văn bản không có trong dữ liệu Cổng: ${kq.bia.join(', ')}`);
});
