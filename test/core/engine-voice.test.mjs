// test/core/engine-voice.test.mjs — kiểm thử tích hợp trả lời tin thoại qua engine (issue #125)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createEngine } from '../../core/engine.js';
import { createRegistry } from '../../core/registry.js';
import { createGiongNoi } from '../../core/giong-noi.js';
import { fakeChannel, fakeClock } from '../helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z'; // 10:00 VN

/** Dựng gói giả lập trả về câu trả lời có mã HS và thuế */
function fakePack(id = 'hs-test', replyText = 'Mã HS đề xuất: 84137090. Thuế suất NK: 0%, VAT: 10%.') {
  return {
    id,
    priority: 10,
    match: () => true,
    handle: async () => ({
      replies: [{ text: replyText }],
      evidence: ['84137090', '0%', '10%'],
    }),
  };
}

/** Tạo buffer AAC ADTS giả hợp lệ (bắt đầu bằng syncword 0xFF 0xF1) */
function makeFakeAacBuffer() {
  const buf = Buffer.alloc(100);
  buf[0] = 0xff;
  buf[1] = 0xf1; // ADTS syncword (12 bits 0xFFF) + MPEG-4 AAC
  buf[2] = 0x50; // profile, sample rate
  buf[3] = 0x80;
  return buf;
}

function setupEngine({
  voiceReplies = 'summary',
  capVoiceDay = 50,
  ttsFails = false,
  ffmpegFails = false,
  replyText,
  dataDir,
} = {}) {
  const testDir = dataDir || join(tmpdir(), 'test-engine-voice-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));
  mkdirSync(testDir, { recursive: true });

  const store = openStore();
  const clock = fakeClock(START);
  const ch = fakeChannel();
  const pack = fakePack('hs-test', replyText);
  const registry = createRegistry([pack]);

  const gate = createGate({
    store,
    channel: ch,
    now: clock.now,
    rules: { capVoiceDay, capChatDay: 20 },
  });

  const fakeFetch = async () => {
    if (ttsFails) {
      return {
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ error: { message: 'TTS error' } }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                mimeType: 'audio/aac',
                data: Buffer.from('RAW-AUDIO').toString('base64'),
              },
            }],
          },
        }],
      }),
    };
  };

  const fakeFfmpeg = async (buf) => {
    if (ffmpegFails) throw new Error('ffmpeg execution failed');
    return makeFakeAacBuffer();
  };

  const giongNoi = createGiongNoi({
    apiKey: 'test-key',
    dataDir: testDir,
    publicBaseUrl: 'https://zalo-bot.uythacnhapkhau.com',
    fetchImpl: fakeFetch,
    ffmpegImpl: fakeFfmpeg,
  });

  const config = {
    voiceReplies,
    capVoiceDay,
    dataDir: testDir,
    publicBaseUrl: 'https://zalo-bot.uythacnhapkhau.com',
  };

  const engine = createEngine({
    config,
    store,
    channel: ch,
    registry,
    gate,
    giongNoi,
    now: clock.now,
    log: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
  });

  const update = (text, opts = {}) => ({
    updateKey: opts.updateKey || `up-${Date.now()}-${Math.random()}`,
    chatId: opts.chatId || 'c1',
    userId: opts.userId || 'c1',
    userName: 'Khách',
    chatType: 'USER',
    event: opts.event || 'message.text.received',
    text,
    ...opts,
  });

  return { engine, store, ch, clock, testDir, update };
}

test('QA chạy thật: một câu hỏi 1-1 nhận được 1 tin chữ + 1 tệp tin thoại .aac hợp lệ', async () => {
  const { engine, ch, store, testDir, update } = setupEngine();
  try {
    const res = await engine.process(update('Tra cứu mã bơm nước'));
    assert.equal(res.handled, 'hs-test');

    // 1 tin chữ
    assert.equal(ch.sent.length, 1);
    assert.match(ch.sent[0].text, /84137090/);

    // 1 tin thoại qua sendVoice
    assert.equal(ch.voices.length, 1);
    assert.match(ch.voices[0].voiceUrl, /^https:\/\/zalo-bot\.uythacnhapkhau\.com\/am-thanh\/[a-f0-9]+\.aac$/);

    // Kiểm tra tệp .aac hợp lệ trên đĩa
    const urlParts = ch.voices[0].voiceUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];
    const filePath = join(testDir, 'am-thanh', fileName);
    assert.ok(existsSync(filePath));

    // Đọc tệp và kiểm tra định dạng ADTS AAC (syncword 0xFFF)
    const fileBytes = readFileSync(filePath);
    assert.ok(fileBytes.length > 0);
    assert.equal(fileBytes[0], 0xff);
    assert.equal(fileBytes[1] & 0xf0, 0xf0); // 12-bit syncword

    // Nếu môi trường có ffprobe (như trên máy bot thật), kiểm chứng đọc được thời lượng ≤ 60 giây
    try {
      const { spawnSync } = await import('node:child_process');
      const probe = spawnSync('ffprobe', [
        '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
      ]);
      if (probe.status === 0) {
        const dur = parseFloat(probe.stdout.toString().trim());
        if (!Number.isNaN(dur)) {
          assert.ok(dur <= 60, `thời lượng tin thoại ${dur}s vượt quá 60s`);
        }
      }
    } catch {
      // ffprobe không có sẵn trong môi trường container
    }

    // Kiểm tra lưu trong bảng messages
    const msgs = store.messages.recent('c1', 10);
    assert.equal(msgs.length, 3); // 1 tin khách vào, 1 tin chữ bot, 1 tin thoại bot
    const voiceMsg = msgs.find((m) => m.text.startsWith('[thoại]'));
    assert.ok(voiceMsg);
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('điều khiển bật/tắt giọng theo phòng: tắt giọng -> chỉ gửi chữ; bật giọng -> gửi chữ + thoại', async () => {
  const { engine, ch, store, clock, testDir, update } = setupEngine();
  try {
    // 1. Khách gõ "tắt giọng"
    const rTat = await engine.process(update('tắt giọng', { updateKey: 'u-tat' }));
    assert.equal(rTat.handled, 'tat-giong');
    assert.equal(store.meta.get('voice:c1'), 'off');
    assert.equal(ch.sent.length, 1);
    assert.match(ch.sent[0].text, /đã tắt/i);
    assert.equal(ch.voices.length, 0);

    // 2. Khách hỏi tiếp sau khi tắt giọng: CHỈ nhận 1 tin chữ, 0 tin thoại
    ch.sent.length = 0;
    ch.voices.length = 0;
    clock.advance('70s');
    await engine.process(update('Hỏi mã máy bơm nước', { updateKey: 'u-hoi-1' }));
    assert.equal(ch.sent.length, 1);
    assert.equal(ch.voices.length, 0, 'phòng đã tắt giọng thì không được gửi tin thoại');

    // 3. Khách gõ "bật giọng"
    ch.sent.length = 0;
    clock.advance('70s');
    const rBat = await engine.process(update('bật giọng', { updateKey: 'u-bat' }));
    assert.equal(rBat.handled, 'bat-giong');
    assert.equal(store.meta.get('voice:c1'), 'on');
    assert.equal(ch.sent.length, 1);
    assert.match(ch.sent[0].text, /đã bật lại/i);

    // 4. Khách hỏi tiếp sau khi bật giọng: nhận lại 1 tin chữ + 1 tin thoại
    ch.sent.length = 0;
    ch.voices.length = 0;
    clock.advance('70s');
    await engine.process(update('Hỏi lại mã máy bơm nước', { updateKey: 'u-hoi-2' }));
    assert.equal(ch.sent.length, 1);
    assert.equal(ch.voices.length, 1, 'phòng bật lại giọng thì nhận được tin thoại');
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('khách gửi tin thoại thì ưu tiên trả lời thoại', async () => {
  const { engine, ch, testDir, update } = setupEngine({ voiceReplies: 'summary' });
  try {
    const res = await engine.process(update('Tra mã máy bơm', {
      event: 'message.voice.received',
      voiceUrl: 'https://zalo-bot.uythacnhapkhau.com/am-thanh/incoming.aac',
      isVoice: true,
    }));
    assert.equal(res.handled, 'hs-test');
    assert.equal(ch.sent.length, 1);
    assert.equal(ch.voices.length, 1);
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('cờ VOICE_REPLIES=off thì không gửi tin thoại', async () => {
  const { engine, ch, testDir, update } = setupEngine({ voiceReplies: 'off' });
  try {
    await engine.process(update('Tra mã hàng hoá'));
    assert.equal(ch.sent.length, 1);
    assert.equal(ch.voices.length, 0);
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('cơ chế fallback khi TTS lỗi: vẫn gửi chữ bình thường, ghi audit, không sập bot', async () => {
  const { engine, ch, store, testDir, update } = setupEngine({ ttsFails: true });
  try {
    const res = await engine.process(update('Tra cứu khi TTS bị lỗi 503'));
    assert.equal(res.handled, 'hs-test');

    // Vẫn gửi tin chữ bình thường!
    assert.equal(ch.sent.length, 1);
    assert.match(ch.sent[0].text, /84137090/);

    // Không có tin thoại
    assert.equal(ch.voices.length, 0);

    // Có bản ghi audit error ghi nhận sự cố thoại
    const errors = store.audit.byChat('c1', 10).filter((a) => a.type === 'error' && a.data?.stage === 'voice');
    assert.equal(errors.length, 1);
    assert.match(errors[0].data.message, /TTS|503/i);
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('cơ chế fallback khi ffmpeg lỗi: vẫn gửi chữ bình thường, ghi audit', async () => {
  const { engine, ch, store, testDir, update } = setupEngine({ ffmpegFails: true });
  try {
    const res = await engine.process(update('Tra cứu khi ffmpeg hỏng'));
    assert.equal(res.handled, 'hs-test');
    assert.equal(ch.sent.length, 1);
    assert.equal(ch.voices.length, 0);

    const errors = store.audit.byChat('c1', 10).filter((a) => a.type === 'error' && a.data?.stage === 'voice');
    assert.equal(errors.length, 1);
    assert.match(errors[0].data.message, /ffmpeg/i);
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('áp trần tin thoại capVoiceDay: khi vượt trần ngày thì chỉ gửi tin chữ', async () => {
  const { engine, ch, clock, testDir, update } = setupEngine({ capVoiceDay: 1 });
  try {
    // Tin 1: trong hạn mức (được 1 tin thoại)
    await engine.process(update('Lần tra cứu thứ 1', { updateKey: 'u-1' }));
    assert.equal(ch.sent.length, 1);
    assert.equal(ch.voices.length, 1);

    // Tin 2: vượt trần (chỉ gửi chữ, tin thoại bị hoãn cap:voice)
    ch.sent.length = 0;
    ch.voices.length = 0;
    clock.advance('70s');
    await engine.process(update('Lần tra cứu thứ 2', { updateKey: 'u-2' }));
    assert.equal(ch.sent.length, 1);
    assert.equal(ch.voices.length, 0, 'vượt trần voice thì không gửi thêm voice');
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('phòng ở trạng thái human: bot im hoàn toàn (không gửi chữ, không gửi thoại)', async () => {
  const { engine, ch, store, testDir, update } = setupEngine();
  try {
    // Đặt phòng sang trạng thái human
    store.convs.setState('c1', 'c1', 'human', 'nhan-vien', 'khach xin nguoi', START);

    const res = await engine.process(update('Câu hỏi khi phòng human'));
    assert.equal(res.skipped, 'chat-human');
    assert.equal(ch.sent.length, 0);
    assert.equal(ch.voices.length, 0);
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});
