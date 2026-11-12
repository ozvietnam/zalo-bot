// OZV-430 điểm 1: `countryCode` nhận MỌI cặp chữ in hoa làm mã nước.
//
// Nhánh dự phòng của `countryCode` (`packs/hs/input.js:87,90`) chỉ kiểm HÌNH ("hai chữ cái") chứ
// không kiểm cái mã đó có phải NƯỚC THẬT không. Hậu quả đo được trên đường thật `hs.handle`
// (script `/tmp/soat5/v7b-xx.mjs`, gói 3 "Viết mô tả khai báo" và gói 6 "Rủi ro nhãn hiệu"):
//
//   ô "Xuất xứ:" khách gõ | mã gửi Cổng OZ (main) | đúng ra phải là
//   "TQ"                  | TQ                    | CN   (TQ không có trong ISO-3166)
//   "SX tại TQ"           | SX                    | CN   ("SX" = sản xuất, không phải nước)
//   "QC tại VN"           | QC                    | VN   ("QC" = quality control)
//   "hàng CE"             | CE                    | null (CE là dấu hợp chuẩn EU, không phải nước)
//
// Vì sao chặn merge:
//   • Điều III — mức MFN/ACFTA Cổng trả phụ thuộc mã nước. Gửi "SX" hay "TQ" là tra thuế theo một
//     thứ không phải nước: Cổng không có dòng FTA nào khớp nên ưu đãi C/O mẫu E RỤNG, khách đọc
//     mức thuế cao hơn thực tế mà vẫn tưởng đã tra đúng.
//   • Điều VIII — `xuatXu` này đi thẳng vào `sinh_mo_ta_khai_bao`, tức là MÔ TẢ KHAI BÁO in ra cho
//     khách dán vào chỉ tiêu 1.78 tờ khai. In "xuất xứ SX" lên tờ khai là hồ sơ sai.
//
// Cách vá: cấm cửa DỮ LIỆU ngay trong `countryCode` — chỉ trả mã nằm trong danh sách ISO-2 bot
// biết, và đọc "TQ" thành "CN" như `findCountryInText` vẫn làm. Dùng lại cách của repo
// `hs-code-api` (`scripts/import-oz-declarations.mjs:87` `mapOriginToIso2`: từ điển tên nước rồi
// mới tới mã 2 chữ), không lọc lúc in ra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countryCode, tenNuoc } from '../input.js';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import hs from '../index.js';

const ALL = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt',
  'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien'];

function fakeCtx() {
  const script = Object.fromEntries(ALL.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
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

/** Chạy mạch tin trên ĐƯỜNG THẬT, trả về mã nước đã gửi Cổng (theo thứ tự lượt). */
async function maNuocGuiCong(...cacTin) {
  const { ctx, calls } = fakeCtx();
  for (const t of cacTin) await hs.handle(turn(t), ctx);
  return calls.filter((c) => c.args && 'xuatXu' in c.args).map((c) => c.args.xuatXu);
}

// ── Lớp hàm: chỉ mã ISO-2 bot BIẾT mới được qua ────────────────────────────────────────────────

test('countryCode: cặp chữ in hoa KHÔNG phải nước thì trả null, không trả chính nó', () => {
  for (const rac of ['CF8M', 'PN16', 'CE', 'SX', 'QC', 'GC', 'AB', 'XX', 'OEM', 'SUS']) {
    assert.equal(countryCode(rac), null, `"${rac}" không phải mã nước, phải trả null`);
  }
});

test('countryCode: viết tắt tiếng Việt "TQ" đọc thành CN (như findCountryInText vẫn làm)', () => {
  for (const v of ['TQ', 'tq', 'Tq']) {
    assert.equal(countryCode(v), 'CN', `"${v}" là Trung Quốc ⇒ CN, không phải mã "TQ"`);
  }
  // Mọi mã trả ra phải nói được tên tiếng Việt — "TQ" trước đây lọt ra thành tenNuoc("TQ") = "TQ".
  assert.equal(tenNuoc(countryCode('TQ')), 'Trung Quốc');
});

test('countryCode: mã nước thật và tên nước vẫn đọc đúng như cũ', () => {
  for (const [vao, ra] of [['JP', 'JP'], ['jp', 'JP'], ['CN', 'CN'], ['VN', 'VN'], ['KR', 'KR'],
    ['Nhật Bản', 'JP'], ['Trung Quốc', 'CN'], ['Hàn Quốc', 'KR'], ['Đức', 'DE'], ['Ấn Độ', 'IN'],
    ['Xuất xứ: JP', 'JP'], ['xx TQ', 'CN']]) {
    assert.equal(countryCode(vao), ra, `"${vao}" phải đọc thành ${ra}`);
  }
});

test('countryCode: chữ kèm trong ô ("SX tại TQ", "QC tại VN") lấy đúng NƯỚC, không lấy chữ viết tắt đứng đầu', () => {
  assert.equal(countryCode('SX tại TQ'), 'CN', '"SX" là sản xuất, nước ở đây là TQ ⇒ CN');
  assert.equal(countryCode('QC tại VN'), 'VN', '"QC" là quality control, nước ở đây là VN');
  assert.equal(countryCode('hàng CE'), null, 'CE là dấu hợp chuẩn EU, không phải nước ⇒ không đoán');
  assert.equal(countryCode('made in JP'), 'JP');
});

// ── Đường thật: gói 3 "Viết mô tả khai báo" (mô tả in cho khách dán lên tờ khai) ────────────────

const G3 = (xx) => `gói 3: Mã HS: 84137090\nTên hàng: máy bơm ly tâm thân gang\nXuất xứ: ${xx}`;

for (const [nhan, oXuatXu, mong] of [
  ['"TQ" ⇒ CN', 'TQ', 'CN'],
  ['"tq" ⇒ CN', 'tq', 'CN'],
  ['"SX tại TQ" ⇒ CN', 'SX tại TQ', 'CN'],
  ['"SX tai TQ" không dấu ⇒ CN', 'SX tai TQ', 'CN'],
  ['"QC tại VN" ⇒ VN', 'QC tại VN', 'VN'],
  ['"Nhật Bản" ⇒ JP', 'Nhật Bản', 'JP'],
  ['"Nhat Ban" không dấu ⇒ JP', 'Nhat Ban', 'JP'],
  ['"JP" ⇒ JP', 'JP', 'JP'],
]) {
  test(`gói 3 đường thật: ô Xuất xứ ${nhan}`, async () => {
    const ma = await maNuocGuiCong(G3(oXuatXu));
    assert.deepEqual(ma, [mong], `ô "${oXuatXu}" phải gửi Cổng mã ${mong}, đang gửi ${JSON.stringify(ma)}`);
  });
}

for (const [nhan, oXuatXu] of [['"CF8M"', 'CF8M'], ['"PN16"', 'PN16'], ['"hàng CE"', 'hàng CE'], ['"hang CE" không dấu', 'hang CE']]) {
  test(`gói 3 đường thật: ô Xuất xứ ${nhan} là RÁC ⇒ không gửi mã nước nào`, async () => {
    const ma = await maNuocGuiCong(G3(oXuatXu));
    assert.deepEqual(ma, [], `rác "${oXuatXu}" không được thành mã nước, đang gửi ${JSON.stringify(ma)}`);
  });
}

// Vòng hỏi 2 và 3: khách sửa ô Xuất xứ ở lượt sau. Mỗi lượt phải gửi mã của ĐÚNG lượt đó.
test('gói 3 vòng hỏi 2: khách sửa ô Xuất xứ "JP" → "TQ"', async () => {
  const ma = await maNuocGuiCong(G3('JP'), G3('TQ'));
  assert.deepEqual(ma, ['JP', 'CN'], `lượt 2 phải gửi CN (không phải "TQ"): ${JSON.stringify(ma)}`);
});

test('gói 3 vòng hỏi 3: khách sửa ô Xuất xứ ba lần, lần cuối là rác', async () => {
  const ma = await maNuocGuiCong(G3('JP'), G3('TQ'), G3('CF8M'));
  assert.deepEqual(ma.slice(0, 2), ['JP', 'CN'], `hai lượt đầu: ${JSON.stringify(ma)}`);
  assert.ok(!ma.includes('CF8M'), `rác "CF8M" không được tới Cổng ở vòng 3: ${JSON.stringify(ma)}`);
});

test('gói 3 vòng hỏi 3 không dấu: "Nhat Ban" → "SX tai TQ" → "QC tai VN"', async () => {
  const ma = await maNuocGuiCong(G3('Nhat Ban'), G3('SX tai TQ'), G3('QC tai VN'));
  assert.deepEqual(ma, ['JP', 'CN', 'VN'], `cả ba vòng phải ra mã nước thật: ${JSON.stringify(ma)}`);
});

// ── Đường thật: gói 6 "Rủi ro nhãn hiệu" (gửi Cổng kiểm sở hữu trí tuệ) ────────────────────────

const G6 = (xx) => `gói 6: Nhãn hiệu: Nike\nMã HS: 64041190\nXuất xứ: ${xx}`;

test('gói 6 đường thật: ô Xuất xứ "TQ" ⇒ CN, "SX tại TQ" ⇒ CN', async () => {
  assert.deepEqual(await maNuocGuiCong(G6('TQ')), ['CN']);
  assert.deepEqual(await maNuocGuiCong(G6('SX tại TQ')), ['CN']);
});

test('gói 6 đường thật: mã nước cuối tin tự do "Nike 64041190 TQ" ⇒ CN, "... CE" ⇒ không có nước', async () => {
  assert.deepEqual(await maNuocGuiCong('kiểm nhãn hiệu Nike 64041190 TQ'), ['CN']);
  const ce = await maNuocGuiCong('kiểm nhãn hiệu Nike 64041190 CE');
  assert.ok(!ce.includes('CE'), `"CE" không phải nước, không được gửi Cổng: ${JSON.stringify(ce)}`);
});

test('gói 6 vòng hỏi 2: khách đưa nhãn trước, xuất xứ "TQ" ở lượt sau', async () => {
  const ma = await maNuocGuiCong('gói 6: Nhãn hiệu: Nike\nMã HS: 64041190', G6('TQ'));
  assert.ok(!ma.includes('TQ'), `lượt sau phải gửi CN, không gửi "TQ": ${JSON.stringify(ma)}`);
  assert.ok(ma.includes('CN'), `phải có lượt gửi CN: ${JSON.stringify(ma)}`);
});
