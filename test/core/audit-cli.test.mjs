// T029 — HÀNH VI CLI tra audit (scripts/audit.mjs). Chạy CLI THẬT bằng child_process, fixture dựng bằng lõi thật.
// (Che bí mật nằm ở test/core/audit-masking.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { chay, cacTurn, fx } from '../helpers/audit-fixture.mjs';

test('T029 · --turn in ra inbound → route → gate → outbound theo giờ VN', async () => {
  const r = await chay(['--db', fx.dbPath, '--turn', 'm1']);
  assert.equal(r.code, 0, r.stderr);
  const lines = r.stdout.trim().split('\n').filter(Boolean);
  assert.ok(lines.length >= 4, r.stdout);
  assert.ok(r.stdout.includes('inbound'));
  assert.ok(r.stdout.includes('route hs'));
  assert.ok(r.stdout.includes('gate send ok'));
  assert.ok(r.stdout.includes('outbound'));
  // Thứ tự dòng: inbound → route → gate → outbound
  const thuTu = lines.map((l) => l.split(/\s{2}/)[1]);
  assert.ok(thuTu.indexOf('inbound') < thuTu.indexOf('route hs'), r.stdout);
  assert.ok(thuTu.indexOf('route hs') < thuTu.indexOf('gate send ok'), r.stdout);
  assert.ok(thuTu.indexOf('gate send ok') < thuTu.indexOf('outbound'), r.stdout);
  // Giờ VN của 2026-11-07T03:00:00.000Z
  assert.ok(r.stdout.includes('2026-11-07 10:00:00'), r.stdout);
});

test('T029 · giờ VN không phụ thuộc TZ của máy', async () => {
  const a = await chay(['--db', fx.dbPath, '--turn', 'm1'], { env: { TZ: 'UTC' } });
  const b = await chay(['--db', fx.dbPath, '--turn', 'm1'], { env: { TZ: 'Asia/Tokyo' } });
  assert.equal(a.code, 0, a.stderr);
  assert.equal(b.code, 0, b.stderr);
  assert.equal(a.stdout, b.stdout);
});

test('T029 · --chat --limit lấy đúng N lượt mới nhất, lượt mới nhất ở trên', async () => {
  const r = await chay(['--db', fx.dbPath, '--chat', 'c1', '--limit', '5']);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(cacTurn(r.stdout), ['m7', 'm6', 'm5', 'm4', 'm3']);
});

test('T029 · lượt không có trong db → exit khác 0, stdout rỗng, stderr có lý do', async () => {
  const r = await chay(['--db', fx.dbPath, '--turn', 'khong-co-that']);
  assert.notEqual(r.code, 0);
  assert.equal(r.stdout, '');
  assert.ok(r.stderr.includes('không thấy lượt'), r.stderr);
});

test('T029 · db không tồn tại → exit khác 0, không rò stack trace', async () => {
  const r = await chay(['--db', join(fx.dir, 'khong-ton-tai.db'), '--turn', 'm1']);
  assert.notEqual(r.code, 0);
  assert.ok(r.stderr.includes('audit:'), r.stderr);
  assert.ok(!/\bat .*:\d+:\d+/.test(r.stderr), `rò stack:\n${r.stderr}`);
  assert.ok(!r.stderr.includes('Error:'), `rò stack:\n${r.stderr}`);
});

test('T029 · db rỗng (chưa có bảng audit) → exit khác 0, không rò stack trace', async () => {
  const rong = join(fx.dir, 'rong.db');
  writeFileSync(rong, ''); // tệp 0 byte: SQLite mở được nhưng chưa có bảng audit
  const r = await chay(['--db', rong, '--turn', 'm1']);
  assert.notEqual(r.code, 0);
  assert.ok(r.stderr.includes('audit:'), r.stderr);
  assert.ok(!/\bat .*:\d+:\d+/.test(r.stderr), `rò stack:\n${r.stderr}`);
  assert.ok(!r.stderr.includes('Error:'), `rò stack:\n${r.stderr}`);
});

test('T029 · --help in hướng dẫn ra stdout, exit 0', async () => {
  const r = await chay(['--help']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes('--turn'), r.stdout);
  assert.ok(r.stdout.includes('--chat'), r.stdout);
});

test('T029 · --help có dòng npm run --silent (stdout sạch, không banner npm)', async () => {
  const r = await chay(['--help']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes('npm run --silent audit'), r.stdout);
});

test('T029 · --help nhắc dấu -- khi chạy qua npm', async () => {
  const r = await chay(['--help']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes('dấu --'), r.stdout);
});

test('T029 · chạy đúng dạng qua npm: npm run audit -- --turn m1', async () => {
  const r = await chay([], { cmd: 'npm', cmdArgs: ['run', 'audit', '--', '--turn', 'm1'], env: { DATA_DIR: fx.dir } });
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes('route hs'), r.stdout);
});

test('T029 · CLI chỉ đọc: tệp db không đổi sau khi chạy', async () => {
  const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex');
  const truoc = md5(fx.dbPath);
  const r = await chay(['--db', fx.dbPath, '--turn', 'm1']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(md5(fx.dbPath), truoc, 'CLI đã sửa tệp db (vi phạm cam kết chỉ đọc)');
});

test('T029 · nhóm lượt không gắn turn_id (NULL) tính vào --limit', async () => {
  const r = await chay(['--db', fx.dbPath, '--chat', 'c1', '--limit', '5']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(cacTurn(r.stdout).length <= 5, `in quá 5 lượt:\n${r.stdout}`);
  // Nhóm NULL là nhóm mới nhất ở c5 → phải chiếm một suất trong --limit 2.
  const r5 = await chay(['--db', fx.dbPath, '--chat', 'c5', '--limit', '2']);
  assert.equal(r5.code, 0, r5.stderr);
  assert.ok(cacTurn(r5.stdout).length <= 2, `in quá 2 lượt:\n${r5.stdout}`);
});

test('T029 · lượt bị cửa chặn (trùng nội dung) → in "gate drop", không phải "gate send ok"', async () => {
  const r = await chay(['--db', fx.dbPath, '--turn', 'm7']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes('gate drop'), r.stdout);
  assert.ok(!r.stdout.includes('gate send ok'), r.stdout);
});

test('T029 · cờ sai → hướng dẫn ra stderr, exit 1, hướng dẫn ghi đúng dạng dùng qua npm', async () => {
  const r = await chay(['--db', fx.dbPath, '--khong-co-that']);
  assert.notEqual(r.code, 0);
  assert.ok(r.stderr.includes('npm run audit -- --chat <chat_id> [--limit <n>]'), r.stderr);
  const r2 = await chay(['--db', fx.dbPath, '--turn', 'm1', '--chat', 'c1']);
  assert.notEqual(r2.code, 0);
  assert.ok(r2.stderr.includes('npm run audit -- --chat <chat_id> [--limit <n>]'), r2.stderr);
  const r3 = await chay(['--db', fx.dbPath, '--chat', 'c1', '--limit', 'x']);
  assert.notEqual(r3.code, 0);
});

test('T029 · --limit quá lớn → báo lỗi rõ ràng, exit 1, stdout rỗng (vòng 5 QA)', async () => {
  const r = await chay(['--db', fx.dbPath, '--chat', 'c1', '--limit', '1000000']);
  assert.equal(r.code, 1);
  assert.equal(r.stdout, '');
  assert.ok(r.stderr.includes('--limit không được vượt quá 1000'), r.stderr);
  assert.ok(r.stderr.includes('1000000'), r.stderr);
  assert.ok(!r.stderr.includes('không đọc được db'), `thông báo sai:\n${r.stderr}`);
  // Trần đúng bằng 1000 thì vẫn chạy được.
  const ok = await chay(['--db', fx.dbPath, '--chat', 'c1', '--limit', '1000']);
  assert.equal(ok.code, 0, ok.stderr);
});

test('T029 · nhận cả dạng --flag=value', async () => {
  const r = await chay([`--db=${fx.dbPath}`, '--turn=m1']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes('route hs'), r.stdout);
});
