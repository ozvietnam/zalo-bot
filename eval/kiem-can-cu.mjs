// eval/kiem-can-cu.mjs — kiểm MÁY chống bịa căn cứ pháp lý (issue #136 mục C, mở lại ở #168).
//
// Mọi số hiệu văn bản trong tin bot gửi khách phải có trong dữ liệu Cổng của kịch bản, trong chữ
// khách tự gõ, hoặc là một dòng mẫu nhập liệu của gói. Số lạ = kịch bản TRƯỢT.
//
// Tách khỏi `eval/run.mjs` để `run.mjs` về dưới mức 300 dòng của Hiến pháp VI và để bộ kiểm đo được
// trực tiếp; `run.mjs` xuất lại `kiemBiaSoVanBan` nên nơi gọi cũ không phải đổi.
import { soVanBanTrongText, khoaSoVanBan, tapSoVanBanCong } from '../packs/hs/can-cu.js';
import { PACKAGES, menuText } from '../packs/hs/packages.js';

/** Chuẩn hoá một dòng để so khớp: bỏ thẻ trang trí `{b}`, gộp khoảng trắng, bỏ bullet đầu dòng. */
function chuanDongMau(s) {
  return String(s || '').replace(/\{\/?[a-z]+\}/g, '').replace(/^[\s•*+\-–]+/, '').replace(/\s+/g, ' ').trim();
}

/**
 * DÒNG mẫu nhập liệu của gói có in sẵn số hiệu văn bản (menu đầy đủ, dòng "Gửi thông tin theo mẫu"
 * của gói 5: "57/2022/NĐ-CP, 38/2015/TT-BTC"). Đây là ví dụ hướng dẫn khách gõ, không phải căn cứ
 * của câu trả lời — kiểm chống bịa phải bỏ qua, nếu không mọi kịch bản chạm menu đều trượt oan.
 *
 * Miễn trừ bám theo **dòng**, không theo số ([S2] của lượt soát #168): miễn con số ở mọi vị trí thì
 * `Căn cứ: TT 38/2015` do bot tự nghĩ ra cũng lọt, mà đó đúng là thứ kiểm này phải bắt.
 */
const DONG_MAU_TINH = (() => {
  const tap = new Set();
  const nhan = (s) => {
    for (const d of String(s || '').split('\n')) {
      const dong = chuanDongMau(d);
      if (dong && soVanBanTrongText(d).length > 0) tap.add(dong);
    }
  };
  for (const p of PACKAGES) nhan([p.ten, p.moTa, p.mau].filter(Boolean).join('\n'));
  nhan(menuText(PACKAGES, { full: true }));
  nhan(menuText(PACKAGES, { compact: true }));
  return tap;
})();

/**
 * Kiểm MÁY chống bịa căn cứ: mọi số hiệu văn bản trong tin bot gửi khách phải có trong dữ liệu Cổng
 * của kịch bản, trong chữ khách tự gõ, hoặc là nguyên văn một dòng mẫu nhập liệu của gói.
 * @param {string[]} tinBot các tin bot đã gửi cho khách
 * @param {any[]} ketQuaCong mọi kết quả công cụ Cổng đã trả trong kịch bản
 * @param {string[]} chuKhach mọi câu khách đã gõ
 * @returns {{ok: boolean, quet: number, bia?: string[], why?: string}} `quet` = số căn cứ đã đối chiếu
 */
export function kiemBiaSoVanBan(tinBot = [], ketQuaCong = [], chuKhach = []) {
  const nguon = tapSoVanBanCong(ketQuaCong, chuKhach);
  const bia = [];
  let quet = 0;
  for (const t of tinBot) {
    for (const dong of String(t || '').split('\n')) {
      // Dòng là NGUYÊN VĂN một dòng mẫu nhập liệu của gói → ví dụ hướng dẫn, không phải căn cứ.
      // Bot tự dựng câu khác có cùng số hiệu thì KHÔNG được miễn (xem `DONG_MAU_TINH`).
      if (DONG_MAU_TINH.has(chuanDongMau(dong))) continue;
      for (const v of soVanBanTrongText(dong)) {
        quet += 1;
        if (!nguon.has(khoaSoVanBan(v))) bia.push(v);
      }
    }
  }
  const dup = [...new Set(bia)];
  if (dup.length) {
    return { ok: false, quet, bia: dup, why: `chống bịa: số văn bản KHÔNG có trong dữ liệu Cổng của kịch bản: ${dup.join(', ')}` };
  }
  return { ok: true, quet };
}
