// packs/hs/nhanh-hoi-hang.js — dựng câu hỏi thuộc tính và giả định theo nhóm mặt hàng.
//
// Phân công của lớp hỏi lại, đúng Điều VI (mỗi tệp một trách nhiệm, dưới 300 dòng):
//   • `dien-cho-thieu.js` — điều phối `kiemTraThongTinPhanLoai` và nhánh xác nhận TÊN (nghi gõ nhầm);
//   • `nhanh-hoi-hang.js` — dựng câu hỏi THUỘC TÍNH (`hoiThuocTinh: true`) và giả định mặc định theo
//                           nhóm mặt hàng khi tên hàng đã rõ (ắc quy 85.07, điện gia dụng, cơ khí);
//   • `ky-luat-hoi.js`    — ĐO điều khách đã nêu, lọc/gom câu;
//   • `doc-tra-loi.js`    — ĐỌC câu trả lời và chốt mô tả tra cứu;
//   • `cau-hoi-khach.js`  — nhận diện câu khách HỎI LẠI.
//
// Tách ra ở OZV-837 khi `dien-cho-thieu.js` chạm 299/300 dòng (Điều VI) và cần thêm nhánh hỏi chiều
// cao bình ắc quy nhóm 85.07.
import { norm } from './input.js';
import { gomCau, cauXinThem, ketQuaHoi, chuTrong } from './ky-luat-hoi.js';

// Mục xin NƯỚC NHẬP, gộp vào chính câu `cauXinThem` sẵn có của nhánh (OZV-802, mục 3 của #177).
// Khách đã nêu nước thì `co.xuatXu` bật và `cauXinThem` tự rút mục này ra (luật 2 của kỷ luật hỏi).
const XUAT_XU = { khoa: 'xuatXu', chu: 'nước nhập (xuất xứ)' };

// Nước nhập chỉ ĐI KÈM câu xin-thêm đã có — tức còn ít nhất một mục khác khách chưa nêu. Mọi mục
// khác đã đủ thì BỎ nước, đi tra luôn: nó KHÔNG BAO GIỜ tự dựng ra câu hỏi hay lượt hỏi mới
// (OZV-814: `canHoi` bật ngay khi `cauHoi` không rỗng nên câu nước tự dựng sẽ làm hồ sơ đã đủ
// thông số vẫn bị treo giữa hai vòng hỏi — Điều II).
export function kemXuatXu(muc, co) {
  return muc.some((m) => !co[m.khoa]) ? [...muc, XUAT_XU] : muc;
}

// Nhóm ắc quy axit chì (85.07): phân nhánh theo công dụng (8507.10 khởi động động cơ ↔ 8507.20
// loại khác) và chiều cao bình không tính đầu cực/tay cầm (mốc ≤ 13 cm ở 8507.20.94 ↔ > 23 cm ở
// 8507.20.99, ca 85072094 / 918/TB-TCHQ).
const AC_QUY_RE = /(?:(?<![\p{L}\p{N}])(?:[aăắằẳẵặ]c\s*quy|ac\s*quy|acquy|lead[\s-]*acid)(?![\p{L}\p{N}]))|pin\s*kh[oô][\s\S]*axit\s*ch[iì]|pin\s*kho[\s\S]*axit\s*chi/iu;
const AC_QUY_CONG_DUNG_RE = /(kh[oở]i\s*[đd][oộ]ng|[đd][eề]\s*n[oổ]|xe\s*[đd][aạ]p\s*[đd]i[eệ]n|xe\s*[đd]i[eệ]n|l[uư]u\s*[đd]i[eệ]n|\bups\b)/i;
const AC_QUY_CONG_DUNG_NORM_RE = /\b(khoi\s*dong|de\s*no|xe\s*dap\s*dien|xe\s*dien|luu\s*dien|ups)\b/i;

// Danh sách từ khoá thiết bị điện gia dụng/cơ điện cần công suất / điện áp
const DIEN_GIA_DUNG_RE = /m[aáàảãạ]y\s*(xay|s[aấầẩẫậâ]y|ep|[eéèẻẽẹ]p|b[oơớờởỡợ]m|h[uúùủũụ]t|qu[aạàảã]t|n[eéèẻẽẹ]n|l[oọ]c|gi[aặ]t|r[uử]a)|n[oồổỗộ]i\s*(c[oơớờởỡợ]m|chi[eêếềểễệ]n|[aá]p\s*su[aấ]t)|l[oò]\s*(vi\s*s[oó]ng|n[uướ]ng)|b[eế]p\s*(t[uừ]|h[oồ]ng\s*ngo[aạ]i)|qu[aạ]t\s*[đd]i[eệ]n/i;
const CO_KHI_VAT_LIEU_RE = /\b(van(\s*bi|\s*b[uướớ]m|\s*m[oộ]t\s*chi[eề]u|\s*gi[aả]m\s*[aá]p|\s*c[aầ]u)?|[oố]ng(\s*th[eé]p|\s*nh[uự]a|\s*[đd][oồ]ng|\s*inox)?|bu\s*l[oô]ng|[oố]c\s*v[ií]t|th[eé]p(\s*cu[oộ]n|\s*t[aấ]m|\s*h[iì]nh)?|nh[oô]m(\s*th[oỏi]|\s*t[aấ]m|\s*[đd][iị]nh\s*h[iì]nh)?|v[aả]i(\s*cu[oộ]n|\s*d[eệ]t)?|t[aấ]m\s*nh[uự]a|m[aà]ng\s*nh[uự]a|v[oò]ng\s*bi|kh[oó]a(\s*c[ử]a)?|m[aặ]t\s*b[ií]ch)\b/i;

/** Giả định mặc định theo nhóm mặt hàng khi đã hỏi đủ 2 vòng. */
export function giaDinhNhomHang(sSach) {
  if (AC_QUY_RE.test(sSach)) {
    return `${sSach}, chiều cao thông dụng không quá 13 cm (không tính đầu cực và tay cầm)`;
  }
  if (DIEN_GIA_DUNG_RE.test(sSach)) {
    return `${sSach} loại thông dụng trong gia đình, điện áp 220V`;
  }
  if (/van\s*bi/i.test(sSach)) {
    return 'van bi đồng hoặc inox dùng cho đường ống nước thông thường';
  }
  if (/ống\s*thép|ong\s*thep/i.test(sSach)) {
    return 'ống thép hàn, không mạ kẽm, quy cách thông dụng';
  }
  if (CO_KHI_VAT_LIEU_RE.test(sSach)) {
    return `${sSach} quy cách thông dụng trong công nghiệp`;
  }
  return `${sSach} loại thông dụng theo tiêu chuẩn thương mại`;
}

function coCongDungAcQuy(sSach, co, hoSo) {
  if (co.congDung) return true;
  const h = hoSo && typeof hoSo === 'object' ? hoSo : {};
  const gop = [sSach, h.moTa, h.congDung, ...(Array.isArray(h.sua) ? h.sua : [])]
    .map((x) => String(x || '').trim()).filter(Boolean).join(' ');
  return AC_QUY_CONG_DUNG_RE.test(gop) || AC_QUY_CONG_DUNG_NORM_RE.test(norm(gop));
}

/**
 * Nhánh hỏi lại cho ắc quy / bình ắc quy axit chì (nhóm 85.07 — OZV-837).
 * Trả `null` nếu không phải ắc quy; trả kết quả `ketQuaHoi` (có thể `canHoi: false` khi đã đủ).
 */
export function hoiAcQuy({ s, sSach, co, hoSo }) {
  if (!AC_QUY_RE.test(sSach)) return null;
  const coCd = coCongDungAcQuy(sSach, co, hoSo);
  const coNay = { ...co, congDung: coCd };
  const cau1 = 'Dạ anh/chị cho em hỏi ắc quy này dùng để khởi động động cơ (ô tô, xe máy) hay dùng cho xe đạp điện / lưu điện UPS / mục đích khác ạ?';
  const muc = kemXuatXu([
    { khoa: 'kichThuoc', chu: 'chiều cao bình (cm, không tính đầu cực và tay cầm — mốc ≤ 13 cm hay trên 13 cm)' },
  ], coNay);
  const giaDinh = `${sSach}, chiều cao thông dụng không quá 13 cm (không tính đầu cực và tay cầm)`;
  return ketQuaHoi({
    s,
    tenGoiY: sSach,
    hoiThuocTinh: true,
    thieu: [...(coCd ? [] : ['congDung']), ...muc.filter((m) => !coNay[m.khoa]).map((m) => m.khoa)],
    cauHoi: gomCau([
      { cau: cau1, dai: ['congDung'] },
      { cau: cauXinThem(muc, coNay, 'có thì em chốt mã chuẩn hơn ạ.'), dai: muc.map((m) => m.khoa) },
    ], coNay),
    giaDinh,
  });
}

/** Nhánh hỏi lại cho nhóm máy móc / thiết bị điện / gia dụng thiếu thông số. */
export function hoiDienGiaDung({ s, sSach, soTu, co }) {
  const laDienGiaDung = DIEN_GIA_DUNG_RE.test(sSach);
  const laMayMocNgan = /^(m[aáàảãạ]y|thi[eế]t\s*b[iị]|n[oồổỗộ]i|qu[aạ]t)\b/i.test(sSach) && soTu < 8;
  if (!laDienGiaDung && !laMayMocNgan) return null;

  const coLoaiCongDung = co.congDung
    || /(gia\s*d[iì]nh|c[oô]ng\s*nghi[eệ]p|gia\s*d[uụ]ng|d[aâ]n\s*d[uụ]ng|c[aâàảãạáầẩẫậấ]m\s*tay|di\s*[đd][oộ]ng|mini)/i.test(sSach)
    || /(gia\s*dinh|cong\s*nghiep|gia\s*dung|dan\s*dung|cam\s*tay|di\s*dong|mini)/i.test(norm(sSach));
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
    const tenMon = chuTrong(sSach) || sSach;
    cau1 = `Dạ anh cho em hỏi ${tenMon} này dùng cho gia đình hay công nghiệp ạ?`;
    muc = [{ khoa: 'congSuat', chu: 'công suất (W)' }, { khoa: 'dienAp', chu: 'điện áp' }];
    giaDinh = `${sSach} loại thông dụng trong gia đình, điện áp 220V`;
  }
  muc = kemXuatXu(muc, coNay);

  return ketQuaHoi({
    s,
    tenGoiY: sSach,
    hoiThuocTinh: true,
    thieu: [...(coLoaiCongDung ? [] : ['congDung']), ...muc.filter((m) => !co[m.khoa]).map((m) => m.khoa)],
    cauHoi: gomCau([
      { cau: cau1, dai: ['congDung'] },
      { cau: cauXinThem(muc, coNay, duoi), dai: muc.map((m) => m.khoa) },
    ], coNay),
    giaDinh,
  });
}

/** Nhánh hỏi lại cho nhóm cơ khí / vật liệu / linh kiện chỉ nêu tên cụt (1–4 từ). */
export function hoiCoKhiVatLieu({ s, sSach, soTu, co, vongHoi = 0 }) {
  if (soTu > 4 || !CO_KHI_VAT_LIEU_RE.test(sSach)) return null;
  let cau1 = '';
  let daiCau1 = ['chatLieu'];
  let muc = [];
  let noi = ' và ';
  let giaDinh = '';

  if (/van(\s*bi)?/i.test(sSach)) {
    cau1 = 'Dạ van bi này chất liệu bằng đồng, inox hay nhựa ạ?';
    muc = [{ khoa: 'kichThuoc', chu: 'kích thước đường kính (DN)' }, { khoa: 'congDung', chu: 'mục đích dùng' }];
    noi = ' hoặc ';
    giaDinh = 'van bi đồng hoặc inox dùng cho đường ống nước thông thường';
  } else if (/[oố]ng(\s*th[eé]p)?/i.test(sSach)) {
    cau1 = 'Dạ ống thép này là loại đúc hay hàn, có mạ kẽm không ạ?';
    daiCau1 = ['quyCach'];
    muc = [{ khoa: 'kichThuoc', chu: 'đường kính và độ dày' }];
    giaDinh = 'ống thép hàn, không mạ kẽm, quy cách thông dụng';
  } else {
    const tenMon = chuTrong(sSach) || sSach;
    cau1 = `Dạ anh cho em hỏi ${tenMon} này làm bằng chất liệu gì ạ?`;
    muc = [{ khoa: 'kichThuoc', chu: 'quy cách kích thước' }, { khoa: 'congDung', chu: 'công dụng' }];
    noi = ' hoặc ';
    giaDinh = `${sSach} chất liệu thông dụng trong công nghiệp`;
  }
  if (vongHoi >= 1 && daiCau1.every((k) => co[k])) return null;
  muc = kemXuatXu(muc, co);

  return ketQuaHoi({
    s,
    tenGoiY: sSach,
    hoiThuocTinh: true,
    thieu: [...(daiCau1.every((k) => co[k]) ? [] : daiCau1), ...muc.filter((m) => !co[m.khoa]).map((m) => m.khoa)],
    cauHoi: gomCau([
      { cau: cau1, dai: daiCau1 },
      { cau: cauXinThem(muc, co, 'có thì em chốt mã chuẩn hơn ạ.', noi), dai: muc.map((m) => m.khoa) },
    ], co),
    giaDinh,
  });
}
