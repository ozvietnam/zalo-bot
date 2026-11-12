// OZV-430 điểm 1: `countryCode` nhận MỌI cặp chữ in hoa làm mã nước.
//
// Nhánh dự phòng của `countryCode` (`packs/hs/input.js:107`) chỉ kiểm HÌNH ("hai chữ cái") chứ
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
import { countryCode, maNuocTrongCau, laMaIso2, tenNuoc } from '../input.js';
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

test('countryCode: cặp chữ in hoa KHÔNG phải mã ISO thì trả null, không trả chính nó', () => {
  for (const rac of ['CF8M', 'PN16', 'CE', 'QC', 'GC', 'AB', 'XX', 'OEM', 'SUS']) {
    assert.equal(countryCode(rac), null, `"${rac}" không phải mã nước, phải trả null`);
  }
});

// `SX` trơ: vòng soát 2 tách hai ngữ cảnh nên hai nguồn này có hai kết quả KHÁC NHAU, cố ý.
test('countryCode: "SX" trơ trong ô CÓ NHÃN "Xuất xứ:" là khai mã (Sint Maarten)', () => {
  // Ô có nhãn = khách cố ý khai mã nước. Chấp bảng ISO đầy đủ là điều kiện để không bác bỏ
  // `SK` `BN` `BG`… (lỗi chặn PR #214). `SX` trơ trong ô này là cái giá, và là cái giá ĐÚNG:
  // người gõ riêng "SX" vào ô Xuất xứ thì đang khai mã, không ai viết "SX" trơ để nói "sản xuất".
  assert.equal(countryCode('SX'), 'SX');
});

test('maNuocTrongCau: "SX" lẫn trong câu tự do KHÔNG phải nước', () => {
  // Câu tự do ("Nike 64041190 SX", "SX tại TQ") thì "SX" là "sản xuất" — gói 6 phải đi qua đây,
  // không đi qua `countryCode`.
  for (const s of ['Nike 64041190 SX', 'SX tại TQ', 'hàng SX', 'van bi DN25 PN16 CF8M', 'thép SUS304 CF8M']) {
    assert.equal(maNuocTrongCau(s), null, `"${s}" không khai nước nào`);
  }
  assert.equal(maNuocTrongCau('Nike 64041190 SK'), 'SK', 'nhưng mã nước thật cuối câu thì lấy');
  assert.equal(maNuocTrongCau('made in BN'), 'BN');
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

// ── Vòng soát 2 (giám đốc CHẶN PR #214): danh sách cho phép bác bỏ NƯỚC THẬT ───────────────────
//
// Bản vá vòng 1 dùng MỘT danh sách 56 mã viết tay cho CẢ HAI ngữ cảnh, nên bác bỏ 12 mã nước thật:
// `SK SI BG HR LT LV EE LU MT CY` (EVFTA), `BN` (ATIGA + CPTPP), `IS`. Đo trên đường thật gói 2:
// khách gõ "84137090 SK" thì `countryCode` trả null ⇒ `xuatXuCua` rơi về `XUAT_XU_MAC_DINH = 'CN'`
// kèm `giaDinh: true` ⇒ bot tra thuế TRUNG QUỐC và còn nói "giả định" trong khi khách đã khai rõ
// Slovakia. Nặng hơn bệnh đang chữa: sai sang một nước CÓ THẬT, có FTA khác, nên Cổng trả về một
// con số trông như thật (Điều III), và tin nói "giả định" khi khách đã nói (Điều VIII).
//
// Gốc: HAI ngữ cảnh khác nhau bị dùng chung một danh sách.
//   1. Ô chỉ có đúng một mã 2 chữ (kể cả sau nhãn "Xuất xứ:", "made in") ⇒ khách CỐ Ý khai mã nước
//      ⇒ chấp ISO-3166 alpha-2 ĐẦY ĐỦ. Không ai gõ riêng một mã để nói "sản xuất".
//   2. Mã lẫn giữa chữ khác ("SX tại TQ", "van bi DN25 PN16 CF8M") ⇒ chỗ này mã trùng viết tắt
//      kỹ thuật/tiếng Việt, nên chấp ISO đầy đủ TRỪ nhóm trùng viết tắt.
//
// Bài học ghi lại: bản vá kiểu DANH SÁCH CHO PHÉP thì bắt buộc có ca "có thật mà ngoài danh sách".
// Không thay bằng ISO đầy đủ cho cả hai ngữ cảnh được: `SX` là mã ISO thật (Sint Maarten), `CF`
// Trung Phi, `PN` Pitcairn — làm thế thì rác mục tiêu của chính thẻ này lọt lại.

// Nước có FTA với VN mà khách hay gõ mã ISO vào ô "Xuất xứ:" — KHÔNG nằm trong 11 nước `tenNuoc`.
const NUOC_FTA = [['SK', 'Slovakia — EVFTA'], ['SI', 'Slovenia — EVFTA'], ['BG', 'Bulgaria — EVFTA'],
  ['HR', 'Croatia — EVFTA'], ['LT', 'Lithuania — EVFTA'], ['LV', 'Latvia — EVFTA'], ['EE', 'Estonia — EVFTA'],
  ['LU', 'Luxembourg — EVFTA'], ['MT', 'Malta — EVFTA'], ['CY', 'Cyprus — EVFTA'],
  ['BN', 'Brunei — ATIGA + CPTPP'], ['IS', 'Iceland'], ['PE', 'Peru — CPTPP'], ['CL', 'Chile — CPTPP']];

test('countryCode: ô khai riêng một mã ⇒ chấp mã NƯỚC THẬT ngoài danh sách bạn hàng quen', () => {
  for (const [ma, ghi] of NUOC_FTA) {
    assert.equal(countryCode(ma), ma, `"${ma}" (${ghi}) là nước thật, phải giữ nguyên mã — không được rơi về mặc định CN`);
    assert.equal(countryCode(ma.toLowerCase()), ma, `"${ma.toLowerCase()}" chữ thường cũng vậy`);
  }
});

test('countryCode: mã nước thật đứng sau NHÃN trong cùng ô vẫn là khai mã', () => {
  for (const [vao, ra] of [['made in BN', 'BN'], ['Made in BN', 'BN'], ['xuat xu: SI', 'SI'],
    ['Xuất xứ: SK', 'SK'], ['hàng từ BG', 'BG'], ['hang tu BG', 'BG'], ['nước MT', 'MT'], ['origin: HR', 'HR']]) {
    assert.equal(countryCode(vao), ra, `"${vao}" phải đọc thành ${ra}`);
  }
});

test('countryCode: mã nước thật lẫn giữa chữ khác vẫn lấy được', () => {
  assert.equal(countryCode('SX tại SK'), 'SK', '"SX" là sản xuất, nước ở đây là Slovakia');
  assert.equal(countryCode('SX tai BG'), 'BG');
  assert.equal(countryCode('hàng SX tại LT, đóng gói VN'), 'LT', 'lấy mã nước đầu tiên trong câu');
});

test('countryCode: rác vẫn bị chặn ở ngữ cảnh LẪN TRONG CÂU, kể cả rác là mã ISO thật', () => {
  // `SX` Sint Maarten, `CF` Trung Phi, `PN` Pitcairn: là mã ISO thật nhưng ở đây là viết tắt
  // kỹ thuật/tiếng Việt, nên ngữ cảnh "lẫn trong câu" phải bỏ qua.
  for (const rac of ['CF8M', 'PN16', 'van bi DN25 PN16 CF8M', 'thép SUS304 CF8M', 'hàng CE', 'hang CE']) {
    assert.equal(countryCode(rac), null, `"${rac}" không khai nước nào, phải trả null`);
  }
  assert.equal(countryCode('SX tại TQ'), 'CN', 'vẫn phải bỏ "SX" và đọc "TQ" ⇒ CN');
  assert.equal(countryCode('QC tại VN'), 'VN');
  // "MADE IN JP" viết hoa cả câu: "IN" là chữ "in", không phải Ấn Độ (main trả IN — sai nước).
  assert.equal(countryCode('hàng MADE IN JP'), 'JP', '"IN" giữa câu là chữ "in", không phải mã Ấn Độ');
  // Nhưng khách khai riêng "IN" thì vẫn là Ấn Độ.
  assert.equal(countryCode('IN'), 'IN');
  assert.equal(countryCode('xuất xứ: IN'), 'IN');
});

test('countryCode: ô chỉ có hai chữ mà KHÔNG phải mã ISO ⇒ null, không trả chính nó', () => {
  for (const rac of ['QC', 'CE', 'AB', 'XX', 'OZ', 'GC']) {
    assert.equal(countryCode(rac), null, `"${rac}" không có trong ISO-3166, phải trả null`);
  }
});

// ── Đường thật gói 2 "Thuế & thủ tục": ca của giám đốc (84137090 + mã nước FTA) ─────────────────

/** Chạy mạch tin trên đường thật, trả cả mã gửi Cổng lẫn tin bot (để soi chữ "giả định"). */
async function luotGoi2(...cacTin) {
  const { ctx, calls } = fakeCtx();
  const tin = [];
  for (const t of cacTin) tin.push((((await hs.handle(turn(t), ctx))?.replies) ?? []).map((x) => x.text).join('\n'));
  return { xuatXu: calls.filter((c) => c.name === 'tra_thue').map((c) => c.args.xuatXu), tin };
}

for (const [ma, ghi] of NUOC_FTA) {
  test(`gói 2 đường thật: "84137090 ${ma}" (${ghi}) ⇒ gửi Cổng ${ma}, KHÔNG nói giả định`, async () => {
    const { xuatXu, tin } = await luotGoi2(`84137090 ${ma}`);
    assert.deepEqual(xuatXu, [ma], `phải tra thuế theo ${ma}, đang tra ${JSON.stringify(xuatXu)}`);
    assert.ok(!/giả định|gia dinh/i.test(tin.at(-1)), `khách đã khai ${ma} thì tin không được nói "giả định": ${tin.at(-1)?.slice(0, 200)}`);
  });
}

test('gói 2 vòng hỏi 2: khách đổi nước "SK" → "BN", mỗi lượt gửi mã của đúng lượt đó', async () => {
  const { xuatXu } = await luotGoi2('84137090 SK', '84137090 BN');
  assert.deepEqual(xuatXu, ['SK', 'BN'], `hai lượt phải ra hai nước đúng: ${JSON.stringify(xuatXu)}`);
});

test('gói 2 vòng hỏi 3: "SK" → "BN" → "JP" (đối chứng nước quen)', async () => {
  const { xuatXu } = await luotGoi2('84137090 SK', '84137090 BN', '84137090 JP');
  assert.deepEqual(xuatXu, ['SK', 'BN', 'JP'], `cả ba lượt: ${JSON.stringify(xuatXu)}`);
});

test('gói 2 đối chứng: khách KHÔNG khai nước ⇒ vẫn giả định CN và NÓI RÕ là giả định', async () => {
  const { xuatXu, tin } = await luotGoi2('84137090');
  assert.deepEqual(xuatXu, ['CN'], 'Cổng đòi một nước nên vẫn tra theo mặc định');
  assert.ok(/giả định/i.test(tin.at(-1)), `chưa khai nước thì PHẢI nói giả định: ${tin.at(-1)?.slice(0, 200)}`);
});

// ── Đường thật gói 3 và gói 6 với mã nước FTA ──────────────────────────────────────────────────

for (const [nhan, oXuatXu, mong] of [['"SK"', 'SK', 'SK'], ['"BN"', 'BN', 'BN'],
  ['"made in BN"', 'made in BN', 'BN'], ['"SX tai SK" không dấu', 'SX tai SK', 'SK'], ['"Xuất xứ: MT"', 'MT', 'MT']]) {
  test(`gói 3 đường thật: ô Xuất xứ ${nhan} ⇒ gửi Cổng ${mong}`, async () => {
    const ma = await maNuocGuiCong(G3(oXuatXu));
    assert.deepEqual(ma, [mong], `ô "${oXuatXu}" phải gửi ${mong}, đang gửi ${JSON.stringify(ma)}`);
  });
}

test('gói 3 vòng hỏi 3 với nước FTA: "SK" → "BN" → rác "CF8M"', async () => {
  const ma = await maNuocGuiCong(G3('SK'), G3('BN'), G3('CF8M'));
  assert.deepEqual(ma.slice(0, 2), ['SK', 'BN'], `hai lượt đầu: ${JSON.stringify(ma)}`);
  assert.ok(!ma.includes('CF8M') && !ma.includes('CF'), `rác vòng 3 không được tới Cổng: ${JSON.stringify(ma)}`);
});

test('gói 6 đường thật: mã nước FTA cuối tin tự do ⇒ gửi đúng nước; rác trùng mã ISO thì không', async () => {
  assert.deepEqual(await maNuocGuiCong('kiểm nhãn hiệu Nike 64041190 SK'), ['SK']);
  const sx = await maNuocGuiCong('kiểm nhãn hiệu Nike 64041190 SX');
  assert.ok(!sx.includes('SX'), `"SX" cuối câu tự do là "sản xuất", không phải Sint Maarten: ${JSON.stringify(sx)}`);
});

test('gói 6 đường thật: ô "Xuất xứ: SK" có nhãn ⇒ gửi SK', async () => {
  assert.deepEqual(await maNuocGuiCong(G6('SK')), ['SK']);
  assert.deepEqual(await maNuocGuiCong(G6('made in BN')), ['BN']);
});

// ── Neo bảng ISO: để bảng trong mã nguồn không trôi ────────────────────────────────────────────

test('MA_ISO2: đúng 249 mã đang được gán, và mọi mã đều là nước thật theo Intl', () => {
  const het = [];
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) het.push(String.fromCharCode(a) + String.fromCharCode(b));
  const trong = het.filter((m) => laMaIso2(m));
  assert.equal(trong.length, 249, `ISO-3166-1 alpha-2 có 249 mã đang gán, bảng đang có ${trong.length}`);
  // Mọi mã trong bảng phải là vùng Intl nói được tên — bắt lỗi gõ sai khi sửa bảng.
  const dn = new Intl.DisplayNames(['en'], { type: 'region' });
  for (const m of trong) assert.notEqual(dn.of(m), m, `"${m}" không phải mã vùng ISO — gõ sai?`);
  // Và bảng KHÔNG được chứa mã dành riêng/đã xoá: Intl nói được tên chúng nhưng không phải nước.
  for (const m of ['EU', 'UK', 'UN', 'ZZ', 'QO', 'AC', 'TA', 'IC', 'EA', 'DG', 'SU', 'YU', 'AN', 'CS', 'XK']) {
    assert.equal(laMaIso2(m), false, `"${m}" là mã dành riêng/đã xoá, không được nằm trong bảng`);
  }
});

test('MA_ISO2: 12 nước FTA mà bản vá vòng 1 bác bỏ đều có trong bảng', () => {
  for (const m of ['SK', 'SI', 'BG', 'HR', 'LT', 'LV', 'EE', 'LU', 'MT', 'CY', 'BN', 'IS']) {
    assert.equal(laMaIso2(m), true, `"${m}" là nước có FTA với VN, phải nhận`);
  }
});
