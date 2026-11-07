// core/webhook.js — handler HTTP: /health + nhận POST webhook Zalo (tách khỏi server.js, T018).
// Tệp này KHÔNG gửi tin ra khách (Hiến pháp Điều I): chỉ nhận HTTP, bền hoá vào inbox rồi giao engine.
// Thứ tự BẮT BUỘC (Điều VII "sai thì dừng", plan.md "Luồng một lượt"):
//   verifyWebhook → parse → inbox.insertIgnore (pending) → 200 (hoặc 503 nếu db lỗi) → runTask(convId, engine.process).
// Ack trước khi ghi là mất tin: Zalo đã nhận 200 nên không gửi lại, mà tiến trình có thể chết ở khe hở đó.
// `health` là hàm trả payload /health (server.js biết STARTED_AT/VERSION, tệp này không cần biết).
import { convIdOf } from './conv.js';
import { isGroup } from './mention.js';
import { redact } from './redact.js';

const MAX_BODY = 1_000_000;   // 1 MB tính theo BYTE (không theo ký tự: 1 ký tự tiếng Việt là 2-3 byte)

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

/**
 * @param {object} o
 * @param {(key:string, fn:()=>Promise<any>)=>Promise<any>} [o.runTask]  mặc định chạy thẳng; T019 sẽ tiêm `createQueue().run`.
 */
export function createWebhookHandler({ config, channel, engine, store, health, now = () => new Date(), runTask = (key, fn) => fn(), debug = false, log = console } = {}) {
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
      if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
        return json(res, 200, health());
      }
      if (config.mode !== 'webhook' || req.method !== 'POST' || req.url.split('?')[0] !== config.webhookPath) return json(res, 404, { ok: false });
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
          // `Promise.resolve().then(...)` chứ không `Promise.resolve(runTask(...))`: cách sau gọi
          // runTask TRƯỚC khi bọc, nên lỗi đồng bộ thoát khỏi callback 'end' → uncaughtException →
          // bot chết sau khi đã ack 200 = tin mất. T019 tiêm `queue.run` vào đúng chỗ này, nên chỗ
          // này phải bắt được cả lỗi đồng bộ của nó, không chỉ promise bị từ chối.
          // KHÔNG phải để "flush ack trước": `.then` là microtask, chạy xong TRƯỚC khi vòng lặp sự
          // kiện ghi socket ra ngoài, nên phần đồng bộ của engine.process (`store.tx` insert+claim,
          // `chats/convs.upsertSeen`) VẪN nằm trước lúc khách nhận ack. Đo thật với engine.process
          // có 400 ms đồng bộ, thời điểm KHÁCH nhận ack: `.then` 436 ms · `setImmediate` 409 ms ·
          // `setTimeout(0)` 5 ms. Tức `setImmediate` cũng không cứu. Đưa phần đồng bộ ra khỏi
          // đường ack là việc riêng (ghi-chu.md), ngoài phạm vi T018.
          Promise.resolve().then(() => runTask(key, () => engine.process(u)))
            .then((x) => { if (debug || x?.skipped) log.log('[bot] kết quả:', JSON.stringify(x)); })
            .catch((e) => log.error('[webhook]', redact(e?.message)));
        } catch (e) { loi500(res, e); }
      });
    } catch (e) { loi500(res, e); }
  };
}
