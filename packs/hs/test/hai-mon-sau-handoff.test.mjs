// packs/hs/test/hai-mon-sau-handoff.test.mjs — OZV-2333: HAI MÓN trong CÙNG phiên sau handoff.
//
// Hiện tượng đo được (ghi trong thẻ OZV-2333, tái hiện ở G10 b7 khi dựng ca): luồng NEEDS_*
// (Cổng trả NEEDS_EXPERT / khách bấm 0 gặp nhân viên) làm phiên về TỰ DO nhưng `session.hoSo`
// vẫn là hồ sơ MÓN CŨ. Tin khách MÔ TẢ MÓN MỚI trọn câu ("Tra giúp em mã HS máy nén khí…") sau đó
// rơi vào `themTinTiep` → `themSua` (mục "khách nói thêm") rồi gói 1 tra trên BẢN GỘP
// "Tên hàng: máy hút bụi… (khách nói thêm: máy nén khí…)" — MÃ MÓN CŨ gắn cho MÔ TẢ TRỘN HAI MÓN.
//
// Kỳ vọng: mô tả món B KHÔNG được mang mã/kết quả của món A — tin tra mã HS trọn vẹn một món
// KHÁC (không nhắc đặc trưng món cũ) phải mở HỒ SƠ MỚI như thể khách gõ "hàng mới: …".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import hs from '../index.js';
import { plain } from '../style.js';

const ALL = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt',
  'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien'];

/** ctx giả theo khuôn hs.test.mjs; Cổng LUÔN trả NEEDS_EXPERT results rỗng (đúng khung G10). */
function fakeCtx() {
  const chuyenGia = () => ({ ok: true, trangThai: 'XONG',
    ketQua: { status: 'NEEDS_EXPERT', results: [],
      nextAction: { type: 'HUMAN_REVIEW', reasonVi: 'Mô tả còn mờ giữa các nhóm hàng, cần chuyên gia phân loại xem lại trước khi chốt mã.' } } });
  const script = Object.fromEntries(ALL.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
  script.phan_loai_hs = chuyenGia;
  const store = {};
  const ctx = {
    mcp: fakeMcp(script), tools: new Set(ALL), vision: null, customer: null, history: () => [],
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-04T03:00:00Z'), log: { info() {}, error() {} },
  };
  return { ctx, store, calls: ctx.mcp.calls };
}
const turn = (text) => ({ turnId: 't', chatId: 'u1', userId: 'u1', userName: 'Tuấn', isGroup: false, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-04T03:00:00.000Z', isStaff: false });

test('OZV-2333: sau handoff chuyên gia, tin tra mã HS món KHÁC trong cùng phiên mở hồ sơ MỚI — không gộp tên hàng lai', async () => {
  const { ctx, store, calls } = fakeCtx();
  // Món A: máy hút bụi → Cổng NEEDS_EXPERT (results rỗng) → bot nhắn "chuyên gia", KHÔNG bịa mã.
  const a = await hs.handle(turn('Tra giúp em mã HS máy hút bụi dùng trong nhà công suất 1200W'), ctx);
  assert.match(plain(a.replies[0].text), /chuyên gia/);
  assert.doesNotMatch(plain(a.replies[0].text), /Mã đề xuất/);
  assert.equal(calls.length, 1);
  assert.match(calls[0].args.tenHang, /hut bui|hút bụi/i);
  // Phiên sau handoff: hết chờ bổ sung, hết gói — nhưng hồ sơ món A vẫn còn.
  assert.ok(!store.choBoSung && !store.goi, 'phiên phải về TỰ DO sau nhánh chuyên gia');
  assert.ok(String(store.hoSo?.moTa || ''), 'hồ sơ món A vẫn nằm trong phiên (điều kiện tái hiện lỗi)');

  // Món B TRỌN CÂU trong CÙNG phiên: phải tra trên HỒ SƠ MỚI chỉ gồm món B…
  const b = await hs.handle(turn('Tra giúp em mã HS máy nén khí 8 bát mới 100% dùng cho xe tải đầu kéo'), ctx);
  assert.equal(calls.length, 2, 'phải mở lượt tra mới cho món B');
  const tenB = String(calls[1].args.tenHang || '');
  assert.match(tenB, /nén khí|nen khi/i, `tenHang gửi Cổng phải còn mô tả món B, hiện: "${tenB}"`);
  assert.doesNotMatch(tenB, /hút bụi|hut bui/i, `tenHang KHÔNG được gộp mô tả món A, hiện: "${tenB}"`);
  assert.doesNotMatch(tenB, /khách nói thêm/, `món B không phải "nói thêm" của món A, hiện: "${tenB}"`);
  // …và kết quả trả khách là của chính lượt món B (nhánh chuyên gia), không phải mã món A.
  assert.match(plain(b.replies[0].text), /chuyên gia/);
  assert.doesNotMatch(plain(b.replies[0].text), /8508|Mã đề xuất/);
  assert.doesNotMatch(String(store.hoSo?.moTa || ''), /hút bụi/i, 'hồ sơ phiên phải đã chuyển sang món B');
});

test('OZV-2333: câu hỏi THEO món cũ có chữ "mã hs" KHÔNG bị tách oan thành hồ sơ mới (giữ an toàn [S16])', async () => {
  const { ctx, store, calls } = fakeCtx();
  await hs.handle(turn('Tra giúp em mã HS máy hút bụi dùng trong nhà công suất 1200W'), ctx);
  // Câu hỏi thuế theo mã món cũ — có "mã hs" nhưng là câu HỎI THEO món cũ, không phải mô tả món mới.
  const r = await hs.handle(turn('thuế nhập khẩu của mã hs này bao nhiêu phần trăm'), ctx);
  const soLuotPhanLoai = calls.filter((c) => c.name === 'phan_loai_hs').length;
  assert.equal(soLuotPhanLoai, 1, 'KHÔNG mở lượt phân loại mới trên câu hỏi theo món cũ');
  assert.match(String(store.hoSo?.moTa || ''), /hút bụi/i, 'hồ sơ món cũ không bị xoá oan');
  assert.ok(plain(r.replies[0].text).length > 0);
});

test('OZV-2433 nhóm 1: tin tra mã HS món mới có "ạ/ơi/nhé", từ hàng hoá ("đo/độ/dây/chứa/rời") hoặc "là bao nhiêu" mở được hồ sơ mới sau handoff', async () => {
  const cacCauMonMoi = [
    { cau: 'Tra giúp em mã HS máy nén khí 8 bar mới 100% ạ', khop: /nén khí|nen khi/i },
    { cau: 'Tra giúp em mã HS máy đo nhiệt độ hồng ngoại cầm tay', khop: /đo nhiệt độ|do nhiet do/i },
    { cau: 'Tra giúp em mã HS dây cáp điện bọc nhựa PVC 4x16mm2', khop: /dây cáp điện|day cap dien/i },
    { cau: 'Tra giúp em mã HS bình chứa khí nén bằng thép 500 lít', khop: /bình chứa khí nén|binh chua khi nen/i },
    { cau: 'Tra giúp em mã HS linh kiện rời bằng nhựa cho quạt công nghiệp nhé', khop: /linh kiện rời|linh kien roi/i },
    { cau: 'Tra giúp em mã HS máy nén khí trục vít công suất 15kW là bao nhiêu', khop: /nén khí trục vít|nen khi truc vit/i },
  ];

  for (const { cau, khop } of cacCauMonMoi) {
    const { ctx, store, calls } = fakeCtx();
    await hs.handle(turn('Tra giúp em mã HS máy hút bụi dùng trong nhà công suất 1200W'), ctx);
    assert.equal(calls.length, 1);

    await hs.handle(turn(cau), ctx);
    assert.equal(calls.length, 2, `phải mở lượt tra mới cho câu: "${cau}"`);
    const tenB = String(calls[1].args.tenHang || '');
    assert.match(tenB, khop, `tenHang gửi Cổng phải mang mô tả món B cho "${cau}", hiện: "${tenB}"`);
    assert.doesNotMatch(tenB, /hút bụi|hut bui/i, `tenHang KHÔNG được gộp mô tả món A cho "${cau}", hiện: "${tenB}"`);
    assert.doesNotMatch(tenB, /khách nói thêm/, `món B không phải "nói thêm" của món A cho "${cau}", hiện: "${tenB}"`);
    assert.doesNotMatch(String(store.hoSo?.moTa || ''), /hút bụi/i, `hồ sơ phiên phải đã chuyển sang món B cho "${cau}"`);
  }
});

test('OZV-2433 nhóm 2: câu hỏi thủ tục/giấy phép/thuế hoặc hỏi lại theo mã HS vừa tra KHÔNG bị tách oan thành hồ sơ mới', async () => {
  const cacCauHoiTheoMaCu = [
    { cau: 'thủ tục nhập khẩu của mã hs vừa tra cần giấy phép chuyên ngành gì', goiPhanLoaiMoi: false },
    { cau: 'mã hs này đúng chưa ạ', goiPhanLoaiMoi: true },
    { cau: 'thuế nhập khẩu của mã hs này bao nhiêu phần trăm', goiPhanLoaiMoi: false },
  ];

  for (const { cau, goiPhanLoaiMoi } of cacCauHoiTheoMaCu) {
    const { ctx, store, calls } = fakeCtx();
    await hs.handle(turn('Tra giúp em mã HS máy hút bụi dùng trong nhà công suất 1200W'), ctx);
    assert.equal(calls.filter((c) => c.name === 'phan_loai_hs').length, 1);

    const r = await hs.handle(turn(cau), ctx);
    const luotPhanLoai = calls.filter((c) => c.name === 'phan_loai_hs');
    if (!goiPhanLoaiMoi) {
      assert.equal(luotPhanLoai.length, 1, `KHÔNG gọi phan_loai_hs trên câu hỏi thuế/thủ tục theo mã cũ: "${cau}"`);
    }
    for (const c of luotPhanLoai) {
      assert.match(String(c.args.tenHang || ''), /hút bụi|hut bui/i,
        `phan_loai_hs KHÔNG được nhận câu hỏi "${cau}" làm tên hàng mới, hiện: "${c.args.tenHang}"`);
    }
    assert.match(String(store.hoSo?.moTa || ''), /hút bụi/i, `hồ sơ món cũ không bị xoá oan bởi câu: "${cau}"`);
    assert.ok(plain(r.replies[0].text).length > 0);
  }
});

