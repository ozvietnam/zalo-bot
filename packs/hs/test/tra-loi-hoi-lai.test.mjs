// packs/hs/test/tra-loi-hoi-lai.test.mjs — ĐỌC CÂU TRẢ LỜI của khách cho câu hỏi lại.
//
// Bốn điểm giám đốc CHẶN ở PR #213 (soát chéo Gemini phát hiện, giám đốc dựng lại 3/4 bằng tay).
// Tất cả đo được bằng chính hàm của repo trước bản vá:
//
//   1) `docTraLoiTen` chạy trên MỌI câu trả lời hỏi lại, không kiểm câu đang treo có phải câu
//      XÁC NHẬN TÊN hay không. Nên câu trả lời THUỘC TÍNH mở đầu bằng "không" bị cắt mất chữ
//      "không" và mất luôn tên hàng — bot ĐẢO NGƯỢC nghĩa câu khách:
//        docTraLoiTen('không mạ kẽm, đúc DN50', {tenGoc:'ống thép DN50'}) → ten: 'mạ kẽm, đúc DN50'
//        docTraLoiTen('không dầu, gia đình 5L 1500W', {tenGoc:'nồi chiên'}) → ten: 'dầu, gia đình 5L 1500W'
//      Khách nói "KHÔNG mạ kẽm" mà Cổng nhận "mạ kẽm" thì mã HS và số thuế in ra là của mặt hàng
//      khác, mà im lặng — khách không có cách nào biết (Điều III, Điều VIII).
//
//   2) Phép đoán "phần còn lại có ≥2 chữ cái thì là tên hàng" (`/\p{L}{2}/u`) vỡ cả hai chiều vì
//      đơn vị đo cũng có 2 chữ cái (kW, VAC, mm, kg, ml):
//        'không, 0.5kW 220V'  → ten: '0.5kW 220V 350W'  (RỤNG HẲN tên hàng, lại còn 2 công suất)
//        'không, 350W 220VAC' → ten: '350W 220VAC'      (RỤNG HẲN tên hàng)
//
//   3) `PHU_DINH_RE` neo `^\s*` nên "Dạ không, là máy sấy thật ạ" → `phuDinh:false`, rơi lại đúng
//      cái lỗi PR #213 đi sửa. Và `XA_GIAO_CUOI_RE` có `d[aạ]` khớp cả "da" KHÔNG dấu:
//        bocXaGiao('túi da ạ') → 'túi' · bocXaGiao('ví bằng da') → 'ví bằng'  (mất CHẤT LIỆU,
//      mà chất liệu đổi chương thuế: túi da 4202 ≠ túi nhựa).
//
//   4) Cổng `!vuaTraLoiHoiLai` ở nhánh 0b (`packages.js`) làm MẤT VÒNG HỎI THỨ 2: khách sửa tên mà
//      chưa đưa thông số thì bot đi tra luôn với mô tả cụt, trong khi trần của #136 là 2 vòng.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docTraLoiTen, bocXaGiao } from '../ky-luat-hoi.js';
import { kiemTraThongTinPhanLoai, xuLyTraLoiHoiLai } from '../dien-cho-thieu.js';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import hs from '../index.js';
import { plain } from '../style.js';

// ── 1. Câu trả lời THUỘC TÍNH mở đầu bằng "không" — không được hiểu là phủ định TÊN ───────────

test('[#213-1] "không mạ kẽm" trả lời câu hỏi QUY CÁCH → giữ nguyên chữ "không" và tên hàng', () => {
  // Câu bot đang treo là câu quy cách của nhánh ống thép ("đúc hay hàn, có mạ kẽm không ạ?"),
  // KHÔNG phải câu xác nhận tên. Phiên hỏi lại dựng đúng như `kiemTraThongTinPhanLoai` trả về.
  const hoiLai = kiemTraThongTinPhanLoai('ống thép', { vongHoi: 0 });
  assert.equal(hoiLai.canHoi, true);
  assert.match(hoiLai.cauHoi, /mạ kẽm/i, `phải là câu hỏi quy cách: "${hoiLai.cauHoi}"`);
  const r = xuLyTraLoiHoiLai('không mạ kẽm, đúc DN50', { ...hoiLai, vongHoi: 1 });
  assert.match(r.moTaTraCuu, /kh[oô]ng\s*m[aạ]\s*k[eẽ]m/i,
    `chữ "không" phải còn — mất nó là bot nói ngược khách: "${r.moTaTraCuu}"`);
  assert.match(r.moTaTraCuu, /[oố]ng\s*th[eé]p/i, `tên hàng không được rụng: "${r.moTaTraCuu}"`);
});

test('[#213-1] "không dầu" trả lời câu hỏi nồi chiên → giữ "không dầu" và tên hàng', () => {
  const hoiLai = kiemTraThongTinPhanLoai('nồi chiên', { vongHoi: 0 });
  assert.equal(hoiLai.canHoi, true);
  const r = xuLyTraLoiHoiLai('không dầu, gia đình 5L 1500W', { ...hoiLai, vongHoi: 1 });
  assert.match(r.moTaTraCuu, /kh[oô]ng\s*d[aầ]u/i, `"không dầu" là tên loại hàng: "${r.moTaTraCuu}"`);
  assert.match(r.moTaTraCuu, /n[oồ]i\s*chi[eê]n/i, `tên hàng không được rụng: "${r.moTaTraCuu}"`);
});

test('[#213-1] khách phủ định TÊN (câu đang treo đúng là câu xác nhận tên) → vẫn nghe đúng', () => {
  // Chốt ngược: cổng mới không được làm hỏng việc chính của PR #213.
  const hoiLai = kiemTraThongTinPhanLoai('máy sấy sinh tố', { vongHoi: 0 });
  assert.equal(hoiLai.canHoi, true);
  assert.match(hoiLai.cauHoi, /máy xay sinh tố/i, `phải là câu xác nhận tên: "${hoiLai.cauHoi}"`);
  const r = xuLyTraLoiHoiLai('không, là máy sấy thực phẩm ạ', { ...hoiLai, vongHoi: 1 });
  assert.doesNotMatch(r.moTaTraCuu, /máy xay/i, `tên bị phủ định không được tới Cổng: "${r.moTaTraCuu}"`);
  assert.match(r.moTaTraCuu, /máy sấy thực phẩm/i, `phải tra món khách nói: "${r.moTaTraCuu}"`);
});

// ── 2. Tên hàng nằm ở phần CHỮ, không phải phần thông số ──────────────────────────────────────

test('[#213-2] khách phủ định tên và chỉ đưa thông số có đơn vị ≥2 chữ cái → tên hàng KHÔNG rụng', () => {
  const p = { tenGoiY: 'máy xay sinh tố', tenGoc: 'máy sấy sinh tố 350W 220V', hoiXacNhanTen: true };
  for (const cau of ['không, 0.5kW 220V', 'không, 350W 220VAC', 'không, 2.5kg 220V']) {
    const { ten } = docTraLoiTen(cau, p);
    assert.match(ten, /máy sấy sinh tố/i,
      `"${cau}": chỉ có thông số thì phải lùi về tên khách đã gõ, đang là "${ten}"`);
    assert.doesNotMatch(ten, /máy xay/i, `"${cau}": tên bị phủ định không được tới Cổng: "${ten}"`);
  }
});

test('[#213-2] khách sửa thông số → số MỚI thắng, không gửi Cổng hai con số đánh nhau', () => {
  const p = { tenGoiY: 'máy xay sinh tố', tenGoc: 'máy sấy sinh tố 350W 220V', hoiXacNhanTen: true };
  const { ten } = docTraLoiTen('không, 0.5kW 220V', p);
  assert.match(ten, /0\.5kW/i, `công suất mới phải tới Cổng: "${ten}"`);
  assert.doesNotMatch(ten, /350\s*W/i, `công suất cũ phải bị thay, không nối thêm: "${ten}"`);
  assert.match(ten, /220V/i, `điện áp vẫn phải còn: "${ten}"`);
});

test('[#213-2] khách phủ định và nêu tên mới kèm thông số → giữ cả tên mới lẫn thông số', () => {
  const p = { tenGoiY: 'máy xay sinh tố', tenGoc: 'máy sấy sinh tố 350W', hoiXacNhanTen: true };
  const { ten } = docTraLoiTen('không phải, máy sấy thực phẩm 500W', p);
  assert.match(ten, /máy sấy thực phẩm/i, `tên mới: "${ten}"`);
  assert.match(ten, /500W/i, `thông số mới: "${ten}"`);
  assert.doesNotMatch(ten, /350W/i, `công suất cũ đã bị khách sửa: "${ten}"`);
});

// ── 3. "Dạ không …" vẫn là phủ định; "da" không dấu là CHẤT LIỆU, không phải từ xã giao ───────

test('[#213-3] "Dạ không, là máy sấy thật ạ" → vẫn là phủ định tên', () => {
  const p = { tenGoiY: 'máy xay sinh tố', tenGoc: 'máy sấy sinh tố', hoiXacNhanTen: true };
  for (const cau of ['Dạ không, là máy sấy thật ạ', 'vâng không phải, máy sấy thực phẩm', 'ừ không, máy sấy']) {
    const r = docTraLoiTen(cau, p);
    assert.equal(r.phuDinh, true, `"${cau}": lễ phép kiểu người Việt vẫn là phủ định`);
    assert.doesNotMatch(r.ten, /máy xay/i, `"${cau}": tên bị phủ định không được tới Cổng: "${r.ten}"`);
  }
});

test('[#213-3] "da" KHÔNG dấu là chất liệu → bocXaGiao không được cắt', () => {
  assert.equal(bocXaGiao('túi da ạ'), 'túi da', 'chất liệu da đổi chương thuế (4202), không được rụng');
  assert.equal(bocXaGiao('ví bằng da'), 'ví bằng da');
  // Vẫn phải cắt "dạ" CÓ dấu và các từ xã giao khác.
  assert.equal(bocXaGiao('túi nhựa dạ'), 'túi nhựa');
  assert.equal(bocXaGiao('đúng, 350W nhé'), '350W');
});

// ── 4. Khách sửa tên mà chưa đưa thông số → vẫn còn vòng hỏi thứ 2 (trần 2 vòng của #136) ────

const ALL = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt',
  'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien'];
const ML = '11111111-2222-4333-8444-555555555555';

function fakeCtx() {
  const script = Object.fromEntries(ALL.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
  script.phan_loai_hs = () => ({ ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } });
  const store = {};
  const ctx = {
    mcp: fakeMcp(script), tools: new Set(ALL), vision: null, customer: null, history: () => [],
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-10T03:00:00Z'), log: { info() {}, error() {} },
  };
  return { ctx, store, calls: ctx.mcp.calls };
}
const turn = (text) => ({ turnId: 't', chatId: 'u1', userId: 'u1', userName: 'Khách', isGroup: false, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-10T03:00:00.000Z', isStaff: false });
const tenHangDaTra = (calls) => calls.filter((c) => c.name === 'phan_loai_hs').map((c) => c.args.tenHang);
const tin = (r) => plain((r.replies ?? []).map((x) => x.text).join('\n'));

test('[#213-4] đường thật: khách sửa tên, chưa có thông số → bot xin thông số (vòng 2), chưa gọi Cổng', async () => {
  const { ctx, calls } = fakeCtx();
  await hs.handle(turn('Tra hs máy sấy sinh tố'), ctx);           // vòng 1: xác nhận tên + xin thông số
  const r2 = await hs.handle(turn('không, là máy sấy thực phẩm ạ'), ctx);
  const t2 = tin(r2);
  assert.equal(tenHangDaTra(calls).length, 0,
    `chưa có thông số nào thì chưa tra — trần của #136 là 2 vòng, đang tra ngay: ${JSON.stringify(tenHangDaTra(calls))}`);
  assert.match(t2, /c[oô]ng\s*su[aấ]t|[đd]i[eệ]n\s*[aá]p/i, `phải xin thông số còn thiếu: "${t2}"`);
  assert.doesNotMatch(t2, /em hi[eể]u l[aà]/i, `KHÔNG được hỏi lại cái tên khách vừa gõ: "${t2}"`);
});

test('[#213-4] đường thật: trả lời vòng 2 → tra luôn, không hỏi vòng 3', async () => {
  const { ctx, calls } = fakeCtx();
  await hs.handle(turn('Tra hs máy sấy sinh tố'), ctx);
  await hs.handle(turn('không, là máy sấy thực phẩm ạ'), ctx);
  const r3 = await hs.handle(turn('500W 220V'), ctx);
  const ts = tenHangDaTra(calls);
  assert.equal(ts.length, 1, `phải gọi Cổng đúng một lần (đang có ${ts.length}): ${JSON.stringify(ts)}`);
  assert.match(ts[0], /máy sấy thực phẩm/i, `tên khách sửa phải tới Cổng: "${ts[0]}"`);
  assert.match(ts[0], /500W/i, `thông số vòng 2 phải tới Cổng: "${ts[0]}"`);
  assert.ok(r3.jobs.length, 'phải giao việc nền để khách nhận được mã');
});

test('[#213-4] đường thật: khách buông "cứ tra đi" ở vòng 2 → tra theo giả định, không hỏi nữa', async () => {
  // Điều II: không treo khách ở vòng hỏi vô tận.
  const { ctx, calls } = fakeCtx();
  await hs.handle(turn('Tra hs máy sấy sinh tố'), ctx);
  const r2 = await hs.handle(turn('không rõ, cứ tra đi ạ'), ctx);
  const ts = tenHangDaTra(calls);
  assert.equal(ts.length, 1, `phải tra luôn khi khách buông (đang có ${ts.length})`);
  assert.ok(r2.jobs.length, 'phải giao việc nền');
});
