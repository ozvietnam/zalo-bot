import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../core/config.js';

const min = { ZALO_BOT_TOKEN: 'x' };

test('mặc định với env tối thiểu', () => {
  const cfg = loadConfig(min);
  assert.equal(cfg.zaloToken, 'x');
  assert.equal(cfg.mode, 'webhook');
  assert.equal(cfg.port, 3010);
  assert.equal(cfg.webhookPath, '/webhook/zalo');
  assert.equal(cfg.mcpAuthHeader, 'Authorization');
  assert.equal(cfg.rateLimitPerMin, 10);
  assert.equal(cfg.capChatDay, 8);
  assert.equal(cfg.capAllDay, 300);
  assert.equal(cfg.sessionTtlMs, 7_200_000);
  assert.ok(cfg.allowUsers instanceof Set && cfg.allowUsers.size === 0);
  assert.ok(cfg.staffUsers instanceof Set);
  assert.ok(cfg.companyPhones instanceof Set && cfg.companyPhones.size === 0);
  assert.deepEqual(cfg.bannedPatterns, []);
  assert.deepEqual(cfg.botNames, []);
  assert.equal(Object.isFrozen(cfg), true);
});

test('giá trị sai thì ném lỗi nêu tên khoá', () => {
  assert.throws(() => loadConfig({ ...min, ZALO_MODE: 'abc' }), /ZALO_MODE/);
  assert.throws(() => loadConfig({ ...min, CAP_CHAT_DAY: '-1' }), /CAP_CHAT_DAY/);
  assert.throws(() => loadConfig({ ...min, CAP_ALL_DAY: 'x' }), /CAP_ALL_DAY/);
  assert.throws(() => loadConfig({ ...min, PORT: '0' }), /PORT/);
  assert.throws(() => loadConfig({ ...min, BANNED_PATTERNS: '(' }), /BANNED_PATTERNS/);
  assert.throws(() => loadConfig({}), /ZALO_BOT_TOKEN/);
});

test('danh sách, regex, số điện thoại', () => {
  const cfg = loadConfig({
    ...min,
    ZALO_MODE: 'polling',
    ALLOW_USERS: 'a, b ,,c',
    STAFF_USERS: 'u1',
    BANNED_PATTERNS: '0985\\D?559;;zzz',
    BOT_NAMES: 'OZ Bot, Bot',
    COMPANY_PHONES: '0985 559 918, +84 912 345 678, 84987654321',
    CAP_CHAT_DAY: '3',
  });
  assert.equal(cfg.mode, 'polling');
  assert.deepEqual([...cfg.allowUsers], ['a', 'b', 'c']);
  assert.deepEqual([...cfg.staffUsers], ['u1']);
  assert.equal(cfg.bannedPatterns[0].test('0985 559'), true);
  assert.equal(cfg.bannedPatterns.length, 2);
  assert.deepEqual(cfg.botNames, ['OZ Bot', 'Bot']);
  assert.deepEqual([...cfg.companyPhones], ['0985559918', '0912345678', '0987654321']);
  assert.equal(cfg.capChatDay, 3);
});

test('ZALO_MODE không phân biệt hoa thường', () => {
  assert.equal(loadConfig({ ...min, ZALO_MODE: 'Polling' }).mode, 'polling');
  assert.equal(loadConfig({ ...min, ZALO_MODE: 'WEBHOOK' }).mode, 'webhook');
});
