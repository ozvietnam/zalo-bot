// packs/hs/test/can-cu.test.mjs — căn cứ pháp lý + máy kiểm chống bịa số hiệu (issue #168, phần 2).
// Đặc tả: issue #136, bình luận "Bộ kịch bản trả lời" mục B (luật trích) và E (lệch canCu/canCuChiTiet).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import hs from '../index.js';
import { soHieuTrong, soHieuLa, chanBia, canCuThue, canCuChinhSach, canCuTienLe, dongCanCuNgan, KHONG_CO_CAN_CU } from '../can-cu.js';
import { renderPhanLoaiGiongQuyen } from '../giong-quyen.js';
import { plain } from '../style.js';
import { fakeMcp } from '../../../test/helpers/fakes.mjs';
import { THUE_85094000 as THUE, THU_TUC_85094000 as THU_TUC } from './cong-that-85094000.mjs';

const PHAN_LOAI = { ok: true, data: { maHs: '85094000', ketQua: { results: [{ hsCode: '85094000', nameVi: 'Máy xay, ép trái cây gia dụng' }] } } };
const soTrong = (s) => [...new Set(soHieuTrong(s).map((x) => x.khoa))];

function fakeCtx(script = {}, { brain = null } = {}) {
  const store = {};
  const tools = new Set(['tra_thue', 'tra_thu_tuc_nhap_khau', 'phan_loai_hs', 'ket_qua_phan_loai', 'tra_tien_le', 'tra_hieu_luc_van_ban', 'tra_chu_giai', 'sinh_mo_ta_khai_bao']);
  const ctx = {
    mcp: fakeMcp(Object.fromEntries(Object.entries(script).map(([k, v]) => [k, typeof v === 'function' ? v : () => structuredClone(v)]))),
    tools, brain, vision: null, customer: null, history: () => [],
    session: { get: () => structuredClone(store), set: (p) => Object.assign(store, structuredClone(p)) },
    now: () => new Date('2026-11-04T03:00:00Z'), log: { info() {}, error() {} },
  };
  return { ctx, store };
}
const turn = (text) => ({ turnId: 't', chatId: 'u1', userId: 'u1', userName: 'Tuấn', isGroup: false, text, photoUrl: null, caption: null, receivedAt: '2026-11-04T03:00:00.000Z', isStaff: false });

test('soHieuTrong: nhận đủ dạng số hiệu, KHÔNG nhầm ngày, phân số, mã HS, "1/4 vòng"', () => {
  assert.deepEqual(soTrong('NĐ 26/2023/NĐ-CP, 36/2026/TT-BKHCN, 05/2007/QH12, 15/2023/QĐ-TTg'), ['26/2023/NĐ-CP', '36/2026/TT-BKHCN', '5/2007/QH12', '15/2023/QĐ-TTG']);
  assert.deepEqual(soTrong('tiền lệ CV 5676/TCHQ-TXNK và 1810/TB-TCHQ, 2711/QĐ-BKHCN 2022'), ['5676/TCHQ-TXNK', '1810/TB-TCHQ', '2711/QĐ-BKHCN']);
  assert.deepEqual(soTrong('theo Thông tư số 38/2015 và NĐ 26/2023'), ['38/2015', '26/2023']);
  assert.deepEqual(soTrong('VAT 8/10 tới hết 31/12/2026, mã 8509.40.00, chốt xoay 1/4 vòng, 24/7, 350W/220V'), []);
});

test('soHieuLa: số hiệu phải có trong dữ liệu Cổng; viết tắt "NĐ 26/2023" khớp "26/2023/NĐ-CP"', () => {
  assert.deepEqual(soHieuLa('Thuế NK 25% (26/2023/NĐ-CP), NĐ 118/2022', THUE), []);
  assert.deepEqual(soHieuLa('theo TT 38/2015/TT-BTC và CV 5676/TCHQ-TXNK', THUE), ['38/2015/TT-BTC', '5676/TCHQ-TXNK']);
  // Cùng số/năm nhưng KHÁC loại văn bản → vẫn là bịa
  assert.deepEqual(soHieuLa('(26/2023/QĐ-TTg)', THUE), ['26/2023/QĐ-TTg']);
});

test('chanBia: bỏ đúng dòng có số lạ, giữ nguyên phần còn lại', () => {
  const r = chanBia('Dạ mã 8509.40.00 ạ.\nTheo Thông tư 38/2015/TT-BTC thì phải khai đủ.\nAnh/chị cần gì thêm ạ?', [THUE]);
  assert.deepEqual(r.la, ['38/2015/TT-BTC']);
  assert.equal(r.text, 'Dạ mã 8509.40.00 ạ.\nAnh/chị cần gì thêm ạ?');
  assert.equal(chanBia('Thuế NK 25% (26/2023/NĐ-CP)', [THUE]).text, 'Thuế NK 25% (26/2023/NĐ-CP)');
  // Mẫu nhập liệu tĩnh được miễn ĐÚNG CHỖ; cùng số đó ở câu khác vẫn bị chặn
  const mau = 'Số hiệu văn bản: 57/2022/NĐ-CP → kiểm hiệu lực';
  assert.deepEqual(chanBia(`Gửi theo mẫu:\n${mau}`, [], { mau: [mau] }).la, []);
  assert.deepEqual(chanBia(`${mau}\nTheo 57/2022/NĐ-CP thì được miễn.`, [], { mau: [mau] }).text, mau);
});

test('canCuThue (dữ liệu Cổng thật): ưu tiên canCuChiTiet, KHÔNG dùng canCu cũ lệch (mục E); VAT giảm có hạn', () => {
  const c = canCuThue(THUE);
  assert.equal(c.mfn.so, '26/2023/NĐ-CP');
  assert.equal(c.mfn.hieuLuc, '15/07/2023');
  assert.equal(c.fta.so, '118/2022/NĐ-CP');
  assert.equal(c.vat.so, '174/2025/NĐ-CP');
  assert.match(c.vat.viec, /tới hết 31\/12\/2026/);
  assert.equal(c.canDoiChieu, true);
  // Cổng thiếu canCuChiTiet → mới dùng canCu (cũ), và chỉ lấy số hiệu, không lấy chữ khác
  const cu = structuredClone(THUE); delete cu.data.canCuChiTiet;
  assert.equal(canCuThue(cu).mfn.so, '26/2025/NĐ-CP');
  assert.equal(canCuThue(cu).fta, null);   // "Hiệp định ACFTA" không có số hiệu → không bịa
  assert.equal(canCuThue({ ok: false, loi: 'X' }), null);
});

test('canCuChinhSach: chỉ văn bản CÒN hiệu lực làm căn cứ chính; hết hiệu lực một phần / chưa xác minh thì không', () => {
  const ds = canCuChinhSach(THUE, THU_TUC);
  const theo = (so) => ds.find((c) => c.so === so);
  assert.equal(theo('36/2026/TT-BKHCN').dung, true);
  assert.equal(theo('36/2026/TT-BKHCN').chuaDoiChieu, true);
  assert.equal(theo('08/2023/TT-BCT').dung, false);
  assert.equal(theo('2711/QĐ-BKHCN').dung, false);
  assert.ok(ds.every((c) => c.cu === true), 'Cổng báo OUTDATED_BASIS');
});

test('KB1 giọng Quyên (dữ liệu Cổng thật): mỗi ý một căn cứ, tối đa 3 văn bản, FTA kèm điều kiện C/O, không số lạ', () => {
  const s = plain(renderPhanLoaiGiongQuyen({ tenHang: 'máy xay sinh tố gia dụng 350W', maHs: '85094000', phanLoai: PHAN_LOAI, thue: THUE, thuTuc: THU_TUC }));
  assert.ok(s.split('\n').length <= 7, s);
  assert.match(s, /Thuế NK 25% \(26\/2023\/NĐ-CP\)/);
  assert.match(s, /C\/O mẫu E hợp lệ, đạt quy tắc xuất xứ thì còn 5% \(118\/2022\/NĐ-CP\)/);
  assert.match(s, /công bố hợp quy.*\(36\/2026\/TT-BKHCN, chưa đối chiếu bản gốc\)/);
  assert.match(s, /VAT 8% tới hết 31\/12\/2026/);
  assert.match(s, /biểu thuế cần đối chiếu lại/);
  const so = soTrong(s);
  assert.equal(so.length, 3, `tin đầu tối đa 3 căn cứ: ${so}`);
  assert.doesNotMatch(s, /26\/2025|08\/2023|2711\//, 'không dùng canCu lệch, văn bản hết hiệu lực, chưa xác minh');
  assert.deepEqual(soHieuLa(s, THUE, THU_TUC), []);
  assert.doesNotMatch(s, /\banh nhé|Anh muốn/, 'chưa biết xưng hô thì gọi anh/chị');
});

test('Cổng không trả căn cứ: KHÔNG nêu số văn bản nào (không bịa từ trí nhớ)', () => {
  const t = structuredClone(THUE);
  for (const k of ['canCuChiTiet', 'canCu', 'vatReduction', 'policyLines', 'hsListings', 'legalBasisRegistry']) delete t.data[k];
  const s = plain(renderPhanLoaiGiongQuyen({ tenHang: 'máy xay sinh tố', maHs: '85094000', phanLoai: PHAN_LOAI, thue: t, thuTuc: null }));
  assert.deepEqual(soTrong(s), []);
  assert.match(s, /Thuế NK 25%/);
  assert.equal(dongCanCuNgan({ thue: canCuThue(t), chinhSach: [] }), '');
});

test('KB2 gói 2 (mã 8 số): dòng "📚 Căn cứ" ≤ 3 văn bản từ Cổng; gõ "căn cứ" → đủ danh sách kèm tình trạng + nguồn', async () => {
  const { ctx } = fakeCtx({ tra_thue: THUE, tra_thu_tuc_nhap_khau: THU_TUC });
  const s = plain((await hs.handle(turn('85094000'), ctx)).replies[0].text);
  const dong = s.split('\n').find((l) => l.startsWith('📚 Căn cứ:'));
  assert.ok(dong, s);
  assert.equal(soTrong(dong).length, 3);
  assert.match(dong, /26\/2023\/NĐ-CP \(thuế NK ưu đãi\)/);
  assert.deepEqual(soHieuLa(s, THUE, THU_TUC), []);

  const d = plain((await hs.handle(turn('căn cứ'), ctx)).replies[0].text);
  assert.match(d, /cho mã 8509\.40\.00/);
  assert.match(d, /36\/2026\/TT-BKHCN.*còn hiệu lực/);
  assert.match(d, /nguồn: https:\/\/github\.com\/ozvietnam\/oz-wiki-plhq\/blob\/main\/registry\/van-ban\/36-2026-tt-bkhcn\.yaml/);
  assert.match(d, /08\/2023\/TT-BCT.*hết hiệu lực một phần — không làm căn cứ chính/);
  assert.match(d, /2711\/QĐ-BKHCN.*chưa xác minh hiệu lực — không làm căn cứ chính/);
  assert.match(d, /118\/2022\/NĐ-CP — ACFTA, cần C\/O mẫu E hợp lệ, hiệu lực từ 30\/12\/2022/);
  assert.deepEqual(soHieuLa(d, THUE, THU_TUC), []);
});

test('gõ "căn cứ" khi chưa có lượt nào: nói thẳng Cổng chưa có căn cứ, mời chuyên viên, không số hiệu', async () => {
  const { ctx } = fakeCtx({});
  const s = plain((await hs.handle(turn('căn cứ pháp lý'), ctx)).replies[0].text);
  assert.equal(s, KHONG_CO_CAN_CU);
  assert.deepEqual(soTrong(s), []);
});

test('chốt chặn bịa: não AI tự viết số văn bản không có trong Cổng → dòng đó bị bỏ trước khi gửi', async () => {
  const brain = { async hieu() { return { kind: 'khac', cauDan: 'Dạ em chào anh/chị.\nTheo Thông tư 38/2015/TT-BTC thì hàng nào cũng phải khai mô tả đầy đủ ạ.' }; } };
  const { ctx } = fakeCtx({}, { brain });
  const s = plain((await hs.handle(turn('cho em hỏi chút về thủ tục'), ctx)).replies[0].text);
  assert.match(s, /Dạ em chào anh\/chị\./);
  assert.doesNotMatch(s, /38\/2015/);
});

test('số hiệu khách tự gõ thì bot được nhắc lại (không coi là bịa)', async () => {
  const { ctx } = fakeCtx({ tra_hieu_luc_van_ban: { ok: true, data: { results: [{ soHieu: '38/2015/TT-BTC', tinhTrang: 'HET_HIEU_LUC_MOT_PHAN' }] } } });
  const s = plain((await hs.handle(turn('kiểm hiệu lực 38/2015/TT-BTC'), ctx)).replies[0].text);
  assert.match(s, /38\/2015\/TT-BTC/);
});

test('canCuTienLe: số TB-TCHQ lấy đúng từ tra_tien_le', () => {
  const r = canCuTienLe({ ok: true, data: { items: [{ tbTchqNumber: '3516/TB-TCHQ', year: 2023 }, { productName: 'không số' }] } });
  assert.deepEqual(r.map((x) => [x.so, x.nam]), [['3516/TB-TCHQ', 2023]]);
});
