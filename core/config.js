// Cấu hình có kiểm tra, đóng băng. Lỗi nêu rõ tên biến để người vận hành sửa nhanh.

const MODES = ['webhook', 'polling'];

const str = (env, k, def = '') => {
  const v = env[k];
  return v === undefined || String(v).trim() === '' ? def : String(v).trim();
};

function int(env, k, def, min = 0) {
  const raw = str(env, k, '');
  if (raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) throw new Error(`${k} phải là số nguyên >= ${min} (nhận "${raw}")`);
  return n;
}

const list = (env, k, sep = ',') =>
  str(env, k).split(sep).map((s) => s.trim()).filter(Boolean);

/** 0985 559 918 | +84985559918 | 84985559918 -> 0985559918 */
function normPhone(p) {
  let d = String(p).replace(/\D/g, '');
  if (d.startsWith('84') && d.length === 11) d = '0' + d.slice(2);
  return d;
}

function patterns(env, k) {
  return list(env, k, ';').map((src) => {
    try { return new RegExp(src, 'i'); } catch (e) { throw new Error(`${k}: mẫu regex không hợp lệ "${src}" (${e.message})`); }
  });
}

export function loadConfig(env = process.env) {
  const zaloToken = str(env, 'ZALO_BOT_TOKEN');
  if (!zaloToken) throw new Error('ZALO_BOT_TOKEN là bắt buộc');
  const mode = str(env, 'ZALO_MODE', 'webhook');
  if (!MODES.includes(mode)) throw new Error(`ZALO_MODE phải là ${MODES.join(' | ')} (nhận "${mode}")`);

  return Object.freeze({
    zaloToken,
    mode,
    port: int(env, 'PORT', 3010, 1),
    webhookPath: str(env, 'ZALO_WEBHOOK_PATH', '/webhook/zalo'),
    webhookSecret: str(env, 'ZALO_WEBHOOK_SECRET'),
    mcpUrl: str(env, 'OZ_MCP_URL', 'https://mcp.uythacnhapkhau.com/mcp'),
    mcpToken: str(env, 'OZ_MCP_TOKEN'),
    mcpAuthHeader: str(env, 'OZ_MCP_AUTH_HEADER', 'Authorization'),
    geminiKey: str(env, 'GEMINI_API_KEY'),
    geminiModel: str(env, 'GEMINI_MODEL', 'gemini-flash-latest'),
    rateLimitPerMin: int(env, 'RATE_LIMIT_PER_MIN', 10, 1),
    allowUsers: new Set(list(env, 'ALLOW_USERS')),
    staffUsers: new Set(list(env, 'STAFF_USERS')),
    staffChatId: str(env, 'STAFF_CHAT_ID'),
    dataDir: str(env, 'DATA_DIR', './data'),
    companyPhones: new Set(list(env, 'COMPANY_PHONES').map(normPhone).filter(Boolean)),
    capChatDay: int(env, 'CAP_CHAT_DAY', 8, 0),
    capAllDay: int(env, 'CAP_ALL_DAY', 300, 0),
    sessionTtlMs: int(env, 'SESSION_TTL_MS', 1_800_000, 1),
    bannedPatterns: Object.freeze(patterns(env, 'BANNED_PATTERNS')),
    botNames: Object.freeze(list(env, 'BOT_NAMES')),
  });
}
