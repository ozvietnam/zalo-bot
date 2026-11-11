import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../../core/gate.js';

const NOW = '2026-11-04T03:00:00.000Z'; // 10:00 VN
const base = { kind: 'reply', text: 'Dạ mã 8413.70.90', inReplyToAt: NOW };
const baseFacts = {
  chatState: 'bot', idemExists: false, hasOpenJob: false,
  recentBotTexts: [], sentTodayChat: 0, sentTodayAll: 0, now: NOW,
};
const run = (f = {}, m = {}, r) => decide({ ...base, ...m }, { ...baseFacts, ...f }, r);

test('1 duplicate-idem -> drop (mọi kind)', () => {
  assert.deepEqual(run({ idemExists: true }), { decision: 'drop', reason: 'duplicate-idem' });
  assert.equal(run({ idemExists: true }, { kind: 'staff_relay' }).reason, 'duplicate-idem');
});

test('2 chat-human / chat-blocked -> reject; staff_relay/ticket/digest vẫn qua', () => {
  assert.deepEqual(run({ chatState: 'human' }), { decision: 'reject', reason: 'chat-human' });
  assert.deepEqual(run({ chatState: 'blocked' }), { decision: 'reject', reason: 'chat-blocked' });
  for (const kind of ['staff_relay', 'ticket', 'digest']) {
    assert.equal(run({ chatState: 'human' }, { kind }).decision, 'send');
  }
});

test('3a job_result không nợ -> proactive-no-debt', () => {
  assert.deepEqual(run({}, { kind: 'job_result' }), { decision: 'reject', reason: 'proactive-no-debt' });
});

test('3a notice cũ 2 giờ không nợ -> proactive-no-debt; thiếu inReplyToAt cũng là chủ động', () => {
  const old = '2026-11-04T01:00:00.000Z';
  assert.equal(run({}, { kind: 'notice', inReplyToAt: old }).reason, 'proactive-no-debt');
  assert.equal(run({}, { inReplyToAt: undefined }).reason, 'proactive-no-debt');
});

test('3b giờ yên -> defer tới 07:00 VN', () => {
  const r = run({ hasOpenJob: true, now: '2026-11-04T16:30:00Z' }, { kind: 'job_result' });
  assert.deepEqual(r, { decision: 'defer', reason: 'quiet-hours', notBefore: '2026-11-05T00:00:00.000Z' });
});

test('3b rules.quietHours=false tắt giờ yên (createBot cũ dùng), mặc định vẫn bật', () => {
  const f = { hasOpenJob: true, now: '2026-11-04T16:30:00Z' };
  assert.equal(run(f, { kind: 'job_result' }, { quietHours: false }).decision, 'send');
  assert.equal(run(f, { kind: 'job_result' }, {}).reason, 'quiet-hours');
});

test('3b trả lời trực tiếp trong giờ yên vẫn gửi', () => {
  const r = run({ now: '2026-11-04T16:30:00Z' }, { kind: 'reply', inReplyToAt: '2026-11-04T16:28:00Z' });
  assert.equal(r.decision, 'send');
});

test('4 cap:chat', () => {
  assert.deepEqual(run({ sentTodayChat: 8 }), { decision: 'defer', reason: 'cap:chat' });
  assert.equal(run({ sentTodayChat: 7 }).decision, 'send');
  assert.equal(run({ sentTodayChat: 99 }, { kind: 'ticket' }).decision, 'send');
});

test('5 cap:all', () => {
  assert.deepEqual(run({ sentTodayAll: 300 }), { decision: 'defer', reason: 'cap:all' });
});

test('6 similar:<điểm>', () => {
  const r = run({ recentBotTexts: ['Dạ mã 8413.70.90 ạ'] });
  assert.equal(r.decision, 'drop');
  assert.match(r.reason, /^similar:0\.\d+$/);
});

test('7 leak', () => {
  assert.deepEqual(run({}, { text: 'xem /home/oz/a.log' }), { decision: 'reject', reason: 'leak:path' });
  assert.equal(run({}, { text: 'xem /home/oz/a.log', kind: 'ticket' }).reason, 'leak:path');
});

test('7 staff_relay không kiểm leak', () => {
  assert.equal(run({}, { kind: 'staff_relay', text: 'xem /home/oz/a.log' }).decision, 'send');
});

test('7 bannedPatterns từ rules', () => {
  const r = run({}, { text: 'liên hệ nội bộ XYZ' }, { bannedPatterns: [/XYZ/] });
  assert.equal(r.reason, 'leak:banned');
});

test('6 đứng trước 7 (thứ tự bảng)', () => {
  const text = 'xem /home/oz/a.log';
  assert.match(run({ recentBotTexts: [text] }, { text }).reason, /^similar:/);
});

test('8 money không có trong evidence -> reject', () => {
  const m = { text: 'Cước 27.000đ/kg', pack: { moneyCheck: true }, evidence: [{ donGia: 25650 }] };
  assert.deepEqual(run({}, m), { decision: 'reject', reason: 'money:27000' });
});

test('8 money có trong evidence -> send; chuỗi số và lồng sâu', () => {
  const m = { text: 'Cước 25.650đ/kg', pack: { moneyCheck: true }, evidence: [{ donGia: 25650 }] };
  assert.equal(run({}, m).decision, 'send');
  assert.equal(run({}, { ...m, evidence: [{ a: { b: ['25.650'] } }] }).decision, 'send');
  assert.equal(run({}, { ...m, evidence: ['giá 25,650 đ'] }).decision, 'send');
});

test('8 chỉ chạy khi moneyCheck', () => {
  assert.equal(run({}, { text: 'Cước 27.000đ/kg', evidence: [] }).decision, 'send');
});

test('staff_relay/ticket/digest bỏ qua dòng 2-6 và 8', () => {
  const m = { kind: 'digest', text: 'Cước 27.000đ', pack: { moneyCheck: true }, inReplyToAt: undefined };
  assert.deepEqual(run({ sentTodayChat: 50, sentTodayAll: 999, recentBotTexts: ['Cước 27.000đ'] }, m), { decision: 'send', reason: 'ok' });
});

test('ok mặc định, rules mặc định khi bỏ qua', () => {
  assert.deepEqual(run(), { decision: 'send', reason: 'ok' });
});

test('rules tuỳ chỉnh: capChatDay, directReplyMs', () => {
  assert.equal(run({ sentTodayChat: 2 }, {}, { capChatDay: 2 }).reason, 'cap:chat');
  const old = '2026-11-04T02:55:00.000Z'; // 5 phút trước
  assert.equal(run({}, { inReplyToAt: old }, { directReplyMs: 60_000 }).reason, 'proactive-no-debt');
});

test('thời gian: facts.now thiếu thì dùng msg.now, Date được chấp nhận; không có thì throw', () => {
  assert.equal(decide({ ...base, now: NOW }, { ...baseFacts, now: undefined }).decision, 'send');
  assert.equal(run({ now: new Date(NOW) }).decision, 'send');
  assert.throws(() => decide(base, { ...baseFacts, now: undefined }));
});

test('8 thuế suất %, mã HS không phải tiền: moneyCheck + evidence rỗng vẫn send', () => {
  const m = { text: 'Dạ mã 8413.70.90, thuế NK 0%, VAT 10% ạ', pack: { moneyCheck: true }, evidence: [] };
  assert.deepEqual(run({}, m), { decision: 'send', reason: 'ok' });
});

test('8 evidence "1.5" chỉ là 1,5, không nhận 15; "1.234" là 1234', () => {
  const m = (ev) => ({ text: 'Phí 15 tệ', pack: { moneyCheck: true }, evidence: ev });
  assert.equal(run({}, m(['1.5'])).reason, 'money:15');
  assert.equal(run({}, m([15])).decision, 'send');
  const t = { text: 'Phí 1.234đ', pack: { moneyCheck: true }, evidence: ['1.234'] };
  assert.equal(run({}, t).decision, 'send');
});

test('0 text rỗng/khoảng trắng -> reject empty (trước cả duplicate-idem)', () => {
  assert.deepEqual(run({}, { text: '  ' }), { decision: 'reject', reason: 'empty' });
  assert.equal(run({ idemExists: true }, { text: '' }).reason, 'empty');
});

// 6: cửa sổ chống trùng tách theo loại tin (issue #55)
const truoc = (ms) => new Date(Date.parse(NOW) - ms).toISOString();
const GIONG = 'Dạ mã 8413.70.90 ạ'; // jaccard với base.text = 0.83 >= 0.8
const KHAC = 'Em gửi anh bảng giá cước đường biển tháng sau';
// Chủ động thật: không có mốc tin khách. (base.inReplyToAt = NOW nên phải ghi đè null,
// nếu không thì theo luật bước 6 đây là câu trả lời trực tiếp trả muộn, không phải tin chủ động.)
const CHU_DONG = { kind: 'job_result', inReplyToAt: null };
const FACTS_CHU_DONG = { hasOpenJob: true };

test('6 trả lời trực tiếp: trùng chữ trong 60 giây -> drop similar', () => {
  const r = run({ recentBotTexts: [{ text: GIONG, at: truoc(20_000) }] });
  assert.equal(r.decision, 'drop');
  assert.match(r.reason, /^similar:/);
});

test('6 trả lời trực tiếp: trùng chữ nhưng đã 3 phút -> send (lỗi của issue #55)', () => {
  const r = run({ recentBotTexts: [{ text: GIONG, at: truoc(180_000) }] });
  assert.deepEqual(r, { decision: 'send', reason: 'ok' });
});

test('6 tin chủ động: trùng chữ sau 3 phút vẫn drop similar (cửa sổ 15 phút)', () => {
  const r = run({ ...FACTS_CHU_DONG, recentBotTexts: [{ text: GIONG, at: truoc(180_000) }] }, CHU_DONG);
  assert.equal(r.decision, 'drop');
  assert.match(r.reason, /^similar:/);
});

test('6 tin chủ động: trùng chữ sau 16 phút -> send (ngoài cả cửa sổ dài)', () => {
  const r = run({ ...FACTS_CHU_DONG, recentBotTexts: [{ text: GIONG, at: truoc(960_000) }] }, CHU_DONG);
  assert.deepEqual(r, { decision: 'send', reason: 'ok' });
});

test('6 tương thích ngược: chuỗi trần không có mốc -> coi như trong cửa sổ, drop similar', () => {
  const r = run({ recentBotTexts: [GIONG] });
  assert.equal(r.decision, 'drop');
  assert.match(r.reason, /^similar:/);
});

test('6 mốc không đọc được -> coi như trong cửa sổ (mặc định an toàn)', () => {
  for (const at of [null, 'hom qua', undefined]) {
    assert.match(run({ recentBotTexts: [{ text: GIONG, at }] }).reason, /^similar:/);
  }
});

// job_result là câu trả lời cho câu khách đã hỏi, chỉ trả muộn vì chờ Cổng OZ phân loại (issue #55).
// Có mốc tin khách còn mới thì đi cửa sổ ngắn như reply/notice; không có mốc thì vẫn là tin chủ động.
test('6 job_result có mốc tin khách 3 phút: trùng chữ cách 3 phút -> send (lỗi của issue #55 trên đường việc nền)', () => {
  const r = run(
    { hasOpenJob: true, recentBotTexts: [{ text: GIONG, at: truoc(180_000) }] },
    { kind: 'job_result', inReplyToAt: truoc(180_000) },
  );
  assert.deepEqual(r, { decision: 'send', reason: 'ok' });
});

test('6 job_result không có mốc tin khách: trùng chữ cách 3 phút -> vẫn drop similar (cửa sổ 15 phút)', () => {
  const r = run(
    { hasOpenJob: true, recentBotTexts: [{ text: GIONG, at: truoc(180_000) }] },
    { kind: 'job_result', inReplyToAt: null },
  );
  assert.equal(r.decision, 'drop');
  assert.match(r.reason, /^similar:/);
});

test('3a job_result có mốc tin khách mới nhưng không nợ việc nền -> vẫn reject proactive-no-debt', () => {
  const r = run({ hasOpenJob: false }, { kind: 'job_result', inReplyToAt: truoc(180_000) });
  assert.deepEqual(r, { decision: 'reject', reason: 'proactive-no-debt' });
});

test('3b job_result có mốc tin khách mới, có nợ, trong giờ yên -> vẫn defer quiet-hours', () => {
  const dem = '2026-11-04T16:30:00.000Z'; // 23:30 VN
  const r = run(
    { hasOpenJob: true, now: dem },
    { kind: 'job_result', inReplyToAt: '2026-11-04T16:28:00.000Z' },
  );
  assert.deepEqual(r, { decision: 'defer', reason: 'quiet-hours', notBefore: '2026-11-05T00:00:00.000Z' });
});

test('6 hai câu khác nhau trong cùng 20 giây -> send', () => {
  const r = run({ recentBotTexts: [{ text: KHAC, at: truoc(20_000) }] });
  assert.deepEqual(r, { decision: 'send', reason: 'ok' });
});

// Biên đúng của hai cửa sổ: không được lệch 1 giây (kểm thử độc lập issue #55).
test('6 biên cửa sổ trả lời trực tiếp: đúng 60.000 ms vẫn bỏ, 60.001 ms thì gửi', () => {
  assert.match(run({ recentBotTexts: [{ text: GIONG, at: truoc(59_999) }] }).reason, /^similar:/);
  assert.match(run({ recentBotTexts: [{ text: GIONG, at: truoc(60_000) }] }).reason, /^similar:/);
  assert.deepEqual(run({ recentBotTexts: [{ text: GIONG, at: truoc(60_001) }] }), { decision: 'send', reason: 'ok' });
});

test('6 biên cửa sổ chủ động: đúng 900.000 ms (15 phút) vẫn bỏ, 900.001 ms thì gửi', () => {
  const f = { ...FACTS_CHU_DONG, recentBotTexts: [{ text: GIONG, at: truoc(899_999) }] };
  assert.match(run(f, CHU_DONG).reason, /^similar:/);
  assert.match(run({ ...FACTS_CHU_DONG, recentBotTexts: [{ text: GIONG, at: truoc(900_000) }] }, CHU_DONG).reason, /^similar:/);
  assert.deepEqual(run({ ...FACTS_CHU_DONG, recentBotTexts: [{ text: GIONG, at: truoc(900_001) }] }, CHU_DONG), { decision: 'send', reason: 'ok' });
});

// ─────────── 6: phạm vi chống trùng là MỘT CÂU KHÁCH (issue #201) ───────────
// Bước 6 sinh ra để chặn hai-lần-bấm-gửi (sự cố #2), nên nó chỉ so chữ trong phạm vi CÙNG MỘT câu
// khách. Trước #201, hai câu hỏi khác nhau mà câu trả lời trùng chữ cũng bị bỏ → khách thấy bot im.
test('6 (#201) hai câu khách KHÁC nhau, câu trả lời trùng chữ → vẫn gửi', () => {
  const f = { recentBotTexts: [{ text: GIONG, at: truoc(20_000), askKey: 'tra giúp mã 84137090' }] };
  assert.deepEqual(run(f, { askKey: 'thuế bao nhiêu?' }), { decision: 'send', reason: 'ok' });
});

test('6 (#201) CÙNG một câu khách (bấm gửi hai lần) → vẫn drop similar', () => {
  const f = { recentBotTexts: [{ text: GIONG, at: truoc(20_000), askKey: 'tra giúp mã 84137090' }] };
  // Chuẩn hoá theo `normVi`: khác hoa/thường, khác dấu cách vẫn là MỘT câu.
  assert.match(run(f, { askKey: 'tra giúp mã 84137090' }).reason, /^similar:/);
  assert.match(run(f, { askKey: 'Tra  giúp   MÃ 84137090' }).reason, /^similar:/);
});

test('6 (#201) chữ khách RỖNG hoặc thiếu → coi như KHÔNG BIẾT, vẫn so chữ (mặc định an toàn)', () => {
  const cu = { text: GIONG, at: truoc(20_000), askKey: 'tra hscode' };
  // '@bot' trơ trọi: sau khi bỏ tên bot thì rỗng — không phải một câu hỏi, không được coi là câu khác.
  assert.match(run({ recentBotTexts: [cu] }, { askKey: '' }).reason, /^similar:/);
  assert.match(run({ recentBotTexts: [cu] }, { askKey: '   ' }).reason, /^similar:/);
  assert.match(run({ recentBotTexts: [cu] }, { askKey: null }).reason, /^similar:/);
  // Tin cũ không khai chữ khách (dòng outbox cũ, trước vá này) cũng vẫn đem ra so.
  assert.match(run({ recentBotTexts: [{ text: GIONG, at: truoc(20_000) }] }, { askKey: 'thuế bao nhiêu?' }).reason, /^similar:/);
});

test('6 (#201) câu "đang tra" là chữ khuôn → KHÔNG được miễn trừ, hai câu khách khác nhau vẫn drop', () => {
  // `progress` giống nhau với mọi câu hỏi và không mang tin riêng của câu nào: lặp lại là tin rác
  // (sự cố #9). Nên dù hai câu khách khác nhau, câu "đang tra" thứ hai vẫn bị bỏ.
  const f = { recentBotTexts: [{ text: GIONG, at: truoc(20_000), askKey: 'tra giúp mã 84137090' }] };
  assert.match(run(f, { kind: 'progress', askKey: 'thuế bao nhiêu?' }).reason, /^similar:/);
});

test('6 mốc gửi là số mili giây hoặc Date → vẫn lọc cửa sổ đúng', () => {
  const t = Date.parse(NOW);
  assert.match(run({ recentBotTexts: [{ text: GIONG, at: t - 20_000 }] }).reason, /^similar:/);
  assert.match(run({ recentBotTexts: [{ text: GIONG, at: new Date(t - 20_000) }] }).reason, /^similar:/);
  assert.deepEqual(run({ recentBotTexts: [{ text: GIONG, at: t - 60_001 }] }), { decision: 'send', reason: 'ok' });
});

test('6 reply có mốc tin khách cũ hơn directReplyMs → đi cửa sổ dài (15 phút), không phải 60 giây', () => {
  const f = { hasOpenJob: true, recentBotTexts: [{ text: GIONG, at: truoc(3 * 60_000) }] };
  // mốc cũ 11 phút → không còn là trả lời trực tiếp → tin bot cách 3 phút vẫn trùng → bỏ
  assert.match(run(f, { inReplyToAt: truoc(11 * 60_000) }).reason, /^similar:/);
  // mốc còn trong 10 phút → cửa sổ 60 giây → tin bot cách 3 phút không còn trùng → gửi
  assert.deepEqual(run(f).decision, 'send');
});

// Khoá có mặt với giá trị undefined không được ghi đè mặc định: nếu ghi đè thì cửa sổ 60 giây
// biến mất và lỗi #55 (khách hỏi lại bị bỏ) quay lại âm thầm, không cảnh báo gì.
test('rules có khoá undefined -> vẫn dùng mặc định (không âm thầm mất ngưỡng)', () => {
  const f = { recentBotTexts: [{ text: GIONG, at: truoc(180_000) }] };
  for (const r of [{}, { dupDirectMs: undefined }, { dupDirectMs: undefined, dupWindowMs: undefined }, { similarity: undefined }]) {
    assert.deepEqual(run(f, {}, r), { decision: 'send', reason: 'ok' }, `rules = ${JSON.stringify(r)}`);
  }
  // Giá trị thật vẫn ghi đè được (0 và false không bị bỏ qua).
  assert.match(run(f, {}, { dupDirectMs: 900_000 }).reason, /^similar:/);
  assert.deepEqual(run({ recentBotTexts: [GIONG] }, {}, { similarity: 2 }), { decision: 'send', reason: 'ok' });
});
