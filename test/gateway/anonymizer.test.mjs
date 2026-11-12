import test from 'node:test';
import assert from 'node:assert/strict';
import { anonymizePrompt, deanonymizeDraft } from '../../gateway/anonymizer.js';

// Số dùng để thử — DỰNG LÚC CHẠY, không gõ cứng trong mã nguồn (Hiến pháp Điều IX).
const sdtMau = ['0912', '345', '678'].join('');
const stkMau = ['1234', '5678', '9012', '3456'].join('');
const tokenMau = ['sk', 'gia', 'loi', 'goc'].join('-');

test('T808: Ẩn danh số điện thoại và thay tên khách thành "Khách" trước khi gửi', () => {
  const raw = `Anh Thắng ơi, khách Nguyễn Văn A số ${sdtMau} hỏi thủ tục nhập xe nâng`;
  const { anonymizedText, anonymizeMap } = anonymizePrompt({
    text: raw,
    customerName: 'Nguyễn Văn A',
    convId: 'conv-101'
  });

  assert.equal(anonymizedText.includes('Nguyễn Văn A'), false, 'Tên khách thật không được xuất hiện');
  assert.equal(anonymizedText.includes(sdtMau), false, 'Số điện thoại thật không được xuất hiện');
  assert.ok(anonymizedText.includes('Khách'));
  assert.ok(anonymizedText.includes('[SĐT]'));

  const draftFromAi = 'Dạ em chào [TEN_KHACH], thủ tục nhập xe nâng bao gồm đăng kiểm...';
  const finalDraft = deanonymizeDraft(draftFromAi, anonymizeMap);
  assert.equal(finalDraft, 'Dạ em chào Nguyễn Văn A, thủ tục nhập xe nâng bao gồm đăng kiểm...');
});

test('T808: Che token bí mật và số tài khoản ngân hàng trước khi gửi lên AI Studio', () => {
  const raw = `Tôi chuyển vào STK ${stkMau} giúp, token là ${tokenMau} nhé`;
  const { anonymizedText } = anonymizePrompt({
    text: raw,
    customerName: 'Trần Thị B',
    convId: 'conv-202'
  });

  assert.equal(anonymizedText.includes(stkMau), false, 'Số tài khoản không được lộ');
  assert.equal(anonymizedText.includes(tokenMau), false, 'Token không được lộ');
  assert.ok(anonymizedText.includes('[STK]'));
  assert.ok(anonymizedText.includes('[TOKEN]'));
  assert.equal(anonymizedText.includes('Trần Thị B'), false, 'Tên khách không được lộ');
});

test('T808: Trong nhóm, mỗi khách một nhãn riêng và khôi phục đúng tên khi trả lời', () => {
  const a = anonymizePrompt({
    text: 'Nguyễn Văn A hỏi mã HS',
    customerName: 'Nguyễn Văn A',
    convId: 'conv-nhom',
    isGroup: true
  });
  const b = anonymizePrompt({
    text: 'Trần Thị B hỏi thủ tục',
    customerName: 'Trần Thị B',
    convId: 'conv-nhom',
    isGroup: true
  });

  assert.ok(a.anonymizedText.includes('Khách A'), 'Khách thứ nhất trong nhóm phải có nhãn riêng');
  assert.ok(b.anonymizedText.includes('Khách B'), 'Khách thứ hai trong nhóm phải có nhãn riêng');
  assert.equal(a.anonymizedText.includes('Nguyễn Văn A'), false);
  assert.equal(b.anonymizedText.includes('Trần Thị B'), false);

  assert.equal(deanonymizeDraft('Anh Khách A ơi', a.anonymizeMap), 'Anh Nguyễn Văn A ơi');
  assert.equal(deanonymizeDraft('Chị Khách B ơi', b.anonymizeMap), 'Chị Trần Thị B ơi');
});

test('T808: Số tài khoản có dấu tách cũng bị che, còn mã HS thì giữ nguyên', () => {
  const { anonymizedText } = anonymizePrompt({
    text: 'STK 1234-5678-9012 và mã HS 84137090',
    customerName: 'Lê Văn C',
    convId: 'conv-303'
  });

  assert.equal(anonymizedText.includes('1234-5678-9012'), false, 'STK có dấu tách phải bị che');
  assert.ok(anonymizedText.includes('[STK]'));
  assert.ok(anonymizedText.includes('84137090'), 'Mã HS không được che');
});
