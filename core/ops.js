// core/ops.js — /health, /metrics (T027, US5) và bản tin gộp 08:00/17:00 (T028).
// Người phụ trách nhìn được bot đang làm gì mà không phải đọc log thô.
// Ranh giới: health/metrics chỉ ĐỌC db và hỏi trạng thái ngoài; bản tin gộp gửi cho
// phòng nhân viên và đi qua CỬA GỬI DUY NHẤT (core/gate.js) — không tự gọi kênh (Điều I).
// KHÔNG lộ dữ liệu khách: nội dung chỉ có số tổng hợp + tên lý do (Điều IX).
import { createHealthPayload } from './health.js';
import { vnHour, vnDateKey, vnDayStartUtc, isQuietHours } from './time.js';

// Dockerfile: HEALTHCHECK --timeout=5s → mọi lệnh gọi mạng trong health() có mốc chặn 2,5 giây.
const HAN_MS = 2500;

/** Gọi có mốc chặn; lỗi hoặc treo đều thành trạng thái, KHÔNG ném ra ngoài (sự cố mạng không được làm bot sập). */
async function trongHan(fn, hanMs = HAN_MS) {
  let timer;
  const thoi = new Promise((giai) => { timer = setTimeout(() => giai({ ok: false }), hanMs); });
  const that = Promise.resolve().then(fn).then((v) => ({ ok: true, v }), () => ({ ok: false }));
  try {
    return await Promise.race([that, thoi]);
  } finally {
    clearTimeout(timer);
  }
}

/** Gom lý do theo nhóm để số khoá có giới hạn (không một khoá cho mỗi số tiền). */
function nhomLyDo(reason) {
  const r = String(reason ?? '');
  if (!r) return null;
  if (r.startsWith('similar:')) return 'similar';
  if (r.startsWith('money:')) return 'money';
  return r;
}

/** Hai lý do chặn SỚM của cửa (core/gate.js): không tạo dòng outbox nên phải đếm bù từ audit. */
const LY_DO_CHAN_SOM = ['empty', 'duplicate-idem'];

/** Bốn quyết định của cửa — danh sách đóng, không dựa vào thuộc tính của object (tránh khớp khoá kế thừa). */
const QUYET_DINH = new Set(['send', 'drop', 'defer', 'reject']);

// ═══ Bản tin gộp 08:00 và 17:00 giờ VN (T028) ═══
/** Hai giờ bắn bản tin (giờ VN). */
const SLOT_BAN_TIN = new Set([8, 17]);
/** Trần chiều dài một tin (giống channel.maxText) — bản tin phải là MỘT tin, không bị chia. */
const MAX_TEXT = 2000;
/** Số lý do chặn tối đa liệt kê trong bản tin. */
const MAX_LY_DO = 10;
/** Phiếu mở quá 15 phút mà chưa ai nhận thì nhắc trong bản tin (research.md:70). */
const CHO_PHI_EU_PHAUT = 15 * 60_000;
/**
 * Số lần thử lại của cửa là 3 (RETRY_MIN trong core/gate.js). Đặt attempts cao hơn số này
 * ⇒ dòng outbox 'failed' không còn "đến hạn" ⇒ bộ quét nền không gửi lại bản tin gộp
 * ngoài giờ bắn của nó (xem digest()).
 */
const HET_LUOT_THU_LAI = 4;

/** 'YYYY-MM-DD' (ngày VN) → 'DD/MM/YYYY' hoặc 'DD/MM'. Không dùng giờ địa phương máy. */
function ngayVN(dateKey, coNam = true) {
  const [y, m, d] = String(dateKey).split('-');
  return coNam ? `${d}/${m}/${y}` : `${d}/${m}`;
}

export function createOps({ store, mcp, channel, config = {}, startedAt = new Date(), version, now = () => new Date(), log = console, gate } = {}) {
  const batDau = new Date(startedAt ?? now());

  /** Trạng thái phòng nhân viên: chưa cấu hình / chưa gửi được / đã gửi / hỏng (bot bị xoá khỏi nhóm). */
  function trangThaiStaff() {
    const chatId = config.staffChatId;
    if (!chatId) return 'unconfigured';
    let row;
    try { row = store.outbox.lastForChat(chatId); } catch { return 'unknown'; }
    if (!row) return 'unknown';
    if (row.status === 'failed') return 'unreachable';
    if (row.status === 'sent') return 'ok';
    return 'unknown';
  }

  /** /health: bất đồng bộ; KHÔNG ném lỗi ra ngoài — lỗi bất lường trở thành trạng thái. */
  async function health() {
    const nen = createHealthPayload({ mode: config.mode, startedAt: batDau, version });
    const p = { ...nen, ok: false, db: 'error', mcp: { tools: null }, zalo: 'unreachable', staff: 'unknown', inboxPending: null };
    let db = 'error';
    try { db = store.ping() ? 'ok' : 'error'; } catch { db = 'error'; }
    if (db !== 'ok') log.warn?.('[ops] db không phản hồi — /health sẽ trả ok=false');
    p.db = db;
    p.staff = trangThaiStaff();
    if (db === 'ok') {
      try { p.inboxPending = store.inbox.countPending(); } catch { p.inboxPending = null; }
    }
    // Hai lệnh gọi mạng chạy SONG SONG: /health phải trong 5 giây (Dockerfile HEALTHCHECK).
    const [cong, zalo] = await Promise.all([
      trongHan(async () => (await mcp.listTools()).length),
      trongHan(async () => { await channel.getMe(); return true; }),
    ]);
    p.mcp.tools = cong.ok && Number.isInteger(cong.v) ? cong.v : null;
    p.zalo = zalo.ok ? 'ok' : 'unreachable';
    // `ok` CHỈ phụ thuộc db: Zalo/Cổng OZ lỗi thì bot vẫn trả lời được (spec.md:212).
    p.ok = db === 'ok';
    return p;
  }

  /** /metrics: đồng bộ, chỉ số tổng hợp — không lộ nội dung tin, tên hay số điện thoại. */
  function metrics(sinceIso) {
    const since = sinceIso ?? batDau.toISOString();
    const gate = { send: 0, drop: 0, defer: 0, reject: 0, byReason: {} };
    // `Object.hasOwn` chứ không `in`: `in` khớp cả thuộc tính kế thừa của Object.prototype
    // ('constructor', 'toString'…) — và `?? 0` không cứu được khoá kế thừa vì giá trị đó không null.
    const cong = (khoa, n) => { gate.byReason[khoa] = (Object.hasOwn(gate.byReason, khoa) ? gate.byReason[khoa] : 0) + n; };
    // Lỗi đọc db được NÉM ra (không nuốt thành số 0): db chết mà trả 200 toàn số 0 là
    // "số 0 nói dối" — người phụ trách tưởng bot rảnh rác trong khi bot đang hỏng.
    // Đường HTTP bắt lỗi này (core/webhook.js: loi500) → 500 {ok:false}, tiến trình không sập.
    for (const r of store.outbox.countsByDecision(since)) {
      if (QUYET_DINH.has(r.decision)) gate[r.decision] += r.n;
      const khoa = nhomLyDo(r.reason);
      if (khoa) cong(khoa, r.n);
    }
    // Bù hai nhánh không tạo dòng outbox. Bộ quét (gate.js) ghi audit cho cùng một dòng outbox
    // nhưng không bao giờ sinh hai lý do này → không nhân đôi.
    for (const r of store.audit.countGateReasons(since, LY_DO_CHAN_SOM)) {
      const khoa = nhomLyDo(r.reason);
      if (!khoa) continue;
      cong(khoa, r.n);
      if (r.reason === 'empty') gate.reject += r.n;
      else if (r.reason === 'duplicate-idem') gate.drop += r.n;
    }
    // Dòng audit loại 'gate' có JSON hỏng: bỏ qua (không tính vào số liệu) nhưng PHẢI thấy được —
    // không thì số liệu âm thầm thiếu mà vận hành không biết. (Dòng hỏng KHÔNG làm chết endpoint:
    // countGateReasons đã lọc bằng json_valid trước khi gọi json_extract.)
    const hong = store.audit.countInvalidGate(since);
    if (hong > 0) log.warn?.(`[ops] metrics(): bỏ qua ${hong} dòng audit loại 'gate' có JSON hỏng`);
    return {
      // turns = số lượt ĐÃ NHẬN (mỗi lượt vào lõi một dòng inbox) — kể cả lượt bị chặn tần suất,
      // lượt bị chặn quyền hay tin không phải chữ. Đếm từ audit 'inbound' sẽ thiếu các lượt đó.
      turns: store.inbox.countSince(since),
      gate,
      tickets: { open: store.tickets.countOpen() },
      jobs: { waiting: store.jobs.countWaiting() },
    };
  }

  /**
   * Kỳ báo cáo của bản tin: bản tin 08:00 báo kỳ 17:00 hôm trước → 08:00 hôm nay;
   * bản tin 17:00 báo kỳ 08:00 → 17:00 hôm nay. Mốc tính bằng 00:00 VN hôm nay
   * (vnDayStartUtc) — KHÔNG dùng giờ địa phương của máy (máy chạy giờ UTC).
   */
  function kyBaoCao(slot, hienTai) {
    const dayStart = new Date(vnDayStartUtc(hienTai)).getTime();
    const tu = slot === 8 ? dayStart - 7 * 3_600_000 : dayStart + 8 * 3_600_000;
    return {
      tuIso: new Date(tu).toISOString(),
      gioTu: slot === 8 ? 17 : 8,
      ngayTu: vnDateKey(new Date(tu)),
    };
  }

  /** Danh sách lý do chặn trong kỳ, đã gom nhóm và sắp xếp: số lượng giảm dần, tên tăng dần. */
  function lyDoTrongKy(byReason) {
    const gom = new Map();
    for (const [ten, n] of Object.entries(byReason)) {
      if (ten === 'ok') continue; // 'ok' là số tin ĐÃ gửi, không phải tin bị chặn
      const khoa = nhomLyDo(ten); // gom nhóm y hệt metrics() — không viết bản thứ hai
      if (!khoa) continue;
      gom.set(khoa, (gom.get(khoa) ?? 0) + n);
    }
    return [...gom.entries()]
      .map(([ten, n]) => ({ ten, n }))
      .sort((a, b) => (b.n - a.n) || (a.ten < b.ten ? -1 : a.ten > b.ten ? 1 : 0));
  }

  /**
   * Nội dung bản tin gộp: chỉ số tổng hợp + tên lý do (Điều IX — không tên, không số điện thoại,
   * không nội dung tin khách, không đường dẫn). Nếu dài quá giới hạn kênh thì bỏ bớt mục
   * "Tin bị chặn" cho tới khi vừa — bản tin luôn là MỘT tin.
   */
  function dungNoiDung(slot, hienTai, chiSo) {
    const ky = kyBaoCao(slot, hienTai);
    const ngay = vnDateKey(hienTai);
    const gio = (h) => `${String(h).padStart(2, '0')}:00`;
    const dongDau = `📊 Bản tin OZ — ${gio(slot)} ${ngayVN(ngay)}`;
    const dongKy = `Kỳ báo cáo: ${gio(ky.gioTu)} ${ngayVN(ky.ngayTu, false)} → ${gio(slot)} ${ngayVN(ngay, false)}`;
    const xay = (soLyDo) => {
      const hien = chiSo.lyDo.slice(0, soLyDo);
      const con = chiSo.lyDo.length - hien.length;
      const chuoi = hien.length ? hien.map((e) => `${e.ten} ${e.n}`).join(' · ') : 'không có';
      return [
        dongDau,
        dongKy,
        `Lượt khách: ${chiSo.luot}`,
        `Lỗi: ${chiSo.loi}`,
        `Tin bị chặn: ${chuoi}${con > 0 ? ` · … (+${con} lý do khác)` : ''}`,
        `Phiếu chờ > 15 phút: ${chiSo.cho}`,
      ].join('\n');
    };
    let soLyDo = Math.min(chiSo.lyDo.length, MAX_LY_DO);
    let text = xay(soLyDo);
    while (text.length > MAX_TEXT && soLyDo > 0) {
      soLyDo -= 1;
      text = xay(soLyDo);
    }
    return text;
  }

  /**
   * Bản tin gộp là tin CÓ GIỜ: dòng outbox 'digest' còn đang chờ thử lại (tiến trình chết
   * giữa lúc gửi → `gate.recover()` hồi thành 'failed') chỉ được gửi lại trong đúng giờ
   * của nó — khoá `d:<ngày>:<giờ>`. Ngoài giờ đó (kể cả giờ yên 23:00–07:00) bản tin cũ
   * không được bắn ra → hết lượt thử lại (bộ quét nền sẽ không nhặt dòng này nữa).
   * Gọi TRƯỚC khi bộ quét nền quét outbox (server.js gọi digest() trước drain()).
   */
  function chanDongKhongDung(hienTai) {
    try {
      const idemGio = `d:${vnDateKey(hienTai)}:${String(vnHour(hienTai)).padStart(2, '0')}`;
      for (const o of store.outbox.due(hienTai.toISOString())) {
        if (o.kind !== 'digest') continue;
        if (o.idem_key === idemGio) continue; // đúng giờ của nó → để bộ quét thử lại
        store.outbox.update(o.id, { attempts: HET_LUOT_THU_LAI, next_retry_at: null });
      }
    } catch (e) {
      log.warn?.(`[ops] digest(): không đọc được db — bỏ qua bản tin (${e?.message})`);
    }
  }

  /**
   * Bản tin gộp cho phòng nhân viên: 08:00 và 17:00 giờ VN, một tin mỗi kỳ.
   * Đi qua cửa gửi duy nhất (Điều I). Khoá idempotency theo kỳ (`d:<ngày>:<giờ>`) nên
   * khởi động lại giữa kỳ không gửi hai lần. Lớp gọi tự chịu giờ yên (hiến pháp Điều II):
   * loại tin 'digest' được cửa miễn luật giờ yên.
   */
  async function digest() {
    const bo = (reason, idemKey = null, slot = null) => ({ status: 'skipped', idemKey, slot, reason });
    const hienTai = now();
    chanDongKhongDung(hienTai); // chặn bản tin cũ gửi lại ngoài giờ của nó (đồng bộ, trước mọi await)
    if (!gate) return bo('no-gate');
    const slot = vnHour(hienTai);
    if (!SLOT_BAN_TIN.has(slot)) return bo('not-slot');
    if (isQuietHours(hienTai)) return bo('quiet-hours');
    const staffChatId = config.staffChatId;
    if (!staffChatId) return bo('no-staff-chat'); // không cảnh báo: quét mỗi 5 giây sẽ spam log
    const ngay = vnDateKey(hienTai);
    const idemKey = `d:${ngay}:${String(slot).padStart(2, '0')}`;
    const khoaThu = `digest:attempt:${ngay}:${String(slot).padStart(2, '0')}`;
    let text;
    try {
      // Một kỳ = một khoá: đã có dòng outbox hoặc đã thử gửi → không gửi lần hai.
      if (store.outbox.hasIdem(idemKey)) return bo('already-sent', idemKey, slot);
      if (store.meta.get(khoaThu) !== null) return bo('already-sent', idemKey, slot);
      const ky = kyBaoCao(slot, hienTai);
      const chiSo = metrics(ky.tuIso);
      const han = hienTai.getTime() - CHO_PHI_EU_PHAUT;
      const cho = store.tickets.list('open')
        .filter((p) => p.opened_at && Date.parse(p.opened_at) < han).length;
      text = dungNoiDung(slot, hienTai, {
        luot: chiSo.turns,
        loi: store.audit.countByType(ky.tuIso, 'error'),
        lyDo: lyDoTrongKy(chiSo.gate.byReason),
        cho,
      });
    } catch (e) {
      // KHÔNG gửi bản tin toàn số 0: số 0 nói dối (số 0 nói dối — cùng lý do metrics()).
      log.warn?.(`[ops] digest(): không đọc được db — bỏ qua bản tin (${e?.message})`);
      return bo('db-error', idemKey, slot);
    }
    // Đánh dấu đã thử TRƯỚC khi gửi: cửa có thể từ chối mà không tạo dòng outbox
    // → nếu không đánh dấu, mỗi lượt quét 5 giây lại dựng và thử gửi (Điều VII).
    store.meta.set(khoaThu, hienTai.toISOString());
    try {
      const r = await gate.send({ idemKey, chatId: staffChatId, convId: staffChatId, isGroup: true, kind: 'digest', text });
      if (r.decision !== 'send') return bo(r.reason, idemKey, slot); // đã đánh dấu → không lặp
      if (r.status !== 'sent') {
        // Bản tin gộp là tin CÓ GIỜ (08:00/17:00). Dòng outbox 'failed' sẽ được bộ quét nền
        // (gate.sweep) thử gửi lại vào lúc bất kỳ — kể cả 23:30 giờ VN (giờ yên) hoặc 09:00
        // (ngoài hai giờ bắn) — vì tin 'digest' được cửa miễn luật giờ yên. Bản tin cũ gửi lúc
        // sai giờ là tin thừa và lệch giờ (Điều II, ràng buộc giờ yên) → hết lượt thử lại:
        // kỳ đó coi như mất (bản tin kỳ sau vẫn báo số liệu mới).
        if (r.id) store.outbox.update(r.id, { attempts: HET_LUOT_THU_LAI, next_retry_at: null });
        log.warn?.(`[ops] digest(): gửi bản tin lỗi (${r.status})`);
        return bo('send-error', idemKey, slot);
      }
      return { status: 'sent', idemKey, slot, reason: null };
    } catch (e) {
      store.meta.set(khoaThu, null); // cho phép thử lại kỳ này
      log.warn?.(`[ops] digest(): gửi bản tin lỗi (${e?.message})`);
      return bo('send-error', idemKey, slot);
    }
  }

  return { health, metrics, digest };
}
