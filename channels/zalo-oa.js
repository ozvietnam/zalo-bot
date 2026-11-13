// channels/zalo-oa.js — kênh Zalo Official Account OpenAPI v3, theo contracts/channel.md.
// Tuân thủ Điều I (Một cửa gửi), Điều VI (< 280 dòng, 0 dependency ngoài), Điều IX (Bí mật).
import { createHash } from 'node:crypto';
import { plain, balanceTags } from '../packs/hs/style.js';

export const ZALO_OA_MAX_TEXT = 2000;
// Hạn giờ gửi tin mặc định (OZV-763). Xem ghi chú ở `channels/messenger.js`:
// `sendText` nằm trong khoá hàng đợi theo hội thoại, treo vô hạn = bot im hẳn với khách đó.
export const ZALO_OA_SEND_TIMEOUT_MS = 15_000;
const DEFAULT_BASE = 'https://openapi.zalo.me/v3.0/oa';

/** So sánh bí mật theo thời gian hằng, tránh tấn công timing. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length || x.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Lấy header không phân biệt chữ hoa/thường. */
function getHeader(headers, name) {
  if (!headers || typeof headers !== 'object') return undefined;
  const target = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === target) return headers[k];
  }
  return undefined;
}

/** Xoá token khỏi chuỗi lỗi (Điều IX). */
function cheToken(msg, token) {
  if (!token || typeof msg !== 'string') return msg ?? '';
  return msg.split(token).join('[REDACTED]');
}

/** JSON sắp xếp khoá để tạo updateKey sha1 ổn định. */
export function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : stableJson(x))).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/**
 * Phân tích webhook payload của Zalo OA thành Update chuẩn hoá.
 * Nhận diện tin khách gửi (isEcho: false) và tin phản chiếu từ OA (isEcho: true).
 */
export function parse(raw, defaultAppId = null) {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw.result && typeof raw.result === 'object' && !Array.isArray(raw.result) ? raw.result : raw;
  const eventName = String(u.event_name || u.event || '');
  const isEcho = eventName.startsWith('oa_send_');

  let idStr = '';
  if (isEcho) {
    idStr = String(u.recipient?.id ?? u.recipient_id ?? '');
  } else if (eventName.startsWith('user_send_')) {
    idStr = String(u.sender?.id ?? u.user_id_by_app ?? u.from?.id ?? '');
  } else {
    idStr = String(u.sender?.id ?? u.recipient?.id ?? u.from?.id ?? u.chat?.id ?? '');
  }

  const chatId = idStr || null;
  if (!chatId) return null;
  const userId = chatId;

  let event = 'unknown';
  if (isEcho) {
    event = 'message.echo';
  } else if (eventName === 'user_send_text') {
    event = 'message.text.received';
  } else if (eventName === 'user_send_image') {
    event = 'message.image.received';
  } else if (eventName === 'user_send_audio' || eventName === 'user_send_voice') {
    event = 'message.voice.received';
  } else if (eventName === 'user_send_sticker') {
    event = 'message.sticker.received';
  } else if (eventName) {
    event = eventName;
  }

  const m = u.message || {};
  const text = typeof m.text === 'string' ? m.text : (typeof u.text === 'string' ? u.text : null);
  const photoUrl = m.photo_url || m.url || m.attachments?.[0]?.payload?.url || (Array.isArray(m.photo) ? m.photo.at(-1)?.url : null) || null;
  const voiceUrl = m.voice_url || m.voice?.url || ((eventName.includes('audio') || eventName.includes('voice')) ? (m.attachments?.[0]?.payload?.url || m.url || null) : null);
  const messageId = m.msg_id != null ? String(m.msg_id) : (m.message_id != null ? String(m.message_id) : null);
  const userName = u.sender?.display_name || u.sender?.name || null;
  const appId = u.app_id != null ? String(u.app_id) : (u.appId != null ? String(u.appId) : (defaultAppId != null ? String(defaultAppId) : null));
  const updateKey = messageId ?? createHash('sha1').update(stableJson(raw)).digest('hex');

  return {
    updateKey,
    event,
    chatId,
    userId,
    userName,
    chatType: 'PRIVATE',
    text,
    photoUrl,
    voiceUrl,
    caption: null,
    messageId,
    raw,
    isEcho,
    appId,
  };
}

/**
 * Adapter kênh Zalo Official Account (Zalo OA).
 * Hỗ trợ xác thực webhook (MAC SHA256 & secret token) và detectsHumanReplies: true.
 * `sendTimeoutMs`: hạn giờ cho lời gọi gửi tin (OZV-763). Khi nào nơi dựng kênh (hiện
 * `server.js` chỉ dựng `zalo-bot`) bật kênh này thì truyền `config.sendTimeoutMs`
 * (biến `SEND_TIMEOUT_MS`) vào — đừng nhúng số vào mã gọi.
 */
export function createChannel({
  oaToken,
  oaSecret,
  appId = null,
  baseUrl = DEFAULT_BASE,
  fetchImpl = fetch,
  sendTimeoutMs = ZALO_OA_SEND_TIMEOUT_MS,
} = {}) {
  const base = String(baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');

  return {
    name: 'zalo-oa',
    maxText: ZALO_OA_MAX_TEXT,
    parse: (raw) => parse(raw, appId),
    capabilities: { detectsHumanReplies: true },

    async sendText(chatId, text) {
      const url = `${base}/message/cs`;
      const cleanContent = plain(balanceTags(String(text ?? '')));
      const body = {
        recipient: { user_id: String(chatId) },
        message: { text: cleanContent },
      };

      let res;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: {
            access_token: String(oaToken ?? ''),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(sendTimeoutMs),
        });
      } catch (err) {
        // Quá hạn giờ hoặc lỗi mạng đều là lỗi TẠM: đánh dấu `tamThoi` để gate xử theo
        // lối đã có (cùng kiểu `packs/hs/vision.js`), không ném lỗi thô ra ngoài hàng đợi.
        const laQuaHan = err?.name === 'TimeoutError' || err?.name === 'AbortError';
        const desc = laQuaHan ? `quá ${sendTimeoutMs} ms không phản hồi` : String(err?.message ?? err);
        const error = new Error(`Zalo OA gửi tin lỗi mạng: ${cheToken(desc, oaToken)}`);
        error.status = Number(err?.status) || (laQuaHan ? 504 : 500);
        error.tamThoi = true;
        throw error;
      }

      let data = null;
      try { data = await res.json(); } catch { /* bỏ qua */ }

      if (!res.ok || (data?.error && Number(data.error) !== 0)) {
        const desc = data?.message || data?.description || `HTTP ${res.status}`;
        const error = new Error(`Zalo OA gửi tin lỗi: ${cheToken(desc, oaToken)}`);
        error.status = !res.ok ? res.status : (Number(data?.error) || 400);
        throw error;
      }
    },

    async typing(_chatId) {
      // Zalo OA OpenAPI không có API typing, nuốt lỗi an toàn
    },

    verifyWebhook(req) {
      try {
        if (!oaSecret || typeof oaSecret !== 'string') return false;
        if (!req || typeof req !== 'object') return false;

        // Chế độ 1: secret token (x-oa-secret-token hoặc x-bot-api-secret-token)
        const tokenHeader = getHeader(req.headers, 'x-oa-secret-token')
          ?? getHeader(req.headers, 'x-bot-api-secret-token');
        if (typeof tokenHeader === 'string' && safeEqual(tokenHeader, oaSecret)) {
          return true;
        }

        // Chế độ 2: chữ ký MAC SHA256 (x-zevent-signature)
        const sigHeader = getHeader(req.headers, 'x-zevent-signature');
        if (typeof sigHeader === 'string' && sigHeader.length > 0) {
          let sig = sigHeader.trim();
          if (sig.startsWith('mac=')) sig = sig.slice(4).trim();

          const timestamp = getHeader(req.headers, 'x-zevent-timestamp')
            ?? getHeader(req.headers, 'timestamp')
            ?? req.timestamp
            ?? req.body?.timestamp
            ?? '';

          const reqBodyAppId = req.body?.app_id ?? req.body?.appId;
          const targetAppId = appId ?? reqBodyAppId ?? '';

          let rawBody = '';
          if (req.rawBody != null) {
            rawBody = typeof req.rawBody === 'string' ? req.rawBody : req.rawBody.toString('utf8');
          } else if (typeof req.body === 'string') {
            rawBody = req.body;
          } else if (req.body && typeof req.body === 'object') {
            rawBody = JSON.stringify(req.body);
          }

          const dataToSign = `${targetAppId}${rawBody}${timestamp}${oaSecret}`;
          const expectedMac = createHash('sha256').update(dataToSign).digest('hex');
          return safeEqual(sig.toLowerCase(), expectedMac.toLowerCase());
        }

        return false;
      } catch {
        return false;
      }
    },
  };
}
