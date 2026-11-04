// channels/zalo-bot.js — kênh Zalo Bot Platform API (bot.zapps.me), theo contracts/channel.md.
// Mọi phương thức: POST https://bot-api.zaloplatforms.com/bot<TOKEN>/<method>, body JSON.
// createZaloClient là đường cũ (lib/bot.js dùng) cho tới T016; code mới dùng createChannel.
import { createHash } from 'node:crypto';

export const ZALO_MAX_TEXT = 2000;

const DEFAULT_BASE = 'https://bot-api.zaloplatforms.com';

/** Kênh theo contract: không chia tin (cửa chia sẵn), không giữ trạng thái nghiệp vụ. */
export function createChannel({ token, baseUrl, fetchImpl, secret } = {}) {
  const client = createZaloClient({ token, baseUrl, fetchImpl });
  return {
    name: 'zalo-bot',
    maxText: ZALO_MAX_TEXT,
    parse,
    async sendText(chatId, text) { await client.call('sendMessage', { chat_id: chatId, text }); },
    async typing(chatId) { await client.sendChatAction(chatId, 'typing'); },
    getMe: () => client.getMe(),
    verifyWebhook(req) {
      const h = req?.headers?.['x-bot-api-secret-token'];
      if (!secret || typeof h !== 'string') return false;   // mảng (header lặp) hay số không được ép thành chuỗi
      return safeEqual(h, secret);
    },
    capabilities: { detectsHumanReplies: false },
  };
}

/** Update thô → Update có updateKey (message_id, không có thì sha1 của JSON đã sắp khoá). */
export function parse(raw) {
  const u = parseUpdate(raw);
  if (!u) return null;
  const updateKey = u.messageId ?? createHash('sha1').update(stableJson(raw)).digest('hex');
  return { updateKey, ...u, raw };
}

export function createZaloClient({ token, baseUrl = DEFAULT_BASE, fetchImpl = fetch } = {}) {
  if (!token) throw new Error('Thiếu ZALO_BOT_TOKEN');
  const base = `${baseUrl.replace(/\/$/, '')}/bot${token}`;

  async function call(method, body = {}, { timeoutMs = 40000 } = {}) {
    const res = await fetchImpl(`${base}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    let data = null;
    try { data = await res.json(); } catch { /* bỏ qua */ }
    if (!res.ok || (data && data.ok === false)) {
      // Không log token: chỉ nêu tên phương thức.
      const desc = data?.description || data?.message || `HTTP ${res.status}`;
      const err = new Error(`Zalo ${method} lỗi: ${desc}`);
      err.status = res.status;
      throw err;
    }
    return data?.result ?? data;
  }

  return {
    call,
    getMe: () => call('getMe'),
    getUpdates: (timeout = 30) => call('getUpdates', { timeout }, { timeoutMs: (timeout + 10) * 1000 }),
    sendChatAction: (chatId, action = 'typing') => call('sendChatAction', { chat_id: chatId, action }).catch(() => null),
    setWebhook: (url, secretToken) => call('setWebhook', { url, secret_token: secretToken }),
    deleteWebhook: () => call('deleteWebhook'),
    getWebhookInfo: () => call('getWebhookInfo'),
    async sendText(chatId, text) {
      const parts = splitText(text);
      for (const part of parts) await call('sendMessage', { chat_id: chatId, text: part });
      return parts.length;
    },
  };
}

/** Chia văn bản thành đoạn ≤ max ký tự, ưu tiên cắt ở dòng trống rồi xuống dòng. */
export function splitText(text, max = ZALO_MAX_TEXT) {
  const s = String(text ?? '').trim();
  if (!s) return [];
  if (s.length <= max) return [s];
  const out = [];
  let rest = s;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n\n', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * Chuẩn hoá một update (webhook hoặc getUpdates) thành { event, chatId, userId, text, messageId }.
 * Payload webhook dạng { ok, result: { event_name, message } }; getUpdates trả result là 1 update hoặc mảng.
 */
export function parseUpdate(raw) {
  const u = raw?.result && !Array.isArray(raw.result) ? raw.result : raw;
  if (!u || typeof u !== 'object') return null;
  const m = u.message || {};
  const chatId = m.chat?.id ?? m.chat_id ?? m.from?.id ?? null;
  return {
    event: u.event_name || (m.text ? 'message.text.received' : 'unknown'),
    chatId: chatId == null ? null : String(chatId),
    userId: m.from?.id == null ? null : String(m.from.id),
    userName: m.from?.display_name || m.from?.name || null,
    chatType: m.chat?.chat_type || m.chat?.type || null,
    text: typeof m.text === 'string' ? m.text : null,
    photoUrl: m.photo_url || m.photo?.url || (Array.isArray(m.photo) ? m.photo.at(-1)?.url : null) || null,
    caption: typeof m.caption === 'string' ? m.caption : null,
    messageId: m.message_id == null ? null : String(m.message_id),
  };
}

/** JSON với khoá object đã sắp xếp: cùng nội dung, khác thứ tự khoá → cùng chuỗi (cho updateKey). */
export function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : stableJson(x))).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** So sánh secret theo thời gian hằng. */
export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  if (x.length !== y.length || x.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
