// packs/hs/test/ho-so-ket-luan-cau-hoi.test.mjs — Đọc hoSo.ketLuan.cauHoi và trường .vi từ động cơ hồ sơ HS_HO_SO (OZV-868, issue #177 mục 6).
// Đối chiếu hợp đồng: hs-code-api (lib/ho-so/api.js:256-274,548) và fixture ozplugin (apps/gateway/test/fixtures/hs/describe-ho-so-ban-nhap.json:222-234,603-615).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import hs from '../index.js';
import { renderPhanLoaiDayDu, renderClassify, renderResult } from '../render.js';
import { plain } from '../style.js';

const ALL = ['phan_loai_hs', 'ket_qua_phan_loai', 'tra_thue', 'tra_thu_tuc_nhap_khau', 'tim_ma_hs', 'sinh_mo_ta_khai_bao',
  'soat_to_khai', 'kiem_ma_to_khai', 'ket_qua_soat', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'tra_tien_le', 'kiem_tra_shtt',
  'soan_ho_so_giai_trinh', 'kiem_tra_shtt_anh', 'bo_sung_du_kien'];
const ML = '11111111-2222-4333-8444-555555555555';

const CAU_HOI_HO_SO = {
  fact: 'luuLuong',
  nhanVi: 'lưu lượng',
  vi: 'Lưu lượng tối đa của bơm/quạt là bao nhiêu m³/h?',
  zh: '最大流量是多少立方米/小时（m³/h）？',
  vaoRanhGioi: ['84135040'],
};

function fakeCtx(overrides = {}) {
  const script = Object.fromEntries(ALL.map((n) => [n, () => ({ ok: true, data: { ketQua: `ok ${n}` } })]));
  for (const [k, v] of Object.entries(overrides)) script[k] = typeof v === 'function' ? v : () => v;
  const store = {};
  const ctx = {
    mcp: fakeMcp(script), tools: new Set(ALL), vision: null, customer: null, history: () => [],
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-14T03:00:00Z'), log: { info() {}, error() {}, warn() {} },
  };
  return { ctx, store, calls: ctx.mcp.calls };
}

const turn = (text) => ({
  turnId: 't-868', chatId: 'u1', userId: 'u1', userName: 'Khách', isGroup: false, text,
  photoUrl: null, caption: null, receivedAt: '2026-11-14T03:00:00.000Z', isStaff: false,
});

test('renderPhanLoaiDayDu: đọc moTaBanNhap và cauHoi[].vi (dự phòng nhanVi) khi moTa là bản nháp HS_HO_SO', () => {
  const out = plain(renderPhanLoaiDayDu({
    tenHang: 'Bơm nước kiểu piston',
    maHs: '84135040',
    phanLoai: { ok: true, data: { maDeXuat: '84135040', lyDo: 'Bơm piston' } },
    moTa: {
      ok: true,
      data: {
        banNhap: true,
        moTaBanNhap: 'Bơm nước kiểu piston, [cần: lưu lượng], mới 100%',
        cauHoi: [
          CAU_HOI_HO_SO,
          { fact: 'congSuat', nhanVi: 'công suất' },
        ],
      },
    },
  }));
  assert.match(out, /📝 Mô tả khai báo gợi ý/);
  assert.match(out, /Bơm nước kiểu piston, \[cần: lưu lượng\], mới 100%/);
  assert.match(out, /\(Bản nháp — hồ sơ chưa đủ căn cứ, chưa dùng để khai\)/);
  assert.match(out, /Cần bổ sung: Lưu lượng tối đa của bơm\/quạt là bao nhiêu m³\/h\?; công suất/);
});

test('renderClassify: nhận diện hoSo.ketLuan.trangThai === "THIEU_DU_KIEN" và in câu hỏi .vi', () => {
  const r = {
    ok: true,
    trangThai: 'XONG',
    data: {
      ketQua: {
        results: [{ hsCode: '84135040', confidence: 0.72, reason: 'Bơm nước kiểu piston' }],
      },
      hoSo: {
        ketLuan: {
          trangThai: 'THIEU_DU_KIEN',
          cauHoi: [CAU_HOI_HO_SO],
          chuaChot: [],
        },
      },
    },
  };
  const out = plain(renderClassify(r, { title: '🔎 Phân loại: "Bơm nước kiểu piston"' }));
  assert.match(out, /Mã có thể \(chưa chốt, cần thêm thông tin\):/);
  assert.doesNotMatch(out, /✅ Mã đề xuất:/);
  assert.match(out, /❓ Cần bạn cho biết thêm:/);
  assert.match(out, /1\. Lưu lượng tối đa của bơm\/quạt là bao nhiêu m³\/h\?/);
  assert.doesNotMatch(out, /[\u3400-\u9fff]/);
});

test('renderResult: itemLine đọc trường .vi trong mảng cauHoi của Gói 3 thay vì in Fact/Nhan Vi', () => {
  const r = {
    ok: true,
    data: {
      moTaBanNhap: 'Bơm nước kiểu piston, [cần: lưu lượng], mới 100%',
      cauHoi: [CAU_HOI_HO_SO],
    },
  };
  const out = plain(renderResult(r, { title: '📝 Mô tả khai báo — 8413.50.40' }));
  assert.match(out, /• Lưu lượng tối đa của bơm\/quạt là bao nhiêu m³\/h\?/);
  assert.doesNotMatch(out, /Fact: luuLuong/i);
});

test('Gói 1 (hs.handle + onJobResult): hoSo.ketLuan.trangThai === "THIEU_DU_KIEN" kèm cauHoi → hỏi khách và mở session.choBoSung', async () => {
  const phanHoiHoSo = {
    ok: true,
    trangThai: 'XONG',
    maLuot: ML,
    data: {
      maDeXuat: '84135040',
      results: [{ hsCode: '84135040', confidence: 0.72, reason: 'Bơm nước kiểu piston' }],
      hoSo: {
        ketLuan: {
          trangThai: 'THIEU_DU_KIEN',
          cauHoi: [CAU_HOI_HO_SO],
        },
      },
    },
  };
  const { ctx, store, calls } = fakeCtx({ phan_loai_hs: phanHoiHoSo });
  await hs.handle(turn('1'), ctx);
  const res = await hs.handle(turn('Tên hàng: Bơm nước kiểu piston\nChất liệu: gang\nThông số: công suất 1.5kW, điện áp 220V'), ctx);
  const s = plain(res.replies[0].text);

  assert.match(s, /Mã có thể \(chưa chốt, cần thêm thông tin\):/);
  assert.match(s, /❓ Cần bạn cho biết thêm:/);
  assert.match(s, /1\. Lưu lượng tối đa của bơm\/quạt là bao nhiêu m³\/h\?/);
  assert.match(s, /Trả lời các câu trên trong MỘT tin/);
  assert.deepEqual(store.choBoSung, { maLuot: ML, tenHang: 'Bơm nước kiểu piston' });
  assert.equal(calls.some((c) => c.name === 'sinh_mo_ta_khai_bao'), false, 'chưa chốt mã thì không tự gọi gói 3 sinh_mo_ta_khai_bao');
});

test('Gói 1 (hs.onJobResult): ket_qua_phan_loai trả hoSo.ketLuan.trangThai === "THIEU_DU_KIEN" kèm cauHoi → hỏi khách và mở session.choBoSung', async () => {
  const { ctx, store } = fakeCtx({ phan_loai_hs: { ok: true, maLuot: ML, trangThai: 'DANG_XU_LY' } });
  await hs.handle(turn('1'), ctx);
  const { jobs: [job] } = await hs.handle(turn('Tên hàng: Bơm nước kiểu piston\nChất liệu: gang\nThông số: công suất 1.5kW, điện áp 220V'), ctx);
  const res = await hs.onJobResult(job, {
    ok: true,
    trangThai: 'XONG',
    data: {
      maDeXuat: '84135040',
      results: [{ hsCode: '84135040', confidence: 0.72, reason: 'Bơm nước kiểu piston' }],
      hoSo: {
        ketLuan: {
          trangThai: 'THIEU_DU_KIEN',
          cauHoi: [CAU_HOI_HO_SO],
        },
      },
    },
  }, ctx);
  const s = plain(res.replies[0].text);
  assert.match(s, /Mã có thể \(chưa chốt, cần thêm thông tin\):/);
  assert.match(s, /1\. Lưu lượng tối đa của bơm\/quạt là bao nhiêu m³\/h\?/);
  assert.deepEqual(store.choBoSung, { maLuot: ML, tenHang: 'Bơm nước kiểu piston' });
});
