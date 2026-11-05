// CHỈ DÙNG CHO TEST: createBot cũ (chữ ký của lib/bot.js) dựng trên lõi mới, để 21 test cũ chạy trên engine.
// Nằm trong test/ để server.js không thể import nhầm (review T015 I4): luật cửa ở đây tắt giờ yên, trần và chống trùng nội dung, store :memory:.
// Đồng hồ ảo: giờ thật + độ lệch; drain() nhảy tới mốc hỏi việc nền kế tiếp nên test việc nền không phải ngủ thật.
import { openStore } from '../../core/store.js';
import { createGate } from '../../core/gate.js';
import { createRegistry } from '../../core/registry.js';
import { createEngine } from '../../core/engine.js';
import { parse } from '../../channels/zalo-bot.js';
import { PACKAGES } from '../../packs/hs/packages.js';
import hsPack from '../../packs/hs/index.js';

export const LEGACY_RULES = Object.freeze({ capChatDay: 1e9, capAllDay: 1e9, similarity: 2, quietHours: false });

/** Kênh bọc client Zalo cũ: cửa đã chia tin nên mỗi lần sendText là một phần. */
function legacyChannel(zalo) {
  return {
    name: 'zalo-legacy',
    maxText: 2000,
    parse,
    async sendText(chatId, text) { await zalo.sendText(chatId, text); },
    async typing(chatId) { await zalo.sendChatAction?.(chatId, 'typing'); },
    capabilities: { detectsHumanReplies: false },
  };
}

// pollMs giữ trong chữ ký cho tương thích; đồng hồ ảo thay cho nó.
export function createBot({ zalo, mcp, vision = null, brain = null, log = console, rateLimitPerMin = 10, allowUsers = [], botNames = [], sessionTtlMs = 2 * 3600_000, pollMs, missLog = null } = {}) {
  let offset = 0;
  const now = () => new Date(Date.now() + offset);
  const advance = (ms) => { const d = ms - now().getTime(); if (d > 0) offset += d; };
  const store = openStore(':memory:');
  const channel = legacyChannel(zalo);
  const registry = createRegistry([hsPack]);
  const gate = createGate({ store, channel, rules: LEGACY_RULES, now, log: (...a) => log.error?.(a.join(' ')) });
  const config = { rateLimitPerMin, allowUsers, botNames: Array.isArray(botNames) ? botNames : [], sessionTtlMs };
  const engine = createEngine({ config, store, channel, mcp, vision, brain, registry, gate, now, log, advance, missLog });
  return { handleUpdate: (raw) => engine.process(raw), tools: engine.tools, drain: engine.drain, PACKAGES, engine, store };
}
