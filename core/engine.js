// Lõi một lượt (plan.md "Luồng một lượt"): parse → chống trùng → chats → ALLOW/giới hạn → turn → audit → gói → cửa → jobs → inbox.done.
// Lõi không biết gói làm gì; mọi tin ra đi qua gate.send. Thay createBot của lib/bot.js (đường cũ cho test: test/helpers/legacy-bot.mjs).
import { createHash } from 'node:crypto';
import { redact } from './redact.js';
import { isCloser } from './text.js';
import { isGroup, stripMention, groupNameTag } from './mention.js';
import { convIdOf } from './conv.js';
import { createToolCache, buildCtx, sessionApi } from './engine-ctx.js';
import { pollDueJobs, jobRow } from './engine-jobs.js';

export const NON_TEXT_TEXT = 'Bot đọc tin nhắn chữ và ảnh. Gõ "menu" để xem các gói tra cứu.';
export const RATE_LIMIT_TEXT = 'Bạn gửi hơi nhanh, đợi khoảng 1 phút rồi thử lại nhé.';
export const GENERIC_ERROR_TEXT = '{orange}⚠️ Cổng tra cứu OZ đang lỗi tạm thời{/orange}. Bạn thử lại sau ít phút nhé.';

const toSet = (v) => new Set([...(v ?? [])].filter(Boolean));
const sha1 = (s) => createHash('sha1').update(String(s ?? '')).digest('hex');
const json = (v) => { try { return JSON.stringify(v) ?? 'null'; } catch { return '{}'; } };
/** Trong nhóm mọi tin ra bắt đầu "@<tên>\n"; tên trùng trong nhóm có hậu tố 2 ký tự userId (FR-031). */
const addressOf = (who, text) => (who.namePrefix ? who.namePrefix + text : text);

/**
 * @param {object} o
 * @param {(ms:number)=>void} [o.advance]  chỉ đồng hồ ảo (createBot cũ): drain() nhảy tới mốc việc nền kế tiếp thay vì ngủ.
 */
export function createEngine({ config = {}, store, channel, mcp, vision = null, brain = null, editor = null, registry, gate, now = () => new Date(), log = console, advance, missLog = null } = {}) {
  // Sổ ghi lượt "trượt từ vựng" (gói 1 cần hỏi thêm, tiền lệ 0 kết quả, khách gõ lại) — null = tắt.
  const ghiTruot = missLog ? (loai, info) => missLog.ghi(loai, info) : null;
  const ttlMs = config.sessionTtlMs ?? 7_200_000;
  const ratePerMin = config.rateLimitPerMin ?? 10;
  const allow = toSet(config.allowUsers);
  const staff = toSet(config.staffUsers);
  const names = [...(config.botNames ?? [])];
  const tools = createToolCache({ mcp, now, log });
  const hits = new Map();

  function limited(uid) {
    const t = now().getTime();
    const arr = (hits.get(uid) || []).filter((x) => t - x < 60_000);
    arr.push(t);
    hits.set(uid, arr);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((x) => t - x < 60_000)) hits.delete(k);
    return arr.length > ratePerMin;
  }

  const audit = (type, chatId, convId, turnId, data) => store.audit.add({ at: now().toISOString(), turn_id: turnId, chat_id: chatId, conv_id: convId ?? null, type, data });

  /** Gửi một câu trả lời cho lượt qua cửa (idem r:<conv>:<turn>:<i>; câu báo lỗi chung dùng i = 'err'). */
  function reply(turn, text, i, { kind = 'reply', pack = null, evidence = [] } = {}) {
    return gate.send({
      idemKey: `r:${turn.convId}:${turn.turnId}:${i}`, chatId: turn.chatId, convId: turn.convId, isGroup: turn.isGroup,
      turnId: turn.turnId, kind,
      text: addressOf(turn, text), inReplyToAt: turn.receivedAt, pack: pack ? { id: pack.id, moneyCheck: pack.moneyCheck === true } : null, evidence,
    });
  }

  const hsFooter = (ctx) => registry.available(null, { isStaff: true }).find((p) => p.id === 'hs')?.footer?.(ctx) || '';

  async function process(update) {
    const nowIso = now().toISOString();
    const u = update && typeof update === 'object' && 'updateKey' in update ? update : channel.parse(update);
    if (!u || !u.chatId) return { skipped: 'no-chat', turnId: null };
    const key = u.updateKey;
    // Chống trùng: server ghi inbox (pending) trước; gọi thẳng (test) thì lõi tự ghi. Chỉ ai claim được pending → processing
    // mới chạy gói (cùng khoá đang chạy, done hay failed đều là trùng). Ghi + claim trong một giao dịch.
    const mine = store.tx(() => {
      if (!store.inbox.get(key)) store.inbox.insertIgnore({ update_key: key, chat_id: u.chatId, user_id: u.userId ?? null, raw: json(u.raw ?? u), received_at: nowIso });
      return store.inbox.claim(key, nowIso);
    });
    if (!mine) return { skipped: 'duplicate', turnId: key };
    const done = (r) => { store.inbox.markDone(key, now().toISOString()); return { ...r, turnId: key }; };

    const group = isGroup(u);
    const convId = convIdOf({ chatId: u.chatId, userId: u.userId, isGroup: group });
    store.chats.upsertSeen(u.chatId, group ? 'group' : 'user', group ? null : u.userName ?? null, nowIso);
    store.convs.upsertSeen(convId, u.chatId, u.userId ?? null, u.userName ?? null, nowIso);
    if (allow.size && !allow.has(u.userId) && !allow.has(u.chatId)) return done({ skipped: 'not-allowed' });

    // Tên gắn ở nhóm: người trùng tên trong nhóm có hậu tố 2 ký tự cuối userId (FR-031).
    const namePrefix = group ? groupNameTag({ isGroup: true, userName: u.userName, userId: u.userId, members: store.convs.listByChat(u.chatId) }) : '';
    const base = { turnId: key, chatId: u.chatId, convId, userId: u.userId ?? null, userName: u.userName ?? null, isGroup: group, receivedAt: nowIso, namePrefix };
    const isPhoto = /image|photo/i.test(u.event || '') && Boolean(u.photoUrl);
    if (!isPhoto && (u.event !== 'message.text.received' || !u.text)) {
      if (group) return done({ skipped: 'group-non-text' });
      await reply(base, NON_TEXT_TEXT, 0, { kind: 'notice' });
      return done({ handled: 'non-text' });
    }
    if (limited(u.userId || u.chatId)) {
      if (!group) await reply(base, RATE_LIMIT_TEXT, 0, { kind: 'notice' });
      return done({ handled: 'rate-limited' });
    }

    const text = isPhoto ? null : stripMention(u.text, names);
    const caption = u.caption == null ? null : stripMention(u.caption, names);
    if (!isPhoto && !text) return done({ skipped: 'empty' });
    const turn = { ...base, text, caption, photoUrl: isPhoto ? u.photoUrl : null, isStaff: staff.has(u.userId) };
    let pack = null;
    let ctx = null;
    try {
      const said = isPhoto ? `[ảnh] ${turn.photoUrl}${caption ? ` ${caption}` : ''}` : text;
      audit('inbound', turn.chatId, turn.convId, key, { event: u.event, isGroup: group, userId: turn.userId, sha1: sha1(said), head: redact(said).slice(0, 500) });

      const sessionKey = convId;
      const session = sessionApi({ store, key: sessionKey, ttlMs, now });
      session.touch();
      const last = store.messages.recent(turn.convId, 1)[0];
      store.messages.add({ conv_id: turn.convId, chat_id: turn.chatId, turn_id: key, speaker: 'khach', speaker_id: turn.userId, text: said, at: nowIso });
      // Chào kết ("cảm ơn ạ") ngay sau câu bot: im. Đang chờ xác nhận ảnh thì "ok" là câu trả lời, phải tới gói.
      if (!isPhoto && isCloser(text) && last?.speaker === 'bot' && !session.get().choXacNhanAnh) {
        audit('outbound', turn.chatId, turn.convId, key, { skipped: 'closer', results: [] });
        return done({ skipped: 'closer' });
      }

      ctx = buildCtx({ store, mcp, tools: await tools(), vision, brain, editor, now, log, chatId: turn.chatId, convId: turn.convId, turnId: key, sessionKey, ttlMs, ghiTruot });
      pack = registry.pick(turn, ctx);
      audit('route', turn.chatId, turn.convId, key, { pack: pack?.id ?? null });
      if (!pack) return done({ skipped: 'no-pack' });
      Promise.resolve().then(() => channel.typing?.(turn.chatId)).catch(() => {});
      const res = (await pack.handle(turn, ctx)) ?? {};
      const evidence = [...(res.evidence ?? []), turn.text, turn.caption].filter((v) => v != null);
      const results = [];
      for (const [i, r] of (res.replies ?? []).entries()) {
        const g = await reply(turn, r.text, i, { pack, evidence });
        results.push({ idemKey: `r:${turn.convId}:${key}:${i}`, decision: g.decision, reason: g.reason, status: g.status });
      }
      const t = now().getTime();
      let jobs = 0;
      for (const job of res.jobs ?? []) {
        if (store.jobs.add(jobRow({ chatId: turn.chatId, convId: turn.convId, sessionKey, pack: pack.id, job, turn, nowMs: t })) !== null) jobs++;
      }
      audit('outbound', turn.chatId, turn.convId, key, { pack: pack.id, results, jobs });
      log.info?.(`[engine] gói ${pack.id} chat=${String(turn.chatId).slice(-4)} tin=${results.length}`);
      return done({ handled: pack.id, pack: pack.id });
    } catch (e) {
      const message = redact(e?.message);
      log.error?.(`[engine] lỗi lượt (gói ${pack?.id ?? '-'}): ${message}`);
      try { audit('error', turn.chatId, turn.convId, key, { stage: 'turn', pack: pack?.id ?? null, message: message.slice(0, 500) }); } catch { /* db hỏng: vẫn báo khách */ }
      try {
        const footer = pack?.footer?.(ctx ?? {}) || hsFooter(ctx ?? {});
        await reply(turn, footer ? `${GENERIC_ERROR_TEXT}\n\n${footer}` : GENERIC_ERROR_TEXT, 'err', { pack });
      } catch (e2) {
        log.error?.(`[engine] không gửi được câu báo lỗi: ${redact(e2?.message)}`);
      }
      try { store.inbox.markFailed(key, message.slice(0, 500), now().toISOString()); } catch (e3) { log.error?.(`[engine] không ghi được inbox failed: ${redact(e3?.message)}`); }
      return { handled: 'error', turnId: key };
    }
  }

  /** Chạy việc đến hạn (việc nền + quét outbox) tới khi một lượt quét không còn việc. Đồng hồ ảo: nhảy tới mốc việc nền kế. */
  let draining = false;
  async function drain() {
    if (draining) return;   // drain chồng (bộ hẹn giờ + gọi tay) → lần sau về ngay, như gate.sweep
    draining = true;
    try {
      await drainLoop();
    } finally {
      draining = false;
    }
  }

  async function drainLoop() {
    for (let guard = 0; guard < 10_000; guard++) {
      const n = await pollDueJobs({ store, mcp, registry, gate, now, log, tools, vision, brain, editor, ttlMs, ghiTruot });
      const m = await gate.sweep();
      if (n + m > 0) continue;
      const next = advance ? store.jobs.nextDue() : null;
      if (!next) return;
      advance(Date.parse(next));
    }
    throw new Error('drain: quá 10000 vòng');
  }

  return { process, drain, tools };
}
