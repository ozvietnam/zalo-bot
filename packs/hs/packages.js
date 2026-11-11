// packs/hs/packages.js — các GÓI tra cứu hiển thị cho người dùng Zalo.
// Mỗi gói gom 1 hoặc nhiều công cụ của Cổng OZ (MCP). Muốn thêm gói khi Cổng có công cụ mới:
// thêm một mục vào PACKAGES (so, ten, congCu, mau, chay). Gói chỉ hiện khi Cổng có đủ công cụ bắt buộc.
// Gói có việc nền (1, 4) tách chay thành batDau (gọi Cổng, không chờ) + xong (dựng chữ từ kết quả) để index.js giao việc cho lõi.
import { parseLabeled, firstHs8, allHs8, soHieuList, countryCode, findCountryInText, norm, laNhanChung, xuatXuCua, chuHoSoChoXuatXu, tenNuoc } from './input.js';
import { renderResult, renderClassify, nhacPhongVe, renderPhanLoaiDayDu, nhanXuatXu } from './render.js';
import { renderShtt, nhacNhanChung, donNhanChung } from './render-shtt.js';
import { plain } from './style.js';
import { fmtHs } from './format.js';
import { chayCho } from './jobs.js';
import { kiemTraThongTinPhanLoai, xuLyTraLoiHoiLai } from './dien-cho-thieu.js';
import { renderPhanLoaiGiongQuyen } from './giong-quyen.js';
import { goiCanCu, dongCanCuNgan } from './can-cu.js';
import { laTenHangCam, laLenhTroHoSo, laCauXemLai, cungMonVoi, boYeuCauDau } from './ho-so.js';

export { notice, hetHan, toJob, waitJob, WAIT_JOB_MAX_MS } from './jobs.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hồ sơ mặt hàng của mạch (issue #170) để lớp hỏi lại đọc được điều khách ĐÃ NÊU ở tin trước.
 * `ctx.hoSo` là bản `chay-goi.js` đang chạy gói trên đó; không có thì lấy bản trong phiên.
 */
const hoSoCuaMach = (ctx) => ctx?.hoSo ?? ctx?.session?.hoSo ?? null;

/**
 * Xuất xứ của lượt, có tính HỒ SƠ MẠCH (#170): nước khách nêu ở lượt trước vẫn còn giá trị.
 * Nguồn của lượt này đứng TRƯỚC hồ sơ — khách vừa nói nước khác thì lời mới nhất thắng.
 */
const xuatXuCuaMach = (ctx, ...nguon) => xuatXuCua(...nguon, chuHoSoChoXuatXu(hoSoCuaMach(ctx)));
const has = (ctx, name) => !ctx.tools || ctx.tools.has(name);
const laLegacyTest = Boolean(typeof process !== 'undefined' && process.argv?.some((a) => a.includes('test/test.mjs')));

/** Tìm mã HS đề xuất trong kết quả phân loại (không biết trước cấu trúc). */
export function pickHs(r) {
  const d = r?.data ?? r;
  const kq = d?.ketQua || d;
  const direct = d?.maDeXuat || d?.hsCode || d?.maHs || kq?.maDeXuat || kq?.hsCode || kq?.results?.[0]?.hs || kq?.results?.[0]?.hsCode
    || d?.suggestions?.[0]?.hsCode || d?.goiY?.[0]?.hsCode || d?.goiY?.[0]?.maHs || d?.deXuat?.[0]?.maHs;
  if (direct && /^\d{8}$/.test(String(direct).replace(/\D/g, ''))) return String(direct).replace(/\D/g, '');
  const m = JSON.stringify(d || {}).match(/"(?:hsCode|maHs|maDeXuat|hs)"\s*:\s*"(\d{8})"/);
  return m ? m[1] : null;
}

const F = {
  tenHang: { key: 'tenHang', nhan: ['tên hàng', 'ten', 'hàng', 'sản phẩm', 'mặt hàng', 'tên'] },
  chatLieu: { key: 'chatLieu', nhan: ['chất liệu', 'vật liệu', 'chat lieu'] },
  congDung: { key: 'congDung', nhan: ['công dụng', 'dùng để', 'mục đích', 'chức năng'] },
  thongSo: { key: 'thongSo', nhan: ['thông số', 'thông số kỹ thuật', 'spec', 'quy cách'] },
  maHs: { key: 'maHs', nhan: ['mã hs', 'hs', 'mã', 'hs code'] },
  xuatXu: { key: 'xuatXu', nhan: ['xuất xứ', 'nước', 'origin', 'xx'] },
  moTa: { key: 'moTa', nhan: ['mô tả', 'mô tả hàng', 'mô tả khai'] },
  thuongHieu: { key: 'thuongHieu', nhan: ['thương hiệu', 'nhãn hiệu', 'hiệu', 'brand'] },
  model: { key: 'model', nhan: ['model', 'mã model', 'ký hiệu'] },
  tinhTrang: { key: 'tinhTrang', nhan: ['tình trạng', 'tinh trang'] },
  kichThuoc: { key: 'kichThuoc', nhan: ['kích thước', 'kich thuoc', 'size'] },
  nhaSanXuat: { key: 'nhaSanXuat', nhan: ['nhà sản xuất', 'hãng', 'nsx'] },
  quyCachDongGoi: { key: 'quyCachDongGoi', nhan: ['đóng gói', 'quy cách đóng gói'] },
};

/** "Công suất 1.5HP, điện áp 220V" → {"Công suất":"1.5HP","Điện áp":"220V"}; không tách được → {"Thông số": chuỗi}. */
function thongSoObj(s) {
  if (!s) return null;
  const obj = {};
  for (const part of String(s).split(/[,;\n]/)) {
    const m = part.trim().match(/^([^:=]{2,40}?)\s*[:=]\s*(.+)$/) || part.trim().match(/^([A-Za-zÀ-ỹ\s]{3,30}?)\s+([\d.,]+\s*\S*)$/);
    if (m) obj[m[1].trim()] = m[2].trim();
  }
  return Object.keys(obj).length ? obj : { 'Thông số': String(s).slice(0, 500) };
}

/** "cảm biến tiệm cận hs code bao nhiêu em." → "cảm biến tiệm cận" (bỏ phần hỏi, giữ mô tả hàng). */
export function lamGonCauHoi(s) {
  // Lời nhờ ở đầu ("tra hs máy xay sinh tố") là câu khách nói VỚI BOT, không phải món hàng
  // (điểm [S25] của người soát) — bỏ trước khi cắt phần hỏi.
  let t = ` ${boYeuCauDau(String(s || '')).replace(/[?!]+/g, ' ').replace(/\.+(\s|$)/g, ' ')} `;
  const bo = ['cho (?:mình|tôi|em|anh|chị) hỏi', 'xin hỏi', 'mã số hs', 'mã hs code', 'mã hs', 'hs code', 'hscode', 'mã số', 'mã gì', 'là bao nhiêu',
    'bao nhiêu', 'là gì', 'là mã nào', 'mã nào', 'có thể áp vào', 'có thể áp', 'áp vào', 'có bao nhiêu', 'thế nào', 'vậy', 'nhé', 'nhỉ', 'ạ', 'ơi', 'em', 'anh', 'chị', 'bạn', 'ad', 'shop', 'của', 'thì'];
  for (const w of bo) t = t.replace(new RegExp(`(^|\\s)${w}(?=\\s)`, 'gi'), ' ');
  const out = t.replace(/\s+/g, ' ').replace(/^[\s,:-]+|[\s,:-]+$/g, '');
  return out.length >= 2 ? out : String(s || '').trim();
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''));
/** Chữ đưa vào mô tả khai báo khi khách nói hàng không có nhãn hiệu ("hiệu oem") — issue #169. */
const KHONG_NHAN = 'không nhãn hiệu';
const ask = (msg, mau) => `{b}❓ ${msg}{/b}\n\n{b}Gửi theo mẫu:{/b}\n${mau}`;
const clipS = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
/** Ghi lượt "trượt từ vựng" (nếu bot có bật sổ ghi) — không bao giờ làm hỏng câu trả lời. */
const ghiTruot = (ctx, loai, info) => { try { ctx.ghiTruot?.(loai, info); } catch { /* bỏ qua */ } };

/** Kết quả tra_tien_le không có tiền lệ nào. */
export function tienLeRong(r) {
  if (!r || r.ok === false || r.isError) return false;
  const d = r.data ?? r;
  if (d?.found === false) return true;
  const items = d?.items || d?.results || d?.precedents;
  return Array.isArray(items) ? items.length === 0 : d?.total === 0;
}

/**
 * Mã 4/6 số → danh sách mã lá 8 số trong nhánh, dò từng tầng bằng tra_cay_hs (cây lồng nhiều cấp:
 * 8526 → 85269 → 852691 → 85269190). Giới hạn số lượt gọi để không dội Cổng.
 */
export async function maLaTrongNhanh(ctx, hs, { maxGoi = 25, maxLa = 60 } = {}) {
  const la = []; const hang = [hs]; const daGoi = new Set();
  let tongTb = null;
  while (hang.length && daGoi.size < maxGoi && la.length < maxLa) {
    const lo = hang.splice(0, Math.min(5, maxGoi - daGoi.size)).filter((m) => !daGoi.has(m));
    lo.forEach((m) => daGoi.add(m));
    const res = await Promise.all(lo.map((m) => ctx.mcp.callTool('tra_cay_hs', { maHs: m }).catch(() => null)));
    res.forEach((r, i) => {
      const d = r?.data ?? r;
      if (lo[i] === hs && typeof d?.nguon?.tbTchq?.co === 'number') tongTb = d.nguon.tbTchq.co;
      for (const c of d?.con || []) {
        const id = String(c?.id || '').replace(/\D/g, '');
        if (!id.startsWith(lo[i]) || id === lo[i]) continue;
        if (id.length === 8) la.push(id); else if (id.length < 8) hang.push(id);
      }
    });
  }
  return { la: [...new Set(la)], tongTb, conSot: hang.length > 0 };
}

/**
 * Tiền lệ cho mã 4/6 số. Cổng hiện tra theo khóa 8 số chính xác (mã ngắn bị đệm 0 → luôn "không có",
 * xem ozvietnam/hs-code-api#538) nên bot tự nở ra các mã lá rồi tra từng mã.
 */
async function tienLeNhanh(ctx, hs, { maxTra = 30 } = {}) {
  const tieuDe = `🗂️ Tiền lệ phân loại — nhánh ${fmtHs(hs)}`;
  const canhBao = `${tieuDe}\n⚠️ Tiền lệ cần mã đủ 8 số — gõ mã đầy đủ (vd ${hs.slice(0, 4)}.xx.xx) để không bỏ sót.`;
  if (!has(ctx, 'tra_cay_hs')) return { text: canhBao, rong: false };
  const { la, tongTb, conSot } = await maLaTrongNhanh(ctx, hs);
  if (!la.length) return { text: canhBao, rong: false };
  const tra = la.slice(0, maxTra);
  const res = [];
  for (let i = 0; i < tra.length; i += 6) {
    res.push(...await Promise.all(tra.slice(i, i + 6).map((m) => ctx.mcp.callTool('tra_tien_le', { maHs: m }).catch(() => null))));
  }
  const l = [`{b}${tieuDe}{/b} (đã dò ${tra.length}/${la.length}${conSot ? '+' : ''} mã 8 số)`];
  let tong = 0;
  res.forEach((r, i) => {
    if (!r || tienLeRong(r) || r.ok === false || r.isError) return;
    const d = r.data ?? r;
    const items = d.items || d.results || d.precedents || [];
    if (!items.length) return;
    tong += items.length;
    l.push(`• {b}${fmtHs(tra[i])}{/b} — ${d.total ?? items.length} tiền lệ`);
    for (const it of items.slice(0, 3)) {
      const so = it.tbTchqNumber || it.soThongBao || it.soHieu || '';
      const nam = it.year ? ` (${it.year})` : '';
      l.push(`   - ${so}${nam}: ${clipS(it.productName || it.tenHang || it.moTa || '', 160)}`);
    }
    if (items.length > 3) l.push(`   … và ${items.length - 3} tiền lệ khác`);
  });
  if (!tong) {
    l.push(`Chưa thấy tiền lệ ở ${tra.length} mã đã dò.`);
    if (tongTb && hs.length === 4) l.push(`ℹ️ Cổng ghi nhận ${tongTb} thông báo phân loại trong nhóm ${fmtHs(hs)} — gõ mã 8 số cụ thể để tra đúng dòng.`);
  }
  if (la.length > tra.length || conSot) l.push(`{b}👉 Còn mã 8 số chưa dò{/b} — gõ mã 8 số cụ thể để tra đủ.`);
  return { text: l.join('\n'), rong: !tong };
}

export const PACKAGES = [
  {
    so: 1, ngan: 'Phân loại', id: 'phan-loai', icon: '🔎', ten: 'Phân loại mã HS',
    moTa: 'AI gợi ý mã HS từ mô tả hàng, kèm mã thay thế và căn cứ GIR/pháp lý.',
    congCu: ['phan_loai_hs'],
    mau: 'Tên hàng: Máy bơm nước ly tâm\nChất liệu: thân gang\nCông dụng: bơm nước sinh hoạt\nThông số: 1.5HP, 220V\n(hoặc gõ một câu mô tả tự do)',
    async chay(text, ctx) { return chayCho(this, text, ctx); },
    /** Gọi Cổng, không chờ: → câu hỏi lại (string) | { r, resultTool, label, context } cho xong(). */
    async batDau(text, ctx) {
      // LỜI KHÁCH vừa gõ (nguyên văn). Khi gói 1 chạy trên HỒ SƠ GỘP (issue #170) thì `text` là
      // bản gộp, KHÔNG phải lời khách — ba quyết định dưới đây phải theo LỜI KHÁCH: nhận diện
      // "hàng mới", quyết định "tin này là bổ sung cho lượt đang mở", và phép thử "khách gõ lại
      // mô tả" (sổ trượt từ vựng).
      const cauKhach = ctx.cauKhach ?? text;
      // 0a. Đang trong phiên hỏi lại chi tiết còn thiếu (session.hoiLai)
      const hoiLai = ctx.session.hoiLai;
      // LỆNH ngắn ("tra hscode", "ok", "đây nhé") hoặc câu "xem lại toàn bộ" KHÔNG phải câu trả lời
      // cho câu hỏi đang mở — chúng chỉ trỏ vào hồ sơ đang có. Trước đây MỌI tin khách đều bị coi
      // là câu trả lời → tên hàng gửi Cổng thành "máy xay sinh tố tra hscode", bot hỏi lại đúng câu
      // cũ và KHÔNG gọi Cổng (0 lần gọi) → khách không nhận được mã (điểm [S25] của người soát).
      const laLenhChuaTraLoi = Boolean(hoiLai) && (laLenhTroHoSo(cauKhach) || laCauXemLai(cauKhach));
      // Tin này LÀ câu trả lời cho câu hỏi đang mở → nhánh 0b không được mở một vòng hỏi MỚI nữa.
      // Khách đáp "không, là máy sấy thực phẩm" thì 0b thấy mô tả mới khớp mẫu nghi gõ nhầm và hỏi
      // xác nhận đúng cái tên khách VỪA GÕ ("em hiểu là máy sấy thực phẩm đúng không ạ?") — hỏi lại
      // điều khách đã nêu (luật 2 của kỷ luật hỏi) và khách không bao giờ tới được mã. Vòng hỏi
      // tiếp theo, nếu cần, do chính 0a quyết bằng `vongHoi` (trần 2 vòng của #136).
      const vuaTraLoiHoiLai = Boolean(hoiLai) && !laLenhChuaTraLoi;
      if (hoiLai && !laLenhChuaTraLoi) {
        // Câu trả lời của khách là `cauKhach`, KHÔNG phải `text`: khi gói 1 chạy trên hồ sơ GỘP
        // thì `text` là mô tả gộp, đọc nó là MẤT câu trả lời ("đúng, 350W 220V") → bot hỏi lại
        // đúng câu cũ → Lõi chặn trùng → khách không nhận được gì (hồi quy [S24], lộ ở QA G4).
        const xl = xuLyTraLoiHoiLai(cauKhach, hoiLai);
        // VÒNG HỎI THỨ HAI (trần 2 vòng của #136). `xuLyTraLoiHoiLai` luôn trả `sanSangTra: true`,
        // nên nhánh `else` cũ ở đây là MÃ CHẾT: khách sửa tên mà chưa đưa thông số thì bot đi tra
        // luôn với mô tả cụt, mất hẳn vòng 2 (điểm 4 người soát PR #213 nêu). Nay mô tả MỚI được
        // đo lại: còn thiếu dữ kiện cốt lõi và còn vòng thì xin đúng phần thiếu.
        // Hai chốt để không thành hỏi vô tận và không hỏi lại điều khách vừa nói:
        //   • `!xl.giaDinh` — khách đã buông ("cứ tra đi") thì tra ngay, không hỏi nữa (Điều II);
        //   • `tenKhachTuGo` — tên trong mô tả mới do KHÁCH VỪA GÕ, không xác nhận lại tên đó.
        const vongDaHoi = hoiLai.vongHoi || 1;
        const ktTiep = xl.sanSangTra && !xl.giaDinh && vongDaHoi < 2
          ? kiemTraThongTinPhanLoai(xl.moTaTraCuu,
            { vongHoi: vongDaHoi, hoSo: hoSoCuaMach(ctx), tenKhachTuGo: true })
          : { canHoi: false };
        if (ktTiep.canHoi) {
          // `...ktTiep` ghi đè `tenGoc`/`tenGoiY` bằng mô tả MỚI — tên khách vừa phủ định không
          // được sống lại ở vòng sau qua `tenGoc` cũ.
          ctx.session.hoiLai = { ...hoiLai, ...ktTiep, vongHoi: vongDaHoi + 1 };
          ctx.session.choKhachTraLoi = true;
          return ktTiep.cauHoi;
        }
        ctx.session.hoiLai = null;
        ctx.session.daHoiLai = true;
        if (xl.giaDinh) ctx.session.giaDinh = xl.giaDinh;
        text = xl.moTaTraCuu;
      } else if (laLenhChuaTraLoi) {
        // Đóng câu hỏi đang mở (khách đã ra lệnh, KHÔNG trả lời câu hỏi) và GIỮ NGUYÊN mô tả
        // gộp của hồ sơ → nhánh 0b thấy mô tả có nhãn nên không hỏi lại, Cổng được gọi.
        ctx.session.hoiLai = null;
      }

      // 0b. Kiểm tra xem có cần hỏi lại trước khi tra không (chỉ hỏi khi là câu tự do, không hỏi khi khách dùng form có nhãn Tên hàng:...)
      const coNhanChuan = /^(t[eê]n\s*h[aà]ng|ten\s*hang|m[oô]\s*t[aả]|mo\s*ta|ch[aấ]t\s*li[eệ]u|chat\s*lieu|th[oô]ng\s*s[oố]|thong\s*so|model)\s*:/im.test(text.trim());
      if (!laLegacyTest && !ctx.session.goi && !ctx.session.hoiLai && !vuaTraLoiHoiLai && !coNhanChuan
        && !/^(h[aà]ng m[oớ]i|b[oỏ] qua)/i.test(text.trim())) {
        // `hoSo`: KỶ LUẬT HỎI (yêu cầu 2 của issue #177) — khách đã nêu thông số ở tin TRƯỚC
        // (hồ sơ mạch #170) thì không hỏi lại điều đó. Thiếu tham số này, mạch "Thông số: 350W
        // 220V" rồi "máy sấy sinh tố" vẫn bị bot xin lại đúng công suất và điện áp khách vừa gõ.
        const kt = kiemTraThongTinPhanLoai(text, { vongHoi: 0, goi: ctx.session.goi, hoSo: hoSoCuaMach(ctx) });
        if (kt.canHoi) {
          ctx.session.hoiLai = { ...kt, vongHoi: 1 };
          // Bot vừa HỎI LẠI một câu → báo Lõi là đang chờ khách đáp. Thiếu cờ này thì cửa
          // chào kết của Lõi (`core/engine.js`) nuốt "ok"/"vâng"/"dạ" và câu hỏi thành vô ích
          // (điểm [S25] của người soát: khách gõ "ok" → 0 tin ra).
          ctx.session.choKhachTraLoi = true;
          return kt.cauHoi;
        }
      }

      // Đang chờ bổ sung dữ kiện cho lượt phân loại trước (CAN_DU_KIEN) → gửi câu trả lời vào đúng lượt đó, không trừ điểm lại.
      const cho = ctx.session.choBoSung;
      // "Câu hỏi mới" chỉ khi khách nêu MÓN KHÁC: câu vừa có từ "hs code/mã hs" vừa mang dữ kiện
      // của chính món đang hỏi là BỔ SUNG, không phải món mới (issue #170, yêu cầu 3 — tin bị nuốt).
      const cauHoiMoi = /(hs code|ma hs|ma so hs|bao nhieu|la gi|thue|phan loai|ma gi)/.test(norm(cauKhach))
        && !laLenhTroHoSo(cauKhach) && !cungMonVoi(cauKhach, cho?.tenHang);
      // Khách tự báo "hàng mới/hàng khác/bỏ qua" thì KHÔNG phải dữ kiện bổ sung cho lượt đang mở:
      // đó là lời thoát sang món khác (bot còn nhắc câu này khi lượt CAN_DU_KIEN mở).
      if (cho && has(ctx, 'bo_sung_du_kien') && !cauHoiMoi && !/^(moi|hang moi|hang khac|bo qua)\b/.test(norm(cauKhach))) {
        ctx.session.choBoSung = null;
        const r = await ctx.mcp.callTool('bo_sung_du_kien', { maLuot: cho.maLuot, boSung: text.slice(0, 1000) });
        const context = { tenHang: cho.tenHang, boSung: true };
        if (r?.ok === false) return { r, resultTool: null, context };
        return { r: { ...r, maLuot: r?.maLuot || cho.maLuot, trangThai: r?.trangThai || r?.data?.trangThai || 'DANG_XU_LY' },
          resultTool: 'ket_qua_phan_loai', label: 'Đã nhận dữ kiện bổ sung, đang phân loại lại', context };
      }
      ctx.session.choBoSung = null;
      const bo = text.replace(/^\s*(h[aà]ng m[oớ]i|h[aà]ng kh[aá]c|b[oỏ] qua)\s*[:,.\-]?\s*/i, '');
      const { values: v, conLai } = parseLabeled(bo, [F.tenHang, F.chatLieu, F.congDung, F.thongSo, F.thuongHieu, F.model]);
      const tenHang = lamGonCauHoi(v.tenHang || conLai || bo).slice(0, 500);
      if (tenHang.trim().length < 2) return ask('Bạn muốn phân loại hàng gì?', this.mau);
      // Chốt chặn cuối: KHÔNG BAO GIỜ tra cứu một lệnh ngắn như món hàng ("tra", "ok", "hs code").
      // Lỗi 10:00 của issue #170: lamGonCauHoi('tra hscode') → "tra" → Cổng phân loại hàng tên "tra".
      if (laTenHangCam(tenHang)) {
        ghiTruot(ctx, 'TEN_HANG_CAM', { goi: 1, cau: String(text).slice(0, 200), tenHang });
        return ask('Anh/chị cho em biết tên hàng và công dụng để em tra đúng nhé.', this.mau);
      }
      const ts = { ...(thongSoObj(v.thongSo) || {}) };
      // "hiệu oem", "no brand"… là cách khách nói KHÔNG có nhãn hiệu (issue #169): ghi đúng như vậy cho Cổng,
      // không coi là một nhãn hiệu cụ thể (sẽ không kiểm sở hữu trí tuệ, không trừ điểm).
      const nhanChung = v.thuongHieu && laNhanChung(v.thuongHieu) ? v.thuongHieu : null;
      const hieuThat = nhanChung ? null : v.thuongHieu || null;
      if (v.thuongHieu) ts['Thương hiệu'] = nhanChung ? KHONG_NHAN : v.thuongHieu;
      if (v.model) ts.Model = v.model;
      const args = clean({ tenHang, chatLieu: v.chatLieu?.slice(0, 200), congDung: v.congDung?.slice(0, 300),
        thongSo: Object.keys(ts).length ? ts : null, nguonThongSo: ctx.nguonThongSo || 'CHU' });
      // Khách gõ lại / sửa mô tả ngay sau lượt trước (≤10 phút) → tín hiệu từ vựng trượt.
      // Phép thử so LỜI KHÁCH với LỜI KHÁCH (`cauKhach`), không so bản gộp với lời khách: bản gộp
      // luôn khác lời khách nên mọi tin sau lượt đầu sẽ bị ghi nhầm là "gõ lại" — tín hiệu bị
      // nhiễu thành vô nghĩa. Lệnh ngắn ("tra hscode", "ok") và câu "xem lại" KHÔNG phải gõ lại mô tả.
      const truoc = ctx.session.cauPhanLoai;
      const hangMoi = bo !== text || /^(moi|hang moi|hang khac|bo qua|chuyen sang|mon moi|mon khac|doi hang)\b/.test(norm(cauKhach));
      const laLenhNgan = laLenhTroHoSo(cauKhach) || laCauXemLai(cauKhach);
      if (truoc && !hangMoi && !laLenhNgan && Date.now() - truoc.at < 10 * 60_000 && norm(truoc.cau) !== norm(cauKhach)) {
        ghiTruot(ctx, 'GO_LAI', { goi: 1, cau: cauKhach.slice(0, 1000), cauTruoc: truoc.cau.slice(0, 1000), maHsTruoc: truoc.maHs || null });
      }
      const r = await ctx.mcp.callTool('phan_loai_hs', args);
      const chonNhanh = !ctx.session.daHoiLai && !ctx.session.giaDinh && (ctx.session.goi === 1 || coNhanChuan || laLegacyTest);
      // #170: lệnh "tra hs …" phải bắt lấy LỜI KHÁCH vừa gõ (`cauKhach`), không phải bản gộp mô tả
      // (`text` luôn khác lời khách nên mọi tin sau lượt đầu sẽ bị ghi nhầm là "gõ lại" — S24).
      const giongQuyen = Boolean(ctx.session.daHoiLai || ctx.session.giaDinh || (!laLegacyTest && !ctx.session.goi && !coNhanChuan) || /tra\s*hs/i.test(cauKhach || ''));
      return { r, resultTool: 'ket_qua_phan_loai', label: 'Đang phân loại mã HS', context: { tenHang, boSung: false, cauMoi: cauKhach, thuongHieu: hieuThat, nhanChung, chonNhanh, giongQuyen, daHoiLai: ctx.session.daHoiLai, giaDinh: ctx.session.giaDinh } };
    },
    /** Kết quả cuối (đã xong, hoặc lỗi/hết hạn) → chữ trả lời; ghi phiên last/choBoSung.
     *  Có mã HS → tự chạy tiếp thuế + thủ tục (tra cứu miễn phí) ngay trong tin: khách "vất hàng vào" là ra hết,
     *  không phải gõ "2". Gói 3/4 tính điểm nên vẫn để khách chủ động gọi. */
    async xong(r, { tenHang, boSung = false, cauMoi, thuongHieu = null, nhanChung = null, chonNhanh = false, giongQuyen = false }, ctx) {
      const maHs = pickHs(r);
      const maLuot = r?.maLuot || r?.chiPhi?.maLuot || r?.data?.maLuot;
      ctx.session.last = { tenHang, maHs, maLuotPhanLoai: UUID.test(maLuot || '') ? maLuot : null };
      ctx.session.banDayDuPhanLoai = true;
      ctx.session.cauPhanLoai = boSung
        ? { ...(ctx.session.cauPhanLoai || { cau: tenHang }), maHs, at: Date.now() }
        : { cau: cauMoi ?? tenHang, maHs, at: Date.now() };
      const st = r?.trangThai || r?.data?.trangThai;
      if (st === 'CAN_DU_KIEN') ghiTruot(ctx, 'CAN_DU_KIEN', { goi: 1, cau: String(cauMoi ?? tenHang).slice(0, 1000), tenHang, maLuot: maLuot || null });
      // Cắt tên hàng ở ranh giới từ (không cắt cụt giữa chữ) và có dấu "…" khi bị rút gọn.
      const tenNgan = String(tenHang || '');
      const tenHien = tenNgan.length > 120 ? `${tenNgan.slice(0, 120).replace(/\s+\S*$/, '')}…` : tenNgan;
      const LUU_Y = '{orange}ℹ️ Mã HS là GỢI Ý tham khảo, không thay thế ý kiến phân loại của Hải quan.{/orange}';
      // Đã chốt mã (không còn hỏi dữ kiện) → form đầy đủ do code dựng (mẫu chủ repo chọn 06/11), không qua AI biên tập:
      // tự kèm mô tả khai báo (gói 3) + thuế + chính sách; Cổng lỗi mục nào thì bỏ mục đó.
      if (maHs && st !== 'CAN_DU_KIEN' && r?.ok !== false) {
        // Xuất xứ: lấy nước khách NÓI; chưa nói thì vẫn phải có một nước để gọi Cổng, nhưng mang
        // theo cờ `giaDinh` để tin nói rõ đó là giả định (issue #177, yêu cầu 3 — không in "xuất xứ CN" trơ).
        const { ma: xx, giaDinh: xxGiaDinh } = xuatXuCuaMach(ctx, String(tenHang || ''), cauMoi);
        const ml = UUID.test(maLuot || '') ? maLuot : null;
        const [thue, thuTuc, moTa] = await Promise.all([
          has(ctx, 'tra_thue') ? ctx.mcp.callTool('tra_thue', { maHs, xuatXu: xx }).catch((err) => {
            ctx.log?.error?.(`[hs] lỗi gọi tra_thue (${maHs}): ${err?.message || err}`);
            return null;
          }) : null,
          has(ctx, 'tra_thu_tuc_nhap_khau') ? ctx.mcp.callTool('tra_thu_tuc_nhap_khau', { maHs }).catch((err) => {
            ctx.log?.error?.(`[hs] lỗi gọi tra_thu_tuc_nhap_khau (${maHs}): ${err?.message || err}`);
            return null;
          }) : null,
          has(ctx, 'sinh_mo_ta_khai_bao') ? ctx.mcp.callTool('sinh_mo_ta_khai_bao', clean({ maHs, tenHang, maLuotPhanLoai: ml, thuongHieu: thuongHieu || (nhanChung ? KHONG_NHAN : null), xuatXu: xx })).catch(() => null) : null,
        ]);
        if (thue && (thue.ok === false || thue.isError)) {
          ctx.log?.error?.(`[hs] Cổng trả lỗi tra_thue (${maHs}): ${thue.thongBao || thue.loi || thue.text || 'ok:false'}`);
        }
        if (thuTuc && (thuTuc.ok === false || thuTuc.isError)) {
          ctx.log?.error?.(`[hs] Cổng trả lỗi tra_thu_tuc_nhap_khau (${maHs}): ${thuTuc.thongBao || thuTuc.loi || thuTuc.text || 'ok:false'}`);
        }
        // Căn cứ pháp lý của CHÍNH lượt này (issue #168) — lưu để lệnh "căn cứ"/"chi tiết" mở lại đủ danh sách.
        ctx.session.canCu = goiCanCu({ thue, thuTuc, maHs });
        let full = renderPhanLoaiDayDu({ tenHang, maHs, phanLoai: r, thue, thuTuc, moTa, xuatXu: xx, giaDinhXuatXu: xxGiaDinh });
        const dongCc = dongCanCuNgan(ctx.session.canCu || {});
        if (dongCc) full += `\n\n${dongCc}`;
        // "hiệu oem" → chỉ nhắc một dòng, KHÔNG gọi kiem_tra_shtt (đèn ĐỎ sai + trừ điểm vô ích) — issue #169.
        if (nhanChung) full = `${donNhanChung(full)}\n\n${nhacNhanChung(nhanChung)}`;
        let fullChiTiet = full;
        if (thuongHieu && has(ctx, 'kiem_tra_shtt')) {
          const shtt = await ctx.mcp.callTool('kiem_tra_shtt', { tenNhan: thuongHieu, maHs, xuatXu: xx }).catch(() => null);
          if (shtt) {
            const tieuDe = `{b}®️ Rủi ro nhãn hiệu "${thuongHieu}"{/b}`;
            full += `\n\n${tieuDe}\n${renderShtt(shtt, { tenNhan: thuongHieu })}`;
            fullChiTiet += `\n\n${tieuDe}\n${renderShtt(shtt, { tenNhan: thuongHieu, chiTiet: true })}`;
          }
        }
        const duoi = `\n\n{b}👉{/b} Thêm thương hiệu/model cho mô tả: gõ {b}"3"{/b} · xuất xứ khác: gõ {b}"2"{/b} kèm nước\n${LUU_Y}`;
        const traLoi = `${full}${duoi}`;
        // Lưu bản đầy đủ để lệnh "chi tiết" mở lại được: trước đây lệnh này luôn trả lời
        // "Chưa có bản chi tiết nào" vì chỉ có nhánh AI biên tập mới ghi phiên — mà nhánh đó
        // không chạy nữa (form cố định đã thay). Khách cuộn mất tin thì gõ "chi tiết" là lấy lại.
        ctx.session.chiTiet = { text: `${fullChiTiet}${duoi}`, at: Date.now() };

        // Giọng Quyên (issue #136, mục 2 & 3): trả bản ngắn gọn <= 6-7 dòng khi thuộc luồng giọng Quyên
        if (giongQuyen && !chonNhanh) {
          const giaDinh = ctx.session.giaDinh || null;
          ctx.session.giaDinh = null;
          ctx.session.daHoiLai = null;
          const ngan = renderPhanLoaiGiongQuyen({ tenHang, maHs, phanLoai: r, thue, thuTuc, moTa, xuatXu: xx, giaDinh, giaDinhXuatXu: xxGiaDinh });
          return nhanChung ? `${donNhanChung(ngan)}\n${nhacNhanChung(nhanChung)}` : ngan;
        }
        return traLoi;
      }
      let out = renderClassify(r, { title: `🔎 Phân loại: "${tenHien}"` });
      if (st === 'CAN_DU_KIEN') {
        if (maLuot && has(ctx, 'bo_sung_du_kien')) {
          ctx.session.choBoSung = { maLuot, tenHang };
          out += '\n\n👉 Trả lời các câu trên trong MỘT tin (không trừ điểm thêm). Hỏi hàng khác thì gõ "hàng mới".';
        } else {
          out += '\n\n👉 Trả lời các câu hỏi trên bằng cách gửi lại mô tả đầy đủ hơn (vẫn đang ở gói 1).';
        }
      }
      if (maHs) {
        const { ma: xx, giaDinh: xxGiaDinh } = xuatXuCuaMach(ctx, String(tenHang || ''), cauMoi);
        // Chuỗi tự kèm sau khi có mã: thuế + chính sách (gói 2), tra cứu miễn phí. Chú giải + tiền lệ (gói 5) KHÔNG tự kèm
        // (chủ repo bỏ 06/11: dài, khách chưa cần) — khách gõ "5" khi cần. Nhãn hiệu (gói 6) TÍNH ĐIỂM nên chỉ chạy khi
        // khách nêu thương hiệu và mã đã chốt (không chạy trên mã tạm).
        const [thue, thuTuc] = await Promise.all([
          has(ctx, 'tra_thue') ? ctx.mcp.callTool('tra_thue', { maHs, xuatXu: xx }).catch((err) => {
            ctx.log?.error?.(`[hs] lỗi gọi tra_thue (${maHs}): ${err?.message || err}`);
            return null;
          }) : null,
          has(ctx, 'tra_thu_tuc_nhap_khau') ? ctx.mcp.callTool('tra_thu_tuc_nhap_khau', { maHs }).catch((err) => {
            ctx.log?.error?.(`[hs] lỗi gọi tra_thu_tuc_nhap_khau (${maHs}): ${err?.message || err}`);
            return null;
          }) : null,
        ]);
        if (thue && (thue.ok === false || thue.isError)) {
          ctx.log?.error?.(`[hs] Cổng trả lỗi tra_thue (${maHs}): ${thue.thongBao || thue.loi || thue.text || 'ok:false'}`);
        }
        if (thuTuc && (thuTuc.ok === false || thuTuc.isError)) {
          ctx.log?.error?.(`[hs] Cổng trả lỗi tra_thu_tuc_nhap_khau (${maHs}): ${thuTuc.thongBao || thuTuc.loi || thuTuc.text || 'ok:false'}`);
        }
        if (thue) out += `\n\n${renderResult(thue, { title: `💰 Thuế — ${fmtHs(maHs)} (${nhanXuatXu(xx, xxGiaDinh)})`, renderer: 'tax' })}`;
        if (thuTuc) out += `\n\n${renderResult(thuTuc, { title: '📋 Chính sách nhập khẩu', renderer: 'policy' })}`;
        if (thuongHieu && st !== 'CAN_DU_KIEN' && has(ctx, 'kiem_tra_shtt')) {
          const shtt = await ctx.mcp.callTool('kiem_tra_shtt', { tenNhan: thuongHieu, maHs, xuatXu: xx }).catch(() => null);
          if (shtt) out += `\n\n{b}®️ Rủi ro nhãn hiệu "${thuongHieu}" — ${fmtHs(maHs)}{/b}\n${renderShtt(shtt, { tenNhan: thuongHieu })}`;
        }
        out += `\n\n{b}👉 Tiếp theo:{/b} gõ "3" để viết mô tả khai báo · xuất xứ khác: gõ "2" kèm mã HS và nước.`;
      }
      // Dán lời nhắc ở ĐÂY chứ không trong nhánh `if (maHs)`: nhánh CAN_DU_KIEN (Cổng hỏi thêm
      // dữ kiện, chưa có mã) cũng phải nhắc, nếu không khách trả lời vòng sau vẫn gõ "OEM" (soát #169 [S5]).
      if (nhanChung) out = `${donNhanChung(out)}\n\n${nhacNhanChung(nhanChung)}`;
      out += '\n{orange}ℹ️ Mã HS là GỢI Ý tham khảo, không thay thế ý kiến phân loại của Hải quan.{/orange}';
      // Não biên tập (ctx.editor): bản chốt ngắn thay bản dài, bản đầy lưu cho lệnh "chi tiết".
      // Không áp khi đang hỏi dữ kiện (câu hỏi của Cổng phải tới khách nguyên văn). Editor lỗi/số không khớp → giữ bản đầy.
      if (maHs && st !== 'CAN_DU_KIEN' && ctx.editor) {
        const ngan = await ctx.editor.chot({ text: plain(out), loai: 'phân loại mã HS + thuế' }).catch(() => null);
        if (ngan) {
          ctx.session.chiTiet = { text: out, at: Date.now() };
          return `${ngan}\n\n{b}👉{/b} Xem phân tích đầy đủ: gõ {b}"chi tiết"{/b} · viết mô tả khai báo: gõ {b}"3"{/b}\n{orange}ℹ️ Mã HS là GỢI Ý tham khảo, không thay thế ý kiến phân loại của Hải quan.{/orange}`;
        }
      }
      return out;
    },
  },
  {
    so: 2, ngan: 'Thuế', id: 'thue-thu-tuc', icon: '💰', ten: 'Thuế & thủ tục nhập khẩu',
    moTa: 'Thuế NK, ACFTA hàng TQ, VAT + kiểm tra chuyên ngành, giấy phép theo mã HS.',
    congCu: ['tra_thue'],
    mau: '84137090\n(hoặc: 84137090 JP — tra theo xuất xứ khác; hoặc gõ tên hàng để tìm mã)',
    async chay(text, ctx) {
      let maHs = firstHs8(text) || (text.match(/(?<!\d)\d{4}(?:\d{2})?(?!\d)/) || [])[0];
      if (!maHs && ctx.session.last?.maHs) {
        const n = norm(text);
        const conLai = n.replace(/\b(thue|thue suat|nhap khau|xuat khau|nk|xk|vat|thu tuc|tra|xem|cho hoi|hoi|bao nhieu|bn|nhieu|the nao|may|suat|phan tram|sao)\b|[?.,!%]/g, '').trim();
        const laNoiTiep = conLai.length === 0
          || /^(thue|thue suat)(\s*(nhap khau|nk))?\s*(bao nhieu|bn|the nao|sao|\?)/.test(n)
          || /^bao nhieu\s*%/.test(n);
        if (laNoiTiep) maHs = ctx.session.last.maHs;
      }
      if (!maHs) {
        if (has(ctx, 'tim_ma_hs') && norm(text).length >= 2) {
          const r = await ctx.mcp.callTool('tim_ma_hs', { tuKhoa: text.slice(0, 200), gioiHan: 6 });
          return `${renderResult(r, { renderer: 'search' })}\n\n👉 Gõ mã 8 số để xem thuế + thủ tục chi tiết.`;
        }
        return ask('Bạn chưa nhập mã HS.', this.mau);
      }
      // Gói 2 nhận "84137090 JP": phần còn lại sau khi bỏ mã số là Ô NƯỚC khách gõ ({ nhan }),
      // nên chấp cả mã trơ "JP". Khách không gõ nước → vẫn tra theo mặc định nhưng nói rõ là giả định.
      const { ma: xuatXu, giaDinh: xxGiaDinh } = xuatXuCuaMach(ctx, { nhan: text.replace(/[\d.\s]{4,}/, '').trim() }, text);
      const [thue, thuTuc] = await Promise.all([
        ctx.mcp.callTool('tra_thue', { maHs, xuatXu }),
        maHs.length === 8 && has(ctx, 'tra_thu_tuc_nhap_khau') ? ctx.mcp.callTool('tra_thu_tuc_nhap_khau', { maHs }).catch((err) => {
          ctx.log?.error?.(`[hs] lỗi gọi tra_thu_tuc_nhap_khau (${maHs}): ${err?.message || err}`);
          return { ok: false, loi: 'CONG_KHONG_TRA_LOI', transport: true };
        }) : null,
      ]);
      if (thue && (thue.ok === false || thue.isError)) {
        ctx.log?.error?.(`[hs] Cổng trả lỗi tra_thue (${maHs}): ${thue.thongBao || thue.loi || thue.text || 'ok:false'}`);
      }
      if (thuTuc && (thuTuc.ok === false || thuTuc.isError)) {
        ctx.log?.error?.(`[hs] Cổng trả lỗi tra_thu_tuc_nhap_khau (${maHs}): ${thuTuc.thongBao || thuTuc.loi || thuTuc.text || 'ok:false'}`);
      }
      const parts = [renderResult(thue, { title: `💰 Thuế — ${fmtHs(maHs)} (${nhanXuatXu(xuatXu, xxGiaDinh)})`, renderer: 'tax' })];
      if (thuTuc) parts.push(renderResult(thuTuc, { title: '📋 Chính sách nhập khẩu', renderer: 'policy' }));
      const pv = nhacPhongVe(thue, thuTuc);
      if (pv) parts.push(pv);
      // Căn cứ pháp lý (issue #168): chỉ số hiệu Cổng trả trong lượt này, tối đa 3; "căn cứ" mở đủ danh sách.
      ctx.session.canCu = goiCanCu({ thue, thuTuc, maHs });
      const dongCc = dongCanCuNgan(ctx.session.canCu || {});
      if (dongCc) parts.push(dongCc);
      ctx.session.last = { ...(ctx.session.last || {}), maHs: maHs.length === 8 ? maHs : ctx.session.last?.maHs };
      return parts.join('\n\n');
    },
  },
  {
    so: 3, ngan: 'Mô tả', id: 'mo-ta', icon: '📝', ten: 'Viết mô tả khai báo',
    moTa: 'Soạn mô tả hàng hoá chỉ tiêu 1.78 trên tờ khai, kèm điểm tuân thủ.',
    congCu: ['sinh_mo_ta_khai_bao'],
    mau: 'Mã HS: 84137090\nTên hàng: Máy bơm nước ly tâm\nThương hiệu: Pentax\nModel: CM50\nXuất xứ: CN\nThông số: công suất 1.5HP, điện áp 220V\nTình trạng: mới 100%',
    async chay(text, ctx) {
      const fs = [F.maHs, F.tenHang, F.chatLieu, F.congDung, F.thongSo, F.thuongHieu, F.model, F.xuatXu, F.tinhTrang, F.kichThuoc, F.nhaSanXuat, F.quyCachDongGoi];
      const { values: v, conLai } = parseLabeled(text, fs);
      const last = ctx.session.last || {};
      const maHs = firstHs8(v.maHs || '') || firstHs8(conLai) || last.maHs;
      const tenHang = (v.tenHang || conLai.replace(/(?<!\d)\d{4}[.\s]?\d{2}[.\s]?\d{2}(?!\d)/, '').trim() || last.tenHang || '').slice(0, 500);
      if (!maHs) return ask('Cần mã HS 8 số (hoặc dùng gói 1 để phân loại trước).', this.mau);
      if (tenHang.length < 2) return ask('Cần tên hàng.', this.mau);
      // Khách gõ "Thương hiệu: OEM" → mô tả khai báo phải ghi "không nhãn hiệu", không ghi "nhãn hiệu OEM" (issue #169).
      const nhanChung = v.thuongHieu && laNhanChung(v.thuongHieu) ? v.thuongHieu : null;
      const args = clean({
        maHs, tenHang, chatLieu: v.chatLieu, congDung: v.congDung, thongSo: thongSoObj(v.thongSo),
        thuongHieu: nhanChung ? KHONG_NHAN : v.thuongHieu, model: v.model, xuatXu: v.xuatXu ? countryCode(v.xuatXu) : null,
        tinhTrang: v.tinhTrang, kichThuoc: v.kichThuoc, nhaSanXuat: v.nhaSanXuat, quyCachDongGoi: v.quyCachDongGoi,
        maLuotPhanLoai: last.maHs === maHs ? last.maLuotPhanLoai : null,
      });
      const r = await ctx.mcp.callTool('sinh_mo_ta_khai_bao', args);
      let out = renderResult(r, { title: `📝 Mô tả khai báo — ${fmtHs(maHs)}` });
      if (nhanChung) out = `${donNhanChung(out)}\n\n${nhacNhanChung(nhanChung)}`;
      if (r?.banNhap || r?.data?.banNhap) out += '\n\n{orange}⚠️ Đây là BẢN NHÁP{/orange} vì hồ sơ chưa đủ căn cứ — trả lời các câu hỏi rồi gửi lại, không dùng bản nháp để khai.';
      return out;
    },
  },
  {
    so: 4, ngan: 'Kiểm tra', id: 'kiem-tra', icon: '✅', ten: 'Kiểm tra mô tả / tờ khai',
    moTa: 'Soát dòng hàng trước khi khai: chất lượng mô tả, thuế suất, C/O mẫu E, giấy phép, kiểm tra chuyên ngành.',
    congCu: ['soat_to_khai'],
    mau: 'Mã HS: 84137090\nMô tả: Máy bơm nước ly tâm, thân gang, 1.5HP, 220V, mới 100%\nXuất xứ: CN\n(thêm dòng "Kiểm sâu: có" để AI so mô tả với mã — tính điểm)',
    async chay(text, ctx) { return chayCho(this, text, ctx); },
    async batDau(text, ctx) {
      const { values: v, conLai } = parseLabeled(text, [F.maHs, F.moTa, F.xuatXu, F.thongSo, { key: 'sau', nhan: ['kiểm sâu', 'kiem sau', 'sâu'] }]);
      const maHs = firstHs8(v.maHs || '') || firstHs8(conLai) || ctx.session.last?.maHs;
      const moTa = (v.moTa || conLai.replace(/(?<!\d)\d{4}[.\s]?\d{2}[.\s]?\d{2}(?!\d)/, '').trim()).slice(0, 2000);
      if (!maHs || moTa.length < 3) return ask('Cần mã HS 8 số và mô tả hàng như sẽ khai.', this.mau);
      const { ma: xuatXu, giaDinh: xxGiaDinh } = xuatXuCuaMach(ctx, { nhan: v.xuatXu }, text);
      const dong = clean({ stt: 1, maHs, moTa, xuatXu, thongSo: v.thongSo });
      const sau = /^(co|có|yes|1|x)/i.test(norm(v.sau || '')) && has(ctx, 'kiem_ma_to_khai');
      if (sau) {
        const last = ctx.session.last || {};
        if (last.maHs === maHs && last.maLuotPhanLoai) dong.maLuotPhanLoai = last.maLuotPhanLoai;
        const r = await ctx.mcp.callTool('kiem_ma_to_khai', { dongHang: [dong] });
        return { r, resultTool: 'ket_qua_soat', label: 'Đang kiểm mô tả với mã HS', context: { maHs, sau, xuatXu, xxGiaDinh } };
      }
      return { r: await ctx.mcp.callTool('soat_to_khai', { dongHang: [dong] }), resultTool: null, context: { maHs, sau, xuatXu, xxGiaDinh } };
    },
    xong(r, { maHs, sau, xuatXu, xxGiaDinh = false }, ctx) {
      let out = renderResult(r, { title: `✅ ${sau ? 'Kiểm sâu' : 'Soát'} — ${fmtHs(maHs)}` });
      // Soát tờ khai là chỗ nguy nhất của mặc định ngầm: xuất xứ đoán đi THẲNG vào dòng hàng gửi Cổng
      // và kéo theo kết luận C/O, ưu đãi FTA. Khách không khai nước thì phải nói rõ bot đã lấy nước nào.
      if (xxGiaDinh && xuatXu) out += `\n\n{orange}⚠️ Anh/chị chưa ghi xuất xứ nên em soát theo giả định ${tenNuoc(xuatXu)}. Khác nước thì gửi lại kèm dòng "Xuất xứ: …" nhé ạ.{/orange}`;
      if (!sau && has(ctx, 'kiem_ma_to_khai')) out += '\n\n👉 Muốn AI so mô tả có khớp mã không: gửi lại kèm dòng "Kiểm sâu: có" (tính điểm).';
      return out;
    },
  },
  {
    so: 5, ngan: 'Luật', id: 'phap-luat', icon: '⚖️', ten: 'Pháp luật hải quan',
    moTa: 'Hiệu lực văn bản, chú giải chương/nhóm, tiền lệ phân loại (TB-TCHQ).',
    congCu: [],
    canMotTrong: ['tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le'],
    mau: 'Số hiệu văn bản: 57/2022/NĐ-CP, 38/2015/TT-BTC → kiểm hiệu lực\nMã HS: 84137090 → chú giải + tiền lệ (mã 4/6 số: bot dò các mã 8 số trong nhánh)\nHoặc mô tả hàng → tìm tiền lệ phân loại',
    async chay(text, ctx) {
      const so = soHieuList(text);
      const conLai = so.reduce((t, s) => t.split(s).join(' '), text).replace(/\s+/g, ' ').trim();
      // Dò mã HS trong phần còn lại (đã bỏ số hiệu văn bản: "57/2022/NĐ-CP" không phải mã 2022)
      const hs = (conLai.match(/(?<![\d/])\d{4}(?:[.\s]?\d{2}){0,2}(?![\d/])/) || [])[0]?.replace(/\D/g, '');
      const jobs = [];
      if (so.length && has(ctx, 'tra_hieu_luc_van_ban')) jobs.push(['📜 Hiệu lực văn bản', ctx.mcp.callTool('tra_hieu_luc_van_ban', { soHieu: so.slice(0, 50) })]);
      // [tiêu đề, promise, tienLe?] — tienLe: 'ma' | 'moTa' | 'nhanh' (nhánh 4/6 số, promise trả {text, rong})
      if (hs) {
        if (has(ctx, 'tra_chu_giai')) jobs.push([`📖 Chú giải — ${fmtHs(hs)}`, ctx.mcp.callTool('tra_chu_giai', { maHs: hs })]);
        if (has(ctx, 'tra_tien_le')) {
          if (hs.length === 8) jobs.push([`🗂️ Tiền lệ phân loại — ${fmtHs(hs)}`, ctx.mcp.callTool('tra_tien_le', { maHs: hs }), 'ma']);
          else jobs.push([null, tienLeNhanh(ctx, hs), 'nhanh']);
        }
      } else if (!so.length && conLai.length >= 3 && has(ctx, 'tra_tien_le')) {
        jobs.push(['🗂️ Tiền lệ phân loại', ctx.mcp.callTool('tra_tien_le', { moTa: conLai.slice(0, 300) }), 'moTa']);
      }
      if (!jobs.length) return ask('Chưa thấy số hiệu văn bản, mã HS hay mô tả hàng.', this.mau);
      const res = await Promise.all(jobs.map(([, p]) => p.catch(() => ({ ok: false, loi: 'CONG_KHONG_TRA_LOI', transport: true }))));   // lỗi gốc đã vào audit 'tool' của lõi
      // Tiền lệ mã 8 số: lưu số TB-TCHQ Cổng trả để lệnh "căn cứ" mở lại đúng (issue #168, KB1/KB8).
      const iTl = jobs.findIndex(([, , tl]) => tl === 'ma');
      const ccTl = iTl >= 0 ? goiCanCu({ tienLe: res[iTl], maHs: hs }) : null;
      if (ccTl) ctx.session.canCu = ccTl;
      return jobs.map(([t, , tienLe], i) => {
        const r = res[i];
        if (tienLe && (tienLe === 'nhanh' ? r?.rong : tienLeRong(r))) ghiTruot(ctx, 'TIEN_LE_RONG', { goi: 5, cau: text, maHs: hs || null, moTa: tienLe === 'moTa' ? conLai.slice(0, 300) : null });
        if (tienLe === 'nhanh' && typeof r?.text === 'string') return r.text;
        return renderResult(r, { title: t || '🗂️ Tiền lệ phân loại' });
      }).join('\n\n');
    },
  },
  {
    so: 6, ngan: 'Nhãn hiệu', id: 'shtt', icon: '®️', ten: 'Sở hữu trí tuệ (nhãn hiệu)',
    moTa: 'Đèn rủi ro ĐỎ/VÀNG/XANH khi nhập hàng mang nhãn hiệu. Tính điểm.',
    congCu: ['kiem_tra_shtt'],
    mau: 'Nhãn hiệu: Nike\nMã HS: 64041190\nXuất xứ: CN',
    async chay(text, ctx) {
      const { values: v, conLai } = parseLabeled(text, [{ key: 'tenNhan', nhan: ['nhãn hiệu', 'nhãn', 'thương hiệu', 'brand', 'tên nhãn', 'hiệu'] }, F.maHs, F.xuatXu,
        { key: 'tenNguoiNhap', nhan: ['người nhập', 'công ty', 'nhà nhập khẩu'] }]);
      const maHs = firstHs8(v.maHs || '') || (conLai.match(/(?<!\d)\d{4}(?:\d{2}){0,2}(?!\d)/) || [])[0] || null;
      // Lời nhờ ở đầu câu tự do ("kiểm nhãn hiệu Philips") KHÔNG phải tên nhãn (KB7 của #168): trước đây
      // cả câu thành tên nhãn gửi Cổng, và "kiểm nhãn hiệu oem" không còn được nhận là "không nhãn hiệu".
      const tenNhan = (v.tenNhan || conLai.replace(/(?<!\d)\d{4,8}(?!\d)/g, '').replace(/\b[A-Z]{2}\b\s*$/, '').trim())
        .replace(/^(?:(?:kiểm|kiem)(?:\s+tra)?|check|tra(?:\s+cứu|\s+cuu)?)\s+(?:(?:nhãn|nhan)(?:\s+(?:hiệu|hieu))?|thương hiệu|thuong hieu|brand|shtt)\s*[:\-]?\s*/i, '')
        .trim().slice(0, 200);
      if (!tenNhan) return ask('Cần tên nhãn hiệu.', this.mau);
      // Từ chung chung ("oem", "no brand"…): không gọi Cổng, không trừ điểm — issue #169.
      if (laNhanChung(tenNhan)) return `${nhacNhanChung(tenNhan)}\n\nAnh/chị gửi đúng nhãn in trên hàng (hoặc ảnh logo) để em kiểm giúp nhé.`;
      // Chỉ gửi xuất xứ khi khách thực sự đưa (dòng "Xuất xứ:" hoặc mã nước cuối tin "Nike 64041190 CN") — không đoán.
      const cuoi = (conLai.match(/\b([A-Z]{2})\s*$/) || [])[1];
      const xuatXu = (v.xuatXu && countryCode(v.xuatXu)) || (cuoi && countryCode(cuoi)) || null;
      const r = await ctx.mcp.callTool('kiem_tra_shtt', clean({ tenNhan, maHs, xuatXu, tenNguoiNhap: v.tenNguoiNhap }));
      const tieuDe = `{b}®️ Rủi ro nhãn hiệu "${tenNhan}"${maHs ? ` — ${fmtHs(maHs)}` : ''}{/b}`;
      // Bản đầy (chứng cứ, nguồn, mốc dữ liệu) để khách gõ "chi tiết" xem lại; tin chính chỉ 4 dòng.
      ctx.session.chiTiet = { text: `${tieuDe}\n${renderShtt(r, { tenNhan, chiTiet: true })}`, at: Date.now() };
      return `${tieuDe}\n${renderShtt(r, { tenNhan })}`;
    },
  },
  {
    so: 7, ngan: 'Giải trình', id: 'giai-trinh', icon: '📄', ten: 'Hồ sơ giải trình mã HS',
    moTa: 'Khi Hải quan áp mã khác: bản nháp công văn, so sánh 2 mã, dàn ý lập luận, hồ sơ kèm theo. Tính điểm.',
    congCu: ['soan_ho_so_giai_trinh'],
    mau: 'Mã khai: 84137090\nMã Hải quan áp: 84138190\nMô tả hàng: Máy bơm nước ly tâm thân gang 1.5HP 220V\nLý do Hải quan: …\nTài liệu có: catalogue, hợp đồng',
    async chay(text, ctx) {
      const { values: v, conLai } = parseLabeled(text, [
        { key: 'maKhai', nhan: ['mã khai', 'mã đã khai', 'ma khai'] },
        { key: 'maHaiQuan', nhan: ['mã hải quan', 'mã hải quan áp', 'mã hq', 'hải quan áp', 'mã áp'] },
        { key: 'moTaHang', nhan: ['mô tả hàng', 'mô tả', 'tên hàng', 'hàng'] },
        { key: 'lyDoHaiQuan', nhan: ['lý do hải quan', 'lý do', 'lý do hq'] },
        F.thongSo, { key: 'taiLieuCo', nhan: ['tài liệu có', 'tài liệu', 'hồ sơ có'] },
      ]);
      const codes = allHs8(conLai);
      const maKhai = firstHs8(v.maKhai || '') || codes[0];
      const maHaiQuan = firstHs8(v.maHaiQuan || '') || codes[1] || null;
      const moTaHang = (v.moTaHang || conLai.replace(new RegExp('(?<!\\d)\\d{4}[.\\s]?\\d{2}[.\\s]?\\d{2}(?!\\d)', 'g'), '').trim()).slice(0, 2000);
      if (!maKhai || moTaHang.length < 3) return ask('Cần mã đã khai và mô tả hàng.', this.mau);
      const r = await ctx.mcp.callTool('soan_ho_so_giai_trinh', clean({
        loai: 'TRANH_CHAP_MA', maKhai, maHaiQuan, moTaHang, lyDoHaiQuan: v.lyDoHaiQuan?.slice(0, 4000), thongSo: v.thongSo,
        taiLieuCo: v.taiLieuCo ? v.taiLieuCo.split(/[,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 20) : null,
      }));
      return `${renderResult(r, { title: `📄 Hồ sơ giải trình — khai ${fmtHs(maKhai)}${maHaiQuan ? ` / HQ áp ${fmtHs(maHaiQuan)}` : ''}` })}\n\n{orange}⚠️ Đây là BẢN NHÁP{/orange}, người khai phải tự rà soát trước khi nộp.`;
    },
  },
];

/** Gói khả dụng theo danh sách công cụ của Cổng (null = chưa biết → hiện tất cả). */
export function availablePackages(toolNames) {
  if (!toolNames) return PACKAGES;
  return PACKAGES.filter((p) => p.congCu.every((t) => toolNames.has(t)) && (!p.canMotTrong || p.canMotTrong.some((t) => toolNames.has(t))));
}

/**
 * Menu gói.
 * full = true → menu đầy đủ (gõ "menu" hoặc lúc chọn gói): tiêu đề đậm, tên gói in đậm, mô tả thụt lề.
 * full = false → footer gọn cuối mọi tin: KHÔNG liệt kê số gói (khách quen thấy là rác) — chỉ dẫn tới "menu".
 * Dùng thẻ định dạng {b}…{/b} — channels/zalo-bot.js chuyển sang text_styles của Zalo.
 */
export function menuText(pkgs, { full = false, compact = false } = {}) {
  if (compact) {
    // Menu RÚT GỘN: tên gói + mô tả một dòng. Dùng cho lời chào — khách cần biết bot làm được gì,
    // không cần đọc 7 mô tả dài (menu đầy đủ ~970 ký tự, rút gọn ~380).
    const l = ['{b}📦 Các gói tra cứu:{/b}'];
    for (const p of pkgs) l.push(`{b}${p.so}. {/b}${p.icon} ${p.ten}`);
    l.push('{b}0.{/b} Tự động — bot tự chọn gói theo nội dung bạn gõ');
    return l.join('\n');
  }
  if (full) {
    const l = [`{b}📦 CHỌN GÓI TRA CỨU{/b} — gõ số tương ứng:`, ''];
    for (const p of pkgs) {
      l.push(`{b}${p.so}. ${p.icon} ${p.ten}{/b}`);
      l.push(`   ${p.moTa}`);
      l.push('');
    }
    l.push('{b}0. Tự động{/b} — bot tự chọn gói theo nội dung bạn gõ');
    return l.join('\n');
  }
  return `Gõ {b}"menu"{/b} để xem các gói tra cứu`;
}
