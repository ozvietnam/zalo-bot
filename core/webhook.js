// core/webhook.js — handler HTTP: /health + nhận POST webhook Zalo (tách khỏi server.js, T018).
// Tệp này KHÔNG gửi tin ra khách (Hiến pháp Điều I): chỉ nhận HTTP, bền hoá vào inbox rồi giao engine.
// Thứ tự BẮT BUỘC (Điều VII "sai thì dừng", plan.md "Luồng một lượt"):
//   verifyWebhook → parse → inbox.insertIgnore (pending) → 200 (hoặc 503 nếu db lỗi) → runTask(convId, engine.process).
// Ack trước khi ghi là mất tin: Zalo đã nhận 200 nên không gửi lại, mà tiến trình có thể chết ở khe hở đó.
// `health` là hàm trả payload /health (bất đồng bộ: có mốc chặn khi hỏi Cổng OZ/Zalo);
// `metrics` là hàm trả số liệu vận hành (đồng bộ). Cả hai do server.js nối từ core/ops.js.
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
export function createWebhookHandler({ config, channel, engine, store, health, metrics = null, now = () => new Date(), runTask = (key, fn) => fn(), debug = false, log = console } = {}) {
  // Lỗi không lường được ở BẤT KỲ đâu trong handler: log rồi 500. Không để lọt ra ngoài thành
  // uncaughtException — một request hỏng là đủ giết bot. Request đã trả phản hồi thì chỉ log
  // (ghi header lần hai sẽ ném tiếp).
  const loi500 = (res, e) => {
    log.error('[webhook] lỗi không lường được:', redact(e?.message));
    if (!res.headersSent) json(res, 500, { ok: false });
    else try { res.end(); } catch { /* socket đã đứt: không còn gì làm được */ }
  };

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
      if (config.mode !== 'webhook' || req.method !== 'POST' || duongDan !== config.webhookPath) return json(res, 404, { ok: false });
      if (!channel.verifyWebhook(req)) return json(res, 403, { ok: false });
      // Gom các gói thành mảng Buffer rồi decode MỘT LẦN ở 'end': `body += c` ép từng gói sang
      // chuỗi riêng, nên ký tự nhiều byte (tiếng Việt) bị cắt ở ranh giới gói TCP thành U+FFFD —
      // hỏng cả inbox.raw đã bền hoá. Giới hạn đếm theo byte (c.length) mới đúng nghĩa "1 MB".
      const phan = [];
      let soByte = 0;
      req.on('data', (c) => { phan.push(c); soByte += c.length; if (soByte > MAX_BODY) req.destroy(); });
      req.on('end', () => {
        try {
          const body = Buffer.concat(phan).toString('utf8');
          let payload;
          try { payload = JSON.parse(body || '{}'); } catch { return json(res, 400, { ok: false }); }
          if (debug) log.log('[debug] webhook:', body.slice(0, 800));
          let u;
          try { u = channel.parse(payload); } catch { u = null; }
          // Update bot không hiểu được (hay thiếu chatId — cột chat_id là NOT NULL): ack 200 và thôi.
          // Gửi lại cũng vẫn không hiểu, nên 503 chỉ làm Zalo thử mãi.
          // Nhưng phải để lại dấu vết: Zalo đổi định dạng payload mà bot ack mọi thứ rồi im lặng
          // thì không ai biết. Chỉ in các khoá cấp cao, KHÔNG in body (có nội dung tin khách, Điều IX).
          if (!u || !u.chatId) {
            const khoa = payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 10).join(',') : typeof payload;
            log.warn?.('[webhook] update không parse được / thiếu chatId, đã ack 200 và bỏ qua; khoá cấp cao:',
              redact(khoa).slice(0, 120));
            return json(res, 200, { ok: true });
          }
          let moi;
          try {
            moi = store.inbox.insertIgnore({
              update_key: u.updateKey, chat_id: u.chatId, user_id: u.userId ?? null,
              raw: JSON.stringify(u.raw ?? payload), received_at: now().toISOString(),
            });
          } catch (e) {
            log.error('[webhook] không ghi được inbox:', redact(e?.message));
            return json(res, 503, { ok: false });   // chưa bền hoá thì KHÔNG ack: để Zalo gửi lại
          }
          json(res, 200, { ok: true });   // đã bền hoá (pending) mới ack
          if (!moi) return;   // trùng khoá: lượt này đã có người nhận, không xử lý lại
          const key = convIdOf({ chatId: u.chatId, userId: u.userId, isGroup: isGroup(u) });
          // `Promise.resolve().then(() => runTask(...))` chứ không `Promise.resolve(runTask(...))`.
          // Lý do: cách đúng đưa lỗi của việc (kể cả lỗi ĐỒNG BỘ) vào .catch RIÊNG ở dòng 93 —
          // đó là đường lỗi CỦA VIỆC, không phải đường `loi500` dành cho lỗi không lường được
          // của handler. (`queue.run` của T019 KHÔNG ném lỗi đồng bộ ra ngoài: `fn` chạy bên trong
          // `truoc.then(() => fn())` nên lỗi luôn thành promise bị từ chối.)
          // Cách sai gọi runTask NGAY trong thân callback 'end', nên lỗi đồng bộ của nó rơi vào
          // try/catch của callback (dòng 44 và 94) → bị gán NHẦM nhãn "lỗi không lường được" → gọi
          // res.end() LẦN HAI trên phản hồi đã trả 200. Tệ hơn: chuỗi promise phía sau KHÔNG
          // được tạo, nên lỗi của việc không còn đường đi riêng. Bất kỳ `runTask` nào ném lỗi ĐỒNG BỘ
          // (kể cả hàm bọc của hàng đợi, nếu ai đó viết sai) đều rơi vào đây ⇒ lượt sau cùng cuộc trò chuyện không bao giờ chạy (specs/001-nen-tang-chung/tasks.md:343).
          // KHÔNG phải để "flush ack trước": `.then` là microtask, chạy xong TRƯỚC khi vòng lặp sự
          // kiện ghi socket ra ngoài, nên phần đồng bộ của engine.process (`store.tx` insert+claim,
          // `chats/convs.upsertSeen`) VẪN nằm trước lúc khách nhận ack. Đo thật với engine.process
          // có 400 ms đồng bộ, thời điểm KHÁCH nhận ack: `.then` 436 ms · `setImmediate` 409 ms ·
          // `setTimeout(0)` 5 ms. Tức `setImmediate` cũng không cứu. Đưa phần đồng bộ của engine
          // ra khỏi đường ack là việc RIÊNG (ghi ở T021 — việc nền bền,
          // specs/001-nen-tang-chung/tasks.md), ngoài phạm vi T019.
          Promise.resolve().then(() => runTask(key, () => engine.process(u)))
            .then((x) => { if (debug || x?.skipped) log.log('[bot] kết quả:', JSON.stringify(x)); })
            .catch((e) => log.error('[webhook]', redact(e?.message)));
        } catch (e) { loi500(res, e); }
      });
    } catch (e) { loi500(res, e); }
  };
}
