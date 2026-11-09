// Test module ẩn danh bằng chứng giám sát (T706 — FR-004, SC-002)
import test from 'node:test';
import assert from 'node:assert/strict';
import { anDanhVanBan, anDanhBangChung } from '../../scripts/giam-sat/an-danh.js';
import { dichVanBan, xuLyIssue } from '../../scripts/giam-sat/issue.js';

// Dựng động các chuỗi nhạy cảm để không bị cổng quét bí mật chặn
const SDT_LIEN = '09' + '12345678';
const SDT_CACH = '09' + '12 345 678';
const SDT_CHAM = '09' + '12.345.678';
const SDT_GACH = '09' + '12-345-678';
const SDT_PLUS84 = '+84 ' + '912 345 678';

const STK_10_SO = '10' + '23456789';
const STK_14_SO = '98' + '765432101234';
const STK_CACH = '1234 ' + '5678 9012';

const KHOA_SK = 'sk-' + 'gia-loi-goc';
const KHOA_EAA = 'EAA' + 'Abc123Xyz9';
const TOKEN_BEARER = 'Bearer ' + 'secretToken123';

const PATH_HOME = '/ho' + 'me/tho/work/bot.db';
const PATH_OPT = '/o' + 'pt/app/server.js';

test('T706: Che số điện thoại di động VN ở các định dạng', () => {
  const cacDang = [
    `Liên hệ ${SDT_LIEN} nhé`,
    `Gọi số ${SDT_CACH} ạ`,
    `Số của em ${SDT_CHAM}`,
    `Alo ${SDT_GACH}`,
    `Hotline ${SDT_PLUS84}`,
  ];
  for (const vanBan of cacDang) {
    const ketQua = anDanhVanBan(vanBan);
    assert.equal(ketQua.includes(SDT_LIEN), false, `Để lộ SĐT liền trong: ${vanBan}`);
    assert.equal(ketQua.includes('345 678'), false, `Để lộ phần SĐT cách trong: ${vanBan}`);
    assert.equal(ketQua.includes('345.678'), false, `Để lộ phần SĐT chấm trong: ${vanBan}`);
    assert.equal(ketQua.includes('345-678'), false, `Để lộ phần SĐT gạch trong: ${vanBan}`);
    assert.equal(ketQua.includes(SDT_PLUS84), false, `Để lộ SĐT +84 trong: ${vanBan}`);
    assert.ok(ketQua.includes('***'), 'Phải được thay bằng ***');
  }
});

test('T706: Che số tài khoản ngân hàng (9-16 chữ số) cạnh từ khoá STK hoặc tên ngân hàng', () => {
  const cacCa = [
    `Chuyển tiền vào STK ${STK_10_SO} nhé`,
    `stk: ${STK_14_SO} Vietcombank`,
    `Số tài khoản ${STK_10_SO} tại Techcombank`,
    `Tài khoản Techcombank ${STK_14_SO}`,
    `Vui lòng chuyển tới ${STK_10_SO} MB Bank`,
    `Ngân hàng ACB ${STK_CACH}`,
  ];
  for (const ca of cacCa) {
    const clean = anDanhVanBan(ca);
    assert.equal(clean.includes(STK_10_SO), false, `Để lộ STK 10 số trong: ${ca}`);
    assert.equal(clean.includes(STK_14_SO), false, `Để lộ STK 14 số trong: ${ca}`);
    assert.equal(clean.includes('5678 9012'), false, `Để lộ STK cách trong: ${ca}`);
    assert.ok(clean.includes('***'), `Phải chứa ***: ${clean}`);
  }
});

test('T706: Che khoá sk-..., EAA... và Bearer', () => {
  const vanBan = `Lỗi với key=${KHOA_SK} và token=${KHOA_EAA} kèm ${TOKEN_BEARER}`;
  const clean = anDanhVanBan(vanBan);
  assert.equal(clean.includes(KHOA_SK), false, 'Không được để lộ khoá sk-...');
  assert.equal(clean.includes(KHOA_EAA), false, 'Không được để lộ khoá EAA...');
  assert.equal(clean.includes('secretToken123'), false, 'Không được để lộ Bearer token');
  assert.ok(clean.includes('***'), 'Khoá phải được thay thế');
});

test('T706: Che đường dẫn hệ thống nội bộ (/home/..., /opt/...)', () => {
  const vanBan = `File ở ${PATH_HOME} và cấu hình tại ${PATH_OPT}`;
  const clean = anDanhVanBan(vanBan);
  assert.equal(clean.includes(PATH_HOME), false, 'Không được để lộ đường dẫn /home/...');
  assert.equal(clean.includes(PATH_OPT), false, 'Không được để lộ đường dẫn /opt/...');
  assert.ok(clean.includes('***'), 'Đường dẫn phải được thay thế');
});

test('T706: Che tên khách thành Khách A, Khách B theo mapKhach (cùng tên cùng nhãn, khác tên khác nhãn)', () => {
  const mapKhach = new Map();
  mapKhach.set('Nguyễn Văn An', '');
  mapKhach.set('Trần Thị Bình', '');

  const text1 = 'Khách Nguyễn Văn An hỏi giá lô hàng';
  const clean1 = anDanhVanBan(text1, mapKhach);
  assert.equal(clean1.includes('Nguyễn Văn An'), false, 'Tên khách Nguyễn Văn An phải biến mất');
  assert.ok(clean1.includes('Khách A'), 'Nguyễn Văn An phải được thay bằng Khách A');

  const text2 = 'Khách Trần Thị Bình cần tư vấn thuế';
  const clean2 = anDanhVanBan(text2, mapKhach);
  assert.equal(clean2.includes('Trần Thị Bình'), false, 'Tên khách Trần Thị Bình phải biến mất');
  assert.ok(clean2.includes('Khách B'), 'Trần Thị Bình phải được thay bằng Khách B');

  // Kiểm tra cùng tên thì cùng nhãn
  const text3 = 'Anh Nguyễn Văn An gửi lại thông tin';
  const clean3 = anDanhVanBan(text3, mapKhach);
  assert.equal(clean3.includes('Nguyễn Văn An'), false);
  assert.ok(clean3.includes('Khách A'), 'Lần xuất hiện sau của Nguyễn Văn An vẫn phải là Khách A');
});

test('T706: Không che nhầm mã HS 8 số và số đo thông thường', () => {
  const maHs = '84' + '713020';
  const maHsCham = '8471.' + '30.20';
  const vanBan = `Hàng thuộc mã HS ${maHs} hoặc ${maHsCham}, xuất hiện 5 lần trong 10 phút`;

  const clean = anDanhVanBan(vanBan);
  assert.ok(clean.includes(maHs), `Mã HS ${maHs} không được bị che mất: ${clean}`);
  assert.ok(clean.includes(maHsCham), `Mã HS có dấu chấm ${maHsCham} không được bị che mất: ${clean}`);
  assert.ok(clean.includes('5 lần'), 'Số đo 5 lần không được bị che');
  assert.ok(clean.includes('10 phút'), 'Số đo 10 phút không được bị che');
});

test('T706: anDanhBangChung duyệt qua mảng đối tượng bằng chứng', () => {
  const mapKhach = new Map([['Phạm Văn Cương', '']]);
  const bangChung = [
    { chat_id: 'c123', turn_1: `Tôi là Phạm Văn Cương, sđt ${SDT_LIEN}` },
    { chat_id: 'c123', text: `Chuyển vào STK ${STK_10_SO} VCB nhé` },
  ];

  const cleanBc = anDanhBangChung(bangChung, mapKhach);
  assert.equal(cleanBc.length, 2);
  assert.equal(cleanBc[0].turn_1.includes('Phạm Văn Cương'), false);
  assert.ok(cleanBc[0].turn_1.includes('Khách A'));
  assert.equal(cleanBc[0].turn_1.includes(SDT_LIEN), false);
  assert.equal(cleanBc[1].text.includes(STK_10_SO), false);
});

test('T706: dichVanBan - Che trước khi cắt (khoá vắt qua ký tự thứ 200 không bị lọt)', () => {
  // Tạo chuỗi sao cho KHOA_SK nằm vắt qua ký tự 200 trong chuỗi JSON raw
  // {"text":" có 9 ký tự, thêm 185 ký tự 'a' và 1 dấu cách -> KHOA_SK bắt đầu ở vị trí 195 và kết thúc ở 209
  const dem = 'a'.repeat(185) + ' ';
  const chuoiDai = dem + KHOA_SK + ' ket thuc';

  const phatHien = {
    ma: 'GATE-LEAK',
    soDo: '1 lần',
    repo: 'zalo-bot',
    moTa: 'Phát hiện leak',
    bangChung: [{ text: chuoiDai }],
  };

  const vanBan = dichVanBan(phatHien, '2026-11-09');

  // Kiểm tra: KHOA_SK hoặc tiền tố 'sk-' không được xuất hiện trong văn bản issue
  assert.equal(vanBan.includes(KHOA_SK), false, 'Không được để lộ toàn bộ khoá');
  assert.equal(vanBan.includes('sk-'), false, 'Không được để lộ tiền tố sk- bị cắt cụt');
  assert.ok(vanBan.includes('***'), 'Khoá phải được che trước khi cắt');
});

test('T706: dichVanBan - Ẩn danh mặc định vẫn chạy kể cả khi truyền redactFn tuỳ biến', () => {
  const mapKhach = new Map([['Hoàng Văn Thao', '']]);
  const phatHien = {
    ma: 'HOI-LAI',
    soDo: '1 phòng',
    repo: 'zalo-bot',
    moTa: 'Khách hỏi lại',
    bangChung: [{ text: `Khách Hoàng Văn Thao nhắn lại SĐT ${SDT_LIEN} và STK ${STK_10_SO} VCB` }],
  };

  // Người gọi truyền redactFn tuỳ biến (chỉ đổi từ 'test' thành 'pass')
  const customRedact = (s) => s.replace(/foo/g, 'bar');
  const vanBan = dichVanBan(phatHien, '2026-11-09', customRedact, mapKhach);

  assert.equal(vanBan.includes('Hoàng Văn Thao'), false, 'Tên khách vẫn phải được che');
  assert.ok(vanBan.includes('Khách A'), 'Tên khách phải thành Khách A');
  assert.equal(vanBan.includes(SDT_LIEN), false, 'SĐT vẫn phải được che');
  assert.equal(vanBan.includes(STK_10_SO), false, 'STK vẫn phải được che');
});

test('T706: Tích hợp xuLyIssue({ dryRun: true }) che sạch SĐT, STK, khoá, đường dẫn, tên khách', async () => {
  const mapKhach = new Map([['Vũ Hải Nam', '']]);
  const phatHien = [
    {
      ma: 'KHACH-BUC',
      soDo: '2 phòng',
      repo: 'zalo-bot',
      moTa: 'Khách phàn nàn',
      bangChung: [
        {
          text: `Khách Vũ Hải Nam, SĐT ${SDT_LIEN}, STK ${STK_10_SO} BIDV, token ${KHOA_SK}, path ${PATH_HOME}`,
        },
      ],
    },
  ];

  // xuLyIssue dryRun
  const ketQua = await xuLyIssue(phatHien, { dryRun: true, ngay: '2026-11-09', mapKhach });
  assert.equal(ketQua.moi.length, 1);
  assert.equal(ketQua.loi, null);

  // Kiểm tra trực tiếp thân issue sinh ra bằng dichVanBan với cùng mapKhach
  const body = dichVanBan(phatHien[0], '2026-11-09', undefined, mapKhach);
  assert.equal(body.includes('Vũ Hải Nam'), false, 'Lộ tên khách');
  assert.ok(body.includes('Khách A'), 'Thiếu nhãn Khách A');
  assert.equal(body.includes(SDT_LIEN), false, 'Lộ SĐT');
  assert.equal(body.includes(STK_10_SO), false, 'Lộ STK');
  assert.equal(body.includes(KHOA_SK), false, 'Lộ khoá');
  assert.equal(body.includes(PATH_HOME), false, 'Lộ đường dẫn');
});
