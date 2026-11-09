import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { docNguonFanpage } from '../../scripts/giam-sat/nguon-fanpage.js';

test('T709: docNguonFanpage trả về lỗi an toàn khi dbPath không tồn tại hoặc rỗng', () => {
  const kqNull = docNguonFanpage(null);
  assert.deepEqual(kqNull, {
    ok: false,
    error: 'missing_db',
    conversations: [],
    messages: [],
    skippedSystemCount: 0,
  });

  const kqEmpty = docNguonFanpage('');
  assert.deepEqual(kqEmpty, {
    ok: false,
    error: 'missing_db',
    conversations: [],
    messages: [],
    skippedSystemCount: 0,
  });

  const kqKhongTonTai = docNguonFanpage(join(tmpdir(), 'khong-ton-tai-' + Date.now() + '.db'));
  assert.deepEqual(kqKhongTonTai, {
    ok: false,
    error: 'missing_db',
    conversations: [],
    messages: [],
    skippedSystemCount: 0,
  });
});

test('T709 (FR-005, FR-009): Bảo đảm chế độ chỉ-đọc (readOnly: true) và không sửa đổi tệp SQLite', () => {
  const code = readFileSync('scripts/giam-sat/nguon-fanpage.js', 'utf8');
  assert.equal(code.includes('readOnly: true'), true, 'nguon-fanpage.js phải mở DB với tùy chọn { readOnly: true }');
  assert.equal(code.includes('openStore'), false, 'Không được sử dụng openStore trong nguon-fanpage.js');

  const tmpDir = join(tmpdir(), `test-fanpage-ro-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(tmpDir, { recursive: true });
  const dbPath = join(tmpDir, 'fb-inbox-readonly.db');

  try {
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE fanpage_messages (
        id INTEGER PRIMARY KEY,
        conv_id TEXT,
        sender_type TEXT,
        cua_bot INTEGER,
        is_system INTEGER,
        content TEXT,
        created_at TEXT
      );
      INSERT INTO fanpage_messages VALUES (1, 'c1', 'khach', 0, 0, 'Xin giá cước', '2026-11-06T08:00:00.000Z');
    `);
    db.close();

    // Kiểm tra kết nối mở với readOnly: true từ chối câu lệnh ghi
    const roDb = new DatabaseSync(dbPath, { readOnly: true });
    assert.throws(() => {
      roDb.prepare("INSERT INTO fanpage_messages VALUES (2, 'c1', 'khach', 0, 0, 'Ghi đè', '2026-11-06T08:05:00.000Z')").run();
    }, /readonly/i, 'DatabaseSync ở chế độ readOnly: true phải từ chối mọi thao tác ghi');
    roDb.close();

    const hashTruoc = createHash('sha256').update(readFileSync(dbPath)).digest('hex');
    const statTruoc = statSync(dbPath);

    const kq = docNguonFanpage(dbPath);
    assert.equal(kq.ok, true);
    assert.equal(kq.messages.length, 1);

    const hashSau = createHash('sha256').update(readFileSync(dbPath)).digest('hex');
    const statSau = statSync(dbPath);

    assert.equal(hashSau, hashTruoc, 'Hash tệp SQLite không được thay đổi sau khi đọc');
    assert.equal(statSau.size, statTruoc.size, 'Kích thước tệp SQLite không được thay đổi');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T709 (US4, FR-009): Đọc 10 tin mẫu từ fanpage_messages, lọc bỏ thông báo hệ thống và chuẩn hoá hội thoại', () => {
  const tmpDir = join(tmpdir(), `test-fanpage-10msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(tmpDir, { recursive: true });
  const dbPath = join(tmpDir, 'fb-inbox-10.db');

  try {
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE fanpage_messages (
        id INTEGER PRIMARY KEY,
        conv_id TEXT,
        sender_type TEXT,
        cua_bot INTEGER,
        is_system INTEGER,
        content TEXT,
        created_at TEXT
      );
    `);

    // 10 tin nhắn mẫu:
    // Tin 1: Khách hỏi conv1 (hợp lệ)
    // Tin 2: Bot trả lời conv1 (hợp lệ, cua_bot = 1)
    // Tin 3: Hệ thống "đã trả lời về một bài viết" khi cua_bot = 0 (phải lọc)
    // Tin 4: Hệ thống "đã bình luận về một bài viết" khi cua_bot = 0 (phải lọc)
    // Tin 5: Hệ thống "đã bày tỏ cảm xúc" khi cua_bot = 0 (phải lọc)
    // Tin 6: Hệ thống is_system = 1 khi cua_bot = 0 (phải lọc)
    // Tin 7: Nhân viên trả lời conv1 (hợp lệ, cua_bot = 0)
    // Tin 8: Khách hỏi tiếp conv1 (hợp lệ)
    // Tin 9: Khách hỏi conv2 (hợp lệ)
    // Tin 10: Bot trả lời conv2 (hợp lệ, cua_bot = 1)
    const stmt = db.prepare(`
      INSERT INTO fanpage_messages (id, conv_id, sender_type, cua_bot, is_system, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(1, 'thread_001', 'khach', 0, 0, 'Tư vấn thủ tục nhập khẩu máy bơm nước', '2026-11-06T08:00:00.000Z');
    stmt.run(2, 'thread_001', 'bot', 1, 0, 'Dạ chào bạn, bạn cần kiểm tra mã HS hay thuế suất ạ?', '2026-11-06T08:00:30.000Z');
    stmt.run(3, 'thread_001', 'page', 0, 0, 'Nguyễn Văn A đã trả lời về một bài viết', '2026-11-06T08:01:00.000Z');
    stmt.run(4, 'thread_001', 'page', 0, 0, 'Trần Thị B đã bình luận về một bài viết', '2026-11-06T08:01:30.000Z');
    stmt.run(5, 'thread_001', 'page', 0, 0, 'Lê Văn C đã bày tỏ cảm xúc', '2026-11-06T08:02:00.000Z');
    stmt.run(6, 'thread_001', 'page', 0, 1, 'Thông báo tự động từ hệ thống Messenger', '2026-11-06T08:02:30.000Z');
    stmt.run(7, 'thread_001', 'nhan-vien', 0, 0, 'Chuyên viên OZ đang gửi báo giá chi tiết qua mail ạ', '2026-11-06T08:05:00.000Z');
    stmt.run(8, 'thread_001', 'khach', 0, 0, 'Cảm ơn em nhiều', '2026-11-06T08:06:00.000Z');
    stmt.run(9, 'thread_002', 'khach', 0, 0, 'Cho mình hỏi về C/O form E', '2026-11-06T08:10:00.000Z');
    stmt.run(10, 'thread_002', 'bot', 1, 0, 'C/O form E cần kiểm tra tính hợp lệ của ô số 8 ạ', '2026-11-06T08:10:45.000Z');

    db.close();

    const kq = docNguonFanpage(dbPath);

    assert.equal(kq.ok, true);
    assert.equal(kq.skippedSystemCount, 4, 'Phải lọc đúng 4 tin thông báo hệ thống');
    assert.equal(kq.messages.length, 6, 'Phải còn đúng 6 tin nhắn hợp lệ');

    // Kiểm tra định dạng chuẩn của từng tin nhắn
    for (const m of kq.messages) {
      assert.equal(m.channel, 'fanpage');
      assert.ok(['khach', 'bot', 'nhan-vien'].includes(m.speaker));
      assert.ok(typeof m.text === 'string' && m.text.length > 0);
      assert.ok(typeof m.convId === 'string' && m.convId.length > 0);
      assert.ok(typeof m.ts === 'string');
      // Các alias tương thích
      assert.equal(m.chat_id, m.convId);
      assert.equal(m.turn_id, m.id);
      assert.equal(m.at, m.ts);
    }

    // Kiểm tra chi tiết speaker
    assert.equal(kq.messages[0].speaker, 'khach');
    assert.equal(kq.messages[1].speaker, 'bot');
    assert.equal(kq.messages[2].speaker, 'nhan-vien'); // tin 7
    assert.equal(kq.messages[3].speaker, 'khach');     // tin 8
    assert.equal(kq.messages[4].speaker, 'khach');     // tin 9
    assert.equal(kq.messages[5].speaker, 'bot');       // tin 10

    // Kiểm tra gom nhóm conversations theo convId
    assert.equal(kq.conversations.length, 2, 'Có 2 cuộc hội thoại riêng biệt');
    const conv1 = kq.conversations.find(c => c.convId === 'thread_001');
    const conv2 = kq.conversations.find(c => c.convId === 'thread_002');

    assert.ok(conv1, 'Phải có hội thoại thread_001');
    assert.ok(conv2, 'Phải có hội thoại thread_002');

    assert.equal(conv1.channel, 'fanpage');
    assert.equal(conv1.turns.length, 4);
    assert.equal(conv1.turns[0].speaker, 'khach');
    assert.equal(conv1.turns[1].speaker, 'bot');
    assert.equal(conv1.turns[2].speaker, 'nhan-vien');
    assert.equal(conv1.turns[3].speaker, 'khach');

    assert.equal(conv2.channel, 'fanpage');
    assert.equal(conv2.turns.length, 2);
    assert.equal(conv2.turns[0].speaker, 'khach');
    assert.equal(conv2.turns[1].speaker, 'bot');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T709: Hỗ trợ alias tên bảng (messages) và alias tên cột (thread_id, content, created_at, cua_bot)', () => {
  const tmpDir = join(tmpdir(), `test-fanpage-alias-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(tmpDir, { recursive: true });
  const dbPath = join(tmpDir, 'messages-alias.db');

  try {
    const db = new DatabaseSync(dbPath);
    // Bảng tên messages thay vì fanpage_messages
    db.exec(`
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY,
        thread_id TEXT,
        cua_bot INTEGER,
        is_system INTEGER,
        text TEXT,
        ts TEXT
      );
      INSERT INTO messages VALUES (1, 't100', 0, 0, 'Khách hỏi thuế', '2026-11-06T09:00:00.000Z');
      INSERT INTO messages VALUES (2, 't100', 1, 0, 'Bot trả lời 10%', '2026-11-06T09:01:00.000Z');
      INSERT INTO messages VALUES (3, 't100', 0, 0, 'NV hỗ trợ thêm', '2026-11-06T09:05:00.000Z');
      INSERT INTO messages VALUES (4, 't100', 0, 0, 'A đã bình luận về một bài viết', '2026-11-06T09:06:00.000Z');
    `);
    db.close();

    const kq = docNguonFanpage(dbPath);
    assert.equal(kq.ok, true);
    assert.equal(kq.skippedSystemCount, 1);
    assert.equal(kq.messages.length, 3);
    assert.equal(kq.conversations.length, 1);
    assert.equal(kq.conversations[0].convId, 't100');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T709: Lọc chính xác theo mốc thời gian khoangNgay (dauNgayUtc, cuoiNgayUtc)', () => {
  const tmpDir = join(tmpdir(), `test-fanpage-range-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(tmpDir, { recursive: true });
  const dbPath = join(tmpDir, 'fanpage-range.db');

  try {
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE fanpage_messages (
        id INTEGER PRIMARY KEY,
        conv_id TEXT,
        sender_type TEXT,
        cua_bot INTEGER,
        is_system INTEGER,
        content TEXT,
        created_at TEXT
      );
      INSERT INTO fanpage_messages VALUES (1, 'c1', 'khach', 0, 0, 'Tin hôm qua', '2026-11-05T23:59:59.000Z');
      INSERT INTO fanpage_messages VALUES (2, 'c1', 'khach', 0, 0, 'Tin đúng ngày đầu', '2026-11-06T00:00:00.000Z');
      INSERT INTO fanpage_messages VALUES (3, 'c1', 'khach', 0, 0, 'Tin giữa ngày', '2026-11-06T12:00:00.000Z');
      INSERT INTO fanpage_messages VALUES (4, 'c1', 'khach', 0, 0, 'Tin đúng ngày cuối', '2026-11-06T23:59:59.999Z');
      INSERT INTO fanpage_messages VALUES (5, 'c1', 'khach', 0, 0, 'Tin hôm sau', '2026-11-07T00:00:00.000Z');
    `);
    db.close();

    const kq = docNguonFanpage(dbPath, {
      dauNgayUtc: '2026-11-06T00:00:00.000Z',
      cuoiNgayUtc: '2026-11-06T23:59:59.999Z',
    });

    assert.equal(kq.ok, true);
    assert.equal(kq.messages.length, 3);
    assert.deepEqual(kq.messages.map(m => m.id), ['2', '3', '4']);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
