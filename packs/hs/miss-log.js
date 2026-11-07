// packs/hs/miss-log.js — sổ ghi lượt "trượt từ vựng" để ca đêm quét, nạp từ điển trade-synonyms hoặc mở issue.
// Chỉ gói hs ghi sổ này (packs/hs/packages.js, packs/hs/flow-turn.js) ⇒ nghiệp vụ của gói (Điều VI).
// Ghi 3 loại lượt: CAN_DU_KIEN (gói 1 cần hỏi thêm), TIEN_LE_RONG (tiền lệ 0 kết quả), GO_LAI (khách gõ lại/sửa mô tả).
// Mỗi dòng là 1 JSON (JSONL), mỗi ngày 1 file: <thuMuc>/truot-YYYY-MM-DD.jsonl. Không lưu mã chat/người dùng.
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ngay = (d = new Date()) => {
  // Ngày theo giờ Việt Nam (UTC+7) để ca đêm đếm đúng ngày.
  const vn = new Date(d.getTime() + 7 * 3600_000);
  return vn.toISOString().slice(0, 10);
};

export function createMissLog({ thuMuc = 'du-lieu-truot', log = console, now = () => new Date() } = {}) {
  let san = null;
  let hang = Promise.resolve();
  const dem = new Map();   // "ngày|loại" → số lượt (đọc qua thongKe())

  function ghi(loai, info = {}) {
    const t = now();
    const d = ngay(t);
    const key = `${d}|${loai}`;
    dem.set(key, (dem.get(key) || 0) + 1);
    const dong = `${JSON.stringify({ luc: t.toISOString(), loai, ...info })}\n`;
    // Ghi tuần tự để các dòng không chen nhau; lỗi đĩa chỉ báo log, không làm hỏng câu trả lời.
    hang = hang.then(async () => {
      if (!san) san = mkdir(thuMuc, { recursive: true });
      await san;
      await appendFile(path.join(thuMuc, `truot-${d}.jsonl`), dong, 'utf8');
    }).catch((e) => { log.error?.(`[truot] không ghi được: ${e.message}`); });
    return hang;
  }

  /** Số lượt theo loại của một ngày (mặc định hôm nay). */
  function thongKe(d = ngay(now())) {
    const out = {};
    for (const [k, v] of dem) { const [dd, loai] = k.split('|'); if (dd === d) out[loai] = v; }
    return out;
  }

  return { ghi, thongKe, xong: () => hang };
}
