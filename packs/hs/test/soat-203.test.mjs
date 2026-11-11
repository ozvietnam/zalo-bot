// packs/hs/test/soat-203.test.mjs — năm điểm người soát (soat-khac/Gemini) CHẶN PR #203.
//
// PR #203 làm yêu cầu 2 + 3 của issue #177. Người soát đọc mã và nêu năm điểm; mỗi điểm ở đây là
// một ca test ĐO hành vi thật, để biết điểm đó là lỗi thật hay báo sai. Ca nào đỏ = lỗi thật.
//
// Điểm 1 (`dien-cho-thieu.js:148`) — cổng `!coLoaiCongDung && !coCongSuat && !coDienAp && !coDungTich`
//   chặn CẢ nhánh khi khách mới nêu MỘT đại lượng ⇒ bot không hỏi những đại lượng CÒN THIẾU nữa,
//   và `gomCau`/`cauXinThem` trong khối thành mã chết (vào được khối thì mọi `co[khoa]` đều false).
// Điểm 2 (`dien-cho-thieu.js:187`) — cổng `!coKichThuoc && !coQuyCach` tương tự ở nhánh cơ khí:
//   khách nêu kích thước ("van bi DN25") thì rụng luôn câu chất liệu.
// Điểm 3 (`dien-cho-thieu.js:195,206`) — câu xin hỏi GỘP "kích thước … hoặc mục đích dùng" nhưng chỉ
//   khai `khoa: 'kichThuoc'` ⇒ khách đã nêu công dụng vẫn bị hỏi lại mục đích dùng.
// Điểm 4 (`ky-luat-hoi.js:76`) — lọc hết câu vì khách đã nêu đủ thì `ketQuaHoi` vẫn trả `giaDinh`
//   mặc định (chuỗi dành cho trường hợp khách TỪ CHỐI trả lời) thay vì `null`.
// Điểm 5 (`packages.js:298,360,428`) — `xuatXuCua` chỉ đọc lượt HIỆN TẠI, không đọc hồ sơ mạch
//   (#170) nên nước khách nêu ở lượt trước bị rụng và tin lại báo "giả định xuất xứ Trung Quốc".
//
// Vì sao từng điểm đáng sửa: điểm 1–3 làm khách phải tự nói lại dữ kiện hoặc mất hẳn câu hỏi cần
// thiết (mã HS sai dòng); điểm 5 in ra mức thuế theo một nước khách KHÔNG nói, trong khi khách đã
// nói nước khác — chạm Điều III (số tiền phải có căn cứ trong lượt) và Điều VIII (không nói như đã
// biết điều mình chỉ đoán), đúng cái yêu cầu 3 của #177 muốn dẹp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kiemTraThongTinPhanLoai } from '../dien-cho-thieu.js';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import hs from '../index.js';
import { plain } from '../style.js';

// ── Điểm 1: nêu MỘT đại lượng vẫn phải được hỏi các đại lượng còn thiếu ──────────────────────

test('[soát #203-1] "máy bơm 350W" → vẫn phải hỏi điện áp còn thiếu, không bỏ luôn nhánh hỏi', () => {
  const r = kiemTraThongTinPhanLoai('máy bơm 350W', { vongHoi: 0 });
  assert.equal(r.canHoi, true, 'khách mới nêu công suất, điện áp và công dụng vẫn thiếu → phải hỏi');
  assert.doesNotMatch(r.cauHoi || '', /c[oô]ng\s*su[aấ]t/i, `không xin lại công suất khách vừa gõ: "${r.cauHoi}"`);
  assert.match(r.cauHoi || '', /[đd]i[eệ]n\s*[aá]p/i, `phải xin điện áp còn thiếu: "${r.cauHoi}"`);
});

test('[soát #203-1] HỒ SƠ MẠCH có công suất, tin này gõ tên món → vẫn hỏi điện áp còn thiếu', () => {
  const r = kiemTraThongTinPhanLoai('máy bơm', { vongHoi: 0, hoSo: { moTa: 'máy bơm', thongSo: '350W' } });
  assert.equal(r.canHoi, true, 'hồ sơ chỉ có công suất; điện áp + công dụng vẫn thiếu → phải hỏi');
  assert.doesNotMatch(r.cauHoi || '', /c[oô]ng\s*su[aấ]t/i, `không hỏi lại công suất đã có trong hồ sơ: "${r.cauHoi}"`);
  assert.match(r.cauHoi || '', /[đd]i[eệ]n\s*[aá]p/i, `phải xin điện áp còn thiếu: "${r.cauHoi}"`);
});

test('[soát #203-1] khách nêu công dụng nhưng chưa có thông số → không hỏi lại công dụng, vẫn xin thông số', () => {
  const r = kiemTraThongTinPhanLoai('máy bơm gia đình', { vongHoi: 0 });
  assert.equal(r.canHoi, true, 'công suất + điện áp vẫn thiếu → phải hỏi');
  assert.doesNotMatch(r.cauHoi || '', /gia\s*[đd][iì]nh\s*hay\s*c[oô]ng\s*nghi[eệ]p/i,
    `công dụng khách đã nêu, không hỏi lại: "${r.cauHoi}"`);
  assert.match(r.cauHoi || '', /(c[oô]ng\s*su[aấ]t|[đd]i[eệ]n\s*[aá]p)/i, `phải xin thông số còn thiếu: "${r.cauHoi}"`);
});

// ── Điểm 2: nhánh cơ khí, nêu kích thước không được làm rụng câu chất liệu ───────────────────

test('[soát #203-2] "van bi DN25" → vẫn phải hỏi chất liệu còn thiếu', () => {
  const r = kiemTraThongTinPhanLoai('van bi DN25', { vongHoi: 0 });
  assert.equal(r.canHoi, true, 'kích thước đã có nhưng chất liệu còn thiếu → phải hỏi chất liệu');
  assert.match(r.cauHoi || '', /ch[aấ]t\s*li[eệ]u/i, `phải hỏi chất liệu: "${r.cauHoi}"`);
  assert.doesNotMatch(r.cauHoi || '', /(DN\)|[đd][uư][oờ]ng\s*k[ií]nh)/i,
    `không xin lại kích thước khách vừa gõ: "${r.cauHoi}"`);
});

test('[soát #203-2] HỒ SƠ MẠCH có kích thước, tin này gõ "van bi" → vẫn hỏi chất liệu', () => {
  const r = kiemTraThongTinPhanLoai('van bi', { vongHoi: 0, hoSo: { moTa: 'van bi DN25' } });
  assert.equal(r.canHoi, true, 'kích thước có trong hồ sơ, chất liệu vẫn thiếu → phải hỏi');
  assert.match(r.cauHoi || '', /ch[aấ]t\s*li[eệ]u/i, `phải hỏi chất liệu: "${r.cauHoi}"`);
});

// ── Điểm 3: câu hỏi GỘP phải khai đủ mọi đại lượng nó hỏi ───────────────────────────────────

// Nhánh cơ khí chỉ nhận mô tả 1–4 từ, nên ca này dùng "van bi gia dụng" (3 từ, `coLoaiCongDung`
// đã true) và một ca đi qua hồ sơ mạch — cùng chạm đúng câu hỏi gộp đó.
test('[soát #203-3] khách đã nêu công dụng → câu xin "kích thước hoặc mục đích dùng" không hỏi lại mục đích', () => {
  const r = kiemTraThongTinPhanLoai('van bi gia dụng', { vongHoi: 0 });
  assert.equal(r.canHoi, true, 'chất liệu và kích thước vẫn thiếu → phải hỏi');
  assert.doesNotMatch(r.cauHoi || '', /m[uụ]c\s*[đd][ií]ch\s*d[uù]ng|c[oô]ng\s*d[uụ]ng/i,
    `công dụng khách đã nêu ("gia dụng"), không được hỏi lại: "${r.cauHoi}"`);
  assert.match(r.cauHoi || '', /ch[aấ]t\s*li[eệ]u/i, `vẫn phải hỏi chất liệu: "${r.cauHoi}"`);
  assert.match(r.cauHoi || '', /DN|[đd][uư][oờ]ng\s*k[ií]nh/i, `vẫn phải xin kích thước: "${r.cauHoi}"`);
});

test('[soát #203-3] HỒ SƠ MẠCH đã có công dụng → không hỏi lại mục đích dùng ở câu gộp', () => {
  const r = kiemTraThongTinPhanLoai('van bi', { vongHoi: 0, hoSo: { moTa: 'van bi', congDung: 'đường ống nước' } });
  assert.equal(r.canHoi, true, 'chất liệu và kích thước vẫn thiếu → phải hỏi');
  assert.doesNotMatch(r.cauHoi || '', /m[uụ]c\s*[đd][ií]ch\s*d[uù]ng/i,
    `công dụng đã có trong hồ sơ, không hỏi lại: "${r.cauHoi}"`);
  assert.match(r.cauHoi || '', /ch[aấ]t\s*li[eệ]u/i, `vẫn phải hỏi chất liệu: "${r.cauHoi}"`);
});

// ── Điểm 4: lọc hết câu vì khách đã nêu đủ ≠ khách từ chối trả lời ───────────────────────────

test('[soát #203-4] khách đã nêu đủ → không trả giả định mặc định (đó là chuỗi của ca khách từ chối)', () => {
  const r = kiemTraThongTinPhanLoai('máy sấy sinh tố', { vongHoi: 0, hoSo: { moTa: 'máy sấy sinh tố', thongSo: '350W 220V' } });
  assert.equal(r.canHoi, false, 'đã đủ dữ kiện thì tra luôn');
  assert.equal(r.giaDinh, null,
    `khách đã NÊU đủ, không phải khách từ chối trả lời — không được gán giả định: ${JSON.stringify(r.giaDinh)}`);
});

// ── Điểm 5: đường thật — xuất xứ khách nêu ở lượt trước không được rụng ──────────────────────

const ALL = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt',
  'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien'];
const ML = '11111111-2222-4333-8444-555555555555';
const KQ = { results: [{ hs: '84381000', confidence: 0.8, reason: 'máy chế biến thực phẩm' }] };
const THUE = { results: [{ hsCode: '84381000', nameVi: 'Máy xay', unitVi: 'Cái', taxNkPreferential: 10, taxVat: 8 }] };

function fakeCtx() {
  const script = Object.fromEntries(ALL.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
  script.phan_loai_hs = () => ({ ok: true, data: { maLuot: ML, trangThai: 'XONG', ketQua: KQ } });
  script.ket_qua_phan_loai = () => ({ ok: true, data: { trangThai: 'XONG', ketQua: KQ } });
  script.tra_thue = () => ({ ok: true, data: THUE });
  const store = {};
  const ctx = {
    mcp: fakeMcp(script), tools: new Set(ALL), vision: null, customer: null, history: () => [],
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-10T03:00:00Z'), log: { info() {}, error() {} },
  };
  return { ctx, store, calls: ctx.mcp.calls };
}
let dem = 0;
const turn = (text) => ({ turnId: `t${dem++}`, chatId: 'u1', userId: 'u1', userName: 'Khách', isGroup: false, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-10T03:00:00.000Z', isStaff: false });

test('[soát #203-5] khách nêu nước ở lượt TRƯỚC → lượt sau tra thuế đúng nước đó, không báo giả định', async () => {
  const { ctx, calls } = fakeCtx();
  await hs.handle(turn('máy sấy sinh tố hàng Nhật'), ctx);   // lượt 1: bot hỏi lại thông số
  const r = await hs.handle(turn('350W 220V'), ctx);          // lượt 2: khách đáp, bot chốt mã
  const tin = plain(r.replies.map((x) => x.text).join('\n'));

  const xx = calls.filter((c) => c.name === 'tra_thue').map((c) => c.args.xuatXu);
  assert.deepEqual(xx, ['JP'], `phải tra thuế theo nước khách đã nói ở lượt trước: ${JSON.stringify(xx)}`);
  assert.doesNotMatch(tin, /gi[aả]\s*[đd][iị]nh/i, `khách đã nói nước, không được báo giả định: "${tin.slice(0, 400)}"`);
});

test('[soát #203-5] hỏi nối tiếp "thuế bao nhiêu?" → vẫn giữ nước khách đã nêu trong mạch', async () => {
  const { ctx, calls } = fakeCtx();
  await hs.handle(turn('Tên hàng: máy xay sinh tố gia dụng 350W 220V, hàng từ Nhật'), ctx);
  await hs.handle(turn('thuế bao nhiêu?'), ctx);
  const xx = calls.filter((c) => c.name === 'tra_thue').map((c) => c.args.xuatXu);
  assert.deepEqual([...new Set(xx)], ['JP'], `mọi lượt phải theo nước khách đã nói: ${JSON.stringify(xx)}`);
});

test('[soát #203-5] khách KHÔNG nói nước ở lượt nào → vẫn báo rõ là giả định (giữ yêu cầu 3)', async () => {
  const { ctx, calls } = fakeCtx();
  const r = await hs.handle(turn('Tên hàng: máy xay sinh tố gia dụng 350W 220V'), ctx);
  const tin = plain(r.replies.map((x) => x.text).join('\n'));
  assert.match(tin, /gi[aả]\s*[đd][iị]nh/i, `chưa ai nói nước thì phải nói rõ là giả định: "${tin.slice(0, 400)}"`);
  const xx = calls.filter((c) => c.name === 'tra_thue').map((c) => c.args.xuatXu);
  assert.deepEqual([...new Set(xx)], ['CN'], `vẫn gọi Cổng bằng nước mặc định: ${JSON.stringify(xx)}`);
});
