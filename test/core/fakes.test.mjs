import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeChannel, fakeMcp, fakeClock } from '../helpers/fakes.mjs';

test('fakeClock: advance và set', () => {
  const c = fakeClock('2026-11-04T00:00:00Z');
  c.advance('10m');
  assert.equal(c.now().toISOString(), '2026-11-04T00:10:00.000Z');
  c.advance('2h');
  assert.equal(c.now().toISOString(), '2026-11-04T02:10:00.000Z');
  c.advance(1000);
  assert.equal(c.now().toISOString(), '2026-11-04T02:10:01.000Z');
  c.set('2026-12-01T00:00:00Z');
  assert.equal(c.now().toISOString(), '2026-12-01T00:00:00.000Z');
});

test('fakeMcp: ghi calls và chạy script', async () => {
  const m = fakeMcp({ tra_thue: () => ({ ok: true }) });
  const r = await m.callTool('tra_thue', {});
  assert.deepEqual(r, { ok: true });
  assert.equal(m.calls.length, 1);
  await assert.rejects(() => m.callTool('khong_co', {}), /khong_co/);
  assert.deepEqual((await m.listTools()).map((t) => t.name), ['tra_thue']);
});

test('fakeChannel: ghi sent, failOn ném lỗi', async () => {
  const ch = fakeChannel({ failOn: (chatId, text, n) => n === 2 });
  assert.equal(ch.maxText, 2000);
  await ch.sendText('c1', 'a');
  await assert.rejects(() => ch.sendText('c1', 'b'));
  await ch.sendText('c1', 'c');
  assert.deepEqual(ch.sent, [{ chatId: 'c1', text: 'a' }, { chatId: 'c1', text: 'c' }]);
});
