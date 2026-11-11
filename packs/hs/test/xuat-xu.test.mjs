// Xuất xứ KHÔNG mặc định im lặng (issue #177, yêu cầu 3).
//
// Lỗi: khách chưa hề nói nước nào thì code vẫn lấy `'CN'` làm mặc định
// (`packs/hs/packages.js` các dòng `findCountryInText(...) || 'CN'`) rồi IN RA như một sự thật:
// "💰 Thuế suất (xuất xứ CN)". Khách đọc tưởng bot đã biết hàng từ Trung Quốc.
//
// Hai điều của hiến pháp bị chạm:
//   • Điều III (số tiền do code tra): mức thuế ACFTA/MFN in ra phụ thuộc xuất xứ. Giả định ngầm
//     một nước là in ra một con số thuế không có căn cứ trong lời khách.
//   • Điều VIII (trung thực với khách): không được nói như đã biết điều mình chỉ đang đoán.
//
// Yêu cầu của issue: "bỏ mặc định 'CN'. Khách chưa nói thì hỏi 1 câu trong lượt hỏi lại,
// hoặc ghi rõ 'giả định xuất xứ Trung Quốc' trong kết quả."
// Cách làm ở đây là nhánh thứ hai (ghi rõ giả định) — không thêm một lượt hỏi nữa, vì lượt hỏi
// lại đã có trần 3 câu và kỷ luật "chỉ hỏi điều máy không tự xác định được".
//
// Khách CÓ nói nước ("hàng từ Nhật") thì giữ nguyên như cũ: đó là dữ kiện thật, không phải giả định.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import hs from '../index.js';
import { plain } from '../style.js';
import { renderPhanLoaiDayDu, nhanXuatXu } from '../render.js';
import { renderPhanLoaiGiongQuyen } from '../giong-quyen.js';

const ALL = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt',
  'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien'];
const ML = '11111111-2222-4333-8444-555555555555';

const KQ = { results: [{ hs: '84381000', confidence: 0.8, reason: 'máy chế biến thực phẩm' }] };
const THUE = { results: [{ hsCode: '84381000', nameVi: 'Máy xay', unitVi: 'Cái', taxNkPreferential: 10, taxVat: 8 }] };

/** ctx giả: Cổng trả kết quả ĐÃ CHỐT MÃ (có thuế) để xem phần in xuất xứ. */
function fakeCtx(overrides = {}) {
  const script = Object.fromEntries(ALL.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
  script.phan_loai_hs = () => ({ ok: true, data: { maLuot: ML, trangThai: 'XONG', ketQua: KQ } });
  script.ket_qua_phan_loai = () => ({ ok: true, data: { trangThai: 'XONG', ketQua: KQ } });
  script.tra_thue = () => ({ ok: true, data: THUE });
  for (const [k, v] of Object.entries(overrides)) script[k] = typeof v === 'function' ? v : () => v;
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

test('khách KHÔNG nói xuất xứ → tin không được nói "xuất xứ CN" như sự thật, phải ghi rõ là giả định', async () => {
  const { ctx } = fakeCtx();
  const a = await hs.handle(turn('Tên hàng: máy xay sinh tố gia dụng 350W 220V'), ctx);
  const t = plain(a.replies.map((r) => r.text).join('\n'));

  assert.doesNotMatch(t, /xuất xứ CN(?![^)]*giả định)/i,
    `không được in "xuất xứ CN" trơ như dữ kiện khách đã nói: ${JSON.stringify(t.slice(0, 400))}`);
  assert.match(t, /giả định/i, `phải nói rõ đang giả định xuất xứ: ${JSON.stringify(t.slice(0, 400))}`);
  assert.match(t, /Trung Quốc|CN/i, 'phải cho biết giả định là nước nào');
});

test('khách CÓ nói xuất xứ → giữ nguyên, không gắn chữ "giả định"', async () => {
  const { ctx, calls } = fakeCtx();
  const a = await hs.handle(turn('Tên hàng: máy xay sinh tố gia dụng 350W 220V, hàng từ Nhật'), ctx);
  const t = plain(a.replies.map((r) => r.text).join('\n'));

  assert.doesNotMatch(t, /giả định xuất xứ/i, `khách đã nói nước thì không phải giả định: ${JSON.stringify(t.slice(0, 400))}`);
  const xx = calls.filter((c) => c.name === 'tra_thue').map((c) => c.args.xuatXu);
  assert.deepEqual(xx, ['JP'], `phải tra thuế theo đúng nước khách nói: ${JSON.stringify(xx)}`);
});

test('renderPhanLoaiDayDu: cờ giaDinhXuatXu → dòng thuế nói rõ "giả định xuất xứ"', () => {
  const co = plain(renderPhanLoaiDayDu({ tenHang: 'máy xay', maHs: '84381000', phanLoai: { data: { ketQua: KQ } },
    thue: { data: THUE }, xuatXu: 'CN', giaDinhXuatXu: true }));
  assert.match(co, /giả định xuất xứ/i, `có cờ thì phải nói rõ giả định: ${JSON.stringify(co.slice(0, 300))}`);

  const khong = plain(renderPhanLoaiDayDu({ tenHang: 'máy xay', maHs: '84381000', phanLoai: { data: { ketQua: KQ } },
    thue: { data: THUE }, xuatXu: 'JP', giaDinhXuatXu: false }));
  assert.doesNotMatch(khong, /giả định xuất xứ/i, 'khách đã nói nước thì không gắn chữ giả định');
  assert.match(khong, /xuất xứ JP/i, 'vẫn phải in nước khách đã nói');
});

// Nhãn xuất xứ nằm trong TIÊU ĐỀ khối thuế nên lượt nào cũng in. Hai lượt hỏi thuế liên tiếp cùng
// một mã ("HS 84137090" → "thuế bao nhiêu?") vốn đã giống nhau 0.77, sát ngưỡng 0.8 của lưới chống
// trùng ở cửa gửi (core/gate-decide.js:136). Nhồi thêm một câu dài vào nhãn là đẩy quá ngưỡng và tin
// thứ hai bị BỎ — khách hỏi mà không thấy trả lời. Lỗi này đã xảy ra thật khi làm #177 (test
// test/core/issue-127-group-mention.test.mjs bắt được). Giữ nhãn ngắn; lời mời sửa nước đặt ở dòng riêng.
test('nhãn giả định phải NGẮN — nhồi câu dài vào tiêu đề thuế sẽ bị cửa gửi bỏ vì trùng', async () => {
  const { jaccard } = await import('../../../core/text.js');
  const nhan = nhanXuatXu('CN', true);
  assert.ok(nhan.length <= 32, `nhãn phải ngắn, đang là ${nhan.length} ký tự: ${JSON.stringify(nhan)}`);
  assert.doesNotMatch(nhan, /anh\/chị|cho em biết|\?/i,
    `không đặt lời mời/câu hỏi trong nhãn tiêu đề (lặp mọi lượt → trùng tin): ${JSON.stringify(nhan)}`);

  // Dựng đúng hình hai tin liên tiếp của mạch "hỏi thuế lại": tin sau chỉ thêm dòng tiêu đề chọn gói.
  const than = `@An\n{b}💰 Thuế — 8413.70.90 (${nhan}){/b}\n📦 {b}8413.70.90{/b} — Bơm ly tâm\n`
    + `{b}💰 Thuế suất{/b}\n• NK ưu đãi (MFN): 0%\n• VAT: 10%\n\nGõ {b}"menu"{/b} để xem các gói tra cứu`;
  const sau = `@An\n{b}💰 (Tự động chọn gói 2: Thuế & thủ tục nhập khẩu){/b}\n\n${than.replace('@An\n', '')}`;
  const giong = jaccard(plain(than), plain(sau));
  assert.ok(giong < 0.8, `hai lượt liên tiếp giống ${giong.toFixed(3)} ≥ 0.8 → cửa gửi bỏ tin thứ hai`);
});

test('renderPhanLoaiGiongQuyen: cờ giaDinhXuatXu → nói rõ giả định ở dòng thuế FTA', () => {
  const thueFta = { results: [{ hsCode: '84381000', nameVi: 'Máy xay', taxNkPreferential: 10, taxVat: 8,
    acfta: { forOrigin: { eligible: true, rate: 0, origin: 'CN' } } }] };
  const co = plain(renderPhanLoaiGiongQuyen({ tenHang: 'máy xay', maHs: '84381000', phanLoai: { data: { ketQua: KQ } },
    thue: { data: thueFta }, xuatXu: 'CN', giaDinhXuatXu: true }));
  assert.match(co, /giả định/i, `ưu đãi ACFTA theo nước giả định thì phải nói rõ: ${JSON.stringify(co.slice(0, 400))}`);
});
