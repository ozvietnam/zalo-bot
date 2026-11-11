// packs/hs/test/soat-213-vong3.test.mjs — VÒNG SOÁT 3 của PR #213: hai điểm giám đốc CHẶN.
//
// Cả hai dựng lại được bằng chính hàm/đường thật của repo TRƯỚC bản vá:
//
//   1) `tenKhachTuGo` chỉ ẩn CÂU HỎI xác nhận tên; `ketQuaHoi` vẫn trả `tenGoiY: item.chuan` và
//      `giaDinh: item.giaDinh`, nên ở vòng hỏi 2 bot LẶNG LẼ TRÁO tên khách vừa gõ bằng tên bot
//      đoán. `tenBiBacBo` không cứu vì khách chưa bác bỏ gì — khách chỉ gõ tên, chưa nói "không":
//        "Tra hs máy sấy" → "máy sấy sinh tố" → "350W 220V"  ⇒ Cổng: "máy xay sinh tố 350W 220V"
//        "Tra hs máy sấy" → "máy sấy sinh tố" → "cứ tra đi ạ" ⇒ Cổng: "máy xay sinh tố gia dụng…"
//      Bot in mã + thuế của MÁY XAY trong khi khách gõ MÁY SẤY hai lần, mà không hỏi một câu nào
//      (Điều III: không bịa; Điều VIII: không nói sai điều khách đã nói).
//
//   2) `\b` của JS chỉ tính `[A-Za-z0-9_]` nên ba mẫu ĐO của `daNeu` trượt hết chữ Việt CÓ DẤU:
//        CHAT_LIEU_RE.test('van bi đồng') → false   ('van bi dong' → true)
//        CHAT_LIEU_RE.test('tủ gỗ') → false · .test('chén sứ') → false
//        QUY_CACH_RE.test('ống thép đúc') → false
//        CONG_DUNG_RE.test('loại cầm tay') → false · .test('dùng để sấy') → false
//      (`CONG_DUNG_RE` còn viết `c[aâ]m` nên thiếu hẳn dấu chữ "cầm".) Hệ quả trên đường thật:
//        "Tra hs máy sấy sinh tố" → "không, loại cầm tay 350W 220V" ⇒ Cổng: "loại cầm tay 350W 220V"
//      — RỤNG HẲN tên hàng, vì `coTenTrong` không bóc được cụm công dụng nên đếm nó thành tên mới.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daNeu, docTraLoiTen, CHAT_LIEU_RE, QUY_CACH_RE, CONG_DUNG_RE } from '../ky-luat-hoi.js';
import { kiemTraThongTinPhanLoai, xuLyTraLoiHoiLai } from '../dien-cho-thieu.js';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import hs from '../index.js';
import { plain } from '../style.js';

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
  return { ctx, calls: ctx.mcp.calls };
}
const turn = (text) => ({ turnId: 't', chatId: 'u1', userId: 'u1', userName: 'Khách', isGroup: false, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-10T03:00:00.000Z', isStaff: false });
const tenHangDaTra = (calls) => calls.filter((c) => c.name === 'phan_loai_hs').map((c) => c.args.tenHang);
const tin = (r) => plain((r.replies ?? []).map((x) => x.text).join('\n'));

// ── Điểm 1: khách TỰ GÕ tên ở vòng 2 → tên khách đi Cổng, bot đoán khác thì phải HỎI ─────────

test('[#213-8] đường thật: khách tự gõ tên ở vòng 2 → bot HỎI xác nhận, không lặng lẽ tráo', async () => {
  const { ctx, calls } = fakeCtx();
  await hs.handle(turn('Tra hs máy sấy'), ctx);                 // vòng 1: hỏi công dụng + thông số
  const r2 = await hs.handle(turn('máy sấy sinh tố'), ctx);     // khách TỰ GÕ tên (chưa bác bỏ gì)
  assert.match(tin(r2), /em hi[eể]u l[aà].*máy xay sinh tố/i,
    `bot đoán tên KHÁC tên khách gõ thì phải hỏi, đang im: "${tin(r2)}"`);
  await hs.handle(turn('350W 220V'), ctx);
  const ts = tenHangDaTra(calls);
  assert.equal(ts.length, 1, `phải gọi Cổng đúng một lần: ${JSON.stringify(ts)}`);
  assert.doesNotMatch(ts[0], /máy xay/i, `khách gõ "máy sấy", chưa xác nhận → không được tráo: "${ts[0]}"`);
  assert.match(ts[0], /máy s[aấ]y sinh t[oố]/i, `tên khách tự gõ phải tới Cổng: "${ts[0]}"`);
  for (const x of ['350W', '220V']) assert.match(ts[0], new RegExp(x, 'i'), `${x} phải còn: "${ts[0]}"`);
});

test('[#213-8] đường thật: khách tự gõ tên rồi buông "cứ tra đi" → giả định theo tên KHÁCH', async () => {
  const { ctx, calls } = fakeCtx();
  await hs.handle(turn('Tra hs máy sấy'), ctx);
  await hs.handle(turn('máy sấy sinh tố'), ctx);
  const r3 = await hs.handle(turn('cứ tra đi ạ'), ctx);
  const ts = tenHangDaTra(calls);
  assert.equal(ts.length, 1, `phải tra luôn khi khách buông: ${JSON.stringify(ts)}`);
  assert.doesNotMatch(ts[0], /máy xay/i, `giả định không được mang tên bot đoán: "${ts[0]}"`);
  assert.match(ts[0], /máy s[aấ]y sinh t[oố]/i, `giả định phải dựng từ tên khách gõ: "${ts[0]}"`);
  assert.ok(r3.jobs.length, 'phải giao việc nền để khách nhận được mã');
});

test('[#213-8] chốt ngược: khách XÁC NHẬN rõ ("đúng ạ") thì tên bot đoán MỚI được dùng', async () => {
  // Câu hỏi xác nhận không được thành vô ích: khách nói "đúng" là đồng ý với tên bot đoán.
  const { ctx, calls } = fakeCtx();
  await hs.handle(turn('Tra hs máy sấy'), ctx);
  await hs.handle(turn('máy sấy sinh tố'), ctx);
  await hs.handle(turn('đúng ạ, 350W 220V'), ctx);
  const ts = tenHangDaTra(calls);
  assert.equal(ts.length, 1, `phải gọi Cổng đúng một lần: ${JSON.stringify(ts)}`);
  assert.match(ts[0], /máy xay sinh tố/i, `khách đã xác nhận tên bot đoán: "${ts[0]}"`);
});

test('[#213-8] tên gửi Cổng không được LẶP tên hàng hai lần', async () => {
  const { ctx, calls } = fakeCtx();
  await hs.handle(turn('Tra hs máy sấy'), ctx);
  await hs.handle(turn('máy sấy sinh tố'), ctx);
  await hs.handle(turn('350W 220V'), ctx);
  const [ten] = tenHangDaTra(calls);
  assert.doesNotMatch(ten, /(máy s[aấ]y).*\1/i, `"máy sấy máy sấy sinh tố" là mô tả rác: "${ten}"`);
});

test('[#213-8] hồi quy: tên khách gõ ĐÚNG tên bot định gợi ý → KHÔNG hỏi lại tên đó', async () => {
  // Luật 2 của kỷ luật hỏi: không hỏi lại điều khách vừa nêu.
  const { ctx } = fakeCtx();
  await hs.handle(turn('Tra hs máy sấy sinh tố'), ctx);
  const r2 = await hs.handle(turn('không, là máy sấy thực phẩm ạ'), ctx);
  assert.doesNotMatch(tin(r2), /em hi[eể]u l[aà]/i, `khách vừa gõ đúng tên đó: "${tin(r2)}"`);
  assert.match(tin(r2), /c[oô]ng\s*su[aấ]t|[đd]i[eệ]n\s*[aá]p/i, `vẫn phải xin thông số thiếu: "${tin(r2)}"`);
});

// ── Điểm 2: ba mẫu ĐO phải ăn chữ Việt CÓ DẤU (mỗi ca thử cả bản có dấu và không dấu) ────────

test('[#213-9] CHAT_LIEU_RE ăn chất liệu CÓ DẤU (chất liệu đổi chương thuế)', () => {
  for (const s of ['van bi đồng', 'van bi dong', 'tủ gỗ', 'tu go', 'chén sứ', 'chen su',
    'bình thuỷ tinh', 'ống nhựa', 'túi da']) {
    assert.equal(CHAT_LIEU_RE.test(s), true, `"${s}": chất liệu phải đếm được`);
    assert.equal(daNeu(s, null).chatLieu, true, `"${s}": daNeu phải thấy chất liệu`);
  }
});

test('[#213-9] QUY_CACH_RE ăn quy cách CÓ DẤU', () => {
  for (const s of ['ống thép đúc', 'ong thep duc', 'ống thép hàn', 'có mạ kẽm', 'nồi chiên không dầu']) {
    assert.equal(QUY_CACH_RE.test(s), true, `"${s}": quy cách phải đếm được`);
    assert.equal(daNeu(s, null).quyCach, true, `"${s}": daNeu phải thấy quy cách`);
  }
});

test('[#213-9] CONG_DUNG_RE ăn công dụng CÓ DẤU, kể cả dấu chữ "cầm"', () => {
  for (const s of ['loại cầm tay', 'loai cam tay', 'dùng để sấy', 'dung de say', 'dùng cho gia đình',
    'hàng gia dụng', 'loại công nghiệp', 'máy bơm ly tâm']) {
    assert.equal(CONG_DUNG_RE.test(s), true, `"${s}": công dụng phải đếm được`);
    assert.equal(daNeu(s, null).congDung, true, `"${s}": daNeu phải thấy công dụng`);
  }
});

test('[#213-9] đường thật: khách đáp bằng CÔNG DỤNG có dấu → tên hàng KHÔNG rụng', async () => {
  const { ctx, calls } = fakeCtx();
  await hs.handle(turn('Tra hs máy sấy sinh tố'), ctx);
  await hs.handle(turn('không, loại cầm tay 350W 220V'), ctx);
  const ts = tenHangDaTra(calls);
  assert.equal(ts.length, 1, `phải gọi Cổng đúng một lần: ${JSON.stringify(ts)}`);
  assert.match(ts[0], /máy s[aấ]y sinh t[oố]/i, `tên hàng không được rụng: "${ts[0]}"`);
  assert.doesNotMatch(ts[0], /máy xay/i, `tên bị phủ định không được tới Cổng: "${ts[0]}"`);
  assert.match(ts[0], /c[aầ]m\s*tay/i, `công dụng vẫn phải đi nguyên văn tới Cổng: "${ts[0]}"`);
});

test('[#213-9] hồi quy bắt buộc: chữ "không" và tên hàng vẫn còn ở nhánh hỏi THUỘC TÍNH', async () => {
  // Đường thật qua nhánh hỏi QUY CÁCH ("đúc hay hàn, có mạ kẽm không ạ?"). Dùng "Tra hs ống thép"
  // (không kèm DN50) vì "ống thép DN50" đã đủ 2 chi tiết nên KHÔNG vào nhánh hỏi lại — xem ca
  // `[#213-9b]` dưới, đó là nợ sẵn có trên `main`, không phải tác dụng phụ của PR này.
  const { ctx, calls } = fakeCtx();
  await hs.handle(turn('Tra hs ống thép'), ctx);
  await hs.handle(turn('không mạ kẽm, đúc DN50'), ctx);
  const ts = tenHangDaTra(calls);
  assert.equal(ts.length, 1, `phải gọi Cổng đúng một lần: ${JSON.stringify(ts)}`);
  assert.match(ts[0], /kh[oô]ng\s*m[aạ]\s*k[eẽ]m/i, `mất chữ "không" là bot nói ngược khách: "${ts[0]}"`);
  assert.match(ts[0], /[oố]ng\s*th[eé]p/i, `tên hàng không được rụng: "${ts[0]}"`);
  assert.match(ts[0], /DN50/i, `kích thước khách gõ phải còn: "${ts[0]}"`);
});

test('[#213-9] hồi quy bắt buộc: hàm `xuLyTraLoiHoiLai` giữ "không" cho cả ca KHÔNG có DN50', () => {
  // Đúng câu chữ giám đốc dặn: `"ống thép DN50"` → `"không mạ kẽm, đúc"`. Đo bằng hàm vì trên
  // đường thật mô tả đầu đã đủ chi tiết nên không có vòng hỏi lại nào để trả lời (xem `[#213-9b]`).
  const hoiLai = kiemTraThongTinPhanLoai('ống thép', { vongHoi: 0 });
  const r = xuLyTraLoiHoiLai('không mạ kẽm, đúc', { ...hoiLai, vongHoi: 1 });
  assert.match(r.moTaTraCuu, /kh[oô]ng\s*m[aạ]\s*k[eẽ]m/i, `chữ "không" phải còn: "${r.moTaTraCuu}"`);
  assert.match(r.moTaTraCuu, /[oố]ng\s*th[eé]p/i, `tên hàng không được rụng: "${r.moTaTraCuu}"`);
});

test('[#213-9b] NỢ SẴN CÓ trên `main`: "ống thép DN50" đủ 2 chi tiết nên KHÔNG hỏi quy cách', () => {
  // Đo được y hệt trên `main` (a84e8bb) — KHÔNG phải tác dụng phụ của PR này, nên chỉ KHOÁ hành vi
  // hiện tại ở đây để lần sau đổi là có test nói, không nong PR #213 ra sửa.
  // Gốc: `soChiTiet >= 2` đếm `kichThuoc` (DN50) + `chatLieu` ("thép" trong "ống thép") là đủ, nên
  // bỏ qua cả nhánh hỏi QUY CÁCH — mà đúc/hàn/mạ kẽm mới là thứ đổi dòng thuế của ống thép
  // (7304 đúc ≠ 7306 hàn). Khách gõ tiếp "không mạ kẽm, đúc" thì câu đó thành lượt tra MỚI.
  assert.equal(kiemTraThongTinPhanLoai('ống thép DN50', { vongHoi: 0 }).canHoi, false,
    'khoá hành vi hiện tại: đủ 2 chi tiết thì không hỏi lại');
  assert.equal(kiemTraThongTinPhanLoai('ống thép', { vongHoi: 0 }).canHoi, true,
    'chưa có kích thước thì vẫn phải hỏi quy cách');
});

test('[#213-9] hồi quy bắt buộc: "không nha khoa" không bị cắt oan', () => {
  const p = { tenGoiY: 'máy xay sinh tố', tenGoc: 'máy sấy sinh tố', hoiXacNhanTen: true };
  assert.match(docTraLoiTen('không nha khoa', p).ten, /nha khoa/i, '"nha khoa" là tên hàng, không phải từ đệm');
});
