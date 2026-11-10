// packs/hs/luong-chu.js — LUỒNG TIN CHỮ của gói hs: tin khách gõ → hồ sơ → gói con (issue #170).
//
// Tách khỏi `index.js` (Điều VI — mỗi tệp một trách nhiệm, dưới 300 dòng): `index.js` chỉ còn là
// "cửa" của gói (handle/onJobResult), còn luồng tin chữ nằm ở đây.

import { routeThongMinh } from './brain.js';
import { menuText } from './packages.js';
import { renderResult, clipReply } from './render.js';
import { result } from './flow-turn.js';
import { norm } from './input.js';
import { runPkg, trenHoSo } from './chay-goi.js';
import {
  layHoSo, hoSoRong, themChu, themSua, themTinTiep, duDeTra, dongDangTra, locTapAmAnh,
  laLenhTroHoSo, laLenhCauTruc, laCauXemLai, laMonKhac, laCauHangMoi, boTienToHangMoi,
  dungTuLichSu, cauDaDoi,
} from './ho-so.js';

const OK_RE = /^(ok|oke|okay|dung|chuan|xac nhan|dong y|yes|y|uh|u|vang)[.!]*$/;
const ANH_RE = /(ten hang|thong so|model|thuong hieu|chat lieu)\s*:/;

export async function textFlow(turn, ctx, st) {
  const text = String(turn.text ?? '');
  const s = st.session;
  const phanLoai = st.pkgs.find((p) => p.id === 'phan-loai');
  const hoSoTruoc = layHoSo(s);
  // Nguồn khác ngoài chữ (ảnh, câu sửa) đã góp vào hồ sơ → tin kế tiếp phải tra trên bản GỘP,
  // không phải tin lẻ (đúng lỗi 10:12 của issue #170: "ok" chỉ tra chữ đọc từ ảnh).
  const coNguonKhac = (hoSoTruoc.nguon || []).some((n) => n !== 'CHU') || (hoSoTruoc.sua || []).length > 0;
  // Lệnh cấu trúc (menu, "4", lời chào, "chi tiết", xem kết quả lượt) KHÔNG phải dữ kiện mặt hàng:
  // hồ sơ đang mở không được nuốt, nếu không khách mất đường thoát (issue #170, người soát đo).
  const lenhCauTruc = laLenhCauTruc(text);
  // Cờ "bot đang chờ khách đáp" chỉ sống ĐÚNG MỘT lượt khách: Lõi đã đọc nó trước khi gọi gói
  // (cửa chào kết), nên tới đây là xong việc. Để treo thì chào kết thật ("cảm ơn ạ") cũng không
  // còn im được nữa — đúng cái cửa đó sinh ra để tránh.
  s.choKhachTraLoi = null;
  // Khách rời hồ sơ (đổi món) → bot không còn chờ câu đáp nào. Trước đây dòng này xoá
  // `s.choTraLoiHoSo`, một khoá KHÔNG AI ĐỌC (người soát grep ra, điểm [S14]).
  const roiHoSo = () => { s.choXacNhanAnh = null; s.choKhachTraLoi = null; };

  // Khách TỰ BÁO đổi món ("hàng mới: …") → mở hồ sơ MỚI. Nhánh này chạy TRƯỚC nhánh "món khác
  // hẳn" và KHÔNG bị chặn bởi `s.goi`/`s.choBoSung`: chính bot còn nhắc khách "Hỏi hàng khác thì
  // gõ 'hàng mới'" (packages.js) nên đường thoát phải luôn mở. Nếu hồ sơ cũ trộn với món mới
  // ("máy radar — bơm nước") thì lượt sau Cổng nhận tên hàng LAI → sai món, sai mã, sai thuế
  // (Hiến pháp Điều III).
  if (phanLoai && !lenhCauTruc && laCauHangMoi(text)) {
    roiHoSo();
    const h = themChu(hoSoRong(), boTienToHangMoi(text));
    if (duDeTra(h)) return trenHoSo(st, phanLoai, h, { cauKhach: text });
    s.hoSo = h;
  } else if (phanLoai && !lenhCauTruc && !s.choBoSung && !s.goi && !s.hoiLai && laMonKhac(text, hoSoTruoc)) {
    // Món KHÁC HẲN hồ sơ đang mở → mở hồ sơ mới, không gộp hai món làm một tên hàng lai.
    roiHoSo();
    const h = themChu(hoSoRong(), boTienToHangMoi(text));
    if (duDeTra(h)) return trenHoSo(st, phanLoai, h, { cauKhach: text });
    s.hoSo = h;
  }

  // "Xem lại toàn bộ từ đầu" (tin 10:18) → dựng lại hồ sơ từ CẢ MẠCH rồi phân loại lại, nói rõ đã đổi gì.
  if (phanLoai && laCauXemLai(text)) {
    const lichSu = (() => { try { return ctx.history?.(40) ?? []; } catch { return []; } })();
    // `sua`: phần SỬA của khách trong tin này. Tin 10:18 của issue #170 là "chữ on/off là đóng
    // mở, không liên quan dòng điện, xem lại toàn bộ thông tin khách gửi từ đầu tới cuối": nửa
    // đầu là sửa đúng của khách (phải còn trong hồ sơ), nửa sau là LỆNH — lệnh là câu của khách với
    // bot, không phải mặt hàng; đưa nó vào hồ sơ là bơm lệnh vào `tenHang` gửi Cổng (lớp lỗi [S16]).
    // Tách bằng CHÍNH bộ lọc tạp âm của mọi tin chữ: phần còn lại là dữ kiện mặt hàng, phần bị bỏ
    // là lệnh/tạp âm.
    let h = dungTuLichSu(lichSu, { sua: [locTapAmAnh(text).sach] });
    // Lịch sử không dựng được hồ sơ → gom phần khách SỬA trong tin này (bỏ lệnh "xem lại toàn bộ"):
    // đưa nguyên tin (có lệnh) vào hồ sơ là bơm lệnh vào tên hàng gửi Cổng (lớp lỗi [S16]).
    if (!duDeTra(h)) h = themSua(hoSoTruoc, locTapAmAnh(text).sach);
    s.choXacNhanAnh = null;
    s.choBoSung = null;
    // Khách ra lệnh "xem lại toàn bộ" KHÔNG phải trả lời câu hỏi "hỏi lại" đang mở → đóng câu hỏi
    // cũ, nếu không gói 1 coi lệnh là câu trả lời, ghi đè mô tả hồ sơ và KHÔNG gọi Cổng
    // (điểm [S25] của người soát).
    s.hoiLai = null;
    if (duDeTra(h)) return trenHoSo(st, phanLoai, h, { cauDan: cauDaDoi(h), cauKhach: text });
  }

  // Đang chờ khách trả lời câu hỏi mâu thuẫn ảnh ↔ chữ → câu trả lời vào hồ sơ rồi phân loại lại.
  if (phanLoai && hoSoTruoc.choTraLoi && !laLenhTroHoSo(text) && !lenhCauTruc) {
    const h = themSua(hoSoTruoc, text);
    s.choXacNhanAnh = null;
    // Khách đang trả lời câu hỏi MÂU THUẪN, không phải câu hỏi "hỏi lại" thiếu thông số → đóng
    // câu hỏi cũ, nếu không gói 1 lấy câu này làm câu trả lời và ghi đè mô tả gộp của hồ sơ
    // (điểm [S25] của người soát).
    s.hoiLai = null;
    if (duDeTra(h)) return trenHoSo(st, phanLoai, h, { cauDan: cauDaDoi(h), cauKhach: text });
  }

  // Lệnh cấu trúc thì thôi chờ xác nhận ảnh: khách đã chuyển việc, thông số ảnh vẫn nằm trong hồ sơ.
  if (lenhCauTruc) s.choXacNhanAnh = null;

  // Đang chờ xác nhận thông số đọc từ ảnh: "ok/đúng" → phân loại trên HỒ SƠ GỘP (ảnh là bổ sung).
  if (s.choXacNhanAnh && OK_RE.test(norm(text))) {
    const pending = s.choXacNhanAnh;
    s.choXacNhanAnh = null;
    if (phanLoai && duDeTra(hoSoTruoc)) return trenHoSo(st, phanLoai, hoSoTruoc, { nguonThongSo: 'ANH', cauKhach: text });
    if (phanLoai) return runPkg(st, phanLoai, pending, { nguonThongSo: 'ANH' });
  }
  if (s.choXacNhanAnh && !/^\d$/.test(text.trim())) {
    // Người dùng gửi bản đã sửa → gộp vào hồ sơ (không thay mô tả chữ đã có), nguồn vẫn là ảnh đã chỉnh.
    s.choXacNhanAnh = null;
    if (phanLoai && ANH_RE.test(norm(text))) {
      return trenHoSo(st, phanLoai, themChu(hoSoTruoc, text), { nguonThongSo: 'ANH', cauKhach: text });
    }
    // Tin chữ thường trong lúc chờ xác nhận ảnh (tin 10:06) KHÔNG được rơi lọt im lặng.
    if (phanLoai && !s.choBoSung) {
      const h = themChu(hoSoTruoc, text);
      if (duDeTra(h)) return trenHoSo(st, phanLoai, h, { cauDan: dongDangTra(h), cauKhach: text });
    }
  }

  // Lệnh ngắn ("tra hscode", "ok", "đây nhé", "@bot" trống) trỏ vào hồ sơ đang xử lý — KHÔNG phải tên hàng.
  if (phanLoai && laLenhTroHoSo(text) && duDeTra(hoSoTruoc) && !s.choBoSung) {
    // Lệnh ngắn trỏ vào hồ sơ đang có, KHÔNG phải câu trả lời cho câu hỏi "hỏi lại" đang mở →
    // đóng câu hỏi cũ (điểm [S25] của người soát: nếu còn mở, gói 1 ghép lệnh vào tên hàng
    // gửi Cổng rồi hỏi lại đúng câu cũ → 0 lần gọi Cổng).
    s.hoiLai = null;
    return trenHoSo(st, phanLoai, hoSoTruoc, { cauDan: dongDangTra(hoSoTruoc), cauKhach: text });
  }
  if (!text.trim()) {
    return result(st, turn.isGroup ? [] : ['Bot đọc tin nhắn chữ và ảnh. Gõ "menu" để xem các gói tra cứu.']);
  }
  // Tin chữ thường: luôn cập nhật hồ sơ; chỉ tra trên bản gộp khi hồ sơ có nguồn khác ngoài tin này.
  // Lệnh cấu trúc không vào đây (menu/chọn gói/lời chào phải xuống routeThongMinh như bản gốc).
  if (phanLoai && coNguonKhac && !lenhCauTruc && !s.choBoSung && !s.goi && !s.hoiLai) {
    const h = themTinTiep(hoSoTruoc, text);
    if (duDeTra(h)) return trenHoSo(st, phanLoai, h, { cauKhach: text });
  }
  if (!lenhCauTruc) s.hoSo = themTinTiep(hoSoTruoc, text);
  if (s.choBoSung && !s.goi) s.goi = 1;   // đang trả lời câu hỏi bổ sung của gói 1
  // Não hiểu câu hỏi (ctx.brain) chỉ hỏi ở chế độ TỰ ĐỘNG; lỗi/không chắc → routeThongMinh tự về regex.
  const r = await routeThongMinh(text, { session: s, pkgs: st.pkgs, brain: ctx.brain ?? null });
  const one = (t) => result(st, [t]);

  try {
    switch (r.kind) {
      case 'menu':
        s.banDayDuPhanLoai = null;
        return one(`{b}🤖 Bot tra cứu hải quan OZ{/b}\n\n${menuText(st.pkgs, { full: true })}\n\nHoặc cứ gõ mã HS / mô tả hàng, bot tự chọn gói.`);
      case 'chao':   // lời chào: ngắn + menu rút gọn (dán menu 900 ký tự vào câu chào là ấn tượng xấu nhất)
        return one(`{b}🤖 Chào anh/chị!{/b} Em là bot tra cứu hải quan OZ đây ạ.\n\n${menuText(st.pkgs, { compact: true })}\n\nAnh/chị cứ gõ mã HS hoặc mô tả hàng (tên, chất liệu, công dụng, thông số), em tra giúp.`);
      case 'tu-dong':
        s.goi = null;
        s.banDayDuPhanLoai = null;
        return one(`{b}🔄 Đã chuyển sang chế độ TỰ ĐỘNG:{/b} bot đoán gói theo nội dung bạn gõ.\n\n${st.footer}`);
      case 'chon':
        s.goi = r.pkg.so;
        s.banDayDuPhanLoai = null;
        // Vừa phân loại xong (phiên có mã + tên hàng) mà gõ "2"/"3" → chạy luôn với mã vừa tra, không bắt gõ lại theo mẫu.
        if ((r.pkg.so === 2 || r.pkg.so === 3) && s.last?.maHs && (r.pkg.so === 2 || s.last.tenHang)) {
          return runPkg(st, r.pkg, '', { head: `{b}${r.pkg.icon} Gói ${r.pkg.so}: ${r.pkg.ten} — mã vừa tra{/b}\n\n` });
        }
        return one(`{b}${r.pkg.icon} Gói ${r.pkg.so}: ${r.pkg.ten}{/b}\n${r.pkg.moTa}\n\n{b}Gửi thông tin theo mẫu:{/b}\n${r.pkg.mau}\n\n${st.footer}`);
      case 'ket-qua': {
        const tn = ctx.tools;
        const tool = !tn || tn.has('ket_qua_phan_loai') ? 'ket_qua_phan_loai' : 'ket_qua_soat';
        let k = await st.mcp.callTool(tool, { maLuot: r.maLuot });
        if (k?.ok === false && tool === 'ket_qua_phan_loai' && (!tn || tn.has('ket_qua_soat'))) k = await st.mcp.callTool('ket_qua_soat', { maLuot: r.maLuot });
        return one(clipReply(`${renderResult(k, { title: `📥 Kết quả lượt ${r.maLuot}` })}\n\n${st.footer}`));
      }
      case 'chay': {
        if (r.chon) s.goi = r.pkg.so;
        // Mạch ĐÃ CÓ mô tả hàng → gói 1 tra trên bản GỘP của hồ sơ, KHÔNG bao giờ trên tin lẻ
        // vừa gõ. Thiếu chốt này, một câu hội thoại ("hàng này em nhập từ Trung Quốc về bán lẻ ạ")
        // đi thẳng vào `phan_loai_hs.tenHang` và bot gắn mã HS + số thuế vào thứ không phải mặt
        // hàng (người soát đo, điểm [S16]; Hiến pháp Điều III và VIII).
        // So với hồ sơ TRƯỚC tin này (`hoSoTruoc`): tin đầu tiên của mạch vẫn tra trên nguyên văn
        // tin khách (khối "Tên hàng: … / Chất liệu: …" phải tới Cổng đúng ô), chỉ tin SAU mới tra
        // trên hồ sơ gộp. `choBoSung` phải loại trừ: lượt CAN_DU_KIEN còn mở thì tin này là câu bổ
        // sung dữ kiện của chính lượt đó (`packages.js` nhánh `bo_sung_du_kien`, yêu cầu 3).
        if (r.pkg.so === 1 && !s.choBoSung && String(hoSoTruoc.moTa ?? '').trim()) {
          return await trenHoSo(st, r.pkg, layHoSo(s), { cauKhach: text });
        }
        const boQuaHead = (r.pkg.so === 1) || (r.pkg.so === 2 && Boolean(s.banDayDuPhanLoai));
        const head = (r.tuDong && !boQuaHead) ? `{b}${r.pkg.icon} (Tự động chọn gói ${r.pkg.so}: ${r.pkg.ten}){/b}\n\n` : '';
        const out = await runPkg(st, r.pkg, r.text, { head });
        ctx.log?.info?.(`[hs] gói ${r.pkg.so} chat=${String(turn.chatId ?? '').slice(-4)}`);
        return out;
      }
      case 'chi-tiet':   // mở lại bản phân tích đầy đủ của lượt phân loại gần nhất (khách cuộn mất tin)
        return one(s.chiTiet?.text
          ? `🔎 Bản chi tiết lượt gần nhất:\n\n${clipReply(s.chiTiet.text)}`
          : 'Chưa có kết quả phân loại nào trong phiên này để mở chi tiết. Anh/chị gửi mô tả hàng hoặc mã HS trước rồi gõ "chi tiết" nhé.');
      case 'hoi-lai':   // não hỏi lại một câu thay vì đoán mò chạy gói
        return one(`❓ ${r.cauHoi}`);
      case 'khac':      // chào hỏi/xã giao: não trả lời ngắn, dẫn về menu
        return one(`${r.cauDan}\n\n${st.footer}`);
      default:   // 'ignore' (tin rỗng) và loại lạ: không trả lời
        return result(st, []);
    }
  } catch (e) {
    ctx.log?.error?.(`[hs] lỗi (${r.kind}${r.pkg ? ` gói ${r.pkg.so}` : ''}): ${e.message}`);   // chi tiết chỉ vào log (lõi che bí mật)
    return one(`{orange}⚠️ Cổng tra cứu OZ đang lỗi tạm thời{/orange}. Bạn thử lại sau ít phút nhé.\n\n${st.footer}`);   // Hiến pháp IX: không kèm lỗi gốc
  }
}
