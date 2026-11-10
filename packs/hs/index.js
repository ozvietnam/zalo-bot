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
import { phanTichCanCu, khoiCanCuDayDu } from './can-cu.js';
import { fmtHs } from './format.js';
import { xungHoCuaKhach } from './xung-ho.js';
import { cauTienDo } from './jobs.js';

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
  // `xungHo` đi theo việc nền để câu báo tiến độ (onJobProgress) gọi khách đúng như trong lượt.
  const job = { ...t.job, context: { goi: pkg.so, head: pkg.so === 1 ? '' : head, xungHo: st.session.xungHo || null, ...b.context } };
  // Báo "đang tra" (issue #136 mục 5): lượt phải nhờ Cổng chạy nền thì khách nhận NGAY một câu ngắn,
  // không ngồi im 1–3 phút. Câu do gói con soạn trong `batDau` (ở đó mới biết luồng nào được phép im).
  const cauCho = b.cauCho || null;
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
      case 'can-cu': {   // khách xin căn cứ pháp lý đầy đủ (issue #136 mục B)
        const maHs = s.last?.maHs;
        if (!maHs) {
          return one('Dạ hiện chưa có mã HS nào trong phiên này để em nêu căn cứ ạ. Anh/chị gửi mô tả hàng hoặc mã HS trước, em tra rồi dẫn căn cứ nhé.');
        }
        // Tra LẠI Cổng trong chính lượt này (ba công cụ đều miễn phí theo docs/hop-dong/cong-cu-cong-oz.md):
        // vừa đúng luật "chỉ trích số văn bản có trong dữ liệu Cổng của chính lượt đó", vừa lấy tình trạng
        // hiệu lực mới nhất — căn cứ pháp lý đọc từ bộ nhớ phiên có thể đã cũ.
        const tn = ctx.tools;
        const coCongCu = (n) => !tn || tn.has(n);
        // Xuất xứ phải là xuất xứ lô hàng của chính khách. Trước đây mặc định 'CN' khi không biết, nên
        // khách tra hàng KR rồi gõ "căn cứ" lại nhận căn cứ ACFTA + lời mời C/O mẫu E cho lô không được
        // hưởng ([S1] của #168). Giờ: không biết thì KHÔNG gửi xuất xứ nào và bỏ hẳn căn cứ FTA, kèm một
        // câu hỏi lại để khách cho biết nước xuất xứ.
        const xxBiet = s.last?.xuatXuBiet ? s.last.xuatXu : null;
        const [thue, thuTuc, tienLe] = await Promise.all([
          coCongCu('tra_thue') ? st.mcp.callTool('tra_thue', xxBiet ? { maHs, xuatXu: xxBiet } : { maHs }).catch(() => null) : null,
          coCongCu('tra_thu_tuc_nhap_khau') ? st.mcp.callTool('tra_thu_tuc_nhap_khau', { maHs }).catch(() => null) : null,
          coCongCu('tra_tien_le') ? st.mcp.callTool('tra_tien_le', { maHs }).catch(() => null) : null,
        ]);
        const khoi = khoiCanCuDayDu(phanTichCanCu({ thue, thuTuc, tienLe, boFta: !xxBiet }));
        if (!khoi) return one(`Dạ Cổng OZ chưa ghi nhận căn cứ pháp lý cho mã ${fmtHs(maHs)} ạ. Em không nêu số văn bản khi chưa có dữ liệu để tránh dẫn sai.`);
        const xh = s.xungHo || 'anh/chị';
        // Chưa biết xuất xứ: đã bỏ căn cứ FTA ở trên, nên phải nói rõ và hỏi lại, không im lặng bỏ qua.
        const hoiXx = xxBiet ? '' : `\n\nƯu đãi thuế theo hiệp định (FTA) phụ thuộc xuất xứ nên em chưa nêu ạ. ${xh} cho em biết hàng từ nước nào, em tra lại căn cứ ưu đãi nhé.`;
        return one(clipReply(`Dạ căn cứ của mã ${fmtHs(maHs)} ạ:\n\n${khoi}${hoiXx}`));
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
      // Xưng hô của khách (issue #136 mục 4): chốt MỘT lần đầu lượt rồi để trong phiên, vì câu chờ,
      // câu kết quả và câu báo tiến độ (ở lượt khác, qua việc nền) đều phải gọi khách y như nhau.
      st.session.xungHo = xungHoCuaKhach({ customer: ctx.customer, session: st.session, text: turn.text || turn.caption || '' });
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

  /**
   * Việc nền chạy quá lâu (lõi gọi khi quá `PROGRESS_AFTER_MS`, ĐÚNG MỘT LẦN — `core/jobs.js`).
   * Gói soạn câu nhắc ngắn; lõi chỉ gửi. Không gọi Cổng, không ghi phiên: đây chưa phải kết quả.
   */
  async onJobProgress(job) {
    const xungHo = job?.context?.xungHo || undefined;
    return { replies: [{ text: cauTienDo(xungHo) }], evidence: [], jobs: [], handoff: null, labels: [], interests: [] };
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
