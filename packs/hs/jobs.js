// packs/hs/jobs.js — việc nền của Cổng OZ (biên nhận {maLuot, trangThai: DANG_XU_LY}).
// Gói mới dùng toJob (không chờ, lõi hỏi kết quả); waitJob/chayCho là đường cũ của lib/bot.js, xoá ở T016.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (ctx, name) => !ctx.tools || ctx.tools.has(name);

/**
 * Ngưỡng chờ tối đa cho một việc nền (đường chờ trong lượt, lib/bot.js).
 * Đo thực tế Cổng OZ (2026-11-05): 45s / 150s / 1s — biến động rất mạnh vì engine
 * đôi khi phải thử lại khi LLM không trả JSON hợp lệ ("NO_PRIVATE_LLM").
 * Ngưỡng 4 phút từng báo hết hạn oan khi Cổng chỉ cần 2,5 phút → nâng lên 10 phút.
 */
export const WAIT_JOB_MAX_MS = 10 * 60_000;

/** Câu báo việc nền đang chạy (lượt đầu gửi câu này, kết quả gửi sau). */
export const notice = (label = 'Đang xử lý') => `⏳ ${label}… thường mất 1–3 phút, bot sẽ gửi kết quả ngay khi xong.`;
/** Kết quả thay thế khi việc nền hết hạn mà chưa xong. */
export const hetHan = (maLuot, maxMs = WAIT_JOB_MAX_MS) => {
  const t = `Chưa có kết quả sau ${Math.round(maxMs / 60000)} phút. Mã lượt: ${maLuot} — hỏi lại sau bằng cách gõ: kết quả ${maLuot}`;
  return { ok: false, thongBao: t, thongBaoKhach: t };   // thongBaoKhach: câu do gói tự soạn, được phép hiện cho khách
};

/**
 * Giãn cách giữa các lần GỌI LẠI khi Cổng báo nextAction RETRY (OZV-769, issue #177).
 * Đo thực tế 24h (14/11, bot.db): cả ngày đúng một lượt tra HS và nó trả "AI bận hoặc quá thời
 * gian" → khách về tay không. Cổng đã nói rõ "gọi lại sau ít phút" nên bot phải tự gọi lại.
 * Tối đa 2 lần gọi lại, giãn cách tăng dần, và toàn bộ vẫn nằm trong WAIT_JOB_MAX_MS.
 */
export const RETRY_CHO_MS = [20_000, 60_000];

/** Cổng xong lượt nhưng máy phân loại bận/quá giờ: verdict RETRY → hỏi lại là có thể có kết quả thật. */
export const laRetry = (k) => {
  const na = (k?.ketQua || k?.data?.ketQua)?.nextAction;
  return na?.type === 'RETRY' || na?.reasonCode === 'ENGINE_TIMEOUT';
};

/** Không chờ: biên nhận {maLuot, trangThai: DANG_XU_LY} → { job: {maLuot, resultTool} }; còn lại (hoặc Cổng thiếu resultTool) → { result: r }. */
export function toJob(r, resultTool, ctx = {}) {
  const maLuot = r?.maLuot || r?.data?.maLuot;
  const st = r?.trangThai || r?.data?.trangThai;
  if (!resultTool || !maLuot || st !== 'DANG_XU_LY' || !has(ctx, resultTool)) return { result: r };
  return { job: { maLuot, resultTool } };
}

/** Đường cũ (lib/bot.js, tới T016): chờ trong lượt, hỏi lại tới khi xong. Gói mới dùng toJob. */
export async function waitJob(ctx, r, resultTool, { everyMs = 6000, maxMs = WAIT_JOB_MAX_MS, label = 'Đang xử lý',
  retryMs = RETRY_CHO_MS } = {}) {
  const { job } = toJob(r, resultTool, ctx);
  if (!job) return r;
  const { maLuot } = job;
  // Không gửi câu chờ "⏳ Đang …" (chủ repo bỏ 06/11): khách chỉ nhận kết quả. `label` giữ cho tương thích chữ ký.
  void label;
  const gianCach = ctx.retryMs ?? retryMs;
  let daGoiLai = 0;
  const until = Date.now() + maxMs;
  let loiLanCuoi = null;
  while (Date.now() < until) {
    await sleep(ctx.pollMs ?? everyMs);
    let k;
    try {
      k = await ctx.mcp.callTool(resultTool, { maLuot });
      loiLanCuoi = null;
    } catch (e) {
      // Cổng chập chờn giữa lúc chờ → thử lại, KHÔNG hủy cả lượt.
      loiLanCuoi = e;
      continue;
    }
    const s = k?.trangThai || k?.data?.trangThai;
    if (s === 'DANG_XU_LY') continue;
    // Cổng xong lượt nhưng máy phân loại bận/quá giờ (nextAction RETRY): GỌI LẠI thay vì bỏ khách
    // giữa đường (OZV-769). Hết lượt gọi lại thì trả đúng verdict của Cổng — câu "AI bận…" là câu
    // trung thực, KHÔNG bịa mã (Điều II). Hết thời gian thì rơi về hetHan() như cũ.
    if (laRetry(k)) {
      if (daGoiLai >= gianCach.length) return { ...k, maLuot };
      const cho = gianCach[daGoiLai];
      if (cho >= until - Date.now()) break;
      daGoiLai++;
      await sleep(cho);
      continue;
    }
    return { ...k, maLuot };
  }
  // Hết hạn: nếu lần hỏi cuối lỗi truyền tải thì báo lỗi tạm thời (không phải "hết hạn").
  if (loiLanCuoi) return { ok: false, loi: 'CONG_LOI_TAM_THOI', thongBao: 'Cổng tra cứu OZ đang lỗi tạm thời, bạn thử lại sau ít phút nhé.', maLuot };
  return hetHan(maLuot, maxMs);
}

/** chay() đường cũ cho gói có việc nền: batDau → (chờ trong lượt) → xong. */
export async function chayCho(pkg, text, ctx) {
  const b = await pkg.batDau(text, ctx);
  if (typeof b === 'string') return b;
  const r = b.resultTool ? await waitJob(ctx, b.r, b.resultTool, { label: b.label }) : b.r;
  return pkg.xong(r, b.context, ctx);
}
