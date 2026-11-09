// packs/hs/index.js — gói "Tra cứu hải quan" (7 gói con) theo specs/001-nen-tang-chung/contracts/pack.md.
// Cùng hành vi với lib/bot.js cũ, trừ ba thứ của lõi: chống trùng/giới hạn/ALLOW_USERS, bỏ "@Tên bot", thêm "@tên" trong nhóm.
// Không gửi tin, không chờ việc nền: gặp DANG_XU_LY thì chỉ trả jobs (không câu chờ), lõi hỏi kết quả rồi gọi onJobResult.
import { routeThongMinh } from './brain.js';
import { PACKAGES, availablePackages, menuText, toJob, hetHan } from './packages.js';
import { renderResult, clipReply } from './render.js';
import { norm } from './input.js';
import { photoFlow } from './flow-photo.js';
import { loiAnhChoKhach } from './vision.js';
import { openTurn, result } from './flow-turn.js';

const JOB_TTL_MS = 30 * 60_000;   // lõi bỏ chờ việc nền sau 30 phút (core/jobs.js); câu hết hạn ghi đúng số phút

const OK_RE = /^(ok|oke|okay|dung|chuan|xac nhan|dong y|yes|y|uh|u|vang)[.!]*$/;
const ANH_RE = /(ten hang|thong so|model|thuong hieu|chat lieu)\s*:/;

/** Chạy một gói con. Gói có batDau (1, 4) không chờ: DANG_XU_LY → job; còn lại → chữ trả lời như cũ. */
async function runPkg(st, pkg, text, { head = '', nguonThongSo } = {}) {
  const pctx = st.pctx(nguonThongSo ? { nguonThongSo } : {});
  const boQuaTrangTri = pkg.so === 1 || (pkg.so === 2 && Boolean(st.session.banDayDuPhanLoai));
  const headPkg = boQuaTrangTri ? '' : head;
  const footerPkg = boQuaTrangTri ? '' : `\n\n${st.footer}`;
  const reply = (body, known) => result(st, [clipReply(`${headPkg}${body}${footerPkg}`)], { known });
  if (!pkg.batDau) return reply(await pkg.chay(text, pctx));
  const b = await pkg.batDau(text, pctx);
  if (typeof b === 'string') return reply(b);
  const t = toJob(b.r, b.resultTool, pctx);
  if (!t.job) return reply(await pkg.xong(t.result, b.context, pctx), b.context);
  // Kết quả phân loại (gói 1) theo form "🔍 Hàng: …" — không kèm dòng "(Tự động chọn gói 1)".
  const job = { ...t.job, context: { goi: pkg.so, head: pkg.so === 1 ? '' : head, ...b.context } };
  // Báo đang tra (issue #136, mục 5): trong 3 giây gửi 1 câu ngắn kiểu "Dạ anh chờ em tra chút nhé"
  // Áp dụng cho luồng giọng Quyên (hỏi lại / tra hs) khi không phải chonNhanh và không phải bổ sung dữ kiện
  const laHoiLaiTraHs = Boolean(b.context?.daHoiLai || b.context?.giaDinh || /tra\s*hs/i.test(b.context?.cauMoi || ''));
  const cauCho = (pkg.so === 1 && b.context?.giongQuyen && laHoiLaiTraHs && !b.context?.chonNhanh && !b.context?.boSung) ? (b.cauCho || 'Dạ anh chờ em tra chút nhé') : null;
  return result(st, cauCho ? [cauCho] : [], { jobs: [job], known: b.context });
}

async function textFlow(turn, ctx, st) {
  const text = String(turn.text);
  const s = st.session;
  const phanLoai = st.pkgs.find((p) => p.id === 'phan-loai');
  // Đang chờ xác nhận thông số đọc từ ảnh: "ok/đúng" → phân loại bằng đúng nội dung đó (nguồn ẢNH).
  if (s.choXacNhanAnh && OK_RE.test(norm(text))) {
    const pending = s.choXacNhanAnh;
    s.choXacNhanAnh = null;
    if (phanLoai) return runPkg(st, phanLoai, pending, { nguonThongSo: 'ANH' });
  }
  if (s.choXacNhanAnh && !/^\d$/.test(text.trim())) {
    // Người dùng gửi bản đã sửa → coi như mô tả mới cho gói 1, nguồn vẫn là ảnh đã được người dùng chỉnh.
    s.choXacNhanAnh = null;
    if (phanLoai && ANH_RE.test(norm(text))) return runPkg(st, phanLoai, text, { nguonThongSo: 'ANH' });
  }
  if (s.choBoSung && !s.goi) s.goi = 1;   // đang trả lời câu hỏi bổ sung của gói 1
  // Não hiểu câu hỏi (ctx.brain) chỉ hỏi ở chế độ TỰ ĐỘNG; lỗi/không chắc → routeThongMinh tự về regex.
  const r = await routeThongMinh(text, { session: s, pkgs: st.pkgs, brain: ctx.brain ?? null });
  const one = (t) => result(st, [t]);

  try {
    switch (r.kind) {
      case 'menu':
        s.banDayDuPhanLoai = null;
        return one(`{b}🤖 Bot tra cứu hải quan OZ{/b}\n\n${menuText(st.pkgs, { full: true })}\n\nHoặc cứ gõ mã HS / mô tả hàng, bot tự chọn gói.`);
      case 'chao':   // lời chào: ngắn + menu rút gọn (dán menu 900 ký tự vào câu chào là ấn tượng xấu nhất)
        return one(`{b}🤖 Chào anh/chị!{/b} Em là bot tra cứu hải quan OZ đây ạ.\n\n${menuText(st.pkgs, { compact: true })}\n\nAnh/chị cứ gõ mã HS hoặc mô tả hàng (tên, chất liệu, công dụng, thông số), em tra giúp.`);
      case 'tu-dong':
        s.goi = null;
        s.banDayDuPhanLoai = null;
        return one(`{b}🔄 Đã chuyển sang chế độ TỰ ĐỘNG:{/b} bot đoán gói theo nội dung bạn gõ.\n\n${st.footer}`);
      case 'chon':
        s.goi = r.pkg.so;
        s.banDayDuPhanLoai = null;
        // Vừa phân loại xong (phiên có mã + tên hàng) mà gõ "2"/"3" → chạy luôn với mã vừa tra, không bắt gõ lại theo mẫu.
        if ((r.pkg.so === 2 || r.pkg.so === 3) && s.last?.maHs && (r.pkg.so === 2 || s.last.tenHang)) {
          return runPkg(st, r.pkg, '', { head: `{b}${r.pkg.icon} Gói ${r.pkg.so}: ${r.pkg.ten} — mã vừa tra{/b}\n\n` });
        }
        return one(`{b}${r.pkg.icon} Gói ${r.pkg.so}: ${r.pkg.ten}{/b}\n${r.pkg.moTa}\n\n{b}Gửi thông tin theo mẫu:{/b}\n${r.pkg.mau}\n\n${st.footer}`);
      case 'ket-qua': {
        const tn = ctx.tools;
        const tool = !tn || tn.has('ket_qua_phan_loai') ? 'ket_qua_phan_loai' : 'ket_qua_soat';
        let k = await st.mcp.callTool(tool, { maLuot: r.maLuot });
        if (k?.ok === false && tool === 'ket_qua_phan_loai' && (!tn || tn.has('ket_qua_soat'))) k = await st.mcp.callTool('ket_qua_soat', { maLuot: r.maLuot });
        return one(clipReply(`${renderResult(k, { title: `📥 Kết quả lượt ${r.maLuot}` })}\n\n${st.footer}`));
      }
      case 'chay': {
        if (r.chon) s.goi = r.pkg.so;
        const boQuaHead = (r.pkg.so === 1) || (r.pkg.so === 2 && Boolean(s.banDayDuPhanLoai));
        const head = (r.tuDong && !boQuaHead) ? `{b}${r.pkg.icon} (Tự động chọn gói ${r.pkg.so}: ${r.pkg.ten}){/b}\n\n` : '';
        const out = await runPkg(st, r.pkg, r.text, { head });
        ctx.log?.info?.(`[hs] gói ${r.pkg.so} chat=${String(turn.chatId ?? '').slice(-4)}`);
        return out;
      }
      case 'chi-tiet':   // mở lại bản phân tích đầy đủ của lượt phân loại gần nhất (khách cuộn mất tin)
        return one(s.chiTiet?.text
          ? `🔎 Bản chi tiết lượt gần nhất:\n\n${clipReply(s.chiTiet.text)}`
          : 'Chưa có kết quả phân loại nào trong phiên này để mở chi tiết. Anh/chị gửi mô tả hàng hoặc mã HS trước rồi gõ "chi tiết" nhé.');
      case 'hoi-lai':   // não hỏi lại một câu thay vì đoán mò chạy gói
        return one(`❓ ${r.cauHoi}`);
      case 'khac':      // chào hỏi/xã giao: não trả lời ngắn, dẫn về menu
        return one(`${r.cauDan}\n\n${st.footer}`);
      default:   // 'ignore' (tin rỗng) và loại lạ: không trả lời
        return result(st, []);
    }
  } catch (e) {
    ctx.log?.error?.(`[hs] lỗi (${r.kind}${r.pkg ? ` gói ${r.pkg.so}` : ''}): ${e.message}`);   // chi tiết chỉ vào log (lõi che bí mật)
    return one(`{orange}⚠️ Cổng tra cứu OZ đang lỗi tạm thời{/orange}. Bạn thử lại sau ít phút nhé.\n\n${st.footer}`);   // Hiến pháp IX: không kèm lỗi gốc
  }
}

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
      if (!turn.photoUrl && !turn.text) {
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
      const r = res == null ? hetHan(job.maLuot, JOB_TTL_MS) : { ...res, maLuot: job.maLuot };
      const pkg = PACKAGES.find((p) => p.so === c.goi);
      const body = pkg?.xong ? await pkg.xong(r, c, st.pctx()) : renderResult(r, { title: `📥 Kết quả lượt ${job.maLuot}` });
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
