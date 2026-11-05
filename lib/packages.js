// lib/packages.js — các GÓI tra cứu hiển thị cho người dùng Zalo.
// Mỗi gói gom 1 hoặc nhiều công cụ của Cổng OZ (MCP). Muốn thêm gói khi Cổng có công cụ mới:
// thêm một mục vào PACKAGES (so, ten, congCu, mau, chay). Gói chỉ hiện khi Cổng có đủ công cụ bắt buộc.
import { parseLabeled, firstHs8, allHs8, soHieuList, countryCode, findCountryInText, norm } from './input.js';
import { renderResult, renderClassify, nhacPhongVe } from './render.js';
import { fmtHs } from './format.js';
import { b } from './style.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (ctx, name) => !ctx.tools || ctx.tools.has(name);

/** Công cụ chạy nền: nhận biên nhận {maLuot, trangThai: DANG_XU_LY} → hỏi lại tới khi xong. */
export async function waitJob(ctx, r, resultTool, { everyMs = 6000, maxMs = 240000, label = 'Đang xử lý' } = {}) {
  const maLuot = r?.maLuot || r?.data?.maLuot;
  const st = r?.trangThai || r?.data?.trangThai;
  if (!maLuot || st !== 'DANG_XU_LY' || !has(ctx, resultTool)) return r;
  await ctx.notify?.(`{b}⏳ ${label}…{/b} thường mất 1–3 phút, bot sẽ gửi kết quả ngay khi xong.`);
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    await sleep(ctx.pollMs ?? everyMs);
    const k = await ctx.mcp.callTool(resultTool, { maLuot });
    const s = k?.trangThai || k?.data?.trangThai;
    if (s !== 'DANG_XU_LY') return { ...k, maLuot };
  }
  return { ok: false, thongBao: `Chưa có kết quả sau ${Math.round(maxMs / 60000)} phút. Mã lượt: ${maLuot} — hỏi lại sau bằng cách gõ: kết quả ${maLuot}` };
}

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
  let t = ` ${String(s || '').replace(/[?!]+/g, ' ').replace(/\.+(\s|$)/g, ' ')} `;
  const bo = ['cho (?:mình|tôi|em|anh|chị) hỏi', 'xin hỏi', 'mã số hs', 'mã hs code', 'mã hs', 'hs code', 'hscode', 'mã số', 'mã gì', 'là bao nhiêu',
    'bao nhiêu', 'là gì', 'là mã nào', 'mã nào', 'có thể áp vào', 'có thể áp', 'áp vào', 'có bao nhiêu', 'thế nào', 'vậy', 'nhé', 'nhỉ', 'ạ', 'ơi', 'em', 'anh', 'chị', 'bạn', 'ad', 'shop', 'của', 'thì'];
  for (const w of bo) t = t.replace(new RegExp(`(^|\\s)${w}(?=\\s)`, 'gi'), ' ');
  const out = t.replace(/\s+/g, ' ').replace(/^[\s,:-]+|[\s,:-]+$/g, '');
  return out.length >= 2 ? out : String(s || '').trim();
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''));
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
    async chay(text, ctx) {
      // Đang chờ bổ sung dữ kiện cho lượt phân loại trước (CAN_DU_KIEN) → gửi câu trả lời vào đúng lượt đó, không trừ điểm lại.
      const cho = ctx.session.choBoSung;
      let r; let tenHang; let boSung = false;
      const cauHoiMoi = /(hs code|ma hs|ma so hs|bao nhieu|la gi|thue|phan loai|ma gi)/.test(norm(text));
      if (cho && has(ctx, 'bo_sung_du_kien') && !cauHoiMoi && !/^(moi|hang moi|hang khac|bo qua)\b/.test(norm(text))) {
        ctx.session.choBoSung = null;
        boSung = true;
        tenHang = cho.tenHang;
        r = await ctx.mcp.callTool('bo_sung_du_kien', { maLuot: cho.maLuot, boSung: text.slice(0, 1000) });
        if (r?.ok !== false) r = await waitJob(ctx, { ...r, maLuot: r?.maLuot || cho.maLuot, trangThai: r?.trangThai || r?.data?.trangThai || 'DANG_XU_LY' },
          'ket_qua_phan_loai', { label: 'Đã nhận dữ kiện bổ sung, đang phân loại lại' });
      } else {
        ctx.session.choBoSung = null;
        const bo = text.replace(/^\s*(h[aà]ng m[oớ]i|h[aà]ng kh[aá]c|b[oỏ] qua)\s*[:,.\-]?\s*/i, '');
        const { values: v, conLai } = parseLabeled(bo, [F.tenHang, F.chatLieu, F.congDung, F.thongSo, F.thuongHieu, F.model]);
        tenHang = lamGonCauHoi(v.tenHang || conLai || bo).slice(0, 500);
        if (tenHang.trim().length < 2) return ask('Bạn muốn phân loại hàng gì?', this.mau);
        const ts = { ...(thongSoObj(v.thongSo) || {}) };
        if (v.thuongHieu) ts['Thương hiệu'] = v.thuongHieu;
        if (v.model) ts.Model = v.model;
        const args = clean({ tenHang, chatLieu: v.chatLieu?.slice(0, 200), congDung: v.congDung?.slice(0, 300),
          thongSo: Object.keys(ts).length ? ts : null, nguonThongSo: ctx.nguonThongSo || 'CHU' });
        // Khách gõ lại / sửa mô tả ngay sau lượt trước (≤10 phút) → tín hiệu từ vựng trượt.
        const truoc = ctx.session.cauPhanLoai;
        const hangMoi = bo !== text;   // khách tự báo "hàng mới/hàng khác" → không phải gõ lại
        if (truoc && !hangMoi && Date.now() - truoc.at < 10 * 60_000 && norm(truoc.cau) !== norm(bo)) {
          ghiTruot(ctx, 'GO_LAI', { goi: 1, cau: bo.slice(0, 1000), cauTruoc: truoc.cau.slice(0, 1000), maHsTruoc: truoc.maHs || null });
        }
        r = await ctx.mcp.callTool('phan_loai_hs', args);
        r = await waitJob(ctx, r, 'ket_qua_phan_loai', { label: 'Đang phân loại mã HS' });
      }
      const maHs = pickHs(r);
      const maLuot = r?.maLuot || r?.chiPhi?.maLuot || r?.data?.maLuot;
      ctx.session.last = { tenHang, maHs, maLuotPhanLoai: UUID.test(maLuot || '') ? maLuot : null };
      ctx.session.cauPhanLoai = boSung
        ? { ...(ctx.session.cauPhanLoai || { cau: tenHang }), maHs, at: Date.now() }
        : { cau: text, maHs, at: Date.now() };
      const st = r?.trangThai || r?.data?.trangThai;
      if (st === 'CAN_DU_KIEN') ghiTruot(ctx, 'CAN_DU_KIEN', { goi: 1, cau: text.slice(0, 1000), tenHang, maLuot: maLuot || null });
      let out = renderClassify(r, { title: `🔎 Phân loại: "${String(tenHang).slice(0, 120)}"` });
      if (st === 'CAN_DU_KIEN') {
        if (maLuot && has(ctx, 'bo_sung_du_kien')) {
          ctx.session.choBoSung = { maLuot, tenHang };
          out += '\n\n{b}👉 Trả lời các câu trên trong MỘT tin{/b} (không trừ điểm thêm). Hỏi hàng khác thì gõ "hàng mới".';
        } else {
          out += '\n\n{b}👉 Trả lời các câu hỏi trên{/b} bằng cách gửi lại mô tả đầy đủ hơn (vẫn đang ở gói 1).';
        }
      }
      if (maHs) out += `\n\n{b}👉 Tiếp theo:{/b} gõ "2" để xem thuế & thủ tục của ${b(fmtHs(maHs))}, hoặc "3" để viết mô tả khai báo.`;
      out += '\n{orange}ℹ️ Mã HS là GỢI Ý tham khảo, không thay thế ý kiến phân loại của Hải quan.{/orange}';
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
      if (!maHs && /^\s*$/.test(text.replace(/\b(thue|thuế|thủ tục|tra)\b/gi, '')) && ctx.session.last?.maHs) maHs = ctx.session.last.maHs;
      if (!maHs) {
        if (has(ctx, 'tim_ma_hs') && norm(text).length >= 2) {
          const r = await ctx.mcp.callTool('tim_ma_hs', { tuKhoa: text.slice(0, 200), gioiHan: 6 });
          return `${renderResult(r, { renderer: 'search' })}\n\n{b}👉 Gõ mã 8 số{/b} để xem thuế + thủ tục chi tiết.`;
        }
        return ask('Bạn chưa nhập mã HS.', this.mau);
      }
      const xuatXu = countryCode(text.replace(/[\d.\s]{4,}/, '').trim()) || findCountryInText(text) || 'CN';
      const [thue, thuTuc] = await Promise.all([
        ctx.mcp.callTool('tra_thue', { maHs, xuatXu }),
        maHs.length === 8 && has(ctx, 'tra_thu_tuc_nhap_khau') ? ctx.mcp.callTool('tra_thu_tuc_nhap_khau', { maHs }).catch((e) => ({ ok: false, thongBao: e.message })) : null,
      ]);
      const parts = [renderResult(thue, { title: `💰 Thuế — ${fmtHs(maHs)} (xuất xứ ${xuatXu})`, renderer: 'tax' })];
      if (thuTuc) parts.push(renderResult(thuTuc, { title: '📋 Thủ tục / chính sách quản lý' }));
      const pv = nhacPhongVe(thue, thuTuc);
      if (pv) parts.push(pv);
      ctx.session.last = { ...(ctx.session.last || {}), maHs: maHs.length === 8 ? maHs : ctx.session.last?.maHs };
      return parts.join('\n\n');
    },
  },
  {
    so: 3, ngan: 'Mô tả', id: 'mo-ta', icon: '📝', ten: 'Viết mô tả khai báo',
    moTa: 'Soạn mô tả hàng hoá chỉ tiêu 1.78 (TT 38/2015, sửa đổi TT 39/2018, TT 121/2025) kèm điểm tuân thủ.',
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
      const args = clean({
        maHs, tenHang, chatLieu: v.chatLieu, congDung: v.congDung, thongSo: thongSoObj(v.thongSo),
        thuongHieu: v.thuongHieu, model: v.model, xuatXu: v.xuatXu ? countryCode(v.xuatXu) : null,
        tinhTrang: v.tinhTrang, kichThuoc: v.kichThuoc, nhaSanXuat: v.nhaSanXuat, quyCachDongGoi: v.quyCachDongGoi,
        maLuotPhanLoai: last.maHs === maHs ? last.maLuotPhanLoai : null,
      });
      const r = await ctx.mcp.callTool('sinh_mo_ta_khai_bao', args);
      let out = renderResult(r, { title: `📝 Mô tả khai báo — ${fmtHs(maHs)}` });
      if (r?.banNhap || r?.data?.banNhap) out += '\n\n{orange}⚠️ Đây là BẢN NHÁP{/orange} vì hồ sơ chưa đủ căn cứ — trả lời các câu hỏi rồi gửi lại, không dùng bản nháp để khai.';
      return out;
    },
  },
  {
    so: 4, ngan: 'Kiểm tra', id: 'kiem-tra', icon: '✅', ten: 'Kiểm tra mô tả / tờ khai',
    moTa: 'Soát dòng hàng trước khi khai: chất lượng mô tả, thuế suất, C/O mẫu E, giấy phép, kiểm tra chuyên ngành.',
    congCu: ['soat_to_khai'],
    mau: 'Mã HS: 84137090\nMô tả: Máy bơm nước ly tâm, thân gang, 1.5HP, 220V, mới 100%\nXuất xứ: CN\n(thêm dòng "Kiểm sâu: có" để AI so mô tả với mã — tính điểm)',
    async chay(text, ctx) {
      const { values: v, conLai } = parseLabeled(text, [F.maHs, F.moTa, F.xuatXu, F.thongSo, { key: 'sau', nhan: ['kiểm sâu', 'kiem sau', 'sâu'] }]);
      const maHs = firstHs8(v.maHs || '') || firstHs8(conLai) || ctx.session.last?.maHs;
      const moTa = (v.moTa || conLai.replace(/(?<!\d)\d{4}[.\s]?\d{2}[.\s]?\d{2}(?!\d)/, '').trim()).slice(0, 2000);
      if (!maHs || moTa.length < 3) return ask('Cần mã HS 8 số và mô tả hàng như sẽ khai.', this.mau);
      const xuatXu = (v.xuatXu && countryCode(v.xuatXu)) || findCountryInText(text) || 'CN';
      const dong = clean({ stt: 1, maHs, moTa, xuatXu, thongSo: v.thongSo });
      const sau = /^(co|có|yes|1|x)/i.test(norm(v.sau || '')) && has(ctx, 'kiem_ma_to_khai');
      let r;
      if (sau) {
        const last = ctx.session.last || {};
        if (last.maHs === maHs && last.maLuotPhanLoai) dong.maLuotPhanLoai = last.maLuotPhanLoai;
        r = await ctx.mcp.callTool('kiem_ma_to_khai', { dongHang: [dong] });
        r = await waitJob(ctx, r, 'ket_qua_soat', { label: 'Đang kiểm mô tả với mã HS' });
      } else {
        r = await ctx.mcp.callTool('soat_to_khai', { dongHang: [dong] });
      }
      let out = renderResult(r, { title: `✅ ${sau ? 'Kiểm sâu' : 'Soát'} — ${fmtHs(maHs)}` });
      if (!sau && has(ctx, 'kiem_ma_to_khai')) out += '\n\n{b}👉 Muốn AI so mô tả có khớp mã không:{/b} gửi lại kèm dòng "Kiểm sâu: có" (tính điểm).';
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
      const res = await Promise.all(jobs.map(([, p]) => p.catch((e) => ({ ok: false, thongBao: e.message }))));
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
      const tenNhan = (v.tenNhan || conLai.replace(/(?<!\d)\d{4,8}(?!\d)/g, '').replace(/\b[A-Z]{2}\b\s*$/, '').trim()).slice(0, 200);
      if (!tenNhan) return ask('Cần tên nhãn hiệu.', this.mau);
      // Chỉ gửi xuất xứ khi khách thực sự đưa (dòng "Xuất xứ:" hoặc mã nước cuối tin "Nike 64041190 CN") — không đoán.
      const cuoi = (conLai.match(/\b([A-Z]{2})\s*$/) || [])[1];
      const xuatXu = (v.xuatXu && countryCode(v.xuatXu)) || (cuoi && countryCode(cuoi)) || null;
      const r = await ctx.mcp.callTool('kiem_tra_shtt', clean({ tenNhan, maHs, xuatXu, tenNguoiNhap: v.tenNguoiNhap }));
      return renderResult(r, { title: `®️ Rủi ro nhãn hiệu "${tenNhan}"${maHs ? ` — ${fmtHs(maHs)}` : ''}` });
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
 * full = true → menu đầy đủ (gõ "menu"): tiêu đề đậm, tên gói in đậm, mô tả thụt lề.
 * full = false → footer gọn cuối mọi tin: 1 dòng, số gói đậm để dễ nhìn.
 * Dùng thẻ định dạng {b}…{/b} — lib/zalo.js chuyển sang text_styles của Zalo.
 */
export function menuText(pkgs, { full = false } = {}) {
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
  const ds = pkgs.map((p) => `{b}${p.so}{/b} ${p.ngan || p.ten}`).join(' · ');
  return `———\n📦 ${ds} · {b}0{/b} Tự động · {b}"menu"{/b}`;
}
