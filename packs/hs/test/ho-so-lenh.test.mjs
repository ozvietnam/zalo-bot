// Lệnh ngắn, món khác, sổ trượt và một mạch một việc nền — các lớp lỗi người soát đo đo được
// ([S3], [S4], [S6], [S13]–[S17]). Tách khỏi `ho-so-mach.test.mjs` (Điều VI: mỗi tệp một
// trách nhiệm, dưới 300 dòng).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import hs from '../index.js';
import { plain } from '../style.js';

const ALL = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt',
  'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien'];

const MO_TA = 'Chốt kẹp xoay 1/4 vòng loại núm thấp (Low-Height Knob Quarter-Turn Clamp), mã QCTHL0525-10S, cố định vỏ máy và cửa bảo vệ';
const ML = '11111111-2222-4333-8444-555555555555';

/** Thông số "AI đọc ảnh": đúng cái bẫy của issue — chữ ON OFF in trên núm. */
const VISION_ON_OFF = {
  readSpecs: async () => ({ tenHang: 'Núm vặn khoá bật tắt ON OFF', chatLieu: 'thép không gỉ + núm nhựa ABS',
    chuTrongAnh: 'ON  OFF', khongChac: [] }),
};

function fakeCtx(overrides = {}, { vision = null, history = () => [] } = {}) {
  const script = Object.fromEntries(ALL.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
  for (const [k, v] of Object.entries(overrides)) script[k] = typeof v === 'function' ? v : () => v;
  const store = {};
  const ctx = {
    mcp: fakeMcp(script), tools: new Set(ALL), vision, customer: null, history,
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-10T03:00:00Z'), log: { info() {}, error() {} },
  };
  return { ctx, store, calls: ctx.mcp.calls };
}
const turn = (text, extra = {}) => ({ turnId: 't', chatId: 'G', userId: 'u1', userName: 'Khách', isGroup: true, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-10T03:00:00.000Z', isStaff: false, ...extra });
const photo = (caption = null) => turn(null, { photoUrl: 'https://photo-stal-14.zdn.vn/no/jpg/abc.jpg', caption });
const tenHangDaTra = (calls) => calls.filter((c) => c.name === 'phan_loai_hs').map((c) => c.args.tenHang);
test('[S3] hồ sơ đang mở KHÔNG được nuốt menu, chọn gói, "hàng mới", lời chào — khách luôn có đường thoát', async () => {
  // Người soát đo: nhánh bắt-tất-cả đứng trước routeThongMinh, mà "hồ sơ có nguồn khác" đúng vĩnh viễn
  // sau một ảnh → menu mất, "4"/"7" không chọn được gói, "soát tờ khai"/"xin chào" bị nhồi vào gói 1.
  const mk = () => fakeCtx({ phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } } }, { vision: VISION_ON_OFF });
  const dungHoSoCoAnh = async (ctx) => {
    await hs.handle(turn(MO_TA), ctx);
    await hs.handle(photo('chất liệu: thép không gỉ + núm nhựa ABS'), ctx);
  };

  {
    const { ctx } = mk();
    await dungHoSoCoAnh(ctx);
    const r = await hs.handle(turn('menu'), ctx);
    assert.match(plain(r.replies[0]?.text ?? ''), /gói tra cứu|Gói 1/i, 'menu phải ra menu');
  }
  {
    const { ctx, calls } = mk();
    await dungHoSoCoAnh(ctx);
    const truoc = calls.filter((c) => c.name === 'phan_loai_hs').length;
    const r = await hs.handle(turn('4'), ctx);
    assert.match(plain(r.replies[0]?.text ?? ''), /Gói 4/i, '"4" phải chọn gói 4');
    assert.equal(calls.filter((c) => c.name === 'phan_loai_hs').length, truoc, '"4" không được gọi gói 1');
  }
  {
    const { ctx, calls } = mk();
    await dungHoSoCoAnh(ctx);
    const r = await hs.handle(turn('xin chào'), ctx);
    assert.match(plain(r.replies[0]?.text ?? ''), /ch[aà]o/i, 'lời chào phải được trả lời như lời chào');
    for (const t of tenHangDaTra(calls)) {
      assert.doesNotMatch(t, /xin ch[aà]o/i, `lời chào bị nối vào tên hàng: "${t}"`);
    }
  }
  {
    // Chữ tự do liên tiếp không được NỐI vào tên hàng gửi Cổng (người soát đo tên hàng lai
    // "Chốt kẹp … — 7 — soát tờ khai — xin chào").
    const { ctx, calls } = mk();
    await dungHoSoCoAnh(ctx);
    for (const t of ['7', 'soát tờ khai của em', 'xin chào']) await hs.handle(turn(t), ctx);
    for (const t of tenHangDaTra(calls)) {
      assert.doesNotMatch(t, /xin ch[aà]o|— 7|t[oờ] khai/i, `chữ tự do bị nối vào tên hàng: "${t}"`);
      assert.match(t, /Chốt kẹp/i);
    }
  }
  {
    // Món KHÁC HẲN: không được gộp vào hồ sơ chốt kẹp.
    const { ctx, calls } = mk();
    await dungHoSoCoAnh(ctx);
    await hs.handle(turn('hàng mới: máy bơm nước ly tâm 1.5kW, thân gang, bơm nước sinh hoạt'), ctx);
    const cuoi = tenHangDaTra(calls).at(-1) ?? '';
    assert.match(cuoi, /máy bơm/i, 'món mới phải được tra');
    assert.doesNotMatch(cuoi, /Chốt kẹp/i, `món mới bị gộp vào hồ sơ cũ: "${cuoi}"`);
  }
});

test('[S13] "xem lại từ đầu" với lịch sử BẨN: tên hàng gửi Cổng không mang lệnh cấu trúc', async () => {
  // Người soát đo: ca "xem lại từ đầu" bên trên dùng lịch sử SẠCH nên xanh giả. Lịch sử thật của
  // mạch có cả tin "@bot" trơ trọi (tin 10:00), "menu", "4", lời chào, câu nhờ việc khác.
  // Chốt chặn `packages.js:208` không bắt được vì chuỗi GỘP không phải tên cấm.
  const history = [
    { speaker: 'khach', text: MO_TA, at: '2026-11-10T02:58:00Z' },
    { speaker: 'khach', text: '@bot', at: '2026-11-10T03:00:00Z' },
    { speaker: 'khach', text: 'menu', at: '2026-11-10T03:01:00Z' },
    { speaker: 'khach', text: '4', at: '2026-11-10T03:02:00Z' },
    { speaker: 'khach', text: 'xin chào', at: '2026-11-10T03:03:00Z' },
    { speaker: 'khach', text: 'soát tờ khai của em', at: '2026-11-10T03:04:00Z' },
    { speaker: 'bot', text: 'Mã HS đề xuất: 8538.90', at: '2026-11-10T03:16:00Z' },
  ];
  const { ctx, calls } = fakeCtx({ phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } } }, { history: () => history });
  await hs.handle(turn('chữ on/off là đóng mở, không liên quan dòng điện, xem lại toàn bộ thông tin khách gửi từ đầu tới cuối'), ctx);
  const tens = tenHangDaTra(calls);
  assert.equal(tens.length, 1, 'phải phân loại lại đúng một lần');
  assert.match(tens[0], /^Chốt kẹp xoay/, `tên hàng phải là món của khách: "${tens[0]}"`);
  for (const rac of [/@bot/, /\bmenu\b/i, /— 4\b/, /xin ch[aà]o/i, /t[oờ] khai/i]) {
    assert.doesNotMatch(tens[0], rac, `lệnh cấu trúc bị nhồi vào tên hàng: "${tens[0]}"`);
  }
  // Câu khách vừa gõ vẫn phải tới Cổng ở mục "(khách nói thêm: …)" — yêu cầu 4 cần nó
  // ("chữ on/off là đóng mở"). Nhưng mục đó in CÙNG DÒNG "Tên hàng:" nên gửi Cổng y như tên
  // hàng: lệnh "xem lại toàn bộ…" KHÔNG được lọt vào đó (lớp lỗi [S16] — câu lệnh của khách
  // không phải dữ kiện mặt hàng).
  assert.doesNotMatch(tens[0], /xem l[aạ]i/i, `lệnh "xem lại" bị nhồi vào tên hàng: "${tens[0]}"`);
  assert.match(tens[0], /dòng điện/i, 'câu sửa thật của khách phải tới Cổng');
});

test('[S15] TẦNG GÓI: mô tả → ảnh kèm chú thích đàm thoại → "ok": tenHang gửi Cổng sạch tạp âm', async () => {
  // Quyết thay CEO, điểm 3: trường `phan_loai_hs.tenHang` chỉ được mang thông tin HÀNG HOÁ.
  // Chú thích dưới đây là kiểu khách gõ thật: thời gian, cảm thán, nói về tấm ảnh, và một so sánh
  // bên lề ("giống công tắc điện") — đúng đường bơm từ khoá hàng ĐIỆN vào mô tả, cơ chế đã đẩy
  // issue #170 ra mã 8538.90. Ca này đo trên CHUỖI 3 tin, không phải một hàm lẻ.
  const { ctx, calls } = fakeCtx({ phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } } },
    { vision: VISION_ON_OFF });
  await hs.handle(turn(MO_TA), ctx);
  await hs.handle(photo('em gửi lúc 10h03, ảnh hơi mờ anh thông cảm, cái này giống công tắc điện nhưng không phải, cần gấp nhé'), ctx);
  await hs.handle(turn('ok'), ctx);
  const tens = tenHangDaTra(calls);
  assert.ok(tens.length >= 1, 'phải có lượt gọi Cổng');
  for (const t of tens) {
    assert.match(t, /Chốt kẹp/i, `tên hàng phải giữ mô tả chữ của khách: "${t}"`);
    for (const rac of [/10h03/, /m[oờ]/i, /th[oô]ng c[aả]m/i, /gi[oố]ng/i, /c[oô]ng t[aắ]c/i, /c[aầ]n g[aấ]p/i]) {
      assert.doesNotMatch(t, rac, `tạp âm chú thích ảnh đi vào tenHang gửi Cổng: "${t}"`);
    }
  }
  // Thông số AI đọc được từ ảnh vẫn phải tới Cổng (ảnh là BỔ SUNG, không bị lọc oan).
  assert.match(JSON.stringify(calls.filter((c) => c.name === 'phan_loai_hs').at(-1).args), /ABS/,
    'chất liệu đọc từ ảnh vẫn phải gộp vào hồ sơ');
});
test('[S16] TẦNG GÓI: câu hỏi tiếp không được xoá hồ sơ và thành tên hàng gửi Cổng', async () => {
  // Người soát đo qua harness eval: mô tả chốt kẹp → "hàng này em nhập từ Trung Quốc về bán lẻ ạ"
  // → bot gửi '🔍 Hàng: "hàng này nhập từ Trung Quốc về bán lẻ"' kèm '✅ Mã HS đề xuất: 8302.42.00',
  // `tenHang` gửi Cổng là chính câu đó (2 lần), và tin kế tiếp "tra hscode" ra
  // 'Em đang tra: hàng này em nhập từ Trung Quốc về bán lẻ ạ' → hồ sơ mặt hàng đã bị thay bằng một
  // câu hội thoại. Gắn mã HS + số thuế vào thứ không phải mặt hàng là phạm Điều III và VIII.
  const { ctx, calls } = fakeCtx({ phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } } });
  await hs.handle(turn(MO_TA), ctx);
  await hs.handle(turn('hàng này em nhập từ Trung Quốc về bán lẻ ạ'), ctx);
  const r = await hs.handle(turn('tra hscode'), ctx);
  // Chốt: câu hội thoại rời khỏi hồ sơ HẲN, nên `tenHang` gửi Cổng không có nó ở bất kỳ chỗ nào
  // (kể cả trong mục "(khách nói thêm: …)" — mục đó in CÙNG DÒNG `Tên hàng:` nên tạp âm ở đó
  // vẫn tới Cổng y như tên hàng). Câu SỬA thật thì vẫn phải tới Cổng (yêu cầu 4) — ca [S13].
  for (const t of tenHangDaTra(calls)) {
    assert.match(t, /^Chốt kẹp xoay/, `tên hàng phải là món của khách: "${t}"`);
    for (const rac of [/b[aá]n l[eẻ]/i, /nh[aậ]p t[uừ]/i, /Trung Qu[oố]c/i]) {
      assert.doesNotMatch(t, rac, `câu hội thoại vào tên hàng gửi Cổng: "${t}"`);
    }
  }
  const dong = r.replies.map((x) => plain(x.text)).join('\n');
  assert.doesNotMatch(dong, /Em đang tra:.*b[aá]n l[eẻ]/i, `dòng hồ sơ in ra câu hội thoại: ${JSON.stringify(dong)}`);
  assert.match(dong, /Em đang tra:.*[Cc]hốt kẹp/, 'hồ sơ phải vẫn là chốt kẹp');
});

test('[S16] "hàng mới: …" mở HỒ SƠ MỚI kể cả khi khách đã chọn gói cố định', async () => {
  // Khách gõ "1" (chọn gói 1) → mô tả hàng → đổi món. Hồ sơ cũ KHÔNG được trộn vào món mới:
  // Cổng phải nhận tên hàng của món MỚI, không phải "món cũ — món mới" (sai món, sai mã,
  // sai thuế — Hiến pháp Điều III). Nhánh "hàng mới" cũ bị chặn bởi `s.goi` nên hồ sơ cũ vẫn
  // còn trong phiên; lượt sau ("tra hscode") tra trên bản gộp đó → tên hàng LAI.
  const { ctx, calls } = fakeCtx({ phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } } });
  await hs.handle(turn('1'), ctx);
  await hs.handle(turn(MO_TA), ctx);
  await hs.handle(turn('hàng mới: bơm nước ly tâm 1.5kW, thân gang'), ctx);
  const cuoi = tenHangDaTra(calls).at(-1) ?? '';
  assert.match(cuoi, /bơm nước/i, `món mới phải được tra: "${cuoi}"`);
  assert.doesNotMatch(cuoi, /Chốt kẹp/i, `món cũ bị gộp vào món mới: "${cuoi}"`);
  // Lượt sau (lệnh ngắn) vẫn phải tra trên món MỚI, không phải hồ sơ đã trộn.
  await hs.handle(turn('tra hscode'), ctx);
  const sau = tenHangDaTra(calls).at(-1) ?? '';
  assert.match(sau, /bơm nước/i, `lượt sau phải tra món mới: "${sau}"`);
  assert.doesNotMatch(sau, /Chốt kẹp/i, `hồ sơ cũ còn dính vào món mới: "${sau}"`);
});

test('[S16] lệnh ngắn ("tra hscode") KHÔNG ghi sổ trượt "gõ lại mô tả"', async () => {
  // Sổ trượt từ vựng chỉ ghi khi khách GÕ LẠI mô tả mặt hàng. Lệnh ngắn không phải mô tả;
  // ghi nhầm thì tín hiệu học từ vựng bị nhiễu hết (và so sánh phải là lời khách với lời khách,
  // không phải bản gộp hồ sơ với lời khách — bản gộp luôn khác lời khách).
  const ghi = [];
  const { ctx } = fakeCtx({ phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } } });
  ctx.ghiTruot = (loai, info) => ghi.push([loai, info]);
  const a = await hs.handle(turn(MO_TA), ctx);
  await hs.onJobResult(a.jobs[0], { ok: true, trangThai: 'XONG', data: { maDeXuat: '83024200' } }, ctx);
  await hs.handle(turn('tra hscode'), ctx);
  assert.equal(ghi.filter(([loai]) => loai === 'GO_LAI').length, 0,
    `lệnh ngắn không phải gõ lại mô tả: ${JSON.stringify(ghi)}`);
  // Chốt ngược: khách GÕ LẠI mô tả (khác câu trước) thì vẫn phải ghi sổ trượt.
  await hs.handle(turn('chốt kẹp xoay 1/4 vòng núm thấp QCTHL0525-10S'), ctx);
  assert.ok(ghi.some(([loai]) => loai === 'GO_LAI'), `khách gõ lại mô tả thì phải ghi sổ trượt: ${JSON.stringify(ghi)}`);
});

test('[S17] tin hỏi thêm KHÔNG mở lượt mới → kết quả bot đã hứa vẫn phải tới khách', async () => {
  // Người soát đo: `index.js:160` tăng `hoSo.dau` cho MỌI tin chữ, kể cả tin đi gói 2 và không mở
  // lượt phân loại nào; chốt `dau` ở `onJobResult` liền bỏ kết quả việc nền đang chạy → mã HS bot
  // đã hứa không bao giờ tới khách và KHÔNG tin nào thay. Bot nợ kết quả đã hứa mà im là phạm
  // Điều II. Chốt một-mạch-một-việc-nền phải so theo `viecGoi1`, không theo `dau` bị tăng oan.
  const { ctx, calls } = fakeCtx({ phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } } });
  const a = await hs.handle(turn(MO_TA), ctx);
  assert.equal(a.jobs.length, 1, 'tin mô tả giao việc nền');
  const b = await hs.handle(turn('thuế nhập khẩu bao nhiêu phần trăm ạ'), ctx);
  assert.equal(b.jobs.length, 0, 'tin hỏi thêm này KHÔNG mở lượt phân loại mới');
  assert.equal(calls.filter((c) => c.name === 'phan_loai_hs').length, 1, 'vẫn chỉ một lượt Cổng');
  const r = await hs.onJobResult(a.jobs[0], { ok: true, trangThai: 'XONG', data: { maDeXuat: '83024200' } }, ctx);
  assert.ok(r.replies.length, 'không có lượt nào mới thay thế thì kết quả đã hứa PHẢI tới khách');
  assert.match(plain(r.replies[0].text), /8302\.42/);
});

test('[S4] một mạch một việc nền: lệnh ngắn mở lượt mới → kết quả lượt cũ bị bỏ, khách KHÔNG nhận hai mã', async () => {
  // Người soát đo: tin thứ hai là lệnh ngắn ("tra hscode") nên hồ sơ KHÔNG đổi (`dau` giữ nguyên),
  // chốt cũ chỉ bỏ kết quả khi hồ sơ đổi → hai việc nền cùng sống, khách nhận CẢ HAI mã (3 tin ra).
  const { ctx, calls } = fakeCtx({
    phan_loai_hs: () => ({ ok: true, data: { maLuot: `${ML.slice(0, -1)}${calls.length}`, trangThai: 'DANG_XU_LY' } }),
  });
  const a = await hs.handle(turn(MO_TA), ctx);
  const b = await hs.handle(turn('tra hscode'), ctx);
  assert.equal(a.jobs.length, 1, 'tin mô tả giao việc nền');
  assert.equal(b.jobs.length, 1, 'lệnh ngắn tra lại cũng giao việc nền');
  assert.notEqual(a.jobs[0].maLuot, b.jobs[0].maLuot, 'hai lượt Cổng khác nhau');

  const cu = await hs.onJobResult(a.jobs[0], { ok: true, trangThai: 'XONG', data: { maDeXuat: '85389090' } }, ctx);
  assert.deepEqual(cu.replies, [], 'kết quả của việc nền CŨ phải bị bỏ (khách chỉ nhận một mã)');
  const moi = await hs.onJobResult(b.jobs[0], { ok: true, trangThai: 'XONG', data: { maDeXuat: '83024200' } }, ctx);
  assert.ok(moi.replies.length, 'kết quả của việc nền MỚI vẫn phải gửi');
  assert.match(plain(moi.replies[0].text), /8302\.42/);
});

test('[S25] yêu cầu "tra hs …" ở đầu mô tả KHÔNG được thành tên hàng gửi Cổng', async () => {
  // Khách mở mạch bằng câu yêu cầu kèm món hàng: "Tra hs máy xay sinh tố". "Tra hs" là YÊU
  // CẦU của khách với bot, không phải tên hàng — tên hàng gửi Cổng phải là "máy xay sinh tố"
  // (yêu cầu 2 của issue #170: lệnh/lời nhờ không bao giờ thành món hàng).
  const { ctx, calls } = fakeCtx({ phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } } });
  await hs.handle(turn('Tra hs máy xay sinh tố'), ctx);
  await hs.handle(turn('tra hscode'), ctx);
  const tens = tenHangDaTra(calls);
  assert.ok(tens.length >= 1, 'phải có lượt gọi Cổng');
  for (const t of tens) {
    assert.match(t, /máy xay sinh tố/i, `tên hàng phải giữ món của khách: "${t}"`);
    assert.doesNotMatch(t, /tra\s*hs/i, `lời nhờ "tra hs" lọt vào tên hàng gửi Cổng: "${t}"`);
  }
});

test('[S6] dòng "Em đang tra: …" chỉ xuất hiện MỘT lần trong cùng một lượt trả lời', async () => {
  // Người soát đo trong qa-that/ket-qua-2026-11-10.md:330 và :334 — hai tin liền nhau cùng mở đầu
  // bằng "Em đang tra: …": câu dẫn của `trenHoSo` và dòng hồ sơ do `runPkg` chèn vào thân tin.
  // Ảnh KHÔNG mâu thuẫn (không có chữ ON/OFF) → tin chữ kế tiếp đi nhánh `themChu` của index.js,
  // nhánh truyền `cauDan: dongDangTra(h)` trong khi `runPkg` cũng tự chèn dòng hồ sơ vào thân tin.
  const vision = { readSpecs: async () => ({ tenHang: 'Núm vặn chốt kẹp', chatLieu: 'thép không gỉ + núm nhựa ABS', khongChac: [] }) };
  const { ctx } = fakeCtx({
    phan_loai_hs: { ok: true, data: { maLuot: ML, trangThai: 'XONG', ketQua: { status: 'OK', results: [{ hs: '83024200', reason: 'Chốt kẹp kim loại' }] } } },
  }, { vision });
  await hs.handle(turn(MO_TA), ctx);
  await hs.handle(photo('chất liệu: thép không gỉ + núm nhựa ABS'), ctx);
  const r = await hs.handle(turn(`đây nhé, ${MO_TA}, chữ on/off là đóng mở, không liên quan dòng điện`), ctx);
  const dong = r.replies.map((x) => plain(x.text)).join('\n').split('\n').filter((l) => /^Em đang tra: /.test(l));
  assert.equal(dong.length, 1, `dòng hồ sơ lặp ${dong.length} lần trong một lượt`);
});
