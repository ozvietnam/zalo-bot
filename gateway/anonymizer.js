/**
 * Ẩn danh hai chiều dữ liệu khách hàng (T808 — FR-007, US3, Hiến pháp Điều IX).
 *
 * Vai trò: trước khi lời khách đi vào hàng đợi AI Studio, mọi dấu vết định
 * danh (số điện thoại, tên, token, số tài khoản) phải bị che; sau khi có bản
 * nháp, `deanonymizeDraft` trả lại tên gọi tự nhiên của khách trước khi gửi.
 *
 * DÙNG LẠI (không viết bộ lọc thứ hai cho số điện thoại hay số tài khoản):
 *  - `core/sdt.js` — ngữ pháp số điện thoại DUY NHẤT của repo (`findPhoneSpans`)
 *    và bộ nhận mã HS (`looksLikeHsCode`), dùng để không che nhầm mã HS.
 *  - `core/sanitizer.js` — ngữ pháp số tài khoản dùng chung (`timKhoangStk`).
 *  - `core/redact.js` — bộ che khoá/bí mật chuẩn của repo (`redact`).
 *
 * NHÃN là dấu đóng khung `[KHACH]`, `[KHACH_A]`… chứ không phải chữ thô
 * "Khách": khôi phục phải không bao giờ đụng vào chữ "Khách hàng" trong câu.
 */

import { findPhoneSpans, looksLikeHsCode } from '../core/sdt.js';
import { timKhoangStk } from '../core/sanitizer.js';
import { redact } from '../core/redact.js';

const PHONE_TAG = '[SĐT]';
const STK_TAG = '[STK]';
const TOKEN_TAG = '[TOKEN]';
/** Thẻ trung tính mà AI Studio hay dùng để gọi khách ("Dạ em chào [TEN_KHACH]"). */
const NAME_TAG = '[TEN_KHACH]';

/** Khoá dạng `sk-...` — `redact` chưa che (chuỗi quá ngắn, < 32 ký tự). */
const RE_TOKEN = /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{5,}\b/g;
/**
 * Dãy số trần dài 11..19 chữ số, không từ khoá đi kèm: vẫn coi là ứng viên số
 * tài khoản. Giữ tầng này để CHE rộng hơn LÕI (nguyên tắc của `core/sdt.js`).
 */
const RE_SO_TRAN = /\b\d{11,19}\b/g;

/** Số phiên hội thoại giữ trong bộ nhớ (chống phình vô hạn). */
const MAX_PHIEN = 500;
/** Tên ngắn hơn ngần này không đủ định danh, che thì vỡ văn bản → bỏ qua. */
const TEN_TOI_THIEU = 2;

/** Chữ cái theo thứ tự: 0 -> A, 1 -> B, ... */
const chuCai = (i) => String.fromCharCode(65 + (i % 26));

/**
 * Bộ nhớ phiên hội thoại: convId -> { ten: [tên theo thứ tự gặp], nhan: Map<tên, nhãn> }.
 * Nhãn gán nhất quán theo phiên để AI Studio luôn thấy `[KHACH_A]`, `[KHACH_B]`…
 */
const phien = new Map();

/** Nhãn chưa dùng trong phiên (để hai khách không trùng nhãn). */
function nhanTrong(p) {
  const dung = new Set(p.nhan.values());
  for (let i = 0; i < 26; i += 1) {
    const nhan = `[KHACH_${chuCai(i)}]`;
    if (!dung.has(nhan)) return nhan;
  }
  return `[KHACH_${p.ten.length + 1}]`;
}

/**
 * Lấy phiên hội thoại và gán nhãn cho khách.
 * - KHÔNG có `convId`: phiên RIÊNG, không lưu vào bộ nhớ chung — hai khách
 *   thiếu `convId` không được dùng chung bản đồ (lỗi vòng soát 1, điểm 2).
 * - Hội thoại 1-1: nhãn `[KHACH]`.
 * - Nhóm: `[KHACH_A]`, `[KHACH_B]`… theo thứ tự khách xuất hiện.
 */
function phienCho(convId, ten, isGroup) {
  const khoa = convId == null || String(convId) === '' ? null : String(convId);
  let p;
  if (khoa === null) {
    p = { ten: [], nhan: new Map(), rieng: true };
  } else {
    p = phien.get(khoa);
    if (!p) {
      p = { ten: [], nhan: new Map(), rieng: false };
      phien.set(khoa, p);
      if (phien.size > MAX_PHIEN) phien.delete(phien.keys().next().value);
    }
  }
  if (!p.nhan.has(ten)) {
    const nhan = isGroup || p.ten.length > 0 ? nhanTrong(p) : '[KHACH]';
    p.ten.push(ten);
    p.nhan.set(ten, nhan);
  }
  return p;
}

/** Gộp các khoảng chồng lấn thành khoảng không chồng, tăng dần. */
function gopKhoang(spans) {
  const xep = [...spans].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const ra = [];
  for (const [s, e] of xep) {
    const cuoi = ra[ra.length - 1];
    if (cuoi && s <= cuoi[1]) cuoi[1] = Math.max(cuoi[1], e);
    else ra.push([s, e]);
  }
  return ra;
}

const chongLan = (s, e, spans) => spans.some(([as, ae]) => s < ae && as < e);

/**
 * Che số điện thoại + số tài khoản ngân hàng.
 * Ưu tiên: số tài khoản CÓ TỪ KHOÁ (`core/sanitizer.js`) > ngữ pháp số điện
 * thoại (`core/sdt.js`) > dãy số trần 11..19 chữ số không phải mã HS.
 */
function cheSdtVaStk(src) {
  // (1) Số tài khoản có từ khoá đi trước — thắng cả ngữ pháp số điện thoại.
  const stkUuTien = gopKhoang(timKhoangStk(src));

  // (2) Số điện thoại, trừ phần đã nằm trong khoảng số tài khoản.
  const sdt = findPhoneSpans(src).filter(([s, e]) => !chongLan(s, e, stkUuTien));

  // (3) Dãy số trần dài, không phải mã HS, không chồng hai nhóm trên.
  const stkTran = [];
  for (const m of src.matchAll(RE_SO_TRAN)) {
    const s = m.index;
    const e = s + m[0].length;
    if (looksLikeHsCode(m[0])) continue;
    if (chongLan(s, e, stkUuTien) || chongLan(s, e, sdt)) continue;
    stkTran.push([s, e]);
  }

  const stk = gopKhoang([...stkUuTien, ...stkTran]);
  // Thay từ cuối về trước để chỉ số không bị lệch.
  const spans = [
    ...stk.map(([s, e]) => [s, e, STK_TAG]),
    ...gopKhoang(sdt).map(([s, e]) => [s, e, PHONE_TAG])
  ].sort((a, b) => b[0] - a[0]);
  let out = src;
  for (const [s, e, tag] of spans) out = out.slice(0, s) + tag + out.slice(e);
  return out;
}

/** Escape để dùng trong RegExp. */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Che tên khách bằng nhãn.
 * Có RANH GIỚI TỪ hai đầu (không phải `\b` vì tên tiếng Việt có dấu): tên "An"
 * không được cắt vào giữa "Anh chị" hay "Ancol" (lỗi vòng soát 1, điểm 5).
 */
function cheTen(text, ten, nhan) {
  const parts = ten.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return text;
  const goc = parts.join(' ');
  // Tên 1 ký tự không đủ định danh mà che thì vỡ văn bản → giữ nguyên.
  if (goc.replace(/\s+/g, '').length < TEN_TOI_THIEU) return text;
  const than = parts.map(escapeRe).join('\\s+');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${than}(?![\\p{L}\\p{N}])`, 'giu');
  return text.replace(re, () => nhan);
}

/**
 * Ẩn danh lời khách trước khi gửi lên AI Studio.
 * @param {object} o
 * @param {string} o.text lời khách gõ (chưa che)
 * @param {string} o.customerName tên khách cần ẩn danh
 * @param {string} [o.convId] mã hội thoại — dùng để gán nhãn nhất quán trong nhóm
 * @param {boolean} [o.isGroup] hội thoại nhóm → nhãn `[KHACH_A]`, `[KHACH_B]`…
 * @returns {{anonymizedText: string, anonymizeMap: Map<string, string>}}
 */
export function anonymizePrompt({ text, customerName, convId, isGroup = false } = {}) {
  const src = String(text ?? '').normalize('NFKC');
  const ten = String(customerName ?? '').trim();

  // 1) Bí mật chuẩn của repo (Bearer, token bot, chuỗi dài) rồi tới khoá `sk-...`.
  let out = redact(src).replace(RE_TOKEN, TOKEN_TAG);
  // 2) Số điện thoại + số tài khoản ngân hàng.
  out = cheSdtVaStk(out);

  const anonymizeMap = new Map();
  if (!ten) return { anonymizedText: out, anonymizeMap };

  // 3) Tên khách của lượt này → nhãn riêng.
  const p = phienCho(convId, ten, Boolean(isGroup));
  const nhan = p.nhan.get(ten);

  // 4) Tên MỌI khách đã biết trong phiên cũng phải che: tin của khách B nhắc
  //    tên khách A thì tên A không được lọt lên AI Studio (lỗi vòng soát 1,
  //    điểm 1). Che tên dài trước để tên ngắn không cắt vỡ tên dài.
  const dsTen = [...p.nhan.keys()].sort((a, b) => b.length - a.length);
  for (const t of dsTen) out = cheTen(out, t, p.nhan.get(t));

  // 5) Bảng ánh xạ NHÃN → tên thật (để khôi phục câu trả lời cho khách).
  //    Chỉ chứa nhãn đóng khung, không chứa chữ thô "Khách".
  anonymizeMap.set(nhan, ten);
  anonymizeMap.set(NAME_TAG, ten);
  // Phiên riêng (thiếu `convId`) KHÔNG khôi phục tên khách khác.
  if (!p.rieng) {
    for (const t of dsTen) {
      if (t === ten) continue;
      anonymizeMap.set(p.nhan.get(t), t);
    }
  }
  return { anonymizedText: out, anonymizeMap };
}

/**
 * Khôi phục tên gọi tự nhiên của khách trong bản nháp AI Studio trả về.
 * Chỉ khôi phục PHẦN ĐÃ ẨN DANH (tên) — số điện thoại / STK / token vẫn giữ che.
 * CHỈ thay nhãn đóng khung `[...]`: chữ "Khách hàng" trong câu phải giữ nguyên
 * (lỗi vòng soát 1, điểm 6).
 * @param {string} draftText bản nháp từ AI Studio
 * @param {Map<string, string>} anonymizeMap bảng nhãn → tên thật
 * @returns {string}
 */
export function deanonymizeDraft(draftText, anonymizeMap) {
  let out = String(draftText ?? '');
  if (!anonymizeMap || typeof anonymizeMap.entries !== 'function') return out;
  // Thay nhãn dài trước (`[KHACH_A]` trước `[KHACH]`) để không cắt nhầm.
  const cap = [...anonymizeMap.entries()]
    .filter(([k]) => typeof k === 'string' && /^\[.+\]$/.test(k))
    .sort((a, b) => b[0].length - a[0].length);
  for (const [nhan, tenThat] of cap) {
    out = out.split(nhan).join(String(tenThat ?? ''));
  }
  return out;
}

/** Xoá bộ nhớ phiên (dùng cho bài kiểm — hàm thuần, không I/O). */
export function xoaPhien() {
  phien.clear();
}
