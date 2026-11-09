// channels/messenger.js — adapter kênh Facebook Fanpage Messenger, tuân thủ contracts/channel.md.
// Gửi nhận tin qua Meta Graph API Send API (v21.0).
import { createHash, createHmac } from 'node:crypto';
import { plain, balanceTags } from '../packs/hs/style.js';

export const MESSENGER_MAX_TEXT = 2000;
const DEFAULT_BASE = 'https://graph.facebook.com/v21.0';

/** So sánh hai chuỗi theo thời gian hằng để chống tấn công timing. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length || x.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Chuẩn hóa một sự kiện messaging thô thành Update chuẩn của hệ thống. */
function parseEvent(ev) {
  if (!ev || typeof ev !== 'object') return null;
  const msg = ev.message;
  const unsend = ev.message_unsend;
  if (!msg && !unsend) return null;

  const isEcho = Boolean(msg?.is_echo);
  const senderId = ev.sender?.id != null ? String(ev.sender.id) : null;
  const recipientId = ev.recipient?.id != null ? String(ev.recipient.id) : null;
  const chatId = isEcho ? recipientId : senderId;
  const userId = isEcho ? recipientId : senderId;

  let event = 'unknown';
  let text = typeof msg?.text === 'string' ? msg.text : null;
  let photoUrl = null;
  let voiceUrl = null;

  if (unsend) {
    event = 'message.unsend';
  } else if (isEcho) {
    event = 'message.echo';
  }

  if (msg && !unsend) {
    const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
    for (const att of attachments) {
      const type = att?.type;
      const payload = att?.payload || {};
      if (type === 'image') {
        if (payload.sticker_id != null) {
          if (text == null) text = '[nhãn dán]';
        } else {
          if (!photoUrl && payload.url) photoUrl = payload.url;
        }
      } else if (type === 'audio') {
        if (!voiceUrl && payload.url) voiceUrl = payload.url;
        if (text == null) text = '[thoại]';
      } else if (type === 'location') {
        if (text == null) text = '[vị trí]';
      } else if (type === 'sticker') {
        if (text == null) text = '[nhãn dán]';
      } else {
        if (text == null && type) text = `[${type}]`;
      }
    }

    if (!isEcho) {
      if (voiceUrl) {
        event = 'message.voice.received';
      } else if (photoUrl) {
        event = 'message.photo.received';
      } else if (text != null) {
        event = 'message.text.received';
      }
    }
  }

  const messageId = msg?.mid != null ? String(msg.mid) : (unsend?.mid != null ? String(unsend.mid) : null);
  const appId = msg?.app_id != null ? String(msg.app_id) : null;
  const updateKey = messageId ?? createHash('sha1').update(JSON.stringify(ev)).digest('hex');

  return {
    updateKey,
    event,
    chatId,
    userId,
    userName: null,
    chatType: 'PRIVATE',
    text,
    photoUrl,
    voiceUrl,
    caption: null,
    messageId,
    raw: ev,
    isEcho,
    appId,
  };
}

/** Phân tích toàn bộ các messaging event trong payload Meta Webhook. */
export function parseAll(raw) {
  if (!raw || typeof raw !== 'object') return [];
  const events = [];
  if (Array.isArray(raw.entry)) {
    for (const entry of raw.entry) {
      if (Array.isArray(entry?.messaging)) {
        for (const ev of entry.messaging) events.push(ev);
      }
    }
  } else if (Array.isArray(raw.messaging)) {
    for (const ev of raw.messaging) events.push(ev);
  } else if (raw.sender && (raw.message || raw.message_unsend)) {
    events.push(raw);
  }

  const list = [];
  for (const ev of events) {
    const u = parseEvent(ev);
    if (u) list.push(u);
  }
  return list;
}

/** Phân tích sự kiện đầu tiên trong payload Meta Webhook. */
export function parse(raw) {
  const list = parseAll(raw);
  return list.length > 0 ? list[0] : null;
}

/** Khởi tạo adapter kênh Messenger theo hợp đồng channel.md. */
export function createChannel({
  pageToken,
  appSecret,
  verifyToken,
  baseUrl = DEFAULT_BASE,
  fetchImpl = fetch,
} = {}) {
  const cleanBase = baseUrl.replace(/\/$/, '');

  function verifyChallenge(req) {
    if (!req?.url) return { ok: false };
    try {
      const u = new URL(req.url, 'http://localhost');
      const mode = u.searchParams.get('hub.mode');
      const token = u.searchParams.get('hub.verify_token');
      const challenge = u.searchParams.get('hub.challenge');
      if (mode === 'subscribe' && verifyToken && safeEqual(token, verifyToken)) {
        return { ok: true, challenge: String(challenge ?? '') };
      }
    } catch {
      // Bỏ qua lỗi URL không hợp lệ
    }
    return { ok: false };
  }

  function verifyWebhook(req) {
    if (!appSecret || typeof appSecret !== 'string') return false;
    const header = req?.headers?.['x-hub-signature-256'];
    if (typeof header !== 'string') return false;
    const raw = req?.rawBody ?? req?.body ?? '';
    if (!Buffer.isBuffer(raw) && typeof raw !== 'string') return false;
    try {
      const hmac = 'sha256=' + createHmac('sha256', appSecret).update(raw).digest('hex');
      return safeEqual(header, hmac);
    } catch {
      return false;
    }
  }

  async function typing(chatId) {
    try {
      await fetchImpl(`${cleanBase}/me/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${pageToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: String(chatId) },
          sender_action: 'typing_on',
        }),
      });
    } catch {
      // Nuốt lỗi mạng / API khi bật hiệu ứng đang gõ
    }
  }

  return {
    name: 'messenger',
    maxText: MESSENGER_MAX_TEXT,
    parse,
    parseAll,
    async sendText(chatId, text) {
      const clean = plain(balanceTags(String(text ?? '')));
      const res = await fetchImpl(`${cleanBase}/me/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${pageToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: String(chatId) },
          message: { text: clean },
          messaging_type: 'RESPONSE',
        }),
      });

      if (!res.ok) {
        let desc = `HTTP ${res.status}`;
        try {
          const raw = typeof res.text === 'function' ? await res.text() : '';
          try {
            const data = JSON.parse(raw);
            desc = data?.error?.message || data?.message || raw || desc;
          } catch {
            if (raw) desc = raw;
          }
        } catch {
          // Bỏ qua lỗi đọc response
        }
        if (pageToken && typeof desc === 'string') {
          desc = desc.replaceAll(pageToken, '[REDACTED]');
        }
        const err = new Error(`Messenger gửi tin lỗi: ${desc}`);
        err.status = res.status;
        throw err;
      }
    },
    typing,
    verifyWebhook,
    verifyChallenge,
    capabilities: { detectsHumanReplies: true },
  };
}
