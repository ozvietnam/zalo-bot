// Bộ hỏi việc nền tối thiểu của T015 (để test việc nền cũ chạy trên lõi). T021 tách thành core/jobs.js (createJobs).
// jobs.due(now) → jobs.claim (waiting → polling, nguyên tử) → callTool(result_tool, {maLuot}) → còn DANG_XU_LY thì dời 6→12→24→…→60 s; xong/hết hạn → onJobResult → cửa.
import { redact } from './redact.js';
import { buildCtx } from './engine-ctx.js';

export const FIRST_POLL_MS = 6_000;
export const MAX_POLL_MS = 60_000;
export const JOB_TTL_MS = 30 * 60_000;

const stateOf = (r) => r?.trangThai || r?.data?.trangThai;
const backoff = (attempts) => Math.min(FIRST_POLL_MS * 2 ** attempts, MAX_POLL_MS);

/** Dòng jobs mới cho một job gói trả trong lượt. context lưu cả phần lõi cần để gửi lại (tên @ trong nhóm). */
export function jobRow({ chatId, sessionKey, pack, job, turn, nowMs }) {
  const iso = (ms) => new Date(ms).toISOString();
  return {
    chat_id: chatId, session_key: sessionKey, pack, ma_luot: job.maLuot, result_tool: job.resultTool,
    context: { data: job.context ?? null, turnId: turn.turnId, isGroup: turn.isGroup, userName: turn.userName ?? null },
    status: 'waiting', attempts: 0, next_poll_at: iso(nowMs + FIRST_POLL_MS), expires_at: iso(nowMs + JOB_TTL_MS), created_at: iso(nowMs),
  };
}

/** Hỏi mọi việc đến hạn một lượt. Trả số việc đã xử lý (0 = không có việc). */
export async function pollDueJobs({ store, mcp, registry, gate, now, log, tools, vision, ttlMs, addressOf }) {
  const nowDate = now();
  const nowIso = nowDate.toISOString();
  const rows = store.jobs.due(nowIso);
  const all = registry.available(null, { isStaff: true });
  let n = 0;
  for (const row of rows) {
    if (!store.jobs.claim(row.id)) continue;   // tiến trình/lượt khác đã nhận dòng này (waiting → polling)
    n++;
    const c = row.context ?? {};
    const turnId = `job:${row.id}`;
    const pack = all.find((p) => p.id === row.pack);
    const ctx = buildCtx({ store, mcp, tools: await tools(), vision, now, log, chatId: row.chat_id, turnId, sessionKey: row.session_key, ttlMs });
    const job = { id: row.id, chatId: row.chat_id, maLuot: row.ma_luot, resultTool: row.result_tool, context: c.data ?? null };
    const audit = (type, data) => store.audit.add({ at: now().toISOString(), turn_id: turnId, chat_id: row.chat_id, type, data });
    const expired = nowDate.getTime() >= Date.parse(row.expires_at);
    try {
      if (!pack?.onJobResult) throw new Error(`gói ${row.pack} không có onJobResult`);
      let result = null;
      if (!expired) {
        result = await ctx.mcp.callTool(row.result_tool, { maLuot: row.ma_luot });
        if (stateOf(result) === 'DANG_XU_LY') {
          const attempts = (row.attempts ?? 0) + 1;
          store.jobs.update(row.id, { status: 'waiting', attempts, next_poll_at: new Date(nowDate.getTime() + backoff(attempts)).toISOString() });
          continue;
        }
      }
      const res = await pack.onJobResult(job, result, ctx);
      const sent = [];
      for (const [i, r] of (res?.replies ?? []).entries()) {
        const idemKey = i === 0 ? `j:${row.chat_id}:${row.ma_luot}` : `j:${row.chat_id}:${row.ma_luot}:${i}`;
        const g = await gate.send({
          idemKey, chatId: row.chat_id, turnId, kind: 'job_result', text: addressOf(c, r.text),
          pack: { id: pack.id, moneyCheck: pack.moneyCheck === true }, evidence: res.evidence ?? [],
        });
        sent.push({ idemKey, decision: g.decision, reason: g.reason, status: g.status });
      }
      store.jobs.update(row.id, { status: expired ? 'expired' : 'done', done_at: now().toISOString() });
      audit('outbound', { job: row.id, maLuot: row.ma_luot, status: expired ? 'expired' : 'done', results: sent });
    } catch (e) {
      // Lỗi tạm (Cổng rớt mạng) → hỏi lại theo nhịp; gói hỏng hoặc đã hết hạn → dừng việc (failed), không gửi gì.
      const msg = redact(e?.message);
      audit('error', { stage: 'job', job: row.id, message: msg });
      log.error?.(`[jobs] việc ${row.id}: ${msg}`);
      if (!pack?.onJobResult || expired) store.jobs.update(row.id, { status: 'failed', done_at: nowIso });
      else {
        const attempts = (row.attempts ?? 0) + 1;
        store.jobs.update(row.id, { status: 'waiting', attempts, next_poll_at: new Date(nowDate.getTime() + backoff(attempts)).toISOString() });
      }
    }
  }
  return n;
}
