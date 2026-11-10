// Việc nền bền (T021, tách từ core/engine-jobs.js). Gói trả `jobs` trong lượt; lõi nợ khách một kết quả
// và tự hỏi Cổng OZ tới khi xong — khởi động lại không mất việc, không giao trùng (Điều II, Điều VII).
//
// add(turn, sessionKey, pack, job)   → ghi dòng jobs 'waiting', hẹn hỏi sau 6 s
// tick()                            → jobs.due(now) → jobs.claim (waiting → polling, nguyên tử)
//                                      → callTool(result_tool, {maLuot})
//                                      → còn DANG_XU_LY thì dời 6→12→24→48→60 s (chặn ở 60 s)
//                                      → xong / hết hạn 30 phút → pack.onJobResult → gate.send(kind 'job_result')
//                                    phòng 'human' → KHÔNG hỏi Cổng, KHÔNG gọi gói: phiếu báo nhân viên (T026, Điều II)
// recover()                         → dòng kẹt 'polling' (tiến trình chết lúc đang hỏi) về 'waiting'
//
// Mọi khoá theo conv_id (mỗi người một cuộc trò chuyện, cả trong nhóm nghìn người — FR-030, T037).
// Lõi KHÔNG soạn chữ: câu "xong" và câu "hết hạn" đều do gói trả (result = null nghĩa là hết hạn).
import { redact } from './redact.js';
import { buildCtx } from './engine-ctx.js';
import { groupNameTag } from './mention.js';

export const FIRST_POLL_MS = 6_000;
export const MAX_POLL_MS = 60_000;
export const JOB_TTL_MS = 30 * 60_000;
/** Quá mốc này mà việc chưa xong → hỏi gói một câu báo tiến độ, gửi ĐÚNG MỘT LẦN (issue #136 mục 5). */
export const PROGRESS_AFTER_MS = 60_000;

const stateOf = (r) => r?.trangThai || r?.data?.trangThai;
const backoff = (attempts) => Math.min(FIRST_POLL_MS * 2 ** attempts, MAX_POLL_MS);
const iso = (ms) => new Date(ms).toISOString();

/**
 * Bộ việc nền trên một store + một cửa gửi.
 * @param {object} o
 * @param {(chatId:string, reason:string)=>void} [o.onAlert] báo người khi việc hỏng (hứa mà không giao được — Điều VII).
 * @param {object} [o.handoff] `core/handoff.js` (`stateOf`, `note`) — engine luôn truyền; thiếu thì đọc thẳng `convs`.
 * @param {(convId:string, res:object)=>void} [o.ghiHoSo] áp `labels`/`interests` của `onJobResult` vào hồ sơ
 *   khách (T035). Gói 1 của hs trả mã HS Ở ĐÂY, không phải trong lượt khách (`packs/hs/packages.js:178`),
 *   nên bỏ qua đường này là món quan tâm kèm mã HS không bao giờ vào hồ sơ.
 * @returns {{ add: Function, tick: () => Promise<number>, recover: () => number }}
 */
export function createJobs({ store, mcp, registry, gate, now, log = console, tools, vision = null, brain = null, editor = null, ttlMs, ghiTruot = null, onAlert = () => {}, handoff = null, ghiHoSo = null, guiThoai = null }) {
  const audit = (turnId, chatId, convId, type, data) => store.audit.add({ at: now().toISOString(), turn_id: turnId, conv_id: convId ?? null, chat_id: chatId, type, data });
  const canhBao = (chatId, reason) => { try { onAlert(chatId, reason); } catch (e) { log.error?.(`[jobs] onAlert lỗi: ${redact(e?.message)}`); } };

  /** Trạng thái phòng của việc: chặn cả nhóm → theo người (`stateOf` có tự về sau khoảng lặng). */
  const phong = (row) => {
    if (store.chats.get(row.chat_id)?.state === 'blocked') return 'blocked';
    const st = handoff ? handoff.stateOf(row.conv_id) : store.convs.get(row.conv_id)?.state;
    return st === 'human' || st === 'blocked' ? st : 'bot';
  };

  /**
   * Kết quả đã hứa mà phòng do người cầm: giữ cho NHÂN VIÊN qua phiếu (#33 — trước đây cửa trả
   * `reject chat-human`, việc vẫn ghi 'done' và không ai biết khách đang chờ). `xong` = cửa đã nhận tin
   * phiếu, hoặc chưa cấu hình nhóm nhân viên (khi đó báo `onAlert` để người vận hành thấy).
   */
  async function giuChoNhanVien(row, loai, dong, idemKey) {
    if (!handoff?.note) { canhBao(row.chat_id, 'job-human'); return { xong: true, ticket: null }; }
    const r = await handoff.note(row.conv_id, { loai, dong, idemKey, chatId: row.chat_id });
    if (r.xong && !r.sent) canhBao(row.chat_id, 'job-human');
    return r;
  }

  /**
   * Việc đến hạn khi phòng KHÔNG phải 'bot' (Điều II, FR-011): không hỏi Cổng, không gọi gói (gói có thể
   * gọi mô hình biên tập). 'human' → phiếu báo nhân viên mã lượt để họ tra và trả lời khách; cửa chưa nhận
   * phiếu thì hẹn lại, chỉ dừng (failed + báo người) khi đã quá hạn 30 phút. 'blocked' → dừng, không báo ai.
   */
  async function nhuongNguoi(row, st, turnId, nowMs) {
    const xongViec = (status, data) => {
      store.jobs.update(row.id, { status, done_at: now().toISOString() });
      audit(turnId, row.chat_id, row.conv_id, 'job-handoff', { job: row.id, maLuot: row.ma_luot, state: st, ...data });
    };
    if (st === 'blocked') return xongViec('failed', { action: 'dropped' });
    const r = await giuChoNhanVien(row, 'việc nền chưa giao', (t) => [
      `Bot đã hứa gửi khách kết quả tra cứu (gói ${row.pack}, mã lượt ${row.ma_luot}) nhưng phòng đang do nhân viên cầm, nên bot KHÔNG tra tiếp và KHÔNG gửi.`,
      `Nhân viên tra lại theo mã lượt ${row.ma_luot} rồi trả lời khách bằng /tl P${t.id} <nội dung>.`,
    ], `j:${row.conv_id}:${row.ma_luot}:nv`);
    if (r.xong) return xongViec('done', { action: 'staff', ticketId: r.ticket?.id ?? null });
    if (nowMs < Date.parse(row.expires_at)) return hoanLai(row, nowMs);
    xongViec('failed', { action: 'staff-failed' });
    canhBao(row.chat_id, 'job-failed');
  }

  /**
   * Nhận một việc gói trả trong lượt. `context` giữ cả phần lõi cần để gửi lại đúng tên trong nhóm.
   * @returns {number|null} id dòng việc, hoặc null nếu (gói, maLuot) đã có việc đang nợ.
   */
  function add(turn, sessionKey, pack, job) {
    const t = now().getTime();
    return store.jobs.add({
      chat_id: turn.chatId, conv_id: turn.convId, session_key: sessionKey, pack, ma_luot: job.maLuot, result_tool: job.resultTool,
      // receivedAt: mốc tin khách của lượt đã sinh ra việc nền — cửa dùng để biết kết quả này
      // vẫn là câu trả lời trực tiếp cho câu khách vừa hỏi (issue #55).
      context: { data: job.context ?? null, turnId: turn.turnId, isGroup: turn.isGroup, userName: turn.userName ?? null, userId: turn.userId ?? null, receivedAt: turn.receivedAt ?? null },
      status: 'waiting', attempts: 0, next_poll_at: iso(t + FIRST_POLL_MS), expires_at: iso(t + JOB_TTL_MS), created_at: iso(t),
    });
  }

  /** Hẹn lượt hỏi kế tiếp cho một việc còn chạy. */
  const hoanLai = (row, nowMs) => {
    const attempts = (row.attempts ?? 0) + 1;
    store.jobs.update(row.id, { status: 'waiting', attempts, next_poll_at: iso(nowMs + backoff(attempts)) });
  };

  /**
   * Việc đã chạy quá PROGRESS_AFTER_MS mà Cổng còn DANG_XU_LY: xin gói một câu báo tiến độ và gửi
   * ĐÚNG MỘT LẦN (issue #136 mục 5). Cờ "đã báo" ghi vào `context.tienDoAt` — cột `context` là cột
   * duy nhất của bảng jobs vừa patch được vừa không mang nghĩa trạng thái, nên khởi động lại giữa
   * chừng cũng không báo lại lần hai. Gói không có `onJobProgress` thì lõi IM (lõi không soạn chữ).
   */
  async function baoTienDo(row, pack, job, ctx, nowMs, turnId) {
    if (!pack?.onJobProgress) return;
    const c = row.context ?? {};
    if (c.tienDoAt) return;
    const batDau = Date.parse(row.created_at ?? row.expires_at ?? '') || nowMs;
    const choMs = nowMs - batDau;
    if (choMs < PROGRESS_AFTER_MS) return;
    let res;
    try {
      res = await pack.onJobProgress(job, { choMs }, ctx);
    } catch (e) {
      log.error?.(`[jobs] onJobProgress việc ${row.id}: ${redact(e?.message)}`);
      return;
    }
    const text = res?.replies?.[0]?.text;
    // Ghi cờ TRƯỚC khi gửi: cửa chặn (giờ yên, phòng sang người) vẫn không được biến thành báo lại mỗi nhịp.
    store.jobs.update(row.id, { context: { ...c, tienDoAt: iso(nowMs) } });
    if (!text) return;
    const prefix = c.isGroup === true
      ? groupNameTag({ isGroup: true, userName: c.userName, userId: c.userId, members: store.convs.listByChat(row.chat_id) })
      : '';
    const g = await gate.send({
      idemKey: `j:${row.conv_id}:${row.ma_luot}:td`, chatId: row.chat_id, convId: row.conv_id, isGroup: c.isGroup === true,
      turnId, kind: 'job_result', text: prefix + text, inReplyToAt: c.receivedAt ?? null,
      pack: { id: pack.id, moneyCheck: pack.moneyCheck === true }, evidence: [],
    });
    audit(turnId, row.chat_id, row.conv_id, 'job-progress', { job: row.id, maLuot: row.ma_luot, choMs, decision: g.decision, reason: g.reason });
  }

  /** Hỏi mọi việc đến hạn một lượt. Trả số việc đã nhận xử lý (0 = không có việc). */
  async function tick() {
    const nowDate = now();
    const nowIso = nowDate.toISOString();
    const rows = store.jobs.due(nowIso);
    const all = registry.available(null, { isStaff: true });
    let n = 0;
    for (const row of rows) {
      if (!store.jobs.claim(row.id)) continue;   // tiến trình/lượt khác đã nhận dòng này (waiting → polling)
      n++;
      const c = row.context ?? {};
      const turnId = `job:${row.id}`;
      // Kiểm phòng TRƯỚC mọi lời gọi ra ngoài (danh sách công cụ, Cổng, gói): người cầm phòng thì máy im.
      const st = phong(row);
      if (st !== 'bot') {
        try { await nhuongNguoi(row, st, turnId, nowDate.getTime()); } catch (e) {
          audit(turnId, row.chat_id, row.conv_id, 'error', { stage: 'job-handoff', job: row.id, message: redact(e?.message) });
          hoanLai(row, nowDate.getTime());
        }
        continue;
      }
      const pack = all.find((p) => p.id === row.pack);
      const ctx = buildCtx({ store, mcp, tools: await tools(), vision, brain, editor, now, log, chatId: row.chat_id, convId: row.conv_id, turnId, sessionKey: row.session_key, ttlMs, ghiTruot });
      const job = { id: row.id, chatId: row.chat_id, convId: row.conv_id, maLuot: row.ma_luot, resultTool: row.result_tool, context: c.data ?? null };
      const expired = nowDate.getTime() >= Date.parse(row.expires_at);
      try {
        if (!pack?.onJobResult) throw new Error(`gói ${row.pack} không có onJobResult`);
        let result = null;
        if (!expired) {
          result = await ctx.mcp.callTool(row.result_tool, { maLuot: row.ma_luot });
          if (stateOf(result) === 'DANG_XU_LY') {
            await baoTienDo(row, pack, job, ctx, nowDate.getTime(), turnId);
            hoanLai(row, nowDate.getTime());
            continue;
          }
        }
        // result = null: gói tự soạn câu hết hạn (packs/hs/jobs.js:18). Lõi không soạn chữ cho khách.
        const res = await pack.onJobResult(job, result, ctx);
        // Hồ sơ khách (T035): nhãn + món quan tâm của kết quả việc nền. Ghi NGAY khi gói trả, trước
        // khi gửi: cửa có thể chặn tin (giờ yên, phòng sang 'human') nhưng điều khách HỎI vẫn đã xảy
        // ra, nên hồ sơ phải ghi. KHÔNG đếm lượt ở đây — `turns` là số lượt KHÁCH nhắn (FR-025).
        if (ghiHoSo) ghiHoSo(row.conv_id, res);
        // Tên gắn lúc gửi: người trùng tên trong nhóm có hậu tố 2 ký tự cuối userId (FR-031).
        const prefix = c.isGroup === true
          ? groupNameTag({ isGroup: true, userName: c.userName, userId: c.userId, members: store.convs.listByChat(row.chat_id) })
          : '';
        const sent = [];
        for (const [i, r] of (res?.replies ?? []).entries()) {
          const idemKey = i === 0 ? `j:${row.conv_id}:${row.ma_luot}` : `j:${row.conv_id}:${row.ma_luot}:${i}`;
          const g = await gate.send({
            idemKey, chatId: row.chat_id, convId: row.conv_id, isGroup: c.isGroup === true, turnId, kind: 'job_result', text: prefix + r.text,
            inReplyToAt: c.receivedAt ?? null,   // dòng jobs cũ không có trường → null, cửa coi là tin chủ động (issue #55)
            pack: { id: pack.id, moneyCheck: pack.moneyCheck === true }, evidence: res.evidence ?? [],
          });
          sent.push({ idemKey, decision: g.decision, reason: g.reason, status: g.status, text: r.text });
        }
        // Tin thoại cho job_result (issue #136, mục 6): gọi guiThoai phát âm thanh tóm tắt ngắn khi bật voice.
        if (guiThoai && res?.replies?.length) {
          const turnFake = {
            convId: row.conv_id,
            chatId: row.chat_id,
            isGroup: c.isGroup === true,
            receivedAt: c.receivedAt ?? nowIso,
            replayed: false,
            isVoice: false,
          };
          try { await guiThoai(turnFake, res, `j:${row.ma_luot}`, sent); } catch {}
        }
        // Phòng sang 'human' GIỮA lúc gói soạn (nhân viên /nhan, /tl): cửa chặn `chat-human`. Kết quả đã
        // soạn không được mất im lặng — chuyển nguyên văn vào phiếu cho nhân viên (#33).
        const bi = sent.filter((x) => x.decision === 'reject' && x.reason === 'chat-human');
        if (bi.length) {
          const r = await giuChoNhanVien(row, 'kết quả việc nền chưa giao', (t) => [
            `Phòng chuyển sang nhân viên trong lúc bot soạn kết quả (mã lượt ${row.ma_luot}), nên bot KHÔNG gửi. Nội dung bot định gửi — xem rồi trả lời khách bằng /tl P${t.id} <nội dung>:`,
            ...bi.map((x) => x.text),
          ], `j:${row.conv_id}:${row.ma_luot}:nv`);
          if (!r.xong) canhBao(row.chat_id, 'job-human-undelivered');
        }
        for (const x of sent) delete x.text;   // audit chỉ giữ quyết định của cửa, không chép lại nội dung
        store.jobs.update(row.id, { status: expired ? 'expired' : 'done', done_at: now().toISOString() });
        audit(turnId, row.chat_id, row.conv_id, 'outbound', { job: row.id, maLuot: row.ma_luot, status: expired ? 'expired' : 'done', results: sent });
      } catch (e) {
        // Lỗi tạm (Cổng rớt mạng) → hỏi lại theo nhịp; gói hỏng hoặc đã hết hạn → dừng việc (failed) và BÁO NGƯỜI:
        // khách đã được hứa một kết quả mà lõi không giao được (Điều VII "không chắc thì dừng, và báo nhân viên").
        const msg = redact(e?.message);
        audit(turnId, row.chat_id, row.conv_id, 'error', { stage: 'job', job: row.id, message: msg });
        log.error?.(`[jobs] việc ${row.id}: ${msg}`);
        if (!pack?.onJobResult || expired) {
          store.jobs.update(row.id, { status: 'failed', done_at: nowIso });
          canhBao(row.chat_id, 'job-failed');
        } else {
          hoanLai(row, nowDate.getTime());
        }
      }
    }
    return n;
  }

  /** Gọi MỘT LẦN lúc khởi động, trước tick đầu. Dòng 'polling' còn lại là của tiến trình đã chết giữa lượt hỏi
   *  (một tiến trình một tệp db — hiến pháp, mục Ràng buộc kỹ thuật): đưa về 'waiting' để hỏi lại ngay.
   *  Hỏi lại là an toàn: Cổng OZ trả kết quả theo maLuot, và tin ra vẫn khoá idem j:<conv>:<maLuot>. */
  function recover() {
    const nowIso = now().toISOString();
    const rows = store.jobs.polling();
    for (const row of rows) {
      store.jobs.update(row.id, { status: 'waiting', next_poll_at: nowIso });
      audit(`job:${row.id}`, row.chat_id, row.conv_id, 'error', { job: row.id, maLuot: row.ma_luot, reason: 'crash-mid-poll', attempts: row.attempts ?? 0 });
    }
    return rows.length;
  }

  return { add, tick, recover };
}
