// packs/hs/test/ky-luat-hoi.test.mjs — KỶ LUẬT HỎI (yêu cầu 2 của issue #177).
//
// Luật CEO 10/11 (chép từ erp-xnk `portal-review-questions.ts`, spec
// `docs/superpowers/specs/2026-10-24-ky-luat-hoi-chi-hoi-dieu-may-khong-tu-xac-dinh-duoc-design.md`):
//   1. máy TỰ XÁC ĐỊNH tối đa từ dữ kiện sẵn có TRƯỚC KHI hỏi;
//   2. KHÔNG hỏi lại điều khách đã nêu — trong chữ lượt này, hoặc trong HỒ SƠ MẠCH (#170);
//   3. tối đa 3 câu, gom trong MỘT tin.
//
// Lỗi đo được trước bản vá (bằng chính `kiemTraThongTinPhanLoai`):
//   • "máy sấy sinh tố 350W" → bot vẫn xin "công suất (W) và điện áp" (xin lại 350W khách vừa gõ);
//   • "van bi inox"          → bot vẫn hỏi "chất liệu bằng đồng, inox hay nhựa ạ?";
//   • hồ sơ mạch đã có "Thông số: 350W 220V", tin sau "máy sấy sinh tố" → vẫn bị hỏi cả hai thông số.
// Hỏi lại điều khách vừa nói làm khách nghĩ bot không đọc tin của mình, và kéo thêm một lượt
// hỏi–đáp vô ích trước khi có mã (đúng cái CEO 10/11 phàn nàn: "xử lý hoài vẫn chưa ổn").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kiemTraThongTinPhanLoai } from '../dien-cho-thieu.js';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import hs from '../index.js';
import { plain } from '../style.js';

/** Số câu trong một tin hỏi lại (trần 3 câu của kỷ luật hỏi). */
const soCau = (s) => plain(String(s || '')).split(/[?.!]+\s+/).map((x) => x.trim()).filter(Boolean).length;

test('[#177-2] khách đã nói công suất trong CHÍNH tin đó → không xin lại công suất', () => {
  const r = kiemTraThongTinPhanLoai('máy sấy sinh tố 350W', { vongHoi: 0 });
  assert.equal(r.canHoi, true, 'vẫn phải xác nhận tên gõ nhầm (sấy ↔ xay)');
  assert.deepEqual(r.thieu, ['dienAp'], `chỉ còn thiếu điện áp, đang là ${JSON.stringify(r.thieu)}`);
  assert.doesNotMatch(r.cauHoi, /công\s*suất/i, `không được xin lại công suất khách vừa gõ: "${r.cauHoi}"`);
  assert.match(r.cauHoi, /điện\s*áp/i, `vẫn phải xin điện áp: "${r.cauHoi}"`);
  assert.match(r.cauHoi, /máy xay sinh tố/i, 'vẫn phải xác nhận tên món');
});

test('[#177-2] khách đã nói điện áp → không xin lại điện áp, chỉ xin công suất', () => {
  const r = kiemTraThongTinPhanLoai('máy sấy sinh tố 220V', { vongHoi: 0 });
  assert.equal(r.canHoi, true);
  assert.deepEqual(r.thieu, ['congSuat'], `chỉ còn thiếu công suất, đang là ${JSON.stringify(r.thieu)}`);
  assert.doesNotMatch(r.cauHoi, /điện\s*áp/i, `không được xin lại điện áp khách vừa gõ: "${r.cauHoi}"`);
  assert.match(r.cauHoi, /công\s*suất/i, `vẫn phải xin công suất: "${r.cauHoi}"`);
});

test('[#177-2] khách đã nói chất liệu ("van bi inox") → không hỏi lại chất liệu', () => {
  const r = kiemTraThongTinPhanLoai('van bi inox', { vongHoi: 0 });
  assert.equal(r.canHoi, true, 'còn thiếu kích thước/quy cách nên vẫn hỏi một câu');
  assert.ok(!r.thieu.includes('chatLieu'), `chất liệu khách đã nêu, đang là ${JSON.stringify(r.thieu)}`);
  assert.doesNotMatch(r.cauHoi, /ch[aấ]t\s*li[eệ]u/i, `không được hỏi lại chất liệu: "${r.cauHoi}"`);
  assert.doesNotMatch(r.cauHoi, /inox/i, `không được đọc lại danh sách chất liệu: "${r.cauHoi}"`);
  assert.match(r.cauHoi, /(k[ií]ch\s*th[uư][oơ]c|đường\s*k[ií]nh|DN)/i, `vẫn phải xin kích thước: "${r.cauHoi}"`);
});

test('[#177-2] HỒ SƠ MẠCH đã có thông số → không hỏi lại thông số đó', () => {
  // Khách gõ thông số ở tin TRƯỚC (#170: hồ sơ tích luỹ), tin này chỉ gõ tên món.
  // Hồ sơ đã đủ công suất + điện áp → cả hai câu của nhánh "nghi gõ nhầm" bị kỷ luật hỏi lọc hết,
  // nên không còn gì để hỏi. Đúng hành vi cũ của #136 khi khách gõ đủ thông số ngay trong tin
  // ("máy sấy sinh tố 350W 220V" cũng không hỏi): nay dữ kiện trong hồ sơ được tính y như trong chữ.
  //
  // CÒN THIẾU của #177 (yêu cầu 1, nhịp sau): khi thông số đã đủ thì bot vẫn KHÔNG xác nhận tên
  // nghi gõ nhầm ("sấy" ↔ "xay") — tên sai đi thẳng tới Cổng. Sửa chỗ đó phải sửa cùng
  // `xuLyTraLoiHoiLai` (nó dựng lại mô tả tra cứu từ `tenGoiY`, mất thông số khách đã gõ), nên
  // không gộp vào nhịp này.
  const hoSo = { moTa: 'máy sấy sinh tố', thongSo: '350W 220V' };
  const r = kiemTraThongTinPhanLoai('máy sấy sinh tố', { vongHoi: 0, hoSo });
  assert.deepEqual(r.thieu, [], `thông số đã có trong hồ sơ, đang là ${JSON.stringify(r.thieu)}`);
  assert.doesNotMatch(r.cauHoi || '', /công\s*suất/i, `không được hỏi lại điều khách đã nêu: "${r.cauHoi}"`);
  assert.doesNotMatch(r.cauHoi || '', /điện\s*áp/i, `không được hỏi lại điều khách đã nêu: "${r.cauHoi}"`);
  // Và khi đã đủ dữ kiện thì tra luôn, không treo khách ở một lượt hỏi rỗng (Điều II).
  assert.equal(r.canHoi, false);
});

test('[#177-2] HỒ SƠ MẠCH đã có chất liệu → van bi không bị hỏi lại chất liệu', () => {
  const r = kiemTraThongTinPhanLoai('van bi', { vongHoi: 0, hoSo: { moTa: 'van bi', chatLieu: 'inox 304' } });
  assert.ok(!r.thieu.includes('chatLieu'), `chất liệu đã có trong hồ sơ, đang là ${JSON.stringify(r.thieu)}`);
  assert.doesNotMatch(r.cauHoi || '', /ch[aấ]t\s*li[eệ]u/i, `không được hỏi lại chất liệu: "${r.cauHoi}"`);
});

test('[#177-2] hồ sơ đã đủ mọi điều cần hỏi + tên không nghi gõ nhầm → KHÔNG hỏi, tra luôn', () => {
  const r = kiemTraThongTinPhanLoai('máy bơm nước', { vongHoi: 0, hoSo: { moTa: 'máy bơm nước', thongSo: '1.5HP 220V' } });
  assert.equal(r.canHoi, false, 'máy đã tự xác định đủ từ hồ sơ thì không được hỏi thêm lượt nào');
});

test('[#177-2] trần 3 câu, gom trong MỘT tin', () => {
  const mau = ['máy sấy sinh tố', 'máy sấy sinh tố 350W', 'van bi', 'van bi inox', 'ống thép', 'nồi chiên',
    'quạt điện', 'máy bơm nước', 'máy sấy thực phẩm'];
  for (const m of mau) {
    const r = kiemTraThongTinPhanLoai(m, { vongHoi: 0 });
    if (!r.canHoi) continue;
    assert.ok(soCau(r.cauHoi) <= 3, `"${m}": ${soCau(r.cauHoi)} câu > trần 3 — "${r.cauHoi}"`);
    assert.doesNotMatch(r.cauHoi, /\n/, `"${m}": phải gom trong MỘT tin, không xuống dòng`);
  }
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

test('[#177-2] đường thật: khách nói thông số ở tin trước → tin sau KHÔNG bị hỏi lại thông số', async () => {
  const { ctx } = fakeCtx();
  await hs.handle(turn('Thông số: 350W 220V'), ctx);
  const r = await hs.handle(turn('máy sấy sinh tố'), ctx);
  const tin = plain(r.replies.map((x) => x.text).join('\n'));
  assert.doesNotMatch(tin, /công\s*suất/i, `thông số đã có trong hồ sơ mạch, không được hỏi lại: "${tin}"`);
  assert.doesNotMatch(tin, /điện\s*áp/i, `thông số đã có trong hồ sơ mạch, không được hỏi lại: "${tin}"`);
});

test('[#177-2] đường thật: thiếu hẳn thông số thì VẪN hỏi (không làm hỏng #136)', async () => {
  const { ctx, calls } = fakeCtx();
  const r = await hs.handle(turn('Tra hs máy sấy sinh tố'), ctx);
  const tin = plain(r.replies.map((x) => x.text).join('\n'));
  assert.match(tin, /máy xay sinh tố/i, 'phải xác nhận tên gõ nhầm');
  assert.match(tin, /(công\s*suất|điện\s*áp)/i, 'phải xin thông số còn thiếu');
  assert.ok(soCau(tin) <= 3, `trần 3 câu, đang ${soCau(tin)} câu: "${tin}"`);
  assert.equal(calls.filter((c) => c.name === 'phan_loai_hs').length, 0, 'chưa đủ dữ kiện thì chưa gọi Cổng');
});
