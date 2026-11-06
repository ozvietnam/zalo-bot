#!/usr/bin/env node
// Agent giám sát — chạy hằng ngày 07:30 (cron / Coolify scheduled task)
// Đọc SQLite bot → tính 9 tín hiệu → mở/append GitHub issue đúng repo, không trùng, ẩn danh.
// Usage: node scripts/giam-sat.mjs [--dry-run] [--ngay=2026-11-06]
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { DatabaseSync } from 'node:sqlite';
import { tinhHieu } from '../lib/giam-sat/tinh-hieu.js';
import { xuLyIssue } from '../lib/giam-sat/issue.js';
import { redact } from '../core/redact.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const ngayArg = args.find(a => a.startsWith('--ngay='));
const ngay = ngayArg ? ngayArg.split('=')[1] : new Date().toISOString().slice(0, 10);
const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = join(DATA_DIR, 'bot.db');

if (!existsSync(DB_PATH)) {
  console.error(`[giám sát] Không tìm thấy ${DB_PATH} — chạy trên máy có bot.db`);
  process.exit(1);
}

console.log(`[giám sát] Ngày ${ngay} · dryRun=${dryRun}`);

// ═══ 1. Đọc dữ liệu từ SQLite ═══
import { Store } from '../core/store.js';
// Khởi tạo schema nếu chưa có (bot.db tạo khi bot nhận tin đầu tiên)
const store = new Store(DB_PATH);
store.close();
const db = new DatabaseSync(DB_PATH, { readOnly: true });
const dauNgay = `${ngay}T00:00:00Z`;
const cuoiNgay = `${ngay}T23:59:59Z`;

const messages = db.prepare(`SELECT chat_id, turn_id, speaker, speaker_id, text, at
  FROM messages WHERE at BETWEEN ? AND ? ORDER BY at`).all(dauNgay, cuoiNgay)
  .map(r => ({ ...r, speaker: r.speaker === 'bot_out' ? 'bot' : r.speaker }));

const outbox = db.prepare(`SELECT chat_id, turn_id, decision, reason, created_at, sent_at
  FROM outbox WHERE created_at BETWEEN ? AND ?`).all(dauNgay, cuoiNgay);

const jobs = db.prepare(`SELECT pack, ma_luot, status, expires_at, done_at, created_at
  FROM jobs WHERE created_at <= ?`).all(cuoiNgay);

const audit = db.prepare(`SELECT at, turn_id, chat_id, type, data
  FROM audit WHERE at BETWEEN ? AND ?`).all(dauNgay, cuoiNgay);

db.close();
console.log(`[giám sát] Dữ liệu: ${messages.length} tin · ${outbox.length} outbox · ${jobs.length} jobs · ${audit.length} audit`);

// ═══ 2. Tính tín hiệu ═══
const phatHien = tinhHieu({ messages, outbox, jobs, audit, ngay });
console.log(`[giám sát] Phát hiện: ${phatHien.length}`);

if (phatHien.length === 0) {
  console.log(`[giám sát] ✓ Ngày ${ngay} sạch — 0 phát hiện`);
  process.exit(0);
}

// ═══ 3. In báo cáo console ═══
for (const p of phatHien) {
  console.log(`  ${p.ma}${p.cheDo ? `/${p.cheDo}` : ''} → ${p.repo} · ${p.soDo} · ${p.bangChung.length} bằng chứng`);
}

// ═══ 4. Mở/append GitHub issue ═══
const ketQua = xuLyIssue(phatHien, { dryRun, ngay, redactFn: redact });
console.log(`[giám sát] Issue mới: ${ketQua.moi.length} · comment vào cũ: ${ketQua.comment.length} · bỏ vì giới hạn: ${ketQua.boViGioiHan.length}`);

for (const m of ketQua.moi) console.log(`  ↗ MỚI: ${m.repo} — ${m.tieuDe}`);
for (const c of ketQua.comment) console.log(`  ↗ CŨ: ${c.repo}#${c.issue} — ${c.ma}`);
for (const b of ketQua.boViGioiHan) console.log(`  ⊘ BỎ: ${b.repo} — ${b.ma} (${b.lyDo})`);

// ═══ 5. Bản tin ngày (cho Telegram / lưu file) ═══
const banTin = [
  `📊 Giám sát ${ngay}`,
  `Phát hiện: ${phatHien.length}`,
  ...phatHien.map(p => `• ${p.ma}: ${p.soDo} → ${p.repo}`),
  ketQua.boViGioiHan.length > 0 ? `(Bỏ ${ketQua.boViGioiHan.length} vì giới hạn)` : '',
].filter(Boolean).join('\n');

const banTinPath = join(DATA_DIR, `giam-sat-${ngay}.md`);
if (!dryRun) {
  const { writeFileSync } = await import('fs');
  writeFileSync(banTinPath, banTin);
  console.log(`[giám sát] Bản tin lưu: ${banTinPath}`);
}
