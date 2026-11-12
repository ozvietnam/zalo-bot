/**
 * Ẩn danh hai chiều dữ liệu khách hàng (T808 — FR-007, US3, Hiến pháp Điều IX).
 *
 * Vai trò: trước khi lời khách đi vào hàng đợi AI Studio, mọi dấu vết định
 * danh (số điện thoại, tên, token, số tài khoản) phải bị che; sau khi có bản
 * nháp, `deanonymizeDraft` trả lại tên gọi tự nhiên của khách trước khi gửi.
 *
 * DÙNG LẠI (không viết bộ lọc số điện thoại thứ hai):
 *  - `core/sdt.js` — ngữ pháp số điện thoại DUY NHẤT của repo (`findPhoneSpans`)
 *    và bộ nhận mã HS (`looksLikeHsCode`), dùng để không che nhầm mã HS.
 *  - `core/redact.js` — bộ che khoá/bí mật chuẩn của repo (`redact`).
 */

import { findPhoneSpans, looksLikeHsCode } from '../core/sdt.js';
import { redact } from '../core/redact.js';

const PHONE_TAG = '[SĐT]';
const STK_TAG = '[STK]';
const TOKEN_TAG = '[TOKEN]';
/** Thẻ trung tính mà AI Studio hay dùng để gọi khách ("Dạ em chào [TEN_KHACH]"). */
const NAME_TAG = '[TEN_KHACH]';

/** Khoá dạng `sk-...` — `redact` chưa che (chuỗi quá ngắn, < 32 ký tự). */
const RE_TOKEN = /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{5,}\b/g;
/** Dãy số dài liên tục (ứng viên số tài khoản ngân hàng). */
const RE_SO_LONG = /\b\d{8,20}\b/g;
/** Số tài khoản viết có dấu tách kiểu 4-4-4 (vd `1234-5678-9012`). */
const RE_STK_SEP = /\b\d{4}[-.\s]\d{4}[-.\s]\d{4}\b/g;
/**
 * Chữ báo trước số tài khoản: `STK 123...`, `số tài khoản: 123...`, `TK 123...`.
 * Có ngữ cảnh rõ ràng thì số đó là TÀI KHOẢN, không phải số điện thoại.
 */
const RE_STK_CONTEXT =
  /\b(?:stk|tk|s[oô]\s*tk|t[àa]i\s*kho[aả]n(?:\s*ng[aâ]n\s*hang)?|s[oô]\s*t[àa]i\s*kho[aả]n)\b\s*[:=#-]?\s*$/i;

/** Số ký tự để soi lại trước số tài khoản khi đọc ngữ cảnh. */
const CUOI_NGU_CANH = 40;
/** Số phiên hội thoại giữ trong bộ nhớ (chống phình vô hạn). */
const MAX_PHIEN = 500;

/** Chữ cái theo thứ tự: 0 -> A, 1 -> B, ... */
const chuCai = (i) => String.fromCharCode(65 + (i % 26));

/**
 * Bộ nhớ phiên hội thoại: convId -> { ten: [tên theo thứ tự gặp], nhan: Map<tên, nhãn> }.
 * Nhãn gán nhất quán theo phiên để AI Studio luôn thấy "Khách A", "Khách B"...
 */
const phien = new Map();

/** Nhãn chưa dùng trong phiên (để hai khách không trùng nhãn). */
function nhanTrong(p, ten) {
  const dung = new Set(p.nhan.values());
  for (let i = 0; i < 26; i += 1) {
    const nhan = `Khách ${chuCai(i)}`;
    if (!dung.has(nhan)) return nhan;
  }
  return `Khách ${p.ten.length + 1}`;
}

/**
 * Gán (hoặc lấy lại) nhãn của một khách trong phiên hội thoại.
 * - Hội thoại 1-1: nhãn "Khách".
 * - Nhóm: "Khách A", "Khách B", ... (theo thứ tự khách xuất hiện).
 */
function nhanCho(convId, ten, isGroup) {
  const khoa = String(convId ?? 'mac-dinh');
  let p = phien.get(khoa);
  if (!p) {
    p = { ten: [], nhan: new Map() };
    phien.set(khoa, p);
    if (phien.size > MAX_PHIEN) {
      phien.delete(phien.keys().next().value);
    }
  }
  if (!p.nhan.has(ten)) {
    let nhan;
    if (isGroup) nhan = nhanTrong(p, ten);
    else if (p.ten.length === 0) nhan = 'Khách';
    else nhan = nhanTrong(p, ten);
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

/**
 * Che số điện thoại + số tài khoản ngân hàng.
 * Ưu tiên: ngữ cảnh "STK/tài khoản" > ngữ pháp số điện thoại của `core/sdt.js`
 * > dãy số dài 11..16 chữ số (không phải mã HS).
 */
function cheSdtVaStk(src) {
  const sdt = findPhoneSpans(src);

  // (1) Số tài khoản có ngữ cảnh rõ ràng — thắng cả số điện thoại.
  const accUuTien = [];
  for (const m of src.matchAll(RE_SO_LONG)) {
    if (looksLikeHsCode(m[0])) continue; // mã HS không phải tài khoản
    const s = m.index;
    const e = s + m[0].length;
    const truoc = src.slice(Math.max(0, s - CUOI_NGU_CANH), s);
    if (RE_STK_CONTEXT.test(truoc)) accUuTien.push([s, e]);
  }

  // (2) Số tài khoản dài 11..16 chữ số, không phải mã HS, không nằm trong lát số điện thoại.
  const accThuong = [];
  for (const m of src.matchAll(/\b\d{11,16}\b/g)) {
    if (looksLikeHsCode(m[0])) continue;
    const s = m.index;
    const e = s + m[0].length;
    if (sdt.some(([ps, pe]) => s < pe && ps < e)) continue;
    accThuong.push([s, e]);
  }

  // (3) Số tài khoản viết có dấu tách 4-4-4.
  for (const m of src.matchAll(RE_STK_SEP)) {
    const s = m.index;
    const e = s + m[0].length;
    if (sdt.some(([ps, pe]) => s < pe && ps < e)) continue;
    accThuong.push([s, e]);
  }

  const acc = gopKhoang([...accUuTien, ...accThuong]);
  const sdtConLai = gopKhoang(
    sdt.filter(([s, e]) => !accUuTien.some(([as, ae]) => s < ae && as < e))
  );

  // Thay từ cuối về trước để chỉ số không bị lệch.
  const spans = [
    ...acc.map(([s, e]) => [s, e, STK_TAG]),
    ...sdtConLai.map(([s, e]) => [s, e, PHONE_TAG])
  ].sort((a, b) => b[0] - a[0]);
  let out = src;
  for (const [s, e, tag] of spans) out = out.slice(0, s) + tag + out.slice(e);
  return out;
}

/** Escape để dùng trong RegExp. */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Che tên khách (bỏ khoảng trắng thừa, không phân biệt hoa thường). */
function cheTen(text, ten, nhan) {
  const parts = ten.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return text;
  const re = new RegExp(parts.map(escapeRe).join('\\s+'), 'giu');
  return text.replace(re, () => nhan);
}

/**
 * Ẩn danh lời khách trước khi gửi lên AI Studio.
 * @param {object} o
 * @param {string} o.text lời khách gõ (chưa che)
 * @param {string} o.customerName tên khách cần ẩn danh
 * @param {string} [o.convId] mã hội thoại — dùng để gán nhãn nhất quán trong nhóm
 * @param {boolean} [o.isGroup] hội thoại nhóm → nhãn "Khách A", "Khách B"...
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

  // 3) Tên khách → nhãn trung tính.
  const p = nhanCho(convId, ten, Boolean(isGroup));
  const nhan = p.nhan.get(ten);
  out = cheTen(out, ten, nhan);

  // Bảng ánh xạ: nhãn → tên thật (để khôi phục câu trả lời cho khách).
  anonymizeMap.set(nhan, ten);
  anonymizeMap.set(NAME_TAG, ten);
  anonymizeMap.set('TEN_KHACH', ten);
  if (nhan !== 'Khách' && p.ten.length === 1) anonymizeMap.set('Khách', ten);
  for (const [tenKhac, nhanKhac] of p.nhan) {
    if (tenKhac === ten) continue;
    anonymizeMap.set(nhanKhac, tenKhac);
  }
  return { anonymizedText: out, anonymizeMap };
}

/**
 * Khôi phục tên gọi tự nhiên của khách trong bản nháp AI Studio trả về.
 * Chỉ khôi phục PHẦN ĐÃ ẨN DANH (tên) — số điện thoại / STK / token vẫn giữ che.
 * @param {string} draftText bản nháp từ AI Studio
 * @param {Map<string, string>} anonymizeMap bảng nhãn → tên thật
 * @returns {string}
 */
export function deanonymizeDraft(draftText, anonymizeMap) {
  let out = String(draftText ?? '');
  if (!anonymizeMap || typeof anonymizeMap.forEach !== 'function') return out;
  // Thay nhãn dài trước ("Khách A" trước "Khách") để không cắt nhầm.
  const cap = [...anonymizeMap.entries()]
    .filter(([k]) => typeof k === 'string' && k.length > 0)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [placeholder, original] of cap) {
    out = out.split(placeholder).join(String(original ?? ''));
  }
  return out;
}
