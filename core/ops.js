// core/ops.js — /health và /metrics (T027, US5): người phụ trách nhìn được bot đang làm gì
// mà không phải đọc log thô.
// Ranh giới: chỉ ĐỌC db và hỏi trạng thái ngoài. KHÔNG gửi tin ra khách (Điều I) và
// KHÔNG lộ dữ liệu khách: payload chỉ có số tổng hợp + từ khoá lý do (Điều IX).
import { createHealthPayload } from './health.js';

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

export function createOps({ store, mcp, channel, config = {}, startedAt = new Date(), version, now = () => new Date(), log = console } = {}) {
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

  return { health, metrics };
}
