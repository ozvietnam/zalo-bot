// packs/hs/test/so-tay-hoi.test.mjs — Lớp hỏi lại lấy câu từ NGUỒN CHUNG (mục 1 và 6 của issue #177).
//
// Bốn ca "xong là khi" của thẻ OZV-770:
//   1. có mã ứng viên ≥6 số ⇒ câu hỏi lấy từ `so_tay_questions` của Cổng;
//   2. khách đã nêu công suất ⇒ không hỏi lại công suất, khoá đó đi vào `facts`;
//   3. Cổng lỗi / hết giờ / trả rỗng ⇒ rơi về regex cũ, vẫn hỏi, không bịa, không im;
//   4. hồ sơ có `ketLuan.cauHoi` ⇒ dùng câu của hồ sơ, KHÔNG gọi `so_tay_questions`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  maUngVien, thamSoSoTay, factsDaNeu, cauHoiTuHoSo, hoiTheoSoTay, batHoSo,
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

const BA_CAU = {
  ok: true,
  questions: [
    { key: 'cong_suat', questionVi: 'Công suất bao nhiêu W ạ?', type: 'number', required: true, loai: 'thong_so', unit: 'W' },
    { key: 'chat_lieu', questionVi: 'Vỏ máy chất liệu gì ạ?', type: 'text', required: true, loai: 'thuoc_tinh' },
    { key: 'cong_dung', questionVi: 'Hàng dùng cho gia đình hay công nghiệp ạ?', type: 'enum', required: false, loai: 'thuoc_tinh', options: ['gia dụng', 'công nghiệp'] },
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
  assert.equal(r.hoiThuocTinh, true);
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

  const cham = {
    mcp: { callTool: () => new Promise((res) => { setTimeout(() => res(BA_CAU), 200).unref?.(); }) },
  };
  const r = await hoiTheoSoTay(cham, { s: 'x', moTa: 'x', hoSo: { maHs: '85094000' }, hanGioMs: 20 });
  assert.equal(r.canHoi, false, 'quá hạn giờ riêng ⇒ dự phòng, không nghẽn lượt');
});

test('ca 3b: chưa có mã ứng viên ≥6 số ⇒ KHÔNG gọi mạng', async () => {
  const ctx = ctxGia(BA_CAU);
  const r = await hoiTheoSoTay(ctx, { s: 'máy sấy sinh tố', moTa: 'máy sấy sinh tố', hoSo: null });
  assert.equal(r.canHoi, false);
  assert.equal(ctx.goiDa.length, 0, 'tránh ăn 400 oan và tránh gọi vô ích');
});

test('ca 4: hồ sơ có ketLuan.cauHoi ⇒ dùng câu của hồ sơ', () => {
  const r = cauHoiTuHoSo({ ketLuan: { cauHoi: ['Đường kính ống bao nhiêu mm ạ?'] } }, { s: 'ống thép' });
  assert.equal(r.canHoi, true);
  assert.match(r.cauHoi, /Đường kính ống bao nhiêu mm/);

  // một câu dạng chuỗi, và dạng { key, questionVi } đều đọc được
  assert.equal(cauHoiTuHoSo({ ketLuan: { cauHoi: 'Hàng mới hay đã qua sử dụng ạ?' } }).canHoi, true);
  assert.equal(cauHoiTuHoSo({ ketLuan: { cauHoi: [{ key: 'chat_lieu', questionVi: 'Chất liệu gì ạ?' }] } }).canHoi, true);

  // hồ sơ không có câu hỏi ⇒ nhường cho so_tay_questions / regex
  assert.equal(cauHoiTuHoSo({ ketLuan: {} }).canHoi, false);
  assert.equal(cauHoiTuHoSo(null).canHoi, false);

  // câu hồ sơ hỏi điều khách đã nêu thì bỏ (kỷ luật hỏi)
  const bo = cauHoiTuHoSo(
    { thongSo: '350W', ketLuan: { cauHoi: [{ key: 'cong_suat', questionVi: 'Công suất bao nhiêu W ạ?' }] } },
    { s: 'máy xay' },
  );
  assert.equal(bo.canHoi, false);
});

test('batHoSo: cờ HS_HO_SO tắt được bằng 0/false/off', () => {
  assert.equal(batHoSo({}), true);
  assert.equal(batHoSo({ HS_HO_SO: '1' }), true);
  assert.equal(batHoSo({ HS_HO_SO: '0' }), false);
  assert.equal(batHoSo({ HS_HO_SO: 'off' }), false);
  assert.equal(
    cauHoiTuHoSo({ ketLuan: { cauHoi: 'Chất liệu gì ạ?' } }, { env: { HS_HO_SO: '0' } }).canHoi,
    false,
  );
});
