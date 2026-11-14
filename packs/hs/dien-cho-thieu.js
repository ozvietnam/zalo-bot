// packs/hs/dien-cho-thieu.js — cơ chế điền chỗ thiếu & hỏi lại trước khi tra cứu HS.
// Yêu cầu issue #136, #138 (GQ-02): thiếu ý quan trọng hoặc nghi gõ nhầm → hỏi tối đa 2 câu trong 1 tin ngắn,
// tối đa 2 vòng hỏi. Khách nói "không rõ / cứ tra đi" → tra luôn và nói rõ giả định.
//
// KỶ LUẬT HỎI (yêu cầu 2 của issue #177): máy tự xác định tối đa trước khi hỏi, không hỏi lại
// điều khách đã nêu, tối đa 3 câu trong một tin. Phần ĐO điều khách đã nêu và lọc/gom câu nằm ở
// `ky-luat-hoi.js`; tệp này chỉ dựng các nhánh hỏi theo mặt hàng và cho mọi câu đi qua `gomCau`.
// Phần ĐỌC câu khách trả lời (`xuLyTraLoiHoiLai`) nằm ở `doc-tra-loi.js`.
import { norm } from './input.js';
import { coThongSo, nhanDienCuTraDi, daNeu, gomCau, cauXinThem, ketQuaHoi, chuTrong } from './ky-luat-hoi.js';
import { xuLyTraLoiHoiLai } from './doc-tra-loi.js';

// `coThongSo` và `nhanDienCuTraDi` là hàm ĐO thuần nên đã chuyển sang `ky-luat-hoi.js`;
// `xuLyTraLoiHoiLai` là phần ĐỌC câu trả lời nên chuyển sang `doc-tra-loi.js` (đúng phân công ghi
// ở đầu ba tệp: tệp này DỰNG câu hỏi, `ky-luat-hoi.js` ĐO, `doc-tra-loi.js` ĐỌC câu trả lời).
// Xuất lại ở đây để `packages.js`, `loc-tap-am.js` và các test cũ không phải đổi đường dẫn nhập.
export { coThongSo, nhanDienCuTraDi, xuLyTraLoiHoiLai };

// Mục xin NƯỚC NHẬP, gộp vào chính câu `cauXinThem` sẵn có của từng nhánh (OZV-802, mục 3 của
// #177). KHÔNG dựng lượt hỏi thứ hai và không thêm câu thứ tư: mỗi nhánh vẫn đúng hai mục cho
// `gomCau`, dưới trần `TRAN_CAU = 3`, vẫn MỘT tin. Khách đã nêu nước thì `co.xuatXu` bật, chính
// `cauXinThem` rút mục này ra — không hỏi lại điều khách đã nói (luật 2 của kỷ luật hỏi).
const XUAT_XU = { khoa: 'xuatXu', chu: 'nước nhập (xuất xứ)' };

// Nhận diện lỗi gõ nhầm thường gặp
const GOI_Y_GO_NHAM = [
  {
    regex: /m[aáàảãạ]y\s*(s[aấầẩẫậâ]y|say)\s*sinh\s*t[oốồổỗộ]/i,
    normRegex: /may\s*(say)\s*sinh\s*to/i,
    chuan: 'máy xay sinh tố',
    moRong: 'xay trái cây',
    giaDinh: 'máy xay sinh tố gia dụng (công suất ~350W, 220V)',
    linhVuc: 'dien-gia-dung',
  },
  {
    regex: /m[aáàảãạ]y\s*(s[aấầẩẫậâ]y|say)\s*th[uự]c\s*ph[aẩ]m/i,
    normRegex: /may\s*(say)\s*thuc\s*pham/i,
    chuan: 'máy sấy thực phẩm',
    moRong: 'sấy hoa quả, nông sản',
    giaDinh: 'máy sấy thực phẩm gia đình, điện áp 220V',
    linhVuc: 'dien-gia-dung',
  },
];

// Danh sách từ khoá thiết bị điện gia dụng/cơ điện cần công suất / điện áp
const DIEN_GIA_DUNG_RE = /m[aáàảãạ]y\s*(xay|s[aấầẩẫậâ]y|ep|[eéèẻẽẹ]p|b[oơớờởỡợ]m|h[uúùủũụ]t|qu[aạàảã]t|n[eéèẻẽẹ]n|l[oọ]c|gi[aặ]t|r[uử]a)|n[oồổỗộ]i\s*(c[oơớờởỡợ]m|chi[eêếềểễệ]n|[aá]p\s*su[aấ]t)|l[oò]\s*(vi\s*s[oó]ng|n[uướ]ng)|b[eế]p\s*(t[uừ]|h[oồ]ng\s*ngo[aạ]i)|qu[aạ]t\s*[đd]i[eệ]n/i;
const CO_KHI_VAT_LIEU_RE = /\b(van(\s*bi|\s*b[uướớ]m|\s*m[oộ]t\s*chi[eề]u|\s*gi[aả]m\s*[aá]p|\s*c[aầ]u)?|[oố]ng(\s*th[eé]p|\s*nh[uự]a|\s*[đd][oồ]ng|\s*inox)?|bu\s*l[oô]ng|[oố]c\s*v[ií]t|th[eé]p(\s*cu[oộ]n|\s*t[aấ]m|\s*h[iì]nh)?|nh[oô]m(\s*th[oỏi]|\s*t[aấ]m|\s*[đd][iị]nh\s*h[iì]nh)?|v[aả]i(\s*cu[oộ]n|\s*d[eệ]t)?|t[aấ]m\s*nh[uự]a|m[aà]ng\s*nh[uự]a|v[oò]ng\s*bi|kh[oó]a(\s*c[ử]a)?|m[aặ]t\s*b[ií]ch)\b/i;

const FORM_NHAN_RE = /^(t[eê]n\s*h[aà]ng|ten\s*hang|m[oô]\s*t[aả]|mo\s*ta|ch[aấ]t\s*li[eệ]u|chat\s*lieu|th[oô]ng\s*s[oố]|thong\s*so|model)\s*:/im;

/**
 * Kiểm tra xem mô tả hàng có thiếu thông tin cốt lõi hoặc nghi gõ nhầm không.
 * @param {string} text Mô tả hàng khách gửi
 * @param {{ vongHoi?: number, goi?: number, hoSo?: object }} opts `hoSo`: hồ sơ mạch (#170) —
 *   điều khách đã nêu ở tin trước thì KHÔNG hỏi lại (kỷ luật hỏi, yêu cầu 2 của issue #177).
 */
// `tenKhachTuGo`: tên trong `text` do KHÁCH VỪA GÕ (vòng hỏi 2) → BỎ câu xác nhận tên, chỉ xin
// phần còn thiếu. Hỏi "em hiểu là máy sấy thực phẩm đúng không ạ?" ngay sau khi khách vừa gõ đúng
// chữ đó là hỏi lại điều khách đã nêu (luật 2 của kỷ luật hỏi), và khách không tới được mã.
//
// `tenBiBacBo`: những tên KHÁCH ĐÃ NÓI "KHÔNG" trong mạch — CẤM CỬA cả ở `tenGoiY` lẫn ở giả định.
// Ẩn riêng câu HỎI là chưa đủ: nhánh nghi gõ nhầm vẫn trả `tenGoiY: item.chuan` và `giaDinh` mang
// tên đó, `{...ktTiep}` ghi đè vào `session.hoiLai`, nên lượt sau tên bị phủ định SỐNG LẠI và tới
// Cổng — bot in mã + thuế của món khách nói KHÔNG, mà im lặng (vòng soát 2 PR #213; Điều III, VIII).
// `tenDaHoi`: tên bot ĐÃ hỏi xác nhận trong mạch này ("em hiểu là máy xay sinh tố đúng không ạ?").
// Khách đáp mà không nói "đúng" cũng không nói "không" (chỉ đưa thông số) thì câu hỏi đó ĐÃ HỎI
// RỒI: hỏi lại y nguyên là treo khách giữa hai vòng, không bao giờ tới được mã (Điều II). Tên bot
// đoán vẫn không được dùng — `xuLyTraLoiHoiLai` giữ tên khách gõ khi khách chưa xác nhận rõ.
export function kiemTraThongTinPhanLoai(text, {
  vongHoi = 0, goi = null, hoSo = null, tenKhachTuGo = false, tenBiBacBo = [], tenDaHoi = null,
} = {}) {
  const laMot = (a, b) => Boolean(a) && norm(String(a)) === norm(String(b || ''));
  const daBacBo = (ten) => (Array.isArray(tenBiBacBo) ? tenBiBacBo : [tenBiBacBo])
    .some((x) => laMot(x, ten));
  const s = String(text || '').trim();
  if (!s) return { canHoi: false, giaDinh: null, thieu: [] };

  // Khách đang chọn gói số 1 hoặc gõ form có nhãn chuẩn: không hỏi lại
  if (goi === 1 || FORM_NHAN_RE.test(s)) {
    return { canHoi: false, giaDinh: null, thieu: [] };
  }

  const sSach = s.replace(/^(tra\s*hs|m[aã]\s*hs|t[iì]m\s*m[aã]|ph[aâ]n\s*lo[aạ]i)\s*/i, '').trim();
  const cacTu = sSach.split(/\s+/).filter(Boolean);
  const soTu = cacTu.length;

  // 1. Nếu đã hỏi đủ 2 vòng: không hỏi nữa, áp dụng giả định phổ biến nhất
  if (vongHoi >= 2) {
    let giaDinh = null;
    for (const item of GOI_Y_GO_NHAM) {
      // `item.giaDinh` MANG tên bot đoán ("máy xay sinh tố gia dụng …"). Khách đã bác bỏ tên đó thì
      // giả định cũng không được dùng, nếu không bot lại tra đúng món khách nói KHÔNG.
      if (daBacBo(item.chuan)) continue;
      // Khách TỰ GÕ một tên KHÁC mà chưa xác nhận tên bot đoán → giả định cũng không được mang tên
      // bot đoán. Hết vòng hỏi thì tra theo TÊN KHÁCH, không tra món bot tự chọn (Điều VIII).
      if (tenKhachTuGo && norm(chuTrong(sSach)) !== norm(item.chuan)) continue;
      if (item.regex.test(s) || (item.normRegex && item.normRegex.test(norm(s)))) {
        giaDinh = item.giaDinh;
        break;
      }
    }
    if (!giaDinh) {
      if (DIEN_GIA_DUNG_RE.test(sSach)) {
        giaDinh = `${sSach} loại thông dụng trong gia đình, điện áp 220V`;
      } else if (/van\s*bi/i.test(sSach)) {
        giaDinh = 'van bi đồng hoặc inox dùng cho đường ống nước thông thường';
      } else if (/ống\s*thép|ong\s*thep/i.test(sSach)) {
        giaDinh = 'ống thép hàn, không mạ kẽm, quy cách thông dụng';
      } else if (CO_KHI_VAT_LIEU_RE.test(sSach)) {
        giaDinh = `${sSach} quy cách thông dụng trong công nghiệp`;
      } else {
        giaDinh = `${sSach} loại thông dụng theo tiêu chuẩn thương mại`;
      }
    }
    return { canHoi: false, giaDinh, thieu: [] };
  }

  // Điều khách ĐÃ NÊU (chữ lượt này + hồ sơ mạch) — kỷ luật hỏi: không hỏi lại những điều này.
  const co = daNeu(sSach, hoSo);

  // 2. Kiểm tra nghi gõ nhầm
  for (const item of GOI_Y_GO_NHAM) {
    // Khách ĐÃ NÓI "KHÔNG" với tên này → bỏ hẳn nhánh: không gợi ý lại, không giả định theo nó.
    if (daBacBo(item.chuan)) continue;
    // Đã hỏi xác nhận đúng tên này ở vòng trước → không hỏi lại câu y nguyên (Điều II).
    if (laMot(tenDaHoi, item.chuan)) continue;
    if (item.regex.test(s) || (item.normRegex && item.normRegex.test(norm(s)))) {
      // KHÔNG còn cổng `if (co.congSuat && co.dienAp) break`: cổng đó làm thông số đủ thì rụng luôn
      // câu xác nhận TÊN — mà tên đổi hẳn dòng thuế ("máy xay sinh tố" 8509.40.00 ≠ "máy sấy" nhóm
      // 8419/8516), nên càng đủ thông số bot càng im, đúng ngược cái cần (nợ ghi ở PR #203).
      // Thông số khách đã nêu vẫn không bị xin lại: `cauXinThem` rút hết, `gomCau` bỏ câu vô ích.
      const thieu = [];
      if (!co.congSuat) thieu.push('congSuat');
      if (!co.dienAp) thieu.push('dienAp');
      // `xuatXu` CỐ Ý không vào `thieu` ở nhánh này: `thieu` của nhánh XÁC NHẬN TÊN là danh sách
      // "còn thiếu thì mới hỏi tiếp", chỗ gọi đọc nó để biết đã đủ dữ kiện đi tra chưa. Nhét nước
      // vào đây thì mạch không bao giờ "đủ" (khách có thể không bao giờ nói nước) nên lượt sau
      // không gọi Cổng nữa — khách treo luôn, không tới được mã (`xac-nhan-ten.test.mjs`, Điều II).
      // Câu hỏi nước vẫn ra: nó nằm trong `cauXinThem` + `dai` ngay dưới (OZV-802).

      // Câu xác nhận tên món LUÔN hỏi (không phải đại lượng, máy không tự đoán thay khách được:
      // "sấy" ↔ "xay" đổi hẳn dòng thuế). Câu xin thông số chỉ nêu phần CÒN THIẾU.
      //
      // `tenKhachTuGo` chỉ được bỏ câu xác nhận khi tên KHÁCH GÕ ĐÚNG BẰNG tên bot định gợi ý —
      // lúc đó hỏi lại là hỏi điều khách vừa nêu (luật 2 của kỷ luật hỏi). Tên khách gõ KHÁC tên
      // bot đoán thì vẫn phải HỎI: bỏ câu hỏi mà vẫn trả `tenGoiY`/`giaDinh` mang tên bot đoán là
      // LẶNG LẼ TRÁO món của khách ("máy sấy sinh tố" → Cổng nhận "máy xay sinh tố"), bot in mã +
      // thuế của món khách không hỏi mà không nói một câu (vòng soát 3 PR #213; Điều III, VIII).
      // So phần CHỮ (bóc thông số) để "máy sấy thực phẩm 500W" vẫn khớp "máy sấy thực phẩm".
      const tenKhachKhac = tenKhachTuGo && norm(chuTrong(sSach)) !== norm(item.chuan);
      const xacNhanTen = !tenKhachTuGo || tenKhachKhac;
      return ketQuaHoi({
        s,
        tenGoiY: item.chuan,
        thieu,
        // CHỈ tin CÓ câu "em hiểu là <tên> đúng không ạ?" mới được đọc câu "không…" của khách là
        // phủ định TÊN. Các nhánh dưới hỏi THUỘC TÍNH ("có mạ kẽm không ạ?") — đọc "không mạ kẽm"
        // thành phủ định tên là bot nói ngược khách (điểm 2 người soát nêu).
        hoiXacNhanTen: xacNhanTen,
        // Nhánh này hỏi TÊN món (và xin thông số) — câu đáp có tên mới là khách SỬA TÊN.
        hoiThuocTinh: false,
        cauHoi: gomCau([
          { cau: xacNhanTen
            ? `Dạ anh/chị ơi, em hiểu là {b}${item.chuan}{/b}${item.moRong ? ` (${item.moRong})` : ''} đúng không ạ?`
            : '', dai: [] },
          { cau: cauXinThem([{ khoa: 'congSuat', chu: 'công suất (W)' }, { khoa: 'dienAp', chu: 'điện áp' },
            XUAT_XU], co, 'có thì em chốt mã chuẩn hơn, mô tả khai báo cũng đủ ý luôn ạ.'),
          dai: ['congSuat', 'dienAp', 'xuatXu'] },
        ], co),
        // `item.giaDinh` MANG tên bot đoán. Khách tự gõ tên KHÁC mà chưa xác nhận thì giả định phải
        // dựng từ TÊN KHÁCH: khách buông "cứ tra đi" là bot tra ngay theo giả định, nên để nguyên
        // chuỗi cũ là tráo món của khách qua đúng cái cửa vừa khoá ở `tenGoiY`.
        giaDinh: tenKhachKhac ? `${sSach} loại thông dụng trong gia đình, điện áp 220V` : item.giaDinh,
      });
    }
  }

  // 3. Đánh giá độ chi tiết của mô tả — tính CẢ dữ kiện trong hồ sơ mạch (kỷ luật hỏi: máy tự
  // xác định tối đa từ dữ kiện sẵn có trước khi hỏi; khách đã gõ thông số ở tin trước thì đủ rồi).
  const { congSuat: coCongSuat, dienAp: coDienAp, dungTich: coDungTich, kichThuoc: coKichThuoc,
    chatLieu: coChatLieu, congDung: coCongDung, quyCach: coQuyCach } = co;
  const soChiTiet = [coCongSuat, coDienAp, coDungTich, coKichThuoc, coChatLieu, coCongDung, coQuyCach].filter(Boolean).length;

  // Nếu đã có từ 2 thông số/chi tiết trở lên hoặc có điện áp rõ ràng + công dụng: đủ thông số
  if (soChiTiet >= 2 || (coDienAp && coCongDung) || (coCongSuat && coCongDung) || (soTu >= 10 && soChiTiet >= 1)) {
    return { canHoi: false, giaDinh: null, thieu: [] };
  }

  // 4. Nhóm máy móc / thiết bị điện / gia dụng thiếu thông số
  const laDienGiaDung = DIEN_GIA_DUNG_RE.test(sSach);
  const laMayMocNgan = /^(m[aáàảãạ]y|thi[eế]t\s*b[iị]|n[oồổỗộ]i|qu[aạ]t)\b/i.test(sSach) && soTu < 8;
  const coLoaiCongDung = coCongDung || /(gia\s*d[iì]nh|c[oô]ng\s*nghi[eệ]p|gia\s*d[uụ]ng|d[aâ]n\s*d[uụ]ng|c[aâàảãạáầẩẫậấ]m\s*tay|di\s*[đd][oộ]ng|mini)/i.test(sSach) || /(gia\s*dinh|cong\s*nghiep|gia\s*dung|dan\s*dung|cam\s*tay|di\s*dong|mini)/i.test(norm(sSach));

  // KHÔNG còn cổng `!coLoaiCongDung && !coCongSuat && !coDienAp && !coDungTich`: cổng đó làm khách
  // nêu ĐÚNG MỘT đại lượng ("máy bơm 350W") là rụng luôn cả nhánh, và vào được khối thì mọi
  // `co[khoa]` đều false nên `gomCau`/`cauXinThem` thành mã chết (điểm 1 người soát PR #203).
  // Nay dựng đủ câu rồi để chúng bỏ ĐÚNG phần khách đã nêu — y cách erp-xnk làm ở
  // `buildQuestionsFromFields`. Tới đây `soChiTiet < 2` nên luôn còn ít nhất một câu thật để hỏi.
  if (laDienGiaDung || laMayMocNgan) {
    // `coLoaiCongDung` rộng hơn `co.congDung` (bắt cả "mini", "cầm tay", "dân dụng"), nên câu
    // "gia đình hay công nghiệp" phải lọc theo nó, không theo `co.congDung` trơ.
    const coNay = { ...co, congDung: coLoaiCongDung };
    let cau1 = '';
    let muc = [];
    const duoi = 'có thì em chốt mã chuẩn hơn ạ.';
    let giaDinh = '';

    if (/n[oồổỗộ]i\s*chi[eêếềểễệ]n/i.test(sSach)) {
      cau1 = 'Dạ anh cho em hỏi nồi chiên này dùng cho gia đình hay công nghiệp ạ?';
      muc = [{ khoa: 'dungTich', chu: 'dung tích (lít)' }, { khoa: 'congSuat', chu: 'công suất (W)' }];
      giaDinh = 'nồi chiên không dầu gia dụng, dung tích ~5L, công suất 1500W, điện áp 220V';
    } else if (/m[aáàảãạ]y\s*b[oơớờởỡợ]m/i.test(sSach)) {
      cau1 = 'Dạ anh cho em hỏi máy bơm này dùng cho gia đình hay công nghiệp ạ?';
      muc = [{ khoa: 'congSuat', chu: 'công suất (HP/kW)' }, { khoa: 'dienAp', chu: 'điện áp' }];
      giaDinh = 'máy bơm nước ly tâm gia đình, điện áp 220V';
    } else if (/qu[aạ]t\s*[đd]i[eệ]n|qu[aạ]t/i.test(sSach)) {
      cau1 = 'Dạ anh cho em hỏi quạt điện này là loại gia dụng hay công nghiệp ạ?';
      muc = [{ khoa: 'congSuat', chu: 'công suất (W)' }, { khoa: 'dienAp', chu: 'điện áp' }];
      giaDinh = 'quạt điện gia dụng công suất ~50W, điện áp 220V';
    } else {
      cau1 = `Dạ anh cho em hỏi ${sSach} này dùng cho gia đình hay công nghiệp ạ?`;
      muc = [{ khoa: 'congSuat', chu: 'công suất (W)' }, { khoa: 'dienAp', chu: 'điện áp' }];
      giaDinh = `${sSach} loại thông dụng trong gia đình, điện áp 220V`;
    }
    muc.push(XUAT_XU);

    return ketQuaHoi({
      s,
      tenGoiY: sSach,
      // Nhánh này hỏi CÔNG DỤNG ("gia đình hay công nghiệp ạ?") — câu đáp là thuộc tính của đúng
      // món khách đã gõ, không phải tên món mới: đọc nó thành tên mới là làm rụng tên hàng.
      hoiThuocTinh: true,
      thieu: [...(coLoaiCongDung ? [] : ['congDung']), ...muc.filter((m) => !co[m.khoa]).map((m) => m.khoa)],
      cauHoi: gomCau([
        { cau: cau1, dai: ['congDung'] },
        { cau: cauXinThem(muc, coNay, duoi), dai: muc.map((m) => m.khoa) },
      ], coNay),
      giaDinh,
    });
  }

  // 5. Nhóm cơ khí / vật liệu / linh kiện chỉ nêu tên cụt (1–4 từ)
  // Cũng KHÔNG còn cổng `!coKichThuoc && !coQuyCach`: khách nêu kích thước ("van bi DN25") thì cổng
  // đó làm rụng luôn câu chất liệu — mà chất liệu là thứ đổi dòng thuế của van/ống (điểm 2 người
  // soát PR #203 nêu). Mỗi câu khai đủ đại lượng nó hỏi, `gomCau` bỏ câu đã vô ích.
  if (soTu <= 4 && CO_KHI_VAT_LIEU_RE.test(sSach)) {
    let cau1 = '';
    let daiCau1 = ['chatLieu'];
    let muc = [];
    let noi = ' và ';
    let giaDinh = '';

    if (/van(\s*bi)?/i.test(sSach)) {
      cau1 = 'Dạ van bi này chất liệu bằng đồng, inox hay nhựa ạ?';
      // Câu xin hỏi GỘP hai đại lượng ("kích thước … hoặc mục đích dùng") nên phải khai CẢ HAI:
      // khai thiếu thì khách đã nêu công dụng vẫn bị hỏi lại mục đích dùng (điểm 3 người soát nêu).
      muc = [{ khoa: 'kichThuoc', chu: 'kích thước đường kính (DN)' }, { khoa: 'congDung', chu: 'mục đích dùng' }];
      noi = ' hoặc ';
      giaDinh = 'van bi đồng hoặc inox dùng cho đường ống nước thông thường';
    } else if (/[oố]ng(\s*th[eé]p)?/i.test(sSach)) {
      // Câu này hỏi QUY CÁCH (đúc/hàn/mạ kẽm), không phải chất liệu.
      cau1 = 'Dạ ống thép này là loại đúc hay hàn, có mạ kẽm không ạ?';
      daiCau1 = ['quyCach'];
      muc = [{ khoa: 'kichThuoc', chu: 'đường kính và độ dày' }];
      giaDinh = 'ống thép hàn, không mạ kẽm, quy cách thông dụng';
    } else {
      cau1 = `Dạ anh cho em hỏi ${sSach} này làm bằng chất liệu gì ạ?`;
      muc = [{ khoa: 'kichThuoc', chu: 'quy cách kích thước' }, { khoa: 'congDung', chu: 'công dụng' }];
      noi = ' hoặc ';
      giaDinh = `${sSach} chất liệu thông dụng trong công nghiệp`;
    }
    muc.push(XUAT_XU);

    return ketQuaHoi({
      s,
      tenGoiY: sSach,
      // Nhánh này hỏi CHẤT LIỆU / QUY CÁCH ("đồng, inox hay nhựa ạ?", "đúc hay hàn ạ?").
      hoiThuocTinh: true,
      thieu: [...(daiCau1.every((k) => co[k]) ? [] : daiCau1), ...muc.filter((m) => !co[m.khoa]).map((m) => m.khoa)],
      cauHoi: gomCau([
        { cau: cau1, dai: daiCau1 },
        { cau: cauXinThem(muc, co, 'có thì em chốt mã chuẩn hơn ạ.', noi), dai: muc.map((m) => m.khoa) },
      ], co),
      giaDinh,
    });
  }

  return { canHoi: false, giaDinh: null, thieu: [] };
}
