// packs/hs/flow-photo.js — lượt ảnh của gói hs (như handlePhoto trong lib/bot.js cũ).
// Gói 6 → kiểm nhãn hiệu bằng ảnh logo; còn lại → đọc thông số (Gemini) để người dùng xác nhận trước khi tra.
import { renderResult, clipReply } from './render.js';
import { specsToText } from './vision.js';
import { result } from './flow-turn.js';

/** Lỗi ném ra để index.js trả câu "Chưa đọc được ảnh" như cũ. Caption: lõi đã bỏ "@Tên bot". */
export async function photoFlow(turn, ctx, st) {
  const tn = ctx.tools ?? null;
  const s = st.session;
  const footer = st.footer;
  if (s.goi === 6 && (!tn || tn.has('kiem_tra_shtt_anh'))) {
    const k = await st.mcp.callTool('kiem_tra_shtt_anh', { urlAnh: turn.photoUrl });
    return result(st, [clipReply(`${renderResult(k, { title: '®️ So logo với nhãn hiệu đã đăng ký (CN, VN)' })}\nℹ️ So hình bằng máy, chỉ để tham khảo, không phải ý kiến pháp lý.\n\n${footer}`)]);
  }
  if (!ctx.vision) {
    const shtt = !tn || tn.has('kiem_tra_shtt_anh') ? '\n• Muốn kiểm nhãn hiệu bằng ảnh logo: gõ "6" rồi gửi ảnh.' : '';
    return result(st, [`📷 Bot chưa bật đọc thông số từ ảnh.\n• Gõ tên hàng + thông số bằng chữ để phân loại.${shtt}\n\n${footer}`]);
  }
  const sp = await ctx.vision.readSpecs(turn.photoUrl, turn.caption || '');
  const mau = specsToText(sp);
  if (!mau) {
    return result(st, [`📷 Không đọc được thông số rõ ràng từ ảnh. Bạn gõ tên hàng + thông số bằng chữ giúp bot nhé.\n\n${footer}`]);
  }
  s.choXacNhanAnh = mau;
  const l = ['📷 Thông số bot đọc được từ ảnh:', '', mau];
  if (sp.chuTrongAnh) l.push('', `Chữ trong ảnh: "${String(sp.chuTrongAnh).slice(0, 300)}"`);
  if (Array.isArray(sp.khongChac) && sp.khongChac.length) l.push(`⚠️ Chưa chắc: ${sp.khongChac.slice(0, 5).join('; ')}`);
  l.push('', '👉 Đúng thì gõ "ok" để phân loại mã HS.', '👉 Sai/thiếu: copy khung trên, sửa rồi gửi lại.', 'ℹ️ Đọc ảnh bằng AI có thể nhầm — luôn kiểm lại trước khi dùng.');
  if (!tn || tn.has('kiem_tra_shtt_anh')) l.push('(Ảnh logo/nhãn hiệu? Gõ "6" rồi gửi lại ảnh để kiểm sở hữu trí tuệ.)');
  return result(st, [clipReply(`${l.join('\n')}\n\n${footer}`)]);
}
