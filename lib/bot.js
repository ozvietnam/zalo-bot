// lib/bot.js — xử lý một update Zalo: lọc, chống trùng, giới hạn lượt, chọn gói, gọi Cổng OZ (MCP), trả lời + menu gói.
import { parseUpdate } from './zalo.js';
import { routeThongMinh } from './brain.js';
import { availablePackages, menuText, PACKAGES } from './packages.js';
import { renderResult, clipReply } from './render.js';
import { specsToText, loiAnhChoKhach } from './vision.js';
import { norm } from './input.js';
import { b } from './style.js';

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

export function createBot({ zalo, mcp, vision = null, brain = null, editor = null, log = console, rateLimitPerMin = 10, allowUsers = [], botNames = [], sessionTtlMs = 2 * 3600_000, pollMs, missLog = null } = {}) {
  const ghiTruot = missLog ? (loai, info) => missLog.ghi(loai, info) : null;
  const seen = new Map();
  const hits = new Map();
  const sessions = new Map();     // key chat(+người trong nhóm) → { goi, last, at }
  const allow = new Set(allowUsers.filter(Boolean));
  const names = Array.isArray(botNames) ? botNames : [];
  let toolNames = null;
  let toolsAt = 0;

  async function tools() {
    if (toolNames && Date.now() - toolsAt < 10 * 60_000) return toolNames;
    try {
      const list = await mcp.listTools();
      toolNames = new Set(list.map((t) => t.name));
      toolsAt = Date.now();
    } catch (e) {
      log.error?.(`[mcp] không lấy được danh sách công cụ: ${e.message}`);
    }
    return toolNames;
  }

  function dedupe(id) {
    if (!id) return false;
    const now = Date.now();
    if (seen.has(id)) return true;
    seen.set(id, now);
    if (seen.size > 5000) for (const [k, t] of seen) { if (now - t > 3600_000) seen.delete(k); }
    return false;
  }

  function limited(uid) {
    const now = Date.now();
    const arr = (hits.get(uid) || []).filter((t) => now - t < 60_000);
    arr.push(now);
    hits.set(uid, arr);
    return arr.length > rateLimitPerMin;
  }

  function sessionOf(key) {
    const s = sessions.get(key);
    if (s && Date.now() - s.at < sessionTtlMs) { s.at = Date.now(); return s; }
    const ns = { goi: null, last: null, at: Date.now() };
    sessions.set(key, ns);
    return ns;
  }

  /** Ảnh: gói 6 → kiểm nhãn hiệu bằng ảnh logo; còn lại → đọc thông số (Gemini) để người dùng xác nhận. */
  async function handlePhoto(u, session, pkgs, footer, send) {
    const tn = toolNames;
    if (session.goi === 6 && (!tn || tn.has('kiem_tra_shtt_anh'))) {
      zalo.sendChatAction(u.chatId, 'typing');
      const k = await mcp.callTool('kiem_tra_shtt_anh', { urlAnh: u.photoUrl });
      await send(clipReply(`${renderResult(k, { title: '®️ So logo với nhãn hiệu đã đăng ký (CN, VN)' })}\nℹ️ So hình bằng máy, chỉ để tham khảo, không phải ý kiến pháp lý.\n\n${footer}`));
      return { handled: 'shtt-anh' };
    }
    if (!vision) {
      const shtt = !tn || tn.has('kiem_tra_shtt_anh') ? '\n• Muốn kiểm nhãn hiệu bằng ảnh logo: gõ "6" rồi gửi ảnh.' : '';
      await send(`📷 Bot chưa bật đọc thông số từ ảnh.\n• Gõ tên hàng + thông số bằng chữ để phân loại.${shtt}\n\n${footer}`);
      return { handled: 'photo-no-vision' };
    }
    zalo.sendChatAction(u.chatId, 'typing');
    const s = await vision.readSpecs(u.photoUrl, u.caption ? stripMention(u.caption, names) : '');
    const mau = specsToText(s);
    if (!mau) {
      await send(`📷 Không đọc được thông số rõ ràng từ ảnh. Bạn gõ tên hàng + thông số bằng chữ giúp bot nhé.\n\n${footer}`);
      return { handled: 'photo-empty' };
    }
    session.choXacNhanAnh = mau;
    const l = ['{b}📷 Thông số bot đọc được từ ảnh:{/b}', '', mau];
    if (s.chuTrongAnh) l.push('', `Chữ trong ảnh: "${String(s.chuTrongAnh).slice(0, 300)}"`);
    if (Array.isArray(s.khongChac) && s.khongChac.length) l.push(`{orange}⚠️ Chưa chắc: ${s.khongChac.slice(0, 5).join('; ')}{/orange}`);
    l.push('', '{b}👉 Đúng thì gõ "ok"{/b} để phân loại mã HS.', '{b}👉 Sai/thiếu:{/b} copy khung trên, sửa rồi gửi lại.', '{orange}ℹ️ Đọc ảnh bằng AI có thể nhầm — luôn kiểm lại trước khi dùng.{/orange}');
    if (!tn || tn.has('kiem_tra_shtt_anh')) l.push('(Ảnh logo/nhãn hiệu? Gõ "6" rồi gửi lại ảnh để kiểm sở hữu trí tuệ.)');
    await send(clipReply(`${l.join('\n')}\n\n${footer}`));
    return { handled: 'photo-specs' };
  }

  async function handleUpdate(raw) {
    const u = parseUpdate(raw);
    if (!u || !u.chatId) return { skipped: 'no-chat' };
    if (dedupe(u.messageId)) return { skipped: 'duplicate' };
    if (allow.size && !allow.has(u.userId) && !allow.has(u.chatId)) return { skipped: 'not-allowed' };
    const group = isGroup(u);
    const send = (t) => zalo.sendText(u.chatId, group && u.userName ? `@${u.userName}\n${t}` : t);

    const isPhoto = /image|photo/i.test(u.event || '') && u.photoUrl;
    if (!isPhoto && (u.event !== 'message.text.received' || !u.text)) {
      if (group) return { skipped: 'group-non-text' };
      await zalo.sendText(u.chatId, 'Bot đọc tin nhắn chữ và ảnh. Gõ "menu" để xem các gói tra cứu.');
      return { handled: 'non-text' };
    }
    if (limited(u.userId || u.chatId)) {
      if (!group) await zalo.sendText(u.chatId, 'Bạn gửi hơi nhanh, đợi khoảng 1 phút rồi thử lại nhé.');
      return { handled: 'rate-limited' };
    }

    const session = sessionOf(group ? `${u.chatId}:${u.userId}` : u.chatId);
    const pkgs = availablePackages(await tools());
    const footer = menuText(pkgs);

    if (isPhoto) {
      try { return await handlePhoto(u, session, pkgs, footer, send); } catch (e) {
        log.error?.(`[bot] lỗi ảnh: ${e.message}`);
        // KHÔNG lộ lỗi gốc (tiếng Anh của Gemini, stack, địa chỉ nội bộ) cho khách.
        const ly = loiAnhChoKhach(e);
        await send(`⚠️ ${ly}, hoặc gõ tên hàng + thông số bằng chữ giúp bot nhé.\n\n${footer}`);
        return { handled: 'photo-error' };
      }
    }

    const text = stripMention(u.text, names);
    // Đang chờ xác nhận thông số đọc từ ảnh: "ok/đúng" → phân loại bằng đúng nội dung đó (nguồn ẢNH).
    if (session.choXacNhanAnh && /^(ok|oke|okay|dung|chuan|xac nhan|dong y|yes|y|uh|u|vang)[.!]*$/.test(norm(text))) {
      const pending = session.choXacNhanAnh;
      session.choXacNhanAnh = null;
      const pkg = pkgs.find((p) => p.id === 'phan-loai');
      if (pkg) {
        zalo.sendChatAction(u.chatId, 'typing');
        const body = await pkg.chay(pending, { mcp, tools: toolNames, session, notify: (t) => send(t), pollMs, ghiTruot, nguonThongSo: 'ANH' });
        await send(clipReply(`${body}\n\n${footer}`));
        return { handled: 'chay', goi: pkg.so, nguon: 'ANH' };
      }
    }
    if (session.choXacNhanAnh && !/^\d$/.test(text.trim())) {
      // Người dùng gửi bản đã sửa → coi như mô tả mới cho gói 1, nguồn vẫn là ảnh đã được người dùng chỉnh.
      session.choXacNhanAnh = null;
      const pkg = pkgs.find((p) => p.id === 'phan-loai');
      if (pkg && /(ten hang|thong so|model|thuong hieu|chat lieu)\s*:/.test(norm(text))) {
        zalo.sendChatAction(u.chatId, 'typing');
        const body = await pkg.chay(text, { mcp, tools: toolNames, session, notify: (t) => send(t), pollMs, ghiTruot, nguonThongSo: 'ANH' });
        await send(clipReply(`${body}\n\n${footer}`));
        return { handled: 'chay', goi: pkg.so, nguon: 'ANH' };
      }
    }
    if (session.choBoSung && !session.goi) session.goi = 1;   // đang trả lời câu hỏi bổ sung của gói 1
    // Não hiểu câu hỏi chỉ hỏi ở chế độ TỰ ĐỘNG; Gemini lỗi/không chắc → routeThongMinh tự về regex cũ.
    const r = await routeThongMinh(text, { session, pkgs, brain, typing: () => zalo.sendChatAction(u.chatId, 'typing') });

    try {
      switch (r.kind) {
        case 'ignore': return { skipped: 'empty' };
        case 'menu':
          await send(`{b}🤖 Bot tra cứu hải quan OZ{/b}\n\n${menuText(pkgs, { full: true })}\n\nHoặc cứ gõ mã HS / mô tả hàng, bot tự chọn gói.`);
          return { handled: 'menu' };
        case 'tu-dong':
          session.goi = null;
          await send(`{b}🔄 Đã chuyển sang chế độ TỰ ĐỘNG:{/b} bot đoán gói theo nội dung bạn gõ.\n\n${footer}`);
          return { handled: 'tu-dong' };
        case 'chon':
          session.goi = r.pkg.so;
          await send(`{b}${r.pkg.icon} Gói ${r.pkg.so}: ${r.pkg.ten}{/b}\n${r.pkg.moTa}\n\n{b}Gửi thông tin theo mẫu:{/b}\n${r.pkg.mau}\n\n${footer}`);
          return { handled: 'chon', goi: r.pkg.so };
        case 'ket-qua': {
          zalo.sendChatAction(u.chatId, 'typing');
          const tn = toolNames;
          const tool = !tn || tn.has('ket_qua_phan_loai') ? 'ket_qua_phan_loai' : 'ket_qua_soat';
          let k = await mcp.callTool(tool, { maLuot: r.maLuot });
          if (k?.ok === false && tool === 'ket_qua_phan_loai' && (!tn || tn.has('ket_qua_soat'))) k = await mcp.callTool('ket_qua_soat', { maLuot: r.maLuot });
          await send(clipReply(`${renderResult(k, { title: `📥 Kết quả lượt ${r.maLuot}` })}\n\n${footer}`));
          return { handled: 'ket-qua' };
        }
        case 'chay': {
          if (r.chon) session.goi = r.pkg.so;
          zalo.sendChatAction(u.chatId, 'typing');
          const ctx = { mcp, tools: toolNames, session, editor, notify: (t) => send(t), pollMs, ghiTruot };
          const body = await r.pkg.chay(r.text, ctx);
          const head = r.tuDong ? `{b}${r.pkg.icon} (Tự động chọn gói ${r.pkg.so}: ${r.pkg.ten}){/b}\n\n` : '';
          await send(clipReply(`${head}${body}\n\n${footer}`));
          log.info?.(`[bot] gói ${r.pkg.so} chat=${u.chatId.slice(-4)}`);
          return { handled: 'chay', goi: r.pkg.so };
        }
        case 'chi-tiet':   // mở lại bản đầy đủ của lượt phân loại gần nhất (não biên tập đã thay bằng bản chốt)
          await send(session.chiTiet?.text ? clipReply(session.chiTiet.text) : 'Chưa có bản chi tiết nào trong phiên này (bot chỉ giữ cho lượt phân loại gần nhất, ~2 giờ).');
          return { handled: 'chi-tiet' };
        case 'hoi-lai':   // não hỏi lại một câu thay vì đoán mò chạy gói
          await send(`❓ ${r.cauHoi}\n\n${footer}`);
          return { handled: 'hoi-lai' };
        case 'khac':      // chào hỏi/xã giao: não trả lời ngắn, dẫn về menu
          await send(`${r.cauDan}\n\n${footer}`);
          return { handled: 'khac' };
        default:
          return { skipped: 'unknown' };
      }
    } catch (e) {
      log.error?.(`[bot] lỗi (${r.kind}${r.pkg ? ` gói ${r.pkg.so}` : ''}): ${e.message}`);
      await send(`{orange}⚠️ Cổng tra cứu OZ đang lỗi tạm thời{/orange} (${String(e.message).slice(0, 120)}). Bạn thử lại sau ít phút nhé.\n\n${footer}`);
      return { handled: 'error' };
    }
  }

  return { handleUpdate, tools, PACKAGES };
}
