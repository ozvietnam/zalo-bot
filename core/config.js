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
  const mode = str(env, 'ZALO_MODE', 'webhook').toLowerCase();
  if (!MODES.includes(mode)) throw new Error(`ZALO_MODE phải là ${MODES.join(' | ')} (nhận "${mode}")`);

  const voiceReplies = str(env, 'VOICE_REPLIES', 'summary').toLowerCase();
  if (!['off', 'summary', 'always'].includes(voiceReplies)) {
    throw new Error(`VOICE_REPLIES phải là off | summary | always (nhận "${voiceReplies}")`);
  }

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
    capGroupDay: int(env, 'CAP_GROUP_DAY', 200, 0),
    capAllDay: int(env, 'CAP_ALL_DAY', 300, 0),
    sessionTtlMs: int(env, 'SESSION_TTL_MS', 7_200_000, 1),
    // Khoảng lặng để phòng 'human' tự về 'bot' (Điều II). Biến riêng, KHÔNG dùng SESSION_TTL_MS: hết hạn
    // phiên hội thoại và nhường phòng cho người là hai việc khác nhau, vận hành chỉnh độc lập.
    humanIdleMs: int(env, 'HUMAN_IDLE_MS', 7_200_000, 1),
    hotline: str(env, 'HOTLINE', '0972 433 318'),
    bannedPatterns: Object.freeze(patterns(env, 'BANNED_PATTERNS')),
    botNames: Object.freeze(list(env, 'BOT_NAMES')),
    publicBaseUrl: str(env, 'PUBLIC_BASE_URL', 'https://zalo-bot.uythacnhapkhau.com'),
    voiceReplies,
    geminiTtsVoice: str(env, 'GEMINI_TTS_VOICE', 'Aoede'),
    geminiTtsPrompt: str(env, 'GEMINI_TTS_PROMPT', 'giọng nữ trẻ, miền Bắc, dịu dàng, ấm áp, lễ phép'),
    geminiTtsModel: str(env, 'GEMINI_TTS_MODEL', 'gemini-2.5-flash-preview-tts'),
    capVoiceDay: int(env, 'CAP_VOICE_DAY', 50, 0),
    // Hạn giờ khâu voice (OZV-709). Hai lời gọi này nằm TRONG khoá hàng đợi theo người:
    // treo không hạn giờ = khoá làn tin của khách đó vĩnh viễn, bot im hẳn.
    geminiTtsTimeoutMs: int(env, 'GEMINI_TTS_TIMEOUT_MS', 30_000, 1),
    ffmpegTimeoutMs: int(env, 'FFMPEG_TIMEOUT_MS', 20_000, 1),
    // Lượt phải đợi Cổng quá ngần này mili giây thì gửi câu "đang tra" (issue #168, mục ≤ 3 giây).
    dangTraSauMs: int(env, 'DANG_TRA_SAU_MS', 1500, 0),
    // Đã báo "đang tra" mà lượt vẫn chưa xong sau ngần này (tính từ đầu lượt) → một câu tạm
    // "Cổng đang bận" đúng giọng, không để khách im (OZV-496 lỗi 2; QA thật 12/11 im 120 giây). 0 = tắt.
    cauTamSauMs: int(env, 'CAU_TAM_SAU_MS', 120_000, 0),
  });
}
