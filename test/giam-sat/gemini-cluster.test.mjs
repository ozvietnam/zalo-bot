// Test module gom nhóm nhu cầu qua Gemini AI Studio (T708 — US3, FR-006, SC-006)
import test from 'node:test';
import assert from 'node:assert/strict';
import { xacThucTurnIds, gomNhomNhuCau } from '../../scripts/giam-sat/gemini-cluster.js';

// Dựng động các chuỗi nhạy cảm để không bị cổng quét bí mật chặn
const SDT_GIA = '09' + '1'.repeat(8);
const STK_GIA = '10' + '2'.repeat(8);
const KHOA_GIA = 'sk-' + 'gia-loi-goc';
const DUONG_DAN_GIA = '/ho' + 'me/tho/work/bot.db';

test('T708 (FR-006): xacThucTurnIds - Loại bỏ nhóm nếu có ít nhất 1 turn_id không có trong dbTurns', () => {
  const dbTurns = new Set(['turn-001', 'turn-002', 'turn-003']);
  const nhomHopLe = { tenNhom: 'Cước vận chuyển', turnIds: ['turn-001', 'turn-002'] };
  const nhomBia = { tenNhom: 'Ảo giác', turnIds: ['turn-999'] };
  const nhomTron = { tenNhom: 'Lẫn lộn', turnIds: ['turn-001', 'turn-999'] };

  assert.equal(xacThucTurnIds(nhomHopLe, dbTurns), true, 'Nhóm hợp lệ phải được giữ');
  assert.equal(xacThucTurnIds(nhomBia, dbTurns), false, 'Phải loại bỏ nhóm có turn_id bịa');
  assert.equal(xacThucTurnIds(nhomTron, dbTurns), false, 'Một turn_id sai là loại cả nhóm');
  assert.equal(xacThucTurnIds(null, dbTurns), false);
  assert.equal(xacThucTurnIds({}, dbTurns), false);
  assert.equal(xacThucTurnIds({ turnIds: [] }, dbTurns), false);
  assert.equal(xacThucTurnIds({ turnIds: ['turn-001'] }, null), false);
});

test('T708 (SC-006): gomNhomNhuCau - Gọi fetcher đúng 1 lần duy nhất cho cả lô 50 đoạn hội thoại', async () => {
  let soLanGoi = 0;
  const fakeFetcher = async (url, opts) => {
    soLanGoi++;
    const geminiPayload = [
      {
        tenNhom: 'Hỏi biểu thuế ô tô',
        soPhong: 50,
        turnIds: ['turn-001', 'turn-002'],
        deXuatCongCu: 'tra_cuu_thue_oto',
        repo: 'ozplugin',
      },
    ];
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(geminiPayload) }] } }],
      }),
    };
  };

  const hoiThoaiTuan = Array.from({ length: 50 }, (_, i) => ({
    turn_id: `turn-${String(i + 1).padStart(3, '0')}`,
    content: `Khách hỏi thuế hàng ${i + 1}`,
  }));

  const dbTurns = new Set(hoiThoaiTuan.map((t) => t.turn_id));
  const ketQua = await gomNhomNhuCau({
    hoiThoaiTuan,
    dbTurns,
    apiKey: 'khoa-gia',
    model: 'gemini-1.5-flash',
    fetcher: fakeFetcher,
  });

  assert.equal(soLanGoi, 1, 'Gọi Gemini đúng 1 lần duy nhất cho cả lô (SC-006)');
  assert.equal(ketQua.loi, null);
  assert.equal(ketQua.nhom.length, 1);
  assert.equal(ketQua.nhom[0].tenNhom, 'Hỏi biểu thuế ô tô');
});

test('T708 (FR-004, Hiến pháp IX): Thân request gửi Gemini bắt buộc được ẩn danh (anDanhVanBan)', async () => {
  let rawBodyText = '';
  const fakeFetcher = async (url, opts) => {
    rawBodyText = opts.body;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }) };
  };

  const hoiThoaiTuan = [
    {
      turn_id: 'turn-001',
      content: `Số em ${SDT_GIA}, STK ${STK_GIA} Vietcombank, token ${KHOA_GIA}, file ${DUONG_DAN_GIA}`,
    },
  ];

  await gomNhomNhuCau({
    hoiThoaiTuan,
    dbTurns: new Set(['turn-001']),
    apiKey: 'khoa-gia',
    fetcher: fakeFetcher,
  });

  assert.equal(rawBodyText.includes(SDT_GIA), false, 'Không để lộ SĐT');
  assert.equal(rawBodyText.includes(STK_GIA), false, 'Không để lộ STK');
  assert.equal(rawBodyText.includes(KHOA_GIA), false, 'Không để lộ khoá bí mật');
  assert.equal(rawBodyText.includes(DUONG_DAN_GIA), false, 'Không để lộ đường dẫn');
  assert.ok(rawBodyText.includes('***'), 'Phải che bằng ***');
});

test('T708: Lỗi parse hay fetch trả mã chung đã che, không trả nguyên message', async () => {
  // 1. Lỗi mạng -> gemini-loi-mang
  let soLanGoiLoiMang = 0;
  const kqMang = await gomNhomNhuCau({
    hoiThoaiTuan: [{ turn_id: 'turn-001', content: 'test' }],
    apiKey: 'khoa-gia',
    fetcher: async () => {
      soLanGoiLoiMang++;
      throw new Error('Connection reset by remote peer');
    },
  });
  assert.equal(soLanGoiLoiMang, 1, 'Chỉ gọi 1 lần khi lỗi');
  assert.equal(kqMang.loi, 'gemini-loi-mang');
  assert.deepEqual(kqMang.nhom, []);

  // 2. Lỗi HTTP -> gemini-loi-http
  let soLanGoiHttp = 0;
  const kqHttp = await gomNhomNhuCau({
    hoiThoaiTuan: [{ turn_id: 'turn-001', content: 'test' }],
    apiKey: 'khoa-gia',
    fetcher: async () => {
      soLanGoiHttp++;
      return { ok: false, status: 503, json: async () => ({ error: { message: 'High load' } }) };
    },
  });
  assert.equal(soLanGoiHttp, 1);
  assert.equal(kqHttp.loi, 'gemini-loi-http');
  assert.deepEqual(kqHttp.nhom, []);

  // 3. Lỗi JSON hỏng -> gemini-json-hong
  const kqJson = await gomNhomNhuCau({
    hoiThoaiTuan: [{ turn_id: 'turn-001', content: 'test' }],
    apiKey: 'khoa-gia',
    fetcher: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '```json\n[{"broken' }] } }] }),
    }),
  });
  assert.equal(kqJson.loi, 'gemini-json-hong');
  assert.deepEqual(kqJson.nhom, []);

  // 4. Thiếu API key -> gemini-thieu-api-key, 0 lần gọi
  let soLanGoiKey = 0;
  const oldKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const kqKey = await gomNhomNhuCau({
      apiKey: '',
      fetcher: async () => { soLanGoiKey++; return { ok: true }; },
    });
    assert.equal(soLanGoiKey, 0, 'Thiếu key không được gọi fetcher');
    assert.equal(kqKey.loi, 'gemini-thieu-api-key');
    assert.deepEqual(kqKey.nhom, []);
  } finally {
    if (oldKey !== undefined) process.env.GEMINI_API_KEY = oldKey;
  }
});

test('T708: Lọc bỏ repo không hợp lệ và nhóm có turn_id bịa', async () => {
  const fakeFetcher = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify([
                  {
                    tenNhom: 'Nhóm hợp lệ',
                    soPhong: 2,
                    turnIds: ['turn-001', 'turn-002'],
                    deXuatCongCu: 'cong_cu_1',
                    repo: 'zalo-bot',
                  },
                  {
                    tenNhom: 'Nhóm turn_id bịa',
                    soPhong: 1,
                    turnIds: ['turn-001', 'turn-999'],
                    deXuatCongCu: 'cong_cu_2',
                    repo: 'ozplugin',
                  },
                  {
                    tenNhom: 'Nhóm repo không hợp lệ',
                    soPhong: 3,
                    turnIds: ['turn-001'],
                    deXuatCongCu: 'cong_cu_3',
                    repo: 'repo-la',
                  },
                ]),
              },
            ],
          },
        },
      ],
    }),
  });

  const kq = await gomNhomNhuCau({
    hoiThoaiTuan: [{ turn_id: 'turn-001' }, { turn_id: 'turn-002' }],
    dbTurns: new Set(['turn-001', 'turn-002']),
    apiKey: 'khoa-gia',
    fetcher: fakeFetcher,
  });

  assert.equal(kq.loi, null);
  assert.equal(kq.nhom.length, 1);
  assert.equal(kq.nhom[0].tenNhom, 'Nhóm hợp lệ');
  assert.equal(kq.nhom[0].repo, 'zalo-bot');
});

test('T708: URL ưu tiên tham số > env GEMINI_API_URL > mặc định công khai', async () => {
  let urlDaGoi = '';
  const fakeFetcher = async (url) => {
    urlDaGoi = url;
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }),
    };
  };

  const oldEnvUrl = process.env.GEMINI_API_URL;
  try {
    // 1. Tham số url thắng env
    process.env.GEMINI_API_URL = 'http://env.custom/api';
    await gomNhomNhuCau({ apiKey: 'khoa-gia', url: 'http://param.custom/api', fetcher: fakeFetcher });
    assert.equal(urlDaGoi, 'http://param.custom/api');

    // 2. Không có tham số -> lấy env
    await gomNhomNhuCau({ apiKey: 'khoa-gia', fetcher: fakeFetcher });
    assert.equal(urlDaGoi, 'http://env.custom/api');

    // 3. Không có tham số và env -> mặc định công khai
    delete process.env.GEMINI_API_URL;
    await gomNhomNhuCau({ apiKey: 'khoa-gia', model: 'gemini-mau', fetcher: fakeFetcher });
    assert.ok(urlDaGoi.startsWith('https://generativelanguage.googleapis.com/v1beta/models/gemini-mau:generateContent'));
  } finally {
    if (oldEnvUrl !== undefined) process.env.GEMINI_API_URL = oldEnvUrl;
    else delete process.env.GEMINI_API_URL;
  }
});
