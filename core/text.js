// Văn bản tiếng Việt: chuẩn hoá, độ giống, tách số tiền, nhận tin chào kết, chia tin dài.

export const normVi = (s) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();

const words = (s) => new Set(normVi(s).split(/[^a-z0-9]+/).filter(Boolean));

/** Độ giống theo tập từ đã chuẩn hoá, 0..1. Rỗng thì 0. */
export function jaccard(a, b) {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return inter / (A.size + B.size - inter);
}

// Số: 25.650 | 25,650 | 25 650 | 1,5 | 800. Không bắt đầu giữa một số khác.
const NUM = String.raw`\d+(?:[.,]\d+|\s\d{3}(?!\d))*`;
const UNIT = String.raw`nhân dân tệ|triệu|tr|tệ|vnđ|vnd|đồng|đ|₫|usd|k|\$|¥`;
const MONEY_RE = new RegExp(
  String.raw`(?<![\p{N}.,])(?:([¥$₫])\s*(${NUM})|(${NUM})\s*(${UNIT})(?![\p{L}\p{N}]))`,
  'giu',
);

function parseNum(raw) {
  const t = raw.replace(/\s+/g, '');
  const parts = t.split(/[.,]/);
  if (parts.length === 1) return Number(t);
  const last = parts[parts.length - 1];
  // Nhóm cuối 3 chữ số: mọi dấu là ngăn nghìn. Ngược lại: dấu cuối là thập phân.
  if (last.length === 3) return Number(parts.join(''));
  return Number(parts.slice(0, -1).join('') + '.' + last);
}

const MULT = { k: 1_000, tr: 1_000_000, 'triệu': 1_000_000 };

/** Số tiền (số, theo thứ tự xuất hiện) đi kèm đơn vị tiền. "%" không phải tiền. */
export function extractMoney(s) {
  const out = [];
  for (const m of String(s ?? '').matchAll(MONEY_RE)) {
    const raw = m[2] ?? m[3];
    let v = parseNum(raw);
    const mult = MULT[(m[4] ?? '').toLowerCase()] ?? 1;
    if (mult > 1) v = Math.round(v * mult);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

const CLOSER_EMOJI = /[👍🙏👌❤😊😁🥰☺💯️\u{1F3FB}-\u{1F3FF}]/gu;
const CLOSER_RE = /^(?:(?:ok|oke|okie|okay|vang|da|cam on|thanks|thank you|thx)(?: |$))+(?:a|nhe|nha)?$/;

/** Tin chào kết ngắn ("ok ạ", "cảm ơn nhé", "👍"): không cần bot trả lời nữa. */
export function isCloser(s) {
  const raw = String(s ?? '');
  if (!raw.trim() || raw.length > 40 || /\d/.test(raw)) return false;
  const hasEmoji = new RegExp(CLOSER_EMOJI.source, 'u').test(raw);
  const rest = normVi(raw.replace(CLOSER_EMOJI, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' '));
  if (!rest) return hasEmoji;
  return CLOSER_RE.test(rest);
}

/** Chia văn bản thành đoạn ≤ max ký tự, ưu tiên cắt ở dòng trống rồi xuống dòng. (Sao từ lib/zalo.js.) */
export function splitText(text, max = 2000) {
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
