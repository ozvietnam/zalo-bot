// core/bao-dang-tra.js — câu "đang tra" trong ≤ 3 giây (issue #168, phần 1).
//
// QA thật 10/11: bot im 30–55 giây trong lúc tra Cổng OZ (nhóm Zalo: im 3 phút). Khách tưởng bot chết.
// Lượt nào phải đợi Cổng (hoặc đọc ảnh, hoặc giao việc nền) thì khách nhận ngay MỘT câu ngắn, rồi mới
// tới kết quả. Luật, đo bằng đồng hồ THẬT của tiến trình (không theo `now()` của lõi — đồng hồ đó
// có thể là đồng hồ giả trong eval):
//   • lượt đã chạy ≥ `sauMs` (mặc định 1,5 giây) MÀ đang/đã gọi Cổng hoặc đọc ảnh → gửi ngay;
//   • gói trả việc nền (`jobs`) → gửi khi lượt xong (kết quả còn đợi Cổng 20–60 giây nữa);
//   • lượt xong trước `sauMs` mà không có việc nền → KHÔNG gửi (kết quả tới luôn, khỏi ồn);
//   • lượt không gọi Cổng (lời chào, menu, hỏi lại) → KHÔNG gửi.
// Lõi không soạn chữ cho khách: câu do gói trả qua `pack.cauDangTra(turn, ctx, info)`; gói không có
// hàm đó (hoặc trả rỗng) thì không gửi. Mỗi lượt tối đa một câu. Tin đi qua cửa với kind 'progress':
// không tính trần tin/ngày, không bao giờ hoãn tới sáng (`core/gate-decide.js`).

export const DANG_TRA_SAU_MS = 1500;

/**
 * @param {object} o
 * @param {object} o.turn
 * @param {object} o.pack
 * @param {(text:string) => Promise<any>} o.send  gửi qua cửa (lõi đặt idem + kind 'progress')
 * @param {number} [o.sauMs]
 * @param {{ hen: Function, huy: Function }} [o.dongHo]  hẹn giờ (test tiêm vào được)
 */
export function createBaoDangTra({ turn, pack, send, sauMs = DANG_TRA_SAU_MS, log = console, dongHo = { hen: setTimeout, huy: clearTimeout } }) {
  let congCu = null;    // việc chậm đầu tiên của lượt: tên công cụ Cổng, hoặc 'anh' khi đọc ảnh
  let quaMoc = false;   // lượt đã chạy quá `sauMs`
  let xong = false;     // lượt đã kết thúc: không gửi gì từ bộ hẹn giờ nữa
  let dangGui = null;   // lời hứa gửi (một lượt một câu)
  let ctxLuot = null;

  function bao(info) {
    if (dangGui) return dangGui;
    let text = null;
    try { text = pack?.cauDangTra?.(turn, ctxLuot, info) ?? null; } catch (e) { log.error?.(`[dang-tra] gói lỗi khi soạn câu: ${e?.message}`); }
    if (!text || !String(text).trim()) return null;
    dangGui = Promise.resolve().then(() => send(String(text))).catch((e) => { log.error?.(`[dang-tra] không gửi được: ${e?.message}`); return null; });
    return dangGui;
  }

  const hen = dongHo.hen(() => { quaMoc = true; if (congCu && !xong) bao({ congCu }); }, sauMs);
  hen?.unref?.();

  function danhDau(ten) {
    if (xong) return;
    if (!congCu) congCu = ten;
    if (quaMoc) bao({ congCu });
  }

  return {
    /** ctx của lượt, bọc `mcp.callTool` và `vision.readSpecs` để biết lượt đang đợi việc chậm. */
    boc(ctx) {
      const out = { ...ctx };
      if (ctx?.mcp) {
        const m = Object.create(ctx.mcp);
        m.callTool = (name, args) => { danhDau(name); return ctx.mcp.callTool(name, args); };
        out.mcp = m;
      }
      if (ctx?.vision?.readSpecs) {
        const v = Object.create(ctx.vision);
        v.readSpecs = (...a) => { danhDau('anh'); return ctx.vision.readSpecs(...a); };
        out.vision = v;
      }
      ctxLuot = out;
      return out;
    },
    /** Chạy gói. Có việc nền mà chưa báo → báo ngay. Chờ câu báo đi xong rồi mới trả, để kết quả không vượt lên trước. */
    async chay(fn) {
      try {
        const res = (await fn()) ?? {};
        if ((res.jobs?.length ?? 0) > 0) bao({ congCu, viecNen: true });
        return res;
      } finally {
        xong = true;
        dongHo.huy(hen);
        if (dangGui) await dangGui;
      }
    },
    /** Đã gửi câu báo chưa (cho test, audit). */
    get daBao() { return Boolean(dangGui); },
  };
}
