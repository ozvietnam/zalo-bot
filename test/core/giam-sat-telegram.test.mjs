// Test Telegram integration — spec 007 mở rộng
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dungBanTin } from '../../scripts/giam-sat/telegram.js';

test('dungBanTin: 0 phát hiện → bản tin ✅ sạch', () => {
  const t = dungBanTin({ ngay: '2026-11-06', phatHien: [], ketQua: { moi: [], comment: [], boViGioiHan: [] } });
  assert.ok(t.includes('✅'));
  assert.ok(t.includes('0'));
});

test('dungBanTin: 2 phát hiện → có mã + số đo + repo', () => {
  const t = dungBanTin({
    ngay: '2026-11-06',
    phatHien: [
      { ma: 'TOOL-ERR', cheDo: 'tra_thue', soDo: '5 lần', repo: 'ozplugin' },
      { ma: 'KHACH-BUC', cheDo: null, soDo: '3 phòng', repo: 'zalo-bot' },
    ],
    ketQua: { moi: [{ repo: 'ozplugin/ozplugin' }], comment: [], boViGioiHan: [] },
  });
  assert.ok(t.includes('<code>TOOL-ERR</code>/tra_thue'));
  assert.ok(t.includes('KHACH-BUC'));
  assert.ok(t.includes('ozplugin'));
  assert.ok(t.includes('Issue mới: 1'));
});

test('dungBanTin: lỗi GitHub token → hiển thị cảnh báo', () => {
  const t = dungBanTin({
    ngay: '2026-11-06',
    phatHien: [{ ma: 'GATE-LEAK', soDo: '1 lần', repo: 'zalo-bot' }],
    ketQua: { moi: [], comment: [], boViGioiHan: [], loi: 'Thiếu GITHUB_TOKEN' },
  });
  assert.ok(t.includes('Thiếu GITHUB_TOKEN'));
});
