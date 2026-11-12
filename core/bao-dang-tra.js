// core/bao-dang-tra.js — câu "đang tra" trong ≤ 3 giây (issue #168, phần 1) + câu tạm khi Cổng treo (OZV-496).
//
// QA thật 10/11: bot im 30–55 giây trong lúc tra Cổng OZ (nhóm Zalo: im 3 phút). Khách tưởng bot chết.
// Lượt nào phải đợi Cổng (hoặc đọc ảnh, hoặc việc nền) thì khách nhận ngay MỘT câu ngắn, rồi mới
// tới kết quả. Luật, đo bằng đồng hồ THẬT của tiến trình (không theo `now()` của lõi — đồng hồ đó
// có thể là đồng hồ giả trong eval):
//   • lượt đã chạy ≥ `sauMs` (mặc định 1,5 giây) MÀ đang/đã gọi Cổng, đọc ảnh, HOẶC đợi não AI
//     (định tuyến `brain.hieu`, biên tập `editor.chot` — OZV-496: QA thật 12/11 não mất 5–9 giây
//     TRƯỚC lượt gọi Cổng đầu tiên, khách im >3 giây) → gửi ngay;
//   • gói trả việc nền (`jobs`) → gửi khi lượt xong (kết quả còn đợi Cổng 20–60 giây nữa);
//   • lượt xong trước `sauMs` mà không có việc nền → KHÔNG gửi (kết quả tới luôn, khỏi ồn);
//   • lượt không gọi Cổng/lẫn não (lời chào, menu bằng regex) → KHÔNG gửi. Não chỉ được hỏi sau khi
//     router regex đã coi câu khách là "chạy gói" (`packs/hs/brain.js:routeThongMinh`), nên đánh dấu
//     não không làm lời chào/menu ồn;
//   • Cổng TREO: lượt đã báo "đang tra" mà vẫn chưa xong sau `cauTamSauMs` (mặc định 120 giây, đếm
//     từ đầu lượt — OZV-496 lỗi 2: QA thật 12/11 khách im 120 giây rồi bị bỏ) → gửi MỘT câu tạm
//     đúng giọng ("Cổng đang bận…"), không im, không bịa mã. Lượt có việc nền thì không cần: việc nền
//     đã có câu tiến độ riêng 60 giây (`core/jobs.js:baoTienDo`).
// Lõi không soạn chữ cho khách: câu do gói trả qua `pack.cauDangTra(turn, ctx, info)`; gói không có
// hàm đó (hoặc trả rỗng) thì không gửi. Mỗi lượt tối đa một câu "đang tra" và một câu tạm. Tin đi
// qua cửa với kind 'progress': không tính trần tin/ngày, không bao giờ hoãn tới sáng (`core/gate-decide.js`).

export const DANG_TRA_SAU_MS = 1500;
export const CAU_TAM_SAU_MS = 120_000;

/**
 * @param {object} o
 * @param {object} o.turn
 * @param {object} o.pack
 * @param {(text:string, loai?:'tam') => Promise<any>} o.send  gửi qua cửa (lõi đặt idem + kind 'progress')
 * @param {number} [o.sauMs]
 * @param {number} [o.cauTamSauMs]  0 = tắt câu tạm
 * @param {{ hen: Function, huy: Function }} [o.dongHo]  hẹn giờ (test tiêm vào được)
 */
export function createBaoDangTra({ turn, pack, send, sauMs = DANG_TRA_SAU_MS, cauTamSauMs = CAU_TAM_SAU_MS, log = console, dongHo = { hen: setTimeout, huy: clearTimeout } }) {
  let congCu = null;    // việc chậm đầu tiên của lượt: tên công cụ Cổng, 'anh' khi đọc ảnh, 'nao'/'bienTap' khi đợi AI
  let quaMoc = false;   // lượt đã chạy quá `sauMs`
  let xong = false;     // lượt đã kết thúc: không gửi gì từ bộ hẹn giờ nữa
  let dangGui = null;   // lời hứa gửi (một lượt một câu)
  let tamGui = null;    // lời hứa câu tạm khi Cổng treo (một lượt một câu, OZV-496)
  let ctxLuot = null;

  function bao(info) {
    if (dangGui) return dangGui;
    let text = null;
    try { text = pack?.cauDangTra?.(turn, ctxLuot, info) ?? null; } catch (e) { log.error?.(`[dang-tra] gói lỗi khi soạn câu: ${e?.message}`); }
    if (!text || !String(text).trim()) return null;
    dangGui = Promise.resolve().then(() => send(String(text))).catch((e) => { log.error?.(`[dang-tra] không gửi được: ${e?.message}`); return null; });
    return dangGui;
  }

  /** Câu tạm khi Cổng treo quá hạn (OZV-496 lỗi 2): chỉ khi lượt đã báo "đang tra" mà vẫn chưa xong. */
  function baoTam() {
    if (tamGui || xong || !dangGui) return;
    let text = null;
    try { text = pack?.cauDangTra?.(turn, ctxLuot, { congCham: true }) ?? null; } catch (e) { log.error?.(`[dang-tra] gói lỗi khi soạn câu tạm: ${e?.message}`); }
    if (!text || !String(text).trim()) return;
    tamGui = Promise.resolve().then(() => send(String(text), 'tam')).catch((e) => { log.error?.(`[dang-tra] không gửi được câu tạm: ${e?.message}`); return null; });
  }

  const hen = dongHo.hen(() => { quaMoc = true; if (congCu && !xong) bao({ congCu }); }, sauMs);
  hen?.unref?.();
  // Hạn câu tạm tính từ ĐẦU LƯỢT (khách nhắn lúc nào bộ đo đếm từ đó), không từ lúc Cổng bắt đầu treo.
  const henTam = cauTamSauMs > 0 ? dongHo.hen(baoTam, cauTamSauMs) : null;
  henTam?.unref?.();

  function danhDau(ten) {
    if (xong) return;
    if (!congCu) congCu = ten;
    if (quaMoc) bao({ congCu });
  }

  return {
    /** ctx của lượt, bọc `mcp.callTool`, `vision.readSpecs`, `brain.hieu`, `editor.chot` để biết lượt đang đợi việc chậm. */
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
      if (ctx?.brain?.hieu) {
        const b = Object.create(ctx.brain);
        b.hieu = (...a) => { danhDau('nao'); return ctx.brain.hieu(...a); };
        out.brain = b;
      }
      if (ctx?.editor?.chot) {
        const e = Object.create(ctx.editor);
        e.chot = (...a) => { danhDau('bienTap'); return ctx.editor.chot(...a); };
        out.editor = e;
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
        dongHo.huy(henTam);
        if (dangGui) await dangGui;
        if (tamGui) await tamGui;
      }
    },
    /** Đã gửi câu báo chưa (cho test, audit). */
    get daBao() { return Boolean(dangGui); },
  };
}
