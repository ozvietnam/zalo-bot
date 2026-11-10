// packs/hs/giong-quyen.js — Định dạng câu trả lời tự nhiên theo giọng Quyên (đích G4, issue #136).
// Tiêu chí: ngắn trước, chi tiết sau (<= 6-7 dòng), xưng em gọi anh/chị, <= 2 emoji/tin,
// không dồn tiêu đề in đậm, bỏ "(Tự động chọn gói N)", bỏ chân "Gõ menu", cảnh báo gợi ý 1 dòng ngắn.
import { fmtHs } from './format.js';
import { b } from './style.js';
import { phanTichChinhSach } from './render.js';
import { phanTichCanCu, dongCanCu } from './can-cu.js';
import { XUNG_HO_MAC_DINH, hoaDau } from './xung-ho.js';

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
  tienLe,
  // `xuatXu` = xuất xứ THẬT của lô hàng, `null` nghĩa là KHÁCH CHƯA NÓI ([S3] của #168). Mặc định
  // `null` là cố ý: nơi gọi phải nói rõ mình biết nước, chứ không được để hàm tự nhận vơ 'CN' — chính
  // giá trị mặc định ở chỗ tính là nguyên nhân gốc của lỗi này (`.van-phong/nghien-cuu.md` mục 1).
  xuatXu = null,
  giaDinh = null,
  xungHo = XUNG_HO_MAC_DINH,
} = {}) {
  const xh = String(xungHo || XUNG_HO_MAC_DINH);
  const bietXuatXu = Boolean(xuatXu);
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
    lines.push(`Dạ theo giả định ${giaDinh} thì mã phù hợp nhất là ${maHsFmt} (${tenTrongBieu}) ${xh} nhé.`);
  } else {
    const tenHien = String(tenHang || '').trim();
    lines.push(`Dạ ${tenHien} thì mã phù hợp nhất là ${maHsFmt} (${tenTrongBieu}) ${xh} nhé.`);
  }

  // Dòng 2: Thuế NK & ACFTA
  if (tx) {
    const mfn = pct(tx.taxNkPreferential);
    const fo = tx.acfta?.forOrigin || tx.taxAcftaChina;
    if (fo && fo.eligible === true && !bietXuatXu) {
      // Khách CHƯA nói nước: bảng thuế trên được tra theo một xuất xứ MỐC, nên mức ưu đãi của nó
      // không phải mức của lô hàng này. Nêu MFN và nói rõ ưu đãi phụ thuộc xuất xứ, KHÔNG mời C/O
      // mẫu E — mời là kết luận cho lô hàng mình chưa biết nước ([S3] của #168, Hiến pháp VIII).
      lines.push(`• Thuế NK ${mfn}; mức ưu đãi FTA còn tuỳ xuất xứ ${xh} cho em biết nhé`);
    } else if (fo && fo.eligible === true) {
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

  // Dòng 5: Căn cứ pháp lý (issue #136 mục B) — tối đa 3 văn bản, chỉ số hiệu Cổng trả trong CHÍNH lượt này.
  // Không có dữ liệu căn cứ thì bỏ hẳn dòng, không bịa.
  // `boFta`: chưa biết xuất xứ thì dòng này KHÔNG được dẫn văn bản ưu đãi — nó không có nhãn xuất xứ
  // nên khách đọc như kết luận cho lô hàng của mình ([S3] của #168; xem `.van-phong/nghien-cuu.md`).
  const cc = phanTichCanCu({ thue, thuTuc, tienLe, boFta: !bietXuatXu });
  const dongCc = dongCanCu(cc);
  if (dongCc) lines.push(dongCc);

  // Dòng 6: Câu hỏi mở bước tiếp theo
  lines.push(`${hoaDau(xh)} muốn em soạn luôn mô tả khai báo, hay xem chi tiết giấy tờ cần làm ạ?`);

  // Dòng 7: Cảnh báo gợi ý gọn 1 dòng
  lines.push(`(Mã HS là gợi ý tham khảo, ${xh} đối chiếu thực tế khi khai báo nhé ạ)`);

  return lines.join('\n');
}
