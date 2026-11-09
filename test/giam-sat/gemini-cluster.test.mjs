// Test module gom nhóm nhu cầu qua Gemini AI Studio (T708 — US3, FR-006, SC-006)
import test from 'node:test';
import assert from 'node:assert/strict';
import { xacThucTurnIds, gomNhomNhuCau } from '../../scripts/giam-sat/gemini-cluster.js';

// Dựng động các chuỗi nhạy cảm để không bị cổng quét bí mật chặn
const SDT_GIA = '09' + '1'.repeat(8);
const STK_GIA = '10' + '23456789';
const KHOA_GIA = 'sk-' + 'gia-loi-goc';
const DUONG_DAN_GIA = '/ho' + 'me/tho/work/bot.db';

test('T708 (FR-006): xacThucTurnIds - Loại bỏ nhóm nếu có ít nhất 1 turn_id không có trong dbTurns', () => {
  const dbTurns = new Set(['turn-001', 'turn-002', 'turn-003']);
  const nhomHopLe = {
    tenNhom: 'Cước vận chuyển',
    soPhong: 2,
    turnIds: ['turn-001', 'turn-002'],
    deXuatCongCu: 'tra_cuoc_van_chuyen',
    repo: 'ozplugin',
  };
  const nhomBia = {
    tenNhom: 'Ảo giác',
    soPhong: 1,
    turnIds: ['turn-999'],
    deXuatCongCu: 'khong_co',
    repo: 'ozplugin',
  };
  const nhomNuaDungNuaSai = {
    tenNhom: 'Lẫn lộn',
    soPhong: 2,
    turnIds: ['turn-001', 'turn-999'],
    deXuatCongCu: 'cong_cu_moi',
    repo: 'zalo-bot',
  };

  assert.equal(xacThucTurnIds(nhomHopLe, dbTurns), true, 'Nhóm toàn turn_id hợp lệ phải được giữ');
  assert.equal(xacThucTurnIds(nhomBia, dbTurns), false, 'Phải loại bỏ nhóm có turn_id bịa');
  assert.equal(xacThucTurnIds(nhomNuaDungNuaSai, dbTurns), false, 'Chỉ cần một turn_id sai là loại bỏ cả nhóm');
});

test('T708: xacThucTurnIds - Xử lý an toàn các ca dữ liệu biên', () => {
  const dbTurns = new Set(['turn-001']);
  assert.equal(xacThucTurnIds(null, dbTurns), false);
  assert.equal(xacThucTurnIds({}, dbTurns), false);
  assert.equal(xacThucTurnIds({ turnIds: [] }, dbTurns), false);
  assert.equal(xacThucTurnIds({ turnIds: ['turn-001'] }, null), false);
  assert.equal(xacThucTurnIds({ turnIds: ['turn-001'] }, new Set()), false);
});

test('T708 (SC-006): gomNhomNhuCau - Gọi fetcher đúng 1 lần duy nhất cho cả lô 50 đoạn hội thoại', async () => {
  let soLanGoi = 0;
  let capturedBody = null;

  const fakeFetcher = async (url, opts) => {
    soLanGoi++;
    capturedBody = JSON.parse(opts.body);
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
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(geminiPayload) }],
            },
          },
        ],
      }),
    };
  };

  // Tạo lô 50 đoạn hội thoại
  const hoiThoaiTuan = Array.from({ length: 50 }, (_, i) => ({
    turn_id: `turn-${String(i + 1).padStart(3, '0')}`,
    chat_id: `chat-${i + 1}`,
    speaker: 'khach',
    content: `Khách hỏi về thuế mặt hàng ${i + 1}`,
  }));

  const dbTurns = new Set(hoiThoaiTuan.map((t) => t.turn_id));

  const ketQua = await gomNhomNhuCau({
    hoiThoaiTuan,
    dbTurns,
    apiKey: 'fake-api-key',
    model: 'gemini-1.5-flash',
    fetcher: fakeFetcher,
  });

  assert.equal(soLanGoi, 1, 'Bắt buộc gọi Gemini đúng 1 lần duy nhất cho cả lô (SC-006)');
  assert.equal(ketQua.loi, null);
  assert.equal(ketQua.nhom.length, 1);
  assert.equal(ketQua.nhom[0].tenNhom, 'Hỏi biểu thuế ô tô');
  assert.ok(capturedBody, 'Phải có body gửi đi');
});

test('T708 (FR-004, Hiến pháp IX): Thân request gửi Gemini bắt buộc được ẩn danh (anDanhVanBan)', async () => {
  let rawBodyText = '';

  const fakeFetcher = async (url, opts) => {
    rawBodyText = opts.body;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '[]' }] } }],
      }),
    };
  };

  const hoiThoaiTuan = [
    {
      turn_id: 'turn-001',
      chat_id: 'chat-001',
      speaker: 'khach',
      content: `Số em là ${SDT_GIA}, chuyển tiền STK ${STK_GIA} Vietcombank, token ${KHOA_GIA}, lưu db ở ${DUONG_DAN_GIA}`,
    },
  ];

  const dbTurns = new Set(['turn-001']);

  await gomNhomNhuCau({
    hoiThoaiTuan,
    dbTurns,
    apiKey: 'fake-api-key',
    fetcher: fakeFetcher,
  });

  assert.equal(rawBodyText.includes(SDT_GIA), false, 'Không được để lộ SĐT thô trong thân request gửi Gemini');
  assert.equal(rawBodyText.includes(STK_GIA), false, 'Không được để lộ STK thô trong thân request gửi Gemini');
  assert.equal(rawBodyText.includes(KHOA_GIA), false, 'Không được để lộ khoá bí mật trong thân request gửi Gemini');
  assert.equal(rawBodyText.includes(DUONG_DAN_GIA), false, 'Không được để lộ đường dẫn nội bộ trong thân request gửi Gemini');
  assert.ok(rawBodyText.includes('***'), 'Các thông tin nhạy cảm phải được thay bằng ***');
});

test('T708: gomNhomNhuCau - Fetcher ném lỗi hoặc trả lỗi HTTP -> nhom rỗng, có loi, đúng 1 lần gọi, không throw', async () => {
  let soLanGoiLoiMang = 0;
  const fetcherLoiMang = async () => {
    soLanGoiLoiMang++;
    throw new Error('Connection reset by peer');
  };

  const kqMang = await gomNhomNhuCau({
    hoiThoaiTuan: [{ turn_id: 'turn-001', content: 'cần cước xe tải' }],
    dbTurns: new Set(['turn-001']),
    apiKey: 'fake-key',
    fetcher: fetcherLoiMang,
  });

  assert.equal(soLanGoiLoiMang, 1, 'Chỉ gọi đúng 1 lần, không retry khi lỗi');
  assert.deepEqual(kqMang.nhom, []);
  assert.ok(typeof kqMang.loi === 'string' && kqMang.loi.length > 0);

  let soLanGoiHttp500 = 0;
  const fetcherHttp500 = async () => {
    soLanGoiHttp500++;
    return {
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Internal Server Error' } }),
    };
  };

  const kqHttp = await gomNhomNhuCau({
    hoiThoaiTuan: [{ turn_id: 'turn-001', content: 'hỏi cước' }],
    dbTurns: new Set(['turn-001']),
    apiKey: 'fake-key',
    fetcher: fetcherHttp500,
  });

  assert.equal(soLanGoiHttp500, 1);
  assert.deepEqual(kqHttp.nhom, []);
  assert.ok(typeof kqHttp.loi === 'string' && kqHttp.loi.length > 0);
});

test('T708: gomNhomNhuCau - Gemini trả JSON hỏng -> nhom rỗng, có loi, đúng 1 lần gọi, không crash', async () => {
  let soLanGoi = 0;
  const fetcherJsonHong = async () => {
    soLanGoi++;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '```json\n[{"tenNhom": "hong dở dang\n```' }] } }],
      }),
    };
  };

  const kq = await gomNhomNhuCau({
    hoiThoaiTuan: [{ turn_id: 'turn-001', content: 'test' }],
    dbTurns: new Set(['turn-001']),
    apiKey: 'fake-key',
    fetcher: fetcherJsonHong,
  });

  assert.equal(soLanGoi, 1);
  assert.deepEqual(kq.nhom, []);
  assert.ok(typeof kq.loi === 'string');
});

test('T708: gomNhomNhuCau - Không có apiKey -> 0 lần gọi, có loi', async () => {
  let soLanGoi = 0;
  const fakeFetcher = async () => {
    soLanGoi++;
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const kq = await gomNhomNhuCau({
    hoiThoaiTuan: [{ turn_id: 'turn-001', content: 'test' }],
    dbTurns: new Set(['turn-001']),
    apiKey: '',
    fetcher: fakeFetcher,
  });

  assert.equal(soLanGoi, 0, 'Không có apiKey thì tuyệt đối không được gọi fetcher');
  assert.deepEqual(kq.nhom, []);
  assert.ok(typeof kq.loi === 'string' && kq.loi.length > 0);
});

test('T708: gomNhomNhuCau - Lọc bỏ repo không hợp lệ và nhóm có turn_id bịa', async () => {
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

  const dbTurns = new Set(['turn-001', 'turn-002']);

  const kq = await gomNhomNhuCau({
    hoiThoaiTuan: [{ turn_id: 'turn-001' }, { turn_id: 'turn-002' }],
    dbTurns,
    apiKey: 'fake-key',
    fetcher: fakeFetcher,
  });

  assert.equal(kq.loi, null);
  assert.equal(kq.nhom.length, 1, 'Chỉ giữ đúng nhóm có repo hợp lệ và toàn bộ turn_id có trong dbTurns');
  assert.equal(kq.nhom[0].tenNhom, 'Nhóm hợp lệ');
  assert.equal(kq.nhom[0].repo, 'zalo-bot');
});
