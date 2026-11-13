// packs/hs/so-tay-hoi.js — Hỏi lại bằng NGUỒN CÂU HỎI CHUNG, không tự dựng câu (issue #177, mục 1 và 6).
//
// Thứ tự ưu tiên của lớp hỏi lại: `hoSo.ketLuan.cauHoi` → `so_tay_questions` của Cổng → regex cũ
// (`dien-cho-thieu.js`, GIỮ LÀM DỰ PHÒNG). Cổng lỗi / hết giờ / trả rỗng thì tệp này trả
// `{ canHoi: false }` để chỗ gọi rơi về regex — KHÔNG im lặng và KHÔNG bịa câu hỏi (Điều II, III).
//
// Dùng lại y nguyên (đã tra sẵn, đừng viết lại):
//   - công cụ MCP `so_tay_questions`: `ozplugin/apps/gateway/src/tools/so-tay-questions.ts` (MIEN_PHI,
//     0 điểm, trên đường có khoá `POST /mcp` mà `core/mcp.js` đang dùng → không viết client HTTP mới);
//   - ba luật dựng tham số: `erp-xnk/src/lib/hs-kb-client.ts`, `hsKbSoTayQuestionsResult` (~1937).
//
// Tệp mới vì `packs/hs/dien-cho-thieu.js` đã 275/300 dòng (Điều VI) — lý do ghi ở `plan.md`.
import {
  CONG_SUAT_RE, DIEN_AP_RE, DUNG_TICH_RE, KICH_THUOC_RE, CHAT_LIEU_RE, CONG_DUNG_RE, QUY_CACH_RE,
  daNeu, gomCau, ketQuaHoi,
} from './ky-luat-hoi.js';

/** Hạn giờ riêng cho lời gọi `so_tay_questions`: quá giờ thì dự phòng, không để nghẽn cả lượt. */
export const HAN_GIO_MS = 6000;

const TOOL = 'so_tay_questions';
const TAT = new Set(['0', 'false', 'off', 'no', 'tat', 'khong']);

/** Khoá đại lượng của Cổng → khoá của `ky-luat-hoi.js` (để biết khách đã nêu điều đó chưa). */
const KHOA = {
  cong_suat: 'congSuat', congsuat: 'congSuat', power: 'congSuat',
  dien_ap: 'dienAp', dienap: 'dienAp', volt: 'dienAp', voltage: 'dienAp',
  dung_tich: 'dungTich', dungtich: 'dungTich', the_tich: 'dungTich',
  kich_thuoc: 'kichThuoc', kichthuoc: 'kichThuoc', duong_kinh: 'kichThuoc', kich_co: 'kichThuoc',
  do_day: 'kichThuoc', chieu_dai: 'kichThuoc', khoi_luong: 'kichThuoc', trong_luong: 'kichThuoc',
  chat_lieu: 'chatLieu', chatlieu: 'chatLieu', vat_lieu: 'chatLieu', material: 'chatLieu',
  cong_dung: 'congDung', congdung: 'congDung', muc_dich: 'congDung', ung_dung: 'congDung',
  quy_cach: 'quyCach', quycach: 'quyCach',
};

/** Khoá của `ky-luat-hoi.js` → khoá Cổng + regex đọc giá trị, để đẩy điều khách đã nêu vào `facts`. */
const DOC = [
  ['congSuat', 'cong_suat', CONG_SUAT_RE],
  ['dienAp', 'dien_ap', DIEN_AP_RE],
  ['dungTich', 'dung_tich', DUNG_TICH_RE],
  ['kichThuoc', 'kich_thuoc', KICH_THUOC_RE],
  ['chatLieu', 'chat_lieu', CHAT_LIEU_RE],
  ['congDung', 'cong_dung', CONG_DUNG_RE],
  ['quyCach', 'quy_cach', QUY_CACH_RE],
];

const gonTrang = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Cờ `HS_HO_SO` của hs-code-api. Mặc định BẬT; chỉ tắt khi khai rõ 0/false/off. */
export function batHoSo(env = {}) {
  const v = env && typeof env === 'object' ? env.HS_HO_SO : undefined;
  if (v === undefined || v === null || v === '') return true;
  if (v === false || v === 0) return false;
  return !TAT.has(String(v).trim().toLowerCase());
}

/**
 * Mã HS ỨNG VIÊN (≥6 chữ số) tìm trong các nguồn truyền vào theo thứ tự.
 * Gọi `so_tay_questions` với mã 4 chữ số gần như vô ích (đo 23/10: 4 số → câu chung,
 * ≥6 số → câu sắc), nên dưới 6 số coi như chưa có mã.
 * Bỏ cụm quá 8 chữ số: đó là số điện thoại / MST / số tài khoản của khách, KHÔNG phải mã HS —
 * không được lấy làm mã và không được gửi lên Cổng.
 */
export function maUngVien(...nguon) {
  for (const x of nguon) {
    const t = String(x || '');
    for (const cum of t.match(/\b\d{4}(?:[.\s-]?\d{2,4})*\b/g) || []) {
      const so = cum.replace(/\D/g, '');
      if (so.length >= 6 && so.length <= 8) return so.slice(0, 8);
    }
  }
  return null;
}

/**
 * Tham số gọi `so_tay_questions` theo đúng ba luật của `hsKbSoTayQuestionsResult`:
 * lọc chữ số và cắt 8 ký tự; dưới 4 chữ số thì trả `null` (không gọi mạng, tránh ăn 400 oan);
 * `productText` gộp khoảng trắng và RỖNG THÌ BỎ TRƯỜNG; `facts` chỉ gửi khi có.
 * Schema Cổng là `.strict()` → không thêm trường nào khác.
 * @returns {{hs: string, productText?: string, facts?: Record<string,string>}|null}
 */
export function thamSoSoTay({ hs, moTa, facts } = {}) {
  const ma = String(hs || '').replace(/\D/g, '').slice(0, 8);
  if (ma.length < 4) return null;
  const args = { hs: ma };
  const mo = gonTrang(moTa).slice(0, 2000);
  if (mo) args.productText = mo;
  const f = {};
  for (const [k, v] of Object.entries(facts || {})) {
    const giaTri = gonTrang(v);
    if (k && giaTri) f[k] = giaTri;
  }
  if (Object.keys(f).length) args.facts = f;
  return args;
}

/**
 * Dữ kiện khách ĐÃ NÊU, dạng `facts` của Cổng: `{ cong_suat: '350W', … }`.
 * Gửi lên để Cổng không hỏi lại điều khách vừa khai (kỷ luật hỏi, yêu cầu 2 của #177).
 * Chỉ gửi đại lượng kỹ thuật — không gửi tên, số điện thoại hay chữ nào khác của khách.
 */
export function factsDaNeu(sSach, hoSo) {
  const h = hoSo && typeof hoSo === 'object' ? hoSo : {};
  const them = [h.moTa, h.chatLieu, h.congDung, h.thongSo, h.model, ...(Array.isArray(h.sua) ? h.sua : [])]
    .map((x) => String(x || '').trim()).filter(Boolean).join(' ');
  const t = gonTrang(`${String(sSach || '')} ${them}`);
  const f = {};
  for (const [, khoaCong, re] of DOC) {
    const m = t.match(re);
    if (m && m[0]) f[khoaCong] = gonTrang(m[0]);
  }
  if (!f.chat_lieu && gonTrang(h.chatLieu)) f.chat_lieu = gonTrang(h.chatLieu);
  if (!f.cong_dung && gonTrang(h.congDung)) f.cong_dung = gonTrang(h.congDung);
  return f;
}

/** Một câu của Cổng (hoặc của hồ sơ) → mục cho `gomCau`: `dai` là đại lượng câu đó hỏi. */
function mucCau(q) {
  if (typeof q === 'string') return { cau: gonTrang(q), dai: [] };
  if (!q || typeof q !== 'object') return null;
  const cau = gonTrang(q.questionVi || q.cau || q.question || q.cauHoi);
  if (!cau) return null;
  const noi = KHOA[String(q.key || '').trim().toLowerCase()];
  return { cau, dai: noi ? [noi] : [], key: q.key || null, loai: q.loai || null };
}

/** Danh sách câu thô (chuỗi / mảng / mảng `{key, questionVi}`) → các mục hợp lệ. */
function docDanhSach(tho) {
  const arr = Array.isArray(tho) ? tho : [tho];
  return arr.map(mucCau).filter(Boolean);
}

/** Các mục câu hỏi → khuôn `ketQuaHoi(...)`; không còn câu nào thì `{ canHoi: false }`. */
function dungKetQua(muc, co, s) {
  const cauHoi = gomCau(muc, co);
  if (!cauHoi) return { canHoi: false, giaDinh: null, thieu: [] };
  const con = muc.filter((m) => !(m.dai || []).length || !m.dai.every((k) => co[k]));
  return ketQuaHoi({
    s,
    tenGoiY: null,
    thieu: con.map((m) => (m.dai && m.dai[0]) || m.key).filter(Boolean),
    cauHoi,
    giaDinh: null,
    hoiThuocTinh: con.some((m) => m.loai === 'thuoc_tinh'),
  });
}

/**
 * Mục 6 — hồ sơ đã có câu hỏi thì ĐỌC CÂU ĐÓ, không tự dựng.
 * `hoSo.ketLuan.cauHoi` do hs-code-api trả về khi cờ `HS_HO_SO` bật.
 * @param {object|null} hoSo
 * @param {{s?: string, env?: object}} [tuyChon] `env`: nơi đọc cờ (gói không tự đọc `process.env`).
 */
export function cauHoiTuHoSo(hoSo, { s = '', env = {} } = {}) {
  const trong = { canHoi: false, giaDinh: null, thieu: [] };
  if (!hoSo || typeof hoSo !== 'object' || !batHoSo(env)) return trong;
  const tho = hoSo.ketLuan && typeof hoSo.ketLuan === 'object' ? hoSo.ketLuan.cauHoi : null;
  if (!tho) return trong;
  const muc = docDanhSach(tho);
  if (!muc.length) return trong;
  return dungKetQua(muc, daNeu(String(s || ''), hoSo), s);
}

/** `ctx.tools` có liệt kê thì phải có công cụ; không liệt kê thì coi như có (giống `packages.js`). */
const coCongCu = (ctx) => !ctx?.tools || ctx.tools.has(TOOL);

/**
 * Gọi `callTool` với hạn giờ riêng — bọc `engine-ctx`/`bao-dang-tra` bỏ mất đối số thứ ba.
 *
 * KHÔNG `unref()` đồng hồ này: ta đang CHỜ nó để quyết dự phòng, nên nó phải neo vòng lặp sự
 * kiện. Có `unref()` thì trên Node 22 (bản CI dùng) vòng lặp cạn việc trước khi hạn giờ bắn và
 * node:test huỷ ca đang chạy cùng mọi ca sau — "Promise resolution is still pending but the
 * event loop has already resolved" (CI 43508123974, 43512075073; Node 24 ở máy thợ không lộ).
 * `clearTimeout` ở `finally` đã dọn đồng hồ ngay khi có kết quả nên nó không giữ tiến trình sống.
 */
function goiCoHan(ctx, args, hanGioMs) {
  let hen = null;
  const het = new Promise((_, loi) => {
    hen = setTimeout(() => loi(new Error('so_tay_questions: het gio')), hanGioMs);
  });
  return Promise.race([Promise.resolve().then(() => ctx.mcp.callTool(TOOL, args)), het])
    .finally(() => { if (hen) clearTimeout(hen); });
}

/**
 * Mục 1 — hỏi lại bằng câu của `so_tay_questions`.
 * Chỉ gọi khi đã có mã ứng viên ≥6 chữ số; lỗi / hết giờ / rỗng ⇒ `{ canHoi: false }` để chỗ gọi
 * rơi về regex cũ. Kết quả vẫn qua `gomCau` → tối đa 3 câu, MỘT tin.
 * @param {object} ctx mạch hiện tại (`ctx.mcp.callTool`, `ctx.tools`)
 * @param {{s: string, moTa?: string, hoSo?: object|null, hs?: string|null, hanGioMs?: number}} tuyChon
 */
export async function hoiTheoSoTay(ctx, { s = '', moTa = '', hoSo = null, hs = null, hanGioMs = HAN_GIO_MS } = {}) {
  const trong = { canHoi: false, giaDinh: null, thieu: [] };
  if (!ctx?.mcp?.callTool || !coCongCu(ctx)) return trong;
  const ma = maUngVien(hs, hoSo?.maHs, s, moTa);
  if (!ma) return trong;
  const co = daNeu(String(s || ''), hoSo);
  const args = thamSoSoTay({ hs: ma, moTa: moTa || s, facts: factsDaNeu(s, hoSo) });
  if (!args) return trong;
  let r = null;
  try {
    r = await goiCoHan(ctx, args, hanGioMs);
  } catch (e) {
    ctx.log?.warn?.('so_tay_questions loi, dung regex du phong', { loi: e?.message });
    return trong;
  }
  if (!r || r.isError || r.ok === false) return trong;
  const muc = docDanhSach(r.questions || r.data?.questions || r.result?.questions || []);
  if (!muc.length) return trong;
  return dungKetQua(muc, co, s);
}

/**
 * Thứ tự ưu tiên của lớp hỏi lại (mục 1 + 6): câu của HỒ SƠ → câu của `so_tay_questions`
 * → `duPhong` (regex cũ ở `dien-cho-thieu.js`). Hai nguồn trên im thì PHẢI còn regex đỡ:
 * không được im lặng với khách (Điều II).
 * @param {object} ctx
 * @param {{s: string, moTa?: string, hoSo?: object|null, hs?: string|null,
 *          duPhong?: () => object}} tuyChon `duPhong` gọi muộn, chỉ khi hai nguồn trên không có câu.
 */
export async function hoiLaiUuTien(ctx, { s = '', moTa = '', hoSo = null, hs = null, duPhong } = {}) {
  const tuHoSo = cauHoiTuHoSo(hoSo, { s, env: ctx?.env || {} });
  if (tuHoSo.canHoi) return tuHoSo;
  const tuSoTay = await hoiTheoSoTay(ctx, { s, moTa, hoSo, hs });
  if (tuSoTay.canHoi) return tuSoTay;
  return typeof duPhong === 'function' ? duPhong() : { canHoi: false, giaDinh: null, thieu: [] };
}
