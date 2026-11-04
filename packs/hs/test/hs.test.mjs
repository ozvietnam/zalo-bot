// Gói hs theo contracts/pack.md: cùng hành vi như lib/bot.js cũ, nhưng không chờ việc nền và không tự gửi tin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import { loadPacks } from '../../../core/registry.js';
import hs from '../index.js';
import { availablePackages, menuText, toJob } from '../packages.js';

const ALL = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt',
  'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien'];
const TAX = { ok: true, data: { hsCode: '84137090', nameVi: '- - Loại khác', unitVi: 'chiếc', taxNkPreferential: '0', taxNkTt: '15',
  acfta: { forOrigin: { origin: 'CN', eligible: false, rate: null } }, taxVat: '8/10',
  warnings: { summary: 'Kiểm tra hiệu suất năng lượng.', severity: 'MEDIUM' } }, chiPhi: { diem: 0 } };
const ERR = { ok: false, loi: 'BACKEND_LOI', thongBao: 'Hệ thống tra cứu HS gặp lỗi (HTTP 404) | EN: The data service returned an error.', diemDaHoan: true };
const FOOTER = '———\n📦 1 Phân loại · 2 Thuế · 3 Mô tả · 4 Kiểm tra · 5 Luật · 6 Nhãn hiệu · 7 Giải trình · 0 Tự động · "menu"';
const ML = '11111111-2222-4333-8444-555555555555';

/** ctx giả: MCP có đủ 16 công cụ (mặc định trả {ok, data}), phiên là object thường, get() trả bản sao để bắt lỗi ghi thẳng. */
function fakeCtx(overrides = {}, { vision = null } = {}) {
  const script = Object.fromEntries(ALL.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
  for (const [k, v] of Object.entries(overrides)) script[k] = typeof v === 'function' ? v : () => v;
  const store = {};
  const ctx = {
    mcp: fakeMcp(script), tools: new Set(ALL), vision, customer: null, history: () => [],
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-04T03:00:00Z'), log: { info() {}, error() {} },
  };
  return { ctx, store, calls: ctx.mcp.calls };
}
const turn = (text, extra = {}) => ({ turnId: 't', chatId: 'u1', userId: 'u1', userName: 'Tuấn', isGroup: false, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-04T03:00:00.000Z', isStaff: false, ...extra });
const photo = (caption = null) => turn(null, { photoUrl: 'https://photo-stal-14.zdn.vn/no/jpg/abc.jpg', caption });

test('manifest: id hs, fallback (match luôn true), registry nạp được từ packs/', async () => {
  assert.deepEqual({ id: hs.id, ten: hs.ten, version: hs.version, audience: hs.audience, moneyCheck: hs.moneyCheck, requiresTools: hs.requiresTools, priority: hs.priority },
    { id: 'hs', ten: 'Tra cứu hải quan', version: '1.0.0', audience: 'public', moneyCheck: false, requiresTools: [], priority: 0 });
  assert.equal(hs.match(turn('bất kỳ'), fakeCtx().ctx), true);
  assert.ok((await loadPacks('packs')).some((p) => p.id === 'hs'));
});

test('toJob: DANG_XU_LY → { job }, còn lại → { result }', () => {
  assert.deepEqual(toJob({ ok: true, maLuot: ML, trangThai: 'DANG_XU_LY' }, 'ket_qua_phan_loai'), { job: { maLuot: ML, resultTool: 'ket_qua_phan_loai' } });
  assert.deepEqual(toJob({ ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } }, 'ket_qua_soat'), { job: { maLuot: ML, resultTool: 'ket_qua_soat' } });
  const done = { ok: true, trangThai: 'XONG' };
  assert.deepEqual(toJob(done, 'ket_qua_phan_loai'), { result: done });
  assert.deepEqual(toJob({ ok: true, maLuot: ML, trangThai: 'DANG_XU_LY' }, 'ket_qua_phan_loai', { tools: new Set() }).job, undefined);
});

test('menu: đúng chữ menu cũ, không gắn nhãn; footer = menuText(availablePackages(tools))', async () => {
  const { ctx } = fakeCtx();
  const r = await hs.handle(turn('xin chào'), ctx);
  assert.deepEqual(r.replies, [{ text: `🤖 Bot tra cứu hải quan OZ\n\n${menuText(availablePackages(ctx.tools), { full: true })}\n\nHoặc cứ gõ mã HS / mô tả hàng, bot tự chọn gói.` }]);
  assert.match(r.replies[0].text, /CHỌN GÓI/); assert.match(r.replies[0].text, /7\. 📄 Hồ sơ giải trình/);
  assert.deepEqual(r.labels, []); assert.deepEqual(r.jobs, []); assert.equal(r.handoff, null);
  assert.equal(hs.footer(ctx), FOOTER);
  assert.equal(hs.footer({ ...ctx, tools: new Set(['tra_thue', 'phan_loai_hs']) }), '———\n📦 1 Phân loại · 2 Thuế · 0 Tự động · "menu"');
  const c = await hs.handle(turn('2'), ctx);
  assert.match(c.replies[0].text, /^💰 Gói 2: Thuế/); assert.ok(c.replies[0].text.endsWith(FOOTER)); assert.deepEqual(c.labels, []);
});

test('phan_loai_hs trả DANG_XU_LY → handle trả jobs [{maLuot, resultTool:"ket_qua_phan_loai"}] và 1 câu "⏳"', async () => {
  const { ctx, calls } = fakeCtx({ phan_loai_hs: { ok: true, maLuot: ML, trangThai: 'DANG_XU_LY' } });
  const r = await hs.handle(turn('Tên hàng: máy bơm nước ly tâm\nChất liệu: gang\nThông số: công suất 1.5HP, điện áp 220V'), ctx);
  assert.deepEqual(calls, [{ name: 'phan_loai_hs', args: { tenHang: 'máy bơm nước ly tâm', chatLieu: 'gang', thongSo: { 'công suất': '1.5HP', 'điện áp': '220V' }, nguonThongSo: 'CHU' } }]);
  assert.deepEqual(r.replies, [{ text: '⏳ Đang phân loại mã HS… thường mất 1–3 phút, bot sẽ gửi kết quả ngay khi xong.' }]);
  assert.equal(r.jobs.length, 1);
  assert.equal(r.jobs[0].maLuot, ML); assert.equal(r.jobs[0].resultTool, 'ket_qua_phan_loai');
  assert.deepEqual(r.labels, ['tra-cuu-hs']);
  assert.deepEqual(r.interests, [{ mon: 'máy bơm nước ly tâm' }]);
});

test('onJobResult(job, {trangThai:"XONG", ...}) → reply có mã HS gợi ý (dùng renderClassify như cũ); gói 3 dùng lại mã + mã lượt', async () => {
  const { ctx, store, calls } = fakeCtx({ phan_loai_hs: { ok: true, maLuot: ML, trangThai: 'DANG_XU_LY' },
    sinh_mo_ta_khai_bao: { ok: true, data: { moTaEcus: 'Máy bơm nước ly tâm, mới 100%' } } });
  await hs.handle(turn('1'), ctx);
  const { jobs: [job] } = await hs.handle(turn('Tên hàng: máy bơm nước ly tâm\nChất liệu: gang'), ctx);
  const r = await hs.onJobResult(job, { ok: true, trangThai: 'XONG', data: { maDeXuat: '84137090', lyDo: 'Bơm ly tâm' } }, ctx);
  const s = r.replies[0].text;
  assert.equal(r.replies.length, 1);
  assert.match(s, /^🔎 Phân loại: "máy bơm nước ly tâm"/);                 // đã chọn gói 1 → không có dòng "Tự động chọn gói"
  assert.match(s, /Mã đề xuất: 8413\.70\.90/); assert.match(s, /gõ "2" để xem thuế/); assert.ok(s.endsWith(FOOTER));
  assert.deepEqual(r.labels, ['tra-cuu-hs']); assert.deepEqual(r.interests, [{ mon: 'máy bơm nước ly tâm', hs: '84137090' }]);
  assert.deepEqual(store.last, { tenHang: 'máy bơm nước ly tâm', maHs: '84137090', maLuotPhanLoai: ML });
  await hs.handle(turn('3'), ctx);
  await hs.handle(turn('Thương hiệu: Pentax\nXuất xứ: Trung Quốc'), ctx);
  const mt = calls.find((c) => c.name === 'sinh_mo_ta_khai_bao').args;
  assert.equal(mt.maHs, '84137090'); assert.equal(mt.tenHang, 'máy bơm nước ly tâm'); assert.equal(mt.maLuotPhanLoai, ML);
  assert.equal(mt.thuongHieu, 'Pentax'); assert.equal(mt.xuatXu, 'CN');
});

test('onJobResult tự động chọn gói giữ dòng đầu "Tự động chọn gói 1" như cũ', async () => {
  const { ctx } = fakeCtx({ phan_loai_hs: { ok: true, maLuot: ML, trangThai: 'DANG_XU_LY' } });
  const { jobs: [job] } = await hs.handle(turn('máy bơm nước ly tâm 1.5HP'), ctx);
  const r = await hs.onJobResult(job, { ok: true, trangThai: 'XONG', data: { maDeXuat: '84137090' } }, ctx);
  assert.match(r.replies[0].text, /^🔎 \(Tự động chọn gói 1: Phân loại mã HS\)\n\n🔎 Phân loại/);
});

test('mã 8 số → gói 2, kết quả có thuế suất từ Cổng (giữ nguyên test cũ "gói 2")', async () => {
  const { ctx, calls } = fakeCtx({ tra_thue: TAX, tra_thu_tuc_nhap_khau: ERR });
  const r = await hs.handle(turn('84137090'), ctx);
  const s = r.replies[0].text;
  assert.deepEqual(calls.map((c) => c.name).sort(), ['tra_thu_tuc_nhap_khau', 'tra_thue']);
  assert.deepEqual(calls.find((c) => c.name === 'tra_thue').args, { maHs: '84137090', xuatXu: 'CN' });
  assert.match(s, /Tự động chọn gói 2/);
  assert.match(s, /KHÔNG được hưởng → áp MFN/);
  assert.match(s, /Thủ tục[\s\S]*gặp lỗi/);
  assert.match(s, /📦 1 Phân loại · 2 Thuế · 3 Mô tả/);
  assert.deepEqual(r.jobs, []); assert.deepEqual(r.labels, ['tra-cuu-hs']); assert.deepEqual(r.interests, [{ hs: '84137090' }]);
  assert.equal(r.evidence.length, 2);
});

test('ảnh: gói 6 → kiem_tra_shtt_anh với link ảnh Zalo', async () => {
  const { ctx, calls, store } = fakeCtx({ kiem_tra_shtt_anh: { ok: true, data: { ketQua: [{ ten: 'NIKE', diem: 0.91 }] } } });
  await hs.handle(turn('6'), ctx);
  assert.equal(store.goi, 6);
  const r = await hs.handle(photo(), ctx);
  assert.deepEqual(calls, [{ name: 'kiem_tra_shtt_anh', args: { urlAnh: 'https://photo-stal-14.zdn.vn/no/jpg/abc.jpg' } }]);
  assert.match(r.replies[0].text, /So logo/); assert.ok(r.replies[0].text.endsWith(FOOTER));
  assert.deepEqual(r.labels, ['tra-cuu-hs']);
});

test('ảnh: chưa bật Gemini → hướng dẫn; có Gemini → "ok" → phan_loai_hs nguồn ẢNH', async () => {
  const none = await hs.handle(photo(), fakeCtx().ctx);
  assert.match(none.replies[0].text, /chưa bật đọc thông số từ ảnh/); assert.match(none.replies[0].text, /gõ "6"/);
  const vision = { readSpecs: async (url, cap) => { assert.match(url, /zdn\.vn/); assert.equal(cap, 'cảm biến');
    return { tenHang: 'Cảm biến tiệm cận', model: 'F3C-05KS01', thongSo: { 'Khoảng cách': '1 mm' }, khongChac: ['chất liệu vỏ'] }; } };
  const { ctx, calls } = fakeCtx({ phan_loai_hs: { ok: true, data: { maDeXuat: '85365099' } } }, { vision });
  const a = await hs.handle(photo('cảm biến'), ctx);
  assert.match(a.replies[0].text, /Tên hàng: Cảm biến tiệm cận\nModel: F3C-05KS01\nThông số: Khoảng cách: 1 mm/);
  assert.match(a.replies[0].text, /gõ "ok"/); assert.equal(calls.length, 0); assert.deepEqual(a.labels, []);
  const b = await hs.handle(turn('ok'), ctx);
  assert.deepEqual(calls[0], { name: 'phan_loai_hs', args: { tenHang: 'Cảm biến tiệm cận', thongSo: { 'Khoảng cách': '1 mm', Model: 'F3C-05KS01' }, nguonThongSo: 'ANH' } });
  assert.match(b.replies[0].text, /8536\.50\.99/);
  assert.deepEqual(b.interests, [{ mon: 'Cảm biến tiệm cận', hs: '85365099' }]);
});

test('CAN_DU_KIEN → người dùng trả lời → bo_sung_du_kien đúng mã lượt → job → onJobResult', async () => {
  const MB = '99999999-2222-4333-8444-555555555555';
  const { ctx, calls, store } = fakeCtx({
    phan_loai_hs: { ok: true, data: { maLuot: MB, trangThai: 'CAN_DU_KIEN', hoi: [{ questionVi: 'Bơm ly tâm hay bơm piston?' }],
      ketQua: { status: 'NEED_FACTS', results: [{ hs: '84137090', reason: 'Nếu là bơm ly tâm.' }, { hs: '84135090', reason: 'Nếu là bơm piston.' }] } } },
    bo_sung_du_kien: { ok: true, maLuot: MB, trangThai: 'DANG_XU_LY' },
  });
  const a = await hs.handle(turn('máy bơm nước'), ctx);
  assert.match(a.replies[0].text, /Bơm ly tâm hay bơm piston/); assert.match(a.replies[0].text, /không trừ điểm thêm/);
  assert.deepEqual(store.choBoSung, { maLuot: MB, tenHang: 'máy bơm nước' });
  const b = await hs.handle(turn('bơm ly tâm, cánh gang'), ctx);
  assert.equal(calls.filter((c) => c.name === 'phan_loai_hs').length, 1);
  assert.deepEqual(calls.at(-1), { name: 'bo_sung_du_kien', args: { maLuot: MB, boSung: 'bơm ly tâm, cánh gang' } });
  assert.deepEqual(b.replies, [{ text: '⏳ Đã nhận dữ kiện bổ sung, đang phân loại lại… thường mất 1–3 phút, bot sẽ gửi kết quả ngay khi xong.' }]);
  assert.equal(b.jobs[0].maLuot, MB); assert.equal(b.jobs[0].resultTool, 'ket_qua_phan_loai');
  assert.equal(store.choBoSung, null);
  const c = await hs.onJobResult(b.jobs[0], { ok: true, trangThai: 'XONG', data: { maDeXuat: '84137090' } }, ctx);
  assert.match(c.replies[0].text, /Mã đề xuất: 8413\.70\.90/);
  assert.deepEqual(c.interests, [{ mon: 'máy bơm nước', hs: '84137090' }]);
});

test('kiểm sâu gói 4 → job ket_qua_soat; "kết quả <mã lượt>" hỏi thẳng Cổng', async () => {
  const { ctx, calls } = fakeCtx({ kiem_ma_to_khai: { ok: true, maLuot: ML, trangThai: 'DANG_XU_LY' }, ket_qua_phan_loai: { ok: true, data: { maDeXuat: '84137090' } } });
  const r = await hs.handle(turn('gói 4 Mã HS: 84137090\nMô tả: Máy bơm\nKiểm sâu: có'), ctx);
  assert.equal(r.jobs[0].resultTool, 'ket_qua_soat'); assert.match(r.replies[0].text, /^⏳ Đang kiểm mô tả với mã HS…/);
  const d = await hs.onJobResult(r.jobs[0], { ok: true, data: { k2: 'khớp' } }, ctx);
  assert.match(d.replies[0].text, /^✅ Kiểm sâu — 8413\.70\.90/); assert.ok(d.replies[0].text.endsWith(FOOTER));
  const k = await hs.handle(turn(`kết quả ${ML}`), ctx);
  assert.deepEqual(calls.at(-1), { name: 'ket_qua_phan_loai', args: { maLuot: ML } });
  assert.match(k.replies[0].text, new RegExp(`^📥 Kết quả lượt ${ML}`)); assert.deepEqual(k.labels, ['tra-cuu-hs']);
});

test('Cổng lỗi → câu báo lỗi tạm thời + menu (như cũ), không ném', async () => {
  const { ctx } = fakeCtx({ tra_thue: () => { throw new Error('MCP lỗi HTTP 502'); } });
  const r = await hs.handle(turn('84137090'), ctx);
  assert.match(r.replies[0].text, /^⚠️ Cổng tra cứu OZ đang lỗi tạm thời \(MCP lỗi HTTP 502\)/); assert.ok(r.replies[0].text.endsWith(FOOTER));
});
