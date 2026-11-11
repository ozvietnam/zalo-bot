// packs/hs/dang-tra.js — câu "đang tra" giọng Quyên (issue #168, phần 1).
//
// Lõi (`core/bao-dang-tra.js`) quyết định LÚC NÀO gửi (lượt phải đợi Cổng quá 1,5 giây, hoặc có việc
// nền); gói chỉ soạn CHỮ. Câu ngắn, xưng em, gọi anh/chị, không emoji, không hứa con số nào ngoài
// "khoảng 1 phút" (Cổng phân loại ~45 giây sau khi chuyển Gemini 3.5 Flash — bình luận 10/11 12:26).

/** Công cụ Cổng thuộc việc phân loại mã (chậm nhất, thường 20–60 giây). */
const PHAN_LOAI = new Set(['phan_loai_hs', 'bo_sung_du_kien', 'ket_qua_phan_loai']);

export const CAU_DANG_TRA = Object.freeze({
  phanLoai: 'Dạ em đang tra mã cho anh/chị, khoảng 1 phút ạ, chờ em chút nhé.',
  viecNen: 'Dạ em đang kiểm cho anh/chị, khoảng 1 phút ạ, chờ em chút nhé.',
  anh: 'Dạ em đang xem ảnh và tra cho anh/chị, chờ em chút nhé ạ.',
  chung: 'Dạ để em tra cho anh/chị ạ, chờ em chút nhé.',
  // Việc nền quá 60 giây chưa xong: báo tiến độ MỘT lần (issue #168, mục 3) — chữ khác hẳn câu đầu.
  tienDo: 'Dạ Cổng vẫn đang phân tích kỹ mặt hàng này, anh/chị đợi em thêm ít phút, xong em gửi ngay ạ.',
});

/**
 * @param {object} turn
 * @param {object|null} ctx
 * @param {{ congCu?: string|null, viecNen?: boolean, tienDo?: boolean }} info
 * @returns {string|null}
 */
export function cauDangTra(turn, ctx, { congCu = null, viecNen = false, tienDo = false } = {}) {
  if (tienDo) return CAU_DANG_TRA.tienDo;
  if (congCu === 'anh') return CAU_DANG_TRA.anh;
  if (PHAN_LOAI.has(congCu)) return CAU_DANG_TRA.phanLoai;
  if (viecNen) return CAU_DANG_TRA.viecNen;
  return CAU_DANG_TRA.chung;
}
