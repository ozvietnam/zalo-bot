// packs/hs/flow-photo.js — lượt ảnh của gói hs (như handlePhoto trong lib/bot.js cũ).
// Gói 6 → kiểm nhãn hiệu bằng ảnh logo; còn lại → đọc thông số (Gemini) để người dùng xác nhận trước khi tra.
import { clipReply } from './render.js';
import { renderShtt } from './render-shtt.js';
import { specsToText } from './vision.js';
import { result } from './flow-turn.js';
import { trenHoSo, themCauDan } from './chay-goi.js';
import { layHoSo, themAnh, mauThuan, dongDangTra, duDeTra } from './ho-so.js';

/** Lỗi ném ra để index.js trả câu "Chưa đọc được ảnh" như cũ. Caption: lõi đã bỏ "@Tên bot". */
export async function photoFlow(turn, ctx, st) {
  const tn = ctx.tools ?? null;
  const s = st.session;
  const footer = st.footer;
  if (s.goi === 6 && (!tn || tn.has('kiem_tra_shtt_anh'))) {
    const k = await st.mcp.callTool('kiem_tra_shtt_anh', { urlAnh: turn.photoUrl });
    // renderShtt tự dán câu miễn trừ "So logo bằng máy…" đúng MỘT lần (issue #169).
    const tieuDe = '{b}®️ So logo với nhãn hiệu đã đăng ký (CN, VN){/b}';
    s.chiTiet = { text: `${tieuDe}\n${renderShtt(k, { anh: true, chiTiet: true })}`, at: Date.now() };
    return result(st, [clipReply(`${tieuDe}\n${renderShtt(k, { anh: true })}\n\n${footer}`)]);
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
  // Ảnh là BỔ SUNG cho hồ sơ mặt hàng của mạch, không thay mô tả chữ khách đã gửi (issue #170, yêu cầu 1).
  const hoSoTruoc = layHoSo(s);
  const hoSo = themAnh(hoSoTruoc, sp, turn.caption || '');
  // Ảnh có thêm DỮ KIỆN MẶT HÀNG nào không? So các ô có cấu trúc của hồ sơ, KHÔNG so dấu hồ sơ
  // (`dau`) và cũng không so cả `moTaGop`: một chú thích đàm thoại ("ảnh tem thông số, anh xem
  // giúp") làm `dau` tăng và nằm trong mục "khách nói thêm" của `moTaGop` nhưng không nói gì thêm
  // về mặt hàng. Dùng hai phép so kia thì mỗi ảnh lại mở một lượt phân loại mới, mà mỗi lượt là
  // tiền thật (báo cáo OZV-326: `phan_loai_hs` 3 điểm/lượt).
  const oHoSo = (h) => JSON.stringify([h.moTa, h.chatLieu, h.congDung, h.thongSo, h.thuongHieu, h.model]);
  const anhThemDuKien = oHoSo(hoSo) !== oHoSo(hoSoTruoc);
  s.hoSo = hoSo;
  // Ảnh ngược hướng mô tả chữ (chữ "ON OFF" trên núm ↔ chốt kẹp cơ khí) → HỎI LẠI MỘT CÂU,
  // không tự chọn bên ảnh (issue #170, yêu cầu 1).
  const mt = mauThuan(hoSo);
  if (mt) {
    s.hoSo = { ...hoSo, choTraLoi: true };
    // Thôi chờ "ok cho thông số ảnh" (câu bot gửi là câu HỎI LẠI, không phải câu xin xác nhận),
    // nhưng phải báo Lõi là bot đang chờ khách đáp: cửa chào kết của Lõi (`core/engine.js`) nuốt
    // "ok"/"vâng"/"dạ" nếu không có cờ này, và câu hỏi lại thành vô ích (điểm [S12] của người soát).
    s.choXacNhanAnh = null;
    s.choKhachTraLoi = true;
    const ll = ['📷 Thông số bot đọc được từ ảnh:', '', mau];
    if (sp.chuTrongAnh) ll.push('', `Chữ trong ảnh: "${String(sp.chuTrongAnh).slice(0, 300)}"`);
    ll.push('', `❓ ${mt.cauHoi}`, '', 'ℹ️ Đọc ảnh bằng AI có thể nhầm — luôn kiểm lại trước khi dùng.');
    return result(st, [clipReply(ll.join('\n'))]);
  }
  const l = ['📷 Thông số bot đọc được từ ảnh:', '', mau];
  if (sp.chuTrongAnh) l.push('', `Chữ trong ảnh: "${String(sp.chuTrongAnh).slice(0, 300)}"`);
  if (Array.isArray(sp.khongChac) && sp.khongChac.length) l.push(`⚠️ Chưa chắc: ${sp.khongChac.slice(0, 5).join('; ')}`);

  // ẢNH ĐI CHUNG HỒ SƠ (issue #177, yêu cầu 4). Ảnh tới TRONG LÚC lượt phân loại của mạch còn
  // chạy = khách đang bổ sung dữ kiện cho CHÍNH món đang tra, không mở việc mới. Trước bản vá bot
  // xin "gõ ok" lần nữa, nên khách nhận HAI kết quả cho một món (lượt cũ không có ảnh + lượt sau
  // "ok"), tốn hai lượt điểm Cổng và mất thêm một lượt hỏi–đáp.
  // Phân loại lại NGAY trên hồ sơ gộp; kết quả lượt cũ tự bị bỏ bằng cơ chế đếm lượt đã có
  // (`luotSo`, yêu cầu 6 của #170) nên một mạch vẫn chỉ trả MỘT kết quả.
  // Chỉ làm khi lượt còn CHẠY: lượt đã trả kết quả rồi thì giữ đường xin xác nhận như cũ —
  // tự mở lượt mới sau khi khách đã có mã là tiêu điểm Cổng ngoài ý khách.
  const phanLoai = st.pkgs.find((p) => p.id === 'phan-loai');
  if (phanLoai && duDeTra(hoSo) && anhThemDuKien && st.session.choKetQuaGoi1 != null) {
    s.choXacNhanAnh = null;
    return themCauDan(await trenHoSo(st, phanLoai, hoSo, { cauKhach: turn.caption || null }),
      clipReply(l.join('\n')));
  }

  if (duDeTra(hoSo)) l.push('', dongDangTra(hoSo));
  l.push('', '👉 Đúng thì gõ "ok" để phân loại mã HS.', '👉 Sai/thiếu: copy khung trên, sửa rồi gửi lại.', 'ℹ️ Đọc ảnh bằng AI có thể nhầm — luôn kiểm lại trước khi dùng.');
  if (!tn || tn.has('kiem_tra_shtt_anh')) l.push('(Ảnh logo/nhãn hiệu? Gõ "6" rồi gửi lại ảnh để kiểm sở hữu trí tuệ.)');
  return result(st, [clipReply(`${l.join('\n')}\n\n${footer}`)]);
}
