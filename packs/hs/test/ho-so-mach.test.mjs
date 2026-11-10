// issue #170 — xâu chuỗi hồ sơ mặt hàng qua nhiều tin trong một mạch khách.
// Tái hiện đúng 6 tin của bài test nhóm Zalo 10/11 09:58–10:18 (giờ VN) trên gói hs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import hs from '../index.js';
import { plain } from '../style.js';

const ALL = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt',
  'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien'];

const MO_TA = 'Chốt kẹp xoay 1/4 vòng loại núm thấp (Low-Height Knob Quarter-Turn Clamp), mã QCTHL0525-10S, cố định vỏ máy và cửa bảo vệ';
const ML = '11111111-2222-4333-8444-555555555555';

/** Thông số "AI đọc ảnh": đúng cái bẫy của issue — chữ ON OFF in trên núm. */
const VISION_ON_OFF = {
  readSpecs: async () => ({ tenHang: 'Núm vặn khoá bật tắt ON OFF', chatLieu: 'thép không gỉ + núm nhựa ABS',
    chuTrongAnh: 'ON  OFF', khongChac: [] }),
};

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
const turn = (text, extra = {}) => ({ turnId: 't', chatId: 'G', userId: 'u1', userName: 'Khách', isGroup: true, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-10T03:00:00.000Z', isStaff: false, ...extra });
const photo = (caption = null) => turn(null, { photoUrl: 'https://photo-stal-14.zdn.vn/no/jpg/abc.jpg', caption });
const tenHangDaTra = (calls) => calls.filter((c) => c.name === 'phan_loai_hs').map((c) => c.args.tenHang);

test('#170 tin 10:00 — "tra hscode" KHÔNG thành tên hàng, chạy trên hồ sơ đang có', async () => {
  const { ctx, calls } = fakeCtx({ phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } } });
  await hs.handle(turn(MO_TA), ctx);
  assert.equal(calls.filter((c) => c.name === 'phan_loai_hs').length, 1, 'tin mô tả phải gọi Cổng');
  const r = await hs.handle(turn('tra hscode'), ctx);
  for (const t of tenHangDaTra(calls)) {
    assert.doesNotMatch(t, /^tra( |$)/i, `tra cứu với tên hàng rác: "${t}"`);
    assert.match(t, /Chốt kẹp/i, `tên hàng phải là hồ sơ đang xử lý, không phải lệnh ngắn: "${t}"`);
  }
  assert.ok(r.replies.length || r.jobs.length, 'lệnh ngắn phải có phản hồi hoặc việc nền');
});

test('#170 tin 10:00 — TẦNG GÓI: text rỗng + hồ sơ đang mở → trả lời nhắc hồ sơ, không im', async () => {
  // Chỉ đo tầng GÓI. Đường thật của tin "@bot" trơ trọi đi qua Lõi (Lõi bỏ nhắc tên rồi mới gọi gói),
  // nên bằng chứng cho yêu cầu 2 của issue nằm ở `test/core/tin-nhac-ten-trong.test.mjs` — test này
  // một mình KHÔNG chứng minh được điều đó (người soát đo đúng: trước bản vá Lõi trả `skipped:'empty'`
  // nên gói không bao giờ chạy, mà test tầng gói vẫn xanh).
  const { ctx } = fakeCtx({ phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } } });
  await hs.handle(turn(MO_TA), ctx);
  const r = await hs.handle(turn(''), ctx);
  assert.ok(r.replies.length, 'tin trống khi đang có hồ sơ thì phải trả lời');
  assert.match(plain(r.replies[0].text), /Chốt kẹp/i);
});

test('#170 tin 10:03 + 10:12 — ảnh là BỔ SUNG, "ok" tra trên hồ sơ gộp, không tra riêng chữ trong ảnh', async () => {
  const { ctx, calls } = fakeCtx({ phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } } }, { vision: VISION_ON_OFF });
  await hs.handle(turn(MO_TA), ctx);
  const a = await hs.handle(photo('chất liệu: thép không gỉ + núm nhựa ABS'), ctx);
  assert.ok(a.replies.length, 'ảnh phải có phản hồi');
  // Mâu thuẫn ON/OFF ↔ chốt kẹp cơ khí → bot HỎI LẠI, không tự chọn bên ảnh.
  assert.match(plain(a.replies[0].text), /ON ?\/?OFF/i);
  assert.match(plain(a.replies[0].text), /\?/, 'phải là câu hỏi lại');
  const b = await hs.handle(turn('ok'), ctx);
  const tens = tenHangDaTra(calls);
  for (const t of tens) {
    assert.doesNotMatch(t, /b[aậ]t t[aắ]t|ON ?OFF/i, `mô tả gửi Cổng bị chữ trong ảnh chiếm: "${t}"`);
    assert.match(t, /Chốt kẹp/i, `mô tả gửi Cổng phải giữ mô tả chữ: "${t}"`);
  }
  const argsCuoi = calls.filter((c) => c.name === 'phan_loai_hs').at(-1).args;
  assert.match(JSON.stringify(argsCuoi), /ABS/, 'chất liệu từ ảnh phải được gộp vào hồ sơ');
  assert.ok(b.replies.length || b.jobs.length);
});

test('#170 [S26] câu đáp mâu thuẫn "đây nhé, …": lệnh/lời chào KHÔNG vào tên hàng gửi Cổng', async () => {
  // Người soát đo (điểm [S26]): đường câu sửa (`themSua`) giữ nguyên văn "đây nhé, …" nên tên hàng
  // gửi Cổng mang cả lời chào lẫn cả câu có từ khoá "dòng điện" → Cổng đọc sai hướng hàng.
  const { ctx, calls } = fakeCtx({ phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } } }, { vision: VISION_ON_OFF });
  await hs.handle(turn(MO_TA), ctx);
  await hs.handle(photo('chất liệu: thép không gỉ + núm nhựa ABS'), ctx);
  await hs.handle(turn('đây nhé, chốt kẹp xoay 1/4 vòng QCTHL0525-10S, chữ on/off là vị trí đóng mở chốt, không liên quan dòng điện'), ctx);
  const cuoi = tenHangDaTra(calls).at(-1) ?? '';
  assert.doesNotMatch(cuoi, /đây nhé/i, `lời chào/lệnh không được thành tên hàng gửi Cổng: "${cuoi}"`);
  assert.match(cuoi, /khách nói thêm/i, 'câu sửa của khách phải vào mục "khách nói thêm"');
  assert.match(cuoi, /không liên quan dòng điện/i, `câu sửa thật của khách phải tới Cổng: "${cuoi}"`);
});

test('#170 tin 10:06 — gửi lại mô tả đầy đủ trong lúc chờ xác nhận ảnh: PHẢI có phản hồi', async () => {
  const { ctx } = fakeCtx({ phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } } }, { vision: VISION_ON_OFF });
  await hs.handle(turn(MO_TA), ctx);
  await hs.handle(photo('chất liệu: thép không gỉ + núm nhựa ABS'), ctx);
  const r = await hs.handle(turn(`đây nhé, ${MO_TA}`), ctx);
  assert.ok(r.replies.length || r.jobs.length, 'tin 10:06 bị nuốt im lặng (log tin=0) — phải có phản hồi');
});

test('#170 tin 10:18 — "xem lại toàn bộ từ đầu": dựng lại hồ sơ, phân loại lại, nói rõ đã đổi gì', async () => {
  const history = [
    { speaker: 'khach', text: MO_TA, at: '2026-11-10T02:58:00Z' },
    { speaker: 'khach', text: 'tra hscode', at: '2026-11-10T03:00:00Z' },
    { speaker: 'khach', text: '[ảnh] https://photo.example/a.jpg chất liệu: thép không gỉ + núm nhựa ABS', at: '2026-11-10T03:03:00Z' },
    { speaker: 'bot', text: 'Mã HS đề xuất: 8538.90', at: '2026-11-10T03:16:00Z' },
  ];
  const { ctx, calls } = fakeCtx({ phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } } }, { history: () => history });
  const r = await hs.handle(turn('chữ on/off là đóng mở, không liên quan dòng điện, xem lại toàn bộ thông tin khách gửi từ đầu tới cuối'), ctx);
  const tens = tenHangDaTra(calls);
  assert.equal(tens.length, 1, 'phải phân loại lại đúng một lần');
  assert.match(tens[0], /Chốt kẹp/i, 'phân loại lại trên hồ sơ dựng từ lịch sử');
  assert.match(JSON.stringify(calls.at(-1).args), /dong mo|đóng mở/i, 'câu sửa của khách phải vào hồ sơ');
  assert.ok(r.replies.length, 'phải nói rõ đã hiểu lại thế nào');
  assert.match(plain(r.replies[0].text), /ON ?\/?OFF/i);
  assert.match(plain(r.replies[0].text), /ph[aâ]n lo[aạ]i l[aạ]i/i);
});


test('#170 CAN_DU_KIEN đang mở + khách gửi thêm thông số → bo_sung_du_kien cùng mã lượt, CÓ phản hồi', async () => {
  const { ctx, calls } = fakeCtx({
    phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'CAN_DU_KIEN', hoi: [{ questionVi: 'Chốt cơ khí hay công tắc điện?' }] } },
    bo_sung_du_kien: { ok: true, maLuot: ML, trangThai: 'DANG_XU_LY' },
  });
  const a = await hs.handle(turn(MO_TA), ctx);
  assert.match(plain(a.replies[0].text), /Chốt cơ khí hay công tắc điện/);
  const b = await hs.handle(turn('chất liệu thép không gỉ, núm ABS, dùng cố định vỏ máy'), ctx);
  const bs = calls.filter((c) => c.name === 'bo_sung_du_kien');
  assert.equal(bs.length, 1, 'phải đi vào bo_sung_du_kien');
  assert.equal(bs[0].args.maLuot, ML, 'cùng mã lượt, không mở lượt mới');
  assert.equal(calls.filter((c) => c.name === 'phan_loai_hs').length, 1, 'không gọi phan_loai_hs lần 2');
  assert.ok(b.replies.length || b.jobs.length, 'tin bổ sung phải có phản hồi');
});

test('#170 một mạch một việc nền: hồ sơ đổi → kết quả cũ bị bỏ, không trả hai kết quả chồng', async () => {
  const { ctx, calls } = fakeCtx({ phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } } });
  const a = await hs.handle(turn(MO_TA), ctx);
  assert.equal(a.jobs.length, 1);
  // Khách sửa hồ sơ trong lúc việc nền còn chạy
  await hs.handle(turn('chữ on/off là đóng mở, không liên quan dòng điện, xem lại toàn bộ từ đầu'), ctx);
  // Kết quả của việc nền CŨ về sau → phải bị bỏ (không gửi tin)
  const cu = await hs.onJobResult(a.jobs[0], { ok: true, trangThai: 'XONG', data: { maDeXuat: '85389090' } }, ctx);
  assert.deepEqual(cu.replies, [], 'kết quả của hồ sơ cũ phải bị bỏ, không gửi cho khách');
  // Kết quả của việc nền MỚI vẫn gửi bình thường
  const moi = calls.filter((c) => c.name === 'phan_loai_hs').length;
  assert.ok(moi >= 2, 'câu sửa phải tạo lượt phân loại mới');
});


test('#170 nhóm 2 người, 2 món, có ảnh → hồ sơ không lẫn nhau', async () => {
  const mkCtx = () => fakeCtx({ phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } } }, { vision: VISION_ON_OFF });
  // Lõi tách phiên theo convId = chatId:userId trong nhóm → hai ctx riêng.
  const A = mkCtx();
  const B = mkCtx();
  await hs.handle(turn(MO_TA, { userId: 'u1', convId: 'G:u1' }), A.ctx);
  await hs.handle(turn('Tên hàng: bút bi nhựa, mực xanh', { userId: 'u2', convId: 'G:u2' }), B.ctx);
  await hs.handle(turn('tra hscode', { userId: 'u1', convId: 'G:u1' }), A.ctx);
  await hs.handle(turn('tra hs', { userId: 'u2', convId: 'G:u2' }), B.ctx);
  for (const t of tenHangDaTra(A.calls)) {
    assert.match(t, /Chốt kẹp/i); assert.doesNotMatch(t, /bút bi/i);
  }
  for (const t of tenHangDaTra(B.calls)) {
    assert.match(t, /bút bi/i); assert.doesNotMatch(t, /Chốt kẹp/i);
  }
});

test('#170 dòng hồ sơ ở đầu tin khi đã chốt mã (tối đa 2 dòng)', async () => {
  // Hồ sơ GỘP từ nhiều nguồn (chữ + ảnh) mới cần nhắc "Em đang tra: …" — tin một dòng chữ thì thân tin đã có tên hàng.
  const vision = { readSpecs: async () => ({ tenHang: 'Chốt kẹp xoay 1/4 vòng', chatLieu: 'thép không gỉ + núm nhựa ABS', khongChac: [] }) };
  const { ctx } = fakeCtx({
    phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } },
    ket_qua_phan_loai: { ok: true, trangThai: 'XONG', data: { maDeXuat: '83024200' } },
  }, { vision });
  await hs.handle(turn(MO_TA), ctx);
  await hs.handle(photo(), ctx);
  const a = await hs.handle(turn('ok'), ctx);
  assert.equal(a.jobs.length, 1, '"ok" phải giao việc phân loại trên hồ sơ gộp');
  const r = await hs.onJobResult(a.jobs[0], { ok: true, trangThai: 'XONG', data: { maDeXuat: '83024200' } }, ctx);
  const t = plain(r.replies[0].text);
  assert.match(t, /Em đang tra: /);
  const dong = t.split('\n');
  const i = dong.findIndex((x) => /^Em đang tra: /.test(x));
  assert.ok(i <= 1, `dòng hồ sơ phải ở đầu tin, đang ở dòng ${i + 1}`);
  assert.match(t, /8302\.42/);
});
