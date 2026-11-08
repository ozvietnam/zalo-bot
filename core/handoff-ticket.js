// Phiếu vào nhóm nhân viên + gộp tin khách (T024, FR-012 `specs/001-nen-tang-chung/spec.md:231`).
// Tách khỏi `core/handoff.js` (trạng thái phòng, T022) để mỗi tệp một trách nhiệm và dưới 300 dòng
// (Điều VI) — cùng lối `core/gate-decide.js` tách khỏi `core/gate.js`. `createHandoff` gọi
// `createTickets` rồi trả `open`/`forward`/`flushDue` ra ngoài, nên người dùng chỉ thấy một đối tượng.
//
// open(convId, reason, o)  → mở phiếu + gửi một tin vào nhóm (mã phiếu, tên khách, 5 tin gần nhất)
// forward(convId)          → gộp tin khách mới, tối đa MỘT tin nhóm / phiếu / 5 phút
// flushDue()               → bộ quét: phiếu hết cửa sổ gộp mà còn tin khách thì chuyển ngay
//
// Phiếu là tin RA nên đi qua đúng một cửa `core/gate.js` (Điều I); cửa không ghi `kind:'ticket'`
// vào `messages` (dòng `if` ở `core/gate.js:97`) nên phiếu không lẫn vào lịch sử hội thoại của khách.
import { redact, findLeak } from './redact.js';
import { vnGioNgay } from './time.js';

/** Gộp tin khách vào phiếu: tối đa MỘT tin nhóm / phiếu / 5 phút (`data-model.md:116`). */
export const TICKET_FORWARD_MS = 300_000;

/** Số tin gần nhất đưa vào phiếu mới (FR-012). */
const TICKET_HISTORY = 5;
/** Số tin khách tối đa trong một tin gộp: nhiều hơn thì cắt bớt, phần đầu là phần nhân viên cần. */
const FORWARD_MAX = 20;
/** Cắt mỗi dòng tin cho phiếu gọn mắt; cửa vẫn tự chia tin dài nếu cần. */
const LINE_MAX = 200;

const SPEAKER = { khach: 'khách', bot: 'bot', 'nhan-vien': 'nhân viên' };

/**
 * @param {object} o
 * @param {object} o.store                 `core/store.js`
 * @param {object} [o.gate]                cửa gửi duy nhất (`core/gate.js`) — phiếu là tin ra (Điều I)
 * @param {string} o.staffChatId           nhóm nhân viên; rỗng thì phiếu chỉ vào db + audit
 * @param {RegExp[]} o.banned
 * @param {() => Date} o.now
 * @param {(convId: string, row: object|null, hint: string|null) => string} o.chatIdOf
 */
export function createTickets({ store, gate, staffChatId, banned, now, chatIdOf, log }) {
  const nowIso = () => now().toISOString();
  const iso = (t) => new Date(t).toISOString();
  const ms = (s) => {
    const t = s == null ? NaN : Date.parse(s);
    return Number.isNaN(t) ? null : t;
  };

  /**
   * Một dòng tin cho phiếu. Hai việc bắt buộc, mỗi việc chữa một lỗi khác nhau:
   *  - gộp mọi khoảng trắng về MỘT dấu cách: lời khách có `\n` thì để nguyên sẽ sinh dòng giả
   *    trong phiếu (khách gõ "Lý do: …" và nhân viên tưởng là dòng thật của phiếu);
   *  - `redact` rồi `findLeak` TỪNG DÒNG: lời khách có thể chứa token/đường dẫn máy chủ. Nếu để
   *    cửa dò trên cả phiếu thì một dòng bẩn làm MẤT cả cái phiếu (Điều IX chặn, nhưng nhân viên
   *    không biết khách đang chờ → trái Điều II). Che riêng dòng đó, phần còn lại vẫn tới người.
   */
  function dongTin(m) {
    const who = SPEAKER[m.speaker] ?? m.speaker;
    const raw = redact(String(m.text ?? '')).replace(/\s+/g, ' ').trim();
    const body = findLeak(raw, banned) ? '(dòng bị che: có dấu hiệu lộ thông tin nội bộ)' : raw;
    const cut = body.length > LINE_MAX ? `${body.slice(0, LINE_MAX)}…` : body;
    return `- ${vnGioNgay(m.at)} ${who}: ${cut || '(tin rỗng)'}`;
  }

  /** Tên khách để nhân viên nhận ra ai đang chờ; tên do khách đặt nên cũng phải che và gộp dòng. */
  function nhanDang(convId, row) {
    const ten = redact(String(row?.display_name ?? '')).replace(/\s+/g, ' ').trim();
    return `${ten || '(chưa có tên)'} (${convId})`;
  }

  /**
   * Gửi một tin phiếu qua CỬA (Điều I). Không có nhóm nhân viên thì chỉ ghi audit (`research.md:78`).
   * Không ném: cửa lỗi thì phiếu vẫn nằm trong db để `/cho` (T025) và `/metrics` thấy.
   *
   * `xong` nghĩa là **cửa đã nhận trách nhiệm giao tin**, không phải "đã gọi cửa xong". Ba ca:
   *  - chưa cấu hình nhóm (`xong: true`, `sent: null`): đường hợp lệ, `forward` ĐƯỢC dời mốc gộp —
   *    không dời thì `dueForward` trả phiếu đó mãi và bộ quét đọc lại cùng tin mỗi 5 giây;
   *  - cửa ném (`xong: false`): `forward` KHÔNG được dời mốc, nếu dời thì phần tin khách trong cửa
   *    sổ đó mất hẳn (`khachSince` lấy `at > mốc`) — nhân viên không bao giờ thấy, không cảnh báo;
   *  - cửa trả `drop`/`reject` (`xong: false`): tin KHÔNG đi ra và sẽ không bao giờ đi ra, nên dời
   *    mốc cũng là mất tin y như ca trên. Chỉ `decision === 'send'` mới là đã nhận: lúc đó dòng
   *    outbox đã bền và `gate.sweep` tự thử lại nếu kênh lỗi (`core/gate.js:150`).
   * @returns {Promise<{ xong: boolean, sent: object|null }>}
   */
  async function guiPhieu(ticket, idemKey, text, loai) {
    store.audit.add({
      at: nowIso(), turn_id: null, conv_id: ticket.conv_id, chat_id: ticket.chat_id, type: 'ticket',
      data: { ticketId: ticket.id, loai, reason: ticket.reason, staff: staffChatId ? 'configured' : 'unconfigured' },
    });
    if (!staffChatId || !gate) return { xong: true, sent: null };
    // Lưới an toàn cuối: nếu bản gộp vẫn còn dấu hiệu lộ (dòng mở đầu, tên khách…) thì gửi bản
    // tối giản — nhân viên vẫn biết có phiếu đang chờ và vào thẳng phòng khách mà đọc. Xem được
    // nội dung đã che ngay trong nhóm thì phải chờ `/ho-so` (T036).
    const an = findLeak(text, banned) ? `🎫 P${ticket.id} · ${loai}\nNội dung bị che vì có dấu hiệu lộ thông tin nội bộ.` : text;
    let sent;
    try {
      sent = await gate.send({ idemKey, chatId: staffChatId, convId: staffChatId, turnId: null, kind: 'ticket', text: an });
    } catch (e) {
      log('không gửi được phiếu vào nhóm nhân viên', `P${ticket.id}`, redact(e?.message));
      return { xong: false, sent: null };
    }
    // `duplicate-idem` là đường HỢP LỆ, không phải lỗi: nghĩa là ĐÚNG tin này đã đi ra ở lần trước
    // (khoá idem bền trong `outbox.idem_key`), nên coi như cửa đã nhận. Tin gộp thường không vào đây
    // vì `forward` đã tự đọc dòng outbox cũ trước khi gọi cửa (`core/handoff-ticket.js:219`); đây là
    // lưới cho phiếu mới (khoá `p:<id>:open`) và cho mọi người gọi sau này.
    if (sent?.decision === 'send' || sent?.reason === 'duplicate-idem') return { xong: true, sent };
    // Cửa bỏ tin (`reject` vì lộ/tiền, `drop` vì trùng nội dung): KHÔNG có gì đi ra và sẽ không bao
    // giờ đi ra. Phải báo, vì nhân viên đang không thấy khách chờ mà bot cũng không lỗi.
    log('cửa không cho phiếu đi', `P${ticket.id}`, `${sent?.decision}:${sent?.reason}`);
    return { xong: false, sent };
  }

  /**
   * Mở phiếu cho một cuộc trò chuyện rồi báo nhóm nhân viên.
   * `convId` là khoá theo NGƯỜI; `chat_id` của phiếu phải lấy từ `convs` (nơi gửi tin), nếu không
   * phiếu trong nhóm ghi `chat_id` = `convId` và nhân viên trả lời vào một phòng không tồn tại.
   * KHÔNG đổi trạng thái phòng: `cap:chat` mở phiếu nhưng bot vẫn được trả lời khách.
   * Phòng đã có phiếu `open`/`claimed` thì KHÔNG mở phiếu thứ hai và không báo lại.
   * @returns {Promise<{ ticket: object, daCo: boolean, sent: object|null }>}
   */
  async function open(convId, reason = 'handoff', { chatId = null } = {}) {
    const row = store.convs.get(convId);
    const cid = chatIdOf(convId, row, chatId);
    const at = nowIso();
    const cu = store.tickets.openFor(convId);
    if (cu) return { ticket: cu, daCo: true, sent: null };

    const ticket = store.tickets.open(convId, cid, reason, at);
    if (ticket.last_forward_at == null) {
      // Mốc gộp đặt NGAY lúc mở: 5 tin vừa đưa vào phiếu không được chuyển lại lần nữa.
      store.tickets.update(ticket.id, { last_forward_at: at });
      ticket.last_forward_at = at;
    }
    // Phiếu khác thắng cuộc đua (ux_tickets_open): coi như đã có, không báo lại.
    if (ticket.reason !== reason || ticket.opened_at !== at) return { ticket, daCo: true, sent: null };

    const lines = [
      `🎫 P${ticket.id} · phiếu mới`,
      `Khách: ${nhanDang(convId, row)}`,
      `Lý do: ${reason}`,
      `Mở lúc: ${vnGioNgay(at)} (giờ VN)`,
      `${TICKET_HISTORY} tin gần nhất:`,
      ...store.messages.recent(convId, TICKET_HISTORY).map(dongTin),
    ];
    if (lines.length === 5) lines.push('- (chưa có tin nào)');
    const { sent } = await guiPhieu(ticket, `p:${ticket.id}:open`, lines.join('\n'), 'phiếu mới');
    return { ticket, daCo: false, sent };
  }

  /**
   * Chọn những tin đi trong MỘT tin gộp, và mốc gộp mới đi kèm. Hai thứ phải tính cùng nhau:
   *  - chưa tràn: mốc là GIỜ HIỆN TẠI (giữ nhịp tối đa một tin nhóm / phiếu / 5 phút);
   *  - tràn `FORWARD_MAX`: mốc chỉ được dời tới tin CUỐI ĐƯỢC CHỞ. Dời tới giờ hiện tại là bỏ hẳn
   *    phần dư, vì `khachSince` lấy `at > mốc` (`core/store/records.js:43`) — đúng kiểu mất tin của
   *    ca cửa ném lỗi ở dưới, chỉ khác đường vào. Mốc cũ hơn 5 phút nên phiếu đến hạn ngay, nhịp
   *    quét sau chở tiếp phần dư: nhóm nhận nhiều tin hơn nhưng không mất tin nào.
   *  - `at` KHÔNG duy nhất: khách bấm gửi liên tiếp thì hai tin có thể cùng milli giây. Vì vậy phải
   *    bỏ luôn cả nhóm trùng mốc với tin đầu tiên bị cắt, không thì chính những tin đó bị loại.
   */
  function cat(tin, ticket) {
    if (tin.length <= FORWARD_MAX) return { them: tin, mocMoi: nowIso() };
    const duAt = tin[FORWARD_MAX].at;                       // tin đầu tiên KHÔNG được chở
    const them = tin.slice(0, FORWARD_MAX).filter((m) => m.at !== duAt);
    if (them.length) return { them, mocMoi: them[them.length - 1].at };
    // Hơn FORWARD_MAX tin khách trong CÙNG một milli giây: engine xử lượt theo hàng chờ từng phòng
    // nên thực tế không xảy ra. Không có mốc nào tách được nhóm này, nên chở 20 tin và báo to để
    // người vận hành biết phần dư cùng mốc bị bỏ (cách chữa gốc là mốc theo `messages.id`).
    log('quá nhiều tin khách trùng mốc, phần dư cùng mốc bị bỏ', `P${ticket.id}`, duAt);
    return { them: tin.slice(0, FORWARD_MAX), mocMoi: duAt };
  }

  /**
   * Phiếu đang có một tin gộp BAY GIỮA ĐƯỜNG (đã vào `guiPhieu`, chưa dời mốc). Mốc chỉ dời sau khi
   * cửa nhận tin, mà `channel.sendText` chờ tới 40 giây (`channels/zalo-bot.js:73`), nên lần gọi
   * chồng lên sẽ đọc lại MỐC CŨ và gộp lại đúng những tin đó. Khoá idem của tin gộp có mốc giờ nên
   * mỗi lần một khoá, và `kind:'ticket'` thuộc NEVER_PROACTIVE nên lưới Jaccard của cửa cũng không
   * chặn → nhóm nhân viên nhận hai tin giống hệt. Cùng cách chống chồng với `core/gate.js:175`.
   */
  const dangGui = new Set();

  /**
   * Gộp tin khách mới vào phiếu đang mở: tối đa MỘT tin nhóm / phiếu / TICKET_FORWARD_MS.
   * Còn trong cửa sổ thì chỉ hoãn (tin vẫn nằm trong `messages`, `flushDue` sẽ chuyển sau) —
   * không mất tin, và nhóm không bị dồn tin khi khách gõ liên tiếp.
   * Quá FORWARD_MAX tin thì tin gộp này chở FORWARD_MAX tin, phần dư sang lần gộp sau (`cat`).
   * Không có tin khách mới thì KHÔNG dời mốc, để tin khách đến ngay sau đó được chuyển liền.
   * @returns {Promise<{ ticket: object|null, hoan?: true, dangGui?: true, soTin?: number, sent?: object|null }>}
   */
  async function forward(convId) {
    const ticket = store.tickets.openFor(convId);
    if (!ticket) return { ticket: null };
    const moc = ms(ticket.last_forward_at);
    if (moc !== null && now().getTime() - moc < TICKET_FORWARD_MS) return { ticket, hoan: true };
    if (dangGui.has(ticket.id)) return { ticket, dangGui: true };

    // Mốc mặc định là `opened_at`, KHÔNG phải chuỗi rỗng: phiếu dựng tay (T025, hoặc dòng cũ trước
    // khi có cột này) để `last_forward_at` NULL, mà `tickets.dueForward` cố tình coi NULL là đến hạn
    // ngay (`core/store/state.js:66`) — lấy chuỗi rỗng thì quét cả lịch sử khách và gộp lại cả những
    // tin từ trước lúc mở phiếu vào nhóm.
    const mocTu = ticket.last_forward_at ?? ticket.opened_at ?? '';
    const tin = store.messages.khachSince(convId, mocTu, FORWARD_MAX + 1);
    if (!tin.length) return { ticket, soTin: 0, sent: null };
    // TRÀN: một tin nhóm chỉ chở FORWARD_MAX tin, phần dư phải CHỜ lần gộp sau, nên mốc dời tới tin
    // cuối được chở — KHÔNG tới giờ hiện tại, vì `khachSince` lấy `at > mốc` nên phần dư sẽ bị loại
    // vĩnh viễn (cùng cách mất tin với ca cửa ném lỗi ở dưới, chỉ khác đường vào).
    // `at` KHÔNG duy nhất: nhiều tin khách có thể trùng mốc milli giây, nên bỏ luôn cả nhóm trùng mốc
    // với tin đầu tiên bị cắt, nếu không đúng những tin đó bị loại.
    const { them, mocMoi } = cat(tin, ticket);
    const at = mocMoi;
    const lines = [
      `🎫 P${ticket.id} · khách nhắn tiếp (${them.length} tin${tin.length > them.length ? ', còn nữa, gửi tiếp sau' : ''})`,
      `Khách: ${nhanDang(convId, store.convs.get(convId))}`,
      ...them.map(dongTin),
    ];
    // Khoá idem PHỦ ĐÚNG KHOẢNG TIN ĐÃ CHỞ: `...:f:<mốc cũ>:t:<mốc mới>`. Khoá là bản ghi bền duy
    // nhất còn lại sau khi tiến trình chết (`outbox.idem_key` UNIQUE, `core/store/schema.js:23`), nên
    // nó phải trả lời được "lần trước đã chở tới đâu" — hai cờ ở trên chỉ chống chồng TRONG một tiến
    // trình, không sống qua khởi động lại (Điều VII, `.specify/memory/constitution.md:42`).
    const base = `p:${ticket.id}:f:${mocTu || 'init'}`;
    // Tiến trình trước đã đẩy được một tin gộp cho ĐÚNG mốc cũ này rồi chết trước khi dời mốc: dời
    // mốc tới đúng chỗ lần đó đã chở (đọc ra từ khoá), KHÔNG tới giờ hiện tại — giờ hiện tại thì mọi
    // tin khách đến giữa lúc chết và lúc quét lại bị `khachSince` (`at > mốc`) loại vĩnh viễn. Cũng
    // KHÔNG gửi lại: nhóm đã có tin đó. Nhịp quét sau chở phần tin mới.
    const truoc = store.outbox.lastSentByIdemPrefix(`${base}:t:`);
    if (truoc) {
      const daCho = truoc.idem_key.slice(`${base}:t:`.length);
      log('tin gộp của tiến trình trước đã tới nhóm, dời mốc theo dòng outbox cũ', `P${ticket.id}`, daCho);
      store.tickets.update(ticket.id, { last_forward_at: daCho });
      return { ticket, soTin: 0, daGuiTruoc: true, sent: null };
    }
    const idemKey = `${base}:t:${mocMoi}`;
    dangGui.add(ticket.id);
    let xong, sent;
    try {
      ({ xong, sent } = await guiPhieu(ticket, idemKey, lines.join('\n'), 'gộp tin'));
    } finally {
      dangGui.delete(ticket.id);
    }
    // Mốc dời SAU khi cửa đã nhận tin, và CHỈ KHI cửa THẬT SỰ nhận (`guiPhieu` chỉ trả `xong` cho
    // `decision === 'send'`): cửa ghi outbox bền rồi mới gửi, nên tin lỗi kênh được `gate.sweep()`
    // thử lại. Cửa ném (SQLITE_BUSY lúc ghi outbox) hoặc cửa BỎ tin (`reject` vì lộ/tiền, `drop` vì
    // trùng nội dung) mà vẫn dời mốc thì phần tin khách này mất hẳn — `khachSince` lấy `at > mốc`,
    // lần sau không còn thấy gì, nhân viên chờ một tin không bao giờ đến (Điều II).
    if (!xong) return { ticket, soTin: 0, sent };
    store.tickets.update(ticket.id, { last_forward_at: at });
    return { ticket, soTin: them.length, sent };
  }

  /**
   * Bộ quét: phiếu nào đã hết cửa sổ gộp mà còn tin khách chưa chuyển thì chuyển ngay.
   * Gọi cùng nhịp với `gate.sweep()` (T026 nối vào `engine.drain`). Trả số phiếu đã gửi tin gộp.
   * Nhịp chồng lên nhịp trước thì về ngay, cùng cách với `gate.sweep` (`core/gate.js:178`) và
   * `engine.drain` (`core/engine.js:153`): `server.js` gọi trong `setInterval` 5 giây mà không nối
   * await, còn một lượt quét có thể chờ kênh tới 40 giây.
   */
  let dangQuet = false;
  async function flushDue() {
    if (dangQuet) return 0;
    dangQuet = true;
    try {
      const truoc = iso(now().getTime() - TICKET_FORWARD_MS);
      let n = 0;
      for (const t of store.tickets.dueForward(truoc)) {
        try {
          const r = await forward(t.conv_id);
          if (r.soTin) n++;
        } catch (e) {
          log('flushDue lỗi', `P${t.id}`, redact(e?.message));
        }
      }
      return n;
    } finally {
      dangQuet = false;
    }
  }

  return { open, forward, flushDue };
}
