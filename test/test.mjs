// node test/test.mjs — kiểm thử không cần mạng (Zalo + Cổng OZ MCP giả lập).
import assert from 'node:assert/strict';
import http from 'node:http';
import { splitText, parseUpdate, safeEqual } from '../channels/zalo-bot.js';
import { createMcpClient, parseSse, unwrapToolResult } from '../lib/mcp.js';
import { route, autoPick } from '../lib/router.js';
import { PACKAGES, availablePackages, menuText, pickHs } from '../lib/packages.js';
import { parseLabeled, firstHs8, soHieuList, countryCode } from '../lib/input.js';
import { renderResult, renderGeneric } from '../lib/render.js';
import { plain } from '../lib/style.js';
import { createBot } from './helpers/legacy-bot.mjs';
import { stripMention, isGroup } from '../core/mention.js';

let pass = 0;
const t = async (name, fn) => { await fn(); pass++; console.log('✓', name); };

// Dữ liệu mẫu theo đúng dạng Cổng OZ trả (lấy từ lượt gọi thật tim_ma_hs ngày 03/11/2026)
const SEARCH = { ok: true, data: { results: [
  { hsCode: '84131910', nameVi: '- - - Hoạt động bằng điện', taxNkPreferential: '3', taxAcftaChina: { origin: 'CN', eligible: true, rate: 0 }, taxVat: '8/10' },
  { hsCode: '84132010', nameVi: '- - Bơm nước', taxNkPreferential: '20', taxAcftaChina: { origin: 'CN', eligible: true, rate: 0 }, taxVat: '8/10' },
], confusionAlerts: [{ warningVi: 'Khai 8413.81 hoặc 8501 cho bơm nước ly tâm điện → rủi ro ấn định 8413.70' }] },
nguon: [{ backend: 'hs-code-api' }], chiPhi: { diem: 0 }, canhBao: [] };
const TAX = { ok: true, data: { hsCode: '84137090', nameVi: '- - Loại khác', unitVi: 'chiếc', taxNkPreferential: '0', taxNkTt: '15',
  acfta: { forOrigin: { origin: 'CN', eligible: false, rate: null } }, taxVat: '8/10',
  warnings: { summary: 'Kiểm tra hiệu suất năng lượng.', severity: 'MEDIUM' } }, chiPhi: { diem: 0 } };
const ERR = { ok: false, loi: 'BACKEND_LOI', thongBao: 'Hệ thống tra cứu HS gặp lỗi (HTTP 404) | EN: The data service returned an error.', diemDaHoan: true };
const ALL_TOOLS = new Set(['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt', 'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien']);

function fakeMcp(handlers = {}, tools = ALL_TOOLS) {
  const calls = [];
  return {
    calls,
    listTools: async () => [...tools].map((name) => ({ name })),
    callTool: async (name, args) => { calls.push([name, args]); const h = handlers[name]; return typeof h === 'function' ? h(args) : (h ?? { ok: true, data: { ketQua: `ok ${name}` } }); },
  };
}
function fakeZalo() {
  // sent: tin nhắn như NGƯỜI DÙNG THẤY (thẻ định dạng đã bỏ); raw: bản gốc có thẻ.
  const sent = [];
  const raw = [];
  return { sent, raw, sendText: async (c, x) => { raw.push([c, x]); sent.push([c, plain(x)]); }, sendChatAction: () => {} };
}
const dm = (text, id) => ({ ok: true, result: { event_name: 'message.text.received',
  message: { message_id: id, text, chat: { id: 'u1', chat_type: 'PRIVATE' }, from: { id: 'u1', display_name: 'Tuấn' } } } });

// ---------- tiện ích ----------
await t('input: nhãn, mã HS, số hiệu, nước', () => {
  const { values, conLai } = parseLabeled('Mã HS: 8413.70.90\nTên hàng: máy bơm\nghi chú tự do', [{ key: 'maHs', nhan: ['mã hs'] }, { key: 'tenHang', nhan: ['tên hàng'] }]);
  assert.equal(values.maHs, '8413.70.90'); assert.equal(values.tenHang, 'máy bơm'); assert.equal(conLai, 'ghi chú tự do');
  assert.equal(firstHs8('mã 8413 70 90 nhé'), '84137090');
  assert.deepEqual(soHieuList('xem 57/2022/NĐ-CP và 38/2015/TT-BTC, 1810/TB-TCHQ'), ['57/2022/NĐ-CP', '38/2015/TT-BTC', '1810/TB-TCHQ']);
  assert.equal(countryCode('jp'), 'JP'); assert.equal(countryCode('Trung Quốc'), 'CN');
});

await t('zalo: chia đoạn ≤2000, parseUpdate, safeEqual', () => {
  const long = Array.from({ length: 300 }, (_, i) => `Dòng ${i} nội dung thử`).join('\n');
  assert.ok(splitText(long).every((p) => p.length <= 2000));
  assert.equal(parseUpdate(dm('hi', 'm')).chatId, 'u1');
  assert.ok(safeEqual('abcdefgh', 'abcdefgh') && !safeEqual('a', 'b'));
});

// ---------- MCP client ----------
await t('mcp: SSE + unwrap JSON text + lỗi', () => {
  const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":7,"result":{"content":[{"type":"text","text":"{\\"ok\\":true,\\"data\\":1}"}]}}\n\n';
  assert.equal(parseSse(sse, 7).result.content[0].type, 'text');
  assert.deepEqual(unwrapToolResult(parseSse(sse, 7).result).data, 1);
  const e = unwrapToolResult({ isError: true, content: [{ type: 'text', text: JSON.stringify(ERR) }] });
  assert.equal(e.ok, false); assert.equal(e.loi, 'BACKEND_LOI');
});

await t('mcp: bắt tay với máy chủ giả (session id, Bearer, SSE, tools/list, tools/call)', async () => {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
      const m = JSON.parse(b); seen.push([m.method, req.headers.authorization, req.headers['mcp-session-id']]);
      if (!m.id) { res.writeHead(202); return res.end(); }
      if (m.method === 'initialize') { res.writeHead(200, { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'S1' }); return res.end(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { serverInfo: { name: 'oz' } } })); }
      if (m.method === 'tools/list') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'tra_thue' }] } })); }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(`data: ${JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: JSON.stringify(TAX) }] } })}\n\n`);
    });
  });
  await new Promise((r) => srv.listen(0, r));
  const mcp = createMcpClient({ url: `http://127.0.0.1:${srv.address().port}/mcp`, token: 'K', log: {} });
  assert.deepEqual((await mcp.listTools()).map((x) => x.name), ['tra_thue']);
  const r = await mcp.callTool('tra_thue', { maHs: '84137090' });
  srv.close();
  assert.equal(r.data.hsCode, '84137090');
  assert.deepEqual(seen.map((s) => s[0]), ['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
  assert.ok(seen.every((s) => s[1] === 'Bearer K'));
  assert.equal(seen[3][2], 'S1');
});

// ---------- gói + định tuyến ----------
await t('gói: chỉ hiện gói có công cụ trên Cổng; menu cuối tin liệt kê số', () => {
  assert.equal(availablePackages(ALL_TOOLS).length, 7);
  const ps = availablePackages(new Set(['tra_thue', 'phan_loai_hs']));
  assert.deepEqual(ps.map((p) => p.so), [1, 2]);
  assert.match(plain(menuText(ps)), /1 Phân loại · 2 Thuế · 0 Tự động/);
});

await t('định tuyến: menu / chọn số / "gói 2 <nội dung>" / tự động', () => {
  const pkgs = PACKAGES;
  assert.equal(route('menu', { pkgs }).kind, 'menu');
  assert.equal(route('xin chào', { pkgs }).kind, 'menu');
  assert.equal(route('3', { pkgs }).pkg.so, 3);
  const g = route('gói 2 84137090', { pkgs }); assert.equal(g.kind, 'chay'); assert.equal(g.pkg.so, 2); assert.equal(g.text, '84137090');
  assert.equal(route('0', { pkgs }).kind, 'tu-dong');
  assert.equal(route('máy bơm nước', { pkgs, session: { goi: 6 } }).pkg.so, 6);
  assert.equal(autoPick('84137090', pkgs).so, 2);
  assert.equal(autoPick('8413.70.90 JP', pkgs).so, 2);
  assert.equal(autoPick('57/2022/NĐ-CP còn hiệu lực không', pkgs).so, 5);
  assert.equal(autoPick('kiểm tra nhãn hiệu Nike', pkgs).so, 6);
  assert.equal(autoPick('hải quan áp mã khác, cần giải trình', pkgs).so, 7);
  assert.equal(autoPick('máy bơm nước ly tâm 1.5HP', pkgs).so, 1);
  assert.equal(route('kết quả 3f0c2a8e-1b2c-4d5e-8f90-123456789abc', { pkgs }).kind, 'ket-qua');
});

await t('render: lỗi backend thân thiện, chung cho công cụ mới, rút gọn', () => {
  const e = renderResult(ERR, { title: 'X' });
  assert.match(e, /Cổng tra cứu gặp lỗi/); assert.doesNotMatch(e, /EN:|HTTP 404/); assert.match(e, /hoàn/);
  const g = renderGeneric({ maDeXuat: '84137090', confidence: 0.82, maThayThe: [{ hsCode: '84138190', nameVi: 'Loại khác' }], nguon: [1] }).join('\n');
  assert.match(g, /Mã đề xuất: 8413\.70\.90/); assert.match(g, /82%/); assert.match(g, /8413\.81\.90 — Loại khác/); assert.doesNotMatch(g, /Nguon/i);
  assert.match(renderResult({ ok: true, text: 'chữ thường từ công cụ mới' }), /chữ thường/);
});

await t('pickHs tìm mã đề xuất ở nhiều dạng', () => {
  assert.equal(pickHs({ data: { maDeXuat: '8413.70.90' } }), '84137090');
  assert.equal(pickHs({ data: { goiY: [{ maHs: '84137090' }] } }), '84137090');
  assert.equal(pickHs({ data: { x: { y: { hsCode: '85044090' } } } }), '85044090');
});

// ---------- luồng đầy đủ qua bot ----------
await t('bot: "xin chào" → menu đủ 7 gói', async () => {
  const zalo = fakeZalo(); const bot = createBot({ zalo, mcp: fakeMcp(), log: {} });
  await bot.handleUpdate(dm('xin chào', 'a1'));
  assert.match(zalo.sent[0][1], /CHỌN GÓI/); assert.match(zalo.sent[0][1], /7\. 📄 Hồ sơ giải trình/);
});

await t('bot: gói 2 — thuế (bộ dựng thuế) + thủ tục lỗi backend vẫn trả phần thuế; cuối tin có menu', async () => {
  const zalo = fakeZalo();
  const mcp = fakeMcp({ tra_thue: TAX, tra_thu_tuc_nhap_khau: ERR });
  const bot = createBot({ zalo, mcp, log: {} });
  await bot.handleUpdate(dm('84137090', 'b1'));
  const s = zalo.sent[0][1];
  assert.deepEqual(mcp.calls.map((c) => c[0]).sort(), ['tra_thu_tuc_nhap_khau', 'tra_thue']);
  assert.deepEqual(mcp.calls.find((c) => c[0] === 'tra_thue')[1], { maHs: '84137090', xuatXu: 'CN' });
  assert.match(s, /Tự động chọn gói 2/);
  assert.match(s, /KHÔNG được hưởng → áp MFN/);
  assert.match(s, /Thủ tục[\s\S]*gặp lỗi/);
  assert.match(s, /📦 1 Phân loại · 2 Thuế · 3 Mô tả/);
});

await t('bot: gói 2 gõ tên hàng → tim_ma_hs', async () => {
  const zalo = fakeZalo(); const mcp = fakeMcp({ tim_ma_hs: SEARCH }); const bot = createBot({ zalo, mcp, log: {} });
  await bot.handleUpdate(dm('2', 'c1'));
  assert.match(zalo.sent[0][1], /Gói 2: Thuế/);
  await bot.handleUpdate(dm('máy bơm nước', 'c2'));
  assert.equal(mcp.calls[0][0], 'tim_ma_hs');
  assert.match(zalo.sent[1][1], /8413\.19\.10 — Hoạt động bằng điện/);
  assert.match(zalo.sent[1][1], /rủi ro ấn định 8413\.70/);
});

await t('bot: gói 1 chạy nền → báo đang xử lý → hỏi kết quả → gợi ý gói 2/3; gói 3 dùng lại mã + mã lượt', async () => {
  const zalo = fakeZalo();
  const ML = '11111111-2222-4333-8444-555555555555';
  let n = 0;
  const mcp = fakeMcp({
    phan_loai_hs: { ok: true, maLuot: ML, trangThai: 'DANG_XU_LY' },
    ket_qua_phan_loai: () => (++n < 2 ? { ok: true, trangThai: 'DANG_XU_LY' } : { ok: true, trangThai: 'XONG', data: { maDeXuat: '84137090', lyDo: 'Bơm ly tâm' } }),
    sinh_mo_ta_khai_bao: { ok: true, data: { moTaEcus: 'Máy bơm nước ly tâm, mới 100%' } },
  });
  const bot = createBot({ zalo, mcp, log: {}, pollMs: 1 });
  await bot.handleUpdate(dm('1', 'd0'));
  await bot.handleUpdate(dm('Tên hàng: máy bơm nước ly tâm\nChất liệu: gang\nThông số: công suất 1.5HP, điện áp 220V', 'd1'));
  await bot.drain();
  assert.deepEqual(mcp.calls[0], ['phan_loai_hs', { tenHang: 'máy bơm nước ly tâm', chatLieu: 'gang', thongSo: { 'công suất': '1.5HP', 'điện áp': '220V' }, nguonThongSo: 'CHU' }]);
  assert.match(zalo.sent[1][1], /⏳ Đang phân loại/);
  assert.match(zalo.sent[2][1], /Mã đề xuất: 8413\.70\.90/);
  assert.match(zalo.sent[2][1], /gõ "2" để xem thuế/);
  await bot.handleUpdate(dm('3', 'd2'));
  await bot.handleUpdate(dm('Thương hiệu: Pentax\nXuất xứ: Trung Quốc', 'd3'));
  const mt = mcp.calls.find((c) => c[0] === 'sinh_mo_ta_khai_bao')[1];
  assert.equal(mt.maHs, '84137090'); assert.equal(mt.tenHang, 'máy bơm nước ly tâm'); assert.equal(mt.maLuotPhanLoai, ML);
  assert.equal(mt.thuongHieu, 'Pentax'); assert.equal(mt.xuatXu, 'CN');
});

await t('bot: gói 4 soát miễn phí / kiểm sâu dùng kiem_ma_to_khai', async () => {
  const zalo = fakeZalo(); const mcp = fakeMcp({ soat_to_khai: { ok: true, data: { ketQua: 'ĐẠT' } }, kiem_ma_to_khai: { ok: true, data: { k2: 'khớp' } } });
  const bot = createBot({ zalo, mcp, log: {} });
  await bot.handleUpdate(dm('gói 4 Mã HS: 84137090\nMô tả: Máy bơm nước ly tâm, mới 100%', 'e1'));
  assert.deepEqual(mcp.calls[0], ['soat_to_khai', { dongHang: [{ stt: 1, maHs: '84137090', moTa: 'Máy bơm nước ly tâm, mới 100%', xuatXu: 'CN' }] }]);
  assert.match(zalo.sent[0][1], /Kiểm sâu: có/);
  await bot.handleUpdate(dm('Mã HS: 84137090\nMô tả: Máy bơm\nXuất xứ: JP\nKiểm sâu: có', 'e2'));
  assert.equal(mcp.calls[1][0], 'kiem_ma_to_khai'); assert.equal(mcp.calls[1][1].dongHang[0].xuatXu, 'JP');
});

await t('bot: gói 5 văn bản + chú giải/tiền lệ; gói 6 SHTT; gói 7 giải trình', async () => {
  const zalo = fakeZalo(); const mcp = fakeMcp(); const bot = createBot({ zalo, mcp, log: {} });
  await bot.handleUpdate(dm('57/2022/NĐ-CP còn hiệu lực không', 'f1'));
  assert.deepEqual(mcp.calls[0], ['tra_hieu_luc_van_ban', { soHieu: ['57/2022/NĐ-CP'] }]);
  await bot.handleUpdate(dm('gói 5 8413', 'f2'));
  // Cổng chưa có tra_cay_hs → KHÔNG gọi tra_tien_le với mã 4 số (bẫy #538), chỉ nhắc gõ đủ 8 số
  assert.deepEqual(mcp.calls.slice(1).map((c) => c[0]), ['tra_chu_giai']);
  assert.match(zalo.sent.at(-1)[1], /Tiền lệ cần mã đủ 8 số/);
  await bot.handleUpdate(dm('gói 6 Nhãn hiệu: Nike\nMã HS: 64041190', 'f3'));
  // Khách không nói xuất xứ → không đoán CN
  assert.deepEqual(mcp.calls.at(-1), ['kiem_tra_shtt', { tenNhan: 'Nike', maHs: '64041190' }]);
  await bot.handleUpdate(dm('Nhãn hiệu: Nike\nMã HS: 64041190\nXuất xứ: Trung Quốc', 'f3b'));
  assert.equal(mcp.calls.at(-1)[1].xuatXu, 'CN');
  await bot.handleUpdate(dm('gói 7 Mã khai: 84137090\nMã hải quan áp: 84138190\nMô tả hàng: Máy bơm ly tâm\nTài liệu có: catalogue, hợp đồng', 'f4'));
  const gt = mcp.calls.at(-1);
  assert.equal(gt[0], 'soan_ho_so_giai_trinh');
  assert.deepEqual(gt[1], { loai: 'TRANH_CHAP_MA', maKhai: '84137090', maHaiQuan: '84138190', moTaHang: 'Máy bơm ly tâm', taiLieuCo: ['catalogue', 'hợp đồng'] });
  assert.match(zalo.sent.at(-1)[1], /BẢN NHÁP/);
});

await t('bot: thiếu thông tin → hỏi lại theo mẫu, không gọi Cổng', async () => {
  const zalo = fakeZalo(); const mcp = fakeMcp(); const bot = createBot({ zalo, mcp, log: {} });
  await bot.handleUpdate(dm('gói 7 hàng bị áp mã', 'g1'));
  assert.equal(mcp.calls.length, 0);
  assert.match(zalo.sent[0][1], /Cần mã đã khai/);
});

await t('bot: Cổng mất kết nối → câu báo lỗi + menu; nhóm: @tên bot, ghi tên người hỏi, phiên riêng từng người', async () => {
  const zalo = fakeZalo();
  const mcp = { listTools: async () => { throw new Error('ECONNREFUSED'); }, callTool: async () => { throw new Error('MCP lỗi HTTP 502'); } };
  const bot = createBot({ zalo, mcp, log: {}, botNames: ['OZ Tra cứu HS'] });
  const g = (text, id, uid) => ({ result: { event_name: 'message.text.received', message: { message_id: id, text, chat: { id: 'G', chat_type: 'GROUP' }, from: { id: uid, display_name: uid } } } });
  await bot.handleUpdate(g('@OZ Tra cứu HS 6', 'h1', 'An'));
  await bot.handleUpdate(g('@OZ Tra cứu HS 84137090', 'h2', 'Binh'));
  assert.match(zalo.sent[0][1], /^@An\n®️ Gói 6/);
  assert.match(zalo.sent[1][1], /^@Binh\n/);
  assert.match(zalo.sent[1][1], /lỗi tạm thời/);
  assert.doesNotMatch(zalo.sent[1][1], /MCP lỗi HTTP 502/);
  assert.equal(stripMention('@OZ Tra cứu HS, máy bơm', ['OZ Tra cứu HS']), 'máy bơm');
  assert.ok(isGroup({ chatType: 'GROUP' }));
});

// ---------- ảnh + bổ sung dữ kiện ----------
// Đúng dạng tin ảnh Zalo thật (log máy anh Tuấn, 03/11/2026 17:43)
const photo = (id, caption = '') => ({ message: { chat: { id: 'u1', chat_type: 'PRIVATE' }, message_id: id, message_type: 'CHAT_PHOTO',
  from: { id: 'u1', display_name: 'Tuấn' }, photo_url: 'https://photo-stal-14.zdn.vn/no/jpg/abc.jpg', caption }, event_name: 'message.image.received' });

await t('ảnh: chưa bật Gemini → hướng dẫn gõ chữ / gói 6', async () => {
  const zalo = fakeZalo(); const bot = createBot({ zalo, mcp: fakeMcp(), log: {} });
  await bot.handleUpdate(photo('p0'));
  assert.match(zalo.sent[0][1], /chưa bật đọc thông số từ ảnh/); assert.match(zalo.sent[0][1], /gõ "6"/);
});

await t('ảnh: lỗi Gemini 503 không lộ tiếng Anh cho khách (đường lib/bot.js)', async () => {
  const zalo = fakeZalo();
  const vision = { readSpecs: async () => { throw Object.assign(
    new Error('Gemini lỗi 503: This model is currently experiencing high demand. Please try again later.'), { tamThoi: true }); } };
  const bot = createBot({ zalo, mcp: fakeMcp(), vision, log: {} });
  await bot.handleUpdate(photo('pE'));
  const s = zalo.sent[0][1];
  assert.doesNotMatch(s, /high demand|Please try again|Gemini lỗi 503/i, s);
  assert.match(s, /quá tải/i, s);
  assert.match(s, /gõ tên hàng/, s);
});

await t('ảnh: lỗi Gemini không tạm → câu chung, không lộ chi tiết lỗi', async () => {
  const zalo = fakeZalo();
  const vision = { readSpecs: async () => { throw new Error('ECONNREFUSED 10.0.0.7:3000 fetch failed'); } };
  const bot = createBot({ zalo, mcp: fakeMcp(), vision, log: {} });
  await bot.handleUpdate(photo('pE2'));
  const s = zalo.sent[0][1];
  assert.doesNotMatch(s, /ECONNREFUSED|10\.0\.0\.7|fetch failed/i, s);
  assert.match(s, /chưa đọc được ảnh này/i, s);
});

await t('ảnh: Gemini đọc thông số → người dùng "ok" → phan_loai_hs với nguồn ẢNH', async () => {
  const zalo = fakeZalo(); const mcp = fakeMcp({ phan_loai_hs: { ok: true, data: { maDeXuat: '85365099' } } });
  const vision = { readSpecs: async (url, cap) => { assert.match(url, /zdn\.vn/); assert.equal(cap, 'cảm biến'); return {
    tenHang: 'Cảm biến tiệm cận', model: 'F3C-05KS01', thuongHieu: null, thongSo: { 'Khoảng cách': '1 mm', 'Điện áp': '12-24VDC' },
    chuTrongAnh: 'PROXIMITY SENSOR F3C-05KS01', khongChac: ['chất liệu vỏ'] }; } };
  const bot = createBot({ zalo, mcp, vision, log: {} });
  await bot.handleUpdate(photo('p1', 'cảm biến'));
  const s = zalo.sent[0][1];
  assert.match(s, /Tên hàng: Cảm biến tiệm cận\nModel: F3C-05KS01\nThông số: Khoảng cách: 1 mm, Điện áp: 12-24VDC/);
  assert.match(s, /gõ "ok"/); assert.match(s, /Chưa chắc: chất liệu vỏ/);
  assert.equal(mcp.calls.length, 0);                               // chưa gọi Cổng khi chưa xác nhận
  await bot.handleUpdate(dm('ok', 'p2'));
  assert.deepEqual(mcp.calls[0], ['phan_loai_hs', { tenHang: 'Cảm biến tiệm cận',
    thongSo: { 'Khoảng cách': '1 mm', 'Điện áp': '12-24VDC', Model: 'F3C-05KS01' }, nguonThongSo: 'ANH' }]);
  assert.match(zalo.sent[1][1], /8536\.50\.99/);
});

await t('ảnh: gói 6 → kiem_tra_shtt_anh với link ảnh Zalo', async () => {
  const zalo = fakeZalo(); const mcp = fakeMcp({ kiem_tra_shtt_anh: { ok: true, data: { ketQua: [{ ten: 'NIKE', diem: 0.91 }] } } });
  const bot = createBot({ zalo, mcp, log: {} });
  await bot.handleUpdate(dm('6', 'q1'));
  await bot.handleUpdate(photo('q2'));
  assert.deepEqual(mcp.calls[0], ['kiem_tra_shtt_anh', { urlAnh: 'https://photo-stal-14.zdn.vn/no/jpg/abc.jpg' }]);
  assert.match(zalo.sent[1][1], /So logo/);
});

await t('CAN_DU_KIEN → người dùng trả lời → bo_sung_du_kien đúng mã lượt (không gọi phan_loai_hs lần 2)', async () => {
  const zalo = fakeZalo();
  const ML = '99999999-2222-4333-8444-555555555555';
  let k = 0;
  const mcp = fakeMcp({
    // Đúng dạng Cổng trả (ket-qua-phan-loai.ts: ketQua = data hs-code-api, hoi = nextAction.questions)
    phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'CAN_DU_KIEN', hoi: [{ questionVi: 'Bơm ly tâm hay bơm piston?', whereToFind: 'Catalogue' }],
      ketQua: { status: 'NEED_FACTS', results: [{ hs: '84137090', reason: 'Nếu là bơm ly tâm.; Nguồn: engine-loop' }, { hs: '84135090', reason: 'Nếu là bơm piston.' }],
        engine: { name: 'loop', rounds: 2 }, dossier: { decision: 'HOI' }, canCuPhapLy: { vanBan: { soHieu: '85/2026/TT-BTC' } } } } },
    bo_sung_du_kien: { ok: true, maLuot: ML, trangThai: 'DANG_XU_LY' },
    ket_qua_phan_loai: () => (++k < 2 ? { ok: true, trangThai: 'DANG_XU_LY' } : { ok: true, trangThai: 'XONG', data: { maDeXuat: '84137090' } }),
  });
  const bot = createBot({ zalo, mcp, log: {}, pollMs: 1 });
  await bot.handleUpdate(dm('máy bơm nước', 'r1'));
  assert.match(zalo.sent[0][1], /Bơm ly tâm hay bơm piston/); assert.match(zalo.sent[0][1], /không trừ điểm thêm/);
  await bot.handleUpdate(dm('bơm ly tâm, cánh gang', 'r2'));
  await bot.drain();
  assert.deepEqual(mcp.calls.filter((c) => c[0] === 'phan_loai_hs').length, 1);
  assert.deepEqual(mcp.calls.find((c) => c[0] === 'bo_sung_du_kien'), ['bo_sung_du_kien', { maLuot: ML, boSung: 'bơm ly tâm, cánh gang' }]);
  assert.match(zalo.sent.at(-1)[1], /Mã đề xuất: 8413\.70\.90/);
});

await t('nhóm: "chọn gói 7" là CHỌN gói; câu hỏi mới khi đang chờ bổ sung KHÔNG ghép vào lượt cũ; trả lời gọn', async () => {
  const zalo = fakeZalo();
  const ML = 'aaaaaaaa-2222-4333-8444-555555555555';
  const kqDai = { maLuot: ML, trangThai: 'CAN_DU_KIEN',
    hoi: [1, 2, 3, 4, 5, 6].map((i) => ({ questionVi: `Câu hỏi số ${i}?`, whereToFind: 'Tem/nhãn, catalogue kỹ thuật' })),
    ketQua: { status: 'NEED_FACTS', attrs: { x: 1 }, soTay: { mode: 'full' }, engine: { name: 'loop', provider: 'minimax' }, review: { needed: false },
      dossier: { mic: { query: 'Proximity sensor' }, decision: 'HOI' }, missing: ['a', 'b'],
      results: [{ hs: '85365099', reason: 'Hồ sơ chỉ nêu cảm biến tiếp cận; chưa rõ cơ chế.; Nguồn: engine-loop' }, { hs: '90318090', reason: 'Nếu là thiết bị đo không quang học.; Nguồn: engine-loop:alt' }],
      resolver: { status: 'SKIP' }, candidates: { headings: [1, 2] }, nextAction: { type: 'ASK_USER', howToAnswerVi: 'gọi lại /api/classify' },
      canCuPhapLy: { vanBan: { soHieu: '85/2026/TT-BTC' }, trangThai: 'THIEU_DU_KIEN', disclaimer: 'dài…' }, girDisclaimer: 'dài…',
      missingStructured: [{ key: 'voltage' }], queryUnderstanding: { applied: true }, antiPatternWarnings: [{ description: 'x' }] } };
  const mcp = fakeMcp({ phan_loai_hs: { ok: true, data: kqDai } });
  const bot = createBot({ zalo, mcp, log: {}, botNames: ['Bot - Tuấn'] });
  const g = (text, id) => ({ result: { event_name: 'message.text.received', message: { message_id: id, text, chat: { id: 'G', chat_type: 'GROUP' }, from: { id: 'thang', display_name: 'Lại Minh Thắng' } } } });
  await bot.handleUpdate(g('@Bot - Tuấn chọn gói 7', 'k1'));
  assert.equal(mcp.calls.length, 0);
  assert.match(zalo.sent[0][1], /Gói 7: Hồ sơ giải trình/);
  await bot.handleUpdate(g('@Bot - Tuấn 1', 'k2'));                                 // chuyển gói 1
  await bot.handleUpdate(g('@Bot - Tuấn cảm biến tiệp cận hs code bao nhiêu em.', 'k3'));
  assert.deepEqual(mcp.calls[0], ['phan_loai_hs', { tenHang: 'cảm biến tiệp cận', nguonThongSo: 'CHU' }]);
  const s = zalo.sent.at(-1)[1];
  assert.match(s, /1\. 8536\.50\.99\n   Hồ sơ chỉ nêu cảm biến tiếp cận; chưa rõ cơ chế\.\n2\. 9031\.80\.90/);
  assert.match(s, /Cần bạn cho biết thêm:\n1\. Câu hỏi số 1\?/);
  assert.match(s, /5\. Câu hỏi số 5\?/); assert.doesNotMatch(s, /Câu hỏi số 6/);
  assert.match(s, /Căn cứ phân loại: 85\/2026\/TT-BTC/);
  assert.doesNotMatch(s, /Engine|Dossier|Resolver|Attrs|So Tay|Anti Pattern|Missing|engine-loop|Where To Find/i);
  assert.ok(s.length < 1200, `quá dài: ${s.length}`);
  // đang chờ bổ sung mà hỏi hàng khác → phân loại mới, không ghép
  await bot.handleUpdate(g('@Bot - Tuấn bút bi hs code là gì', 'k4'));
  assert.equal(mcp.calls.filter((c) => c[0] === 'bo_sung_du_kien').length, 0);
  assert.deepEqual(mcp.calls.at(-1), ['phan_loai_hs', { tenHang: 'bút bi', nguonThongSo: 'CHU' }]);
});

// ---------- não hiểu câu hỏi (Gemini function calling, giả lập) ----------
await t('não: câu mơ hồ → hỏi lại MỘT câu, không gọi Cổng', async () => {
  const zalo = fakeZalo(); const mcp = fakeMcp();
  const brain = { hieu: async () => ({ kind: 'hoi-lai', cauHoi: 'Bạn muốn tra thuế cho mã HS nào, hay phân loại từ mô tả hàng?' }) };
  const bot = createBot({ zalo, mcp, brain, log: {} });
  await bot.handleUpdate(dm('ơi cho tôi hỏi cái này với', 'n1'));
  assert.match(zalo.sent[0][1], /❓ Bạn muốn tra thuế/);
  assert.equal(mcp.calls.length, 0);
});

await t('não: chọn gói + dữ kiện → chạy gói đó với dữ kiện đã chép', async () => {
  const zalo = fakeZalo();
  const mcp = fakeMcp({ tra_thue: TAX });
  const brain = { hieu: async () => ({ kind: 'chay', goi: 2, text: '84137090 JP' }) };
  const bot = createBot({ zalo, mcp, brain, log: {} });
  await bot.handleUpdate(dm('thuế cái máy bơm vừa rồi với hàng Nhật là bao nhiêu', 'n2'));
  assert.deepEqual(mcp.calls.find((c) => c[0] === 'tra_thue')[1], { maHs: '84137090', xuatXu: 'JP' });
  assert.match(zalo.sent[0][1], /Tự động chọn gói 2/);
});

await t('não: Gemini lỗi → rơi về autoPick như cũ; đã chọn gói thì não không can thiệp', async () => {
  const zalo = fakeZalo(); const mcp = fakeMcp({ phan_loai_hs: { ok: true, data: { maDeXuat: '84137090' } } });
  let goiNao = 0;
  const brain = { hieu: async () => { goiNao++; return null; } };
  const bot = createBot({ zalo, mcp, brain, log: {} });
  await bot.handleUpdate(dm('máy bơm nước ly tâm', 'n3'));
  assert.equal(goiNao, 1);
  assert.equal(mcp.calls[0][0], 'phan_loai_hs');   // regex cũ vẫn chọn gói 1 khi não không trả được
  await bot.handleUpdate(dm('2', 'n4'));           // khách chọn gói 2
  await bot.handleUpdate(dm('cái này thuế bao nhiêu', 'n5'));
  assert.equal(goiNao, 1);                          // session.goi=2 → não không được hỏi
  assert.equal(mcp.calls.at(-1)[0], 'tim_ma_hs');   // gói 2 giữ nguyên hành vi cũ với câu tự do
});

// ===== Port từ main: tiền lệ nhánh 4/6 số (#538) + sổ trượt từ vựng =====
const TREE = {
  8526: { con: [{ id: '852610' }, { id: '85269' }], nguon: { tbTchq: { co: 6 } } },
  852610: { con: [{ id: '85261010' }, { id: '85261090' }] },
  85269: { con: [{ id: '852691' }, { id: '85269200' }] },
  852691: { con: [{ id: '85269110' }, { id: '85269190' }] },
};
const PREC = {
  85269190: { found: true, hsCode: '85269190', total: 2, items: [
    { tbTchqNumber: '3516/TB-TCHQ', year: 2023, productName: 'Thiết bị định vị GPS thông minh', outcome: '85269190' },
    { tbTchqNumber: '17608/TB-CHQ', year: 2025, productName: 'GPS Tracker', outcome: '85269190' }] },
  85269200: { found: true, hsCode: '85269200', total: 1, items: [{ tbTchqNumber: '2978/TB-TCHQ', year: 2018, productName: 'Bộ điều khiển từ xa', outcome: '85269200' }] },
};
const treeMcp = (prec = PREC) => fakeMcp({
  tra_cay_hs: ({ maHs }) => ({ ok: true, data: TREE[maHs] || { con: [] } }),
  tra_tien_le: ({ maHs, moTa }) => ({ ok: true, data: moTa ? { found: false } : prec[maHs] || { found: false, hsCode: maHs, message: `No precedents for ${maHs}` } }),
}, new Set([...ALL_TOOLS, 'tra_cay_hs']));

await t('gói 5: mã 4 số → nở ra mã lá 8 số qua tra_cay_hs, KHÔNG gửi 8526 cho tra_tien_le (#538)', async () => {
  const zalo = fakeZalo(); const mcp = treeMcp(); const bot = createBot({ zalo, mcp, log: {} });
  await bot.handleUpdate(dm('gói 5 8526', 'tl1'));
  const tl = mcp.calls.filter((c) => c[0] === 'tra_tien_le').map((c) => c[1].maHs);
  assert.deepEqual(tl.sort(), ['85261010', '85261090', '85269110', '85269190', '85269200']);
  const out = zalo.sent.at(-1)[1];
  assert.match(out, /nhánh 8526 \(đã dò 5\/5 mã 8 số\)/);
  assert.match(out, /8526\.91\.90 — 2 tiền lệ/); assert.match(out, /3516\/TB-TCHQ \(2023\)/);
  assert.match(out, /8526\.92\.00 — 1 tiền lệ/);
  assert.doesNotMatch(out, /không có tiền lệ/i);
});

await t('gói 5: nhánh không có tiền lệ → báo rõ đã dò bao nhiêu mã + ghi sổ trượt', async () => {
  const zalo = fakeZalo(); const mcp = treeMcp({}); const truot = [];
  const bot = createBot({ zalo, mcp, log: {}, missLog: { ghi: (loai, info) => truot.push([loai, info]) } });
  await bot.handleUpdate(dm('gói 5 8526', 'tl2'));
  const out = zalo.sent.at(-1)[1];
  assert.match(out, /Chưa thấy tiền lệ ở 5 mã đã dò/);
  assert.match(out, /Cổng ghi nhận 6 thông báo phân loại trong nhóm 8526/);
  assert.deepEqual(truot.map((x) => x[0]), ['TIEN_LE_RONG']);
  assert.equal(truot[0][1].maHs, '8526');
  await bot.handleUpdate(dm('máy radar xuyên đất', 'tl3'));
  assert.equal(truot.at(-1)[0], 'TIEN_LE_RONG'); assert.equal(truot.at(-1)[1].moTa, 'máy radar xuyên đất');
});

await t('gói 1: CAN_DU_KIEN và khách gõ lại mô tả → ghi sổ trượt; "hàng mới" thì không tính gõ lại', async () => {
  const zalo = fakeZalo(); const truot = [];
  const mcp = fakeMcp({ phan_loai_hs: { ok: true, trangThai: 'CAN_DU_KIEN', data: { trangThai: 'CAN_DU_KIEN' } } }, new Set([...ALL_TOOLS].filter((x) => x !== 'bo_sung_du_kien')));
  const bot = createBot({ zalo, mcp, log: {}, missLog: { ghi: (loai, info) => truot.push([loai, info]) } });
  await bot.handleUpdate(dm('1', 'm0'));
  await bot.handleUpdate(dm('máy radar', 'm1'));
  await bot.handleUpdate(dm('máy ra đa xuyên đất GPR', 'm2'));
  await bot.handleUpdate(dm('hàng mới: bơm nước', 'm3'));
  assert.deepEqual(truot.map((x) => x[0]), ['CAN_DU_KIEN', 'GO_LAI', 'CAN_DU_KIEN', 'CAN_DU_KIEN']);
  assert.equal(truot[1][1].cauTruoc, 'máy radar'); assert.equal(truot[1][1].cau, 'máy ra đa xuyên đất GPR');
});

await t('render: điều kiện đi cùng dòng BLOCKING; nhắc phạm vi CBPG theo mô tả', async () => {
  const thuTuc = { ok: true, data: { maHs: '84433940', chinhSach: { policyLines: [{ text: 'Hàng hóa lĩnh vực in khi NK phải có giấy phép (22/2018/TT-BTTTT PL1)', level: 'BLOCKING',
    dieu_kien: 'chỉ cấp cho máy in phun màu kỹ thuật số tốc độ >60 tờ/phút khổ A4 hoặc khổ in >A3' }] } } };
  const out = renderResult(thuTuc, { title: 'x' });
  assert.match(out, /phải có giấy phép \(22\/2018\/TT-BTTTT PL1\) \(BLOCKING\) — điều kiện: chỉ cấp cho máy in phun màu/);
  const zalo = fakeZalo();
  const mcp = fakeMcp({ tra_thue: TAX, tra_thu_tuc_nhap_khau: { ok: true, data: { chinhSach: { policyLines: [{ text: 'Thuế chống bán phá giá thép cán nóng (QĐ 460/QĐ-BCT)', level: 'NOTICE' }] } } } });
  const bot = createBot({ zalo, mcp, log: {} });
  await bot.handleUpdate(dm('gói 2 72083990', 'pv1'));
  assert.match(zalo.sent.at(-1)[1], /Phạm vi CBPG\/tự vệ tính theo MÔ TẢ/);
  const mcp2 = fakeMcp({ tra_thue: TAX, tra_thu_tuc_nhap_khau: { ok: true, data: { chinhSach: { policyLines: [] } } } });
  const zalo2 = fakeZalo(); const bot2 = createBot({ zalo: zalo2, mcp: mcp2, log: {} });
  await bot2.handleUpdate(dm('gói 2 84137090', 'pv2'));
  assert.doesNotMatch(zalo2.sent.at(-1)[1], /Phạm vi CBPG/);
});

await t('sổ trượt: ghi JSONL theo ngày giờ VN, đếm theo loại', async () => {
  const { createMissLog } = await import('../lib/truot.js');
  const fs = await import('node:fs/promises'); const os = await import('node:os'); const path = await import('node:path');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'truot-'));
  const sl = createMissLog({ thuMuc: dir, log: {}, now: () => new Date('2026-11-04T18:30:00Z') });   // 01:30 ngày 05/11 giờ VN
  sl.ghi('TIEN_LE_RONG', { goi: 5, cau: 'máy radar' }); sl.ghi('GO_LAI', { goi: 1, cau: 'b', cauTruoc: 'a' });
  await sl.xong();
  const lines = (await fs.readFile(path.join(dir, 'truot-2026-11-05.jsonl'), 'utf8')).trim().split('\n').map((x) => JSON.parse(x));
  assert.deepEqual(lines.map((x) => x.loai), ['TIEN_LE_RONG', 'GO_LAI']); assert.equal(lines[0].cau, 'máy radar');
  assert.deepEqual(sl.thongKe(), { TIEN_LE_RONG: 1, GO_LAI: 1 });
  await fs.rm(dir, { recursive: true, force: true });
});

console.log(`\n${pass} test đạt`);
