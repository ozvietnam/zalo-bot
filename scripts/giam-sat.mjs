#!/usr/bin/env node
// Agent giám sát — chạy hằng ngày 07:30 (cron / Coolify scheduled task)
// Đọc SQLite bot → tính 9 tín hiệu → mở/append GitHub issue đúng repo, không trùng, ẩn danh.
// Usage: node scripts/giam-sat.mjs [--dry-run] [--ngay=2026-11-06]
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DatabaseSync } from 'node:sqlite';
import { tinhHieu } from './giam-sat/tinh-hieu.js';
import { guiTelegram, dungBanTin } from './giam-sat/telegram.js';
import { layKhoangNgayVnUtc } from './giam-sat/time-util.js';
import { xuLyIssue } from './giam-sat/issue.js';
import { soanBanTinDigest } from './giam-sat/digest.js';
import { ghiHopThu } from '../core/giam-sat-hop-thu.js';
import { redact } from '../core/redact.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const ngayArg = args.find(a => a.startsWith('--ngay='));
const ngayYmd = ngayArg ? ngayArg.split('=')[1] : undefined;
const { ngayVn: ngay, dauNgayUtc, cuoiNgayUtc } = layKhoangNgayVnUtc(ngayYmd);
const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = join(DATA_DIR, 'bot.db');

if (!existsSync(DB_PATH)) {
  console.error(`[giám sát] Không tìm thấy ${DB_PATH} — chạy trên máy có bot.db`);
  process.exit(1);
}

console.log(`[giám sát] Ngày ${ngay} · dryRun=${dryRun}`);

// ═══ 1. Đọc dữ liệu từ SQLite ═══
// Agent giám sát tuyệt đối chỉ-đọc (FR-005). Không tự khởi tạo schema nếu chưa có.
let db;
try {
  db = new DatabaseSync(DB_PATH, { readOnly: true });
} catch (err) {
  console.error(`[giám sát] Không thể mở ${DB_PATH} ở chế độ chỉ-đọc: ${err.message}`);
  process.exit(1);
}

let coBang = false;
try {
  coBang = Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'messages'").get());
} catch {
  console.error(`[giám sát] Không thể đọc sqlite_master từ ${DB_PATH}`);
  db.close();
  process.exit(1);
}
if (!coBang) {
  console.error(`[giám sát] db ${DB_PATH} chưa có bảng (bot chưa nhận tin nào)`);
  db.close();
  process.exit(1);
}

const messages = db.prepare(`SELECT chat_id, turn_id, speaker, speaker_id, text, at
  FROM messages WHERE at BETWEEN ? AND ? ORDER BY at`).all(dauNgayUtc, cuoiNgayUtc);

const outbox = db.prepare(`SELECT chat_id, turn_id, decision, reason, created_at, sent_at
  FROM outbox WHERE created_at BETWEEN ? AND ?`).all(dauNgayUtc, cuoiNgayUtc);

const jobs = db.prepare(`SELECT pack, ma_luot, status, expires_at, done_at, created_at
  FROM jobs WHERE created_at <= ?`).all(cuoiNgayUtc);

const audit = db.prepare(`SELECT at, turn_id, chat_id, type, data
  FROM audit WHERE at BETWEEN ? AND ?`).all(dauNgayUtc, cuoiNgayUtc);

db.close();
console.log(`[giám sát] Dữ liệu: ${messages.length} tin · ${outbox.length} outbox · ${jobs.length} jobs · ${audit.length} audit`);

// ═══ 2. Tính tín hiệu ═══
const phatHien = tinhHieu({ messages, outbox, jobs, audit, ngay });
console.log(`[giám sát] Phát hiện: ${phatHien.length}`);

let ketQua = { moi: [], comment: [], boViGioiHan: [] };
if (phatHien.length === 0) {
  console.log(`[giám sát] ✓ Ngày ${ngay} sạch — 0 phát hiện`);
} else {
  // ═══ 3. In báo cáo console ═══
  for (const p of phatHien) {
    console.log(`  ${p.ma}${p.cheDo ? `/${p.cheDo}` : ''} → ${p.repo} · ${p.soDo} · ${p.bangChung.length} bằng chứng`);
  }

  // ═══ 4. Mở/append GitHub issue ═══
  ketQua = await xuLyIssue(phatHien, { dryRun, ngay, redactFn: redact });
  console.log(`[giám sát] Issue mới: ${ketQua.moi.length} · comment vào cũ: ${ketQua.comment.length} · bỏ vì giới hạn: ${ketQua.boViGioiHan.length}`);

  for (const m of ketQua.moi) console.log(`  ↗ MỚI: ${m.repo} — ${m.tieuDe}`);
  for (const c of ketQua.comment) console.log(`  ↗ CŨ: ${c.repo}#${c.issue} — ${c.ma}`);
  for (const b of ketQua.boViGioiHan) console.log(`  ⊘ BỎ: ${b.repo} — ${b.ma} (${b.lyDo})`);
}

// ═══ 5. Bản tin ngày (cho Telegram / Zalo digest qua hộp thư / lưu file) ═══
const banTin = dungBanTin({ ngay, phatHien, ketQua });

// Lưu file
const banTinPath = join(DATA_DIR, `giam-sat-${ngay}.md`);
if (!dryRun) {
  writeFileSync(banTinPath, banTin.replace(/<[^>]+>/g, '')); // bỏ HTML tag cho file
  console.log(`[giám sát] Bản tin lưu: ${banTinPath}`);

  // Ghi vào hộp thư riêng để bot quét gửi kind 'digest' vào STAFF_CHAT_ID (FR-010)
  const idemKey = `digest:ngay:${ngay}`;
  const textDigest = soanBanTinDigest({ ngay, phatHien, ketQua, loai: 'ngay' });
  const gh = ghiHopThu({ dataDir: DATA_DIR, idemKey, text: textDigest, loai: 'ngay' });
  console.log(`[giám sát] Hộp thư digest: ${gh.daCo ? 'đã có sẵn (không nhân bản)' : 'đã ghi'} — ${idemKey}`);
}

// Gửi Telegram cho CEO (im lặng nếu chưa cấu hình)
const sent = await guiTelegram(banTin, { dryRun });
console.log(`[giám sát] Telegram: ${sent ? '✓ đã gửi' : '(chưa cấu hình TELEGRAM_BOT_TOKEN/CHAT_ID)'}`);
