import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vnHour, isQuietHours, nextMorning, vnDateKey, vnDayStartUtc, vnStamp, vnGioNgay } from '../../core/time.js';

test('giờ VN không phụ thuộc TZ của máy', () => {
  const saved = process.env.TZ;
  try {
    for (const tz of ['UTC', 'Asia/Tokyo']) {
      process.env.TZ = tz;
      assert.equal(vnHour(new Date('2026-11-04T16:30:00Z')), 23);
      assert.equal(isQuietHours(new Date('2026-11-04T16:30:00Z')), true);
      assert.equal(isQuietHours(new Date('2026-11-04T00:30:00Z')), false);
      assert.equal(isQuietHours(new Date('2026-11-03T23:59:00Z')), true);
      assert.equal(isQuietHours(new Date('2026-11-04T00:00:00Z')), false); // 07:00 đúng
      assert.equal(isQuietHours(new Date('2026-11-04T15:59:00Z')), false); // 22:59
      assert.equal(nextMorning(new Date('2026-11-04T16:30:00Z')), '2026-11-05T00:00:00.000Z');
      assert.equal(nextMorning(new Date('2026-11-04T19:00:00Z')), '2026-11-05T00:00:00.000Z');
      assert.equal(nextMorning(new Date('2026-11-04T00:00:00Z')), '2026-11-05T00:00:00.000Z'); // strictly after
      assert.equal(vnDateKey(new Date('2026-11-04T17:30:00Z')), '2026-11-05');
      assert.equal(vnDateKey(new Date('2026-11-04T16:59:00Z')), '2026-11-04');
      assert.equal(vnDayStartUtc(new Date('2026-11-04T17:30:00Z')), '2026-11-04T17:00:00.000Z');
      assert.equal(vnDayStartUtc(new Date('2026-11-04T10:00:00Z')), '2026-11-03T17:00:00.000Z');
      assert.equal(vnStamp(new Date('2026-11-07T03:00:00.000Z')), '2026-11-07 10:00:00');
      assert.equal(vnStamp(new Date('2026-11-04T16:30:00Z')), '2026-11-04 23:30:00');
      assert.equal(vnStamp(new Date('2026-11-04T17:00:00Z')), '2026-11-05 00:00:00');
    }
  } finally {
    if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
  }
});

test('vnGioNgay: giờ hiển thị là giờ VN, không phụ thuộc TZ của máy', () => {
  const saved = process.env.TZ;
  try {
    for (const tz of ['UTC', 'Asia/Tokyo', 'America/New_York']) {
      process.env.TZ = tz;
      assert.equal(vnGioNgay('2026-11-04T03:00:00.000Z'), '10:00 04/11');
      assert.equal(vnGioNgay('2026-11-04T16:30:00.000Z'), '23:30 04/11');
      assert.equal(vnGioNgay('2026-11-04T03:05:00.000Z'), '10:05 04/11');
      // Qua nửa đêm giờ VN thì NGÀY cũng phải nhảy theo giờ VN, không theo UTC.
      assert.equal(vnGioNgay('2026-11-04T17:30:00.000Z'), '00:30 05/11');
    }
  } finally {
    if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
  }
});

test('isQuietHours: khoảng không qua nửa đêm', () => {
  assert.equal(isQuietHours(new Date('2026-11-04T05:00:00Z'), 10, 14), true); // 12:00 VN
  assert.equal(isQuietHours(new Date('2026-11-04T05:00:00Z'), 13, 14), false);
});
