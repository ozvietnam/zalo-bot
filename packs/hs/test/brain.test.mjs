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

// Chỉ khai báo để npm test bắt được nếu ai xoá nhầm availablePackages khỏi Export — bộ não dùng nó lọc gói.
test('bối cảnh: PACKAGES đầy 7 gói, lọc theo công cụ vẫn chạy', () => {
  assert.equal(PACKAGES.length, 7);
  assert.equal(availablePackages(ALL).length, 7);
  assert.equal(availablePackages(new Set(['phan_loai_hs'])).map((p) => p.so).join(), '1');
});
