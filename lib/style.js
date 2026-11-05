// lib/style.js — lớp định dạng tin nhắn Zalo (rich text qua text_styles).
// Vì sao không dùng parse_mode markdown? Dữ liệu từ Cổng OZ là chữ tự do (có thể chứa *, _, #, |)
// nên markdown sẽ vỡ hiển thị. Ở đây dùng thẻ riêng {b}…{/b} và đổi thành text_styles:
// định dạng theo khoảng ký tự (UTF-16) nên không đụng vào nội dung, chỉ bỏ thẻ.
// Thẻ lạ / thẻ không khớp / không có thẻ đóng → giữ nguyên chữ, không mất dữ liệu.

/** Mã định dạng Zalo: b/i/u/s, font f_*, màu c_*, danh sách lst_*, thụt lề ind_*. */
const CODES = {
  b: 'b', bold: 'b', i: 'i', italic: 'i', u: 'u', underline: 'u', s: 's', strike: 's',
  red: 'c_db342e', orange: 'c_f27806', yellow: 'c_f7b503', green: 'c_15a85f', black: 'c_050a19',
  big: 'f_18', small: 'f_13', medium: 'f_15',
  list: 'lst_1', olist: 'lst_2', ind: 'ind_1', ind1: 'ind_1', ind2: 'ind_2', ind3: 'ind_3',
};

const TH_TAG = /\{(\/?)([a-zA-Z][a-zA-Z0-9]*)\}/g;

/** Một lần quét: tìm cặp thẻ mở/đóng hợp lệ, ghi vị trí trong text GỐC. */
function findSpans(src) {
  const spans = [];      // { openStart, openEnd, closeStart, closeEnd, code }
  const stack = [];
  TH_TAG.lastIndex = 0;
  let m;
  while ((m = TH_TAG.exec(src))) {
    const [full, slash, tag] = m;
    const code = CODES[tag.toLowerCase()];
    if (!code) continue;                       // thẻ không hỗ trợ → bỏ qua, giữ nguyên chữ
    if (slash) {
      // thẻ đóng: khớp với thẻ mở cùng loại trên đỉnh ngăn xếp
      let idx = -1;
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i].code === code) { idx = i; break; }
      if (idx < 0) continue;                   // thẻ đóng lạ → giữ nguyên
      const open = stack[idx];
      stack.length = idx;                      // bỏ các thẻ mở lồng bên trong (không khớp)
      spans.push({ ...open, closeStart: m.index, closeEnd: m.index + full.length, code });
    } else {
      stack.push({ openStart: m.index, openEnd: m.index + full.length, code });
    }
  }
  return spans;
}

/**
 * Văn bản có thẻ định dạng → { text, text_styles }.
 * text_styles: [{ start, len, st: [...] }] — start/len tính theo UTF-16 code unit.
 * Thẻ lồng nhau cùng đoạn → gộp mã định dạng của các cặp vào một run (Zalo không hỗ trợ chồng lấp).
 */
export function rich(src) {
  const s = String(src ?? '');
  const spans = findSpans(s);
  if (!spans.length) return { text: s, text_styles: [] };

  // Các đoạn bị gỡ thẻ: sắp xếp theo vị trí, loại trùng lặp
  const cuts = [];
  for (const sp of spans) {
    cuts.push([sp.openStart, sp.openEnd], [sp.closeStart, sp.closeEnd]);
  }
  cuts.sort((a, b) => a[0] - b[0]);

  // Tính text đã gỡ thẻ và đồng thời lập bảng ánh xạ vị trí gốc → vị trí mới.
  // Vị trí gốc p (p = đầu thẻ hoặc cuối thẻ) → vị trí tương ứng trong text đã gỡ thẻ.
  // Nội dung trước thẻ được giữ nguyên; bản thân thẻ biến mất (độ dài 0).
  let out = '';
  let cursor = 0;
  const map = new Map();
  for (const [a, b] of cuts) {
    if (a < cursor) continue;                   // span trùng (không xảy ra: các cặp thẻ không chồng nhau)
    out += s.slice(cursor, a);
    map.set(a, out.length);
    map.set(b, out.length);
    cursor = b;
  }
  out += s.slice(cursor);

  // Tạo runs: mỗi cặp thẻ → đoạn text tương ứng
  const runs = [];
  for (const sp of spans) {
    const start = map.get(sp.openEnd);
    const end = map.get(sp.closeStart);
    if (start == null || end == null || end <= start) continue;
    runs.push({ start, len: end - start, st: [sp.code] });
  }

  // Gộp các run có vùng chồng lấn (thẻ lồng nhau) → một run với nhiều mã
  runs.sort((a, b) => a.start - b.start || b.len - a.len);
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r.start < last.start + last.len) {
      // vùng chồng → gộp thành vùng bao trùm, hợp nhất mã định dạng
      const end = Math.max(last.start + last.len, r.start + r.len);
      last.len = end - last.start;
      for (const c of r.st) if (!last.st.includes(c)) last.st.push(c);
    } else {
      merged.push({ ...r, st: [...r.st] });
    }
  }
  return { text: out, text_styles: merged };
}

/** Bỏ thẻ định dạng, giữ nguyên chữ — để test đọc như người dùng thấy trên Zalo. */
export function plain(src) {
  return rich(src).text;
}

/** Thẻ in đậm. */
export const b = (s) => `{b}${s}{/b}`;

/** Thẻ màu: color('green', '8413.70.90'). */
export const color = (name, s) => `{${name}}${s}{/${name}}`;

/** In đậm + màu (dùng cho tiêu đề khối). */
export const strong = (name, s) => `{b}{${name}}${s}{/${name}}{/b}`;

/**
 * Cân bằng thẻ định dạng trong một đoạn text (dùng khi cắt tin).
 * - Bỏ phần thẻ bị cắt dở ở cuối (vd "{re" còn lại).
 * - Thêm thẻ đóng cho mọi thẻ còn mở, theo đúng thứ tự ngược lại.
 * Trả về chuỗi đã cân bằng (vẫn chứa thẻ).
 */
export function balanceTags(src) {
  let s = String(src ?? '');
  // Bỏ thẻ cắt dở ở cuối: "{abc" không có "}" → cắt bỏ từ "{" gần nhất.
  const duoi = s.match(/\{[a-zA-Z0-9]*$/);
  if (duoi) s = s.slice(0, duoi.index);

  const stack = [];
  const re = /\{(\/?)([a-zA-Z][a-zA-Z0-9]*)\}/g;
  let m;
  while ((m = re.exec(s))) {
    const [, slash, tag] = m;
    if (!CODES[tag.toLowerCase()]) continue;
    if (slash) {
      const i = stack.map((x) => x.tag).lastIndexOf(tag);
      if (i >= 0) stack.length = i;
    } else {
      stack.push({ tag });
    }
  }
  for (let i = stack.length - 1; i >= 0; i--) s += `{/${stack[i].tag}}`;
  return s;
}

/**
 * Chia tin giàu định dạng thành các đoạn ≤ max ký tự, giữ đúng text_styles theo từng đoạn.
 * Ưu tiên cắt ở dòng trống → dòng → khoảng trắng; không cắt giữa một run định dạng.
 * Mọi vị trí đều tính theo text GỐC (kể cả phần khoảng trắng bị trim) → định dạng không lệch.
 */
export function splitRich({ text, text_styles = [] }, max = 2000) {
  const s = String(text ?? '');
  if (!s.trim()) return [];
  if (s.length <= max) return [{ text: s, text_styles }];

  const out = [];
  let pos = 0;                                 // vị trí hiện tại trong text gốc
  while (s.length - pos > max) {
    const rest = s.slice(pos);
    let cut = rest.lastIndexOf('\n\n', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) cut = max;
    // không cắt giữa một run định dạng: lùi về đầu run nếu cắt vào giữa
    const absCut = pos + cut;
    const inside = text_styles.find((r) => absCut > r.start && absCut < r.start + r.len);
    if (inside) cut = Math.max(0, inside.start - pos);
    if (cut <= 0) cut = max;

    const head = rest.slice(0, cut);
    const lead = head.length - head.trimStart().length;   // khoảng trắng đầu bị trim
    const body = head.trim();
    out.push({ text: body, text_styles: stylesIn(text_styles, pos + lead, body.length) });

    pos += cut;
    while (pos < s.length && /\s/.test(s[pos])) pos++;   // bỏ khoảng trắng đầu đoạn kế tiếp
  }
  if (s.slice(pos).trim()) {
    const body = s.slice(pos).trim();
    out.push({ text: body, text_styles: stylesIn(text_styles, pos, body.length) });
  }
  return out.filter((p) => p.text);
}

/** Các run định dạng nằm trong đoạn [from, from+len) → chuyển về tọa độ của đoạn đó. */
function stylesIn(runs, from, len) {
  const to = from + len;
  return runs
    .filter((r) => r.start < to && r.start + r.len > from)
    .map((r) => {
      const s = Math.max(r.start, from);
      const e = Math.min(r.start + r.len, to);
      return { start: s - from, len: e - s, st: [...r.st] };
    })
    .filter((r) => r.len > 0);
}
