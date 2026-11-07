// T038 (US8): trong nhóm, mọi tin ra gắn đúng tên; người trùng tên được tách bằng hậu tố 2 ký tự cuối userId.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createEngine } from '../../core/engine.js';
import { createRegistry } from '../../core/registry.js';
import { groupNameTag } from '../../core/mention.js';
import { fakeChannel, fakeClock, fakeMcp } from '../helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z'; // 10:00 VN
const silent = { info() {}, error() {} };

/** Gói giả: cứ tin là trả lời. */
const echoPack = {
  id: 'echo', ten: 'Echo', version: '1', audience: 'public', priority: 50, match: () => true,
  async handle(turn) { return { replies: [{ text: 'trả lời ' + turn.text }], evidence: [] }; },
};

/** Gói giả có việc nền: tin bắt đầu "việc" thì tạo job, không trả lời. */
const jobPack = {
  id: 'jp', audience: 'public', priority: 50, match: () => true,
  async handle(turn) {
    if (turn.text.startsWith('việc')) return { replies: [], jobs: [{ maLuot: 'L-' + turn.userId, resultTool: 'kq' }] };
    return { replies: [{ text: 'trả lời ' + turn.text }] };
  },
  async onJobResult(job) { return { replies: [{ text: 'xong ' + job.maLuot }] }; },
};

function setup({ packs = [echoPack], script = {} } = {}) {
  const store = openStore(':memory:');
  const clock = fakeClock(START);
  const channel = fakeChannel();
  const mcp = fakeMcp(script);
  const registry = createRegistry(packs);
  const gate = createGate({ store, channel, now: clock.now });
  const engine = createEngine({ config: {}, store, channel, mcp, vision: null, registry, gate, now: clock.now, log: silent });
  return { store, clock, channel, mcp, engine };
}

/** Tin nhắn nhóm. */
const upd = ({ id, userId, userName, text }) => ({
  updateKey: id, event: 'message.text.received', chatId: 'g1', userId, userName,
  chatType: 'GROUP', text, photoUrl: null, caption: null, messageId: null,
});

const A = { userId: 'uA7f', userName: 'Nguyễn Văn A' };
const B = { userId: 'uB', userName: 'Nguyễn Văn B' };
const C = { userId: 'uC2c', userName: 'Nguyễn Văn A' }; // trùng tên với A

test('groupNameTag: tên trùng trong nhóm có hậu tố, tên không trùng thì không', () => {
  const members = [
    { userId: 'uA7f', displayName: 'Nguyễn Văn A' },
    { userId: 'uB', displayName: 'Nguyễn Văn B' },
    { userId: 'uC2c', displayName: 'Nguyễn Văn A' },
  ];
  assert.equal(groupNameTag({ isGroup: true, userName: 'Nguyễn Văn A', userId: 'uA7f', members }), '@Nguyễn Văn A ·7f\n');
  assert.equal(groupNameTag({ isGroup: true, userName: 'Nguyễn Văn A', userId: 'uC2c', members }), '@Nguyễn Văn A ·2c\n');
  assert.equal(groupNameTag({ isGroup: true, userName: 'Nguyễn Văn B', userId: 'uB', members }), '@Nguyễn Văn B\n');
});

test('groupNameTag: biên — không phải nhóm, không tên, không userId thì không hậu tố', () => {
  assert.equal(groupNameTag({ isGroup: false, userName: 'Nguyễn Văn A', userId: 'uA7f' }), '');
  assert.equal(groupNameTag({ isGroup: true, userName: '', userId: 'uA7f' }), '');
  const members = [
    { userId: 'uA7f', displayName: 'Nguyễn Văn A' },
    { userId: 'uC2c', displayName: 'Nguyễn Văn A' },
  ];
  assert.equal(groupNameTag({ isGroup: true, userName: 'Nguyễn Văn A', userId: null, members }), '@Nguyễn Văn A\n');
});

test('nhóm: 12 tin xen kẽ 3 người, mỗi tin gắn đúng tên (có hậu tố khi trùng)', async () => {
  const { engine, channel } = setup();
  const seq = [
    [A, 'hỏi A1'], [B, 'hỏi B1'], [C, 'hỏi C1'],
    [A, 'hỏi A2'], [B, 'hỏi B2'], [C, 'hỏi C2'],
    [A, 'hỏi A3'], [B, 'hỏi B3'], [C, 'hỏi C3'],
    [A, 'hỏi A4'], [B, 'hỏi B4'], [C, 'hỏi C4'],
  ];
  for (const [i, [who, text]] of seq.entries()) {
    await engine.process(upd({ id: `m${i + 1}`, userId: who.userId, userName: who.userName, text }));
  }
  // Tin đầu của A chưa có hậu tố: lúc đó trong nhóm chưa có ai trùng tên với A.
  assert.deepEqual(channel.sent.map((s) => s.text), [
    '@Nguyễn Văn A\ntrả lời hỏi A1',
    '@Nguyễn Văn B\ntrả lời hỏi B1',
    '@Nguyễn Văn A ·2c\ntrả lời hỏi C1',
    '@Nguyễn Văn A ·7f\ntrả lời hỏi A2',
    '@Nguyễn Văn B\ntrả lời hỏi B2',
    '@Nguyễn Văn A ·2c\ntrả lời hỏi C2',
    '@Nguyễn Văn A ·7f\ntrả lời hỏi A3',
    '@Nguyễn Văn B\ntrả lời hỏi B3',
    '@Nguyễn Văn A ·2c\ntrả lời hỏi C3',
    '@Nguyễn Văn A ·7f\ntrả lời hỏi A4',
    '@Nguyễn Văn B\ntrả lời hỏi B4',
    '@Nguyễn Văn A ·2c\ntrả lời hỏi C4',
  ]);
});

test('nhóm: kết quả việc nền gắn lại tên lúc gửi', async () => {
  const { engine, channel, clock } = setup({ packs: [jobPack], script: { kq: () => ({ ok: true, trangThai: 'XONG' }) } });
  await engine.process(upd({ id: 'j1', userId: A.userId, userName: A.userName, text: 'việc của A' }));
  await engine.process(upd({ id: 'j2', userId: C.userId, userName: C.userName, text: 'hỏi của C' }));
  clock.advance('6s');
  await engine.drain();
  assert.equal(channel.sent.at(-1).text, '@Nguyễn Văn A ·7f\nxong L-uA7f');
});

test('nhóm: việc nền của A không chặn B và C', async () => {
  const { engine, channel, store } = setup({ packs: [jobPack], script: { kq: () => ({ ok: true, trangThai: 'XONG' }) } });
  const r1 = await engine.process(upd({ id: 'k1', userId: A.userId, userName: A.userName, text: 'việc của A' }));
  assert.equal(r1.handled, 'jp');
  assert.equal(store.jobs.openFor('g1:uA7f', START), true);
  const r2 = await engine.process(upd({ id: 'k2', userId: B.userId, userName: B.userName, text: 'hỏi của B' }));
  const r3 = await engine.process(upd({ id: 'k3', userId: C.userId, userName: C.userName, text: 'hỏi của C' }));
  assert.equal(r2.handled, 'jp');
  assert.equal(r3.handled, 'jp');
  assert.deepEqual(channel.sent.map((s) => s.text), [
    '@Nguyễn Văn B\ntrả lời hỏi của B',
    '@Nguyễn Văn A ·2c\ntrả lời hỏi của C',
  ]);
  assert.ok(!channel.sent.some((s) => s.text.includes('xong L-uA7f')));
});
