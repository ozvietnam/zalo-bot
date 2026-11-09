// test/core/do-sc-thuc.test.mjs: Kiểm thử công cụ đo SC-002/SC-007/SC-009 (T041)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../../core/store.js';
import { REPLY_HANDOFF } from '../../core/intents.js';

const SCRIPT = join(process.cwd(), 'scripts', 'do-sc-thuc.mjs');
const SDT_MAU = '0912345678';
const TIN_BI_MAT_KHACH = 'Tin nhắn mật của khách hàng OZ cần bảo vệ';

function runCli(args = [], env = {}) {
  return spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function createEmptyDb(dir) {
  const dbPath = join(dir, 'empty.db');
  openStore(dbPath); // Tạo đủ bảng lược đồ chuẩn
  return dbPath;
}

test('T041 CLI: --help hiển thị hướng dẫn và thoát mã 0', () => {
  const r = runCli(['--help']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Cách dùng/i);
  assert.match(r.stdout, /--db/);
  assert.match(r.stdout, /--tu/);
  assert.match(r.stdout, /--den/);
  assert.equal(r.stderr, '');
});

test('T041 CLI: db không tồn tại hoặc lỗi thoát mã 1, in stderr và không in stack trace', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sc-test-'));
  try {
    const r = runCli(['--db', join(dir, 'khong-ton-tai.db')]);
    assert.equal(r.status, 1);
    assert.notEqual(r.stderr, '');
    assert.doesNotMatch(r.stderr, /at Object\./);
    assert.doesNotMatch(r.stderr, /at Module\./);
    assert.doesNotMatch(r.stderr, /node:internal/);
    assert.equal(r.stdout, '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('T041 (d): db rỗng → báo "chưa đủ dữ liệu" và exit 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sc-test-'));
  try {
    const dbPath = createEmptyDb(dir);
    const r = runCli(['--db', dbPath]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /chưa đủ dữ liệu/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('T041 (a): phòng human có 1 tin bot lọt → SC-002 báo đúng 1 vi phạm; REPLY_HANDOFF được miễn trừ', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sc-test-'));
  try {
    const dbPath = join(dir, 'test-sc002.db');
    const store = openStore(dbPath);
    const db = new DatabaseSync(dbPath);

    const convId = 'user_0001';
    const chatId = 'chat_0001';

    // 1. Audit chuyển sang human lúc 10:00:00Z
    db.prepare(`
      INSERT INTO audit (at, turn_id, conv_id, chat_id, type, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      '2026-11-09T10:00:00.000Z',
      'turn_handoff',
      convId,
      chatId,
      'state-change',
      JSON.stringify({ from: 'bot', to: 'human', by: 'customer', reason: 'wants-human' })
    );

    // 2. Tin REPLY_HANDOFF của bot tại thời điểm chuyển người (được miễn trừ)
    db.prepare(`
      INSERT INTO outbox (idem_key, conv_id, chat_id, turn_id, kind, text, decision, reason, status, sent_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'idem_reply_handoff',
      convId,
      chatId,
      'turn_handoff',
      'reply',
      REPLY_HANDOFF,
      'send',
      'ok',
      'sent',
      '2026-11-09T10:00:01.000Z',
      '2026-11-09T10:00:00.000Z'
    );

    // Audit gate cho tin reply_handoff
    db.prepare(`
      INSERT INTO audit (at, turn_id, conv_id, chat_id, type, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      '2026-11-09T10:00:01.000Z',
      'turn_handoff',
      convId,
      chatId,
      'gate',
      JSON.stringify({ decision: 'send' })
    );

    // 3. Tin bot lọt vào lúc 10:15:00Z trong khi phòng vẫn đang human (VI PHẠM SC-002)
    db.prepare(`
      INSERT INTO outbox (idem_key, conv_id, chat_id, turn_id, kind, text, decision, reason, status, sent_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'idem_bot_lot',
      convId,
      chatId,
      'turn_bot_leak',
      'reply',
      'Chào bạn tôi là bot trả lời nhầm',
      'send',
      'ok',
      'sent',
      '2026-11-09T10:15:00.000Z',
      '2026-11-09T10:15:00.000Z'
    );

    // Audit gate cho tin bot lọt
    db.prepare(`
      INSERT INTO audit (at, turn_id, conv_id, chat_id, type, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      '2026-11-09T10:15:00.000Z',
      'turn_bot_leak',
      convId,
      chatId,
      'gate',
      JSON.stringify({ decision: 'send' })
    );

    // 4. Audit chuyển lại về bot lúc 11:00:00Z
    db.prepare(`
      INSERT INTO audit (at, turn_id, conv_id, chat_id, type, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      '2026-11-09T11:00:00.000Z',
      'turn_return',
      convId,
      chatId,
      'state-change',
      JSON.stringify({ from: 'human', to: 'bot', by: 'staff', reason: 'tra-bot' })
    );

    // 5. Tin bot bình thường lúc 11:05:00Z khi phòng đã là bot (KHÔNG vi phạm)
    db.prepare(`
      INSERT INTO outbox (idem_key, conv_id, chat_id, turn_id, kind, text, decision, reason, status, sent_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'idem_bot_normal',
      convId,
      chatId,
      'turn_normal',
      'reply',
      'Mã HS của bạn là 8413',
      'send',
      'ok',
      'sent',
      '2026-11-09T11:05:00.000Z',
      '2026-11-09T11:05:00.000Z'
    );

    // Audit gate cho tin normal
    db.prepare(`
      INSERT INTO audit (at, turn_id, conv_id, chat_id, type, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      '2026-11-09T11:05:00.000Z',
      'turn_normal',
      convId,
      chatId,
      'gate',
      JSON.stringify({ decision: 'send' })
    );

    const r = runCli(['--db', dbPath]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /SC-002: 1 vi phạm/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('T041 (b): 1 tin outbox không có audit → SC-007 báo n-1/n kèm id rút gọn', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sc-test-'));
  try {
    const dbPath = join(dir, 'test-sc007.db');
    const store = openStore(dbPath);
    const db = new DatabaseSync(dbPath);

    // Chèn 3 tin outbox sent
    for (let i = 1; i <= 3; i++) {
      db.prepare(`
        INSERT INTO outbox (id, idem_key, conv_id, chat_id, turn_id, kind, text, decision, reason, status, sent_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        i,
        `idem_${i}`,
        'user_1',
        'chat_1',
        `turn_${i}`,
        'reply',
        `Nội dung tin ${i}`,
        'send',
        'ok',
        'sent',
        `2026-11-09T10:0${i}:00.000Z`,
        `2026-11-09T10:0${i}:00.000Z`
      );
    }

    // Chỉ chèn audit 'gate' cho turn_1 và turn_2. turn_3 (outbox id 3) thiếu audit!
    db.prepare(`
      INSERT INTO audit (at, turn_id, conv_id, chat_id, type, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('2026-11-09T10:01:00.000Z', 'turn_1', 'user_1', 'chat_1', 'gate', '{}');
    db.prepare(`
      INSERT INTO audit (at, turn_id, conv_id, chat_id, type, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('2026-11-09T10:02:00.000Z', 'turn_2', 'user_1', 'chat_1', 'gate', '{}');

    const r = runCli(['--db', dbPath]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /SC-007:\s*2\/3/);
    assert.match(r.stdout, /3/); // Chứa id của tin thiếu
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('T041 (c): 20 phiếu mở, 1 phiếu thiếu khối hồ sơ → SC-009 báo đúng 19/20', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sc-test-'));
  try {
    const dbPath = join(dir, 'test-sc009.db');
    const store = openStore(dbPath);
    const db = new DatabaseSync(dbPath);

    // Chèn 20 phiếu mở (outbox status='sent', idem_key='p:<id>:open')
    // 19 phiếu có 'Hồ sơ khách:', 1 phiếu (id=13) không có
    for (let i = 1; i <= 20; i++) {
      const coHoSo = i !== 13;
      const text = coHoSo
        ? `🎫 P${i} · phiếu mới\nKhách: Anh Nam\nLý do: cần tư vấn\nHồ sơ khách: Anh Nam\nSố điện thoại: ${SDT_MAU}\n5 tin gần nhất:`
        : `🎫 P${i} · phiếu mới\nKhách: Chị Linh\nLý do: cần tư vấn\n5 tin gần nhất:`;

      db.prepare(`
        INSERT INTO outbox (id, idem_key, conv_id, chat_id, turn_id, kind, text, decision, reason, status, sent_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        i,
        `p:${i}:open`,
        `user_${i}`,
        'chat_staff',
        `turn_ticket_${i}`,
        'ticket',
        text,
        'send',
        'ok',
        'sent',
        `2026-11-09T10:${i < 10 ? '0' + i : i}:00.000Z`,
        `2026-11-09T10:${i < 10 ? '0' + i : i}:00.000Z`
      );

      // Audit gate cho từng tin để SC-007 không ảnh hưởng
      db.prepare(`
        INSERT INTO audit (at, turn_id, conv_id, chat_id, type, data)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `2026-11-09T10:${i < 10 ? '0' + i : i}:00.000Z`,
        `turn_ticket_${i}`,
        `user_${i}`,
        'chat_staff',
        'gate',
        '{}'
      );
    }

    const r = runCli(['--db', dbPath]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /SC-009:\s*19\/20/);
    assert.match(r.stdout, /nhân viên không phải hỏi lại/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('T041 (c-2): dưới 20 phiếu mở → SC-009 báo "chưa đủ dữ liệu (n phiếu)"', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sc-test-'));
  try {
    const dbPath = join(dir, 'test-sc009-few.db');
    const store = openStore(dbPath);
    const db = new DatabaseSync(dbPath);

    // Chèn 5 phiếu mở
    for (let i = 1; i <= 5; i++) {
      db.prepare(`
        INSERT INTO outbox (id, idem_key, conv_id, chat_id, turn_id, kind, text, decision, reason, status, sent_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        i,
        `p:${i}:open`,
        `user_${i}`,
        'chat_staff',
        `turn_${i}`,
        'ticket',
        `🎫 P${i}\nHồ sơ khách: Test`,
        'send',
        'ok',
        'sent',
        `2026-11-09T10:0${i}:00.000Z`,
        `2026-11-09T10:0${i}:00.000Z`
      );
      db.prepare(`
        INSERT INTO audit (at, turn_id, conv_id, chat_id, type, data)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(`2026-11-09T10:0${i}:00.000Z`, `turn_${i}`, `user_${i}`, 'chat_staff', 'gate', '{}');
    }

    const r = runCli(['--db', dbPath]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /SC-009:.*chưa đủ dữ liệu \(5 phiếu\)/i);
    assert.match(r.stdout, /nhân viên không phải hỏi lại/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('T041 (e): stdout không bao giờ chứa nội dung tin nhắn, tên hay số điện thoại khách trong fixture', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sc-test-'));
  try {
    const dbPath = join(dir, 'test-masking.db');
    const store = openStore(dbPath);
    const db = new DatabaseSync(dbPath);

    const convId = 'user_0912345678';
    const chatId = 'chat_vip_client';

    // Chèn outbox có nội dung nhạy cảm và số điện thoại
    db.prepare(`
      INSERT INTO outbox (id, idem_key, conv_id, chat_id, turn_id, kind, text, decision, reason, status, sent_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      101,
      'idem_secret',
      convId,
      chatId,
      'turn_secret',
      'reply',
      `${TIN_BI_MAT_KHACH} - SĐT: ${SDT_MAU}`,
      'send',
      'ok',
      'sent',
      '2026-11-09T10:00:00.000Z',
      '2026-11-09T10:00:00.000Z'
    );

    // Audit không có gate để tin này bị báo thiếu trong SC-007
    const r = runCli(['--db', dbPath]);
    assert.equal(r.status, 0, r.stderr);

    // Khẳng định không lộ thông tin
    assert.doesNotMatch(r.stdout, new RegExp(TIN_BI_MAT_KHACH));
    assert.doesNotMatch(r.stdout, new RegExp(SDT_MAU));
    assert.doesNotMatch(r.stdout, /chat_vip_client/);
    assert.doesNotMatch(r.stdout, /user_0912345678/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('T041: cờ --tu và --den lọc đúng khoảng thời gian', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sc-test-'));
  try {
    const dbPath = join(dir, 'test-time-range.db');
    const store = openStore(dbPath);
    const db = new DatabaseSync(dbPath);

    // Chèn 3 tin ở 3 ngày khác nhau:
    // Ngày 1: 2026-11-01
    // Ngày 2: 2026-11-05
    // Ngày 3: 2026-11-09
    const dates = [
      '2026-11-01T10:00:00.000Z',
      '2026-11-05T10:00:00.000Z',
      '2026-11-09T10:00:00.000Z',
    ];

    for (let i = 0; i < dates.length; i++) {
      db.prepare(`
        INSERT INTO outbox (id, idem_key, conv_id, chat_id, turn_id, kind, text, decision, reason, status, sent_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        i + 1,
        `idem_time_${i}`,
        'user_1',
        'chat_1',
        `turn_time_${i}`,
        'reply',
        `tin ${i}`,
        'send',
        'ok',
        'sent',
        dates[i],
        dates[i]
      );
      // Chỉ turn 0 và 1 có audit gate
      if (i < 2) {
        db.prepare(`
          INSERT INTO audit (at, turn_id, conv_id, chat_id, type, data)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(dates[i], `turn_time_${i}`, 'user_1', 'chat_1', 'gate', '{}');
      }
    }

    // Nếu lọc từ 2026-11-04 đến 2026-11-06: chỉ có tin 2 (đạt 1/1 SC-007)
    const r = runCli([
      '--db', dbPath,
      '--tu', '2026-11-04T00:00:00.000Z',
      '--den', '2026-11-06T00:00:00.000Z',
    ]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /SC-007:\s*1\/1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
