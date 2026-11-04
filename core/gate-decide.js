// Cửa gửi (contracts/send-gate.md). Phần quyết định: hàm thuần, không I/O, không đọc đồng hồ.
import { isQuietHours, nextMorning } from './time.js';
import { findLeak } from './redact.js';
import { jaccard, extractMoney } from './text.js';

export const DEFAULT_RULES = Object.freeze({
  capChatDay: 8,
  capAllDay: 300,
  similarity: 0.8,
  directReplyMs: 600_000,
  bannedPatterns: [],
});

const NEVER_PROACTIVE = new Set(['staff_relay', 'ticket', 'digest']);
const CAPPED = new Set(['reply', 'notice', 'job_result']);

const out = (decision, reason, extra) => ({ decision, reason, ...extra });

function toMs(v) {
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Tin chủ động: job_result, hoặc reply/notice trả muộn quá directReplyMs / không có mốc tin khách. */
function isProactive(msg, nowMs, rules) {
  if (NEVER_PROACTIVE.has(msg.kind)) return false;
  if (msg.kind === 'job_result') return true;
  const at = msg.inReplyToAt == null ? null : toMs(msg.inReplyToAt);
  return at == null || nowMs - at > rules.directReplyMs;
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
  const r = { ...DEFAULT_RULES, ...rules };
  const nowRaw = facts.now ?? msg.now;
  const nowMs = nowRaw == null ? null : toMs(nowRaw);
  if (nowMs == null) throw new Error('decide: thiếu facts.now (hoặc msg.now)');
  const now = new Date(nowMs).toISOString();
  const text = String(msg.text ?? '');
  const free = NEVER_PROACTIVE.has(msg.kind);

  // 1
  if (facts.idemExists) return out('drop', 'duplicate-idem');

  if (!free) {
    // 2
    if (facts.chatState === 'human' || facts.chatState === 'blocked') {
      return out('reject', `chat-${facts.chatState}`);
    }
    // 3a, 3b
    if (isProactive(msg, nowMs, r)) {
      if (!facts.hasOpenJob) return out('reject', 'proactive-no-debt');
      if (isQuietHours(now)) return out('defer', 'quiet-hours', { notBefore: nextMorning(now) });
    }
    // 4, 5
    if (CAPPED.has(msg.kind)) {
      if ((facts.sentTodayChat ?? 0) >= r.capChatDay) return out('defer', 'cap:chat');
      if ((facts.sentTodayAll ?? 0) >= r.capAllDay) return out('defer', 'cap:all');
    }
    // 6
    let best = 0;
    for (const prev of facts.recentBotTexts ?? []) best = Math.max(best, jaccard(text, prev));
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
