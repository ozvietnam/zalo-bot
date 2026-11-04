import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact, findLeak } from '../../core/redact.js';

test('redact: che Bearer, token bot trong URL, chuỗi dài', () => {
  assert.equal(redact('Authorization: Bearer abcDEF123456789012345678901234567890'), 'Authorization: Bearer ***');
  assert.match(redact('https://bot-api.zaloplatforms.com/bot1234:AAbbCC-dd/sendMessage'), /bot\*\*\*\/sendMessage/);
  assert.equal(redact('key=' + 'a1b2c3d4'.repeat(5)), 'key=***');
  assert.equal(redact('Dạ mã 8413.70.90, thuế 0%'), 'Dạ mã 8413.70.90, thuế 0%');
  assert.equal(redact(undefined), '');
});

test('findLeak: path, stack, secret, banned, sạch', () => {
  assert.equal(findLeak('xem @/home/oz/.hermes/cache/scratch/a.txt'), 'path');
  assert.equal(findLeak('file ở /opt/app/x'), 'path');
  assert.equal(findLeak('file C:\\Users\\a\\b.txt'), 'path');
  assert.equal(findLeak('at handle (/app/core/engine.js:12:5)'), 'stack');
  assert.equal(findLeak('Authorization: Bearer abc'), 'secret');
  assert.equal(findLeak('khoá ' + 'f'.repeat(32)), 'secret');
  assert.equal(findLeak('Dạ mã 8413.70.90, thuế 0%'), null);
  assert.equal(findLeak('gọi 0985559918', [/0985\D?559\D?918/]), 'banned');
  assert.equal(findLeak('gọi 0911', [/0985\D?559\D?918/]), null);
  assert.equal(findLeak(''), null);
});
