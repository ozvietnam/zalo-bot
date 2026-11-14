// packs/hs/test/so-tay-hoi.test.mjs — Lớp hỏi lại lấy câu từ NGUỒN CHUNG (mục 1 của issue #177).
//
// Các ca "xong là khi" của thẻ OZV-770:
//   1. có mã ứng viên ≥6 số ⇒ câu hỏi lấy từ `so_tay_questions` của Cổng;
//   2. khách đã nêu công suất ⇒ không hỏi lại công suất, khoá đó đi vào `facts`;
//   3. Cổng lỗi / hết giờ / trả rỗng ⇒ rơi về regex cũ, vẫn hỏi, không bịa, không im.
//
// Ca 4 cũ (`cauHoiTuHoSo` đọc `hoSo.ketLuan.cauHoi`, mục 6 của #177) ĐÃ BỎ cùng với hàm ở
// OZV-782: không chỗ nào ghi `ketLuan`/`maHs` vào hồ sơ nên nhánh đó là mã chết, và test cho mã
// chết chỉ làm bốn cổng xanh nói dối. Lý do đầy đủ ghi ở đầu `so-tay-hoi.js`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  maUngVien, thamSoSoTay, factsDaNeu, hoiTheoSoTay,
} from '../so-tay-hoi.js';
import { TRAN_CAU } from '../ky-luat-hoi.js';

/** ctx giả: ghi lại mọi lời gọi công cụ, trả theo `tra` (hàm hoặc giá trị). */
function ctxGia(tra) {
  const goiDa = [];
  return {
    goiDa,
    mcp: {
      async callTool(name, args) {
        goiDa.push({ name, args });
        return typeof tra === 'function' ? tra(name, args) : tra;
      },
    },
  };
}

// `loai` phải là giá trị THẬT của Cổng: `DONG_BIEU` | `CONG` | `TT39` (hs-code-api
// `api/so-tay-questions.js`), không có `thuoc_tinh`/`thong_so`. Fixture bịa giá trị `loai` là
// cách hồi quy OZV-782 lọt qua bốn cổng xanh của PR #228: test đo một thế giới không tồn tại.
const BA_CAU = {
  ok: true,
  questions: [
    { key: 'cong_suat', questionVi: 'Công suất bao nhiêu W ạ?', type: 'number', required: true, loai: 'DONG_BIEU', unit: 'W' },
    { key: 'chat_lieu', questionVi: 'Vỏ máy chất liệu gì ạ?', type: 'text', required: true, loai: 'DONG_BIEU' },
    { key: 'cong_dung', questionVi: 'Hàng dùng cho gia đình hay công nghiệp ạ?', type: 'enum', required: false, loai: 'TT39', options: ['gia dụng', 'công nghiệp'] },
  ],
};

test('maUngVien: chỉ nhận mã từ 6 số trở lên, cắt 8 ký tự', () => {
  assert.equal(maUngVien('tra hs 8509.40.00 máy xay'), '85094000');
  assert.equal(maUngVien('mã 850940'), '850940');
  assert.equal(maUngVien('nhóm 8509'), null, 'mã 4 số gần như vô ích → không gọi Cổng');
  assert.equal(maUngVien('máy sấy sinh tố'), null);
  assert.equal(maUngVien(null, '', { maHs: '84181010' }?.maHs), '84181010');
});

test('thamSoSoTay: ba luật dựng tham số của erp-xnk', () => {
  // lọc chữ số, cắt 8 ký tự
  assert.deepEqual(thamSoSoTay({ hs: '8509.40.0012', moTa: '' }), { hs: '85094000' });
  // dưới 4 chữ số ⇒ không có câu hỏi, KHÔNG gọi mạng
  assert.equal(thamSoSoTay({ hs: '850' }), null);
  // productText gộp khoảng trắng; rỗng thì bỏ trường
  assert.deepEqual(
    thamSoSoTay({ hs: '85094000', moTa: '  máy   xay \n sinh tố ' }),
    { hs: '85094000', productText: 'máy xay sinh tố' },
  );
  // facts chỉ gửi khi có
  assert.deepEqual(thamSoSoTay({ hs: '85094000', facts: {} }), { hs: '85094000' });
  assert.deepEqual(
    thamSoSoTay({ hs: '85094000', facts: { cong_suat: '350W' } }),
    { hs: '85094000', facts: { cong_suat: '350W' } },
  );
});

test('factsDaNeu: khoá khách đã nêu (lượt này + hồ sơ mạch) đi vào facts', () => {
  const f = factsDaNeu('máy xay sinh tố 350W', { thongSo: '220V' });
  assert.equal(f.cong_suat, '350W');
  assert.equal(f.dien_ap, '220V');
  assert.equal(f.chat_lieu, undefined);
});

test('ca 1: có mã ứng viên ⇒ câu hỏi lấy từ so_tay_questions của Cổng', async () => {
  const ctx = ctxGia(BA_CAU);
  const r = await hoiTheoSoTay(ctx, { s: 'máy sấy sinh tố', moTa: 'máy sấy sinh tố', hoSo: { maHs: '85094000' } });
  assert.equal(r.canHoi, true);
  assert.equal(ctx.goiDa.length, 1);
  assert.equal(ctx.goiDa[0].name, 'so_tay_questions');
  assert.equal(ctx.goiDa[0].args.hs, '85094000');
  // Câu hỏi là chữ CỦA CỔNG, không bịa thêm dữ kiện
  assert.match(r.cauHoi, /Công suất bao nhiêu W/);
  assert.match(r.cauHoi, /chất liệu gì/i);
  // Tối đa TRAN_CAU câu trong MỘT tin
  const soCau = r.cauHoi.split('?').filter((x) => x.trim()).length;
  assert.ok(soCau <= TRAN_CAU, `tối đa ${TRAN_CAU} câu, hiện ${soCau}`);
  // Cờ suy từ ĐẠI LƯỢNG câu hỏi (`chat_lieu`, `cong_dung`), không từ `loai` của Cổng: `loai` chỉ
  // nói câu này để chọn dòng biểu / công / TT39, không nói nó hỏi thuộc tính hay hỏi tên.
  assert.equal(r.hoiThuocTinh, true, 'câu chất liệu/công dụng ⇒ câu đáp của khách là THUỘC TÍNH');
});

// SỬA Ở OZV-799 (ca này trước chốt `false` — chính nó mã hoá cái lỗi).
// Câu "công suất bao nhiêu W" là xin THÔNG SỐ của đúng món khách đang tra, không phải hỏi "hàng
// tên gì": Cổng chỉ được hỏi khi đã có mã ứng viên ≥6 số, còn nhánh hỏi/xác nhận TÊN nằm ở
// `dien-cho-thieu.js`, không qua tệp này. Chốt `false` ở đây là bắt `doc-tra-loi.js` đọc câu đáp
// thành TÊN MÓN MỚI: khách gõ "van bi", đáp "bằng inox" thì tên hàng gửi Cổng chỉ còn "bằng inox"
// — đo được trên ĐƯỜNG THẬT ở `soat-795-moi-khoa-cong.test.mjs` (4 khoá `cong_suat`, `dien_ap`,
// `power`, `voltage`), lần thứ TƯ của lớp lỗi #213 → OZV-782 → OZV-791 → OZV-799.
test('ca 1b [OZV-799]: Cổng hỏi THÔNG SỐ cũng là hỏi THUỘC TÍNH ⇒ hoiThuocTinh true', async () => {
  const ctx = ctxGia({
    ok: true,
    questions: [
      { key: 'cong_suat', questionVi: 'Công suất bao nhiêu W ạ?', type: 'number', required: true, loai: 'DONG_BIEU' },
      { key: 'dien_ap', questionVi: 'Điện áp bao nhiêu V ạ?', type: 'number', required: true, loai: 'DONG_BIEU' },
    ],
  });
  const r = await hoiTheoSoTay(ctx, { s: 'máy sấy', moTa: 'máy sấy', hoSo: { maHs: '85094000' } });
  assert.equal(r.canHoi, true);
  assert.equal(r.hoiThuocTinh, true,
    'Cổng hỏi công suất/điện áp ⇒ câu đáp là THÔNG SỐ của đúng món đó, tên hàng khách đã gõ phải giữ');
});

test('ca 2: khách đã nêu công suất ⇒ không hỏi lại, khoá đó vào facts', async () => {
  const ctx = ctxGia(BA_CAU);
  const r = await hoiTheoSoTay(ctx, {
    s: 'máy xay sinh tố 350W', moTa: 'máy xay sinh tố 350W', hoSo: { maHs: '85094000' },
  });
  assert.equal(r.canHoi, true);
  assert.equal(ctx.goiDa[0].args.facts.cong_suat, '350W', 'khoá đã trả lời phải đi vào facts');
  assert.ok(!/Công suất bao nhiêu/.test(r.cauHoi), 'không hỏi lại điều khách vừa nêu');
  assert.match(r.cauHoi, /chất liệu gì/i);
});

test('ca 3: Cổng lỗi / hết giờ / trả rỗng ⇒ không hỏi (để gọi rơi về regex), không bịa', async () => {
  const loi = ctxGia(() => { throw new Error('Cổng 500'); });
  assert.equal((await hoiTheoSoTay(loi, { s: 'x', moTa: 'x', hoSo: { maHs: '85094000' } })).canHoi, false);

  const rong = ctxGia({ ok: true, questions: [] });
  assert.equal((await hoiTheoSoTay(rong, { s: 'x', moTa: 'x', hoSo: { maHs: '85094000' } })).canHoi, false);

  // Lời gọi "chậm": test tự cầm tay lời hứa rồi mở khoá sau khi assert. KHÔNG dùng `setTimeout`
  // — đồng hồ unref để lời hứa treo qua cuối test thì node:test huỷ ca này và mọi ca sau
  // ("Promise resolution is still pending but the event loop has already resolved", CI 43508123974).
  let moKhoa = null;
  const cham = { mcp: { callTool: () => new Promise((res) => { moKhoa = () => res(BA_CAU); }) } };
  const r = await hoiTheoSoTay(cham, { s: 'x', moTa: 'x', hoSo: { maHs: '85094000' }, hanGioMs: 20 });
  assert.equal(r.canHoi, false, 'quá hạn giờ riêng ⇒ dự phòng, không nghẽn lượt');
  moKhoa?.(); // dọn lời hứa còn treo, không để nó sống qua cuối ca
});

test('ca 3b: chưa có mã ứng viên ≥6 số ⇒ KHÔNG gọi mạng', async () => {
  const ctx = ctxGia(BA_CAU);
  const r = await hoiTheoSoTay(ctx, { s: 'máy sấy sinh tố', moTa: 'máy sấy sinh tố', hoSo: null });
  assert.equal(r.canHoi, false);
  assert.equal(ctx.goiDa.length, 0, 'tránh ăn 400 oan và tránh gọi vô ích');
});

test('OZV-782: hồ sơ không còn là nguồn câu hỏi — chỉ còn Cổng rồi regex', async () => {
  const mod = await import('../so-tay-hoi.js');
  assert.equal(mod.cauHoiTuHoSo, undefined, 'mã chết đã xoá, đừng để ai nối lại');
  assert.equal(mod.batHoSo, undefined, 'cờ HS_HO_SO không còn chỗ đọc (pctx không mang env)');

  // `hoSo` vẫn dùng — nhưng để lấy MÃ ứng viên và dữ kiện khách đã nêu, không lấy câu hỏi.
  const ctx = ctxGia(BA_CAU);
  const r = await mod.hoiLaiUuTien(ctx, {
    s: 'máy xay', moTa: 'máy xay',
    hoSo: { maHs: '85094000', ketLuan: { cauHoi: ['Câu của hồ sơ, KHÔNG ai gửi câu này'] } },
  });
  assert.equal(r.canHoi, true);
  assert.match(r.cauHoi, /Công suất bao nhiêu W/, 'câu phải là câu của Cổng');
  assert.ok(!/KHÔNG ai gửi câu này/.test(r.cauHoi));
  assert.equal(ctx.goiDa.length, 1, 'phải gọi so_tay_questions, không bị hồ sơ chặn trước');
});

test('hoiLaiUuTien: Cổng im ⇒ rơi về duPhong, không im với khách', async () => {
  const { hoiLaiUuTien } = await import('../so-tay-hoi.js');
  const ctx = ctxGia({ ok: true, questions: [] });
  const r = await hoiLaiUuTien(ctx, {
    s: 'van bi', moTa: 'van bi', hoSo: { maHs: '84818087' },
    duPhong: () => ({ canHoi: true, cauHoi: 'Van bi bằng chất liệu gì ạ?', thieu: ['chatLieu'] }),
  });
  assert.equal(r.canHoi, true);
  assert.match(r.cauHoi, /chất liệu gì/i);
});
