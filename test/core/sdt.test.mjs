// T029 — ngữ pháp số điện thoại dùng chung (core/sdt.js).
// Đây là nguồn DUY NHẤT cho cả hồ sơ khách (core/customers.js) và che log
// (scripts/audit.mjs): lõi và che log phải dùng chung một bộ luật.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cheSdt, findPhoneSpans, looksLikeHsCode } from '../../core/sdt.js';

// Số điện thoại giả — dựng lúc chạy để không có số 10 chữ số liền trong mã nguồn.
const SDT_10 = ['0912', '345', '678'].join('');
const SDT_3_3 = ['0912', ' ', '345', ' ', '678'].join('');
const SDT_HAI_CACH = ['0912', '  ', '345', ' ', '678'].join('');
const SDT_TAB = ['0912', '\t', '345', '\t', '678'].join('');
const SDT_XUONG_DONG = ['0912', '\n', '345', '\n', '678'].join('');
const SDT_TRON = ['0912', ' - ', '345', ' - ', '678'].join('');
const SDT_84 = ['84', ' ', '912', ' ', '345', ' ', '678'].join('');
const SDT_84_PLUS = ['+', '84', ' ', '912', ' ', '345', ' ', '678'].join('');
const SDT_0084 = ['0084', ' ', '912', ' ', '345', ' ', '678'].join('');
const SDT_NGOAC = ['(', '0912', ') ', '345', ' ', '678'].join('');
const SDT_CO_DINH = ['024', ' ', '1234', ' ', '5678'].join('');
// Lỗi chặn 2 của QA: dấu phân tách nằm GIỮA `8` và `4`.
const SDT_8_4 = ['8', ' ', '4', ' ', '912', '345', '678'].join('');
const MA_HS_10 = ['84', '13709090'].join('');
const MA_HS_DOT = ['8413', '.', '70', '.', '90', '.', '90'].join('');
const MA_HS_DOT_2 = ['8413', '.', '70', '.', '9090'].join('');
const CHU_SO_TOAN_ROONG = '０９１２３４５６７８';
// Vòng 5 (QA): mã HS 8 số (`84137090`), mã HS 8 số khác (`84712345`),
// mã HS dạng 4+2+2 (`8413.70.90`) và số cố định quốc tế (`+84 24 1234 5678`).
const MA_HS_8 = ['84', '137090'].join('');
const MA_HS_8_B = ['84', '712345'].join('');
const MA_HS_4_2_2 = ['8413', '.', '70', '.', '90'].join('');
const CUU_DINH_84 = ['84', '24', ' ', '1234', ' ', '5678'].join('');
const SDT_091_DAU_CHAM = ['091', '.', '234', '.', '5678'].join('');

/** Chỉ còn chữ số trong chuỗi (bỏ mọi ký tự không phải số). */
const chiSo = (s) => String(s ?? '').replace(/\D/g, '');

test('sdt: cheSdt che hết số điện thoại ở mọi định dạng VN', () => {
  const cases = [
    SDT_10, SDT_3_3, SDT_HAI_CACH, SDT_TAB, SDT_XUONG_DONG, SDT_TRON,
    SDT_84, SDT_84_PLUS, SDT_0084, SDT_NGOAC, SDT_CO_DINH, SDT_8_4,
  ];
  for (const s of cases) {
    const out = cheSdt(`sdt: ${s}`);
    assert.equal(chiSo(out), '', `còn sót chữ số ở "${s}" → "${out}"`);
    assert.ok(out.includes('***'), `chưa che "${s}" → "${out}"`);
  }
});

test('sdt: cheSdt che số điện thoại có dấu phân tách nằm giữa 8 và 4 (lỗi chặn 2 QA)', () => {
  for (const s of [
    ['8', '4', '912345678'].join(''),
    ['8', '.', '4', '.', '912345678'].join(''),
    ['8', '-', '4', '-', '912345678'].join(''),
    ['8', '4', '912', '345', '678'].join(''),
  ]) {
    const out = cheSdt(`sdt: ${s}`);
    assert.equal(chiSo(out), '', `còn sót chữ số ở "${s}" → "${out}"`);
  }
});

test('sdt: cheSdt không che mất mã HS (8 hoặc 10 số, không bắt đầu bằng 0)', () => {
  assert.equal(cheSdt(`mã ${MA_HS_10}`), `mã ${MA_HS_10}`);
  assert.equal(cheSdt(`mã ${MA_HS_DOT}`), `mã ${MA_HS_DOT}`);
  assert.equal(cheSdt(`mã ${MA_HS_DOT_2}`), `mã ${MA_HS_DOT_2}`);
});

test('sdt: cheSdt giữ nguyên mã HS đứng cạnh số điện thoại (lỗi chặn 1 QA)', () => {
  const cases = [
    `${MA_HS_DOT} ${SDT_10}`,
    `${SDT_10} ${MA_HS_DOT}`,
    `${MA_HS_10} 912`,
    `100 ${MA_HS_DOT}`,
  ];
  for (const s of cases) {
    const out = cheSdt(s);
    assert.ok(out.includes(MA_HS_DOT) || out.includes(MA_HS_10), `che mất mã HS ở "${s}" → "${out}"`);
  }
  // Trong hai ca có số điện thoại: số điện thoại phải bị che hết, mã HS thì không.
  for (const s of [`${MA_HS_DOT} ${SDT_10}`, `${SDT_10} ${MA_HS_DOT}`]) {
    const out = cheSdt(s).replace(MA_HS_DOT, '');
    assert.equal(chiSo(out), '', `còn sót chữ số ở "${s}" → "${out}"`);
  }
});

test('sdt: cheSdt che nhầm số tiền 10 chữ số bắt đầu bằng 0 (chấp nhận được)', () => {
  assert.equal(cheSdt('0.500.000.000'), '***');
});

test('sdt: cheSdt che chữ số toàn rộng', () => {
  const out = cheSdt(`sdt: ${CHU_SO_TOAN_ROONG}`);
  assert.equal(chiSo(out), '', `còn sót chữ số: "${out}"`);
  assert.ok(!out.includes(SDT_10), `lộ chuỗi ASCII: "${out}"`);
});

test('sdt: cheSdt rỗng / không phải chuỗi → không lỗi', () => {
  assert.equal(cheSdt(''), '');
  assert.equal(cheSdt(null), '');
  assert.equal(cheSdt(undefined), '');
  assert.equal(cheSdt(123), '123');
});

test('sdt: findPhoneSpans trả về khoảng [từ, đến) đúng vị trí', () => {
  const s = `sdt ${SDT_3_3} nhé`;
  const spans = findPhoneSpans(s);
  assert.equal(spans.length, 1);
  const [a, b] = spans[0];
  assert.equal(s.slice(a, b), SDT_3_3);
  assert.ok(a > 0 && b < s.length);
});

test('sdt: findPhoneSpans gộp khoảng chồng lấn (0084 + 9 số che trọn vẹn)', () => {
  const s = SDT_0084;
  const spans = findPhoneSpans(s);
  assert.equal(spans.length, 1);
  assert.equal(s.slice(spans[0][0], spans[0][1]), s);
});

test('sdt: findPhoneSpans không trả khoảng nào cho mã HS đứng một mình', () => {
  assert.deepEqual(findPhoneSpans(MA_HS_DOT), []);
  assert.deepEqual(findPhoneSpans(MA_HS_10), []);
});

test('sdt: cheSdt giữ mã HS khi đứng cạnh số khác — không nuốt mất mã HS (vòng 5 QA)', () => {
  // [đầu vào, kết quả mong đời]
  const cases = [
    [`${MA_HS_8} 912`, `${MA_HS_8} 912`],
    [`${MA_HS_10} 5`, `${MA_HS_10} 5`],
    [`${MA_HS_8} ${SDT_091_DAU_CHAM}`, `${MA_HS_8} ***`],
    [`${MA_HS_DOT} 8 4 912345678`, `${MA_HS_DOT} ***`],
    [`${MA_HS_4_2_2} 912`, `${MA_HS_4_2_2} 912`],
    [CUU_DINH_84, '***'],
    [`${MA_HS_8_B} 678`, '***'],
    [`${MA_HS_10} ${MA_HS_8}`, `${MA_HS_10} ${MA_HS_8}`],
    [SDT_10, '***'],
    [SDT_3_3, '***'],
    [SDT_84_PLUS, '***'],
    [SDT_0084, '***'],
    [SDT_CO_DINH, '***'],
    [SDT_8_4, '***'],
    [MA_HS_DOT, MA_HS_DOT],
  ];
  for (const [vao, ra] of cases) {
    assert.equal(cheSdt(vao), ra, `cheSdt("${vao}") → "${cheSdt(vao)}" (mong đợi "${ra}")`);
  }
});

test('sdt: cheSdt che số quốc tế 11 chữ số dù đứng cạnh mã HS (bất biến che ⊇ lõi nhận)', () => {
  // Lõi coi `84712345 678` là SĐT quốc tế (chữ số thứ 3 = 7) → che phải che.
  assert.equal(cheSdt(`${MA_HS_8_B} 678`), '***');
  // Chữ số thứ 3 ∉ {3,5,7,8,9} mà KHÔNG có mã HS đứng trước → vẫn che.
  assert.equal(cheSdt(['84', '11', ' ', '234', ' ', '5678'].join('')), '***');
});

test('sdt: looksLikeHsCode giữ nguyên luật cũ (4+2+2 và 4+2+2+2)', () => {
  assert.equal(looksLikeHsCode(MA_HS_10), true);
  assert.equal(looksLikeHsCode(MA_HS_DOT), true);
  assert.equal(looksLikeHsCode(MA_HS_DOT_2), false); // 4+2+4
  assert.equal(looksLikeHsCode(['8413', '.', '70', '.', '90'].join('')), true);
  assert.equal(looksLikeHsCode(SDT_10), false); // bắt đầu bằng 0 → không phải mã HS
});
