import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createDigestScanner, THU_MUC_HOP_THU } from '../../core/digest-scan.js';
import { ghiHopThuDigest, tenTepHopThu } from '../../scripts/giam-sat/digest.js';

test('T704: createDigestScanner - tắt mặc định khi không có biến môi trường', async () => {
  const oldEnv = process.env.GIAM_SAT_DIGEST_ENABLED;
  delete process.env.GIAM_SAT_DIGEST_ENABLED;
  try {
    const sent = [];
    const fakeGate = { send: async (req) => sent.push(req) };
    const scanner = createDigestScanner({
      gate: fakeGate,
      config: { staffChatId: 'staff-group' },
      dataDir: './data',
    });
    const res = await scanner.scan();
    assert.equal(res.skipped, true);
    assert.equal(res.reason, 'disabled');
    assert.equal(sent.length, 0);
  } finally {
    if (oldEnv !== undefined) process.env.GIAM_SAT_DIGEST_ENABLED = oldEnv;
  }
});

test('T704 (B1[chan]): Bộ quét KHÔNG gửi digest trong giờ yên 23:00–07:00 VN', async () => {
  const tmpDir = join(process.cwd(), 'tmp-test-quiet-hours-' + Date.now());
  mkdirSync(tmpDir, { recursive: true });

  const oldEnv = process.env.GIAM_SAT_DIGEST_ENABLED;
  process.env.GIAM_SAT_DIGEST_ENABLED = '1';

  try {
    ghiHopThuDigest({
      banTin: 'Bản tin đêm',
      ngay: '2026-11-06',
      loai: 'ngay',
      dataDir: tmpDir,
    });

    const sent = [];
    const fakeGate = {
      send: async (req) => {
        sent.push(req);
        return { ok: true, decision: 'send', status: 'sent' };
      },
    };

    // 23:30 VN = 16:30 UTC
    const gioYenDate = new Date('2026-11-06T16:30:00.000Z');
    const scanner = createDigestScanner({
      gate: fakeGate,
      config: { staffChatId: 'staff-group' },
      dataDir: tmpDir,
      now: () => gioYenDate,
    });

    const res = await scanner.scan();
    assert.equal(res.skipped, true);
    assert.equal(res.reason, 'quiet-hours');
    assert.equal(sent.length, 0, 'Tuyệt đối không gửi tin trong giờ yên');

    // Kiểm tra trạng thái tệp vẫn là pending
    const tFile = join(tmpDir, THU_MUC_HOP_THU, tenTepHopThu('digest:ngay:2026-11-06'));
    const data = JSON.parse(readFileSync(tFile, 'utf8'));
    assert.equal(data.status, 'pending');

    // Sang ban ngày 07:30 VN = 00:30 UTC -> quét thành công
    const banNgayDate = new Date('2026-11-07T00:30:00.000Z');
    const scannerSang = createDigestScanner({
      gate: fakeGate,
      config: { staffChatId: 'staff-group' },
      dataDir: tmpDir,
      now: () => banNgayDate,
    });

    const resSang = await scannerSang.scan();
    assert.equal(resSang.processed, 1);
    assert.equal(sent.length, 1);
  } finally {
    if (oldEnv !== undefined) process.env.GIAM_SAT_DIGEST_ENABLED = oldEnv;
    else delete process.env.GIAM_SAT_DIGEST_ENABLED;
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T704 (B1[chan]): Bản tin quá hạn (ngày > 24h, tuần > 7 ngày) đánh dấu het-han, không gửi', async () => {
  const tmpDir = join(process.cwd(), 'tmp-test-expire-' + Date.now());
  mkdirSync(tmpDir, { recursive: true });

  const oldEnv = process.env.GIAM_SAT_DIGEST_ENABLED;
  process.env.GIAM_SAT_DIGEST_ENABLED = '1';

  try {
    const sent = [];
    const fakeGate = {
      send: async (req) => {
        sent.push(req);
        return { ok: true, decision: 'send', status: 'sent' };
      },
    };

    // Tạo bản tin ngày từ 25 giờ trước
    const tTaoNgay = new Date('2026-11-05T01:00:00.000Z');
    ghiHopThuDigest({
      banTin: 'Bản tin ngày cũ',
      ngay: '2026-11-05',
      loai: 'ngay',
      dataDir: tmpDir,
      now: () => tTaoNgay,
    });

    // Tạo bản tin tuần từ 8 ngày trước
    const tTaoTuan = new Date('2026-10-28T01:00:00.000Z');
    ghiHopThuDigest({
      banTin: 'Bản tin tuần cũ',
      ngay: '2026-W44',
      loai: 'tuan',
      dataDir: tmpDir,
      now: () => tTaoTuan,
    });

    // Quét tại mốc 2026-11-06T02:00:00.000Z (ngày cách 25h, tuần cách 9 ngày)
    const scanner = createDigestScanner({
      gate: fakeGate,
      config: { staffChatId: 'staff-group' },
      dataDir: tmpDir,
      now: () => new Date('2026-11-06T02:00:00.000Z'),
    });

    const res = await scanner.scan();
    assert.equal(res.processed, 0);
    assert.equal(sent.length, 0, 'Bản tin quá hạn không được gửi');

    // Kiểm tra tệp bản tin ngày đã chuyển sang het-han
    const fNgay = join(tmpDir, THU_MUC_HOP_THU, tenTepHopThu('digest:ngay:2026-11-05'));
    const dNgay = JSON.parse(readFileSync(fNgay, 'utf8'));
    assert.equal(dNgay.status, 'het-han');
    assert.equal(dNgay.lastError, 'qua-han');

    // Kiểm tra tệp bản tin tuần đã chuyển sang het-han
    const fTuan = join(tmpDir, THU_MUC_HOP_THU, tenTepHopThu('digest:tuan:2026-W44'));
    const dTuan = JSON.parse(readFileSync(fTuan, 'utf8'));
    assert.equal(dTuan.status, 'het-han');
    assert.equal(dTuan.lastError, 'qua-han');
  } finally {
    if (oldEnv !== undefined) process.env.GIAM_SAT_DIGEST_ENABLED = oldEnv;
    else delete process.env.GIAM_SAT_DIGEST_ENABLED;
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T704 (B2a): duplicate-idem ghi status dropped, KHÔNG được ghi sent', async () => {
  const tmpDir = join(process.cwd(), 'tmp-test-dup-idem-' + Date.now());
  mkdirSync(tmpDir, { recursive: true });

  const oldEnv = process.env.GIAM_SAT_DIGEST_ENABLED;
  process.env.GIAM_SAT_DIGEST_ENABLED = '1';

  try {
    ghiHopThuDigest({
      banTin: 'Bản tin trùng',
      ngay: '2026-11-06',
      loai: 'ngay',
      dataDir: tmpDir,
      now: () => new Date('2026-11-06T01:00:00.000Z'),
    });

    // Gate trả về drop duplicate-idem
    const fakeGate = {
      send: async () => ({ decision: 'drop', reason: 'duplicate-idem', status: 'dropped' }),
    };

    const scanner = createDigestScanner({
      gate: fakeGate,
      config: { staffChatId: 'staff-group' },
      dataDir: tmpDir,
      now: () => new Date('2026-11-06T01:05:00.000Z'),
    });

    const res = await scanner.scan();
    assert.equal(res.processed, 0, 'duplicate-idem không tính vào processed gửi thành công');

    const f = join(tmpDir, THU_MUC_HOP_THU, tenTepHopThu('digest:ngay:2026-11-06'));
    const data = JSON.parse(readFileSync(f, 'utf8'));
    assert.equal(data.status, 'dropped', 'B2a: phải ghi trạng thái dropped');
    assert.notEqual(data.status, 'sent', 'B2a: duplicate-idem không được ghi sent');
    assert.equal(data.lastError, 'duplicate-idem');
  } finally {
    if (oldEnv !== undefined) process.env.GIAM_SAT_DIGEST_ENABLED = oldEnv;
    else delete process.env.GIAM_SAT_DIGEST_ENABLED;
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T704 (B2a, B2c): leak:banned được xử lý an toàn, lastError phải qua redact', async () => {
  const tmpDir = join(process.cwd(), 'tmp-test-leak-' + Date.now());
  mkdirSync(tmpDir, { recursive: true });

  const oldEnv = process.env.GIAM_SAT_DIGEST_ENABLED;
  process.env.GIAM_SAT_DIGEST_ENABLED = '1';

  try {
    ghiHopThuDigest({
      banTin: 'Bản tin chứa từ cấm hoặc rò rỉ Bearer sk-gia-loi-goc',
      ngay: '2026-11-06',
      loai: 'ngay',
      dataDir: tmpDir,
      now: () => new Date('2026-11-06T01:00:00.000Z'),
    });

    // Gate từ chối leak:banned kèm token Bearer
    const fakeGate = {
      send: async () => ({ decision: 'reject', reason: 'leak:banned:Bearer sk-gia-loi-goc' }),
    };

    const scanner = createDigestScanner({
      gate: fakeGate,
      config: { staffChatId: 'staff-group' },
      dataDir: tmpDir,
      now: () => new Date('2026-11-06T01:05:00.000Z'),
    });

    await scanner.scan();

    const f = join(tmpDir, THU_MUC_HOP_THU, tenTepHopThu('digest:ngay:2026-11-06'));
    const data = JSON.parse(readFileSync(f, 'utf8'));
    assert.equal(data.status, 'pending', 'Bản tin giữ pending để thử lại');
    assert.equal(data.attempts, 1);
    // B2c: lastError phải được che bí mật qua redact
    assert.doesNotMatch(data.lastError, /sk-gia-loi-goc/);
    assert.match(data.lastError, /reject:leak:banned:Bearer \*\*\*/);
  } finally {
    if (oldEnv !== undefined) process.env.GIAM_SAT_DIGEST_ENABLED = oldEnv;
    else delete process.env.GIAM_SAT_DIGEST_ENABLED;
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T704: Khẳng định không bao giờ gửi tới chatId khác ngoài STAFF_CHAT_ID', async () => {
  const tmpDir = join(process.cwd(), 'tmp-test-scan-chatid-' + Date.now());
  mkdirSync(tmpDir, { recursive: true });

  const oldEnv = process.env.GIAM_SAT_DIGEST_ENABLED;
  process.env.GIAM_SAT_DIGEST_ENABLED = '1';

  try {
    ghiHopThuDigest({
      banTin: 'Bản tin',
      ngay: '2026-11-07',
      loai: 'ngay',
      dataDir: tmpDir,
      now: () => new Date('2026-11-07T01:00:00.000Z'),
    });

    const sent = [];
    const fakeGate = {
      send: async (req) => {
        sent.push(req);
        return { ok: true, decision: 'send', status: 'sent' };
      },
    };

    const staffChatId = 'staff-official-group';
    const scanner = createDigestScanner({
      gate: fakeGate,
      config: { staffChatId },
      dataDir: tmpDir,
      now: () => new Date('2026-11-07T01:05:00.000Z'),
    });

    await scanner.scan();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].chatId, staffChatId);
    assert.equal(sent[0].isGroup, true);
  } finally {
    if (oldEnv !== undefined) process.env.GIAM_SAT_DIGEST_ENABLED = oldEnv;
    else delete process.env.GIAM_SAT_DIGEST_ENABLED;
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T704: Hộp thư rỗng, không tồn tại hoặc có file hỏng thì bot không sập', async () => {
  const tmpDir = join(process.cwd(), 'tmp-test-scan-corrupt-' + Date.now());
  mkdirSync(tmpDir, { recursive: true });

  const oldEnv = process.env.GIAM_SAT_DIGEST_ENABLED;
  process.env.GIAM_SAT_DIGEST_ENABLED = '1';

  try {
    const fakeGate = { send: async () => ({ decision: 'send', status: 'sent' }) };

    // Case 1: Thư mục hộp thư chưa tồn tại
    const scanner1 = createDigestScanner({
      gate: fakeGate,
      config: { staffChatId: 'staff-group' },
      dataDir: tmpDir,
      now: () => new Date('2026-11-07T01:00:00.000Z'),
    });
    const res1 = await scanner1.scan();
    assert.equal(res1.processed, 0);

    // Case 2: Thư mục tồn tại nhưng rỗng
    mkdirSync(join(tmpDir, THU_MUC_HOP_THU), { recursive: true });
    const res2 = await scanner1.scan();
    assert.equal(res2.processed, 0);

    // Case 3: Chứa tệp JSON hỏng
    writeFileSync(join(tmpDir, THU_MUC_HOP_THU, 'corrupt.json'), 'invalid json {');
    const res3 = await scanner1.scan();
    assert.equal(res3.processed, 0);
  } finally {
    if (oldEnv !== undefined) process.env.GIAM_SAT_DIGEST_ENABLED = oldEnv;
    else delete process.env.GIAM_SAT_DIGEST_ENABLED;
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
