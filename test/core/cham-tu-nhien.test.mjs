// test/core/cham-tu-nhien.test.mjs — bộ chấm độ tự nhiên theo hồ sơ giọng Quyên (issue #168, phần 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chamLuat, chamLlm, bangDiem } from '../../scripts/cham-tu-nhien.mjs';

test('chamLuat: tin đúng giọng Quyên được 5; tin khuôn máy bị trừ đúng lý do', () => {
  assert.equal(chamLuat('Dạ máy xay sinh tố thì mã phù hợp nhất là {b}8509.40.00{/b} anh/chị nhé.\n• Thuế NK 25% (26/2023/NĐ-CP)').diem, 5);
  const xau = chamLuat('**Reasons:** abc\n💰💰💰\nGõ "menu" để xem các gói');
  assert.ok(xau.diem <= 2, JSON.stringify(xau));
  assert.match(xau.lyDo, /markdown/);
  assert.match(xau.lyDo, /tiếng Anh/);
  const dai = Array.from({ length: 10 }, (_, i) => `Dạ dòng ${i} ạ anh/chị`).join('\n');
  assert.equal(chamLuat(dai).diem, 4);
  assert.equal(chamLuat(dai, { choPhepDai: true }).diem, 5);
});

test('chamLlm: đọc JSON điểm của Gemini; lỗi mạng hoặc điểm ngoài thang → null', async () => {
  const tra = (body, ok = true) => async () => ({ ok, json: async () => ({ candidates: [{ content: { parts: [{ text: body }] } }] }) });
  assert.deepEqual(await chamLlm('Dạ em chào anh/chị ạ', { apiKey: 'k', fetchImpl: tra('{"diem":4,"lyDo":"tự nhiên"}') }), { diem: 4, lyDo: 'tự nhiên' });
  assert.equal(await chamLlm('x', { apiKey: 'k', fetchImpl: tra('{"diem":9}') }), null);
  assert.equal(await chamLlm('x', { apiKey: 'k', fetchImpl: tra('', false) }), null);
  assert.equal(await chamLlm('x', { apiKey: 'k', fetchImpl: async () => { throw new Error('mạng'); } }), null);
});

test('bangDiem: tính trung bình và in bảng Markdown', () => {
  const { tb, md } = bangDiem([{ kichBan: 'a', buoc: 1, diem: 5, lyDo: 'ok', text: 'Dạ' }, { kichBan: 'a', buoc: 2, diem: 3, lyDo: 'dài', text: 'Dạ' }]);
  assert.equal(tb, 4);
  assert.match(md, /Trung bình: 4\.00 \/ 5/);
});
