// packs/hs/input.js — đọc thông tin người dùng gõ trên Zalo thành các trường có tên.
// Hỗ trợ cả dạng có nhãn ("Mã HS: 84137090", "Tên hàng = máy bơm") lẫn gõ tự do.

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();

/** Gộp khoảng trắng + cắt đầu/cuối (giữ nguyên dấu). Dùng chung cho lớp nhận dạng và lớp hồ sơ. */
export const dai = (s) => String(s || '').replace(/\s+/g, ' ').trim();

export const HS8 = /(?<!\d)(\d{4})[.\s]?(\d{2})[.\s]?(\d{2})(?!\d)/;
export const HS_ANY = /(?<!\d)\d{4}(?:[.\s]?\d{2}){0,2}(?!\d)/g;
// Số hiệu văn bản: 57/2022/NĐ-CP, 38/2015/TT-BTC, 1810/TB-TCHQ, 121/2025/TT-BTC
export const SO_HIEU = /\b\d{1,5}\/(?:\d{4}\/)?[A-ZĐa-zđ]{1,6}(?:-[A-ZĐa-zđ]{1,10}){0,3}\b/g;

/** Mã HS 8 số đầu tiên trong chuỗi (bỏ dấu chấm/cách). */
export function firstHs8(s) {
  const m = String(s || '').match(HS8);
  return m ? m[1] + m[2] + m[3] : null;
}

export function allHs8(s) {
  const out = [];
  const re = new RegExp(HS8.source, 'g');
  let m;
  while ((m = re.exec(String(s || '')))) out.push(m[1] + m[2] + m[3]);
  return out;
}

export function soHieuList(s) {
  return [...new Set((String(s || '').match(SO_HIEU) || []).map((x) => x.replace(/\s/g, '')))]
    .filter((x) => /[A-Za-zĐđ]/.test(x));
}

/**
 * fields: [{ key, nhan: ['mã hs', 'hs'] }] → { values: {key: str}, conLai: 'chữ không có nhãn' }
 * Nhận dòng "nhãn: giá trị" / "nhãn = giá trị" / "nhãn - giá trị".
 */
export function parseLabeled(text, fields) {
  const values = {};
  const rest = [];
  const aliases = [];
  for (const f of fields) for (const a of [f.key, ...(f.nhan || [])]) aliases.push([norm(a), f.key]);
  aliases.sort((a, b) => b[0].length - a[0].length);

  for (const rawLine of String(text || '').split(/\r?\n|;(?=\s*[^\d])/)) {
    const line = rawLine.trim().replace(/^[-•*+]\s*/, '');
    if (!line) continue;
    const m = line.match(/^([^:=]{1,40}?)\s*[:=]\s*(.+)$/);
    let hit = null;
    if (m) {
      const label = norm(m[1]);
      hit = aliases.find(([a]) => label === a || label.startsWith(`${a} `) || label.endsWith(` ${a}`));
      if (hit && !(hit[1] in values)) { values[hit[1]] = m[2].trim(); continue; }
    }
    rest.push(line);
  }
  return { values, conLai: rest.join('\n').trim() };
}

/** Mã nước 2 chữ in hoa đứng riêng (CN, JP, KR…) hoặc tên nước thường gặp. */
const NUOC = { 'trung quoc': 'CN', tq: 'CN', china: 'CN', 'nhat ban': 'JP', nhat: 'JP', 'han quoc': 'KR', han: 'KR',
  'dai loan': 'TW', 'thai lan': 'TH', 'my': 'US', 'hoa ky': 'US', duc: 'DE', 'an do': 'IN', 'viet nam': 'VN', 'malaysia': 'MY', 'indonesia': 'ID' };

export function countryCode(s) {
  const t = String(s || '').trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  const n = norm(t).replace(/^(xuat xu|xx|origin)\s*/, '');
  if (NUOC[n]) return NUOC[n];
  const m = t.match(/(?:^|\s)([A-Z]{2})(?:\s|$)/);
  return m ? m[1] : null;
}

export function findCountryInText(s) {
  const n = norm(s);
  for (const [k, v] of Object.entries(NUOC)) if (new RegExp(`(^|\\s)(xuat xu |tu |hang )?${k}(\\s|$|,)`).test(n)) return v;
  const m = String(s || '').match(/(?:^|\s)(CN|JP|KR|TW|TH|US|DE|IN|MY|ID|VN)(?=\s|$|,)/);
  return m ? m[1] : null;
}
