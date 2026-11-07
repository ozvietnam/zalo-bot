// "@Tên bot" và nhận diện nhóm (chuyển từ lib/bot.js). Lõi bỏ nhắc tên ở cả text và caption trước khi đưa gói.

/** Nhóm: chat_type ghi rõ nhóm; không có thì chat.id khác id người gửi. */
export function isGroup(u) {
  if (u.chatType) return /group/i.test(u.chatType);
  return Boolean(u.userId && u.chatId && u.userId !== u.chatId);
}

/**
 * Gắn tên người hỏi ở đầu tin ra trong nhóm (FR-031).
 * Nếu trong nhóm có từ 2 người khác nhau cùng tên, thêm hậu tố 2 ký tự cuối userId để phân biệt.
 * @param {{ isGroup?: boolean, userName?: string|null, userId?: string|null, members?: Array<{userId?:string|null, displayName?:string|null}> }} o
 * @returns {string} "@<tên>\n" hoặc "@<tên> ·<xx>\n"; rỗng nếu không phải nhóm hoặc không có tên.
 */
export function groupNameTag({ isGroup = false, userName = null, userId = null, members = [] } = {}) {
  if (isGroup !== true) return '';
  const name = String(userName ?? '').trim();
  if (!name) return '';
  const uid = String(userId ?? '').trim();
  const ids = new Set();
  for (const m of members ?? []) {
    if (!m) continue;
    const mid = String(m.userId ?? '').trim();
    if (!mid) continue;                       // dòng không có userId thì bỏ qua
    if (String(m.displayName ?? '').trim() === name) ids.add(mid);
  }
  if (uid) ids.add(uid);                     // người đang gắn cũng thuộc nhóm trùng tên
  if (!uid || ids.size < 2) return `@${name}\n`;
  return `@${name} ·${uid.slice(-2)}\n`;
}

/** Bỏ phần nhắc tên bot ("@OZ Tra cứu HS …") ở đầu/cuối tin. */
export function stripMention(text, botNames = []) {
  let t = String(text || '').trim();
  const names = botNames.filter(Boolean).map((n) => String(n).trim()).sort((a, b) => b.length - a.length);
  for (const n of names) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`^@?${esc}[\\s,:;-]*`, 'i'), '').replace(new RegExp(`[\\s,]*@${esc}$`, 'i'), '');
  }
  if (/^@\S+/.test(t) && !names.length) t = t.replace(/^@\S+[\s,:;-]*/, '');
  return t.trim();
}
