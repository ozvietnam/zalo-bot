// eval/run.mjs (T030): thư mục rỗng → "eval: 0/0" thoát 0; kịch bản sai → thoát 1 và in tên kịch bản; kịch bản đúng → đạt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (dir) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'eval/run.mjs', '--dir', dir], { encoding: 'utf8' });
const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';

test('eval: thư mục rỗng → "eval: 0/0", thoát 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-'));
  try {
    const r = run(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /eval: 0\/0/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('eval: kịch bản đúng đạt; kịch bản cố ý sai (count 2 cho webhook gửi lại) → thoát 1, in tên', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-'));
  const lai = { step: 'in', update: { id: 'w1', text: 'xin chào' } };
  try {
    writeFileSync(join(dir, 'dung.jsonl'), jsonl([lai, lai, { step: 'expect', sentTo: 'c1', count: 1 }]));
    writeFileSync(join(dir, 'retry-sai.jsonl'), jsonl([lai, lai, { step: 'expect', sentTo: 'c1', count: 2 }]));
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /eval: 1\/2/);
    assert.match(r.stdout, /✗ retry-sai/);
    assert.match(r.stdout, /✓ dung/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('eval: bước lạ hoặc JSON hỏng → kịch bản trượt, có lý do', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-'));
  try {
    writeFileSync(join(dir, 'la.jsonl'), jsonl([{ step: 'bay' }]));
    writeFileSync(join(dir, 'hong.jsonl'), '{khong phai json\n');
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /✗ la: .*bay/);
    assert.match(r.stdout, /✗ hong: /);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('eval: hỗ trợ bước staff thực hiện lệnh nhân viên', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-'));
  try {
    writeFileSync(join(dir, 'staff.jsonl'), jsonl([
      { step: 'in', update: { id: 'm1', text: 'gặp nhân viên' } },
      { step: 'expect', sentTo: 'c1', count: 1, match: 'hotline OZ' },
      { step: 'staff', text: '/tl c1 Chào bạn, mình là nhân viên OZ hỗ trợ bạn nhé' },
      { step: 'expect', sentTo: 'c1', count: 2, match: 'hỗ trợ bạn nhé' },
      { step: 'in', update: { id: 'm2', text: 'alo bot' } },
      { step: 'expect', sentTo: 'c1', count: 2 },
      { step: 'staff', text: '/tra-bot c1' },
      { step: 'in', update: { id: 'm3', text: 'xin chào' } },
      { step: 'expect', sentTo: 'c1', count: 3, match: 'tra cứu' },
    ]));
    const r = run(dir);
    assert.equal(r.status, 0, r.stdout + '\n' + r.stderr);
    assert.match(r.stdout, /✓ staff/);
    assert.match(r.stdout, /eval: 1\/1/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('eval: T040 — SC-008 tự động đối chiếu messages và in số tin vào + ra', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-'));
  const lai = { step: 'in', update: { id: 'w1', text: 'xin chào' } };
  try {
    writeFileSync(join(dir, 'dung.jsonl'), jsonl([lai, { step: 'expect', sentTo: 'c1', count: 1 }]));
    const r = run(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /✓ dung \(c1: vào 1 \+ ra 1 = 2\)/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('eval: T040 — bước expect có trường messages kiểm tra đúng số dòng', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-'));
  const lai = { step: 'in', update: { id: 'w1', text: 'xin chào' } };
  try {
    writeFileSync(join(dir, 'dung-msg.jsonl'), jsonl([lai, { step: 'expect', sentTo: 'c1', messages: 2 }]));
    writeFileSync(join(dir, 'sai-msg.jsonl'), jsonl([lai, { step: 'expect', sentTo: 'c1', messages: 99 }]));
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /✓ dung-msg/);
    assert.match(r.stdout, /✗ sai-msg: .*messages cần 99, có 2/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('eval: T040 — checkMessages phát hiện lệch số tin hoặc lọt tin bị drop/reject', async () => {
  const { checkMessages } = await import('../../eval/run.mjs');
  const { openStore } = await import('../../core/store.js');
  const tmp = mkdtempSync(join(tmpdir(), 'eval-chk-'));
  const dbPath = join(tmp, 'test.db');
  try {
    const store = openStore(dbPath);
    // Chuẩn bị 1 tin inbox done và 1 tin outbox sent
    store.inbox.insertIgnore({ update_key: 'k1', chat_id: 'c1', user_id: 'u1', raw: '{}', status: 'pending', received_at: '2026-11-04T03:00:00Z' });
    store.inbox.claim('k1', '2026-11-04T03:00:01Z');
    store.inbox.markDone('k1', '2026-11-04T03:00:02Z');
    const outId = store.outbox.insert({
      idem_key: 'idem1', conv_id: 'c1', chat_id: 'c1', turn_id: 'k1', kind: 'reply', text: 'bot tl',
      decision: 'send', reason: null, status: 'sent', created_at: '2026-11-04T03:00:02Z', sent_at: '2026-11-04T03:00:03Z',
    });
    // Ghi messages đúng: 1 khách + 1 bot
    store.messages.add({ conv_id: 'c1', chat_id: 'c1', turn_id: 'k1', speaker: 'khach', text: 'khach', at: '2026-11-04T03:00:00Z' });
    store.messages.add({ conv_id: 'c1', chat_id: 'c1', turn_id: 'k1', speaker: 'bot', text: 'bot tl', outbox_id: outId, at: '2026-11-04T03:00:03Z' });
    store.close();

    const okRes = checkMessages(dbPath, 'staff-chat');
    assert.equal(okRes.ok, true);
    assert.deepEqual(okRes.stats, [{ chatId: 'c1', inDone: 1, outSent: 1, msgTotal: 2 }]);

    // Thử làm lệch: thêm 1 tin rác vào messages
    const store2 = openStore(dbPath);
    store2.messages.add({ conv_id: 'c1', chat_id: 'c1', turn_id: 'k2', speaker: 'khach', text: 'thừa', at: '2026-11-04T03:00:04Z' });
    store2.close();

    const failRes = checkMessages(dbPath, 'staff-chat');
    assert.equal(failRes.ok, false);
    assert.match(failRes.why, /SC-008: phòng c1/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});




// Issue #168: kiểm máy chống bịa chạy trên MỌI kịch bản — số hiệu lạ trong tin gửi khách là trượt.
test('eval: kiemChongBia — số hiệu không có trong dữ liệu Cổng → trượt, có trong Cổng/lời khách/mẫu gói → đạt', async () => {
  const { kiemChongBia } = await import('../../eval/run.mjs');
  const cong = [{ ok: true, data: { canCuChiTiet: { mfn: { vanBan: '26/2023/NĐ-CP' } } } }];
  assert.equal(kiemChongBia([{ chatId: 'c1', text: 'Thuế NK 25% (26/2023/NĐ-CP)' }], [cong, [], []]), null);
  assert.match(kiemChongBia([{ chatId: 'c1', text: 'Thuế NK 25% (NĐ 26/2023), theo TT 38/2015/TT-BTC' }], [cong, [], []]), /chống bịa: .*38\/2015\/TT-BTC/);
  assert.equal(kiemChongBia([{ chatId: 'c1', text: 'Dạ văn bản 57/2022/NĐ-CP anh hỏi ạ' }], [[], ['hiệu lực 57/2022/NĐ-CP'], []]), null);
});
