// packs/hs/doc-tra-loi.js — ĐỌC câu khách trả lời câu hỏi lại, dựng mô tả gửi Cổng.
//
// Phân công của lớp hỏi lại, đúng Điều VI (mỗi tệp một trách nhiệm, dưới 300 dòng):
//   • `dien-cho-thieu.js` — DỰNG các nhánh hỏi theo mặt hàng;
//   • `ky-luat-hoi.js`    — ĐO điều khách đã nêu, lọc/gom câu;
//   • tệp này             — ĐỌC câu trả lời (xác nhận / phủ định / buông) và chốt mô tả tra cứu.
//
// Tách ra ở vòng soát 3 của PR #213: bản vá hai điểm người soát chặn đẩy `dien-cho-thieu.js` lên
// 332 dòng, vượt trần 300 của Điều VI (cổng `test/core/wiki-no-lon-dong.test.mjs` bắt đỏ). Cùng
// cách đã làm ở vòng soát 2 khi `coThongSo`/`nhanDienCuTraDi` chuyển sang `ky-luat-hoi.js`:
// chuyển theo đúng ranh trách nhiệm, và `dien-cho-thieu.js` XUẤT LẠI để mọi chỗ nhập cũ
// (`packages.js`, bốn tệp test) không phải đổi đường dẫn.
import { norm, xuatXuCua } from './input.js';
import {
  LENH_DAU_RE, nhanDienCuTraDi, giuThongSo, boThongSo, chuTrong, coTenTrong,
} from './ky-luat-hoi.js';
import { laCauHoiKhach, bocCumHoi, laHoiThuocTinh } from './cau-hoi-khach.js';

/**
 * Xử lý khi khách phản hồi câu hỏi lại của bot.
 *
 * Bot vừa hỏi "em hiểu là {tenGoiY} đúng không ạ?" nên câu này có thể là XÁC NHẬN ("đúng, 350W"),
 * PHỦ ĐỊNH ("không, là máy sấy thực phẩm"), hay buông ("cứ tra đi"). Phủ định thì tên bot đoán
 * KHÔNG được vào mô tả gửi Cổng — hỏi mà không nghe câu trả lời "không" thì câu hỏi thành vô ích.
 *
 * @param {string} text Câu khách gõ
 * @param {object} sessionHoiLai Trạng thái hỏi lại trong session
 */
export function xuLyTraLoiHoiLai(text, sessionHoiLai = {}) {
  const s = String(text || '').trim();

  // Khách PHỦ ĐỊNH tên bot đoán → đọc tên khách nói, lùi về tên khách đã gõ nếu khách chỉ nói "không".
  // Xét TRƯỚC `nhanDienCuTraDi` vì mẫu "không rõ/không biết" của nó cũng khớp chữ "không" mở đầu.
  const traLoiTen = docTraLoiTen(s, sessionHoiLai);
  if (traLoiTen.phuDinh && traLoiTen.ten && !nhanDienCuTraDi(s)) {
    // `tenBacBo`: tên khách VỪA NÓI "KHÔNG". Người gọi phải ghi nó lại cho cả mạch, nếu không thì
    // vòng hỏi sau lại gợi ý đúng tên đó và nó tới Cổng (điểm 1 vòng soát 2 của PR #213).
    return {
      sanSangTra: true, giaDinh: null, moTaTraCuu: traLoiTen.ten,
      tenBacBo: String(sessionHoiLai.tenGoiY || '').trim(),
    };
  }

  // Khách nói "không rõ, cứ tra đi"
  if (nhanDienCuTraDi(s)) {
    const giaDinh = sessionHoiLai.giaDinhMacDinh || `${sessionHoiLai.tenGoiY || sessionHoiLai.tenGoc || 'hàng'} theo thông số phổ biến`;
    return {
      sanSangTra: true,
      giaDinh,
      moTaTraCuu: giaDinh,
    };
  }

  // Khách HỎI LẠI chứ không trả lời ("là sao ạ", "nghĩa là gì ạ", "không hiểu ạ"). Câu hỏi của
  // khách KHÔNG phải dữ kiện mặt hàng: đọc nó thành tên mới là bot đi tra mã của chữ "sao" — mã
  // chắc chắn sai, mà mô tả khai báo in thẳng cho khách dùng (vòng soát 5 PR #213; Điều III, VIII).
  const khachHoiLai = laCauHoiKhach(s);

  // Khách XÁC NHẬN tên, có thể bổ sung thông số (vd: "đúng, 350W 220V" hoặc "350W 220V")
  const tenGoc = String(sessionHoiLai.tenGoc || '').replace(LENH_DAU_RE, '').trim();
  // Tên bot ĐOÁN (`tenGoiY`) chỉ được thay tên KHÁCH GÕ khi khách XÁC NHẬN RÕ ("đúng ạ", "chuẩn").
  // Khách đáp mỗi thông số ("350W 220V") là trả lời câu XIN THÔNG SỐ, không phải đồng ý đổi tên
  // món: coi im lặng là đồng ý thì bot lặng lẽ tráo "máy sấy sinh tố" thành "máy xay sinh tố" rồi
  // in mã + thuế của món khách không hỏi, mà không nói một câu (vòng soát 3 PR #213; Điều III,
  // Điều VIII). Chỉ xét ở nhánh CÓ hỏi xác nhận tên — nhánh hỏi THUỘC TÍNH thì `tenGoiY` chính là
  // tên khách gõ, không phải tên bot đoán.
  const botDoanTen = sessionHoiLai.hoiXacNhanTen && !laXacNhan(s);
  const tenChuan = (botDoanTen ? tenGoc : sessionHoiLai.tenGoiY) || sessionHoiLai.tenGoiY || tenGoc;
  // Lược bỏ các từ xã giao ("đúng", "oke", "chuẩn", "vâng", "… ạ") và từ đệm mở đầu ("là máy sấy…").
  // Khách HỎI LẠI thì bóc luôn cụm hỏi: chữ của câu hỏi không được đi tới Cổng, nhưng THÔNG SỐ
  // khách nêu kèm trong cùng câu ("350W thì sao ạ") vẫn phải giữ.
  const thongSoMoi = khachHoiLai ? bocCumHoi(bocXaGiao(s)) : bocDemDau(bocXaGiao(s));

  // Khách SỬA TÊN mà không mở đầu bằng "không" ("máy sấy thực phẩm ạ", "là máy sấy thực phẩm") —
  // người Việt sửa tên hay nói thẳng như vậy. Tên mới THAY tên cũ, KHÔNG nối vào sau: nối thì Cổng
  // nhận một mặt hàng lai mang CẢ HAI món ("máy sấy sinh tố máy sấy thực phẩm"), rồi `packages.js`
  // ghi tên ghép đó vào `tenGoc` nên nó sống trong session sang vòng sau — bot in mã + thuế của
  // một thứ không tồn tại (vòng soát 4 PR #213; Điều III, Điều VIII).
  //
  // Chỉ xét ở nhánh hỏi TÊN. Nhánh hỏi THUỘC TÍNH ("inox hay thép?", "đúc hay hàn?", "gia đình
  // hay công nghiệp?") thì câu đáp là CHẤT LIỆU/QUY CÁCH/CÔNG DỤNG của đúng món đó, không phải tên
  // món mới — đọc nó thành tên mới là làm rụng hẳn tên hàng khách đã gõ ("van bi" → Cổng chỉ nhận
  // "inox 304 DN50"). Việc HỎI xác nhận tên mới vẫn do `kiemTraThongTinPhanLoai` lo ở vòng sau.
  //
  // Phép phân biệt là `laHoiThuocTinh` (nhánh khai lúc dựng câu hỏi), KHÔNG phải `hoiXacNhanTen`:
  // `hoiXacNhanTen` ĐỔI GIÁ TRỊ giữa các vòng hỏi — sau lần sửa tên thứ nhất, tên là do KHÁCH gõ
  // nên bot thôi hỏi xác nhận (`false`), và lần sửa tên thứ HAI rơi lại đúng nhánh nối hai tên:
  // Cổng nhận "máy sấy thực phẩm máy sấy công nghiệp", một mặt hàng lai mang CẢ HAI món (vòng soát
  // 5 PR #213; Điều III, Điều VIII). Khách HỎI LẠI thì cũng không phải tên mới.
  const daXacNhanTen = Boolean(sessionHoiLai.hoiXacNhanTen) && laXacNhan(s) && !DEM_DAU_RE.test(bocXaGiao(s));
  const khachDuaTenMoi = !laHoiThuocTinh(sessionHoiLai) && !khachHoiLai && !daXacNhanTen && coTenTrong(thongSoMoi);

  // Câu khách vừa gõ ĐÃ CHỨA tên món rồi ("máy sấy" → khách gõ "máy sấy sinh tố") thì không dán
  // tên cũ lên đầu nữa: Cổng nhận "máy sấy máy sấy sinh tố" — mô tả rác, mà mô tả khai báo này in
  // thẳng cho khách dùng (Điều VIII).
  const trung = thongSoMoi && norm(thongSoMoi).includes(norm(chuTrong(tenChuan)));

  // Phần CHỮ của tên, KHÔNG mang thông số: thông số cũ phải đi qua `giuThongSo` dưới đây, đó là
  // chỗ DUY NHẤT quyết số nào sống (số MỚI cùng loại thắng số CŨ). Nối `tenChuan` thô là lọt số cũ
  // vào qua cửa TÊN, nên `giuThongSo` không bao giờ thấy xung đột: khách sửa "350W" thành "500W"
  // mà Cổng nhận cả hai, không biết số nào thật — và cùng một số thì lặp "350W 350W" (vòng soát 4).
  const tenKhongThongSo = xuatXuCua(thongSoMoi).giaDinh ? boThongSo(tenChuan) : chuTrong(tenChuan);
  const phanTen = trung || khachDuaTenMoi ? '' : tenKhongThongSo;

  // Giữ THÔNG SỐ khách đã gõ ở tin trước: mô tả tra cứu dựng lại từ `tenGoiY` nên thông số nằm
  // trong `tenGoc` sẽ rụng, Cổng mất dữ kiện khách đã cung cấp (nợ ghi ở PR #203).
  const moTaTraCuu = giuThongSo([phanTen, thongSoMoi].filter(Boolean).join(' ').trim(), tenGoc);

  // KHÔNG trả thêm cờ "khách vừa hỏi lại" ở đây: `packages.js` đã đo lại chính `moTaTraCuu` bằng
  // `kiemTraThongTinPhanLoai`, nên còn vòng là bot tự hỏi tiếp một câu cho khách (ca `[#213-14]`
  // đếm số lần gọi Cổng = 0 và đòi tin bot có dấu "?"). Thêm cờ không ai đọc là MÃ CHẾT — đúng
  // thứ người soát đã chặn ở vòng 4 (nhánh `else` của vòng hỏi 2).
  return {
    sanSangTra: true,
    giaDinh: null,
    moTaTraCuu,
  };
}

// Biên CUỐI MỘT TỪ tiếng Việt. Không dùng `\b`: `\b` của JS chỉ tính chữ ASCII, nên sau "không"
// hay "là" (kết bằng chữ có dấu) nó KHÔNG thấy biên và cả mẫu trượt.
const HET_TU = '(?![\\p{L}\\p{N}])';
const NGAT = '[\\s,.!:;-]*';

// Tiền tố lễ phép đứng TRƯỚC chữ phủ định ("Dạ không…", "vâng không phải…", "ừ không…").
// Thiếu nó thì "Dạ không, là máy sấy thật ạ" — câu người Việt nói hàng ngày — trượt hẳn khỏi
// PHU_DINH_RE và rơi lại đúng lỗi PR #213 đi sửa (điểm 3 của người soát).
const LE_PHEP_DAU = `(?:(?:d[aạ]|v[aâ]ng|[uừ]|[oơ]k?e?)${HET_TU}${NGAT})?`;
// Câu khách PHỦ ĐỊNH tên bot vừa đoán ("không", "không phải", "sai rồi", "ko ạ", "nhầm").
const PHU_DINH_RE = new RegExp(
  `^\\s*${LE_PHEP_DAU}(?:kh[oô]ng|ko|kg|sai|nh[aầ]m|ch[uư]a\\s*[đd][uú]ng)${HET_TU}${NGAT}`
  + `(?:(?:ph[aả]i|[đd][uú]ng|r[oồ]i)${HET_TU}${NGAT})?`, 'iu');
// Từ đệm mở đầu phần tên khách nói lại ("là máy sấy…", "mà máy sấy…").
const DEM_DAU_RE = new RegExp(`^(?:l[aà]|m[aà]|n[oó]\\s*l[aà]|[đd][aâ]y\\s*l[aà])${HET_TU}${NGAT}`, 'iu');

/**
 * Bỏ từ đệm mở đầu phần tên khách nói lại ("là máy sấy thực phẩm" → "máy sấy thực phẩm").
 *
 * Người Việt sửa tên hay nói thẳng, không mở đầu bằng "không": "là máy sấy thực phẩm". Chữ "là"
 * không phải tên hàng — để nó đi tới Cổng là mô tả khai báo có rác, mà mô tả này in thẳng cho
 * khách dùng (Điều VIII). `docTraLoiTen` đã bóc cụm này ở nhánh PHỦ ĐỊNH; tách ra để nhánh khách
 * sửa tên mà KHÔNG phủ định cũng dùng được cùng một luật (vòng soát 4 của PR #213).
 */
export function bocDemDau(s) {
  return String(s || '').replace(DEM_DAU_RE, '').trim();
}
// Từ xã giao/đệm đứng NGAY SAU chữ phủ định ("không phải ĐÂU Ạ", "không NHÉ, 350W").
// `XA_GIAO_CUOI_RE` chỉ cắt ở cuối chuỗi nên phần giữa còn nguyên, lại đủ ≥2 chữ cái ⇒
// `coTenTrong` tưởng là tên mới ⇒ VỨT SẠCH tên hàng khách đã gõ: "không nhé, 350W 220V" →
// "nhé, 350W 220V" gửi Cổng (điểm 2 vòng soát 2 của PR #213).
const DEM = '(?:[đd][aâ]u|[aạ]|[aà]|nh[eé]|nh[aá]|nha|[oơ]i|m[aà]|th[eế]|v[aậ]y)';
// Cả phần còn lại CHỈ là từ đệm → khách chỉ phủ định, không nêu tên nào.
const DEM_SAU_HET_RE = new RegExp(`^(?:${DEM}${HET_TU}${NGAT})+$`, 'iu');
// Cụm từ đệm được ĐÓNG bằng dấu ngắt ("nhé, …", "ạ, là máy sấy"). Bắt buộc có dấu ngắt để không
// cắt oan tên hàng mở đầu bằng từ đồng âm ("nha khoa", "mà" trong tên riêng): "không nha khoa"
// giữ nguyên "nha khoa".
const DEM_SAU_DAU_RE = new RegExp(`^(?:${DEM}${HET_TU}\\s*)+[,.!:;-]+\\s*`, 'iu');
// Từ xã giao ở cuối câu ("… ạ", "… nhé", "thật ạ"). Phải có dấu ngắt hoặc đầu chuỗi ở trước, nếu
// không thì "mica" bị cắt đuôi thành "mic". KHÔNG có "da" không dấu: "túi da", "ví bằng da" là
// CHẤT LIỆU, mà chất liệu đổi chương thuế (túi da 4202 ≠ túi nhựa) — điểm 3 của người soát PR #213.
const XA_GIAO_CUOI_RE = /(?:^|[\s,.!:;-])(?:ạ|a|nh[eé]|nha|nh[aá]|[oơ]i|th[eế]|v[aậ]y|dạ)\s*$/iu;
// Từ xã giao mở đầu câu XÁC NHẬN ("đúng, 350W" → "350W"). Cũng không nhận "da" không dấu.
const XAC_NHAN_DAU_RE = /^(?:[đd][uú]ng|oke|ok|chu[aẩ]n|v[aâ]ng|[uừ]|dạ)[,.\s]*/iu;

/** Bỏ từ xã giao đầu và cuối câu, giữ lại phần DỮ KIỆN khách nói. */
export function bocXaGiao(s) {
  let t = String(s || '').replace(XAC_NHAN_DAU_RE, '').replace(DEM_SAU_DAU_RE, '').trim();
  for (let i = 0; i < 3 && XA_GIAO_CUOI_RE.test(t); i += 1) t = t.replace(XA_GIAO_CUOI_RE, '').trim();
  return t;
}

/**
 * Khách có XÁC NHẬN RÕ tên bot đoán không ("đúng ạ", "chuẩn", "vâng")?
 *
 * Chỉ lời xác nhận RÕ mới cho phép tên BOT ĐOÁN thay tên KHÁCH TỰ GÕ. Khách đáp mỗi thông số
 * ("350W 220V") là trả lời câu xin thông số, KHÔNG phải đồng ý đổi tên món — coi im lặng là đồng ý
 * thì bot lặng lẽ tráo "máy sấy" thành "máy xay" rồi in mã + thuế của món khách không hỏi
 * (vòng soát 3 của PR #213; Điều III, Điều VIII).
 */
export function laXacNhan(s) {
  return XAC_NHAN_DAU_RE.test(String(s || '').trim());
}

/**
 * Khách có PHỦ ĐỊNH tên bot vừa đoán không, và nếu có thì tên nào được gửi Cổng?
 *
 * Bot hỏi "em hiểu là máy xay sinh tố đúng không ạ?" mà khách đáp "không, là máy sấy thật" thì
 * trước đây bot vẫn dán `tenGoiY` lên đầu rồi nối cả câu phủ định vào sau — Cổng nhận một tên
 * hàng lai mang CẢ HAI món và chữ "không" ("máy xay sinh tố không, là máy sấy thật ạ"). Hỏi xác
 * nhận tên mà không nghe câu trả lời "không" thì câu hỏi thành vô ích, và mã + số thuế in ra là
 * của món khách KHÔNG hỏi (Hiến pháp Điều III và VIII).
 *
 * CHỈ đọc khi câu bot đang treo ĐÚNG là câu xác nhận tên (`hoiXacNhanTen`). Không có cổng này thì
 * câu trả lời THUỘC TÍNH mở đầu bằng "không" cũng bị cắt mất chữ "không" và mất luôn tên hàng:
 * "không mạ kẽm, đúc DN50" → "mạ kẽm, đúc DN50" — bot nói NGƯỢC điều khách vừa nói, rồi in mã và
 * số thuế của mặt hàng khác mà khách không có cách nào biết (điểm 2, nặng nhất, của người soát
 * PR #213; Điều III và Điều VIII).
 *
 * @param {string} text Câu khách gõ
 * @param {{ tenGoiY?: string, tenGoc?: string, hoiXacNhanTen?: boolean }} phien Trạng thái hỏi lại
 * @returns {{ phuDinh: boolean, ten: string }} `ten`: tên dùng để gửi Cổng (rỗng = không đổi)
 */
export function docTraLoiTen(text, { tenGoiY = '', tenGoc = '', hoiXacNhanTen = false } = {}) {
  const s = String(text || '').trim();
  if (!hoiXacNhanTen) return { phuDinh: false, ten: '' };
  // Khách HỎI LẠI mở đầu bằng chữ phủ định ("không hiểu ạ", "chưa rõ ý ạ") KHÔNG phải phủ định
  // TÊN: `PHU_DINH_RE` cắt chữ "không" rồi phần còn lại ("hiểu") đủ ≥2 chữ cái nên bị đếm thành
  // tên mới ⇒ Cổng nhận tên hàng là "hiểu", tên khách gõ rụng hẳn (vòng soát 5 PR #213).
  if (laCauHoiKhach(s)) return { phuDinh: false, ten: '' };
  if (!PHU_DINH_RE.test(s)) return { phuDinh: false, ten: '' };
  // Phần SAU chữ phủ định là tên khách nói lại ("không phải, máy sấy thực phẩm 500W").
  // Bóc cả cụm xã giao/đệm NGAY SAU chữ phủ định ("không phải đâu ạ", "không nhé, 350W") —
  // không bóc thì cụm đó đủ ≥2 chữ cái và bị coi là tên mới, tên hàng thật rụng hẳn.
  let sau = s.replace(PHU_DINH_RE, '');
  if (DEM_SAU_HET_RE.test(sau.trim())) sau = '';          // chỉ có từ đệm → khách chỉ nói "không"
  else sau = sau.replace(DEM_SAU_DAU_RE, '');             // "ạ, là máy sấy" → "là máy sấy"
  const con = bocXaGiao(sau.replace(DEM_DAU_RE, ''));
  // Khách chỉ nói "không", hoặc chỉ sửa THÔNG SỐ ("không, 0.5kW 220V") mà không nêu tên nào →
  // quay về tên KHÁCH ĐÃ GÕ (`tenGoc`), không dùng tên bot đoán (`tenGoiY`): tên vừa bị phủ định
  // không được tới Cổng. Phép thử là `coTenTrong` (đo phần CHỮ sau khi bóc thông số), không phải
  // "có ≥ 2 chữ cái" — đơn vị đo cũng có 2 chữ cái nên phép cũ làm tên hàng rụng hẳn (điểm 1
  // người soát PR #213 nêu). Thông số MỚI của khách vẫn được giữ, và thắng số cũ cùng loại.
  const goc = String(tenGoc || '').replace(LENH_DAU_RE, '').trim();
  const ten = coTenTrong(con) ? con : `${xuatXuCua(con).giaDinh ? boThongSo(goc) : chuTrong(goc)} ${con}`.trim();
  return { phuDinh: true, ten: giuThongSo(ten, goc) || String(tenGoiY || '').trim() };
}
