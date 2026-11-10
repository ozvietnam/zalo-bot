// Lõi một lượt (plan.md "Luồng một lượt"): parse → chống trùng → trạng thái phòng → chats → lệnh nhân viên → ALLOW →
// phòng ≠ bot thì im + phiếu → giới hạn → turn → audit → "gặp người"/"người hay máy" → gói → cửa → jobs → handoff → inbox.done.
// Lõi không biết gói làm gì; mọi tin ra đi qua gate.send. Thay createBot của lib/bot.js (đường cũ cho test: test/helpers/legacy-bot.mjs).
import { createHash } from 'node:crypto';
import { redact } from './redact.js';
import { isCloser } from './text.js';
import { isGroup, stripMention, groupNameTag, hasMention } from './mention.js';
import { convIdOf } from './conv.js';
import { createToolCache, buildCtx, sessionApi } from './engine-ctx.js';
import { createJobs } from './jobs.js';
import { createHandoff } from './handoff.js';
import { createHumanRoute } from './engine-handoff.js';
import { createCustomers } from './customers.js';
import { createVoiceRoute } from './engine-voice.js';
import { createGiongNoi } from './giong-noi.js';

export const NON_TEXT_TEXT = 'Bot đọc tin nhắn chữ và ảnh. Gõ "menu" để xem các gói tra cứu.';
export const RATE_LIMIT_TEXT = 'Bạn gửi hơi nhanh, đợi khoảng 1 phút rồi thử lại nhé.';
export const GENERIC_ERROR_TEXT = '{orange}⚠️ Cổng tra cứu OZ đang lỗi tạm thời{/orange}. Bạn thử lại sau ít phút nhé.';

const toSet = (v) => new Set([...(v ?? [])].filter(Boolean));
const sha1 = (s) => createHash('sha1').update(String(s ?? '')).digest('hex');
const json = (v) => { try { return JSON.stringify(v) ?? 'null'; } catch { return '{}'; } };
/** Trong nhóm mọi tin ra bắt đầu "@<tên>\n"; tên trùng trong nhóm có hậu tố 2 ký tự userId (FR-031). */
const addressOf = (who, text) => (who.namePrefix ? who.namePrefix + text : text);

/**
 * @param {object} o
 * @param {(ms:number)=>void} [o.advance]  chỉ đồng hồ ảo (createBot cũ): drain() nhảy tới mốc việc nền kế tiếp thay vì ngủ.
 * @param {(chatId:string, reason:string)=>void} [o.onAlert]  báo người khi việc nền hứa rồi không giao được (Điều VII).
 * @param {(key:string, fn:()=>Promise<any>)=>Promise<any>} [o.runTask]  hàng đợi tuần tự theo người (T019);
 *   mặc định chạy thẳng. Chỉ `recover()` dùng — `process()` đã được người gọi đặt trong hàng đợi.
 * @param {object} [o.handoff]  người cầm phòng (`core/handoff.js`, T026). `server.js` truyền ĐÚNG bản dùng chung với
 *   cửa (`onTicket`): cờ chống gửi chồng của phiếu sống trong bộ nhớ, hai bản sẽ gộp trùng. Không truyền (test cũ)
 *   thì tự dựng từ `config` — lõi không bao giờ chạy thiếu luật người trước máy (Điều II).
 */
export function createEngine({ config = {}, store, channel, mcp, vision = null, brain = null, editor = null, registry, gate, now = () => new Date(), log = console, advance, missLog = null, onAlert = () => {}, runTask = (key, fn) => fn(), handoff = null, giongNoi = null } = {}) {
  // Sổ ghi lượt "trượt từ vựng" (gói 1 cần hỏi thêm, tiền lệ 0 kết quả, khách gõ lại) — null = tắt.
  const ghiTruot = missLog ? (loai, info) => missLog.ghi(loai, info) : null;
  const ttlMs = config.sessionTtlMs ?? 7_200_000;
  const ratePerMin = config.rateLimitPerMin ?? 10;
  const allow = toSet(config.allowUsers);
  const staff = toSet(config.staffUsers);
  const names = [...(config.botNames ?? [])];
  const isPublicBot = registry.available().some((p) => p.id === 'hs');
  const tools = createToolCache({ mcp, now, log });
  const hits = new Map();
  const ho = handoff ?? createHandoff({ store, gate, config, now, log: (...a) => log.error?.('[handoff]', ...a) });
  // Hồ sơ khách (T035). `createCustomers` không giữ trạng thái trong bộ nhớ (mọi thứ ở `store.customers`),
  // nên `core/handoff.js` dựng bản riêng cho phiếu mà hai bản vẫn đọc/ghi cùng một chỗ. Ngày nào
  // `core/customers.js` có bộ nhớ đệm thì hai bản sẽ lệch nhau — lúc đó phải truyền một bản dùng chung.
  const customers = createCustomers({ store, config, now });
  const gn = giongNoi ?? createGiongNoi({ apiKey: config.geminiKey, model: config.geminiTtsModel, voice: config.geminiTtsVoice, prompt: config.geminiTtsPrompt, dataDir: config.dataDir, publicBaseUrl: config.publicBaseUrl, log });
  const voiceRoute = createVoiceRoute({ store, gate, giongNoi: gn, config, log, audit: (t, c, co, tu, d) => store.audit.add({ at: now().toISOString(), turn_id: tu, chat_id: c, conv_id: co ?? null, type: t, data: d }) });

  /** Hồ sơ là SỔ PHỤ: ghi lỗi (db khoá) thì lượt vẫn chạy tiếp, không được đẩy khách sang câu
   *  "Cổng đang lỗi tạm thời" và nuốt luôn lời khách (Điều II, Điều VII). */
  function hoSo(viec, fn) {
    try { return fn(); } catch (e) { log.error?.(`[engine] không ghi được hồ sơ khách (${viec}): ${redact(e?.message)}`); return null; }
  }

  /** Áp `labels`/`interests` của một PackResult vào hồ sơ. Dùng cho CẢ lượt khách và kết quả việc nền:
   *  gói 1 của hs trả mã HS ở `onJobResult`, không phải trong lượt (`packs/hs/packages.js:178`).
   *  Nguồn luôn 'auto' — nhãn máy không được đè nguồn `staff:*` (`core/customers.js:96`). */
  function ganKetQua(convId, res) {
    if (res?.labels?.length) hoSo('nhãn của gói', () => customers.addLabels(convId, res.labels, 'auto'));
    if (res?.interests?.length) hoSo('món của gói', () => customers.addInterests(convId, res.interests));
  }

  // Việc nền bền (T021): lõi nợ khách kết quả đã hứa, hỏi Cổng tới khi xong rồi gửi qua cùng một cửa.
  // Phòng có người cầm thì việc nền không hỏi Cổng, không gọi gói mà để lại cho nhân viên (T026).
  const jobs = createJobs({ store, mcp, registry, gate, now, log, tools, vision, brain, editor, ttlMs, ghiTruot, onAlert, handoff: ho, ghiHoSo: ganKetQua, guiThoai: voiceRoute.guiThoai });

  function limited(uid) {
    const t = now().getTime();
    const arr = (hits.get(uid) || []).filter((x) => t - x < 60_000);
    arr.push(t);
    hits.set(uid, arr);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((x) => t - x < 60_000)) hits.delete(k);
    return arr.length > ratePerMin;
  }

  const audit = (type, chatId, convId, turnId, data) => store.audit.add({ at: now().toISOString(), turn_id: turnId, chat_id: chatId, conv_id: convId ?? null, type, data });

  /** Gửi một câu trả lời cho lượt qua cửa (idem r:<conv>:<turn>:<i>; câu báo lỗi chung dùng i = 'err'). */
  function reply(turn, text, i, { kind = 'reply', pack = null, evidence = [] } = {}) {
    return gate.send({
      idemKey: `r:${turn.convId}:${turn.turnId}:${i}`, chatId: turn.chatId, convId: turn.convId, isGroup: turn.isGroup,
      turnId: turn.turnId, kind,
      text: addressOf(turn, text), inReplyToAt: turn.receivedAt, pack: pack ? { id: pack.id, moneyCheck: pack.moneyCheck === true } : null, evidence,
      // Lượt phát lại (T020): tin khách chưa ai trả lời → phòng đang nợ một câu, nên cửa không được
      // coi là "máy tự nhắn" (proactive-no-debt). Giờ yên vẫn hoãn tới 07:00, đúng FR-005.
      debt: turn.replayed === true,
    });
  }

  const hsFooter = (ctx) => registry.available(null, { isStaff: true }).find((p) => p.id === 'hs')?.footer?.(ctx) || '';

  // `ganNhan`: đường "khách xin gặp người" nằm ở `engine-handoff.js` và gắn nhãn TRƯỚC khi mở phiếu.
  const human = createHumanRoute({ store, handoff: ho, config, now, staffChatId: config.staffChatId, audit, reply,
    ganNhan: (convId, labels) => hoSo('gắn nhãn', () => customers.addLabels(convId, labels, 'auto')) });

  /**
   * Một lượt. `replayedAt` chỉ do recover() truyền (T020): mốc khách nhắn THẬT lấy từ `inbox.received_at`.
   * Không được đóng dấu now() cho lượt phát lại — cửa sẽ coi tin cũ là "trả lời trực tiếp" và bỏ qua giờ yên
   * (`core/gate-decide.js:27-31`), và bản ghi hội thoại sẽ ghi sai lúc khách nhắn (Điều IV).
   */
  async function process(update, { replayedAt = null } = {}) {
    const nowIso = now().toISOString();
    const atIso = replayedAt ?? nowIso;
    const u = update && typeof update === 'object' && 'updateKey' in update ? update : channel.parse(update);
    if (!u || !u.chatId) return { skipped: 'no-chat', turnId: null };
    const key = u.updateKey;
    // Mốc "khách nhắn lúc nào": lượt thường là bây giờ, lượt phát lại là lúc webhook đã ghi inbox.
    // Chống trùng: server ghi inbox (pending) trước; gọi thẳng (test) thì lõi tự ghi. Chỉ ai claim được pending → processing
    // mới chạy gói (cùng khoá đang chạy, done hay failed đều là trùng). Ghi + claim trong một giao dịch.
    const mine = store.tx(() => {
      if (!store.inbox.get(key)) store.inbox.insertIgnore({ update_key: key, chat_id: u.chatId, user_id: u.userId ?? null, raw: json(u.raw ?? u), received_at: atIso });
      return store.inbox.claim(key, nowIso);
    });
    if (!mine) return { skipped: 'duplicate', turnId: key };
    const done = (r) => { store.inbox.markDone(key, now().toISOString()); return { ...r, turnId: key }; };

    const group = isGroup(u);
    const convId = convIdOf({ chatId: u.chatId, userId: u.userId, isGroup: group, channel: u.channel });
    // Trạng thái phòng đọc TRƯỚC khi ghi mốc tin mới (lý do ở `core/engine-handoff.js`, hàm `phong`).
    const state = human.phong(u.chatId, convId);
    store.chats.upsertSeen(u.chatId, group ? 'group' : 'user', group ? null : u.userName ?? null, atIso);
    store.convs.upsertSeen(convId, u.chatId, u.userId ?? null, u.userName ?? null, atIso);

    // Tên gắn ở nhóm: người trùng tên trong nhóm có hậu tố 2 ký tự cuối userId (FR-031).
    const namePrefix = group ? groupNameTag({ isGroup: true, userName: u.userName, userId: u.userId, members: store.convs.listByChat(u.chatId) }) : '';
    const isPhoto = /image|photo/i.test(u.event || '') && Boolean(u.photoUrl);
    const isVoice = /voice/i.test(u.event || '') || Boolean(u.voiceUrl);
    const isText = !isPhoto && !isVoice && (u.event === 'message.text.received' || u.isEcho) && Boolean(u.text);
    const text = (isText || (isVoice && u.text) || (u.isEcho && u.text)) ? stripMention(u.text, names) : null;
    const caption = u.caption == null ? null : stripMention(u.caption, names);
    const turn = { turnId: key, chatId: u.chatId, convId, userId: u.userId ?? null, userName: u.userName ?? null, isGroup: group, receivedAt: atIso, namePrefix, replayed: replayedAt != null,
      text, caption, photoUrl: isPhoto ? u.photoUrl : null, voiceUrl: isVoice ? u.voiceUrl : null, isVoice, isStaff: staff.has(u.userId) };
    // Tin CHỈ nhắc tên bot ("@bot" trơ trọi — tin 10:00 của issue #170): sau khi lõi bỏ nhắc tên thì
    // không còn chữ nào, NHƯNG khách đã gọi bot và đang chờ. Bỏ sớm như tin rỗng thì gói không bao giờ
    // chạy (bot im), mà dòng inbox vẫn markDone và không có dòng `messages` → SC-008 lệch
    // ("tin khách vào != tin khách trong messages"). Gói nhận `text` rỗng và hiểu là lệnh trỏ vào
    // việc đang xử lý; sổ `messages` ghi đúng chữ khách gõ.
    // Nhận cả khi `botNames` rỗng: `stripMention` vẫn bỏ "@tên" đứng đầu, nên dấu hiệu chắc nhất là
    // "tin có chữ, bỏ nhắc tên thì không còn gì". Tin chỉ có khoảng trắng KHÔNG tính (không có "@").
    const chiNhacTen = isText && !text && (/^@/.test(String(u.text).trim()) || hasMention(u.text, names));
    const said = isPhoto ? `[ảnh] ${turn.photoUrl}${caption ? ` ${caption}` : ''}` : (isVoice ? `[thoại] ${turn.voiceUrl || ''}${caption ? ` ${caption}` : ''}` : (chiNhacTen ? String(u.text).trim() : text));
    // `at` của dòng audit là lúc GHI SỔ (giữ nguyên, đúng sự thật); `receivedAt` là lúc KHÁCH NHẮN.
    // Lượt phát lại hai mốc này lệch nhau, nên ghi cả hai mới tra lại được (Điều IV).
    const ghiVao = (s, extra = {}) => audit('inbound', turn.chatId, turn.convId, key, { event: u.event, isGroup: group, userId: turn.userId, receivedAt: turn.receivedAt, replayed: turn.replayed === true, sha1: sha1(s), head: redact(s ?? '').slice(0, 500), ...extra });
    if (u.isEcho === true) return done(await human.echo(u, turn, ghiVao));
    let pack = null;
    let ctx = null;
    try {
      // Lệnh nhân viên TRƯỚC danh sách ALLOW và bộ chặn tốc độ: `handoff.command` tự kiểm quyền, còn `/tl`
      // bị chặn tốc độ thì lời nhân viên mất im lặng (trong nhóm không có câu "gửi hơi nhanh").
      const cmd = text ? await human.lenh(turn, ghiVao) : null;
      if (cmd) return done(cmd);
      if (allow.size && !allow.has(u.userId) && !allow.has(u.chatId)) return done({ skipped: 'not-allowed' });
      // Trong nhóm, bot chỉ trả lời khi tin nhắn nhắc tên bot (hoặc là lệnh nhân viên đã xử lý ở trên)
      if (group && names.length > 0 && isPublicBot && !hasMention(u.text, names) && !hasMention(u.caption, names)) {
        return done({ skipped: 'group-unmentioned' });
      }
      // Lệnh tắt/bật giọng: SAU ALLOW và SAU kiểm nhắc tên — trong nhóm không gọi bot thì im (G2, #127).
      const vCmd = text ? await voiceRoute.lenh(turn, reply) : null;
      if (vCmd) return done(vCmd);
      // Hồ sơ khách (T035) ghi TRƯỚC khi rẽ nhánh phòng: phòng do người cầm vẫn phải đếm lượt và lấy
      // SĐT khách gõ — đó đúng lúc nhân viên cần hồ sơ nhất, và `human.im` mở phiếu in `summary()`.
      // Đứng SAU lệnh nhân viên (nhóm STAFF không phải khách) và SAU ALLOW (lõi không nhận lượt đó).
      hoSo('touch', () => customers.touch(turn));
      // Người trước máy (Điều II, FR-011): phòng không phải 'bot' thì chỉ ghi tin + chuyển phiếu rồi im.
      if (state !== 'bot') return done(await human.im(turn, said || (isText ? null : `[${u.event || 'tin không phải chữ'}]`), state, ghiVao));
      if (!isPhoto && !isText && !isVoice) {
        if (group) return done({ skipped: 'group-non-text' });
        await reply(turn, NON_TEXT_TEXT, 0, { kind: 'notice' });
        return done({ handled: 'non-text' });
      }
      if (isVoice && !text) {
        if (group) return done({ skipped: 'group-non-text' });
        await reply(turn, 'Dạ em đã nhận được tin nhắn thoại của bạn. Bạn vui lòng nhắn tin chữ để em hỗ trợ tra cứu nhanh nhất nhé.', 0, { kind: 'notice' });
        return done({ handled: 'voice-received' });
      }
      // Bộ chặn tốc độ chỉ hợp lý trên đường thường: nó là cửa sổ 60 giây theo now(). Lượt phát lại (T020)
      // là tồn đọng rải ra HÀNG GIỜ nhưng chạy hết ở cùng một mốc now(), nên nếu đo thì từ tin thứ
      // `rateLimitPerMin`+1 của cùng một người trở đi mọi lượt bị coi là "gửi quá nhanh": khách nhận câu
      // "gửi hơi nhanh" thay cho câu trả lời, các lượt sau bị cửa drop vì trùng nội dung, mà dòng inbox vẫn
      // markDone → tin khách MẤT VĨNH VIỄN (phá SC-001 và FR-016). Không đo, cũng không ghi vào cửa sổ:
      // ghi thì lượt phát lại sẽ làm tin MỚI ngay sau đó bị chặn oan.
      if (!turn.replayed && limited(u.userId || u.chatId)) {
        if (!group) await reply(turn, RATE_LIMIT_TEXT, 0, { kind: 'notice' });
        return done({ handled: 'rate-limited' });
      }
      if (!isPhoto && !text && !chiNhacTen) return done({ skipped: 'empty' });
      ghiVao(said);

      const sessionKey = convId;
      const session = sessionApi({ store, key: sessionKey, ttlMs, now });
      session.touch();
      const last = store.messages.recent(turn.convId, 1)[0];
      store.messages.add({ conv_id: turn.convId, chat_id: turn.chatId, turn_id: key, speaker: 'khach', speaker_id: turn.userId, text: said, at: turn.receivedAt });
      // Chào kết ("cảm ơn ạ") ngay sau câu bot: im. Hai ngoại lệ, cùng một ý — BOT ĐANG CHỜ KHÁCH ĐÁP,
      // nên "ok"/"vâng"/"dạ" là CÂU TRẢ LỜI, phải tới gói:
      //   • `choXacNhanAnh`: gói vừa in thông số đọc từ ảnh và xin khách xác nhận;
      //   • `choKhachTraLoi`: gói vừa HỎI LẠI một câu (mâu thuẫn ảnh ↔ chữ của issue #170).
      // Thiếu cờ thứ hai thì câu đáp bị nuốt (`skipped:'closer'`, 0 tin ra) và câu bot vừa hỏi thành
      // vô ích — người soát đo được đúng tin 10:12 của issue. Gói bật cờ khi hỏi; cờ sống đúng một
      // lượt khách (gói tự xoá ở đầu lượt sau), nên chào kết thật vẫn im như cũ.
      const phien = session.get();
      if (!isPhoto && isCloser(text) && last?.speaker === 'bot' && !phien.choXacNhanAnh && !phien.choKhachTraLoi) {
        audit('outbound', turn.chatId, turn.convId, key, { skipped: 'closer', results: [] });
        return done({ skipped: 'closer' });
      }
      // "gặp nhân viên" / "người hay máy": câu cố định của lõi, TRƯỚC khi chọn gói (T026).
      const yKhach = await human.y(turn);
      if (yKhach) return done(yKhach);

      ctx = buildCtx({ store, mcp, tools: await tools(), vision, brain, editor, now, log, chatId: turn.chatId, convId: turn.convId, turnId: key, sessionKey, ttlMs, ghiTruot });
      pack = registry.pick(turn, ctx);
      audit('route', turn.chatId, turn.convId, key, { pack: pack?.id ?? null });
      if (!pack) return done({ skipped: 'no-pack' });
      Promise.resolve().then(() => channel.typing?.(turn.chatId)).catch(() => {});
      const res = (await pack.handle(turn, ctx)) ?? {};
      const evidence = [...(res.evidence ?? []), turn.text, turn.caption].filter((v) => v != null);
      // Nhãn và món quan tâm gói trả về (`contracts/pack.md`) ghi vào hồ sơ NGAY, trước khi gửi câu
      // trả lời và trước `human.goiChuyen`: gói xin chuyển người thì phiếu mở ra phải thấy hồ sơ của
      // chính lượt này (phiếu in `summary()`), không phải hồ sơ của lượt trước.
      ganKetQua(turn.convId, res);
      const results = [];
      for (const [i, r] of (res.replies ?? []).entries()) {
        const g = await reply(turn, r.text, i, { pack, evidence });
        results.push({ idemKey: `r:${turn.convId}:${key}:${i}`, decision: g.decision, reason: g.reason, status: g.status });
      }
      await voiceRoute.guiThoai(turn, res, key, results);
      let soViec = 0;
      for (const job of res.jobs ?? []) {
        if (jobs.add(turn, sessionKey, pack.id, job) !== null) soViec++;
      }
      // Gói xin chuyển người (FR-014): lõi báo khách rồi chuyển phòng + mở phiếu với lý do của gói.
      if (res.handoff) results.push(await human.goiChuyen(turn, pack, res.handoff, evidence));
      audit('outbound', turn.chatId, turn.convId, key, { pack: pack.id, results, jobs: soViec });
      log.info?.(`[engine] gói ${pack.id} chat=${String(turn.chatId).slice(-4)} tin=${results.length}`);
      return done({ handled: pack.id, pack: pack.id });
    } catch (e) {
      const message = redact(e?.message);
      log.error?.(`[engine] lỗi lượt (gói ${pack?.id ?? '-'}): ${message}`);
      try { audit('error', turn.chatId, turn.convId, key, { stage: 'turn', pack: pack?.id ?? null, message: message.slice(0, 500) }); } catch { /* db hỏng: vẫn báo khách */ }
      try {
        const footer = pack?.footer?.(ctx ?? {}) || hsFooter(ctx ?? {});
        await reply(turn, footer ? `${GENERIC_ERROR_TEXT}\n\n${footer}` : GENERIC_ERROR_TEXT, 'err', { pack });
      } catch (e2) {
        log.error?.(`[engine] không gửi được câu báo lỗi: ${redact(e2?.message)}`);
      }
      try { store.inbox.markFailed(key, message.slice(0, 500), now().toISOString()); } catch (e3) { log.error?.(`[engine] không ghi được inbox failed: ${redact(e3?.message)}`); }
      return { handled: 'error', turnId: key };
    }
  }

  /** Dựng lại Update từ `inbox.raw` (webhook lưu payload gốc của Zalo, lõi lưu update đã parse).
   *  Trả null nếu không dùng được: raw hỏng, kênh không hiểu, thiếu chatId, hoặc updateKey lệch khoá đã lưu
   *  (lệch khoá thì process() sẽ ghi một dòng inbox KHÁC và dòng này treo lại mãi). */
  function rebuild(row) {
    let obj;
    try { obj = JSON.parse(row.raw); } catch { return null; }
    if (!obj || typeof obj !== 'object') return null;
    let u;
    try { u = 'updateKey' in obj ? obj : channel.parse(obj); } catch { return null; }
    if (!u || !u.chatId || u.updateKey !== row.update_key) return null;
    return u;
  }

  /** Gọi MỘT LẦN lúc khởi động, SAU gate.recover() (contracts/send-gate.md:52). Webhook đã ack 200 cho
   *  Zalo nên những dòng này sẽ không được gửi lại: không chạy lại là mất tin khách (SC-001).
   *  'processing' lúc khởi động đều là mồ côi (một tiến trình, một tệp db) → trả về 'pending' rồi chạy.
   *  Trả số dòng đã đẩy đi xử lý. Dòng không dựng lại được thì 'failed' để vòng sau không nhặt lại mãi. */
  async function recover() {
    // Số dòng 'processing' mồ côi = số lượt bị cắt GIỮA lượt. Đáng một dòng log riêng: khác 0 nhiều lần
    // liên tiếp là dấu hiệu crash loop (chưa có đếm số lần thử cho inbox — xem ghi chú kèm PR).
    const motCoi = store.inbox.requeueProcessing();
    if (motCoi) log.warn?.(`[engine] recover: ${motCoi} lượt bị cắt giữa lượt, trả về hàng đợi`);
    let n = 0;
    for (const row of store.inbox.pending()) {
      const u = rebuild(row);
      if (!u) {
        log.error?.(`[engine] recover: bỏ dòng inbox không dựng lại được (${row.update_key})`);
        try { store.inbox.markFailed(row.update_key, 'recover: raw không dựng lại được Update', now().toISOString()); }
        catch (e) { log.error?.(`[engine] recover: không ghi được inbox failed: ${redact(e?.message)}`); }
        continue;
      }
      // Qua hàng đợi theo NGƯỜI như đường webhook (T019): hai lượt cùng người không chạy chồng.
      // Lượt lỗi vẫn để dòng ở 'pending' — lần khởi động sau nhặt lại; không chặn các lượt còn lại.
      // `replayedAt`: mốc khách nhắn THẬT, để cửa chấm giờ yên theo lúc khách nhắn chứ không theo lúc bot lên lại.
      // Chỉ đếm lượt CHẠY ĐƯỢC: interface T020 khai "số tin pending ĐÃ XỬ LÝ", nên đếm cả lượt
      // ném lỗi là khai khống (Điều VIII) và che mất ca "nhặt lại mãi mà không lượt nào xong".
      try {
        await runTask(convIdOf({ chatId: u.chatId, userId: u.userId, isGroup: isGroup(u), channel: u.channel }), () => process(u, { replayedAt: row.received_at }));
        n++;
      } catch (e) { log.error?.(`[engine] recover: lượt ${row.update_key} lỗi: ${redact(e?.message)}`); }
    }
    if (n) log.info?.(`[engine] recover: đã nhặt lại ${n} tin vào còn dở`);
    return n;
  }

  /** Chạy việc đến hạn (việc nền + quét outbox + gộp tin vào phiếu) tới khi một lượt quét không còn việc. Đồng hồ ảo: nhảy tới mốc việc nền kế. */
  let draining = false;
  async function drain() {
    if (draining) return;   // drain chồng (bộ hẹn giờ + gọi tay) → lần sau về ngay, như gate.sweep
    draining = true;
    try {
      await drainLoop();
    } finally {
      draining = false;
    }
  }

  async function drainLoop() {
    for (let guard = 0; guard < 10_000; guard++) {
      const n = await jobs.tick();
      const m = await gate.sweep();
      // Phiếu hết cửa sổ gộp mà còn tin khách thì chuyển (T024, nối vào đây ở T026, `core/handoff-ticket.js:246`).
      const k = await ho.flushDue();
      if (n + m + k > 0) continue;
      const next = advance ? store.jobs.nextDue() : null;
      if (!next) return;
      advance(Date.parse(next));
    }
    throw new Error('drain: quá 10000 vòng');
  }

  // jobs: server.js gọi jobs.recover() một lần lúc khởi động (dòng kẹt 'polling' của tiến trình đã chết).
  // recover(): inbox còn 'pending'/'processing' lúc khởi động (T020), gọi SAU gate.recover() và jobs.recover().
  return { process, recover, drain, tools, jobs, handoff: ho };
}
