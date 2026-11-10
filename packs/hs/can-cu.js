// packs/hs/can-cu.js — Căn cứ pháp lý của câu trả lời (issue #136 mục B, mở lại ở #168).
//
// Luật của mục B, mã hoá thành code để không phụ thuộc vào kỷ luật của người viết câu:
//  1. CHỈ trích số văn bản có trong dữ liệu Cổng của CHÍNH lượt đó → `tapSoVanBanCong` + `kiemSoVanBanBia`.
//  2. Tin đầu tối đa 3 căn cứ, một dòng ngắn → `dongCanCu`; khách xin "chi tiết/căn cứ" mới đưa đủ → `khoiCanCuDayDu`.
//  3. Thuế FTA luôn kèm điều kiện C/O → nhãn của căn cứ ACFTA; ACFTA không được hưởng thì bỏ hẳn căn cứ FTA.
//  4. Văn bản hết hiệu lực / chưa đối chiếu hiệu lực không làm căn cứ chính → `cc.bo` (chỉ nêu khi hỏi chi tiết).
//  5. Lỗi lệch `canCu` vs `canCuChiTiet` (mục E, đã báo Cổng): ưu tiên `canCuChiTiet` vì `canCu` ghi số hiệu
//     của biểu thuế năm hiện hành thay vì số hiệu nghị định gốc (đo thật 10/11/2026, mã 85094000:
//     `canCu.mfn='NĐ 26/2025/NĐ-CP'` nhưng `canCuChiTiet.mfn='26/2023/NĐ-CP'`).

// Dạng đầy đủ: "26/2023/NĐ-CP", "29/2025/TT-BKHCN-PL2". Phần sau năm phải bắt đầu bằng chữ → "15/07/2023" không khớp.
const SO_DAY_DU = /\d{1,4}\/\d{4}\/[A-ZĐa-zđ][A-ZĐa-zđ0-9]*(?:-[A-ZĐa-zđ0-9]+)*/g;
// Dạng không năm: "2711/QĐ-BKHCN", "5676/TCHQ-TXNK", "1810/TB-TCHQ" — bắt buộc có dấu "-" để không ăn "8/10".
const SO_KHONG_NAM = /\d{1,5}\/[A-ZĐa-zđ]{2,}(?:-[A-ZĐa-zđ0-9]+)+/g;
// Dạng viết ngắn trong câu nói: "NĐ 26/2023", "TT 08/2023", "Nghị định 26/2023".
const SO_VIET_NGAN = /(?:NĐ|TT|QĐ|TB|CV|NQ|Nghị định|Thông tư|Quyết định|Thông báo)\s+\d{1,4}\/\d{4}(?!\/|\d)/g;

/** Văn bản gốc của một số hiệu (bỏ đuôi phụ lục "-PL2"). */
const goc = (s) => String(s || '').replace(/-PL\d+$/i, '');

/**
 * Khoá so khớp của một số hiệu. Có năm → "số/năm" (để "NĐ 26/2023" khớp "26/2023/NĐ-CP");
 * không năm → cả số hiệu viết thường (để "2711/QĐ-BKHCN" không khớp bừa với "2711/TT-BTC").
 */
export function khoaSoVanBan(s) {
  const t = goc(String(s || '').trim());
  const m = /(\d{1,5})\/(\d{4})(?!\d)/.exec(t);
  if (m) return `${Number(m[1])}/${m[2]}`;
  return t.toLowerCase().replace(/\s+/g, '');
}

/** Mọi số hiệu văn bản xuất hiện trong một đoạn chữ, theo đúng dạng đã viết (đã loại trùng). */
export function soVanBanTrongText(text) {
  let s = String(text || '');
  const out = [];
  // Quét từ dạng dài nhất tới ngắn nhất, che vùng đã nhận để không bắt trùng một phần.
  for (const re of [SO_DAY_DU, SO_KHONG_NAM, SO_VIET_NGAN]) {
    re.lastIndex = 0;
    const cho = [];
    let m;
    while ((m = re.exec(s))) cho.push([m.index, m[0]]);
    for (const [i, v] of cho) {
      out.push(v.replace(/\s+/g, ' ').trim());
      s = `${s.slice(0, i)}${' '.repeat(v.length)}${s.slice(i + v.length)}`;
    }
  }
  return [...new Set(out)];
}

/** Đi sâu mọi chuỗi trong một giá trị JSON. */
function moiChuoi(v, nhan, sau = new Set()) {
  if (v == null) return;
  if (typeof v === 'string') { nhan(v); return; }
  if (typeof v !== 'object') return;
  if (sau.has(v)) return;
  sau.add(v);
  if (Array.isArray(v)) { for (const x of v) moiChuoi(x, nhan, sau); return; }
  for (const x of Object.values(v)) moiChuoi(x, nhan, sau);
}

/**
 * Tập khoá số văn bản có trong dữ liệu Cổng của lượt (và trong chữ khách tự gõ ở lượt đó —
 * khách nhờ kiểm "57/2022/NĐ-CP" thì bot nhắc lại số đó không phải là bịa).
 * @param {any[]} ketQuaCong kết quả các công cụ Cổng đã gọi trong lượt
 * @param {string[]} chuKhach các câu khách gõ trong lượt
 */
export function tapSoVanBanCong(ketQuaCong = [], chuKhach = []) {
  const nguon = new Set();
  const nhan = (s) => { for (const v of soVanBanTrongText(s)) nguon.add(khoaSoVanBan(v)); };
  for (const r of Array.isArray(ketQuaCong) ? ketQuaCong : [ketQuaCong]) moiChuoi(r, nhan);
  for (const s of Array.isArray(chuKhach) ? chuKhach : [chuKhach]) if (s) nhan(String(s));
  return nguon;
}

/**
 * Kiểm máy chống bịa: mọi số văn bản trong câu trả lời phải có trong dữ liệu Cổng của lượt.
 * @returns {{ok: boolean, bia: string[]}} `bia` giữ đúng dạng đã viết trong câu trả lời.
 */
export function kiemSoVanBanBia(text, nguon) {
  const tap = nguon instanceof Set ? nguon : tapSoVanBanCong(nguon);
  const bia = soVanBanTrongText(text).filter((v) => !tap.has(khoaSoVanBan(v)));
  return { ok: bia.length === 0, bia };
}

/** Dữ liệu của một kết quả công cụ thành công ({ok, data}); lỗi/rỗng → null. */
const duLieu = (r) => (r && r.ok !== false && !r.isError ? (r.data ?? r) : null);

/** Loại văn bản viết ngắn: "26/2023/NĐ-CP" → "NĐ"; không rõ → ''. */
function loaiNgan(so) {
  const m = /\/(?:\d{4}\/)?([A-ZĐa-zđ]+)/.exec(String(so || '').replace(/^\d{1,5}\//, '/'));
  if (!m) return '';
  const t = m[1];
  return /^(NĐ|TT|QĐ|TB|CV|NQ|LUAT|L)$/i.test(t) ? t : '';
}

/** Dạng viết ngắn cho tin đầu: "26/2023/NĐ-CP" → "NĐ 26/2023"; không tách được thì giữ nguyên. */
export function soNgan(so) {
  const s = String(so || '').trim();
  const m = /^(\d{1,4}\/\d{4})\//.exec(s);
  if (!m) return s;
  const loai = loaiNgan(s);
  return loai ? `${loai} ${m[1]}` : m[1];
}

const VI_TINH_TRANG = {
  CON_HIEU_LUC: 'còn hiệu lực',
  HET_HIEU_LUC: 'hết hiệu lực',
  HET_HIEU_LUC_MOT_PHAN: 'hết hiệu lực một phần',
  CHUA_XAC_MINH: 'chưa đối chiếu hiệu lực',
};

const ngayVN = (iso) => {
  const s = String(iso || '');
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};

/** Một bản ghi hiệu lực (citation / hsListing / vanBanQuanLy.hieuLuc) → tình trạng + câu tiếng Việt. */
function docHieuLuc(h) {
  const so = goc(h?.soHieu || h?.cited);
  if (!so) return null;
  const tt = h.tinhTrang || null;
  const bo = (h.biBaiBoBoi || []).filter(Boolean);
  const thay = (h.biThayTheBoi || []).filter(Boolean);
  const ngung = (h.biTamNgungBoi || []).filter(Boolean);
  let vi = VI_TINH_TRANG[tt] || '';
  if (tt === 'HET_HIEU_LUC' || tt === 'HET_HIEU_LUC_MOT_PHAN') {
    if (ngayVN(h.hetHieuLucTu)) vi += ` từ ${ngayVN(h.hetHieuLucTu)}`;
    if (thay.length) vi += `, thay bởi ${thay.join(', ')}`;
    if (bo.length) vi += `, đã bị bãi bỏ bởi ${bo.join(', ')}`;
    if (ngung.length) vi += `, tạm ngưng bởi ${ngung.join(', ')}`;
  }
  // Cổng chưa đối chiếu bản gốc → Hiến pháp VIII: không được dùng làm căn cứ chính.
  const chuaDoiChieu = h.hieuLucDaDoiChieu === false || tt === 'CHUA_XAC_MINH';
  if (chuaDoiChieu && !/chưa đối chiếu/.test(vi)) vi = vi ? `${vi}, chưa đối chiếu hiệu lực` : 'chưa đối chiếu hiệu lực';
  const het = tt === 'HET_HIEU_LUC' || tt === 'HET_HIEU_LUC_MOT_PHAN' || bo.length > 0;
  return { so, tt, vi, dungDuoc: !het && !chuaDoiChieu, ten: h.ten || null };
}

/**
 * Câu tiếng Việt về tình trạng hiệu lực của MỘT bản ghi văn bản Cổng trả
 * (`items[]` của `tra_hieu_luc_van_ban`, `legalBasisRegistry.citations[]`, `vanBanQuanLy[].hieuLuc`).
 * Dùng cả ở `render.js` để bộ dựng chung không làm mất tình trạng (KB4 của #168).
 * → '' khi Cổng không nói gì về hiệu lực (không bịa).
 * @param {object} h bản ghi hiệu lực
 * @returns {string} ví dụ 'hết hiệu lực một phần từ 01/06/2026, đã bị bãi bỏ bởi 48/2026/TT-BCT'
 */
export function cauTinhTrangHieuLuc(h) {
  return docHieuLuc(h)?.vi || '';
}

/** Bảng tình trạng hiệu lực mọi văn bản Cổng nói tới trong lượt: khoá → bản ghi `docHieuLuc`. */
function bangHieuLuc(nguonList) {
  const map = new Map();
  const them = (h) => {
    const r = docHieuLuc(h);
    if (!r) return;
    const k = khoaSoVanBan(r.so);
    // Bản ghi nói rõ có vấn đề thắng bản ghi im lặng (một mã có thể xuất hiện ở nhiều nhánh).
    if (!map.has(k) || (map.get(k).dungDuoc && !r.dungDuoc)) map.set(k, r);
  };
  for (const d of nguonList) {
    if (!d) continue;
    for (const c of d.legalBasisRegistry?.citations || []) them(c);
    for (const l of d.hsListings || []) them(l);
    for (const v of d.vanBanQuanLy || []) them(v?.hieuLuc || v);
    for (const v of d.registry?.items || d.items || []) if (v?.soHieu && (v.tinhTrang || v.hieuLucDaDoiChieu != null)) them(v);
  }
  return map;
}

const NHAN = {
  mfn: 'thuế NK',
  tt: 'thuế NK thông thường',
  vat: 'VAT',
  acfta: 'ACFTA, cần C/O mẫu E',
};

/**
 * Gom căn cứ pháp lý từ dữ liệu Cổng của CHÍNH lượt đó.
 * @param {{thue?:object, thuTuc?:object, tienLe?:object, hieuLuc?:object, boFta?:boolean}} o kết quả các công cụ
 *   trong lượt; `boFta` = chưa biết xuất xứ lô hàng ⇒ bỏ hẳn căn cứ ưu đãi FTA (xem [S1] của #168).
 * @returns {{chinh: Array<{khoa:string, so:string, hieuLuc:string|null, nhan:string}>,
 *            bo: Array<{so:string, vi:string}>, tienLe: Array<{so:string, nhan:string}>}}
 */
export function phanTichCanCu({ thue, thuTuc, tienLe, hieuLuc, boFta = false } = {}) {
  const tData = duLieu(thue);
  const tx0 = tData ? (Array.isArray(tData.results) ? tData.results[0] : tData) : null;
  const tx = tx0?.hsCode ? tx0 : null;
  const ttData = duLieu(thuTuc);
  const tlData = duLieu(tienLe);
  const hlData = duLieu(hieuLuc);
  const bang = bangHieuLuc([tx, ttData, tlData, hlData]);

  /** Căn cứ của một loại thuế: ưu tiên `canCuChiTiet`; `canCu` chỉ dùng khi chi tiết không có. */
  const canCuThue = (k) => {
    const ct = tx?.canCuChiTiet?.[k];
    if (ct?.vanBan) {
      const so = (String(ct.vanBan).match(SO_DAY_DU) || [])[0] || (String(ct.vanBan).match(SO_KHONG_NAM) || [])[0] || null;
      if (so) return { so: goc(so), hieuLuc: ngayVN(ct.hieuLuc) };
    }
    const c = tx?.canCu?.[k];
    if (c?.vanBan) {
      const so = (String(c.vanBan).match(SO_DAY_DU) || [])[0] || (String(c.vanBan).match(SO_KHONG_NAM) || [])[0] || null;
      if (so) return { so: goc(so), hieuLuc: null };
    }
    return null;
  };

  const chinh = [];
  const bo = [];
  const daCo = new Set();
  const them = (khoa, so, hieuLucNgay, nhan) => {
    if (!so) return;
    const k = khoaSoVanBan(so);
    if (daCo.has(k)) return;
    const h = bang.get(k);
    if (h && !h.dungDuoc) return;   // hết hiệu lực / chưa đối chiếu → không làm căn cứ chính
    daCo.add(k);
    chinh.push({ khoa, so, hieuLuc: hieuLucNgay || null, nhan });
  };

  // Thứ tự tin đầu: thuế NK → FTA (nếu được hưởng) → VAT → NK thông thường.
  const mfn = canCuThue('mfn');
  if (mfn) them('mfn', mfn.so, mfn.hieuLuc, NHAN.mfn);
  // Thuế FTA chỉ nêu khi Cổng nói hàng được hưởng, và luôn kèm điều kiện C/O (mục B).
  // `boFta`: chưa biết xuất xứ thật của lô hàng thì KHÔNG nêu ưu đãi nào, dù Cổng có trả — vì câu trả
  // lời của Cổng khi đó dựa trên xuất xứ mặc định, không phải xuất xứ lô hàng ([S1] của #168).
  const fo = tx?.acfta?.forOrigin || tx?.taxAcftaChina;
  if (!boFta && fo?.eligible === true) {
    const a = canCuThue('acfta');
    if (a) them('acfta', a.so, a.hieuLuc, NHAN.acfta);
  }
  const vat = canCuThue('vat');
  if (vat) them('vat', vat.so, vat.hieuLuc, NHAN.vat);
  const ttx = canCuThue('tt');
  if (ttx) them('tt', ttx.so, ttx.hieuLuc, NHAN.tt);

  // Văn bản chính sách quản lý: danh mục HS của Cổng (hsListings) và văn bản thủ tục.
  for (const l of tx?.hsListings || []) {
    if (!l?.soHieu) continue;
    const nhan = l.loaiTacDong === 'CONG_BO_HOP_QUY' ? 'công bố hợp quy'
      : l.loaiTacDong ? String(l.loaiTacDong).toLowerCase().replace(/_/g, ' ')
        : 'chính sách quản lý';
    them('chinh-sach', goc(l.soHieu), ngayVN(l.effectiveFrom), nhan);
  }
  for (const v of ttData?.vanBanQuanLy || []) {
    const so = goc(v?.hieuLuc?.soHieu || v?.soHieu);
    if (so) them('chinh-sach', so, null, 'chính sách quản lý');
  }

  // Văn bản không dùng làm căn cứ chính — vẫn phải nêu được khi khách hỏi chi tiết, kèm lý do.
  for (const h of bang.values()) if (!h.dungDuoc) bo.push({ so: h.so, vi: h.vi || 'chưa đối chiếu hiệu lực' });

  // Tiền lệ phân loại TB-TCHQ: là căn cứ tham khảo, không phải văn bản quy phạm → tách riêng.
  const tl = [];
  for (const it of tlData?.items || []) {
    const so = it?.tbTchqNumber;
    if (!so) continue;
    const nhan = [it.girRule, ngayVN(it.issuedDate) ? `ngày ${ngayVN(it.issuedDate)}` : null].filter(Boolean).join(', ');
    tl.push({ so, nhan: nhan || 'tiền lệ phân loại' });
  }

  return { chinh, bo, tienLe: tl };
}

/**
 * Dòng căn cứ cho TIN ĐẦU: một dòng, tối đa 3 căn cứ, viết ngắn. null khi lượt không có dữ liệu căn cứ
 * (không bịa dòng "Căn cứ:" rỗng).
 */
export function dongCanCu(cc, { toiDa = 3 } = {}) {
  const ds = (cc?.chinh || []).slice(0, toiDa);
  if (!ds.length) return null;
  return `Căn cứ: ${ds.map((x) => `${soNgan(x.so)} (${x.nhan})`).join(', ')}`;
}

/** Khối căn cứ ĐẦY ĐỦ, chỉ gửi khi khách xin "chi tiết/căn cứ". Rỗng → null. */
export function khoiCanCuDayDu(cc) {
  const l = [];
  for (const x of cc?.chinh || []) {
    l.push(`• ${x.so} — ${x.nhan}${x.hieuLuc ? `, hiệu lực từ ${x.hieuLuc}` : ''}`);
  }
  for (const x of cc?.tienLe || []) l.push(`• ${x.so} — tiền lệ phân loại (${x.nhan})`);
  if (!l.length && !(cc?.bo || []).length) return null;
  const out = l.length ? ['Căn cứ em dựa vào ạ:', ...l] : [];
  if ((cc?.bo || []).length) {
    out.push('Văn bản em KHÔNG dùng làm căn cứ chính:');
    for (const x of cc.bo) out.push(`• ${x.so} — ${x.vi}`);
  }
  return out.join('\n');
}
