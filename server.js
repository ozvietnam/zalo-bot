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
import { createHandoff } from './core/handoff.js';
import { createEngine } from './core/engine.js';
import { createOps } from './core/ops.js';
import { createBackup } from './core/backup.js';
import { createDigestScanner } from './core/digest-scan.js';
import { createWebhookHandler } from './core/webhook.js';
import { createQueue } from './core/queue.js';
import { redact } from './core/redact.js';
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

// cửa gửi duy nhất (Điều I). Cửa và phiếu tham chiếu nhau (cửa báo phiếu qua `onTicket`, phiếu là tin ra nên qua cửa)
// nên `handoff` dựng sau, callback đọc biến lúc chạy. onAlert (leak, trần cả bot) chưa có đường vào nhóm nhân viên.
let handoff;
const canhBao = (chatId, reason) => console.warn(`[canh-bao] chat=…${String(chatId).slice(-4)} lý do=${reason}`);   // Điều IX
const gate = createGate({
  store, channel, now,
  rules: { capChatDay: config.capChatDay, capGroupDay: config.capGroupDay, capAllDay: config.capAllDay,
    similarity: 0.8, directReplyMs: 600_000, quietHours: true, bannedPatterns: config.bannedPatterns },
  onAlert: canhBao,
  onTicket: (convId, reason) => handoff.open(convId, reason).catch((e) => console.error('[phieu]', `conv=…${String(convId).slice(-4)}`, e.message)),
  log: (...a) => console.error('[gate]', ...a),
});
// phiếu + trạng thái phòng (T022, T024): MỘT bản dùng chung cho cửa (onTicket) và engine (T026) — cờ chống gộp trùng nằm trong bộ nhớ.
handoff = createHandoff({ store, gate, config, now, log: (...a) => console.error('[handoff]', ...a) });
// engine: một lượt (inbox → gói → cửa → audit); gói nạp theo đường dẫn tương đối tới TỆP MÃ NGUỒN (không phụ thuộc cwd)
const registry = createRegistry(await loadPacks(join(import.meta.dirname, 'packs')));
const goi = registry.available(null, { isStaff: true });
if (!goi.length) console.error('[bot] KHÔNG nạp được gói nào — kiểm tra thư mục packs/');
console.log(`[bot] đã nạp ${goi.length} gói: ${goi.map((p) => p.id).join(', ')}`);
const queue = createQueue();   // một lượt mỗi người (khoá = convId): hai tin của cùng người không chạy chồng (T019)
const engine = createEngine({ config: { ...config, botNames }, store, channel, mcp, vision, brain, editor, registry, gate, handoff, now, log: console, missLog, onAlert: canhBao, runTask: (key, fn) => queue.run(key, fn) });
// Khôi phục khi khởi động (T020, Điều VII), đúng thứ tự contracts/send-gate.md:52: outbox → jobs → inbox; bước inbox không chặn server.listen.
gate.recover(); engine.jobs.recover();
engine.recover().catch((e) => console.error('[bot] recover lỗi:', redact(e?.message)));
const ops = createOps({ store, mcp, channel, config, startedAt: STARTED_AT, version: VERSION, now, log: console, gate });
// HTTP (/health, /metrics, webhook): handler ghi inbox (pending) TRƯỚC khi trả 200, lỗi db thì 503 để Zalo gửi lại (T018, Điều VII).
const server = http.createServer(createWebhookHandler({
  config, channel, engine, store, now,
  runTask: (key, fn) => queue.run(key, fn),
  health: () => ops.health(),
  metrics: (sinceIso) => ops.metrics(sinceIso),
  debug: DEBUG,
  log: console,
}));
// sao lưu db 03:00 giờ VN (T036, FR-028): `run()` tự bỏ qua ngoài giờ đó và khi hôm nay đã sao, nên đi chung bộ quét 5 giây thay vì thêm một đồng hồ riêng.
const backup = createBackup({ store, dataDir: config.dataDir, now, log: (...a) => console.log('[sao-luu]', ...a) });
const digestScan = createDigestScanner({ gate, config, dataDir: config.dataDir });
// quét nền 5 giây: bản tin T028 TRƯỚC drain() (chặn bản tin cũ); drain() = việc nền + outbox + đẩy tin gộp vào phiếu (T024, T026).
const loi = (tag) => (e) => console.error(tag, e.message);
setInterval(() => { ops.digest().catch(loi('[ban-tin]')); engine.drain().catch(loi('[quet]')); backup.run().catch(loi('[sao-luu]')); digestScan.scan().catch(loi('[digest-scan]')); }, 5000);

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
