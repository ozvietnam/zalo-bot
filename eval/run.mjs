// eval/run.mjs (T030, research D8): phát lại kịch bản mẫu qua ĐÚNG lõi (store SQLite thật, cửa gửi, engine, gói hs)
// với Zalo, Cổng OZ và đồng hồ giả lập. Không mạng, không tốn token. In "eval: đạt/tổng"; có kịch bản trượt → thoát 1.
//
// Một dòng .jsonl là một bước:
//   {"step":"mcp","tool":"phan_loai_hs","returns":[r1, r2, …]}   lần gọi thứ n trả returns[n-1] (hết thì lặp phần tử cuối)
//   {"step":"in","update":{"id":"m1","text":"…","chatId":"c1"},"drain":true}   khách nhắn; mặc định chạy việc nền tới khi xong
//   {"step":"advance","by":"10m"} | {"step":"at","time":"2026-11-04T15:50:00Z"}   nhảy đồng hồ (UTC) rồi chạy việc đến hạn
//   {"step":"restart"}     đóng lõi, mở lại cùng tệp SQLite rồi gate.recover() + jobs.recover() + engine.recover() như server.js
//   {"step":"expect","sentTo":"c1","count":1,"match":"8413","notMatch":"C:\\\\"}   đếm/so chữ mọi tin đã gửi tới phòng
// Bước "staff" (lệnh nhân viên) chờ T025 — gặp thì kịch bản trượt với lý do rõ.
//
// Dùng: npm run eval  |  node eval/run.mjs --dir <thư mục .jsonl>
import { readdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../core/store.js';
import { createGate } from '../core/gate.js';
import { createRegistry } from '../core/registry.js';
import { createEngine } from '../core/engine.js';
import hsPack from '../packs/hs/index.js';
import { fakeChannel, fakeClock } from '../test/helpers/fakes.mjs';

const START = '2026-11-04T03:00:00.000Z';   // 10:00 giờ VN, mặc định của mọi kịch bản
const silent = { info() {}, warn() {}, error() {} };

function argDir(argv) {
  const i = argv.indexOf('--dir');
  return i >= 0 && argv[i + 1] ? argv[i + 1] : join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
}

/** Cổng OZ giả: tool → danh sách kết quả theo lượt gọi. Công cụ không có kịch bản = Cổng không có công cụ đó. */
function scriptedMcp(script) {
  const counts = {};
  return {
    calls: [],
    async callTool(name, args = {}) {
      this.calls.push({ name, args });
      const list = script[name];
      if (!list) throw new Error(`eval: Cổng giả không có công cụ ${name}`);
      counts[name] = (counts[name] || 0) + 1;
      return structuredClone(list[Math.min(counts[name], list.length) - 1]);
    },
    async listTools() { return Object.keys(script).map((name) => ({ name })); },
  };
}

let seq = 0;
const toUpdate = (u = {}) => ({
  updateKey: String(u.id ?? `e${++seq}`), event: u.event ?? 'message.text.received', chatId: u.chatId ?? 'c1', userId: u.userId ?? 'u1',
  userName: u.userName ?? 'Khách', chatType: u.chatType ?? 'PRIVATE', text: u.text ?? null, photoUrl: u.photoUrl ?? null,
  caption: u.caption ?? null, messageId: String(u.id ?? seq),
});

/** Chạy một kịch bản. → { ok, why? } */
export async function runScenario(steps, { start = START } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'oz-eval-'));
  const dbPath = join(tmp, 'eval.db');
  const script = {};
  for (const s of steps) if (s.step === 'mcp') script[s.tool] = Array.isArray(s.returns) ? s.returns : [s.returns];
  const clock = fakeClock(start);
  const channel = fakeChannel();
  const mcp = scriptedMcp(script);
  let store; let engine; let gate;
  const open = () => {
    store = openStore(dbPath);
    gate = createGate({ store, channel, now: clock.now });
    engine = createEngine({ store, channel, mcp, registry: createRegistry([hsPack]), gate, now: clock.now, log: silent,
      advance: (ms) => { if (ms > clock.now().getTime()) clock.set(ms); } });
  };
  /** Khởi động lại ĐÚNG như server.js: mở lại db → gate.recover() → jobs.recover() → engine.recover() (T020). */
  const boot = async () => { open(); gate.recover(); engine.jobs.recover(); await engine.recover(); };
  try {
    open();
    for (const [i, s] of steps.entries()) {
      const at = `bước ${i + 1} (${s.step})`;
      switch (s.step) {
        case 'mcp': break;
        case 'in':
          await engine.process(toUpdate(s.update));
          if (s.drain !== false) await engine.drain();
          break;
        case 'advance': clock.advance(s.by); await engine.drain(); break;
        case 'at': clock.set(s.time); await engine.drain(); break;
        case 'restart': store.close(); await boot(); await engine.drain(); break;
        case 'expect': {
          const sent = channel.sent.filter((m) => m.chatId === (s.sentTo ?? 'c1')).map((m) => m.text);
          const all = sent.join('\n---\n');
          if (s.count != null && sent.length !== s.count) return { ok: false, why: `${at}: cần ${s.count} tin, có ${sent.length}${sent.length ? `: ${JSON.stringify(sent.map((t) => t.slice(0, 80)))}` : ''}` };
          if (s.match && !new RegExp(s.match, 'i').test(all)) return { ok: false, why: `${at}: không thấy /${s.match}/ trong ${JSON.stringify(all.slice(0, 300))}` };
          if (s.notMatch && new RegExp(s.notMatch, 'i').test(all)) return { ok: false, why: `${at}: có /${s.notMatch}/ (không được có)` };
          break;
        }
        case 'staff': return { ok: false, why: `${at}: lệnh nhân viên chưa có (chờ T025)` };
        default: return { ok: false, why: `${at}: bước lạ "${s.step}"` };
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, why: `lỗi: ${e?.message ?? e}` };
  } finally {
    try { store?.close(); } catch { /* đã đóng */ }
    rmSync(tmp, { recursive: true, force: true });
  }
}

function parse(file) {
  return readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('//')).map((l) => JSON.parse(l));
}

async function main() {
  const dir = argDir(process.argv.slice(2));
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort(); } catch { /* chưa có thư mục = 0 kịch bản */ }
  let pass = 0;
  for (const f of files) {
    const name = basename(f, '.jsonl');
    let r;
    try { r = await runScenario(parse(join(dir, f))); } catch (e) { r = { ok: false, why: `đọc tệp lỗi: ${e.message}` }; }
    if (r.ok) pass++;
    console.log(r.ok ? `✓ ${name}` : `✗ ${name}: ${r.why}`);
  }
  console.log(`eval: ${pass}/${files.length} kịch bản đạt`);
  process.exitCode = pass === files.length ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
