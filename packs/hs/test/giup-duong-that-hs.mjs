// packs/hs/test/giup-duong-that-hs.mjs — bộ đồ nghề chạy gói HS trên ĐƯỜNG THẬT
// (`hs.handle` → `packages.js` → `so-tay-hoi.js` → `doc-tra-loi.js` → `phan_loai_hs`).
//
// Tách ra từ `soat-791-khoa-cong-la.test.mjs` (PR #231) khi OZV-795 cần cùng bộ đồ nghề đó cho
// test vòng qua toàn bộ khoá câu hỏi thật của Cổng. Một kiểu dựng mạch, không hai (lớp lỗi rụng
// tên hàng đã tái xuất ba lần — #213 → #228/OZV-782 → OZV-791 — vì mỗi chỗ đo một kiểu).
// Lý do tệp mới (ngoài cấu trúc `plan.md`) ghi ở `specs/001-nen-tang-chung/plan.md`.
import { fakeMcp } from '../../../test/helpers/fakes.mjs';

/** Mọi công cụ MCP gói HS được phép gọi; `ctx.tools` phải liệt kê đủ nếu không `coCongCu` chặn. */
export const ALL = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs',
  'sinh_mo_ta_khai_bao', 'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban',
  'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt', 'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh',
  'bo_sung_du_kien', 'so_tay_questions'];

export const ML = '11111111-2222-4333-8444-555555555555';

/**
 * Mạch giả cho một lượt: `so_tay_questions` do chỗ gọi quyết (hàm nhận `args` của Cổng).
 * @param {(args: object) => object} soTay kịch bản trả lời của công cụ `so_tay_questions`
 */
export function fakeCtx(soTay) {
  const script = Object.fromEntries(ALL.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
  script.phan_loai_hs = () => ({ ok: true, data: { maLuot: ML, trangThai: 'DANG_XU_LY' } });
  script.so_tay_questions = soTay;
  const store = {};
  const ctx = {
    mcp: fakeMcp(script), tools: new Set(ALL), vision: null, customer: null, history: () => [],
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-14T03:00:00Z'), log: { info() {}, error() {}, warn() {} },
  };
  return { ctx, calls: ctx.mcp.calls };
}

export const turn = (text) => ({ turnId: 't', chatId: 'u1', userId: 'u1', userName: 'Khách', isGroup: false, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-14T03:00:00.000Z', isStaff: false });

/**
 * Cổng THẬT đọc `productText` + `facts` rồi chỉ hỏi phần còn thiếu (`hsKbSoTayQuestionsResult`),
 * nên fake phải THÔI hỏi khi khách đã đáp. Kịch bản gọn nhất đúng tinh thần đó: hỏi ở lượt gọi
 * đầu, các lượt sau trả rỗng. Fake hỏi y câu cũ mãi là mô phỏng sai — bot sẽ hỏi vòng vô tận và
 * che mất đúng chỗ ta cần đo (tên hàng có tới Cổng hay không).
 */
export function hoiMotLuot(cacCau) {
  let lan = 0;
  return () => ({ ok: true, questions: (lan += 1) === 1 ? cacCau : [] });
}

/** Các tên hàng đã tới Cổng qua `phan_loai_hs`, theo thứ tự gọi. */
export const tenHangDaGui = (calls) => calls.filter((c) => c.name === 'phan_loai_hs').map((c) => c.args.tenHang);
