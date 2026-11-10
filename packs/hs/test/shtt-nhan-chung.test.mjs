// Issue #169 — từ chung chung ("oem", "no brand", "không nhãn hiệu"…) không phải nhãn hiệu:
// bot KHÔNG gọi kiem_tra_shtt (đèn ĐỎ sai + trừ điểm vô ích), chỉ nhắc một dòng; mô tả khai báo ghi "không nhãn hiệu".
// Nhãn thật (Samsung) vẫn kiểm như cũ. Dữ liệu nhãn trong test là dữ liệu giả (repo công khai).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import hs from '../index.js';
import { plain } from '../style.js';

const ALL = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt',
  'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien'];
const ML = '11111111-2222-4333-8444-555555555555';
const NHAC = /không phải nhãn hiệu ạ — khi khai, anh\/chị ghi "không nhãn hiệu" hoặc đúng nhãn in trên hàng nhé\./;

// Cổng có đăng ký đúng chữ "OEM" → nếu bot vẫn gửi đi kiểm thì khách nhận đèn ĐỎ sai.
const SHTT_DO = { ok: true, data: { tenNhan: 'OEM', den: 'ĐỎ', reasons: ['Chủ nhãn: CÔNG TY TNHH MẪU VÍ DỤ'], scope: { niceClasses: [7, 11] } }, chiPhi: { diem: 2 } };

function fakeCtx(overrides = {}) {
  const script = Object.fromEntries(ALL.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
  for (const [k, v] of Object.entries(overrides)) script[k] = typeof v === 'function' ? v : () => v;
  const store = {};
  const ctx = {
    mcp: fakeMcp(script), tools: new Set(ALL), vision: null, customer: null, history: () => [],
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-10T03:00:00Z'), log: { info() {}, error() {} },
  };
  return { ctx, store, calls: ctx.mcp.calls };
}
const turn = (text) => ({ turnId: 't', chatId: 'u1', userId: 'u1', userName: 'Tuấn', isGroup: false, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-10T03:00:00.000Z', isStaff: false });

/** Gói 1: gửi mô tả có "Thương hiệu: <chữ>" rồi chạy xong việc nền → chữ trả lời + các lượt gọi Cổng. */
async function goi1(hieu, overrides = {}) {
  const { ctx, calls } = fakeCtx({ phan_loai_hs: { ok: true, maLuot: ML, trangThai: 'DANG_XU_LY' },
    sinh_mo_ta_khai_bao: { ok: true, data: { customsDescription: 'Vòng bi, không nhãn hiệu, mới 100%' } }, ...overrides });
  await hs.handle(turn('1'), ctx);
  const { jobs: [job] } = await hs.handle(turn(`Tên hàng: vòng bi\nThương hiệu: ${hieu}\nXuất xứ: Trung Quốc`), ctx);
  const r = await hs.onJobResult(job, { ok: true, trangThai: 'XONG', data: { maDeXuat: '84821000' } }, ctx);
  return { s: plain(r.replies[0].text), calls, ctx };
}

for (const hieu of ['oem', 'OEM', 'no brand', 'không nhãn hiệu', 'ODM', 'Generic', 'n/a', 'Khong hieu']) {
  test(`gói 1 "Thương hiệu: ${hieu}" → không gọi kiem_tra_shtt, không trừ điểm, chỉ nhắc một dòng`, async () => {
    const { s, calls } = await goi1(hieu, { kiem_tra_shtt: SHTT_DO });
    assert.equal(calls.filter((c) => c.name === 'kiem_tra_shtt').length, 0, `vẫn gọi kiem_tra_shtt với "${hieu}"`);
    assert.match(s, NHAC);
    assert.doesNotMatch(s, /Rủi ro nhãn hiệu|🔴|ĐỎ|điểm tài khoản/);
    // Mô tả khai báo gợi ý không được ghi "nhãn hiệu OEM"
    assert.doesNotMatch(s, /nhãn hiệu OEM/i);
  });
}

test('gói 1 nhãn chung → sinh_mo_ta_khai_bao nhận thuongHieu "không nhãn hiệu", không nhận "OEM"', async () => {
  const { calls } = await goi1('oem');
  const mt = calls.find((c) => c.name === 'sinh_mo_ta_khai_bao').args;
  assert.equal(mt.thuongHieu, 'không nhãn hiệu');
  const pl = calls.find((c) => c.name === 'phan_loai_hs').args;
  assert.equal(pl.thongSo['Thương hiệu'], 'không nhãn hiệu');
});

test('gói 1 nhãn THẬT (Samsung) → vẫn gọi kiem_tra_shtt như cũ, khối rủi ro bằng tiếng Việt ≤ 4 dòng', async () => {
  const { s, calls } = await goi1('Samsung', { kiem_tra_shtt: { ok: true, data: { tenNhan: 'Samsung', den: 'ĐỎ',
    reasons: ['Chủ nhãn: CÔNG TY TNHH MẪU VÍ DỤ'], scope: { niceClasses: [7], sources: ['wipopublish-vn'], dataAsOf: '2026-10-01' },
    evidence: [{ ten: 'SAMSUNG' }], disclaimer: 'Không phải ý kiến pháp lý.' }, chiPhi: { diem: 2 } } });
  const shtt = calls.filter((c) => c.name === 'kiem_tra_shtt');
  assert.equal(shtt.length, 1);
  assert.deepEqual(shtt[0].args, { tenNhan: 'Samsung', maHs: '84821000', xuatXu: 'CN' });
  assert.doesNotMatch(s, NHAC);
  assert.match(s, /®️ Rủi ro nhãn hiệu "Samsung"/);
  // Cắt ở dòng trống (khối SHTT liền mạch, không có dòng trống bên trong). Cắt ở '👉' thì
  // bỏ mất dòng việc nên làm + dòng miễn trừ nên chỉ đếm được 2 dòng — đo hụt (soát #169 [S4]).
  const khoi = s.split('®️ Rủi ro nhãn hiệu "Samsung"')[1].split('\n\n')[0].split('\n').filter((d) => d.trim() !== '');
  assert.ok(khoi.length <= 4, `khối rủi ro phải ≤ 4 dòng, đang ${khoi.length}:\n${khoi.join('\n')}`);
  assert.doesNotMatch(s, /Reasons|Evidence|Scope|Sources|Nice Classes|Data As Of|Suggestions|Disclaimer/);
  assert.doesNotMatch(s, /wipopublish-vn|2026-10-01/);          // chứng cứ/nguồn chỉ ở bản "chi tiết"
  assert.equal((s.match(/không phải ý kiến pháp lý/g) || []).length, 1);
});

test('gói 1 nhãn thật: bản "chi tiết" mới có nguồn + mốc dữ liệu', async () => {
  const { ctx } = await goi1('Samsung', { kiem_tra_shtt: { ok: true, data: { tenNhan: 'Samsung', den: 'ĐỎ',
    scope: { sources: ['wipopublish-vn'], dataAsOf: '2026-10-01' }, evidence: [{ ten: 'SAMSUNG GALAXY' }] } } });
  const ct = plain((await hs.handle(turn('chi tiết'), ctx)).replies[0].text);
  assert.match(ct, /Nguồn dữ liệu: wipopublish-vn/);
  assert.match(ct, /Dữ liệu cập nhật: 2026-10-01/);
  assert.match(ct, /SAMSUNG GALAXY/);
  assert.doesNotMatch(ct, /Reasons|Evidence|Scope|Sources|Nice Classes|Data As Of/);
});

test('gói 6 gõ thẳng "Nhãn hiệu: OEM" → không gọi Cổng, nhắc một dòng + xin nhãn in trên hàng', async () => {
  const { ctx, calls } = fakeCtx({ kiem_tra_shtt: SHTT_DO });
  const r = await hs.handle(turn('gói 6 Nhãn hiệu: OEM\nMã HS: 84821000'), ctx);
  const s = plain(r.replies[0].text);
  assert.equal(calls.length, 0);
  assert.match(s, NHAC);
  assert.match(s, /nhãn in trên hàng/);
});

test('gói 6 nhãn thật → khối tiếng Việt ≤ 4 dòng, không khoá kỹ thuật; "chi tiết" mở bản đầy', async () => {
  const { ctx, calls } = fakeCtx({ kiem_tra_shtt: { ok: true, data: { tenNhan: 'Nike', den: 'ĐỎ',
    reasons: ['Nhãn đã được cấp bằng tại Việt Nam. Chủ nhãn: CÔNG TY TNHH MẪU VÍ DỤ'],
    evidence: [{ ten: 'NIKE' }, { ten: 'NIKE AIR' }], scope: { niceClasses: [25], sources: ['wipopublish-vn'], dataAsOf: '2026-10-01' },
    suggestions: ['Cần thư uỷ quyền của chủ nhãn trước khi mở tờ khai.'] }, chiPhi: { diem: 2 } } });
  const s = plain((await hs.handle(turn('gói 6 Nhãn hiệu: Nike\nMã HS: 64041190'), ctx)).replies[0].text);
  assert.equal(calls.length, 1);
  const khoi = s.split('®️ Rủi ro nhãn hiệu "Nike" — 6404.11.90')[1].split('Gõ "menu"')[0].split('\n').filter((d) => d.trim() !== '');
  assert.ok(khoi.length <= 4, `phải ≤ 4 dòng, đang ${khoi.length}:\n${khoi.join('\n')}`);
  assert.match(khoi[0], /^🔴 Nhãn "Nike" đã có người đăng ký ở VN cho nhóm 25/);
  assert.match(s, /Chủ nhãn: CÔNG TY TNHH MẪU VÍ DỤ/);
  assert.match(s, /uỷ quyền/);
  assert.doesNotMatch(s, /Reasons|Evidence|Scope|Sources|Nice Classes|Data As Of|Suggestions|Disclaimer|NIKE AIR|wipopublish/);
  assert.equal((s.match(/không phải ý kiến pháp lý/g) || []).length, 1);
  const ct = plain((await hs.handle(turn('chi tiết'), ctx)).replies[0].text);
  assert.match(ct, /NIKE AIR/); assert.match(ct, /Nguồn dữ liệu: wipopublish-vn/);
});

// [S2 vòng 3] Đo XUYÊN LUỒNG gói 6 đúng cách người soát đo, không chỉ test bộ dựng: chữ tự do
// kiểu "Mức độ thấp" / "Độ giống thấp" / "Do … mức thấp" không được thành đèn ĐỎ cho khách.
for (const [khoa, gtri, mongDoi] of [['den', 'Mức độ thấp', '🟢'], ['mucDo', 'Mức độ thấp', '🟢'],
  ['mucRuiRo', 'Mức độ trung bình', '🟡'], ['den', 'Độ giống thấp', '🟢'], ['mucDo', 'Độ rủi ro: thấp', '🟢'],
  ['den', 'Do chưa ai đăng ký, rủi ro thấp', '🟢'], ['den', 'Mức độ cao', '🔴']]) {
  test(`gói 6 ${khoa}="${gtri}" → đèn ${mongDoi}`, async () => {
    const { ctx } = fakeCtx({ kiem_tra_shtt: { ok: true, data: { tenNhan: 'Pentax', [khoa]: gtri } } });
    const s = plain((await hs.handle(turn('gói 6 Nhãn hiệu: Pentax\nMã HS: 84821000'), ctx)).replies[0].text);
    // Tiêu đề gói 6 có kèm mã HS ('… "Pentax" — 8482.10.00') nên phần sau chỗ cắt còn đuôi tiêu đề:
    // tìm đúng dòng đèn thay vì tin dòng đầu.
    const khoi = s.split('®️ Rủi ro nhãn hiệu "Pentax"')[1].split('\n\n')[0].split('\n').filter((d) => d.trim() !== '');
    const dongDen = khoi.find((d) => /^(🔴|🟡|🟢|ℹ️)/.test(d.trim()));
    assert.equal(dongDen?.slice(0, 2), mongDoi, `${khoa}="${gtri}" phải ra ${mongDoi}:\n${khoi.join('\n')}`);
  });
}

test('gói 6 một mục con có câu "Do …" không được lật khối XANH thành ĐỎ', async () => {
  const { ctx } = fakeCtx({ kiem_tra_shtt: { ok: true, data: { tenNhan: 'Pentax', den: 'XANH — rủi ro thấp',
    ketQua: [{ ten: 'PENTAX X', mucDo: 'Do khac nhom hang' }] } } });
  const s = plain((await hs.handle(turn('gói 6 Nhãn hiệu: Pentax\nMã HS: 84821000'), ctx)).replies[0].text);
  assert.doesNotMatch(s, /🔴|rủi ro cao/, `một mục con không được lật cả khối:\n${s}`);
});

// [S10 vòng 3] Gói 6 + ảnh: lượt này VẪN trừ điểm tài khoản, nên không được trấn an khi chưa so được.
const anh = (text = null) => ({ ...turn(text), photoUrl: 'https://photo-stal-14.zdn.vn/no/jpg/abc.jpg' });

for (const [ten, data] of [['bảo trì', { thongBao: 'Hệ thống so ảnh đang bảo trì, chưa so được.' }],
  ['khuôn khoá lạ', { soSanh: [{ nhanGiong: 'NIKE', diem: 0.95 }] }], ['rỗng hẳn', {}]]) {
  test(`gói 6 + ảnh, Cổng ${ten} → nói chưa so được, KHÔNG trấn an`, async () => {
    const { ctx } = fakeCtx({ kiem_tra_shtt_anh: { ok: true, data } });
    await hs.handle(turn('6'), ctx);
    const s = plain((await hs.handle(anh(), ctx)).replies[0].text);
    assert.doesNotMatch(s, /✅|chưa thấy nhãn hiệu đã đăng ký nào giống/, `chưa so được thì không được nói an toàn:\n${s}`);
    assert.match(s, /chưa so được/i, s);
    assert.match(s, /gửi lại ảnh/i, s);
  });
}

test('gói 6 + ảnh, mọi mục dưới ngưỡng → không báo động; bản "chi tiết" vẫn nêu', async () => {
  const { ctx } = fakeCtx({ kiem_tra_shtt_anh: { ok: true, data: { ketQua: [{ ten: 'NIIKE', diem: 0.58 }] } } });
  await hs.handle(turn('6'), ctx);
  const s = plain((await hs.handle(anh(), ctx)).replies[0].text);
  assert.doesNotMatch(s, /🟡|uỷ quyền/, `58% không được báo động:\n${s}`);
  assert.doesNotMatch(s, /chưa so được/i, `đọc được mục thì không phải "chưa so được":\n${s}`);
  const ct = plain((await hs.handle(turn('chi tiết'), ctx)).replies[0].text);
  assert.match(ct, /NIIKE/, `bản chi tiết phải nêu mục dưới ngưỡng:\n${ct}`);
});

// [S11 vòng 4, quyết của CEO oz-quyet] Cổng ĐÃ trả kết quả tương đồng trên ngưỡng thì khách phải
// thấy cảnh báo, kể cả khi không đọc được tên nhãn (so logo khớp một nhãn HÌNH không có phần chữ).
// Đo xuyên luồng gói 6 + ảnh, vì lượt này VẪN trừ điểm tài khoản.
for (const [ten, data, phaiCo] of [
  ['khoá nhanGiong', { ketQua: [{ nhanGiong: 'NIKE', diem: 0.95 }] }, /NIKE/],
  ['tên rỗng, giống 99%', { ketQua: [{ ten: '', diem: 0.99 }] }, /Nhãn hình/i]]) {
  test(`gói 6 + ảnh, ${ten} → báo động cho khách, KHÔNG trấn an`, async () => {
    const { ctx } = fakeCtx({ kiem_tra_shtt_anh: { ok: true, data } });
    await hs.handle(turn('6'), ctx);
    const s = plain((await hs.handle(anh(), ctx)).replies[0].text);
    assert.doesNotMatch(s, /✅|chưa thấy nhãn hiệu đã đăng ký nào giống/, `có kết quả tương đồng thì không được trấn an:\n${s}`);
    assert.doesNotMatch(s, /chưa so được/i, `Cổng đã so và có điểm, không phải "chưa so được":\n${s}`);
    assert.match(s, /🟡/, s);
    assert.match(s, phaiCo, s);
    assert.match(s, /uỷ quyền/, s);
    assert.doesNotMatch(s, /\bnull\b|undefined|NaN/, `không được đổ giá trị kỹ thuật cho khách:\n${s}`);
  });
}

// Cổng ghép ô thương hiệu vào câu mô tả → "nhãn hiệu không nhãn hiệu". Dọn lại trước khi đưa khách.
const MO_TA_LAP = { ok: true, data: { moTaEcus: 'Vòng bi cầu, nhãn hiệu không nhãn hiệu, mới 100%' } };

test('gói 1 nhãn chung: mô tả khai báo không được lặp "nhãn hiệu không nhãn hiệu"', async () => {
  const { s } = await goi1('oem', { sinh_mo_ta_khai_bao: MO_TA_LAP });
  assert.match(s, /Vòng bi cầu, không nhãn hiệu, mới 100%/);
  assert.doesNotMatch(s, /nhãn hiệu không nhãn hiệu/i);
});

test('gói 3 nhãn chung: mô tả khai báo không được lặp "nhãn hiệu không nhãn hiệu"', async () => {
  const { ctx } = fakeCtx({ sinh_mo_ta_khai_bao: MO_TA_LAP });
  const s = plain((await hs.handle(turn('gói 3 Mã HS: 84821000\nTên hàng: vòng bi\nThương hiệu: OEM'), ctx)).replies[0].text);
  assert.match(s, /Vòng bi cầu, không nhãn hiệu, mới 100%/);
  assert.doesNotMatch(s, /nhãn hiệu không nhãn hiệu/i);
});

// [S5] Cổng hỏi thêm dữ kiện (CAN_DU_KIEN) thì chưa có mã HS, nhưng khách đã gõ "OEM" rồi:
// lời nhắc khai "không nhãn hiệu" vẫn phải tới, nếu không thì khách trả lời vòng sau vẫn gõ "OEM".
test('gói 1 nhãn chung + Cổng hỏi thêm dữ kiện (CAN_DU_KIEN) → vẫn nhắc một dòng', async () => {
  const { ctx, calls } = fakeCtx({ phan_loai_hs: { ok: true, maLuot: ML, trangThai: 'DANG_XU_LY' }, kiem_tra_shtt: SHTT_DO });
  await hs.handle(turn('1'), ctx);
  const { jobs: [job] } = await hs.handle(turn('Tên hàng: vòng bi\nThương hiệu: OEM\nXuất xứ: Trung Quốc'), ctx);
  const r = await hs.onJobResult(job, { ok: true, trangThai: 'CAN_DU_KIEN', data: { cauHoi: ['Vòng bi loại nào?'] } }, ctx);
  const s = plain(r.replies[0].text);
  assert.match(s, NHAC);
  assert.equal((s.match(NHAC) || []).length, 1, `nhắc đúng một lần:\n${s}`);
  assert.equal(calls.filter((c) => c.name === 'kiem_tra_shtt').length, 0);
  assert.doesNotMatch(s, /Rủi ro nhãn hiệu|🔴|điểm tài khoản/);
});

test('gói 1 nhãn THẬT + CAN_DU_KIEN → không nhắc, cũng chưa kiểm nhãn (chưa có mã HS)', async () => {
  const { ctx, calls } = fakeCtx({ phan_loai_hs: { ok: true, maLuot: ML, trangThai: 'DANG_XU_LY' }, kiem_tra_shtt: SHTT_DO });
  await hs.handle(turn('1'), ctx);
  const { jobs: [job] } = await hs.handle(turn('Tên hàng: vòng bi\nThương hiệu: Samsung\nXuất xứ: Trung Quốc'), ctx);
  const r = await hs.onJobResult(job, { ok: true, trangThai: 'CAN_DU_KIEN', data: { cauHoi: ['Vòng bi loại nào?'] } }, ctx);
  const s = plain(r.replies[0].text);
  assert.doesNotMatch(s, NHAC);
  assert.equal(calls.filter((c) => c.name === 'kiem_tra_shtt').length, 0);
});

// [S6] Khách gõ cả tình trạng hàng vào ô thương hiệu ("hiệu oem, mới 100%" — đúng câu CEO dán).
// Khớp nguyên chuỗi thì những câu này vẫn bị gửi đi kiểm như nhãn thật và trừ điểm.
for (const hieu of ['OEM, mới 100%', 'oem moi 100%', 'No brand - hàng mới', 'không nhãn hiệu, mới 100%', 'ODM, 100% mới']) {
  test(`gói 1 "Thương hiệu: ${hieu}" (có kèm tình trạng hàng) → vẫn là nhãn chung`, async () => {
    const { s, calls } = await goi1(hieu, { kiem_tra_shtt: SHTT_DO });
    assert.equal(calls.filter((c) => c.name === 'kiem_tra_shtt').length, 0, `vẫn gọi kiem_tra_shtt với "${hieu}"`);
    assert.match(s, NHAC);
  });
}

// Ranh giới: nhãn THẬT có chữ "oem"/"brand" đứng kèm vẫn phải đi kiểm, không được bỏ sót.
for (const hieu of ['OEM Samsung', 'Samsung OEM', 'Nobrand Japan', '3M mới 100%', 'OEM 6204']) {
  test(`gói 1 "Thương hiệu: ${hieu}" → vẫn coi là nhãn thật, vẫn kiểm nhãn`, async () => {
    const { s, calls } = await goi1(hieu, { kiem_tra_shtt: { ok: true, data: { tenNhan: hieu, den: 'XANH' } } });
    assert.equal(calls.filter((c) => c.name === 'kiem_tra_shtt').length, 1, `phải kiểm nhãn "${hieu}"`);
    assert.doesNotMatch(s, NHAC);
  });
}

test('gói 3 "Thương hiệu: OEM" → sinh_mo_ta_khai_bao nhận "không nhãn hiệu" + dòng nhắc', async () => {
  const { ctx, calls } = fakeCtx({ sinh_mo_ta_khai_bao: { ok: true, data: { customsDescription: 'Vòng bi, không nhãn hiệu, mới 100%' } } });
  const s = plain((await hs.handle(turn('gói 3 Mã HS: 84821000\nTên hàng: vòng bi\nThương hiệu: OEM'), ctx)).replies[0].text);
  assert.equal(calls.find((c) => c.name === 'sinh_mo_ta_khai_bao').args.thuongHieu, 'không nhãn hiệu');
  assert.match(s, NHAC);
  assert.doesNotMatch(s, /nhãn hiệu OEM/i);
});
