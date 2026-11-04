// packs/hs/flow-turn.js — trạng thái một lượt của gói hs: phiên (chỉ qua ctx.session), MCP có ghi bằng chứng, dựng PackResult.
import { availablePackages, menuText, pickHs } from './packages.js';

export const LABEL = 'tra-cuu-hs';
const CLASSIFY = new Set(['phan_loai_hs', 'ket_qua_phan_loai', 'bo_sung_du_kien']);
const hs8 = (v) => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 8 ? d : null; };

/**
 * Mở lượt: đọc phiên một lần (ctx.session.get), gói con sửa bản làm việc `session`,
 * `save()` ghi lại đúng các khoá đã đổi qua ctx.session.set(patch). Mọi lệnh gọi Cổng được ghi vào `calls`.
 */
export function openTurn(ctx) {
  const before = structuredClone(ctx.session.get() ?? {});
  const session = structuredClone(before);
  const calls = [];
  const mcp = {
    async callTool(name, args) {
      const r = await ctx.mcp.callTool(name, args);
      calls.push({ name, args, result: r });
      return r;
    },
    listTools: () => ctx.mcp.listTools(),
  };
  const pkgs = availablePackages(ctx.tools ?? null);
  return {
    session, calls, mcp, pkgs,
    footer: menuText(pkgs),
    /** ctx cho gói con trong packages.js (cùng dạng ctx cũ, không có notify/pollMs). */
    pctx: (extra = {}) => ({ mcp, tools: ctx.tools ?? null, session, ...extra }),
    save() {
      const patch = {};
      for (const k of new Set([...Object.keys(before), ...Object.keys(session)])) {
        if (JSON.stringify(before[k]) !== JSON.stringify(session[k])) patch[k] = session[k] ?? null;
      }
      if (Object.keys(patch).length) ctx.session.set(patch);
    },
  };
}

/** Món hàng khách quan tâm: mô tả hàng + mã HS 8 số đã biết trong lượt (tham số công cụ, kết quả phân loại, ngữ cảnh việc nền). */
export function interestsOf(calls, known = {}) {
  let mon = known.tenHang || null;
  let hs = hs8(known.maHs);
  for (const { name, args = {}, result } of calls) {
    const d = (Array.isArray(args.dongHang) && args.dongHang[0]) || {};
    mon ||= args.tenHang || args.moTaHang || d.moTa || args.moTa || args.tuKhoa || null;
    hs ||= hs8(args.maHs) || hs8(args.maKhai) || hs8(d.maHs) || (CLASSIFY.has(name) ? pickHs(result) : null);
  }
  if (!mon && !hs) return [];
  return [{ ...(mon ? { mon: String(mon).slice(0, 200) } : {}), ...(hs ? { hs } : {}) }];
}

/** PackResult. Nhãn 'tra-cuu-hs' chỉ khi lượt có gọi Cổng (menu, chọn gói, hỏi lại theo mẫu thì không). */
export function result(st, texts, { jobs = [], known = {}, calls = st.calls } = {}) {
  return {
    replies: texts.map((text) => ({ text })),
    evidence: calls.map((c) => c.result),
    jobs,
    handoff: null,
    labels: calls.length ? [LABEL] : [],
    interests: interestsOf(calls, known),
  };
}
