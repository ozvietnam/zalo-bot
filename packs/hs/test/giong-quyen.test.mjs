// packs/hs/test/giong-quyen.test.mjs — Kiểm thử định dạng kết quả ngắn trước, chi tiết sau giọng Quyên
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPhanLoaiGiongQuyen } from '../giong-quyen.js';
import { plain } from '../style.js';
import { tapSoVanBanCong, kiemSoVanBanBia } from '../can-cu.js';

test('renderPhanLoaiGiongQuyen: tin kết quả <= 7 dòng, <= 2 emoji, đúng khung mục 2', () => {
  const phanLoai = {
    data: {
      maHs: '85094000',
      ketQua: {
        results: [
          { hsCode: '85094000', nameVi: 'Máy xay, ép trái cây gia dụng', confidence: 0.95, reasoning: 'Máy xay sinh tố gia dụng' },
        ],
      },
    },
  };

  const thue = {
    data: {
      hsCode: '85094000',
      nameVi: 'máy xay, ép trái cây gia dụng',
      taxNkPreferential: 25,
      taxVat: 8,
      vatReduction: { noteVi: 'áp tới hết 2026' },
      acfta: { forOrigin: { eligible: true, rate: 5, origin: 'CN' } },
    },
  };

  const thuTuc = {
    data: {
      chinhSach: {
        policyLines: [
          { text: 'Kiểm tra chất lượng / công bố hợp quy cho thiết bị điện gia dụng', reasonVi: 'QCVN 4:2009/BKHCN' },
        ],
      },
    },
  };

  const out = renderPhanLoaiGiongQuyen({
    tenHang: 'máy xay sinh tố 350W',
    maHs: '85094000',
    phanLoai,
    thue,
    thuTuc,
    xuatXu: 'CN',
  });

  const text = plain(out);
  const dong = text.split('\n').filter((d) => d.trim().length > 0);

  // 1. Số dòng <= 7 dòng
  assert.ok(dong.length <= 7, `Số dòng phải <= 7, thực tế là ${dong.length} dòng:\n${text}`);

  // 2. Số emoji <= 2
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
  const emojis = text.match(emojiRegex) || [];
  assert.ok(emojis.length <= 2, `Số lượng biểu tượng cảm xúc phải <= 2, thực tế có ${emojis.length}: ${emojis.join(' ')}`);

  // 3. Đúng các nội dung chính
  assert.match(text, /8509\.40\.00/);
  assert.match(text, /Thuế NK 25%/);
  assert.match(text, /C\/O mẫu E.*5%/);
  assert.match(text, /VAT 8%/);
  assert.match(text, /công bố hợp quy/i);
  assert.match(text, /soạn luôn mô tả khai báo/i);

  // 4. Không chứa chuỗi gói hay footer cồng kềnh
  assert.doesNotMatch(text, /Tự động chọn gói/);
  assert.doesNotMatch(text, /Gõ "menu"/);
});

test('renderPhanLoaiGiongQuyen: khi có giả định thì nêu rõ giả định ở dòng 1', () => {
  const phanLoai = {
    data: {
      maHs: '85094000',
      ketQua: {
        results: [
          { hsCode: '85094000', nameVi: 'Máy xay, ép trái cây gia dụng', confidence: 0.95 },
        ],
      },
    },
  };

  const thue = {
    data: {
      hsCode: '85094000',
      taxNkPreferential: 25,
      taxVat: 8,
    },
  };

  const out = renderPhanLoaiGiongQuyen({
    tenHang: 'máy sấy sinh tố',
    maHs: '85094000',
    phanLoai,
    thue,
    giaDinh: 'máy xay sinh tố gia dụng (công suất ~350W, 220V)',
  });

  const text = plain(out);
  assert.match(text, /theo giả định.*máy xay sinh tố/i);
  assert.match(text, /8509\.40\.00/);
});

test('renderPhanLoaiGiongQuyen: khi thuTuc rỗng hoặc policyLines rỗng, KHÔNG tự bịa dòng công bố hợp quy (Điều V & VIII)', () => {
  const maList = ['84137090', '85044090', '85094000', '85167990', '84145999'];

  for (const maHs of maList) {
    const phanLoai = {
      data: {
        maHs,
        ketQua: {
          results: [{ hsCode: maHs, nameVi: `Hàng mẫu ${maHs}`, confidence: 0.9 }],
        },
      },
    };

    const thue = {
      data: {
        hsCode: maHs,
        taxNkPreferential: 0,
        taxVat: 10,
      },
    };

    // Ca 1: thuTuc có chinhSach nhưng policyLines rỗng
    const out1 = renderPhanLoaiGiongQuyen({
      tenHang: `Hàng test ${maHs}`,
      maHs,
      phanLoai,
      thue,
      thuTuc: { data: { chinhSach: { policyLines: [] } } },
    });
    const text1 = plain(out1);
    assert.doesNotMatch(
      text1,
      /công bố hợp quy/i,
      `Mã ${maHs} khi policyLines rỗng không được tự bịa lưu ý công bố hợp quy (Điều V & VIII)`
    );

    // Ca 2: thuTuc rỗng / null
    const out2 = renderPhanLoaiGiongQuyen({
      tenHang: `Hàng test ${maHs}`,
      maHs,
      phanLoai,
      thue,
      thuTuc: null,
    });
    const text2 = plain(out2);
    assert.doesNotMatch(
      text2,
      /công bố hợp quy/i,
      `Mã ${maHs} khi thuTuc null không được tự bịa lưu ý công bố hợp quy (Điều V & VIII)`
    );
  }
});


// ── Căn cứ pháp lý & xưng hô (issue #136 mục B + mục 5, mở lại ở #168) ──────────────────────
// Dữ liệu `tra_thue` giữ nguyên hình dạng lần gọi THẬT Cổng OZ mã 85094000 (10/11/2026),
// gồm cả lỗi lệch canCu (NĐ 26/2025) vs canCuChiTiet (26/2023) của mục E.
const THUE_THAT = {
  ok: true,
  data: {
    hsCode: '85094000',
    nameVi: '- Máy nghiền và máy trộn thực phẩm',
    taxNkPreferential: '25',
    taxVat: '8/10',
    taxAcftaChina: { origin: 'CN', eligible: true, rate: 5, noteVi: 'ACFTA 5% khi có C/O mẫu E hợp lệ.' },
    vatReduction: { noteVi: 'giảm 8% đến 31/12/2026' },
    canCu: {
      mfn: { vanBan: 'NĐ 26/2025/NĐ-CP (biểu thuế 2026)', muc: '25' },
      vat: { vanBan: 'NĐ 174/2025/NĐ-CP (giảm 8%)', muc: '8/10' },
      acfta: { vanBan: 'Hiệp định ACFTA (ASEAN–Trung Quốc)', muc: '5' },
    },
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

const PHAN_LOAI_THAT = {
  data: { maHs: '85094000', ketQua: { results: [{ hsCode: '85094000', nameVi: 'Máy xay, ép trái cây gia dụng', confidence: 0.95 }] } },
};

test('renderPhanLoaiGiongQuyen: tin đầu có dòng căn cứ, tối đa 3 văn bản, FTA kèm điều kiện C/O', () => {
  const out = renderPhanLoaiGiongQuyen({
    tenHang: 'máy xay sinh tố 350W', maHs: '85094000', phanLoai: PHAN_LOAI_THAT, thue: THUE_THAT, xuatXu: 'CN',
  });
  const text = plain(out);
  const dongCc = text.split('\n').filter((d) => /^Căn cứ:/.test(d.trim()));
  assert.equal(dongCc.length, 1, `phải có đúng 1 dòng "Căn cứ:":\n${text}`);
  // Ưu tiên canCuChiTiet (mục E): số hiệu đúng là 26/2023, không phải 26/2025 của canCu
  assert.match(dongCc[0], /26\/2023/);
  assert.doesNotMatch(dongCc[0], /26\/2025/);
  assert.match(dongCc[0], /118\/2022/);
  assert.match(dongCc[0], /C\/O/, 'căn cứ FTA phải kèm điều kiện C/O');
  assert.ok((dongCc[0].match(/\d{1,4}\/\d{4}/g) || []).length <= 3, `tin đầu tối đa 3 căn cứ: ${dongCc[0]}`);
  // Văn bản hết hiệu lực / chưa đối chiếu không được làm căn cứ tin đầu
  assert.doesNotMatch(dongCc[0], /08\/2023/);
  assert.doesNotMatch(dongCc[0], /2711/);
});

test('renderPhanLoaiGiongQuyen: mọi số văn bản trong tin đều có trong dữ liệu Cổng của lượt (chống bịa)', () => {
  const out = renderPhanLoaiGiongQuyen({
    tenHang: 'máy xay sinh tố 350W', maHs: '85094000', phanLoai: PHAN_LOAI_THAT, thue: THUE_THAT,
  });
  const kq = kiemSoVanBanBia(plain(out), tapSoVanBanCong([THUE_THAT, PHAN_LOAI_THAT]));
  assert.equal(kq.ok, true, `số văn bản không có trong dữ liệu Cổng: ${kq.bia.join(', ')}`);
});

test('renderPhanLoaiGiongQuyen: Cổng không trả căn cứ thì KHÔNG có dòng căn cứ (không bịa)', () => {
  const thueTron = { data: { hsCode: '85094000', nameVi: 'Máy xay', taxNkPreferential: 25, taxVat: 8 } };
  const text = plain(renderPhanLoaiGiongQuyen({
    tenHang: 'máy xay sinh tố', maHs: '85094000', phanLoai: PHAN_LOAI_THAT, thue: thueTron,
  }));
  assert.doesNotMatch(text, /Căn cứ:/, `không được bịa dòng căn cứ khi Cổng không trả:\n${text}`);
});

test('renderPhanLoaiGiongQuyen: xưng hô theo hồ sơ khách, mặc định "anh/chị" chứ không gọi cứng "anh"', () => {
  const chung = { tenHang: 'máy xay sinh tố', maHs: '85094000', phanLoai: PHAN_LOAI_THAT, thue: THUE_THAT };

  const macDinh = plain(renderPhanLoaiGiongQuyen(chung));
  assert.match(macDinh, /anh\/chị/, `mặc định phải gọi "anh/chị":\n${macDinh}`);
  assert.doesNotMatch(macDinh, /(?<!\/)\banh nhé/, `không được gọi cứng "anh nhé":\n${macDinh}`);
  assert.doesNotMatch(macDinh, /^Anh muốn/m, `không được mở câu cứng "Anh muốn":\n${macDinh}`);

  const chi = plain(renderPhanLoaiGiongQuyen({ ...chung, xungHo: 'chị' }));
  assert.match(chi, /chị nhé/);
  assert.match(chi, /Chị muốn/);
  assert.doesNotMatch(chi, /\banh\b/i, `khách là "chị" thì không được gọi "anh":\n${chi}`);

  const anh = plain(renderPhanLoaiGiongQuyen({ ...chung, xungHo: 'anh' }));
  assert.match(anh, /anh nhé/);
  assert.doesNotMatch(anh, /\bchị\b/i, `khách là "anh" thì không được gọi "chị":\n${anh}`);
});

test('renderPhanLoaiGiongQuyen: thêm dòng căn cứ vẫn giữ khung <= 7 dòng và <= 2 emoji', () => {
  const out = renderPhanLoaiGiongQuyen({
    tenHang: 'máy xay sinh tố 350W', maHs: '85094000', phanLoai: PHAN_LOAI_THAT, thue: THUE_THAT,
    thuTuc: { data: { chinhSach: { policyLines: [{ text: 'Công bố hợp quy thiết bị điện gia dụng', soHieu: '36/2026/TT-BKHCN' }] }, vanBanQuanLy: [{ soHieu: '36/2026/TT-BKHCN', hieuLuc: { soHieu: '36/2026/TT-BKHCN', tinhTrang: 'CON_HIEU_LUC' } }] } },
  });
  const text = plain(out);
  const dong = text.split('\n').filter((d) => d.trim().length > 0);
  assert.ok(dong.length <= 7, `Số dòng phải <= 7, thực tế ${dong.length}:\n${text}`);
  const emojis = text.match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu) || [];
  assert.ok(emojis.length <= 2, `<= 2 emoji, thực tế ${emojis.length}`);
});
