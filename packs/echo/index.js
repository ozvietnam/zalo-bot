// packs/echo/index.js — gói mẫu "Echo" (T017, specs/001-nen-tang-chung/tasks.md).
// Chỉ dành cho nhân viên (audience:'staff'): lõi lọc trước khi gọi match (contracts/pack.md:70).
// Gói KHÔNG gửi tin, không import channels/: chỉ trả dữ liệu, mọi tin ra do lõi gửi qua cửa (Hiến pháp Điều I).
// Quyết định đã chốt: "/echo" không có nội dung → trả câu hướng dẫn "Dùng: /echo <nội dung>".

const ECHO_RE = /^\/echo\b/;
const HUONG_DAN = 'Dùng: /echo <nội dung>';

/** @type {import('../../core/types.js').Pack} */
export default {
  id: 'echo',
  ten: 'Echo (gói mẫu)',
  version: '1.0.0',
  audience: 'staff',
  moneyCheck: false,
  requiresTools: [],
  priority: 100,   // lớn hơn gói hs (0) nên được hỏi trước

  /** Nhận tin bắt đầu bằng "/echo". turn.text có thể null → không ném lỗi. */
  match(turn) {
    return ECHO_RE.test(String(turn?.text ?? ''));
  },

  /** Bỏ tiền tố "/echo" và khoảng trắng đầu, trả phần còn lại đã trim. */
  async handle(turn) {
    const phan = String(turn?.text ?? '').replace(ECHO_RE, '').trim();
    return {
      replies: [{ text: phan || HUONG_DAN }],
      jobs: [],
      handoff: null,
      labels: [],
    };
  },
};
