// packs/hs/jobs.js — việc nền của Cổng OZ (biên nhận {maLuot, trangThai: DANG_XU_LY}).
// Gói mới dùng toJob (không chờ, lõi hỏi kết quả); waitJob/chayCho là đường cũ của lib/bot.js, xoá ở T016.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (ctx, name) => !ctx.tools || ctx.tools.has(name);

/** Câu báo việc nền đang chạy (lượt đầu gửi câu này, kết quả gửi sau). */
export const notice = (label = 'Đang xử lý') => `⏳ ${label}… thường mất 1–3 phút, bot sẽ gửi kết quả ngay khi xong.`;
/** Kết quả thay thế khi việc nền hết hạn mà chưa xong. */
export const hetHan = (maLuot, maxMs = 240000) => {
  const t = `Chưa có kết quả sau ${Math.round(maxMs / 60000)} phút. Mã lượt: ${maLuot} — hỏi lại sau bằng cách gõ: kết quả ${maLuot}`;
  return { ok: false, thongBao: t, thongBaoKhach: t };   // thongBaoKhach: câu do gói tự soạn, được phép hiện cho khách
};

/** Không chờ: biên nhận {maLuot, trangThai: DANG_XU_LY} → { job: {maLuot, resultTool} }; còn lại (hoặc Cổng thiếu resultTool) → { result: r }. */
export function toJob(r, resultTool, ctx = {}) {
  const maLuot = r?.maLuot || r?.data?.maLuot;
  const st = r?.trangThai || r?.data?.trangThai;
  if (!resultTool || !maLuot || st !== 'DANG_XU_LY' || !has(ctx, resultTool)) return { result: r };
  return { job: { maLuot, resultTool } };
}

/** Đường cũ (lib/bot.js, tới T016): chờ trong lượt, hỏi lại tới khi xong. Gói mới dùng toJob. */
export async function waitJob(ctx, r, resultTool, { everyMs = 6000, maxMs = 240000, label = 'Đang xử lý' } = {}) {
  const { job } = toJob(r, resultTool, ctx);
  if (!job) return r;
  const { maLuot } = job;
  await ctx.notify?.(notice(label));
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    await sleep(ctx.pollMs ?? everyMs);
    const k = await ctx.mcp.callTool(resultTool, { maLuot });
    const s = k?.trangThai || k?.data?.trangThai;
    if (s !== 'DANG_XU_LY') return { ...k, maLuot };
  }
  return hetHan(maLuot, maxMs);
}

/** chay() đường cũ cho gói có việc nền: batDau → (chờ trong lượt) → xong. */
export async function chayCho(pkg, text, ctx) {
  const b = await pkg.batDau(text, ctx);
  if (typeof b === 'string') return b;
  const r = b.resultTool ? await waitJob(ctx, b.r, b.resultTool, { label: b.label }) : b.r;
  return pkg.xong(r, b.context, ctx);
}
