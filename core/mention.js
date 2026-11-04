// "@Tên bot" và nhận diện nhóm (chuyển từ lib/bot.js). Lõi bỏ nhắc tên ở cả text và caption trước khi đưa gói.

/** Nhóm: chat_type ghi rõ nhóm; không có thì chat.id khác id người gửi. */
export function isGroup(u) {
  if (u.chatType) return /group/i.test(u.chatType);
  return Boolean(u.userId && u.chatId && u.userId !== u.chatId);
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
