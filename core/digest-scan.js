// core/digest-scan.js — spec 007 T704 (FR-010, B1, B2a, B2b, B2c)
// Bộ quét hộp thư riêng (mỗi bản tin một tệp trong hop-thu-digest/) gửi qua gate.send.
// Tệp dưới 300 dòng theo Hiến pháp Điều VI.

import { join } from 'node:path';
import { existsSync, readdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { isQuietHours } from './time.js';
import { redact } from './redact.js';

export const THU_MUC_HOP_THU = 'hop-thu-digest';
const HAN_NGAY_MS = 24 * 60 * 60 * 1000;      // 24 giờ cho bản tin ngày
const HAN_TUAN_MS = 7 * 24 * 60 * 60 * 1000;  // 7 ngày cho bản tin tuần

/**
 * Tạo bộ quét hộp thư giám sát định kỳ.
 * @param {object} param0
 * @param {object} param0.gate Cửa gửi duy nhất
 * @param {object} param0.config Cấu hình (chứa staffChatId, dataDir)
 * @param {string} [param0.dataDir] Thư mục dữ liệu
 * @param {Function} [param0.now] Hàm lấy mốc giờ hiện tại
 * @param {object} [param0.log] Bộ ghi nhật ký
 * @returns {{ scan: () => Promise<object> }}
 */
export function createDigestScanner({ gate, config = {}, dataDir, now = () => new Date(), log = console }) {
  const dir = dataDir || config.dataDir || process.env.DATA_DIR || './data';
  const hopThuDir = join(dir, THU_MUC_HOP_THU);

  async function scan() {
    // 1. Cờ kiểm soát: tắt mặc định bằng biến môi trường
    const enabled = /^(1|true|yes)$/i.test(process.env.GIAM_SAT_DIGEST_ENABLED || process.env.DIGEST_SCAN_ENABLED || '');
    if (!enabled) {
      return { skipped: true, reason: 'disabled' };
    }

    const hienTai = now();

    // 2. B1[chan]: Chặn gửi trong giờ yên 23:00–07:00 VN (theo tiền lệ core/ops.js:233)
    if (isQuietHours(hienTai)) {
      return { skipped: true, reason: 'quiet-hours' };
    }

    const staffChatId = config.staffChatId;
    if (!gate || !staffChatId) {
      return { skipped: true, reason: 'no-gate-or-staff-chat' };
    }

    if (!existsSync(hopThuDir)) {
      return { processed: 0, reason: 'no-dir' };
    }

    let files = [];
    try {
      files = readdirSync(hopThuDir).filter((f) => f.endsWith('.json') && !f.includes('.tmp.'));
    } catch (err) {
      log?.warn?.(`[digest-scan] Không thể đọc thư mục hộp thư: ${err?.message}`);
      return { processed: 0, error: err?.message };
    }

    if (!files.length) {
      return { processed: 0 };
    }

    let processed = 0;
    const nowMs = hienTai.getTime();
    const nowIso = hienTai.toISOString();

    for (const file of files) {
      const filePath = join(hopThuDir, file);
      let item;
      try {
        const raw = readFileSync(filePath, 'utf8');
        item = JSON.parse(raw);
      } catch (err) {
        log?.warn?.(`[digest-scan] Bỏ qua tệp hỏng ${file}: ${err?.message}`);
        continue;
      }

      if (!item || item.status !== 'pending') {
        continue;
      }

      // 3. B1[chan]: Kiểm tra quá hạn (ngày > 24h, tuần > 7 ngày) -> đánh dấu het-han
      const createdAtMs = item.createdAt ? Date.parse(item.createdAt) : null;
      const hanMs = item.loai === 'tuan' ? HAN_TUAN_MS : HAN_NGAY_MS;
      if (createdAtMs && nowMs - createdAtMs > hanMs) {
        item.status = 'het-han';
        item.lastError = 'qua-han';
        ghiDeTep(filePath, item);
        continue;
      }

      // 4. Gửi qua gate: Bắt buộc gửi tới staffChatId
      let res;
      try {
        res = await gate.send({
          kind: 'digest',
          chatId: staffChatId,
          isGroup: true,
          idemKey: item.idemKey,
          text: item.text,
        });
      } catch (sendErr) {
        res = { decision: 'error', reason: sendErr?.message };
      }

      // 5. B2a & B2c: Cập nhật trạng thái từng tệp
      if (res?.decision === 'send' && res?.status === 'sent') {
        item.status = 'sent';
        item.sentAt = nowIso;
        item.lastError = null;
        processed++;
      } else if (res?.decision === 'drop' && res?.reason === 'duplicate-idem') {
        // B2a: duplicate-idem không được ghi 'sent'; ghi trạng thái riêng
        item.status = 'dropped';
        item.lastError = 'duplicate-idem';
      } else {
        // Lỗi, reject (ví dụ leak:banned), defer: giữ nguyên pending để thử lại
        item.attempts = (item.attempts || 0) + 1;
        const errReason = `${res?.decision || 'unknown'}:${res?.reason || ''}`;
        // B2c: lastError phải qua redact
        item.lastError = redact(errReason);
      }

      ghiDeTep(filePath, item);
    }

    return { processed };
  }

  function ghiDeTep(filePath, payload) {
    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    try {
      writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
      renameSync(tmpPath, filePath);
    } catch {
      try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch {}
    }
  }

  return { scan };
}
