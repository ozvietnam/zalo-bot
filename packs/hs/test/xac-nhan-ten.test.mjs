// packs/hs/test/xac-nhan-ten.test.mjs — XÁC NHẬN TÊN NGHI GÕ NHẦM khi thông số đã đủ.
//
// Nợ ghi rõ ở PR #203 và trong `ky-luat-hoi.test.mjs`: khi khách đã nêu đủ thông số thì bot
// KHÔNG xác nhận tên nghi gõ nhầm nữa ("sấy" ↔ "xay") — tên sai đi thẳng tới Cổng.
//
// Hai lỗi ĐO ĐƯỢC trước bản vá (bằng chính hàm của repo, không phỏng đoán):
//
//   A) `kiemTraThongTinPhanLoai('máy sấy sinh tố 350W 220V')` → `{ canHoi: false }`
//      `kiemTraThongTinPhanLoai('máy sấy sinh tố', { hoSo: { thongSo: '350W 220V' } })` → `{ canHoi: false }`
//      Nguyên nhân: nhánh nghi gõ nhầm của `dien-cho-thieu.js` `break` ngay khi đủ công suất +
//      điện áp, nên câu xác nhận TÊN cũng rụng theo. Mà tên là thứ đổi hẳn dòng thuế: máy xay
//      sinh tố là 8509.40.00 (máy chế biến thực phẩm gia dụng), máy sấy là nhóm 8419/8516 —
//      khác chương, khác mức thuế. Bot gửi Cổng cái tên khách gõ nhầm rồi in mã + số thuế của
//      món khác (Hiến pháp Điều III: số tiền phải có căn cứ; Điều VIII: không nói như đã biết).
//      Càng đủ thông số thì bot càng im — đúng ngược với cái cần: thông số đủ nghĩa là chỉ còn
//      MỘT điều chưa chắc, là tên món.
//
//   B) `xuLyTraLoiHoiLai('không, là máy sấy thật ạ', { tenGoiY: 'máy xay sinh tố' })`
//      → `moTaTraCuu: "máy xay sinh tố không, là máy sấy thật ạ"`
//      Khách PHỦ ĐỊNH tên bot đoán, bot vẫn dán tên đoán của mình lên đầu rồi nối cả câu phủ
//      định vào sau. Cổng nhận một tên hàng lai mang cả hai món và cả chữ "không". Hỏi xác nhận
//      tên mà không nghe câu trả lời "không" thì câu hỏi thành vô ích.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kiemTraThongTinPhanLoai, xuLyTraLoiHoiLai } from '../dien-cho-thieu.js';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import hs from '../index.js';
import { plain } from '../style.js';

/** Số câu trong một tin hỏi lại (trần 3 câu của kỷ luật hỏi). */
const soCau = (s) => plain(String(s || '')).split(/[?.!]+\s+/).map((x) => x.trim()).filter(Boolean).length;

// ── A. Thông số đã đủ → VẪN phải xác nhận tên, và chỉ xác nhận tên ────────────────────────────

test('[#177-nợ] đủ thông số trong CHÍNH tin đó + tên nghi gõ nhầm → vẫn xác nhận tên', () => {
  const r = kiemTraThongTinPhanLoai('máy sấy sinh tố 350W 220V', { vongHoi: 0 });
  assert.equal(r.canHoi, true, 'tên nghi gõ nhầm thì luôn phải xác nhận, dù thông số đã đủ');
  assert.equal(r.tenGoiY, 'máy xay sinh tố');
  assert.match(r.cauHoi, /máy xay sinh tố/i, `phải nêu tên đúng để khách xác nhận: "${r.cauHoi}"`);
  // Kỷ luật hỏi vẫn giữ: không xin lại thông số khách vừa gõ.
  assert.deepEqual(r.thieu, [], `không còn thông số nào thiếu, đang là ${JSON.stringify(r.thieu)}`);
  assert.doesNotMatch(r.cauHoi, /công\s*suất/i, `không được xin lại công suất khách vừa gõ: "${r.cauHoi}"`);
  assert.doesNotMatch(r.cauHoi, /điện\s*áp/i, `không được xin lại điện áp khách vừa gõ: "${r.cauHoi}"`);
  assert.ok(soCau(r.cauHoi) <= 3, `trần 3 câu, đang ${soCau(r.cauHoi)}: "${r.cauHoi}"`);
});

test('[#177-nợ] HỒ SƠ MẠCH đã đủ thông số + tin này gõ tên nghi gõ nhầm → vẫn xác nhận tên', () => {
  // Đúng ca đã ghi "còn thiếu" trong `ky-luat-hoi.test.mjs`: khách gõ thông số ở tin trước (#170),
  // tin này mới gõ tên món — và tên đó nghi gõ nhầm.
  const hoSo = { moTa: 'máy sấy sinh tố', thongSo: '350W 220V' };
  const r = kiemTraThongTinPhanLoai('máy sấy sinh tố', { vongHoi: 0, hoSo });
  assert.equal(r.canHoi, true, 'thông số đủ rồi thì điều duy nhất còn chưa chắc là TÊN món');
  assert.match(r.cauHoi, /máy xay sinh tố/i, `phải xác nhận tên: "${r.cauHoi}"`);
  assert.doesNotMatch(r.cauHoi, /công\s*suất/i, `không được hỏi lại điều khách đã nêu: "${r.cauHoi}"`);
  assert.doesNotMatch(r.cauHoi, /điện\s*áp/i, `không được hỏi lại điều khách đã nêu: "${r.cauHoi}"`);
});

test('[#177-nợ] tên KHÔNG nghi gõ nhầm + đủ thông số → vẫn tra luôn, không hỏi thêm lượt nào', () => {
  // Chốt ngược để bản vá không thành "hỏi mọi lúc": chỉ tên NGHI GÕ NHẦM mới được giữ câu hỏi.
  for (const m of ['máy xay sinh tố 350W 220V', 'máy bơm nước ly tâm gang 1.5HP 220V',
    'nồi chiên không dầu 5L 1500W 220V', 'van bi inox 304 DN50 tay gạt']) {
    assert.equal(kiemTraThongTinPhanLoai(m, { vongHoi: 0 }).canHoi, false,
      `"${m}": đủ dữ kiện và tên không nghi gõ nhầm thì phải tra luôn`);
  }
  // Hồ sơ mạch đủ thông số, tên bình thường → cũng tra luôn (ca của `ky-luat-hoi.test.mjs`).
  const r = kiemTraThongTinPhanLoai('máy bơm nước', { vongHoi: 0, hoSo: { moTa: 'máy bơm nước', thongSo: '1.5HP 220V' } });
  assert.equal(r.canHoi, false, 'máy đã tự xác định đủ từ hồ sơ thì không được hỏi thêm');
});

test('[#177-nợ] đã hỏi đủ 2 vòng → thôi hỏi tên, tra theo giả định (không treo khách)', () => {
  // Điều II: không được hỏi vòng vo mãi. Trần 2 vòng của #136 vẫn thắng.
  const r = kiemTraThongTinPhanLoai('máy sấy sinh tố 350W 220V', { vongHoi: 2 });
  assert.equal(r.canHoi, false, 'hết 2 vòng thì tra luôn theo giả định');
  assert.match(String(r.giaDinh || ''), /máy xay sinh tố/i, `giả định phải nêu rõ tên đã chọn: "${r.giaDinh}"`);
});

// ── B. Khách PHỦ ĐỊNH tên bot đoán → giữ tên khách nói, không dán tên đoán ────────────────────

// Phiên hỏi lại dựng bằng CHÍNH hàm thật, không gõ tay từng khoá: phiên thật mang cờ
// `hoiXacNhanTen` (chỉ nhánh có câu "em hiểu là <tên> đúng không ạ?" mới được đọc câu "không…"
// của khách là phủ định TÊN — điểm 2 người soát PR #213 nêu). Gõ tay là khoá một phiên GIẢ, test
// xanh mà đường thật vẫn hỏng.
const phienXacNhanTen = (moTa = 'máy sấy sinh tố') => kiemTraThongTinPhanLoai(moTa, { vongHoi: 0 });

test('[#177-nợ] khách trả lời "không, là máy sấy thật" → tên đoán KHÔNG được vào mô tả tra cứu', () => {
  const sess = phienXacNhanTen();
  assert.equal(sess.hoiXacNhanTen, true, 'phiên này phải là phiên XÁC NHẬN TÊN');
  const r = xuLyTraLoiHoiLai('không, là máy sấy thật ạ', sess);
  assert.equal(r.sanSangTra, true);
  assert.doesNotMatch(r.moTaTraCuu, /máy xay/i,
    `khách đã phủ định "máy xay", tên đó không được tới Cổng: "${r.moTaTraCuu}"`);
  assert.match(r.moTaTraCuu, /máy sấy/i, `phải giữ tên khách nói: "${r.moTaTraCuu}"`);
  assert.doesNotMatch(r.moTaTraCuu, /^kh[oô]ng\b/i, `chữ "không" không được mở đầu tên hàng: "${r.moTaTraCuu}"`);
});

test('[#177-nợ] khách phủ định kèm tên món khác rõ ràng → tra đúng món khách nói', () => {
  const sess = phienXacNhanTen();
  const r = xuLyTraLoiHoiLai('không phải, máy sấy thực phẩm 500W', sess);
  assert.doesNotMatch(r.moTaTraCuu, /máy xay/i, `tên bị phủ định không được tới Cổng: "${r.moTaTraCuu}"`);
  assert.match(r.moTaTraCuu, /máy sấy thực phẩm/i, `phải tra món khách nói: "${r.moTaTraCuu}"`);
  assert.match(r.moTaTraCuu, /500W/i, `thông số khách gõ phải còn: "${r.moTaTraCuu}"`);
});

test('[#177-nợ] khách XÁC NHẬN "đúng" → giữ nguyên hành vi cũ (tên đoán + thông số)', () => {
  // Chốt ngược: bản vá không được làm hỏng đường xác nhận thuận (#136, [S24]).
  const sess = phienXacNhanTen();
  const r = xuLyTraLoiHoiLai('đúng, 350W 220V', sess);
  assert.match(r.moTaTraCuu, /máy xay sinh tố/i, `tên đã xác nhận phải tới Cổng: "${r.moTaTraCuu}"`);
  assert.match(r.moTaTraCuu, /350W/i, `thông số khách trả lời phải tới Cổng: "${r.moTaTraCuu}"`);
  assert.doesNotMatch(r.moTaTraCuu, /^đúng|^dung/i, `từ xã giao không được thành tên hàng: "${r.moTaTraCuu}"`);
});

test('[#177-nợ] khách phủ định mà KHÔNG nêu tên nào → dùng tên khách gõ ban đầu, không dùng tên đoán', () => {
  const sess = phienXacNhanTen();
  const r = xuLyTraLoiHoiLai('không ạ', sess);
  assert.doesNotMatch(r.moTaTraCuu, /máy xay/i, `tên bị phủ định không được tới Cổng: "${r.moTaTraCuu}"`);
  assert.match(r.moTaTraCuu, /máy sấy sinh tố/i, `phải quay về tên khách gõ: "${r.moTaTraCuu}"`);
});

// ── Đường thật: tin khách đi qua gói hs ──────────────────────────────────────────────────────
const ALL = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt',
  'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien'];
const ML = '11111111-2222-4333-8444-555555555555';

function fakeCtx() {
  const script = Object.fromEntries(ALL.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
  script.phan_loai_hs = () => ({ ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } });
  const store = {};
  const ctx = {
    mcp: fakeMcp(script), tools: new Set(ALL), vision: null, customer: null, history: () => [],
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-10T03:00:00Z'), log: { info() {}, error() {} },
  };
  return { ctx, store, calls: ctx.mcp.calls };
}
const turn = (text) => ({ turnId: 't', chatId: 'u1', userId: 'u1', userName: 'Khách', isGroup: false, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-10T03:00:00.000Z', isStaff: false });
const tenHangDaTra = (calls) => calls.filter((c) => c.name === 'phan_loai_hs').map((c) => c.args.tenHang);

test('[#177-nợ] đường thật: "máy sấy sinh tố 350W 220V" → hỏi tên TRƯỚC, chưa gọi Cổng', async () => {
  const { ctx, calls } = fakeCtx();
  const r = await hs.handle(turn('Tra hs máy sấy sinh tố 350W 220V'), ctx);
  const tin = plain(r.replies.map((x) => x.text).join('\n'));
  assert.match(tin, /máy xay sinh tố/i, `phải xác nhận tên nghi gõ nhầm: "${tin}"`);
  assert.doesNotMatch(tin, /công\s*suất/i, `không được xin lại thông số khách vừa gõ: "${tin}"`);
  assert.equal(tenHangDaTra(calls).length, 0, 'chưa chắc tên món thì chưa gửi Cổng');
});

test('[#177-nợ] đường thật: khách phủ định tên đoán → Cổng nhận tên khách nói, KHÔNG nhận tên đoán', async () => {
  const { ctx, calls } = fakeCtx();
  await hs.handle(turn('Tra hs máy sấy sinh tố 350W 220V'), ctx);
  const b = await hs.handle(turn('không, là máy sấy thực phẩm ạ'), ctx);
  const ts = tenHangDaTra(calls);
  assert.equal(ts.length, 1, `phải gọi Cổng đúng một lần (đang có ${ts.length})`);
  assert.doesNotMatch(ts[0], /máy xay/i, `tên khách đã phủ định không được tới Cổng: "${ts[0]}"`);
  assert.match(ts[0], /máy sấy thực phẩm/i, `phải tra món khách nói: "${ts[0]}"`);
  assert.ok(b.jobs.length, 'phải giao việc nền để khách nhận được mã');
});

test('[#177-nợ] đường thật: khách xác nhận "đúng ạ" → Cổng nhận tên đã xác nhận kèm thông số cũ', async () => {
  const { ctx, calls } = fakeCtx();
  await hs.handle(turn('Tra hs máy sấy sinh tố 350W 220V'), ctx);
  await hs.handle(turn('đúng ạ'), ctx);
  const ts = tenHangDaTra(calls);
  assert.equal(ts.length, 1, `phải gọi Cổng đúng một lần (đang có ${ts.length})`);
  assert.match(ts[0], /máy xay sinh tố/i, `tên đã xác nhận phải tới Cổng: "${ts[0]}"`);
  // Thông số khách gõ ở tin ĐẦU không được rụng khi `xuLyTraLoiHoiLai` dựng lại mô tả tra cứu.
  assert.match(ts[0], /350W/i, `thông số khách đã gõ phải còn trong tên hàng gửi Cổng: "${ts[0]}"`);
});
