// issue #177 yêu cầu 4 — ẢNH ĐI CHUNG HỒ SƠ: ảnh cùng mô tả đã có trong hồ sơ mạch (#170) đi vào
// MỘT lượt phân loại, không phân loại ảnh tách riêng.
//
// Lỗi đo được trên `main` (0fb9785) trước bản vá, bằng chính gói hs:
//   1. khách gõ mô tả đủ  → bot giao lượt phân loại (việc nền đang chạy);
//   2. khách gửi thêm ảnh tem nhãn ngay sau  → bot in "👉 Đúng thì gõ ok" như một lượt MỚI;
//   3. kết quả lượt 1 (hồ sơ CHƯA có ảnh) vẫn tới khách;
//   4. khách gõ "ok" → lượt phân loại THỨ HAI.
// ⇒ khách nhận HAI kết quả cho cùng một món (có thể hai mã khác nhau) và mất thêm một lượt
//    hỏi–đáp. Trái yêu cầu 4 của #177 và trái chính luật "một mạch một kết quả" của #170
//    (yêu cầu 6, `packs/hs/index.js` onJobResult).
//
// Luật sau bản vá: ảnh tới TRONG LÚC lượt phân loại của mạch còn chạy và hồ sơ đã đủ tra
// → gộp ảnh vào hồ sơ rồi phân loại lại NGAY trên bản gộp, không hỏi "ok" lần nữa; kết quả
// lượt cũ bị bỏ bằng cơ chế đếm lượt đã có (`luotSo`). Lượt đã trả kết quả xong rồi thì giữ
// hành vi cũ (xin khách xác nhận) — không tự tiêu thêm điểm Cổng ngoài ý khách.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import hs from '../index.js';
import { plain } from '../style.js';

const ALL = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs',
  'sinh_mo_ta_khai_bao', 'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban',
  'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt', 'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien'];

const MO_TA = 'Máy xay sinh tố cầm tay 350W 220V dùng trong gia đình, vỏ nhựa ABS';
const ML1 = '11111111-2222-4333-8444-555555555551';
const ML2 = '11111111-2222-4333-8444-555555555552';

/** Ảnh tem nhãn: nói THÊM thương hiệu + model, cùng món với mô tả chữ (không mâu thuẫn). */
const VISION_TEM = { readSpecs: async () => ({ tenHang: 'Máy xay sinh tố', thuongHieu: 'Philips', model: 'HR2051', khongChac: [] }) };
/** Ảnh ngược hướng mô tả chữ — bẫy ON/OFF của #170. */
const VISION_ON_OFF = { readSpecs: async () => ({ tenHang: 'Núm vặn khoá bật tắt ON OFF', chatLieu: 'thép không gỉ', chuTrongAnh: 'ON  OFF', khongChac: [] }) };

function fakeCtx({ vision = null } = {}) {
  let lan = 0;
  const script = Object.fromEntries(ALL.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
  // Mỗi lượt phân loại một mã lượt khác nhau (như Cổng thật), để đếm được bot mở mấy lượt.
  script.phan_loai_hs = () => ({ ok: true, data: { maLuot: ++lan === 1 ? ML1 : ML2, trangThai: 'DANG_XU_LY' } });
  const store = {};
  const ctx = {
    mcp: fakeMcp(script), tools: new Set(ALL), vision, customer: null, history: () => [],
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-10T03:00:00Z'), log: { info() {}, error() {} },
  };
  return { ctx, store, calls: ctx.mcp.calls };
}
const turn = (text, extra = {}) => ({ turnId: 't', chatId: 'G', userId: 'u1', userName: 'Khách', isGroup: false,
  text, photoUrl: null, caption: null, receivedAt: '2026-11-10T03:00:00.000Z', isStaff: false, ...extra });
const photo = (caption = null) => turn(null, { photoUrl: 'https://photo-stal-14.zdn.vn/no/jpg/abc.jpg', caption });
const soLuotCong = (calls) => calls.filter((c) => c.name === 'phan_loai_hs').length;
const tenHangCuoi = (calls) => calls.filter((c) => c.name === 'phan_loai_hs').at(-1)?.args ?? {};
const XONG = { ok: true, trangThai: 'XONG', data: { maDeXuat: '85094000' } };

test('#177 yc4 — ảnh tới khi lượt đang chạy: phân loại lại trên hồ sơ gộp, KHÔNG bắt khách gõ "ok"', async () => {
  const { ctx, calls } = fakeCtx({ vision: VISION_TEM });
  const t1 = await hs.handle(turn(MO_TA), ctx);
  assert.equal(t1.jobs.length, 1, 'mô tả đủ phải mở lượt phân loại');

  const t2 = await hs.handle(photo(), ctx);
  const tinAnh = plain(t2.replies.map((r) => r.text).join('\n'));
  assert.doesNotMatch(tinAnh, /gõ "?ok"?/i, `ảnh đi chung hồ sơ thì không xin xác nhận lại: "${tinAnh.slice(0, 200)}"`);
  assert.equal(t2.jobs.length, 1, 'ảnh phải đi vào lượt phân loại của chính hồ sơ đó');
  assert.match(tinAnh, /Philips|HR2051/i, 'tin phải cho khách thấy bot đã đọc được gì từ ảnh');

  // Dữ kiện ảnh phải tới Cổng CÙNG mô tả chữ, trong một lượt.
  const args = tenHangCuoi(calls);
  assert.match(String(args.tenHang), /Máy xay sinh tố cầm tay/i, `mô tả chữ của khách phải còn: ${JSON.stringify(args)}`);
  assert.match(JSON.stringify(args), /Philips/i, `thương hiệu đọc từ ảnh phải vào cùng lượt: ${JSON.stringify(args)}`);
  assert.match(JSON.stringify(args), /HR2051/i, `model đọc từ ảnh phải vào cùng lượt: ${JSON.stringify(args)}`);
});

test('#177 yc4 — một mạch một kết quả: kết quả lượt trước ảnh bị bỏ, khách nhận ĐÚNG một mã', async () => {
  const { ctx } = fakeCtx({ vision: VISION_TEM });
  const t1 = await hs.handle(turn(MO_TA), ctx);
  const t2 = await hs.handle(photo(), ctx);
  assert.equal(t2.jobs.length, 1);

  // Kết quả lượt CŨ (hồ sơ chưa có ảnh) về sau → phải bị bỏ, không tới khách.
  const cu = await hs.onJobResult(t1.jobs[0], XONG, ctx);
  assert.equal(cu.replies.length, 0, 'kết quả lượt trước khi có ảnh không được gửi cho khách');

  // Kết quả lượt MỚI (hồ sơ đã gộp ảnh) thì phải tới khách.
  const moi = await hs.onJobResult(t2.jobs[0], XONG, ctx);
  assert.equal(moi.replies.length, 1, 'kết quả lượt trên hồ sơ gộp phải tới khách');
  assert.match(plain(moi.replies[0].text), /8509\.40/);
});

test('#177 yc4 — ảnh ngược hướng mô tả chữ: vẫn HỎI LẠI một câu, không tự tra (giữ luật #170)', async () => {
  const { ctx, calls } = fakeCtx({ vision: VISION_ON_OFF });
  await hs.handle(turn('Chốt kẹp xoay 1/4 vòng loại núm thấp, mã QCTHL0525-10S, cố định vỏ máy'), ctx);
  const truoc = soLuotCong(calls);
  const r = await hs.handle(photo(), ctx);
  const tin = plain(r.replies.map((x) => x.text).join('\n'));
  assert.match(tin, /ON ?\/?OFF/i, 'phải nêu chữ đọc được trong ảnh');
  assert.match(tin, /\?/, 'mâu thuẫn ảnh ↔ chữ thì phải hỏi lại một câu');
  assert.equal(soLuotCong(calls), truoc, 'đang mâu thuẫn thì không được tự mở lượt phân loại mới');
});

test('#177 yc4 — lượt đã trả kết quả xong rồi mới gửi ảnh: giữ hành vi cũ (xin khách xác nhận)', async () => {
  const { ctx, calls } = fakeCtx({ vision: VISION_TEM });
  const t1 = await hs.handle(turn(MO_TA), ctx);
  const xong = await hs.onJobResult(t1.jobs[0], XONG, ctx);
  assert.equal(xong.replies.length, 1, 'lượt 1 phải trả kết quả cho khách');
  const truoc = soLuotCong(calls);

  const t2 = await hs.handle(photo(), ctx);
  assert.equal(t2.jobs.length, 0, 'không tự mở lượt mới khi lượt trước đã xong — chờ khách quyết');
  assert.equal(soLuotCong(calls), truoc, 'không tự tiêu thêm điểm Cổng ngoài ý khách');
  assert.match(plain(t2.replies.map((r) => r.text).join('\n')), /ok/i, 'phải xin khách xác nhận như cũ');

  // Khách gõ "ok" thì mới tra lại, và tra trên hồ sơ GỘP (ảnh là bổ sung).
  const t3 = await hs.handle(turn('ok'), ctx);
  assert.equal(t3.jobs.length, 1);
  assert.match(JSON.stringify(tenHangCuoi(calls)), /Philips/i, 'lượt sau "ok" phải mang dữ kiện ảnh');
});

test('#177 yc4 — hai ảnh liên tiếp của cùng món: vẫn chỉ MỘT lượt phân loại', async () => {
  const { ctx, calls } = fakeCtx({ vision: VISION_TEM });
  await hs.handle(turn(MO_TA), ctx);
  await hs.handle(photo('ảnh mặt hàng'), ctx);
  await hs.handle(photo('ảnh tem thông số'), ctx);
  // Lượt 1 (tin chữ) + lượt gộp ảnh. Ảnh thứ hai gộp tiếp vào hồ sơ, không mở lượt thứ ba.
  assert.ok(soLuotCong(calls) <= 2, `hai ảnh cùng món không được thành nhiều lượt: ${soLuotCong(calls)} lượt`);
});
