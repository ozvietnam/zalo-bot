// packs/hs/ho-so.js — HỒ SƠ MẶT HÀNG của một mạch khách (issue #170).
//
// Một mạch = một khách trong một hội thoại (convId của lõi: `chatId` khi 1-1, `chatId:userId` trong nhóm),
// nên hồ sơ nằm trong phiên (`ctx.session.hoSo`) là đã tách sẵn theo người: hai người trong cùng nhóm
// hỏi hai món thì hai hồ sơ không lẫn vào nhau.
//
// Mọi tin của khách CẬP NHẬT hồ sơ đó, không mở lượt tra mới từ đầu:
//   • mô tả bằng chữ          → themChu
//   • ảnh (chú thích + thông số AI đọc được) → themAnh — BỔ SUNG, không bao giờ ghi đè mô tả chữ
//   • câu trả lời / câu sửa của khách hay nhân viên → themSua
// `dau` là số lần hồ sơ thực sự đổi: việc nền ghi dấu lúc tạo, hồ sơ đổi thì kết quả cũ bị bỏ
// (một mạch chỉ trả một kết quả, không có hai kết quả chồng nhau).
//
// Trách nhiệm của tệp này: CẤU TRÚC hồ sơ và cách cập nhật nó.
// Lớp nhận dạng tin nằm ở `nhan-dang.js`, bộ lọc tạp âm ở `loc-tap-am.js` (Điều VI: mỗi tệp một
// trách nhiệm, dưới 300 dòng).

import { norm, parseLabeled, dai } from './input.js';
import {
  laLenhTroHoSo, laTenHangCam, laCauXemLai, laLenhCauTruc, cungMonVoi, coNhanTruong, TRUONG,
  CO_KHI_RE, DIEN_RE, boLoiChao, boYeuCauDau,
} from './nhan-dang.js';
import { locTapAmAnh } from './loc-tap-am.js';

// Tái xuất lớp nhận dạng và bộ lọc tạp âm: các tệp khác giữ nguyên đường import cũ (`./ho-so.js`).
export {
  laLenhTroHoSo, laTenHangCam, laCauXemLai, laLenhCauTruc, laCauHangMoi, boTienToHangMoi,
  laMonKhac, cungMonVoi, coNhanTruong, boYeuCauDau,
} from './nhan-dang.js';
export { locTapAmAnh } from './loc-tap-am.js';

/** Hồ sơ trống của một mạch. */
export function hoSoRong() {
  return { moTa: null, nguonMoTa: null, chatLieu: null, congDung: null, thongSo: null, thuongHieu: null, model: null,
    chuAnh: null, sua: [], nguon: [], dau: 0, daGiaiMauThuan: false, choTraLoi: false };
}

/** Lấy hồ sơ trong phiên (thiếu/cũ → hồ sơ trống). */
export function layHoSo(session) {
  const h = session?.hoSo;
  if (!h || typeof h !== 'object') return hoSoRong();
  return { ...hoSoRong(), ...h, sua: Array.isArray(h.sua) ? h.sua : [], nguon: Array.isArray(h.nguon) ? h.nguon : [] };
}

/** Chỉ nhận giá trị mới khi ô đang trống (ảnh BỔ SUNG, không ghi đè chữ khách gõ). */
const dienNeuTrong = (cu, moi) => (dai(cu) ? cu : (dai(moi) || null));

/** Tin chữ của khách → hồ sơ. Lệnh ngắn / từ cấm không bao giờ thành mô tả hàng. */
export function themChu(hoSo, text, { chiNhan = false } = {}) {
  const h = { ...layHoSo({ hoSo }) };
  const raw = boYeuCauDau(boLoiChao(text));
  if (!raw || laLenhTroHoSo(raw) || laTenHangCam(raw)) return h;
  const { values: v, conLai } = parseLabeled(raw, TRUONG);
  // chiNhan: chỉ nhận các ô CÓ NHÃN (câu sửa của khách không được nối vào tên hàng — nó đi mục riêng).
  const moTaMoi = chiNhan ? dai(v.moTa) : dai(v.moTa || conLai);
  let doi = false;
  // Mô tả: giữ bản ĐẦY ĐỦ hơn (khách gửi lại mô tả cũ ở tin 10:06 thì hồ sơ không đổi).
  if (moTaMoi && !laTenHangCam(moTaMoi)) {
    const cu = dai(h.moTa);
    if (!cu) { h.moTa = moTaMoi; h.nguonMoTa = 'CHU'; doi = true; }
    else if (norm(moTaMoi) !== norm(cu) && !norm(cu).includes(norm(moTaMoi))) {
      // Nối bằng " — ", KHÔNG bằng dấu ";": parseLabeled cắt dòng ở dấu ";" nên nửa sau sẽ rụng khỏi tên hàng.
      h.moTa = norm(moTaMoi).includes(norm(cu)) ? moTaMoi : `${cu} — ${moTaMoi}`;
      h.nguonMoTa = 'CHU';
      doi = true;
    }
  }
  for (const k of ['chatLieu', 'congDung', 'thongSo', 'thuongHieu', 'model']) {
    const moi = dai(v[k]);
    if (moi && norm(moi) !== norm(h[k] || '')) { h[k] = moi; doi = true; }
  }
  if (doi) { h.dau = (h.dau || 0) + 1; h.nguon = [...new Set([...(h.nguon || []), 'CHU'])]; }
  return h;
}

/**
 * Tin chữ tiếp theo trong mạch đã có hồ sơ: dữ kiện của CÙNG món thì gộp vào mô tả,
 * chữ tự do thì đi mục "khách nói thêm" (themSua) — không bao giờ nối vào tên hàng gửi Cổng.
 * Người soát đo được tên hàng lai kiểu "Chốt kẹp … — 7 — soát tờ khai — xin chào".
 *
 * Tin chữ đi qua ĐÚNG MỘT bộ lọc tạp âm với chú thích ảnh (`locTapAmAnh`): mục "khách nói thêm"
 * in CÙNG DÒNG `Tên hàng:` (xem `moTaGop`) nên tạp âm gõ bằng tin chữ cũng tới Cổng y như tạp âm
 * trong chú thích ảnh — đúng lớp lỗi [S15] ở đường khác (người soát đo, [S16]).
 *
 * Lọc NGHIÊM cả tin chữ, và câu sửa của khách vẫn sống: "chữ on/off là đóng mở, không liên quan
 * dòng điện" có từ hàng hoá ("điện") nên được giữ; đường trả lời câu hỏi mâu thuẫn ở `index.js`
 * (`themSua`) và đường dựng lại (`dungTuLichSu`) cũng không đi qua bộ lọc này.
 */
export function themTinTiep(hoSo, text) {
  const h = layHoSo({ hoSo });
  if (!dai(h.moTa)) return themChu(h, text);
  const { sach, bo } = locTapAmAnh(text);
  // Phần bỏ chỉ để log/đối chiếu, KHÔNG gửi Cổng (giống đường chú thích ảnh).
  if (bo.length) h.chuThichBoQua = [...(h.chuThichBoQua || []), ...bo].slice(-5);
  const t = dai(sach);
  if (!t) return h;                               // cả tin là tạp âm → hồ sơ không đổi
  if (cungMonVoi(t, h.moTa)) return themChu(h, t);
  // Tin khai theo NHÃN ("chất liệu: thép không gỉ", "model: …") là dữ kiện của ô tương ứng, không
  // phải chữ tự do: `themChu` xếp đúng ô, không nối vào tên hàng. Đẩy xuống "khách nói thêm" thì
  // chú thích ảnh dạng nhãn bị nhân đôi vào tên hàng rồi cắt bớt mất câu sửa thật của khách.
  if (coNhanTruong(t)) return themChu(h, t);
  return themSua(h, t);
}

/**
 * Thông số AI đọc từ ảnh + chú thích → hồ sơ, dạng BỔ SUNG:
 * chỉ điền ô còn trống, không bao giờ thay mô tả chữ của khách (yêu cầu 1 của issue).
 */
export function themAnh(hoSo, specs, caption = '') {
  let h = { ...layHoSo({ hoSo }) };
  // Chú thích ảnh đi qua ĐÚNG MỘT LUẬT với tin chữ (`themTinTiep`) và đường dựng lại
  // (`dungTuLichSu`), sau khi lọc tạp âm hội thoại (`locTapAmAnh`). Trước đây dòng này là
  // `themChu(h, caption)` — nối thẳng cả câu đàm thoại vào `moTa`, nên `tenHang` gửi Cổng mang
  // "giống công tắc điện" và kéo mã sang nhóm hàng điện (điểm [S15], quyết thay CEO).
  if (caption) {
    const { sach, bo } = locTapAmAnh(caption);
    // Phần bỏ chỉ để người soát/log đối chiếu, KHÔNG gửi Cổng và KHÔNG xuống mục "khách nói thêm"
    // (mục đó in cùng dòng `Tên hàng:` nên tạp âm sẽ ô nhiễm lại đúng trường vừa làm sạch).
    if (bo.length) h.chuThichBoQua = bo.slice(-5);
    if (sach) h = themTinTiep(h, sach);
  }
  const s = specs || {};
  const truoc = JSON.stringify([h.moTa, h.chatLieu, h.congDung, h.thongSo, h.thuongHieu, h.model, h.chuAnh]);
  if (!dai(h.moTa) && dai(s.tenHang)) { h.moTa = dai(s.tenHang); h.nguonMoTa = 'ANH'; }
  // Tên trên ảnh CHỨA trọn mô tả chữ (chú thích "cảm biến" ↔ ảnh "Cảm biến tiệm cận") thì không phải
  // ghi đè mà là cùng một tên nói đủ hơn → giữ bản đầy đủ. Tên ngược hướng (ON OFF) không chứa mô tả
  // chữ nên vẫn bị giữ nguyên làm phần bổ sung (issue #170, yêu cầu 1).
  else if (dai(s.tenHang) && dai(h.moTa) && norm(s.tenHang) !== norm(h.moTa) && norm(s.tenHang).includes(norm(h.moTa))) {
    h.moTa = dai(s.tenHang);
  }
  h.chatLieu = dienNeuTrong(h.chatLieu, s.chatLieu);
  h.congDung = dienNeuTrong(h.congDung, s.congDung);
  // THƯƠNG HIỆU và MODEL chỉ nhận khi ảnh nói về CÙNG MÓN với mô tả chữ của khách (điểm [S7]):
  // một tấm ảnh tem nhãn của món khác từng đưa nhãn hiệu lạ vào hồ sơ, rồi gói 1 kích `kiem_tra_shtt`
  // và in cảnh báo "Rủi ro nhãn hiệu <X>" về một nhãn khách chưa hề nói tới. Chất liệu/thông số thì
  // vẫn gộp như cũ (mô tả, không phải danh tính hàng).
  const anhCungMon = !dai(h.moTa) || h.nguonMoTa !== 'CHU'
    || cungMonVoi([dai(s.tenHang), dai(s.model)].filter(Boolean).join(' '), h.moTa);
  if (anhCungMon) {
    h.thuongHieu = dienNeuTrong(h.thuongHieu, s.thuongHieu);
    h.model = dienNeuTrong(h.model, s.model);
  }
  const ts = s.thongSo && typeof s.thongSo === 'object'
    ? Object.entries(s.thongSo).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ')
    : dai(s.thongSo);
  h.thongSo = dienNeuTrong(h.thongSo, ts);
  // Chữ in trên ảnh chỉ là ghi chú để đối chiếu, KHÔNG vào mô tả gửi Cổng.
  if (dai(s.chuTrongAnh)) h.chuAnh = dai(s.chuTrongAnh).slice(0, 300);
  if (dai(s.tenHang)) h.tenAnh = dai(s.tenHang).slice(0, 200);
  if (JSON.stringify([h.moTa, h.chatLieu, h.congDung, h.thongSo, h.thuongHieu, h.model, h.chuAnh]) !== truoc) {
    h.dau = (h.dau || 0) + 1;
  }
  h.nguon = [...new Set([...(h.nguon || []), 'ANH'])];
  return h;
}

/**
 * Câu trả lời / câu sửa của khách hay nhân viên → hồ sơ (luôn làm hồ sơ đổi).
 *
 * Đường này KHÔNG đi qua bộ lọc tạp âm (`locTapAmAnh`) như `themTinTiep` → lời chào và lệnh
 * ngắn lọt vào đây thì nằm nguyên trong tên hàng gửi Cổng ("đây nhé, chốt kẹp …" → Cổng đọc
 * cả câu chào, có thể kéo mã sang hướng điện — điểm [S26] của người soát). Vì vậy: bỏ lời
 * chào (`boLoiChao`, dùng chung với `themChu`) và TỪ CHỐI lệnh ngắn / tên hàng cấm — lệnh không
 * phải dữ kiện mặt hàng nên hồ sơ không đổi (không thêm câu sửa, không tăng dấu hồ sơ).
 */
export function themSua(hoSo, text) {
  const h = themChu(layHoSo({ hoSo }), text, { chiNhan: true });
  const t = dai(boLoiChao(text)).slice(0, 500);
  if (!t) return h;
  if (laLenhTroHoSo(t) || laTenHangCam(t)) return { ...h, choTraLoi: false };
  const sua = [...(h.sua || [])];
  if (!sua.some((x) => norm(x) === norm(t))) sua.push(t);
  h.sua = sua.slice(-5);
  h.nguon = [...new Set([...(h.nguon || []), 'SUA'])];
  h.choTraLoi = false;
  // Khách nói rõ ON/OFF không phải điện → hướng đọc từ ảnh bị bỏ, thôi hỏi lại.
  if (DIEN_RE.test(norm(t)) || laCauXemLai(t)) {
    h.daGiaiMauThuan = true;
    h.boHuongAnh = dai(h.chuAnh) || dai(h.tenAnh) || null;
    h.chuAnh = null;
    h.tenAnh = null;
  }
  h.dau = (h.dau || 0) + 1;
  return h;
}

/**
 * Câu nói rõ hồ sơ đã đổi gì sau khi khách sửa (yêu cầu 4 của issue):
 * nêu điều đã hiểu lại rồi nói đang phân loại lại trên hồ sơ đầy đủ.
 */
export function cauDaDoi(hoSo) {
  const h = layHoSo({ hoSo });
  const l = [];
  if (dai(h.boHuongAnh)) {
    l.push(`Dạ em hiểu rồi, "${dai(h.boHuongAnh)}" là vị trí đóng/mở của chốt, không phải công tắc điện.`);
  } else if ((h.sua || []).length) {
    // Không có hướng đọc từ ảnh để bỏ (hồ sơ dựng lại từ lịch sử) → nhắc lại đúng điều khách vừa sửa.
    l.push(`Dạ em hiểu rồi: ${dai(h.sua.at(-1)).slice(0, 200)}.`);
  }
  const d = dongDangTra(h);
  l.push(`Em phân loại lại trên toàn bộ thông tin anh/chị đã gửi${d ? `: ${d.replace(/^Em đang tra: /, '')}` : ''}.`);
  return l.join(' ');
}

/** Mô tả gộp gửi Cổng: mô tả chữ là gốc, ảnh và câu sửa là phần bổ sung. */
export function moTaGop(hoSo) {
  const h = layHoSo({ hoSo });
  const l = [];
  // Câu sửa của khách/nhân viên đi CÙNG DÒNG mô tả: các gói đọc mô tả theo nhãn
  // (`packs/hs/input.js` parseLabeled), nhãn lạ sẽ bị bỏ — câu sửa thì không được mất.
  if (dai(h.moTa)) {
    // Nối các câu sửa bằng " — ", KHÔNG bằng "; ": `parseLabeled` cắt dòng ở dấu ";" nên câu
    // sửa thứ hai rụng khỏi tên hàng gửi Cổng (điểm [S26] của người soát).
    const them = (h.sua || []).map((s) => dai(s)).filter(Boolean).join(' — ');
    l.push(`Tên hàng: ${dai(h.moTa)}${them ? ` (khách nói thêm: ${them})` : ''}`);
  }
  if (dai(h.chatLieu)) l.push(`Chất liệu: ${dai(h.chatLieu)}`);
  if (dai(h.congDung)) l.push(`Công dụng: ${dai(h.congDung)}`);
  if (dai(h.thongSo)) l.push(`Thông số: ${dai(h.thongSo)}`);
  if (dai(h.thuongHieu)) l.push(`Thương hiệu: ${dai(h.thuongHieu)}`);
  if (dai(h.model)) l.push(`Model: ${dai(h.model)}`);
  return l.join('\n');
}

/** Hồ sơ đã đủ để gọi Cổng? */
export function duDeTra(hoSo) {
  return dai(layHoSo({ hoSo }).moTa).length >= 2;
}

/**
 * Mâu thuẫn giữa ảnh và mô tả chữ → HỎI LẠI một câu, không tự chọn bên ảnh (yêu cầu 1 của issue).
 * → { cauHoi } | null
 */
export function mauThuan(hoSo) {
  const h = layHoSo({ hoSo });
  if (h.daGiaiMauThuan) return null;
  // Chỉ mâu thuẫn khi mô tả gốc do KHÁCH GÕ: hồ sơ chỉ có ảnh thì không có gì để đối chiếu.
  if (h.nguonMoTa !== 'CHU') return null;
  const moTa = norm(h.moTa);
  if (!moTa || !CO_KHI_RE.test(moTa)) return null;
  const anh = norm([h.chuAnh, h.tenAnh].filter(Boolean).join(' '));
  if (!anh || !DIEN_RE.test(anh)) return null;
  const chu = dai(h.chuAnh) || dai(h.tenAnh);
  return { cauHoi: `Ảnh có chữ "${chu}" (nghe như công tắc điện), còn mô tả anh/chị gửi là ${dai(h.moTa).slice(0, 80)} — chữ ON/OFF ở đây là vị trí đóng/mở của chốt, hay hàng thật sự có mạch điện ạ?` };
}

/**
 * Hồ sơ đã gộp từ NHIỀU nguồn (chữ + ảnh + câu sửa)? Chỉ khi đó dòng "Em đang tra: …" mới có ích:
 * hồ sơ chỉ có một tin chữ thì thân tin đã nhắc lại tên hàng, thêm dòng nữa là lặp.
 */
export function nhieuNguon(hoSo) {
  const h = layHoSo({ hoSo });
  return (h.nguon || []).length > 1 || (h.sua || []).length > 0;
}

/** Dòng hồ sơ đặt ở ĐẦU tin khi đã chốt mã — tối đa 2 dòng (yêu cầu 5 của issue). */
export function dongDangTra(hoSo, max = 160) {
  const h = layHoSo({ hoSo });
  if (!dai(h.moTa)) return '';
  const phan = [dai(h.moTa), dai(h.chatLieu), dai(h.congDung)].filter(Boolean);
  let s = `Em đang tra: ${phan.join(', ')}`;
  if (s.length > max) s = `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
  return s;
}

/**
 * Dựng lại hồ sơ từ TOÀN BỘ tin khách trong mạch (`ctx.history`) — dùng khi khách/nhân viên
 * bảo "xem lại từ đầu". Bỏ tin của bot và các lệnh ngắn; chú thích ảnh vẫn được gộp.
 */
export function dungTuLichSu(history = [], { sua = [] } = {}) {
  let h = hoSoRong();
  const rows = [...(history || [])]
    .filter((r) => r && r.speaker === 'khach' && dai(r.text))
    .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
  for (const r of rows) {
    // Lõi ghi tin ảnh dạng "[ảnh] <url> <chú thích]" (core/engine.js) → chỉ giữ chú thích.
    // Tin chỉ nhắc tên bot ("@bot" trơ trọi, tin 10:00) được Lõi ghi sổ ĐÚNG NGUYÊN VĂN → bỏ "@tên".
    const t = dai(r.text).replace(/^\[(ảnh|anh|thoại|thoai)\]\s*\S*\s*/i, '').replace(/^@\S*\s*/, '');
    // Đường dựng lại phải theo ĐÚNG MỘT LUẬT với đường sống (`themTinTiep` trong index.js): lệnh
    // cấu trúc và tên hàng cấm không bao giờ là dữ kiện mặt hàng, chữ tự do xuống mục "khách nói
    // thêm". Thiếu chốt này, tên hàng gửi Cổng thành chuỗi lai "… — @bot — xin chào — soát tờ khai"
    // mà `laTenHangCam` ở `packages.js` không bắt được vì chuỗi GỘP không phải tên cấm → lệch
    // mã/thuế (Hiến pháp Điều III). Người soát đo, điểm [S13].
    if (!t || laLenhTroHoSo(t) || laLenhCauTruc(t) || laTenHangCam(t)) continue;
    h = themTinTiep(h, t);
  }
  for (const s of sua) h = themSua(h, s);
  h.dau = (h.dau || 0) + 1;
  return h;
}
