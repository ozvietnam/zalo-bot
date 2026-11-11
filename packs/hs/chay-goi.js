// packs/hs/chay-goi.js — chạy một gói con: trên văn bản lẻ, hoặc trên HỒ SƠ GỘP của mạch (issue #170).
//
// Tách khỏi `index.js` (Điều VI — mỗi tệp một trách nhiệm, dưới 300 dòng): `index.js` chỉ còn là
// "cửa" của gói (handle/onJobResult), còn cách chạy một gói con nằm ở đây.

import { toJob } from './packages.js';
import { clipReply } from './render.js';
import { result } from './flow-turn.js';
import { layHoSo, moTaGop, dongDangTra, nhieuNguon } from './ho-so.js';

/** Dòng "Em đang tra: …" chỉ đặt lên đầu tin khi hồ sơ gộp từ nhiều nguồn, không lặp lại tin một dòng chữ. */
export const dongHoSoCuaTin = (hoSo) => (nhieuNguon(hoSo) ? dongDangTra(hoSo) : '');

/** Chạy một gói con. Gói có batDau (1, 4) không chờ: DANG_XU_LY → job; còn lại → chữ trả lời như cũ. */
export async function runPkg(st, pkg, text, { head = '', nguonThongSo, hoSo = null, cauKhach = null } = {}) {
  // `cauKhach`: LỜI KHÁCH vừa gõ, nguyên văn. Khi gói 1 chạy trên HỒ SƠ GỘP (issue #170) thì
  // `text` là bản gộp, không phải lời khách — gói 1 còn phải theo LỜI KHÁCH ở hai chỗ: nhận
  // diện "hàng mới" (mở hồ sơ mới) và phép thử "khách gõ lại mô tả" (sổ trượt từ vựng).
  const pctx = st.pctx({ ...(nguonThongSo ? { nguonThongSo } : {}), ...(hoSo ? { hoSo } : {}),
    ...(cauKhach ? { cauKhach } : {}) });
  const boQuaTrangTri = pkg.so === 1 || (pkg.so === 2 && Boolean(st.session.banDayDuPhanLoai));
  const headPkg = boQuaTrangTri ? '' : head;
  const footerPkg = boQuaTrangTri ? '' : `\n\n${st.footer}`;
  const reply = (body, known) => result(st, [clipReply(`${headPkg}${body}${footerPkg}`)], { known });
  if (!pkg.batDau) return reply(await pkg.chay(text, pctx));
  const b = await pkg.batDau(text, pctx);
  if (typeof b === 'string') return reply(b);
  const t = toJob(b.r, b.resultTool, pctx);
  if (!t.job) {
    const body = await pkg.xong(t.result, b.context, pctx);
    // Dòng hồ sơ ở ĐẦU tin khi gói 1 chốt mã ngay trong lượt (yêu cầu 5 của issue #170).
    const dong = pkg.so === 1 ? dongHoSoCuaTin(hoSo || layHoSo(st.session)) : '';
    return reply(dong ? `${dong}\n\n${body}` : body, b.context);
  }
  // Kết quả phân loại (gói 1) theo form "🔍 Hàng: …" — không kèm dòng "(Tự động chọn gói 1)".
  // `dauHoSo`: dấu hồ sơ lúc giao việc. Hồ sơ đổi trước khi kết quả về → onJobResult bỏ kết quả cũ,
  // một mạch chỉ trả MỘT kết quả, không có hai kết quả chồng nhau (yêu cầu 6 của issue #170).
  const hoSoLuc = hoSo || layHoSo(st.session);
  // MỘT MẠCH MỘT VIỆC NỀN (yêu cầu 6 của issue #170). Đếm SỐ LƯỢT phân loại đã giao trong mạch và
  // đóng số đó vào việc nền: `onJobResult` chỉ bỏ kết quả khi mạch đã giao lượt MỚI HƠN, tức là có
  // kết quả khác chắc chắn thay nó. Đếm lượt là phép thử ĐÚNG câu hỏi cần hỏi — mã lượt một mình
  // không đủ (Cổng có thể trả lại cùng mã lượt), còn dấu hồ sơ thì tăng cả khi tin chỉ hỏi thêm và
  // không mở lượt nào, làm kết quả đã hứa bị bỏ mà không có gì thay (điểm [S17], Điều II).
  if (pkg.so === 1) st.session.soLuotGoi1 = (st.session.soLuotGoi1 ?? 0) + 1;
  const job = { ...t.job, context: { goi: pkg.so, head: pkg.so === 1 ? '' : head, ...b.context,
    dauHoSo: hoSoLuc.dau ?? 0, luotSo: pkg.so === 1 ? st.session.soLuotGoi1 : null,
    dongHoSo: pkg.so === 1 ? dongHoSoCuaTin(hoSoLuc) : '' } };
  if (pkg.so === 1) st.session.viecGoi1 = t.job.maLuot;
  // Câu "đang tra" KHÔNG soạn ở đây nữa: lõi gửi nó cho MỌI lượt có việc nền (`core/bao-dang-tra.js`,
  // chữ ở `dang-tra.js`) — trước đây chỉ vài nhánh giọng Quyên có, và nó chỉ đi ra SAU khi lượt xong.
  return result(st, [], { jobs: [job], known: b.context });
}

/**
 * Thêm một câu dẫn vào đầu PackResult của runPkg (dòng hồ sơ, câu "đã hiểu lại").
 * KHÔNG thêm nếu thân tin đã có đúng dòng đó: `runPkg` tự chèn dòng hồ sơ khi gói 1 chốt mã,
 * nên khách từng nhận hai tin liền nhau cùng mở đầu "Em đang tra: …" (người soát đo, điểm [S6]).
 */
export function themCauDan(res, cau) {
  if (!cau) return res;
  const than = (res.replies ?? []).map((r) => String(r?.text ?? '')).join('\n');
  if (than.includes(cau.trim())) return res;
  return { ...res, replies: [{ text: cau }, ...(res.replies ?? [])] };
}

/**
 * Chạy gói 1 trên HỒ SƠ MẶT HÀNG của mạch (issue #170): mô tả gửi Cổng là bản gộp
 * (chữ + chú thích ảnh + thông số đọc từ ảnh + câu sửa), không phải một tin lẻ.
 * `cauKhach` = lời khách vừa gõ, đưa xuống gói để gói theo LỜI KHÁCH khi quyết định
 * ("hàng mới" mở hồ sơ mới; "khách gõ lại mô tả" ghi sổ trượt từ vựng).
 */
export async function trenHoSo(st, phanLoai, hoSo, { cauDan = '', nguonThongSo, cauKhach } = {}) {
  st.session.hoSo = hoSo;
  const res = await runPkg(st, phanLoai, moTaGop(hoSo), { nguonThongSo, hoSo, cauKhach });
  return themCauDan(res, cauDan);
}
