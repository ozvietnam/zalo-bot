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
  assert.equal(findLeak('khoá ' + 'f0'.repeat(16)), 'secret');
  assert.equal(findLeak('Dạ mã 8413.70.90, thuế 0%'), null);
  assert.equal(findLeak('gọi 0985559918', [/0985\D?559\D?918/]), 'banned');
  assert.equal(findLeak('gọi 0911', [/0985\D?559\D?918/]), null);
  assert.equal(findLeak(''), null);
});

test('findLeak: URL không phải bí mật; token thật thì có', () => {
  const urls = [
    'Xem https://uythacnhapkhau.com/huong-dan-nhap-khau-hang-tu-trung-quoc-ve-viet-nam',
    'https://thutucxuatnhapkhau.com/thu-tuc-hai-quan-nhap-khau-hang-hoa/',
    'Link s.click.taobao.com/t?e=m%3D2%26s%3DabcdefghijklmnopqrstuvwxyzABCDEF123456',
    'ảnh https://img.alicdn.com/imgextra/i1/2200123456789/O1CN01abcdefghijklmnopqrstuvwxyz1234_!!2200123456789-0-scm.jpg',
    'ảnh gw.alicdn.com/imgextra/i1/2200123456789/O1CN01abcdefghijklmnopqrstuvwxyz1234_!!22.jpg',
  ];
  for (const u of urls) assert.equal(findLeak(u), null, u);
  assert.equal(findLeak('token EAAG' + 'x9'.repeat(18)), 'secret');
  assert.equal(findLeak('khoá ' + 'a1b2c3d4'.repeat(5)), 'secret');
  assert.equal(findLeak('sk-' + 'abcDEF12'.repeat(3)), 'secret');
  assert.equal(findLeak('bot123456:AAbbCC-dd'), 'secret');
  assert.equal(findLeak('f'.repeat(40)), null); // thiếu chữ số
  assert.equal(redact('xem https://uythacnhapkhau.com/huong-dan-nhap-khau-hang-tu-trung-quoc-ve-viet-nam'),
    'xem https://uythacnhapkhau.com/huong-dan-nhap-khau-hang-tu-trung-quoc-ve-viet-nam');
});

test('findLeak: "at hh:mm:ss" không phải stack', () => {
  assert.equal(findLeak('Hẹn anh at 9:30:00 nhé'), null);
  assert.equal(findLeak('at Object.run (/app/x.js:1:2)'), 'stack');
  assert.equal(findLeak('boom at /app/core/x.mjs:10:3'), 'stack');
});
