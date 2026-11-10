// packs/hs/render.js — đổi kết quả JSON của Cổng OZ (MCP) thành chữ dễ đọc trên Zalo.
// Không bịa, không suy: chỉ hiển thị trường máy chủ trả về. Công cụ mới chưa có mẫu riêng vẫn hiển thị được
// nhờ bộ dựng chung (renderGeneric).
// Giao diện: mã HS in đậm, tiêu đề khối in đậm, cảnh báo màu — xem style.js.
import { fmtHs } from './format.js';
// Ngoại lệ có chủ ý với luật "gói chỉ import core/types.js": dùng đúng một bộ dò lộ của cửa gửi (Hiến pháp IX), không chép bản thứ hai.
import { findLeak } from '../../core/redact.js';
import { b, balanceTags } from './style.js';

export const MAX_REPLY = 5600;   // ~3 tin Zalo

/** Bọc mã HS để nổi bật (chỉ khi là mã thật 6–8 số). */
const hs = (code) => {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6 && c.length !== 8) return fmtHs(code);
  return b(fmtHs(c));
};

const LABELS = {
  hsCode: 'Mã HS', maHs: 'Mã HS', maDeXuat: 'Mã đề xuất', maKhai: 'Mã khai', maHaiQuan: 'Mã Hải quan áp',
  nameVi: 'Tên', tenVi: 'Tên', tenHang: 'Tên hàng', moTa: 'Mô tả', moTaEcus: 'Mô tả ECUS', moTaDayDu: 'Mô tả đầy đủ',
  customsDescription: 'Mô tả khai báo', banNhap: 'Bản nháp', cauHoi: 'Câu hỏi cần bổ sung',
  confidence: 'Độ tin cậy', doTinCay: 'Độ tin cậy', reasoning: 'Lý do', lyDo: 'Lý do', lapLuan: 'Lập luận',
  taxNkPreferential: 'NK ưu đãi (MFN)', taxNkTt: 'NK thông thường', taxVat: 'VAT', taxAcfta: 'ACFTA (biểu gốc)',
  unitVi: 'Đơn vị tính', donViTinh: 'Đơn vị tính',
  trangThai: 'Trạng thái', hieuLuc: 'Hiệu lực', soHieu: 'Số hiệu', ngayHieuLuc: 'Ngày hiệu lực',
  mucRuiRo: 'Mức rủi ro', den: 'Đèn rủi ro', nhanRuiRo: 'Rủi ro', ketLuan: 'Kết luận', tomTat: 'Tóm tắt', summary: 'Tóm tắt',
  canhBao: 'Cảnh báo', warnings: 'Cảnh báo', loi: 'Lỗi', thongBao: 'Thông báo', goiY: 'Gợi ý', maThayThe: 'Mã thay thế',
  canCu: 'Căn cứ', canCuPhapLy: 'Căn cứ pháp lý', girRulesApplied: 'Quy tắc GIR', vanBan: 'Văn bản', legalDocs: 'Văn bản',
  diemTuanThu: 'Điểm tuân thủ', compliance: 'Tuân thủ', score: 'Điểm', level: 'Mức',
  congVan: 'Bản nháp công văn', danY: 'Dàn ý lập luận', diemYeu: 'Điểm yếu', hoSoKemTheo: 'Hồ sơ kèm theo',
  dongHang: 'Dòng hàng', ketQua: 'Kết quả', ghiChu: 'Ghi chú', noteVi: 'Ghi chú', thuTuc: 'Thủ tục',
  kiemTraChuyenNganh: 'Kiểm tra chuyên ngành', giayPhep: 'Giấy phép', boQuanLy: 'Bộ quản lý', ministries: 'Bộ quản lý',
  content: 'Nội dung', noiDung: 'Nội dung', chapter: 'Chương', heading: 'Nhóm', chain: 'Cấp chú giải', source: 'Nguồn',
  dieu_kien: 'Điều kiện', dieuKien: 'Điều kiện', chinhSach: 'Chính sách', policyLines: 'Chính sách theo mã',
  policyLevel: 'Mức chính sách', vanBanQuanLy: 'Văn bản quản lý',
  sourceDocument: 'Nguồn', results: 'Kết quả', total: 'Tổng số', precedents: 'Tiền lệ', soThongBao: 'Số thông báo',
  ngayBanHanh: 'Ngày ban hành', coQuan: 'Cơ quan', tinhTrang: 'Tình trạng', thayThe: 'Thay thế bởi', suaDoi: 'Sửa đổi bởi',
  requiredDocuments: 'Chứng từ cần có', chungTu: 'Chứng từ', inspectionTypes: 'Loại kiểm tra', severity: 'Mức độ',
};

const SKIP = new Set(['nguon', 'chiPhi', 'nameZh', 'nameEn', 'levels', 'raw', 'isError', 'ok', 'id', 'sourceRefs',
  'relatedIds', 'origin', 'matchedBy', 'matchedAlias', 'verified', 'banQuyen', 'ghiCong', 'giayPhepNguon', 'embedding',
  'debug', 'timing', 'ms', 'version', 'phienBan', 'hoSoId', 'rankingSignals', 'found', 'coverage', 'parentCode',
  'noteType', 'level', 'noteEn', 'sourcePage', 'sen', 'nameZh', 'tenZh', 'cachDoc', 'treePath', 'siblingHsCodes', 'siblingGroupCodes']);

/** Điều kiện áp dụng của một dòng chính sách/giấy phép (Cổng có thể đặt tên dieu_kien hoặc dieuKien). */
const dieuKienOf = (o) => (o && typeof o === 'object' ? o.dieu_kien ?? o.dieuKien ?? null : null);

const label = (k) => LABELS[k] || String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const isHsKey = (k) => /^(hsCode|maHs|maDeXuat|maKhai|maHaiQuan|correctHs|candidateHs)$/.test(k);
// Chữ Hán/fullwidth — LLM backend của Cổng đôi khi lẫn vào lý do ("không dùng广泛 cho tủ điện").
const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;
/** Câu dính ký tự Trung → bỏ cả mệnh đề đó (che tạm lỗi Cổng, chờ bên giữ hs-code-api sửa); không còn mệnh đề nào → '…'. */
function sachCau(s) {
  if (!CJK.test(s)) return s;
  const giu = String(s).split(/(?<=[.;!?])\s*/).filter((p) => !CJK.test(p));
  return giu.length ? giu.join(' ').trim() : '…';
}
export const clip = (s, n) => { const t = sachCau(String(s ?? '').replace(/\s+/g, ' ').trim()); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const scalar = (k, v) => {
  if (typeof v === 'boolean') return v ? 'có' : 'không';
  if (isHsKey(k) && /^\d{6,8}$/.test(String(v))) return fmtHs(v);
  if (/confidence|doTinCay/i.test(k) && typeof v === 'number') return `${v <= 1 ? Math.round(v * 100) : v}%`;
  return clip(String(v).replace(/^[\s\-–]+/, ''), 400);
};

/** Một dòng tóm tắt cho phần tử mảng là object (ưu tiên mã + tên). */
function itemLine(o) {
  if (o == null || typeof o !== 'object') return clip(o, 300);
  const code = o.hsCode || o.maHs || o.ma || o.soHieu || o.code;
  const name = o.nameVi || o.tenVi || o.titleVi || o.ten || o.tenHang || o.title || o.tieuDe || o.moTa || o.messageVi || o.warningVi || o.noiDung || o.text;
  const extra = [];
  if (o.confidence != null || o.doTinCay != null) extra.push(scalar('confidence', o.confidence ?? o.doTinCay));
  if (o.trangThai) extra.push(String(o.trangThai));
  if (o.mucDo || o.severity) extra.push(String(o.mucDo || o.severity));
  else if (/^(BLOCKING|NOTICE|WARNING|INFO)$/i.test(String(o.level || ''))) extra.push(String(o.level).toUpperCase());
  // Điều kiện phải đi CÙNG dòng: nghĩa vụ (vd giấy phép in) có thể chỉ áp cho một phần hàng thuộc mã.
  const dk = dieuKienOf(o);
  const dkText = dk != null && dk !== '' ? ` — điều kiện: ${clip(typeof dk === 'object' ? JSON.stringify(dk) : dk, 300)}` : '';
  const note = o.noteVi && o.noteVi !== name ? `: ${clip(o.noteVi, 300)}` : '';
  const head = [code && (/^\d{6,8}$/.test(String(code)) ? fmtHs(code) : code), name && clip(String(name).replace(/^[\s\-–]+/, ''), 260)].filter(Boolean).join(' — ');
  if (head) return `${extra.length ? `${head} (${extra.join(', ')})` : head}${dkText}${note}`;
  return Object.entries(o).filter(([k, v]) => !SKIP.has(k) && v != null && typeof v !== 'object').slice(0, 3)
    .map(([k, v]) => `${label(k)}: ${scalar(k, v)}`).join('; ');
}

/** Bộ dựng chung: duyệt object tối đa 3 tầng. */
export function renderGeneric(value, depth = 0, out = [], indent = '') {
  if (value == null) return out;
  if (typeof value !== 'object') { out.push(indent + clip(value, 600)); return out; }
  if (Array.isArray(value)) {
    for (const it of value.slice(0, 8)) out.push(`${indent}• ${itemLine(it)}`);
    if (value.length > 8) out.push(`${indent}… và ${value.length - 8} mục khác`);
    return out;
  }
  for (const [k, v] of Object.entries(value)) {
    if (SKIP.has(k) || v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    if (typeof v !== 'object') { out.push(`${indent}${label(k)}: ${scalar(k, v)}`); continue; }
    if (depth >= 2) { out.push(`${indent}${label(k)}: ${Array.isArray(v) ? `${v.length} mục` : itemLine(v)}`); continue; }
    if (Array.isArray(v) && v.every((x) => typeof x !== 'object')) {
      out.push(`${indent}${label(k)}: ${clip(v.map((x) => scalar(k, x)).join(', '), 500)}`);
      continue;
    }
    out.push(`${indent}${label(k)}:`);
    renderGeneric(v, depth + 1, out, `${indent}  `);
  }
  return out;
}

export const LOI_CONG = 'Cổng tra cứu gặp lỗi ở mục này, bạn thử lại sau ít phút nhé.';

// Chữ của lỗi hệ thống/truyền tải lọt vào thongBao: mã HTTP, MCP/JSON-RPC, mạng, stack, đường dẫn tệp mã.
const SYS_TEXT = /\bHTTP\s|\bMCP\s|JSON-RPC|\bE(?:CONN\w*|TIMEDOUT|NOTFOUND|AI_AGAIN|PIPE)\b|fetch failed|socket hang up|\bat\s+\S+\s+\(|[\w/.-]+\.(?:m?js|cjs|ts|py):\d+/i;

/** Câu nghiệp vụ Cổng trả (gọi công cụ thành công, kể cả ok:false) được hiện cho khách nếu sạch; ngược lại null. */
export function businessText(s) {
  const t = String(s ?? '').split(' | EN:')[0].trim();
  if (!t || findLeak(t) || SYS_TEXT.test(t)) return null;
  return t;
}

/** Dòng lỗi cho khách từ kết quả {ok:false, loi, thongBao}.
 *  - Lỗi truyền tải (gói bắt ngoại lệ → `transport: true`): câu cố định, chi tiết đã ở audit `tool` của lõi.
 *  - Lỗi nghiệp vụ (Cổng trả về, ví dụ "mã không tồn tại"): hiện như cũ, trừ khi chữ lộ nội bộ (businessText) → câu cố định.
 *  - `thongBaoKhach`: câu gói tự soạn, hiện nguyên văn. Hiến pháp IX. */
export function renderError(r) {
  const msg = String(r?.thongBao || r?.text || '');
  const shown = r?.thongBaoKhach ? String(r.thongBaoKhach) : (!r?.transport && businessText(msg)) || LOI_CONG;
  const lines = [`⚠️ ${clip(shown, 300)}`];
  if (/DANG_NHAP|TAI_KHOAN|UNAUTH|401|403/i.test(`${r?.loi} ${msg}`)) lines.push('Công cụ này cần tài khoản OZ — liên hệ quản trị bot để cấu hình.');
  if (/HET_DIEM|KHONG_DU_DIEM|DIEM/i.test(r?.loi || '')) lines.push('Tài khoản OZ của bot đã hết điểm cho công cụ này.');
  if (r?.diemDaHoan) lines.push('Điểm đã được hoàn.');
  return lines.join('\n');
}

/** Các dòng "• …" thuế suất của một dòng biểu thuế (dùng chung cho gói 2 và form kết quả phân loại). */
function dongThueSuat(x, origin = 'CN') {
  const pct = (v) => (v == null || v === '' ? '—' : /^\d+(\.\d+)?$/.test(String(v)) ? `${v}%` : String(v));
  const l = [`• NK ưu đãi (MFN): ${pct(x.taxNkPreferential)}`];
  if (x.taxNkTt) l.push(`• NK thông thường: ${pct(x.taxNkTt)}`);
  const fo = x.acfta?.forOrigin || x.taxAcftaChina;
  if (fo) {
    if (fo.eligible === true) l.push(`• ACFTA (C/O mẫu E, xuất xứ ${fo.origin || origin}): ${pct(fo.rate)}`);
    else if (fo.eligible === false) l.push(`• {red}ACFTA xuất xứ ${fo.origin || origin}: KHÔNG được hưởng → áp MFN{/red}`);
    else l.push(`• ACFTA xuất xứ ${fo.origin || origin}: nhiều mức, cần tra dòng chi tiết`);
  }
  if (x.taxVat) l.push(`• VAT: ${pct(x.taxVat)}${x.vatReduction?.noteVi ? ` (${clip(x.vatReduction.noteVi, 160)})` : ''}`);
  return l;
}

/** Tra thuế: data có dạng /api/tax hoặc /api/search item. */export function renderTax(d, origin = 'CN') {
  if (!d || typeof d !== 'object') return null;
  const x = Array.isArray(d.results) ? d.results[0] : d;
  if (!x?.hsCode) return null;
  const l = [`📦 ${hs(x.hsCode)} — ${clip(String(x.nameVi || '').replace(/^[\s\-–]+/, ''), 300)}`];
  if (x.unitVi) l.push(`Đơn vị tính: ${x.unitVi}`);
  l.push('{b}💰 Thuế suất{/b}', ...dongThueSuat(x, origin));
  // Tóm tắt chính sách do AI của Cổng tổng hợp, chưa kiểm (nhanAi AI_CHUA_KIEM) không được dùng làm căn cứ → không hiện;
  // chính sách có căn cứ nằm ở mục "📋 Chính sách nhập khẩu" (renderPolicy).
  const w = x.warnings?.nhanAi === 'AI_CHUA_KIEM' ? null : x.warnings;
  const dkW = dieuKienOf(w) ?? dieuKienOf(x);
  const dkTextW = dkW != null && dkW !== '' ? ` — điều kiện: ${clip(typeof dkW === 'object' ? JSON.stringify(dkW) : dkW, 300)}` : '';
  if (w?.summary) l.push(`${w.severity === 'HIGH' ? '{red}🔴{/red}' : '{orange}🟡{/orange}'} Lưu ý: ${clip(w.summary, 300)}${dkTextW}`);
  else if (x.policyByHs) l.push(`{orange}🟡 Lưu ý: ${clip(x.policyByHs, 300)}{/orange}`);
  else if (x.hasPolicyWarning === false) l.push('Lưu ý: chưa có dữ liệu cảnh báo (không có nghĩa là không cần thủ tục).');
  return l.join('\n');
}

// Số hiệu văn bản: "36/2026/TT-BKHCN", "29/2025/TT-BKHCN-PL2", "37/2026/NĐ-CP".
const SO_HIEU = /\d{1,4}\/\d{4}\/[A-ZĐa-zđ0-9]+(?:-[A-ZĐa-zđ0-9]+)*/;
/** Văn bản gốc của một số hiệu (bỏ đuôi phụ lục "-PL2"). */
const goc = (s) => String(s || '').replace(/-PL\d+$/i, '');
const ngayVN = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : null; };

/**
 * Thủ tục nhập khẩu (tra_thu_tuc_nhap_khau) → { muc: [chính sách], vanBan: [{so, ten, tt}], cu } — chỉ dùng trường Cổng trả,
 * bỏ phần AI tổng hợp chưa kiểm (warnings) và dữ liệu kỹ thuật. null khi dữ liệu không đúng khuôn kết quả thủ tục.
 */
export function phanTichChinhSach(d) {
  if (!d || typeof d !== 'object') return null;
  if (!['kiemTraChuyenNganh', 'giayPhep', 'vanBanQuanLy', 'chinhSach'].some((k) => k in d)) return null;
  // Gộp theo văn bản gốc (bỏ "-PL2"); giữ bản có thông tin hiệu lực.
  const vb = new Map();
  for (const v of Array.isArray(d.vanBanQuanLy) ? d.vanBanQuanLy : []) {
    const so = goc(v?.hieuLuc?.soHieu || v?.soHieu);
    if (!so) continue;
    if (!vb.has(so) || (!vb.get(so).hieuLuc && v.hieuLuc)) vb.set(so, { so, hieuLuc: v.hieuLuc || null });
  }
  /** Trạng thái hiệu lực của văn bản, viết bằng tiếng Việt. Rỗng = Cổng không nói (đừng bịa).
   *  Có cả `HET_HIEU_LUC_MOT_PHAN` (hết hiệu lực một phần) và `biBaiBoBoi`/`biTamNgungBoi`: bỏ qua hai
   *  trường này thì khách thấy một văn bản ĐÃ BỊ BÃI BỎ hiện như còn hiệu lực — lỗi pháp lý. */
  const trangThai = (so) => {
    const h = vb.get(goc(so))?.hieuLuc;
    if (!h?.tinhTrang) return '';
    if (h.tinhTrang === 'CON_HIEU_LUC') return 'còn hiệu lực';
    if (h.tinhTrang === 'HET_HIEU_LUC') {
      const thay = (h.biThayTheBoi || []).filter(Boolean);
      return `hết hiệu lực${ngayVN(h.hetHieuLucTu) ? ` từ ${ngayVN(h.hetHieuLucTu)}` : ''}${thay.length ? `, thay bởi ${thay.join(', ')}` : ''}`;
    }
    if (h.tinhTrang === 'HET_HIEU_LUC_MOT_PHAN') {
      const bo = (h.biBaiBoBoi || []).filter(Boolean);
      const ngung = (h.biTamNgungBoi || []).filter(Boolean);
      return `hết hiệu lực một phần${bo.length ? `, đã bị bãi bỏ bởi ${bo.join(', ')}` : ''}${ngung.length ? `, tạm ngưng bởi ${ngung.join(', ')}` : ''}`;
    }
    return '';
  };
  const hetHieuLuc = (so) => /^hết hiệu lực/.test(trangThai(so));
  const muc = [];
  for (const p of d.chinhSach?.policyLines || []) {
    const raw = String(p?.text || '').trim();
    if (!raw) continue;
    let t = raw.replace(new RegExp(`\\s*[—–-]\\s*${SO_HIEU.source}\\s*$`), '').trim();
    // Ngoặc cuối chứa MỘT hoặc NHIỀU số hiệu văn bản ("(42/2019/TT-BCT & 34/2025/TT-BCT )") → bỏ:
    // mục "Văn bản dẫn tới chính sách" đã liệt kê, giữ lại chỉ là lặp lại (và có dấu cách thừa).
    let soDa = [];
    const ngoac = /\s*\(([^()]+)\)\s*$/.exec(t);
    if (ngoac) {
      const soTrong = ngoac[1].match(new RegExp(SO_HIEU.source, 'g')) || [];
      const bietDuoc = soTrong.length > 0 && soTrong.every((x) => vb.has(goc(x)));
      if (bietDuoc) { soDa = soTrong; t = t.slice(0, ngoac.index).trim(); }
    }
    // Văn bản gốc: ưu tiên trường có cấu trúc (`soHieu`) của Cổng; nếu không có thì lấy số hiệu CÒN
    // trong câu sau khi đã bỏ phần trích dẫn — không lấy từ câu đã bỏ, nếu không một dòng trích
    // nhiều văn bản sẽ bị gắn cảnh báo "đã hết hiệu lực" theo văn bản đầu tiên.
    const so = p.soHieu || (t.match(SO_HIEU) || [])[0] || null;
    if (so) soDa = [...new Set([...soDa, so])];
    // Cảnh báo "căn cứ đã hết hiệu lực" chỉ khi MỌI văn bản dòng này viện dẫn đều hết hiệu lực:
    // dòng trích hai văn bản (một còn hiệu lực, một đã bãi bỏ) thì không được gắn cảnh báo chung.
    if (soDa.length && soDa.every((x) => hetHieuLuc(x))) t += ' (căn cứ đã hết hiệu lực)';
    // Dòng chỉ có nhãn ("Danh mục liên quan") thì khách không hiểu phải làm gì → lấy lý do Cổng ghi kèm.
    if (t.length < 25 && p.reasonVi) t = `${t} — ${clip(String(p.reasonVi).trim(), 200)}`;
    muc.push(clip(t, 260));
  }
  if (!muc.length) for (const k of d.kiemTraChuyenNganh || []) if (k?.label) muc.push(clip(k.label, 200));
  for (const g of d.giayPhep || []) {
    const ten = typeof g === 'string' ? g : g?.ten || g?.label || g?.tenVi || g?.name;
    if (ten) muc.push(`Giấy phép: ${clip(ten, 200)}`);
  }
  const vanBan = [...vb.values()].map(({ so, hieuLuc: h }) => ({
    so, ten: h?.ten ? clip(h.ten, 160) : null, tt: trangThai(so),
  }));
  // Cổng tự nói danh mục "chưa đối chiếu bản gốc" → không được khẳng định là đã dính chính sách.
  const lines = d.chinhSach?.policyLines || [];
  const chacChan = lines.some((p) => /chưa (?:xác minh|đối chiếu)|có thể thuộc diện|CÓ THỂ/i.test(String(p?.reasonVi || '')));
  return { muc: [...new Set(muc)], vanBan, cu: d.chinhSach?.policyBasisReview?.status === 'OUTDATED_BASIS', chacChan };
}

const CHUA_GHI_NHAN = 'Cổng OZ chưa ghi nhận chính sách quản lý chuyên ngành cho mã này (không có nghĩa là chắc chắn miễn thủ tục).';
const CANH_BAO_CU = '{orange}⚠️ Dữ liệu chính sách của mã này còn dẫn văn bản cũ — đối chiếu văn bản mới trước khi khai/đặt hàng.{/orange}';

/** Mục "📋 Chính sách nhập khẩu — <mã>" (gói 2): có dính chính sách không, là gì, văn bản nào dẫn tới. */
export function renderPolicy(d) {
  const cs = phanTichChinhSach(d);
  if (!cs) return null;
  const l = [`{b}📋 Chính sách nhập khẩu${d.maHs ? ` — ${fmtHs(d.maHs)}` : ''}{/b}`];
  if (!cs.muc.length) { l.push(`✅ ${CHUA_GHI_NHAN}`); return l.join('\n'); }
  // Cổng ghi "chưa đối chiếu bản gốc" thì không được khẳng định khách CHẮC chắn dính (Hiến chương VIII).
  l.push(cs.chacChan
    ? '{orange}⚠️ CÓ THỂ dính chính sách quản lý chuyên ngành — Cổng chưa đối chiếu bản gốc, nhân viên OZ cần xem lại:{/orange}'
    : '{red}⚠️ CÓ chính sách quản lý chuyên ngành:{/red}');
  for (const m of cs.muc) l.push(`• ${m}`);
  if (cs.vanBan.length) {
    l.push('{b}Văn bản dẫn tới chính sách:{/b}');
    for (const v of cs.vanBan) l.push(`• ${b(v.so)}${v.ten ? ` — ${v.ten}` : ''}${v.tt ? ` (${v.tt})` : ''}`);
  }
  if (cs.cu) l.push(CANH_BAO_CU);
  return l.join('\n');
}

// ——— Rủi ro nhãn hiệu (kiem_tra_shtt, kiem_tra_shtt_anh): xem ./render-shtt.js (tách ra để giữ Điều VI) ———

/** Dữ liệu một kết quả công cụ thành công ({ok, data}) — lỗi/không có → null. */
const duLieu = (r) => (r && r.ok !== false && !r.isError ? (r.data ?? r) : null);

/**
 * Form kết quả phân loại đầy đủ (mẫu chủ repo chọn 06/11) — code dựng, không qua AI biên tập:
 * 🔍 Hàng → ✅ Mã HS đề xuất (tên trong biểu, ĐVT, lý do) → 📝 Mô tả khai báo gợi ý → 💰 Thuế suất
 * → 🔴/✅ Chính sách quản lý (kèm văn bản) → 🔁 Mã khác cần cân nhắc → ⚠️ lưu ý. Mục nào Cổng lỗi/không có thì bỏ.
 * @param {{tenHang:string, maHs:string, phanLoai:object, thue?:object, thuTuc?:object, moTa?:object, xuatXu?:string}} o
 */
export function renderPhanLoaiDayDu({ tenHang, maHs, phanLoai, thue, thuTuc, moTa, xuatXu = 'CN' }) {
  const top = phanLoai?.data && typeof phanLoai.data === 'object' ? phanLoai.data : phanLoai || {};
  const kq = top.ketQua && typeof top.ketQua === 'object' ? top.ketQua : top;
  const list = (Array.isArray(kq.results) && kq.results) || (Array.isArray(kq.suggestions) && kq.suggestions) || [];
  const maCua = (x) => String(x?.hs || x?.hsCode || x?.maHs || '').replace(/\D/g, '');
  const lyDo = (x) => String(x?.reason || x?.reasoning || x?.lyDo || '').replace(/;?\s*Nguồn:.*$/i, '').trim();
  const chinh = list.find((x) => maCua(x) === maHs) || null;

  const ten = String(tenHang || '');
  const l = [`{b}🔍 Hàng:{/b} "${ten.length > 120 ? `${ten.slice(0, 120).replace(/\s+\S*$/, '')}…` : ten}"`, ''];
  const conf = chinh?.confidence != null ? ` (${scalar('confidence', chinh.confidence)})` : '';
  l.push(`{b}✅ Mã HS đề xuất: ${fmtHs(maHs)}{/b}${conf}`);
  const t = duLieu(thue);
  const tx0 = t ? (Array.isArray(t.results) ? t.results[0] : t) : null;
  const tx = tx0?.hsCode ? tx0 : null;   // không đúng khuôn biểu thuế → bỏ mục thuế
  if (tx?.nameVi) l.push(`Tên trong biểu: ${clip(String(tx.nameVi).replace(/^[\s\-–]+/, ''), 200)}`);
  if (tx?.unitVi) l.push(`Đơn vị tính: ${tx.unitVi}`);
  const ly = lyDo(chinh) || lyDo(top) || lyDo(kq);
  if (ly) l.push(`Lý do: ${clip(ly, 300)}`);

  const mt = duLieu(moTa);
  const cau = mt && String(mt.customsDescription || mt.moTaEcus || mt.moTa || mt.banNhapText || mt.banNhap || '').trim();
  if (cau && cau !== 'true') {
    l.push('', '{b}📝 Mô tả khai báo gợi ý{/b}', clip(cau, 400));
    if (mt.banNhap === true) l.push('{orange}(Bản nháp — hồ sơ chưa đủ căn cứ, chưa dùng để khai){/orange}');
    const thieu = [...(mt.descriptionMeta?.thieuTruong || []).map((x) => x?.labelVi).filter(Boolean),
      ...(Array.isArray(mt.cauHoi) ? mt.cauHoi.map((q) => (typeof q === 'string' ? q : q?.cauHoi || q?.questionVi)).filter(Boolean) : [])];
    if (thieu.length) l.push(`Cần bổ sung: ${clip([...new Set(thieu)].join('; '), 300)}`);
  }

  if (tx) l.push('', `{b}💰 Thuế suất{/b}${xuatXu ? ` (xuất xứ ${xuatXu})` : ''}`, ...dongThueSuat(tx, xuatXu));

  const cs = phanTichChinhSach(duLieu(thuTuc));
  if (cs) {
    if (cs.muc.length) {
      l.push('', cs.chacChan
        ? '{orange}⚠️{/orange} {b}Chính sách quản lý (có thể — Cổng chưa đối chiếu bản gốc){/b}'
        : '{red}🔴{/red} {b}Chính sách quản lý{/b}', ...cs.muc.map((m) => `• ${m}`));
      if (cs.vanBan.length) l.push(`• Văn bản: ${cs.vanBan.map((v) => `${v.so}${v.tt ? ` (${v.tt})` : ''}`).join(', ')}`);
      if (cs.cu) l.push(CANH_BAO_CU);
    } else {
      l.push('', '{b}✅ Chính sách quản lý{/b}', CHUA_GHI_NHAN);
    }
  }

  const khac = list.filter((x) => maCua(x) && maCua(x) !== maHs).slice(0, 3);
  if (khac.length) {
    l.push('', '{b}🔁 Mã khác cần cân nhắc{/b}');
    for (const x of khac) l.push(`• ${b(fmtHs(maCua(x)))}${lyDo(x) ? ` — ${clip(lyDo(x), 140)}` : ''}`);
    l.push('Gõ mã 8 số để xem thuế + chính sách của mã đó.');
  }
  const cw = kq.confusionWarning;
  const cwText = typeof cw === 'string' ? cw : cw?.warningVi || cw?.messageVi || '';
  if (cwText) l.push('', `{orange}⚠️ ${clip(cwText, 240)}{/orange}`);
  return l.join('\n');
}
/** Danh sách mã từ tim_ma_hs. */
export function renderSearch(d) {
  const rows = d?.results || [];
  if (!rows.length) return null;
  const l = ['{b}🔎 Các mã phù hợp:{/b}'];
  for (const r of rows.slice(0, 8)) {
    const fo = r.taxAcftaChina;
    const acfta = fo ? (fo.eligible ? `ACFTA ${fo.rate}%` : 'ACFTA: không áp cho CN') : '';
    l.push(`• ${hs(r.hsCode)} — ${clip(String(r.nameVi || '').replace(/^[\s\-–]+/, ''), 160)}`);
    l.push(`  MFN ${r.taxNkPreferential ?? '—'}%${acfta ? ` · ${acfta}` : ''}${r.taxVat ? ` · VAT ${r.taxVat}` : ''}`);
  }
  const ca = (d.confusionAlerts || [])[0];
  if (ca?.warningVi) l.push(`{orange}⚠️ ${clip(ca.warningVi, 240)}{/orange}`);
  return l.join('\n');
}

/**
 * Hiển thị một kết quả công cụ. renderer: tên bộ dựng riêng (tax/search) hoặc để trống → chung.
 */
export function renderResult(r, { title, renderer } = {}) {
  if (!r) return '⚠️ Không có kết quả.';
  if (r.ok === false || r.isError) return (title ? `{b}${title}{/b}\n` : '') + renderError(r);
  const data = r.data ?? (r.text ? r.text : Object.fromEntries(Object.entries(r).filter(([k]) => !SKIP.has(k) && k !== 'text' && k !== 'data')));
  let body = null;
  if (renderer === 'tax') body = renderTax(data);
  if (renderer === 'search') body = renderSearch(data);
  if (renderer === 'policy') body = renderPolicy(data);   // tự có tiêu đề kèm mã HS
  const ownTitle = renderer === 'policy' && body;
  if (!body) body = typeof data === 'string' ? clip(data, MAX_REPLY) : renderGeneric(data).join('\n');
  const warn = (r.canhBao || []).map((c) => (typeof c === 'string' ? c : c?.thongBao || c?.noteVi || c?.message)).filter(Boolean);
  const parts = [title && !ownTitle ? `{b}${title}{/b}` : null, body || '(không có dữ liệu)'];
  if (warn.length) parts.push(`{orange}⚠️ ${clip(warn.join('; '), 400)}{/orange}`);
  const diem = r.chiPhi?.diem;
  if (diem) parts.push(`({yellow}Trừ ${diem} điểm tài khoản OZ{/yellow})`);
  return parts.filter(Boolean).join('\n');
}

/**
 * Kết quả phân loại (phan_loai_hs / ket_qua_phan_loai / bo_sung_du_kien) — GỌN cho Zalo:
 * trạng thái, tối đa 3 mã kèm lý do ngắn, tối đa 5 câu cần hỏi, văn bản căn cứ. Bỏ dữ liệu kỹ thuật (engine, dossier…).
 */
export function renderClassify(r, { title } = {}) {
  if (!r) return '⚠️ Không có kết quả.';
  if (r.ok === false || r.isError) return (title ? `${title}\n` : '') + renderError(r);
  const top = r.data && typeof r.data === 'object' ? r.data : r;
  const kq = top.ketQua && typeof top.ketQua === 'object' ? top.ketQua : top;
  const st = top.trangThai || r.trangThai;
  if (st === 'DANG_XU_LY') return `${title ? `${title}\n` : ''}⏳ Đang xử lý, bot sẽ gửi kết quả khi xong.`;
  if (st === 'LOI') return `${title ? `${title}\n` : ''}⚠️ ${clip(businessText(top.thongBao) || 'Phân loại thất bại.', 200)}${top.daHoanDiem ? ' Điểm đã được hoàn.' : ''}`;

  const status = String(kq.status || '');
  const canHoi = st === 'CAN_DU_KIEN' || status === 'NEED_FACTS';
  const canChuyenGia = status === 'NEEDS_EXPERT' || kq.nextAction?.type === 'HUMAN_REVIEW';
  const list = (Array.isArray(kq.results) && kq.results) || (Array.isArray(kq.suggestions) && kq.suggestions) || [];
  const l = [];
  if (title) l.push(`{b}${title}{/b}`);

  if (list.length) {
    const head = canHoi ? 'Mã có thể (chưa chốt, cần thêm thông tin):' : canChuyenGia ? 'Mã có thể (cần chuyên gia xem lại):' : '✅ Mã đề xuất:';
    l.push(`{b}${head}{/b}`);
    list.slice(0, 3).forEach((x, i) => {
      const code = x.hs || x.hsCode || x.maHs;
      const conf = x.confidence != null ? ` (${scalar('confidence', x.confidence)})` : '';
      l.push(`${i + 1}. {b}${fmtHs(code)}{/b}${conf}`);
      const why = String(x.reason || x.reasoning || x.lyDo || '').replace(/;?\s*Nguồn:.*$/i, '');
      if (why) l.push(`   ${clip(why, 180)}`);
    });
  } else if (pickCode(kq)) {
    l.push(`✅ Mã đề xuất: {b}${fmtHs(pickCode(kq))}{/b}`);
  }

  const qs = (Array.isArray(top.hoi) && top.hoi) || kq.nextAction?.questions || [];
  if (canHoi && qs.length) {
    l.push('', '{b}❓ Cần bạn cho biết thêm:{/b}');
    qs.slice(0, 5).forEach((q, i) => l.push(`${i + 1}. ${clip(typeof q === 'string' ? q : q.questionVi || q.question || q.cauHoi || '', 160)}`));
  } else if (canChuyenGia && kq.nextAction?.reasonVi) {
    l.push('', `{orange}⚠️ ${clip(kq.nextAction.reasonVi, 220)}{/orange}`);
  }
  const cw = kq.confusionWarning;
  const cwText = typeof cw === 'string' ? cw : cw?.warningVi || cw?.messageVi || '';
  if (cwText) l.push('', `{orange}⚠️ ${clip(cwText, 200)}{/orange}`);
  const vb = kq.canCuPhapLy?.vanBan?.soHieu;
  if (vb) l.push('', `Căn cứ phân loại: {b}${vb}{/b}`);
  if (l.length <= (title ? 1 : 0)) l.push(clip(businessText(top.thongBao) || 'Chưa có kết quả rõ ràng.', 200));
  return l.join('\n');
}

function pickCode(d) {
  const c = d?.maDeXuat || d?.hsCode || d?.maHs;
  return c && /^\d{8}$/.test(String(c).replace(/\D/g, '')) ? String(c).replace(/\D/g, '') : null;
}

/**
 * Rút gọn tin trả lời cho Zalo.
 * Phải cân bằng thẻ định dạng TRƯỚC khi cắt, nếu không người dùng sẽ thấy literal "{b}".
 */
export function clipReply(s) {
  const t = String(s || '');
  if (t.length <= MAX_REPLY) return t;
  const cut = balanceTags(t.slice(0, MAX_REPLY - 40));
  return `${cut}\n… (đã rút gọn, xem đầy đủ trên Cổng OZ)`;
}

// Dòng phòng vệ thương mại (CBPG, chống trợ cấp, tự vệ, chống lẩn tránh) trong kết quả thuế/thủ tục.
const PVTM = /chống bán phá giá|bán phá giá|\bCBPG\b|chống trợ cấp|biện pháp tự vệ|thuế tự vệ|chống lẩn tránh|phòng vệ thương mại|anti-?dumping|countervailing|safeguard|anti-?circumvention/i;
export const NHAC_PVTM = '⚖️ Phạm vi CBPG/tự vệ tính theo MÔ TẢ sản phẩm trong quyết định của Bộ Công Thương (dải độ dày, khổ, thành phần…), không chỉ theo mã HS — hàng gần ranh giới thì xin Cục Phòng vệ thương mại xác định bằng văn bản.';

/** Có dòng phòng vệ thương mại trong một trong các kết quả → trả câu nhắc phạm vi theo mô tả; không thì ''. */
export function nhacPhongVe(...results) {
  return results.some((r) => r && r.ok !== false && !r.isError && PVTM.test(JSON.stringify(r.data ?? r))) ? NHAC_PVTM : '';
}
