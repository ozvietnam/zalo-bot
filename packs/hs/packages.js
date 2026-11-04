// packs/hs/packages.js — các GÓI tra cứu hiển thị cho người dùng Zalo.
// Mỗi gói gom 1 hoặc nhiều công cụ của Cổng OZ (MCP). Muốn thêm gói khi Cổng có công cụ mới:
// thêm một mục vào PACKAGES (so, ten, congCu, mau, chay). Gói chỉ hiện khi Cổng có đủ công cụ bắt buộc.
// Gói có việc nền (1, 4) tách chay thành batDau (gọi Cổng, không chờ) + xong (dựng chữ từ kết quả) để index.js giao việc cho lõi.
import { parseLabeled, firstHs8, allHs8, soHieuList, countryCode, findCountryInText, norm } from './input.js';
import { renderResult, renderClassify } from './render.js';
import { fmtHs } from './format.js';
import { chayCho } from './jobs.js';

export { notice, hetHan, toJob, waitJob } from './jobs.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const has = (ctx, name) => !ctx.tools || ctx.tools.has(name);

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
const ask = (msg, mau) => `❓ ${msg}\n\nGửi theo mẫu:\n${mau}`;

export const PACKAGES = [
  {
    so: 1, ngan: 'Phân loại', id: 'phan-loai', icon: '🔎', ten: 'Phân loại mã HS',
    moTa: 'AI gợi ý mã HS từ mô tả hàng, kèm mã thay thế và căn cứ GIR/pháp lý.',
    congCu: ['phan_loai_hs'],
    mau: 'Tên hàng: Máy bơm nước ly tâm\nChất liệu: thân gang\nCông dụng: bơm nước sinh hoạt\nThông số: 1.5HP, 220V\n(hoặc gõ một câu mô tả tự do)',
    async chay(text, ctx) { return chayCho(this, text, ctx); },
    /** Gọi Cổng, không chờ: → câu hỏi lại (string) | { r, resultTool, label, context } cho xong(). */
    async batDau(text, ctx) {
      // Đang chờ bổ sung dữ kiện cho lượt phân loại trước (CAN_DU_KIEN) → gửi câu trả lời vào đúng lượt đó, không trừ điểm lại.
      const cho = ctx.session.choBoSung;
      const cauHoiMoi = /(hs code|ma hs|ma so hs|bao nhieu|la gi|thue|phan loai|ma gi)/.test(norm(text));
      if (cho && has(ctx, 'bo_sung_du_kien') && !cauHoiMoi && !/^(moi|hang moi|hang khac|bo qua)\b/.test(norm(text))) {
        ctx.session.choBoSung = null;
        const r = await ctx.mcp.callTool('bo_sung_du_kien', { maLuot: cho.maLuot, boSung: text.slice(0, 1000) });
        const context = { tenHang: cho.tenHang };
        if (r?.ok === false) return { r, resultTool: null, context };
        return { r: { ...r, maLuot: r?.maLuot || cho.maLuot, trangThai: r?.trangThai || r?.data?.trangThai || 'DANG_XU_LY' },
          resultTool: 'ket_qua_phan_loai', label: 'Đã nhận dữ kiện bổ sung, đang phân loại lại', context };
      }
      ctx.session.choBoSung = null;
      const bo = text.replace(/^\s*(h[aà]ng m[oớ]i|h[aà]ng kh[aá]c|b[oỏ] qua)\s*[:,.\-]?\s*/i, '');
      const { values: v, conLai } = parseLabeled(bo, [F.tenHang, F.chatLieu, F.congDung, F.thongSo, F.thuongHieu, F.model]);
      const tenHang = lamGonCauHoi(v.tenHang || conLai || bo).slice(0, 500);
      if (tenHang.trim().length < 2) return ask('Bạn muốn phân loại hàng gì?', this.mau);
      const ts = { ...(thongSoObj(v.thongSo) || {}) };
      if (v.thuongHieu) ts['Thương hiệu'] = v.thuongHieu;
      if (v.model) ts.Model = v.model;
      const args = clean({ tenHang, chatLieu: v.chatLieu?.slice(0, 200), congDung: v.congDung?.slice(0, 300),
        thongSo: Object.keys(ts).length ? ts : null, nguonThongSo: ctx.nguonThongSo || 'CHU' });
      const r = await ctx.mcp.callTool('phan_loai_hs', args);
      return { r, resultTool: 'ket_qua_phan_loai', label: 'Đang phân loại mã HS', context: { tenHang } };
    },
    /** Kết quả cuối (đã xong, hoặc lỗi/hết hạn) → chữ trả lời; ghi phiên last/choBoSung. */
    xong(r, { tenHang }, ctx) {
      const maHs = pickHs(r);
      const maLuot = r?.maLuot || r?.chiPhi?.maLuot || r?.data?.maLuot;
      ctx.session.last = { tenHang, maHs, maLuotPhanLoai: UUID.test(maLuot || '') ? maLuot : null };
      const st = r?.trangThai || r?.data?.trangThai;
      let out = renderClassify(r, { title: `🔎 Phân loại: "${String(tenHang).slice(0, 120)}"` });
      if (st === 'CAN_DU_KIEN') {
        if (maLuot && has(ctx, 'bo_sung_du_kien')) {
          ctx.session.choBoSung = { maLuot, tenHang };
          out += '\n\n👉 Trả lời các câu trên trong MỘT tin (không trừ điểm thêm). Hỏi hàng khác thì gõ "hàng mới".';
        } else {
          out += '\n\n👉 Trả lời các câu hỏi trên bằng cách gửi lại mô tả đầy đủ hơn (vẫn đang ở gói 1).';
        }
      }
      if (maHs) out += `\n\n👉 Tiếp theo: gõ "2" để xem thuế & thủ tục của ${fmtHs(maHs)}, hoặc "3" để viết mô tả khai báo.`;
      out += '\nℹ️ Mã HS là GỢI Ý tham khảo, không thay thế ý kiến phân loại của Hải quan.';
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
          return `${renderResult(r, { renderer: 'search' })}\n\n👉 Gõ mã 8 số để xem thuế + thủ tục chi tiết.`;
        }
        return ask('Bạn chưa nhập mã HS.', this.mau);
      }
      const xuatXu = countryCode(text.replace(/[\d.\s]{4,}/, '').trim()) || findCountryInText(text) || 'CN';
      const [thue, thuTuc] = await Promise.all([
        ctx.mcp.callTool('tra_thue', { maHs, xuatXu }),
        maHs.length === 8 && has(ctx, 'tra_thu_tuc_nhap_khau') ? ctx.mcp.callTool('tra_thu_tuc_nhap_khau', { maHs }).catch(() => ({ ok: false, loi: 'CONG_KHONG_TRA_LOI', transport: true })) : null,
      ]);
      const parts = [renderResult(thue, { title: `💰 Thuế — ${fmtHs(maHs)} (xuất xứ ${xuatXu})`, renderer: 'tax' })];
      if (thuTuc) parts.push(renderResult(thuTuc, { title: '📋 Thủ tục / chính sách quản lý' }));
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
      if (r?.banNhap || r?.data?.banNhap) out += '\n\n⚠️ Đây là BẢN NHÁP vì hồ sơ chưa đủ căn cứ — trả lời các câu hỏi rồi gửi lại, không dùng bản nháp để khai.';
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
      const xuatXu = (v.xuatXu && countryCode(v.xuatXu)) || findCountryInText(text) || 'CN';
      const dong = clean({ stt: 1, maHs, moTa, xuatXu, thongSo: v.thongSo });
      const sau = /^(co|có|yes|1|x)/i.test(norm(v.sau || '')) && has(ctx, 'kiem_ma_to_khai');
      if (sau) {
        const last = ctx.session.last || {};
        if (last.maHs === maHs && last.maLuotPhanLoai) dong.maLuotPhanLoai = last.maLuotPhanLoai;
        const r = await ctx.mcp.callTool('kiem_ma_to_khai', { dongHang: [dong] });
        return { r, resultTool: 'ket_qua_soat', label: 'Đang kiểm mô tả với mã HS', context: { maHs, sau } };
      }
      return { r: await ctx.mcp.callTool('soat_to_khai', { dongHang: [dong] }), resultTool: null, context: { maHs, sau } };
    },
    xong(r, { maHs, sau }, ctx) {
      let out = renderResult(r, { title: `✅ ${sau ? 'Kiểm sâu' : 'Soát'} — ${fmtHs(maHs)}` });
      if (!sau && has(ctx, 'kiem_ma_to_khai')) out += '\n\n👉 Muốn AI so mô tả có khớp mã không: gửi lại kèm dòng "Kiểm sâu: có" (tính điểm).';
      return out;
    },
  },
  {
    so: 5, ngan: 'Luật', id: 'phap-luat', icon: '⚖️', ten: 'Pháp luật hải quan',
    moTa: 'Hiệu lực văn bản, chú giải chương/nhóm, tiền lệ phân loại (TB-TCHQ).',
    congCu: [],
    canMotTrong: ['tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le'],
    mau: 'Số hiệu văn bản: 57/2022/NĐ-CP, 38/2015/TT-BTC → kiểm hiệu lực\nMã HS: 8413 → chú giải + tiền lệ\nHoặc mô tả hàng → tìm tiền lệ phân loại',
    async chay(text, ctx) {
      const so = soHieuList(text);
      const conLai = so.reduce((t, s) => t.split(s).join(' '), text).replace(/\s+/g, ' ').trim();
      // Dò mã HS trong phần còn lại (đã bỏ số hiệu văn bản: "57/2022/NĐ-CP" không phải mã 2022)
      const hs = (conLai.match(/(?<![\d/])\d{4}(?:[.\s]?\d{2}){0,2}(?![\d/])/) || [])[0]?.replace(/\D/g, '');
      const jobs = [];
      if (so.length && has(ctx, 'tra_hieu_luc_van_ban')) jobs.push(['📜 Hiệu lực văn bản', ctx.mcp.callTool('tra_hieu_luc_van_ban', { soHieu: so.slice(0, 50) })]);
      if (hs) {
        if (has(ctx, 'tra_chu_giai')) jobs.push([`📖 Chú giải — ${fmtHs(hs)}`, ctx.mcp.callTool('tra_chu_giai', { maHs: hs })]);
        if (has(ctx, 'tra_tien_le')) jobs.push([`🗂️ Tiền lệ phân loại — ${fmtHs(hs)}`, ctx.mcp.callTool('tra_tien_le', { maHs: hs })]);
      } else if (!so.length && conLai.length >= 3 && has(ctx, 'tra_tien_le')) {
        jobs.push(['🗂️ Tiền lệ phân loại', ctx.mcp.callTool('tra_tien_le', { moTa: conLai.slice(0, 300) })]);
      }
      if (!jobs.length) return ask('Chưa thấy số hiệu văn bản, mã HS hay mô tả hàng.', this.mau);
      const res = await Promise.all(jobs.map(([, p]) => p.catch(() => ({ ok: false, loi: 'CONG_KHONG_TRA_LOI', transport: true }))));   // lỗi gốc đã vào audit 'tool' của lõi
      return jobs.map(([t], i) => renderResult(res[i], { title: t })).join('\n\n');
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
      const xuatXu = (v.xuatXu && countryCode(v.xuatXu)) || 'CN';
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
      return `${renderResult(r, { title: `📄 Hồ sơ giải trình — khai ${fmtHs(maKhai)}${maHaiQuan ? ` / HQ áp ${fmtHs(maHaiQuan)}` : ''}` })}\n\n⚠️ Đây là BẢN NHÁP, người khai phải tự rà soát trước khi nộp.`;
    },
  },
];

/** Gói khả dụng theo danh sách công cụ của Cổng (null = chưa biết → hiện tất cả). */
export function availablePackages(toolNames) {
  if (!toolNames) return PACKAGES;
  return PACKAGES.filter((p) => p.congCu.every((t) => toolNames.has(t)) && (!p.canMotTrong || p.canMotTrong.some((t) => toolNames.has(t))));
}

export function menuText(pkgs, { full = false } = {}) {
  if (full) {
    const l = ['📦 CHỌN GÓI TRA CỨU — gõ số tương ứng:'];
    for (const p of pkgs) l.push(`${p.so}. ${p.icon} ${p.ten}\n   ${p.moTa}`);
    l.push('0. Tự động (bot tự chọn theo nội dung bạn gõ)');
    return l.join('\n');
  }
  return `———\n📦 ${pkgs.map((p) => `${p.so} ${p.ngan || p.ten}`).join(' · ')} · 0 Tự động · "menu"`;
}
