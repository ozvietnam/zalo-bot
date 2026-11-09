import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { doLuongTruocSau } from '../../scripts/giam-sat/vong-lap.js';

test('T711 (SC-005): Ca dương - Giảm số đo thành công sau khi đóng issue', () => {
  const issueDaDong = [
    { number: 45, ma: 'HOI-LAI', closed_at: '2026-11-01T00:00:00Z', repo: 'zalo-bot' },
  ];
  const fakeDb = {
    demTinHieu: (ma, from, to) => (from < '2026-11-01' ? 14 : 2),
  };
  const ketQua = doLuongTruocSau({ issueDaDong, db: fakeDb, ngayHienTai: '2026-11-08T00:00:00Z' });

  assert.equal(ketQua.length, 1);
  assert.equal(ketQua[0].issueNumber, 45);
  assert.equal(ketQua[0].ma, 'HOI-LAI');
  assert.equal(ketQua[0].repo, 'zalo-bot');
  assert.equal(ketQua[0].soDoTruoc, '14');
  assert.equal(ketQua[0].soDoSau, '2');
  assert.equal(ketQua[0].giamThanhCong, true, 'Số đo giảm từ 14 xuống 2 phải là giảm thành công');
});

test('T711 (SC-005): Ca âm - Số đo không giảm (tăng hoặc giữ nguyên) sau khi đóng issue', () => {
  const issueDaDong = [
    { number: 50, ma: 'TOOL-ERR', cheDo: 'tra_thue', closed_at: '2026-11-02T00:00:00Z', repo: 'ozplugin' },
    { number: 51, ma: 'GATE-LEAK', closed_at: '2026-11-03T00:00:00Z', repo: 'zalo-bot' },
  ];
  const fakeDb = {
    demTinHieu: (ma, from, to) => {
      if (ma === 'TOOL-ERR') return from < '2026-11-02' ? 5 : 8; // Tăng
      if (ma === 'GATE-LEAK') return from < '2026-11-03' ? 3 : 3; // Giữ nguyên
      return 0;
    },
  };
  const ketQua = doLuongTruocSau({ issueDaDong, db: fakeDb, ngayHienTai: '2026-11-08T00:00:00Z' });

  assert.equal(ketQua.length, 2);

  // Issue 50: 5 -> 8 (tăng)
  assert.equal(ketQua[0].issueNumber, 50);
  assert.equal(ketQua[0].soDoTruoc, '5');
  assert.equal(ketQua[0].soDoSau, '8');
  assert.equal(ketQua[0].giamThanhCong, false, 'Số đo tăng không được coi là giảm thành công');

  // Issue 51: 3 -> 3 (giữ nguyên)
  assert.equal(ketQua[1].issueNumber, 51);
  assert.equal(ketQua[1].soDoTruoc, '3');
  assert.equal(ketQua[1].soDoSau, '3');
  assert.equal(ketQua[1].giamThanhCong, false, 'Số đo giữ nguyên không được coi là giảm thành công');
});

test('T711: Bỏ qua issue đóng quá 14 ngày so với ngày hiện tại', () => {
  const issueDaDong = [
    // Đóng 20 ngày trước: bỏ qua
    { number: 30, ma: 'KHACH-BUC', closed_at: '2026-10-15T00:00:00Z', repo: 'zalo-bot' },
    // Đóng 5 ngày trước: nhận
    { number: 48, ma: 'JOB-EXPIRED', closed_at: '2026-11-03T00:00:00Z', repo: 'ozplugin' },
  ];
  const fakeDb = {
    demTinHieu: () => 1,
  };
  const ketQua = doLuongTruocSau({ issueDaDong, db: fakeDb, ngayHienTai: '2026-11-08T00:00:00Z' });

  assert.equal(ketQua.length, 1);
  assert.equal(ketQua[0].issueNumber, 48);
});

test('T711: Bỏ qua issue không có closed_at hoặc closed_at không hợp lệ', () => {
  const issueDaDong = [
    { number: 60, ma: 'GATE-MONEY', repo: 'zalo-bot' }, // Thiếu closed_at
    { number: 61, ma: 'GATE-MONEY', closed_at: null, repo: 'zalo-bot' },
  ];
  const fakeDb = { demTinHieu: () => 0 };
  const ketQua = doLuongTruocSau({ issueDaDong, db: fakeDb, ngayHienTai: '2026-11-08T00:00:00Z' });
  assert.equal(ketQua.length, 0);
});

test('T711: Tương thích với kết nối SQLite DatabaseSync thật', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE outbox (
      turn_id TEXT,
      decision TEXT,
      reason TEXT,
      created_at TEXT
    );
  `);
  // Trước đóng (2026-10-28 đến 2026-11-04): 3 dòng leak
  db.prepare("INSERT INTO outbox VALUES ('t1', 'block', 'leak:key1', '2026-11-01T08:00:00Z')").run();
  db.prepare("INSERT INTO outbox VALUES ('t2', 'block', 'leak:key2', '2026-11-02T08:00:00Z')").run();
  db.prepare("INSERT INTO outbox VALUES ('t3', 'block', 'leak:key3', '2026-11-03T08:00:00Z')").run();

  // Sau đóng (2026-11-04 đến 2026-11-08): 0 dòng leak
  const issueDaDong = [
    { number: 40, ma: 'GATE-LEAK', closed_at: '2026-11-04T00:00:00Z', repo: 'zalo-bot' },
  ];
  const ketQua = doLuongTruocSau({ issueDaDong, db, ngayHienTai: '2026-11-08T00:00:00Z' });

  assert.equal(ketQua.length, 1);
  assert.equal(ketQua[0].issueNumber, 40);
  assert.equal(ketQua[0].soDoTruoc, '3');
  assert.equal(ketQua[0].soDoSau, '0');
  assert.equal(ketQua[0].giamThanhCong, true);
  db.close();
});
