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
