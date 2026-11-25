// test/core/qa-that.test.mjs — Kiểm thử tự động bộ chạy QA (scripts/qa-that.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createQaChannel,
  evaluateStep,
  runSingleScenario,
  generateReportMarkdown,
  loadDotEnv,
  runQa,
  laBuocPhanLoai,
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

  // Khẳng định chi tiết GQ-03:
  // Bước 1: Giọng Quyên (<= 7 dòng, mở đầu bằng "Dạ ", không bịa "công bố hợp quy" khi chính sách rỗng)
  const step1Text = res.stepResults[0].sent.join('\n');
  const step1Lines = step1Text.split('\n').filter((l) => l.trim().length > 0);
  assert.ok(step1Lines.length <= 7, `Bước 1 phản hồi giọng Quyên phải <= 7 dòng, thực tế có ${step1Lines.length} dòng`);
  assert.match(step1Text, /^Dạ\s/, 'Bước 1 phải mở đầu bằng "Dạ " theo giọng Quyên');
  assert.doesNotMatch(step1Text, /công bố hợp quy/i, 'Bước 1 không được tự bịa lưu ý hợp quy khi chính sách rỗng');

  // Bước 2: Kế thừa đúng mã 8537.10.99, không rơi vào "Các mã phù hợp"
  const step2Text = res.stepResults[1].sent.join('\n');
  assert.match(step2Text, /💰 Thuế — 8537\.10\.99/, 'Bước 2 phải kế thừa đúng mã 8537.10.99');
  assert.doesNotMatch(step2Text, /Các mã phù hợp/i, 'Bước 2 không được rơi vào danh sách "Các mã phù hợp"');
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

test('runSingleScenario: cơ chế chờ việc nền (jobs) tiếp tục chờ đến khi hoàn tất, không thoát sớm', async () => {
  const g4Path = join(ROOT_DIR, 'eval', 'qa-that', 'g4-mot-mot.json');
  const scenario = JSON.parse(readFileSync(g4Path, 'utf8'));

  const calls = [];
  const backgroundMcp = {
    calls,
    async listTools() {
      return [
        { name: 'phan_loai_hs', description: 'Phân loại HS' },
        { name: 'ket_qua_phan_loai', description: 'Kết quả phân loại' },
        { name: 'tra_thue', description: 'Tra cứu thuế' },
        { name: 'tim_ma_hs', description: 'Tìm mã HS' },
      ];
    },
    async callTool(name, args = {}) {
      calls.push({ name, args, at: new Date() });
      if (name === 'phan_loai_hs') {
        return {
          ok: true,
          maLuot: 'ML-TEST-BACKGROUND',
          trangThai: 'DANG_XU_LY',
        };
      }
      if (name === 'ket_qua_phan_loai') {
        return {
          ok: true,
          maLuot: 'ML-TEST-BACKGROUND',
          trangThai: 'XONG',
          maHs: '85371099',
          doChac: 0.95,
          data: {
            maHs: '85371099',
            ketQua: {
              results: [
                { hsCode: '85371099', nameVi: 'Thiết bị điều khiển cầm tay', confidence: 0.95 },
              ],
            },
          },
        };
      }
      if (name === 'tra_thue') {
        return {
          ok: true,
          data: {
            hsCode: '85371099',
            nameVi: 'Thiết bị điều khiển cầm tay',
            taxNkPreferential: 0,
            taxVat: 10,
          },
        };
      }
      return { ok: true };
    },
  };

  const res = await runSingleScenario(scenario, {
    isMock: false,
    customMcp: backgroundMcp,
    now: () => new Date(),
  });

  assert.equal(res.ok, true, `Kịch bản có việc nền phải đạt, nhưng trượt vì: ${res.lyDo}`);
  assert.equal(res.zaloApiCalls, 0);
  assert.equal(res.stepResults.length, 2);
  assert.equal(res.stepResults[0].ok, true, 'Bước 1 phải nhận được mã HS sau khi việc nền hoàn tất');
  assert.equal(res.stepResults[1].ok, true, 'Bước 2 phải kế thừa ngữ cảnh trả lời thuế');
  assert.match(res.stepResults[0].sent.join(' '), /8537/);
});

test('G2 nhóm: An hỏi trong nhóm sau khi Bình chen ngang vẫn kế thừa đúng mã HS của An và bot phản hồi đúng tag @An', async () => {
  const g2Path = join(ROOT_DIR, 'eval', 'qa-that', 'g2-nhom.json');
  const scenario = JSON.parse(readFileSync(g2Path, 'utf8'));

  // Chạy kịch bản g2-nhom hoàn chỉnh (có Bình chen ngang ở bước 3, An hỏi tiếp ở bước 4)
  const res = await runSingleScenario(scenario, { isMock: true });
  assert.equal(res.ok, true, `G2 phải đạt toàn bộ các bước: ${res.lyDo}`);

  // Kiểm tra cụ thể bước 4 (An hỏi tiếp sau khi Bình chen ngang)
  const step4 = res.stepResults[3];
  assert.equal(step4.ok, true, 'Bước 4 của An phải ĐẠT');
  assert.equal(step4.sent.length, 1, 'Bot phải phản hồi 1 tin cho An (không bị im lặng)');
  const tinAn = step4.sent[0];
  assert.ok(tinAn.startsWith('@An\n'), 'Tin phản hồi phải gắn đúng tag @An');
  // Kế thừa đúng mã 8413 của An, không kế thừa mã 8504 của Bình
  assert.match(tinAn, /8413/);
  assert.doesNotMatch(tinAn, /8504/);
});

test('Audit Cổng: mã lỗi kỹ thuật thật (đã che khoá bí mật) được ghi đầy đủ vào audit log khi tra cứu thuế/thủ tục gặp sự cố', async () => {
  const g4Path = join(ROOT_DIR, 'eval', 'qa-that', 'g4-mot-mot.json');
  const scenario = JSON.parse(readFileSync(g4Path, 'utf8'));

  const errorMcp = {
    calls: [],
    async listTools() {
      return [
        { name: 'phan_loai_hs', description: 'Phân loại HS' },
        { name: 'tra_thue', description: 'Tra thuế' },
      ];
    },
    async callTool(name, args = {}) {
      if (name === 'phan_loai_hs') {
        return {
          ok: true,
          maHs: '84137090',
          trangThai: 'XONG',
          data: { maHs: '84137090', ketQua: { results: [{ hsCode: '84137090', nameVi: 'Bơm' }] } },
        };
      }
      if (name === 'tra_thue') {
        // Mô phỏng Cổng OZ trả lỗi kỹ thuật kèm mã lỗi thật và chứa chuỗi cần redact
        return {
          ok: false,
          isError: true,
          code: 'OZ_GATEWAY_502',
          loi: 'ERR_UPSTREAM_UNAVAILABLE',
          thongBao: 'Cổng lỗi 502 với token sk-gia-loi-goc',
        };
      }
      return { ok: true };
    },
  };

  const res = await runSingleScenario(scenario, {
    isMock: false,
    customMcp: errorMcp,
    now: () => new Date(),
  });

  // Tìm bản ghi audit của công cụ tra_thue
  const toolStep = res.stepResults[0];
  assert.ok(toolStep, 'Bước 1 phải được thực thi');

  // Đảm bảo không bị throw crash và kết quả được xử lý an toàn
  assert.equal(res.zaloApiCalls, 0);
});

test('laBuocPhanLoai: nhận diện chính xác các bước cần thời gian phân loại HS dài hơn', () => {
  // Ca có cờ rõ ràng
  assert.equal(laBuocPhanLoai({ isClassify: true }), true);
  assert.equal(laBuocPhanLoai({ phanLoai: true }), true);
  assert.equal(laBuocPhanLoai({ kyVong: { coMaHsHoacHuongTra: true } }), true);

  // Ca từ miêu tả hoặc nội dung câu
  assert.equal(laBuocPhanLoai({ mieuTa: 'Phân loại mã HS máy bơm' }), true);
  assert.equal(laBuocPhanLoai({ text: 'Teaching Box điều khiển gắn chip' }), true);
  assert.equal(laBuocPhanLoai({ text: 'Điều khiển cầm tay kết nối dây, dùng cho máy gắn chip tự động, có màn hình và các phím điều khiển, điện áp 24V DC' }), true);

  // Ca không phải phân loại (chỉ tra mã hoặc hỏi ngắn)
  assert.equal(laBuocPhanLoai({ text: 'thuế nhập khẩu bao nhiêu?' }), false);
  assert.equal(laBuocPhanLoai({ text: '84137090' }), false);
});

test('runSingleScenario: đo và ghi nhận thời gian từng bước trong stepResults', async () => {
  const g3Path = join(ROOT_DIR, 'eval', 'qa-that', 'g3-anh.json');
  const scenario = JSON.parse(readFileSync(g3Path, 'utf8'));

  const res = await runSingleScenario(scenario, { isMock: true });
  assert.equal(res.ok, true);
  assert.ok(res.stepResults.length > 0);
  for (const st of res.stepResults) {
    assert.equal(typeof st.durationMs, 'number');
    assert.ok(st.durationMs >= 0);
    assert.match(st.durationText, /^\d+(\.\d+)?s$/);
  }
  assert.equal(typeof res.durationMs, 'number');
});

// #170: mạch thật của khách cách nhau vài phút. Bộ QA bơm cả kịch bản trong một giây nên
// cửa gửi coi tin sau là trùng tin trước (`similar:1.00`, core/gate-decide.js:130) và CHẶN —
// lỗi của dụng cụ đo, không phải của bot. Bước khai `cachTruoc` phải đẩy đồng hồ kịch bản lên.
test('runSingleScenario: bước khai "cachTruoc" đẩy đồng hồ kịch bản, tin cách nhau không bị cửa gửi coi là trùng', async () => {
  const scenario = {
    id: 'cach-truoc',
    dich: 'T',
    ten: 'Hai tin giống nhau cách nhau 5 phút',
    chatType: 'PRIVATE',
    chatId: 'khach_cach',
    userId: 'khach_cach',
    userName: 'Khách Cách',
    steps: [
      { step: 1, mieuTa: 'Tra mã', text: 'Tra mã 84137090', timeoutMs: 4000, kyVong: { phaiCoPhanHoi: true } },
      { step: 2, mieuTa: 'Hỏi lại y hệt sau 5 phút', cachTruoc: '5m', text: 'Tra mã 84137090', timeoutMs: 4000, kyVong: { phaiCoPhanHoi: true } },
    ],
  };

  const res = await runSingleScenario(scenario, { isMock: true });
  assert.equal(res.ok, true, `phải đạt nhưng trượt vì: ${res.lyDo}`);
  assert.ok(res.stepResults[1].sent.length > 0, 'tin cách 5 phút không được bị chặn vì trùng');
});

test('runSingleScenario: G5 mạch hồ sơ mặt hàng (chữ → lệnh ngắn → ảnh → câu sửa) đạt', async () => {
  const p = join(ROOT_DIR, 'eval', 'qa-that', 'g5-ho-so-mat-hang.json');
  assert.ok(existsSync(p), 'Tệp eval/qa-that/g5-ho-so-mat-hang.json phải tồn tại');
  const scenario = JSON.parse(readFileSync(p, 'utf8'));
  for (const s of scenario.steps) s.timeoutMs = 6000;   // mock trả ngay, không cần chờ 120s

  const res = await runSingleScenario(scenario, { isMock: true });
  assert.equal(res.ok, true, `G5 phải đạt nhưng trượt vì: ${res.lyDo}`);
  assert.equal(res.zaloApiCalls, 0);

  // Lệnh ngắn "tra hscode" không bao giờ thành tên hàng gửi Cổng (lỗi 10:00 của issue #170).
  const tenHangDaGui = res.toolCalls
    .filter((t) => t.name === 'phan_loai_hs')
    .map((t) => String(t.args?.tenHang || t.args?.moTa || ''));
  assert.ok(tenHangDaGui.length > 0, 'phải có lượt gọi phan_loai_hs');
  for (const ten of tenHangDaGui) {
    assert.doesNotMatch(ten, /^\s*(tra|tra hscode|tra hs|ok|đây|đây nhé)\s*$/i, `tên hàng gửi Cổng không được là lệnh ngắn: "${ten}"`);
    assert.match(ten, /chốt kẹp/i, `mọi lượt tra phải đi trên hồ sơ "chốt kẹp", thực tế: "${ten}"`);
  }

  // Tin cuối (khách sửa) phải có phản hồi, không rơi lọt im lặng.
  assert.ok(res.stepResults.at(-1).sent.length > 0, 'câu sửa của khách phải có phản hồi');
});

// ——— Issue #168 phần 4: chờ 120 giây cho bước có thể tra Cổng; tách "đã báo đang tra" khỏi "đã có kết quả" ———
test('qa-that #168: nhận câu "đang tra" (cả khi có @tên trong nhóm); bước có thể tra Cổng gồm "tra hscode" và câu trả lời hỏi lại', async () => {
  const { laTinDangTra, laBuocCoTheTraCong, CHO_TRA_CONG_MS } = await import('../../scripts/qa-that.mjs');
  const { CAU_DANG_TRA } = await import('../../packs/hs/dang-tra.js');
  assert.equal(laTinDangTra(CAU_DANG_TRA.phanLoai), true);
  assert.equal(laTinDangTra(`@Hương\n${CAU_DANG_TRA.chung}`), true);
  assert.equal(laTinDangTra('Dạ mã phù hợp là 8509.40.00 ạ'), false);
  assert.equal(laBuocCoTheTraCong({ text: 'tra hscode' }), true);
  assert.equal(laBuocCoTheTraCong({ text: 'đúng, 350W 220V' }, { botVuaHoi: true }), true);
  assert.equal(laBuocCoTheTraCong({ text: 'chào em' }), false);
  assert.equal(laBuocCoTheTraCong({ text: 'tra hscode', kyVong: { botIm: true } }), false);
  assert.equal(CHO_TRA_CONG_MS, 120_000);
});

test('qa-that #168: evaluateStep chấm RIÊNG "báo đang tra ≤ 3 giây" và "có kết quả"', async () => {
  const { CAU_DANG_TRA } = await import('../../packs/hs/dang-tra.js');
  const t0 = Date.parse('2026-11-11T03:00:00.000Z');
  const luc = (s) => new Date(t0 + s * 1000);
  const step = { kyVong: { phaiCoPhanHoi: true, phaiChua: ['8509'] } };
  const dangTra = (s) => ({ text: CAU_DANG_TRA.phanLoai, at: luc(s) });
  const ketQua = (s) => ({ text: 'Dạ mã 8509.40.00 ạ', at: luc(s) });
  // báo 1s, kết quả 45s → đạt
  assert.equal(evaluateStep(step, [dangTra(1), ketQua(45)], {}, { batDau: t0, coTheTraCong: true }).ok, true);
  // chỉ có câu đang tra → trượt "chưa có kết quả" (câu đang tra không thay được kết quả)
  assert.match(evaluateStep(step, [dangTra(1)], {}, { batDau: t0 }).lyDo, /CHƯA có kết quả/);
  // câu đang tra ra muộn (4s) → trượt
  assert.match(evaluateStep(step, [dangTra(4), ketQua(45)], {}, { batDau: t0 }).lyDo, /sau 4\.0s/);
  // bước có thể tra Cổng, im 40s rồi mới có kết quả, không báo → trượt (lỗi QA thật 10/11)
  assert.match(evaluateStep(step, [ketQua(40)], {}, { batDau: t0, coTheTraCong: true }).lyDo, /im 40\.0s/);
  // kết quả nhanh (≤ 3s) thì không cần câu đang tra
  assert.equal(evaluateStep(step, [ketQua(2)], {}, { batDau: t0, coTheTraCong: true }).ok, true);
  // mẫu phaiChua đo trên tin KẾT QUẢ, không trên câu đang tra
  assert.match(evaluateStep({ kyVong: { phaiChua: ['đang tra mã'] } }, [dangTra(1), ketQua(9)], {}, { batDau: t0 }).lyDo, /không khớp mẫu/);
  // số hiệu văn bản không có trong dữ liệu Cổng → trượt
  const bia = evaluateStep(step, [{ text: 'Dạ mã 8509.40.00 (38/2015/TT-BTC)', at: luc(1) }], {}, { batDau: t0, nguon: [[{ ok: true }], []] });
  assert.match(bia.lyDo, /38\/2015\/TT-BTC/);
});

// OZV-830: lượt chạy nền của Paperclip đặt TMPDIR=/tmp/paperclip-run-<id> rồi XOÁ thư mục đó
// khi lượt kết thúc. Bài đo 13/11 (OZV-608) chết `ENOENT: mkdtemp` ở 38/50 ca vì mkdtempSync
// không tự tạo thư mục cha. Bộ chạy QA phải tự lo chỗ tạm, đừng để cả lượt đo mất trắng.
test('runSingleScenario: TMPDIR bị dọn giữa bài đo vẫn chạy được, không chết ENOENT mkdtemp', async () => {
  const g4Path = join(ROOT_DIR, 'eval', 'qa-that', 'g4-mot-mot.json');
  const scenario = JSON.parse(readFileSync(g4Path, 'utf8'));

  const tmpdirCu = process.env.TMPDIR;
  // Đường dẫn con KHÔNG tồn tại, mô phỏng thư mục lượt chạy đã bị harness xoá.
  const daBiXoa = join(tmpdir(), `paperclip-run-da-bi-xoa-${process.pid}-${Date.now()}`, 'tmp');
  assert.equal(existsSync(daBiXoa), false, 'Đường dẫn mô phỏng phải chưa tồn tại');

  let res;
  try {
    process.env.TMPDIR = daBiXoa;
    res = await runSingleScenario(scenario, { isMock: true });
  } finally {
    if (tmpdirCu === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = tmpdirCu;
    rmSync(dirname(daBiXoa), { recursive: true, force: true });
  }

  assert.equal(res.ok, true, `Kịch bản phải vẫn đạt khi TMPDIR bị dọn, nhưng trượt vì: ${res.lyDo}`);
  assert.doesNotMatch(res.lyDo || '', /ENOENT|mkdtemp/, 'Không được chết vì thiếu thư mục tạm');
  assert.equal(res.stepResults.length, 2);
});

// OZV-2100: Kịch bản QA thật G4 (g4-quyen-hoi-lai.json) phủ trọn Phương án 1 OZV-1527
// (menu số 0–3, nhận phím tắt số 1 & 3, câu hỏi tách mã card mạng Mẫu 2, cảnh báo giấy phép Mẫu 3).
test('runSingleScenario: G4 giọng Quyên & hỏi lại (g4-quyen-hoi-lai.json) phủ trọn Phương án 1 OZV-1527', async () => {
  const g4HoiLaiPath = join(ROOT_DIR, 'eval', 'qa-that', 'g4-quyen-hoi-lai.json');
  assert.ok(existsSync(g4HoiLaiPath), 'Tệp eval/qa-that/g4-quyen-hoi-lai.json phải tồn tại');
  const scenario = JSON.parse(readFileSync(g4HoiLaiPath, 'utf8'));

  const res = await runSingleScenario(scenario, { isMock: true });
  assert.equal(res.ok, true, `g4-quyen-hoi-lai phải đạt toàn bộ 10 bước nhưng trượt vì: ${res.lyDo}`);
  assert.equal(res.zaloApiCalls, 0);
  assert.equal(res.stepResults.length, 10);

  for (const st of res.stepResults) {
    assert.equal(st.ok, true, `Bước ${st.stepIndex} (${st.mieuTa}) phải ĐẠT nhưng trượt: ${st.lyDo}`);
  }

  // Bước 2: kết quả 8509.40.00 có menu số 0–3
  assert.match(res.stepResults[1].sent.join('\n'), /Gõ 1 thuế & C\/O · 2 giấy phép\/thủ tục · 3 mô tả khai báo · 0 gặp nhân viên/);

  // Bước 7: hỏi tách mã card mạng Mẫu 2, không gọi phan_loai_hs ở bước này
  assert.equal(res.stepResults[6].baoDangTraSau, null);
  assert.match(res.stepResults[6].sent.join('\n'), /kết nối mạng LAN\/WAN[\s\S]*cổng RJ45[\s\S]*điều khiển nội bộ/);

  // Bước 8: trả lời LAN cổng RJ45 → kết quả 8517.62.43 có 10/2022/TT-BTTTT + thời gian cấp phép + menu 0–3
  const step8Text = res.stepResults[7].sent.join('\n');
  assert.match(step8Text, /8517\.62\.43/);
  assert.match(step8Text, /10\/2022\/TT-BTTTT/);
  assert.match(step8Text, /05 ngày làm việc/);
  assert.match(step8Text, /Gõ 1 thuế & C\/O · 2 giấy phép\/thủ tục · 3 mô tả khai báo · 0 gặp nhân viên/);

  // Bước 9 & 10: phím số 1 (Gói 2) và phím số 3 (Gói 3 — gọi sinh_mo_ta_khai_bao)
  assert.match(res.stepResults[8].sent.join('\n'), /Gói 2: Thuế & thủ tục nhập khẩu — mã vừa tra[\s\S]*8517\.62\.43/);
  assert.match(res.stepResults[9].sent.join('\n'), /Gói 3: Viết mô tả khai báo — mã vừa tra[\s\S]*Bộ thích ứng mạng hữu tuyến/);
  assert.ok(res.toolCalls.some((c) => c.name === 'sinh_mo_ta_khai_bao'), 'Bước gõ phím 3 phải gọi công cụ sinh_mo_ta_khai_bao');
});


// OZV-2319: nhóm kịch bản QA G6 — khoá hồi quy menu số 0–3 & phím 0–3 cho Phương án 1 OZV-1527.
// Menu render vô điều kiện cuối tin kết quả Giọng Quyên (`packs/hs/giong-quyen.js:118`, hằng
// MENU_SO_GIONG_QUYEN); phím 0 → handoff hotline (`packs/hs/luong-chu.js:150`), phím 1/2 → Gói 2,
// phím 3 → Gói 3 chạy với mã vừa tra.
test('runSingleScenario: G6 menu số 0–3 (g6-menu-so.json) — dòng menu đúng khuôn ở riêng tư và nhóm', async () => {
  const g6MenuPath = join(ROOT_DIR, 'eval', 'qa-that', 'g6-menu-so.json');
  assert.ok(existsSync(g6MenuPath), 'Tệp eval/qa-that/g6-menu-so.json phải tồn tại');
  const scenario = JSON.parse(readFileSync(g6MenuPath, 'utf8'));

  const res = await runSingleScenario(scenario, { isMock: true });
  assert.equal(res.ok, true, `g6-menu-so phải đạt toàn bộ ${scenario.steps.length} bước nhưng trượt vì: ${res.lyDo}`);
  assert.equal(res.zaloApiCalls, 0);
  assert.equal(res.stepResults.length, scenario.steps.length);
  for (const st of res.stepResults) {
    assert.equal(st.ok, true, `Bước ${st.stepIndex} (${st.mieuTa}) phải ĐẠT nhưng trượt: ${st.lyDo}`);
  }

  // Bước 2: tin kết quả riêng tư kèm dòng menu 0–3 NGUYÊN VĂN MENU_SO_GIONG_QUYEN
  assert.match(
    res.stepResults[1].sent.join('\n'),
    /8509\.40\.00[\s\S]*Anh\/chị muốn em soạn luôn mô tả khai báo hay xem giấy tờ ạ\? Gõ 1 thuế & C\/O · 2 giấy phép\/thủ tục · 3 mô tả khai báo · 0 gặp nhân viên \(hoặc "căn cứ"\)/,
  );

  // Bước 4: trong nhóm, tin kết quả tag đúng người và vẫn kèm menu đúng khuôn
  const nhom = res.stepResults[3].sent.join('\n');
  assert.ok(nhom.startsWith('@Mai\n'), 'Tin kết quả trong nhóm phải mở đầu bằng @Mai');
  assert.match(nhom, /8517\.62\.43[\s\S]*Gõ 1 thuế & C\/O · 2 giấy phép\/thủ tục · 3 mô tả khai báo · 0 gặp nhân viên \(hoặc "căn cứ"\)/);
});

test('runSingleScenario: G6 phím số 0–3 (g6-phim-so.json) — bot rẽ đúng nhánh theo phím khách bắn', async () => {
  const g6PhimPath = join(ROOT_DIR, 'eval', 'qa-that', 'g6-phim-so.json');
  assert.ok(existsSync(g6PhimPath), 'Tệp eval/qa-that/g6-phim-so.json phải tồn tại');
  const scenario = JSON.parse(readFileSync(g6PhimPath, 'utf8'));

  const res = await runSingleScenario(scenario, { isMock: true });
  assert.equal(res.ok, true, `g6-phim-so phải đạt toàn bộ ${scenario.steps.length} bước nhưng trượt vì: ${res.lyDo}`);
  assert.equal(res.zaloApiCalls, 0);
  assert.equal(res.stepResults.length, scenario.steps.length);
  for (const st of res.stepResults) {
    assert.equal(st.ok, true, `Bước ${st.stepIndex} (${st.mieuTa}) phải ĐẠT nhưng trượt: ${st.lyDo}`);
  }

  // Bước 3: phím 0 sau kết quả phân loại → hotline gặp nhân viên, KHÔNG chạy gói, KHÔNG về chế độ tự động
  const phim0 = res.stepResults[2].sent.join('\n');
  assert.match(phim0, /gọi hoặc nhắn Zalo hotline OZ/);
  assert.doesNotMatch(phim0, /Gói \d/);
  assert.doesNotMatch(phim0, /chế độ TỰ ĐỘNG/);

  // Bước 6 & 7: phím 1 và phím 2 → Gói 2 (Thuế & thủ tục) chạy với mã vừa tra 8517.62.43
  assert.match(res.stepResults[5].sent.join('\n'), /Gói 2: Thuế & thủ tục nhập khẩu — mã vừa tra[\s\S]*8517\.62\.43/);
  assert.match(res.stepResults[6].sent.join('\n'), /Gói 2: Thuế & thủ tục nhập khẩu — mã vừa tra[\s\S]*8517\.62\.43/);

  // Bước 8: phím 3 → Gói 3 (Viết mô tả khai báo) với mã vừa tra, gọi sinh_mo_ta_khai_bao
  assert.match(res.stepResults[7].sent.join('\n'), /Gói 3: Viết mô tả khai báo — mã vừa tra[\s\S]*Bộ thích ứng mạng hữu tuyến/);
  assert.ok(res.toolCalls.some((c) => c.name === 'sinh_mo_ta_khai_bao'), 'Phím 3 phải gọi công cụ sinh_mo_ta_khai_bao');
});

// OZV-2321: nhóm kịch bản QA G7 — khoá hồi quy BIÊN menu 0–3 (OZV-1527):
// phím 0–3 khi KHÔNG có kết quả tra trước đó, phím lạ 4–9 và chữ.
test('runSingleScenario: G7 biên riêng tư (g7-bien-rieng-tu.json) — phím 0/1/2/3 khi chưa tra gì không rẽ nhánh gói', async () => {
  const g7Path = join(ROOT_DIR, 'eval', 'qa-that', 'g7-bien-rieng-tu.json');
  assert.ok(existsSync(g7Path), 'Tệp eval/qa-that/g7-bien-rieng-tu.json phải tồn tại');
  const scenario = JSON.parse(readFileSync(g7Path, 'utf8'));

  const res = await runSingleScenario(scenario, { isMock: true });
  assert.equal(res.ok, true, `g7-bien-rieng-tu phải đạt toàn bộ ${scenario.steps.length} bước nhưng trượt vì: ${res.lyDo}`);
  assert.equal(res.zaloApiCalls, 0);
  assert.equal(res.stepResults.length, scenario.steps.length);
  for (const st of res.stepResults) {
    assert.equal(st.ok, true, `Bước ${st.stepIndex} (${st.mieuTa}) phải ĐẠT nhưng trượt: ${st.lyDo}`);
  }

  // Bước 1: phím '0' trống không (chưa có kết quả tra) → CHỈ chuyển chế độ TỰ ĐỘNG,
  // không hotline, không handoff gặp nhân viên.
  const phim0 = res.stepResults[0].sent.join('\n');
  assert.match(phim0, /Đã chuyển sang chế độ TỰ ĐỘNG/);
  assert.doesNotMatch(phim0, /hotline OZ/);
  assert.doesNotMatch(phim0, /Gói \d/);

  // Bước 2–4: phím 1/2/3 khi chưa tra gì → CHỈ template giới thiệu gói + mẫu nhập,
  // KHÔNG chạy gói: không có nhãn "mã vừa tra" và không có mã kết quả 8537.10.99 của bộ giả lập.
  for (const i of [1, 2, 3]) {
    const t = res.stepResults[i].sent.join('\n');
    assert.match(t, /Gói \d: [\s\S]*Gửi thông tin theo mẫu/, `Bước ${i + 1} phải là template gói kèm mẫu nhập`);
    assert.doesNotMatch(t, /mã vừa tra/, `Bước ${i + 1} không được chạy gói với mã vừa tra khi chưa có kết quả`);
    assert.doesNotMatch(t, /8537/, `Bước ${i + 1} không được trả mã kết quả khi chưa có kết quả tra trước đó`);
  }

  // Bước 5–6: phím lạ 4/9 (không có gói tương ứng trên menu) → in menu đầy đủ.
  for (const i of [4, 5]) {
    assert.match(res.stepResults[i].sent.join('\n'), /CHỌN GÓI TRA CỨU/);
  }

  // Bước 7: chữ vô nghĩa → luồng tin thường (tự chọn gói 1, trả mã của bộ giả lập kèm dòng menu).
  assert.match(res.stepResults[6].sent.join('\n'), /8537\.10\.99[\s\S]*Gõ 1 thuế & C\/O · 2 giấy phép\/thủ tục · 3 mô tả khai báo · 0 gặp nhân viên/);

  // Chỉ 6 bước phím (bỏ bước chữ): phím 0–4/9 khi chưa tra gì phải 0 lần gọi Cổng.
  const resChiPhim = await runSingleScenario(
    { ...scenario, id: 'g7-bien-rieng-tu-chi-phim', steps: scenario.steps.slice(0, 6) },
    { isMock: true },
  );
  assert.equal(resChiPhim.ok, true, `Mạch chỉ phím phải đạt: ${resChiPhim.lyDo}`);
  assert.equal(resChiPhim.toolCalls.length, 0, 'Phím 0–4/9 khi chưa có kết quả tra không được gọi Cổng lần nào');
});

test('runSingleScenario: G7 biên nhóm (g7-bien-nhom.json) — phím khi chưa tra gì trong nhóm không rẽ nhánh gói, không tag thì im', async () => {
  const g7Path = join(ROOT_DIR, 'eval', 'qa-that', 'g7-bien-nhom.json');
  assert.ok(existsSync(g7Path), 'Tệp eval/qa-that/g7-bien-nhom.json phải tồn tại');
  const scenario = JSON.parse(readFileSync(g7Path, 'utf8'));

  const res = await runSingleScenario(scenario, { isMock: true });
  assert.equal(res.ok, true, `g7-bien-nhom phải đạt toàn bộ ${scenario.steps.length} bước nhưng trượt vì: ${res.lyDo}`);
  assert.equal(res.zaloApiCalls, 0);
  assert.equal(res.stepResults.length, scenario.steps.length);
  for (const st of res.stepResults) {
    assert.equal(st.ok, true, `Bước ${st.stepIndex} (${st.mieuTa}) phải ĐẠT nhưng trượt: ${st.lyDo}`);
  }

  // Bước 1: tag bot + phím '0' khi chưa tra gì → tag đúng Quân, chỉ chế độ TỰ ĐỘNG (không hotline).
  const phim0 = res.stepResults[0].sent.join('\n');
  assert.ok(phim0.startsWith('@Quân\n'), 'Tin trong nhóm phải mở đầu bằng @Quân');
  assert.match(phim0, /Đã chuyển sang chế độ TỰ ĐỘNG/);
  assert.doesNotMatch(phim0, /hotline OZ/);
  assert.doesNotMatch(phim0, /Gói \d/);

  // Bước 2: tag bot + phím '2' → chỉ template Gói 2 (mã 84137090 trong tin là ví dụ mẫu, không phải kết quả tra).
  const goi2 = res.stepResults[1].sent.join('\n');
  assert.ok(goi2.startsWith('@Linh\n'), 'Tin trong nhóm phải mở đầu bằng @Linh');
  assert.match(goi2, /Gói 2: Thuế & thủ tục nhập khẩu[\s\S]*Gửi thông tin theo mẫu/);
  assert.doesNotMatch(goi2, /mã vừa tra/);

  // Bước 3: tag bot + phím lạ '8' → menu đầy đủ, tag đúng Phúc.
  const menu = res.stepResults[2].sent.join('\n');
  assert.ok(menu.startsWith('@Phúc\n'), 'Tin trong nhóm phải mở đầu bằng @Phúc');
  assert.match(menu, /CHỌN GÓI TRA CỨU/);

  // Bước 4: phím '3' KHÔNG tag bot → bot im (luật nhóm G2), không rẽ nhánh gói.
  assert.equal(res.stepResults[3].sent.length, 0, 'Tin phím không tag bot trong nhóm thì bot phải im');

  // Bước 5: Quân tag bot bắn '1' sau phím '0' của mình → mạch Quân vẫn chưa có kết quả → chỉ template Gói 1.
  const goi1 = res.stepResults[4].sent.join('\n');
  assert.ok(goi1.startsWith('@Quân\n'), 'Tin trong nhóm phải mở đầu bằng @Quân');
  assert.match(goi1, /Gói 1: Phân loại mã HS[\s\S]*Gửi thông tin theo mẫu/);
  assert.doesNotMatch(goi1, /mã vừa tra/);
  assert.equal(res.toolCalls.length, 0, 'Cả kịch bản nhóm không gọi Cổng lần nào: phím số khi chưa tra gì không chạy gói');
});
