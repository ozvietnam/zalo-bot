import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderError, renderClassify } from '../render.js';

test('renderError: thongBao đã có "Điểm đã được hoàn." kèm diemDaHoan=true thì chỉ xuất hiện 1 lần', () => {
  const out = renderError({ ok: false, thongBao: 'Hệ thống bận, Điểm đã được hoàn.', diemDaHoan: true });
  const matches = out.match(/Điểm đã được hoàn/gi) ?? [];
  assert.equal(matches.length, 1, `Kỳ vọng xuất hiện đúng 1 lần nhưng nhận: ${out}`);
  assert.equal(out, '⚠️ Hệ thống bận, Điểm đã được hoàn.');
});

test('renderError: thongBao đã có "đã hoàn điểm" kèm diemDaHoan=true thì không nối thêm dòng hoàn điểm lần 2', () => {
  const out = renderError({ ok: false, thongBao: 'Cổng bận, đã hoàn điểm cho bạn.', diemDaHoan: true });
  assert.doesNotMatch(out, /Điểm đã được hoàn\./);
  assert.equal(out, '⚠️ Cổng bận, đã hoàn điểm cho bạn.');
});

test('renderError: thongBao chưa có câu hoàn điểm kèm diemDaHoan=true thì vẫn in đầy đủ "Điểm đã được hoàn."', () => {
  const out = renderError({ ok: false, thongBao: 'Phân loại thất bại.', diemDaHoan: true });
  assert.match(out, /Điểm đã được hoàn\./);
  assert.equal(out, '⚠️ Phân loại thất bại.\nĐiểm đã được hoàn.');
});

test('renderClassify (trangThai=LOI): thongBao đã có thông báo hoàn điểm thì không nối lặp, chưa có thì vẫn nối', () => {
  const coSan1 = renderClassify({
    ok: true,
    trangThai: 'LOI',
    data: { thongBao: 'Phân loại thất bại. Điểm đã được hoàn.', daHoanDiem: true },
  });
  assert.equal((coSan1.match(/Điểm đã được hoàn\./g) ?? []).length, 1, `Không được lặp trong: ${coSan1}`);
  assert.equal(coSan1, '⚠️ Phân loại thất bại. Điểm đã được hoàn.');

  const coSan2 = renderClassify({
    ok: true,
    trangThai: 'LOI',
    data: { thongBao: 'Phân loại thất bại, đã hoàn điểm cho lượt này.', daHoanDiem: true },
  });
  assert.doesNotMatch(coSan2, /Điểm đã được hoàn\./);
  assert.equal(coSan2, '⚠️ Phân loại thất bại, đã hoàn điểm cho lượt này.');

  const chuaCo = renderClassify({
    ok: true,
    trangThai: 'LOI',
    data: { thongBao: 'Phân loại thất bại.', daHoanDiem: true },
  });
  assert.equal(chuaCo, '⚠️ Phân loại thất bại. Điểm đã được hoàn.');
});
