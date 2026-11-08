// Ngữ pháp số điện thoại — nguồn DUY NHẤT cho cả hồ sơ khách (core/customers.js)
// và che log (scripts/audit.mjs).
// Vì sao có tệp riêng:
//  1. core/customers.js đã sát giới hạn 300 dòng (Điều VI hiến pháp);
//  2. lõi (ghi hồ sơ) và cửa ra log (che) phải dùng CHUNG một bộ luật số
//     điện thoại — nếu mỗi bên tự viết regex, hai bên sẽ trôi lệch nhau và
//     số điện thoại lọt ra stdout của `npm run audit` (đã xảy ra ở T029).
// Nguyên tắc: CHE phải rộng hơn LÕI (che ⊇ lõi nhận) — lõi nhận cái gì thì
// cửa ra log phải che hết cái đó.

/** Chuẩn hoá một số về dạng chỉ chữ số. */
const digitsOf = (s) => String(s ?? '').replace(/\D/g, '');

/**
 * Mã HS có phải không? Mã HS dài 8 hoặc 10 số, không bắt đầu bằng `0`.
 * Nếu chuỗi có dấu tách thì nhóm số phải đúng dạng 4+2+2 (8 số) hoặc
 * 4+2+2+2 (10 số) — nhất quán với nhau, nếu không thì `8413.70.9090` (4+2+4)
 * sẽ bị coi là mã HS còn `8413.70.90.90` thì không.
 * Vì SĐT Việt Nam luôn bắt đầu bằng `0` nên luật này không loại nhầm SĐT thật.
 */
export function looksLikeHsCode(digits) {
  const raw = String(digits ?? '');
  const d = digitsOf(raw);
  if (d.length !== 8 && d.length !== 10) return false;
  if (d.startsWith('0')) return false; // SĐT Việt Nam luôn bắt đầu bằng 0
  const groups = raw.split(/[^\d]+/).filter(Boolean);
  if (groups.length > 1) {
    // Có dấu phân tách thì bắt buộc đúng nhóm 4+2+2 hoặc 4+2+2+2.
    const shape = groups.map((g) => g.length).join('+');
    if (shape !== '4+2+2' && shape !== '4+2+2+2') return false;
  }
  return true;
}

/** SĐT nội địa hợp lệ: `0` + 3|5|7|8|9 + 8 số. */
export const isDomestic = (d) => d.length === 10 && d[0] === '0' && '35789'.includes(d[1]);
/**
 * SĐT quốc tế hợp lệ: `84` + 9 số (tổng 11 số) → chuẩn hoá thành `0` + 9 số.
 * Sau khi chuẩn hoá, số đó phải có dạng SĐT di động VN giống hệt dạng nội địa
 * (`0` + 3|5|7|8|9), nếu không thì bỏ qua (VD mã HS `8413.70.90.90` chỉ có 10 số nên
 * không phải dạng quốc tế hợp lệ).
 */
export const isInternational = (d) => d.length === 11 && d.startsWith('84') && '35789'.includes(d[2]);

// Dấu phân tách giữa các nhóm số. Lõi (core/customers.js) dùng `[.\-\s]`;
// ở đây RỘNG HƠN (thêm ngoặc) vì để che thì phải an toàn hơn lõi, không được
// hẹp hơn: cái lõi nhận thì ở đây phải che hết.
// Một nơi khai lớp dấu phân tách để "chạy" và cách tách nhóm không trôi lệch nhau.
const LOP_DAU = '.\\-\\s()';
// Dấu phân tách (một hoặc nhiều dấu liên tiếp); nhóm giữ lại để tính vị trí.
const DICH = new RegExp(`([${LOP_DAU}]+)`);
// "Chạy" chữ số: các nhóm số nối lại bằng dấu cách / chấm / gạch / ngoặc.
const CHAY = new RegExp(`\\d+(?:[${LOP_DAU}]*\\d+)*`, 'g');

/**
 * Lát cắt (các nhóm số từ `i` đến `j`) có BẮT ĐẦU bằng một mã HS hợp lệ không?
 * Tồn tại cách chia lát cắt thành tiền tố sao cho `looksLikeHsCode` trả về true.
 * VD lát `84137090 912` → tiền tố `84137090` là mã HS ⇒ lát này KHÔNG phải SĐT.
 * @param {Array<{d: string}>} nhom các nhóm số của lát cắt
 */
function batDauBangMaHs(nhom, i, j) {
  for (let k = i; k <= j; k += 1) {
    if (looksLikeHsCode(nhom.slice(i, k + 1).map((g) => g.d).join('.'))) return true;
  }
  return false;
}

/**
 * LUẬT CHE (rộng hơn luật lõi `isDomestic`/`isInternational`):
 *  - 10 hoặc 11 chữ số bắt đầu bằng `0` → di động `0…` và cố định `024…`;
 *  - 11 chữ số bắt đầu bằng `84` → quốc tế; TRỪ khi chữ số thứ 3 ∉ {3,5,7,8,9}
 *    VÀ lát cắt bắt đầu bằng mã HS hợp lệ (nếu không, mã HS bị nuốt mất — lỗi QA vòng 5);
 *  - 12 chữ số bắt đầu bằng `84` → số cố định quốc tế `+84 24 1234 5678`; TRỪ khi
 *    lát cắt bắt đầu bằng mã HS hợp lệ;
 *  - 13 chữ số bắt đầu bằng `0084` → quốc tế dạng `0084`.
 * Hệ quả chấp nhận được: một số tiền dài 10 chữ số bắt đầu bằng `0`
 * (vd `0.500.000.000`) cũng bị che — che nhầm còn hơn lộ số điện thoại.
 * BẤT BIẾN: che phải phủ hết mọi thứ lõi nhận (`isDomestic`/`isInternational`).
 */
const laSoDienThoai = (d, coMaHs) => {
  if ((d.length === 10 || d.length === 11) && d[0] === '0') return true;
  if (d.length === 11 && d.startsWith('84')) {
    // Chữ số thứ 3 ∉ {3,5,7,8,9} ⇒ lõi KHÔNG nhận là SĐT; nếu lát cắt còn bắt
    // đầu bằng mã HS hợp lệ thì đây là mã HS đứng cạnh số → không che.
    if (coMaHs && !'35789'.includes(d[2])) return false;
    return true;
  }
  if (d.length === 12 && d.startsWith('84')) return !coMaHs;
  if (d.length === 13 && d.startsWith('0084')) return true;
  return false;
};

/** Gộp các khoảng chồng lấn / liền nhau thành các khoảng không chồng, tăng dần. */
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
 * Tìm các khoảng `[từ, đến)` trong `src` (đã chuẩn hoá NFKC) là số điện thoại.
 * Cách làm bám sát cách lõi quét (core/customers.js) nhưng rộng hơn:
 *  - lớp dấu phân tách rộng hơn lõi (thêm ngoặc);
 *  - thu thập MỌI lát khớp chứ không chỉ lát đầu tiên (với `0084 912 345 678`
 *    cả lát 10 chữ số lẫn lát 13 chữ số đều là số điện thoại — gộp cả hai
 *    thì mới che trọn vẹn, không sót đuôi);
 *  - khoảng che gồm cả dấu phân tách ở giữa, để không sót ký tự lạ lẫn vào.
 */
function spansTrong(src) {
  const spans = [];
  for (const c of src.matchAll(CHAY)) {
    const run = c[0];
    const goc = c.index;
    const nhom = [];
    let vi = 0;
    for (const phan of run.split(DICH)) {
      if (phan === undefined) continue;
      if (/^\d+$/.test(phan)) nhom.push({ s: goc + vi, e: goc + vi + phan.length, d: phan });
      vi += phan.length;
    }
    for (let i = 0; i < nhom.length; i += 1) {
      for (let j = i; j < nhom.length; j += 1) {
        let d = '';
        for (let k = i; k <= j; k += 1) d += nhom[k].d;
        if (d.length > 13) break; // số dài hơn 13 chữ số không phải số điện thoại
        // Chỉ lát bắt đầu bằng `84` mới cần biết nó có bắt đầu bằng mã HS không.
        const coMaHs = (d.length === 11 || d.length === 12) && d.startsWith('84')
          && batDauBangMaHs(nhom, i, j);
        if (laSoDienThoai(d, coMaHs)) {
          spans.push([nhom[i].s, nhom[j].e]);
          continue; // vẫn thử lát dài hơn (lát 13 chữ số của `0084…`)
        }
        // Không khớp luật che → thử lát dài hơn (giống hệt `continue` của lõi).
        // Lát này có phải mã HS (8/10 số, không bắt đầu bằng 0) thì cũng vậy:
        // mã HS không khớp luật che nên vốn không bị che; hai nhánh cùng dẫn tới
        // "thử lát dài hơn" — giữ đúng hành vi lõi.
        if (looksLikeHsCode(nhom.slice(i, j + 1).map((g) => g.d).join('.'))) continue;
      }
    }
  }
  // "+84 …": dấu `+` là dấu mốc quốc tế — che luôn để stdout không còn "84".
  for (const sp of spans) {
    const [s] = sp;
    if (s > 0 && src[s - 1] === '+' && src.startsWith('84', s)) sp[0] = s - 1;
  }
  return gopKhoang(spans);
}

/**
 * Các khoảng `[từ, đến)` trong `text` là số điện thoại cần che.
 * @param {string} text
 * @returns {Array<[number, number]>}
 */
export function findPhoneSpans(text) {
  return spansTrong(String(text ?? '').normalize('NFKC'));
}

/**
 * Che mọi số điện thoại trong văn bản bằng `***`; trả về văn bản đã che.
 * Chuẩn hoá NFKC TRƯỚC khi quét để chữ số toàn rộng (`０９１２…`) cũng bị che.
 */
export function cheSdt(text) {
  const src = String(text ?? '').normalize('NFKC');
  const spans = spansTrong(src);
  if (!spans.length) return src;
  let ra = '';
  let cur = 0;
  for (const [s, e] of spans) {
    ra += src.slice(cur, s) + '***';
    cur = e;
  }
  return ra + src.slice(cur);
}
