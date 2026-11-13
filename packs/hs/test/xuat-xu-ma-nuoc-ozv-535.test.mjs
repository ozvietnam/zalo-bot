// OZV-535 — nợ cũ `packs/hs`: mã ĐƠN VỊ đứng cuối câu, danh từ hàng trùng TỪ DẪN, "MADE IN JP".
//
// Ba nhóm lỗi này CÓ SẴN Ở `main` (không phải hồi quy của PR #214) nhưng cùng lớp lỗi
// "đọc nhầm thành nước" ⇒ mã sai trông như thật (`giaDinh:false` ⇒ bot không nói "giả định").
//
//   Nhóm 1 — mã ĐƠN VỊ ở cuối câu: "ổ cứng 500 GB" ⇒ GB (gigabyte) bị đọc thành Vương quốc Anh.
//   Nhóm 2 — DANH TỪ hàng trùng TỪ DẪN: "máy lọc nước RO", "ổ BI", "tủ BT", "cửa AL" — mã ISO
//            thật ở cuối câu bị đọc thành nước (Romania/Bhutan/Belarus/Albania).
//   Nhóm 3 — "MADE IN JP" ⇒ "IN" (Ấn Độ): regex mã trơ bắt chữ "IN" trong cụm "made in".
//
// LUẬT ĐÃ SỬA (xem `packs/hs/input.js`):
//   - `DON_VI_DO`: mã đứng NGAY SAU con số và nằm trong danh sách đơn vị đo ⇒ đơn vị đo.
//   - Từ dẫn xuất xứ so theo TẦNG: tiếng Anh không dấu; tiếng Việt GIỮ DẤU ("tủ" ≠ "từ");
//     "nước" là từ dẫn YẾU (chỉ nhận khi đứng sau từ dẫn khác — "máy lọc nước RO" không).
//   - Mã ISO ở cuối câu chỉ nhận khi đứng NGAY SAU MÃ/SỐ ("Nike 64041190 CN" ⇒ CN).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import hs from '../index.js';
import { plain } from '../style.js';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import { countryCode, findCountryInText, maNuocTrongCau, xuatXuCua, maCuoiCau } from '../input.js';

const ALL6 = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt',
  'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien'];
const turn6 = (text) => ({ turnId: 't', chatId: 'u1', userId: 'u1', userName: 'T', isGroup: false, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-10T03:00:00.000Z', isStaff: false });
const ctx6 = () => {
  const script = Object.fromEntries(ALL6.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
  return { mcp: fakeMcp(script), tools: new Set(ALL6), vision: null, customer: null, history: () => [],
    session: { get: () => ({}), set: () => {} }, now: () => new Date('2026-11-10T03:00:00Z'), log: { info() {}, error() {} } };
};

// ── Nhóm 1: mã ĐƠN VỊ đứng cuối câu ────────────────────────────────────────────────────────

const DON_VI = [
  ['ổ cứng 500 GB', 'GB', 'gigabyte'],
  ['bao 50 KG', 'KG', 'kilogram'],
  ['ống 100 MM', 'MM', 'milimet'],
  ['bơm 5 KW', 'KW', 'kilowatt'],
  ['chai 500 ML', 'ML', 'mililít'],
];

test('OZV-535 nhóm 1: mã đơn vị đo đứng cuối câu KHÔNG phải nước', () => {
  for (const [s, ma, vi] of DON_VI) {
    assert.equal(countryCode(s), null, `"${s}": "${ma}" là ${vi}, không phải mã nước`);
    assert.equal(maNuocTrongCau(s), null, `"${s}": không được ra mã nước nào`);
    assert.equal(findCountryInText(s), null, `"${s}": không được ra mã nước nào`);
    assert.equal(xuatXuCua(s).giaDinh, true, `"${s}": không khai nước thì phải nói rõ là giả định`);
  }
});

test('OZV-535 nhóm 1: ô CÓ NHÃN không đổi — khách CỐ Ý khai mã nước thật vẫn nhận', () => {
  assert.equal(countryCode('Xuất xứ: MM'), 'MM', '"MM" ở ô có nhãn là Malta, không phải milimet');
  assert.equal(countryCode('Xuất xứ: GB'), 'GB', '"GB" ở ô có nhãn là Vương quốc Anh');
  assert.equal(countryCode('Xuất xứ: MT'), 'MT', '"MT" ở ô có nhãn là Malta');
});

test('OZV-535 nhóm 1: mã ISO thật đứng sau MÃ HS vẫn là nước (không phải đơn vị đo)', () => {
  assert.equal(countryCode('Nike 64041190 CN'), 'CN');
  assert.equal(countryCode('Nike 64041190 JP'), 'JP');
  assert.equal(maCuoiCau('ổ cứng 500 GB'), null, '"GB" sau "500" là gigabyte');
  assert.equal(maCuoiCau('Nike 64041190 CN'), 'CN');
});

// HỒI QUY (vòng soát đã chặn): mã đơn vị đo đứng sau MÃ HS 8 số KHÔNG phải đơn vị đo.
// "Nike 64041190 GB" là mã HS rồi mã nước (main đọc vậy) — mất nó là mất nước có FTA EU
// (`GB` Vương quốc Anh, `MT` Malta, `LT` Litva) ⇒ khách đọc ra mức thuế sai (Điều III).
test('OZV-535 hồi quy: mã đứng sau MÃ HS 8 số là MÃ NƯỚC, không phải đơn vị đo', () => {
  for (const ma of ['GB', 'MT', 'LT', 'MM', 'KG', 'CM', 'ML', 'KW']) {
    const s = `Nike 64041190 ${ma}`;
    assert.equal(countryCode(s), ma, `"${s}" phải ra ${ma} (khớp main)`);
    assert.equal(maNuocTrongCau(s), ma, `"${s}" phải ra ${ma} (khớp main)`);
    assert.equal(xuatXuCua({ nhan: s }).ma, ma, `"${s}" phải ra ${ma} (khớp main)`);
    assert.equal(xuatXuCua({ nhan: s }).giaDinh, false, `"${s}": khách đã nói nước thì không được nói "giả định"`);
  }
});

// HỒI QUY (vòng soát đã chặn): từ dẫn xuất xứ VIẾT HOA bị bỏ qua vì so trực tiếp (không hạ
// chữ thường) ⇒ "Từ GB" / "Tại SK" / "SX TẠI SG" / "HÀNG TỪ UK" rơi về giả định CN.
// Khách gõ CAPS trên Zalo là chuyện thường; giá trị mong đợi khớp main.
test('OZV-535 hồi quy: từ dẫn xuất xứ VIẾT HOA vẫn nhận nước', () => {
  for (const [s, mong] of [['Từ GB', 'GB'], ['Tại SK', 'SK'], ['SX TẠI SG', 'SG'], ['HÀNG TỪ UK', 'GB']]) {
    assert.equal(countryCode(s), mong, `"${s}" phải ra ${mong} (khớp main)`);
    assert.equal(maNuocTrongCau(s), mong, `"${s}" phải ra ${mong} (khớp main)`);
    assert.equal(xuatXuCua({ nhan: s }).ma, mong, `"${s}" phải ra ${mong} (khớp main)`);
    assert.equal(xuatXuCua({ nhan: s }).giaDinh, false, `"${s}": khách đã nói nước thì không được nói "giả định"`);
  }
});

// ── Nhóm 2: danh từ hàng trùng từ dẫn ──────────────────────────────────────────────────────

const DAN_TU = [
  ['máy lọc nước RO', 'RO', 'Romania — "RO" ở đây là lọc nước thấm ngược'],
  ['ổ BI', 'BI', 'Bhutan — "ổ" là ổ cứng'],
  ['tủ BT', 'BT', 'Belarus — "tủ" là tủ lạnh'],
  ['cửa AL', 'AL', 'Albania — "cửa" là cửa sắt'],
  ['may loc nuoc RO', 'RO', 'bản không dấu của "máy lọc nước RO"'],
  ['o BI', 'BI', 'bản không dấu của "ổ BI"'],
];

test('OZV-535 nhóm 2: danh từ hàng trùng từ dẫn KHÔNG phải nước', () => {
  for (const [s, ma, vi] of DAN_TU) {
    assert.equal(countryCode(s), null, `"${s}": "${ma}" là ${vi}`);
    assert.equal(maNuocTrongCau(s), null, `"${s}": không được ra mã nước nào`);
    assert.equal(findCountryInText(s), null, `"${s}": không được ra mã nước nào`);
  }
});

test('OZV-535 nhóm 2: từ dẫn xuất xứ THẬT vẫn nhận (có dấu và không dấu)', () => {
  for (const [s, mong] of [
    ['hàng từ GB', 'GB'], ['hàng tu GB', 'GB'], ['hàng tại SK', 'SK'], ['hàng tai SK', 'SK'],
    ['hàng nước GB', 'GB'], ['made in UK', 'GB'], ['hàng Mỹ', 'US'],
  ]) {
    assert.equal(countryCode(s), mong, `"${s}" phải ra ${mong}`);
  }
});

// ── Nhóm 3: "MADE IN JP" ───────────────────────────────────────────────────────────────────

test('OZV-535 nhóm 3: "MADE IN JP" ⇒ JP, không phải IN (Ấn Độ)', () => {
  assert.equal(findCountryInText('MADE IN JP'), 'JP');
  assert.equal(countryCode('MADE IN JP'), 'JP');
  assert.equal(maNuocTrongCau('MADE IN JP'), 'JP');
  assert.equal(xuatXuCua('MADE IN JP').ma, 'JP');
  assert.equal(xuatXuCua('MADE IN JP').giaDinh, false, 'khách đã nói nước thì không được nói "giả định"');
});

test('OZV-535 nhóm 3: "made in ..." bình thường vẫn nhận nước', () => {
  for (const [s, mong] of [['made in UK', 'GB'], ['made in VN', 'VN'], ['made in JP', 'JP'], ['Made In JP', 'JP']]) {
    assert.equal(findCountryInText(s), mong, `"${s}" phải ra ${mong}`);
  }
});

// HỒI QUY (vòng soát 3): khách gõ tiếng Việt KHÔNG DẤU — "hàng nuoc UK" phải ra GB như `main`.
// Không nhận "nuoc" ⇒ MẤT nước ⇒ bot tính thuế theo Trung Quốc + báo "giả định Trung Quốc"
// (Điều III). Cùng lớp: "hang cua UK" / "hang o UK" (bản không dấu của "hàng của/ở UK").
test('OZV-535 hồi quy: từ dẫn xuất xứ viết KHÔNG DẤU vẫn nhận nước', () => {
  for (const [s, mong] of [['hàng nuoc UK', 'GB'], ['hang nuoc UK', 'GB'], ['hàng nuoc GB', 'GB'],
    ['hang cua UK', 'GB'], ['hang o UK', 'GB'], ['nuoc GB', 'GB']]) {
    assert.equal(countryCode(s), mong, `"${s}" phải ra ${mong} (khớp main)`);
    assert.equal(maNuocTrongCau(s), mong, `"${s}" phải ra ${mong} (khớp main)`);
    assert.equal(xuatXuCua({ nhan: s }).ma, mong, `"${s}" phải ra ${mong} (khớp main)`);
    assert.equal(xuatXuCua({ nhan: s }).giaDinh, false, `"${s}": khách đã nói nước thì không được nói "giả định"`);
  }
});

// HỒI QUY (vòng soát 3): mã HS có DẤU CHẤM nuốt mã nước — "Nike 6404.11.90 GB" phải ra GB.
// `tachTu` cắt "6404.11.90" thành "6404" "11" "90" ⇒ đếm chữ số trên token "90" thì tưởng là
// SỐ LƯỢNG ⇒ mất nước (GB/MT/LT có FTA EU ⇒ khách đọc ra mức thuế sai — Điều III).
test('OZV-535 hồi quy: mã nước đứng sau mã HS CÓ DẤU CHẤM vẫn là nước', () => {
  for (const ma of ['GB', 'MT', 'LT', 'MM', 'KG', 'CM', 'ML', 'KW']) {
    const s = `Nike 6404.11.90 ${ma}`;
    assert.equal(countryCode(s), ma, `"${s}" phải ra ${ma} (khớp main)`);
    assert.equal(maNuocTrongCau(s), ma, `"${s}" phải ra ${ma} (khớp main)`);
    assert.equal(xuatXuCua({ nhan: s }).ma, ma, `"${s}" phải ra ${ma} (khớp main)`);
    assert.equal(xuatXuCua({ nhan: s }).giaDinh, false, `"${s}": khách đã nói nước thì không được nói "giả định"`);
  }
});

// NHÓM 2 (vòng soát 3): "85371099 tu BT" — mã HS + "tủ BT" (danh từ hàng) KHÔNG phải Belarus.
// Rào "tu"/"tai"/"o"/"cua" (bản không dấu) chỉ chặn ở đầu chuỗi ⇒ "tu" sau mã HS lọt ⇒ mã nước
// đọc thành nước thật ⇒ `giaDinh:false` ⇒ bot KHÔNG nói "giả định" mà đi thẳng vào thuế.
test('OZV-535 nhóm 2: mã HS + danh từ hàng viết KHÔNG DẤU không phải nước', () => {
  for (const s of ['85371099 tu BT', '85371099 tai BT', '64041190 tu GB']) {
    assert.equal(countryCode(s), null, `"${s}": mã sau danh từ hàng không phải nước`);
    assert.equal(maNuocTrongCau(s), null, `"${s}": không được ra mã nước nào`);
    assert.equal(findCountryInText(s), null, `"${s}": không được ra mã nước nào`);
    assert.equal(maCuoiCau(s), null, `"${s}": gói 6 cũng không được tự gán nước`);
    assert.equal(xuatXuCua({ nhan: s }).giaDinh, true, `"${s}": không khai nước thì phải nói rõ là giả định`);
  }
});

// ── Gói 6 (đường thật): mã cuối câu cũng phải qua rào đơn vị đo ──────────────────────────────

test('OZV-535 nhóm 1 + 2: gói 6 không tự gán nước từ đơn vị đo / danh từ hàng', async () => {
  // "gói 6 ..." = chọn thẳng gói 6 (giống cách test vòng 8 gọi Cổng).
  //
  // MÃ HS đặt TRƯỚC mã cuối câu: nếu đặt SAU ("... RO 84212100") thì regex "mã cuối câu" không
  // thấy mã nào ⇒ ca xanh dù nhóm 2 chưa sửa (lỗi test giả mà vòng soát đã chặn).
  for (const q of ['gói 6 ổ cứng 500 GB', 'gói 6 84212100 máy lọc nước RO', 'gói 6 84212100 tủ BT',
    'gói 6 84212100 cửa AL', 'gói 6 bao 50 KG']) {
    const ctx = ctx6();
    await hs.handle(turn6(q), ctx);
    const shtt = ctx.mcp.calls.find((c) => c.name === 'kiem_tra_shtt');
    assert.ok(shtt, `"${q}" phải gọi được kiem_tra_shtt`);
    assert.equal(shtt.args.xuatXu ?? null, null, `"${q}": không được tự gán nước`);
    plain('ok');
  }
});

test('OZV-535 chốt ngược: gói 6 vẫn nhận mã cuối câu và ô có nhãn như cũ', async () => {
  for (const [q, mong] of [
    ['gói 6 Nike 64041190 CN', 'CN'], ['gói 6 Nike 64041190 TQ', 'CN'], ['gói 6 Nike 64041190 made in UK', 'GB'],
    ['gói 6 Nhãn hiệu: Nike\nMã HS: 64041190\nXuất xứ: CN', 'CN'],
  ]) {
    const ctx = ctx6();
    await hs.handle(turn6(q), ctx);
    const shtt = ctx.mcp.calls.find((c) => c.name === 'kiem_tra_shtt');
    assert.ok(shtt, `"${q}" phải gọi được kiem_tra_shtt`);
    assert.equal(shtt.args.xuatXu ?? null, mong, `"${q}": xuất xứ gửi Cổng phải là ${mong}`);
    plain('ok');
  }
});
