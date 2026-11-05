// server.js — chạy bot ở 1 trong 2 chế độ:
//   ZALO_MODE=webhook (mặc định): HTTP server nhận POST từ Zalo tại ZALO_WEBHOOK_PATH.
//   ZALO_MODE=polling: tự gọi getUpdates (chạy được trên máy không có tên miền công khai).
import http from 'node:http';
import { createZaloClient, safeEqual } from './lib/zalo.js';
import { createMcpClient } from './lib/mcp.js';
import { createBot } from './lib/bot.js';
import { availablePackages } from './lib/packages.js';
import { createVision } from './lib/vision.js';
import { createBrain } from './lib/brain.js';
import { createHealthPayload } from './core/health.js';

const env = process.env;
const MODE = (env.ZALO_MODE || 'webhook').toLowerCase();
const PORT = Number(env.PORT) || 3000;
const PATH = env.ZALO_WEBHOOK_PATH || '/webhook/zalo';
const SECRET = env.ZALO_WEBHOOK_SECRET || '';
const DEBUG = /^(1|true|yes)$/i.test(env.DEBUG || '');
// Thời điểm khởi động container + version: để xác minh production đã build lại với code mới.
const STARTED_AT = new Date();
const VERSION = env.APP_VERSION || env.SOURCE_COMMIT || '';

const zalo = createZaloClient({ token: env.ZALO_BOT_TOKEN, baseUrl: env.ZALO_API_BASE || undefined });
// Nguồn dữ liệu: Cổng OZ (MCP). Bot tự đọc danh sách công cụ, công cụ mới trên Cổng không cần sửa bot.
const mcp = createMcpClient({
  url: env.OZ_MCP_URL || 'https://mcp.uythacnhapkhau.com/mcp',
  token: env.OZ_MCP_TOKEN || '',
  authHeader: env.OZ_MCP_AUTH_HEADER || 'Authorization',
});
// Tên bot để bỏ "@Tên bot" khi được nhắc trong nhóm: lấy từ getMe, thêm tay qua BOT_NAMES nếu cần.
const botNames = (env.BOT_NAMES || '').split(',').map((s) => s.trim()).filter(Boolean);
// Não hiểu câu hỏi (Gemini function calling) cho chế độ Tự động: dùng chung khoá đọc ảnh; GEMINI_BRAIN=0 để tắt.
const brain = createBrain({ apiKey: env.GEMINI_API_KEY || '', model: env.GEMINI_BRAIN_MODEL || undefined,
  off: /^(0|false|no|off)$/i.test(env.GEMINI_BRAIN || '') });
const bot = createBot({
  zalo, mcp, botNames, brain,
  // Đọc thông số từ ảnh (Gemini, Google AI Studio). Để trống GEMINI_API_KEY = tắt.
  vision: createVision({ apiKey: env.GEMINI_API_KEY || '', model: env.GEMINI_MODEL || undefined }),
  rateLimitPerMin: Number(env.RATE_LIMIT_PER_MIN) || 10,
  allowUsers: (env.ALLOW_USERS || '').split(',').map((s) => s.trim()),
});

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    return json(res, 200, createHealthPayload({ mode: MODE, startedAt: STARTED_AT, version: VERSION }));
  }
  if (MODE !== 'webhook' || req.method !== 'POST' || req.url.split('?')[0] !== PATH) return json(res, 404, { ok: false });
  if (!SECRET || !safeEqual(req.headers['x-bot-api-secret-token'], SECRET)) return json(res, 403, { ok: false });

  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 1_000_000) req.destroy(); });
  req.on('end', () => {
    let payload;
    try { payload = JSON.parse(body || '{}'); } catch { return json(res, 400, { ok: false }); }
    // Trả 200 ngay để Zalo không gửi lại; xử lý (có thể mất vài chục giây với suggest) chạy nền.
    json(res, 200, { ok: true });
    if (DEBUG) console.log('[debug] webhook:', body.slice(0, 800));
    bot.handleUpdate(payload)
      .then((x) => { if (DEBUG || x?.skipped) console.log('[bot] kết quả:', JSON.stringify(x)); })
      .catch((e) => console.error('[webhook]', e.message));
  });
});

async function pollLoop() {
  try { await zalo.deleteWebhook(); } catch { /* chưa đặt webhook */ }
  console.log(`[polling] bắt đầu getUpdates${DEBUG ? ' (DEBUG bật)' : ''}`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MIN_GAP = Number(env.POLL_GAP_MS) || 1500;   // nghỉ tối thiểu giữa 2 lần getUpdates
  let backoff = 0;                                     // tăng dần khi bị 429 / lỗi
  for (;;) {
    const t0 = Date.now();
    try {
      const r = await zalo.getUpdates(30);
      const list = Array.isArray(r) ? r : r ? [r] : [];
      if (DEBUG) console.log(`[debug] getUpdates ${new Date().toLocaleTimeString()}:`, JSON.stringify(r ?? null).slice(0, 800));
      for (const u of list) bot.handleUpdate(u)
        .then((x) => { if (DEBUG || x?.skipped) console.log('[bot] kết quả:', JSON.stringify(x)); })
        .catch((e) => console.error('[polling]', e.message));
      if (backoff) console.log('[polling] kết nối lại bình thường');
      backoff = 0;
    } catch (e) {
      if (DEBUG) console.log(`[debug] getUpdates lỗi: ${e.name}: ${e.message}`);
      if (/timeout|408/i.test(e.message)) {
        backoff = 0;                                   // hết 30 s không có tin: bình thường
      } else {
        backoff = Math.min(backoff ? backoff * 2 : (e.status === 429 ? 10000 : 3000), 120000);
        console.error(`[polling] ${e.message} — thử lại sau ${Math.round(backoff / 1000)} s`);
      }
    }
    const wait = Math.max(backoff, MIN_GAP - (Date.now() - t0));
    if (wait > 0) await sleep(wait);
  }
}

server.listen(PORT, '0.0.0.0', async () => {
  try {
    const me = await zalo.getMe();
    for (const n of [me?.display_name, me?.account_name, me?.name]) if (n && !botNames.includes(n)) botNames.push(n);
    console.log(`[bot] đăng nhập: ${me?.display_name || me?.account_name || 'ok'}`);
  } catch (e) { console.error('[bot] getMe lỗi — kiểm tra ZALO_BOT_TOKEN:', e.message); }
  try {
    const t = await bot.tools();
    if (t) {
      console.log(`[mcp] Cổng OZ có ${t.size} công cụ; gói khả dụng: ${availablePackages(t).map((p) => p.so).join(', ')}`);
      console.log(`[bot] đọc ảnh: ${env.GEMINI_API_KEY ? 'BẬT (Gemini)' : 'tắt (chưa có GEMINI_API_KEY)'}`);
      console.log(`[bot] não hiểu câu hỏi (chế độ Tự động): ${brain ? `BẬT (${env.GEMINI_BRAIN_MODEL || 'gemini-flash-lite-latest'})` : 'tắt'}`);
    } else {
      console.error('[mcp] chưa kết nối được Cổng OZ — kiểm tra OZ_MCP_URL / OZ_MCP_TOKEN (bot vẫn chạy, sẽ thử lại khi có tin)');
    }
  } catch (e) { console.error('[mcp]', e.message); }
  console.log(`[bot] chế độ ${MODE}, cổng ${PORT}${MODE === 'webhook' ? `, đường dẫn ${PATH}` : ''}`);
  if (MODE === 'webhook' && SECRET.length < 8) console.error('[bot] ZALO_WEBHOOK_SECRET phải dài 8–256 ký tự');
  if (MODE === 'polling') pollLoop();
});
