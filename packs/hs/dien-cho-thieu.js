// packs/hs/dien-cho-thieu.js — cơ chế điền chỗ thiếu & hỏi lại trước khi tra cứu HS.
// Yêu cầu issue #136, #138 (GQ-02): thiếu ý quan trọng hoặc nghi gõ nhầm → hỏi tối đa 2 câu trong 1 tin ngắn,
// tối đa 2 vòng hỏi. Khách nói "không rõ / cứ tra đi" → tra luôn và nói rõ giả định.
//
// KỶ LUẬT HỎI (yêu cầu 2 của issue #177): máy tự xác định tối đa trước khi hỏi, không hỏi lại
// điều khách đã nêu, tối đa 3 câu trong một tin. Phần ĐO điều khách đã nêu và lọc/gom câu nằm ở
// `ky-luat-hoi.js`; tệp này chỉ dựng các nhánh hỏi theo mặt hàng và cho mọi câu đi qua `gomCau`.
import { norm } from './input.js';
import {
  CONG_SUAT_RE, DIEN_AP_RE, DUNG_TICH_RE, KICH_THUOC_RE,
  daNeu, gomCau, cauXinThem, ketQuaHoi,
} from './ky-luat-hoi.js';

const CU_TRA_RE = /(khong|ko)\s*(ro|biet|chac|quan\s*tam|sao)|cu\s*(tra|lam|chay|tim|cho)|tra\s*(luon|di|nhanh)|mac\s*dinh|sao\s*cung\s*duoc|chiu/i;

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
 * Mệnh đề có THÔNG SỐ ĐO ĐƯỢC không (công suất, điện áp, dung tích, kích thước)?
 * Dùng ở `loc-tap-am.js`: một mệnh đề chỉ có thông số ("350W 220V") là DỮ KIỆN MẶT HÀNG,
 * không phải tạp âm hội thoại — bỏ nó thì hồ sơ mất thông tin khách vừa cung cấp
 * (yêu cầu 1 và 4 của issue #170: hồ sơ tích luỹ, "xem lại từ đầu" phải dựng lại được).
 */
export function coThongSo(s) {
  const t = String(s || '');
  return CONG_SUAT_RE.test(t) || DIEN_AP_RE.test(t) || DUNG_TICH_RE.test(t) || KICH_THUOC_RE.test(t);
}

/** Nhận diện câu khách nói "không rõ / cứ tra đi / tra luôn đi". */
export function nhanDienCuTraDi(text) {
  const n = norm(String(text || ''));
  return CU_TRA_RE.test(n);
}

/**
 * Kiểm tra xem mô tả hàng có thiếu thông tin cốt lõi hoặc nghi gõ nhầm không.
 * @param {string} text Mô tả hàng khách gửi
 * @param {{ vongHoi?: number, goi?: number, hoSo?: object }} opts `hoSo`: hồ sơ mạch (#170) —
 *   điều khách đã nêu ở tin trước thì KHÔNG hỏi lại (kỷ luật hỏi, yêu cầu 2 của issue #177).
 */
export function kiemTraThongTinPhanLoai(text, { vongHoi = 0, goi = null, hoSo = null } = {}) {
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
    if (item.regex.test(s) || (item.normRegex && item.normRegex.test(norm(s)))) {
      if (co.congSuat && co.dienAp) break; // Đã đủ thông số

      const thieu = [];
      if (!co.congSuat) thieu.push('congSuat');
      if (!co.dienAp) thieu.push('dienAp');

      // Câu xác nhận tên món LUÔN hỏi (không phải đại lượng, máy không tự đoán thay khách được:
      // "sấy" ↔ "xay" đổi hẳn dòng thuế). Câu xin thông số chỉ nêu phần CÒN THIẾU.
      return ketQuaHoi({
        s,
        tenGoiY: item.chuan,
        thieu,
        cauHoi: gomCau([
          { cau: `Dạ anh/chị ơi, em hiểu là {b}${item.chuan}{/b}${item.moRong ? ` (${item.moRong})` : ''} đúng không ạ?`, dai: [] },
          { cau: cauXinThem([{ khoa: 'congSuat', chu: 'công suất (W)' }, { khoa: 'dienAp', chu: 'điện áp' }], co,
            'có thì em chốt mã chuẩn hơn, mô tả khai báo cũng đủ ý luôn ạ.'), dai: ['congSuat', 'dienAp'] },
        ], co),
        giaDinh: item.giaDinh,
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

  // KHÔNG còn cổng `!coLoaiCongDung && !coCongSuat && !coDienAp && !coDungTich` ở đây. Cổng đó làm
  // khách nêu ĐÚNG MỘT đại lượng ("máy bơm 350W") là rụng luôn cả nhánh — bot thôi hỏi những đại
  // lượng CÒN THIẾU; và vào được khối thì mọi `co[khoa]` đều false nên `gomCau`/`cauXinThem` thành
  // mã chết (điểm 1 người soát PR #203 nêu, đã tái hiện bằng test). Nay dựng đủ câu rồi để
  // `gomCau`/`cauXinThem` bỏ ĐÚNG phần khách đã nêu — y cách erp-xnk làm ở
  // `buildQuestionsFromFields` (lặp từng field, bỏ field khách đã có). Tới đây là `soChiTiet < 2`
  // (mục 3 đã trả về khi đủ) nên luôn còn ít nhất một câu thật để hỏi.
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

    return ketQuaHoi({
      s,
      tenGoiY: sSach,
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

    return ketQuaHoi({
      s,
      tenGoiY: sSach,
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

/**
 * Xử lý khi khách phản hồi câu hỏi lại của bot.
 * @param {string} text Câu khách gõ
 * @param {object} sessionHoiLai Trạng thái hỏi lại trong session
 */
export function xuLyTraLoiHoiLai(text, sessionHoiLai = {}) {
  const s = String(text || '').trim();

  // Khách nói "không rõ, cứ tra đi"
  if (nhanDienCuTraDi(s)) {
    const giaDinh = sessionHoiLai.giaDinhMacDinh || `${sessionHoiLai.tenGoiY || sessionHoiLai.tenGoc || 'hàng'} theo thông số phổ biến`;
    return {
      sanSangTra: true,
      giaDinh,
      moTaTraCuu: giaDinh,
    };
  }

  // Khách bổ sung thông số (vd: "đúng, 350W 220V" hoặc "350W 220V")
  const tenChuan = sessionHoiLai.tenGoiY || sessionHoiLai.tenGoc || '';
  // Lược bỏ các từ xã giao ("đúng", "oke", "chuẩn", "vâng"...)
  const thongSoMoi = s.replace(/^(đúng|dung|oke|ok|chuẩn|chuan|vâng|vang|ừ|u|dạ|da)[,.\s]*/i, '').trim();

  let moTaTraCuu = tenChuan;
  if (thongSoMoi) {
    moTaTraCuu = `${tenChuan} ${thongSoMoi}`.trim();
  }

  return {
    sanSangTra: true,
    giaDinh: null,
    moTaTraCuu,
  };
}
