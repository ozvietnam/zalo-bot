// packs/hs/router.js — quyết định tin nhắn đi vào gói nào.
import { norm, firstHs8, soHieuList } from './input.js';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * → { kind: 'ignore' | 'menu' | 'chon' | 'tu-dong' | 'chay' | 'ket-qua', so?, pkg?, maLuot? }
 */
export function route(text, { session = {}, pkgs = [] } = {}) {
  const t = String(text || '').trim();
  if (!t) return { kind: 'ignore' };
  const n = norm(t);

  if (/^\/?(start|help|menu|goi|cac goi|huong dan|hd|\?)$/.test(n)) return { kind: 'menu' };
  // Chào hỏi: lời chào ngắn + menu RÚT GỌN. Dán menu đầy đủ (900+ ký tự) vào câu chào là ấn tượng
  // xấu nhất của bot — khách chỉ muốn biết "bot làm được gì", không cần đọc 7 mô tả dài.
  if (/^(hi|hello|xin chao|chao|alo)( bot| ban)?[!. ]*$/.test(n)) return { kind: 'chao' };
  // Mở lại bản phân tích đầy đủ của lượt phân loại gần nhất (bản chốt ngắn đã thay bản dài trong tin chính).
  if (/^(chi tiet|xem chi tiet|chi tiet day du|chi tiet day)$/.test(n)) return { kind: 'chi-tiet' };
  // Chọn gói: "7", "gói 7", "chọn gói 7", "chọn gói số 7", "dùng gói 7", "chọn 7", "gói 7: <nội dung>"
  const CHON = /^(?:(?:chon|dung|vao|mo|sang|chuyen)\s+)?(?:goi\s*(?:so\s*)?)?(\d)(?=$|[\s:.,\-])/;
  const chon = n.match(CHON);
  const coChuGoi = /^(?:(?:chon|dung|vao|mo|sang|chuyen)\s+)?goi\b|^(?:chon|dung)\s+\d/.test(n);
  if (chon && (coChuGoi || /^\d$/.test(n))) {
    const so = Number(chon[1]);
    if (so === 0) return { kind: 'tu-dong' };
    const pkg = pkgs.find((p) => p.so === so);
    // Phần sau lệnh chọn gói (nếu có) → chạy luôn trong gói đó
    const sau = t.replace(/^\s*(?:(?:ch[oọ]n|d[uù]ng|v[aà]o|m[oở]|sang|chuy[eể]n)\s+)?(?:g[oó]i\s*(?:s[oố]\s*)?)?\d\s*[:.,\-]?\s*/i, '').trim();
    if (pkg) return sau ? { kind: 'chay', pkg, text: sau, chon: true } : { kind: 'chon', pkg };
    return { kind: 'menu' };
  }
  const kq = t.match(UUID_RE);
  if (kq && /^(ket qua|kq|xem|hoi)\b/.test(n)) return { kind: 'ket-qua', maLuot: kq[0] };

  const cur = session.goi && pkgs.find((p) => p.so === session.goi);
  if (cur) return { kind: 'chay', pkg: cur, text: t };
  const ap = chonGoi(t, pkgs);
  // `tuDong` = "hãy hỏi não". Câu CHỈ CÓ mã HS thì não không thêm được gì (gói 2 tự tìm mã và nước)
  // nên khỏi hỏi: mỗi lượt là một lượt Gemini + chờ (chi phí + độ trễ cho tin phổ biến nhất).
  return { kind: 'chay', pkg: ap.pkg, text: t, tuDong: !ap.chac };
}

/**
 * Chọn gói theo từ khoá. Kèm `chac`: true = bộ dò đã đủ chắc (chỉ có mã HS), không cần hỏi não.
 * `autoPick` giữ nguyên chữ ký cũ (trả về gói) cho nơi gọi khác.
 */
export function chonGoi(text, pkgs) {
  const by = (id) => pkgs.find((p) => p.id === id);
  const n = norm(text);
  const onlyCode = /^[\d.\s]{4,14}(\s+[a-z]{2})?$/i.test(text.trim());
  // Từ khoá phải đứng thành TỪ (\b): đã bỏ dấu thì "nhập máy" = "nh-ap ma-y" sẽ khớp nhầm "ap ma" (áp mã).
  if (/\b(giai trinh|ap ma|tham van|tranh chap)\b/.test(n) && by('giai-trinh')) return { pkg: by('giai-trinh'), chac: false };
  if (/\b(nhan hieu|thuong hieu|so huu tri tue|shtt|hang gia|brand)\b/.test(n) && by('shtt')) return { pkg: by('shtt'), chac: false };
  if (soHieuList(text).length && by('phap-luat')) return { pkg: by('phap-luat'), chac: false };
  if (/\b(chu giai|tien le|hieu luc|van ban|thong tu|nghi dinh)\b/.test(n) && by('phap-luat')) return { pkg: by('phap-luat'), chac: false };
  if (/\b(soat|kiem tra mo ta|to khai)\b/.test(n) && firstHs8(text) && by('kiem-tra')) return { pkg: by('kiem-tra'), chac: false };
  if (/\b(mo ta khai|viet mo ta|soan mo ta)\b/.test(n) && by('mo-ta')) return { pkg: by('mo-ta'), chac: false };
  // CHỈ có mã (kèm nước tuỳ chọn) → gói 2 tự bóc mã và xuất xứ: não không thêm được gì.
  if (onlyCode && by('thue-thu-tuc')) return { pkg: by('thue-thu-tuc'), chac: true };
  if (/^(thue|thu tuc|thue suat|bao nhieu %|bao nhieu phan tram)\b/.test(n) && by('thue-thu-tuc')) return { pkg: by('thue-thu-tuc'), chac: false };
  return { pkg: by('phan-loai') || by('thue-thu-tuc') || pkgs[0], chac: false };
}

/** Chế độ tự động: đoán gói phù hợp nhất. */
export function autoPick(text, pkgs) {
  return chonGoi(text, pkgs).pkg;
}
