// packs/hs/test/needs-facts-vong-2.test.mjs — OZV-2334: khoá hành vi VÒNG 2 khi Cổng trả NEEDS_FACTS.
//
// Hợp đồng Cổng (ozplugin apps/gateway/src/huong-dan.ts mục 3): "lượt có biên nhận maLuot (chạy
// nền) thì gọi bo_sung_du_kien với maLuot đó, không trừ điểm thêm (mục 8); CHỈ khi kết quả tức
// thì, không có biên nhận, mới gọi lại phan_loai_hs kèm dữ kiện mới". Đường bo_sung_du_kien đã có
// test (hs.test.mjs "CAN_DU_KIEN → người dùng trả lời → bo_sung_du_kien đúng mã lượt"); tệp này
// khoá ĐƯỜNG CÒN LẠI: kết quả NEEDS_FACTS tức thì mà client không dùng được bo_sung_du_kien →
// câu trả lời của khách phải được GỘP vào mô tả rồi gọi phan_loai_hs LẦN THỨ HAI (không chỉ nằm
// chờ ket_qua_phan_loai) — đúng yêu cầu bình luận 04:29 của GĐ hs-code-api trên OZV-2332.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import hs from '../index.js';
import { plain } from '../style.js';

const ALL = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt',
  'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh'];

/** ctx giả như hs.test.mjs nhưng tools KHÔNG có bo_sung_du_kien (môi trường như qa-that --mock). */
function fakeCtxKhongBoSung(overrides = {}) {
  const script = Object.fromEntries(ALL.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
  for (const [k, v] of Object.entries(overrides)) script[k] = typeof v === 'function' ? v : () => v;
  const store = {};
  const ctx = {
    mcp: fakeMcp(script), tools: new Set(ALL), vision: null, customer: null, history: () => [],
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-04T03:00:00Z'), log: { info() {}, error() {} },
  };
  return { ctx, store, calls: ctx.mcp.calls };
}

const turn = (text) => ({ turnId: 't', chatId: 'u1', userId: 'u1', userName: 'Tuấn', isGroup: false, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-04T03:00:00.000Z', isStaff: false });

const CAN_DU_KIEN = (maLuot) => ({ ok: true, data: { ...(maLuot ? { maLuot } : {}), trangThai: 'CAN_DU_KIEN',
  hoi: [{ questionVi: 'Máy hút bụi dùng trong nhà hay công nghiệp, công suất bao nhiêu W?' }],
  ketQua: { status: 'NEED_FACTS', results: [{ hs: '85081100', reason: 'Nếu là máy hút bụi gia dụng.' }] } } });
const XONG = { ok: true, trangThai: 'XONG', data: { maDeXuat: '85081100', doChinhXac: 0.9 } };

test('NEEDS_FACTS tức thì, không có tool bo_sung_du_kien → khách trả lời → phan_loai_hs LẦN THỨ HAI với tenHang GỘP câu trả lời', async () => {
  let lan = 0;
  const { ctx, calls } = fakeCtxKhongBoSung({
    phan_loai_hs: () => { lan += 1; return lan === 1 ? CAN_DU_KIEN('ML-NEEDS-1') : XONG; },
  });
  const a = await hs.handle(turn('Tên hàng: máy hút bụi\nCông dụng: hút bụi sàn nhà'), ctx);
  assert.equal(lan, 1);
  assert.match(plain(a.replies[0].text), /cho biết thêm/i);   // bot hỏi khách đúng câu Cổng trả về
  assert.match(plain(a.replies[0].text), /gửi lại mô tả đầy đủ hơn/);   // nhánh KHÔNG có bo_sung_du_kien
  assert.ok(!ctx.session.get().choBoSung, 'không đặt choBoSung khi không có tool bo_sung_du_kien');

  const b = await hs.handle(turn('loại dùng trong nhà, công suất 1200W'), ctx);
  const luotPl = calls.filter((c) => c.name === 'phan_loai_hs');
  assert.equal(luotPl.length, 2, `phải có lượt phan_loai_hs THỨ HAI, thực tế ${luotPl.length}`);
  assert.match(String(luotPl[1].args.tenHang), /máy hút bụi/, 'tenHang vòng 2 còn mô tả gốc');
  assert.match(String(luotPl[1].args.tenHang), /1200W/, 'tenHang vòng 2 đã GỘP câu trả lời của khách');
  assert.match(plain(b.replies[0].text), /8508\.11\.00/);   // vòng 2 chốt mã ngay trong lượt
  assert.ok(!calls.some((c) => c.name === 'bo_sung_du_kien'));
});

test('NEEDS_FACTS tức thì KHÔNG có biên nhận maLuot (dù có tool bo_sung_du_kien) → vẫn vòng 2 qua phan_loai_hs, không gọi bo_sung_du_kien', async () => {
  let lan = 0;
  const script = { phan_loai_hs: () => { lan += 1; return lan === 1 ? CAN_DU_KIEN(null) : XONG; } };
  const store = {};
  const ctx = {
    mcp: fakeMcp({ ...Object.fromEntries(ALL.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })])), ...script }),
    tools: new Set([...ALL, 'bo_sung_du_kien']), vision: null, customer: null, history: () => [],
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-04T03:00:00Z'), log: { info() {}, error() {} },
  };
  const a = await hs.handle(turn('Tên hàng: máy hút bụi\nCông dụng: hút bụi sàn nhà'), ctx);
  assert.equal(lan, 1);
  assert.match(plain(a.replies[0].text), /gửi lại mô tả đầy đủ hơn/);   // không có biên nhận → không hẹn "một tin không trừ điểm"
  assert.ok(!ctx.session.get().choBoSung, 'không có maLuot biên nhận → không đặt choBoSung');
  const b = await hs.handle(turn('dùng trong nhà, công suất 1200W'), ctx);
  assert.equal(lan, 2);
  const luotPl = ctx.mcp.calls.filter((c) => c.name === 'phan_loai_hs');
  assert.equal(luotPl.length, 2);
  assert.match(String(luotPl[1].args.tenHang), /1200W/, 'tenHang vòng 2 đã GỘP câu trả lời của khách');
  assert.ok(!ctx.mcp.calls.some((c) => c.name === 'bo_sung_du_kien'), 'không có biên nhận → không gọi bo_sung_du_kien');
  assert.match(plain(b.replies[0].text), /8508\.11\.00/);
});
