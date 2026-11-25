// OZV-2239 — Khách viết TÊN NƯỚC TIẾNG ANH đầy đủ ("made in Germany", "(Made in Korea)",
// "Japan made") thì bot phải đọc đúng mã nước, không rơi về giả định Trung Quốc.
//
// Đo trên main `8daaf32`: mọi câu dưới đây (trừ "made in China") ra `{ ma: 'CN', giaDinh: true }`
// ở cả chuỗi tự do lẫn ô có nhãn `{ nhan }` ⇒ khách khai hàng Đức mà bot tra thuế Trung Quốc.
//
// Lỗi phụ cùng tệp: mã ISO đứng ngay sau từ dẫn xuất xứ trong CHUỖI TỰ DO ("hàng từ GB",
// "made in HK") ra CN giả định, trong khi ô có nhãn `{ nhan }` ra đúng GB/HK.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import hs from '../index.js';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import { xuatXuCua, countryCode, maNuocTrongCau, TEN_NUOC_ANH, NUOC } from '../input.js';

const hai = (s) => [['chuỗi tự do', s], ['ô có nhãn', { nhan: s }]];

const DUNG = [
  ['made in India', 'IN'],
  ['made in Vietnam', 'VN'],
  ['(Made in Korea)', 'KR'],
  ['Japan made', 'JP'],
  ['made in Germany', 'DE'],
  ['made in Thailand', 'TH'],
  ['Made in Taiwan', 'TW'],
  ['MADE IN USA', 'US'],
  ['made in United States', 'US'],
  ['made in Italy', 'IT'],
  ['made in France', 'FR'],
  ['made in Singapore', 'SG'],
  ['made in England', 'GB'],
  ['made in United Kingdom', 'GB'],
  ['made in Australia', 'AU'],
  ['made in South Korea', 'KR'],
  ['made in Spain', 'ES'],
  ['made in Netherlands', 'NL'],
  ['made in Russia', 'RU'],
  ['Germany', 'DE'],
];

for (const [s, ma] of DUNG) {
  for (const [kieu, nguon] of hai(s)) {
    test(`tên nước tiếng Anh (${kieu}): ${JSON.stringify(s)} ⇒ ${ma}, không giả định`, () => {
      assert.deepEqual(xuatXuCua(nguon), { ma, giaDinh: false });
    });
  }
}

test('"North Korea" là Triều Tiên (KP), không bị khoá "korea" nuốt thành Hàn Quốc', () => {
  assert.deepEqual(xuatXuCua('made in North Korea'), { ma: 'KP', giaDinh: false });
});

test('"made in India" không bị đọc "in" thành Ấn Độ ở câu khác: "made in Japan" ⇒ JP', () => {
  assert.deepEqual(xuatXuCua('made in Japan'), { ma: 'JP', giaDinh: false });
});

test('tên nước tiếng Anh thắng từ đơn tiếng Việt va chạm: "máy hàn made in Germany" ⇒ DE', () => {
  assert.deepEqual(xuatXuCua('máy hàn made in Germany'), { ma: 'DE', giaDinh: false });
});

test('bảng tên Anh tách khỏi NUOC (từ điển tên Việt có test "mọi khoá có bản có dấu")', () => {
  for (const k of Object.keys(TEN_NUOC_ANH)) assert.ok(!(k in NUOC), `khoá ${k} trùng NUOC`);
  // "america" CỐ Ý không có: "South America" / "Latin America" là châu lục, không phải nước.
  assert.ok(!('america' in TEN_NUOC_ANH));
  // "us" CỐ Ý không có: đại từ tiếng Anh ("contact us").
  assert.ok(!('us' in TEN_NUOC_ANH));
});

// Lỗi phụ: mã ISO ngay sau từ dẫn xuất xứ trong chuỗi tự do.
for (const [s, ma] of [['hang tu GB', 'GB'], ['hàng từ GB', 'GB'], ['made in HK', 'HK'], ['nhập từ PL', 'PL']]) {
  test(`chuỗi tự do: mã ISO sau từ dẫn ${JSON.stringify(s)} ⇒ ${ma} (khớp ô có nhãn)`, () => {
    assert.deepEqual(xuatXuCua(s), { ma, giaDinh: false });
    assert.deepEqual(xuatXuCua({ nhan: s }), { ma, giaDinh: false });
  });
}

test('mã sau từ dẫn mà dính ký hiệu kỹ thuật không phải nước: "hàng TW/CN" vẫn giả định CN', () => {
  assert.deepEqual(xuatXuCua('hàng TW/CN'), { ma: 'CN', giaDinh: true });
});

// Soát PR #265 — Điểm 1 & OZV-2243 (OZV-371 điểm 1): "của/cua" và "hàng/hang" trước tên viết tắt
// hãng (SK, GE…) không phải từ dẫn xuất xứ ở CẢ câu tự do, ô có nhãn `{ nhan }` VÀ đường Gói 2.
for (const s of ['của SK hynix', 'chip nhớ của SK hynix', 'hàng của SK hynix', 'hàng của GE', 'hang cua GE']) {
  test(`soát PR #265 điểm 1 & OZV-2243: "của/cua" trước tên hãng ${JSON.stringify(s)} ⇒ giả định CN ở cả 2 đường`, () => {
    assert.equal(maNuocTrongCau(s), null, 'maNuocTrongCau');
    assert.equal(countryCode(s), null, 'countryCode');
    assert.deepEqual(xuatXuCua(s), { ma: 'CN', giaDinh: true }, 'chuỗi tự do');
    assert.deepEqual(xuatXuCua({ nhan: s }), { ma: 'CN', giaDinh: true }, 'ô có nhãn');
  });
}

const ALL_GOI2 = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt',
  'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien'];
const turnGoi2 = (text) => ({ turnId: 't', chatId: 'u1', userId: 'u1', userName: 'T', isGroup: false, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-10T03:00:00.000Z', isStaff: false });
const ctxGoi2 = (sessionInit = { goi: 2 }) => {
  const script = Object.fromEntries(ALL_GOI2.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
  const store = { ...sessionInit };
  return { mcp: fakeMcp(script), tools: new Set(ALL_GOI2), vision: null, customer: null, history: () => [],
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-10T03:00:00Z'), log: { info() {}, error() {} } };
};
const tinRa = (res) => ((res?.replies) ?? []).map((x) => x.text ?? x).join('\n');

test('OZV-2243 (OZV-371 điểm 1): đường thật Gói 2 không bịa mã nước SK/GE sau "của/cua", đối chứng "84137090 SK" giữ nguyên', async () => {
  for (const q of ['84137090 của SK hynix', '84137090 hàng của GE', '84137090 hang cua GE']) {
    for (const [tin, sInit] of [[q, { goi: 2 }], [`gói 2: ${q}`, {}]]) {
      const ctx = ctxGoi2(sInit);
      const res = await hs.handle(turnGoi2(tin), ctx);
      const thue = ctx.mcp.calls.find((c) => c.name === 'tra_thue');
      assert.ok(thue, `"${tin}" phải gọi tra_thue`);
      assert.equal(thue.args.maHs, '84137090');
      assert.equal(thue.args.xuatXu, 'CN', `"${tin}": không được bịa nước SK/GE`);
      assert.match(tinRa(res), /giả định/i, `"${tin}": tin trả lời phải nói rõ là giả định`);
    }
  }

  const ctxSk = ctxGoi2({});
  const resSk = await hs.handle(turnGoi2('84137090 SK'), ctxSk);
  const thueSk = ctxSk.mcp.calls.find((c) => c.name === 'tra_thue');
  assert.ok(thueSk, '"84137090 SK" phải gọi tra_thue');
  assert.equal(thueSk.args.xuatXu, 'SK', '"84137090 SK" phải giữ nguyên mã nước SK');
  assert.doesNotMatch(tinRa(resSk), /giả định/i, '"84137090 SK": khách đã khai nước SK thì không nói giả định');
});

// Soát PR #265 — Điểm 2: tên nước tiếng Anh đứng giữa tên hàng/tên hãng (không có từ dẫn xuất xứ) không phải xuất xứ.
for (const s of ['hạt Brazil nuts rang muối', 'mực India ink', 'áo Canada Goose']) {
  test(`soát PR #265 điểm 2: tên Anh trong tên món/hãng ${JSON.stringify(s)} ⇒ giả định CN ở cả 2 đường`, () => {
    assert.deepEqual(xuatXuCua(s), { ma: 'CN', giaDinh: true }, 'chuỗi tự do');
    assert.deepEqual(xuatXuCua({ nhan: s }), { ma: 'CN', giaDinh: true }, 'ô có nhãn');
  });
}

// KHÔNG HỒI QUY — kết quả ghi lại từ main `8daaf32` (cột trái chuỗi tự do, cột phải ô có nhãn).
const NHU_MAIN = [
  ['(MADE IN JP)', 'JP', 'JP'],
  ['made in UK', 'GB', 'GB'],
  ['Hoa Phat tu BT', 'CN*', 'CN*'],
  ['thuoc 500 MG', 'CN*', 'CN*'],
  // Ô có nhãn như main (PE = Peru). Chuỗi tự do ĐỔI CÓ CHỦ Ý: main ra CN giả định, nay ra PE vì
  // "xứ" là từ dẫn xuất xứ — cùng lỗi phụ "hàng từ GB" ở trên (chuỗi tự do phải khớp ô có nhãn).
  ['Xuất xứ: PE', 'PE', 'PE'],
  ['ống 110 PE', 'CN*', 'CN*'],
  ['Nike 64041190 CN', 'CN', 'CN'],
  ['máy hàn Nhật', 'JP', 'JP'],
  ['mỹ phẩm Hàn', 'KR', 'KR'],
  ['áo size UK 10', 'CN*', 'CN*'],
  ['anh gửi hàng', 'CN*', 'CN*'],
  ['made in China', 'CN', 'CN'],
  ['ổ cứng 500 GB SSD', 'CN*', 'CN*'],
  ['made in America', 'CN*', 'CN*'],
  ['contact us', 'CN*', 'CN*'],
  ['vong o BI', 'CN*', 'CN*'],
  ['85371099 tu BT', 'CN*', 'CN*'],
];
const gon = (r) => r.ma + (r.giaDinh ? '*' : '');
for (const [s, tuDo, nhan] of NHU_MAIN) {
  test(`không hồi quy: ${JSON.stringify(s)} vẫn ra như main`, () => {
    assert.equal(gon(xuatXuCua(s)), tuDo, 'chuỗi tự do');
    assert.equal(gon(xuatXuCua({ nhan: s })), nhan, 'ô có nhãn');
  });
}
