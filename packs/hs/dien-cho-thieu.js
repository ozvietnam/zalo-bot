// packs/hs/dien-cho-thieu.js — cơ chế điền chỗ thiếu & hỏi lại trước khi tra cứu HS.
// Yêu cầu issue #136, #138 (GQ-02): thiếu ý quan trọng hoặc nghi gõ nhầm → hỏi tối đa 2 câu trong 1 tin ngắn,
// tối đa 2 vòng hỏi. Khách nói "không rõ / cứ tra đi" → tra luôn và nói rõ giả định.
import { norm } from './input.js';

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

const CONG_SUAT_RE = /\b(\d+(?:[.,]\d+)?)\s*(w|kw|hp|wats?|watt|m[aã]\s*l[uự]c)\b/i;
const DIEN_AP_RE = /\b(\d+)\s*(v|volt|volts?|vdc|vac)\b/i;
const DUNG_TICH_RE = /\b(\d+(?:[.,]\d+)?)\s*(l|l[ií]t|liters?|ml)\b/i;
const KICH_THUOC_RE = /\b(dn\d+|\d+(?:[.,]\d+)?\s*(mm|cm|m|inch|in|phi|ø|bar|mpa|psi|kg|g|tan|tấn))\b/i;
const CHAT_LIEU_RE = /\b(inox(\s*\d+)?|th[eé]p(\s*kh[oô]ng\s*g[iỉ])?|gang|nh[uự]a|nh[oô]m|[đd][oồ]ng|g[oỗ]|cao\s*su|da|s[uứ]|th[uỷ]y\s*tinh|cotton|poly|polyester)\b/i;
const CONG_DUNG_RE = /\b(d[uù]ng\s*cho|d[uù]ng\s*trong|d[uù]ng\s*[đd][eể]|chuy[eê]n\s*d[uù]ng|gia\s*d[uụ]ng|c[oô]ng\s*nghi[eệ]p|t[uự]\s*[đd][oộ]ng|c[aâ]m\s*tay|g[ií]a\s*[đd][iì]nh|ly\s*t[aâ]m)\b/i;
const QUY_CACH_RE = /\b(tay\s*g[aạ]t|m[aạ]\s*k[eẽ]m|[đd][uú]c|h[aà]n|kh[oô]ng\s*d[aầ]u)\b/i;
const FORM_NHAN_RE = /^(t[eê]n\s*h[aà]ng|ten\s*hang|m[oô]\s*t[aả]|mo\s*ta|ch[aấ]t\s*li[eệ]u|chat\s*lieu|th[oô]ng\s*s[oố]|thong\s*so|model)\s*:/im;

/** Nhận diện câu khách nói "không rõ / cứ tra đi / tra luôn đi". */
export function nhanDienCuTraDi(text) {
  const n = norm(String(text || ''));
  return CU_TRA_RE.test(n);
}

/**
 * Kiểm tra xem mô tả hàng có thiếu thông tin cốt lõi hoặc nghi gõ nhầm không.
 * @param {string} text Mô tả hàng khách gửi
 * @param {{ vongHoi?: number, goi?: number }} opts
 */
export function kiemTraThongTinPhanLoai(text, { vongHoi = 0, goi = null } = {}) {
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

  // 2. Kiểm tra nghi gõ nhầm
  for (const item of GOI_Y_GO_NHAM) {
    if (item.regex.test(s) || (item.normRegex && item.normRegex.test(norm(s)))) {
      const coCongSuat = CONG_SUAT_RE.test(s);
      const coDienAp = DIEN_AP_RE.test(s);
      if (coCongSuat && coDienAp) break; // Đã đủ thông số

      const thieu = [];
      if (!coCongSuat) thieu.push('congSuat');
      if (!coDienAp) thieu.push('dienAp');

      const cau1 = `Dạ anh ơi, em hiểu là **${item.chuan}**${item.moRong ? ` (${item.moRong})` : ''} đúng không ạ?`;
      const cau2 = `Anh cho em xin thêm công suất (W) và điện áp nhé — có thì em chốt mã chuẩn hơn, mô tả khai báo cũng đủ ý luôn ạ.`;
      return {
        canHoi: true,
        tenGoc: s,
        tenGoiY: item.chuan,
        thieu,
        cauHoi: `${cau1} ${cau2}`,
        giaDinhMacDinh: item.giaDinh,
      };
    }
  }

  // 3. Đánh giá độ chi tiết của mô tả
  const coCongSuat = CONG_SUAT_RE.test(sSach);
  const coDienAp = DIEN_AP_RE.test(sSach);
  const coDungTich = DUNG_TICH_RE.test(sSach);
  const coKichThuoc = KICH_THUOC_RE.test(sSach);
  const coChatLieu = CHAT_LIEU_RE.test(sSach);
  const coCongDung = CONG_DUNG_RE.test(sSach);
  const coQuyCach = QUY_CACH_RE.test(sSach);
  const soChiTiet = [coCongSuat, coDienAp, coDungTich, coKichThuoc, coChatLieu, coCongDung, coQuyCach].filter(Boolean).length;

  // Nếu đã có từ 2 thông số/chi tiết trở lên hoặc có điện áp rõ ràng + công dụng: đủ thông số
  if (soChiTiet >= 2 || (coDienAp && coCongDung) || (coCongSuat && coCongDung) || (soTu >= 10 && soChiTiet >= 1)) {
    return { canHoi: false, giaDinh: null, thieu: [] };
  }

  // 4. Nhóm máy móc / thiết bị điện / gia dụng thiếu thông số
  const laDienGiaDung = DIEN_GIA_DUNG_RE.test(sSach);
  const laMayMocNgan = /^(m[aáàảãạ]y|thi[eế]t\s*b[iị]|n[oồổỗộ]i|qu[aạ]t)\b/i.test(sSach) && soTu < 8;
  const coLoaiCongDung = coCongDung || /(gia\s*d[iì]nh|c[oô]ng\s*nghi[eệ]p|gia\s*d[uụ]ng|d[aâ]n\s*d[uụ]ng|c[aâàảãạáầẩẫậấ]m\s*tay|di\s*[đd][oộ]ng|mini)/i.test(sSach) || /(gia\s*dinh|cong\s*nghiep|gia\s*dung|dan\s*dung|cam\s*tay|di\s*dong|mini)/i.test(norm(sSach));

  if (laDienGiaDung || laMayMocNgan) {
    if (!coLoaiCongDung && !coCongSuat && !coDienAp && !coDungTich) {
      let cau1 = '';
      let cau2 = '';
      let giaDinh = '';

      if (/n[oồổỗộ]i\s*chi[eêếềểễệ]n/i.test(sSach)) {
        cau1 = 'Dạ anh cho em hỏi nồi chiên này dùng cho gia đình hay công nghiệp ạ?';
        cau2 = 'Anh cho em xin thêm dung tích (lít) và công suất (W) nhé — có thì em chốt mã chuẩn hơn ạ.';
        giaDinh = 'nồi chiên không dầu gia dụng, dung tích ~5L, công suất 1500W, điện áp 220V';
      } else if (/m[aáàảãạ]y\s*b[oơớờởỡợ]m/i.test(sSach)) {
        cau1 = 'Dạ anh cho em hỏi máy bơm này dùng cho gia đình hay công nghiệp ạ?';
        cau2 = 'Anh cho em xin thêm công suất (HP/kW) và điện áp nhé — có thì em chốt mã chuẩn hơn ạ.';
        giaDinh = 'máy bơm nước ly tâm gia đình, điện áp 220V';
      } else if (/qu[aạ]t\s*[đd]i[eệ]n|qu[aạ]t/i.test(sSach)) {
        cau1 = 'Dạ anh cho em hỏi quạt điện này là loại gia dụng hay công nghiệp ạ?';
        cau2 = 'Anh cho em xin thêm công suất (W) và điện áp nhé — có thì em chốt mã chuẩn hơn ạ.';
        giaDinh = 'quạt điện gia dụng công suất ~50W, điện áp 220V';
      } else {
        cau1 = `Dạ anh cho em hỏi ${sSach} này dùng cho gia đình hay công nghiệp ạ?`;
        cau2 = 'Anh cho em xin thêm công suất (W) và điện áp nhé — có thì em chốt mã chuẩn hơn ạ.';
        giaDinh = `${sSach} loại thông dụng trong gia đình, điện áp 220V`;
      }

      return {
        canHoi: true,
        tenGoc: s,
        tenGoiY: sSach,
        thieu: ['congSuat', 'dienAp'],
        cauHoi: `${cau1} ${cau2}`,
        giaDinhMacDinh: giaDinh,
      };
    }
  }

  // 5. Nhóm cơ khí / vật liệu / linh kiện chỉ nêu tên cụt (1–4 từ)
  if (soTu <= 4 && CO_KHI_VAT_LIEU_RE.test(sSach)) {
    if (!coKichThuoc && !coQuyCach) {
      let cau1 = '';
      let cau2 = '';
      let giaDinh = '';

      if (/van(\s*bi)?/i.test(sSach)) {
        cau1 = 'Dạ van bi này chất liệu bằng đồng, inox hay nhựa ạ?';
        cau2 = 'Anh cho em xin thêm kích thước đường kính (DN) hoặc mục đích dùng nhé — có thì em chốt mã chuẩn hơn ạ.';
        giaDinh = 'van bi đồng hoặc inox dùng cho đường ống nước thông thường';
      } else if (/[oố]ng(\s*th[eé]p)?/i.test(sSach)) {
        cau1 = 'Dạ ống thép này là loại đúc hay hàn, có mạ kẽm không ạ?';
        cau2 = 'Anh cho em xin thêm đường kính và độ dày nhé — có thì em chốt mã chuẩn hơn ạ.';
        giaDinh = 'ống thép hàn, không mạ kẽm, quy cách thông dụng';
      } else {
        cau1 = `Dạ anh cho em hỏi ${sSach} này làm bằng chất liệu gì ạ?`;
        cau2 = 'Anh cho em xin thêm quy cách kích thước hoặc công dụng nhé — có thì em chốt mã chuẩn hơn ạ.';
        giaDinh = `${sSach} chất liệu thông dụng trong công nghiệp`;
      }

      return {
        canHoi: true,
        tenGoc: s,
        tenGoiY: sSach,
        thieu: ['chatLieu', 'kichThuoc'],
        cauHoi: `${cau1} ${cau2}`,
        giaDinhMacDinh: giaDinh,
      };
    }
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
