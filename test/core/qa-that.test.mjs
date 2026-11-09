// test/core/qa-that.test.mjs — Kiểm thử tự động bộ chạy QA (scripts/qa-that.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createQaChannel,
  evaluateStep,
  runSingleScenario,
  generateReportMarkdown,
  loadDotEnv,
  runQa,
} from '../../scripts/qa-that.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..', '..');

test('QA Recorder Channel: Zalo API calls luôn bằng 0 và ghi nhận tin nhắn ra', async () => {
  const channel = createQaChannel();
  assert.equal(channel.zaloApiCallCount, 0, 'Kênh giả ghi lại phải có đúng 0 lượt gọi API Zalo');

  await channel.sendText('c1', 'Tin test 1');
  await channel.sendText('c1', 'Tin test 2');
  await channel.typing('c1');

  assert.equal(channel.sent.length, 2);
  assert.equal(channel.sent[0].text, 'Tin test 1');
  assert.equal(channel.typed.length, 1);
  assert.equal(channel.zaloApiCallCount, 0, 'Sau khi gửi tin vẫn phải là 0 lượt gọi API Zalo');
});

test('evaluateStep: kiểm tra chính xác các điều kiện ĐẠT/TRƯỢT', () => {
  // Ca botIm = true
  const imDat = evaluateStep({ kyVong: { botIm: true } }, [], {});
  assert.equal(imDat.ok, true);

  const imTruot = evaluateStep({ kyVong: { botIm: true } }, [{ text: 'bot noi' }], {});
  assert.equal(imTruot.ok, false);
  assert.match(imTruot.lyDo, /Kỳ vọng bot im lặng/);

  // Ca phaiCoPhanHoi
  const coPhanHoiTruot = evaluateStep({ kyVong: { phaiCoPhanHoi: true } }, [], {});
  assert.equal(coPhanHoiTruot.ok, false);
  assert.match(coPhanHoiTruot.lyDo, /không gửi bất kỳ tin nhắn/);

  // Ca tagDungNguoi
  const tagTruot = evaluateStep({ kyVong: { phaiCoPhanHoi: true, tagDungNguoi: '@An' } }, [{ text: '@Bình\nchào' }], {});
  assert.equal(tagTruot.ok, false);
  assert.match(tagTruot.lyDo, /không bắt đầu bằng tiền tố "@An"/);

  const tagDat = evaluateStep({ kyVong: { phaiCoPhanHoi: true, tagDungNguoi: '@An' } }, [{ text: '@An\nchào bạn' }], {});
  assert.equal(tagDat.ok, true);

  // Ca phaiChua và khongChua
  const chuaDat = evaluateStep({ kyVong: { phaiChua: ['8413|bơm'], khongChua: ['RESOURCE_EXHAUSTED'] } }, [{ text: 'Mã 84137090 máy bơm' }], {});
  assert.equal(chuaDat.ok, true);

  const chuaTruot = evaluateStep({ kyVong: { phaiChua: ['8413'] } }, [{ text: 'Mã 8504' }], {});
  assert.equal(chuaTruot.ok, false);
  assert.match(chuaTruot.lyDo, /không khớp mẫu bắt buộc/);

  const camTruot = evaluateStep({ kyVong: { khongChua: ['RESOURCE_EXHAUSTED'] } }, [{ text: 'Lỗi RESOURCE_EXHAUSTED từ model' }], {});
  assert.equal(camTruot.ok, false);
  assert.match(camTruot.lyDo, /chứa mẫu bị cấm/);
});

test('runSingleScenario: G4 1-1 tra cứu mã HS và ngữ cảnh nối tiếp đạt', async () => {
  const g4Path = join(ROOT_DIR, 'eval', 'qa-that', 'g4-mot-mot.json');
  assert.ok(existsSync(g4Path), 'Tệp eval/qa-that/g4-mot-mot.json phải tồn tại');
  const scenario = JSON.parse(readFileSync(g4Path, 'utf8'));

  const res = await runSingleScenario(scenario, { isMock: true });
  assert.equal(res.ok, true, `G4 phải đạt nhưng trượt vì: ${res.lyDo}`);
  assert.equal(res.zaloApiCalls, 0);
  assert.ok(res.toolCallsCount > 0, 'G4 phải có ít nhất 1 lần gọi công cụ');
  assert.equal(res.stepResults.length, 2);
  assert.equal(res.stepResults[0].ok, true);
  assert.equal(res.stepResults[1].ok, true);
});

test('runSingleScenario: G3 Ảnh đọc thông số tem nhãn đạt, không lộ tiếng Anh thô', async () => {
  const g3Path = join(ROOT_DIR, 'eval', 'qa-that', 'g3-anh.json');
  assert.ok(existsSync(g3Path), 'Tệp eval/qa-that/g3-anh.json phải tồn tại');
  const scenario = JSON.parse(readFileSync(g3Path, 'utf8'));

  const res = await runSingleScenario(scenario, { isMock: true });
  assert.equal(res.ok, true, `G3 phải đạt nhưng trượt vì: ${res.lyDo}`);
  assert.equal(res.zaloApiCalls, 0);
  assert.equal(res.stepResults.length, 1);
  assert.equal(res.stepResults[0].ok, true);
  assert.match(res.stepResults[0].sent.join(' '), /Thông số/);
});

test('runSingleScenario: G2 Nhóm đạt 100% (4/4 bước), bot im khi không nhắc tên và tách mạch riêng', async () => {
  const g2Path = join(ROOT_DIR, 'eval', 'qa-that', 'g2-nhom.json');
  assert.ok(existsSync(g2Path), 'Tệp eval/qa-that/g2-nhom.json phải tồn tại');
  const scenario = JSON.parse(readFileSync(g2Path, 'utf8'));

  const res = await runSingleScenario(scenario, { isMock: true });
  assert.equal(res.ok, true, `G2 phải đạt toàn bộ 4/4 bước nhưng trượt vì: ${res.lyDo}`);
  assert.equal(res.zaloApiCalls, 0);
  assert.equal(res.stepResults.length, 4);
  assert.equal(res.stepResults[0].ok, true, 'Bước 1: bot phải im khi không nhắc tên');
  assert.equal(res.stepResults[0].sent.length, 0);
  assert.equal(res.stepResults[1].ok, true, 'Bước 2: An gọi bot');
  assert.match(res.stepResults[1].sent[0], /^@An\n/);
  assert.equal(res.stepResults[2].ok, true, 'Bước 3: Bình hỏi xen kẽ');
  assert.match(res.stepResults[2].sent[0], /^@Bình\n/);
  assert.equal(res.stepResults[3].ok, true, 'Bước 4: An hỏi tiếp mạch riêng');
  assert.match(res.stepResults[3].sent[0], /^@An\n/);
  assert.match(res.stepResults[3].sent[0], /8413|bơm/i);
});

test('runSingleScenario: Kịch bản lỗi Cổng phản hồi câu báo lỗi chuẩn, không bịa mã', async () => {
  const errPath = join(ROOT_DIR, 'eval', 'qa-that', 'loi-cong-llm.json');
  assert.ok(existsSync(errPath), 'Tệp eval/qa-that/loi-cong-llm.json phải tồn tại');
  const scenario = JSON.parse(readFileSync(errPath, 'utf8'));

  const res = await runSingleScenario(scenario, { isMock: true });
  assert.equal(res.ok, true);
  assert.equal(res.zaloApiCalls, 0);
  assert.equal(res.stepResults.length, 1);
  assert.match(res.stepResults[0].sent[0], /Cổng tra cứu OZ đang lỗi tạm thời/);
});

test('generateReportMarkdown: sinh báo cáo đầy đủ, không lộ bí mật, có nguyên văn câu bot gửi', () => {
  const dummyResults = [
    {
      id: 'g4-mot-mot',
      dich: 'G4',
      ten: 'G4 · 1-1',
      ok: true,
      lyDo: '',
      toolCallsCount: 2,
      toolCalls: [{ name: 'phan_loai_hs' }, { name: 'tra_thue' }],
      zaloApiCalls: 0,
      stepResults: [
        {
          stepIndex: 1,
          mieuTa: 'Hỏi mã',
          input: 'máy bơm',
          sent: ['Mã đề xuất 84137090'],
          ok: true,
          lyDo: '',
        },
      ],
    },
  ];

  const md = generateReportMarkdown({
    results: dummyResults,
    startedAt: new Date('2026-11-09T03:00:00.000Z'),
    isMock: true,
  });

  assert.match(md, /# Báo cáo QA chạy thật/);
  assert.match(md, /G4 · 1-1/);
  assert.match(md, /0 lượt gọi API Zalo/);
  assert.match(md, /Mã đề xuất 84137090/);
  // Không được chứa chuỗi lộ bí mật dài
  assert.doesNotMatch(md, /sk-[a-zA-Z0-9_-]{16,}/);
});
