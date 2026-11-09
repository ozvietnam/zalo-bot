#!/usr/bin/env node
// CLI tra audit (T029) — CHỈ ĐỌC db bot, in từng dòng lượt theo giờ VN.
// Dùng: npm run audit -- --turn <turn_id> [--db <tệp>]
//       npm run audit -- --chat <chat_id> [--limit <n>] [--db <tệp>]
// stdout CHỈ chứa dữ liệu ĐÃ CHE (số điện thoại, đường dẫn nội bộ, bí mật); mọi thông báo lỗi đi
// stderr, không in stack. db mở ở chế độ CHỈ ĐỌC → CLI không sửa db bot.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { vnStamp } from '../core/time.js';
import { redact } from '../core/redact.js';
import { cheSdt } from '../core/sdt.js';

// Đường dẫn nội bộ: đúng danh sách repo coi là rò (core/redact.js — mục PATH): /home/, /opt/, ổ đĩa Windows.
const DUONG_DAN = /(?:[A-Za-z]:\\[^\s"'()]*|\/(?:home|opt)\/[^\s"'()]*)/g;
// Khoá bí mật mà `redact()` của lõi BỎ SÓT (core/redact.js — `findLeak` nhận ra
// hai dạng này là bí mật, nhưng `redact` không che: `LONG_RUN` cần ≥32 ký tự
// và phải có cả chữ + số, nên `sk-…` bị dấu `-` cắt đôi, `EAA…` thường
// không có chữ số). Che CỤC BỌ ở CLI — core/redact.js phải giữ nguyên
// byte-for-byte vì cửa gửi tin import nó.
const KHOA = /\bsk-[\w-]{16,}|\bEAA[A-Za-z0-9]{20,}/g;

/**
 * Che bí mật + số điện thoại + đường dẫn, gom một dòng, ≤ max ký tự.
 * THỨ TỰ quan trọng: che SĐT phải chạy TRƯỚC khi gom khoảng trắng — nếu gom
 * trước thì số điện thoại bị ngắt dòng (tab / xuống dòng) sẽ lọt ra stdout.
 */
function che(s, max = 120) {
  return cheSdt(redact(String(s ?? '')).replace(KHOA, '***').replace(DUONG_DAN, '***'))
    .replace(/\s+/g, ' ').trim().slice(0, max).replace(/"/g, "'");
}

const HUONG_DAN = [
  'Cách dùng:',
  '  npm run audit -- --turn <turn_id> [--db <tệp>]',
  '  npm run audit -- --chat <chat_id> [--limit <n>] [--db <tệp>]',
  '',
  'Cờ:',
  '  --db <tệp>   đường dẫn db bot (mặc định $DATA_DIR/bot.db)',
  '  --turn <id>  tra một lượt theo turn_id',
  '  --chat <id>  tra các lượt của một phòng (lượt mới nhất ở trên)',
  '  --limit <n>  số lượt tối đa khi tra theo phòng (mặc định 20)',
  '  --help, -h   in hướng dẫn này',
  '',
  'Muốn stdout sạch (không có banner của npm):',
  '  npm run --silent audit -- --turn <turn_id>',
  '',
  'Lưu ý: qua npm phải có dấu -- (vd: npm run audit -- --turn <id>)',
  '  Thiếu dấu -- thì npm nuốt mất cờ và CLI báo "tham số lạ".',
].join('\n');

// db đang mở — giữ ở ngoài để đóng cho sạch trước khi thoát (process.exit() không chạy finally).
let db = null;

/** Báo lỗi rồi thoát (không kèm stack). */
function fail(msg) {
  try { db?.close(); } catch { /* không sao */ }
  process.stderr.write(`audit: ${msg}\n`);
  process.exit(1);
}

/** Báo lỗi cờ kèm hướng dẫn rồi thoát. */
function failUsage(msg) {
  process.stderr.write(`audit: ${msg}\n${HUONG_DAN}\n`);
  process.exit(1);
}

const FLAGS = new Set(['db', 'turn', 'chat', 'limit']);
// Trần `--limit`: quá lớn thì SQLite báo "too many SQL variables" (>32766 biến)
// và CLI nuốt lỗi rồi in nhầm "không đọc được db". Chặn NGAY trong parse()
// (trước khi mở db) để thông báo đúng nguyên nhân.
const LIMIT_TOI_DA = 1000;

/** Đọc cờ: nhận cả `--flag value` lẫn `--flag=value`; bỏ qua phần tử `--` rời (npm truyền `--`). */
function parse(argv) {
  const o = { db: null, turn: null, chat: null, limit: 20, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--') continue;
    if (a === '-h' || a === '--help') { o.help = true; continue; }
    if (!a.startsWith('--')) failUsage(`tham số lạ: ${a}`);
    const eq = a.indexOf('=');
    const key = eq === -1 ? a.slice(2) : a.slice(2, eq);
    if (!FLAGS.has(key)) failUsage(`cờ lạ: ${a}`);
    let val = eq === -1 ? null : a.slice(eq + 1);
    if (val === null) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) failUsage(`thiếu giá trị cho --${key}`);
      val = next;
      i += 1;
    }
    if (key === 'limit') {
      if (!/^\d+$/.test(val) || Number(val) < 1) failUsage(`--limit phải là số nguyên từ 1 trở lên (nhận "${val}")`);
      if (Number(val) > LIMIT_TOI_DA) failUsage(`--limit không được vượt quá ${LIMIT_TOI_DA} (nhận "${val}")`);
      o.limit = Number(val);
    } else o[key] = val;
  }
  return o;
}

/** data của một dòng audit (JSON) — dòng hỏng thì coi như rỗng. */
function parseData(s) {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

/** Một chuỗi đã che; null/undefined → '-'. */
function cheOr(v, max = 120) {
  return v == null ? '-' : che(v, max);
}

/** Tham số công cụ (object hoặc chuỗi JSON) → chuỗi đã che. */
function cheArgs(v, max = 120) {
  if (v == null) return '-';
  if (typeof v === 'string') return che(v, max);
  let s;
  try { s = JSON.stringify(v) ?? String(v); } catch { s = String(v); }
  return che(s, max);
}

const COT_AUDIT = 'id, at, turn_id, chat_id, type, data';

/** Dựng một dòng in ra: <stamp> VN  <type> <chi tiết>  turn=<t> chat=<c>  <khoá>=<giá trị> ... */
function inDong(r, trangThaiOutbox) {
  const d = parseData(r.data);
  const phu = [];
  let chiTiet = '';
  if (r.type === 'inbound') {
    // KHÔNG in `sha1=`: hash được tính trên TEXT THÔ (core/engine.js), nên khi tin
    // nhắn là số điện thoại thì hash bị dò ngược được (không gian ~10^8 ứng
    // viên, quét vài phút) ⇒ in ra là trao lại số điện thoại qua lớp băm yếu.
    // Hash VẪN còn trong db để đối chiếu theo FR-018 — chỉ không in ra nữa.
    phu.push(`event=${cheOr(d.event)}`, `user=${cheOr(d.userId)}`, `head="${cheOr(d.head)}"`);
  } else if (r.type === 'route') {
    chiTiet = d.pack ?? '-';
  } else if (r.type === 'tool') {
    chiTiet = `${d.name ?? '-'} ${d.ok === false ? 'fail' : 'ok'}`;
    if (d.args != null) phu.push(`args="${cheArgs(d.args)}"`);
    if (d.code != null) phu.push(`code=${cheOr(d.code)}`);
    if (d.error != null) phu.push(`err="${cheOr(d.error)}"`);
  } else if (r.type === 'gate') {
    chiTiet = `${d.decision ?? '-'} ${cheOr(d.reason)}`;
    const st = d.idemKey ? trangThaiOutbox.get(d.idemKey) : null;
    phu.push(`outbox=${st ?? '-'}`);
  } else if (r.type === 'outbound') {
    const gui = (Array.isArray(d.results) ? d.results : []).filter((x) => x?.status === 'sent').length;
    phu.push(`sent=${gui}`, `jobs=${d.jobs ?? 0}`, `skipped=${d.skipped ?? '-'}`, `job=${d.maLuot ?? '-'}`);
  } else if (r.type === 'error') {
    phu.push(`stage=${cheOr(d.stage)}`, `msg="${cheOr(d.message ?? d.msg)}"`);
  }
  const thanh = r.type + (chiTiet ? ` ${chiTiet}` : '');
  const khoa = phu.join(' ');
  // `turn=` / `chat=` là KHOÁ TRA CỨU cho người vận hành đối chiếu → GIỮ NGUYÊN,
  // không che (che sẽ làm hỏng khả năng tra cứu). Mọi dữ liệu do khách gõ
  // (kể cả `user=` và `head=`) đi qua `che()` nên đã được che số điện thoại.
  return [`${vnStamp(r.at)} VN`, thanh, `turn=${r.turn_id ?? '-'} chat=${r.chat_id ?? '-'}`, khoa].filter(Boolean).join('  ');
}

const o = parse(process.argv.slice(2));
if (o.help) {
  process.stdout.write(`${HUONG_DAN}\n`);
  process.exit(0);
}
if (Boolean(o.turn) === Boolean(o.chat)) failUsage('cần đúng một trong --turn hoặc --chat');

const dbPath = o.db ?? join(process.env.DATA_DIR || './data', 'bot.db');
if (!existsSync(dbPath)) fail(`không thấy tệp db ${dbPath}`);

// db của bot luôn ở chế độ WAL (core/store.js): mở chỉ đọc sẽ khiến SQLite tự tạo tệp phụ
// bot.db-shm và bot.db-wal (0 byte) cạnh db. Đây là hệ quả bình thường của WAL, KHÔNG phải
// rác của CLI và KHÔNG được xoá (xoá -shm khi bot đang chạy sẽ hỏng dữ liệu WAL của bot).
// TUYỆT ĐỐI không mở chế độ ghi: SQLite có thể checkpoint WAL vào tệp db chính → CLI sửa db.
try {
  db = new DatabaseSync(dbPath, { readOnly: true });
} catch {
  fail(`không mở được db ở chế độ chỉ đọc (thử dừng bot rồi chạy lại): ${dbPath}`);
}

try {
  let coBang = false;
  try {
    coBang = Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'audit'").get());
  } catch { fail(`không mở được db ${dbPath}`); }
  if (!coBang) fail(`db ${dbPath} chưa có bảng audit`);

  // 1. Lấy dòng audit
  let rows = [];
  if (o.turn) {
    rows = db.prepare(`SELECT ${COT_AUDIT} FROM audit WHERE turn_id = ? ORDER BY at, id`).all(o.turn);
    if (!rows.length) fail(`không thấy lượt ${o.turn}`);
  } else {
    // Trước hết lấy các lượt mới nhất, rồi mới lấy dòng (không kéo cả 90 ngày audit).
    // GROUP BY tự gom turn_id NULL thành một nhóm riêng → nhóm đó chiếm MỘT suất trong --limit.
    const nhom = db.prepare(
      'SELECT turn_id, MAX(at) AS a, MAX(id) AS i FROM audit WHERE chat_id = ?'
      + ' GROUP BY turn_id ORDER BY a DESC, i DESC LIMIT ?',
    ).all(o.chat, o.limit);
    if (!nhom.length) fail(`phòng ${o.chat} không có lượt nào`);
    // Chỉ kéo dòng của các nhóm ĐÃ CHỌN; nhóm turn_id NULL chỉ được kéo khi nó nằm trong N nhóm đó
    // (nếu không thì kéo thêm sẽ vượt --limit).
    const coId = nhom.filter((r) => r.turn_id != null).map((r) => r.turn_id);
    const dieuKien = [];
    if (coId.length) dieuKien.push(`turn_id IN (${coId.map(() => '?').join(',')})`);
    if (nhom.some((r) => r.turn_id == null)) dieuKien.push('turn_id IS NULL');
    rows = db.prepare(
      `SELECT ${COT_AUDIT} FROM audit WHERE chat_id = ? AND (${dieuKien.join(' OR ')}) ORDER BY at, id`,
    ).all(o.chat, ...coId);

    // Gom theo lượt, lượt mới nhất ở trên; trong lượt thì dòng tăng dần theo at, id.
    const thuTu = new Map(nhom.map((r, i) => [r.turn_id, i]));
    const nhomTinh = new Map();
    for (const r of rows) {
      const k = r.turn_id ?? null;
      if (!nhomTinh.has(k)) nhomTinh.set(k, []);
      nhomTinh.get(k).push(r);
    }
    const sapXep = [...nhomTinh.entries()].sort((a, b) => {
      const ia = thuTu.has(a[0]) ? thuTu.get(a[0]) : null;
      const ib = thuTu.has(b[0]) ? thuTu.get(b[0]) : null;
      if (ia !== ib) return ia === null ? 1 : ib === null ? -1 : ia - ib;
      const ma = Math.max(...a[1].map((r) => r.id));
      const mb = Math.max(...b[1].map((r) => r.id));
      return mb - ma;
    });
    rows = sapXep.flatMap(([, rs]) => rs);
  }

  // 2. Trạng thái tin ra theo idem_key (outbox.idem_key UNIQUE → tối đa 1 dòng mỗi khoá)
  const trangThaiOutbox = new Map();
  const keys = [...new Set(rows.filter((r) => r.type === 'gate').map((r) => parseData(r.data).idemKey).filter(Boolean))];
  if (keys.length) {
    try {
      const phu = keys.map(() => '?').join(',');
      for (const r of db.prepare(`SELECT idem_key, status FROM outbox WHERE idem_key IN (${phu})`).all(...keys)) {
        trangThaiOutbox.set(r.idem_key, r.status);
      }
    } catch { /* db chưa có bảng outbox: bỏ trạng thái, vẫn in được */ }
  }

  // 3. In ra stdout
  for (const r of rows) process.stdout.write(`${inDong(r, trangThaiOutbox)}\n`);
} catch (e) {
  fail(`không đọc được db ${dbPath}`);
} finally {
  try { db?.close(); } catch { /* không sao */ }
}
process.exit(0);
