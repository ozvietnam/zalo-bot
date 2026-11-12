// packs/hs/test/soat-213-vong4.test.mjs — VÒNG SOÁT 4 của PR #213: hai điểm giám đốc CHẶN.
//
// Cả hai là HỒI QUY: đo trên `origin/main` (`9275a14`) bằng CÙNG một script, cùng những câu này,
// `main` ra ĐÚNG — mã mới của PR #213 làm nó sai. Bảng đo hai nhánh (đường thật `hs.handle`):
//
//   câu khách                                                      | PR #213 trước vá        | main
//   "máy sấy sinh tố" → "máy sấy thực phẩm ạ" → "350W 220V"        | GHÉP ĐÔI hai mặt hàng   | "máy sấy thực phẩm 350W 220V"
//   "máy sấy sinh tố" → "là máy sấy thực phẩm" → "350W 220V"       | ghép, lọt cả chữ "là"   | "máy sấy thực phẩm 350W 220V"
//   "Tra hs máy sấy sinh tố 350W" → "350W 220V"                    | "… 350W 350W 220V"      | không lặp
//   "Tra hs máy xay sinh tố 350W" → "500W 220V"                    | "… 350W 500W 220V"      | số MỚI thắng
//
// Gốc hai lỗi, đúng một chỗ: dòng nối mô tả ở `doc-tra-loi.js`.
//   1) Khách sửa tên mà KHÔNG mở đầu bằng "không" thì `docTraLoiTen` không vào nhánh phủ định,
//      `laXacNhan` cũng false ⇒ `botDoanTen` = true ⇒ `tenChuan = tenGoc`, rồi phép đo `trung`
//      ("câu mới có chứa tên cũ không") ra false nên tên CŨ bị dán lên trước tên MỚI. Cổng nhận
//      một mặt hàng lai mang CẢ HAI món; `packages.js:218` còn ghi tên ghép đó vào `tenGoc` nên nó
//      SỐNG TRONG SESSION sang vòng sau. Người Việt sửa tên hay nói thẳng, không nói "không" —
//      đây là câu khách nói hàng ngày, không phải ca hiếm (Điều III, Điều VIII).
//   2) `tenChuan` còn mang THÔNG SỐ khách gõ ở tin đầu, nên khi nối thêm câu mới thì hai con số
//      CÙNG LOẠI cùng tới Cổng: lặp "350W 350W", và nặng hơn là khách SỬA số ("350W" → "500W") mà
//      Cổng nhận cả hai, không biết số nào thật. `giuThongSo(…, tenGoc)` được viết ra ĐÚNG để
//      quyết chuyện đó (số mới thắng số cũ cùng loại), nhưng nó không bao giờ được thấy xung đột
//      vì số cũ đã lọt vào qua phần TÊN.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xuLyTraLoiHoiLai } from '../dien-cho-thieu.js';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import hs from '../index.js';

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
  return { ctx, calls: ctx.mcp.calls };
}
const turn = (text) => ({ turnId: 't', chatId: 'u1', userId: 'u1', userName: 'Khách', isGroup: false, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-10T03:00:00.000Z', isStaff: false });
const tenHangDaTra = (calls) => calls.filter((c) => c.name === 'phan_loai_hs').map((c) => c.args.tenHang);

/** Chạy một mạch tin trên đường thật, trả về các tên hàng đã gửi Cổng. */
async function mach(...cacTin) {
  const { ctx, calls } = fakeCtx();
  for (const t of cacTin) await hs.handle(turn(t), ctx);
  return tenHangDaTra(calls);
}

// ── CHẶN 1: khách sửa tên KHÔNG mở đầu bằng "không" → tên mới THAY tên cũ, không ghép đôi ─────

for (const [nhan, sua, conSinhTo] of [
  ['thẳng', 'máy sấy thực phẩm ạ', /sinh\s*t[oố]/i],
  ['có chữ "là"', 'là máy sấy thực phẩm', /sinh\s*t[oố]/i],
  ['không dấu', 'may say thuc pham a', /sinh\s*to/i],   // khách Zalo gõ không dấu rất nhiều
]) {
  test(`[#213-10] đường thật (${nhan}): khách sửa tên không nói "không" → Cổng KHÔNG nhận hai mặt hàng`, async () => {
    const dau = /không dấu/.test(nhan) ? 'Tra hs may say sinh to' : 'Tra hs máy sấy sinh tố';
    const ts = await mach(dau, sua, '350W 220V');
    assert.equal(ts.length, 1, `phải gọi Cổng đúng một lần (main: 1 lần): ${JSON.stringify(ts)}`);
    assert.match(ts[0], /th[uự]c\s*ph[aẩ]m|thuc\s*pham/i, `tên MỚI của khách phải tới Cổng: "${ts[0]}"`);
    assert.doesNotMatch(ts[0], conSinhTo,
      `tên CŨ khách vừa sửa không được đi cùng — mặt hàng lai mang hai món: "${ts[0]}"`);
    assert.doesNotMatch(ts[0], /(?<![\p{L}])l[aà](?![\p{L}])/iu, `từ đệm "là" không phải tên hàng: "${ts[0]}"`);
    for (const x of ['350W', '220V']) assert.match(ts[0], new RegExp(x, 'i'), `${x} phải còn: "${ts[0]}"`);
  });
}

test('[#213-10] tên ghép không được SỐNG TRONG SESSION sang vòng sau', async () => {
  // `packages.js:218` ghi mô tả mới vào `tenGoc`, nên một lần ghép là ghép mãi: khách buông
  // "cứ tra đi" ở vòng sau thì GIẢ ĐỊNH cũng mang tên ghép. Trước vá, câu này ra
  // "máy sấy sinh tố máy sấy thực phẩm loại thông dụng…" — hai món trong một giả định.
  const ts = await mach('Tra hs máy sấy sinh tố', 'máy sấy thực phẩm ạ', 'cứ tra đi ạ');
  assert.equal(ts.length, 1, `phải tra luôn khi khách buông: ${JSON.stringify(ts)}`);
  assert.doesNotMatch(ts[0], /sinh\s*t[oố]/i, `giả định cũng không được mang tên cũ: "${ts[0]}"`);
  assert.match(ts[0], /th[uự]c\s*ph[aẩ]m/i, `giả định phải dựng từ tên MỚI của khách: "${ts[0]}"`);
});

test('[#213-10b] NỢ SẴN CÓ trên `main`: tin đến SAU khi lượt đã chốt đi qua HỒ SƠ GỘP', async () => {
  // Đo được y hệt trên `main` (`9275a14`) nên KHÔNG phải tác dụng phụ của PR này — chỉ khoá hành
  // vi hiện tại để lần sau đổi là có test nói. Gốc: khách buông "cứ tra đi" ở vòng 2 thì lượt
  // phân loại ĐÃ chốt; tin "350W 220V" sau đó không còn câu hỏi nào đang mở nên `packages.js`
  // dựng mô tả từ HỒ SƠ MẠCH (#170) — mô tả đó gộp mọi tin khách đã gõ trong mạch, kể cả tên cũ.
  const ts = await mach('Tra hs máy sấy', 'máy sấy sinh tố', 'cứ tra đi ạ', '350W 220V');
  assert.equal(ts.length, 2, `khoá hành vi hiện tại: tin sau mở một lượt MỚI: ${JSON.stringify(ts)}`);
  assert.doesNotMatch(ts[0], /máy xay/i, `lượt do khách buông vẫn phải theo tên KHÁCH: "${ts[0]}"`);
});

// ── CHẶN 2: thông số cũ còn trong `tenChuan` → hai số cùng loại đánh nhau ──────────────────────

test('[#213-11] đường thật: khách nhắc lại cùng số → mô tả gửi Cổng KHÔNG lặp thông số', async () => {
  const ts = await mach('Tra hs máy sấy sinh tố 350W', '350W 220V');
  assert.equal(ts.length, 1, `phải gọi Cổng đúng một lần: ${JSON.stringify(ts)}`);
  assert.doesNotMatch(ts[0], /350W[\s\S]*350W/i, `"350W 350W" là mô tả rác, main không lặp: "${ts[0]}"`);
  assert.match(ts[0], /220V/i, `điện áp khách vừa gõ phải còn: "${ts[0]}"`);
});

for (const [nhan, cacTin] of [
  ['có dấu', ['Tra hs máy xay sinh tố 350W', '500W 220V']],
  ['không dấu', ['Tra hs may xay sinh to 350W', '500W 220V']],
]) {
  test(`[#213-11] đường thật (${nhan}): khách SỬA công suất → số MỚI thắng, số CŨ phải mất`, async () => {
    const ts = await mach(...cacTin);
    assert.equal(ts.length, 1, `phải gọi Cổng đúng một lần: ${JSON.stringify(ts)}`);
    assert.match(ts[0], /500W/i, `số MỚI của khách phải tới Cổng: "${ts[0]}"`);
    assert.doesNotMatch(ts[0], /350W/i,
      `khách SỬA số mà Cổng nhận cả hai thì không biết số nào thật: "${ts[0]}"`);
  });
}

test('[#213-11] hàm: `giuThongSo` là chỗ DUY NHẤT quyết thông số nào sống', () => {
  // Đo thẳng ở hàm để lần sau ai nối lại thông số qua phần TÊN là có test nói ngay.
  const r = xuLyTraLoiHoiLai('500W 220V', {
    tenGoc: 'máy xay sinh tố 350W', tenGoiY: 'máy xay sinh tố', vongHoi: 1, hoiXacNhanTen: true,
  });
  assert.doesNotMatch(r.moTaTraCuu, /350W/i, `số cũ cùng loại phải mất: "${r.moTaTraCuu}"`);
  assert.match(r.moTaTraCuu, /máy xay sinh tố/i, `tên hàng không được rụng: "${r.moTaTraCuu}"`);
});

test('[#213-11] chốt ngược: thông số khách gõ tin trước KHÔNG rụng khi câu mới không nêu loại đó', () => {
  // `giuThongSo` vẫn phải bù: khách gõ "350W" ở tin đầu, tin sau chỉ nói điện áp.
  const r = xuLyTraLoiHoiLai('220V', {
    tenGoc: 'máy sấy sinh tố 350W', tenGoiY: 'máy xay sinh tố', vongHoi: 1, hoiXacNhanTen: true,
  });
  assert.match(r.moTaTraCuu, /350W/i, `công suất tin trước phải còn: "${r.moTaTraCuu}"`);
  assert.match(r.moTaTraCuu, /220V/i, `điện áp mới phải có: "${r.moTaTraCuu}"`);
});

// ── Chốt ngược: đừng vá hỏng việc đang đúng (đúng danh sách giám đốc dặn) ─────────────────────

test('[#213-12] chốt ngược: khách phủ định rồi gõ lại ĐÚNG tên mình → tin bot không rụng', async () => {
  const ts = await mach('Tra hs máy sấy sinh tố', 'không, là máy sấy sinh tố 350W 220V');
  assert.equal(ts.length, 1, `phải gọi Cổng đúng một lần: ${JSON.stringify(ts)}`);
  assert.match(ts[0], /máy s[aấ]y sinh t[oố]/i, `tên khách phải tới Cổng: "${ts[0]}"`);
  assert.doesNotMatch(ts[0], /máy xay/i, `tên bị phủ định không được tới Cổng: "${ts[0]}"`);
});

test('[#213-12] chốt ngược: câu trả lời THUỘC TÍNH giữ nguyên tên hàng và chữ "không"', async () => {
  const ts = await mach('Tra hs ống thép', 'không mạ kẽm, đúc DN50');
  assert.equal(ts.length, 1, `phải gọi Cổng đúng một lần: ${JSON.stringify(ts)}`);
  assert.match(ts[0], /[oố]ng\s*th[eé]p/i, `tên hàng không được rụng: "${ts[0]}"`);
  assert.match(ts[0], /kh[oô]ng\s*m[aạ]\s*k[eẽ]m/i, `mất chữ "không" là bot nói ngược khách: "${ts[0]}"`);
});

test('[#213-12] chốt ngược: câu đáp CÔNG DỤNG không bị đếm thành tên mới', async () => {
  const ts = await mach('Tra hs máy sấy sinh tố', 'không, loại cầm tay 350W 220V');
  assert.equal(ts.length, 1, `phải gọi Cổng đúng một lần: ${JSON.stringify(ts)}`);
  assert.match(ts[0], /máy s[aấ]y sinh t[oố]/i, `tên hàng không được rụng: "${ts[0]}"`);
  assert.match(ts[0], /c[aầ]m\s*tay/i, `công dụng vẫn đi nguyên văn tới Cổng: "${ts[0]}"`);
});

test('[#213-12] chốt ngược: khách XÁC NHẬN rõ thì tên bot đoán MỚI được dùng', async () => {
  const ts = await mach('Tra hs máy sấy', 'máy sấy sinh tố', 'đúng ạ, 350W 220V');
  assert.equal(ts.length, 1, `phải gọi Cổng đúng một lần: ${JSON.stringify(ts)}`);
  assert.match(ts[0], /máy xay sinh tố/i, `khách đã xác nhận tên bot đoán: "${ts[0]}"`);
});

test('[#213-12] chốt ngược: khách chỉ đáp THÔNG SỐ → giữ tên khách gõ, không tráo', async () => {
  const ts = await mach('Tra hs máy sấy', 'máy sấy sinh tố', '350W 220V');
  assert.equal(ts.length, 1, `phải gọi Cổng đúng một lần: ${JSON.stringify(ts)}`);
  assert.match(ts[0], /máy s[aấ]y sinh t[oố]/i, `tên khách tự gõ phải tới Cổng: "${ts[0]}"`);
  assert.doesNotMatch(ts[0], /máy xay/i, `chưa xác nhận thì không được tráo: "${ts[0]}"`);
});

test('[#213-12] chốt ngược: câu đáp CHẤT LIỆU của nhánh hỏi thuộc tính không thay tên hàng', () => {
  // Nhánh này KHÔNG hỏi xác nhận tên (`hoiXacNhanTen` false) nên "inox 304" là chất liệu, không
  // phải tên món — vá chặn 1 không được chạm vào đây, nếu không "van bi" rụng hẳn.
  const r = xuLyTraLoiHoiLai('inox 304 DN50', {
    tenGoc: 'van bi', tenGoiY: 'van bi', vongHoi: 1, thieu: ['chatLieu', 'kichThuoc'],
  });
  assert.match(r.moTaTraCuu, /van bi/i, `tên hàng phải còn: "${r.moTaTraCuu}"`);
  assert.match(r.moTaTraCuu, /inox 304/i, `chất liệu phải còn: "${r.moTaTraCuu}"`);
  assert.match(r.moTaTraCuu, /DN50/i, `kích thước phải còn: "${r.moTaTraCuu}"`);
});
