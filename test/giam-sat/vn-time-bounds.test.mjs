import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { layKhoangNgayVnUtc } from '../../scripts/giam-sat/time-util.js';
import { vnDateKey } from '../../core/time.js';

test('T702: layKhoangNgayVnUtc chuyển đổi chính xác mốc ngày VN sang UTC', () => {
  const { ngayVn, dauNgayUtc, cuoiNgayUtc } = layKhoangNgayVnUtc('2026-11-06');
  assert.equal(ngayVn, '2026-11-06');
  assert.equal(dauNgayUtc, '2026-11-05T17:00:00.000Z');
  assert.equal(cuoiNgayUtc, '2026-11-06T16:59:59.999Z');
});

test('T702: khi không truyền ngày, trả về ngày VN hiện tại và độc lập với TZ máy (UTC và America/New_York)', () => {
  const kqMacDinh = layKhoangNgayVnUtc();
  const ngayVnHienTai = vnDateKey(new Date());
  assert.equal(kqMacDinh.ngayVn, ngayVnHienTai, 'ngayVn phải khớp với vnDateKey(now)');

  // Kiểm tra chạy dưới 2 timezone khác nhau qua child_process
  const scriptTest = `
    import { layKhoangNgayVnUtc } from './scripts/giam-sat/time-util.js';
    const kq = layKhoangNgayVnUtc();
    process.stdout.write(JSON.stringify(kq));
  `;

  const runVoiTz = (tz) => {
    const res = spawnSync(process.execPath, [
      '--input-type=module',
      '-e',
      scriptTest
    ], {
      env: { ...process.env, TZ: tz },
      encoding: 'utf8'
    });
    assert.equal(res.status, 0, `Lỗi khi chạy với TZ=${tz}: ${res.stderr}`);
    return JSON.parse(res.stdout);
  };

  const kqUtc = runVoiTz('UTC');
  const kqNy = runVoiTz('America/New_York');

  assert.equal(kqUtc.ngayVn, kqNy.ngayVn, 'ngayVn phải đồng nhất giữa UTC và America/New_York');
  assert.equal(kqUtc.dauNgayUtc, kqNy.dauNgayUtc, 'dauNgayUtc phải đồng nhất giữa UTC và America/New_York');
  assert.equal(kqUtc.cuoiNgayUtc, kqNy.cuoiNgayUtc, 'cuoiNgayUtc phải đồng nhất giữa UTC và America/New_York');
});

test('T702: tin nhắn lúc 2026-11-05T18:00:00.000Z (01:00 VN ngày 06/11) được tính vào ngày 06/11', () => {
  const { dauNgayUtc, cuoiNgayUtc } = layKhoangNgayVnUtc('2026-11-06');

  const mocTinNhan = '2026-11-05T18:00:00.000Z';
  assert.ok(mocTinNhan >= dauNgayUtc, 'Mốc tin nhắn phải sau hoặc bằng dauNgayUtc');
  assert.ok(mocTinNhan <= cuoiNgayUtc, 'Mốc tin nhắn phải trước hoặc bằng cuoiNgayUtc');

  // Kiểm chứng qua truy vấn SQLite BETWEEN tương tự scripts/giam-sat.mjs
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY,
      text TEXT,
      at TEXT
    );
    INSERT INTO messages (id, text, at) VALUES
      (1, 'Tin ngày 05/11 tối muộn', '2026-11-05T16:59:59.999Z'),
      (2, 'Tin ngày 06/11 sáng sớm', '2026-11-05T18:00:00.000Z'),
      (3, 'Tin ngày 06/11 cuối ngày', '2026-11-06T16:59:59.999Z'),
      (4, 'Tin ngày 07/11 đầu ngày', '2026-11-06T17:00:00.000Z');
  `);

  const rows = db.prepare('SELECT id, text, at FROM messages WHERE at BETWEEN ? AND ? ORDER BY id')
    .all(dauNgayUtc, cuoiNgayUtc);

  db.close();

  const ids = rows.map(r => r.id);
  assert.deepEqual(ids, [2, 3], 'Phải lấy đúng tin id=2 (01:00 VN) và id=3 (23:59 VN) của ngày 06/11');
});
