// Não hiểu câu hỏi (Gemini function calling): không cần mạng, fetch giả lập.
// Quy tắc an toàn cần test đủ: code quyết (chỉ gói khả dụng, dữ kiện đúng khuôn, độ tin cậy đủ);
// Gemini lỗi/quá tải → null để nơi gọi rơi về autoPick của router.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBrain, routeThongMinh } from '../brain.js';
import { PACKAGES, availablePackages } from '../packages.js';

const ALL = new Set(['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt',
  'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien']);

/** fetch giả lập Gemini: fn(lượt, request) → { status, body }. Ghi lại mọi request để đối chiếu khuôn. */
function fakeGemini(fn) {
  const requests = [];
  const fetchImpl = async (url, opts = {}) => {
    requests.push({ url, body: JSON.parse(opts.body) });
    const r = fn(requests.length, requests.at(-1));
    return { ok: r.status === 200, status: r.status, json: async () => r.body ?? {} };
  };
  return { requests, fetchImpl };
}
const goi = (name, args) => ({ status: 200, body: { candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }] } });

test('createBrain: không có apiKey hoặc GEMINI_BRAIN=0 → null (bot chạy như cũ)', () => {
  assert.equal(createBrain({ apiKey: '', log: {} }), null);
  assert.equal(createBrain({ apiKey: 'k', off: true, log: {} }), null);
  assert.ok(createBrain({ apiKey: 'k', log: {} }));
});

test('hieu: chọn gói 1, chép dữ kiện, dựng lại văn bản có nhãn đúng khuôn gói', async () => {
  const g = fakeGemini(() => goi('phan_loai', { tenHang: 'máy bơm nước ly tâm', chatLieu: 'thân gang', thongSo: 'công suất 1.5HP, điện áp 220V', doChac: 0.9 }));
  const brain = createBrain({ apiKey: 'k', fetchImpl: g.fetchImpl, log: {} });
  const r = await brain.hieu({ text: 'cho tôi hỏi cái máy bơm này mã gì', last: null, pkgs: PACKAGES });
  assert.deepEqual(r, { kind: 'chay', goi: 1, text: 'Tên hàng: máy bơm nước ly tâm\nChất liệu: thân gang\nThông số: công suất 1.5HP, điện áp 220V' });
  const b = g.requests[0].body;
  assert.equal(b.toolConfig.functionCallingConfig.mode, 'ANY');
  assert.equal(b.generationConfig.temperature, 0);
  const names = b.tools[0].functionDeclarations.map((d) => d.name);
  assert.ok(names.includes('phan_loai') && names.includes('hoi_lai') && names.includes('khac') && names.length === 9);
  assert.match(b.systemInstruction.parts[0].text, /KHÔNG bịa dữ kiện/);
  assert.match(b.contents[0].parts[0].text, /máy bơm này mã gì/);
});

test('hieu: ngữ cảnh phiên — "thuế của nó" điền mã vừa tra, xuất xủ chuẩn 2 chữ', async () => {
  const g = fakeGemini((n, req) => {
    assert.match(req.body.contents[0].parts[0].text, /84137090/);   // mã cũ có trong ngữ cảnh
    return goi('thue_thu_tuc', { maHs: '84137090', xuatXu: 'Nhật Bản', doChac: 0.8 });
  });
  const brain = createBrain({ apiKey: 'k', fetchImpl: g.fetchImpl, log: {} });
  const r = await brain.hieu({ text: 'thuế của nó bao nhiêu', last: { tenHang: 'máy bơm', maHs: '84137090' }, pkgs: PACKAGES });
  assert.deepEqual(r, { kind: 'chay', goi: 2, text: '84137090 JP' });
});

test('hieu: hoi_lai khi thiếu dữ kiện; khac với câu chào/xã giao', async () => {
  const g = fakeGemini(() => goi('hoi_lai', { cauHoi: 'Bạn muốn tra thuế cho mã HS nào, hay phân loại từ mô tả hàng?' }));
  const brain = createBrain({ apiKey: 'k', fetchImpl: g.fetchImpl, log: {} });
  assert.deepEqual(await brain.hieu({ text: 'ơi giúp tôi cái này với', last: null, pkgs: PACKAGES }),
    { kind: 'hoi-lai', cauHoi: 'Bạn muốn tra thuế cho mã HS nào, hay phân loại từ mô tả hàng?' });
  const g2 = fakeGemini(() => goi('khac', { cauDan: 'Chào bạn, bot chỉ hỗ trợ tra cứu hải quan. Gõ "menu" để xem các gói nhé.' }));
  const brain2 = createBrain({ apiKey: 'k', fetchImpl: g2.fetchImpl, log: {} });
  assert.deepEqual(await brain2.hieu({ text: 'shop có ship nội thành không', last: null, pkgs: PACKAGES }),
    { kind: 'khac', cauDan: 'Chào bạn, bot chỉ hỗ trợ tra cứu hải quan. Gõ "menu" để xem các gói nhé.' });
});

test('hieu: Gemini 503 → thử mẫu kế rồi trả null (bot rơi về regex)', async () => {
  const g = fakeGemini(() => ({ status: 503, body: { error: { message: 'overloaded' } } }));
  const brain = createBrain({ apiKey: 'k', fetchImpl: g.fetchImpl, log: {} });
  assert.equal(await brain.hieu({ text: 'x', last: null, pkgs: PACKAGES }), null);
  assert.equal(g.requests.length, 2);   // flash-lite rồi flash
});

test('hieu: từ chối kết quả sai khuôn — gói không khả dụng, doChac thấp, mã HS bịa', async () => {
  const chiGoi1 = availablePackages(new Set(['phan_loai_hs']));
  const mk = (fn) => createBrain({ apiKey: 'k', fetchImpl: fakeGemini(fn).fetchImpl, log: {} });
  // Cổng thiếu công cụ thuế → gói 2 không khả dụng dù Gemini chọn
  assert.equal(await mk(() => goi('thue_thu_tuc', { maHs: '84137090', doChac: 0.9 })).hieu({ text: '84137090', last: null, pkgs: chiGoi1 }), null);
  // độ tin cậy dưới ngưỡng 0.5
  assert.equal(await mk(() => goi('phan_loai', { tenHang: 'bút bi', doChac: 0.3 })).hieu({ text: 'bút bi', last: null, pkgs: PACKAGES }), null);
  // mã không đúng khuôn số
  assert.equal(await mk(() => goi('thue_thu_tuc', { maHs: 'abc', doChac: 0.9 })).hieu({ text: 'x', last: null, pkgs: PACKAGES }), null);
  // hàm lạ
  assert.equal(await mk(() => goi('hem_biet', {})).hieu({ text: 'x', last: null, pkgs: PACKAGES }), null);
});

test('routeThongMinh: chỉ hỏi não ở chế độ tự động; typing được bật; null → giữ kết quả regex', async () => {
  let calls = 0; let typed = 0;
  const brain = { hieu: async () => { calls++; return null; } };
  const typing = () => { typed++; };
  assert.equal((await routeThongMinh('menu', { pkgs: PACKAGES, brain, typing })).kind, 'menu');                    // lệnh: không tốn AI
  const cg = await routeThongMinh('máy bơm', { session: { goi: 2 }, pkgs: PACKAGES, brain, typing });             // đã chọn gói
  assert.equal(cg.kind, 'chay'); assert.equal(cg.tuDong, undefined);
  assert.equal(calls, 0); assert.equal(typed, 0);
  const r = await routeThongMinh('cái này mã gì nhỉ', { pkgs: PACKAGES, brain, typing });                          // tự động → hỏi não
  assert.equal(calls, 1); assert.equal(typed, 1);
  assert.equal(r.kind, 'chay'); assert.equal(r.pkg.so, 1); assert.equal(r.tuDong, true);                          // não null → regex giữ gói 1
});

test('routeThongMinh: não hỏi lại / chọn gói khác regex / gói lạ → giữ regex', async () => {
  const hoiLai = { hieu: async () => ({ kind: 'hoi-lai', cauHoi: 'Bạn muốn tra gì?' }) };
  assert.deepEqual(await routeThongMinh('ơi giúp tôi', { pkgs: PACKAGES, brain: hoiLai }), { kind: 'hoi-lai', cauHoi: 'Bạn muốn tra gì?' });
  const chon6 = { hieu: async () => ({ kind: 'chay', goi: 6, text: 'Nhãn hiệu: Nike\nMã HS: 64041190' }) };
  const r = await routeThongMinh('check giúp giày nike này có sao không', { pkgs: PACKAGES, brain: chon6 });
  assert.equal(r.kind, 'chay'); assert.equal(r.pkg.so, 6); assert.equal(r.text, 'Nhãn hiệu: Nike\nMã HS: 64041190');
  const la = { hieu: async () => ({ kind: 'chay', goi: 9, text: 'x' }) };                                          // gói không tồn tại
  const r2 = await routeThongMinh('abc', { pkgs: PACKAGES, brain: la });
  assert.equal(r2.tuDong, true); assert.equal(r2.pkg.so, 1);
});

test('hieu: mã HS khách KHÔNG nêu (não tự đoán) bị bỏ — "thủ tục nhập khẩu mỹ phẩm" không thành 33049930', async () => {
  const mk = (args) => createBrain({ apiKey: 'k', fetchImpl: fakeGemini(() => goi(...args)).fetchImpl, log: {} });
  // Gói 2 cần mã: mã bịa → null → nơi gọi rơi về regex (gói 2 tự tìm mã bằng tim_ma_hs từ chữ của khách)
  assert.equal(await mk(['thue_thu_tuc', { maHs: '33049930', doChac: 0.9 }]).hieu({ text: 'thủ tục nhập khẩu mỹ phẩm', last: null, pkgs: PACKAGES }), null);
  assert.equal(await mk(['thue_thu_tuc', { maHs: '9503', doChac: 0.9 }]).hieu({ text: 'đồ chơi trẻ em có phải kiểm tra chất lượng không', last: null, pkgs: PACKAGES }), null);
  // Khách gõ 4 số, não "nở" thành 8 số → cũng là bịa
  assert.equal(await mk(['thue_thu_tuc', { maHs: '84137090', doChac: 0.9 }]).hieu({ text: 'thuế nhóm 8413', last: null, pkgs: PACKAGES }), null);
  // Gói 5 có mô tả: bỏ mã bịa, vẫn tìm tiền lệ theo mô tả
  assert.deepEqual(await mk(['phap_luat', { maHs: '85261010', moTa: 'máy ra đa xuyên đất', doChac: 0.9 }]).hieu({ text: 'tiền lệ máy ra đa xuyên đất', last: null, pkgs: PACKAGES }),
    { kind: 'chay', goi: 5, text: 'máy ra đa xuyên đất' });
  // Gói 7: mã Hải quan áp bịa → bỏ trường đó, giữ mã khai khách đã nêu
  assert.deepEqual(await mk(['giai_trinh', { maKhai: '84137090', maHaiQuan: '84138190', moTaHang: 'máy bơm ly tâm', doChac: 0.9 }])
    .hieu({ text: 'khai 84137090 máy bơm ly tâm bị hải quan áp mã khác', last: null, pkgs: PACKAGES }),
  { kind: 'chay', goi: 7, text: 'Mã khai: 84137090\nMô tả hàng: máy bơm ly tâm' });
});

test('hieu: mã HS khách đã nêu (có dấu chấm/cách) hoặc có trong ngữ cảnh thì giữ; mã ngắn hơn mã khách gõ cũng được', async () => {
  const mk = (args) => createBrain({ apiKey: 'k', fetchImpl: fakeGemini(() => goi(...args)).fetchImpl, log: {} });
  assert.deepEqual(await mk(['thue_thu_tuc', { maHs: '84137090', doChac: 0.9 }]).hieu({ text: 'thuế mã 8413.70.90 bao nhiêu', last: null, pkgs: PACKAGES }),
    { kind: 'chay', goi: 2, text: '84137090' });
  assert.deepEqual(await mk(['thue_thu_tuc', { maHs: '84137090', doChac: 0.9 }]).hieu({ text: 'thuế 8413 70 90', last: null, pkgs: PACKAGES }),
    { kind: 'chay', goi: 2, text: '84137090' });
  assert.deepEqual(await mk(['thue_thu_tuc', { maHs: '84137090', xuatXu: 'JP', doChac: 0.9 }]).hieu({ text: 'thế còn nhập từ Nhật thì sao', last: { tenHang: 'máy bơm', maHs: '84137090' }, pkgs: PACKAGES }),
    { kind: 'chay', goi: 2, text: '84137090 JP' });
  assert.deepEqual(await mk(['phap_luat', { maHs: '8413', doChac: 0.9 }]).hieu({ text: 'chú giải của 84137090', last: null, pkgs: PACKAGES }),
    { kind: 'chay', goi: 5, text: '8413' });
});

test('autoPick (dự phòng khi Gemini lỗi): từ khoá phải đứng thành từ — "nhập máy" không phải "áp mã"', async () => {
  const { autoPick } = await import('../router.js');
  const so = (q) => autoPick(q, PACKAGES).so;
  assert.equal(so('nhập máy bơm nước từ TQ về thì thuế bao nhiêu'), 1);
  assert.equal(so('nhập máy in về cần giấy phép không'), 1);
  assert.equal(so('hàng nhập máy nén khí'), 1);
  // Vẫn bắt đúng khi thật sự nói tới áp mã / giải trình / tham vấn
  assert.equal(so('hàng bị hải quan áp mã khác'), 7);
  assert.equal(so('soạn giải trình mã HS'), 7);
  assert.equal(so('áp mã sai thì sao'), 7);
  // Các nhánh khác không đổi
  assert.equal(so('kiểm tra nhãn hiệu nike'), 6);
  assert.equal(so('tiền lệ máy bơm'), 5);
  assert.equal(so('thuế máy bơm'), 2);
  // "brand" chỉ khi là từ riêng; "soat" không ăn vào "kiểm soát"? vẫn cần mã 8 số nên an toàn
  assert.equal(so('brandy rượu mạnh mã gì'), 1);
});

/** Khoá dự phòng giả lập: ghi lại yêu cầu, trả kết quả cố định (đã ở dạng llm2.chat trả về). */
function fakeDuPhong(kq) {
  const calls = [];
  return { calls, chat: async (req) => { calls.push(req); return typeof kq === 'function' ? kq(req) : kq; } };
}

test('dự phòng: Gemini 503 → chỉ thử 1 mẫu Gemini rồi chuyển khoá dự phòng; kết quả vẫn qua chuanHoa', async () => {
  const g = fakeGemini(() => ({ status: 503, body: {} }));
  const dp = fakeDuPhong({ text: '', call: { name: 'phan_loai', args: { tenHang: 'máy bơm nước', doChac: 0.9 } } });
  const brain = createBrain({ apiKey: 'k', fetchImpl: g.fetchImpl, duPhong: dp, log: {} });
  assert.deepEqual(await brain.hieu({ text: 'máy bơm nước mã gì', last: null, pkgs: PACKAGES }), { kind: 'chay', goi: 1, text: 'Tên hàng: máy bơm nước' });
  assert.equal(g.requests.length, 1);                        // không chờ thêm mẫu Gemini thứ hai
  assert.equal(dp.calls.length, 1);
  assert.match(dp.calls[0].system, /KHÔNG bịa dữ kiện/);
  assert.match(dp.calls[0].user, /máy bơm nước mã gì/);
  assert.equal(dp.calls[0].temperature, 0);
  assert.equal(dp.calls[0].tools.length, 9);
  // mã HS dự phòng tự đoán cũng bị bỏ như Gemini
  const dp2 = fakeDuPhong({ text: '', call: { name: 'thue_thu_tuc', args: { maHs: '33049930', doChac: 0.9 } } });
  const brain2 = createBrain({ apiKey: 'k', fetchImpl: fakeGemini(() => ({ status: 429 })).fetchImpl, duPhong: dp2, log: {} });
  assert.equal(await brain2.hieu({ text: 'thủ tục nhập khẩu mỹ phẩm', last: null, pkgs: PACKAGES }), null);
});

test('dự phòng: Gemini lỗi khoá (403) cũng chuyển; Gemini trả lời bình thường thì KHÔNG gọi dự phòng', async () => {
  const dp = fakeDuPhong({ text: '', call: { name: 'hoi_lai', args: { cauHoi: 'Bạn muốn tra gì?' } } });
  const b403 = createBrain({ apiKey: 'k', fetchImpl: fakeGemini(() => ({ status: 403 })).fetchImpl, duPhong: dp, log: {} });
  assert.deepEqual(await b403.hieu({ text: 'ơi', last: null, pkgs: PACKAGES }), { kind: 'hoi-lai', cauHoi: 'Bạn muốn tra gì?' });
  const dp2 = fakeDuPhong(null);
  const bOk = createBrain({ apiKey: 'k', fetchImpl: fakeGemini(() => goi('phan_loai', { tenHang: 'bút bi', doChac: 0.3 })).fetchImpl, duPhong: dp2, log: {} });
  assert.equal(await bOk.hieu({ text: 'bút bi', last: null, pkgs: PACKAGES }), null);   // Gemini trả lời (dù bị loại) → không tốn dự phòng
  assert.equal(dp2.calls.length, 0);
});

test('dự phòng: không có khoá Gemini nhưng có dự phòng → não vẫn bật, chạy thẳng dự phòng; dự phòng lỗi → null', async () => {
  const dp = fakeDuPhong({ text: '', call: { name: 'khac', args: { cauDan: 'Chào bạn!' } } });
  const brain = createBrain({ apiKey: '', duPhong: dp, fetchImpl: () => { throw new Error('không được gọi Gemini'); }, log: {} });
  assert.ok(brain);
  assert.deepEqual(await brain.hieu({ text: 'chào', last: null, pkgs: PACKAGES }), { kind: 'khac', cauDan: 'Chào bạn!' });
  assert.equal(createBrain({ apiKey: '', duPhong: dp, off: true, log: {} }), null);    // GEMINI_BRAIN=0 tắt cả hai
  const hong = createBrain({ apiKey: '', duPhong: fakeDuPhong(null), log: {} });
  assert.equal(await hong.hieu({ text: 'chào', last: null, pkgs: PACKAGES }), null);
});

test('LLM_CHINH=llm2: gọi khoá llm2 TRƯỚC, không tốn Gemini; llm2 lỗi (null) → Gemini cứu', async () => {
  const g = fakeGemini(() => goi('hoi_lai', { cauHoi: 'Gemini hỏi lại' }));
  const dp = fakeDuPhong({ text: '', call: { name: 'phan_loai', args: { tenHang: 'máy bơm nước', doChac: 0.9 } } });
  const brain = createBrain({ apiKey: 'k', fetchImpl: g.fetchImpl, duPhong: dp, uuTien: 'llm2', log: {} });
  assert.deepEqual(await brain.hieu({ text: 'máy bơm nước mã gì', last: null, pkgs: PACKAGES }), { kind: 'chay', goi: 1, text: 'Tên hàng: máy bơm nước' });
  assert.equal(dp.calls.length, 1);
  assert.equal(g.requests.length, 0);
  // llm2 trả lời nhưng bị luật loại (doChac thấp) → null, KHÔNG gọi thêm Gemini
  const g2 = fakeGemini(() => goi('hoi_lai', { cauHoi: 'x' }));
  const b2 = createBrain({ apiKey: 'k', fetchImpl: g2.fetchImpl, duPhong: fakeDuPhong({ text: '', call: { name: 'phan_loai', args: { tenHang: 'bút', doChac: 0.2 } } }), uuTien: 'llm2', log: {} });
  assert.equal(await b2.hieu({ text: 'bút', last: null, pkgs: PACKAGES }), null);
  assert.equal(g2.requests.length, 0);
  // llm2 lỗi mạng/khoá → Gemini trả lời thay
  const g3 = fakeGemini(() => goi('hoi_lai', { cauHoi: 'Gemini hỏi lại' }));
  const b3 = createBrain({ apiKey: 'k', fetchImpl: g3.fetchImpl, duPhong: fakeDuPhong(null), uuTien: 'llm2', log: {} });
  assert.deepEqual(await b3.hieu({ text: 'ơi', last: null, pkgs: PACKAGES }), { kind: 'hoi-lai', cauHoi: 'Gemini hỏi lại' });
  assert.equal(g3.requests.length, 1);
});

// Chỉ khai báo để npm test bắt được nếu ai xoá nhầm availablePackages khỏi Export — bộ não dùng nó lọc gói.
test('bối cảnh: PACKAGES đầy 7 gói, lọc theo công cụ vẫn chạy', () => {
  assert.equal(PACKAGES.length, 7);
  assert.equal(availablePackages(ALL).length, 7);
  assert.equal(availablePackages(new Set(['phan_loai_hs'])).map((p) => p.so).join(), '1');
});
