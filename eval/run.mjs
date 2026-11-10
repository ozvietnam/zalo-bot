// eval/run.mjs (T030, research D8): phát lại kịch bản mẫu qua ĐÚNG lõi (store SQLite thật, cửa gửi, engine, gói hs)
// với Zalo, Cổng OZ và đồng hồ giả lập. Không mạng, không tốn token. In "eval: đạt/tổng"; có kịch bản trượt → thoát 1.
//
// Một dòng .jsonl là một bước:
//   {"step":"mcp","tool":"phan_loai_hs","returns":[r1, r2, …]}   lần gọi thứ n trả returns[n-1] (hết thì lặp phần tử cuối)
//   {"step":"mcp","tool":"phan_loai_hs","rules":[{"match":"<regex>","result":r}]}  luật NHẠY THAM SỐ: lần gọi
//                                             đầu tiên có tham số khớp regex trả `result` (không đi vào returns)
//   {"step":"in","update":{"id":"m1","text":"…","chatId":"c1"},"drain":true}   khách nhắn; mặc định chạy việc nền tới khi xong
//   {"step":"advance","by":"10m"} | {"step":"at","time":"2026-11-04T15:50:00Z"}   nhảy đồng hồ (UTC) rồi chạy việc đến hạn
//   {"step":"restart"}     đóng lõi, mở lại cùng tệp SQLite rồi gate.recover() + jobs.recover() + engine.recover() như server.js
//   {"step":"expect","sentTo":"c1","count":1,"match":"8413","notMatch":"C:\\\\"}   đếm/so chữ mọi tin đã gửi tới phòng
//   {"step":"expect","mcpTool":"phan_loai_hs","mcpCount":1,"mcpMatch":"…","mcpNotMatch":"…"}  đo ở TẦNG MÃ:
//                                             số lần gọi Cổng và TÊN HÀNG thật đã gửi đi
//   {"step":"staff","text":"/nhan P1"}   lệnh nhân viên (/tl, /nhan, /tra-bot, /chan, /cho) gửi trong nhóm staffChatId
//   {"step":"vision","returns":[s1, s2, …]}   đọc ảnh giả: lần gọi thứ n trả returns[n-1] (hết thì lặp phần tử cuối);
//                                             không có bước này = bot chưa bật đọc ảnh, như khi thiếu GEMINI_API_KEY
//
// Dùng: npm run eval  |  node eval/run.mjs --dir <thư mục .jsonl>
import { readdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../core/store.js';
import { createGate } from '../core/gate.js';
import { createHandoff } from '../core/handoff.js';
import { createRegistry } from '../core/registry.js';
import { createEngine } from '../core/engine.js';
import hsPack from '../packs/hs/index.js';
import { fakeChannel, fakeClock } from '../test/helpers/fakes.mjs';
import { kiemSoTheoGiaTri, cheThongTinNhayCam, chuaThongTinNhayCam } from '../core/sanitizer.js';

const START = '2026-11-04T03:00:00.000Z';   // 10:00 giờ VN, mặc định của mọi kịch bản
const DEFAULT_STAFF_CHAT = 'staff-chat';
const DEFAULT_STAFF_USER = 'staff1';
const silent = { info() {}, warn() {}, error() {} };

function argDir(argv) {
  const i = argv.indexOf('--dir');
  return i >= 0 && argv[i + 1] ? argv[i + 1] : join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
}

/**
 * Cổng OZ giả: tool → danh sách kết quả theo lượt gọi. Công cụ không có kịch bản = Cổng không có công cụ đó.
 *
 * `rules` (tuỳ chọn): luật NHẠY THAM SỐ — `{"match":"<regex>","result":{…}}`. Lần gọi đầu tiên có
 * `match` khớp tham số gửi đi (đối chiếu trên JSON của tham số, nên khớp được cả `tenHang` lẫn
 * `maLuot`) trả `result` của luật đó, KHÔNG đi vào danh sách `returns`. Nhờ vậy bộ giả lập mô phỏng
 * được Cổng thật: mô tả hàng lọt chữ của ảnh ("bật tắt") thì Cổng ra mã điện, còn mô tả sạch thì ra
 * mã cơ khí. Không có luật này, mọi ca đều trả một mã hằng ⇒ phép thử "không rơi vào 8538" chỉ
 * chứng minh được ở TẦNG VĂN BẢN (tin nhắn gửi khách), không chứng minh được ở TẦNG MÃ (tên hàng
 * gửi Cổng) — điểm [S26] của người soát.
 */
function scriptedMcp(script) {
  const counts = {};
  return {
    calls: [],
    async callTool(name, args = {}) {
      this.calls.push({ name, args });
      const item = script[name];
      if (!item) throw new Error(`eval: Cổng giả không có công cụ ${name}`);
      const list = item.returns ?? [];
      const rules = item.rules ?? [];
      // Luật nhạy tham số được xét TRƯỚC và KHÔNG tiêu tốn lượt thứ n của danh sách `returns`.
      for (const r of rules) {
        if (!r?.match) continue;
        if (new RegExp(r.match, 'i').test(JSON.stringify(args))) return structuredClone(r.result);
      }
      counts[name] = (counts[name] || 0) + 1;
      if (!list.length) throw new Error(`eval: Cổng giả không có kết quả cho ${name}`);
      return structuredClone(list[Math.min(counts[name], list.length) - 1]);
    },
    async listTools() { return Object.keys(script).map((name) => ({ name })); },
  };
}

let seq = 0;
const toUpdate = (u = {}) => {
  const isEcho = Boolean(u.isEcho);
  return {
    updateKey: String(u.id ?? `e${++seq}`),
    event: u.event ?? (isEcho ? 'message.echo' : 'message.text.received'),
    chatId: u.chatId ?? 'c1',
    userId: u.userId ?? 'u1',
    userName: u.userName ?? (isEcho ? 'Admin' : 'Khách'),
    chatType: u.chatType ?? 'PRIVATE',
    text: u.text ?? null,
    photoUrl: u.photoUrl ?? null,
    caption: u.caption ?? null,
    messageId: String(u.id ?? seq),
    isEcho,
    appId: u.appId ?? null,
    channel: u.channel ?? null,
  };
};

/** Chạy một kịch bản. → { ok, why? } */
export async function runScenario(steps, { start = START, config: userConfig = {} } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'oz-eval-'));
  const dbPath = join(tmp, 'eval.db');
  const script = {};
  for (const s of steps) if (s.step === 'mcp') {
    script[s.tool] = {
      returns: s.returns == null ? [] : (Array.isArray(s.returns) ? s.returns : [s.returns]),
      rules: s.rules ?? [],
    };
  }
  const clock = fakeClock(start);
  const channel = fakeChannel();
  const mcp = scriptedMcp(script);
  // Đọc ảnh giả (không gọi Gemini, không mạng): chỉ bật khi kịch bản có bước "vision".
  const visionReturns = steps.filter((s) => s.step === 'vision')
    .flatMap((s) => (Array.isArray(s.returns) ? s.returns : [s.returns]));
  let visionN = 0;
  const vision = visionReturns.length
    ? { async readSpecs() { return structuredClone(visionReturns[Math.min(++visionN, visionReturns.length) - 1]); } }
    : null;

  const staffUsers = userConfig.staffUsers ?? new Set([DEFAULT_STAFF_USER]);
  const config = {
    capChatDay: 8,
    capGroupDay: 200,
    capAllDay: 300,
    staffChatId: DEFAULT_STAFF_CHAT,
    staffUsers,
    bannedPatterns: [],
    botNames: [],
    humanIdleMs: 7_200_000,
    ...userConfig,
  };

  let store; let engine; let gate; let handoff;
  const open = () => {
    store = openStore(dbPath);
    gate = createGate({
      store, channel, now: clock.now,
      rules: { capChatDay: config.capChatDay, capGroupDay: config.capGroupDay, capAllDay: config.capAllDay,
        similarity: 0.8, directReplyMs: 600_000, quietHours: true, bannedPatterns: config.bannedPatterns },
      onAlert: () => {},
      onTicket: (convId, reason) => handoff.open(convId, reason).catch(() => {}),
      log: silent,
    });
    handoff = createHandoff({ store, gate, config, now: clock.now, log: silent });
    engine = createEngine({
      config, store, channel, mcp, vision, registry: createRegistry([hsPack]), gate, handoff, now: clock.now, log: silent,
      advance: (ms) => { if (ms > clock.now().getTime()) clock.set(ms); },
    });
  };
  /** Khởi động lại ĐÚNG như server.js: mở lại db → gate.recover() → jobs.recover() → engine.recover() (T020). */
  const boot = async () => { open(); gate.recover(); engine.jobs.recover(); await engine.recover(); };
  try {
    open();
    for (const [i, s] of steps.entries()) {
      const at = `bước ${i + 1} (${s.step})`;
      switch (s.step) {
        case 'mcp': case 'vision': break;
        case 'config': Object.assign(config, s.config ?? s); break;
        case 'in':
          await engine.process(toUpdate(s.update));
          if (s.drain !== false) await engine.drain();
          break;
        case 'staff': {
          const u = s.update ?? {};
          const defaultStaffUser = config.staffUsers instanceof Set
            ? [...config.staffUsers][0]
            : (Array.isArray(config.staffUsers) ? config.staffUsers[0] : DEFAULT_STAFF_USER);
          await engine.process(toUpdate({
            id: s.id ?? u.id,
            chatId: s.chatId ?? u.chatId ?? config.staffChatId,
            userId: s.userId ?? u.userId ?? defaultStaffUser,
            userName: s.userName ?? u.userName ?? 'Nhân viên',
            chatType: s.chatType ?? u.chatType ?? 'GROUP',
            text: s.text ?? u.text ?? null,
          }));
          if (s.drain !== false) await engine.drain();
          break;
        }
        case 'advance': clock.advance(s.by); await engine.drain(); break;
        case 'at': clock.set(s.time); await engine.drain(); break;
        case 'restart': store.close(); await boot(); await engine.drain(); break;
        case 'expect': {
          const sent = channel.sent.filter((m) => m.chatId === (s.sentTo ?? 'c1')).map((m) => m.text);
          const all = sent.join('\n---\n');
          if (s.count != null && sent.length !== s.count) return { ok: false, why: `${at}: cần ${s.count} tin, có ${sent.length}${sent.length ? `: ${JSON.stringify(sent.map((t) => t.slice(0, 80)))}` : ''}` };
          if (s.match && !new RegExp(s.match, 'i').test(all)) return { ok: false, why: `${at}: không thấy /${s.match}/ trong ${JSON.stringify(all.slice(0, 300))}` };
          if (s.notMatch && new RegExp(s.notMatch, 'i').test(all)) return { ok: false, why: `${at}: có /${s.notMatch}/ (không được có)` };
          if (s.messages != null) {
            const msgs = store.messages.recent(s.sentTo ?? 'c1', 1000);
            if (msgs.length !== s.messages) return { ok: false, why: `${at}: messages cần ${s.messages}, có ${msgs.length}` };
          }
          // Đo ở TẦNG MÃ: tham số thật gửi Cổng, không phải tin nhắn gửi khách.
          //   mcpTool    — tên công cụ cần đo (vd "phan_loai_hs")
          //   mcpCount   — số lần gọi đúng bằng số này
          //   mcpMatch   — ÍT NHẤT một tên hàng gửi đi khớp regex
          //   mcpNotMatch— KHÔNG tên hàng gửi đi nào được khớp regex (chặt: áp cho MỌI lần gọi)
          if (s.mcpTool) {
            const calls = mcp.calls.filter((c) => c.name === s.mcpTool);
            if (s.mcpCount != null && calls.length !== s.mcpCount) {
              return { ok: false, why: `${at}: ${s.mcpTool} cần ${s.mcpCount} lần gọi, có ${calls.length}` };
            }
            const tens = calls.map((c) => String(c.args?.tenHang ?? JSON.stringify(c.args ?? {})));
            if (s.mcpMatch && !tens.some((t) => new RegExp(s.mcpMatch, 'i').test(t))) {
              return { ok: false, why: `${at}: không tên hàng nào gửi ${s.mcpTool} khớp /${s.mcpMatch}/: ${JSON.stringify(tens).slice(0, 300)}` };
            }
            if (s.mcpNotMatch && tens.some((t) => new RegExp(s.mcpNotMatch, 'i').test(t))) {
              return { ok: false, why: `${at}: tên hàng gửi ${s.mcpTool} khớp /${s.mcpNotMatch}/ (không được có): ${JSON.stringify(tens).slice(0, 300)}` };
            }
          }
          break;
        }
        default: return { ok: false, why: `${at}: bước lạ "${s.step}"` };
      }
    }
    store.close();
    store = null;
    const chk = checkMessages(dbPath, config.staffChatId);
    if (!chk.ok) return chk;
    return { ok: true, stats: chk.stats };
  } catch (e) {
    return { ok: false, why: `lỗi: ${e?.message ?? e}` };
  } finally {
    try { store?.close(); } catch { /* đã đóng */ }
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * SC-008 (T040, spec.md:286): Đối chiếu số tin trong bảng messages của mọi phòng khách.
 * - Tin khách vào = inbox status='done' (không tính nhóm nhân viên)
 * - Tin đã gửi = outbox status='sent', kind NOT IN ('ticket','digest')
 * - Ca bị cửa drop/reject không được có trong messages
 * - messages của phòng khách = khách vào + đã gửi (không thiếu, không thừa)
 */
export function checkMessages(dbPath, staffChatId = DEFAULT_STAFF_CHAT) {
  const raw = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const chats = raw.prepare(`
      SELECT DISTINCT chat_id FROM (
        SELECT chat_id FROM inbox WHERE chat_id != ?
        UNION
        SELECT chat_id FROM outbox WHERE chat_id != ?
        UNION
        SELECT chat_id FROM messages WHERE chat_id != ?
      )
    `).all(staffChatId, staffChatId, staffChatId).map((r) => r.chat_id);

    const stats = [];
    for (const chatId of chats) {
      const inDone = raw.prepare("SELECT COUNT(*) AS n FROM inbox WHERE chat_id = ? AND status = 'done'").get(chatId).n;
      const inKhach = raw.prepare("SELECT COUNT(*) AS n FROM inbox WHERE chat_id = ? AND status = 'done' AND json_extract(raw, '$.isEcho') IS NOT 1").get(chatId).n;
      const inHumanEcho = raw.prepare("SELECT COUNT(*) AS n FROM inbox WHERE chat_id = ? AND status = 'done' AND json_extract(raw, '$.isEcho') = 1 AND update_key IN (SELECT turn_id FROM audit WHERE type = 'echo-human')").get(chatId).n;
      const outSent = raw.prepare("SELECT COUNT(*) AS n FROM outbox WHERE chat_id = ? AND status = 'sent' AND kind NOT IN ('ticket', 'digest')").get(chatId).n;
      const msgTotal = raw.prepare("SELECT COUNT(*) AS n FROM messages WHERE chat_id = ?").get(chatId).n;
      const msgKhach = raw.prepare("SELECT COUNT(*) AS n FROM messages WHERE chat_id = ? AND speaker = 'khach'").get(chatId).n;
      const msgHumanEcho = raw.prepare("SELECT COUNT(*) AS n FROM messages WHERE chat_id = ? AND speaker = 'nhan-vien' AND outbox_id IS NULL").get(chatId).n;
      const msgSent = raw.prepare("SELECT COUNT(*) AS n FROM messages WHERE chat_id = ? AND speaker IN ('bot', 'nhan-vien') AND outbox_id IS NOT NULL").get(chatId).n;

      const leaked = raw.prepare(`
        SELECT COUNT(*) AS n FROM messages WHERE chat_id = ? AND outbox_id IN (
          SELECT id FROM outbox WHERE chat_id = ? AND status != 'sent'
        )
      `).get(chatId, chatId).n;

      if (leaked > 0) {
        return { ok: false, why: `SC-008: phòng ${chatId} có ${leaked} tin bị drop/reject lọt vào messages` };
      }
      if (inKhach !== msgKhach) {
        return { ok: false, why: `SC-008: phòng ${chatId} tin khách vào (${inKhach}) != tin khách trong messages (${msgKhach})` };
      }
      if (inHumanEcho !== msgHumanEcho) {
        return { ok: false, why: `SC-008: phòng ${chatId} tin nhân viên gõ tay vào (${inHumanEcho}) != tin nhân viên trong messages (${msgHumanEcho})` };
      }
      if (outSent !== msgSent) {
        return { ok: false, why: `SC-008: phòng ${chatId} tin gửi thành công (${outSent}) != tin gửi trong messages (${msgSent})` };
      }
      if (msgTotal !== inKhach + outSent + inHumanEcho) {
        return { ok: false, why: `SC-008: phòng ${chatId} tổng messages (${msgTotal}) != tin vào (${inKhach}) + tin ra (${outSent}) + nhân viên gõ (${inHumanEcho})` };
      }
      stats.push({ chatId, inDone, outSent, msgTotal });
    }
    return { ok: true, stats };
  } finally {
    raw.close();
  }
}

export async function runEvalFixture(filePath, opts = {}) {
  const fullPath = isAbsolute(filePath) ? filePath : join(process.cwd(), filePath);
  return runScenario(parse(fullPath), opts);
}

function parse(file) {
  return readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('//')).map((l) => JSON.parse(l));
}

/** Chạy một ca kiểm trung lập JSON từ eval/chung/. → { ok, why? } */
export async function runNeutralCase(c) {
  if (c.loai === 'hoi-thoai') {
    const steps = [];
    if (c.dauVao?.mcp) {
      for (const [tool, val] of Object.entries(c.dauVao.mcp)) {
        steps.push({ step: 'mcp', tool, returns: Array.isArray(val) ? val : [val] });
      }
    }
    steps.push({ step: 'in', update: { id: c.id, text: c.dauVao?.tinNhan } });
    const exp = { step: 'expect', sentTo: 'c1' };
    if (c.kyVong?.soTinNhan != null) exp.count = c.kyVong.soTinNhan;
    if (c.kyVong?.phaiChua?.length) exp.match = c.kyVong.phaiChua.join('|');
    if (c.kyVong?.khongChua?.length) exp.notMatch = c.kyVong.khongChua.join('|');
    steps.push(exp);
    return runScenario(steps);
  }
  if (c.loai === 'kiem-so') {
    for (const [idx, th] of (c.cacTruongHop || []).entries()) {
      const res = kiemSoTheoGiaTri(th.chuoiChot, th.chuoiGoc);
      if (res.hopLe !== th.hopLe) {
        return { ok: false, why: `trường hợp ${idx + 1} (${th.ten}): mong muốn hopLe=${th.hopLe}, thực tế=${res.hopLe}` };
      }
    }
    return { ok: true };
  }
  if (c.loai === 'che-nhay-cam') {
    for (const [idx, th] of (c.cacTruongHop || []).entries()) {
      const co = chuaThongTinNhayCam(th.vanBanGoc);
      if (th.chuaNhayCam != null && co !== th.chuaNhayCam) {
        return { ok: false, why: `trường hợp ${idx + 1} (${th.ten}): mong muốn chuaNhayCam=${th.chuaNhayCam}, thực tế=${co}` };
      }
      const daChe = cheThongTinNhayCam(th.vanBanGoc);
      for (const kc of th.khongChua || []) {
        if (new RegExp(kc).test(daChe)) {
          return { ok: false, why: `trường hợp ${idx + 1} (${th.ten}): sau khi che vẫn còn /${kc}/` };
        }
      }
      for (const pc of th.phaiChua || []) {
        if (!new RegExp(pc).test(daChe)) {
          return { ok: false, why: `trường hợp ${idx + 1} (${th.ten}): sau khi che không tìm thấy /${pc}/` };
        }
      }
    }
    return { ok: true };
  }
  return { ok: false, why: `loại ca kiểm lạ: ${c.loai}` };
}

async function main() {
  const customDir = process.argv.indexOf('--dir') >= 0;
  const dir = argDir(process.argv.slice(2));
  let files = [];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => ({ path: join(dir, f), name: basename(f, '.jsonl'), type: 'jsonl' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch { /* chưa có thư mục = 0 kịch bản */ }

  if (!customDir) {
    const chungDir = join(dirname(fileURLToPath(import.meta.url)), 'chung');
    try {
      const chungFiles = readdirSync(chungDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => ({ path: join(chungDir, f), name: `chung/${basename(f, '.json')}`, type: 'json' }))
        .sort((a, b) => a.name.localeCompare(b.name));
      files.push(...chungFiles);
    } catch { /* ignore */ }
  }

  let pass = 0;
  for (const item of files) {
    let r;
    try {
      if (item.type === 'jsonl') {
        r = await runScenario(parse(item.path));
      } else {
        r = await runNeutralCase(JSON.parse(readFileSync(item.path, 'utf8')));
      }
    } catch (e) {
      r = { ok: false, why: `đọc tệp lỗi: ${e.message}` };
    }
    if (r.ok) pass++;
    const statStr = r.stats?.length
      ? ` (${r.stats.map((s) => `${s.chatId}: vào ${s.inDone} + ra ${s.outSent} = ${s.msgTotal}`).join(', ')})`
      : '';
    console.log(r.ok ? `✓ ${item.name}${statStr}` : `✗ ${item.name}: ${r.why}`);
  }
  console.log(`eval: ${pass}/${files.length} kịch bản đạt`);
  process.exitCode = pass === files.length ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
