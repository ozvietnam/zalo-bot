// T029 — CHE BÍ MẬT trong CLI tra audit: số điện thoại, mã HS, đường dẫn nội bộ, sha1.
// (Hành vi CLI: test/core/audit-cli.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { extractPhone } from '../../core/customers.js';
import { cheSdt } from '../../core/sdt.js';
import {
  chay, fx, chiSo, bienThe, assertKhongLoSdt,
  SDT_GIA, SDT_84_DAU_PLUS,
  SDT_HAI_CACH, SDT_TAB, SDT_XUONG_DONG, SDT_TRON, SDT_84, SDT_NGOAC,
  SDT_0084, SDT_CO_DINH, SDT_8_4, SDT_8_4_CHAM, SDT_QUOC_TE,
  MA_HS_10, MA_HS_DOT, MA_HS_DOT_2, DUONG_DAN, CHU_SO_TOAN_ROONG,
  DINH_DANG_LOI_NHAN, DINH_DANG_LOI_KHONG_NHAN, KHOA_SK, KHOA_EAA,
} from '../helpers/audit-fixture.mjs';

test('T029 · không rò số điện thoại của khách ra stdout', async () => {
  const r = await chay(['--db', fx.dbPath, '--turn', 'p1']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes('inbound'), r.stdout);
  assert.ok(!r.stdout.includes('0912345678'), `lộ số điện thoại:\n${r.stdout}`);
});

test('T029 · che số điện thoại ở mọi định dạng phổ biến', async () => {
  const cases = [
    ['p2', ['0912 345 678', '345 678']],
    ['p3', ['0912.345.678']],
    ['p4', ['0912-345-678']],
    ['p5', ['0901 234 567']],
    ['p6', ['+84 912 345 678']],
    ['p7', ['+84.912.345.678']],
    ['p8', [SDT_GIA]],
  ];
  for (const [turn, canLộ] of cases) {
    const r = await chay(['--db', fx.dbPath, '--turn', turn]);
    assert.equal(r.code, 0, r.stderr);
    for (const s of canLộ) assert.ok(!r.stdout.includes(s), `lộ "${s}" ở lượt ${turn}:\n${r.stdout}`);
  }
});

test('T029 · che số điện thoại ở các định dạng lớp phân tách cũ ([ .-]?) bỏ sót', async () => {
  // Mỗi lượt một định dạng: 2 dấu cách, tab, xuống dòng, trộn dấu cách + gạch.
  const cases = [
    ['q1', SDT_HAI_CACH],
    ['q2', SDT_TAB],
    ['q3', SDT_XUONG_DONG],
    ['q4', SDT_TRON],
    ['q5', SDT_84],
    ['p6', SDT_84_DAU_PLUS],
    ['q6', SDT_NGOAC],
    ['q7', SDT_0084],
    ['q8', SDT_CO_DINH],
  ];
  for (const [turn, dinhDang] of cases) {
    const r = await chay(['--db', fx.dbPath, '--turn', turn]);
    assert.equal(r.code, 0, r.stderr);
    assertKhongLoSdt(r, dinhDang, turn);
  }
});

test('T029 · bất biến: mọi định dạng lõi nhận (extractPhone) đều phải bị CLI che', async () => {
  for (const [turn, dinhDang] of DINH_DANG_LOI_NHAN) {
    // Lõi coi đây là số điện thoại → CLI (cửa ra log) phải che, không được lộ.
    assert.notEqual(extractPhone(dinhDang), null, `lõi không nhận "${dinhDang}"`);
    const r = await chay(['--db', fx.dbPath, '--turn', turn]);
    assert.equal(r.code, 0, r.stderr);
    assertKhongLoSdt(r, dinhDang, turn);
  }
});

test('T029 · định dạng lõi KHÔNG nhận vẫn bị CLI che (để an toàn)', async () => {
  for (const [turn, dinhDang] of DINH_DANG_LOI_KHONG_NHAN) {
    const r = await chay(['--db', fx.dbPath, '--turn', turn]);
    assert.equal(r.code, 0, r.stderr);
    assertKhongLoSdt(r, dinhDang, turn);
  }
});

test('T029 · chữ số toàn rộng cũng bị che', async () => {
  const r = await chay(['--db', fx.dbPath, '--turn', 'q10']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(!r.stdout.includes(SDT_GIA), `lộ chuỗi ASCII của chữ số toàn rộng:\n${r.stdout}`);
  assert.ok(!r.stdout.includes(CHU_SO_TOAN_ROONG), `lộ chuỗi toàn rộng:\n${r.stdout}`);
});

test('T029 · không che mất mã HS dạng 4+2+4 (lõi không nhận là SĐT)', async () => {
  const r = await chay(['--db', fx.dbPath, '--turn', 'q9']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes(MA_HS_DOT_2), `che mất mã HS:\n${r.stdout}`);
});

test('T029 · không che mất mã HS (số 10 chữ số liền và dạng có dấu chấm)', async () => {
  const r9 = await chay(['--db', fx.dbPath, '--turn', 'p9']);
  assert.equal(r9.code, 0, r9.stderr);
  assert.ok(r9.stdout.includes(MA_HS_10), `che mất mã HS:\n${r9.stdout}`);
  const r10 = await chay(['--db', fx.dbPath, '--turn', 'p10']);
  assert.equal(r10.code, 0, r10.stderr);
  assert.ok(r10.stdout.includes(MA_HS_DOT), `che mất mã HS:\n${r10.stdout}`);
});

test('T029 · che đường dẫn nội bộ trong dữ liệu audit, phần message còn lại vẫn còn', async () => {
  const r = await chay(['--db', fx.dbPath, '--turn', 'e1']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(!r.stdout.includes(DUONG_DAN), `lộ đường dẫn nội bộ:\n${r.stdout}`);
  assert.ok(r.stdout.includes('thử lại sau'), `che mất phần message còn lại:\n${r.stdout}`);
});

test('T029 · dòng tool in thêm tham số đã che (args=)', async () => {
  const r = await chay(['--db', fx.dbPath, '--turn', 't1']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes('args='), `thiếu args=:\n${r.stdout}`);
  assert.ok(r.stdout.includes('84137090'), `che mất tham số công cụ:\n${r.stdout}`);
});

test('T029 · bất biến: mọi biến thể số điện thoại (chèn dấu phân tách ở mọi vị trí) đều bị che hết', () => {
  let tong = 0;
  let loiNhan = 0;
  for (const so of [SDT_GIA, SDT_QUOC_TE]) {
    for (const v of bienThe(so)) {
      tong += 1;
      const out = cheSdt(v);
      // Che phải HẾT chữ số, không chỉ che một phần (lỗi QA: sót đuôi 9 số).
      assert.equal(chiSo(out), '', `còn sót chữ số ở biến thể "${v}" → "${out}"`);
      // Lõi nhận thì lõi ghi hồ sơ; cửa ra log (che) phải che không kém lõi.
      if (extractPhone(v) !== null) loiNhan += 1;
    }
  }
  assert.ok(tong > 1000, `chỉ sinh ${tong} biến thể — bất biến quá hẹp`);
  assert.ok(loiNhan > 1000, `lõi chỉ nhận ${loiNhan}/${tong} biến thể — bất biến không đủ sức`);
});

test('T029 · bất biến: che phải phủ hết mọi thứ lõi `extractPhone` nhận', () => {
  // Lõi nhận (khác null) ⇒ trong biến thể đó lõi sẽ ghi số vào hồ sơ khách;
  // cửa ra log phải che hết chứ không được che lệch (chép là "che ⊇ lõi nhận").
  let n = 0;
  for (const so of [SDT_GIA, SDT_QUOC_TE]) {
    for (const v of bienThe(so)) {
      const sdt = extractPhone(v);
      if (sdt === null) continue;
      n += 1;
      const out = cheSdt(v);
      assert.equal(chiSo(out), '', `lõi nhận "${v}" (→ ${sdt}) nhưng che còn sót: "${out}"`);
    }
  }
  assert.ok(n > 1000, `chỉ ${n} biến thể được lõi nhận`);
});

test('T029 · số điện thoại có dấu phân tách giữa 8 và 4 bị che (lỗi chặn 2 QA)', async () => {
  for (const [turn, dinhDang] of [['h5', SDT_8_4], ['h6', SDT_8_4_CHAM]]) {
    const r = await chay(['--db', fx.dbPath, '--turn', turn]);
    assert.equal(r.code, 0, r.stderr);
    assertKhongLoSdt(r, dinhDang, turn);
  }
  // Dạng có ngoặc: lõi KHÔNG nhận, CLI vẫn phải che.
  const r7 = await chay(['--db', fx.dbPath, '--turn', 'h7']);
  assert.equal(r7.code, 0, r7.stderr);
  assertKhongLoSdt(r7, SDT_GIA, 'h7');
});

test('T029 · mã HS đứng cạnh số khác vẫn còn nguyên, số điện thoại đã che (lỗi chặn 1 QA)', async () => {
  const r1 = await chay(['--db', fx.dbPath, '--turn', 'h1']);
  assert.equal(r1.code, 0, r1.stderr);
  assert.ok(r1.stdout.includes(MA_HS_DOT), `che mất mã HS:\n${r1.stdout}`);
  assertKhongLoSdt(r1, SDT_GIA, 'h1');

  const r2 = await chay(['--db', fx.dbPath, '--turn', 'h2']);
  assert.equal(r2.code, 0, r2.stderr);
  assert.ok(r2.stdout.includes(MA_HS_DOT), `che mất mã HS:\n${r2.stdout}`);
  assertKhongLoSdt(r2, SDT_GIA, 'h2');

  const r3 = await chay(['--db', fx.dbPath, '--turn', 'h3']);
  assert.equal(r3.code, 0, r3.stderr);
  assert.ok(r3.stdout.includes(MA_HS_10), `che mất mã HS:\n${r3.stdout}`);

  const r4 = await chay(['--db', fx.dbPath, '--turn', 'h4']);
  assert.equal(r4.code, 0, r4.stderr);
  assert.ok(r4.stdout.includes(MA_HS_DOT), `che mất mất mã HS:\n${r4.stdout}`);
});

test('T029 · khoá `sk-…` và `EAA…` không lọt ra stdout (vòng 5 QA)', async () => {
  // Cửa gửi tin coi hai dạng này là bí mật (core/redact.js — findLeak) →
  // CLI tra audit KHÔNG được in ra nguyên văn.
  for (const [turn, khoa] of [['k1', KHOA_SK], ['k2', KHOA_EAA]]) {
    const r = await chay(['--db', fx.dbPath, '--turn', turn]);
    assert.equal(r.code, 0, r.stderr);
    assert.ok(!r.stdout.includes(khoa), `lộ khoá ở lượt ${turn}:\n${r.stdout}`);
    assert.ok(!/sk-|EAA/.test(r.stdout), `còn sót dạng khoá ở lượt ${turn}:\n${r.stdout}`);
  }
});

test('T029 · stdout KHÔNG in mã sha1 (hash trên text thô, bị dò ngược được)', async () => {
  const r = await chay(['--db', fx.dbPath, '--chat', 'c3', '--limit', '60']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(!r.stdout.includes('sha1='), `còn in sha1=:\n${r.stdout}`);
});

test('T029 · mã sha1 vẫn còn trong db (đối chiếu FR-018), chỉ không in ra', async () => {
  const db = new DatabaseSync(fx.dbPath, { readOnly: true });
  try {
    const row = db.prepare("SELECT data FROM audit WHERE type = 'inbound' LIMIT 1").get();
    const d = JSON.parse(row.data);
    assert.ok(typeof d.sha1 === 'string' && d.sha1.length === 40, `thiếu sha1 trong db: ${row.data}`);
  } finally {
    db.close();
  }
});
