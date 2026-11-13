/**
 * Ẩn danh hai chiều dữ liệu khách hàng (T808 — FR-007, US3, Hiến pháp Điều IX).
 *
 * Vai trò: trước khi lời khách đi vào hàng đợi AI Studio, mọi dấu vết định
 * danh (số điện thoại, tên, token, số tài khoản) phải bị che; sau khi có bản
 * nháp, `deanonymizeDraft` trả lại tên gọi tự nhiên của khách trước khi gửi.
 *
 * DÙNG LẠI: `core/sdt.js` (SĐT + looksLikeHsCode), `core/sanitizer.js`
 * (timKhoangStk), `core/redact.js`, `packs/hs/input.js` (`norm` — so tên).
 *
 * Giới hạn số trần: che dãy 8–20 chữ số (kể cả không từ khoá), trừ SĐT, mã HS
 * có dấu/ngữ cảnh "mã HS", MST checksum TT105 hợp lệ (kể cả bắt đầu bằng 0 /
 * mã tỉnh 03 trùng đầu số di động — khi có từ khoá MST/mã số thuế hoặc đuôi
 * chi nhánh -XXX), ngày-giờ 14 số YYYYMMDDHHmmss. Không từ khoá MST thì đầu
 * số di động vẫn che. MST checksum sai vẫn che.
 * Nhóm: truyền `memberNames` để che tên thành viên khác; thiếu danh sách thì
 * chỉ che được tên đã biết trong phiên — không tuyên bố ẩn danh hai chiều đủ
 * cho nhóm khi chưa có memberNames.
 */

import { findPhoneSpans, isDomestic, looksLikeHsCode } from '../core/sdt.js';
import { timKhoangStk } from '../core/sanitizer.js';
import { redact } from '../core/redact.js';
import { norm } from '../packs/hs/input.js';

const PHONE_TAG = '[SĐT]';
const STK_TAG = '[STK]';
const TOKEN_TAG = '[TOKEN]';
const NAME_TAG = '[TEN_KHACH]';

/** Khoá dạng `sk-...` — `redact` chưa che (chuỗi quá ngắn, < 32 ký tự). */
const RE_TOKEN = /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{5,}\b/g;
/**
 * Ứng viên số trần 8..20 chữ số, cho phép dấu `.` / `-` giữa các nhóm.
 * (Trước đây 11..19 khiến STK 8–10 số lọt và dãy 20 số lọt; guard HS trên
 * dải 11..19 là guard chết vì looksLikeHsCode chỉ nhận 8/10 số.)
 */
const RE_SO_TRAN = /\b\d(?:[\d.\-]{6,38}\d)\b/g;
const RE_CANH_HS = /m[aãaáàảạ]\s*hs\b|hs\s*code\b|\bhs\b/i;
/**
 * Từ khoá MST / mã số thuế DÍNH LIỀN trước số (qua norm — bỏ dấu).
 * Cho chen: cong ty / cty / don vi / cua / ben / em / minh / la / : / -
 * Neo `$` — không tha SĐT đứng sau trong cùng câu chỉ vì MST xuất hiện sớm hơn.
 * Dạng tuyến tính (OZV-743): mỗi lần lặp phải khớp từ khoá không rỗng hoặc
 * dấu `:/-` — không `(?:…)?` trong `*` (tránh backtracking mũ).
 * Nhánh từ khoá dùng `\s*` (không `\s+`) để khớp `mst:cong ty` / `mst:congty`.
 */
/** Xuất để bài kiểm thời gian OZV-743 bắt backtracking mũ. */
export const RE_CANH_MST_LIEN =
  /(?:\bmst\b|ma\s*so\s*thue)(?:\s*(?:cua|ben|cong\s*ty|cty|don\s*vi|em|minh|la)|\s*[:\-])*\s*$/;
const MST_W = [31, 29, 23, 19, 17, 13, 7, 5, 3];

const MAX_PHIEN = 500;
const TEN_TOI_THIEU = 2;

const chuCai = (i) => String.fromCharCode(65 + (i % 26));
const phien = new Map();
const digitsOf = (s) => String(s ?? '').replace(/\D/g, '');

function nhanTrong(p) {
  const dung = new Set(p.nhan.values());
  for (let i = 0; i < 26; i += 1) {
    const nhan = `[KHACH_${chuCai(i)}]`;
    if (!dung.has(nhan)) return nhan;
  }
  return `[KHACH_${p.ten.length + 1}]`;
}

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
 * MST DN 10/13 số — checksum TT105/2020: hợp lệ khi `10 - (sum % 11) === d[9]`.
 * `sum % 11 === 0` → `10 - 0 = 10` không phải chữ số kiểm 0..9 → không hợp lệ.
 */
function laMstHopLe(digits) {
  const d = digitsOf(digits);
  if (d.length !== 10 && d.length !== 13) return false;
  const base = d.slice(0, 10);
  const sum = MST_W.reduce((s, w, i) => s + w * Number(base[i]), 0);
  const rem = sum % 11;
  if (rem === 0) return false;
  return (10 - rem) === Number(base[9]);
}

/** Ngày-giờ dài dạng YYYYMMDDHHmmss (vd mã đơn) — không coi là STK. */
function laNgayGioDai(digits) {
  if (digits.length !== 14) return false;
  const y = +digits.slice(0, 4);
  const mo = +digits.slice(4, 6);
  const d = +digits.slice(6, 8);
  const h = +digits.slice(8, 10);
  const mi = +digits.slice(10, 12);
  const s = +digits.slice(12, 14);
  return y >= 1990 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31
    && h <= 23 && mi <= 59 && s <= 59;
}

/** Giữ mã HS: dạng có dấu 4.2.2, hoặc số trần đứng sau ngữ cảnh "mã HS"/"HS". */
function giuMaHs(src, raw, s) {
  if (!looksLikeHsCode(raw)) return false;
  if (/[.\-]/.test(raw)) return true;
  return RE_CANH_HS.test(src.slice(Math.max(0, s - 24), s));
}

/** Có từ khoá MST / mã số thuế dính liền trước vị trí số (qua norm — bỏ dấu). */
function coCanhMst(src, s) {
  return RE_CANH_MST_LIEN.test(norm(src.slice(Math.max(0, s - 40), s)));
}

function cheSdtVaStk(src) {
  const stkUuTien = gopKhoang(timKhoangStk(src));
  // MST DN thường bắt đầu bằng 0 (tỉnh) → trùng dạng SĐT (đặc biệt mã 03 HCM).
  // Checksum TT105 đúng + (từ khoá MST/mã số thuế HOẶC đuôi chi nhánh -XXX) → giữ.
  // Không từ khoá: đầu số di động vẫn che (an toàn trước SĐT khách trần).
  const sdt = findPhoneSpans(src).filter(([s, e]) => {
    if (chongLan(s, e, stkUuTien)) return false;
    const raw = src.slice(s, e);
    const d = digitsOf(raw);
    if (laMstHopLe(d)) {
      const coChiNhanh = /^-\d{3}(?!\d)/.test(src.slice(e));
      if (coCanhMst(src, s) || coChiNhanh) return false;
      if (isDomestic(d)) return true;
      return false;
    }
    return true;
  });
  const stkTran = [];
  for (const m of src.matchAll(RE_SO_TRAN)) {
    const raw = m[0];
    const s = m.index;
    const e = s + raw.length;
    const d = digitsOf(raw);
    if (d.length < 8 || d.length > 20) continue;
    if (giuMaHs(src, raw, s)) continue;
    if (laMstHopLe(d) || laNgayGioDai(d)) continue;
    if (chongLan(s, e, stkUuTien) || chongLan(s, e, sdt)) continue;
    stkTran.push([s, e]);
  }
  const stk = gopKhoang([...stkUuTien, ...stkTran]);
  const spans = [
    ...stk.map(([s, e]) => [s, e, STK_TAG]),
    ...gopKhoang(sdt).map(([s, e]) => [s, e, PHONE_TAG])
  ].sort((a, b) => b[0] - a[0]);
  let out = src;
  for (const [s, e, tag] of spans) out = out.slice(0, s) + tag + out.slice(e);
  return out;
}

/**
 * Che tên theo dạng chuẩn hoá (`norm`: bỏ dấu + thường). Cửa sổ đúng số từ
 * của tên — tránh khớp "Khách Nguyễn Văn" khi tên là "Nguyễn Văn Ao"; ranh giới
 * token nên "An" không cắt "Anh chị"/"Ancol".
 */
function cheTen(text, ten, nhan) {
  const muc = norm(ten);
  if (muc.replace(/\s+/g, '').length < TEN_TOI_THIEU) return text;
  const nTu = muc.split(/\s+/).filter(Boolean).length;
  if (!nTu) return text;
  const tokens = [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({
    s: m.index, e: m.index + m[0].length, t: m[0]
  }));
  const spans = [];
  for (let i = 0; i <= tokens.length - nTu; i += 1) {
    const slice = tokens.slice(i, i + nTu);
    if (norm(slice.map((x) => x.t).join(' ')) === muc) {
      spans.push([slice[0].s, slice[nTu - 1].e]);
    }
  }
  let out = text;
  for (const [s, e] of spans.sort((a, b) => b[0] - a[0])) {
    out = out.slice(0, s) + nhan + out.slice(e);
  }
  return out;
}

/**
 * Ẩn danh lời khách trước khi gửi lên AI Studio.
 * @param {object} o
 * @param {string} o.text lời khách gõ (chưa che)
 * @param {string} o.customerName tên khách cần ẩn danh
 * @param {string} [o.convId] mã hội thoại — gán nhãn nhất quán trong nhóm
 * @param {boolean} [o.isGroup] hội thoại nhóm → nhãn `[KHACH_A]`…
 * @param {string[]} [o.memberNames] tên thành viên nhóm cần che thêm (thiếu thì
 *   chỉ che được tên đã gặp trong phiên)
 * @returns {{anonymizedText: string, anonymizeMap: Map<string, string>}}
 */
export function anonymizePrompt({
  text, customerName, convId, isGroup = false, memberNames = []
} = {}) {
  const src = String(text ?? '').normalize('NFKC');
  const ten = String(customerName ?? '').normalize('NFKC').trim();

  let out = redact(src).replace(RE_TOKEN, TOKEN_TAG);
  out = cheSdtVaStk(out);

  const anonymizeMap = new Map();
  const thanhVien = (Array.isArray(memberNames) ? memberNames : [])
    .map((t) => String(t ?? '').normalize('NFKC').trim())
    .filter(Boolean);
  if (!ten && !thanhVien.length) return { anonymizedText: out, anonymizeMap };

  // Đăng ký tên khách + thành viên nhóm vào cùng phiên (memberNames → isGroup).
  const p = ten
    ? phienCho(convId, ten, Boolean(isGroup) || thanhVien.length > 0)
    : phienCho(convId, thanhVien[0], true);
  for (const n of thanhVien) phienCho(convId, n, true);

  const nhan = ten ? p.nhan.get(ten) : null;
  const dsTen = [...p.nhan.keys()].sort((a, b) => b.length - a.length);
  for (const t of dsTen) out = cheTen(out, t, p.nhan.get(t));

  if (nhan && ten) {
    anonymizeMap.set(nhan, ten);
    anonymizeMap.set(NAME_TAG, ten);
  }
  if (!p.rieng && ten) {
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
 * CHỈ thay nhãn đóng khung `[...]`: chữ "Khách hàng" trong câu phải giữ nguyên.
 * @param {string} draftText bản nháp từ AI Studio
 * @param {Map<string, string>} anonymizeMap bảng nhãn → tên thật
 * @returns {string}
 */
export function deanonymizeDraft(draftText, anonymizeMap) {
  let out = String(draftText ?? '');
  if (!anonymizeMap || typeof anonymizeMap.entries !== 'function') return out;
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
