// Hồ sơ khách (FR-025, FR-026): nhận diện SĐT, nhãn, món quan tâm, ghi chú, tóm tắt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../../core/store.js';
import { extractPhone, looksLikeHsCode, createCustomers } from '../../core/customers.js';

// Số điện thoại giả duy nhất được phép xuất hiện nguyên văn trong repo công khai.
const PHONE = '0912345678';
// Mã HS 10 số và 8 số: viết bằng nối chuỗi để không lọt qua cổng quán mọi số 10 chữ số.
const HS10 = '8413' + '709090';
const HS8 = '8413' + '7090';

const NOW = '2026-11-04T07:16:00.000Z';

function setup(config = {}) {
  const store = openStore(':memory:');
  const c = createCustomers({ store, config, now: () => new Date(NOW) });
  return { store, c };
}

// ---------------------------------------------------------------- SĐT

test('extractPhone: số nội địa 10 số, bỏ khoảng trắng/dấu chấm', () => {
  assert.equal(extractPhone('số em 0912 345 678 nhé', new Set()), PHONE);
  assert.equal(extractPhone('số em 0912.345.678 nhé', new Set()), PHONE);
  assert.equal(extractPhone(`số em ${PHONE} nhé`, new Set()), PHONE);
});

test('extractPhone: số quốc tế +84 / 84 + 9 số → 0xxxxxxxxx', () => {
  assert.equal(extractPhone('+84 912.345.678', new Set()), PHONE);
  assert.equal(extractPhone('84 912 345 678', new Set()), PHONE);
  assert.equal(extractPhone('+84' + '912345678', new Set()), PHONE);
});

test('extractPhone: số của công ty không được ghi vào hồ sơ', () => {
  assert.equal(extractPhone(`gọi ${PHONE}`, new Set()), PHONE);
  assert.equal(extractPhone(`gọi ${PHONE}`, new Set([PHONE])), null);
  // Số công ty truyền dạng chưa chuẩn hoá vẫn phải khớp.
  assert.equal(extractPhone(`gọi ${PHONE}`, new Set(['+84 912.345.678'])), null);
});

test('extractPhone: số của công ty nhắc lại nhiều lần vẫn không bao giờ được ghi', () => {
  // Chống rò rỉ: số của công ty bị bỏ qua ở lần nhắc đầu, nhưng lần nhắc lại
  // thì KHÔNG được coi là SĐT khách — số của công ty không bao giờ vào hồ sơ.
  assert.equal(extractPhone(`gọi ${PHONE}, gọi ${PHONE}`, new Set([PHONE])), null);
  // Nhắc lại nhiều lần hơn nữa vẫn null.
  assert.equal(extractPhone(`gọi ${PHONE}, gọi ${PHONE}, gọi ${PHONE}`, new Set([PHONE])), null);
});

// Ghi chú: nhánh "bỏ số công ty rồi đi tìm số khác" CHƯA có test riêng, vì repo
// công khai chỉ được dùng đúng một số điện thoại giả `0912345678`; cần một số
// giả thứ hai (khác số của công ty) để khách có SĐT hợp lệ đứng sau. Sẽ bổ
// sung test này khi được cho phép thêm số giả thứ hai.

test('extractPhone: không nhầm số tiền là số điện thoại', () => {
  assert.equal(extractPhone('giá 25.650đ', new Set()), null);
  assert.equal(extractPhone('mua 3 250.000đ', new Set()), null);
  assert.equal(extractPhone(`số ${PHONE.slice(0, 4)} ${PHONE.slice(4, 7)} ${PHONE.slice(7)}`, new Set()), PHONE);
});

test('extractPhone: mã HS 8/10 số không phải số điện thoại', () => {
  assert.equal(extractPhone(`mã ${HS10}`, new Set()), null);
  assert.equal(extractPhone(`mã ${HS8}`, new Set()), null);
  assert.equal(looksLikeHsCode(HS10), true);
  assert.equal(looksLikeHsCode(HS8), true);
  assert.equal(looksLikeHsCode(PHONE), false);
});

test('looksLikeHsCode: có dấu tách thì phải đúng nhóm 4+2+2 hoặc 4+2+2+2', () => {
  // 4+2+4 không phải nhóm mã HS hợp lệ (nhất quán với 4+2+2 và 4+2+2+2).
  assert.equal(looksLikeHsCode('8413.70.9090'), false);
  assert.equal(looksLikeHsCode('8413.70.90.90'), true);
  assert.equal(looksLikeHsCode('8413.70.90'), true);
  // 10 số nhưng nhóm số không đúng 4+2+2+2 thì không phải mã HS.
  assert.equal(looksLikeHsCode('8413.70.90.9.1'), false);
});

test('extractPhone: không có số → null', () => {
  assert.equal(extractPhone('cho em hỏi mã HS của máy bơm', new Set()), null);
  assert.equal(extractPhone('', new Set()), null);
});

// ---------------------------------------------------------------- nhãn

test('nhãn: máy không gỡ được nhãn của nhân viên', () => {
  const { c } = setup();
  c.addLabels('c1', ['khoa-hoc'], 'staff:u9');
  const sau = c.removeLabel('c1', 'khoa-hoc', 'auto');
  assert.equal(sau.length, 1);
  assert.equal(sau[0].nhan, 'khoa-hoc');
  assert.equal(sau[0].nguon, 'staff:u9');
});

test('nhãn: thêm trùng chỉ giữ 1 mục', () => {
  const { c } = setup();
  c.addLabels('c1', ['tra-cuu-hs'], 'auto');
  const sau = c.addLabels('c1', ['tra-cuu-hs'], 'auto');
  assert.equal(sau.length, 1);
  assert.equal(sau[0].nhan, 'tra-cuu-hs');
  assert.equal(sau[0].nguon, 'auto');
});

test('nhãn: chuẩn hoá tên (Khoa Học → khoa-hoc), bỏ tên rỗng', () => {
  const { c } = setup();
  const sau = c.addLabels('c1', ['Khoa Học', '   ', 'tra-cuu-hs'], 'auto');
  assert.deepEqual(sau.map((e) => e.nhan), ['khoa-hoc', 'tra-cuu-hs']);
});

test('nhãn: nhân viên gắn sau nâng nguồn auto → staff:*', () => {
  const { c } = setup();
  c.addLabels('c1', ['xin-nguoi'], 'auto');
  const sau = c.addLabels('c1', ['xin-nguoi'], 'staff:u9');
  assert.equal(sau.length, 1);
  assert.equal(sau[0].nguon, 'staff:u9');
  // Ngược lại: nguồn staff không bị đè xuống auto.
  const sau2 = c.addLabels('c1', ['xin-nguoi'], 'auto');
  assert.equal(sau2[0].nguon, 'staff:u9');
});

test('nhãn: nhân viên gỡ được nhãn của máy', () => {
  const { c } = setup();
  c.addLabels('c1', ['tra-cuu-hs'], 'auto');
  const sau = c.removeLabel('c1', 'tra-cuu-hs', 'staff:u9');
  assert.equal(sau.length, 0);
});

test('nhãn: gỡ nhãn ở hồ sơ chưa có thì không tạo hồ sơ rỗng', () => {
  const { store, c } = setup();
  const sau = c.removeLabel('chua-co', 'tra-cuu-hs', 'staff:u9');
  assert.deepEqual(sau, []);
  assert.equal(store.customers.get('chua-co'), null);
});

// ---------------------------------------------------------------- hồ sơ

test('touch: đếm lượt, giữ tên, lưu SĐT và gắn nhãn co-sdt', () => {
  const { store, c } = setup();
  c.touch({ convId: 'c1', chatId: 'chat1', userName: 'Chị Lan', text: `số em ${PHONE} nhé` });
  const row = store.customers.get('c1');
  assert.equal(row.turns, 1);
  assert.equal(row.display_name, 'Chị Lan');
  assert.equal(row.phone, PHONE);
  assert.equal(row.labels.length, 1);
  assert.equal(row.labels[0].nhan, 'co-sdt');
  assert.equal(row.labels[0].nguon, 'auto');
  // Lượt sau không có tên thì giữ tên cũ, số lượt tăng.
  c.touch({ convId: 'c1', chatId: 'chat1', userName: '', text: 'cảm ơn' });
  const row2 = store.customers.get('c1');
  assert.equal(row2.turns, 2);
  assert.equal(row2.display_name, 'Chị Lan');
});

test('touch: SĐT trong caption ảnh cũng được ghi; số của công ty thì không', () => {
  const { store, c } = setup();
  c.touch({ convId: 'c1', chatId: 'chat1', userName: 'An', text: null, caption: `số em ${PHONE}` });
  assert.equal(store.customers.get('c1').phone, PHONE);

  const { store: s2, c: c2 } = setup({ companyPhones: new Set([PHONE]) });
  c2.touch({ convId: 'c2', chatId: 'chat1', userName: 'An', text: `gọi ${PHONE}`, caption: null });
  const row = s2.customers.get('c2');
  assert.equal(row.phone, null);
  assert.deepEqual(row.labels, []);
});

test('interests: giữ 20 mục mới nhất, mới nhất đứng đầu', () => {
  const { c } = setup();
  const items = Array.from({ length: 25 }, (_, i) => ({ mon: `món ${i}`, hs: HS8 }));
  const sau = c.addInterests('c1', items);
  assert.equal(sau.length, 20);
  assert.equal(sau[0].mon, 'món 24');
  assert.equal(sau[19].mon, 'món 5');
});

test('interests: thiếu hs thì bỏ trường hs; rỗng cả hai thì bỏ mục', () => {
  const { c } = setup();
  const sau = c.addInterests('c1', [{ mon: 'máy bơm' }, { hs: HS8 }, { mon: '', hs: '' }]);
  assert.equal(sau.length, 2);
  const coMon = sau.find((e) => e.mon === 'máy bơm');
  assert.equal('hs' in coMon, false);
  assert.equal(sau.find((e) => e.hs === HS8).mon, undefined);
});

test('setNote: lưu và đọc lại được; text rỗng thì xoá ghi chú', () => {
  const { store, c } = setup();
  c.setNote('c1', 'khách cần báo giá', 'staff:u9');
  const note = JSON.parse(store.customers.get('c1').note);
  assert.equal(note.text, 'khách cần báo giá');
  assert.equal(note.by, 'staff:u9');
  assert.equal(note.at, NOW);
  c.setNote('c1', '', 'staff:u9');
  assert.equal(store.customers.get('c1').note, null);
});

test('summary: có tên, SĐT, nhãn, 3 món gần nhất và số lượt', () => {
  const { c } = setup();
  c.touch({ convId: 'c1', chatId: 'chat1', userName: 'Chị Lan', text: `số em ${PHONE} nhé` });
  c.addLabels('c1', ['tra-cuu-hs'], 'auto');
  c.addInterests('c1', [
    { mon: 'van bi', hs: HS8 },
    { mon: 'bom nuoc', hs: HS8 },
    { mon: 'cong gio', hs: HS8 },
    { mon: 'may bom ly tam', hs: HS8 },
  ]);
  const s = c.summary('c1');
  assert.ok(s.includes('Chị Lan'));
  assert.ok(s.includes(PHONE));
  assert.ok(s.includes('tra-cuu-hs'));
  assert.ok(s.includes('co-sdt'));
  // 3 món gần nhất: món thêm sau cùng đứng đầu, món cũ nhất không lọt vào tóm tắt.
  assert.ok(s.includes('may bom ly tam'));
  assert.ok(s.includes('cong gio'));
  assert.ok(s.includes('bom nuoc'));
  assert.equal(s.includes('van bi'), false);
  assert.match(s, /Số lượt: 1/);
});

test('summary: có dòng ghi chú, đọc được cả JSON lẫn chuỗi thô', () => {
  const { store, c } = setup();
  c.touch({ convId: 'c1', chatId: 'chat1', userName: 'Chị Lan', text: 'chào' });
  c.setNote('c1', 'khách hẹn thứ 6', 'staff:u9');
  const s = c.summary('c1');
  assert.ok(s.includes('khách hẹn thứ 6'));
  assert.match(s, /Ghi chú: khách hẹn thứ 6/);
  // Ghi chú lưu dạng JSON trong cột `note`; nếu là chuỗi thô thì vẫn đọc được.
  store.customers.upsert('c1', { note: 'ghi chú thô' }, NOW);
  assert.ok(c.summary('c1').includes('ghi chú thô'));
  // Hồ sơ không có ghi chú thì dòng ghi chú hiện "(chưa có)" như các dòng khác.
  c.touch({ convId: 'c2', chatId: 'chat2', userName: 'An', text: 'chào' });
  assert.match(c.summary('c2'), /Ghi chú: \(chưa có\)/);
});

test('summary: chưa có hồ sơ → câu ngắn, không ném lỗi', () => {
  const { c } = setup();
  assert.equal(c.summary('khong-co'), 'Chưa có hồ sơ khách.');
});

test('erase: xoá hồ sơ, báo true nếu có dòng bị xoá', () => {
  const { store, c } = setup();
  c.touch({ convId: 'c1', chatId: 'chat1', userName: 'An', text: 'chào' });
  assert.equal(c.erase('c1'), true);
  assert.equal(store.customers.get('c1'), null);
  assert.equal(c.erase('c1'), false);
});

// ---------------------------------------------------------------- sửa QA

test('F1 nhãn: chuỗi là MỘT nhãn, không duyệt theo ký tự', () => {
  const { c } = setup();
  const sau = c.addLabels('c1', 'tra-cuu-hs', 'auto');
  assert.equal(sau.length, 1);
  assert.equal(sau[0].nhan, 'tra-cuu-hs');
});

test('F1 nhãn: kiểu dữ liệu sai thì không ném lỗi, không đổi hồ sơ', () => {
  const { store, c } = setup();
  assert.deepEqual(c.addLabels('c1', { a: 1 }, 'auto'), []);
  assert.equal(store.customers.get('c1'), null);
  assert.deepEqual(c.addLabels('c1', null, 'auto'), []);
});

test('F1 interests: không phải mảng thì không ném lỗi', () => {
  const { store, c } = setup();
  assert.deepEqual(c.addInterests('c1', { a: 1 }), []);
  assert.equal(store.customers.get('c1'), null);
});

test('F2 extractPhone: companyPhones null không ném lỗi', () => {
  assert.equal(extractPhone(`số ${PHONE}`, null), PHONE);
});

test('F3 last_seen_at: lệnh của nhân viên không đổi lần cuối khách nhắn', () => {
  const store = openStore(':memory:');
  const clock = { t: new Date('2026-11-04T07:16:00.000Z') };
  const c = createCustomers({ store, config: {}, now: () => clock.t });
  c.touch({ convId: 'c1', chatId: 'chat1', userName: 'Chị Lan', text: 'chào' });
  clock.t = new Date('2026-11-04T07:26:00.000Z');
  c.addLabels('c1', ['tra-cuu-hs'], 'staff:u9');
  clock.t = new Date('2026-11-04T07:36:00.000Z');
  c.setNote('c1', 'khách cần báo giá', 'staff:u9');
  const row = store.customers.get('c1');
  // `last_seen_at` = lần cuối KHÁCH nhắn, nhân viên sửa hồ sơ không được đổi.
  assert.equal(row.last_seen_at, '2026-11-04T07:16:00.000Z');
  assert.equal(row.first_seen_at, '2026-11-04T07:16:00.000Z');
});

test('F4 summary: tên và món có xuống dòng không sinh dòng giả', () => {
  const { c } = setup();
  c.touch({ convId: 'c1', chatId: 'chat1', userName: 'An\nSố điện thoại: giả', text: 'chào' });
  c.addInterests('c1', [{ mon: 'van bi\n- giả', hs: HS8 }]);
  const s = c.summary('c1');
  const dong = s.split('\n');
  // Chỉ dòng SĐT thật của hồ sơ được phép bắt đầu bằng "Số điện thoại:".
  assert.equal(dong.filter((l) => l.startsWith('Số điện thoại:')).length, 1);
  assert.equal(dong.length, 7);
  assert.ok(s.includes('Hồ sơ khách: An Số điện thoại: giả'));
  assert.ok(s.includes('- van bi - giả'));
});

test('F4 summary: ghi chú có xuống dòng không sinh dòng giả', () => {
  const { c } = setup();
  c.touch({ convId: 'c1', chatId: 'chat1', userName: 'An', text: 'chào' });
  c.setNote('c1', 'khách cần báo giá\nGhi chú: giả', 'staff:u9');
  const dong = c.summary('c1').split('\n');
  assert.equal(dong.filter((l) => l.startsWith('Ghi chú:')).length, 1);
  assert.equal(dong.length, 7);
});

test('F5 mã HS có dấu tách: extractPhone khớp quy tắc hình dạng', () => {
  assert.equal(extractPhone('mã HS 8413.70.9090', new Set()), null);
  assert.equal(looksLikeHsCode('8413.70.9090'), false);
  assert.equal(extractPhone('mã HS 8413.70.90.90', new Set()), null);
  assert.equal(looksLikeHsCode('8413.70.90.90'), true);
});

test('F6 hai người khác nhau trong cùng nhóm không lẫn hồ sơ', () => {
  const { store, c } = setup();
  c.touch({ convId: 'g1:u1', chatId: 'g1', userName: 'Chị Lan', text: `số em ${PHONE}` });
  c.touch({ convId: 'g1:u2', chatId: 'g1', userName: '', text: 'chào' });
  const u1 = store.customers.get('g1:u1');
  const u2 = store.customers.get('g1:u2');
  assert.equal(u1.phone, PHONE);
  assert.equal(u1.turns, 1);
  assert.equal(u1.chat_id, 'g1');
  assert.equal(u2.phone, null);
  assert.deepEqual(u2.labels, []);
  assert.equal(u2.turns, 1);
  assert.equal(u2.chat_id, 'g1');
});
