import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../../core/store.js';

test('T701: scripts/giam-sat.mjs không được import hoặc gọi openStore và phải có readOnly: true', () => {
  const content = readFileSync('scripts/giam-sat.mjs', 'utf8');
  assert.equal(content.includes('openStore'), false, 'Không được sử dụng openStore trong scripts/giam-sat.mjs');
  assert.equal(content.includes('readOnly: true'), true, 'Phải mở db với tùy chọn readOnly: true');
});

test('T701: chạy giam-sat --dry-run không thay đổi mtime hay hash của db đã có dữ liệu', () => {
  const tmpDir = join(tmpdir(), `test-giam-sat-readonly-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(tmpDir, { recursive: true });
  const dbPath = join(tmpDir, 'bot.db');

  try {
    // 1. Tạo db có schema bằng openStore rồi đóng lại
    const store = openStore(dbPath);
    store.close();

    const hashTruoc = createHash('sha256').update(readFileSync(dbPath)).digest('hex');
    const statTruoc = statSync(dbPath);

    // 2. Chạy giam-sat với DATA_DIR tạm và cờ --dry-run
    const res = spawnSync(process.execPath, [
      'scripts/giam-sat.mjs',
      '--dry-run',
      '--ngay=2026-11-06'
    ], {
      env: { ...process.env, DATA_DIR: tmpDir },
      encoding: 'utf8'
    });

    assert.equal(res.status, 0, `giam-sat thất bại: ${res.stderr || res.stdout}`);

    const hashSau = createHash('sha256').update(readFileSync(dbPath)).digest('hex');
    const statSau = statSync(dbPath);

    assert.equal(hashSau, hashTruoc, 'Tệp bot.db không được thay đổi nội dung (hash SHA-256 phải giữ nguyên)');
    assert.equal(statSau.size, statTruoc.size, 'Kích thước tệp bot.db không đổi');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T701: db rỗng chưa có bảng thì script báo lỗi rõ ràng và thoát với mã khác 0, không tự tạo bảng', () => {
  const tmpDir = join(tmpdir(), `test-giam-sat-empty-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(tmpDir, { recursive: true });
  const dbPath = join(tmpDir, 'bot.db');

  try {
    // Tạo db rỗng không có bảng
    const emptyDb = new DatabaseSync(dbPath);
    emptyDb.close();

    const res = spawnSync(process.execPath, [
      'scripts/giam-sat.mjs',
      '--dry-run',
      '--ngay=2026-11-06'
    ], {
      env: { ...process.env, DATA_DIR: tmpDir },
      encoding: 'utf8'
    });

    assert.notEqual(res.status, 0, 'Phải thoát với mã khác 0 khi db chưa có bảng');
    const output = (res.stderr || '') + (res.stdout || '');
    assert.match(output, /chưa có bảng/i, 'Phải có thông báo lỗi chỉ rõ db chưa có bảng');

    // Kiểm tra xem script có tự tạo bảng không
    const checkDb = new DatabaseSync(dbPath, { readOnly: true });
    const tables = checkDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    checkDb.close();
    assert.equal(tables.length, 0, 'Script không được tự tạo bảng nào trong db rỗng');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
