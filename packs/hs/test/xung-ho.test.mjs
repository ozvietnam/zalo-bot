// packs/hs/test/xung-ho.test.mjs — Xưng hô theo hồ sơ khách (issue #136 mục 5 phần xưng hô, mở lại ở #168).
// Nguyên tắc: KHÔNG suy xưng hô từ tên khách (đoán sai là gọi sai giới tính của người thật);
// chỉ nhận khi chính khách tự nói, hoặc nhân viên OZ đã ghi vào hồ sơ. Không rõ → "anh/chị".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XUNG_HO_MAC_DINH, doXungHo, xungHoCuaKhach, hoaDau } from '../xung-ho.js';

test('doXungHo: khách tự nói thì nhận, nói về người khác thì không', () => {
  assert.equal(doXungHo('anh cần tra mã HS cho lô máy xay'), 'anh');
  assert.equal(doXungHo('Chị muốn hỏi thuế nhập khẩu'), 'chị');
  assert.equal(doXungHo('em là chị Lan ở công ty ABC'), 'chị');
  assert.equal(doXungHo('gọi anh là được rồi em nhé'), 'anh');
  assert.equal(doXungHo('cứ gọi chị nhé'), 'chị');

  // Không phải khách tự nói về mình
  assert.equal(doXungHo('anh trai em nhập hàng này'), null);
  assert.equal(doXungHo('cho em hỏi mã HS của máy xay'), null);
  assert.equal(doXungHo('mình cần tra thuế'), null);
  assert.equal(doXungHo('tra hs máy xay sinh tố 350W'), null);
  assert.equal(doXungHo(''), null);
  assert.equal(doXungHo(null), null);
});

test('doXungHo: KHÔNG suy từ tên khách (không đoán giới tính theo tên)', () => {
  assert.equal(doXungHo('Nguyễn Thị Lan'), null);
  assert.equal(doXungHo('Trần Văn Hùng'), null);
});

test('xungHoCuaKhach: không biết gì thì dùng "anh/chị"', () => {
  assert.equal(XUNG_HO_MAC_DINH, 'anh/chị');
  assert.equal(xungHoCuaKhach({}), 'anh/chị');
  assert.equal(xungHoCuaKhach({ customer: { display_name: 'Nguyễn Thị Lan' } }), 'anh/chị');
});

test('xungHoCuaKhach: nhân viên ghi vào hồ sơ thì thắng mọi suy đoán của máy', () => {
  const customer = {
    display_name: 'Lan',
    labels: [{ nhan: 'xh-chi', nguon: 'staff:staff1', at: '2026-11-10T03:00:00.000Z' }],
  };
  assert.equal(xungHoCuaKhach({ customer, text: 'anh cần tra mã HS' }), 'chị');
  // Nhãn do máy tự gắn thì không thắng câu khách vừa nói
  const customerAuto = { labels: [{ nhan: 'xh-chi', nguon: 'auto', at: '2026-11-10T03:00:00.000Z' }] };
  assert.equal(xungHoCuaKhach({ customer: customerAuto, text: 'anh cần tra mã HS' }), 'anh');
});

test('xungHoCuaKhach: khách đã tự nói ở lượt trước (lưu trong phiên) thì giữ nguyên', () => {
  const session = { xungHo: 'chị' };
  assert.equal(xungHoCuaKhach({ session, text: 'tra hs máy xay' }), 'chị');
  // Khách tự nói lại khác đi thì theo câu mới nhất
  assert.equal(xungHoCuaKhach({ session, text: 'anh cần tra mã HS' }), 'anh');
});

test('hoaDau: hoa chữ đầu để ghép đầu câu ("anh/chị" → "Anh/chị")', () => {
  assert.equal(hoaDau('anh/chị'), 'Anh/chị');
  assert.equal(hoaDau('chị'), 'Chị');
  assert.equal(hoaDau(''), '');
});
