// packs/hs/xung-ho.js — Xưng hô với khách (issue #136, mở lại ở #168).
//
// Vì sao không đoán theo tên: "Nguyễn Thị Lan" trông như nữ nhưng tài khoản Zalo có thể là người khác
// (trợ lý, chồng/vợ, nhân viên dùng máy công ty). Gọi sai giới tính của người thật là lỗi đối xử với khách,
// nên bot CHỈ nhận xưng hô khi (1) chính khách tự nói, hoặc (2) nhân viên OZ ghi nhãn `xh-anh`/`xh-chi`.
// Không rõ → "anh/chị" (mặc định an toàn, đúng văn phong OZ).

export const XUNG_HO_MAC_DINH = 'anh/chị';

/** Nhãn hồ sơ do nhân viên gắn: `xh-anh` / `xh-chi`. */
const NHAN = { 'xh-anh': 'anh', 'xh-chi': 'chị' };

// Khách tự nói về mình: "anh cần…", "chị muốn…", "em là chị Lan", "gọi anh là được".
// Phải neo vào chủ ngữ đầu câu hoặc lời tự giới thiệu; "anh trai em" là người khác, không tính.
// Lưu ý `\b` của JS chỉ hiểu chữ ASCII: sau "chị" (kết bằng "ị") không có ranh giới từ nào,
// nên ranh giới cuối phải viết bằng `(?!\p{L})` chứ không dùng `\b`.
const KHONG_CHU = '(?!\\p{L})';
const TU_NOI = [
  { re: new RegExp(`(?:^|[.!?,;]\\s*)(anh)\\s+(?:cần|muốn|đang|xin|hỏi|nhờ|có|vừa|mới|sẽ|đã|chưa|không)${KHONG_CHU}`, 'iu'), xh: 'anh' },
  { re: new RegExp(`(?:^|[.!?,;]\\s*)(chị)\\s+(?:cần|muốn|đang|xin|hỏi|nhờ|có|vừa|mới|sẽ|đã|chưa|không)${KHONG_CHU}`, 'iu'), xh: 'chị' },
  { re: new RegExp(`(?:^|[^\\p{L}])(?:em|mình|tôi|t[ớo])\\s+(?:là|tên)\\s+(?:[^.!?,;]*\\s)?(anh|chị)${KHONG_CHU}`, 'iu'), xh: null },
  { re: new RegExp(`(?:^|[^\\p{L}])(?:g[oọ]i|k[eê]u)\\s+(anh|chị)${KHONG_CHU}`, 'iu'), xh: null },
  { re: new RegExp(`(?:^|[^\\p{L}])(anh|chị)\\s+(?:đây|nhé|nha)\\s*$`, 'iu'), xh: null },
];

const chuan = (s) => (/^ch[iị]$/i.test(String(s || '').trim()) ? 'chị' : /^anh$/i.test(String(s || '').trim()) ? 'anh' : null);

/**
 * Xưng hô khách tự nói trong một câu. null = câu không nói gì về xưng hô của chính khách.
 * @param {string} text câu khách vừa gõ
 */
export function doXungHo(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  for (const { re, xh } of TU_NOI) {
    const m = re.exec(s);
    if (m) return xh || chuan(m[1]);
  }
  return null;
}

/**
 * Xưng hô dùng cho câu trả lời. Thứ tự: nhãn nhân viên ghi → khách tự nói trong lượt này
 * → khách đã tự nói ở lượt trước (lưu trong phiên) → mặc định "anh/chị".
 * @param {{customer?:object|null, session?:object|null, text?:string}} o
 */
export function xungHoCuaKhach({ customer = null, session = null, text = '' } = {}) {
  for (const l of customer?.labels || []) {
    if (l?.nguon && l.nguon !== 'auto' && NHAN[l.nhan]) return NHAN[l.nhan];
  }
  const moi = doXungHo(text);
  if (moi) return moi;
  const cu = chuan(session?.xungHo);
  if (cu) return cu;
  for (const l of customer?.labels || []) if (NHAN[l.nhan]) return NHAN[l.nhan];
  return XUNG_HO_MAC_DINH;
}

/** Hoa chữ đầu để ghép đầu câu: "anh/chị" → "Anh/chị". */
export function hoaDau(s) {
  const t = String(s || '');
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}
