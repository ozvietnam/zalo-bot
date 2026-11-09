import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../../core/store.js';
import {
  guiBanTinDigest,
  soanBanTin,
  ghiHopThuDigest,
  tenTepHopThu,
  THU_MUC_HOP_THU,
} from '../../scripts/giam-sat/digest.js';

test('T704: Bản tin giám sát phải gửi qua cửa gate.send với kind: digest', async () => {
  const sent = [];
  const fakeGate = {
    send: async (req) => {
      sent.push(req);
      return { ok: true, decision: 'send' };
    },
  };
  const staffChatId = 'staff-group-123';
  await guiBanTinDigest({
    banTin: 'Bản tin giám sát ngày 2026-11-06',
    gate: fakeGate,
    staffChatId,
    ngay: '2026-11-06',
    loai: 'ngay',
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].kind, 'digest');
  assert.equal(sent[0].chatId, staffChatId);
  assert.equal(sent[0].isGroup, true);
  assert.equal(sent[0].idemKey, 'digest:ngay:2026-11-06');
});

test('T704: soanBanTin tạo nội dung bản tin tiếng Việt không chứa thẻ HTML', () => {
  // Ca 0 phát hiện
  const tin0 = soanBanTin({
    ngay: '2026-11-06',
    phatHien: [],
    ketQua: { moi: [], comment: [], boViGioiHan: [] },
  });
  assert.match(tin0, /2026-11-06/);
  assert.match(tin0, /0 phát hiện|sạch/i);
  assert.doesNotMatch(tin0, /<[^>]+>/, 'Không chứa thẻ HTML');

  // Ca có phát hiện
  const tinCo = soanBanTin({
    ngay: '2026-11-06',
    phatHien: [
      { ma: 'GATE-LEAK', cheDo: '', soDo: '1 lần', repo: 'zalo-bot', bangChung: ['turn-1'] },
      { ma: 'TOOL-ERR', cheDo: 'tra_cuoc', soDo: '3 lỗi (6%)', repo: 'ozplugin', bangChung: ['turn-2'] },
    ],
    ketQua: {
      moi: [{ repo: 'zalo-bot', tieuDe: 'Lộ thông tin' }],
      comment: [{ repo: 'ozplugin', issue: 10, ma: 'TOOL-ERR' }],
      boViGioiHan: [],
    },
  });
  assert.match(tinCo, /Phát hiện:\s*2/);
  assert.match(tinCo, /GATE-LEAK/);
  assert.match(tinCo, /TOOL-ERR/);
  assert.match(tinCo, /Issue mới:\s*1/);
  assert.match(tinCo, /Comment cũ:\s*1/);
  assert.doesNotMatch(tinCo, /<[^>]+>/, 'Không chứa thẻ HTML');
});

test('T704 (B2b): ghiHopThuDigest mỗi bản tin một tệp theo idemKey, chạy lại không nhân bản', () => {
  const tmpDir = join(process.cwd(), 'tmp-test-digest-file-' + Date.now());
  mkdirSync(tmpDir, { recursive: true });

  try {
    const ngay = '2026-11-06';
    const banTin = 'Nội dung bản tin ngày 2026-11-06';

    // Lần 1: ghi bản tin
    const r1 = ghiHopThuDigest({
      banTin,
      ngay,
      loai: 'ngay',
      dataDir: tmpDir,
    });
    assert.equal(r1.ok, true);
    assert.equal(r1.inserted, true);
    assert.equal(r1.idemKey, 'digest:ngay:2026-11-06');

    const expectedFile = join(tmpDir, THU_MUC_HOP_THU, tenTepHopThu('digest:ngay:2026-11-06'));
    assert.equal(existsSync(expectedFile), true, 'Tệp riêng theo idemKey phải được tạo');

    const payload = JSON.parse(readFileSync(expectedFile, 'utf8'));
    assert.equal(payload.idemKey, 'digest:ngay:2026-11-06');
    assert.equal(payload.status, 'pending');
    assert.equal(payload.text, banTin);

    // Lần 2: chạy lại CLI cùng kỳ -> không nhân bản (inserted = false)
    const r2 = ghiHopThuDigest({
      banTin: 'Nội dung khác nhưng cùng kỳ',
      ngay,
      loai: 'ngay',
      dataDir: tmpDir,
    });
    assert.equal(r2.ok, true);
    assert.equal(r2.inserted, false);

    // Nội dung tệp cũ không bị ghi đè
    const payloadAfter = JSON.parse(readFileSync(expectedFile, 'utf8'));
    assert.equal(payloadAfter.text, banTin);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T704: Ngày 0 phát hiện vẫn ghi nhận bản tin vào tệp riêng', () => {
  const tmpDir = join(process.cwd(), 'tmp-test-digest-zero-' + Date.now());
  mkdirSync(tmpDir, { recursive: true });

  try {
    const ngay = '2026-11-07';
    const banTin0 = soanBanTin({ ngay, phatHien: [], ketQua: { moi: [], comment: [], boViGioiHan: [] } });

    const r = ghiHopThuDigest({
      banTin: banTin0,
      ngay,
      loai: 'ngay',
      dataDir: tmpDir,
    });
    assert.equal(r.ok, true);
    assert.equal(r.inserted, true);

    const expectedFile = join(tmpDir, THU_MUC_HOP_THU, tenTepHopThu('digest:ngay:2026-11-07'));
    assert.equal(existsSync(expectedFile), true);
    const data = JSON.parse(readFileSync(expectedFile, 'utf8'));
    assert.match(data.text, /0 phát hiện|sạch/i);
    assert.equal(data.status, 'pending');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T704: Ghi hộp thư riêng KHÔNG làm thay đổi bot.db (bảo toàn SHA-256)', () => {
  const tmpDir = join(process.cwd(), 'tmp-test-botdb-sha-' + Date.now());
  mkdirSync(tmpDir, { recursive: true });

  try {
    const botDbPath = join(tmpDir, 'bot.db');
    const botDb = new DatabaseSync(botDbPath);
    botDb.exec("CREATE TABLE test_data (id INT, val TEXT); INSERT INTO test_data VALUES (1, 'goc');");
    botDb.close();

    const shaTruoc = createHash('sha256').update(readFileSync(botDbPath)).digest('hex');
    const sizeTruoc = readFileSync(botDbPath).length;

    ghiHopThuDigest({
      banTin: 'Bản tin an toàn',
      ngay: '2026-11-08',
      loai: 'ngay',
      dataDir: tmpDir,
    });

    const shaSau = createHash('sha256').update(readFileSync(botDbPath)).digest('hex');
    const sizeSau = readFileSync(botDbPath).length;

    assert.equal(shaSau, shaTruoc, 'SHA-256 của bot.db phải giữ nguyên');
    assert.equal(sizeSau, sizeTruoc, 'Kích thước bot.db phải giữ nguyên');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T704 (B2d): Test xoá TELEGRAM_* và GITHUB_* khỏi env tiến trình con CLI', () => {
  const tmpDir = join(process.cwd(), 'tmp-test-clean-env-' + Date.now());
  mkdirSync(tmpDir, { recursive: true });

  try {
    const dbPath = join(tmpDir, 'bot.db');
    const store = openStore(dbPath);
    store.close();

    // Dọn sạch toàn bộ biến TELEGRAM_* và GITHUB_* / GH_*
    const cleanEnv = { ...process.env, DATA_DIR: tmpDir };
    for (const k of Object.keys(cleanEnv)) {
      if (k.startsWith('TELEGRAM_') || k.startsWith('GITHUB_') || k.startsWith('GH_')) {
        delete cleanEnv[k];
      }
    }

    const res = spawnSync(process.execPath, [
      'scripts/giam-sat.mjs',
      '--ngay=2026-11-06',
    ], {
      env: cleanEnv,
      encoding: 'utf8',
    });

    assert.equal(res.status, 0, `CLI thất bại: ${res.stderr || res.stdout}`);

    const hopThuFile = join(tmpDir, THU_MUC_HOP_THU, tenTepHopThu('digest:ngay:2026-11-06'));
    assert.equal(existsSync(hopThuFile), true, 'Bản tin phải được ghi vào hộp thư riêng');
    const data = JSON.parse(readFileSync(hopThuFile, 'utf8'));
    assert.equal(data.status, 'pending');
    assert.match(data.text, /0 phát hiện|sạch/i);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
