// core/giam-sat-hop-thu.js — Hộp thư riêng chứa bản tin giám sát (spec 007, FR-010).
// CLI ghi bản tin vào hộp thư độc lập; tiến trình bot quét và gửi qua gate.js.
// Tuyệt đối không ghi bot.db (FR-005). Mỗi tệp dưới 300 dòng (Hiến pháp VI).
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export const HOP_THU_FILE = 'hop-thu-giam-sat.json';

/** Ghi bản tin vào hộp thư riêng bằng thao tác nguyên tử (atomic rename). */
export function ghiHopThu({ dataDir, idemKey, text, loai = 'ngay', now = () => new Date() }) {
  if (!dataDir || !idemKey || !text) return { ok: false, reason: 'missing-param' };
  const filePath = join(dataDir, HOP_THU_FILE);
  let ds = [];
  try {
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf8');
      if (raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) ds = parsed;
      }
    }
  } catch {
    ds = [];
  }

  // Chống trùng theo kỳ: nếu đã có bản tin với idemKey này -> giữ nguyên, không nhân bản
  const daCo = ds.some((item) => item?.idemKey === idemKey);
  if (daCo) {
    return { ok: true, daCo: true, idemKey };
  }

  const banTinMoi = {
    idemKey,
    loai,
    text,
    status: 'pending',
    createdAt: now().toISOString(),
    attempts: 0,
    lastError: null,
    sentAt: null,
  };
  ds.push(banTinMoi);

  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  try {
    writeFileSync(tmpPath, JSON.stringify(ds, null, 2), 'utf8');
    renameSync(tmpPath, filePath);
  } catch (err) {
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch {}
    throw err;
  }

  return { ok: true, daCo: false, idemKey };
}

/** Bộ quét hộp thư giám sát chạy định kỳ trong tiến trình bot. */
export function createGiamSatHopThu({
  dataDir,
  gate,
  staffChatId,
  enabled = false,
  now = () => new Date(),
  log = console,
}) {
  const filePath = dataDir ? join(dataDir, HOP_THU_FILE) : null;
  let dangQuet = false;

  async function quet() {
    if (!enabled) return { status: 'disabled' };
    if (!staffChatId) return { status: 'no-staff-chat' };
    if (!gate) return { status: 'no-gate' };
    if (!filePath) return { status: 'no-path' };

    if (dangQuet) return { status: 'busy' };
    dangQuet = true;

    try {
      if (!existsSync(filePath)) return { status: 'empty' };
      let raw = '';
      try {
        raw = readFileSync(filePath, 'utf8');
      } catch (e) {
        log?.warn?.(`[giam-sat-hop-thu] không đọc được hộp thư: ${e?.message}`);
        return { status: 'read-error' };
      }
      if (!raw.trim()) return { status: 'empty' };

      let ds;
      try {
        ds = JSON.parse(raw);
        if (!Array.isArray(ds)) return { status: 'corrupt' };
      } catch (e) {
        log?.warn?.(`[giam-sat-hop-thu] JSON hộp thư hỏng: ${e?.message}`);
        return { status: 'corrupt' };
      }

      let coThayDoi = false;
      for (const item of ds) {
        if (!item || item.status !== 'pending') continue;

        const targetChatId = staffChatId;
        try {
          const r = await gate.send({
            kind: 'digest',
            chatId: targetChatId,
            convId: targetChatId,
            isGroup: true,
            idemKey: item.idemKey,
            text: item.text,
          });

          // Nếu gửi thành công hoặc đã gửi trước đó (duplicate-idem)
          if ((r.decision === 'send' && r.status === 'sent') || (r.decision === 'drop' && r.reason === 'duplicate-idem')) {
            item.status = 'sent';
            item.sentAt = now().toISOString();
            coThayDoi = true;
          } else {
            // Gate từ chối hoặc đang hoãn: giữ lại để thử lại ở chu kỳ sau, không đánh dấu sent
            item.attempts = (item.attempts || 0) + 1;
            item.lastError = r.reason || r.status || 'unknown';
            coThayDoi = true;
          }
        } catch (err) {
          item.attempts = (item.attempts || 0) + 1;
          item.lastError = err?.message || 'send-error';
          coThayDoi = true;
        }
      }

      if (coThayDoi) {
        const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
        try {
          writeFileSync(tmpPath, JSON.stringify(ds, null, 2), 'utf8');
          renameSync(tmpPath, filePath);
        } catch (e) {
          try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch {}
          log?.warn?.(`[giam-sat-hop-thu] lỗi ghi cập nhật hộp thư: ${e?.message}`);
        }
      }

      return { status: 'ok' };
    } catch (e) {
      log?.warn?.(`[giam-sat-hop-thu] quét lỗi: ${e?.message}`);
      return { status: 'error' };
    } finally {
      dangQuet = false;
    }
  }

  return { quet };
}
