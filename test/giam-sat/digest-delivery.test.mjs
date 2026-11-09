import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { openStore } from '../../core/store.js';
import { ghiHopThu, createGiamSatHopThu } from '../../core/giam-sat-hop-thu.js';
import { soanBanTinDigest } from '../../scripts/giam-sat/digest.js';

const STAFF_CHAT_ID = '0912345678'; // số điện thoại mẫu duy nhất theo quy định

function createTempDir(prefix = 'giam-sat-digest-test-') {
  const dir = join(tmpdir(), `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

test('T704: ghiHopThu ghi đúng một bản tin cho mỗi kỳ, chạy lại không nhân bản', () => {
  const tmpDir = createTempDir();
  try {
    const idemKey = 'digest:ngay:2026-11-06';
    const text = 'Bản tin giám sát ngày 2026-11-06';

    const r1 = ghiHopThu({ dataDir: tmpDir, idemKey, text });
    assert.equal(r1.ok, true);
    assert.equal(r1.daCo, false);

    const hopThuPath = join(tmpDir, 'hop-thu-giam-sat.json');
    assert.equal(existsSync(hopThuPath), true);
    const data1 = JSON.parse(readFileSync(hopThuPath, 'utf8'));
    assert.equal(data1.length, 1);
    assert.equal(data1[0].idemKey, idemKey);
    assert.equal(data1[0].status, 'pending');

    // Chạy lại cùng idemKey
    const r2 = ghiHopThu({ dataDir: tmpDir, idemKey, text });
    assert.equal(r2.ok, true);
    assert.equal(r2.daCo, true);

    const data2 = JSON.parse(readFileSync(hopThuPath, 'utf8'));
    assert.equal(data2.length, 1, 'Không được nhân bản bản tin đã có');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T704: createGiamSatHopThu quét và gọi gate.send đúng một lần với kind: digest và chatId: STAFF_CHAT_ID', async () => {
  const tmpDir = createTempDir();
  try {
    const idemKey = 'digest:ngay:2026-11-06';
    const text = 'Bản tin giám sát ngày 2026-11-06';
    ghiHopThu({ dataDir: tmpDir, idemKey, text });

    const sent = [];
    const fakeGate = {
      send: async (req) => {
        sent.push(req);
        return { ok: true, decision: 'send', status: 'sent', id: 1 };
      },
    };

    const hopThu = createGiamSatHopThu({
      dataDir: tmpDir,
      gate: fakeGate,
      staffChatId: STAFF_CHAT_ID,
      enabled: true,
    });

    const res = await hopThu.quet();
    assert.equal(res.status, 'ok');

    // Khẳng định cửa gửi được gọi đúng quy định
    assert.equal(sent.length, 1);
    assert.equal(sent[0].kind, 'digest');
    assert.equal(sent[0].chatId, STAFF_CHAT_ID);
    assert.equal(sent[0].convId, STAFF_CHAT_ID);
    assert.equal(sent[0].isGroup, true);
    assert.equal(sent[0].idemKey, idemKey);
    assert.equal(sent[0].text, text);

    // Khẳng định KHÔNG BAO GIỜ gửi tới chatId khác
    assert.equal(sent.every((m) => m.chatId === STAFF_CHAT_ID), true);

    // Kiểm tra trạng thái đã chuyển sang 'sent'
    const hopThuPath = join(tmpDir, 'hop-thu-giam-sat.json');
    const data = JSON.parse(readFileSync(hopThuPath, 'utf8'));
    assert.equal(data[0].status, 'sent');
    assert.ok(data[0].sentAt);

    // Quét lại: không gửi lại tin đã sent
    const res2 = await hopThu.quet();
    assert.equal(res2.status, 'ok');
    assert.equal(sent.length, 1, 'Không gửi lại bản tin đã đánh dấu sent');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T704: gate từ chối hoặc gửi lỗi thì bản tin được giữ lại để thử lại, không mất', async () => {
  const tmpDir = createTempDir();
  try {
    const idemKey = 'digest:ngay:2026-11-06';
    const text = 'Bản tin thử lại';
    ghiHopThu({ dataDir: tmpDir, idemKey, text });

    const fakeGate = {
      send: async () => ({ ok: false, decision: 'defer', reason: 'quiet-hours', status: 'deferred' }),
    };

    const hopThu = createGiamSatHopThu({
      dataDir: tmpDir,
      gate: fakeGate,
      staffChatId: STAFF_CHAT_ID,
      enabled: true,
    });

    await hopThu.quet();

    const hopThuPath = join(tmpDir, 'hop-thu-giam-sat.json');
    const data = JSON.parse(readFileSync(hopThuPath, 'utf8'));
    assert.equal(data.length, 1);
    assert.equal(data[0].status, 'pending', 'Bản tin phải giữ status pending để thử lại');
    assert.equal(data[0].attempts, 1);
    assert.equal(data[0].lastError, 'quiet-hours');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T704: Hộp thư rỗng hoặc JSON hỏng thì bộ quét không sập (fail-safe)', async () => {
  const tmpDir = createTempDir();
  try {
    const fakeGate = {
      send: async () => assert.fail('Không được gọi send khi hộp thư hỏng'),
    };

    const hopThu = createGiamSatHopThu({
      dataDir: tmpDir,
      gate: fakeGate,
      staffChatId: STAFF_CHAT_ID,
      enabled: true,
    });

    // 1. Khi chưa có file hộp thư
    const r1 = await hopThu.quet();
    assert.equal(r1.status, 'empty');

    // 2. Khi file hộp thư rỗng
    const hopThuPath = join(tmpDir, 'hop-thu-giam-sat.json');
    writeFileSync(hopThuPath, '', 'utf8');
    const r2 = await hopThu.quet();
    assert.equal(r2.status, 'empty');

    // 3. Khi file hộp thư chứa JSON hỏng
    writeFileSync(hopThuPath, 'invalid json {', 'utf8');
    const r3 = await hopThu.quet();
    assert.equal(r3.status, 'corrupt');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T704: Tính năng quét tắt mặc định khi enabled=false hoặc thiếu STAFF_CHAT_ID', async () => {
  const tmpDir = createTempDir();
  try {
    const idemKey = 'digest:ngay:2026-11-06';
    ghiHopThu({ dataDir: tmpDir, idemKey, text: 'Bản tin' });

    let sent = false;
    const fakeGate = {
      send: async () => { sent = true; return { ok: true, decision: 'send', status: 'sent' }; },
    };

    // Trường hợp 1: enabled = false
    const h1 = createGiamSatHopThu({ dataDir: tmpDir, gate: fakeGate, staffChatId: STAFF_CHAT_ID, enabled: false });
    const r1 = await h1.quet();
    assert.equal(r1.status, 'disabled');
    assert.equal(sent, false);

    // Trường hợp 2: staffChatId rỗng
    const h2 = createGiamSatHopThu({ dataDir: tmpDir, gate: fakeGate, staffChatId: '', enabled: true });
    const r2 = await h2.quet();
    assert.equal(r2.status, 'no-staff-chat');
    assert.equal(sent, false);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T704: CLI scripts/giam-sat.mjs ghi bản tin ngày vào hộp thư ngay cả khi 0 phát hiện', () => {
  const tmpDir = createTempDir();
  const dbPath = join(tmpDir, 'bot.db');
  try {
    const store = openStore(dbPath);
    store.close();

    // Chạy CLI giam-sat không dry-run trên db rỗng (0 phát hiện)
    const res = spawnSync(process.execPath, [
      'scripts/giam-sat.mjs',
      '--ngay=2026-11-06',
    ], {
      env: { ...process.env, DATA_DIR: tmpDir },
      encoding: 'utf8',
    });

    assert.equal(res.status, 0, `giam-sat thất bại: ${res.stderr || res.stdout}`);

    const hopThuPath = join(tmpDir, 'hop-thu-giam-sat.json');
    assert.equal(existsSync(hopThuPath), true, 'Hộp thư phải được tạo');
    const data = JSON.parse(readFileSync(hopThuPath, 'utf8'));
    assert.equal(data.length, 1);
    assert.equal(data[0].idemKey, 'digest:ngay:2026-11-06');
    assert.equal(data[0].status, 'pending');
    assert.match(data[0].text, /Giám sát bot — 2026-11-06/);
    assert.match(data[0].text, /Phát hiện:\s*0/);

    // Chạy lại lần 2 không nhân bản
    const res2 = spawnSync(process.execPath, [
      'scripts/giam-sat.mjs',
      '--ngay=2026-11-06',
    ], {
      env: { ...process.env, DATA_DIR: tmpDir },
      encoding: 'utf8',
    });
    assert.equal(res2.status, 0);
    const data2 = JSON.parse(readFileSync(hopThuPath, 'utf8'));
    assert.equal(data2.length, 1, 'Không nhân bản khi chạy lại');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T704: CLI scripts/giam-sat.mjs với --dry-run KHÔNG ghi vào hộp thư', () => {
  const tmpDir = createTempDir();
  const dbPath = join(tmpDir, 'bot.db');
  try {
    const store = openStore(dbPath);
    store.close();

    const res = spawnSync(process.execPath, [
      'scripts/giam-sat.mjs',
      '--dry-run',
      '--ngay=2026-11-06',
    ], {
      env: { ...process.env, DATA_DIR: tmpDir },
      encoding: 'utf8',
    });

    assert.equal(res.status, 0, `giam-sat thất bại: ${res.stderr || res.stdout}`);
    const hopThuPath = join(tmpDir, 'hop-thu-giam-sat.json');
    assert.equal(existsSync(hopThuPath), false, '--dry-run không được tạo hay ghi tệp hộp thư');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
