// Kịch bản KB4 (issue #136 mục C, mở lại ở #168): khách hỏi "văn bản này còn hiệu lực không".
// Câu trả lời PHẢI nói tình trạng hiệu lực. Bỏ `tinhTrang`/`biBaiBoBoi` thì một văn bản ĐÃ BỊ BÃI BỎ
// hiện ra như bình thường — khách dùng nó làm căn cứ khai báo là sai luật (UX-02, Hiến pháp VIII).
// Dữ liệu mẫu đúng hình dạng `tra_hieu_luc_van_ban` thật (đo 10/11/2026: registry.registryVersion,
// items[].tinhTrang / hetHieuLucTu / biBaiBoBoi / hieuLucDaDoiChieu / xacMinh).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderResult } from '../render.js';
import { plain } from '../style.js';

const KET_QUA = {
  ok: true,
  data: {
    registry: { registryVersion: '2026-11-09', total: 2436 },
    items: [
      { soHieu: '08/2023/TT-BCT', ten: 'Quy định dán nhãn năng lượng', tinhTrang: 'HET_HIEU_LUC_MOT_PHAN',
        hetHieuLucTu: '2026-06-01', biBaiBoBoi: ['48/2026/TT-BCT'], hieuLucDaDoiChieu: true, xacMinh: 'NGUON_A' },
      { soHieu: '36/2026/TT-BKHCN', ten: 'Danh mục sản phẩm, hàng hoá phải chứng nhận hợp quy',
        tinhTrang: 'CON_HIEU_LUC', hieuLucDaDoiChieu: true, xacMinh: 'NGUON_A' },
    ],
  },
};

test('hiệu lực văn bản: mỗi văn bản phải kèm tình trạng; văn bản đã bãi bỏ phải nêu văn bản bãi bỏ nó', () => {
  const s = plain(renderResult(KET_QUA, { title: '📜 Hiệu lực văn bản' }));
  assert.match(s, /08\/2023\/TT-BCT/);
  assert.match(s, /hết hiệu lực một phần/, 'phải nói rõ văn bản hết hiệu lực một phần');
  assert.match(s, /b[aã]i b[oỏ] b[oở]i 48\/2026\/TT-BCT/i, 'phải nêu văn bản đã bãi bỏ nó');
  assert.match(s, /36\/2026\/TT-BKHCN[^\n]*còn hiệu lực/, 'văn bản còn hiệu lực cũng phải nói rõ');
});

test('hiệu lực văn bản: Cổng chưa đối chiếu bản gốc thì phải nói chưa đối chiếu, không hiện như đã kiểm', () => {
  const r = { ok: true, data: { items: [
    { soHieu: '2711/QĐ-BKHCN', ten: 'Quyết định công bố tiêu chuẩn', tinhTrang: 'CHUA_XAC_MINH', hieuLucDaDoiChieu: false },
  ] } };
  const s = plain(renderResult(r, { title: '📜 Hiệu lực văn bản' }));
  assert.match(s, /2711\/QĐ-BKHCN/);
  assert.match(s, /chưa đối chiếu/, 'chưa đối chiếu hiệu lực phải nói ra');
});
