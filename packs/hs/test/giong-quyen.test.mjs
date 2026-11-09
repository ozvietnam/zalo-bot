// packs/hs/test/giong-quyen.test.mjs — Kiểm thử định dạng kết quả ngắn trước, chi tiết sau giọng Quyên
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPhanLoaiGiongQuyen } from '../giong-quyen.js';
import { plain } from '../style.js';

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
