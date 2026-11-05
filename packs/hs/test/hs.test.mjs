// Gói hs theo contracts/pack.md: cùng hành vi như lib/bot.js cũ, nhưng không chờ việc nền và không tự gửi tin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import { loadPacks } from '../../../core/registry.js';
import hs from '../index.js';
import { availablePackages, menuText, toJob, waitJob, hetHan, WAIT_JOB_MAX_MS } from '../packages.js';
import { createVision } from '../vision.js';
import { plain } from '../style.js';

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
  assert.deepEqual(r.replies, [{ text: `{b}🤖 Bot tra cứu hải quan OZ{/b}\n\n${menuText(availablePackages(ctx.tools), { full: true })}\n\nHoặc cứ gõ mã HS / mô tả hàng, bot tự chọn gói.` }]);
  assert.match(plain(r.replies[0].text), /CHỌN GÓI/); assert.match(plain(r.replies[0].text), /7\. 📄 Hồ sơ giải trình/);
  assert.deepEqual(r.labels, []); assert.deepEqual(r.jobs, []); assert.equal(r.handoff, null);
  assert.equal(plain(hs.footer(ctx)), FOOTER);
  assert.equal(plain(hs.footer({ ...ctx, tools: new Set(['tra_thue', 'phan_loai_hs']) })), '———\n📦 1 Phân loại · 2 Thuế · 0 Tự động · "menu"');
  const c = await hs.handle(turn('2'), ctx);
  assert.match(plain(c.replies[0].text), /^💰 Gói 2: Thuế/); assert.ok(plain(c.replies[0].text).endsWith(FOOTER)); assert.deepEqual(c.labels, []);
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
  const s = plain(r.replies[0].text);
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
  assert.match(plain(r.replies[0].text), /^🔎 \(Tự động chọn gói 1: Phân loại mã HS\)\n\n🔎 Phân loại/);
});

test('mã 8 số → gói 2, kết quả có thuế suất từ Cổng (giữ nguyên test cũ "gói 2")', async () => {
  const { ctx, calls } = fakeCtx({ tra_thue: TAX, tra_thu_tuc_nhap_khau: ERR });
  const r = await hs.handle(turn('84137090'), ctx);
  const s = plain(r.replies[0].text);
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
  assert.match(plain(r.replies[0].text), /So logo/); assert.ok(plain(r.replies[0].text).endsWith(FOOTER));
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
  assert.match(plain(c.replies[0].text), /Mã đề xuất: 8413\.70\.90/);
  assert.deepEqual(c.interests, [{ mon: 'máy bơm nước', hs: '84137090' }]);
});

test('kiểm sâu gói 4 → job ket_qua_soat; "kết quả <mã lượt>" hỏi thẳng Cổng', async () => {
  const { ctx, calls } = fakeCtx({ kiem_ma_to_khai: { ok: true, maLuot: ML, trangThai: 'DANG_XU_LY' }, ket_qua_phan_loai: { ok: true, data: { maDeXuat: '84137090' } } });
  const r = await hs.handle(turn('gói 4 Mã HS: 84137090\nMô tả: Máy bơm\nKiểm sâu: có'), ctx);
  assert.equal(r.jobs[0].resultTool, 'ket_qua_soat'); assert.match(r.replies[0].text, /^⏳ Đang kiểm mô tả với mã HS…/);
  const d = await hs.onJobResult(r.jobs[0], { ok: true, data: { k2: 'khớp' } }, ctx);
  assert.match(plain(d.replies[0].text), /^✅ Kiểm sâu — 8413\.70\.90/); assert.ok(plain(d.replies[0].text).endsWith(FOOTER));
  const k = await hs.handle(turn(`kết quả ${ML}`), ctx);
  assert.deepEqual(calls.at(-1), { name: 'ket_qua_phan_loai', args: { maLuot: ML } });
  assert.match(plain(k.replies[0].text), new RegExp(`^📥 Kết quả lượt ${ML}`)); assert.deepEqual(k.labels, ['tra-cuu-hs']);
});

test('Cổng lỗi → câu báo lỗi tạm thời + menu, không ném, không kèm lỗi gốc (Hiến pháp IX)', async () => {
  const logged = [];
  const { ctx } = fakeCtx({ tra_thue: () => { throw new Error('MCP lỗi HTTP 502'); } });
  ctx.log = { info() {}, error: (m) => logged.push(m) };
  const r = await hs.handle(turn('84137090'), ctx);
  const s = plain(r.replies[0].text);
  assert.match(s, /^⚠️ Cổng tra cứu OZ đang lỗi tạm thời\. Bạn thử lại sau ít phút nhé\./); assert.ok(s.endsWith(FOOTER));
  assert.doesNotMatch(s, /502|MCP lỗi/);
  assert.ok(logged.some((m) => /MCP lỗi HTTP 502/.test(m)));        // chi tiết chỉ vào log
});

const RAW = 'ECONNREFUSED 10.0.0.7:3000 fetch failed';
test('lỗi gốc không lọt ra khách: ảnh lỗi, thủ tục lỗi (gói 2), gói 5 lỗi, kết quả Cổng ok:false', async () => {
  const vision = { readSpecs: async () => { throw new Error(RAW); } };
  const a = await hs.handle(photo(), fakeCtx({}, { vision }).ctx);
  assert.match(a.replies[0].text, /^⚠️ Bot chưa đọc được ảnh này, hoặc gõ tên hàng/);
  const b = await hs.handle(turn('84137090'), fakeCtx({ tra_thue: TAX, tra_thu_tuc_nhap_khau: () => { throw new Error(RAW); } }).ctx);
  const c = await hs.handle(turn('gói 5 8413'), fakeCtx({ tra_chu_giai: () => { throw new Error(RAW); } }).ctx);
  const d = await hs.handle(turn('84137090'), fakeCtx({ tra_thue: TAX, tra_thu_tuc_nhap_khau: ERR }).ctx);
  for (const r of [a, b, c, d]) assert.doesNotMatch(r.replies[0].text, /ECONNREFUSED|10\.0\.0\.7|fetch failed|HTTP 404/, r.replies[0].text);
  assert.match(b.replies[0].text, /Thủ tục[\s\S]*gặp lỗi/);
  assert.match(d.replies[0].text, /Điểm đã được hoàn/);
});

// --- LỖI 1: lỗi Gemini (503 "high demand") KHÔNG được lộ tiếng Anh cho khách ---
test('lỗi Gemini 503 không lộ tiếng Anh; câu tiếng Việt có nêu quá tải', async () => {
  const vision = { readSpecs: async () => { throw Object.assign(new Error('Gemini lỗi 503: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.'), { tamThoi: true }); } };
  const r = await hs.handle(photo(), fakeCtx({}, { vision }).ctx);
  const t = r.replies[0].text;
  assert.doesNotMatch(t, /high demand|temporarily|Please try again|Gemini lỗi 503/i, t);
  assert.match(t, /quá tải/i, t);
  assert.match(t, /gõ tên hàng/, t);
});

// --- LỖI 2: packs/hs/vision.js phải retry + đổi mẫu dự phòng khi Gemini quá tải ---
test('vision: Gemini 503 → thử lại, sang mẫu dự phòng; lỗi khoá thì dừng ngay', async () => {
  const goi = [];
  const ok = JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"tenHang":"Bút bi"}' }] } }] });
  const f = (kichBan) => async (url) => {
    if (url.includes('zdn.vn')) return new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/jpeg' } });
    const m = url.match(/models\/([^:]+):/)[1]; goi.push(m);
    const st = kichBan(m, goi.length);
    return st === 200 ? new Response(ok, { status: 200 }) : new Response(JSON.stringify({ error: { message: 'busy' } }), { status: st });
  };
  const v = createVision({ apiKey: 'K', fetchImpl: f((m) => (m === 'gemini-flash-latest' ? 503 : 200)), retryDelaysMs: [1, 1] });
  assert.equal((await v.readSpecs('https://x.zdn.vn/a.jpg')).tenHang, 'Bút bi');
  assert.deepEqual(goi, ['gemini-flash-latest', 'gemini-flash-latest', 'gemini-flash-latest', 'gemini-flash-lite-latest']);
  goi.length = 0;
  const v2 = createVision({ apiKey: 'K', fetchImpl: f((m, n) => (n === 1 ? 503 : 200)), retryDelaysMs: [1, 1] });
  await v2.readSpecs('https://x.zdn.vn/a.jpg');
  assert.deepEqual(goi, ['gemini-flash-latest', 'gemini-flash-latest']);
  goi.length = 0;
  const v3 = createVision({ apiKey: 'K', fetchImpl: f(() => 403), retryDelaysMs: [1, 1] });
  await assert.rejects(v3.readSpecs('https://x.zdn.vn/a.jpg'), (e) => e.status === 403 && !e.tamThoi);
  assert.equal(goi.length, 1, 'lỗi khoá không được thử lại');
});

// --- LỖI 4: timeout 4 phút khi Cổng xong sau 45s → bot phải trả kết quả, không báo hết hạn ---
test('waitJob: Cổng xong sau vài chặng poll → trả kết quả, KHÔNG báo "hết hạn 4 phút"', async () => {
  let n = 0;
  const ctx = {
    pollMs: 1,
    notify: async () => {},
    mcp: { callTool: async () => ({ ok: true, trangThai: ++n < 3 ? 'DANG_XU_LY' : 'XONG', data: { maDeXuat: '84145949' } }) },
  };
  const r = await waitJob(ctx, { ok: true, maLuot: ML, trangThai: 'DANG_XU_LY' }, 'ket_qua_phan_loai');
  assert.equal(r.trangThai, 'XONG', 'phải trả kết quả thật');
  assert.equal(r.data.maDeXuat, '84145949');
  assert.doesNotMatch(JSON.stringify(r), /Chưa có kết quả sau|4 phút/);
});

test('waitJob: quá hạn → câu hỏi lại có MÃ LƯỢT và số phút đúng', async () => {
  const ctx = {
    pollMs: 1, notify: async () => {},
    mcp: { callTool: async () => ({ ok: true, trangThai: 'DANG_XU_LY' }) },
  };
  const r = await waitJob(ctx, { ok: true, maLuot: ML, trangThai: 'DANG_XU_LY' }, 'ket_qua_phan_loai', { maxMs: 20 });
  assert.match(r.thongBao, new RegExp(`kết quả ${ML}`), 'phải nêu cách hỏi lại');
  assert.match(r.thongBao, /Chưa có kết quả sau/);
});

test('waitJob: MCP lỗi giữa lúc chờ → không hủy lượt, thử lại và vẫn trả kết quả', async () => {
  let n = 0;
  const ctx = {
    pollMs: 1, notify: async () => {},
    mcp: { callTool: async () => {
      n++;
      if (n === 1) throw new Error('MCP lỗi HTTP 502');            // lỗi mạng giữa lúc chờ
      if (n === 2) throw new Error('MCP lỗi HTTP 502');
      return { ok: true, trangThai: 'XONG', data: { maDeXuat: '84145949' } };
    } },
  };
  const r = await waitJob(ctx, { ok: true, maLuot: ML, trangThai: 'DANG_XU_LY' }, 'ket_qua_phan_loai');
  assert.equal(r.trangThai, 'XONG', 'lỗi MCP tạm không được làm hỏng lượt');
  assert.equal(r.data.maDeXuat, '84145949');
  assert.ok(n >= 3, `phải thử lại sau lỗi (số lần gọi: ${n})`);
});

test('waitJob: ngưỡng chờ mặc định đủ dài cho Cổng (đo thực tế 150s, có lúc 45s)', async () => {
  // Đo thực tế Cổng OZ (2026-11-05): 45s / 150s / 1s → ngưỡng mặc định phải ≥10 phút.
  assert.ok(WAIT_JOB_MAX_MS >= 10 * 60_000, `ngưỡng mặc định phải ≥10 phút, hiện ${WAIT_JOB_MAX_MS / 60000} phút`);
  // Câu hết hạn phải nói đúng số phút của ngưỡng mặc định (không phải 4).
  const r = hetHan(ML);
  const soPhut = Number(r.thongBao.match(/sau (\d+) phút/)?.[1] || 0);
  assert.equal(soPhut, WAIT_JOB_MAX_MS / 60000, `câu hết hạn phải nói ${WAIT_JOB_MAX_MS / 60000} phút, hiện: "${r.thongBao}"`);
  assert.match(r.thongBao, new RegExp(`kết quả ${ML}`));
});

// --- LỖI 3: tiêu đề phân loại KHÔNG được cắt cụt giữa chữ ---
test('tiêu đề phân loại không bị cắt cụt giữa chừng', async () => {
  const ten = 'Quạt tản nhiệt AF12038B22HR công suất 10W điện áp 100-240VAC lưu lượng gió 127CFM 3.6m3/h kích thước 120 x 120 x 38 mm chất liệu nhựa dùng cho tủ điện mới 100%';
  const { ctx } = fakeCtx({ phan_loai_hs: { ok: true, data: { maDeXuat: '84145949' } } });
  const r = await hs.handle(turn(`gói 1 Tên hàng: ${ten}`), ctx);
  const t = r.replies[0].text;
  // Cắt cụt ở 120 ký tự sẽ cho ra "...120 x 120 x 38 mm c" (dấu phẩy + chữ đơn)
  assert.doesNotMatch(t, /mm c["”]?\s*$/m, 'tiêu đề bị cắt giữa chừng');
  assert.match(t, /8414\.59\.49/);
});

test('việc nền hết hạn: câu "30 phút" + cách hỏi lại "kết quả <mã lượt>" vẫn hiện', async () => {
  const { ctx } = fakeCtx();
  const d = await hs.onJobResult({ maLuot: ML, resultTool: 'ket_qua_phan_loai', context: { goi: 1 } }, null, ctx);
  assert.match(d.replies[0].text, /Chưa có kết quả sau 30 phút/);
  assert.match(d.replies[0].text, new RegExp(`kết quả ${ML}`));
});

test('lỗi nghiệp vụ của Cổng (gọi thành công, ok:false) vẫn hiện; lỗi truyền tải và chữ lộ nội bộ thì ẩn', async () => {
  const biz = { ok: false, loi: 'KHONG_TIM_THAY', thongBao: 'Mã 99999999 không tồn tại trong biểu thuế' };
  const a = await hs.handle(turn('99999999'), fakeCtx({ tra_thue: biz, tra_thu_tuc_nhap_khau: biz }).ctx);
  assert.match(a.replies[0].text, /Mã 99999999 không tồn tại trong biểu thuế/);
  const b = await hs.handle(turn('84137090'), fakeCtx({ tra_thue: TAX, tra_thu_tuc_nhap_khau: () => { throw new Error('MCP lỗi HTTP 502'); } }).ctx);
  assert.doesNotMatch(b.replies[0].text, /MCP lỗi|502/);
  assert.match(b.replies[0].text, /Cổng tra cứu gặp lỗi ở mục này/);
  const leak = { ok: false, thongBao: 'Lỗi xử lý tại /app/core/x.js:12:3' };
  const c = await hs.handle(turn('84137090'), fakeCtx({ tra_thue: TAX, tra_thu_tuc_nhap_khau: leak }).ctx);
  assert.doesNotMatch(c.replies[0].text, /x\.js|\/app\//);
  // phân loại trả LOI (dòng 164) và không có kết quả (dòng 199): câu nghiệp vụ hiện, câu lộ thì ẩn
  const d = await hs.handle(turn('gói 1 Tên hàng: bơm'), fakeCtx({ phan_loai_hs: { ok: true, data: { trangThai: 'LOI', thongBao: 'Mô tả quá ngắn để phân loại' } } }).ctx);
  assert.match(d.replies[0].text, /Mô tả quá ngắn để phân loại/);
  const e = await hs.handle(turn('gói 1 Tên hàng: bơm'), fakeCtx({ phan_loai_hs: { ok: true, data: { trangThai: 'LOI', thongBao: 'MCP lỗi HTTP 500 at handler (/app/x.js:1:2)' } } }).ctx);
  assert.doesNotMatch(e.replies[0].text, /HTTP 500|x\.js/);
  const f = await hs.handle(turn('gói 1 Tên hàng: bơm'), fakeCtx({ phan_loai_hs: { ok: true, data: { trangThai: 'XONG', thongBao: 'fetch failed ECONNREFUSED 10.0.0.7:3000' } } }).ctx);
  assert.doesNotMatch(f.replies[0].text, /ECONNREFUSED|10\.0\.0\.7/);
});
