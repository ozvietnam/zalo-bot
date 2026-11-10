// packs/hs/render-shtt.js — khối "rủi ro nhãn hiệu" (kiem_tra_shtt, kiem_tra_shtt_anh) — issue #169.
// Tách khỏi render.js để giữ Điều VI của hiến pháp (mỗi tệp dưới 300 dòng): bản vá #169 làm render.js
// phình từ 446 lên 585 dòng (soát #169 [S9]). Dùng clip/businessText/renderError của render.js,
// render.js KHÔNG import lại tệp này nên không có vòng import.
import { clip, businessText, renderError } from './render.js';

// Cổng trả khuôn khoá tiếng Anh lồng nhiều tầng (reasons/evidence/scope/suggestions/disclaimer). Trước đây khối này
// rơi vào renderGeneric nên khách Zalo đọc nguyên khoá JSON và thấy miễn trừ hai lần. Ở đây CHỈ lấy ra vài dữ kiện
// cần thiết rồi tự dựng câu tiếng Việt; dữ liệu không nhận dạng được thì nói thẳng là chưa xác định, không đổ ra.
export const MIEN_TRU_SHTT = 'ℹ️ Tra cứu tự động từ dữ liệu nhãn hiệu đã công bố, không phải ý kiến pháp lý.';
export const MIEN_TRU_SHTT_ANH = 'ℹ️ So logo bằng máy, chỉ để tham khảo, không phải ý kiến pháp lý.';
/** Dưới mức này thì không coi là "giống", khỏi báo động giả (soát #169 [S7]). */
export const NGUONG_GIONG_ANH = 60;

/**
 * Khách gõ từ chung chung vào ô thương hiệu ("oem", "no brand", "không nhãn hiệu"…): không kiểm sở hữu trí tuệ
 * (đèn ĐỎ sai + trừ điểm vô ích), chỉ nhắc một dòng — issue #169.
 */
export function nhacNhanChung(chu) {
  const t = clip(chu, 40);
  const hien = t.length <= 4 ? t.toUpperCase() : t;
  return `ℹ️ ${hien} không phải nhãn hiệu ạ — khi khai, anh/chị ghi "không nhãn hiệu" hoặc đúng nhãn in trên hàng nhé.`;
}

/**
 * Cổng ghép ô thương hiệu vào câu mô tả, nên khi ta gửi "không nhãn hiệu" thì câu trả về đọc thành
 * "nhãn hiệu không nhãn hiệu". Dọn lại trước khi đưa khách — issue #169.
 */
export const donNhanChung = (s) => String(s || '').replace(/nhãn hiệu\s+(không (?:có )?nhãn hiệu)/gi, '$1');

/** Giá trị đầu tiên có nội dung trong các khoá (Cổng đặt tên tiếng Việt lẫn tiếng Anh). */
const dauTien = (o, keys) => {
  for (const k of keys) {
    const v = o?.[k];
    if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) return v;
  }
  return null;
};

const KHOA_DANH_SACH = ['ketQua', 'evidence', 'nhanTrung', 'matches', 'results', 'items', 'danhSach'];

/** Danh sách nhãn đã đăng ký mà Cổng tìm thấy (khuôn nào cũng về một mảng). */
function nhanTimThay(d) {
  const v = dauTien(d || {}, KHOA_DANH_SACH);
  const arr = Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : [];
  return arr.map((x) => (typeof x === 'string' ? { ten: x } : x)).filter((x) => x && typeof x === 'object');
}

/**
 * Cổng có TRẢ danh sách hay không — kể cả mảng rỗng. Phân biệt "đã so, không thấy gì"
 * (`{ketQua: []}`) với "chưa so được" (bảo trì, khuôn khoá lạ): `dauTien` bỏ qua mảng rỗng
 * nên không dùng được cho việc này (soát #169 [S10]).
 */
const coTraDanhSach = (d) => KHOA_DANH_SACH.some((k) => Array.isArray(d?.[k]));
const tenNhanCua = (x) => String(dauTien(x, ['ten', 'tenNhan', 'nhan', 'nhanGiong', 'nhanHieu', 'name', 'markName', 'trademark']) || '').trim();
/**
 * Nhãn đại diện khi Cổng trả điểm tương đồng mà không trả tên: so logo bằng ảnh có thể khớp một
 * nhãn HÌNH (không có phần chữ). Bỏ mục đó đi là xoá mất cảnh báo — logo giống 99% mà khách được
 * bảo là an toàn (quyết của CEO `oz-quyet`, soát #169 vòng 4).
 */
const NHAN_HINH = 'Nhãn hình';

/**
 * Lý do Cổng nói kèm khi trả ok:true mà không có kết quả (`thongBao` là khoá có thật của tầng
 * Cổng — `core/mcp.js:105`, `core/engine-ctx.js:48`). Chỉ nhận câu tiếng Việt đã qua
 * `businessText`, để không đổ câu lỗi tiếng Anh hay mã HTTP ra cho khách.
 */
function tomTatThongBao(d) {
  const t = businessText(String(dauTien(d || {}, ['thongBao', 'ghiChu', 'note']) || ''));
  return t && /[àáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹý]/i.test(t)
    ? ` (${clip(t, 120)})` : '';
}

// Bảng mang CẢ bản có dấu và bản không dấu/tiếng Anh, vì so khớp làm trên chuỗi CÒN DẤU
// (xem motDen). Chuỗi 'do' không dấu nhập nhằng thật (ĐỎ hay liên từ "do"?) nên để riêng ở DEN_DUNG_BANG.
const DEN_NHAN = { 'đỏ': 'DO', red: 'DO', cao: 'DO', high: 'DO',
  'vàng': 'VANG', vang: 'VANG', yellow: 'VANG', 'trung bình': 'VANG', 'trung binh': 'VANG', medium: 'VANG',
  xanh: 'XANH', green: 'XANH', 'thấp': 'XANH', thap: 'XANH', low: 'XANH', none: 'XANH' };
/** Chỉ nhận khi vế ĐÚNG BẰNG chuỗi này, không nhận khi nó mở đầu một câu (soát #169 [S2] vòng 3). */
const DEN_DUNG_BANG = { do: 'DO' };
// Nhãn ô Cổng hay đặt trước giá trị. Sắp DÀI TRƯỚC: regex JS chọn nhánh đầu khớp được, không chọn
// nhánh dài nhất, nên để 'mức' trước 'mức độ' thì "mức độ thấp" bị bóc thành "độ thấp" (soát #169 [S2]).
const TIEN_TO_DEN = ['mức độ rủi ro', 'mức độ', 'độ tương đồng', 'độ rủi ro', 'độ giống', 'mức rủi ro', 'mức',
  'đèn rủi ro', 'đèn', 'rủi ro', 'muc do rui ro', 'muc do', 'do tuong dong', 'do rui ro', 'do giong',
  'muc rui ro', 'muc', 'den rui ro', 'den', 'rui ro', 'risk level', 'risk', 'light']
  .sort((a, b) => b.length - a.length);
const NANG = { DO: 3, VANG: 2, XANH: 1 };

/**
 * Một giá trị đèn thành 'DO'|'VANG'|'XANH'|null. Khoá `den`/`mucDo` của Cổng là chữ TỰ DO
 * ("ĐỎ — rủi ro cao", "Mức độ thấp", "Do chưa ai đăng ký, rủi ro thấp").
 *
 * So khớp trên chuỗi CÒN DẤU. Bỏ dấu là bước làm MẤT thông tin: `đỏ` (đèn), `độ` (mức độ,
 * độ giống) và `do` (liên từ tiếng Việt) đều thành "do", nên sau đó không cách nào phân biệt —
 * "Mức độ thấp" và "Độ giống thấp" từng ra đèn ĐỎ (soát #169 [S2] vòng 3). Chỉ đọc nhãn ở ĐẦU
 * từng vế tách theo `—`/`-`/`,`/`/`/`|`, sau khi bóc nhãn ô; không quét regex giữa câu.
 */
function motDen(raw) {
  if (raw == null) return null;
  const n = String(raw).toLowerCase().replace(/\s+/g, ' ').trim();
  for (const ve of n.split(/[—–\-,/|]+/)) {
    let t = ve.trim();
    // Bóc nhãn ô, có thể lồng ("đèn: mức độ cao"). TIEN_TO_DEN không chứa 'do'/'đỏ' nên câu
    // giải thích mở đầu bằng "Do …" không bị bóc thành giá trị đèn.
    for (let i = 0; i < 2; i += 1) {
      const tt = TIEN_TO_DEN.find((p) => t === p || t.startsWith(`${p} `) || t.startsWith(`${p}:`));
      if (!tt) break;
      t = t.slice(tt.length).replace(/^\s*:?\s*/, '').trim();
    }
    if (!t) continue;
    if (DEN_DUNG_BANG[t]) return DEN_DUNG_BANG[t];
    for (const [k, v] of Object.entries(DEN_NHAN)) if (t === k || t.startsWith(`${k} `)) return v;
  }
  return null;
}

/**
 * Đèn rủi ro: 'DO' | 'VANG' | 'XANH' | null (không đoán khi Cổng không nói).
 * Lấy mức NẶNG NHẤT trên gốc và TOÀN danh sách: nhãn ĐỎ nằm sau một mục XANH từng bị
 * lật thành xanh, tức trấn an khách khi đang có rủi ro cao (soát #169 [S1]).
 */
function denShtt(d) {
  let nang = null;
  for (const o of [d, ...nhanTimThay(d)]) {
    const den = motDen(dauTien(o || {}, ['den', 'light', 'mucRuiRo', 'nhanRuiRo', 'riskLevel', 'risk', 'mucDo']));
    if (den && (!nang || NANG[den] > NANG[nang])) nang = den;
  }
  return nang;
}

/** Nhóm Nice (nhóm hàng của nhãn) dạng "7, 11". */
function nhomNice(d) {
  const v = dauTien(d || {}, ['niceClasses', 'nhomNice', 'nhom', 'classes']) ?? dauTien(d?.scope || d?.phamVi || {}, ['niceClasses', 'nhomNice', 'nhom', 'classes']);
  const arr = Array.isArray(v) ? v : v == null ? [] : [v];
  const so = arr.map((x) => String(typeof x === 'object' ? x?.so ?? x?.class ?? '' : x).replace(/\D/g, '')).filter(Boolean);
  return so.length ? [...new Set(so)].slice(0, 6).join(', ') : null;
}

/** Chủ nhãn: lấy từ trường riêng, nếu không có thì bóc từ câu lý do tiếng Việt của Cổng. */
function chuNhanShtt(d) {
  const truong = dauTien(d || {}, ['chuNhan', 'chuSoHuu', 'nguoiSoHuu', 'chuDon', 'owner', 'applicant', 'holder']);
  if (truong) return clip(typeof truong === 'object' ? tenNhanCua(truong) || '' : truong, 140) || null;
  const lyDo = [dauTien(d || {}, ['reasons', 'lyDo', 'ketLuan', 'tomTat'])].flat().filter((x) => typeof x === 'string').join(' ');
  const m = lyDo.match(/ch[uủ]\s+nh[aã]n\s*(?:hi[eệ]u)?\s*[:\-]\s*([^.;\n]{2,140})/i);
  return m ? clip(m[1], 140) : null;
}

/**
 * Việc nên làm: câu Cổng gợi ý nếu sạch, không có thì câu mặc định theo đèn.
 *
 * `ketLuan`/`ketLuanVi` cũng là việc Cổng YÊU CẦU, không chỉ là lời bình: với KB7 Cổng trả
 * "Cần giấy uỷ quyền hoặc hợp đồng phân phối để tránh bị tạm giữ" nhưng khối này in câu mặc
 * định của đèn VÀNG ("gửi ảnh nhãn in trên hàng") — NHẸ HƠN việc Cổng đòi, tức bot tự hạ mức
 * yêu cầu của Cổng. Điều V: tri thức nằm ở Cổng, bot chỉ dẫn lại (soát #168 vòng 4).
 */
function viecNenLam(d, den) {
  const g = [dauTien(d || {}, ['suggestions', 'goiY', 'khuyenNghi', 'hanhDong', 'ketLuan', 'ketLuanVi'])].flat()
    .map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? String(dauTien(x, ['text', 'noiDung', 'moTa', 'viecVi', 'vi']) || '') : ''))
    .map((x) => businessText(x) || '').filter((x) => x && /[àáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹý]/i.test(x));
  if (g.length) return clip(g[0], 180);
  if (den === 'DO') return 'Nhập hàng mang nhãn này cần giấy uỷ quyền của chủ nhãn, không có thì nên đổi sang hàng không nhãn hiệu.';
  if (den === 'VANG') return 'Anh/chị gửi ảnh nhãn in trên hàng để em soát lại trước khi mở tờ khai nhé.';
  return null;
}

/**
 * Khối "rủi ro nhãn hiệu" cho khách Zalo (issue #169): tối đa 4 dòng tiếng Việt —
 * đèn + kết luận ngắn, chủ nhãn (nếu có), một việc nên làm, miễn trừ đúng MỘT lần.
 * Chứng cứ/nguồn/mốc dữ liệu chỉ hiện ở bản `chiTiet` (lệnh "chi tiết" của khách).
 * @param {object} r kết quả công cụ ({ok, data}) của kiem_tra_shtt / kiem_tra_shtt_anh
 * @param {{tenNhan?:string, chiTiet?:boolean, anh?:boolean}} o
 */
export function renderShtt(r, { tenNhan = '', chiTiet = false, anh = false } = {}) {
  if (!r) return '⚠️ Không có kết quả.';
  if (r.ok === false || r.isError) return renderError(r);
  const d = (r.data ?? r) || {};
  const ds = nhanTimThay(d);

  if (anh) {
    // Mỗi phần tử Cổng trả về thành một mục đọc được, HOẶC một mục không đọc được gì (đếm riêng).
    // Đọc được TÊN hoặc ĐIỂM là đủ để giữ mục: trước đây không có tên thì mục bị xoá hẳn, nên
    // `{ten:'', diem:0.99}` tụt xuống nhánh trấn an — Cổng đã thấy logo giống 99% mà khách được bảo
    // là an toàn. Không tên nhưng có điểm thì gán nhãn đại diện, vì so logo có thể khớp một nhãn
    // HÌNH không có phần chữ (quyết của CEO `oz-quyet`, soát #169 vòng 4).
    const doc = [];
    let khongDoc = 0;
    for (const x of ds) {
      const ten = tenNhanCua(x);
      const diem = Number(dauTien(x, ['diem', 'score', 'doGiong', 'similarity']) ?? NaN);
      const pct = Number.isFinite(diem) ? Math.round(diem <= 1 ? diem * 100 : diem) : null;
      if (!ten && pct == null) { khongDoc += 1; continue; }
      const nhan = ten || `${NHAN_HINH} (logo)`;
      doc.push({ chu: `${clip(nhan, 80)}${pct != null ? ` (giống ${pct}%)` : ''}`, pct });
    }
    // Dưới ngưỡng thì không báo động: so logo bằng máy luôn trả ra mục giống rất thấp, khuyên xin
    // uỷ quyền ở mức 8% là báo động giả (soát #169 [S7]). Không có điểm thì coi như đáng nêu.
    // Mục dưới ngưỡng KHÔNG bị xoá khỏi dữ liệu, chỉ xếp riêng: "đã so, mọi mục đều thấp" khác
    // hẳn "chưa so được" (soát #169 [S10]).
    const giong = doc.filter((m) => m.pct == null || m.pct >= NGUONG_GIONG_ANH).slice(0, chiTiet ? 8 : 3);

    // CHƯA SO ĐƯỢC: không đọc được mục nào, mà Cổng cũng không nói rõ là "đã so, danh sách rỗng"
    // (đang bảo trì, khuôn khoá lạ, data rỗng), hoặc có phần tử nhưng không đọc được gì từ nó.
    // Khẳng định an toàn ở đây là trấn an sai trong khi lượt này vẫn trừ điểm tài khoản — đúng lỗi
    // [S3] ở nhánh ảnh (Điều VII, VIII; soát #169 [S10]).
    if (!doc.length && (khongDoc > 0 || !coTraDanhSach(d))) {
      return [`ℹ️ Em chưa so được logo trong ảnh với dữ liệu nhãn hiệu ạ${tomTatThongBao(d)} — anh/chị gửi lại ảnh logo rõ hơn để em so lại nhé.`,
        MIEN_TRU_SHTT_ANH].join('\n');
    }
    // Chỉ kết luận "chưa thấy" khi danh sách thật sự rỗng, HOẶC mọi mục đọc được đều dưới ngưỡng
    // (quyết của CEO `oz-quyet`, vòng 4).
    if (!giong.length) {
      const l = ['✅ Em chưa thấy nhãn hiệu đã đăng ký nào giống logo trong ảnh ạ.'];
      // Mục dưới ngưỡng vẫn nêu ở bản "chi tiết" thay vì xoá hẳn: khách gõ "chi tiết" là muốn thấy
      // Cổng đã so với những nhãn nào (soát #169 [S10]).
      if (chiTiet && doc.length) l.push(`Giống thấp, không đáng lo: ${clip(doc.slice(0, 8).map((m) => m.chu).join('; '), 300)}`);
      l.push(MIEN_TRU_SHTT_ANH);
      return l.join('\n');
    }
    return [`🟡 Logo trong ảnh giống nhãn đã đăng ký: ${giong.map((m) => m.chu).join('; ')}.`,
      'Nhập hàng mang logo này thì anh/chị cần giấy uỷ quyền của chủ nhãn nhé.',
      MIEN_TRU_SHTT_ANH].join('\n');
  }

  const ten = clip(tenNhan || tenNhanCua(d) || ds.map(tenNhanCua).find(Boolean) || '', 80);
  const nhan = ten ? `Nhãn "${ten}"` : 'Nhãn hiệu này';
  const den = denShtt(d);
  const nhom = nhomNice(d);
  const l = [];
  if (den === 'DO') l.push(`{red}🔴{/red} ${nhan} đã có người đăng ký ở VN${nhom ? ` cho nhóm ${nhom}` : ''} — rủi ro cao nếu nhập hàng mang nhãn này.`);
  else if (den === 'VANG') l.push(`{orange}🟡{/orange} ${nhan} có đăng ký gần giống ở VN${nhom ? ` (nhóm ${nhom})` : ''} — cần soát lại trước khi nhập.`);
  else if (den === 'XANH') l.push(`🟢 ${nhan} chưa thấy ai đăng ký ở VN cho nhóm hàng này.`);
  // Không đọc được đèn = KHÔNG phân tích được, KHÔNG phải "không có rủi ro". Trước đây nhánh
  // không-đèn-không-danh-sách khẳng định 🟢 — hứa điều công cụ chưa làm được (soát #169 [S3]).
  else l.push(`ℹ️ ${nhan}: em chưa xác định được mức rủi ro${ds.length ? ' từ kết quả Cổng trả về' : ''} — anh/chị gửi ảnh nhãn in trên hàng để em kiểm lại nhé.`);

  const chu = chuNhanShtt(d);
  if (chu) l.push(`Chủ nhãn: ${chu}`);

  if (chiTiet) {
    const tenDs = [...new Set(ds.map(tenNhanCua).filter(Boolean))].slice(0, 5);
    if (tenDs.length) l.push(`Nhãn đã đăng ký tìm thấy: ${clip(tenDs.join(', '), 300)}`);
    const sc = d.scope || d.phamVi || {};
    const nguon = [dauTien(d, ['sources', 'nguonDuLieu']) ?? dauTien(sc, ['sources', 'nguonDuLieu'])].flat().filter((x) => typeof x === 'string');
    if (nguon.length) l.push(`Nguồn dữ liệu: ${clip(nguon.join(', '), 200)}`);
    const moc = dauTien(d, ['dataAsOf', 'asOf', 'mocDuLieu']) ?? dauTien(sc, ['dataAsOf', 'asOf', 'mocDuLieu']);
    if (moc) l.push(`Dữ liệu cập nhật: ${clip(moc, 40)}`);
  }

  const viec = viecNenLam(d, den);
  if (viec) l.push(`👉 ${viec}`);
  l.push(MIEN_TRU_SHTT);
  return l.join('\n');
}
