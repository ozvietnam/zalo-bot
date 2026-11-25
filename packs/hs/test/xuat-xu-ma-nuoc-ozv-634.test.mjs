// OZV-634 — maCuoiCau đọc "ĐỒNG" thành NG (Nigeria): tách chữ Unicode trước khi nhận mã ISO.
//
// Gốc lỗi: `maCuoiCau` dùng regex ASCII `\b([A-Z]{2})\s*$`. Trong JS, `\b` chỉ coi `[A-Za-z0-9_]`
// là ký tự từ nên cắt ngay sau nguyên âm có dấu ("Ồ", "Ạ", "À", "Ắ") rồi lấy 2 chữ cái ASCII cuối
// làm mã nước: "hàng ĐỒNG" → "NG" (Nigeria), "hàng GẠCH" → "CH" (Thụy Sĩ), "64041190 ĐỒNG" → "NG".
//
// Vá: dùng `tachTuViTri` (tách từ theo chữ Unicode `[\p{L}\p{N}][\p{L}\p{N}\p{M}]*`) và bỏ token
// có dấu `\p{M}` hoặc không khớp `/^[A-Z]{2}$/` — cùng luật với `maNuocTrongCau`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import hs from '../index.js';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import { maCuoiCau } from '../input.js';

const ALL6 = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt',
  'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien'];
const turn6 = (text) => ({ turnId: 't', chatId: 'u1', userId: 'u1', userName: 'T', isGroup: false, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-25T02:45:00.000Z', isStaff: false });
const ctx6 = () => {
  const script = Object.fromEntries(ALL6.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
  return { mcp: fakeMcp(script), tools: new Set(ALL6), vision: null, customer: null, history: () => [],
    session: { get: () => ({}), set: () => {} }, now: () => new Date('2026-11-25T02:45:00Z'), log: { info() {}, error() {} } };
};

test('OZV-634: bảng 8 câu chuẩn — maCuoiCau không cắt đuôi chữ Việt có dấu và không hồi quy', () => {
  const BANG_CHUAN = [
    ['hàng ĐỒNG', null],
    ['ống thép GẠCH', null],
    ['500, GB', null],
    ['Nike 64041190 CN', 'CN'],
    ['made in UK', 'UK'],
    ['84212100 máy lọc nước RO', null],
    ['thép ĐỎ', null],
    ['hàng VIỆT NAM', null],
  ];
  for (const [cau, mong] of BANG_CHUAN) {
    assert.equal(maCuoiCau(cau), mong, `maCuoiCau(${JSON.stringify(cau)}) phải ra ${JSON.stringify(mong)}`);
  }
});

test('OZV-634: chữ Việt có dấu (NFC & NFD) đứng sau từ dẫn hoặc mã HS không bị cắt đuôi thành mã ISO', () => {
  for (const cau of [
    'hàng ĐỒNG',
    'hàng GẠCH',
    'hàng VÀNG',
    'hàng TRẮNG',
    '64041190 ĐỒNG',
    '64041190 GẠCH',
    'hàng ĐỒNG'.normalize('NFD'),
    'hàng GẠCH'.normalize('NFD'),
    'hàng MỸ'.normalize('NFD'),
    'thép ĐỎ'.normalize('NFD'),
    'hàng VIỆT NAM'.normalize('NFD'),
  ]) {
    assert.equal(maCuoiCau(cau), null, `maCuoiCau(${JSON.stringify(cau)}) không được đọc đuôi chữ Việt thành mã nước`);
  }
});

test('OZV-634: đường thật Gói 6 — không gửi xuất xứ Nigeria (NG) / Thụy Sĩ (CH) khi cuối câu là chữ Việt có dấu', async () => {
  for (const q of [
    'gói 6 74071000 hàng ĐỒNG',
    'gói 6 69072190 hàng GẠCH',
    'gói 6 ổ cứng 500, GB',
    'gói 6 84212100 máy lọc nước RO',
    'gói 6 72142000 thép ĐỎ',
    'gói 6 64041190 hàng VIỆT NAM',
  ]) {
    const ctx = ctx6();
    await hs.handle(turn6(q), ctx);
    const shtt = ctx.mcp.calls.find((c) => c.name === 'kiem_tra_shtt');
    assert.ok(shtt, `"${q}" phải gọi được kiem_tra_shtt`);
    assert.equal(shtt.args.xuatXu ?? null, null, `"${q}": không được tự gán mã nước từ chữ Việt / đơn vị đo`);
  }
});

test('OZV-634: chốt ngược Gói 6 — giữ nguyên Nike 64041190 CN -> CN và made in UK -> GB', async () => {
  for (const [q, mong] of [
    ['gói 6 Nike 64041190 CN', 'CN'],
    ['gói 6 Nike 64041190 made in UK', 'GB'],
    ['gói 6 84212100 máy lọc nước RO', null],
  ]) {
    const ctx = ctx6();
    await hs.handle(turn6(q), ctx);
    const shtt = ctx.mcp.calls.find((c) => c.name === 'kiem_tra_shtt');
    assert.ok(shtt, `"${q}" phải gọi được kiem_tra_shtt`);
    assert.equal(shtt.args.xuatXu ?? null, mong, `"${q}": xuất xứ gửi Cổng phải là ${JSON.stringify(mong)}`);
  }
});
