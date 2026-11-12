// packs/hs/test/soat-213-vong5.test.mjs — VÒNG SOÁT 5 của PR #213: hai điểm giám đốc CHẶN.
//
// Cả hai là HỒI QUY: đo trên `origin/main` (`9275a14`) bằng CÙNG một script, cùng những câu này,
// `main` ra ĐÚNG HƠN. Bảng đo hai nhánh (đường thật `hs.handle`, tên hàng gửi Cổng):
//
//   câu khách                                                              | PR #213 trước vá                       | main
//   "máy sấy sinh tố"→"máy sấy thực phẩm"→"máy sấy công nghiệp"→"350W 220V" | "máy sấy thực phẩm máy sấy công nghiệp" | "máy sấy thực phẩm 350W 220V"
//   "may say sinh to"→"may say thuc pham"→"may say cong nghiep"→"350W 220V" | "máy sấy thực phẩm may say cong nghiep" | "máy sấy thực phẩm 350W 220V"
//   "máy sấy sinh tố" → "là sao ạ"                                         | "sao"        (TÊN HÀNG RỤNG HẲN)        | "máy xay sinh tố là sao 350W 220V"
//   "máy sấy sinh tố" → "nghĩa là gì ạ"                                    | "nghĩa"      (TÊN HÀNG RỤNG HẲN)        | "máy xay sinh tố nghĩa 350W 220V"
//   "máy sấy sinh tố" → "ý em là sao ạ?"                                   | "ý là sao"   (TÊN HÀNG RỤNG HẲN)        | "máy xay sinh tố ý là sao 350W 220V"
//
// Gốc hai lỗi:
//   1) Cờ "tên mới THAY tên cũ" (vá vòng 4) treo vào `hoiXacNhanTen` — một biến ĐỔI GIÁ TRỊ giữa
//      các vòng hỏi: sau lần sửa tên thứ nhất, tên là do KHÁCH gõ nên bot thôi hỏi xác nhận
//      (`hoiXacNhanTen: false`), và lần sửa tên thứ HAI rơi lại đúng nhánh nối hai tên. Thứ cần
//      phân biệt không phải "có hỏi xác nhận tên hay không" mà là nhánh đang treo hỏi TÊN hay hỏi
//      THUỘC TÍNH (chất liệu/quy cách/công dụng) — nhánh thuộc tính thì câu đáp là thuộc tính của
//      đúng món đó, không phải tên món mới.
//   2) `coTenTrong` đếm CÂU HỎI CỦA KHÁCH thành tên hàng. Khách hỏi lại một câu ("là sao ạ") mà
//      bot đi tra mã của "sao" thì mã chắc chắn sai, mà mô tả khai báo in thẳng cho khách dùng
//      (Điều III, Điều VIII). Câu hỏi của khách không phải dữ kiện mặt hàng: tên hàng khách đã gõ
//      phải giữ nguyên, và bot còn vòng thì hỏi lại cho khách một lượt nữa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xuLyTraLoiHoiLai } from '../dien-cho-thieu.js';
import { laCauHoiKhach, bocCumHoi, coTenTrong } from '../ky-luat-hoi.js';
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

/** Chạy một mạch tin trên đường thật, trả về các tên hàng đã gửi Cổng. */
async function mach(...cacTin) {
  const { ctx, calls } = fakeCtx();
  for (const t of cacTin) await hs.handle(turn(t), ctx);
  return calls.filter((c) => c.name === 'phan_loai_hs').map((c) => c.args.tenHang);
}

// ── CHẶN 1: khách sửa tên LẦN THỨ HAI (vòng hỏi 3) cũng không được ghép đôi hai mặt hàng ──────

for (const [nhan, cacTin, cu, moi] of [
  ['có dấu', ['Tra hs máy sấy sinh tố', 'máy sấy thực phẩm', 'máy sấy công nghiệp', '350W 220V'],
    /th[uự]c\s*ph[aẩ]m/i, /c[oô]ng\s*nghi[eệ]p/i],
  ['không dấu', ['Tra hs may say sinh to', 'may say thuc pham', 'may say cong nghiep', '350W 220V'],
    /thuc\s*pham/i, /cong\s*nghiep/i],
]) {
  test(`[#213-13] đường thật (${nhan}): khách sửa tên LẦN HAI → Cổng không nhận hai mặt hàng`, async () => {
    const ts = await mach(...cacTin);
    assert.ok(ts.length >= 1, `phải gọi Cổng: ${JSON.stringify(ts)}`);
    // Lượt do CÂU TRẢ LỜI của khách chốt — đúng chỗ giám đốc chặn.
    assert.ok(!(cu.test(ts[0]) && moi.test(ts[0])),
      `mặt hàng lai mang CẢ HAI tên khách đã sửa — bot in mã + thuế của thứ không tồn tại: "${ts[0]}"`);
    assert.match(ts[0], moi, `tên MỚI NHẤT của khách phải tới Cổng: "${ts[0]}"`);
  });
}

test('[#213-13b] NỢ SẴN CÓ trên `main`: tin đến SAU khi lượt đã chốt đi qua HỒ SƠ GỘP', async () => {
  // Cùng gốc với `[#213-10b]` của vòng soát 4, KHÔNG phải tác dụng phụ của PR này. Lượt phân loại
  // đã chốt ở tin 3, nên tin "350W 220V" không còn câu hỏi nào đang mở: `packages.js` dựng mô tả
  // từ HỒ SƠ MẠCH (#170), mà hồ sơ gộp MỌI tin khách đã gõ trong mạch, kể cả tên cũ. Đo được y hệt
  // trên `main` (`9275a14`) ở mạch tương đương:
  //   main: "Tra hs máy sấy" → "máy sấy sinh tố" → "cứ tra đi ạ" → "350W 220V"
  //         ⇒ lượt 2 = "máy sấy (khách nói thêm: máy sấy sinh tố — 350W 220V)" — cũng gộp tên cũ.
  // Chỉ khoá hành vi hiện tại để lần sau đổi là có test nói. Xin xếp vào OZV-371 cùng điểm 8.
  const ts = await mach('Tra hs máy sấy sinh tố', 'máy sấy thực phẩm', 'máy sấy công nghiệp', '350W 220V');
  assert.equal(ts.length, 2, `khoá hành vi hiện tại: tin sau mở một lượt MỚI: ${JSON.stringify(ts)}`);
  assert.match(ts[1], /kh[aá]ch n[oó]i th[eê]m/i, `lượt 2 là mô tả dựng từ hồ sơ gộp: "${ts[1]}"`);
});

test('[#213-13] hàm: nhánh hỏi THÔNG SỐ (không hỏi xác nhận tên) vẫn phải cho tên mới THAY tên cũ', () => {
  // Đây đúng là trạng thái session sau lần sửa tên thứ nhất: tên do KHÁCH gõ nên bot thôi hỏi
  // xác nhận (`hoiXacNhanTen: false`), câu đang treo chỉ xin công suất + điện áp.
  const r = xuLyTraLoiHoiLai('máy sấy công nghiệp', {
    tenGoc: 'máy sấy thực phẩm', tenGoiY: 'máy sấy thực phẩm', vongHoi: 1,
    hoiXacNhanTen: false, thieu: ['congSuat', 'dienAp'],
  });
  assert.match(r.moTaTraCuu, /c[oô]ng\s*nghi[eệ]p/i, `tên MỚI phải tới Cổng: "${r.moTaTraCuu}"`);
  assert.doesNotMatch(r.moTaTraCuu, /th[uự]c\s*ph[aẩ]m/i,
    `tên CŨ khách vừa sửa không được đi cùng: "${r.moTaTraCuu}"`);
});

test('[#213-13] chốt ngược: nhánh hỏi THUỘC TÍNH vẫn giữ nguyên hành vi (câu đáp không phải tên mới)', () => {
  // Nhánh "van bi chất liệu gì ạ?" — "inox 304" là CHẤT LIỆU của đúng món đó. Vá chặn 1 không
  // được chạm vào đây, nếu không tên hàng "van bi" rụng hẳn.
  for (const phien of [
    { tenGoc: 'van bi', tenGoiY: 'van bi', vongHoi: 1, thieu: ['chatLieu', 'kichThuoc'] },
    { tenGoc: 'van bi', tenGoiY: 'van bi', vongHoi: 1, hoiThuocTinh: true },
  ]) {
    const r = xuLyTraLoiHoiLai('inox 304 DN50', phien);
    assert.match(r.moTaTraCuu, /van bi/i, `tên hàng phải còn (${JSON.stringify(phien)}): "${r.moTaTraCuu}"`);
    assert.match(r.moTaTraCuu, /inox 304/i, `chất liệu phải còn: "${r.moTaTraCuu}"`);
    assert.match(r.moTaTraCuu, /DN50/i, `kích thước phải còn: "${r.moTaTraCuu}"`);
  }
});

test('[#213-13] chốt ngược: nhánh hỏi CÔNG DỤNG — câu đáp chất liệu không được thay tên hàng', () => {
  // Nhánh điện gia dụng ("máy sấy công nghiệp này … gia đình hay công nghiệp ạ?") đã nêu công
  // dụng nên `thieu` chỉ còn thông số; cờ phải do NHÁNH khai, không suy từ `thieu` trơ.
  const r = xuLyTraLoiHoiLai('inox 350W', {
    tenGoc: 'máy sấy công nghiệp', tenGoiY: 'máy sấy công nghiệp', vongHoi: 1,
    hoiThuocTinh: true, thieu: ['congSuat', 'dienAp'],
  });
  assert.match(r.moTaTraCuu, /máy s[aấ]y/i, `tên hàng không được rụng: "${r.moTaTraCuu}"`);
  assert.match(r.moTaTraCuu, /inox/i, `chất liệu khách vừa nêu phải còn: "${r.moTaTraCuu}"`);
});

// ── CHẶN 2: khách HỎI LẠI thì câu hỏi của khách KHÔNG phải tên hàng ───────────────────────────

for (const [nhan, cauHoiKhach, rac] of [
  ['là sao ạ', 'là sao ạ', /(?<![\p{L}])sao(?![\p{L}])/iu],
  ['nghĩa là gì ạ', 'nghĩa là gì ạ', /ngh[iĩ]a|(?<![\p{L}])g[iì](?![\p{L}])/iu],
  ['ý em là sao?', 'ý em là sao ạ?', /(?<![\p{L}])(?:sao|[ýy])(?![\p{L}])/iu],
  ['không dấu', 'la sao a', /(?<![\p{L}])sao(?![\p{L}])/iu],
  ['không hiểu (mở đầu bằng phủ định)', 'không hiểu ạ', /hi[eể]u/i],
]) {
  test(`[#213-14] đường thật: khách hỏi lại "${nhan}" → tên hàng KHÔNG rụng, câu hỏi không đi Cổng`, async () => {
    const dau = nhan === 'không dấu' ? 'Tra hs may say sinh to' : 'Tra hs máy sấy sinh tố';
    const ten = nhan === 'không dấu' ? /may say sinh to/i : /máy s[aấ]y sinh t[oố]/i;
    const ts = await mach(dau, cauHoiKhach, '350W 220V');
    assert.ok(ts.length >= 1, `phải gọi Cổng: ${JSON.stringify(ts)}`);
    for (const t of ts) {
      assert.match(t, ten, `tên hàng khách đã gõ phải giữ nguyên: "${t}"`);
      assert.doesNotMatch(t, rac, `câu HỎI của khách không phải dữ kiện mặt hàng: "${t}"`);
      assert.doesNotMatch(t, /máy xay/i, `khách chưa xác nhận thì không được tráo món: "${t}"`);
    }
  });
}

test('[#213-14] đường thật: khách hỏi lại thì bot còn vòng phải HỎI LẠI, không chốt tra ngay', async () => {
  const { ctx, calls } = fakeCtx();
  await hs.handle(turn('Tra hs máy sấy sinh tố'), ctx);
  const r = await hs.handle(turn('là sao ạ'), ctx);
  const chu = JSON.stringify(r);
  assert.equal(calls.filter((c) => c.name === 'phan_loai_hs').length, 0,
    'khách hỏi lại mà bot chốt tra luôn thì câu hỏi của khách bị bỏ rơi (Điều II)');
  assert.match(chu, /\?/, `bot phải nói tiếp một câu cho khách: ${chu.slice(0, 200)}`);
});

test('[#213-14] hàm: khách hỏi lại KÈM thông số → giữ tên hàng và giữ con số', () => {
  const r = xuLyTraLoiHoiLai('350W thì sao ạ', {
    tenGoc: 'máy sấy sinh tố', tenGoiY: 'máy xay sinh tố', vongHoi: 1, hoiXacNhanTen: true,
  });
  assert.match(r.moTaTraCuu, /máy s[aấ]y sinh t[oố]/i, `tên khách gõ phải còn: "${r.moTaTraCuu}"`);
  assert.match(r.moTaTraCuu, /350W/i, `thông số khách nêu phải còn: "${r.moTaTraCuu}"`);
  assert.doesNotMatch(r.moTaTraCuu, /(?<![\p{L}])sao(?![\p{L}])/iu,
    `chữ của câu hỏi không đi Cổng: "${r.moTaTraCuu}"`);
});

test('[#213-14] hàm `laCauHoiKhach`: nhận câu hỏi, KHÔNG bắt oan câu trả lời', () => {
  for (const s of ['là sao ạ', 'la sao a', 'nghĩa là gì ạ', 'ý em là sao ạ?', 'không hiểu ạ',
    'chưa hiểu ạ', 'thế nào ạ', 'như thế nào ạ', 'van bi là gì ạ', 'tại sao vậy']) {
    assert.equal(laCauHoiKhach(s), true, `phải nhận là câu hỏi của khách: "${s}"`);
  }
  for (const s of ['máy sấy thực phẩm ạ', 'may say thuc pham a', 'đúc ạ', 'inox 304 DN50',
    'không mạ kẽm, đúc DN50', '350W 220V', 'đúng ạ, 350W 220V', 'không, là máy sấy sinh tố',
    'loại cầm tay 350W', 'túi da ạ', 'cứ tra đi ạ']) {
    assert.equal(laCauHoiKhach(s), false, `câu TRẢ LỜI bị bắt oan thành câu hỏi: "${s}"`);
  }
});

test('[#213-14] hàm `bocCumHoi`/`coTenTrong`: cụm hỏi không được đếm thành tên hàng', () => {
  for (const s of ['là sao ạ', 'nghĩa là gì ạ', 'ý em là sao ạ?', 'la sao a', 'không hiểu ạ']) {
    assert.equal(coTenTrong(s), false, `cụm hỏi bị đếm thành tên hàng: "${s}" → "${bocCumHoi(s)}"`);
  }
  for (const s of ['máy sấy thực phẩm ạ', 'van bi inox', 'túi da ạ']) {
    assert.equal(coTenTrong(s), true, `tên hàng thật phải còn đo ra tên: "${s}"`);
  }
});

// ── Chốt ngược vòng 4 phải giữ xanh (đúng danh sách giám đốc dặn) ─────────────────────────────

test('[#213-15] chốt ngược: khách sửa tên LẦN MỘT vẫn thay tên cũ, không ghép', async () => {
  const ts = await mach('Tra hs máy sấy sinh tố', 'máy sấy thực phẩm ạ', '350W 220V');
  assert.equal(ts.length, 1, `phải gọi Cổng đúng một lần: ${JSON.stringify(ts)}`);
  assert.match(ts[0], /th[uự]c\s*ph[aẩ]m/i, `tên mới phải tới Cổng: "${ts[0]}"`);
  assert.doesNotMatch(ts[0], /sinh\s*t[oố]/i, `tên cũ không được đi cùng: "${ts[0]}"`);
});

test('[#213-15] chốt ngược: khách XÁC NHẬN rõ thì tên bot đoán mới được dùng', async () => {
  const ts = await mach('Tra hs máy sấy', 'máy sấy sinh tố', 'đúng ạ, 350W 220V');
  assert.equal(ts.length, 1, `phải gọi Cổng đúng một lần: ${JSON.stringify(ts)}`);
  assert.match(ts[0], /máy xay sinh tố/i, `khách đã xác nhận tên bot đoán: "${ts[0]}"`);
});

test('[#213-15] chốt ngược: khách SỬA số → số mới thắng, số cũ phải mất', async () => {
  const ts = await mach('Tra hs máy xay sinh tố 350W', '500W 220V');
  assert.equal(ts.length, 1, `phải gọi Cổng đúng một lần: ${JSON.stringify(ts)}`);
  assert.match(ts[0], /500W/i, `số mới phải tới Cổng: "${ts[0]}"`);
  assert.doesNotMatch(ts[0], /350W/i, `Cổng nhận cả hai số thì không biết số nào thật: "${ts[0]}"`);
});

test('[#213-15] chốt ngược: nhánh chất liệu trên đường thật — "van bi" và "túi da" không rụng', async () => {
  const vanBi = await mach('Tra hs van bi', 'inox 304 DN50');
  assert.match(vanBi[0], /van bi/i, `tên hàng phải còn: "${vanBi[0]}"`);
  const tuiDa = await mach('Tra hs túi da', 'túi da ạ');
  for (const t of tuiDa) assert.match(t, /t[uú]i da/i, `chất liệu da đổi chương thuế, không được rụng: "${t}"`);
});

test('[#213-15] chốt ngược: câu trả lời THUỘC TÍNH giữ nguyên tên hàng và chữ "không"', async () => {
  const ts = await mach('Tra hs ống thép', 'không mạ kẽm, đúc DN50');
  assert.equal(ts.length, 1, `phải gọi Cổng đúng một lần: ${JSON.stringify(ts)}`);
  assert.match(ts[0], /[oố]ng\s*th[eé]p/i, `tên hàng không được rụng: "${ts[0]}"`);
  assert.match(ts[0], /kh[oô]ng\s*m[aạ]\s*k[eẽ]m/i, `mất chữ "không" là bot nói ngược khách: "${ts[0]}"`);
});
