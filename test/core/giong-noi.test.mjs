// test/core/giong-noi.test.mjs — kiểm thử TDD cho core/giong-noi.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  chuanHoaCauDoc,
  bamNoiDung,
  createGiongNoi,
  isTatGiong,
  isBatGiong,
  REPLY_TAT_GIONG,
  REPLY_BAT_GIONG,
} from '../../core/giong-noi.js';

test('chuẩn hoá câu đọc: loại bỏ thẻ định dạng rich text {b}, {orange} và markdown', () => {
  const input = '{b}Mã đề xuất:{/b} {orange}84137090{/orange}\n* Thuế suất: 0%\n# Ghi chú:\n- Bơm nước';
  const out = chuanHoaCauDoc(input);
  assert.equal(out.includes('{b}'), false);
  assert.equal(out.includes('{/b}'), false);
  assert.equal(out.includes('{orange}'), false);
  assert.equal(out.includes('{/orange}'), false);
  assert.equal(out.includes('*'), false);
  assert.equal(out.includes('#'), false);
});

test('chuẩn hoá câu đọc: đọc đúng mã HS theo cụm chữ số rõ ràng', () => {
  const input = 'Mã HS đề xuất là 84137090 cho máy bơm nước';
  const out = chuanHoaCauDoc(input);
  // Mã HS 84137090 được đọc theo nhóm hoặc phiên âm tiếng Việt dễ nghe
  assert.match(out, /(tám bốn một ba|8413)[, ]+(bảy không|70)[, ]+(chín không|90)/i);
});

test('chuẩn hoá câu đọc: đọc đúng tỷ lệ % và số tiền', () => {
  const input = 'Thuế suất VAT là 10%, thuế NK là 0%, tổng lệ phí 1.000.000 đ';
  const out = chuanHoaCauDoc(input);
  assert.match(out, /10 phần trăm|mười phần trăm/);
  assert.match(out, /0 phần trăm|không phần trăm/);
  assert.match(out, /1 triệu đồng|một triệu đồng/);
});

test('chuẩn hoá câu đọc: lược bỏ bảng dữ liệu dài và khống chế độ dài <= 60 giây (~150 từ)', () => {
  const longTable = [
    'Kết luận sơ bộ: Hàng của bạn là máy bơm ly tâm.',
    '| STT | Tên hàng | Mã HS | Thuế NK | Thuế VAT |',
    '|---|---|---|---|---|',
    '| 1 | Bơm ly tâm loại A | 84137090 | 0% | 10% |',
    '| 2 | Bơm ly tâm loại B | 84137091 | 5% | 10% |',
    '| 3 | Bơm ly tâm loại C | 84137092 | 10% | 10% |',
    '| 4 | Bơm ly tâm loại D | 84137093 | 15% | 10% |',
    '| 5 | Bơm ly tâm loại E | 84137094 | 20% | 10% |',
    'Vui lòng cung cấp thêm thông số kỹ thuật nếu cần kiểm tra sâu.',
  ].join('\n');

  const out = chuanHoaCauDoc(longTable);
  assert.equal(out.includes('|'), false);
  assert.match(out, /Kết luận sơ bộ/);
  // Khống chế thời lượng câu đọc: không quá 150 từ
  const words = out.trim().split(/\s+/).filter(Boolean);
  assert.ok(words.length <= 150, `câu đọc có ${words.length} từ, vượt quá 150 từ`);
});

test('băm nội dung: băm sha256 cho cùng nội dung và cấu hình giọng thì cho cùng băm', () => {
  const h1 = bamNoiDung('Xin chào anh chị', 'Aoede');
  const h2 = bamNoiDung('Xin chào anh chị', 'Aoede');
  const h3 = bamNoiDung('Xin chào anh chị', 'Leda');
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
  assert.match(h1, /^[a-f0-9]{64}$/);
});

test('cache âm thanh theo băm: tái sử dụng tệp .aac đã có, không gọi lại API TTS', async () => {
  const testDir = join(tmpdir(), 'test-giong-noi-' + Date.now());
  mkdirSync(testDir, { recursive: true });

  let ttsCalls = 0;
  const fakeFetch = async () => {
    ttsCalls++;
    return {
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                mimeType: 'audio/aac',
                data: Buffer.from('FAKE-AUDIO-DATA').toString('base64'),
              },
            }],
          },
        }],
      }),
    };
  };

  const fakeFfmpeg = async (buf) => buf;

  const gn = createGiongNoi({
    apiKey: 'test-key',
    dataDir: testDir,
    publicBaseUrl: 'https://zalo-bot.uythacnhapkhau.com',
    fetchImpl: fakeFetch,
    ffmpegImpl: fakeFfmpeg,
  });

  try {
    // Lần 1: chưa có cache, gọi TTS
    const res1 = await gn.taoAmThanh('Mã HS đề xuất 84137090');
    assert.equal(res1.cached, false);
    assert.equal(ttsCalls, 1);
    assert.ok(existsSync(res1.filePath));
    assert.match(res1.voiceUrl, /^https:\/\/zalo-bot\.uythacnhapkhau\.com\/am-thanh\/[a-f0-9]+\.aac$/);

    // Lần 2: đã có tệp trong testDir/am-thanh/<băm>.aac -> tái sử dụng
    const res2 = await gn.taoAmThanh('Mã HS đề xuất 84137090');
    assert.equal(res2.cached, true);
    assert.equal(ttsCalls, 1, 'lần 2 không được gọi lại TTS');
    assert.equal(res2.filePath, res1.filePath);
    assert.equal(res2.voiceUrl, res1.voiceUrl);
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('cơ chế fallback khi TTS hoặc ffmpeg lỗi: ném lỗi có kiểm soát để engine bắt và gửi tin chữ', async () => {
  const testDir = join(tmpdir(), 'test-giong-noi-fail-' + Date.now());
  mkdirSync(testDir, { recursive: true });

  const failingFetch = async () => ({
    ok: false,
    status: 503,
    statusText: 'Service Unavailable',
    json: async () => ({ error: { message: 'Gemini TTS unavailable' } }),
  });

  const gn = createGiongNoi({
    apiKey: 'test-key',
    dataDir: testDir,
    fetchImpl: failingFetch,
  });

  try {
    await assert.rejects(
      async () => gn.taoAmThanh('Test fallback khi TTS lỗi'),
      /TTS lỗi|503/i,
    );
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('nhận diện lệnh bật/tắt giọng của khách', () => {
  assert.equal(isTatGiong('tắt giọng'), true);
  assert.equal(isTatGiong('tat giong'), true);
  assert.equal(isTatGiong('tắt giọng nói'), true);
  assert.equal(isTatGiong('tắt âm'), true);
  assert.equal(isTatGiong('xin chào'), false);

  assert.equal(isBatGiong('bật giọng'), true);
  assert.equal(isBatGiong('bat giong'), true);
  assert.equal(isBatGiong('bật lại giọng'), true);
  assert.equal(isBatGiong('bật âm'), true);
  assert.equal(isBatGiong('xin chào'), false);

  assert.match(REPLY_TAT_GIONG, /tắt.*giọng/i);
  assert.match(REPLY_BAT_GIONG, /bật.*giọng/i);
});
