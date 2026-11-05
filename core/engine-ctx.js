// Ngữ cảnh lõi đưa cho gói (contracts/pack.md, mục ctx): MCP có ghi audit, bộ nhớ đệm danh sách công cụ, phiên bền, lịch sử.
import { createHash } from 'node:crypto';
import { redact } from './redact.js';

const TOOLS_TTL_MS = 10 * 60_000;

/** listTools() đệm 10 phút theo đồng hồ tiêm vào. Lỗi → null (gói coi như "chưa biết", hiện mọi gói con). */
export function createToolCache({ mcp, now, log }) {
  let names = null;
  let at = 0;
  return async function tools() {
    const t = now().getTime();
    if (names && t - at < TOOLS_TTL_MS) return names;
    try {
      const list = await mcp.listTools();
      names = new Set(list.map((x) => x.name));
      at = t;
    } catch (e) {
      log.error?.(`[mcp] không lấy được danh sách công cụ: ${redact(e?.message)}`);
    }
    return names;
  };
}

const hashOf = (s) => createHash('sha1').update(s).digest('hex');
const json = (v) => { try { return JSON.stringify(v) ?? 'null'; } catch { return String(v); } };

/** MCP bọc: mỗi callTool ghi một dòng audit `tool` { name, args (đã che), ok, sha1, head (500 ký tự đầu, đã che) }. */
export function auditedMcp({ mcp, store, now, chatId, turnId }) {
  const add = (data) => store.audit.add({ at: now().toISOString(), turn_id: turnId, chat_id: chatId, type: 'tool', data });
  return {
    async callTool(name, args = {}) {
      const a = redact(json(args)).slice(0, 500);
      let r;
      try {
        r = await mcp.callTool(name, args);
      } catch (e) {
        add({ name, args: a, ok: false, error: redact(e?.message).slice(0, 500) });
        throw e;
      }
      const s = json(r);
      add({ name, args: a, ok: r?.ok !== false, sha1: hashOf(s), head: redact(s).slice(0, 500) });
      return r;
    },
    listTools: () => mcp.listTools(),
  };
}

/** Phiên bền theo khoá (chatId, hoặc chatId:userId trong nhóm). get() đọc lại db mỗi lần; set(patch) gộp rồi ghi. */
export function sessionApi({ store, key, ttlMs, now }) {
  const get = () => store.sessions.get(key, ttlMs, now().toISOString());
  return {
    get,
    set(patch) { store.sessions.set(key, { ...get(), ...patch }, now().toISOString()); },
    /** Gia hạn TTL mỗi lượt như lib/bot.js (phiên trượt theo lần dùng cuối, không chỉ lần sửa cuối). */
    touch() {
      const cur = get();
      if (Object.keys(cur).length) store.sessions.set(key, cur, now().toISOString());
    },
  };
}

/** log cho gói: mọi chuỗi đi qua redact (contracts/pack.md: ctx.log "đã che bí mật"). */
export function redactedLog(log) {
  const clean = (a) => a.map((x) => (typeof x === 'string' ? redact(x) : x instanceof Error ? redact(x.message) : x));
  return { info: (...a) => log.info?.(...clean(a)), error: (...a) => log.error?.(...clean(a)) };
}

/** ctx đầy đủ cho handle/onJobResult. */
export function buildCtx({ store, mcp, tools, vision, brain, now, log, chatId, turnId, sessionKey, ttlMs, ghiTruot = null }) {
  return {
    ghiTruot,
    mcp: auditedMcp({ mcp, store, now, chatId, turnId }),
    tools,
    session: sessionApi({ store, key: sessionKey, ttlMs, now }),
    history: (n = 20) => store.messages.recent(chatId, n).map((m) => ({ speaker: m.speaker, text: m.text, at: m.at })),
    customer: store.customers.get(chatId) ?? null,
    vision: vision ?? null,
    brain: brain ?? null,
    now,
    log: redactedLog(log),
  };
}
