// packs/hs/can-cu.js — căn cứ pháp lý trong câu trả lời + máy kiểm chống bịa số hiệu văn bản (issue #168, phần 2).
//
// Đặc tả: issue #136 bình luận "Bộ kịch bản trả lời" mục B (luật trích pháp lý) và mục E (lệch canCu/canCuChiTiet).
//   1. CHỈ trích số hiệu do Cổng trả trong CHÍNH lượt đó (`canCuChiTiet`, `vatReduction.legalBasis`,
//      `vanBanQuanLy`, `policyLines.soHieu`, `tbTchqNumber`…). Không có thì không nêu. Cấm bịa.
//   2. Văn bản HET_HIEU_LUC*, CHUA_XAC_MINH, hoặc chính sách `OUTDATED_BASIS` → không làm căn cứ chính.
//   3. Tin đầu tối đa 3 căn cứ; khách gõ "căn cứ" thì đưa đủ danh sách kèm tình trạng + nguồn.
//   4. Ưu đãi FTA luôn kèm điều kiện C/O hợp lệ + đạt quy tắc xuất xứ.
//   5. `canCu` (cũ) lệch `canCuChiTiet` → dùng `canCuChiTiet` (có ngày hiệu lực).
// Máy kiểm (`soHieuLa`, `chanBia`) là chốt cuối: mọi số hiệu trong tin gửi khách phải có trong dữ liệu
// nguồn của lượt (kết quả Cổng, lời khách, căn cứ đã lưu từ Cổng). Dùng chung cho gói, eval và qa-that.

// "26/2023/NĐ-CP", "36/2026/TT-BKHCN", "05/2007/QH12", "15/2023/QĐ-TTg", "29/2025/TT-BKHCN-PL2"
const DU_RE = /(?<![\p{L}\d/])(\d{1,5})\/(\d{4})\/(\p{Lu}[\p{L}\d]*(?:-[\p{L}\d]+)*)/gu;
// Không có năm: "5676/TCHQ-TXNK", "1810/TB-TCHQ", "2711/QĐ-BKHCN"
const CV_RE = /(?<![\p{L}\d/])(\d{1,6})\/(\p{Lu}{2,6}(?:-\p{Lu}[\p{L}\d]{0,9}){0,3})(?![\p{L}\d]|\/\d)/gu;
// Viết tắt không đuôi: "NĐ 26/2023", "TT 38/2015", "Thông tư số 38/2015"
const NGAN_RE = /(?:NĐ|TT|QĐ|NQ|CV|Nghị định|Thông tư|Quyết định|Nghị quyết|Công văn)\s*(?:số\s*)?(\d{1,5})\/(\d{4})(?![/\d])/gu;

const so0 = (s) => String(Number(s));
const kieu = (s) => String(s).toUpperCase().replace(/\s+/g, '');

/** Mọi số hiệu văn bản trong một đoạn chữ → [{ raw, khoa }]. `khoa` so sánh được giữa các cách viết. */
export function soHieuTrong(text) {
  const s = String(text ?? '');
  const out = [];
  const daLay = [];
  for (const m of s.matchAll(DU_RE)) { out.push({ raw: m[0], khoa: `${so0(m[1])}/${m[2]}/${kieu(m[3]).replace(/-PL\d+$/, '')}` }); daLay.push([m.index, m.index + m[0].length]); }
  const trong = (i) => daLay.some(([a, b]) => i >= a && i < b);
  for (const m of s.matchAll(CV_RE)) if (!trong(m.index)) out.push({ raw: m[0], khoa: `${so0(m[1])}/${kieu(m[2])}` });
  for (const m of s.matchAll(NGAN_RE)) {
    const i = m.index + m[0].indexOf(m[1]);
    if (!trong(i)) out.push({ raw: m[0], khoa: `${so0(m[1])}/${m[2]}` });
  }
  return out;
}

/** Tập khoá số hiệu có trong các nguồn (đi qua mọi chuỗi lồng nhau). Khoá đủ sinh thêm khoá ngắn "số/năm". */
export function tapSoHieu(...nguon) {
  const set = new Set();
  const walk = (v, sau = 0) => {
    if (sau > 12 || v == null) return;
    if (typeof v === 'string') {
      for (const { khoa } of soHieuTrong(v)) {
        set.add(khoa);
        const p = khoa.split('/');
        if (p.length === 3) set.add(`${p[0]}/${p[1]}`);
      }
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, sau + 1));
    else if (typeof v === 'object') Object.values(v).forEach((x) => walk(x, sau + 1));
  };
  nguon.forEach((n) => walk(n));
  return set;
}

/** Số hiệu trong `text` KHÔNG có trong nguồn (chữ thô) — rỗng là đạt. */
export function soHieuLa(text, ...nguon) {
  const co = tapSoHieu(...nguon);
  return [...new Set(soHieuTrong(text).filter(({ khoa }) => !co.has(khoa)).map((x) => x.raw))];
}

/**
 * Chốt chặn bịa: bỏ những DÒNG có số hiệu không có trong nguồn (thường là chữ của não AI).
 * → { text, la } — `la` = số hiệu đã chặn (để ghi log). Không có số lạ thì trả nguyên văn.
 * `mau`: khối chữ tĩnh được miễn ĐÚNG CHỖ nó xuất hiện nguyên văn (mẫu nhập liệu của gói, ví dụ
 * "57/2022/NĐ-CP" trong mẫu gói 5) — mẫu là chỉ dẫn cách gõ, không phải khẳng định pháp lý. Miễn theo
 * chỗ chứ không miễn theo số: não AI viết lại đúng số trong mẫu ở câu khác vẫn bị chặn.
 */
export function chanBia(text, nguon = [], { mau = [] } = {}) {
  const goc = String(text ?? '');
  const boMau = mau.filter(Boolean).reduce((t, m) => t.split(m).join('\n'), goc);
  const la = soHieuLa(boMau, ...nguon);
  if (!la.length) return { text, la };
  const dongMau = new Set(mau.filter(Boolean).flatMap((m) => String(m).split('\n')));
  const dong = goc.split('\n').filter((d) => dongMau.has(d) || !la.some((x) => d.includes(x)));
  return { text: dong.join('\n').replace(/\n{3,}/g, '\n\n').trim(), la };
}

// ———————————————————————————— trích căn cứ từ dữ liệu Cổng ————————————————————————————

const HONG = /^(HET_HIEU_LUC|CHUA_XAC_MINH|BI_BAI_BO|BI_THAY_THE)/;
const duLieu = (r) => (r && r.ok !== false && !r.isError ? (r.data ?? r) : null);
const dongThue = (d) => (d ? (Array.isArray(d.results) ? d.results[0] : d) : null);
const ngayVN = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : null; };
const goc = (s) => String(s || '').trim().replace(/-PL\d+$/i, '');

/**
 * Căn cứ của một kết quả `tra_thue`: { mfn, tt, vat, fta, canDoiChieu } — mỗi mục { so, viec, hieuLuc }.
 * Ưu tiên `canCuChiTiet` (mục E): `canCu` cũ chỉ dùng khi `canCuChiTiet` thiếu mục đó.
 */
export function canCuThue(thue) {
  const t = dongThue(duLieu(thue));
  if (!t || !t.hsCode) return null;
  const cc = t.canCuChiTiet && typeof t.canCuChiTiet === 'object' ? t.canCuChiTiet : {};
  const muc = (k, viec) => {
    const chiTiet = cc[k]?.vanBan ? String(cc[k].vanBan).trim() : null;
    const cu = chiTiet ? null : soHieuTrong(t.canCu?.[k]?.vanBan)[0]?.raw.replace(/^(NĐ|TT|QĐ)\s*/, '');
    const so = chiTiet || cu;
    return so ? { so, viec, hieuLuc: chiTiet ? (cc[k].hieuLuc || null) : null } : null;
  };
  const giam = t.vatReduction?.reduced && t.vatReduction?.legalBasis
    ? { so: String(t.vatReduction.legalBasis).trim(), viec: `VAT ${t.vatReduction.rate}%${ngayVN(t.vatReduction.validUntil) ? ` tới hết ${ngayVN(t.vatReduction.validUntil)}` : ''}`, hieuLuc: null }
    : null;
  return {
    mfn: muc('mfn', 'thuế NK ưu đãi'),
    tt: muc('tt', 'thuế NK thông thường'),
    vat: giam || muc('vat', 'VAT'),
    fta: muc('acfta', 'ACFTA, cần C/O mẫu E hợp lệ'),
    canDoiChieu: t.tariff?.freshness === 'DUE',
  };
}

/**
 * Căn cứ chính sách (`tra_thu_tuc_nhap_khau`, hoặc phần chính sách đi kèm `tra_thue`):
 * → [{ so, viec, tinhTrang, dung, chuaDoiChieu, nguon }]. `dung` = được làm căn cứ chính (còn hiệu lực đã kiểm).
 */
export function canCuChinhSach(...ketQua) {
  const vb = new Map();
  const them = (so, patch) => {
    const k = goc(so);
    if (!k) return;
    vb.set(k, { so: k, viec: null, tinhTrang: null, chuaDoiChieu: false, nguon: null, ...vb.get(k), ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v != null && v !== false)) });
  };
  for (const r of ketQua) {
    const d = duLieu(r);
    if (!d || typeof d !== 'object') continue;
    for (const v of Array.isArray(d.vanBanQuanLy) ? d.vanBanQuanLy : []) {
      const h = v?.hieuLuc && typeof v.hieuLuc === 'object' ? v.hieuLuc : null;
      them(h?.soHieu || v?.soHieu || (typeof v === 'string' ? v : null), { tinhTrang: h?.tinhTrang || null, nguon: h?.url || null, ten: h?.ten || null });
    }
    for (const c of Array.isArray(d.legalBasisRegistry?.citations) ? d.legalBasisRegistry.citations : []) {
      if (c?.found !== false) them(c?.soHieu, { tinhTrang: c?.tinhTrang || null, nguon: c?.url || null, ten: c?.ten || null });
    }
    for (const l of Array.isArray(d.hsListings) ? d.hsListings : []) {
      them(l?.soHieu, { tinhTrang: l?.tinhTrang || null, chuaDoiChieu: l?.table?.verified === false, phuLuc: l?.phuLuc || null, nguon: l?.url || null });
    }
    const cs = d.chinhSach && typeof d.chinhSach === 'object' ? d.chinhSach : d;
    for (const p of Array.isArray(cs.policyLines) ? cs.policyLines : []) {
      if (!p?.soHieu) continue;
      const viec = String(p.text || '').replace(/\s*[—–-]\s*[\d/\p{L}-]+$/u, '').trim() || null;
      them(p.soHieu, { viec: vb.get(goc(p.soHieu))?.viec || viec, mucDo: p.level || null,
        chuaDoiChieu: /chưa (?:xác minh|đối chiếu)/i.test(String(p.reasonVi || '')) });
    }
  }
  const cu = ketQua.some((r) => (duLieu(r)?.chinhSach ?? duLieu(r))?.policyBasisReview?.status === 'OUTDATED_BASIS');
  return [...vb.values()].map((x) => ({ ...x, dung: x.tinhTrang === 'CON_HIEU_LUC' && !HONG.test(x.tinhTrang || ''), cu }));
}

/** Căn cứ của tiền lệ phân loại (`tra_tien_le`): số thông báo TB-TCHQ + năm. */
export function canCuTienLe(tienLe) {
  const d = duLieu(tienLe);
  const items = d?.items || d?.results || d?.precedents || [];
  return (Array.isArray(items) ? items : []).map((it) => {
    const so = it?.tbTchqNumber || it?.soThongBao || it?.soHieu;
    return so ? { so: String(so).trim(), viec: 'tiền lệ phân loại', nam: it?.year ?? null, dung: true, nguon: it?.url || it?.nguon || null } : null;
  }).filter(Boolean);
}

/**
 * Danh sách căn cứ đầy đủ (lệnh "căn cứ"): mỗi dòng số hiệu + việc + tình trạng hiệu lực + nguồn.
 * Văn bản không dùng được vẫn liệt kê (khách được biết) nhưng ghi rõ vì sao không làm căn cứ chính.
 */
export function danhSachDayDu({ thue = null, chinhSach = [], tienLe = [] } = {}) {
  const l = [];
  const tt = (x) => {
    if (x.tinhTrang === 'CON_HIEU_LUC') return 'còn hiệu lực';
    if (/^HET_HIEU_LUC_MOT_PHAN/.test(x.tinhTrang || '')) return 'hết hiệu lực một phần — không làm căn cứ chính';
    if (/^HET_HIEU_LUC/.test(x.tinhTrang || '')) return 'hết hiệu lực — không làm căn cứ chính';
    if (x.tinhTrang === 'CHUA_XAC_MINH') return 'Cổng chưa xác minh hiệu lực — không làm căn cứ chính';
    return 'Cổng chưa kiểm hiệu lực';
  };
  if (thue) {
    for (const c of [thue.mfn, thue.tt, thue.fta, thue.vat].filter(Boolean)) {
      l.push(`• ${c.so} — ${c.viec}${c.hieuLuc ? `, hiệu lực từ ${c.hieuLuc}` : ''}`);
    }
    if (thue.canDoiChieu) l.push('  (biểu thuế cần đối chiếu lại văn bản mới)');
  }
  for (const c of chinhSach) {
    const them = [c.phuLuc, c.chuaDoiChieu ? 'theo danh mục trích, chưa đối chiếu bản gốc' : null].filter(Boolean).join('; ');
    l.push(`• ${c.so}${c.viec ? ` — ${c.viec}` : ''}${them ? ` (${them})` : ''}: ${tt(c)}${c.nguon ? `\n  nguồn: ${c.nguon}` : ''}`);
  }
  if (chinhSach.some((c) => c.cu)) l.push('  Lưu ý: Cổng báo chính sách của mã này còn dẫn văn bản cũ — đối chiếu văn bản mới trước khi khai.');
  for (const c of tienLe) l.push(`• ${c.so}${c.nam ? ` (${c.nam})` : ''} — ${c.viec}${c.nguon ? `\n  nguồn: ${c.nguon}` : ''}`);
  return l.join('\n');
}

export const KHONG_CO_CAN_CU = 'Dạ Cổng OZ chưa có căn cứ cho ý này nên em không nêu số văn bản ạ. Anh/chị cần chắc chắn thì em nhờ chuyên viên OZ kiểm giúp nhé.';

/**
 * Một dòng căn cứ ngắn cho bản đầy đủ (gói 1 dạng form, gói 2): tối đa 3 văn bản quyết định nhất —
 * thuế NK, nghĩa vụ chính sách chính (còn hiệu lực), FTA, VAT. Không có gì dùng được → '' (không bịa).
 */
export function dongCanCuNgan({ thue = null, chinhSach = [] } = {}) {
  const cs = chinhSach.find((c) => c.dung && c.mucDo === 'BLOCKING') || null;
  // "Phải công bố hợp quy (rủi ro trung bình)" → "phải công bố hợp quy": trong ngoặc của dòng căn cứ thì ngắn gọn.
  const gon = (v) => String(v || 'chính sách quản lý').replace(/\s*\([^()]*\)\s*$/, '').replace(/^\p{Lu}/u, (m) => m.toLowerCase());
  const ds = [thue?.mfn, cs && { so: cs.so, viec: gon(cs.viec) }, thue?.fta, thue?.vat].filter((c) => c?.so);
  const chon = ds.filter((c, i) => ds.findIndex((x) => x.so === c.so) === i).slice(0, 3);
  return chon.length ? `📚 Căn cứ: ${chon.map((c) => `${c.so} (${c.viec})`).join(', ')}` : '';
}

/** Gói căn cứ để lưu vào phiên (lệnh "căn cứ" / "chi tiết" mở lại đúng dữ liệu Cổng của lượt đã trả lời). */
export function goiCanCu({ thue = null, thuTuc = null, tienLe = null, maHs = null } = {}) {
  const g = { maHs, thue: canCuThue(thue), chinhSach: canCuChinhSach(thue, thuTuc), tienLe: tienLe ? canCuTienLe(tienLe) : [] };
  return g.thue || g.chinhSach.length || g.tienLe.length ? g : null;
}
