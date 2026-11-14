// packs/hs/test/soat-782-hoi-thuoc-tinh.test.mjs — HỒI QUY OZV-782 trên ĐƯỜNG THẬT.
//
// PR #228 nối lớp hỏi lại vào `so_tay_questions` của Cổng, và dựng cờ `hoiThuocTinh` bằng
// `m.loai === 'thuoc_tinh'`. Cổng KHÔNG BAO GIỜ trả chữ đó: `loai` của Cổng chỉ nhận
// `DONG_BIEU` | `CONG` | `TT39` (hs-code-api `api/so-tay-questions.js`). Chữ `thuoc_tinh` chỉ có
// trong fixture test của chính PR #228 — nên trên đường thật cờ luôn là `false`, và vì
// `laHoiThuocTinh` thấy KIỂU BOOLEAN thì tin ngay (không suy từ `thieu` nữa), câu đáp thuộc tính
// của khách bị đọc thành TÊN MÓN MỚI: `doc-tra-loi.js` vứt tên hàng khách đã gõ.
//
// Đúng lớp hồi quy của PR #213: tên hàng rụng khỏi tin gửi Cổng, mà mã + thuế in ra vẫn trông
// như thật (Điều III, Điều VIII). Test này đi đường thật `hs.handle` → `packages.js`
// → `hoiLaiUuTien` → `doc-tra-loi.js` → `phan_loai_hs`, không gọi `so-tay-hoi.js` trực tiếp:
// bốn cổng xanh của PR #228 đã bỏ sót đúng vì test chỉ đo tệp một mình.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import hs from '../index.js';

const ALL = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs',
  'sinh_mo_ta_khai_bao', 'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban',
  'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt', 'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh',
  'bo_sung_du_kien', 'so_tay_questions'];
const ML = '11111111-2222-4333-8444-555555555555';

// Câu hỏi của Cổng với `loai` THẬT. `DONG_BIEU` = câu để chọn dòng biểu thuế; ở đây nó hỏi CHẤT
// LIỆU, tức một THUỘC TÍNH của đúng món khách đang hỏi, không phải tên món khác.
const CAU_CHAT_LIEU = {
  ok: true,
  questions: [
    { key: 'chat_lieu', questionVi: 'Thân van bằng chất liệu gì ạ?', type: 'text', required: true, loai: 'DONG_BIEU' },
  ],
};

function fakeCtx() {
  const script = Object.fromEntries(ALL.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
  script.phan_loai_hs = () => ({ ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } });
  script.so_tay_questions = () => CAU_CHAT_LIEU;
  const store = {};
  const ctx = {
    mcp: fakeMcp(script), tools: new Set(ALL), vision: null, customer: null, history: () => [],
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-13T03:00:00Z'), log: { info() {}, error() {}, warn() {} },
  };
  return { ctx, calls: ctx.mcp.calls };
}
const turn = (text) => ({ turnId: 't', chatId: 'u1', userId: 'u1', userName: 'Khách', isGroup: false, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-13T03:00:00.000Z', isStaff: false });

/** Chạy một mạch tin trên đường thật; trả về các tin bot gửi và các tên hàng đã tới Cổng. */
async function mach(...cacTin) {
  const { ctx, calls } = fakeCtx();
  const tin = [];
  for (const t of cacTin) {
    const r = await hs.handle(turn(t), ctx);
    tin.push((r?.replies || []).map((x) => x.text).join('\n'));
  }
  return {
    tin,
    tenHang: calls.filter((c) => c.name === 'phan_loai_hs').map((c) => c.args.tenHang),
    soTay: calls.filter((c) => c.name === 'so_tay_questions'),
  };
}

test('[OZV-782] đường thật: khách đáp câu DONG_BIEU của Cổng → tên hàng KHÔNG được rụng', async () => {
  const r = await mach('Tra hs 8481.80.87 van bi', 'inox 304');

  // Câu hỏi lại phải là câu CỦA CỔNG (mục 1 của #177), không phải regex dự phòng.
  assert.equal(r.soTay.length >= 1, true, 'phải gọi so_tay_questions khi đã có mã ≥6 số');
  assert.match(String(r.tin[0] || ''), /ch[aấ]t li[eệ]u g[iì]/i, `tin 1 phải là câu của Cổng: ${r.tin[0]}`);

  // Câu đáp "inox 304" là CHẤT LIỆU của van bi, không phải tên món mới.
  assert.ok(r.tenHang.length >= 1, `phải gọi Cổng sau khi khách đáp: ${JSON.stringify(r.tin)}`);
  assert.match(r.tenHang[0], /van bi/i,
    `TÊN HÀNG khách đã gõ rụng khỏi tin gửi Cổng — mã + thuế in ra là của thứ khác: "${r.tenHang[0]}"`);
  assert.match(r.tenHang[0], /inox/i, `chất liệu khách vừa nêu cũng phải tới Cổng: "${r.tenHang[0]}"`);
});
