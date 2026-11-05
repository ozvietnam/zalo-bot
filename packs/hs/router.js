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

  if (/^\/?(start|help|menu|goi|cac goi|huong dan|hd|\?)$/.test(n) || /^(hi|hello|xin chao|chao|alo)( bot| ban)?[!. ]*$/.test(n)) {
    return { kind: 'menu' };
  }
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
  return { kind: 'chay', pkg: autoPick(t, pkgs), text: t, tuDong: true };
}

/** Chế độ tự động: đoán gói phù hợp nhất. */
export function autoPick(text, pkgs) {
  const by = (id) => pkgs.find((p) => p.id === id);
  const n = norm(text);
  const onlyCode = /^[\d.\s]{4,14}(\s+[a-z]{2})?$/i.test(text.trim());
  if (/(giai trinh|ap ma|tham van|tranh chap)/.test(n) && by('giai-trinh')) return by('giai-trinh');
  if (/(nhan hieu|thuong hieu|so huu tri tue|shtt|hang gia|brand)/.test(n) && by('shtt')) return by('shtt');
  if (soHieuList(text).length && by('phap-luat')) return by('phap-luat');
  if (/(chu giai|tien le|hieu luc|van ban|thong tu|nghi dinh)/.test(n) && by('phap-luat')) return by('phap-luat');
  if (/(soat|kiem tra mo ta|to khai)/.test(n) && firstHs8(text) && by('kiem-tra')) return by('kiem-tra');
  if (/(mo ta khai|viet mo ta|soan mo ta)/.test(n) && by('mo-ta')) return by('mo-ta');
  if (onlyCode && by('thue-thu-tuc')) return by('thue-thu-tuc');
  if (/^(thue|thu tuc)\b/.test(n) && by('thue-thu-tuc')) return by('thue-thu-tuc');
  return by('phan-loai') || by('thue-thu-tuc') || pkgs[0];
}
