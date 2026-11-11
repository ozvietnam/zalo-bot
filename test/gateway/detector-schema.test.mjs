import test from 'node:test';
import assert from 'node:assert/strict';
import { detectUiState } from '../../addon/detector.js';
import { validateResultSchema } from '../../gateway/schema-validator.js';

test('T807: detectUiState phát hiện chính xác banner rate limit và trang đăng xuất Google', () => {
  const docRateLimit = {
    querySelector: (sel) => sel.includes('Quota') ? { textContent: 'Quota exceeded for today' } : null
  };
  const state1 = detectUiState(docRateLimit, { rateLimitBanner: 'div:has-text("Quota")' });
  assert.equal(state1.isRateLimited, true);
  assert.equal(state1.isLoggedOut, false);

  const docLogout = {
    querySelector: (sel) => sel.includes('accounts.google') ? { href: 'https://accounts.google.com/signin' } : null
  };
  const state2 = detectUiState(docLogout, { loginIndicator: 'a[href*="accounts.google"]' });
  assert.equal(state2.isLoggedOut, true);
  assert.equal(state2.isRateLimited, false);
});

test('T807: detectUiState nhận diện thông báo Resource exhausted là rate limit', () => {
  const docResourceExhausted = {
    querySelector: (sel) => sel.includes('Resource exhausted') ? { textContent: 'Error 429: Resource exhausted' } : null
  };
  const state = detectUiState(docResourceExhausted, { rateLimitBanner: 'div:has-text("Resource exhausted")' });
  assert.equal(state.isRateLimited, true);
  assert.equal(state.isLoggedOut, false);
});

test('T807: detectUiState nhận diện trang đăng xuất qua URL hoặc location', () => {
  const docWithLocation = {
    location: { href: 'https://accounts.google.com/v3/signin/identifier' },
    querySelector: () => null
  };
  const state = detectUiState(docWithLocation);
  assert.equal(state.isLoggedOut, true);
  assert.equal(state.isRateLimited, false);

  const docWithUrl = {
    URL: 'https://accounts.google.com/signin/v2',
    querySelector: () => null
  };
  const stateUrl = detectUiState(docWithUrl);
  assert.equal(stateUrl.isLoggedOut, true);
});

test('T807: detectUiState nhận diện banner lỗi chung (error banner)', () => {
  const docError = {
    querySelector: (sel) => {
      if (sel.includes('error-banner')) {
        return { textContent: 'Model is currently overloaded. Please try again later.' };
      }
      return null;
    }
  };
  const state = detectUiState(docError, { errorBanner: '.error-banner' });
  assert.equal(state.isErrorBanner, true);
  assert.equal(state.isRateLimited, false);
  assert.equal(state.errorMessage, 'Model is currently overloaded. Please try again later.');
});

test('T807: detectUiState trả về an toàn khi DOM bình thường hoặc tham số rỗng/lỗi', () => {
  // DOM bình thường
  const normalDoc = {
    querySelector: () => null,
    location: { href: 'https://aistudio.google.com/prompts/new_chat' }
  };
  const normalState = detectUiState(normalDoc);
  assert.equal(normalState.isRateLimited, false);
  assert.equal(normalState.isLoggedOut, false);
  assert.equal(normalState.isErrorBanner, false);
  assert.equal(normalState.errorMessage, undefined);

  // Tham số null/undefined
  const nullState = detectUiState(null, null);
  assert.deepEqual(nullState, {
    isRateLimited: false,
    isLoggedOut: false,
    isErrorBanner: false,
    errorMessage: undefined
  });

  // querySelector ném lỗi cú pháp (SyntaxError)
  const throwingDoc = {
    querySelector: () => {
      throw new Error('SyntaxError: invalid selector');
    }
  };
  const safeState = detectUiState(throwingDoc, { rateLimitBanner: '::invalid' });
  assert.equal(safeState.isRateLimited, false);
  assert.equal(safeState.isLoggedOut, false);
});

test('T807: validateResultSchema kiểm tra cấu trúc JSON theo schema yêu cầu', () => {
  const schema = { required: ['ma_hs', 'thue_suat'] };
  const validJson = JSON.stringify({ ma_hs: '0101.21.00', thue_suat: 5 });
  const invalidJson = JSON.stringify({ ma_hs: '0101.21.00' }); // thiếu thue_suat

  const resValid = validateResultSchema(validJson, schema);
  assert.equal(resValid.valid, true);
  assert.deepEqual(resValid.parsedJson, { ma_hs: '0101.21.00', thue_suat: 5 });
  assert.equal(resValid.error, undefined);

  const resInvalid = validateResultSchema(invalidJson, schema);
  assert.equal(resInvalid.valid, false);
  assert.ok(resInvalid.error?.includes('thue_suat'));

  const resNotJson = validateResultSchema('Không phải JSON', schema);
  assert.equal(resNotJson.valid, false);
  assert.ok(resNotJson.error);
});

test('T807: validateResultSchema xử lý chuỗi JSON nằm trong markdown code block', () => {
  const schema = { required: ['ma_hs', 'mo_ta'] };
  const markdownText = 'Dưới đây là kết quả:\n```json\n{\n  "ma_hs": "8413.70.91",\n  "mo_ta": "Bơm nước ly tâm"\n}\n```\nHy vọng đúng yêu cầu.';

  const res = validateResultSchema(markdownText, schema);
  assert.equal(res.valid, true);
  assert.equal(res.parsedJson.ma_hs, '8413.70.91');
  assert.equal(res.parsedJson.mo_ta, 'Bơm nước ly tâm');
});

test('T807: validateResultSchema hoạt động an toàn khi không có schema hoặc schema rỗng', () => {
  const jsonText = JSON.stringify({ ok: true, data: [1, 2, 3] });

  // Schema undefined
  const resNoSchema = validateResultSchema(jsonText);
  assert.equal(resNoSchema.valid, true);
  assert.equal(resNoSchema.parsedJson.ok, true);

  // Schema rỗng
  const resEmptySchema = validateResultSchema(jsonText, {});
  assert.equal(resEmptySchema.valid, true);
  assert.equal(resEmptySchema.parsedJson.ok, true);
});

test('T807: validateResultSchema từ chối payload không phải object JSON hợp lệ', () => {
  const schema = { required: ['id'] };

  // Chuỗi rỗng hoặc null
  assert.equal(validateResultSchema('', schema).valid, false);
  assert.equal(validateResultSchema(null, schema).valid, false);
  assert.equal(validateResultSchema(undefined, schema).valid, false);

  // JSON hợp lệ nhưng là primitive hoặc null
  assert.equal(validateResultSchema('null', schema).valid, false);
  assert.equal(validateResultSchema('123', schema).valid, false);
  assert.equal(validateResultSchema('"chuoi"', schema).valid, false);
  assert.equal(validateResultSchema('true', schema).valid, false);
});

test('T807: validateResultSchema kiểm tra kiểu dữ liệu nếu schema định nghĩa properties type', () => {
  const schema = {
    required: ['ma_hs', 'thue_suat', 'chi_tiet'],
    properties: {
      ma_hs: { type: 'string' },
      thue_suat: { type: 'number' },
      chi_tiet: { type: 'object' }
    }
  };

  const correctTypes = JSON.stringify({
    ma_hs: '0101.21.00',
    thue_suat: 5,
    chi_tiet: { nguon: 'bieu_thue' }
  });
  assert.equal(validateResultSchema(correctTypes, schema).valid, true);

  const wrongType = JSON.stringify({
    ma_hs: '0101.21.00',
    thue_suat: '5%', // sai kiểu: mong đợi number nhưng là string
    chi_tiet: { nguon: 'bieu_thue' }
  });
  const res = validateResultSchema(wrongType, schema);
  assert.equal(res.valid, false);
  assert.ok(res.error?.includes('thue_suat'));
});
