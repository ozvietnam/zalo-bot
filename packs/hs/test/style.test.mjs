// packs/hs/test/style.test.mjs — lớp định dạng rich text của Zalo (text_styles).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rich, plain, splitRich, balanceTags } from '../style.js';
import { renderResult } from '../render.js';
import { menuText, availablePackages } from '../packages.js';

test('style: thẻ mở/đóng → text + text_styles; thẻ lạ hoặc không khớp giữ nguyên chữ', () => {
  const r1 = rich('a {b}đậm{/b} b');
  assert.equal(r1.text, 'a đậm b');
  assert.deepEqual(r1.text_styles, [{ start: 2, len: 3, st: ['b'] }]);
  const r2 = rich('{red}đỏ{/red}');
  assert.deepEqual(r2.text_styles, [{ start: 0, len: 2, st: ['c_db342e'] }]);
  const r3 = rich('{b}{green}g{/green}{/b}');                       // lồng nhau → gộp mã định dạng
  assert.equal(r3.text, 'g');
  assert.deepEqual(r3.text_styles[0].st.sort(), ['b', 'c_15a85f']);
  assert.equal(rich('{b}abc').text, '{b}abc');                     // không có thẻ đóng → giữ nguyên
  assert.equal(rich('a{/b}').text, 'a{/b}');                       // thẻ đóng lạ → giữ nguyên
  assert.equal(rich('{xyz}a{/xyz}').text, '{xyz}a{/xyz}');         // thẻ không hỗ trợ → giữ nguyên
  assert.equal(rich('thường').text_styles.length, 0);
});

test('style: offset tính theo UTF-16 (emoji chiếm 2 đơn vị) như Zalo yêu cầu', () => {
  // "📦 " = 1 emoji (2 code unit) + 1 space → mã HS bắt đầu tại index 3.
  const r = rich('📦 {b}8413.70.90{/b}');
  assert.equal(r.text, '📦 8413.70.90');
  assert.deepEqual(r.text_styles, [{ start: 3, len: 10, st: ['b'] }]);
  assert.equal(r.text.slice(3, 13), '8413.70.90');
});

test('style: hai cặp thẻ giống nhau → hai run riêng', () => {
  const r = rich('{b}a{/b}x{b}b{/b}');
  assert.equal(r.text, 'axb');
  assert.deepEqual(r.text_styles, [{ start: 0, len: 1, st: ['b'] }, { start: 2, len: 1, st: ['b'] }]);
});

test('style: dấu ngoặc trong nội dung không phá thẻ', () => {
  const r = rich('{b}công thức {x} và {y}{/b}');
  assert.equal(r.text, 'công thức {x} và {y}');
  assert.deepEqual(r.text_styles, [{ start: 0, len: 20, st: ['b'] }]);
});

test('style: chia tin giàu định dạng, mỗi đoạn ≤2000 và giữ đúng style', () => {
  const src = `{b}tiêu đề{/b}\n${'x'.repeat(2500)}`;
  const parts = splitRich(rich(src), 2000);
  assert.ok(parts.length >= 2);
  assert.ok(parts.every((p) => p.text.length <= 2000));
  assert.ok(parts.every((p) => p.text_styles.every((s) => s.start >= 0 && s.start + s.len <= p.text.length)));
  assert.match(parts[0].text, /^tiêu đề/);
  assert.ok(parts[0].text_styles.some((s) => s.st.includes('b')));
});

test('style: định dạng ở đoạn sau không lệch khi đoạn bị cắt và trim', () => {
  const src = `${'A'.repeat(1990)} {b}${'B'.repeat(100)}{/b}`;
  const parts = splitRich(rich(src), 2000);
  assert.ok(parts.length >= 2, 'phải chia thành ≥2 đoạn');
  const p2 = parts[parts.length - 1];
  assert.ok(p2.text.startsWith('B'), `đoạn 2 phải bắt đầu bằng B: ${p2.text.slice(0, 10)}`);
  assert.equal(p2.text_styles.length, 1);
  assert.equal(p2.text_styles[0].start, 0, 'định dạng phải bắt đầu đúng đầu đoạn');
  assert.equal(p2.text_styles[0].len, 100);
  assert.deepEqual(p2.text_styles[0].st, ['b']);
});

test('style: balanceTags đóng thẻ còn mở khi tin bị cắt', () => {
  const r = balanceTags('{b}tiêu đề bị cắt');
  assert.equal(plain(r), 'tiêu đề bị cắt');
  assert.match(r, /\{\/b\}$/);
});

test('giao diện: menu + footer có tiêu đề in đậm, màu, gợi ý bước sau', () => {
  const ps = availablePackages(new Set(['tra_thue', 'phan_loai_hs']));
  const full = menuText(ps, { full: true });
  assert.match(plain(full), /CHỌN GÓI TRA CỨU/);
  assert.match(plain(full), /1\. 🔎 Phân loại mã HS/);
  assert.match(plain(full), /0\. Tự động/);
  assert.match(full, /\{b\}📦 CHỌN GÓI TRA CỨU\{\/b\}/);          // tiêu đề đậm
  const foot = menuText(ps);
  assert.match(plain(foot), /Gõ "menu" để xem các gói tra cứu/);     // footer gọn: không liệt kê số gói
  assert.doesNotMatch(plain(foot), /1 Phân loại/);
  assert.match(foot, /\{b\}"menu"\{\/b\}/);                          // "menu" in đậm
});

test('giao diện: mã HS trong kết quả được làm nổi bật, dữ liệu gốc không đổi', () => {
  const TAX = { ok: true, data: { hsCode: '84137090', nameVi: '- - Loại khác', unitVi: 'chiếc', taxNkPreferential: '0', taxNkTt: '15',
    acfta: { forOrigin: { origin: 'CN', eligible: false, rate: null } }, taxVat: '8/10',
    warnings: { summary: 'Kiểm tra hiệu suất năng lượng.', severity: 'MEDIUM' } }, chiPhi: { diem: 2 } };
  const out = renderResult(TAX, { title: '💰 Thuế — 8413.70.90', renderer: 'tax' });
  assert.match(out, /\{b\}8413\.70\.90\{\/b\}/);                     // mã HS in đậm
  assert.match(plain(out), /8413\.70\.90/);                         // người dùng vẫn thấy mã
  assert.match(plain(out), /MFN/);                                  // nội dung giữ nguyên
  assert.doesNotMatch(plain(out), /\{[a-z]+\}/i);                   // không sót thẻ
});
