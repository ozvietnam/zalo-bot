// Khoá dự phòng (cổng LLM chuẩn OpenAI /chat/completions): không cần mạng, fetch giả lập.
// Cần test: thiếu cấu hình → null; khuôn request đúng chuẩn OpenAI; lỗi/kết quả dị → null, không ném lỗi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLlm2, thuongHoa } from '../llm2.js';

function fakeApi(fn) {
  const requests = [];
  const fetchImpl = async (url, opts = {}) => {
    requests.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
    const r = fn(requests.length, requests.at(-1));
    if (r instanceof Error) throw r;
    return { ok: r.status === 200, status: r.status, json: async () => r.body ?? {} };
  };
  return { requests, fetchImpl };
}

test('createLlm2: thiếu địa chỉ, khoá hoặc mẫu → null (tắt dự phòng)', () => {
  assert.equal(createLlm2({ baseUrl: '', apiKey: 'k', model: 'm', log: {} }), null);
  assert.equal(createLlm2({ baseUrl: 'https://x/v1', apiKey: '', model: 'm', log: {} }), null);
  assert.equal(createLlm2({ baseUrl: 'https://x/v1', apiKey: 'k', model: '', log: {} }), null);
  assert.ok(createLlm2({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm', log: {} }));
});

test('thuongHoa: kiểu Gemini (OBJECT/STRING) → JSON Schema chữ thường, giữ nguyên phần còn lại', () => {
  assert.deepEqual(thuongHoa({ type: 'OBJECT', properties: { a: { type: 'STRING', description: 'Mô tả' }, b: { type: 'NUMBER' } }, required: ['b'] }),
    { type: 'object', properties: { a: { type: 'string', description: 'Mô tả' }, b: { type: 'number' } }, required: ['b'] });
});

test('chat có công cụ: đúng khuôn OpenAI, đọc tool_calls (arguments dạng chuỗi JSON)', async () => {
  const api = fakeApi(() => ({ status: 200, body: { choices: [{ message: { content: null,
    tool_calls: [{ type: 'function', function: { name: 'hoi_lai', arguments: '{"cauHoi":"Mã HS nào?"}' } }] } }] } }));
  const llm = createLlm2({ baseUrl: 'https://gw.example/v1/', apiKey: 'sk-test', model: 'mau-a', fetchImpl: api.fetchImpl, log: {} });
  const r = await llm.chat({ system: 'HỆ THỐNG', user: 'câu khách', temperature: 0,
    tools: [{ name: 'hoi_lai', description: 'hỏi lại', parameters: { type: 'OBJECT', properties: { cauHoi: { type: 'STRING' } }, required: ['cauHoi'] } }] });
  assert.deepEqual(r, { text: '', call: { name: 'hoi_lai', args: { cauHoi: 'Mã HS nào?' } } });
  const q = api.requests[0];
  assert.equal(q.url, 'https://gw.example/v1/chat/completions');
  assert.equal(q.headers.Authorization, 'Bearer sk-test');
  assert.equal(q.body.model, 'mau-a');
  assert.equal(q.body.temperature, 0);
  assert.deepEqual(q.body.messages, [{ role: 'system', content: 'HỆ THỐNG' }, { role: 'user', content: 'câu khách' }]);
  assert.equal(q.body.tool_choice, 'required');
  assert.deepEqual(q.body.tools[0], { type: 'function', function: { name: 'hoi_lai', description: 'hỏi lại',
    parameters: { type: 'object', properties: { cauHoi: { type: 'string' } }, required: ['cauHoi'] } } });
});

test('chat chữ thường: trả text, gửi max_tokens, không gửi tools', async () => {
  const api = fakeApi(() => ({ status: 200, body: { choices: [{ message: { content: '  Bản chốt  ' } }] } }));
  const llm = createLlm2({ baseUrl: 'https://gw.example/v1', apiKey: 'k', model: 'm', fetchImpl: api.fetchImpl, log: {} });
  assert.deepEqual(await llm.chat({ user: 'x', maxTokens: 400 }), { text: 'Bản chốt', call: null });
  assert.equal(api.requests[0].body.max_tokens, 400);
  assert.equal(api.requests[0].body.tools, undefined);
  assert.deepEqual(api.requests[0].body.messages, [{ role: 'user', content: 'x' }]);
});

test('chat: lỗi HTTP, lỗi mạng, khuôn dị → null; arguments hỏng → args null', async () => {
  const mk = (fn) => createLlm2({ baseUrl: 'https://gw/v1', apiKey: 'k', model: 'm', fetchImpl: fakeApi(fn).fetchImpl, log: {} });
  assert.equal(await mk(() => ({ status: 401, body: { error: 'bad key' } })).chat({ user: 'x' }), null);
  assert.equal(await mk(() => new Error('ECONNRESET')).chat({ user: 'x' }), null);
  assert.equal(await mk(() => ({ status: 200, body: { foo: 1 } })).chat({ user: 'x' }), null);
  const r = await mk(() => ({ status: 200, body: { choices: [{ message: { tool_calls: [{ function: { name: 'khac', arguments: '{hỏng' } }] } }] } })).chat({ user: 'x' });
  assert.deepEqual(r, { text: '', call: { name: 'khac', args: null } });
});
