// T036: sao lưu db mỗi ngày 03:00 giờ VN (FR-028 `specs/001-nen-tang-chung/spec.md:253`,
// `specs/001-nen-tang-chung/data-model.md:172`). Thi hành Điều VI (không phụ thuộc ngoài: `VACUUM INTO`
// của node:sqlite) và ràng buộc giờ VN không theo TZ của máy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { openStore } from '../../core/store.js';
import { createBackup } from '../../core/backup.js';
import { fakeClock } from '../helpers/fakes.mjs';

// 2026-11-05T20:00:00Z = 03:00 giờ VN ngày 2026-11-06 → tên tệp phải theo NGÀY VN, không theo UTC.
const BA_GIO_VN = '2026-11-05T20:00:00.000Z';
const NGAY_VN = '2026-11-06';

/** Một vùng làm việc riêng cho mỗi test: DATA_DIR thật trên đĩa + db thật (VACUUM INTO cần tệp). */
function setup({ start = BA_GIO_VN } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `backup-test-${process.pid}-`));
  const clock = fakeClock(start);
  const store = openStore(join(dir, 'bot.db'));
  const loi = [];
  const backup = createBackup({ store, dataDir: dir, now: clock.now, log: (...a) => loi.push(a.join(' ')) });
  const banSao = () => readdirSync(join(dir, 'backup')).filter((f) => f.endsWith('.db')).sort();
  const don = () => { try { store.close(); } catch { /* đã đóng */ } rmSync(dir, { recursive: true, force: true }); };
  return { dir, clock, store, backup, loi, banSao, don };
}

test('03:00 giờ VN: tạo backup/bot-<ngày VN>.db, mở được bằng openStore, ghi meta.last_backup_at', async () => {
  const { dir, store, backup, banSao, don } = setup();
  try {
    store.messages.add({ chat_id: 'c1', speaker: 'khach', text: 'xin chào', at: BA_GIO_VN });
    const r = await backup.run();

    assert.equal(r.status, 'created');
    assert.equal(r.path, join(dir, 'backup', `bot-${NGAY_VN}.db`));
    assert.deepEqual(banSao(), [`bot-${NGAY_VN}.db`]);
    // Mốc ghi vào meta là ISO UTC (ràng buộc kỹ thuật hiến pháp), ngày trong TÊN TỆP là ngày VN.
    assert.equal(store.meta.get('last_backup_at'), BA_GIO_VN);

    // Bản sao phải là db dùng được, không phải tệp rỗng: mở lại và đọc đúng dữ liệu.
    const ban = openStore(r.path);
    try {
      assert.equal(ban.meta.get('schema_version'), '1');
      assert.deepEqual(ban.messages.recent('c1', 5).map((m) => m.text), ['xin chào']);
    } finally {
      ban.close();
    }
  } finally {
    don();
  }
});

test('tên tệp theo ngày VN, không theo ngày UTC của máy (TZ máy bất kỳ)', async () => {
  // 2026-11-06T20:00:00Z là 03:00 VN ngày 07/11 — ngày UTC (06/11) khác ngày VN (07/11).
  const { backup, banSao, don } = setup({ start: '2026-11-06T20:00:00.000Z' });
  try {
    const r = await backup.run();
    assert.equal(r.status, 'created');
    assert.deepEqual(banSao(), ['bot-2026-11-07.db']);
  } finally {
    don();
  }
});

test('chạy lại trong cùng ngày VN: KHÔNG tạo bản thứ hai (meta.last_backup_at trùng ngày)', async () => {
  const { clock, backup, banSao, don } = setup();
  try {
    assert.equal((await backup.run()).status, 'created');
    const r2 = await backup.run();
    assert.equal(r2.status, 'skipped');
    assert.equal(r2.reason, 'da-sao-luu-hom-nay');
    clock.advance('30m'); // 03:30 VN, vẫn trong giờ 3 và vẫn trong ngày đó
    assert.equal((await backup.run()).reason, 'da-sao-luu-hom-nay');
    assert.deepEqual(banSao(), [`bot-${NGAY_VN}.db`]);
  } finally {
    don();
  }
});

test('ngoài giờ 03 giờ VN: không chạy, không tạo thư mục backup', async () => {
  const { dir, backup, don } = setup({ start: '2026-11-05T19:59:59.000Z' }); // 02:59:59 VN
  try {
    const r = await backup.run();
    assert.equal(r.status, 'skipped');
    assert.equal(r.reason, 'khong-dung-gio');
    assert.equal(existsSync(join(dir, 'backup')), false);
  } finally {
    don();
  }
});

test('04:00 giờ VN (đã qua giờ sao lưu) cũng không chạy — bộ quét gọi mỗi phút suốt ngày', async () => {
  const { backup, don } = setup({ start: '2026-11-05T21:00:00.000Z' }); // 04:00 VN
  try {
    assert.equal((await backup.run()).reason, 'khong-dung-gio');
  } finally {
    don();
  }
});

test('ngày hôm sau vào 03:00 VN thì sao lưu tiếp (mốc meta khác ngày)', async () => {
  const { clock, backup, banSao, don } = setup();
  try {
    await backup.run();
    clock.advance('1d');
    const r = await backup.run();
    assert.equal(r.status, 'created');
    assert.deepEqual(banSao(), [`bot-${NGAY_VN}.db`, 'bot-2026-11-07.db']);
  } finally {
    don();
  }
});

test('giữ ĐÚNG 7 bản mới nhất: bản cũ hơn bị xoá, tệp lạ trong thư mục không bị đụng', async () => {
  const { dir, backup, banSao, don } = setup();
  try {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(dir, 'backup'), { recursive: true });
    // 8 bản cũ (29/10 → 05/11) + bản mới của hôm nay (06/11) = 9 → chỉ còn 7 bản mới nhất.
    for (const d of ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']) {
      writeFileSync(join(dir, 'backup', `bot-${d}.db`), 'cu');
    }
    writeFileSync(join(dir, 'backup', 'ghi-chu.txt'), 'tệp người vận hành để lại');

    const r = await backup.run();
    assert.equal(r.status, 'created');
    assert.equal(r.xoa.length, 2, 'phải xoá đúng 2 bản cũ nhất');
    assert.deepEqual(banSao(), [
      '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06',
    ].map((d) => `bot-${d}.db`));
    // Tệp không phải bản sao của bot thì không được xoá: thư mục này là của người vận hành.
    assert.equal(existsSync(join(dir, 'backup', 'ghi-chu.txt')), true);
  } finally {
    don();
  }
});

test('tệp bản sao của hôm nay đã tồn tại mà meta trống (db phục hồi): coi như xong, không ném lỗi', async () => {
  const { dir, store, backup, banSao, don } = setup();
  try {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(dir, 'backup'), { recursive: true });
    writeFileSync(join(dir, 'backup', `bot-${NGAY_VN}.db`), 'ban cu cua hom nay');
    assert.equal(store.meta.get('last_backup_at'), null);

    const r = await backup.run();
    // VACUUM INTO ném lỗi nếu tệp đích đã có; phải nhận ra và chỉ ghi lại mốc.
    assert.equal(r.status, 'skipped');
    assert.equal(r.reason, 'da-co-tep');
    assert.equal(store.meta.get('last_backup_at'), BA_GIO_VN);
    assert.deepEqual(banSao(), [`bot-${NGAY_VN}.db`]);
  } finally {
    don();
  }
});

test('db lỗi: báo log và trả skipped, KHÔNG ném ra ngoài (bộ quét nền không được chết)', async () => {
  const { store, backup, loi, don } = setup();
  try {
    store.close(); // mô phỏng db đã đóng / hỏng
    const r = await backup.run();
    assert.equal(r.status, 'error');
    assert.ok(loi.some((d) => /sao lưu/i.test(d)), `phải ghi log lỗi sao lưu: ${JSON.stringify(loi)}`);
  } finally {
    don();
  }
});
