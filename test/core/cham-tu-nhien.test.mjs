// B9 của #168 mục nghiệm thu: chấm độ tự nhiên câu trả lời bằng LLM, thang 1–5 theo hồ sơ giọng Quyên,
// trung bình phải ≥ 4. Test này KHÔNG gọi mạng: `fetchImpl` giả, không khoá thật, không in khoá.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIEU_CHI, demDong, demEmoji, doDeterministic, tongHop, bangMarkdown, taoChamGemini,
} from '../../scripts/cham-tu-nhien.mjs';

const TIN_TOT = 'Dạ nhập máy bơm ly tâm 1.5HP thì mã phù hợp nhất là 8413.70.90 anh/chị nhé.\n• Thuế NK 0%, có C/O mẫu E thì còn 0%\n• VAT 10%\nAnh/chị muốn em soạn luôn mô tả khai báo không ạ?';

test('TIEU_CHI bám hồ sơ giọng Quyên: có xưng hô, độ dài, emoji, giọng người, trách nhiệm', () => {
  assert.ok(TIEU_CHI.length >= 4, 'phải có ít nhất 4 tiêu chí');
  const all = JSON.stringify(TIEU_CHI).toLowerCase();
  for (const tu of ['xưng hô', 'dòng', 'emoji', 'gợi ý']) {
    assert.ok(all.includes(tu), `tiêu chí phải nhắc "${tu}"`);
  }
  // Mỗi tiêu chí phải có mã ngắn để ghép vào bảng điểm của PR.
  for (const t of TIEU_CHI) {
    assert.match(t.ma, /^[a-z0-9-]+$/);
    assert.ok(t.moTa.length > 10);
  }
});

test('đo máy (không cần LLM): số dòng, số emoji, xưng hô, lời nhắc mã chỉ là gợi ý', () => {
  assert.equal(demDong('a\nb\nc'), 3);
  assert.equal(demDong(''), 0);
  assert.equal(demEmoji('không có gì'), 0);
  assert.equal(demEmoji('💰 Thuế — 8509 ✅ xong'), 2);

  const d = doDeterministic(TIN_TOT);
  assert.equal(d.soDong, 4);
  assert.equal(d.soEmoji, 0);
  assert.equal(d.coXungHo, true);
  assert.equal(d.anhNheCung, false);

  // "anh nhé" cứng là lỗi hồ sơ giọng: khách có thể là chị.
  assert.equal(doDeterministic('Dạ mã 8413.70.90 anh nhé').anhNheCung, true);
});

test('taoChamGemini: không có khoá → null để nơi gọi báo rõ "chưa chạy", không bịa điểm', () => {
  assert.equal(taoChamGemini({ apiKey: '' }), null);
  assert.equal(taoChamGemini({}), null);
});

test('taoChamGemini: đọc điểm + nhận xét từ phản hồi LLM; mọi lỗi → null, không ném', async () => {
  const traLoi = (obj) => async () => ({
    ok: true,
    async json() { return { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }; },
  });

  const ok = taoChamGemini({ apiKey: 'khoa-gia', fetchImpl: traLoi({ diem: 4.5, nhanXet: 'tự nhiên, đúng xưng hô' }) });
  assert.deepEqual(await ok.cham(TIN_TOT), { diem: 4.5, nhanXet: 'tự nhiên, đúng xưng hô' });

  // Điểm ngoài thang 1–5 hoặc không phải số → bỏ, KHÔNG kẹp về biên (kẹp là bịa điểm).
  for (const xau of [{ diem: 9, nhanXet: 'x' }, { diem: 0, nhanXet: 'x' }, { diem: 'tốt', nhanXet: 'x' }, {}]) {
    const c = taoChamGemini({ apiKey: 'khoa-gia', fetchImpl: traLoi(xau) });
    assert.equal(await c.cham(TIN_TOT), null, `phải bỏ phản hồi ${JSON.stringify(xau)}`);
  }

  // HTTP lỗi và mạng lỗi: trả null, không ném lỗi ra ngoài.
  const loi500 = taoChamGemini({ apiKey: 'khoa-gia', fetchImpl: async () => ({ ok: false, status: 500, async json() { return {}; } }) });
  assert.equal(await loi500.cham(TIN_TOT), null);
  const loiMang = taoChamGemini({ apiKey: 'khoa-gia', fetchImpl: async () => { throw new Error('ECONNRESET'); } });
  assert.equal(await loiMang.cham(TIN_TOT), null);
});

test('taoChamGemini: không bao giờ đặt khoá vào URL (khoá đi ở header)', async () => {
  let thay = null;
  const c = taoChamGemini({
    apiKey: 'khoa-gia',
    fetchImpl: async (url, init) => {
      thay = { url: String(url), header: init?.headers?.['x-goog-api-key'] };
      return { ok: true, async json() { return { candidates: [{ content: { parts: [{ text: '{"diem":4,"nhanXet":"ổn"}' }] } }] }; } };
    },
  });
  await c.cham(TIN_TOT);
  assert.doesNotMatch(thay.url, /khoa-gia/);
  assert.equal(thay.header, 'khoa-gia');
});

test('tongHop: trung bình ≥ 4 mới đạt; tin không chấm được không được tính thành 0', () => {
  const a = tongHop([{ diem: 4 }, { diem: 5 }, { diem: 4 }]);
  assert.equal(a.trungBinh, 4.33);
  assert.equal(a.dat, true);
  assert.equal(a.soTinDaCham, 3);

  const b = tongHop([{ diem: 3 }, { diem: 4 }]);
  assert.equal(b.trungBinh, 3.5);
  assert.equal(b.dat, false);

  // Tin LLM không chấm được (diem = null) bị loại khỏi phép chia, và được đếm riêng.
  const c = tongHop([{ diem: 5 }, { diem: null }, { diem: 5 }]);
  assert.equal(c.trungBinh, 5);
  assert.equal(c.soTinDaCham, 2);
  assert.equal(c.soTinChuaCham, 1);

  // Không chấm được tin nào → KHÔNG đạt, và trung bình là null (không phải 0).
  const d = tongHop([{ diem: null }]);
  assert.equal(d.trungBinh, null);
  assert.equal(d.dat, false);
});

test('bangMarkdown: bảng dán vào PR có từng tin, điểm, số dòng và dòng trung bình', () => {
  const md = bangMarkdown([
    { nhan: 'KB1 bước 1', diem: 4.5, nhanXet: 'tự nhiên', do: doDeterministic(TIN_TOT) },
    { nhan: 'KB2 bước 1', diem: null, nhanXet: 'LLM không chấm được', do: doDeterministic('Dạ 💰 xong ✅ rồi ạ 🎉') },
  ]);
  assert.match(md, /KB1 bước 1/);
  assert.match(md, /4\.5/);
  assert.match(md, /KB2 bước 1/);
  assert.match(md, /chưa chấm|không chấm/i);
  assert.match(md, /Trung bình/);
  // Bảng là bảng Markdown thật (có dòng kẻ) để dán thẳng vào mô tả PR.
  assert.match(md, /\|---/);
});
