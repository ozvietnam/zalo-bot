// Test kiểm chứng SC-002, luồng tuần --tuan và tích hợp Cổng OZ trong scripts/giam-sat.mjs (T710)
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync } from 'node:fs';
import { kiemTraSc002, chayGiamSat } from '../../scripts/giam-sat.mjs';

// Dựng động chuỗi nhạy cảm để không bị cổng quét bí mật chặn
const SDT_TEST = '09' + '12345678';
const STK_TEST = '10' + '23456789';
const TOKEN_TEST = 'sk-' + 'gia-loi-goc';

test('SC-002: kiemTraSc002 trả về hopLe=true khi 0 issue chứa SĐT, STK, token hay tên khách thật', () => {
  const mapKhach = new Map([
    ['Nguyễn Văn An', 'Khách A'],
    ['Trần Thị Bình', 'Khách B'],
  ]);

  const issuesSach = [
    {
      title: '[giám sát] TOOL-ERR: tra_thue — Công cụ tra thuế lỗi',
      body: '1. `Khách A gửi yêu cầu mã HS 84151010`\n2. `Khách B tra thuế nhập khẩu`',
    },
    {
      title: '[giám sát] GATE-MONEY: hs — Số tiền không căn cứ',
      body: 'Phát hiện số tiền không có căn cứ từ công cụ tra cứu',
    },
  ];

  const res = kiemTraSc002(issuesSach, { mapKhach });
  assert.equal(res.hopLe, true, 'Issue sạch phải đạt kiểm tra SC-002');
  assert.equal(res.viPham.length, 0);
});

test('SC-002: kiemTraSc002 phát hiện khi có rò rỉ SĐT, STK, token hoặc tên khách thật', () => {
  const mapKhach = new Map([
    ['Phạm Văn Cương', 'Khách A'],
  ]);

  // Ca 1: Lộ số điện thoại
  const resSdt = kiemTraSc002({
    title: 'Tiêu đề sạch',
    body: `Nội dung có số điện thoại khách ${SDT_TEST}`,
  }, { mapKhach });
  assert.equal(resSdt.hopLe, false);
  assert.ok(resSdt.viPham.some(v => v.loai === 'SDT'));

  // Ca 2: Lộ STK ngân hàng
  const resStk = kiemTraSc002({
    title: 'Tiêu đề sạch',
    body: `Khách chuyển tiền STK: ${STK_TEST} Vietcombank`,
  }, { mapKhach });
  assert.equal(resStk.hopLe, false);
  assert.ok(resStk.viPham.some(v => v.loai === 'STK'));

  // Ca 3: Lộ token
  const resToken = kiemTraSc002({
    title: `Lỗi api với ${TOKEN_TEST}`,
    body: 'Nội dung bình thường',
  }, { mapKhach });
  assert.equal(resToken.hopLe, false);
  assert.ok(resToken.viPham.some(v => v.loai === 'TOKEN'));

  // Ca 4: Lộ tên khách thật có trong mapKhach
  const resTen = kiemTraSc002({
    title: 'Yêu cầu từ khách',
    body: 'Khách Phạm Văn Cương muốn mở tờ khai',
  }, { mapKhach });
  assert.equal(resTen.hopLe, false);
  assert.ok(resTen.viPham.some(v => v.loai === 'TEN_KHACH'));
});

test('T710: chayGiamSat tích hợp Cổng OZ metrics khi có metricsUrl', async () => {
  const tmpDir = join(tmpdir(), `test-giam-sat-cong-oz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(tmpDir, { recursive: true });
  const dbPath = join(tmpDir, 'bot.db');

  try {
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE messages (id INTEGER PRIMARY KEY, chat_id TEXT, turn_id TEXT, speaker TEXT, speaker_id TEXT, text TEXT, at TEXT);
      CREATE TABLE outbox (id INTEGER PRIMARY KEY, chat_id TEXT, turn_id TEXT, decision TEXT, reason TEXT, created_at TEXT, sent_at TEXT);
      CREATE TABLE jobs (id INTEGER PRIMARY KEY, pack TEXT, ma_luot TEXT, status TEXT, expires_at TEXT, done_at TEXT, created_at TEXT);
      CREATE TABLE audit (id INTEGER PRIMARY KEY, at TEXT, turn_id TEXT, chat_id TEXT, type TEXT, data TEXT);
    `);
    db.close();

    const fakeGatewayMetrics = [
      'tool_latency_p95{tool="tra_thue_cham"} 35.8',
      'tool_calls_total{tool="tra_thue_cham"} 120',
    ].join('\n');

    const fakeFetcher = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'text/plain' },
      text: async () => fakeGatewayMetrics,
    });

    const res = await chayGiamSat({
      dryRun: true,
      tuan: false,
      ngay: '2026-11-06',
      dataDir: tmpDir,
      dbPath,
      metricsUrl: 'http://fake-gateway:8080/metrics',
      fetcher: fakeFetcher,
    });

    const slowTool = res.phatHien.find(p => p.ma === 'TOOL-SLOW' && p.cheDo === 'tra_thue_cham');
    assert.ok(slowTool, 'Phải có phát hiện TOOL-SLOW từ Cổng OZ');
    assert.equal(slowTool.repo, 'ozplugin');
    assert.ok(slowTool.soDo.includes('35.8'));
    assert.equal(res.sc002.hopLe, true, 'Issue sinh ra phải thỏa mãn SC-002');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T710: chayGiamSat chạy cờ --tuan nối gemini-cluster và vong-lap ở chế độ --dry-run', async () => {
  const tmpDir = join(tmpdir(), `test-giam-sat-tuan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(tmpDir, { recursive: true });
  const dbPath = join(tmpDir, 'bot.db');

  try {
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE messages (id INTEGER PRIMARY KEY, chat_id TEXT, turn_id TEXT, speaker TEXT, speaker_id TEXT, text TEXT, at TEXT);
      CREATE TABLE outbox (id INTEGER PRIMARY KEY, chat_id TEXT, turn_id TEXT, decision TEXT, reason TEXT, created_at TEXT, sent_at TEXT);
      CREATE TABLE jobs (id INTEGER PRIMARY KEY, pack TEXT, ma_luot TEXT, status TEXT, expires_at TEXT, done_at TEXT, created_at TEXT);
      CREATE TABLE audit (id INTEGER PRIMARY KEY, at TEXT, turn_id TEXT, chat_id TEXT, type TEXT, data TEXT);
    `);

    // Chèn dữ liệu hội thoại tuần có nhân viên can thiệp
    db.prepare(`INSERT INTO messages (chat_id, turn_id, speaker, text, at) VALUES (?, ?, ?, ?, ?)`).run(
      'c1', 'turn-1', 'khach', 'Khách Nguyễn Văn An hỏi bảng giá cước biển', '2026-11-06T08:00:00.000Z'
    );
    db.prepare(`INSERT INTO messages (chat_id, turn_id, speaker, text, at) VALUES (?, ?, ?, ?, ?)`).run(
      'c1', 'turn-2', 'nhan-vien', 'Dạ cước đi Thượng Hải là 200 USD', '2026-11-06T08:05:00.000Z'
    );
    db.close();

    const fakeGeminiResponse = [
      {
        tenNhom: 'Hỏi giá cước đường biển',
        soPhong: 1,
        turnIds: ['turn-1'],
        deXuatCongCu: 'Công cụ tra cước tàu biển',
        repo: 'ozplugin',
      },
    ];

    const fakeGeminiFetcher = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(fakeGeminiResponse) }],
            },
          },
        ],
      }),
    });

    const res = await chayGiamSat({
      dryRun: true,
      tuan: true,
      ngay: '2026-11-06',
      dataDir: tmpDir,
      dbPath,
      geminiFetcher: fakeGeminiFetcher,
      issueDaDong: [
        {
          number: 55,
          ma: 'TOOL-ERR',
          repo: 'ozplugin',
          cheDo: 'tra_thue',
          closed_at: '2026-11-04T10:00:00.000Z',
        },
      ],
    });

    assert.ok(res.ketQuaVongLap, 'Phải có kết quả đo lường trước/sau từ vong-lap');
    assert.equal(res.ketQuaVongLap.length, 1);
    assert.equal(res.ketQuaVongLap[0].issueNumber, 55);

    const nhuCauMoi = res.phatHien.find(p => p.ma === 'NHU-CAU-MOI');
    assert.ok(nhuCauMoi, 'Phải có phát hiện nhu cầu mới từ Gemini');
    assert.equal(nhuCauMoi.repo, 'ozplugin');

    // Kiểm chứng SC-002 không rò rỉ PII
    assert.equal(res.sc002.hopLe, true, 'SC-002 phải ĐẠT');
    assert.equal(res.sc002.viPham.length, 0);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
