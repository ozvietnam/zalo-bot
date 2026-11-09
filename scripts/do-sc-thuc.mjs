#!/usr/bin/env node
// Công cụ đo SC-002/SC-007/SC-009 trên dữ liệu chạy thật (T041)
// Mở db ở chế độ CHỈ ĐỌC, không sửa đổi dữ liệu.
// stdout chỉ in số đếm và mã rút gọn (4 ký tự cuối), không in nội dung tin nhắn hay bí mật.
// Hỏng báo stderr, exit 1, không in stack trace.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const HUONG_DAN = [
  'Cách dùng:',
  '  npm run do-sc -- [--db <tệp>] [--tu <ISO>] [--den <ISO>]',
  '  node scripts/do-sc-thuc.mjs [--db <tệp>] [--tu <ISO>] [--den <ISO>]',
  '',
  'Cờ:',
  '  --db <tệp>   đường dẫn db bot (mặc định $DATA_DIR/bot.db hoặc ./data/bot.db)',
  '  --tu <ISO>   mốc thời gian bắt đầu (chuỗi ISO-8601)',
  '  --den <ISO>  mốc thời gian kết thúc (chuỗi ISO-8601)',
  '  --help, -h   in hướng dẫn này',
].join('\n');

let db = null;

function fail(msg) {
  try { db?.close(); } catch { /* bỏ qua */ }
  process.stderr.write(`do-sc: ${msg}\n`);
  process.exit(1);
}

function failUsage(msg) {
  process.stderr.write(`do-sc: ${msg}\n${HUONG_DAN}\n`);
  process.exit(1);
}

const FLAGS = new Set(['db', 'tu', 'den']);

function parse(argv) {
  const o = { db: null, tu: null, den: null, help: false };
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
    if ((key === 'tu' || key === 'den') && Number.isNaN(Date.parse(val))) {
      failUsage(`--${key} phải là chuỗi thời gian ISO hợp lệ (nhận "${val}")`);
    }
    o[key] = val;
  }
  return o;
}

const o = parse(process.argv.slice(2));
if (o.help) {
  process.stdout.write(`${HUONG_DAN}\n`);
  process.exit(0);
}

const dbPath = o.db ?? join(process.env.DATA_DIR || './data', 'bot.db');
if (!existsSync(dbPath)) fail(`không thấy tệp db ${dbPath}`);

try {
  db = new DatabaseSync(dbPath, { readOnly: true });
} catch {
  fail(`không mở được db ở chế độ chỉ đọc: ${dbPath}`);
}

try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  if (!tables.includes('audit') || !tables.includes('outbox')) {
    fail(`db ${dbPath} thiếu bảng bắt buộc (audit hoặc outbox)`);
  }

  // Điều kiện lọc thời gian chung theo mốc gửi/tạo
  const timeCond = (col) => {
    const conds = [];
    const params = [];
    if (o.tu) { conds.push(`${col} >= ?`); params.push(o.tu); }
    if (o.den) { conds.push(`${col} <= ?`); params.push(o.den); }
    return { sql: conds.length ? `AND ${conds.join(' AND ')}` : '', params };
  };

  // 1. Kiểm tra cơ sở dữ liệu rỗng
  const totalOutbox = db.prepare('SELECT COUNT(*) AS n FROM outbox').get().n;
  const totalAudit = db.prepare('SELECT COUNT(*) AS n FROM audit').get().n;
  if (totalOutbox === 0 && totalAudit === 0) {
    process.stdout.write('chưa đủ dữ liệu\n');
    db.close();
    process.exit(0);
  }

  // 2. SC-002: Kiểm tra tin bot gửi vào phòng đang human
  // Lấy các sự kiện state-change để dựng dòng thời gian trạng thái human theo conv_id
  const stateAudits = db.prepare(`
    SELECT at, turn_id, conv_id, data
    FROM audit
    WHERE type = 'state-change'
    ORDER BY at ASC, id ASC
  `).all();

  // Dựng danh sách khoảng thời gian human theo conv_id: conv_id -> [{ start, end, turnId }]
  const humanIntervals = new Map();
  const humanStartTurn = new Map(); // conv_id -> turn_id khi chuyển sang human

  for (const row of stateAudits) {
    let d;
    try { d = JSON.parse(row.data); } catch { continue; }
    const convId = row.conv_id;
    if (!convId) continue;
    if (!humanIntervals.has(convId)) humanIntervals.set(convId, []);

    if (d.to === 'human') {
      humanStartTurn.set(convId, row.turn_id ?? null);
      humanIntervals.get(convId).push({ start: row.at, end: null, turnId: row.turn_id ?? null });
    } else if (d.from === 'human' || d.to !== 'human') {
      const list = humanIntervals.get(convId);
      if (list.length > 0 && list[list.length - 1].end === null) {
        list[list.length - 1].end = row.at;
      }
    }
  }

  const outTime = timeCond("COALESCE(sent_at, created_at)");
  const botMsgs = db.prepare(`
    SELECT id, conv_id, turn_id, text, COALESCE(sent_at, created_at) AS at
    FROM outbox
    WHERE status = 'sent' AND kind NOT IN ('ticket', 'digest', 'staff_relay')
    ${outTime.sql}
    ORDER BY id ASC
  `).all(...outTime.params);

  const viPhamSC002 = [];
  const REPLY_PREFIX = 'Dạ em đã chuyển cuộc trò chuyện này cho nhân viên OZ';

  for (const m of botMsgs) {
    const list = humanIntervals.get(m.conv_id);
    if (!list || list.length === 0) continue;

    let inHuman = false;
    let handoffTurn = null;

    for (const iv of list) {
      if (m.at >= iv.start && (iv.end === null || m.at < iv.end)) {
        inHuman = true;
        handoffTurn = iv.turnId;
        break;
      }
    }

    if (inHuman) {
      // Miễn trừ: tin REPLY_HANDOFF của lượt chuyển người
      const isHandoffTurn = m.turn_id && handoffTurn && m.turn_id === handoffTurn;
      const isHandoffText = m.text && m.text.includes(REPLY_PREFIX);
      if (isHandoffTurn || isHandoffText) continue;

      viPhamSC002.push(m.id);
    }
  }

  // 3. SC-007: Tỉ lệ tin outbox sent có audit gate mang cùng turn_id
  const sentMsgs = db.prepare(`
    SELECT id, turn_id
    FROM outbox
    WHERE status = 'sent'
    ${outTime.sql}
    ORDER BY id ASC
  `).all(...outTime.params);

  const gateAudits = new Set(
    db.prepare("SELECT DISTINCT turn_id FROM audit WHERE type = 'gate' AND turn_id IS NOT NULL")
      .all()
      .map((r) => r.turn_id)
  );

  const thieuSC007 = [];
  for (const m of sentMsgs) {
    if (!m.turn_id || !gateAudits.has(m.turn_id)) {
      thieuSC007.push(m.id);
    }
  }
  const hopLeSC007 = sentMsgs.length - thieuSC007.length;

  // 4. SC-009: 20 phiếu mở đầu tiên có khối hồ sơ
  const ticketRows = db.prepare(`
    SELECT id, text
    FROM outbox
    WHERE idem_key LIKE 'p:%:open' AND status = 'sent'
    ${outTime.sql}
    ORDER BY id ASC
    LIMIT 20
  `).all(...outTime.params);

  let sc009Output = '';
  const TICKET_NOTE = "(ghi chú: phần 'nhân viên không phải hỏi lại' vẫn cần người xác nhận)";
  if (ticketRows.length === 0) {
    sc009Output = `SC-009: chưa đủ dữ liệu (0 phiếu) ${TICKET_NOTE}`;
  } else if (ticketRows.length < 20) {
    sc009Output = `SC-009: chưa đủ dữ liệu (${ticketRows.length} phiếu) ${TICKET_NOTE}`;
  } else {
    const coHoSo = ticketRows.filter((r) => r.text && r.text.includes('Hồ sơ khách:')).length;
    sc009Output = `SC-009: ${coHoSo}/20 phiếu có khối hồ sơ ${TICKET_NOTE}`;
  }

  // In kết quả
  const lines = [];
  if (viPhamSC002.length === 0) {
    lines.push('SC-002: 0 vi phạm (0 tin bot gửi vào phòng human)');
  } else {
    lines.push(`SC-002: ${viPhamSC002.length} vi phạm (outbox id: ${viPhamSC002.join(', ')})`);
  }

  if (sentMsgs.length === 0) {
    lines.push('SC-007: chưa đủ dữ liệu (0 tin sent)');
  } else if (thieuSC007.length === 0) {
    lines.push(`SC-007: ${hopLeSC007}/${sentMsgs.length} tin sent có audit gate`);
  } else {
    lines.push(`SC-007: ${hopLeSC007}/${sentMsgs.length} tin sent có audit gate (thiếu outbox id: ${thieuSC007.join(', ')})`);
  }

  lines.push(sc009Output);

  process.stdout.write(lines.join('\n') + '\n');
  db.close();
  process.exit(0);
} catch (e) {
  fail(`lỗi khi đọc db: ${e?.message?.replace(/[\r\n]+/g, ' ')}`);
}
