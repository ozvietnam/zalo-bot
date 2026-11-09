// packs/hs/dien-cho-thieu.js — cơ chế điền chỗ thiếu & hỏi lại trước khi tra cứu HS.
// Yêu cầu issue #136: thiếu ý quan trọng hoặc nghi gõ nhầm → hỏi tối đa 2 câu trong 1 tin ngắn,
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
];

// Danh sách từ khoá thiết bị điện gia dụng/cơ điện cần công suất / điện áp
const DIEN_GIA_DUNG_RE = /m[aáàảãạ]y\s*(xay|s[aấầẩẫậâ]y|ep|[eéèẻẽẹ]p|b[oơớờởỡợ]m|h[uúùủũụ]t|qu[aạàảã]t|n[eéèẻẽẹ]n)|n[oồổỗộ]i\s*(c[oơớờởỡợ]m|chi[eêếềểễệ]n)/i;
const CONG_SUAT_RE = /\b(\d+(?:[.,]\d+)?)\s*(w|kw|hp|wats?|watt|m[aã]\s*l[uự]c)\b/i;
const DIEN_AP_RE = /\b(\d+)\s*(v|volt|volts?|vdc|vac)\b/i;

/** Nhận diện câu khách nói "không rõ / cứ tra đi / tra luôn đi". */
export function nhanDienCuTraDi(text) {
  const n = norm(String(text || ''));
  return CU_TRA_RE.test(n);
}

/**
 * Kiểm tra xem mô tả hàng có thiếu thông tin cốt lõi hoặc nghi gõ nhầm không.
 * @param {string} text Mô tả hàng khách gửi
 * @param {{ vongHoi?: number }} opts
 */
export function kiemTraThongTinPhanLoai(text, { vongHoi = 0 } = {}) {
  const s = String(text || '').trim();

  // Nếu đã hỏi đủ 2 vòng: không hỏi nữa, áp dụng giả định phổ biến nhất
  if (vongHoi >= 2) {
    let giaDinh = null;
    for (const item of GOI_Y_GO_NHAM) {
      if (item.regex.test(s) || (item.normRegex && item.normRegex.test(norm(s)))) {
        giaDinh = item.giaDinh;
        break;
      }
    }
    return { canHoi: false, giaDinh: giaDinh || `${s} loại thông dụng trong gia đình, điện áp 220V`, thieu: [] };
  }

  // 1. Kiểm tra nghi gõ nhầm và thiếu thông số
  for (const item of GOI_Y_GO_NHAM) {
    if (item.regex.test(s) || (item.normRegex && item.normRegex.test(norm(s)))) {
      const coCongSuat = CONG_SUAT_RE.test(s);
      const coDienAp = DIEN_AP_RE.test(s);
      const thieu = [];
      if (!coCongSuat) thieu.push('congSuat');
      if (!coDienAp) thieu.push('dienAp');

      // Tạo câu hỏi ngắn giọng Quyên (tối đa 2 câu)
      const cau1 = `Dạ anh ơi, em hiểu là **${item.chuan}**${item.moRong ? ` (${item.moRong})` : ''} đúng không ạ?`;
      const cau2 = `Anh cho em xin thêm công suất (W) và điện áp nhé — có thì em chốt mã chuẩn hơn, mô tả khai báo cũng đủ ý luôn ạ.`;
      const cauHoi = `${cau1} ${cau2}`;

      return {
        canHoi: true,
        tenGoc: s,
        tenGoiY: item.chuan,
        thieu,
        cauHoi,
        giaDinhMacDinh: item.giaDinh,
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
    moTaTraCuu = `${tenChuan} ${thongSoMoi}`;
  }

  return {
    sanSangTra: true,
    giaDinh: null,
    moTaTraCuu,
  };
}
