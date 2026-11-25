// packs/hs/test/giong-quyen.test.mjs — Kiểm thử định dạng kết quả ngắn trước, chi tiết sau giọng Quyên
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import hs from '../index.js';
import { renderPhanLoaiGiongQuyen, MENU_SO_GIONG_QUYEN } from '../giong-quyen.js';
import { plain } from '../style.js';

// OZV-2326: tin kết quả Giọng Quyên chỉ kèm menu số 0–3 khi cờ MENU_SO_0_3 bật (QA thật/test này
// chạy ở chế độ cờ BẬT); riêng ca cờ TẮT — mặc định khi chưa có duyệt — có test chuyên ở cuối tệp.
process.env.MENU_SO_0_3 = '1';

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
  // Menu số 0–3 cuối tin (OZV-2019 / OZV-1527 pa.1) — trước dòng cảnh báo gợi ý
  assert.equal(dong[dong.length - 2], MENU_SO_GIONG_QUYEN);
  assert.match(text, /Gõ 1 thuế/);
  assert.match(text, /0 gặp nhân viên/);
  assert.match(text, /"căn cứ"/);

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

const ALL_TOOLS = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt',
  'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien'];
const ML_GQ = '11111111-2222-4333-8444-555555555555';

function taoCtxSauPhanLoai(initialSession = {}) {
  const store = {
    last: { tenHang: 'máy xay sinh tố gia dụng 350W 220V', maHs: '85094000', maLuotPhanLoai: ML_GQ },
    banDayDuPhanLoai: true,
    goi: null,
    ...initialSession,
  };
  const mcp = fakeMcp({
    tra_thue: () => ({ ok: true, data: { hsCode: '85094000', nameVi: 'Máy xay sinh tố', taxNkPreferential: '25', taxVat: '8' } }),
    tra_thu_tuc_nhap_khau: () => ({ ok: true, data: { maHs: '85094000', kiemTraChuyenNganh: [], giayPhep: [], vanBanQuanLy: [] } }),
    sinh_mo_ta_khai_bao: () => ({ ok: true, data: { moTaEcus: 'Máy xay sinh tố gia dụng 350W 220V, mới 100%' } }),
  });
  const ctx = {
    mcp, tools: new Set(ALL_TOOLS), vision: null, customer: null, history: () => [],
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-24T02:00:00Z'), log: { info() {}, error() {} },
  };
  const turn = (text) => ({
    turnId: 't1', chatId: 'u1', userId: 'u1', userName: 'Tuấn', isGroup: false, text,
    photoUrl: null, caption: null, receivedAt: '2026-11-24T02:00:00.000Z', isStaff: false,
  });
  return { ctx, store, calls: mcp.calls, turn };
}

test('OZV-2081: sau phân loại HS, khách gõ trần "1" / "2" / "3" / "0" chạy đúng Gói 2 / Gói 3 / handoff; không nhận "1 gói" / "chọn 2"', async () => {
  // 1. Gõ trần "1" → Gói 2 (thue-thu-tuc) với session.last.maHs
  {
    const { ctx, calls, turn, store } = taoCtxSauPhanLoai();
    const r = await hs.handle(turn('1'), ctx);
    const s = plain(r.replies[0].text);
    assert.doesNotMatch(s, /Gửi thông tin theo mẫu/);
    assert.match(s, /Gói 2: Thuế & thủ tục nhập khẩu — mã vừa tra/);
    assert.equal(calls.find((c) => c.name === 'tra_thue')?.args?.maHs, '85094000');
    assert.equal(store.goi, 2);
  }

  // 2. Gõ trần "2" → Gói 2 (thue-thu-tuc) với session.last.maHs
  {
    const { ctx, calls, turn, store } = taoCtxSauPhanLoai();
    const r = await hs.handle(turn('2'), ctx);
    const s = plain(r.replies[0].text);
    assert.doesNotMatch(s, /Gửi thông tin theo mẫu/);
    assert.match(s, /Gói 2: Thuế & thủ tục nhập khẩu — mã vừa tra/);
    assert.equal(calls.find((c) => c.name === 'tra_thue')?.args?.maHs, '85094000');
    assert.equal(store.goi, 2);
  }

  // 3. Gõ trần "3" → Gói 3 (mo-ta) với mã + tên hàng vừa tra
  {
    const { ctx, calls, turn, store } = taoCtxSauPhanLoai();
    const r = await hs.handle(turn('3'), ctx);
    const s = plain(r.replies[0].text);
    assert.doesNotMatch(s, /Gửi thông tin theo mẫu/);
    assert.match(s, /Gói 3: Viết mô tả khai báo — mã vừa tra/);
    const mt = calls.find((c) => c.name === 'sinh_mo_ta_khai_bao')?.args;
    assert.equal(mt?.maHs, '85094000');
    assert.equal(mt?.tenHang, 'máy xay sinh tố gia dụng 350W 220V');
    assert.equal(store.goi, 3);
  }

  // 4. Gõ trần "0" khi vừa có kết quả phân loại và session.goi == null → handoff nhân viên
  {
    const { ctx, calls, turn } = taoCtxSauPhanLoai({ goi: null });
    const r = await hs.handle(turn('0'), ctx);
    assert.deepEqual(r.replies, []);
    assert.deepEqual(r.handoff, { reason: 'khach-chon-0-gap-nhan-vien' });
    assert.equal(calls.length, 0);
  }

  // 5. Gõ trần "0" khi session.goi != null → về tu-dong như cũ, không handoff
  {
    const { ctx, turn, store } = taoCtxSauPhanLoai({ goi: 2 });
    const r = await hs.handle(turn('0'), ctx);
    assert.equal(r.handoff, null);
    assert.match(plain(r.replies[0].text), /Đã chuyển sang chế độ TỰ ĐỘNG/);
    assert.equal(store.goi, null);
  }

  // 6. Không nhận "chọn 2" / "1 gói" làm phím tắt số trần
  {
    const { ctx, calls, turn } = taoCtxSauPhanLoai();
    const rChon2 = await hs.handle(turn('chọn 2'), ctx);
    assert.match(plain(rChon2.replies[0].text), /Gửi thông tin theo mẫu/);
    assert.equal(calls.filter((c) => c.name === 'tra_thue').length, 0);
  }
  {
    const { ctx, calls, turn } = taoCtxSauPhanLoai();
    await hs.handle(turn('1 gói'), ctx);
    assert.equal(calls.filter((c) => c.name === 'tra_thue').length, 0);
  }
});

test('OZV-2092: renderPhanLoaiGiongQuyen ca 8517.62.43 nêu rõ số hiệu 10/2022/TT-BTTTT và thời gian cấp phép ngay ở tin đầu (từ giayPhep hoặc policyLines dài > 70 ký tự), không tự bịa khi Cổng không trả', () => {
  const phanLoai = {
    data: {
      maHs: '85176243',
      ketQua: {
        results: [
          { hsCode: '85176243', nameVi: 'Bộ thích ứng mạng hữu tuyến', confidence: 0.94 },
        ],
      },
    },
  };

  const thue = {
    data: {
      hsCode: '85176243',
      nameVi: 'Bộ thích ứng mạng hữu tuyến',
      taxNkPreferential: 0,
      taxVat: 8,
      acfta: { forOrigin: { eligible: true, rate: 0, origin: 'CN' } },
      canCuChiTiet: {
        mfn: { vanBan: '26/2023/NĐ-CP', hieuLuc: '15/07/2023' },
        acfta: { vanBan: '118/2022/NĐ-CP', hieuLuc: '30/12/2022' },
      },
    },
  };

  // Ca 1: Dữ liệu giấy phép nằm ở thuTuc.data.giayPhep (có soHieu, thoiGianCap) và CON_HIEU_LUC
  const thuTucGiayPhep = {
    data: {
      maHs: '85176243',
      giayPhep: [
        {
          ten: 'Giấy phép nhập khẩu sản phẩm an toàn thông tin mạng theo danh mục Bộ TTTT',
          soHieu: '10/2022/TT-BTTTT',
          thoiGianCap: '05 ngày làm việc',
          tinhTrang: 'CON_HIEU_LUC',
        },
      ],
      vanBanQuanLy: [
        {
          soHieu: '10/2022/TT-BTTTT',
          hieuLuc: { soHieu: '10/2022/TT-BTTTT', tinhTrang: 'CON_HIEU_LUC' },
        },
      ],
    },
  };

  const out1 = plain(renderPhanLoaiGiongQuyen({
    tenHang: 'card mạng kết nối mạng LAN cổng RJ45',
    maHs: '85176243',
    phanLoai,
    thue,
    thuTuc: thuTucGiayPhep,
    xuatXu: 'CN',
  }));
  const dong1 = out1.split('\n').filter((d) => d.trim().length > 0);
  assert.ok(dong1.length <= 7, `Số dòng phải <= 7, thực tế ${dong1.length}:\n${out1}`);
  assert.match(out1, /8517\.62\.43/);
  assert.match(out1, /10\/2022\/TT-BTTTT/, `Tin đầu phải có số hiệu 10/2022/TT-BTTTT:\n${out1}`);
  assert.match(out1, /05 ngày làm việc/, `Tin đầu phải có thời gian cấp phép 05 ngày làm việc (không bị cắt ở 70 ký tự):\n${out1}`);
  assert.equal(dong1[dong1.length - 2], MENU_SO_GIONG_QUYEN);

  // Ca 2: Dữ liệu giấy phép nằm ở policyLines có cụm thời gian cấp phép ở cuối câu (> 70 ký tự)
  const thuTucPolicyDai = {
    data: {
      maHs: '85176243',
      vanBanQuanLy: [
        {
          soHieu: '10/2022/TT-BTTTT',
          hieuLuc: { soHieu: '10/2022/TT-BTTTT', tinhTrang: 'CON_HIEU_LUC' },
        },
      ],
      chinhSach: {
        policyLines: [
          {
            text: 'Phải có giấy phép nhập khẩu sản phẩm an toàn thông tin mạng (thời gian cấp ~5 ngày làm việc) — 10/2022/TT-BTTTT',
            level: 'BLOCKING',
            soHieu: '10/2022/TT-BTTTT',
          },
        ],
      },
    },
  };

  const out2 = plain(renderPhanLoaiGiongQuyen({
    tenHang: 'card mạng kết nối mạng LAN cổng RJ45',
    maHs: '85176243',
    phanLoai,
    thue,
    thuTuc: thuTucPolicyDai,
    xuatXu: 'CN',
  }));
  assert.match(out2, /10\/2022\/TT-BTTTT/);
  assert.match(out2, /~5 ngày làm việc/, `Không được cắt mất cụm ~5 ngày làm việc ở cuối policyLines:\n${out2}`);

  // Ca 3: Khi Cổng không trả thoiGianCap và văn bản HET_HIEU_LUC → không nêu số hiệu hết hiệu lực, không tự bịa thời gian cấp
  const thuTucKhongCo = {
    data: {
      maHs: '85176243',
      giayPhep: [
        {
          ten: 'Giấy phép nhập khẩu sản phẩm an toàn thông tin mạng',
          soHieu: '10/2022/TT-BTTTT',
          tinhTrang: 'HET_HIEU_LUC',
        },
      ],
    },
  };
  const out3 = plain(renderPhanLoaiGiongQuyen({
    tenHang: 'card mạng kết nối mạng LAN cổng RJ45',
    maHs: '85176243',
    phanLoai,
    thue,
    thuTuc: thuTucKhongCo,
    xuatXu: 'CN',
  }));
  assert.doesNotMatch(out3, /10\/2022\/TT-BTTTT/);
  assert.doesNotMatch(out3, /ngày làm việc/);
});

test('OZV-2326: cờ MENU_SO_0_3 TẮT (mặc định) → tin kết quả KHÔNG có dòng menu số 0–3', () => {
  const phanLoai = {
    data: {
      maHs: '85094000',
      ketQua: { results: [{ hsCode: '85094000', nameVi: 'Máy xay, ép trái cây gia dụng', confidence: 0.95 }] },
    },
  };
  const thue = { data: { hsCode: '85094000', taxNkPreferential: 25, taxVat: 8 } };
  const cu = process.env.MENU_SO_0_3;
  delete process.env.MENU_SO_0_3;
  try {
    const out = plain(renderPhanLoaiGiongQuyen({
      tenHang: 'máy xay sinh tố 350W',
      maHs: '85094000',
      phanLoai,
      thue,
      xuatXu: 'CN',
    }));
    assert.doesNotMatch(out, /Gõ 1 thuế/, `Cờ TẮT thì tin KHÔNG được kèm dòng menu số 0–3:\n${out}`);
    assert.doesNotMatch(out, /soạn luôn mô tả khai báo/i, `Cờ TẮT thì không được mời bắn phím:\n${out}`);
    // Dòng cảnh báo gợi ý tham khảo vẫn giữ, trở thành dòng cuối tin.
    const dong = out.split('\n').filter((d) => d.trim().length > 0);
    assert.equal(dong[dong.length - 1], '(Mã HS là gợi ý tham khảo, anh/chị đối chiếu thực tế khi khai báo nhé ạ)');
  } finally {
    process.env.MENU_SO_0_3 = cu;
  }
});


