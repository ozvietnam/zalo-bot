import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normVi, jaccard, extractMoney, isCloser, splitText } from '../../core/text.js';

test('normVi', () => {
  assert.equal(normVi('  Đơn   HÀNG  Đẹp '), 'don hang dep');
  assert.equal(normVi(null), '');
});

test('jaccard', () => {
  assert.ok(jaccard('Dạ anh gửi giúp em ảnh sản phẩm ạ', 'dạ anh gửi giúp em ảnh sản phẩm') >= 0.8);
  assert.ok(jaccard('Mã 8413.70.90 thuế 0%', 'Anh cần tra mã khác không ạ') < 0.3);
  assert.equal(jaccard('a b', 'a b'), 1);
  assert.equal(jaccard('', 'a'), 0);
});

test('extractMoney: nhiều dạng', () => {
  assert.deepEqual(extractMoney('Cước 25.650đ/kg, tổng 1,5 triệu'), [25650, 1500000]);
  assert.deepEqual(extractMoney('25,650 đ · 25 650đ · 800k · ¥108'), [25650, 25650, 800000, 108]);
  assert.deepEqual(extractMoney('mã 8413.70.90, 1,5 tấn'), []);
  assert.deepEqual(extractMoney('1.234.000đ và 2tr, $50, 300 tệ, 5 usd, 1.234.000 vnd, 70.000 đồng, 9.000₫'),
    [1234000, 2000000, 50, 300, 5, 1234000, 70000, 9000]);
  assert.deepEqual(extractMoney('thuế 10% và 5 kg, 3 trong'), []);
  assert.deepEqual(extractMoney('10 điểm'), []);
  assert.deepEqual(extractMoney(''), []);
});

test('isCloser', () => {
  assert.equal(isCloser('ok ạ'), true);
  assert.equal(isCloser('👍'), true);
  assert.equal(isCloser('ok mã 8413'), false);
  for (const t of ['Oke', 'Vâng ạ!', 'dạ', 'Cảm ơn nhé', 'cám ơn anh', 'thanks', 'Thank you.', 'ok nha', 'dạ cảm ơn ạ', '🙏 ok'])
    assert.equal(isCloser(t), t === 'cám ơn anh' ? false : true, t);
  for (const t of ['ok 2', 'cho em hỏi', 'thanks 5 cái', '', 'ok mà giá bao nhiêu'])
    assert.equal(isCloser(t), false, t);
});

test('splitText giữ hành vi lib/zalo.js', () => {
  assert.deepEqual(splitText('  '), []);
  assert.deepEqual(splitText('abc'), ['abc']);
  const parts = splitText('a'.repeat(1500) + '\n\n' + 'b'.repeat(1500));
  assert.equal(parts.length, 2);
  assert.ok(parts.every((p) => p.length <= 2000));
  assert.equal(splitText('x'.repeat(5), 2).join(''), 'xxxxx');
});
