// packs/hs/giong-quyen.js — Định dạng câu trả lời tự nhiên theo giọng Quyên (đích G4, issue #136).
// Tiêu chí: ngắn trước, chi tiết sau (<= 6-7 dòng), xưng em gọi anh/chị, <= 2 emoji/tin,
// không dồn tiêu đề in đậm, bỏ "(Tự động chọn gói N)", bỏ chân "Gõ menu", cảnh báo gợi ý 1 dòng ngắn.
import { fmtHs } from './format.js';
import { b } from './style.js';
import { phanTichChinhSach } from './render.js';
import { tenNuoc } from './input.js';
import { canCuThue, canCuChinhSach } from './can-cu.js';

const pct = (v) => (v == null || v === '' ? '—' : /^\d+(\.\d+)?$/.test(String(v)) ? `${v}%` : String(v));
const ngayVN = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : null; };
/** Tin đầu tối đa 3 căn cứ (issue #136 mục B4). */
const TOI_DA_CAN_CU = 3;

/**
 * Dựng câu trả lời tóm tắt ngắn kết quả phân loại mã HS theo giọng Quyên.
 * @param {object} param0
 */
export function renderPhanLoaiGiongQuyen({
  tenHang,
  maHs,
  phanLoai,
  thue,
  thuTuc,
  moTa,
  xuatXu = 'CN',
  giaDinh = null,
  giaDinhXuatXu = false,
} = {}) {
  const top = phanLoai?.data && typeof phanLoai.data === 'object' ? phanLoai.data : phanLoai || {};
  const kq = top.ketQua && typeof top.ketQua === 'object' ? top.ketQua : top;
  const list = (Array.isArray(kq.results) && kq.results) || (Array.isArray(kq.suggestions) && kq.suggestions) || [];
  const maCua = (x) => String(x?.hs || x?.hsCode || x?.maHs || '').replace(/\D/g, '');
  const chinh = list.find((x) => maCua(x) === maHs) || list[0] || null;

  const tData = thue && thue.ok !== false && !thue.isError ? (thue.data ?? thue) : null;
  const tx0 = tData ? (Array.isArray(tData.results) ? tData.results[0] : tData) : null;
  const tx = tx0?.hsCode ? tx0 : null;

  const csData = thuTuc && thuTuc.ok !== false && !thuTuc.isError ? (thuTuc.data ?? thuTuc) : null;
  const cs = csData ? phanTichChinhSach(csData) : null;

  // Căn cứ pháp lý (issue #168): CHỈ số hiệu Cổng trả trong chính lượt này, mỗi ý một ngoặc.
  // Tối đa 3 văn bản "quyết định nhất" (mục B4), theo thứ tự: thuế NK, nghĩa vụ chính sách, FTA, VAT.
  const ccThue = canCuThue(thue) || {};
  // Căn cứ của ý chính sách: văn bản CÒN hiệu lực mà dòng chính sách đầu tiên viện dẫn (Cổng đã kiểm).
  // Văn bản hết hiệu lực / chưa xác minh không làm căn cứ chính (mục B3) → không nêu.
  const dauCs = cs?.muc?.length ? (csData.chinhSach?.policyLines || []).find((p) => p?.soHieu && cs.muc[0].startsWith(String(p.text || '').slice(0, 15))) : null;
  const ccCs = dauCs ? canCuChinhSach(thuTuc).find((c) => c.so === String(dauCs.soHieu).replace(/-PL\d+$/i, '') && c.dung) : null;
  const chon = new Set([ccThue.mfn, ccCs, ccThue.fta, ccThue.vat].filter((c) => c?.so).map((c) => c.so).filter((so, i, a) => a.indexOf(so) === i).slice(0, TOI_DA_CAN_CU));
  const cite = (c, them = '') => (c?.so && chon.has(c.so) ? ` (${c.so}${them})` : '');

  // 1. Tên biểu thuế hoặc lý do ngắn
  let tenTrongBieu = '';
  if (tx?.nameVi) {
    tenTrongBieu = String(tx.nameVi).replace(/^[\s\-–]+/, '').trim().toLowerCase();
    if (tenTrongBieu.length > 50) tenTrongBieu = `${tenTrongBieu.slice(0, 48)}…`;
  } else if (chinh?.nameVi) {
    tenTrongBieu = String(chinh.nameVi).trim().toLowerCase();
    if (tenTrongBieu.length > 50) tenTrongBieu = `${tenTrongBieu.slice(0, 48)}…`;
  } else {
    tenTrongBieu = 'mặt hàng phù hợp';
  }

  // Dòng 1: Mã đề xuất & lý do ngọn
  const lines = [];
  const maHsFmt = b(fmtHs(maHs));
  if (giaDinh) {
    lines.push(`Dạ theo giả định ${giaDinh} thì mã phù hợp nhất là ${maHsFmt} (${tenTrongBieu}) anh/chị nhé.`);
  } else {
    const tenHien = String(tenHang || '').trim();
    lines.push(`Dạ ${tenHien} thì mã phù hợp nhất là ${maHsFmt} (${tenTrongBieu}) anh/chị nhé.`);
  }

  // Dòng 2: Thuế NK & ACFTA
  if (tx) {
    const mfn = pct(tx.taxNkPreferential);
    const fo = tx.acfta?.forOrigin || tx.taxAcftaChina;
    // Biểu thuế Cổng chưa đối chiếu văn bản mới (`tariff.freshness: DUE`) → nói ngay ở dòng thuế (KB2).
    const doiChieu = ccThue.canDoiChieu ? ' (biểu thuế cần đối chiếu lại)' : '';
    if (fo && fo.eligible === true) {
      // Ưu đãi FTA luôn kèm điều kiện C/O hợp lệ + đạt quy tắc xuất xứ (mục B5).
      lines.push(`• Thuế NK ${mfn}${cite(ccThue.mfn)}; có C/O mẫu E hợp lệ, đạt quy tắc xuất xứ thì còn ${pct(fo.rate)}${cite(ccThue.fta)}${doiChieu}`);
    } else if (fo && fo.eligible === false) {
      lines.push(`• Thuế NK ${mfn}${cite(ccThue.mfn)} (C/O mẫu E không ưu đãi, áp MFN)${doiChieu}`);
    } else {
      lines.push(`• Thuế NK ưu đãi (MFN): ${mfn}${cite(ccThue.mfn)}${doiChieu}`);
    }

    // Dòng 3: VAT — mức giảm có hạn thì nói hạn (Cổng trả `vatReduction`), không dán nguyên câu ghi chú dài.
    const giam = tx.vatReduction?.reduced && tx.vatReduction.rate != null;
    const han = giam ? ngayVN(tx.vatReduction.validUntil) : null;
    lines.push(giam
      ? `• VAT ${pct(tx.vatReduction.rate)}${han ? ` tới hết ${han}` : ''}${cite(ccThue.vat)}`
      : `• VAT ${pct(tx.taxVat)}${cite(ccThue.vat)}`);

    // Khách chưa nói nước mà các mức trên lại tính theo một nước → nói thẳng đó là giả định
    // (issue #177, yêu cầu 3). Mức ACFTA/C/O mẫu E chỉ đúng với hàng Trung Quốc, nên im lặng ở đây
    // là đưa khách một con số thuế không có căn cứ trong lượt (Điều III) và nói như đã biết (Điều VIII).
    if (giaDinhXuatXu) lines.push(`• Các mức trên em tính theo giả định xuất xứ ${tenNuoc(xuatXu)} — anh/chị cho em biết nước nhập để em tra đúng ạ.`);
  }

  // Dòng 4: 1 cảnh báo chính sách quan trọng nhất
  if (cs && cs.muc.length > 0) {
    let cb = cs.muc[0];
    if (cb.length > 70) cb = `${cb.slice(0, 68)}…`;
    lines.push(`• Lưu ý: ${cb}${cite(ccCs, ccCs?.chuaDoiChieu ? ', chưa đối chiếu bản gốc' : '')}`);
  }

  // Dòng 5: Câu hỏi mở bước tiếp theo
  lines.push(`Anh/chị muốn em soạn luôn mô tả khai báo, hay xem chi tiết giấy tờ cần làm ạ? Gõ "căn cứ" để xem đủ văn bản pháp lý.`);

  // Dòng 6: Cảnh báo gợi ý gọn 1 dòng
  lines.push(`(Mã HS là gợi ý tham khảo, anh/chị đối chiếu thực tế khi khai báo nhé ạ)`);

  return lines.join('\n');
}
