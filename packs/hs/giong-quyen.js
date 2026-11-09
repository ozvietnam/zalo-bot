// packs/hs/giong-quyen.js — Định dạng câu trả lời tự nhiên theo giọng Quyên (đích G4, issue #136).
// Tiêu chí: ngắn trước, chi tiết sau (<= 6-7 dòng), xưng em gọi anh/chị, <= 2 emoji/tin,
// không dồn tiêu đề in đậm, bỏ "(Tự động chọn gói N)", bỏ chân "Gõ menu", cảnh báo gợi ý 1 dòng ngắn.
import { fmtHs } from './format.js';
import { b } from './style.js';
import { phanTichChinhSach } from './render.js';

const pct = (v) => (v == null || v === '' ? '—' : /^\d+(\.\d+)?$/.test(String(v)) ? `${v}%` : String(v));

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
} = {}) {
  const top = phanLoai?.data && typeof phanLoai.data === 'object' ? phanLoai.data : phanLoai || {};
  const kq = top.ketQua && typeof top.ketQua === 'object' ? top.ketQua : top;
  const list = (Array.isArray(kq.results) && kq.results) || (Array.isArray(kq.suggestions) && kq.suggestions) || [];
  const maCua = (x) => String(x?.hs || x?.hsCode || x?.maHs || '').replace(/\D/g, '');
  const chinh = list.find((x) => maCua(x) === maHs) || list[0] || null;

  const tData = thue && thue.ok !== false && !thue.isError ? (thue.data ?? thue) : null;
  const tx0 = tData ? (Array.isArray(tData.results) ? tData.results[0] : tData) : null;
  const tx = tx0?.hsCode ? tx0 : null;

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
    lines.push(`Dạ theo giả định ${giaDinh} thì mã phù hợp nhất là ${maHsFmt} (${tenTrongBieu}) anh nhé.`);
  } else {
    const tenHien = String(tenHang || '').trim();
    lines.push(`Dạ ${tenHien} thì mã phù hợp nhất là ${maHsFmt} (${tenTrongBieu}) anh nhé.`);
  }

  // Dòng 2: Thuế NK & ACFTA
  if (tx) {
    const mfn = pct(tx.taxNkPreferential);
    const fo = tx.acfta?.forOrigin || tx.taxAcftaChina;
    if (fo && fo.eligible === true) {
      lines.push(`• Thuế NK ${mfn}, có C/O mẫu E thì còn ${pct(fo.rate)}`);
    } else if (fo && fo.eligible === false) {
      lines.push(`• Thuế NK ${mfn} (C/O mẫu E không ưu đãi, áp MFN)`);
    } else {
      lines.push(`• Thuế NK ưu đãi (MFN): ${mfn}`);
    }

    // Dòng 3: VAT
    const vat = pct(tx.taxVat);
    const vatNote = tx.vatReduction?.noteVi ? ` (${tx.vatReduction.noteVi})` : '';
    lines.push(`• VAT ${vat}${vatNote}`);
  }

  // Dòng 4: 1 cảnh báo chính sách quan trọng nhất
  const csData = thuTuc && thuTuc.ok !== false && !thuTuc.isError ? (thuTuc.data ?? thuTuc) : null;
  const cs = csData ? phanTichChinhSach(csData) : null;
  if (cs && cs.muc.length > 0) {
    let cb = cs.muc[0];
    if (cb.length > 70) cb = `${cb.slice(0, 68)}…`;
    lines.push(`• Lưu ý: ${cb}`);
  }

  // Dòng 5: Câu hỏi mở bước tiếp theo
  lines.push(`Anh muốn em soạn luôn mô tả khai báo, hay xem chi tiết giấy tờ cần làm ạ?`);

  // Dòng 6: Cảnh báo gợi ý gọn 1 dòng
  lines.push(`(Mã HS là gợi ý tham khảo, anh/chị đối chiếu thực tế khi khai báo nhé ạ)`);

  return lines.join('\n');
}
