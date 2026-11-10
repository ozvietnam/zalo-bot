// packs/hs/index.js — gói "Tra cứu hải quan" (7 gói con) theo specs/001-nen-tang-chung/contracts/pack.md.
// Cùng hành vi với lib/bot.js cũ, trừ ba thứ của lõi: chống trùng/giới hạn/ALLOW_USERS, bỏ "@Tên bot", thêm "@tên" trong nhóm.
// Không gửi tin, không chờ việc nền: gặp DANG_XU_LY thì chỉ trả jobs (không câu chờ), lõi hỏi kết quả rồi gọi onJobResult.
//
// Tệp này là "cửa" của gói (handle + onJobResult). Luồng tin chữ nằm ở `luong-chu.js`, cách chạy một
// gói con (trên hồ sơ gộp) ở `chay-goi.js` — Điều VI: mỗi tệp một trách nhiệm, dưới 300 dòng.
import { PACKAGES, availablePackages, menuText, hetHan } from './packages.js';
import { renderResult, clipReply } from './render.js';
import { photoFlow } from './flow-photo.js';
import { loiAnhChoKhach } from './vision.js';
import { openTurn, result } from './flow-turn.js';
import { textFlow } from './luong-chu.js';
import { dongHoSoCuaTin } from './chay-goi.js';
import { layHoSo, duDeTra } from './ho-so.js';

const JOB_TTL_MS = 30 * 60_000;   // lõi bỏ chờ việc nền sau 30 phút (core/jobs.js); câu hết hạn ghi đúng số phút

/** @type {import('../../core/types.js').Pack} */
export default {
  id: 'hs',
  ten: 'Tra cứu hải quan',
  version: '1.0.0',
  audience: 'public',
  moneyCheck: false,
  requiresTools: [],   // "gói con chỉ hiện khi Cổng có công cụ" vẫn lọc trong availablePackages
  priority: 0,

  /** Gói dự phòng: nhận mọi tin mà gói ưu tiên cao hơn bỏ qua. */
  match() { return true; },

  async handle(turn, ctx) {
    const st = openTurn(ctx);
    try {
      // Tin trống ("@bot" trơ trọi, tin 10:00 của issue #170): có hồ sơ đang xử lý thì textFlow
      // chạy tiếp trên hồ sơ đó; không có hồ sơ thì giữ hành vi cũ.
      if (!turn.photoUrl && !turn.text && !duDeTra(layHoSo(st.session))) {
        return result(st, turn.isGroup ? [] : ['Bot đọc tin nhắn chữ và ảnh. Gõ "menu" để xem các gói tra cứu.']);
      }
      if (turn.photoUrl) {
        try { return await photoFlow(turn, ctx, st); } catch (e) {
          ctx.log?.error?.(`[hs] lỗi ảnh: ${e.message}`);
          // KHÔNG lộ lỗi gốc (tiếng Anh của Gemini, stack, địa chỉ nội bộ) cho khách.
          return result(st, [`⚠️ ${loiAnhChoKhach(e)}, hoặc gõ tên hàng + thông số bằng chữ giúp bot nhé.\n\n${st.footer}`]);
        }
      }
      return await textFlow(turn, ctx, st);
    } finally {
      st.save();
    }
  },

  /** result = kết quả resultTool khi đã hết DANG_XU_LY; null/undefined = hết hạn (lõi không chờ nữa). */
  async onJobResult(job, res, ctx) {
    const st = openTurn(ctx);
    try {
      const c = job.context || {};
      // Một mạch một việc nền (yêu cầu 6 của issue #170). Phép thử: mạch đã giao lượt phân loại
      // MỚI HƠN lượt của việc này chưa? Chỉ khi đó mới bỏ kết quả — vì chỉ khi đó mới chắc có kết
      // quả khác thay nó. Bỏ mà không có gì thay thế thì bot nợ kết quả đã hứa rồi im (Điều II).
      //   1. số lượt (`luotSo`) là chốt chính: đúng cả khi Cổng trả lại cùng một mã lượt.
      //   2. mã lượt khác lượt mới nhất: chốt phụ cho việc nền còn sống từ bản cũ (chưa có `luotSo`).
      //   3. `dauHoSo` chỉ còn là DỰ PHÒNG khi phiên không còn dấu lượt nào (việc nền dựng lại sau
      //      khởi động lại). Dùng nó làm chốt chính là lỗi [S17]: `index.js` cập nhật hồ sơ cho MỌI
      //      tin chữ, kể cả tin chỉ hỏi thêm ("thuế nhập khẩu bao nhiêu phần trăm ạ") không mở lượt
      //      nào — `dau` tăng oan và mã HS đã hứa không bao giờ tới khách.
      const hoSoNay = layHoSo(st.session);
      const viecMoiNhat = st.session.viecGoi1;
      const luotMoiNhat = st.session.soLuotGoi1;
      const boKetQua = (ly) => {
        ctx.log?.info?.(`[hs] bỏ kết quả cũ: ${ly}`);
        return result(st, [], { calls: [] });
      };
      if (c.goi === 1 && typeof c.luotSo === 'number' && typeof luotMoiNhat === 'number' && luotMoiNhat > c.luotSo) {
        return boKetQua(`mạch đã giao lượt mới (lượt ${c.luotSo} → ${luotMoiNhat})`);
      }
      if (c.goi === 1 && typeof c.luotSo !== 'number' && viecMoiNhat && job.maLuot && viecMoiNhat !== job.maLuot) {
        return boKetQua(`mạch đã có lượt mới (…${String(job.maLuot).slice(-4)} → …${String(viecMoiNhat).slice(-4)})`);
      }
      if (c.goi === 1 && typeof luotMoiNhat !== 'number' && !viecMoiNhat
        && typeof c.dauHoSo === 'number' && (hoSoNay.dau ?? 0) > c.dauHoSo) {
        return boKetQua(`hồ sơ đã đổi (dấu ${c.dauHoSo} → ${hoSoNay.dau})`);
      }
      const r = res == null ? hetHan(job.maLuot, JOB_TTL_MS) : { ...res, maLuot: job.maLuot };
      const pkg = PACKAGES.find((p) => p.so === c.goi);
      const raw = pkg?.xong ? await pkg.xong(r, c, st.pctx({ hoSo: hoSoNay })) : renderResult(r, { title: `📥 Kết quả lượt ${job.maLuot}` });
      // Dòng hồ sơ ở ĐẦU tin khi đã chốt mã (yêu cầu 5): tối đa 2 dòng, dựng lúc giao việc.
      const dong = c.goi === 1 ? (dongHoSoCuaTin(hoSoNay) || c.dongHoSo || '') : '';
      const body = dong ? `${dong}\n\n${raw}` : raw;
      const calls = [{ name: job.resultTool, args: {}, result: r }];
      // Giọng Quyên (issue #136, mục 2 & 3): gói 1 ở chế độ tự do giọng Quyên không dán footer "Gõ menu"
      const textOut = (c.goi === 1 && c.giongQuyen && !c.chonNhanh)
        ? clipReply(body)
        : clipReply(`${c.head || ''}${body}\n\n${st.footer}`);
      return result(st, [textOut], { known: c, calls });
    } finally {
      st.save();
    }
  },

  footer(ctx) { return menuText(availablePackages(ctx?.tools ?? null)); },
};
