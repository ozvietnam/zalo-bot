import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { doLuongTruocSau, demTinHieuSqlite } from '../../scripts/giam-sat/vong-lap.js';
import { soanBanTin } from '../../scripts/giam-sat/digest.js';

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
  db.prepare("INSERT INTO outbox VALUES ('t1', 'block', 'leak:duong-dan-1', '2026-11-01T08:00:00Z')").run();
  db.prepare("INSERT INTO outbox VALUES ('t2', 'block', 'leak:duong-dan-2', '2026-11-02T08:00:00Z')").run();
  db.prepare("INSERT INTO outbox VALUES ('t3', 'block', 'leak:duong-dan-3', '2026-11-03T08:00:00Z')").run();

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

test('T713 (SC-005): demTinHieuSqlite chấp nhận decision IN (block, reject) cho GATE-LEAK, CHUA-LOC-NOI-BO, GATE-MONEY, SAI-SO', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE outbox (
      turn_id TEXT,
      decision TEXT,
      reason TEXT,
      created_at TEXT
    );
  `);

  // 1 block + 1 reject cho leak trong khoảng trước
  db.prepare("INSERT INTO outbox VALUES ('t1', 'block', 'leak:path', '2026-11-02T10:00:00Z')").run();
  db.prepare("INSERT INTO outbox VALUES ('t2', 'reject', 'leak:noi-bo', '2026-11-03T10:00:00Z')").run();
  // 1 reject cho money trong khoảng trước
  db.prepare("INSERT INTO outbox VALUES ('t3', 'reject', 'money_invalid', '2026-11-04T10:00:00Z')").run();

  const issueDaDong = [
    { number: 41, ma: 'CHUA-LOC-NOI-BO', closed_at: '2026-11-05T00:00:00Z', repo: 'zalo-bot' },
    { number: 42, ma: 'GATE-LEAK', closed_at: '2026-11-05T00:00:00Z', repo: 'zalo-bot' },
    { number: 43, ma: 'SAI-SO', closed_at: '2026-11-05T00:00:00Z', repo: 'zalo-bot' },
    { number: 44, ma: 'GATE-MONEY', closed_at: '2026-11-05T00:00:00Z', repo: 'zalo-bot' },
  ];

  const ketQua = doLuongTruocSau({ issueDaDong, db, ngayHienTai: '2026-11-12T00:00:00Z' });

  assert.equal(ketQua.length, 4);
  // CHUA-LOC-NOI-BO & GATE-LEAK: đều bắt được 2 dòng (1 block, 1 reject)
  assert.equal(ketQua[0].soDoTruoc, '2');
  assert.equal(ketQua[1].soDoTruoc, '2');
  // SAI-SO & GATE-MONEY: đều bắt được 1 dòng reject
  assert.equal(ketQua[2].soDoTruoc, '1');
  assert.equal(ketQua[3].soDoTruoc, '1');

  db.close();
});

test('T713 (SC-005): Đếm HOI-LAI trước/sau từ SQLite mẫu (spec.md:137: 10 lần trước -> 2 lần sau, giảm 80%)', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY,
      chat_id TEXT,
      turn_id TEXT,
      speaker TEXT,
      text TEXT,
      at TEXT
    );
  `);

  const stmt = db.prepare('INSERT INTO messages (chat_id, turn_id, speaker, text, at) VALUES (?, ?, ?, ?, ?)');

  // 7 ngày trước: 2026-11-01T00:00:00Z đến 2026-11-08T00:00:00Z
  // Tạo 10 hội thoại phát sinh HOI-LAI (khách hỏi -> bot trả lời -> trong 30p khách hỏi lại gần giống)
  for (let i = 1; i <= 10; i++) {
    const chat = `chat_truoc_${i}`;
    stmt.run(chat, `turn_${i}_1`, 'khach', 'thủ tục nhập khẩu son môi từ hàn quốc', '2026-11-03T10:00:00Z');
    stmt.run(chat, `turn_${i}_2`, 'bot', 'Thủ tục nhập khẩu son môi gồm công bố mỹ phẩm', '2026-11-03T10:01:00Z');
    stmt.run(chat, `turn_${i}_3`, 'khach', 'thủ tục nhập khẩu son môi từ hàn quốc ạ', '2026-11-03T10:03:00Z');
  }

  // 7 ngày sau: 2026-11-08T00:00:00Z đến 2026-11-15T00:00:00Z
  // Tạo 2 hội thoại phát sinh HOI-LAI
  for (let i = 1; i <= 2; i++) {
    const chat = `chat_sau_${i}`;
    stmt.run(chat, `turn_sau_${i}_1`, 'khach', 'thuế nhập khẩu máy may công nghiệp', '2026-11-10T14:00:00Z');
    stmt.run(chat, `turn_sau_${i}_2`, 'bot', 'Thuế nhập khẩu máy may công nghiệp là 0%', '2026-11-10T14:01:00Z');
    stmt.run(chat, `turn_sau_${i}_3`, 'khach', 'thuế nhập khẩu máy may công nghiệp ạ', '2026-11-10T14:04:00Z');
  }

  // Thêm một số hội thoại bình thường không bị hỏi lại sau khi đóng
  for (let i = 3; i <= 10; i++) {
    const chat = `chat_sau_ok_${i}`;
    stmt.run(chat, `turn_ok_${i}_1`, 'khach', 'Mã HS máy sấy là gì', '2026-11-10T15:00:00Z');
    stmt.run(chat, `turn_ok_${i}_2`, 'bot', 'Mã HS 84512100', '2026-11-10T15:01:00Z');
    stmt.run(chat, `turn_ok_${i}_3`, 'khach', 'Cảm ơn shop nhiều nhé', '2026-11-10T15:02:00Z');
  }

  const issueDaDong = [
    { number: 45, ma: 'HOI-LAI', closed_at: '2026-11-08T00:00:00Z', repo: 'zalo-bot' },
  ];

  const ketQua = doLuongTruocSau({ issueDaDong, db, ngayHienTai: '2026-11-15T00:00:00Z' });

  assert.equal(ketQua.length, 1);
  assert.equal(ketQua[0].issueNumber, 45);
  assert.equal(ketQua[0].ma, 'HOI-LAI');
  assert.equal(ketQua[0].soDoTruoc, '10', 'Số đo 7 ngày trước phải là 10');
  assert.equal(ketQua[0].soDoSau, '2', 'Số đo 7 ngày sau phải là 2');
  assert.equal(ketQua[0].giamThanhCong, true);
  assert.match(ketQua[0].phanTramThayDoi, /giảm 80%/i);

  // Kiểm tra hiển thị lên soanBanTin
  const banTin = soanBanTin({
    ngay: '2026-11-15',
    phatHien: [],
    loai: 'tuan',
    vongLap: ketQua,
  });

  assert.match(banTin, /Vòng lặp cải tiến \(trước\/sau 7 ngày\):/);
  assert.match(banTin, /#45 HOI-LAI:\s*10\s*→\s*2\s*\(giảm 80%\)/);

  db.close();
});

test('T713: soanBanTin hiển thị trạng thái Chưa đủ 7 ngày sau khi đóng để đo', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY,
      chat_id TEXT,
      turn_id TEXT,
      speaker TEXT,
      text TEXT,
      at TEXT
    );
  `);

  // Issue đóng cách mốc hiện tại 3 ngày (< 7 ngày)
  const issueDaDong = [
    { number: 48, ma: 'KHACH-BUC', closed_at: '2026-11-12T00:00:00Z', repo: 'zalo-bot' },
  ];

  const ketQua = doLuongTruocSau({ issueDaDong, db, ngayHienTai: '2026-11-15T00:00:00Z' });
  assert.equal(ketQua.length, 1);
  assert.equal(ketQua[0].chuaDu7Ngay, true);
  assert.equal(ketQua[0].ghiChu, 'Chưa đủ 7 ngày sau khi đóng để đo');

  const banTin = soanBanTin({
    ngay: '2026-11-15',
    loai: 'tuan',
    vongLap: ketQua,
  });

  assert.match(banTin, /Vòng lặp cải tiến \(trước\/sau 7 ngày\):/);
  assert.match(banTin, /#48 KHACH-BUC:\s*Chưa đủ 7 ngày sau khi đóng để đo/);

  db.close();
});

test('T713: demTinHieuSqlite đếm đúng NGUOI-THAY, KHACH-BUC, XIN-LOI-TAY từ messages', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY,
      chat_id TEXT,
      turn_id TEXT,
      speaker TEXT,
      text TEXT,
      at TEXT
    );
  `);

  const stmt = db.prepare('INSERT INTO messages (chat_id, turn_id, speaker, text, at) VALUES (?, ?, ?, ?, ?)');

  // NGUOI-THAY: bot trả lời -> nhân viên vào phòng trong 15 phút
  stmt.run('chat_staff_1', 't1', 'bot', 'Xin chào', '2026-11-03T10:00:00Z');
  stmt.run('chat_staff_1', 't2', 'nhan-vien', 'Em hỗ trợ anh nhé', '2026-11-03T10:05:00Z');

  // KHACH-BUC: khách nhắn từ bực
  stmt.run('chat_buc_1', 't3', 'khach', 'Bot nói gì chả hiểu gì cả', '2026-11-03T11:00:00Z');

  // XIN-LOI-TAY: nhân viên xin lỗi ngay sau tin bot (cách 20 phút để không tính trùng NGUOI-THAY)
  stmt.run('chat_xl_1', 't4', 'bot', 'Giá cước là 1 triệu', '2026-11-03T12:00:00Z');
  stmt.run('chat_xl_1', 't5', 'nhan-vien', 'Dạ em xin lỗi em gửi nhầm thông tin', '2026-11-03T12:20:00Z');

  const issueDaDong = [
    { number: 51, ma: 'NGUOI-THAY', closed_at: '2026-11-08T00:00:00Z', repo: 'zalo-bot' },
    { number: 52, ma: 'KHACH-BUC', closed_at: '2026-11-08T00:00:00Z', repo: 'zalo-bot' },
    { number: 53, ma: 'XIN-LOI-TAY', closed_at: '2026-11-08T00:00:00Z', repo: 'zalo-bot' },
  ];

  const ketQua = doLuongTruocSau({ issueDaDong, db, ngayHienTai: '2026-11-15T00:00:00Z' });

  assert.equal(ketQua.length, 3);
  assert.equal(ketQua[0].soDoTruoc, '1', 'NGUOI-THAY trước phải đếm được 1');
  assert.equal(ketQua[1].soDoTruoc, '1', 'KHACH-BUC trước phải đếm được 1');
  assert.equal(ketQua[2].soDoTruoc, '1', 'XIN-LOI-TAY trước phải đếm được 1');

  db.close();
});

test('T713: Gọi trực tiếp demTinHieuSqlite(db, maLoi, tuNgay, denNgay) cho các tín hiệu và bí danh', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE outbox (turn_id TEXT, decision TEXT, reason TEXT, created_at TEXT);
    CREATE TABLE messages (id INTEGER PRIMARY KEY, chat_id TEXT, turn_id TEXT, speaker TEXT, text TEXT, at TEXT);
  `);

  // Outbox leak block + reject
  db.prepare("INSERT INTO outbox VALUES ('o1', 'block', 'leak:noi-bo-1', '2026-11-03T10:00:00Z')").run();
  db.prepare("INSERT INTO outbox VALUES ('o2', 'reject', 'leak:noi-bo-2', '2026-11-03T11:00:00Z')").run();
  // Outbox money reject
  db.prepare("INSERT INTO outbox VALUES ('o3', 'reject', 'money_khong_can_cu', '2026-11-03T12:00:00Z')").run();

  // Messages: 1 ca HOI-LAI
  db.prepare("INSERT INTO messages (chat_id, turn_id, speaker, text, at) VALUES ('c1', 't1', 'khach', 'máy may công nghiệp', '2026-11-03T13:00:00Z')").run();
  db.prepare("INSERT INTO messages (chat_id, turn_id, speaker, text, at) VALUES ('c1', 't2', 'bot', 'Mã 8452 là máy may', '2026-11-03T13:01:00Z')").run();
  db.prepare("INSERT INTO messages (chat_id, turn_id, speaker, text, at) VALUES ('c1', 't3', 'khach', 'máy may công nghiệp ạ', '2026-11-03T13:03:00Z')").run();

  // Messages: 2 ca XIN-LOI-TAY trong cùng 1 phòng c2
  db.prepare("INSERT INTO messages (chat_id, turn_id, speaker, text, at) VALUES ('c2', 't4', 'bot', 'Giá 5 triệu', '2026-11-03T14:00:00Z')").run();
  db.prepare("INSERT INTO messages (chat_id, turn_id, speaker, text, at) VALUES ('c2', 't5', 'nhan-vien', 'Dạ em xin lỗi em gửi nhầm', '2026-11-03T14:01:00Z')").run();
  db.prepare("INSERT INTO messages (chat_id, turn_id, speaker, text, at) VALUES ('c2', 't6', 'bot', 'Giá 6 triệu', '2026-11-03T14:10:00Z')").run();
  db.prepare("INSERT INTO messages (chat_id, turn_id, speaker, text, at) VALUES ('c2', 't7', 'nhan-vien', 'Sorry anh em gửi nhầm lần 2', '2026-11-03T14:11:00Z')").run();

  const tuNgay = '2026-11-01T00:00:00Z';
  const denNgay = '2026-11-08T00:00:00Z';

  // Kiểm tra export và gọi trực tiếp demTinHieuSqlite
  assert.equal(demTinHieuSqlite(db, 'CHUA-LOC-NOI-BO', tuNgay, denNgay), 2);
  assert.equal(demTinHieuSqlite(db, 'GATE-LEAK', tuNgay, denNgay), 2);
  assert.equal(demTinHieuSqlite(db, 'SAI-SO', tuNgay, denNgay), 1);
  assert.equal(demTinHieuSqlite(db, 'GATE-MONEY', tuNgay, denNgay), 1);
  assert.equal(demTinHieuSqlite(db, 'HOI-LAI', tuNgay, denNgay), 1);
  // XIN-LOI-TAY đếm số lần: 2 lần xin lỗi trong c2 -> phải là 2
  assert.equal(demTinHieuSqlite(db, 'XIN-LOI-TAY', tuNgay, denNgay), 2, 'XIN-LOI-TAY phải đếm đủ 2 lần phát sinh');

  db.close();
});

test('T713: doLuongTruocSau hỗ trợ chữ ký vị trí doLuongTruocSau(db, danhSachThe, { now }) và các alias', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE outbox (turn_id TEXT, decision TEXT, reason TEXT, created_at TEXT);
  `);
  db.prepare("INSERT INTO outbox VALUES ('o1', 'block', 'leak:noi-bo', '2026-11-02T10:00:00Z')").run();

  // Danh sách thẻ dùng alias maLoi và closedAt
  const danhSachThe = [
    { issueNumber: 99, maLoi: 'CHUA-LOC-NOI-BO', closedAt: '2026-11-05T00:00:00Z' },
  ];

  // Gọi theo chữ ký 3 tham số vị trí: (db, danhSachThe, { now })
  const kq = doLuongTruocSau(db, danhSachThe, { now: '2026-11-12T00:00:00Z' });
  assert.equal(kq.length, 1);
  assert.equal(kq[0].issueNumber, 99);
  assert.equal(kq[0].maLoi, 'CHUA-LOC-NOI-BO');
  assert.equal(kq[0].soDoTruoc, '1');
  assert.equal(kq[0].soDoSau, '0');
  assert.equal(kq[0].giamThanhCong, true);

  db.close();
});


