// packs/hs/flow-turn.js — trạng thái một lượt của gói hs: phiên (chỉ qua ctx.session), MCP có ghi bằng chứng, dựng PackResult.
import { availablePackages, menuText, pickHs, PACKAGES } from './packages.js';
import { chanBia } from './can-cu.js';

export const LABEL = 'tra-cuu-hs';
const CLASSIFY = new Set(['phan_loai_hs', 'ket_qua_phan_loai', 'bo_sung_du_kien']);
/** Mẫu nhập liệu tĩnh của các gói (ví dụ "57/2022/NĐ-CP" ở gói 5) — chỉ dẫn cách gõ, không phải khẳng định pháp lý. */
const MAU_TINH = () => PACKAGES.map((p) => p.mau);
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
    log: ctx.log ?? null,
    /** Lời khách của lượt (index.js gán) — số hiệu khách tự gõ thì bot được nhắc lại. */
    khach: [],
    footer: menuText(pkgs),
    /** ctx cho gói con trong packages.js (cùng dạng ctx cũ, không có notify/pollMs). */
    pctx: (extra = {}) => ({ mcp, tools: ctx.tools ?? null, session, ghiTruot: ctx.ghiTruot ?? null, editor: ctx.editor ?? null, log: ctx.log, ...extra }),
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
  // Chốt chặn bịa số hiệu văn bản (issue #168, mục B2): mọi số hiệu trong tin gửi khách phải có trong
  // dữ liệu nguồn của lượt — kết quả Cổng của lượt, căn cứ Cổng đã lưu trong phiên, lời khách, mẫu tĩnh.
  // Dòng có số lạ (thường do não AI viết) bị bỏ và ghi log; không bao giờ gửi số văn bản không có nguồn.
  const nguon = [...st.calls, ...(calls === st.calls ? [] : calls)].map((c) => c.result)
    .concat([st.session?.canCu ?? null, st.session?.hoSo ?? null, st.khach ?? []]);
  const sach = texts.map((t) => {
    const r = chanBia(t, nguon, { mau: MAU_TINH() });
    if (r.la.length) st.log?.error?.(`[hs] chặn số hiệu văn bản không có nguồn Cổng: ${r.la.join(', ')}`);
    return r.text;
  }).filter((t) => String(t ?? '').trim());
  return {
    replies: sach.map((text) => ({ text })),
    evidence: calls.map((c) => c.result),
    jobs,
    handoff: null,
    labels: calls.length ? [LABEL] : [],
    interests: interestsOf(calls, known),
  };
}
