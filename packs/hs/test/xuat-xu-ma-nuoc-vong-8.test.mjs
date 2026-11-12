// OZV-430 điểm 1 — VÒNG SOÁT 8 (vòng CHỐT; giám đốc chặn PR #214 lần cuối ở head `14059a5`).
//
// Vòng 7 sửa được ca tên nước 2 TỪ ("ong thép đúc Trung Quốc") nhưng vẫn để 3 nhóm hồi quy
// thật so với main `50907f2` — cùng lớp lỗi "số sai trông như thật" (gia đình mã sai, bot lại
// không nói "giả định" vì `giaDinh: false`):
//
//   1. `findCountryInText` quét theo VỊ TRÍ nên từ đồng âm trong TÊN HÀNG nuốt tên nước 1 TỪ
//      đứng sau: "máy hàn Nhật" dừng ở "hàn" (KR), "mỹ phẩm Hàn" dừng ở "mỹ" (US), "my pham
//      han" dừng ở "my" (MY). main quét theo THỨ TỰ KHOÁ nên "han"/"nhat" (khai báo trước
//      "my") thắng ở mọi vị trí ⇒ vòng 8 quét theo ƯU TIÊN KHOÁ (`NHOM_KHOA` 3→2→1 từ).
//   2. Gói 6 quét CẢ CÂU MÔ TẢ nên khách ghi TÊN HÀNG có từ trùng tên nước là bot tự gán xuất
//      xứ: "Hòa Phát ống thép đúc 73041900" → DE, "Thorakao mỹ phẩm 33049930" → US (main: null).
//      ⇒ Gói 6 chỉ nhận Ô CÓ NHÃN hoặc MÃ 2 CHỮ IN HOA ĐỨNG CUỐI CÂU (rào `VIET_TAT...`).
//   3. "my" không dấu ở CÂU TỰ DO bị đọc là Malaysia; khách gõ không dấu là chuyện thường
//      ("hàng my" = "hàng Mỹ") còn mã Malaysia thì viết IN HOA "MY". Luật vòng 8:
//      "Mỹ"/"mỹ" (có dấu) ⇒ US · "MY" (IN HOA) ⇒ MY · "my" (thường) ⇒ US.
//      Ô CÓ NHÃN giữ nguyên như main: "Xuất xứ: MY" ⇒ MY, "Xuất xứ: my" ⇒ MY.
//   4. Lỗ hổng (không hồi quy): alias UK chưa dùng được trong câu — "made in UK" ⇒ null ⇒ rơi
//      về giả định CN (main gửi mã rác UK ra Cổng) ⇒ `ALIAS_TRONG_CAU = { UK: 'GB' }` ở
//      `maNuocTrongCau`, GIỮ rào vị trí; KHÔNG áp "ANH" ("anh" là đại từ).
//
// LỖ CÓ SẴN Ở MAIN (giám đốc tách thẻ riêng, KHÔNG thuộc vòng này): mã đơn vị cuối câu
// ("ổ cứng 500 GB", "bao 50 KG"), danh từ hàng trùng từ dẫn ("máy lọc nước RO", "ổ BI"),
// "MADE IN JP" → IN. Cả ba main ra y hệt nhánh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCountryInText, countryCode, xuatXuCua } from '../input.js';

// ── Hồi quy 1: 7 ca "từ đồng âm trong tên hàng nuốt tên nước 1 từ" ──────────────────────────

const HOI_QUY_1 = [
  ['ong thép đúc TQ', 'CN', '"đúc" (Đức) đứng trước không được nuốt "TQ"'],
  ['ong thép đúc Nhật', 'JP', '"đúc" (Đức) đứng trước không được nuốt "Nhật"'],
  ['máy hàn Nhật', 'JP', '"hàn" (Hàn Quốc) đứng trước không được nuốt "Nhật"'],
  ['máy hàn TQ', 'CN', '"hàn" (Hàn Quốc) đứng trước không được nuốt "TQ"'],
  ['mỹ phẩm Hàn', 'KR', '"mỹ" (Hoa Kỳ) đứng trước không được nuốt "Hàn"'],
  ['mỳ ăn liền Hàn', 'KR', '"mỳ" đứng trước không được nuốt "Hàn"'],
  ['my pham han', 'KR', 'câu không dấu: "my" không được nuốt "han"'],
];

test('vòng 8 hồi quy 1: quét theo ƯU TIÊN KHOÁ — 7 ca về đúng như main', () => {
  for (const [s, mong, vi] of HOI_QUY_1) {
    assert.equal(findCountryInText(s), mong, `"${s}" phải là ${mong} — ${vi}`);
    assert.equal(xuatXuCua(s).ma, mong, `xuatXuCua("${s}") cũng phải ra ${mong} — cùng một chỗ quyết định`);
  }
});

// ── Hồi quy 3: luật "my" ở CÂU TỰ DO ────────────────────────────────────────────────────────

test('vòng 8 hồi quy 3: "my" thường (câu tự do) là "mỹ" ⇒ US; "MY" in hoa ⇒ Malaysia', () => {
  for (const s of ['hàng my', 'máy bơm nước my', 'quần jean my']) {
    assert.equal(findCountryInText(s), 'US', `"${s}": khách gõ không dấu "my" là "mỹ" ⇒ Hoa Kỳ, không phải Malaysia`);
  }
  assert.equal(findCountryInText('hàng MY'), 'MY', '"MY" IN HOA là mã ISO Malaysia');
  assert.equal(findCountryInText('hàng Mỹ'), 'US', '"Mỹ" CÓ DẤU là Hoa Kỳ');
  assert.equal(findCountryInText('hàng Mỹ'.normalize('NFD')), 'US', 'NFD (Zalo/iOS tách dấu) vẫn là Hoa Kỳ');
});

// ── Giữ 6 ca tiêu chí vòng 7 ────────────────────────────────────────────────────────────────

test('vòng 8: giữ 6 ca tiêu chí vòng 7', () => {
  for (const [s, mong] of [['ong thép đúc Trung Quốc', 'CN'], ['máy hàn Nhật Bản', 'JP'],
    ['mỹ phẩm Hàn Quốc', 'KR'], ['mỳ ăn liền Thái Lan', 'TH'], ['my pham han quoc', 'KR']]) {
    assert.equal(findCountryInText(s), mong, `"${s}" phải là ${mong}`);
  }
  assert.equal(findCountryInText('ổ cứng 500 GB SSD'), null, '"GB" sau số là dung lượng, không phải Vương quốc Anh');
});

// ── Lỗ hổng UK + alias trong câu ────────────────────────────────────────────────────────────

test('vòng 8 lỗ hổng: alias UK dùng được TRONG CÂU — "made in UK" ⇒ GB, "size UK 10" ⇒ null', () => {
  assert.equal(countryCode('made in UK'), 'GB', '"made in UK" là Vương quốc Anh, không rơi về giả định CN');
  assert.equal(countryCode('Xuất xứ: made in UK'), 'GB');
  assert.equal(findCountryInText('made in UK'), 'GB');
  assert.equal(countryCode('size UK 10'), null, '"UK" trong cỡ áo không phải nước');
  assert.equal(findCountryInText('size UK 10'), null);
  assert.equal(findCountryInText('áo size UK'), null, 'UK đứng cuối câu nhưng KHÔNG sau từ dẫn ⇒ không nhận (kích cỡ áo)');
});

test('vòng 8: giữ vòng 4/5 — XK/VD ⇒ null; UK/ANH/Anh ⇒ GB; HK/Hồng Kông ⇒ HK', () => {
  assert.equal(countryCode('XK'), null);
  assert.equal(countryCode('VD'), null);
  assert.deepEqual(xuatXuCua({ nhan: 'XK' }), { ma: 'CN', giaDinh: true }, 'không bịa nước — nói rõ giả định');
  for (const v of ['UK', 'ANH', 'Anh', 'Xuất xứ: UK']) assert.equal(countryCode(v), 'GB', `"${v}" ⇒ GB`);
  for (const v of ['HK', 'Hồng Kông', 'Xuất xứ: Hồng Kông']) assert.equal(countryCode(v), 'HK', `"${v}" ⇒ HK`);
  // "anh" là ĐẠI TỪ — KHÔNG áp alias ANH trong câu tự do.
  assert.equal(findCountryInText('anh gửi hàng'), null);
  assert.equal(findCountryInText('cảm ơn anh'), null);
});

// ── Ô CÓ NHÃN giữ nguyên như main ───────────────────────────────────────────────────────────

test('vòng 8: ô có nhãn giữ nguyên — "Xuất xứ: MY"/"Xuất xứ: my" ⇒ MY, "Mỹ" ⇒ US, nước FTA giữ mã', () => {
  for (const v of ['MY', 'My', 'my', 'Xuất xứ: MY', 'xuat xu: my']) {
    assert.equal(countryCode(v), 'MY', `"${v}" ở ô nhãn là mã ISO Malaysia ⇒ MY`);
  }
  assert.equal(countryCode('Mỹ'), 'US');
  assert.equal(countryCode('mỹ'), 'US');
  // Nước FTA thật (EVFTA/ATIGA/CPTPP) không được rơi về giả định CN — lỗi của bản vá đầu PR này.
  for (const v of ['SK', 'BN', 'BG', 'SI', 'IS', 'HR', 'LT', 'LV', 'EE', 'LU', 'MT', 'CY', 'Xuất xứ: SK']) {
    assert.equal(countryCode(v), v.startsWith('Xuất') ? 'SK' : v, `"${v}" là mã nước thật, giữ nguyên`);
  }
  assert.deepEqual(xuatXuCua({ nhan: 'my' }), { ma: 'MY', giaDinh: false }, 'ô nhãn "my" vẫn MY và KHÔNG nói giả định');
});

// ── Hồi quy 2: Gói 6 không gán xuất xứ từ TÊN HÀNG ─────────────────────────────────────────

import hs from '../index.js';
import { plain } from '../style.js';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';

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

test('vòng 8 hồi quy 2: gói 6 chỉ nhận ô có nhãn hoặc mã IN HOA cuối câu — không quét tên hàng', async () => {
  const GOI6 = [
    ['gói 6 Nike 64041190 CN', 'CN', 'mã cuối câu'],
    ['gói 6 Nike 64041190 TQ', 'CN', 'viết tắt tiếng Việt cuối câu'],
    ['gói 6 Nike 64041190 SX', null, '"SX" là viết tắt "sản xuất", không phải Sint Maarten'],
    // Vòng 9 PR #214: alias ở cuối câu mà KHÔNG có từ dẫn thì không phải nước ("UK" = kích cỡ giày).
    ['gói 6 Nike 64041190 áo size UK', null, '"UK" là kích cỡ giày, không phải xuất xứ'],
    ['gói 6 Nike 64041190 made in UK', 'GB', '"made in UK" là Vương quốc Anh'],
    ['gói 6 Hòa Phát ống thép đúc 73041900', null, 'tên hàng có "đúc" ⇒ chưa khai nước, không được gán Đức'],
    ['gói 6 Jasic máy hàn 85153100', null, 'tên hàng có "hàn" ⇒ không được gán Hàn Quốc'],
    ['gói 6 Thorakao mỹ phẩm 33049930', null, 'tên hàng có "mỹ" ⇒ không được gán Hoa Kỳ'],
    ['gói 6 Karofi máy lọc nước RO 84212100', null, '"RO" là kỹ thuật (thẩm thấu ngược), không phải Romania'],
    ['gói 6 Nhãn hiệu: Nike\nMã HS: 64041190\nXuất xứ: CN', 'CN', 'ô CÓ NHÃN vẫn đọc như cũ'],
  ];
  for (const [q, mong, vi] of GOI6) {
    const ctx = ctx6();
    await hs.handle(turn6(q), ctx);
    const shtt = ctx.mcp.calls.find((c) => c.name === 'kiem_tra_shtt');
    assert.ok(shtt, `"${q}" phải gọi được kiem_tra_shtt`);
    assert.deepEqual(shtt.args.xuatXu ?? null, mong, `"${q}": xuất xứ gửi Cổng phải là ${mong} — ${vi}`);
    plain('ok');
  }
});
