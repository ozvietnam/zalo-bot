// Não biên tập (Gemini viết lại bản dài thành bản chốt): không cần mạng, fetch giả lập.
// Luật an toàn cần test đủ: mọi con số trong bản chốt phải có trong bản gốc (code kiểm, không tin Gemini);
// lỗi/kết quả dị → null để nơi gọi giữ bản đầy đủ như cũ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEditor, soDungChuan } from '../editor.js';

function fakeGemini(fn) {
  const requests = [];
  const fetchImpl = async (url, opts = {}) => {
    requests.push({ url, body: JSON.parse(opts.body) });
    const r = fn(requests.length, requests.at(-1));
    return { ok: r.status === 200, status: r.status, json: async () => r.body ?? {} };
  };
  return { requests, fetchImpl };
}
const text = (t) => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: t }] } }] } });

const GOC = `🔎 Phân loại: "Quạt tản nhiệt dùng cho tủ điện"
✅ Mã đề xuất:
1. 8414.59.49 (78%)
   Quạt tản nhiệt cho tủ điện, không có lưới bảo vệ
2. 8414.59.20 — Quạt có lưới bảo vệ
💰 Thuế — 8414.59.49 (xuất xứ CN)
Thuế NK thông thường: 22.5%
NK ưu đãi (MFN): 15%
ACFTA (hàng TQ): 10%
VAT: 8/10
📋 Thủ tục: không yêu cầu giấy phép`;

test('createEditor: không apiKey hoặc GEMINI_EDITOR=0 → null (bot giữ bản đầy đủ)', () => {
  assert.equal(createEditor({ apiKey: '', log: {} }), null);
  assert.equal(createEditor({ apiKey: 'k', off: true, log: {} }), null);
  assert.ok(createEditor({ apiKey: 'k', log: {} }));
});

test('soDungChuan: mọi dãy số trong bản chốt phải có trong bản gốc (bỏ dấu chấm/khoảng trắng)', () => {
  assert.ok(soDungChuan('Mã 8414.59.49, MFN 15%, VAT 8/10', GOC));
  assert.ok(soDungChuan('84145949', '8414.59.49'));            // khác cách viết dấu chấm vẫn khớp
  assert.ok(!soDungChuan('thuế 12%', GOC));                    // số bịa
  assert.ok(!soDungChuan('mã 8414.59', GOC));                  // mã cắt lở
  assert.ok(soDungChuan('không có số nào hết', GOC));          // không số → mặc nhiên đạt
});

test('chot: Gemini viết bản ngắn → làm đậm mã HS, yêu cầu đúng khuôn', async () => {
  const g = fakeGemini(() => text('✅ Mã: 8414.59.49 — quạt tản nhiệt cho tủ điện, không lưới bảo vệ.\nThuế MFN 15% · NK thường 22.5% · VAT 8/10.\n📋 Không yêu cầu giấy phép.'));
  const ed = createEditor({ apiKey: 'k', fetchImpl: g.fetchImpl, log: {} });
  const r = await ed.chot({ text: GOC });
  assert.match(r, /\{b\}8414\.59\.49\{\/b\}/);
  assert.match(r, /MFN 15%/);
  const b = g.requests[0].body;
  assert.match(b.systemInstruction.parts[0].text, /CHỈ dùng số/i);
  assert.match(b.contents[0].parts[0].text, /8414\.59\.49/);
  assert.equal(b.generationConfig.temperature, 0.1);
});

test('chot: bản chốt có số không có trong gốc → null (bỏ, không gửi)', async () => {
  const g = fakeGemini(() => text('Mã 8414.59.49, thuế 12%.'));
  const ed = createEditor({ apiKey: 'k', fetchImpl: g.fetchImpl, log: {} });
  assert.equal(await ed.chot({ text: GOC }), null);
});

test('chot: Gemini 503 cả hai mẫu → null; bản gốc quá ngắn → không tốn lượt gọi', async () => {
  const g = fakeGemini(() => ({ status: 503, body: { error: { message: 'overloaded' } } }));
  const ed = createEditor({ apiKey: 'k', fetchImpl: g.fetchImpl, log: {} });
  assert.equal(await ed.chot({ text: GOC }), null);
  assert.equal(g.requests.length, 2);
  const g2 = fakeGemini(() => text('ngắn'));
  const ed2 = createEditor({ apiKey: 'k', fetchImpl: g2.fetchImpl, log: {} });
  assert.equal(await ed2.chot({ text: 'Mã 84137090 thuế 0%' }), null);   // < 80 ký tự
  assert.equal(g2.requests.length, 0);
});

test('chot: Gemini thả thẻ định dạng hoặc quá dài → lược thẻ / bỏ kết quả', async () => {
  const g = fakeGemini(() => text('{b}Mã{/b} 8414.59.49 — MFN 15%.'));
  const ed = createEditor({ apiKey: 'k', fetchImpl: g.fetchImpl, log: {} });
  const r = await ed.chot({ text: GOC });
  assert.doesNotMatch(r, /\{b\}Mã/);                                // thẻ Gemini thả ra đã bị lược
  assert.match(r, /Mã \{b\}8414\.59\.49\{\/b\}/);                   // mã HS do BOT làm đậm
  const g2 = fakeGemini(() => text('Mã 8414.59.49 MFN 15%. ' + 'dài '.repeat(400)));
  const ed2 = createEditor({ apiKey: 'k', fetchImpl: g2.fetchImpl, log: {} });
  assert.equal(await ed2.chot({ text: GOC }), null);                     // > 1200 ký tự
});

function fakeDuPhong(kq) {
  const calls = [];
  return { calls, chat: async (req) => { calls.push(req); return kq; } };
}

test('dự phòng: Gemini 503 → 1 mẫu Gemini rồi khoá dự phòng; số vẫn bị code kiểm', async () => {
  const g = fakeGemini(() => ({ status: 503 }));
  const dp = fakeDuPhong({ text: 'Mã 8414.59.49 — MFN 15%.', call: null });
  const ed = createEditor({ apiKey: 'k', fetchImpl: g.fetchImpl, duPhong: dp, log: {} });
  assert.match(await ed.chot({ text: GOC }), /\{b\}8414\.59\.49\{\/b\}/);
  assert.equal(g.requests.length, 1);
  assert.match(dp.calls[0].system, /CHỈ dùng số/);
  assert.match(dp.calls[0].user, /KẾT QUẢ GỐC/);
  assert.equal(dp.calls[0].maxTokens, 400);
  const bia = createEditor({ apiKey: 'k', fetchImpl: g.fetchImpl, duPhong: fakeDuPhong({ text: 'Mã 8414.59.49, thuế 12%.', call: null }), log: {} });
  assert.equal(await bia.chot({ text: GOC }), null);                        // số bịa từ dự phòng → bỏ
});

test('dự phòng: Gemini trả bản chốt thì không gọi dự phòng; không khoá Gemini → dùng thẳng dự phòng', async () => {
  const dp = fakeDuPhong({ text: 'Mã 8414.59.49 — MFN 15%.', call: null });
  const ed = createEditor({ apiKey: 'k', fetchImpl: fakeGemini(() => text('Mã 8414.59.49, VAT 8/10.')).fetchImpl, duPhong: dp, log: {} });
  assert.match(await ed.chot({ text: GOC }), /VAT 8\/10/);
  assert.equal(dp.calls.length, 0);
  const chiDp = createEditor({ apiKey: '', duPhong: dp, log: {} });
  assert.ok(chiDp);
  assert.match(await chiDp.chot({ text: GOC }), /MFN 15%/);
  assert.equal(createEditor({ apiKey: '', duPhong: dp, off: true, log: {} }), null);
});

test('LLM_CHINH=llm2: biên tập bằng llm2 trước; llm2 lỗi → Gemini; llm2 bịa số → null, không gọi Gemini', async () => {
  const g = fakeGemini(() => text('Mã 8414.59.49, VAT 8/10.'));
  const ed = createEditor({ apiKey: 'k', fetchImpl: g.fetchImpl, duPhong: fakeDuPhong({ text: 'Mã 8414.59.49 — MFN 15%.', call: null }), uuTien: 'llm2', log: {} });
  assert.match(await ed.chot({ text: GOC }), /MFN 15%/);
  assert.equal(g.requests.length, 0);
  const ed2 = createEditor({ apiKey: 'k', fetchImpl: g.fetchImpl, duPhong: fakeDuPhong(null), uuTien: 'llm2', log: {} });
  assert.match(await ed2.chot({ text: GOC }), /VAT 8\/10/);
  assert.equal(g.requests.length, 1);
  const g3 = fakeGemini(() => text('Mã 8414.59.49, VAT 8/10.'));
  const ed3 = createEditor({ apiKey: 'k', fetchImpl: g3.fetchImpl, duPhong: fakeDuPhong({ text: 'Thuế 12%.', call: null }), uuTien: 'llm2', log: {} });
  assert.equal(await ed3.chot({ text: GOC }), null);
  assert.equal(g3.requests.length, 0);
});

// Issue #168: số hiệu văn bản trong bản chốt phải có trong bản gốc. Kiểm số (`soDungChuan`) không bắt
// được "38/2015/TT-BTC" vì nó tách thành 38 và 2015 — hai số có thể tình cờ có trong bản gốc.
test('chot: bản chốt tự thêm số hiệu văn bản không có trong gốc → null (chống bịa căn cứ)', async () => {
  const goc = `${GOC}\nNăm 2015 có 38 dòng hàng tương tự.`;
  const g = fakeGemini(() => text('Mã 8414.59.49, MFN 15% (Thông tư 38/2015/TT-BTC).'));
  const ed = createEditor({ apiKey: 'k', fetchImpl: g.fetchImpl, log: {} });
  assert.equal(await ed.chot({ text: goc }), null);
  const g2 = fakeGemini(() => text('Mã 8414.59.49, MFN 15% (26/2023/NĐ-CP).'));
  const ed2 = createEditor({ apiKey: 'k', fetchImpl: g2.fetchImpl, log: {} });
  assert.match(await ed2.chot({ text: `${GOC}\nCăn cứ: 26/2023/NĐ-CP` }), /26\/2023\/NĐ-CP/);
});
