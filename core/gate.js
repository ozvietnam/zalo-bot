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

  /** Trạng thái hiệu dụng của cửa: chats chặn cấp nhóm → convs (theo người) → chats (chat 1-1) → 'bot'. */
  function effectiveState(m) {
    const chat = store.chats.get(m.chatId);
    if (chat?.state === 'blocked') return 'blocked';            // chặn cấp nhóm (FR-032)
    const conv = store.convs.get(m.convId);
    if (conv?.state && conv.state !== 'bot') return conv.state;  // human/blocked theo người
    if (m.convId === m.chatId && chat?.state) return chat.state; // chat 1-1: khoá cũ
    return 'bot';
  }

  /** facts theo cuộc trò chuyện (convId); m = { chatId, convId, isGroup }. */
  function facts(m, nowIso, extra = {}) {
    const t = Date.parse(nowIso);
    const dayStart = vnDayStartUtc(nowIso);
    const isGroup = m.isGroup === true;
    return {
      chatState: effectiveState(m),
      idemExists: false,
      hasOpenJob: store.jobs.openFor(m.convId, iso(t - R.directReplyMs)),
      // Đọc theo cửa sổ dài nhất; decide tự lọc cửa sổ ngắn hơn cho câu trả lời trực tiếp.
      recentBotTexts: store.outbox.recentBotMsgs(m.convId, iso(t - R.dupWindowMs), 4),
      sentTodayChat: store.outbox.countSent(m.convId, dayStart),
      sentTodayGroup: isGroup ? store.outbox.countSentChat(m.chatId, dayStart) : 0,
      sentTodayAll: store.outbox.countSent(null, dayStart),
      isGroup,
      now: nowIso,
      ...extra,
    };
  }

  // Defer không có notBefore (cap:*): 07:00 VN sau nửa đêm VN kế tiếp, để bộ quét có mốc và khỏi đụng giờ yên.
  const notBeforeOf = (d, nowIso) => d.notBefore ?? (d.decision === 'defer' ? nextMorning(iso(Date.parse(vnDayStartUtc(nowIso)) + DAY)) : null);

  function audit(type, chatId, convId, turnId, data, at) {
    store.audit.add({ at, turn_id: turnId ?? null, conv_id: convId ?? null, chat_id: chatId, type, data });
  }

  function auditGate(m, d, at) {
    const data = { idemKey: m.idemKey, decision: d.decision, reason: d.reason, kind: m.kind };
    if (m.kind === 'staff_relay') data.leakCheck = 'skipped';
    audit('gate', m.chatId, m.convId, m.turnId, data, at);
  }

  /** Báo: leak/trần ngày cả bot → cảnh báo theo phòng; trần ngày của cuộc trò chuyện/tiền → phiếu theo conv. */
  function signal(chatId, convId, d) {
    const { decision, reason } = d;
    if ((decision === 'reject' && reason.startsWith('leak:')) || (decision === 'defer' && (reason === 'cap:all' || reason === 'cap:group'))) safe(onAlert, chatId, reason);
    else if ((decision === 'defer' && reason === 'cap:chat') || (decision === 'reject' && reason.startsWith('money:'))) safe(onTicket, convId, reason);
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
      audit('error', o.chat_id, o.conv_id ?? o.chat_id, o.turn_id, { idemKey: o.idem_key, attempts, message: redact(err?.message) }, t.toISOString());
      if (attempts > RETRY_MIN.length) safe(onAlert, o.chat_id, 'send-failed');
      return 'failed';
    }
    const at = nowDate().toISOString();
    store.tx(() => {
      store.outbox.update(id, { status: 'sent', sent_at: at, next_retry_at: null });
      if (o.kind !== 'ticket' && o.kind !== 'digest') {
        store.messages.add({
          conv_id: o.conv_id ?? o.chat_id, chat_id: o.chat_id, turn_id: o.turn_id, speaker: o.kind === 'staff_relay' ? 'nhan-vien' : 'bot',
          speaker_id: extra.staffId ?? null, text: o.text, outbox_id: id, at,
        });
      }
    });
    return 'sent';
  }

  async function send(msg) {
    const nowIso = nowDate().toISOString();
    // Cửa fallback: không có convId thì lấy chatId (chat 1-1 hoặc người gọi cũ).
    const convId = msg.convId ?? msg.chatId;
    const isGroup = msg.isGroup === true || convId !== msg.chatId;
    const m = { ...msg, convId, isGroup };
    // Tin rỗng: chặn TRƯỚC khi đọc facts (hasIdem cần idemKey hợp lệ) để không ném lỗi bind SQLite.
    // 'empty' lấy từ decide (nguồn duy nhất của lý do) nên không nhân bản chuỗi.
    const pre = decide(m, { now: nowIso }, R);
    if (pre.reason === 'empty') {
      auditGate(m, pre, nowIso);
      return { id: null, decision: pre.decision, reason: pre.reason, status: STATUS[pre.decision] };
    }
    const f = facts({ chatId: msg.chatId, convId, isGroup }, nowIso, { idemExists: store.outbox.hasIdem(msg.idemKey) });
    const d = decide(m, f, R);
    const dup = () => {
      auditGate(m, { decision: 'drop', reason: 'duplicate-idem' }, nowIso);
      return { id: null, decision: 'drop', reason: 'duplicate-idem', status: 'dropped' };
    };
    if (d.reason === 'duplicate-idem') return dup();
    const ctx = {
      pack: msg.pack ? { id: msg.pack.id ?? null, moneyCheck: msg.pack.moneyCheck === true } : null,
      evidenceNumbers: [...evidenceNumbers(msg.evidence)],
      inReplyToAt: msg.inReplyToAt ?? null,
      debt: f.hasOpenJob,
      staffId: msg.staffId ?? null,
      isGroup,
    };
    let id;
    try {
      id = store.outbox.insert({
        idem_key: msg.idemKey, conv_id: convId, chat_id: msg.chatId, turn_id: msg.turnId, kind: msg.kind, text: msg.text,
        decision: d.decision, reason: d.reason, status: STATUS[d.decision], not_before: notBeforeOf(d, nowIso),
        created_at: nowIso, ctx,
      });
    } catch (e) {
      if (/^DUPLICATE_IDEM/.test(e?.message)) return dup();
      throw e;
    }
    auditGate(m, d, nowIso);
    signal(msg.chatId, convId, d);
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
    const convId = o.conv_id ?? o.chat_id;
    const isGroup = c.isGroup === true || convId !== o.chat_id;
    const m = { idemKey: o.idem_key, chatId: o.chat_id, convId, isGroup, turnId: o.turn_id, kind: o.kind, text: o.text,
      inReplyToAt: c.inReplyToAt ?? null, pack: c.pack ?? undefined, evidence: c.evidenceNumbers ?? [] };
    const f = facts({ chatId: o.chat_id, convId, isGroup }, nowIso);
    f.hasOpenJob = Boolean(c.debt) || f.hasOpenJob;
    const d = decide(m, f, R);
    auditGate(m, d, nowIso);
    if (d.reason !== o.reason) signal(o.chat_id, convId, d);
    // Tin đã lỗi gửi mà nay bị chặn vì quá muộn: khách chưa nhận được câu trả lời → người theo dõi.
    if (o.status === 'failed' && d.reason === 'proactive-no-debt') safe(onTicket, o.conv_id ?? o.chat_id, 'send-failed'); // đổi lý do mới báo; hoãn lại cùng lý do thì im
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

  /** Gọi MỘT LẦN lúc khởi động (trước sweep đầu). Dòng 'queued' còn lại là do tiến trình cũ chết giữa chừng:
   *  chuyển thành 'failed' để bộ quét thử lại từ parts_sent (có thể gửi lặp đúng một phần đang bay). */
  function recover() {
    const nowIso = nowDate().toISOString();
    const rows = store.outbox.queued();
    for (const o of rows) {
      store.outbox.update(o.id, { status: 'failed', next_retry_at: nowIso });
      audit('error', o.chat_id, o.conv_id ?? o.chat_id, o.turn_id, { idemKey: o.idem_key, reason: 'crash-mid-send', parts_sent: o.parts_sent ?? 0 }, nowIso);
      if ((o.parts_sent ?? 0) > 0) safe(onAlert, o.chat_id, 'crash-mid-send');
    }
    return rows.length;
  }

  return { send, sweep, recover };
}
