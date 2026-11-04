// createBot cũ (chữ ký của lib/bot.js) dựng trên lõi mới, để 21 test cũ chạy trên engine. T016 nối server.js thẳng vào createEngine.
// Store trong bộ nhớ, cửa với luật nới (trần rất cao, tắt giờ yên và chống trùng nội dung) để test chạy mọi giờ như trước.
// Đồng hồ ảo: giờ thật + độ lệch; drain() nhảy tới mốc hỏi việc nền kế tiếp nên test việc nền không phải ngủ thật.
import { openStore } from './store.js';
import { createGate } from './gate.js';
import { createRegistry } from './registry.js';
import { createEngine } from './engine.js';
import { parse } from '../channels/zalo-bot.js';
import { PACKAGES } from '../packs/hs/packages.js';
import hsPack from '../packs/hs/index.js';

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
export function createBot({ zalo, mcp, vision = null, log = console, rateLimitPerMin = 10, allowUsers = [], botNames = [], sessionTtlMs = 2 * 3600_000, pollMs } = {}) {
  let offset = 0;
  const now = () => new Date(Date.now() + offset);
  const advance = (ms) => { const d = ms - now().getTime(); if (d > 0) offset += d; };
  const store = openStore(':memory:');
  const channel = legacyChannel(zalo);
  const registry = createRegistry([hsPack]);
  const gate = createGate({ store, channel, rules: LEGACY_RULES, now, log: (...a) => log.error?.(a.join(' ')) });
  const config = { rateLimitPerMin, allowUsers, botNames: Array.isArray(botNames) ? botNames : [], sessionTtlMs };
  const engine = createEngine({ config, store, channel, mcp, vision, registry, gate, now, log, advance });
  return { handleUpdate: (raw) => engine.process(raw), tools: engine.tools, drain: engine.drain, PACKAGES, engine, store };
}
