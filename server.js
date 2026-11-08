// server.js — chỉ nối dây: config → store → channel → engine → http/poll (spec 001, T016).
// Mọi tin ra khách đi qua core/gate.js (Hiến pháp Điều I). File này KHÔNG gửi tin trực tiếp.
// ZALO_MODE=webhook (mặc định): HTTP nhận POST tại ZALO_WEBHOOK_PATH. ZALO_MODE=polling: tự gọi getUpdates.
import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './core/config.js';
import { openStore } from './core/store.js';
import { createChannel } from './channels/zalo-bot.js';
import { batDauPolling } from './channels/zalo-polling.js';
import { createMcpClient } from './core/mcp.js';
import { loadPacks, createRegistry } from './core/registry.js';
import { createGate } from './core/gate.js';
import { createEngine } from './core/engine.js';
import { createOps } from './core/ops.js';
import { createWebhookHandler } from './core/webhook.js';
import { createQueue } from './core/queue.js';
import { availablePackages } from './packs/hs/packages.js';
import { createVision } from './packs/hs/vision.js';
import { createBrain } from './packs/hs/brain.js';
import { createEditor } from './packs/hs/editor.js';
import { createLlm2 } from './packs/hs/llm2.js';
import { createMissLog } from './packs/hs/miss-log.js';

const env = process.env;
const DEBUG = /^(1|true|yes)$/i.test(env.DEBUG || '');
const STARTED_AT = new Date(), VERSION = env.APP_VERSION || env.SOURCE_COMMIT || '';
const now = () => new Date();

let config;
try {
  config = loadConfig(env);
} catch (e) {
  console.error(`[bot] cấu hình lỗi: ${e.message}`);
  process.exit(1);
}

// store + kênh + Cổng OZ
mkdirSync(config.dataDir, { recursive: true });
const store = openStore(join(config.dataDir, 'bot.db'));
const baseUrl = env.ZALO_API_BASE || undefined;
const channel = createChannel({ token: config.zaloToken, baseUrl, secret: config.webhookSecret });
const mcp = createMcpClient({ url: config.mcpUrl, token: config.mcpToken, authHeader: config.mcpAuthHeader });

// não / biên tập / đọc ảnh / sổ trượt từ (giữ nguyên hành vi server cũ)
const duPhong = createLlm2({ baseUrl: env.LLM2_BASE_URL || '', apiKey: env.LLM2_API_KEY || '', model: env.LLM2_MODEL || '', timeoutMs: Number(env.LLM2_TIMEOUT_MS) || undefined });
const uuTien = /^llm2$/i.test((env.LLM_CHINH || '').trim()) && duPhong ? 'llm2' : 'gemini';
const brain = createBrain({ apiKey: config.geminiKey, model: env.GEMINI_BRAIN_MODEL || undefined, duPhong, uuTien, off: /^(0|false|no|off)$/i.test(env.GEMINI_BRAIN || '') });
const editor = createEditor({ apiKey: config.geminiKey, model: env.GEMINI_EDITOR_MODEL || undefined, duPhong, uuTien, off: /^(0|false|no|off)$/i.test(env.GEMINI_EDITOR || '') });
const vision = createVision({ apiKey: config.geminiKey, model: env.GEMINI_MODEL || config.geminiModel });
const missLog = /^(off|0|false)$/i.test(env.TRUOT_DIR || '') ? null : createMissLog({ thuMuc: env.TRUOT_DIR || 'du-lieu-truot' });

// tên bot: lấy từ getMe TRƯỚC khi tạo engine (engine chép mảng lúc khởi tạo)
const botNames = [...config.botNames];
try {
  const me = await channel.getMe();
  for (const n of [me?.display_name, me?.account_name, me?.name]) if (n && !botNames.includes(n)) botNames.push(n);
  console.log(`[bot] đăng nhập: ${me?.display_name || me?.account_name || 'ok'}`);
} catch (e) { console.error('[bot] getMe lỗi — kiểm tra ZALO_BOT_TOKEN:', e.message); }

// cửa gửi duy nhất (Điều I)
const gate = createGate({
  store, channel,
  rules: { capChatDay: config.capChatDay, capGroupDay: config.capGroupDay, capAllDay: config.capAllDay,
    similarity: 0.8, directReplyMs: 600_000, quietHours: true, bannedPatterns: config.bannedPatterns },
  now,
  // T024 chưa làm hệ thống phiếu/cảnh báo cho nhân viên: tạm ghi log (kèm chat/conv + lý do).
  onAlert: (chatId, reason) => console.warn(`[canh-bao] chat=${chatId} lý do=${reason}`),
  onTicket: (convId, reason) => console.warn(`[phieu] conv=${convId} lý do=${reason}`),
  log: (...a) => console.error('[gate]', ...a),
});

// engine: một lượt (inbox → gói → cửa → audit); gói nạp theo đường dẫn tương đối tới TỆP MÃ NGUỒN (không phụ thuộc cwd)
const registry = createRegistry(await loadPacks(join(import.meta.dirname, 'packs')));
const goi = registry.available(null, { isStaff: true });
if (!goi.length) console.error('[bot] KHÔNG nạp được gói nào — kiểm tra thư mục packs/');
console.log(`[bot] đã nạp ${goi.length} gói: ${goi.map((p) => p.id).join(', ')}`);
const engine = createEngine({ config: { ...config, botNames }, store, channel, mcp, vision, brain, editor, registry, gate, now, log: console, missLog, onAlert: (chatId, reason) => console.warn(`[canh-bao] chat=${chatId} lý do=${reason}`) });
gate.recover(); engine.jobs.recover();   // hồi outbox 'queued' và jobs 'polling' của tiến trình cũ đã chết giữa chừng — Điều VII
// ops: /health và /metrics (T027) — chỉ đọc db và hỏi trạng thái ngoài, KHÔNG gửi tin.
const ops = createOps({ store, mcp, channel, config, startedAt: STARTED_AT, version: VERSION, now, log: console });
// HTTP: /health + webhook
// store + now: handler ghi inbox (pending) TRƯỚC khi trả 200, lỗi db thì 503 để Zalo gửi lại (T018, Điều VII).
// queue: một lượt mỗi người (khoá = convId) — không để hai tin của cùng người chạy chồng (T019).
const queue = createQueue();
const server = http.createServer(createWebhookHandler({
  config, channel, engine, store, now,
  runTask: (key, fn) => queue.run(key, fn),
  health: () => ops.health(),
  metrics: (sinceIso) => ops.metrics(sinceIso),
  debug: DEBUG,
  log: console,
}));
// bộ quét nền: drain() hỏi việc nền + quét outbox (đã có cờ chống chạy chồng trong engine/gate)
setInterval(() => { engine.drain().catch((e) => console.error('[quet]', e.message)); }, 5000);

server.listen(config.port, '0.0.0.0', async () => {
  console.log(`[bot] chế độ ${config.mode}, cổng ${config.port}${config.mode === 'webhook' ? `, đường dẫn ${config.webhookPath}` : ''}`);
  if (config.mode === 'webhook' && config.webhookSecret.length < 8) console.error('[bot] ZALO_WEBHOOK_SECRET phải dài 8–256 ký tự');
  try {
    const t = await engine.tools();
    if (t) {
      console.log(`[mcp] Cổng OZ có ${t.size} công cụ; gói khả dụng: ${availablePackages(t).map((p) => p.so).join(', ')}`);
      console.log(`[bot] đọc ảnh: ${vision ? 'BẬT (Gemini)' : 'tắt (chưa có GEMINI_API_KEY)'}`);
      console.log(`[bot] não hiểu câu hỏi (chế độ Tự động): ${brain ? `BẬT (${env.GEMINI_BRAIN_MODEL || 'gemini-flash-lite-latest'})` : 'tắt'} · não biên tập kết quả: ${editor ? `BẬT (${env.GEMINI_EDITOR_MODEL || 'gemini-flash-latest'})` : 'tắt'}`);
      console.log(`[bot] khoá llm2: ${duPhong ? `BẬT (${duPhong.model})` : 'tắt (chưa đủ LLM2_BASE_URL / LLM2_API_KEY / LLM2_MODEL)'}`);
    } else {
      console.error('[mcp] chưa kết nối được Cổng OZ — kiểm tra OZ_MCP_URL / OZ_MCP_TOKEN (bot vẫn chạy, sẽ thử lại khi có tin)');
    }
  } catch (e) { console.error('[mcp]', e.message); }
  if (config.mode === 'polling') {
    const g = await batDauPolling({ token: config.zaloToken, baseUrl, engine, env, debug: DEBUG });
    if (!g.ok) process.exit(1);
  }
});
