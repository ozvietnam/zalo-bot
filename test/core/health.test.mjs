// test/core/health.test.mjs — /health phải nói được thời điểm container khởi động,
// để xác minh production đã build lại với code mới (chỉ cần so thời điểm merge).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHealthPayload } from '../../core/health.js';

test('health payload: có startedAt (ISO) và version để đối chiếu deploy', () => {
  const p = createHealthPayload({ mode: 'webhook', startedAt: new Date('2026-11-05T07:30:00Z'), version: 'ab4162a' });
  assert.equal(p.ok, true);
  assert.equal(p.mode, 'webhook');
  assert.equal(p.startedAt, '2026-11-05T07:30:00.000Z');
  assert.equal(p.version, 'ab4162a');
});

test('health payload: không có version thì vẫn có startedAt', () => {
  const p = createHealthPayload({ mode: 'polling', startedAt: new Date(0) });
  assert.equal(p.startedAt, '1970-01-01T00:00:00.000Z');
  assert.equal(p.version, undefined);
});
