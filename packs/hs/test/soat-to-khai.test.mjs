// Kịch bản KB6 (issue #136 mục C, mở lại ở #168): khách gửi dòng hàng nhờ soát trước khi khai.
// Giá trị của lượt này nằm ở KẾT LUẬN và CẢNH BÁO từng dòng hàng. Bộ dựng chung đang ăn mất cả hai
// (chỉ còn "• 8509.40.00" + "Điểm: 78") → khách tưởng tờ khai sạch trong khi Cổng đã cảnh báo.
// Dữ liệu mẫu theo hình dạng `soat_to_khai` (dongHang[].ketLuan, dongHang[].canhBao[].messageVi).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderResult } from '../render.js';
import { plain } from '../style.js';

const KET_QUA = {
  ok: true,
  data: {
    dongHang: [{
      stt: 1, maHs: '85094000', ketLuan: 'Mô tả đủ chỉ tiêu 1.78',
      canhBao: [{ level: 'NOTICE', messageVi: 'Chưa nêu nhãn hiệu trong mô tả — Hải quan có thể yêu cầu bổ sung' }],
    }],
    diemTuanThu: { score: 78, level: 'TRUNG_BINH' },
  },
};

test('soát tờ khai: dòng hàng phải nêu kết luận và cảnh báo, không chỉ còn mã HS + điểm', () => {
  const s = plain(renderResult(KET_QUA, { title: '✅ Soát — 8509.40.00' }));
  assert.match(s, /8509\.40\.00/);
  assert.match(s, /Mô tả đủ chỉ tiêu 1\.78/, 'kết luận của dòng hàng phải tới khách');
  assert.match(s, /Chưa nêu nhãn hiệu trong mô tả/, 'cảnh báo của dòng hàng phải tới khách');
});

test('soát tờ khai: nhiều cảnh báo thì nêu đủ, không im lặng bớt', () => {
  const r = { ok: true, data: { dongHang: [{
    stt: 1, maHs: '85094000', ketLuan: 'Cần sửa trước khi khai',
    canhBao: [
      { level: 'BLOCKING', messageVi: 'Mô tả thiếu công suất' },
      { level: 'NOTICE', messageVi: 'Thiếu tình trạng hàng (mới/cũ)' },
    ],
  }] } };
  const s = plain(renderResult(r, { title: '✅ Soát — 8509.40.00' }));
  assert.match(s, /Mô tả thiếu công suất/);
  assert.match(s, /Thiếu tình trạng hàng/);
});
