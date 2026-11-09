// core/webhook.js — handler HTTP: /health + nhận POST webhook Zalo (tách khỏi server.js, T018).
// Tệp này KHÔNG gửi tin ra khách (Hiến pháp Điều I): chỉ nhận HTTP, bền hoá vào inbox rồi giao engine.
// Thứ tự BẮT BUỘC (Điều VII "sai thì dừng", plan.md "Luồng một lượt"):
//   verifyWebhook → parse → inbox.insertIgnore (pending) → 200 (hoặc 503 nếu db lỗi) → runTask(convId, engine.process).
// Ack trước khi ghi là mất tin: Zalo đã nhận 200 nên không gửi lại, mà tiến trình có thể chết ở khe hở đó.
// `health` là hàm trả payload /health (bất đồng bộ: có mốc chặn khi hỏi Cổng OZ/Zalo);
// `metrics` là hàm trả số liệu vận hành (đồng bộ). Cả hai do server.js nối từ core/ops.js.
import { existsSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { convIdOf } from './conv.js';
import { isGroup } from './mention.js';
import { redact } from './redact.js';

const MAX_BODY = 1_000_000;   // 1 MB tính theo BYTE (không theo ký tự: 1 ký tự tiếng Việt là 2-3 byte)

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

/**
 * @param {object} o
 * @param {()=>Promise<object>} o.health  BẮT BUỘC — trả payload /health (bất đồng bộ).
 *   Thiếu hàm hoặc hàm ném lỗi → 500 `{ok:false}` + `log.error` (không lộ lỗi gốc ra ngoài).
 * @param {(sinceIso?:string)=>object} [o.metrics]  payload /metrics; mặc định null → GET /metrics trả 404.
 *   `sinceIso` là chuỗi ISO (chuẩn hoá từ `?since=`); bỏ trống → không truyền tham số (mặc định = lúc khởi động).
 * @param {(key:string, fn:()=>Promise<any>)=>Promise<any>} [o.runTask]  mặc định chạy thẳng;
 *   `server.js` truyền `runTask: (key, fn) => queue.run(key, fn)` (T019 — hàng đợi tuần tự theo convId).
 */
export function createWebhookHandler({ config, channel, channels, engine, store, health, metrics = null, now = () => new Date(), runTask = (key, fn) => fn(), debug = false, log = console } = {}) {
  // Lỗi không lường được ở BẤT KỲ đâu trong handler: log rồi 500. Không để lọt ra ngoài thành
  // uncaughtException — một request hỏng là đủ giết bot. Request đã trả phản hồi thì chỉ log
  // (ghi header lần hai sẽ ném tiếp).
  const loi500 = (res, e) => {
    log.error('[webhook] lỗi không lường được:', redact(e?.message));
    if (!res.headersSent) json(res, 500, { ok: false });
    else try { res.end(); } catch { /* socket đã đứt: không còn gì làm được */ }
  };

  const channelMap = new Map();
  if (channels instanceof Map) {
    for (const [k, v] of channels.entries()) channelMap.set(k, v);
  } else if (channels && typeof channels === 'object') {
    for (const [k, v] of Object.entries(channels)) channelMap.set(k, v);
  }
  if (channel) {
    channelMap.set(channel.name || 'zalo-bot', channel);
  }

  function findChannel(path) {
    if (path === '/webhook/messenger' && channelMap.has('messenger')) return channelMap.get('messenger');
    if (path === '/webhook/zalo-oa' && channelMap.has('zalo-oa')) return channelMap.get('zalo-oa');
    if (path === '/webhook/zalo-bot' && channelMap.has('zalo-bot')) return channelMap.get('zalo-bot');
    if (path === config?.webhookPath) return channel || channelMap.get('zalo-bot') || channelMap.values().next().value;
    return null;
  }

  return (req, res) => {
    try {
      const duongDan = req.url.split('?')[0];
      if (req.method === 'GET' && (duongDan === '/health' || duongDan === '/')) {
        // health() nay BẤT ĐỒNG BỘ (có mốc chặn khi hỏi Cổng OZ/Zalo) → phải await.
        // Lỗi của nó → 500 (giữ hành vi cũ); ok=false → 503 kèm chính payload đó.
        return Promise.resolve()
          .then(() => health())
          .then((h) => json(res, h?.ok === false ? 503 : 200, h))
          .catch((e) => loi500(res, e));
      }
      if (req.method === 'GET' && duongDan === '/metrics') {
        if (!metrics) return json(res, 404, { ok: false });
        // `?since=<ISO>`: lọc số liệu từ mốc đó. Sai định dạng là lỗi THAM SỐ của người gọi → 400, không phải 500.
        const thamSo = new URLSearchParams(req.url.split('?')[1] ?? '');
        const raw = (thamSo.get('since') ?? '').trim();
        if (!raw) {
          return Promise.resolve()
            .then(() => metrics())
            .then((m) => json(res, 200, m))
            .catch((e) => loi500(res, e));
        }
        const t = Date.parse(raw);
        if (Number.isNaN(t)) {
          log.warn?.('[webhook] /metrics: tham số "since" sai định dạng ISO — bỏ qua');
          return json(res, 400, { ok: false });
        }
        return Promise.resolve()
          .then(() => metrics(new Date(t).toISOString()))
          .then((m) => json(res, 200, m))
          .catch((e) => loi500(res, e));
      }
      if (req.method === 'GET' && duongDan.startsWith('/am-thanh/')) {
        const m = duongDan.match(/^\/am-thanh\/([a-f0-9]{32,64})\.aac$/i);
        if (!m) return json(res, 404, { ok: false });
        const hash = m[1].toLowerCase();
        const amThanhDir = join(config?.dataDir || './data', 'am-thanh');
        const filePath = join(amThanhDir, `${hash}.aac`);
        if (!existsSync(filePath)) return json(res, 404, { ok: false });
        res.writeHead(200, { 'Content-Type': 'audio/aac' });
        createReadStream(filePath).pipe(res);
        return;
      }

      const targetChannel = findChannel(duongDan);

      // GET challenge (Meta Webhook)
      if (req.method === 'GET' && targetChannel && typeof targetChannel.verifyChallenge === 'function') {
        const c = targetChannel.verifyChallenge(req);
        if (c?.ok) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(String(c.challenge ?? ''));
          return;
        }
        return json(res, 403, { ok: false });
      }

      if (config.mode !== 'webhook' || req.method !== 'POST' || !targetChannel) return json(res, 404, { ok: false });

      // Gom các gói thành mảng Buffer rồi decode MỘT LẦN ở 'end': `body += c` ép từng gói sang
      // chuỗi riêng, nên ký tự nhiều byte (tiếng Việt) bị cắt ở ranh giới gói TCP thành U+FFFD —
      // hỏng cả inbox.raw đã bền hoá. Giới hạn đếm theo byte (c.length) mới đúng nghĩa "1 MB".
      const phan = [];
      let soByte = 0;
      req.on('data', (c) => { phan.push(c); soByte += c.length; if (soByte > MAX_BODY) req.destroy(); });
      req.on('end', () => {
        try {
          const rawBuf = Buffer.concat(phan);
          req.rawBody = rawBuf;
          const body = rawBuf.toString('utf8');
          req.body = body;

          if (!targetChannel.verifyWebhook(req)) return json(res, 403, { ok: false });

          let payload;
          try { payload = JSON.parse(body || '{}'); } catch { return json(res, 400, { ok: false }); }
          if (debug) log.log('[debug] webhook:', body.slice(0, 800));

          let updates = [];
          if (typeof targetChannel.parseAll === 'function') {
            try { updates = targetChannel.parseAll(payload); } catch { updates = []; }
          } else if (typeof targetChannel.parse === 'function') {
            try {
              const u = targetChannel.parse(payload);
              if (u) updates = [u];
            } catch { updates = []; }
          }
          if (!Array.isArray(updates)) updates = [];
          for (const u of updates) {
            if (u && !u.channel) u.channel = targetChannel.name;
          }

          const valid = updates.filter((u) => u && u.chatId);
          // Update bot không hiểu được (hay thiếu chatId — cột chat_id là NOT NULL): ack 200 và thôi.
          // Gửi lại cũng vẫn không hiểu, nên 503 chỉ làm Zalo thử mãi.
          // Nhưng phải để lại dấu vết: Zalo đổi định dạng payload mà bot ack mọi thứ rồi im lặng
          // thì không ai biết. Chỉ in các khoá cấp cao, KHÔNG in body (có nội dung tin khách, Điều IX).
          if (valid.length === 0) {
            const khoa = payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 10).join(',') : typeof payload;
            log.warn?.('[webhook] update không parse được / thiếu chatId, đã ack 200 và bỏ qua; khoá cấp cao:',
              redact(khoa).slice(0, 120));
            return json(res, 200, { ok: true });
          }

          const moiList = [];
          for (const u of valid) {
            let moi;
            try {
              moi = store.inbox.insertIgnore({
                update_key: u.updateKey, chat_id: u.chatId, user_id: u.userId ?? null,
                raw: JSON.stringify(u.raw ?? payload), received_at: now().toISOString(),
              });
            } catch (e) {
              log.error('[webhook] không ghi được inbox:', redact(e?.message));
              return json(res, 503, { ok: false });   // chưa bền hoá thì KHÔNG ack: để gửi lại
            }
            if (moi) moiList.push(u);
          }
          json(res, 200, { ok: true });   // đã bền hoá (pending) mới ack

          for (const u of moiList) {
            const key = convIdOf({ chatId: u.chatId, userId: u.userId, isGroup: isGroup(u), channel: u.channel });
            Promise.resolve().then(() => runTask(key, () => engine.process(u)))
              .then((x) => { if (debug || x?.skipped) log.log('[bot] kết quả:', JSON.stringify(x)); })
              .catch((e) => log.error('[webhook]', redact(e?.message)));
          }
        } catch (e) { loi500(res, e); }
      });
    } catch (e) { loi500(res, e); }
  };
}
