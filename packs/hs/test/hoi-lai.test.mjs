// Hỏi lại (issue #136) chạy TRÊN HỒ SƠ (issue #170): câu trả lời của khách phải tới Cổng.
//
// Hồi quy do bản sửa [S16]: gói 1 chạy trên hồ sơ GỘP (`luong-chu.js` → `trenHoSo`) nên `batDau`
// nhận `text` = mô tả gộp, KHÔNG phải lời khách. Nhánh "hỏi lại" đọc `text` → mất câu trả lời
// ("đúng, 350W 220V") → bot hỏi lại đúng câu cũ → Lõi chặn trùng → KHÁCH KHÔNG NHẬN ĐƯỢC GÌ.
// Lỗi lộ ra ở kịch bản QA G4 (bước 2 và bước 5): 5/6 kịch bản đạt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import hs from '../index.js';
import { plain } from '../style.js';

const ALL = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt',
  'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien'];
const ML = '11111111-2222-4333-8444-555555555555';

/** ctx giả: MCP có đủ 16 công cụ, phiên là object thường (xem `hs.test.mjs`). */
function fakeCtx(overrides = {}, { vision = null, history = () => [] } = {}) {
  const script = Object.fromEntries(ALL.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
  for (const [k, v] of Object.entries(overrides)) script[k] = typeof v === 'function' ? v : () => v;
  const store = {};
  const ctx = {
    mcp: fakeMcp(script), tools: new Set(ALL), vision, customer: null, history,
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-10T03:00:00Z'), log: { info() {}, error() {} },
  };
  return { ctx, store, calls: ctx.mcp.calls };
}
const turn = (text, extra = {}) => ({ turnId: 't', chatId: 'u1', userId: 'u1', userName: 'Khách', isGroup: false, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-10T03:00:00.000Z', isStaff: false, ...extra });
const tenHangDaTra = (calls) => calls.filter((c) => c.name === 'phan_loai_hs').map((c) => c.args.tenHang);

test('[S24] khách trả lời câu "hỏi lại" → câu trả lời phải tới Cổng, không hỏi lại y như cũ', async () => {
  const { ctx, calls } = fakeCtx({ phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } } });
  const a = await hs.handle(turn('Tra hs máy sấy sinh tố'), ctx);
  assert.match(plain(a.replies[0]?.text ?? ''), /máy xay sinh tố/i, 'tin đầu phải hỏi lại tên/thông số');
  assert.match(plain(a.replies[0]?.text ?? ''), /công suất/i, 'câu hỏi phải xin công suất');
  assert.equal(tenHangDaTra(calls).length, 0, 'thiếu thông số thì chưa gọi Cổng');

  const b = await hs.handle(turn('đúng, 350W 220V'), ctx);
  const ts = tenHangDaTra(calls);
  assert.equal(ts.length, 1, `phải gọi Cổng đúng một lần (đang có ${ts.length})`);
  assert.match(ts[0], /máy xay sinh tố/i, `tên hàng phải giữ tên món đã hỏi: "${ts[0]}"`);
  assert.match(ts[0], /350W/i, `thông số khách vừa trả lời phải tới Cổng: "${ts[0]}"`);
  assert.doesNotMatch(plain(b.replies[0]?.text ?? ''), /công suất/i, 'không được hỏi lại câu cũ');
});

test('[S24] "không rõ, cứ tra đi" → tra luôn theo giả định (không hỏi lại y như cũ)', async () => {
  const { ctx, calls } = fakeCtx({ phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } } });
  await hs.handle(turn('Tra hs máy sấy sinh tố'), ctx);
  await hs.handle(turn('không rõ, cứ tra đi'), ctx);
  const ts = tenHangDaTra(calls);
  assert.equal(ts.length, 1, `phải gọi Cổng đúng một lần (đang có ${ts.length})`);
  assert.match(ts[0], /máy xay sinh tố/i, `phải tra món đã hỏi: "${ts[0]}"`);
  assert.match(ts[0], /gia dụng/i, `phải nêu giả định gia dụng: "${ts[0]}"`);
});

test('[S24] thông số khách vừa trả lời phải CÒN trong hồ sơ (dựng lại từ lịch sử mới được)', async () => {
  // Yêu cầu 1 và 4 của issue #170: hồ sơ tích luỹ thông tin; "xem lại toàn bộ từ đầu" dựng lại từ
  // `ctx.history` — thông số đã bị bộ lọc tạp âm bỏ thì hồ sơ dựng lại SAI mất dữ kiện.
  const { ctx, store } = fakeCtx({ phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } } });
  await hs.handle(turn('Tra hs máy sấy sinh tố'), ctx);
  await hs.handle(turn('đúng, 350W 220V'), ctx);
  const sua = store.hoSo?.sua ?? [];
  assert.ok(sua.some((x) => /350W/i.test(String(x))),
    `thông số khách trả lời phải còn trong hồ sơ, đang có: ${JSON.stringify(sua)}`);
});

// ── [S25] Câu hỏi "hỏi lại" CÒN MỞ mà khách gõ LỆNH / "xem lại toàn bộ" ──────────────────────
// Người soát đo (điểm [S25]): gói 1 coi MỌI tin khách là câu trả lời cho câu hỏi đang mở
// (`packages.js` nhánh 0a) → tên hàng gửi Cổng thành "máy xay sinh tố tra hscode", bot hỏi
// lại đúng câu cũ → 0 lần gọi Cổng → khách KHÔNG BAO GIỜ nhận được mã (vi phạm yêu cầu 2 và 4).

const LENH = [['tra hscode', /tra\s*hscode/i], ['ok', /\bok\b/i], ['đây nhé', /đây\s*nhé/i]];

for (const [lenh, reLenh] of LENH) {
  test(`[S25] câu hỏi "hỏi lại" còn mở + lệnh "${lenh}": tra trên hồ sơ đang có, lệnh KHÔNG thành tên hàng`, async () => {
    const { ctx, calls, store } = fakeCtx({ phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } } });
    await hs.handle(turn('Tra hs máy sấy sinh tố'), ctx);
    assert.ok(store.hoiLai, 'câu hỏi "hỏi lại" phải còn mở trước khi khách gõ lệnh');
    const r = await hs.handle(turn(lenh), ctx);
    const ts = tenHangDaTra(calls);
    assert.equal(ts.length, 1, `lệnh phải mở lượt tra trên hồ sơ đang có (đang có ${ts.length} lần gọi Cổng)`);
    assert.doesNotMatch(ts[0], reLenh, `lệnh "${lenh}" KHÔNG được thành tên hàng gửi Cổng: "${ts[0]}"`);
    assert.match(ts[0], /máy sấy sinh tố/i, `tên hàng phải là món khách đang hỏi: "${ts[0]}"`);
    assert.equal(store.hoiLai, null, 'câu hỏi cũ phải đóng khi khách ra lệnh');
    assert.ok(!store.daHoiLai, 'lệnh KHÔNG phải câu trả lời → không được ghi là "đã hỏi lại"');
    assert.doesNotMatch(plain(r.replies[0]?.text ?? ''), /công suất/i, 'không được hỏi lại đúng câu cũ');
    assert.ok(r.jobs.length, 'phải giao việc nền để khách nhận được mã');
    const xong = await hs.onJobResult(r.jobs[0], { ok: true, trangThai: 'XONG', data: { maDeXuat: '85094000' } }, ctx);
    assert.match(plain(xong.replies[0]?.text ?? ''), /Mã HS đề xuất/i, 'khách phải NHẬN ĐƯỢC mã HS');
  });
}

test('[S25] câu hỏi "hỏi lại" còn mở + "xem lại toàn bộ": phải PHÂN LOẠI LẠI, không hỏi lại câu cũ', async () => {
  const history = [{ speaker: 'khach', text: 'Tra hs máy sấy sinh tố', at: '2026-11-10T02:58:00Z' }];
  const { ctx, calls, store } = fakeCtx(
    { phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } } },
    { history: () => history },
  );
  await hs.handle(turn('Tra hs máy sấy sinh tố'), ctx);
  assert.ok(store.hoiLai, 'câu hỏi "hỏi lại" phải còn mở');
  const r = await hs.handle(turn('xem lại toàn bộ thông tin khách gửi từ đầu tới cuối'), ctx);
  const ts = tenHangDaTra(calls);
  assert.equal(ts.length, 1, `phải phân loại lại đúng một lần (đang có ${ts.length})`);
  assert.doesNotMatch(ts[0], /xem lại/i, `câu "xem lại" KHÔNG được thành tên hàng gửi Cổng: "${ts[0]}"`);
  assert.match(ts[0], /máy sấy sinh tố/i, `phải phân loại lại trên hồ sơ dựng từ lịch sử: "${ts[0]}"`);
  assert.equal(store.hoiLai, null, 'câu hỏi cũ phải đóng');
  assert.doesNotMatch(plain(r.replies[0]?.text ?? ''), /công suất/i, 'không được hỏi lại câu cũ');
  assert.match(plain(r.replies[0]?.text ?? ''), /phân loại lại/i, 'phải nói rõ đang phân loại lại');
});
