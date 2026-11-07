// Cuộc trò chuyện (US8, FR-030): khoá theo NGƯỜI. Chat 1-1 → chatId; trong nhóm → chatId:userId.
// Mọi mô-đun lấy convId từ hàm này, không tự ghép chuỗi.
import { isGroup as groupOf } from './mention.js';

/**
 * @param {{ chatId: string, userId?: string|null, isGroup?: boolean, chatType?: string|null }} u
 *   isGroup (boolean) nếu người gọi đã biết; không có thì dùng đúng luật của lõi (mention.isGroup).
 * @returns {string}
 */
export function convIdOf(u) {
  const chatId = u?.chatId;
  if (chatId === null || chatId === undefined || chatId === '') throw new Error('convIdOf: thiếu chatId');
  const group = typeof u.isGroup === 'boolean' ? u.isGroup : groupOf(u);
  // Nhóm mà không có userId thì không phân biệt được người: dùng cả nhóm (không bao giờ "chat:null").
  if (!group || u.userId === null || u.userId === undefined || u.userId === '') return String(chatId);
  return `${chatId}:${u.userId}`;
}
