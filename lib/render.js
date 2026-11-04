// lib/render.js — đổi kết quả JSON của Cổng OZ (MCP) thành chữ dễ đọc trên Zalo.
// Không bịa, không suy: chỉ hiển thị trường máy chủ trả về. Công cụ mới chưa có mẫu riêng vẫn hiển thị được
// nhờ bộ dựng chung (renderGeneric).
import { fmtHs } from './format.js';

export const MAX_REPLY = 5600;   // ~3 tin Zalo

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
  sourceDocument: 'Nguồn', results: 'Kết quả', total: 'Tổng số', precedents: 'Tiền lệ', soThongBao: 'Số thông báo',
  ngayBanHanh: 'Ngày ban hành', coQuan: 'Cơ quan', tinhTrang: 'Tình trạng', thayThe: 'Thay thế bởi', suaDoi: 'Sửa đổi bởi',
  requiredDocuments: 'Chứng từ cần có', chungTu: 'Chứng từ', inspectionTypes: 'Loại kiểm tra', severity: 'Mức độ',
};

const SKIP = new Set(['nguon', 'chiPhi', 'nameZh', 'nameEn', 'levels', 'raw', 'isError', 'ok', 'id', 'sourceRefs',
  'relatedIds', 'origin', 'matchedBy', 'matchedAlias', 'verified', 'banQuyen', 'ghiCong', 'giayPhepNguon', 'embedding',
  'debug', 'timing', 'ms', 'version', 'phienBan', 'hoSoId', 'rankingSignals', 'found', 'coverage', 'parentCode',
  'noteType', 'level', 'noteEn', 'sourcePage', 'sen', 'nameZh', 'tenZh', 'cachDoc', 'treePath', 'siblingHsCodes', 'siblingGroupCodes']);

const label = (k) => LABELS[k] || String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const isHsKey = (k) => /^(hsCode|maHs|maDeXuat|maKhai|maHaiQuan|correctHs|candidateHs)$/.test(k);
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
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
  const note = o.noteVi && o.noteVi !== name ? `: ${clip(o.noteVi, 300)}` : '';
  const head = [code && (/^\d{6,8}$/.test(String(code)) ? fmtHs(code) : code), name && clip(String(name).replace(/^[\s\-–]+/, ''), 260)].filter(Boolean).join(' — ');
  if (head) return `${extra.length ? `${head} (${extra.join(', ')})` : head}${note}`;
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

/** Dòng lỗi thân thiện từ kết quả {ok:false, loi, thongBao}. */
export function renderError(r) {
  const msg = String(r?.thongBao || r?.text || r?.loi || 'Không rõ lỗi').split(' | EN:')[0];
  const lines = [`⚠️ ${clip(msg, 300)}`];
  if (/DANG_NHAP|TAI_KHOAN|UNAUTH|401|403/i.test(`${r?.loi} ${msg}`)) lines.push('Công cụ này cần tài khoản OZ — liên hệ quản trị bot để cấu hình.');
  if (/HET_DIEM|KHONG_DU_DIEM|DIEM/i.test(r?.loi || '')) lines.push('Tài khoản OZ của bot đã hết điểm cho công cụ này.');
  if (r?.diemDaHoan) lines.push('Điểm đã được hoàn.');
  return lines.join('\n');
}

/** Tra thuế: data có dạng /api/tax hoặc /api/search item. */
export function renderTax(d, origin = 'CN') {
  if (!d || typeof d !== 'object') return null;
  const x = Array.isArray(d.results) ? d.results[0] : d;
  if (!x?.hsCode) return null;
  const l = [`📦 ${fmtHs(x.hsCode)} — ${clip(String(x.nameVi || '').replace(/^[\s\-–]+/, ''), 300)}`];
  if (x.unitVi) l.push(`Đơn vị tính: ${x.unitVi}`);
  const pct = (v) => (v == null || v === '' ? '—' : /^\d+(\.\d+)?$/.test(String(v)) ? `${v}%` : String(v));
  l.push('💰 Thuế suất');
  l.push(`• NK ưu đãi (MFN): ${pct(x.taxNkPreferential)}`);
  if (x.taxNkTt) l.push(`• NK thông thường: ${pct(x.taxNkTt)}`);
  const fo = x.acfta?.forOrigin || x.taxAcftaChina;
  if (fo) {
    if (fo.eligible === true) l.push(`• ACFTA (C/O mẫu E, xuất xứ ${fo.origin || origin}): ${pct(fo.rate)}`);
    else if (fo.eligible === false) l.push(`• ACFTA xuất xứ ${fo.origin || origin}: KHÔNG được hưởng → áp MFN`);
    else l.push(`• ACFTA xuất xứ ${fo.origin || origin}: nhiều mức, cần tra dòng chi tiết`);
  }
  if (x.taxVat) l.push(`• VAT: ${pct(x.taxVat)}${x.vatReduction?.noteVi ? ` (${clip(x.vatReduction.noteVi, 160)})` : ''}`);
  const w = x.warnings;
  if (w?.summary) l.push(`${w.severity === 'HIGH' ? '🔴' : '🟡'} Chính sách: ${clip(w.summary, 300)}`);
  else if (x.policyByHs) l.push(`🟡 Chính sách: ${clip(x.policyByHs, 300)}`);
  else if (x.hasPolicyWarning === false) l.push('Chính sách: chưa có dữ liệu cảnh báo (không có nghĩa là không cần thủ tục).');
  return l.join('\n');
}

/** Danh sách mã từ tim_ma_hs. */
export function renderSearch(d) {
  const rows = d?.results || [];
  if (!rows.length) return null;
  const l = ['🔎 Các mã phù hợp:'];
  for (const r of rows.slice(0, 8)) {
    const fo = r.taxAcftaChina;
    const acfta = fo ? (fo.eligible ? `ACFTA ${fo.rate}%` : 'ACFTA: không áp cho CN') : '';
    l.push(`• ${fmtHs(r.hsCode)} — ${clip(String(r.nameVi || '').replace(/^[\s\-–]+/, ''), 160)}`);
    l.push(`  MFN ${r.taxNkPreferential ?? '—'}%${acfta ? ` · ${acfta}` : ''}${r.taxVat ? ` · VAT ${r.taxVat}` : ''}`);
  }
  const ca = (d.confusionAlerts || [])[0];
  if (ca?.warningVi) l.push(`⚠️ ${clip(ca.warningVi, 240)}`);
  return l.join('\n');
}

/**
 * Hiển thị một kết quả công cụ. renderer: tên bộ dựng riêng (tax/search) hoặc để trống → chung.
 */
export function renderResult(r, { title, renderer } = {}) {
  if (!r) return '⚠️ Không có kết quả.';
  if (r.ok === false || r.isError) return (title ? `${title}\n` : '') + renderError(r);
  const data = r.data ?? (r.text ? r.text : Object.fromEntries(Object.entries(r).filter(([k]) => !SKIP.has(k) && k !== 'text' && k !== 'data')));
  let body = null;
  if (renderer === 'tax') body = renderTax(data);
  if (renderer === 'search') body = renderSearch(data);
  if (!body) body = typeof data === 'string' ? clip(data, MAX_REPLY) : renderGeneric(data).join('\n');
  const warn = (r.canhBao || []).map((c) => (typeof c === 'string' ? c : c?.thongBao || c?.noteVi || c?.message)).filter(Boolean);
  const parts = [title, body || '(không có dữ liệu)'];
  if (warn.length) parts.push(`⚠️ ${clip(warn.join('; '), 400)}`);
  const diem = r.chiPhi?.diem;
  if (diem) parts.push(`(Trừ ${diem} điểm tài khoản OZ)`);
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
  if (st === 'LOI') return `${title ? `${title}\n` : ''}⚠️ ${clip(top.thongBao || 'Phân loại thất bại.', 200)}${top.daHoanDiem ? ' Điểm đã được hoàn.' : ''}`;

  const status = String(kq.status || '');
  const canHoi = st === 'CAN_DU_KIEN' || status === 'NEED_FACTS';
  const canChuyenGia = status === 'NEEDS_EXPERT' || kq.nextAction?.type === 'HUMAN_REVIEW';
  const list = (Array.isArray(kq.results) && kq.results) || (Array.isArray(kq.suggestions) && kq.suggestions) || [];
  const l = [];
  if (title) l.push(title);

  if (list.length) {
    const head = canHoi ? 'Mã có thể (chưa chốt, cần thêm thông tin):' : canChuyenGia ? 'Mã có thể (cần chuyên gia xem lại):' : '✅ Mã đề xuất:';
    l.push(head);
    list.slice(0, 3).forEach((x, i) => {
      const code = x.hs || x.hsCode || x.maHs;
      const conf = x.confidence != null ? ` (${scalar('confidence', x.confidence)})` : '';
      l.push(`${i + 1}. ${fmtHs(code)}${conf}`);
      const why = String(x.reason || x.reasoning || x.lyDo || '').replace(/;?\s*Nguồn:.*$/i, '');
      if (why) l.push(`   ${clip(why, 180)}`);
    });
  } else if (pickCode(kq)) {
    l.push(`✅ Mã đề xuất: ${fmtHs(pickCode(kq))}`);
  }

  const qs = (Array.isArray(top.hoi) && top.hoi) || kq.nextAction?.questions || [];
  if (canHoi && qs.length) {
    l.push('', '❓ Cần bạn cho biết thêm:');
    qs.slice(0, 5).forEach((q, i) => l.push(`${i + 1}. ${clip(typeof q === 'string' ? q : q.questionVi || q.question || q.cauHoi || '', 160)}`));
  } else if (canChuyenGia && kq.nextAction?.reasonVi) {
    l.push('', `⚠️ ${clip(kq.nextAction.reasonVi, 220)}`);
  }
  const cw = kq.confusionWarning;
  const cwText = typeof cw === 'string' ? cw : cw?.warningVi || cw?.messageVi || '';
  if (cwText) l.push('', `⚠️ ${clip(cwText, 200)}`);
  const vb = kq.canCuPhapLy?.vanBan?.soHieu;
  if (vb) l.push('', `Căn cứ phân loại: ${vb}`);
  if (l.length <= (title ? 1 : 0)) l.push(clip(top.thongBao || 'Chưa có kết quả rõ ràng.', 200));
  return l.join('\n');
}

function pickCode(d) {
  const c = d?.maDeXuat || d?.hsCode || d?.maHs;
  return c && /^\d{8}$/.test(String(c).replace(/\D/g, '')) ? String(c).replace(/\D/g, '') : null;
}

export function clipReply(s) {
  const t = String(s || '');
  return t.length > MAX_REPLY ? `${t.slice(0, MAX_REPLY - 40)}\n… (đã rút gọn, xem đầy đủ trên Cổng OZ)` : t;
}
