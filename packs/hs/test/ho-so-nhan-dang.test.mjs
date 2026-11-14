// Lớp nhận dạng và bộ lọc tạp âm của hồ sơ mặt hàng: dựng lại từ lịch sử bẩn, chú thích ảnh
// đàm thoại, câu hỏi tiếp của khách, món khác ([S5], [S13], [S15], [S16]).
// Tách khỏi `ho-so.test.mjs` (Điều VI: mỗi tệp một trách nhiệm, dưới 300 dòng).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hoSoRong, themChu, themAnh, themTinTiep, moTaGop, dungTuLichSu, locTapAmAnh } from '../ho-so.js';
import { laMonKhac, cungMonVoi } from '../nhan-dang.js';

const MO_TA = 'Chốt kẹp xoay 1/4 vòng loại núm thấp, mã QCTHL0525-10S, cố định vỏ máy và cửa bảo vệ';
const ANH_ON_OFF = { tenHang: 'Núm vặn khoá bật tắt ON OFF', chatLieu: 'thép không gỉ + núm nhựa ABS', chuTrongAnh: 'ON OFF' };

test('[S13] dựng lại từ lịch sử BẨN: "@bot", menu, chọn gói, lời chào, nhờ việc khác không vào tên hàng', () => {
  // Người soát đo: `dungTuLichSu` chỉ lọc `laLenhTroHoSo`, bỏ sót `laLenhCauTruc`/`laTenHangCam` mà
  // bản vá đã thêm cho đường sống (lớp lỗi S3 chưa áp cho đường dựng lại). Lõi ghi tin "@bot" trơ
  // trọi vào sổ ĐÚNG NGUYÊN VĂN (core/engine.js, nhánh `chiNhacTen`) nên lịch sử có hẳn dòng "@bot".
  // Mô tả bẩn đi Cổng làm lệch mã/thuế (Hiến pháp Điều III).
  const history = [
    { speaker: 'khach', text: MO_TA, at: '2026-11-10T02:58:00Z' },
    { speaker: 'khach', text: '@bot', at: '2026-11-10T03:00:00Z' },
    { speaker: 'khach', text: 'menu', at: '2026-11-10T03:01:00Z' },
    { speaker: 'khach', text: '4', at: '2026-11-10T03:02:00Z' },
    { speaker: 'khach', text: 'xin chào', at: '2026-11-10T03:03:00Z' },
    { speaker: 'khach', text: 'soát tờ khai của em', at: '2026-11-10T03:04:00Z' },
  ];
  const ten = (h) => (/^Tên hàng: (.*)$/m.exec(moTaGop(h)) ?? [, ''])[1];

  const t1 = ten(dungTuLichSu(history, { sua: ['xem lại toàn bộ thông tin khách gửi từ đầu tới cuối'] }));
  assert.match(t1, /^Chốt kẹp xoay/, `tên hàng phải là món của khách: "${t1}"`);
  for (const rac of [/@bot/, /\bmenu\b/i, /— 4\b/, /xin ch[aà]o/i, /t[oờ] khai/i]) {
    assert.doesNotMatch(t1, rac, `lệnh/chữ cấu trúc bị nhồi vào tên hàng gửi Cổng: "${t1}"`);
  }
  // Chính câu khách vừa gõ thì GIỮ nguyên văn ở mục "(khách nói thêm: …)" — không được rụng chữ của
  // khách. Chốt ở đây là: nó không được lẫn vào phần TÊN HÀNG (phần trước dấu ngoặc).
  assert.doesNotMatch(t1.replace(/\s*\(khách nói thêm:[\s\S]*$/, ''), /xem l[aạ]i/i,
    `lệnh "xem lại" bị nhồi vào tên hàng: "${t1}"`);
  // Dữ kiện THẬT của cùng món thì vẫn phải gộp vào mô tả, không bị lọc oan.
  const t2 = ten(dungTuLichSu([...history,
    { speaker: 'khach', text: 'chốt kẹp này bằng thép không gỉ, núm nhựa ABS', at: '2026-11-10T03:05:00Z' }]));
  assert.match(t2, /^Chốt kẹp xoay/);
  assert.match(moTaGop(dungTuLichSu([...history,
    { speaker: 'khach', text: 'chốt kẹp này bằng thép không gỉ, núm nhựa ABS', at: '2026-11-10T03:05:00Z' }])),
  /thép không gỉ/, 'dữ kiện thật của cùng món vẫn phải vào hồ sơ');
});

test('[S15] chú thích ảnh ĐÀM THOẠI không được nối vào tên hàng gửi Cổng', () => {
  // Người soát đo (quyết thay CEO): `themAnh` nối THẲNG chú thích vào `moTa` qua `themChu`
  // (ho-so.js:260), bỏ qua luật mà `themTinTiep`/`dungTuLichSu` đã có. Nặng nhất là chú thích so
  // sánh bên lề ("giống công tắc điện"): nó bơm đúng từ khoá hàng ĐIỆN vào mô tả gửi Cổng — chính
  // cơ chế đã đẩy issue #170 ra mã 8538.90. Lệch mã là lệch thuế (Hiến pháp Điều III).
  const ten = (h) => (/^Tên hàng: (.*)$/m.exec(moTaGop(h)) ?? [, ''])[1];
  const TAP_AM = [
    ['cần gấp nhé anh, ảnh hơi mờ em chụp lại sau', [/c[aầ]n g[aấ]p/i, /[aả]nh.*m[oờ]/i, /ch[uụ]p l[aạ]i/i]],
    ['em gửi ảnh lúc 10h03, cái này giống công tắc điện nhưng không phải', [/10h03/, /gi[oố]ng/i, /c[oô]ng t[aắ]c/i, /đi[eệ]n/i]],
    ['ảnh mờ quá anh thông cảm, chiều nay em cần báo giá', [/th[oô]ng c[aả]m/i, /chi[eề]u nay/i, /b[aá]o gi[aá]/i]],
    ['cái này giống công tắc trên tủ điện nhà em ấy', [/gi[oố]ng/i, /t[uủ] đi[eệ]n/i, /nh[aà] em/i]],
  ];
  for (const [cap, racs] of TAP_AM) {
    const h = themAnh(themChu(hoSoRong(), MO_TA), ANH_ON_OFF, cap);
    const m = moTaGop(h);
    const t = ten(h);
    assert.match(t, /^Chốt kẹp xoay/, `tên hàng phải là món của khách, chú thích "${cap}" → "${t}"`);
    for (const rac of racs) {
      assert.doesNotMatch(m, rac, `tạp âm chú thích ảnh vào mô tả gửi Cổng: "${cap}" → ${JSON.stringify(m)}`);
    }
  }
  // Chú thích MANG dữ kiện thật thì vẫn phải vào hồ sơ — không lọc quá tay.
  const nhan = themAnh(themChu(hoSoRong(), MO_TA), ANH_ON_OFF, 'chất liệu: thép không gỉ, núm nhựa ABS');
  assert.match(moTaGop(nhan), /thép không gỉ/, 'chú thích theo nhãn phải vào hồ sơ');
  const lanLon = themAnh(themChu(hoSoRong(), MO_TA), ANH_ON_OFF, 'ảnh hơi mờ nhé anh, chất liệu thép không gỉ, núm nhựa ABS');
  assert.match(moTaGop(lanLon), /thép không gỉ/, 'dữ kiện nằm cùng câu với tạp âm vẫn phải giữ');
  assert.doesNotMatch(moTaGop(lanLon), /m[oờ]/i, 'mệnh đề tạp âm trong cùng chú thích vẫn phải bỏ');
  const ma = themAnh(hoSoRong(), { chatLieu: 'thép' }, 'mã QCTHL0525-10S, gửi gấp giúp em nhé');
  assert.match(moTaGop(ma), /QCTHL0525-10S/, 'mã/model riêng trong chú thích phải giữ');
  assert.doesNotMatch(moTaGop(ma), /g[uử]i g[aấ]p/i, 'lời nhờ trong cùng chú thích phải bỏ');
});

test('[S16] laMonKhac: câu hỏi tiếp / tạp âm hội thoại KHÔNG phải món khác', () => {
  // Người soát đo 4 câu dưới đây đều ra `laMonKhac=true`, nên nhánh `index.js:100` xoá hồ sơ rồi
  // tra trên chính câu đó: `tenHang` gửi Cổng thành "hàng này nhập từ Trung Quốc về bán lẻ" và bot
  // gắn mã HS + số thuế vào một thứ KHÔNG phải mặt hàng (Điều III, VIII; phạm yêu cầu 1, 2, 5).
  // Nguyên nhân gốc: `ho-so.js:174` lấy `TU_CHUNG` (tập từ cần LOẠI khi so khớp: "hàng", "bán",
  // "cho", "mới"…) làm phép thử "tin có gọi tên một vật" — nghĩa trái ngược, nên gần như luôn đúng.
  const h = themChu(hoSoRong(), MO_TA);
  const KHONG_PHAI_MON_KHAC = [
    'ảnh hơi mờ anh thông cảm',
    'bên em nhập hàng này về bán lẻ ạ',
    'gửi lại giúp em thông tin thuế nhé',
    'anh ơi cho em hỏi thêm thông tin gì nữa không',
    'hàng này em nhập từ Trung Quốc về bán lẻ ạ',
    'thuế nhập khẩu bao nhiêu phần trăm ạ',
    'cái này em cần gấp, chiều nay báo giá giúp em với',
    'chữ on/off là đóng mở, không liên quan dòng điện',
  ];
  for (const s of KHONG_PHAI_MON_KHAC) {
    assert.equal(laMonKhac(s, h), false, `câu hỏi tiếp/tạp âm bị nhận là món khác: "${s}"`);
  }
  // Chốt ngược: món khác HẲN thì vẫn phải nhận ra, nếu không khách mất đường thoát (ca [S3]).
  const LA_MON_KHAC = [
    'hàng mới: máy bơm nước ly tâm 1.5kW, thân gang',
    'máy bơm nước ly tâm 1.5kW, thân gang, bơm nước sinh hoạt',
    'bút bi vỏ nhựa mực xanh, ngòi 0.5mm, dùng để viết',
  ];
  for (const s of LA_MON_KHAC) {
    assert.equal(laMonKhac(s, h), true, `món khác hẳn không được nhận ra: "${s}"`);
  }
});

test('[S16] tin CHỮ cũng phải qua bộ lọc tạp âm, không chỉ chú thích ảnh', () => {
  // `locTapAmAnh` (ho-so.js:242) lọc đúng nhưng chỉ áp cho chú thích ảnh: cùng câu tạp âm gõ bằng
  // TIN CHỮ vẫn đi `themSua` → `(khách nói thêm: …)`, mà `moTaGop` in mục đó CÙNG DÒNG `Tên hàng:`.
  // Đúng lớp lỗi [S15] ở đường khác.
  const ten = (h) => (/^Tên hàng: (.*)$/m.exec(moTaGop(h)) ?? [, ''])[1];
  const h = themChu(hoSoRong(), MO_TA);
  for (const [s, racs] of [
    ['ảnh hơi mờ anh thông cảm, em chụp lại sau nhé', [/m[oờ]/i, /th[oô]ng c[aả]m/i, /ch[uụ]p l[aạ]i/i]],
    ['cái này giống công tắc điện trên tủ điện nhà em', [/gi[oố]ng/i, /c[oô]ng t[aắ]c/i]],
    ['em cần gấp, chiều nay báo giá giúp em với', [/c[aầ]n g[aấ]p/i, /b[aá]o gi[aá]/i]],
  ]) {
    const t = ten(themTinTiep(h, s));
    assert.match(t, /^Chốt kẹp xoay/, `tên hàng phải là món của khách: "${t}"`);
    for (const rac of racs) assert.doesNotMatch(t, rac, `tạp âm tin chữ vào tên hàng gửi Cổng: "${s}" → "${t}"`);
  }
  // Chốt ngược 1: câu SỬA thật của khách (yêu cầu 4 của issue cần nó) KHÔNG được lọc mất, dù mệnh
  // đề đầu không chứa từ hàng hoá nào. Đây là lý do tin chữ lọc NHẸ hơn chú thích ảnh.
  const sua = themTinTiep(h, 'chữ on/off là đóng mở, không liên quan dòng điện');
  assert.match(moTaGop(sua), /đóng mở/i, 'câu sửa của khách phải tới Cổng');
  assert.match(moTaGop(sua), /dòng điện/i, 'câu sửa của khách phải tới Cổng nguyên văn');
  // Chốt ngược 2: dữ kiện thật của cùng món vẫn gộp vào mô tả.
  assert.match(moTaGop(themTinTiep(h, 'chốt kẹp này bằng thép không gỉ, núm nhựa ABS')), /thép không gỉ/);
});

test('[S16] câu hội thoại KHÔNG được vào hồ sơ (không nằm trong mục "khách nói thêm")', () => {
  // Người soát đo đo được: 4 câu hỏi tiếp + 1 câu giao hàng đều làm `tenHang` gửi Cổng mang
  // câu hội thoại ("hàng này nhập từ Trung Quốc về bán lẻ"). Mục "khách nói thêm" in CÙNG DÒNG
  // `Tên hàng:` (`moTaGop`) nên câu rác ở đó vẫn đi tới Cổng. Chốt ở đây: câu KHÔNG nói gì về
  // mặt hàng thì rời khỏi hồ sơ hẳn (chỉ còn ở `chuThichBoQua` để đối chiếu), KHÔNG đi vào mục
  // "khách nói thêm" — vì mục đó là đường bơm từ khoá sai vào tên hàng (Hiến pháp Điều III).
  const h0 = themChu(hoSoRong(), MO_TA);
  const TAP_AM = [
    'ảnh hơi mờ anh thông cảm',
    'bên em nhập hàng này về bán lẻ ạ',
    'gửi lại giúp em thông tin thuế nhé',
    'anh ơi cho em hỏi thêm thông tin gì nữa không',
    'hàng này em nhập từ Trung Quốc về bán lẻ ạ',
  ];
  for (const s of TAP_AM) {
    const h = themTinTiep(h0, s);
    assert.equal(h.moTa, h0.moTa, `mô tả hàng bị đổi bởi câu hội thoại: "${s}"`);
    assert.deepEqual(h.sua, [], `câu hội thoại lọt vào mục "khách nói thêm": "${s}"`);
    assert.doesNotMatch(moTaGop(h), /khách nói thêm/i, `câu hội thoại lọt vào mô tả gửi Cổng: "${s}"`);
  }
  // Chốt ngược: câu SỬA thật của khách (yêu cầu 4 của issue cần nó) vẫn phải tới Cổng.
  const sua = themTinTiep(h0, 'chữ on/off là đóng mở, không liên quan dòng điện');
  assert.match(moTaGop(sua), /khách nói thêm/i, 'câu sửa của khách phải còn trong hồ sơ');
  assert.match(moTaGop(sua), /đóng mở/i);
});

test('[S5] cungMonVoi: trùng MỘT từ chung không phải cùng món (món mới không bị nhồi vào lượt cũ)', () => {
  // Người soát đo: một từ ≥4 ký tự trùng là đủ "cùng món" → khách hỏi món MỚI trong lúc CAN_DU_KIEN
  // của món cũ còn mở sẽ nhận mã của món khác (ảnh hưởng mã/thuế, Hiến pháp Điều III).
  assert.equal(cungMonVoi('nước ép trái cây hs code là gì', 'máy bơm nước ly tâm'), false, 'chung từ "nuoc" không phải cùng món');
  assert.equal(cungMonVoi('hộp nhựa đựng thực phẩm mã hs là gì', 'bút bi vỏ nhựa'), false, 'chung từ "nhua" không phải cùng món');
  assert.equal(cungMonVoi('máy bơm nước ly tâm 1.5kW giá bao nhiêu', 'máy bơm nước ly tâm'), true, 'nhắc lại gần đủ tên hàng là cùng món');
  assert.equal(cungMonVoi('chốt kẹp cơ khí, chất liệu thép không gỉ, núm nhựa ABS, hs code là gì ạ', 'chốt kẹp xoay 1/4 vòng QCTHL0525-10S'), true,
    'tin bổ sung thông số của chính món đang chờ phải là cùng món');
  assert.equal(cungMonVoi('mã QCTHL0525-10S thì sao', 'chốt kẹp xoay 1/4 vòng QCTHL0525-10S'), true, 'trùng mã/model riêng là cùng món');
  assert.equal(cungMonVoi('', 'máy bơm nước'), false);
  assert.equal(cungMonVoi('máy bơm nước', ''), false);
});

test('locTapAmAnh: không cắt đứt số thập phân (0.75kW, 1.5HP, dày 1.2mm, dung tích 1,5 lít)', () => {
  assert.deepEqual(locTapAmAnh('0.75kW'), { sach: '0.75kW', bo: [] });
  assert.deepEqual(locTapAmAnh('1.5HP 220V'), { sach: '1.5HP 220V', bo: [] });
  assert.deepEqual(locTapAmAnh('dày 1.2mm'), { sach: 'dày 1.2mm', bo: [] });
  assert.deepEqual(locTapAmAnh('dung tích 1,5 lít'), { sach: 'dung tích 1,5 lít', bo: [] });
  assert.deepEqual(locTapAmAnh('dày 1.2mm, rộng 2.5m'), { sach: 'dày 1.2mm, rộng 2.5m', bo: [] });
  assert.deepEqual(
    locTapAmAnh('ảnh hơi mờ nhé anh, dung tích 1,5 lít, công suất 0.75kW'),
    { sach: 'dung tích 1,5 lít, công suất 0.75kW', bo: ['ảnh hơi mờ nhé anh'] },
  );
  const h = themTinTiep(themChu(hoSoRong(), 'máy bơm nước ly tâm'), '0.75kW');
  const m = moTaGop(h);
  assert.match(m, /0\.75kW/, `số thập phân 0.75kW phải giữ nguyên trong hồ sơ: "${m}"`);
  assert.doesNotMatch(m, /(^|[^\d.])75kW/, `0.75kW không được biến thành 75kW: "${m}"`);
});
