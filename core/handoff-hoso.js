// Lệnh hồ sơ cho nhân viên (T036, FR-027 `specs/001-nen-tang-chung/spec.md:252`):
//
// /ho-so <mã>          → hồ sơ + 20 tin gần nhất (giờ VN) vào nhóm nhân viên
// /gan <mã> <nhãn…>    → gắn nhãn nguồn `staff:<id>` (máy không gỡ được nhãn này — FR-026)
// /go <mã> <nhãn>      → gỡ nhãn, kể cả nhãn do nhân viên khác gắn
// /ghi <mã> <chữ>      → ghi chú tay vào hồ sơ; bỏ trống phần chữ thì xoá ghi chú
// /xoa-du-lieu <mã>    → xoá `messages` + `customers` của ĐÚNG người đó, ghi audit 'erase'
//
// Tách khỏi `core/handoff.js` (đã 299 dòng, Điều VI). Quyền (nhóm `STAFF_CHAT_ID` + `STAFF_USERS`),
// tra đích và đường gửi vào nhóm đều do `core/handoff.js` đưa vào, nên luật quyền chỉ có MỘT bản.
//
// Ba điều dễ sai, đã khoá bằng test ở `test/core/handoff-hoso.test.mjs`:
//  1. `/xoa-du-lieu` xoá theo `conv_id` (NGƯỜI), KHÔNG theo `chat_id`: trong nhóm, `messages.deleteChat`
//     xoá cả tin của người ngồi cạnh (`core/store/records.js:57` giữ lại cho việc dọn cả phòng, đường
//     của lệnh này là `messages.deleteConv` — `core/store/records.js:64`).
//  2. Audit `erase` ghi AI xoá và BAO NHIÊU dòng, không ghi nội dung đã xoá: khách xin xoá dữ liệu mà
//     lời khách còn nằm trong `audit` thì chưa xoá (FR-027), nhưng vẫn phải có dấu vết ai đã xoá
//     (Điều IV). Vì vậy giữ dòng audit, bỏ nội dung.
//  3. Mọi tin trả lời đi qua CỬA (Điều I) với `kind:'ticket'` nên không trừ trần tin của khách, và che
//     TỪNG DÒNG qua `core/handoff-dong.js` — tên khách bẩn không được làm mất cả câu trả lời (Điều II).
import { taoDong } from './handoff-dong.js';

/** Số tin gần nhất kèm theo `/ho-so` (T036). Phiếu mới chỉ có 5 tin; lệnh này là lúc nhân viên cần đọc kỹ. */
export const HOSO_HISTORY = 20;

const CMD_RE = /^\/(ho-so|gan|go|ghi|xoa-du-lieu)(?:\s+([\s\S]*))?$/i;
/** Nhãn người gõ: tách theo khoảng trắng, bỏ dấu nháy bao quanh (`"Hàng Dễ Vỡ"` là MỘT nhãn). */
const tachNhan = (s) => (String(s ?? '').match(/"[^"]+"|\S+/g) ?? []).map((x) => x.replace(/^"|"$/g, '')).filter(Boolean);

/**
 * @param {object} o
 * @param {object} o.store
 * @param {object} o.hoSoKhach                       bản `createCustomers` của `core/handoff.js`
 * @param {RegExp[]} o.banned                        `config.bannedPatterns`
 * @param {(rawMa: string) => object|null} o.resolveTarget
 * @param {(idemKey: string, turnId: string|null, text: string) => Promise<object|null>} o.guiNhom  gửi qua cửa
 * @param {(turnId, convId, chatId, data, type?) => void} o.auditCmd
 * @param {(r: object) => void} o.audit              ghi một dòng audit thô (dùng cho loại 'erase')
 * @param {() => string} o.nowIso
 */
export function createHoSoCmds({ store, hoSoKhach, banned = [], resolveTarget, guiNhom, auditCmd, audit, nowIso }) {
  const { dongTin, nhanDang, khoiSach } = taoDong({ banned });
  let seq = 0;
  const khoa = (cmd, convId, turnId) => `cmd:${cmd}:${convId}:${turnId ?? `auto-${++seq}`}`;
  const sai = (cmd, reason) => ({ matched: true, handled: true, ok: false, cmd, reason });

  /** Khối chữ cho `/ho-so`: tóm tắt hồ sơ + N tin gần nhất, mọi dòng do người ngoài gõ đều đã che. */
  function khoiHoSo(convId, maPhieu) {
    const row = store.convs.get(convId);
    const tin = store.messages.recent(convId, HOSO_HISTORY).map(dongTin);
    return [
      `👤 ${maPhieu} · hồ sơ khách`,
      `Khách: ${nhanDang(convId, row)}`,
      // Hồ sơ lỗi (db khoá) thì vẫn trả lời: nhân viên cần biết ít nhất là tin gần nhất của khách.
      ...khoiSach(hoSoKhach.summary(convId)),
      `${HOSO_HISTORY} tin gần nhất:`,
      ...(tin.length ? tin : ['- (chưa có tin nào)']),
    ].join('\n');
  }

  /**
   * Xoá dữ liệu của ĐÚNG một người (FR-027). Chỉ `messages` + `customers`: `convs` giữ để phòng còn
   * hoạt động được, `tickets` giữ để hàng chờ không rỗng giữa phiên, `audit` giữ vì Điều IV — nhưng
   * dòng audit của lệnh này KHÔNG chứa nội dung đã xoá.
   */
  function xoaDuLieu(convId, chatId, userId, turnId) {
    const coHoSo = store.customers.get(convId) != null;
    let soTin = 0;
    store.tx(() => {
      soTin = store.messages.deleteConv(convId);
      if (coHoSo) store.customers.deleteChat(convId); // `customers.deleteChat` xoá theo conv_id (tên cũ)
      audit({
        at: nowIso(), turn_id: turnId, conv_id: convId, chat_id: chatId, type: 'erase',
        data: { by: userId, convId, messages: soTin, customers: coHoSo },
      });
    });
    return { soTin, coHoSo };
  }

  /**
   * Xử lý một lệnh hồ sơ. Người gọi (`core/handoff.js`) đã kiểm quyền xong.
   * @returns {Promise<{matched: boolean, handled?: boolean, ok?: boolean, cmd?: string, ...}>}
   *   `matched:false` nghĩa là lượt không phải lệnh hồ sơ — người gọi cho lượt đi tiếp.
   */
  async function command(raw, { userId, turnId }) {
    const m = CMD_RE.exec(raw);
    if (!m) return { matched: false };
    const cmd = m[1].toLowerCase();
    const rest = (m[2] ?? '').trim();
    const [maRaw, ...duoi] = rest.split(/\s+/);
    const target = resolveTarget(maRaw);
    if (!target) return sai(cmd, 'ticket-not-found');
    const { ticket, convId, chatId } = target;
    const ma = ticket ? `P${ticket.id}` : convId;
    const phan = duoi.join(' '); // phần chữ sau mã, khoảng trắng gộp về một dấu cách
    const nguon = `staff:${userId}`;

    if (cmd === 'ho-so') {
      const sent = await guiNhom(khoa('ho-so', convId, turnId), turnId, khoiHoSo(convId, ma));
      auditCmd(turnId, convId, chatId, { cmd, by: userId, ticketId: ticket?.id ?? null });
      return { matched: true, handled: true, ok: true, cmd, convId, chatId, ticketId: ticket?.id ?? null, sent };
    }

    if (cmd === 'gan') {
      const nhan = tachNhan(rest.slice(maRaw.length));
      if (!nhan.length) return sai(cmd, 'invalid-args');
      const sau = hoSoKhach.addLabels(convId, nhan, nguon);
      const ten = sau.map((l) => l.nhan);
      const sent = await guiNhom(khoa('gan', convId, turnId), turnId,
        `👤 ${ma} · đã gắn nhãn: ${khoiSach(nhan.join(', ')).join(' ')}\nNhãn hiện có: ${ten.length ? khoiSach(ten.join(', ')).join(' ') : '(chưa có)'}`);
      auditCmd(turnId, convId, chatId, { cmd, by: userId, ticketId: ticket?.id ?? null, labels: nhan.length });
      return { matched: true, handled: true, ok: true, cmd, convId, chatId, labels: ten, sent };
    }

    if (cmd === 'go') {
      const nhan = tachNhan(rest.slice(maRaw.length))[0];
      if (!nhan) return sai(cmd, 'invalid-args');
      const truoc = (store.customers.get(convId)?.labels ?? []).length;
      // Nguồn `staff:<id>` gỡ được cả nhãn của nhân viên khác (FR-027); chỉ máy (`auto`) bị chặn.
      const sau = hoSoKhach.removeLabel(convId, nhan, nguon);
      const daGo = sau.length < truoc;
      const ten = sau.map((l) => l.nhan);
      const sent = await guiNhom(khoa('go', convId, turnId), turnId,
        `👤 ${ma} · ${daGo ? 'đã gỡ nhãn' : 'hồ sơ không có nhãn'}: ${khoiSach(nhan).join(' ')}\nNhãn hiện có: ${ten.length ? khoiSach(ten.join(', ')).join(' ') : '(chưa có)'}`);
      auditCmd(turnId, convId, chatId, { cmd, by: userId, ticketId: ticket?.id ?? null, daGo });
      return { matched: true, handled: true, ok: true, cmd, convId, chatId, daGo, labels: ten, sent };
    }

    if (cmd === 'ghi') {
      hoSoKhach.setNote(convId, phan, nguon);
      const sent = await guiNhom(khoa('ghi', convId, turnId), turnId,
        phan ? `👤 ${ma} · đã ghi vào hồ sơ: ${khoiSach(phan).join(' ')}` : `👤 ${ma} · đã xoá ghi chú trong hồ sơ.`);
      // Audit chỉ ghi ĐỘ DÀI ghi chú, không ghi nội dung: ghi chú có thể nhắc chuyện riêng của khách.
      auditCmd(turnId, convId, chatId, { cmd, by: userId, ticketId: ticket?.id ?? null, len: phan.length });
      return { matched: true, handled: true, ok: true, cmd, convId, chatId, note: phan || null, sent };
    }

    const { soTin, coHoSo } = xoaDuLieu(convId, chatId, userId, turnId);
    // Phản hồi KHÔNG nhắc lại nội dung đã xoá, kể cả tên khách: lệnh này vừa xoá hồ sơ, in tên ra nhóm
    // là đưa lại đúng thứ khách xin xoá.
    const sent = await guiNhom(khoa('xoa-du-lieu', convId, turnId), turnId,
      `🧹 ${ma} · đã xoá dữ liệu của một người: ${soTin} tin, hồ sơ ${coHoSo ? 'đã xoá' : 'không có'}.\nGiữ lại: phiếu, trạng thái phòng và sổ audit (không chứa nội dung tin).`);
    auditCmd(turnId, convId, chatId, { cmd: 'xoa-du-lieu', by: userId, ticketId: ticket?.id ?? null, messages: soTin, customers: coHoSo });
    return { matched: true, handled: true, ok: true, cmd: 'xoa-du-lieu', convId, chatId, soTin, coHoSo, sent };
  }

  return { command, HOSO_HISTORY };
}
