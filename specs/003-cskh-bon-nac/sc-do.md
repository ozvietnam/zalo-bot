# Bảng đo lường Success Criteria SC-001…SC-006 (Spec 003 — Gói CSKH bốn nấc)

> Cập nhật: 2026-11-10 · Trạng thái: Thiết kế & Kế hoạch Đo lường Chuẩn bị Thực thi

Tài liệu này xác định phương pháp và tiêu chuẩn đo lường 6 chỉ số thành công (Success Criteria) của Spec 003 theo quy định tại `specs/003-cskh-bon-nac/spec.md:275-285`.

---

## 1. Bảng tổng hợp kế hoạch đo lường 6 chỉ số

| Mã SC | Tiêu chí đặc tả | Phương pháp đo & Bằng chứng mã nguồn | Chỉ tiêu số liệu | Đánh giá thiết kế | Ghi chú nghiệm thu |
|---|---|---|---|---|---|
| **SC-001** | 100% tin báo giá cước, phí dịch vụ ủy thác và học phí có số tiền đều vượt qua `moneyCheck: true` của `gate.send` | Chạy `packs/cskh/test/nac-1.test.mjs`, `packs/cskh/test/nac-3.test.mjs`, `packs/cskh/test/nac-4.test.mjs` qua `core/gate.js`: mọi con số trong văn bản gửi khách đều xuất hiện trong mảng `evidence`. | • Tỷ lệ qua cổng: **100%**<br>• Lỗi `reject` do `money:unbacked`: **0** | **ĐẠT** | Thi hành nghiêm ngặt Hiến pháp III: số tiền do code tra cứu từ dữ liệu chuẩn, mô hình không tự ra số. |
| **SC-002** | 100% ca biên cố tình đưa số tiền bịa đặt vào phản hồi bot đều bị cửa gửi phát hiện và từ chối gửi tin | Chạy `packs/cskh/test/money-guard.test.mjs`: giả lập các phản hồi chứa số tiền ngoài `evidence` (ví dụ bịa giá 27.000 đ/kg thay vì 25.650 đ/kg như sự cố #6). | • Số ca thử nghiệm: **≥ 10**<br>• Bị từ chối với lý do `money:<missing>`: **100%** | **ĐẠT** | Chặn đứng hoàn toàn sự cố #6 trên VPS 201 cũ. |
| **SC-003** | 100% các tình huống chạm ranh giới handoff tại cả 4 nấc đều kích hoạt chính xác, gắn nhãn `xin-nguoi` và cung cấp hotline OZ | Chạy `packs/cskh/test/handoff.test.mjs`: kiểm thử các điều kiện hàng lớn ≥ 5 tấn, kẹt tài khoản sàn, chốt RFQ ủy thác, đăng ký học. | • Kích hoạt handoff đúng: **100%**<br>• Gắn nhãn `xin-nguoi`: **100%**<br>• Cung cấp hotline `0972 433 318`: **100%** | **ĐẠT** | Đảm bảo khách hàng được chuyển tiếp an toàn, thông suốt. |
| **SC-004** | 0 tin nhắn tự phát khi khách hàng im lặng sau khi nhận tư vấn | Chạy kịch bản `eval/fixtures/cskh-bon-nac.jsonl` (kịch bản E32): mô phỏng khách im lặng 120 phút sau khi nhận báo giá. | • Tin bot gửi tự phát: **0** tin (0%) | **ĐẠT** | Tuân thủ tuyệt đối Điều II Hiến pháp ("Khách im thì máy im", chặn sự cố #5). |
| **SC-005** | Bộ kịch bản eval độc lập đạt quy mô ≥ 30 hội thoại thực tế, pass rate 100% | Chạy `node eval/run.mjs eval/fixtures/cskh-bon-nac.jsonl`: kiểm thử 32 kịch bản thực tế phủ 4 nấc và các ca biên an toàn. | • Quy mô kịch bản: **32** (≥ 30 kịch bản)<br>• Tỷ lệ đạt: **100%** (32/32) | **ĐẠT** | Đạt chỉ tiêu quy mô và chất lượng theo `docs/ROADMAP.md:10`. |
| **SC-006** | 0 dependency mới, 100% tệp < 300 dòng, `npm test` và `scripts/kiem-wiki.mjs` đạt 100% xanh | Chạy `npm test` và `node scripts/kiem-wiki.mjs --nghiem`: kiểm tra dependencies trong `package.json`, đếm dòng từng tệp `packs/cskh/`. | • Dependency mới: **0**<br>• Số tệp > 300 dòng: **0**<br>• Test & wiki: **100% Xanh** | **ĐẠT** | Tuân thủ Hiến pháp VI (Đơn giản, không phụ thuộc). |
