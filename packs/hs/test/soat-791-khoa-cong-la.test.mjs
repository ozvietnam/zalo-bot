// packs/hs/test/soat-791-khoa-cong-la.test.mjs — OZV-791 trên ĐƯỜNG THẬT: khoá câu hỏi LẠ của Cổng.
//
// `so-tay-hoi.js` quy khoá đại lượng của Cổng về bộ chữ của `ky-luat-hoi.js` bằng bảng `KHOA` —
// một danh sách gõ tay ~25 khoá. Cổng thêm một khoá câu hỏi mới (việc bình thường, không ai báo
// repo này) thì `mucCau` trả `dai: []`, `dungKetQua` kết luận `hoiThuocTinh: false` TƯỜNG MINH,
// `laHoiThuocTinh` thấy kiểu boolean nên tin ngay và thôi suy từ `thieu`, rồi `doc-tra-loi.js`
// đọc câu đáp của khách thành TÊN MÓN MỚI → tên hàng khách đã gõ rụng khỏi tin gửi Cổng.
//
// Cùng lớp hồi quy OZV-782 / PR #213: mã HS + thuế in ra cho khách vẫn trông như thật, không test
// nào đỏ (Điều III, Điều VIII). Test đi ĐƯỜNG THẬT `hs.handle` → `packages.js` → `so-tay-hoi.js`
// → `doc-tra-loi.js` → `phan_loai_hs`; gọi `so-tay-hoi.js` một mình không bắt được lỗi này.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import hs from '../index.js';

const ALL = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs',
  'sinh_mo_ta_khai_bao', 'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban',
  'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt', 'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh',
  'bo_sung_du_kien', 'so_tay_questions'];
const ML = '11111111-2222-4333-8444-555555555555';

// Khoá KHÔNG có trong bảng `KHOA` — đúng thứ sẽ xảy ra khi Cổng thêm câu hỏi mới. `loai` vẫn là
// giá trị THẬT của Cổng (`DONG_BIEU` | `CONG` | `TT39`, hs-code-api `api/so-tay-questions.js`).
const CAU_MAU = { key: 'mau_sac_vo', questionVi: 'Vỏ van màu gì ạ?', type: 'text', required: true, loai: 'DONG_BIEU' };
const CAU_CONG_SUAT = { key: 'cong_suat', questionVi: 'Công suất bao nhiêu W ạ?', type: 'number', required: true, loai: 'DONG_BIEU' };

/**
 * Cổng THẬT đọc `productText` + `facts` rồi chỉ hỏi phần còn thiếu (`hsKbSoTayQuestionsResult`),
 * nên fake cũng phải bỏ câu mà mô tả gửi lên đã trả lời. Fake hỏi y câu cũ mãi là mô phỏng sai:
 * bot sẽ hỏi hết số vòng rồi mới tra, che mất đúng chỗ ta cần đo (tên hàng tới Cổng hay không).
 */
function congHoi(cacCau) {
  return (args = {}) => {
    const mo = String(args.productText || '').toLowerCase();
    const con = cacCau.filter((q) => !(q.key === 'mau_sac_vo' ? /xanh|đỏ|do\b|vàng/i.test(mo) : false)
      && !(q.key === 'cong_suat' ? /\d+\s*w\b/i.test(mo) : false));
    return { ok: true, questions: con };
  };
}

function fakeCtx(cacCau = [CAU_MAU]) {
  const script = Object.fromEntries(ALL.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
  script.phan_loai_hs = () => ({ ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } });
  script.so_tay_questions = congHoi(cacCau);
  const store = {};
  const ctx = {
    mcp: fakeMcp(script), tools: new Set(ALL), vision: null, customer: null, history: () => [],
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-14T03:00:00Z'), log: { info() {}, error() {}, warn() {} },
  };
  return { ctx, calls: ctx.mcp.calls };
}
const turn = (text) => ({ turnId: 't', chatId: 'u1', userId: 'u1', userName: 'Khách', isGroup: false, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-14T03:00:00.000Z', isStaff: false });

/** Chạy một mạch tin trên đường thật; trả về tin bot gửi và các tên hàng đã tới Cổng. */
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

test('[OZV-791] đường thật: Cổng hỏi bằng KHOÁ LẠ → tên hàng khách gõ vẫn phải tới Cổng', async () => {
  const r = await mach('Tra hs 8481.80.87 van bi', 'xanh lam');

  assert.equal(r.soTay.length >= 1, true, 'phải gọi so_tay_questions khi đã có mã ≥6 số');
  assert.match(String(r.tin[0] || ''), /m[aà]u g[iì]/i, `tin 1 phải là câu của Cổng: ${r.tin[0]}`);

  // "xanh lam" là câu đáp cho câu hỏi của Cổng về ĐÚNG món khách đang hỏi, không phải món mới.
  assert.ok(r.tenHang.length >= 1, `phải gọi Cổng sau khi khách đáp: ${JSON.stringify(r.tin)}`);
  assert.match(r.tenHang[0], /van bi/i,
    `TÊN HÀNG khách đã gõ rụng khỏi tin gửi Cổng — mã + thuế in ra là của thứ khác: "${r.tenHang[0]}"`);
  assert.match(r.tenHang[0], /xanh lam/i, `câu đáp của khách cũng phải tới Cổng: "${r.tenHang[0]}"`);
});

test('[OZV-791] khoá lạ đi KÈM khoá biết: vẫn giữ tên hàng, không đọc câu đáp thành tên món', async () => {
  const { ctx, calls } = fakeCtx([CAU_MAU, CAU_CONG_SUAT]);
  await hs.handle(turn('Tra hs 8481.80.87 van bi'), ctx);
  await hs.handle(turn('xanh lam 350W'), ctx);
  const tenHang = calls.filter((c) => c.name === 'phan_loai_hs').map((c) => c.args.tenHang);
  assert.ok(tenHang.length >= 1, 'phải gọi Cổng sau khi khách đáp');
  assert.match(tenHang[0], /van bi/i, `tên hàng rụng khi khoá lạ đi kèm khoá thông số: "${tenHang[0]}"`);
});
