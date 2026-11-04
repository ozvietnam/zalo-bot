// Cửa gửi duy nhất (contracts/send-gate.md). Thi hành: facts -> decide -> ghi outbox -> gửi kênh -> cập nhật.
// decide (hàm thuần) nằm ở gate-decide.js. Chỉ tệp này được gọi channel.sendText.
import { decide, DEFAULT_RULES, evidenceNumbers } from './gate-decide.js';
import { splitText } from './text.js';
import { vnDayStartUtc, nextMorning } from './time.js';
import { redact } from './redact.js';

export { decide, DEFAULT_RULES, evidenceNumbers } from './gate-decide.js';

const MIN = 60_000;
const DAY = 86_400_000;
const RETRY_MIN = [1, 5, 15]; // 3 lần thử lại, sau lần lỗi thứ 1, 2, 3; lỗi thứ 4 thì dừng
const STATUS = { send: 'queued', drop: 'dropped', defer: 'deferred', reject: 'rejected' };

export function createGate({ store, channel, rules = {}, now, onAlert = () => {}, onTicket = () => {}, log = () => {} }) {
  const R = { ...DEFAULT_RULES, ...rules };
  const iso = (ms) => new Date(ms).toISOString();
  const nowDate = () => now();
  const safe = (fn, ...args) => { try { fn(...args); } catch (e) { log('callback error', redact(e?.message)); } };

  function facts(chatId, nowIso, extra = {}) {
    const t = Date.parse(nowIso);
    const dayStart = vnDayStartUtc(nowIso);
    return {
      chatState: store.chats.get(chatId)?.state ?? 'bot',
      idemExists: false,
      hasOpenJob: store.jobs.openFor(chatId, iso(t - R.directReplyMs)),
      recentBotTexts: store.outbox.recentBotTexts(chatId, iso(t - 15 * MIN), 4),
      sentTodayChat: store.outbox.countSent(chatId, dayStart),
      sentTodayAll: store.outbox.countSent(null, dayStart),
      now: nowIso,
      ...extra,
    };
  }

  // Defer không có notBefore (cap:*): 07:00 VN sau nửa đêm VN kế tiếp, để bộ quét có mốc và khỏi đụng giờ yên.
  const notBeforeOf = (d, nowIso) => d.notBefore ?? (d.decision === 'defer' ? nextMorning(iso(Date.parse(vnDayStartUtc(nowIso)) + DAY)) : null);

  function audit(type, chatId, turnId, data, at) {
    store.audit.add({ at, turn_id: turnId ?? null, chat_id: chatId, type, data });
  }

  function auditGate(m, d, at) {
    const data = { idemKey: m.idemKey, decision: d.decision, reason: d.reason, kind: m.kind };
    if (m.kind === 'staff_relay') data.leakCheck = 'skipped';
    audit('gate', m.chatId, m.turnId, data, at);
  }

  function signal(chatId, d) {
    const { decision, reason } = d;
    if ((decision === 'reject' && reason.startsWith('leak:')) || (decision === 'defer' && reason === 'cap:all')) safe(onAlert, chatId, reason);
    else if ((decision === 'defer' && reason === 'cap:chat') || (decision === 'reject' && reason.startsWith('money:'))) safe(onTicket, chatId, reason);
  }

  /** Gửi các phần còn thiếu của một dòng outbox. Không ném; trả status cuối. */
  async function deliver(id, extra = {}) {
    const o = store.outbox.get(id);
    extra = { staffId: o.ctx?.staffId ?? null, ...extra };
    const parts = splitText(o.text, channel.maxText ?? 2000);
    let sent = o.parts_sent ?? 0;
    try {
      for (; sent < parts.length; sent++) {
        try {
          await channel.sendText(o.chat_id, parts[sent]);
        } catch (err) { throw Object.assign(new Error(err?.message), { channelError: true }); }
        store.outbox.update(id, { parts_sent: sent + 1 }); // lỗi db ở đây KHÔNG phải lỗi kênh
      }
    } catch (err) {
      if (!err.channelError) throw err;
      const t = nowDate();
      const attempts = (o.attempts ?? 0) + 1;
      const retry = attempts <= RETRY_MIN.length ? iso(t.getTime() + RETRY_MIN[attempts - 1] * MIN) : null;
      store.outbox.update(id, { status: 'failed', attempts, next_retry_at: retry });
      audit('error', o.chat_id, o.turn_id, { idemKey: o.idem_key, attempts, message: redact(err?.message) }, t.toISOString());
      if (attempts > RETRY_MIN.length) safe(onAlert, o.chat_id, 'send-failed');
      return 'failed';
    }
    const at = nowDate().toISOString();
    store.tx(() => {
      store.outbox.update(id, { status: 'sent', sent_at: at, next_retry_at: null });
      if (o.kind !== 'ticket' && o.kind !== 'digest') {
        store.messages.add({
          chat_id: o.chat_id, turn_id: o.turn_id, speaker: o.kind === 'staff_relay' ? 'nhan-vien' : 'bot',
          speaker_id: extra.staffId ?? null, text: o.text, outbox_id: id, at,
        });
      }
    });
    return 'sent';
  }

  async function send(msg) {
    const nowIso = nowDate().toISOString();
    const f = facts(msg.chatId, nowIso, { idemExists: store.outbox.hasIdem(msg.idemKey) });
    const d = decide(msg, f, R);
    const dup = () => {
      auditGate(msg, { decision: 'drop', reason: 'duplicate-idem' }, nowIso);
      return { id: null, decision: 'drop', reason: 'duplicate-idem', status: 'dropped' };
    };
    if (d.reason === 'duplicate-idem') return dup();
    const ctx = {
      pack: msg.pack ? { id: msg.pack.id ?? null, moneyCheck: msg.pack.moneyCheck === true } : null,
      evidenceNumbers: [...evidenceNumbers(msg.evidence)],
      inReplyToAt: msg.inReplyToAt ?? null,
      debt: f.hasOpenJob,
      staffId: msg.staffId ?? null,
    };
    let id;
    try {
      id = store.outbox.insert({
        idem_key: msg.idemKey, chat_id: msg.chatId, turn_id: msg.turnId, kind: msg.kind, text: msg.text,
        decision: d.decision, reason: d.reason, status: STATUS[d.decision], not_before: notBeforeOf(d, nowIso),
        created_at: nowIso, ctx,
      });
    } catch (e) {
      if (/^DUPLICATE_IDEM/.test(e?.message)) return dup();
      throw e;
    }
    auditGate(msg, d, nowIso);
    signal(msg.chatId, d);
    let status = STATUS[d.decision];
    if (d.decision === 'send') {
      try { status = await deliver(id); } catch (e) { log('deliver error', redact(e?.message)); status = store.outbox.get(id).status; } // dòng 'queued' sẽ được recover() xử lý
    }
    return { id, decision: d.decision, reason: d.reason, status };
  }

  /** Xử lý một dòng đến hạn (tin hoãn hoặc tin lỗi chờ thử lại): chạy lại decide ĐẦY ĐỦ với facts mới,
   *  chỉ bỏ bước idem vì là chính dòng này. Bối cảnh (pack, số trong evidence, mốc trả lời, nợ việc nền, staffId) lấy từ ctx. */
  async function sweepRow(o, nowIso) {
    const c = o.ctx ?? {};
    const m = { idemKey: o.idem_key, chatId: o.chat_id, turnId: o.turn_id, kind: o.kind, text: o.text,
      inReplyToAt: c.inReplyToAt ?? null, pack: c.pack ?? undefined, evidence: c.evidenceNumbers ?? [] };
    const f = facts(o.chat_id, nowIso);
    f.hasOpenJob = Boolean(c.debt) || f.hasOpenJob;
    const d = decide(m, f, R);
    auditGate(m, d, nowIso);
    if (d.reason !== o.reason) signal(o.chat_id, d); // đổi lý do mới báo; hoãn lại cùng lý do thì im
    const status = STATUS[d.decision];
    store.outbox.update(o.id, { decision: d.decision, reason: d.reason, status, not_before: notBeforeOf(d, nowIso) });
    return d.decision === 'send' ? deliver(o.id) : status;
  }

  let sweeping = false;
  /** Quét outbox: tin hoãn đến hạn và tin lỗi chờ thử lại. Trả số dòng đã xử lý. */
  async function sweep() {
    if (sweeping) return 0;
    sweeping = true;
    try {
      const nowIso = nowDate().toISOString();
      let n = 0;
      for (const o of store.outbox.due(nowIso)) {
        try {
          await sweepRow(o, nowIso);
          n++;
        } catch (e) {
          log('sweep row error', o.id, redact(e?.message));
        }
      }
      return n;
    } finally {
      sweeping = false;
    }
  }

  return { send, sweep };
}
