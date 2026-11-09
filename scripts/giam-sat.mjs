#!/usr/bin/env node
// Agent giám sát — chạy hằng ngày 07:30 (cron / Coolify scheduled task)
// Đọc SQLite bot → tính 9 tín hiệu → mở/append GitHub issue đúng repo, không trùng, ẩn danh.
// Ghi bản tin vào hộp thư riêng hop-thu-digest/ cho bot gửi kind: 'digest' (T704, FR-010, B2b).
// Hỗ trợ cờ --tuan gom nhóm nhu cầu và đo lường trước/sau; kiểm tra SC-002 (T710, T708, T711).
// Usage: node scripts/giam-sat.mjs [--dry-run] [--tuan] [--ngay=2026-11-06]

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { tinhHieu } from './giam-sat/tinh-hieu.js';
import { guiTelegram, dungBanTin } from './giam-sat/telegram.js';
import { layKhoangNgayVnUtc } from './giam-sat/time-util.js';
import { xuLyIssue, dichVanBan } from './giam-sat/issue.js';
import { ghiNhatKy } from './giam-sat/so-nhat-ky.js';
import { soanBanTin, ghiHopThuDigest } from './giam-sat/digest.js';
import { redact } from '../core/redact.js';
import { taoBangKhach } from './giam-sat/an-danh.js';
import { docMetricsCongOz } from './giam-sat/cong-oz.js';
import { gomNhomNhuCau } from './giam-sat/gemini-cluster.js';
import { doLuongTruocSau } from './giam-sat/vong-lap.js';
import { kiemTraSc002 } from './giam-sat/sc-002.js';

export { kiemTraSc002 };

/**
 * Hàm điều phối chính phiên chạy giám sát (ngày hoặc tuần).
 * @param {object} [opts]
 * @returns {Promise<object>}
 */
export async function chayGiamSat(opts = {}) {
  const args = process.argv.slice(2);
  const dryRun = opts.dryRun ?? args.includes('--dry-run');
  const tuan = opts.tuan ?? args.includes('--tuan');
  const ngayArg = args.find(a => a.startsWith('--ngay='));
  const ngayYmd = opts.ngay ?? (ngayArg ? ngayArg.split('=')[1] : undefined);
  const { ngayVn: ngay, dauNgayUtc, cuoiNgayUtc } = layKhoangNgayVnUtc(ngayYmd);
  const dataDir = opts.dataDir ?? process.env.DATA_DIR ?? './data';
  const dbPath = opts.dbPath ?? join(dataDir, 'bot.db');
  const telegramEnabled = !/^(0|false|off|no)$/i.test(process.env.TELEGRAM_DIGEST_ENABLED || process.env.TELEGRAM_ENABLED || '1');
  const metricsUrl = opts.metricsUrl ?? (process.env.OZ_METRICS_URL || process.env.OZPLUGIN_METRICS_URL);

  if (!existsSync(dbPath)) {
    console.error(`[giám sát] Không tìm thấy ${dbPath} — chạy trên máy có bot.db`);
    if (opts.throwOnError) throw new Error(`Không tìm thấy ${dbPath}`);
    process.exit(1);
  }

  console.log(`[giám sát] Ngày ${ngay} · dryRun=${dryRun} · tuan=${tuan}`);

  // ═══ 1. Đọc dữ liệu từ SQLite (chỉ-đọc tuyệt đối, FR-005) ═══
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch (err) {
    console.error(`[giám sát] Không thể mở ${dbPath} ở chế độ chỉ-đọc: ${err.message}`);
    process.exit(1);
  }

  let coBang = false;
  try {
    coBang = Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'messages'").get());
  } catch {
    console.error(`[giám sát] Không thể đọc sqlite_master từ ${dbPath}`);
    db.close();
    process.exit(1);
  }
  if (!coBang) {
    console.error(`[giám sát] db ${dbPath} chưa có bảng (bot chưa nhận tin nào)`);
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

  // Đối chiếu vòng lặp trước/sau cho luồng tuần khi kết nối db còn mở (T711)
  let ketQuaVongLap = [];
  if (tuan) {
    try {
      ketQuaVongLap = doLuongTruocSau({
        issueDaDong: opts.issueDaDong || [],
        db,
        ngayHienTai: cuoiNgayUtc,
      });
      console.log(`[giám sát] Vòng lặp tuần: đã đo lường ${ketQuaVongLap.length} issue đã đóng`);
    } catch (err) {
      console.warn(`[giám sát] Lỗi vòng lặp trước/sau: ${err.message}`);
    }
  }

  db.close();
  console.log(`[giám sát] Dữ liệu: ${messages.length} tin · ${outbox.length} outbox · ${jobs.length} jobs · ${audit.length} audit`);

  // ═══ 2. Tính tín hiệu & gộp nguồn phụ (Cổng OZ, Gemini tuần) ═══
  const phatHien = tinhHieu({ messages, outbox, jobs, audit, ngay });

  // Nguồn Cổng OZ metrics (T710, FR-009)
  if (metricsUrl) {
    try {
      const { phatHienSlow } = await docMetricsCongOz(metricsUrl, { fetcher: opts.fetcher });
      if (Array.isArray(phatHienSlow) && phatHienSlow.length > 0) {
        phatHien.push(...phatHienSlow);
        console.log(`[giám sát] Cổng OZ: bổ sung ${phatHienSlow.length} phát hiện TOOL-SLOW`);
      }
    } catch (err) {
      console.warn(`[giám sát] Lỗi đọc metrics Cổng OZ: ${err.message}`);
    }
  }

  // Nguồn Gemini gom nhóm nhu cầu cho luồng tuần (T708, FR-006)
  if (tuan) {
    try {
      const hoiThoaiTuan = messages.filter(m => m.speaker === 'nhan-vien' || m.speaker === 'staff');
      const dbTurns = new Set(messages.map(m => m.turn_id).filter(Boolean));
      const ketQuaGemini = await gomNhomNhuCau({
        hoiThoaiTuan,
        dbTurns,
        apiKey: opts.geminiApiKey || process.env.GEMINI_API_KEY || (opts.geminiFetcher ? 'mock-key' : undefined),
        fetcher: opts.geminiFetcher || opts.fetcher,
      });
      if (ketQuaGemini.loi) {
        console.warn(`[giám sát] gemini-cluster: ${ketQuaGemini.loi}`);
      } else if (Array.isArray(ketQuaGemini.nhom)) {
        for (const n of ketQuaGemini.nhom) {
          phatHien.push({
            ma: 'NHU-CAU-MOI',
            cheDo: n.repo,
            fingerprint: `NHU-CAU:${n.repo}:${n.tenNhom}`,
            repo: n.repo,
            soDo: `${n.soPhong || n.turnIds?.length || 1} phòng`,
            moTa: `Nhu cầu mới: ${n.tenNhom} — ${n.deXuatCongCu}`,
            bangChung: n.turnIds || [],
          });
        }
      }
    } catch (err) {
      console.warn(`[giám sát] Lỗi gom nhóm tuần: ${err.message}`);
    }
  }

  console.log(`[giám sát] Tổng phát hiện: ${phatHien.length}`);

  // ═══ 3. Dựng mapKhach và Xử lý GitHub issue ═══
  const mapKhach = taoBangKhach(messages);
  const loaiBanTin = tuan ? 'tuan' : 'ngay';

  if (phatHien.length === 0) {
    console.log(`[giám sát] ✓ Ngày ${ngay} sạch — 0 phát hiện`);
    const ketQuaRong = { moi: [], comment: [], reopen: [], boViGioiHan: [] };
    const banTin0 = soanBanTin({ ngay, phatHien: [], ketQua: ketQuaRong, loai: loaiBanTin, vongLap: ketQuaVongLap });

    let loiDigest0 = null;
    if (!dryRun) {
      const hopThu = ghiHopThuDigest({ banTin: banTin0, ngay, loai: loaiBanTin, dataDir });
      if (!hopThu.ok) loiDigest0 = hopThu.error || 'digest-failed';
      writeFileSync(join(dataDir, `giam-sat-${ngay}.md`), banTin0);
    }

    if (telegramEnabled) {
      const banTinHtml0 = dungBanTin({ ngay, phatHien: [], ketQua: ketQuaRong });
      await guiTelegram(banTinHtml0, { dryRun }).catch(() => false);
    }

    ghiNhatKy({
      ngay,
      nguon: 'bot.db',
      soTin: messages.length,
      phatHien: 0,
      ketQuaIssue: ketQuaRong,
      loi: loiDigest0,
    }, { dbPath: join(dataDir, 'giam-sat.db') });

    return { ngay, messages, phatHien: [], ketQua: ketQuaRong, sc002: { hopLe: true, viPham: [] }, banTin: banTin0, ketQuaVongLap };
  }

  for (const p of phatHien) {
    console.log(`  ${p.ma}${p.cheDo ? `/${p.cheDo}` : ''} → ${p.repo} · ${p.soDo} · ${p.bangChung?.length || 0} bằng chứng`);
  }

  const ketQua = await xuLyIssue(phatHien, { dryRun, ngay, redactFn: redact, mapKhach, ghClient: opts.ghClient });
  console.log(`[giám sát] Issue mới: ${ketQua.moi.length} · comment: ${ketQua.comment.length} · bỏ vì giới hạn: ${ketQua.boViGioiHan.length}`);

  // ═══ 4. Kiểm chứng tự động SC-002 (0 issue chứa SĐT, STK, token, tên khách) ═══
  const danhSachIssueKiemTra = phatHien.map(p => ({
    title: `[giám sát] ${p.ma}${p.cheDo ? `: ${p.cheDo}` : ''} — ${p.moTa?.slice(0, 60)}`,
    body: dichVanBan(p, ngay, redact, mapKhach),
  }));
  const sc002 = kiemTraSc002(danhSachIssueKiemTra, { mapKhach });
  if (!sc002.hopLe) {
    console.error(`[giám sát] CẢNH BÁO SC-002: phát hiện ${sc002.viPham.length} rò rỉ PII:`, sc002.viPham);
  } else {
    console.log(`[giám sát] SC-002: ✓ ĐẠT — 0 issue chứa SĐT, STK, token hay tên khách thật`);
  }

  // ═══ 5. Bản tin & Ghi sổ nhật ký thực thi (FR-010, FR-011) ═══
  const banTin = soanBanTin({ ngay, phatHien, ketQua, loai: loaiBanTin, vongLap: ketQuaVongLap });
  let loiDigest = null;
  if (!dryRun) {
    const hopThu = ghiHopThuDigest({ banTin, ngay, loai: loaiBanTin, dataDir });
    if (!hopThu.ok) loiDigest = hopThu.error || 'digest-failed';
    writeFileSync(join(dataDir, `giam-sat-${ngay}.md`), banTin);
  }

  if (telegramEnabled) {
    const banTinHtml = dungBanTin({ ngay, phatHien, ketQua });
    await guiTelegram(banTinHtml, { dryRun }).catch(() => false);
  }

  const danhSachLoi = [];
  if (ketQua.loi) danhSachLoi.push(typeof ketQua.loi === 'string' ? ketQua.loi : JSON.stringify(ketQua.loi));
  if (loiDigest) danhSachLoi.push(`digest: ${loiDigest}`);

  ghiNhatKy({
    ngay,
    nguon: 'bot.db',
    soTin: messages.length,
    phatHien,
    ketQuaIssue: ketQua,
    loi: danhSachLoi.length > 0 ? danhSachLoi.join('; ') : null,
  }, { dbPath: join(dataDir, 'giam-sat.db') });

  return { ngay, messages, phatHien, ketQua, sc002, banTin, ketQuaVongLap };
}

// Chạy trực tiếp CLI
const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('giam-sat.mjs');
if (isMain) {
  chayGiamSat().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error(`[giám sát] Lỗi nghiêm trọng: ${err.message}`);
    process.exit(1);
  });
}
