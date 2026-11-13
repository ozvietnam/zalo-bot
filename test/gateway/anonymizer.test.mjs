import test from 'node:test';
import assert from 'node:assert/strict';
import { anonymizePrompt, deanonymizeDraft } from '../../gateway/anonymizer.js';

// Số dùng để thử — DỰNG LÚC CHẠY, không gõ cứng trong mã nguồn (Hiến pháp Điều IX).
const sdtMau = ['0912', '345', '678'].join('');
const stk10 = ['1234', '567890'].join('');
const stk16 = ['1234', '5678', '9012', '3456'].join('-');
const tokenMau = ['sk', 'gia', 'loi', 'goc'].join('-');
// Tên giả hoàn toàn, không phải khách thật.
const TEN_A = 'Nguyễn Văn Ao';
const TEN_B = 'Trần Thị Bưởi';

test('T808: che số điện thoại và tên khách, khôi phục đúng tên từ nhãn', () => {
  const raw = `Khách ${TEN_A} số ${sdtMau} hỏi thủ tục nhập xe nâng`;
  const { anonymizedText, anonymizeMap } = anonymizePrompt({
    text: raw,
    customerName: TEN_A,
    convId: 'conv-101'
  });

  // Test THẬT: chuỗi nguồn CÓ chứa tên và số, nên hai phép kiểm dưới mới có nghĩa.
  assert.ok(raw.includes(TEN_A) && raw.includes(sdtMau), 'chuỗi nguồn phải chứa dữ liệu cần che');
  assert.equal(anonymizedText.includes(TEN_A), false, 'tên khách thật không được lộ');
  assert.equal(anonymizedText.includes(sdtMau), false, 'số điện thoại thật không được lộ');
  assert.ok(anonymizedText.includes('[KHACH]'), 'phải dùng nhãn đánh dấu, không phải chữ thô');
  assert.ok(anonymizedText.includes('[SĐT]'));

  const draftFromAi = 'Dạ em chào [TEN_KHACH], thủ tục nhập xe nâng gồm đăng kiểm...';
  assert.equal(
    deanonymizeDraft(draftFromAi, anonymizeMap),
    `Dạ em chào ${TEN_A}, thủ tục nhập xe nâng gồm đăng kiểm...`
  );
});

test('T808: che token bí mật và số tài khoản ngân hàng (có dấu, số dài, có dấu tách)', () => {
  const raw = `Tôi chuyển vào số tài khoản ngân hàng ${stk10}, token là ${tokenMau}, ${TEN_B} nhé`;
  assert.ok(
    raw.includes(stk10) && raw.includes(tokenMau) && raw.includes(TEN_B),
    'chuỗi nguồn phải chứa cả ba thứ cần che — nếu không, phép kiểm dưới là test giả'
  );

  const { anonymizedText } = anonymizePrompt({ text: raw, customerName: TEN_B, convId: 'conv-202' });
  assert.equal(anonymizedText.includes(stk10), false, 'STK sau "ngân hàng" CÓ DẤU phải bị che');
  assert.equal(anonymizedText.includes(tokenMau), false, 'token không được lộ');
  assert.equal(anonymizedText.includes(TEN_B), false, 'tên khách không được lộ');
  assert.ok(anonymizedText.includes('[STK]'));
  assert.ok(anonymizedText.includes('[TOKEN]'));

  // STK 16 số viết có dấu tách phải bị che TRỌN, không băm vụn.
  const sep = anonymizePrompt({ text: `STK ${stk16}`, customerName: TEN_B, convId: 'conv-203' });
  assert.equal(sep.anonymizedText, 'STK [STK]', 'STK 16 số có dấu tách phải che trọn một lần');
});

test('T808: mã HS KHÔNG bị che (không che quá tay)', () => {
  const { anonymizedText } = anonymizePrompt({
    text: 'Mã HS 8413.70.90 và 84137090 cho xe nâng',
    customerName: TEN_A,
    convId: 'conv-304'
  });
  assert.ok(anonymizedText.includes('8413.70.90'), 'mã HS có dấu chấm phải giữ');
  assert.ok(anonymizedText.includes('84137090'), 'mã HS 8 số phải giữ');
});

test('T808: mã số thuế 10 số bị che theo luật "che rộng hơn lõi" của core/sdt.js', () => {
  // Mã số thuế `0101234567` là 10 số bắt đầu bằng `0` — TRÙNG KHÍT dạng SĐT nội
  // địa. `core/sdt.js` là ngữ pháp SĐT DUY NHẤT của repo và nó chọn "che nhầm
  // còn hơn lộ số điện thoại". Tách được hai thứ này thì phải viết bộ lọc SĐT
  // thứ hai — điều Hiến pháp cấm. Nên ghi lại hành vi thật, không giả vờ đúng.
  const { anonymizedText } = anonymizePrompt({
    text: 'Mã số thuế công ty 0101234567',
    customerName: TEN_A,
    convId: 'conv-305'
  });
  assert.equal(anonymizedText, 'Mã số thuế công ty [SĐT]');
});

test('T808: trong nhóm, tên khách KHÁC cũng bị che (không lọt lên AI Studio)', () => {
  const a = anonymizePrompt({ text: `${TEN_A} hỏi mã HS`, customerName: TEN_A, convId: 'conv-nhom', isGroup: true });
  const b = anonymizePrompt({
    text: `${TEN_A} nói với tôi là hàng đã về`,
    customerName: TEN_B,
    convId: 'conv-nhom',
    isGroup: true
  });

  assert.ok(a.anonymizedText.includes('[KHACH_A]'), 'khách thứ nhất có nhãn riêng');
  assert.equal(a.anonymizedText.includes(TEN_A), false);

  // Đây là lỗi 1 vòng soát 1: tin của khách B nhắc tên khách A.
  assert.equal(b.anonymizedText.includes(TEN_A), false, 'tên khách KHÁC trong nhóm cũng phải bị che');
  assert.ok(b.anonymizedText.includes('[KHACH_A]'), 'tên khách A phải thành nhãn của A');
  assert.ok(b.anonymizeMap.get('[KHACH_B]') === TEN_B);

  assert.equal(deanonymizeDraft('Anh [KHACH_A] ơi', a.anonymizeMap), `Anh ${TEN_A} ơi`);
  assert.equal(deanonymizeDraft('Chị [KHACH_B] ơi', b.anonymizeMap), `Chị ${TEN_B} ơi`);
});

test('T808: thiếu convId thì hai khách KHÔNG dùng chung bản đồ', () => {
  const c1 = anonymizePrompt({ text: `tôi là ${TEN_A}`, customerName: TEN_A });
  const c2 = anonymizePrompt({ text: `tôi là ${TEN_B}`, customerName: TEN_B });

  assert.equal(c1.anonymizedText.includes(TEN_A), false);
  assert.equal(c2.anonymizedText.includes(TEN_B), false);

  // Đây là lỗi 2 vòng soát 1: bản đồ của khách 2 từng chứa tên khách 1.
  const giaTri2 = [...c2.anonymizeMap.values()];
  assert.equal(giaTri2.includes(TEN_A), false, 'bản đồ khách 2 không được chứa tên khách 1');
  assert.deepEqual(new Set(giaTri2), new Set([TEN_B]), 'bản đồ chỉ chứa đúng khách của lượt này');

  // Và khôi phục không được trả tên khách khác.
  assert.equal(deanonymizeDraft('Dạ em chào [TEN_KHACH]', c2.anonymizeMap), `Dạ em chào ${TEN_B}`);
});

test('T808: tên ngắn không làm vỡ văn bản (ranh giới từ)', () => {
  // Đây là lỗi 5 vòng soát 1: tên "An" từng cắt "Anh chị" thành "Kháchh chị".
  const { anonymizedText } = anonymizePrompt({
    text: 'Anh chị An cứ yên tâm, Ancol thì khác',
    customerName: 'An',
    convId: 'conv-ngan'
  });
  assert.ok(anonymizedText.startsWith('Anh chị '), 'không được cắt vào giữa chữ "Anh"');
  assert.ok(anonymizedText.includes('Ancol'), 'không được cắt vào giữa chữ "Ancol"');
  assert.ok(anonymizedText.includes('[KHACH]'), 'tên đứng riêng thì vẫn phải che');
});

test('T808: khôi phục KHÔNG thay chữ "Khách" thô trong văn bản', () => {
  // Đây là lỗi 6 vòng soát 1: "Khách hàng" từng thành "<tên> hàng".
  const { anonymizeMap } = anonymizePrompt({ text: `tôi là ${TEN_A}`, customerName: TEN_A, convId: 'conv-tho' });
  const ra = deanonymizeDraft('Gửi Khách hàng của mình: [TEN_KHACH] nhé', anonymizeMap);
  assert.ok(ra.includes('Khách hàng của mình'), 'chữ "Khách hàng" phải giữ nguyên nghĩa');
  assert.equal(ra, `Gửi Khách hàng của mình: ${TEN_A} nhé`);
});

test('T808: khách tên có chữ "Khách" vẫn ẩn danh và khôi phục đúng', () => {
  const ten = 'Khách Minh';
  const { anonymizedText, anonymizeMap } = anonymizePrompt({
    text: `${ten} cần báo giá`,
    customerName: ten,
    convId: 'conv-trung'
  });
  assert.equal(anonymizedText.includes(ten), false, 'tên có chữ "Khách" cũng phải bị che');
  assert.equal(deanonymizeDraft('Dạ [TEN_KHACH] ơi', anonymizeMap), `Dạ ${ten} ơi`);
});
