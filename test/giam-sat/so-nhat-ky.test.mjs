import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ghiNhatKy, docNhatKy } from '../../scripts/giam-sat/so-nhat-ky.js';

test('T712 (FR-011): Ghi và đọc lại đầy đủ thông tin thực thi một phiên giám sát', () => {
  const db = new DatabaseSync(':memory:');
  const entry = {
    ngay: '2026-11-06',
    nguon: 'bot.db',
    soTin: 150,
    phatHien: 3,
    ketQuaIssue: {
      moi: [{ repo: 'zalo-bot', tieuDe: '[giám sát] GATE-LEAK' }],
      comment: [{ repo: 'ozplugin', issue: 12 }],
      loi: null,
    },
    loi: null,
  };

  const id = ghiNhatKy(entry, { db });
  assert.ok(id > 0, 'Phải trả về ID bản ghi nhật ký');

  const danhSach = docNhatKy({ db });
  assert.equal(danhSach.length, 1);
  const r = danhSach[0];
  assert.equal(r.ngay, '2026-11-06');
  assert.equal(r.nguon, 'bot.db');
  assert.equal(r.so_tin, 150);
  assert.equal(r.so_phat_hien, 3);
  assert.equal(r.issue_moi, 1);
  assert.equal(r.issue_comment, 1);
  assert.equal(r.loi, null);
  assert.ok(r.at, 'Phải có mốc thời gian ghi sổ');
  assert.equal(r.chi_tiet_issue?.moi?.length, 1);
});

test('T712: Ghi nhận lỗi khi có sự cố trong phiên giám sát', () => {
  const db = new DatabaseSync(':memory:');
  const entry = {
    ngay: '2026-11-07',
    nguon: 'bot.db',
    soTin: 80,
    phatHien: [{ ma: 'TOOL-ERR' }],
    ketQuaIssue: { moi: [], comment: [], loi: [{ loi: 'GitHub API 403: rate limit' }] },
    loi: 'GitHub rate limit',
  };

  ghiNhatKy(entry, { db });
  const danhSach = docNhatKy({ db, ngay: '2026-11-07' });
  assert.equal(danhSach.length, 1);
  assert.equal(danhSach[0].so_phat_hien, 1);
  assert.equal(danhSach[0].issue_moi, 0);
  assert.equal(danhSach[0].loi, 'GitHub rate limit');
});

test('T712: Ghi nhật ký vào tệp SQLite độc lập và tự động đóng', () => {
  const dbPath = ':memory:';
  const entry = { ngay: '2026-11-08', nguon: 'bot.db', soTin: 200, phatHien: 0 };
  assert.doesNotThrow(() => {
    ghiNhatKy(entry, { dbPath });
  });
});
