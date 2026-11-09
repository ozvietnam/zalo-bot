// Test ánh xạ người nói (speaker) cho hệ thống giám sát — T703
// Đảm bảo tinh-hieu.js nhận diện đúng các vai trò từ lõi bot:
//   - 'khach' (khách nhắn vào, core/engine.js)
//   - 'nhan-vien' (nhân viên tiếp quản / tl, core/gate.js)
//   - 'bot' (bot gửi ra)
// Đồng thời duy trì tương thích ngược với dữ liệu cũ ('user', 'staff').
import test from 'node:test';
import assert from 'node:assert/strict';
import { tinhHieu, laKhach, laNhanVien } from '../../scripts/giam-sat/tinh-hieu.js';

const NGAY_TEST = '2026-11-06';
const mocGio = (h, m) => `${NGAY_TEST}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;

// ── 1. Từng tín hiệu với vai trò lõi ('khach', 'nhan-vien', 'bot') ──

test('T703 - XIN-LOI-TAY: phát hiện khi nhân viên ("nhan-vien") xin lỗi ngay sau bot', () => {
  const messages = [
    { chat_id: 'chat-gia-001', speaker: 'bot', text: 'Mã HS là 84151010 ạ', at: mocGio(8, 0) },
    { chat_id: 'chat-gia-001', speaker: 'nhan-vien', text: 'Em xin lỗi anh, mã đúng phải là 84151090', at: mocGio(8, 1) },
  ];
  const ketQua = tinhHieu({ messages, outbox: [], jobs: [], audit: [], ngay: NGAY_TEST });
  const xinLoi = ketQua.find(k => k.ma === 'XIN-LOI-TAY');

  assert.ok(xinLoi, 'Phải phát hiện XIN-LOI-TAY với speaker "nhan-vien"');
  assert.equal(xinLoi.soDo, '1 lần');
  assert.equal(xinLoi.repo, 'zalo-bot');
  assert.equal(xinLoi.bangChung[0].chat_id, 'chat-gia-001');
});

test('T703 - NGUOI-THAY: phát hiện khi nhân viên ("nhan-vien") vào trong 15 phút sau bot ở ≥3 phòng', () => {
  const messages = [];
  for (let i = 1; i <= 3; i++) {
    const cid = `chat-gia-00${i}`;
    messages.push({ chat_id: cid, speaker: 'bot', text: 'Chào anh chị', at: mocGio(9, 0) });
    messages.push({ chat_id: cid, speaker: 'nhan-vien', text: 'Em hỗ trợ tiếp cho anh chị', at: mocGio(9, 10) });
  }
  const ketQua = tinhHieu({ messages, outbox: [], jobs: [], audit: [], ngay: NGAY_TEST });
  const nguoiThay = ketQua.find(k => k.ma === 'NGUOI-THAY');

  assert.ok(nguoiThay, 'Phải phát hiện NGUOI-THAY với speaker "nhan-vien"');
  assert.equal(nguoiThay.soDo, '3 phòng');
  assert.equal(nguoiThay.bangChung.length, 3);
});

test('T703 - HOI-LAI: phát hiện khi khách ("khach") hỏi lại gần giống trong 30 phút sau bot ở ≥3 phòng', () => {
  const messages = [];
  for (let i = 1; i <= 3; i++) {
    const cid = `chat-gia-00${i}`;
    messages.push({ chat_id: cid, speaker: 'khach', text: 'thủ tục nhập khẩu máy bơm nước', at: mocGio(10, 0) });
    messages.push({ chat_id: cid, speaker: 'bot', text: 'Dạ thuế nhập khẩu máy bơm là...', at: mocGio(10, 1) });
    messages.push({ chat_id: cid, speaker: 'khach', text: 'thủ tục nhập khẩu máy bơm nước nhé', at: mocGio(10, 15) });
  }
  const ketQua = tinhHieu({ messages, outbox: [], jobs: [], audit: [], ngay: NGAY_TEST });
  const hoiLai = ketQua.find(k => k.ma === 'HOI-LAI');

  assert.ok(hoiLai, 'Phải phát hiện HOI-LAI với speaker "khach"');
  assert.equal(hoiLai.soDo, '3 phòng');
  assert.equal(hoiLai.bangChung.length, 3);
});

test('T703 - KHACH-BUC: phát hiện câu bực từ khách ("khach") ở ≥2 phòng', () => {
  const messages = [
    { chat_id: 'chat-gia-001', speaker: 'khach', text: 'chả hiểu bot trả lời kiểu gì', at: mocGio(11, 0) },
    { chat_id: 'chat-gia-002', speaker: 'khach', text: 'bot à, lần thứ 2 tôi hỏi rồi', at: mocGio(11, 30) },
  ];
  const ketQua = tinhHieu({ messages, outbox: [], jobs: [], audit: [], ngay: NGAY_TEST });
  const khachBuc = ketQua.find(k => k.ma === 'KHACH-BUC');

  assert.ok(khachBuc, 'Phải phát hiện KHACH-BUC với speaker "khach"');
  assert.equal(khachBuc.soDo, '2 phòng');
  assert.equal(khachBuc.bangChung.length, 2);
});

// ── 2. Ca phủ định: dữ liệu đúng vai nhưng dưới ngưỡng thì không bật (0 phát hiện thừa) ──

test('T703 - Phủ định: đúng vai nhưng dưới ngưỡng không được kích hoạt tín hiệu', () => {
  const messages = [
    // NGUOI-THAY chỉ có 2 phòng (ngưỡng min: 3)
    { chat_id: 'chat-gia-001', speaker: 'bot', text: 'Trả lời 1', at: mocGio(8, 0) },
    { chat_id: 'chat-gia-001', speaker: 'nhan-vien', text: 'Hỗ trợ 1', at: mocGio(8, 5) },
    { chat_id: 'chat-gia-002', speaker: 'bot', text: 'Trả lời 2', at: mocGio(8, 0) },
    { chat_id: 'chat-gia-002', speaker: 'nhan-vien', text: 'Hỗ trợ 2', at: mocGio(8, 5) },

    // HOI-LAI chỉ có 2 phòng (ngưỡng min: 3)
    { chat_id: 'chat-gia-003', speaker: 'khach', text: 'thuế nhập khẩu ô tô', at: mocGio(9, 0) },
    { chat_id: 'chat-gia-003', speaker: 'bot', text: 'Thuế là 50%', at: mocGio(9, 1) },
    { chat_id: 'chat-gia-003', speaker: 'khach', text: 'thuế nhập khẩu ô tô là bao nhiêu', at: mocGio(9, 10) },
    { chat_id: 'chat-gia-004', speaker: 'khach', text: 'hàng mỹ phẩm cần giấy tờ gì', at: mocGio(9, 0) },
    { chat_id: 'chat-gia-004', speaker: 'bot', text: 'Cần phiếu công bố', at: mocGio(9, 1) },
    { chat_id: 'chat-gia-004', speaker: 'khach', text: 'hàng mỹ phẩm cần giấy tờ gì vậy', at: mocGio(9, 10) },

    // KHACH-BUC chỉ có 1 phòng (ngưỡng min: 2)
    { chat_id: 'chat-gia-005', speaker: 'khach', text: 'chả hiểu bot trả lời gì', at: mocGio(10, 0) },

    // XIN-LOI-TAY không có (nhân viên vào sau > 15 phút và không xin lỗi)
    { chat_id: 'chat-gia-006', speaker: 'bot', text: 'Chào bạn', at: mocGio(11, 0) },
    { chat_id: 'chat-gia-006', speaker: 'nhan-vien', text: 'Dạ em chào anh, em là chuyên viên OZ', at: mocGio(11, 30) },
  ];

  const ketQua = tinhHieu({ messages, outbox: [], jobs: [], audit: [], ngay: NGAY_TEST });
  const bonTinHieu = ketQua.filter(k => ['XIN-LOI-TAY', 'NGUOI-THAY', 'HOI-LAI', 'KHACH-BUC'].includes(k.ma));

  assert.equal(bonTinHieu.length, 0, 'Dưới ngưỡng thì không được kích hoạt tín hiệu nào trong 4 tín hiệu');
});

// ── 3. Test khoá tương thích ngược: dữ liệu cũ 'user' và 'staff' vẫn cho cùng kết quả ──

test('T703 - Tương thích ngược: dữ liệu lịch sử dùng "user" và "staff" vẫn hoạt động chuẩn xác', () => {
  const messages = [
    // XIN-LOI-TAY với staff
    { chat_id: 'chat-gia-101', speaker: 'bot', text: 'Tra cứu xong', at: mocGio(8, 0) },
    { chat_id: 'chat-gia-101', speaker: 'staff', text: 'xin lỗi gửi nhầm anh nhé', at: mocGio(8, 1) },

    // NGUOI-THAY với staff (3 phòng)
    { chat_id: 'chat-gia-102', speaker: 'bot', text: 'Bot chào', at: mocGio(9, 0) },
    { chat_id: 'chat-gia-102', speaker: 'staff', text: 'Staff vào', at: mocGio(9, 5) },
    { chat_id: 'chat-gia-103', speaker: 'bot', text: 'Bot chào', at: mocGio(9, 0) },
    { chat_id: 'chat-gia-103', speaker: 'staff', text: 'Staff vào', at: mocGio(9, 5) },
    { chat_id: 'chat-gia-104', speaker: 'bot', text: 'Bot chào', at: mocGio(9, 0) },
    { chat_id: 'chat-gia-104', speaker: 'staff', text: 'Staff vào', at: mocGio(9, 5) },

    // HOI-LAI với user (3 phòng)
    { chat_id: 'chat-gia-105', speaker: 'user', text: 'cho tôi hỏi cước vận chuyển', at: mocGio(10, 0) },
    { chat_id: 'chat-gia-105', speaker: 'bot', text: 'Cước vận chuyển là...', at: mocGio(10, 1) },
    { chat_id: 'chat-gia-105', speaker: 'user', text: 'cho tôi hỏi cước vận chuyển nhé', at: mocGio(10, 15) },
    { chat_id: 'chat-gia-106', speaker: 'user', text: 'thủ tục nhập khẩu quạt điện', at: mocGio(10, 0) },
    { chat_id: 'chat-gia-106', speaker: 'bot', text: 'Cần kiểm tra chất lượng...', at: mocGio(10, 1) },
    { chat_id: 'chat-gia-106', speaker: 'user', text: 'thủ tục nhập khẩu quạt điện ạ', at: mocGio(10, 15) },
    { chat_id: 'chat-gia-107', speaker: 'user', text: 'thuế nhập khẩu gỗ thông xẻ', at: mocGio(10, 0) },
    { chat_id: 'chat-gia-107', speaker: 'bot', text: 'Thuế là 0%', at: mocGio(10, 1) },
    { chat_id: 'chat-gia-107', speaker: 'user', text: 'thuế nhập khẩu gỗ thông xẻ nhé', at: mocGio(10, 15) },

    // KHACH-BUC với user (2 phòng)
    { chat_id: 'chat-gia-108', speaker: 'user', text: 'bot à người hay máy thế', at: mocGio(11, 0) },
    { chat_id: 'chat-gia-109', speaker: 'user', text: 'không hiểu kiểu gì luôn', at: mocGio(11, 10) },
  ];

  const ketQua = tinhHieu({ messages, outbox: [], jobs: [], audit: [], ngay: NGAY_TEST });

  assert.ok(ketQua.find(k => k.ma === 'XIN-LOI-TAY'), 'Legacy: phải có XIN-LOI-TAY');
  assert.ok(ketQua.find(k => k.ma === 'NGUOI-THAY'), 'Legacy: phải có NGUOI-THAY');
  assert.ok(ketQua.find(k => k.ma === 'HOI-LAI'), 'Legacy: phải có HOI-LAI');
  assert.ok(ketQua.find(k => k.ma === 'KHACH-BUC'), 'Legacy: phải có KHACH-BUC');
});

// ── 4. Test hàm helper laKhach, laNhanVien nhận cả object lẫn chuỗi ──

test('T703 - Helper: laKhach và laNhanVien nhận an toàn cả đối tượng lẫn chuỗi vai trò', () => {
  // laKhach
  assert.equal(laKhach({ speaker: 'khach' }), true);
  assert.equal(laKhach({ speaker: 'user' }), true);
  assert.equal(laKhach('khach'), true);
  assert.equal(laKhach('user'), true);
  assert.equal(laKhach({ speaker: 'bot' }), false);
  assert.equal(laKhach({ speaker: 'nhan-vien' }), false);
  assert.equal(laKhach({ speaker: 'staff' }), false);
  assert.equal(laKhach(null), false);
  assert.equal(laKhach(undefined), false);
  assert.equal(laKhach(''), false);

  // laNhanVien
  assert.equal(laNhanVien({ speaker: 'nhan-vien' }), true);
  assert.equal(laNhanVien({ speaker: 'staff' }), true);
  assert.equal(laNhanVien('nhan-vien'), true);
  assert.equal(laNhanVien('staff'), true);
  assert.equal(laNhanVien({ speaker: 'bot' }), false);
  assert.equal(laNhanVien({ speaker: 'khach' }), false);
  assert.equal(laNhanVien({ speaker: 'user' }), false);
  assert.equal(laNhanVien(null), false);
  assert.equal(laNhanVien(undefined), false);
  assert.equal(laNhanVien(''), false);
});

// ── 5. Kiểm tra độ phủ cho các giá trị rỗng, null, undefined và thiếu trường ──

test('T703 - Độ phủ giá trị rỗng, null và trường bị thiếu cho helpers và tinhHieu', () => {
  // Đối tượng rỗng hoặc speaker mang giá trị bất thường
  assert.equal(laKhach({}), false);
  assert.equal(laKhach({ speaker: null }), false);
  assert.equal(laKhach({ speaker: undefined }), false);
  assert.equal(laKhach({ speaker: '' }), false);
  assert.equal(laKhach(0), false);
  assert.equal(laKhach(false), false);
  assert.equal(laKhach([]), false);

  assert.equal(laNhanVien({}), false);
  assert.equal(laNhanVien({ speaker: null }), false);
  assert.equal(laNhanVien({ speaker: undefined }), false);
  assert.equal(laNhanVien({ speaker: '' }), false);
  assert.equal(laNhanVien(0), false);
  assert.equal(laNhanVien(false), false);
  assert.equal(laNhanVien([]), false);

  // tinhHieu hoạt động ổn định khi tin nhắn thiếu speaker, text rỗng hoặc text null
  const messagesRongNull = [
    { chat_id: 'chat-gia-201' },
    { chat_id: 'chat-gia-201', speaker: null, text: null, at: mocGio(8, 0) },
    { chat_id: 'chat-gia-201', speaker: undefined, text: '', at: mocGio(8, 1) },
    { chat_id: 'chat-gia-201', speaker: 'khach', text: null, at: mocGio(8, 2) },
    { chat_id: 'chat-gia-201', speaker: 'nhan-vien', text: undefined, at: mocGio(8, 3) },
    { chat_id: 'chat-gia-201', speaker: 'bot', text: '', at: mocGio(8, 4) },
  ];

  assert.doesNotThrow(() => {
    const ketQua = tinhHieu({ messages: messagesRongNull, outbox: [], jobs: [], audit: [], ngay: NGAY_TEST });
    assert.ok(Array.isArray(ketQua));
    assert.equal(ketQua.length, 0, 'Tin rỗng/null không kích hoạt tín hiệu giả mạo');
  });
});

// ── 6. Kiểm tra loại bỏ ánh xạ thừa bot_out trong scripts/giam-sat.mjs (T703) ──

test('T703 - scripts/giam-sat.mjs: loại bỏ hoàn toàn ánh xạ thừa bot_out', async () => {
  const { readFileSync } = await import('node:fs');
  const code = readFileSync(new URL('../../scripts/giam-sat.mjs', import.meta.url), 'utf8');
  assert.equal(code.includes('bot_out'), false, 'scripts/giam-sat.mjs không được chứa ánh xạ thừa bot_out');
});
