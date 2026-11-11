// Cửa gửi (contracts/send-gate.md). Phần quyết định: hàm thuần, không I/O, không đọc đồng hồ.
import { isQuietHours, nextMorning } from './time.js';
import { findLeak } from './redact.js';
import { jaccard, extractMoney, normVi } from './text.js';

export const DEFAULT_RULES = Object.freeze({
  capChatDay: 8,
  capGroupDay: 200,
  capAllDay: 300,
  capVoiceDay: 50,
  similarity: 0.8,
  directReplyMs: 600_000,
  dupDirectMs: 60_000,
  dupWindowMs: 900_000,
  bannedPatterns: [],
  quietHours: true, // false: tắt giờ yên (chỉ createBot cũ dùng để test cũ chạy mọi giờ)
});

const NEVER_PROACTIVE = new Set(['staff_relay', 'ticket', 'digest']);
// 'progress' = câu "đang tra" (issue #168): KHÔNG trong CAPPED (không ăn suất 8 tin/ngày của khách),
// và không bao giờ hoãn — câu "đang tra" gửi bù lúc 07:00 khi kết quả đã tới từ đêm là vô nghĩa.
const PROGRESS = 'progress';
const CAPPED = new Set(['reply', 'notice', 'job_result', 'voice']);

const out = (decision, reason, extra) => ({ decision, reason, ...extra });

function toMs(v) {
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Còn mốc tin khách đọc được và trong directReplyMs: tin này là câu trả lời cho câu khách vừa hỏi. */
function isDirectReply(msg, nowMs, rules) {
  const at = msg.inReplyToAt == null ? null : toMs(msg.inReplyToAt);
  return at != null && nowMs - at <= rules.directReplyMs;
}

/** Tin chủ động (bước 3a: nợ việc nền + giờ yên): job_result luôn tính là chủ động —
 *  kết quả việc nền phải có việc nền nợ và phải chịu giờ yên (hiến pháp Điều II). */
function isProactive(msg, nowMs, rules) {
  if (NEVER_PROACTIVE.has(msg.kind)) return false;
  if (msg.kind === 'job_result') return true;
  return !isDirectReply(msg, nowMs, rules);
}

// Một cách đọc duy nhất, cùng quy ước extractMoney: nhóm cuối đúng 3 chữ số thì mọi dấu là ngăn nghìn, ngược lại dấu cuối là thập phân.
function parseNumeric(s) {
  const parts = s.split(/[.,]/);
  if (parts.length === 1) return Number(s);
  const last = parts[parts.length - 1];
  if (last.length === 3) return Number(parts.join(''));
  return Number(parts.slice(0, -1).join('') + '.' + last);
}

/** Mọi số trong evidence: giá trị số, chuỗi dạng số (cả bỏ dấu . ,), và số tiền extractMoney tìm thấy trong chuỗi. */
export function evidenceNumbers(evidence) {
  const set = new Set();
  const walk = (v) => {
    if (typeof v === 'number') {
      if (Number.isFinite(v)) set.add(v);
    } else if (typeof v === 'string') {
      const s = v.trim();
      if (/^\d+(?:[.,]\d+)*$/.test(s)) {
        set.add(parseNumeric(s));
      }
      for (const n of extractMoney(s)) set.add(n);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(walk);
    }
  };
  walk(evidence);
  return set;
}

/**
 * Quyết định gửi một tin. Trả về { decision, reason, notBefore? }.
 * facts.now (hoặc msg.now) bắt buộc; hàm không tự đọc đồng hồ.
 */
export function decide(msg, facts = {}, rules = {}) {
  // Khoá có mặt với giá trị undefined (ví dụ `dupDirectMs: config.dupDirectMs` mà config thiếu)
  // KHÔNG được ghi đè mặc định: mất một ngưỡng là âm thầm đổi luật gửi. Giá trị false vẫn giữ.
  const r = { ...DEFAULT_RULES };
  for (const [k, v] of Object.entries(rules)) if (v !== undefined) r[k] = v;
  const nowRaw = facts.now ?? msg.now;
  const nowMs = nowRaw == null ? null : toMs(nowRaw);
  if (nowMs == null) throw new Error('decide: thiếu facts.now (hoặc msg.now)');
  const now = new Date(nowMs).toISOString();
  const text = String(msg.text ?? '');
  const free = NEVER_PROACTIVE.has(msg.kind);

  // 0: tin rỗng không có gì để gửi
  if (!text.trim()) return out('reject', 'empty');

  // 1
  if (facts.idemExists) return out('drop', 'duplicate-idem');

  if (!free) {
    // 2
    if (facts.chatState === 'human' || facts.chatState === 'blocked') {
      return out('reject', `chat-${facts.chatState}`);
    }
    // 2b: câu "đang tra" trong giờ yên → bỏ, kể cả khi là câu trả lời trực tiếp. Kết quả việc nền ban đêm bị
    // hoãn tới 07:00 (bước 3b), nên "khoảng 1 phút ạ" lúc 23:30 là hứa sai; gửi bù lúc 07:00 thì vô nghĩa.
    if (msg.kind === PROGRESS && r.quietHours !== false && isQuietHours(now)) return out('drop', 'progress:quiet-hours');
    // 3a, 3b
    if (isProactive(msg, nowMs, r)) {
      if (!facts.hasOpenJob) return out('reject', 'proactive-no-debt');
      if (r.quietHours !== false && isQuietHours(now)) return out('defer', 'quiet-hours', { notBefore: nextMorning(now) });
    }
    // 4, 5
    if (CAPPED.has(msg.kind)) {
      if (msg.kind === 'voice' && r.capVoiceDay !== undefined && (facts.sentTodayVoice ?? 0) >= r.capVoiceDay) {
        return out('defer', 'cap:voice');
      }
      if ((facts.sentTodayChat ?? 0) >= r.capChatDay) return out('defer', 'cap:chat');
      if ((facts.isGroup === true) && (facts.sentTodayGroup ?? 0) >= r.capGroupDay) return out('defer', 'cap:group');
      if ((facts.sentTodayAll ?? 0) >= r.capAllDay) return out('defer', 'cap:all');
    }
    // 6: luật này sinh ra từ sự cố #2 (hai tiến trình cùng một phòng, khách bấm gửi hai lần —
    // research.md:11). Nay lớp chặn chính là khoá outbox.idem_key UNIQUE và claim nguyên tử bảng
    // inbox, nên Jaccard chỉ là lưới an toàn cuối. Vì vậy cửa sổ tách theo mốc tin khách: tin trả
    // lời câu khách vừa hỏi (còn trong directReplyMs — kể cả job_result trả muộn qua việc nền) chỉ
    // chống trùng trong dupDirectMs (đủ chặn hai lần bấm gửi); tin không có mốc, hoặc mốc đã cũ,
    // giữ dupWindowMs. Đây là khái niệm RIÊNG của bước 6, không phải isProactive của bước 3a:
    // job_result vẫn luôn chịu luật nợ việc nền và giờ yên ở trên.
    // Tin cũ trong recentBotTexts không có mốc đọc được thì coi như trong cửa sổ — mặc định an toàn.
    //
    // Và bỏ qua tin bot TRẢ LỜI MỘT CÂU HỎI KHÁC của khách (issue #201, QA G2 bước 4). Bước 6 sinh ra
    // để chặn hai-lần-bấm-gửi, tức là HAI LƯỢT GỬI CHO CÙNG MỘT CÂU khách — không phải để chặn câu
    // trả lời cho một câu hỏi MỚI chỉ vì chữ giống. Trong nhóm đông, người hỏi tiếp cùng một mã
    // (An hỏi mã 8413 → Bình chen ngang → An hỏi "thuế bao nhiêu?") ra chữ gần như trùng, nên câu
    // thứ hai bị bỏ với lý do `similar:1.00` và khách thấy BOT IM.
    //
    // Dấu hiệu là CHỮ CÂU KHÁCH (`askKey`, đã chuẩn hoá), KHÔNG phải mã lượt: khách bấm gửi hai lần
    // thì Zalo cho hai lượt có mã KHÁC nhau nhưng CHỮ GIỐNG nhau (sự cố #2, `research.md:11`), nên
    // lấy mã lượt làm dấu hiệu sẽ tắt đúng lớp bảo vệ đó. Lấy chữ thì: cùng một câu khách → vẫn so
    // chữ và vẫn chặn; câu khách KHÁC nhau → là câu hỏi mới, không được bỏ oan.
    // Không biết (tin cũ, người gọi không khai) thì vẫn đem ra so — hướng an toàn.
    //
    // Miễn trừ này KHÔNG áp cho câu "đang tra" (`progress`): câu đó là CHỮ KHUÔN, giống nhau với mọi
    // câu hỏi và không mang thông tin riêng của câu nào, nên lặp lại chỉ là tin rác — đúng sự cố #9
    // (`research.md:18`: khách nhận cùng câu khuôn lần thứ 3). Nó vẫn chống trùng theo cửa sổ như cũ.
    //
    // Chữ khách RỖNG cũng tính là KHÔNG BIẾT: khách gõ trống trơn ("@bot", chỉ gọi tên bot rồi thôi)
    // thì đó không phải một câu hỏi, không được lấy làm bằng chứng "hai câu khác nhau". Thiếu luật
    // này thì một cái huých "@bot" và một câu "@bot tra hscode" bị coi là hai câu, và khách nhận hai
    // tin "Em đang tra: …" y nhau (điểm [S6] của người soát, `packs/hs/chay-goi.js:57`).
    const dupMs = isDirectReply(msg, nowMs, r) ? r.dupDirectMs : r.dupWindowMs;
    const hoi = msg.kind === PROGRESS ? null : (normVi(msg.askKey) || null);
    let best = 0;
    for (const prev of facts.recentBotTexts ?? []) {
      const at = typeof prev === 'string' || prev?.at == null ? null : toMs(prev.at);
      if (at != null && nowMs - at > dupMs) continue;
      const hoiTruoc = typeof prev === 'string' ? null : (normVi(prev?.askKey) || null);
      if (hoi != null && hoiTruoc != null && hoi !== hoiTruoc) continue;
      best = Math.max(best, jaccard(text, typeof prev === 'string' ? prev : prev?.text));
    }
    if (best >= r.similarity) return out('drop', `similar:${best.toFixed(2)}`);
  }

  // 7: staff_relay là lời người thật, không kiểm (thi hành vẫn ghi audit)
  if (msg.kind !== 'staff_relay') {
    const leak = findLeak(text, r.bannedPatterns);
    if (leak) return out('reject', `leak:${leak}`);
  }

  // 8
  if (!free && msg.pack?.moneyCheck === true) {
    const known = evidenceNumbers(msg.evidence);
    const missing = extractMoney(text).find((n) => !known.has(n));
    if (missing !== undefined) return out('reject', `money:${missing}`);
  }

  return out('send', 'ok');
}
