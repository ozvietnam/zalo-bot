import test from 'node:test';
import assert from 'node:assert/strict';
import { tinhHieu, NGUONG } from '../../scripts/giam-sat/tinh-hieu.js';
import { taoDbMau9Loi } from '../helpers/giam-sat-fixture.mjs';

test('T705 (SC-001): Bắt đủ 9/9 tín hiệu trên fixture mẫu, 0 phát hiện thừa', () => {
  const duLieu = taoDbMau9Loi('2026-11-06');
  const ketQua = tinhHieu(duLieu);

  assert.equal(ketQua.length, 9, `Phải phát hiện chính xác 9 tín hiệu, thực tế: ${ketQua.length}`);

  const danhSachMa = Object.keys(NGUONG);
  for (const ma of danhSachMa) {
    const phatHien = ketQua.find(k => k.ma === ma);
    assert.ok(phatHien, `Phải có phát hiện cho mã tín hiệu ${ma}`);
  }
});

test('T705: Mỗi phát hiện phải có fingerprint ổn định và turnIds không rỗng', () => {
  const duLieu = taoDbMau9Loi('2026-11-06');
  const ketQua1 = tinhHieu(duLieu);
  const ketQua2 = tinhHieu(duLieu);

  for (let i = 0; i < ketQua1.length; i++) {
    const p1 = ketQua1[i];
    const p2 = ketQua2[i];

    // Fingerprint có cấu trúc ${ma}${cheDo ? `:${cheDo}` : ''}
    const mongDoiFp = `${p1.ma}${p1.cheDo ? `:${p1.cheDo}` : ''}`;
    assert.equal(p1.fingerprint, mongDoiFp, `Fingerprint của ${p1.ma} phải khớp quy ước ${mongDoiFp}`);

    // Fingerprint ổn định qua 2 lần chạy với cùng dữ liệu
    assert.equal(p1.fingerprint, p2.fingerprint, `Fingerprint của ${p1.ma} phải ổn định`);

    // turnIds là mảng không rỗng
    assert.ok(Array.isArray(p1.turnIds), `turnIds của ${p1.ma} phải là mảng`);
    assert.ok(p1.turnIds.length > 0, `turnIds của ${p1.ma} không được rỗng`);
    assert.deepEqual(p1.turnIds, p2.turnIds, `turnIds của ${p1.ma} phải ổn định`);
  }
});

test('T705: Toàn bộ bằng chứng của 9 tín hiệu phải có turn_id', () => {
  const duLieu = taoDbMau9Loi('2026-11-06');
  const ketQua = tinhHieu(duLieu);

  for (const p of ketQua) {
    assert.ok(Array.isArray(p.bangChung), `bangChung của ${p.ma} phải là mảng`);
    assert.ok(p.bangChung.length > 0, `bangChung của ${p.ma} không được rỗng`);

    for (let idx = 0; idx < p.bangChung.length; idx++) {
      const bc = p.bangChung[idx];
      assert.ok(
        typeof bc.turn_id === 'string' && bc.turn_id.trim().length > 0,
        `Bằng chứng #${idx} của tín hiệu ${p.ma} phải có turn_id không rỗng. Chi tiết: ${JSON.stringify(bc)}`
      );
    }

    // JOB-EXPIRED sử dụng ma_luot làm turn_id
    if (p.ma === 'JOB-EXPIRED') {
      for (const bc of p.bangChung) {
        assert.equal(bc.turn_id, bc.ma_luot, 'JOB-EXPIRED phải dùng ma_luot làm turn_id');
      }
    }
  }
});

test('T705: Khi dữ liệu rỗng không sinh phát hiện nào', () => {
  const ketQua = tinhHieu({
    messages: [],
    outbox: [],
    jobs: [],
    audit: [],
    ngay: '2026-11-06',
  });
  assert.equal(ketQua.length, 0, 'Dữ liệu rỗng thì không có phát hiện');
});
