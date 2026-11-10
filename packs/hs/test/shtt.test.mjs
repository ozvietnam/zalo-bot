// Issue #169 — khối rủi ro nhãn hiệu (kiem_tra_shtt / kiem_tra_shtt_anh) phải nói tiếng Việt, tối đa 4 dòng,
// không đổ khoá JSON tiếng Anh, miễn trừ đúng MỘT lần. Bằng chứng/nguồn/mốc dữ liệu chỉ hiện ở bản "chi tiết".
// Dữ liệu mẫu dựng theo đúng khối khách thật đã thấy (CEO dán 10/11); tên chủ nhãn là TÊN GIẢ (repo công khai).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderShtt } from '../render-shtt.js';
import { plain } from '../style.js';

const KHOA_ANH = /Reasons|Evidence|Scope|Sources|Nice Classes|Data As Of|Suggestions|Disclaimer/;
const MIEN_TRU = /không phải ý kiến pháp lý/g;
const dong = (s) => plain(s).split('\n').filter((x) => x.trim() !== '');

// Khuôn Cổng trả về trong lượt thật: khoá tiếng Anh lồng nhiều tầng → trước đây rơi vào renderGeneric.
const THAT = {
  ok: true,
  data: {
    tenNhan: 'OEM',
    den: 'ĐỎ — rủi ro cao',
    mucRuiRo: 'CAO',
    reasons: ['Nhãn "OEM" đã được cấp bằng tại Việt Nam cho nhóm 7, 11 — trùng nhóm hàng đang nhập. Chủ nhãn: CÔNG TY TNHH MẪU VÍ DỤ.'],
    evidence: [{ ten: 'OEM', soBang: '4-0000-000' }, { ten: 'OEM BEARING', soBang: '4-0000-001' }],
    scope: { sources: ['wipopublish-vn', 'wipo-madrid'], niceClasses: [7, 11], dataAsOf: '2026-10-01' },
    suggestions: ['Xin thư uỷ quyền của chủ nhãn trước khi nhập, hoặc đổi sang hàng không nhãn hiệu.'],
    disclaimer: 'Kết quả tra cứu tự động, không phải ý kiến pháp lý.',
  },
  canhBao: ['Dữ liệu nhãn hiệu cập nhật tới 01/10/2026'],
  chiPhi: { diem: 2 },
};

test('renderShtt: khối đèn đỏ → tối đa 4 dòng tiếng Việt, không khoá kỹ thuật, miễn trừ đúng 1 lần', () => {
  const s = plain(renderShtt(THAT, { tenNhan: 'OEM' }));
  const ls = dong(s);
  assert.ok(ls.length <= 4, `phải ≤ 4 dòng, đang ${ls.length} dòng:\n${s}`);
  assert.doesNotMatch(s, KHOA_ANH);
  assert.equal((s.match(MIEN_TRU) || []).length, 1, `miễn trừ phải đúng 1 lần:\n${s}`);
  assert.match(ls[0], /^🔴/);                                  // dòng 1: đèn + kết luận ngắn
  assert.match(ls[0], /OEM/);
  assert.match(ls[0], /nhóm 7, 11/);
  assert.match(s, /Chủ nhãn: CÔNG TY TNHH MẪU VÍ DỤ/);         // dòng 2: chủ nhãn
  assert.match(s, /uỷ quyền/);                                  // dòng 3: gợi ý hành động
  // Không còn chứng cứ/nguồn/mốc dữ liệu, không còn dòng điểm tài khoản công ty (Hiến pháp IX).
  assert.doesNotMatch(s, /wipo|OEM BEARING|2026-10-01|điểm tài khoản/i);
});

test('renderShtt chi tiết: thêm nhãn tìm thấy + nguồn + mốc dữ liệu, vẫn tiếng Việt và miễn trừ 1 lần', () => {
  const s = plain(renderShtt(THAT, { tenNhan: 'OEM', chiTiet: true }));
  assert.doesNotMatch(s, KHOA_ANH);
  assert.equal((s.match(MIEN_TRU) || []).length, 1);
  assert.match(s, /OEM BEARING/);
  assert.match(s, /Nguồn dữ liệu: wipopublish-vn, wipo-madrid/);
  assert.match(s, /Dữ liệu cập nhật: 2026-10-01/);
  assert.ok(plain(renderShtt(THAT, { tenNhan: 'OEM', chiTiet: true })).length > plain(renderShtt(THAT, { tenNhan: 'OEM' })).length);
});

test('renderShtt: khuôn ketQua + đèn XANH (mẫu test cũ) → một dòng kết luận, không khoá kỹ thuật', () => {
  const s = plain(renderShtt({ ok: true, data: { ketQua: [{ ten: 'PENTAX', den: 'XANH' }] } }, { tenNhan: 'Pentax' }));
  const ls = dong(s);
  assert.ok(ls.length <= 4, s);
  assert.match(ls[0], /^🟢/);
  assert.match(ls[0], /Nhãn "Pentax"/);
  assert.doesNotMatch(s, KHOA_ANH);
  assert.doesNotMatch(s, /Kết quả:|Ten:|Den:/);
  assert.equal((s.match(MIEN_TRU) || []).length, 1);
});

test('renderShtt ảnh: so logo → nêu nhãn giống + độ giống, miễn trừ so hình bằng máy 1 lần', () => {
  const s = plain(renderShtt({ ok: true, data: { ketQua: [{ ten: 'NIKE', diem: 0.91 }] } }, { anh: true }));
  const ls = dong(s);
  assert.ok(ls.length <= 4, s);
  assert.match(s, /NIKE/);
  assert.match(s, /91%/);
  assert.match(s, /So logo bằng máy/);
  assert.equal((s.match(MIEN_TRU) || []).length, 1);
  assert.doesNotMatch(s, KHOA_ANH);
  const rong = plain(renderShtt({ ok: true, data: { ketQua: [] } }, { anh: true }));
  assert.match(rong, /chưa thấy/);
  assert.equal((rong.match(MIEN_TRU) || []).length, 1);
});

// [S1] Lấy mức NẶNG NHẤT trên toàn danh sách. Trước đây chỉ xét phần tử đầu → nhãn ĐỏD nằm sau
// một mục XANH bị lật thành xanh: cảnh báo an toàn sai, nặng hơn lỗi gốc của đề bài (Điều VII, VIII).
test('renderShtt [S1]: nhãn ĐỎ nằm SAU một mục XANH vẫn phải ra đèn ĐỎ', () => {
  const s = plain(renderShtt({ ok: true, data: { ketQua: [{ ten: 'NIKE AIR', den: 'XANH' }, { ten: 'NIKE', den: 'ĐỎ — rủi ro cao' }] } }, { tenNhan: 'Nike' }));
  assert.match(dong(s)[0], /^🔴/, `ĐỎ không đứng đầu danh sách vẫn phải ra đèn đỏ:\n${s}`);
  assert.doesNotMatch(s, /🟢|chưa thấy ai đăng ký/);
});

test('renderShtt [S1]: VÀNG nằm sau XANH → đèn VÀNG; mọi mục XANH → vẫn XANH', () => {
  const v = plain(renderShtt({ ok: true, data: { ketQua: [{ ten: 'A', den: 'XANH' }, { ten: 'B', den: 'VÀNG — gần giống' }] } }, { tenNhan: 'A' }));
  assert.match(dong(v)[0], /^🟡/, v);
  const x = plain(renderShtt({ ok: true, data: { ketQua: [{ ten: 'A', den: 'XANH' }, { ten: 'B', den: 'XANH' }] } }, { tenNhan: 'A' }));
  assert.match(dong(x)[0], /^🟢/, x);
});

// [S2] Khoá `den`/`mucRuiRo` là chữ TỰ DO ('ĐỎ — rủi ro cao'). Quét regex giữa câu thì chữ "do"
// thông dụng tiếng Việt bị bắt thành "ĐỎ" → báo đỏ sai, đúng cái đề bài muốn dẹp.
test('renderShtt [S2]: "Thấp do chưa ai đăng ký nhãn này" là mức THẤP, không được ra đèn ĐỎ', () => {
  const s = plain(renderShtt({ ok: true, data: { tenNhan: 'X', mucRuiRo: 'Thấp do chưa ai đăng ký nhãn này' } }, { tenNhan: 'X' }));
  assert.doesNotMatch(s, /🔴|rủi ro cao/, `chữ "do" giữa câu không phải đèn đỏ:\n${s}`);
  assert.match(dong(s)[0], /^🟢/, s);
});

test('renderShtt [S2]: vẫn đọc đúng các cách Cổng ghi đèn', () => {
  const den = (raw) => dong(plain(renderShtt({ ok: true, data: { tenNhan: 'X', den: raw } }, { tenNhan: 'X' })))[0].slice(0, 2);
  for (const raw of ['ĐỎ — rủi ro cao', 'ĐỎ', 'RED', 'red, cao', 'CAO', 'HIGH']) assert.equal(den(raw), '🔴', `"${raw}" phải là đèn đỏ`);
  for (const raw of ['VÀNG — gần giống', 'YELLOW', 'TRUNG BÌNH', 'MEDIUM']) assert.equal(den(raw), '🟡', `"${raw}" phải là đèn vàng`);
  for (const raw of ['XANH — không trùng', 'GREEN', 'THẤP', 'LOW']) assert.equal(den(raw), '🟢', `"${raw}" phải là đèn xanh`);
});

// [S2 vòng 3] Bỏ dấu là bước LÀM MẤT thông tin: `đỏ` (đèn), `độ` (mức độ/độ giống) và `do` (liên từ)
// cùng thành "do". Phải so khớp trên chuỗi CÒN DẤU, và chuỗi "do" không dấu chỉ nhận khi vế đúng bằng "do".
test('renderShtt [S2]: "Mức độ…"/"Độ …" không được thành đèn ĐỎ', () => {
  const den = (raw, khoa = 'den') => dong(plain(renderShtt({ ok: true, data: { tenNhan: 'X', [khoa]: raw } }, { tenNhan: 'X' })))[0].slice(0, 2);
  for (const khoa of ['den', 'mucDo', 'mucRuiRo']) {
    assert.equal(den('Mức độ thấp', khoa), '🟢', `${khoa}="Mức độ thấp" phải là đèn xanh`);
    assert.equal(den('Mức độ trung bình', khoa), '🟡', `${khoa}="Mức độ trung bình" phải là đèn vàng`);
    assert.equal(den('Mức độ cao', khoa), '🔴', `${khoa}="Mức độ cao" phải là đèn đỏ`);
    for (const raw of ['Độ giống thấp', 'Độ rủi ro: thấp', 'Độ tương đồng thấp']) {
      assert.notEqual(den(raw, khoa), '🔴', `${khoa}="${raw}" không được là đèn đỏ`);
    }
  }
  // Câu tiếng Việt mở đầu bằng "Do …" (giải thích lý do) không phải đèn đỏ.
  assert.notEqual(den('Do nhãn đã hết hiệu lực, mức thấp'), '🔴');
  assert.notEqual(den('Do chưa ai đăng ký, rủi ro thấp'), '🔴');
  // Cổng gửi chuỗi đã bỏ dấu sẵn thì vẫn phải đọc đúng.
  assert.equal(den('muc do thap'), '🟢');
  assert.equal(den('Độ rủi ro cao'), '🔴');
});

// [S2]+[S1]: lấy mức nặng nhất toàn danh sách nên MỘT mục con đọc sai đủ lật cả khối.
test('renderShtt [S2]: mục con có câu "Do …" không được lật khối XANH thành ĐỎ', () => {
  const s = plain(renderShtt({ ok: true, data: { tenNhan: 'Pentax', den: 'XANH — rủi ro thấp',
    ketQua: [{ ten: 'PENTAX X', mucDo: 'Do khac nhom hang' }] } }, { tenNhan: 'Pentax' }));
  assert.match(dong(s)[0], /^🟢/, `một mục con không được lật cả khối:\n${s}`);
});

// [S3] Không đọc được đèn và không đọc được danh sách = KHÔNG phân tích được, không phải "không có rủi ro".
// Khẳng định xanh ở đây là hứa điều công cụ chưa làm được (Điều VII, VIII) và là bước lùi so với renderGeneric.
test('renderShtt [S3]: Cổng không trả đèn và không trả danh sách → nói chưa xác định được, KHÔNG trấn an', () => {
  const s = plain(renderShtt({ ok: true, data: { thongBao: 'Hệ thống nhãn hiệu đang bảo trì, chưa tra được.' } }, { tenNhan: 'OEM' }));
  assert.doesNotMatch(s, /🟢|chưa tìm thấy đăng ký nào trùng|chưa thấy ai đăng ký/, `không được suy ra kết luận trấn an:\n${s}`);
  assert.match(s, /chưa xác định được/i);
  assert.match(s, /ảnh nhãn/);
  assert.ok(dong(s).length <= 4, s);
  assert.doesNotMatch(s, KHOA_ANH);
});

test('renderShtt [S3]: data rỗng hẳn cũng không được khẳng định xanh', () => {
  const s = plain(renderShtt({ ok: true, data: {} }, { tenNhan: 'OEM' }));
  assert.doesNotMatch(s, /🟢/, s);
  assert.match(s, /chưa xác định được/i);
});

// [S7] Ngưỡng độ giống: 8% không phải "giống", khuyên xin uỷ quyền ở mức đó là báo động giả.
test('renderShtt ảnh [S7]: độ giống thấp → không báo động, không khuyên xin uỷ quyền', () => {
  const s = plain(renderShtt({ ok: true, data: { ketQua: [{ ten: 'NIKE', diem: 0.08 }] } }, { anh: true }));
  assert.doesNotMatch(s, /🟡|uỷ quyền/, `giống 8% không được báo động:\n${s}`);
  assert.match(s, /chưa thấy/);
  assert.equal((s.match(MIEN_TRU) || []).length, 1);
});

test('renderShtt ảnh [S7]: giống cao vẫn báo động như cũ; không có điểm thì vẫn nêu', () => {
  const cao = plain(renderShtt({ ok: true, data: { ketQua: [{ ten: 'NIKE', diem: 0.91 }, { ten: 'MO', diem: 0.05 }] } }, { anh: true }));
  assert.match(cao, /🟡/); assert.match(cao, /NIKE/); assert.match(cao, /uỷ quyền/);
  assert.doesNotMatch(cao, /\bMO\b/, `mục dưới ngưỡng không được nêu:\n${cao}`);
  const khongDiem = plain(renderShtt({ ok: true, data: { ketQua: [{ ten: 'NIKE' }] } }, { anh: true }));
  assert.match(khongDiem, /NIKE/);
});

// [S10] Nhánh ảnh: `giong.length === 0` gộp BA trạng thái khác bản chất — đã so và không thấy /
// không so được (bảo trì, khuôn lạ) / có mục nhưng đều dưới ngưỡng. Khẳng định an toàn từ hai
// trạng thái sau là đúng lỗi [S3] ở nhánh còn lại, mà lượt này VẪN trừ điểm tài khoản (Điều VII, VIII).
const AN_TOAN_ANH = /✅|chưa thấy nhãn hiệu đã đăng ký nào giống/;

test('renderShtt ảnh [S10]: Cổng trả thông báo bảo trì → chưa so được, KHÔNG trấn an', () => {
  const s = plain(renderShtt({ ok: true, data: { thongBao: 'Hệ thống so ảnh đang bảo trì, chưa so được.' } }, { anh: true }));
  assert.doesNotMatch(s, AN_TOAN_ANH, `không so được thì không được nói an toàn:\n${s}`);
  assert.match(s, /chưa so được/i);
  assert.match(s, /gửi lại ảnh/i);
  assert.equal((s.match(MIEN_TRU) || []).length, 1, s);
});

test('renderShtt ảnh [S10]: khuôn khoá lạ (không đọc được tên mục) → chưa so được', () => {
  const s = plain(renderShtt({ ok: true, data: { soSanh: [{ nhanGiong: 'NIKE', diem: 0.95 }] } }, { anh: true }));
  assert.doesNotMatch(s, AN_TOAN_ANH, `khuôn lạ: phải nói chưa so được, không trấn an:\n${s}`);
  assert.match(s, /chưa so được/i);
});

test('renderShtt ảnh [S10]: data rỗng hẳn → chưa so được', () => {
  const s = plain(renderShtt({ ok: true, data: {} }, { anh: true }));
  assert.doesNotMatch(s, AN_TOAN_ANH, s);
  assert.match(s, /chưa so được/i);
});

test('renderShtt ảnh [S10]: danh sách rỗng TƯỜNG MINH = Cổng đã so, thật sự không thấy', () => {
  for (const data of [{ ketQua: [] }, { evidence: [] }]) {
    const s = plain(renderShtt({ ok: true, data }, { anh: true }));
    assert.match(s, AN_TOAN_ANH, `mảng rỗng tường minh là đã so xong:\n${s}`);
    assert.doesNotMatch(s, /chưa so được/i, s);
  }
});

test('renderShtt ảnh [S10]: mục dưới ngưỡng → không báo động, nhưng bản "chi tiết" vẫn nêu', () => {
  const data = { ketQua: [{ ten: 'NIIKE', diem: 0.58 }, { ten: 'NlKE', diem: 0.55 }] };
  const ngan = plain(renderShtt({ ok: true, data }, { anh: true }));
  assert.doesNotMatch(ngan, /🟡|uỷ quyền/, `58% không được báo động:\n${ngan}`);
  assert.doesNotMatch(ngan, /chưa so được/i, `đọc được mục thì KHÔNG phải "chưa so được":\n${ngan}`);
  const ct = plain(renderShtt({ ok: true, data }, { anh: true, chiTiet: true }));
  assert.match(ct, /NIIKE/, `bản chi tiết phải nêu mục dưới ngưỡng thay vì xoá hẳn:\n${ct}`);
  assert.match(ct, /58/, ct);
  assert.doesNotMatch(ct, /uỷ quyền/, ct);
});

// [S11] Quyết của CEO (oz-quyet, vòng 4): Cổng ĐÃ trả kết quả tương đồng thì tuyệt đối không trấn an,
// kể cả khi không đọc được tên nhãn. Trước đây mục không có tên bị `return null` xoá khỏi dữ liệu nên
// `{ten:'',diem:0.99}` tụt xuống đúng nhánh `✅` — logo giống 99% mà khách được bảo là an toàn.
test('renderShtt ảnh [S11]: khoá nhanGiong đọc được → báo động, KHÔNG trấn an', () => {
  const s = plain(renderShtt({ ok: true, data: { ketQua: [{ nhanGiong: 'NIKE', diem: 0.95 }] } }, { anh: true }));
  assert.doesNotMatch(s, AN_TOAN_ANH, `có kết quả 95% thì không được trấn an:\n${s}`);
  assert.match(s, /🟡/, s);
  assert.match(s, /NIKE/, `phải nêu tên đọc từ nhanGiong:\n${s}`);
  assert.match(s, /95%/, s);
  assert.match(s, /uỷ quyền/, s);
});

test('renderShtt ảnh [S11]: khoá nhanHieu cũng đọc được tên', () => {
  const s = plain(renderShtt({ ok: true, data: { ketQua: [{ nhanHieu: 'ADIDAS', diem: 0.88 }] } }, { anh: true }));
  assert.doesNotMatch(s, AN_TOAN_ANH, s);
  assert.match(s, /ADIDAS/, s);
});

test('renderShtt ảnh [S11]: tên rỗng nhưng giống 99% → nhãn đại diện, vẫn báo động', () => {
  for (const x of [{ ten: '', diem: 0.99 }, { diem: 0.99 }, { ten: null, diem: 99 }]) {
    const s = plain(renderShtt({ ok: true, data: { ketQua: [x] } }, { anh: true }));
    assert.doesNotMatch(s, AN_TOAN_ANH, `giống 99% mà không đọc được tên vẫn phải báo động:\n${s}`);
    assert.doesNotMatch(s, /chưa so được/i, `Cổng đã so và có điểm, không phải "chưa so được":\n${s}`);
    assert.match(s, /🟡/, s);
    assert.match(s, /Nhãn hình/i, `phải gán nhãn đại diện thay vì bỏ mục:\n${s}`);
    assert.match(s, /99%/, s);
  }
});

test('renderShtt ảnh [S11]: tên rỗng + nhanGiong có chữ → lấy nhanGiong, không lấy nhãn đại diện', () => {
  const s = plain(renderShtt({ ok: true, data: { ketQua: [{ ten: '', nhanGiong: 'PUMA', diem: 0.92 }] } }, { anh: true }));
  assert.match(s, /PUMA/, s);
  assert.doesNotMatch(s, /Nhãn hình/i, `có nhanGiong thì không dùng nhãn đại diện:\n${s}`);
});

test('renderShtt ảnh [S11]: tên rỗng và DƯỚI ngưỡng → vẫn không báo động (giữ hành vi [S7])', () => {
  const data = { ketQua: [{ ten: '', diem: 0.30 }] };
  const s = plain(renderShtt({ ok: true, data }, { anh: true }));
  assert.doesNotMatch(s, /🟡|uỷ quyền/, `30% không được báo động dù không đọc được tên:\n${s}`);
  assert.match(s, AN_TOAN_ANH, `mọi mục dưới ngưỡng = đã so, không thấy gì đáng lo:\n${s}`);
  const ct = plain(renderShtt({ ok: true, data }, { anh: true, chiTiet: true }));
  assert.match(ct, /30%/, `bản chi tiết vẫn nêu mục dưới ngưỡng:\n${ct}`);
});

test('renderShtt ảnh [S11]: mục KHÔNG tên và KHÔNG điểm → không đủ dữ kiện để trấn an', () => {
  const s = plain(renderShtt({ ok: true, data: { ketQua: [{ soBang: '4-0000-000' }] } }, { anh: true }));
  assert.doesNotMatch(s, AN_TOAN_ANH, `có phần tử mà không đọc được gì thì không được trấn an:\n${s}`);
});

test('renderShtt: Cổng lỗi → một dòng tiếng Việt, không lộ lỗi gốc, không dán miễn trừ', () => {
  const s = plain(renderShtt({ ok: false, loi: 'BACKEND_LOI', thongBao: 'Trademark service failed (HTTP 502) | EN: upstream error', transport: false }));
  assert.equal(dong(s).length, 1, s);
  assert.doesNotMatch(s, /HTTP|502|EN:|Trademark/);
  assert.doesNotMatch(s, MIEN_TRU);
});
