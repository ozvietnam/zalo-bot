import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadPacks, createRegistry } from '../../core/registry.js';

const mk = (o) => ({ ten: o.id, version: '1.0.0', audience: 'public', priority: 0, match: () => true, handle: async () => ({ replies: [] }), ...o });

async function tmpPacks(defs) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'packs-'));
  for (const [name, src] of Object.entries(defs)) {
    await fs.mkdir(path.join(dir, name));
    if (src != null) await fs.writeFile(path.join(dir, name, 'index.js'), src);
  }
  return dir;
}
const packSrc = (id, extra = '') => `export default { id: ${JSON.stringify(id)}, async handle() { return { replies: [] }; }, priority: 1, audience: 'public', match: () => true, ${extra} };`;

test('loadPacks: nạp thư mục có index.js, bỏ thư mục không có', async () => {
  const dir = await tmpPacks({ a: packSrc('a'), b: packSrc('b'), rong: null });
  await fs.writeFile(path.join(dir, 'file.txt'), 'x');
  const packs = await loadPacks(dir);
  assert.deepEqual(packs.map((p) => p.id).sort(), ['a', 'b']);
});

test('loadPacks: thư mục không tồn tại thì trả []', async () => {
  assert.deepEqual(await loadPacks(path.join(os.tmpdir(), 'khong-co-' + Date.now())), []);
});

test('loadPacks: trùng id hoặc thiếu id/handle thì ném lỗi', async () => {
  await assert.rejects(loadPacks(await tmpPacks({ a: packSrc('x'), b: packSrc('x') })), /trùng|x/);
  await assert.rejects(loadPacks(await tmpPacks({ a: 'export default { handle() {} };' })), /id/);
  await assert.rejects(loadPacks(await tmpPacks({ a: "export default { id: 'a' };" })), /handle/);
});

test('pick: audience staff chỉ cho isStaff, priority lớn trước', () => {
  const a = mk({ id: 'a', priority: 5 });
  const b = mk({ id: 'b', priority: 10, audience: 'staff' });
  const reg = createRegistry([a, b]);
  assert.equal(reg.pick({ isStaff: false }, {}), a);
  assert.equal(reg.pick({ isStaff: true }, {}), b);
});

test('pick: match false thì bỏ qua; không gói nào thì null', () => {
  const a = mk({ id: 'a', priority: 9, match: () => false });
  const b = mk({ id: 'b', priority: 1 });
  assert.equal(createRegistry([a, b]).pick({}, {}), b);
  assert.equal(createRegistry([a]).pick({}, {}), null);
});

test('available: requiresTools ⊆ tools; tools = null thì không lọc', () => {
  const p = mk({ id: 'p', requiresTools: ['x'] });
  const q = mk({ id: 'q' });
  const reg = createRegistry([p, q]);
  assert.deepEqual(reg.available(new Set(['y']), {}).map((x) => x.id), ['q']);
  assert.deepEqual(reg.available(new Set(['x', 'y']), {}).map((x) => x.id), ['p', 'q']);
  assert.deepEqual(reg.available(null, {}).map((x) => x.id), ['p', 'q']);
});

test('pick: dùng ctx.tools để ẩn gói thiếu công cụ', () => {
  const p = mk({ id: 'p', priority: 9, requiresTools: ['x'] });
  const q = mk({ id: 'q', priority: 1 });
  const reg = createRegistry([p, q]);
  assert.equal(reg.pick({}, { tools: new Set(['y']) }), q);
  assert.equal(reg.pick({}, { tools: null }), p);
});
