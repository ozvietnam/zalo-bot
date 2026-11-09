#!/usr/bin/env node
// Agent giám sát — chạy hằng ngày 07:30 (cron / Coolify scheduled task)
// Đọc SQLite bot → tính 9 tín hiệu → mở/append GitHub issue đúng repo, không trùng, ẩn danh.
// Ghi bản tin vào hộp thư riêng hop-thu-digest/ cho bot gửi kind: 'digest' (T704, FR-010, B2b).
// Usage: node scripts/giam-sat.mjs [--dry-run] [--ngay=2026-11-06]
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DatabaseSync } from 'node:sqlite';
import { tinhHieu } from './giam-sat/tinh-hieu.js';
import { guiTelegram, dungBanTin } from './giam-sat/telegram.js';
import { layKhoangNgayVnUtc } from './giam-sat/time-util.js';
import { xuLyIssue } from './giam-sat/issue.js';
import { ghiNhatKy } from './giam-sat/so-nhat-ky.js';
import { soanBanTin, ghiHopThuDigest } from './giam-sat/digest.js';
import { redact } from '../core/redact.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const ngayArg = args.find(a => a.startsWith('--ngay='));
const ngayYmd = ngayArg ? ngayArg.split('=')[1] : undefined;
const { ngayVn: ngay, dauNgayUtc, cuoiNgayUtc } = layKhoangNgayVnUtc(ngayYmd);
const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = join(DATA_DIR, 'bot.db');
const telegramEnabled = !/^(0|false|off|no)$/i.test(process.env.TELEGRAM_DIGEST_ENABLED || process.env.TELEGRAM_ENABLED || '1');

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

// ═══ Lời gọi ghi sổ 1: Ngày 0 phát hiện (FR-011, GD) ═══
if (phatHien.length === 0) {
  console.log(`[giám sát] ✓ Ngày ${ngay} sạch — 0 phát hiện`);
  const ketQuaRong = { moi: [], comment: [], boViGioiHan: [] };
  const banTin0 = soanBanTin({ ngay, phatHien: [], ketQua: ketQuaRong });

  // Ghi vào hộp thư riêng TRƯỚC ghi sổ (T704, FR-010, GD)
  let loiDigest0 = null;
  if (!dryRun) {
    const hopThu = ghiHopThuDigest({ banTin: banTin0, ngay, loai: 'ngay', dataDir: DATA_DIR });
    if (!hopThu.ok) loiDigest0 = hopThu.error || 'digest-failed';
    console.log(`[giám sát] Hộp thư digest: ${hopThu.inserted ? 'đã ghi' : 'đã có trước'}`);
    const banTinPath = join(DATA_DIR, `giam-sat-${ngay}.md`);
    writeFileSync(banTinPath, banTin0);
  }

  // Gửi Telegram dự phòng (nếu bật)
  if (telegramEnabled) {
    const banTinHtml0 = dungBanTin({ ngay, phatHien: [], ketQua: ketQuaRong });
    const sent = await guiTelegram(banTinHtml0, { dryRun });
    console.log(`[giám sát] Telegram: ${sent ? '✓ đã gửi' : '(chưa cấu hình hoặc gửi lỗi)'}`);
  }

  // Lời ghi sổ nhật ký 1 (FR-011)
  ghiNhatKy({
    ngay,
    nguon: 'bot.db',
    soTin: messages.length,
    phatHien: 0,
    ketQuaIssue: ketQuaRong,
    loi: loiDigest0,
  }, { dbPath: join(DATA_DIR, 'giam-sat.db') });

  process.exit(0);
}

// ═══ 3. In báo cáo console ═══
for (const p of phatHien) {
  console.log(`  ${p.ma}${p.cheDo ? `/${p.cheDo}` : ''} → ${p.repo} · ${p.soDo} · ${p.bangChung.length} bằng chứng`);
}

// ═══ 4. Mở/append GitHub issue ═══
const ketQua = await xuLyIssue(phatHien, { dryRun, ngay, redactFn: redact });
console.log(`[giám sát] Issue mới: ${ketQua.moi.length} · comment vào cũ: ${ketQua.comment.length} · bỏ vì giới hạn: ${ketQua.boViGioiHan.length}`);

for (const m of ketQua.moi) console.log(`  ↗ MỚI: ${m.repo} — ${m.tieuDe}`);
for (const c of ketQua.comment) console.log(`  ↗ CŨ: ${c.repo}#${c.issue} — ${c.ma}`);
for (const b of ketQua.boViGioiHan) console.log(`  ⊘ BỎ: ${b.repo} — ${b.ma} (${b.lyDo})`);

// ═══ 5. Bản tin ngày (Hộp thư Zalo digest / lưu file / Telegram) — Gửi TRƯỚC ghi sổ cuối (GD) ═══
const banTin = soanBanTin({ ngay, phatHien, ketQua });

// Ghi hộp thư riêng cho bot Zalo TRƯỚC ghi sổ cuối (T704, FR-010, GD)
let loiDigest = null;
if (!dryRun) {
  const hopThu = ghiHopThuDigest({ banTin, ngay, loai: 'ngay', dataDir: DATA_DIR });
  if (!hopThu.ok) loiDigest = hopThu.error || 'digest-failed';
  console.log(`[giám sát] Hộp thư digest: ${hopThu.inserted ? 'đã ghi' : 'đã có trước'}`);
}

// Lưu file
const banTinPath = join(DATA_DIR, `giam-sat-${ngay}.md`);
if (!dryRun) {
  writeFileSync(banTinPath, banTin);
  console.log(`[giám sát] Bản tin lưu: ${banTinPath}`);
}

// Gửi Telegram cho CEO nếu được bật (im lặng nếu chưa cấu hình)
if (telegramEnabled) {
  const banTinHtml = dungBanTin({ ngay, phatHien, ketQua });
  const sent = await guiTelegram(banTinHtml, { dryRun });
  console.log(`[giám sát] Telegram: ${sent ? '✓ đã gửi' : '(chưa cấu hình TELEGRAM_BOT_TOKEN/CHAT_ID)'}`);
}

// ═══ Lời gọi ghi sổ 2: Ghi sổ nhật ký thực thi (FR-011, GD) ═══
const danhSachLoi = [];
if (ketQua.loi) {
  const errText = typeof ketQua.loi === 'string' ? ketQua.loi : JSON.stringify(ketQua.loi);
  danhSachLoi.push(errText);
}
if (loiDigest) danhSachLoi.push(`digest: ${loiDigest}`);

ghiNhatKy({
  ngay,
  nguon: 'bot.db',
  soTin: messages.length,
  phatHien,
  ketQuaIssue: ketQua,
  loi: danhSachLoi.length > 0 ? danhSachLoi.join('; ') : null,
}, { dbPath: join(DATA_DIR, 'giam-sat.db') });
console.log(`[giám sát] Sổ nhật ký: ${join(DATA_DIR, 'giam-sat.db')}`);
