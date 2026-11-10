// Hồ sơ mặt hàng theo mạch khách (issue #170): gộp chữ + ảnh + câu sửa, lệnh ngắn trỏ hồ sơ,
// mâu thuẫn ảnh ↔ chữ thì hỏi lại, "xem lại từ đầu" dựng lại từ lịch sử.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hoSoRong, themChu, themAnh, themSua, moTaGop, dongDangTra,
  mauThuan, laLenhTroHoSo, laTenHangCam, laCauXemLai, dungTuLichSu,
  laMonKhac, themTinTiep,
} from '../ho-so.js';
import { cungMonVoi } from '../ho-so.js';
import { parseLabeled } from '../input.js';
import { TRUONG } from '../nhan-dang.js';

const MO_TA = 'Chốt kẹp xoay 1/4 vòng loại núm thấp, mã QCTHL0525-10S, cố định vỏ máy và cửa bảo vệ';
const ANH_ON_OFF = { tenHang: 'Núm vặn khoá bật tắt ON OFF', chatLieu: 'thép không gỉ + núm nhựa ABS', chuTrongAnh: 'ON OFF' };

test('lệnh ngắn trỏ vào hồ sơ, không phải tên hàng', () => {
  for (const s of ['tra hscode', 'tra hs', 'tra', 'ok', 'OK', 'đây nhé', 'tra giúp', 'tra giúp em', '', '   ']) {
    assert.equal(laLenhTroHoSo(s), true, `phải là lệnh ngắn: "${s}"`);
  }
  for (const s of [MO_TA, 'bút bi hs code là gì', 'máy bơm nước ly tâm']) {
    assert.equal(laLenhTroHoSo(s), false, `không phải lệnh ngắn: "${s}"`);
  }
});

test('từ cấm làm tên hàng: "tra", "ok", "hs code"… bị chặn', () => {
  for (const s of ['tra', 'tra hs', 'tra hscode', 'ok', 'đây', 'đây nhé', 'hs code', 'hscode', 'mã hs', 'vâng', 'tra giúp', 'xem lại']) {
    assert.equal(laTenHangCam(s), true, `phải là từ cấm: "${s}"`);
  }
  for (const s of ['chốt kẹp xoay 1/4 vòng', 'bút bi', 'máy bơm nước']) {
    assert.equal(laTenHangCam(s), false, `không phải từ cấm: "${s}"`);
  }
});

test('mô tả chữ vào hồ sơ; lệnh ngắn và từ cấm không bao giờ thành mô tả', () => {
  let h = hoSoRong();
  assert.equal(moTaGop(h), '');
  h = themChu(h, 'tra hscode');
  assert.equal(moTaGop(h), '', 'lệnh ngắn không được thành mô tả hàng');
  assert.equal(h.dau, 0, 'hồ sơ không đổi thì dấu không tăng');
  h = themChu(h, MO_TA);
  assert.match(moTaGop(h), /Tên hàng: Chốt kẹp xoay 1\/4 vòng/);
  assert.equal(h.dau, 1);
  // gửi lại đúng mô tả cũ (tin 10:06) → không đổi hồ sơ, không tăng dấu
  const truoc = h.dau;
  h = themChu(h, `đây nhé, ${MO_TA}`);
  assert.equal(h.dau, truoc, 'gửi lại mô tả cũ thì hồ sơ không đổi');
});

test('ảnh là BỔ SUNG: không ghi đè mô tả chữ, chỉ điền trường còn trống', () => {
  let h = themChu(hoSoRong(), MO_TA);
  h = themAnh(h, ANH_ON_OFF);
  const m = moTaGop(h);
  assert.match(m, /Tên hàng: Chốt kẹp xoay 1\/4 vòng/, 'tên hàng vẫn là mô tả chữ của khách');
  assert.doesNotMatch(m, /ON OFF/, 'chữ đọc từ ảnh không được làm tên hàng');
  assert.doesNotMatch(m, /Núm vặn khoá bật tắt/, 'tên hàng đọc từ ảnh không được thay mô tả chữ');
  assert.match(m, /Chất liệu: thép không gỉ \+ núm nhựa ABS/, 'ảnh điền trường còn trống');
  // không có mô tả chữ thì ảnh được dùng làm mô tả
  const chiAnh = themAnh(hoSoRong(), ANH_ON_OFF);
  assert.match(moTaGop(chiAnh), /Núm vặn khoá bật tắt ON OFF/);
});

test('[S2] chú thích ảnh dạng CÂU NHỜ không được thành tên hàng, tên AI đọc từ ảnh mới là tên hàng', () => {
  // Hồi quy người soát đo được: chú thích "Nhờ bot đọc tem nhãn này" chiếm ô mô tả, nên tên hàng
  // AI đọc được ("Bộ điều khiển…") bị loại và Cổng nhận đúng câu nhờ làm tên hàng.
  const ANH_TEM = { tenHang: 'Bộ điều khiển lập trình và cảm biến áp suất', thuongHieu: 'Omron',
    model: 'E2B-M12KS04', chatLieu: 'Vỏ kim loại, linh kiện điện tử' };
  for (const cap of ['Nhờ bot đọc tem nhãn này', 'xem giúp em cái này với', 'đọc hộ em tem này', 'cái này là gì ạ']) {
    const h = themAnh(hoSoRong(), ANH_TEM, cap);
    const m = moTaGop(h);
    assert.match(m, /Tên hàng: Bộ điều khiển lập trình/, `tên hàng phải là tên AI đọc từ ảnh, chú thích: "${cap}" → ${JSON.stringify(m)}`);
    assert.doesNotMatch(m, /Nhờ bot|xem giúp|đọc hộ|cái này là gì/i, `câu nhờ không được thành tên hàng: "${cap}"`);
  }
  // Chú thích MANG dữ kiện hàng thì vẫn là mô tả chữ, ảnh chỉ bổ sung (hành vi cũ không đổi).
  const h2 = themAnh(hoSoRong(), ANH_TEM, 'chốt kẹp xoay 1/4 vòng núm thấp QCTHL0525-10S');
  assert.match(moTaGop(h2), /Tên hàng: chốt kẹp xoay/i);
});

test('[S7] thương hiệu/model đọc từ ảnh KHÁC món thì không dính vào hồ sơ (không kích tra nhãn hiệu sai)', () => {
  // Người soát đo (qa-that/ket-qua-2026-11-10.md:350): ảnh tem nhãn của món khác đưa "Omron" vào hồ sơ
  // chốt kẹp, nên tin kết quả kèm mục ®️ "Rủi ro nhãn hiệu Omron" — cảnh báo pháp lý về một nhãn
  // khách chưa từng nói tới. Thương hiệu chỉ được nhận khi ảnh nói về CÙNG MÓN với mô tả chữ.
  const ANH_KHAC_MON = { tenHang: 'Bộ điều khiển lập trình và cảm biến áp suất', thuongHieu: 'Omron',
    model: 'E2B-M12KS04', chatLieu: 'Vỏ kim loại, linh kiện điện tử' };
  const h = themAnh(themChu(hoSoRong(), MO_TA), ANH_KHAC_MON);
  const m = moTaGop(h);
  assert.doesNotMatch(m, /Omron/i, `thương hiệu của món khác dính vào hồ sơ: ${JSON.stringify(m)}`);
  assert.doesNotMatch(m, /E2B-M12KS04/i, `model của món khác dính vào hồ sơ: ${JSON.stringify(m)}`);
  assert.match(m, /Tên hàng: Chốt kẹp/i, 'mô tả chữ của khách phải giữ nguyên');

  // Ảnh CÙNG MÓN (tên ảnh nói về chính chốt kẹp) thì thương hiệu vẫn được nhận — ảnh là bổ sung thật.
  const cungMon = themAnh(themChu(hoSoRong(), MO_TA),
    { tenHang: 'Chốt kẹp xoay 1/4 vòng núm thấp QCTHL0525-10S', thuongHieu: 'Weidmuller', model: 'QCTHL0525-10S' });
  assert.match(moTaGop(cungMon), /Weidmuller/i, 'ảnh cùng món thì thương hiệu phải vào hồ sơ');

  // Hồ sơ chưa có mô tả chữ → ảnh LÀ nguồn duy nhất, thương hiệu của nó vẫn nhận (hành vi cũ).
  assert.match(moTaGop(themAnh(hoSoRong(), ANH_KHAC_MON)), /Omron/i);
});

test('mâu thuẫn ảnh (ON OFF = điện) ↔ chữ (chốt kẹp cơ khí) → hỏi lại MỘT câu', () => {
  const h = themAnh(themChu(hoSoRong(), MO_TA), ANH_ON_OFF);
  const mt = mauThuan(h);
  assert.ok(mt, 'phải phát hiện mâu thuẫn');
  assert.match(mt.cauHoi, /ON ?\/?OFF/i);
  assert.equal(mt.cauHoi.split('?').filter((x) => x.trim()).length, 1, 'chỉ hỏi MỘT câu');
  // không có mô tả chữ cơ khí thì không coi là mâu thuẫn
  assert.equal(mauThuan(themAnh(hoSoRong(), ANH_ON_OFF)), null);
  // khách đã trả lời/sửa → thôi hỏi
  assert.equal(mauThuan(themSua(h, 'chữ on/off là đóng mở, không liên quan dòng điện')), null);
});

test('câu sửa: ghi vào hồ sơ, bỏ hướng đọc từ ảnh, nói rõ đã đổi gì', () => {
  const h = themSua(themAnh(themChu(hoSoRong(), MO_TA), ANH_ON_OFF), 'chữ on/off là đóng mở, không liên quan dòng điện');
  assert.ok(h.dau >= 3, 'câu sửa làm hồ sơ đổi');
  assert.equal(h.daGiaiMauThuan, true);
  assert.match(moTaGop(h), /Chốt kẹp xoay/);
  assert.doesNotMatch(moTaGop(h), /ON OFF/);
});

test('"xem lại toàn bộ/từ đầu" là câu yêu cầu dựng lại hồ sơ', () => {
  for (const s of ['xem lại toàn bộ thông tin khách gửi từ đầu tới cuối', 'xem lại từ đầu', 'phân loại lại toàn bộ']) {
    assert.equal(laCauXemLai(s), true, `phải là câu xem lại: "${s}"`);
  }
  assert.equal(laCauXemLai(MO_TA), false);
  assert.equal(laCauXemLai('ok'), false);
});

test('dựng lại hồ sơ từ lịch sử mạch: chỉ tin khách, bỏ lệnh ngắn, giữ mô tả dài nhất', () => {
  const history = [
    { speaker: 'khach', text: MO_TA, at: '2026-11-10T02:58:00Z' },
    { speaker: 'bot', text: 'Mã có thể (chưa chốt): 8302.42', at: '2026-11-10T03:01:00Z' },
    { speaker: 'khach', text: 'tra hscode', at: '2026-11-10T03:00:00Z' },
    { speaker: 'khach', text: '[ảnh] https://photo.example/abc.jpg chất liệu: thép không gỉ + núm nhựa ABS', at: '2026-11-10T03:03:00Z' },
    { speaker: 'khach', text: 'ok', at: '2026-11-10T03:12:00Z' },
  ];
  const h = dungTuLichSu(history);
  const m = moTaGop(h);
  assert.match(m, /Tên hàng: Chốt kẹp xoay 1\/4 vòng/);
  assert.doesNotMatch(m, /8302\.42/, 'không lấy tin của bot vào hồ sơ');
  assert.doesNotMatch(m, /tra hscode|^ok$/m, 'không lấy lệnh ngắn vào hồ sơ');
  assert.match(m, /thép không gỉ/, 'chú thích ảnh vẫn được gộp');
});


test('dòng hồ sơ ở đầu tin: tối đa 2 dòng, có "Em đang tra"', () => {
  const h = themAnh(themChu(hoSoRong(), MO_TA), ANH_ON_OFF);
  const d = dongDangTra(h);
  assert.match(d, /^Em đang tra: /);
  assert.ok(d.split('\n').length <= 2, `quá 2 dòng: ${JSON.stringify(d)}`);
  assert.match(d, /Chốt kẹp xoay/);
  assert.equal(dongDangTra(hoSoRong()), '');
});

// ── [S26] Câu sửa của khách phải SỐNG TRỌN, lệnh/lời chào phải bị bỏ ──────────────────────────
// Người soát đo (điểm [S26]): `themSua` giữ nguyên văn "đây nhé, …" → tên hàng gửi Cổng mang
// cả lời chào lẫn từ khoá hướng điện; `moTaGop` nối các câu sửa bằng "; " trong khi
// `parseLabeled` CẮT dòng ở dấu ";" → câu sửa thứ hai rụng khỏi tên hàng.

test('[S26] câu sửa có lời chào đi kèm: bỏ lời chào, giữ trọn phần sửa thật', () => {
  const h = themSua(themChu(hoSoRong(), MO_TA), 'đây nhé, chữ on/off là đóng mở, không liên quan dòng điện');
  assert.equal(h.sua.length, 1);
  assert.doesNotMatch(h.sua[0], /đây nhé/i, `lời chào không được thành dữ kiện mặt hàng: "${h.sua[0]}"`);
  assert.match(h.sua[0], /không liên quan dòng điện/i, `câu sửa thật phải còn: "${h.sua[0]}"`);
});

test('[S26] lệnh ngắn ("ok") không phải câu sửa của khách → hồ sơ không đổi', () => {
  const h0 = themChu(hoSoRong(), MO_TA);
  const h = themSua(h0, 'ok');
  assert.deepEqual(h.sua, [], `lệnh ngắn không được ghi thành câu sửa: ${JSON.stringify(h.sua)}`);
  assert.equal(h.dau, h0.dau, 'hồ sơ không đổi thì dấu không tăng');
});

test('[S26] hai câu sửa của khách phải cùng sống trong tên hàng gửi Cổng', () => {
  let h = themChu(hoSoRong(), MO_TA);
  h = themSua(h, 'chốt kẹp xoay 1/4 vòng QCTHL0525-10S');
  h = themSua(h, 'chữ on/off là đóng mở, không liên quan dòng điện');
  const m = moTaGop(h);
  assert.doesNotMatch(m, /;/, `tên hàng không được có dấu ";" (parseLabeled cắt dòng ở đó): ${JSON.stringify(m)}`);
  const { values } = parseLabeled(m, TRUONG);
  const ten = values.moTa ?? '';
  assert.match(ten, /QCTHL0525-10S/, `câu sửa thứ nhất phải còn trong tên hàng: "${ten}"`);
  assert.match(ten, /không liên quan dòng điện/i, `câu sửa thứ hai phải còn trong tên hàng: "${ten}"`);
});
