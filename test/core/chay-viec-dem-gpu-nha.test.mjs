// test/core/chay-viec-dem-gpu-nha.test.mjs — Kiểm thử TDD script hàng việc đêm gpu-nha (OZV-1853).
// Kiểm đủ 5 nhóm tiêu chí:
//   1. Vệ sinh mã nguồn (< 300 dòng, sạch findLeak), cờ CLI (--che-do, --dry-run, --limit, --out) và bóc JSON dính `data: [DONE]`.
//   2. Ép `max_tokens >= 2000` & `reasoning_effort: 'low'` (kể cả khi editor truyền 400), che `redact` trước khi gửi.
//   3. Cầu chì `fail-fast` dừng ngay khi gặp HTTP 404 `No active credentials for provider` hoặc 3 lỗi liên tiếp.
//   4. Chạy đủ 3 chế độ (`dinh-tuyen`, `bien-tap`, `giong-quyen`) + `tat-ca` qua `fetchImpl` giả lập và `--dry-run` đủ 120 lượt (52+52+16).
//   5. Hậu kiểm chống bịa số (`soDungChuan`), số hiệu văn bản (`soHieuLa`), bịa mã HS (`maDaNeu`) và rò rỉ (`findLeak`).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findLeak } from '../../core/redact.js';
import {
  CHE_DO_HOP_LE,
  MAX_TOKENS_MAC_DINH,
  MAX_TOKENS_TOI_THIEU,
  SO_CA_BO_DE,
  SO_CAU_GIONG_QUYEN,
  bocJsonGpuNha,
  chayViecDemGpuNha,
  docThamSoCli,
  dungVanBanGocBienTap,
  goiGpuNha,
  layBaseUrlGpuNha,
  taoPayloadGpuNha,
} from '../../scripts/chay-viec-dem-gpu-nha.mjs';

const DUONG_TEST = fileURLToPath(import.meta.url);
const GOC_REPO = resolve(join(dirname(DUONG_TEST), '..', '..'));
const DUONG_SCRIPT = join(GOC_REPO, 'scripts', 'chay-viec-dem-gpu-nha.mjs');
const URL_GIA = 'http://127.0.0.1:9/v1';

test('Ca 1: Vệ sinh mã nguồn (< 300 dòng, sạch findLeak), cờ CLI và bóc JSON dính hậu tố SSE `data: [DONE]`', () => {
  for (const [ten, duong] of [
    ['scripts/chay-viec-dem-gpu-nha.mjs', DUONG_SCRIPT],
    ['test/core/chay-viec-dem-gpu-nha.test.mjs', DUONG_TEST],
  ]) {
    const ma = readFileSync(duong, 'utf8');
    const dong = ma.split(/\r?\n/);
    assert.ok(dong.length < 300, `${ten} phải dưới 300 dòng (đang có ${dong.length})`);
    dong.forEach((d, i) => assert.equal(findLeak(d, []), null, `${ten}:${i + 1} dính findLeak`));
  }

  assert.deepEqual(CHE_DO_HOP_LE, ['dinh-tuyen', 'bien-tap', 'giong-quyen', 'tat-ca']);
  assert.equal(SO_CA_BO_DE, 52);
  assert.equal(SO_CAU_GIONG_QUYEN, 16);
  assert.equal(layBaseUrlGpuNha({ ANTHROPIC_BASE_URL: 'https://router.example.test///' }), 'https://router.example.test/v1');
  assert.equal(layBaseUrlGpuNha({ GPU_NHA_BASE_URL: 'https://gpu.example.test/v1/', ANTHROPIC_BASE_URL: 'https://other.test' }), 'https://gpu.example.test/v1');
  assert.equal(layBaseUrlGpuNha({}), '');

  const ts = docThamSoCli(['--che-do', 'bien-tap', '--dry-run', '--limit', '5', '--out', '/tmp/out.json']);
  assert.equal(ts.cheDo, 'bien-tap');
  assert.equal(ts.dryRun, true);
  assert.equal(ts.limit, 5);
  assert.equal(ts.out, '/tmp/out.json');

  const bodySse = '{"id":"cmpl-1","choices":[{"message":{"role":"assistant","content":"Dạ kết quả tham khảo ạ."}}]}\ndata: [DONE]\n';
  assert.throws(() => JSON.parse(bodySse));
  assert.equal(bocJsonGpuNha(bodySse).choices[0].message.content, 'Dạ kết quả tham khảo ạ.');

  const bodyDataLine = 'data: {"choices":[{"message":{"content":"Dạ dòng data SSE."}}]}\ndata: [DONE]';
  assert.equal(bocJsonGpuNha(bodyDataLine).choices[0].message.content, 'Dạ dòng data SSE.');
  assert.throws(() => bocJsonGpuNha('   '), /rỗng/);
});

test('Ca 2: Ép `max_tokens >= 2000`, `reasoning_effort: "low"`, `stream: false` và che `redact` trước khi gửi', async () => {
  const biMat = [['Bearer', 'tok_secret_123456'].join(' '), ['bot123456', 'ABC-DEF123456789'].join(':'), `Abcdefghijklmnop${'1234567890'.repeat(2)}`].join(' va ');
  assert.equal(findLeak(biMat, []), 'secret');

  const payload = taoPayloadGpuNha(
    [
      { role: 'system', content: `Hệ thống ${biMat}` },
      { role: 'user', content: `Khách hỏi ${biMat}` },
    ],
    { maxTokens: 400 },
  );
  assert.equal(payload.model, 'gpu-nha');
  assert.equal(payload.stream, false);
  assert.equal(payload.max_tokens, MAX_TOKENS_TOI_THIEU);
  assert.ok(payload.max_tokens >= 2000);
  assert.equal(payload.reasoning_effort, 'low');
  assert.equal(findLeak(JSON.stringify(payload.messages), []), null, 'messages sau taoPayloadGpuNha phải sạch bí mật');

  let bodyDaGui = null;
  let urlDaGoi = '';
  const kq = await goiGpuNha([{ role: 'user', content: `Tra cứu ${biMat}` }], {
    baseUrl: URL_GIA,
    apiKey: 'khoa-thu',
    tools: [{ name: 'phan_loai', description: 'Phân loại', parameters: { type: 'OBJECT', properties: { tenHang: { type: 'STRING' } } } }],
    fetchImpl: async (url, init) => {
      urlDaGoi = url;
      bodyDaGui = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          '{"choices":[{"message":{"content":"{\\"name\\":\\"phan_loai\\",\\"arguments\\":{\\"tenHang\\":\\"máy bơm nước\\",\\"doChac\\":0.95}}"}}]}\ndata: [DONE]',
      };
    },
  });
  assert.equal(urlDaGoi, `${URL_GIA}/chat/completions`);
  assert.equal(bodyDaGui.model, 'gpu-nha');
  assert.equal(bodyDaGui.stream, false);
  assert.equal(bodyDaGui.max_tokens, MAX_TOKENS_MAC_DINH);
  assert.ok(bodyDaGui.max_tokens >= 2000);
  assert.equal(bodyDaGui.reasoning_effort, 'low');
  assert.equal(bodyDaGui.tools[0].function.parameters.type, 'object');
  assert.equal(findLeak(JSON.stringify(bodyDaGui), []), null);
  assert.equal(kq.call?.name, 'phan_loai');
  assert.equal(kq.call?.args?.tenHang, 'máy bơm nước');
});

test('Ca 3: Cầu chì `fail-fast` dừng ngay khi gặp HTTP 404 `No active credentials for provider` hoặc 3 lỗi liên tiếp', async () => {
  let soLanGoi404 = 0;
  const kq404 = await chayViecDemGpuNha({
    cheDo: 'dinh-tuyen',
    limit: 10,
    baseUrl: URL_GIA,
    log: () => {},
    fetchImpl: async () => {
      soLanGoi404 += 1;
      return {
        ok: false,
        status: 404,
        text: async () => '{"error":{"message":"No active credentials for provider gpu-nha"}}',
      };
    },
  });
  assert.equal(soLanGoi404, 1, 'Phải fail-fast dừng ngay ở lượt đầu tiên khi gặp 404 No active credentials');
  assert.equal(kq404.daDungSom, true);
  assert.match(kq404.lyDoDungSom, /No active credentials/i);
  assert.equal(kq404.soLoi, 1);
  assert.equal(kq404.code, 1);

  let soLanGoi502 = 0;
  const kq502 = await chayViecDemGpuNha({
    cheDo: 'bien-tap',
    limit: 10,
    baseUrl: URL_GIA,
    log: () => {},
    fetchImpl: async () => {
      soLanGoi502 += 1;
      return { ok: false, status: 502, text: async () => 'Bad Gateway' };
    },
  });
  assert.equal(soLanGoi502, 3, 'Phải fail-fast dừng ngay sau 3 lỗi HTTP liên tiếp');
  assert.equal(kq502.daDungSom, true);
  assert.equal(kq502.soLoi, 3);
  assert.equal(kq502.code, 1);
});

test('Ca 4: Chạy đủ 3 chế độ (`dinh-tuyen`, `bien-tap`, `giong-quyen`) và `tat-ca` qua `fetchImpl` giả lập + `--dry-run` đủ 120 lượt', async () => {
  const thuMucTam = mkdtempSync(join(tmpdir(), 'ozv1853-gpu-nha-'));
  try {
    const payloads = [];
    const fetchGia = async (_url, init) => {
      const body = JSON.parse(init.body);
      payloads.push(body);
      const userMsg = String(body.messages?.at(-1)?.content ?? '');
      if (Array.isArray(body.tools) && body.tools.length) {
        const m = userMsg.match(/Câu của khách:\s*"([\s\S]*)"$/);
        const tenHang = m ? m[1] : userMsg;
        return {
          ok: true,
          status: 200,
          text: async () =>
            `${JSON.stringify({
              choices: [{
                message: {
                  content: '',
                  tool_calls: [{ type: 'function', function: { name: 'phan_loai', arguments: JSON.stringify({ tenHang, doChac: 0.95 }) } }],
                },
              }],
            })}\ndata: [DONE]`,
        };
      }
      if (userMsg.includes('KẾT QUẢ GỐC:')) {
        const ma = userMsg.match(/Mã HS đề xuất:\s*([0-9.]+)/)?.[1] || '1208.10.00';
        const soHieu = userMsg.match(/Căn cứ pháp lý:\s*([^\s(]+)/)?.[1] || '2342/TB-TCHQ';
        const chot = `Dạ mặt hàng này mã HS phù hợp là ${ma} anh/chị nhé.\nThuế NK ưu đãi 0%, VAT 8% theo căn cứ ${soHieu} ạ.`;
        return {
          ok: true,
          status: 200,
          text: async () => `${JSON.stringify({ choices: [{ message: { content: chot } }] })}\ndata: [DONE]`,
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => `${JSON.stringify({ choices: [{ message: { content: '{"diem":5,"lyDo":"Dạ câu trả lời tự nhiên, đúng hồ sơ giọng Quyên ạ."}' } }] })}\ndata: [DONE]`,
      };
    };

    for (const cheDo of ['dinh-tuyen', 'bien-tap', 'giong-quyen']) {
      const tepOut = join(thuMucTam, `${cheDo}.json`);
      const dongLog = [];
      const ts = docThamSoCli(['--che-do', cheDo, '--limit', '2', '--out', tepOut]);
      const kq = await chayViecDemGpuNha({ ...ts, baseUrl: URL_GIA, fetchImpl: fetchGia, log: (s) => dongLog.push(s) });
      assert.equal(kq.code, 0, `Chế độ ${cheDo} phải thoát 0`);
      assert.equal(kq.soLuot, 2);
      assert.equal(kq.soRong, 0);
      assert.equal(kq.soLoi, 0);
      assert.equal(kq.soLeak, 0);
      assert.equal(dongLog[0], 'GPU_NHA_DEM: 2 luot · rong=0 · loi=0 · leak=0');
      assert.equal(existsSync(tepOut), true);
      assert.equal(findLeak(readFileSync(tepOut, 'utf8'), []), null);
      if (cheDo === 'dinh-tuyen') {
        assert.equal(kq.soDungGoi1, 2);
        assert.equal(kq.soBiaMaHs, 0);
      } else if (cheDo === 'bien-tap') {
        assert.equal(kq.soDatBienTap, 2);
        assert.equal(kq.soDatSo, 2);
        assert.equal(kq.soDatSoHieu, 2);
      } else if (cheDo === 'giong-quyen') {
        assert.equal(kq.soDatCham, 2);
        assert.equal(kq.diemTrungBinhGpu, 5);
      }
    }

    const kqTatCa = await chayViecDemGpuNha({ cheDo: 'tat-ca', limit: 2, baseUrl: URL_GIA, fetchImpl: fetchGia, log: () => {} });
    assert.equal(kqTatCa.code, 0);
    assert.equal(kqTatCa.soLuot, 6);
    assert.equal(kqTatCa.dongTongKet, 'GPU_NHA_DEM: 6 luot · rong=0 · loi=0 · leak=0');
    assert.ok(payloads.every((p) => p.max_tokens >= 2000 && p.reasoning_effort === 'low' && p.stream === false));

    // Dry-run trọn bộ 120 lượt (52 định tuyến + 52 biên tập + 16 giọng Quyên)
    const tepDry = join(thuMucTam, 'dry-120.json');
    const kqDry = await chayViecDemGpuNha({ cheDo: 'tat-ca', dryRun: true, out: tepDry, log: () => {} });
    assert.equal(kqDry.soLuot, 120);
    assert.equal(kqDry.soRong, 0);
    assert.equal(kqDry.soLoi, 0);
    assert.equal(kqDry.soLeak, 0);
    assert.equal(kqDry.code, 0);
    assert.equal(kqDry.dongTongKet, 'GPU_NHA_DEM: 120 luot · rong=0 · loi=0 · leak=0');
    assert.deepEqual(kqDry.lo.map((l) => l.soLuot), [52, 52, 16]);
  } finally {
    rmSync(thuMucTam, { recursive: true, force: true });
  }
});

test('Ca 5: Hậu kiểm bắt được lỗi bịa số, bịa số hiệu văn bản và rò rỉ `findLeak`', async () => {
  const caMau = {
    ma: '12081000',
    cauKhach: 'Bột đậu nành chưa khử béo dạng bột đã rang màu vàng dùng sản xuất bánh kẹo',
    maLan: [],
    tenDongBieuThue: '- Từ đậu tương',
    nguon: { loai: 'TB-TCHQ', soHieu: '2342/TB-TCHQ', nam: 2020, trich: 'Phân loại mã 1208.10.00 từ đậu tương.', tepBieuThue: 'tax.json#12081000' },
  };
  assert.match(dungVanBanGocBienTap(caMau), /1208\.10\.00/);

  const kqBia = await chayViecDemGpuNha({
    cheDo: 'bien-tap',
    boDe: [caMau],
    baseUrl: URL_GIA,
    log: () => {},
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: `Dạ mã 1208.10.00 thuế NK 25% theo 9999/2099/TT-BTC tại ${['/home', 'admin', 'secret'].join('/')} ạ.` } }],
        }),
    }),
  });
  assert.equal(kqBia.soDatSo, 0, 'Bịa thuế 25% phải bị soDungChuan chặn');
  assert.equal(kqBia.soDatSoHieu, 0, 'Bịa số hiệu 9999/2099/TT-BTC phải bị soHieuLa chặn');
  assert.equal(kqBia.soLeak, 1, 'Lộ đường dẫn nội bộ phải bị findLeak bắt');
  assert.equal(kqBia.code, 1);
});
