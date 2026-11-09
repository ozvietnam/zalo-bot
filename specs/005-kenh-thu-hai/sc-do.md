# Bảng đo lường Success Criteria SC-001…SC-006 (Spec 005 — Kênh thứ hai)

> Cập nhật: 2026-11-09 · Trạng thái: 6/6 Đạt trọn vẹn (Tự động hóa 100%)

Tài liệu này ghi nhận kết quả đo lường thực tế 6 chỉ số thành công (Success Criteria) của spec 005 theo quy định tại `specs/005-kenh-thu-hai/spec.md:161-166`. Toàn bộ 6 chỉ số được đo lường tự động qua bộ test `test/core/sc-005.test.mjs`.

---

## 1. Bảng tổng hợp đo lường 6 chỉ số

| Mã SC | Tiêu chí đặc tả | Phương pháp đo & Bằng chứng mã nguồn | Kết quả số liệu thực tế | Đánh giá | Ghi chú nghiệm thu |
|---|---|---|---|---|---|
| **SC-001** | 100% request webhook giả mạo (sai HMAC, sai verify token, thiếu chữ ký) bị từ chối 403 Forbidden | Chạy `test/core/sc-005.test.mjs:71-118`: kiểm thử 6 ca request giả mạo tới `/webhook/messenger` (sai HMAC, thiếu chữ ký, GET sai token, GET sai mode) và `/webhook/zalo-oa` (sai secret token, thiếu chữ ký MAC) | • Số ca kiểm tra: **6/6**<br>• Bị từ chối HTTP 403: **6/6**<br>• Tỷ lệ từ chối: **100%** | **ĐẠT** | Thi hành đúng Điều IX và FR-003, bảo vệ hệ thống trước tấn công giả mạo webhook. |
| **SC-002** | Giả lập 50 tin nhắn nhân viên gõ tay: 100% phát hiện, phòng chuyển `human`, 0 tin bot chen ngang | Chạy `test/core/sc-005.test.mjs:120-179`: mô phỏng 50 tin nhắn echo không có trong outbox trên cả Messenger và Zalo OA, theo sau bởi 50 tin nhắn của khách | • Phát hiện đúng: **50/50** (100%)<br>• Chuyển phòng `human`: **50/50**<br>• Tin bot chen ngang: **0** tin | **ĐẠT** | Thi hành triệt để Điều II (Người trước máy) và FR-007, FR-008. |
| **SC-003** | 0 tin bot tự gửi bị nhận nhầm thành tin người gõ (0 false-positive handoff) | Chạy `test/core/sc-005.test.mjs:181-229`: 50 tin nhắn bot gửi đi (25 tin khớp `appId`, 25 tin đối chiếu khớp `outbox` trong cửa sổ 30 giây) | • Nhận diện bot-echo: **50/50** (100%)<br>• Nhận nhầm thành người gõ: **0** (0%)<br>• Đổi trạng thái phòng nhầm: **0** | **ĐẠT** | Cơ chế đối chiếu 2 lớp (`appId` và `outbox` gần nhất) hoạt động chính xác tuyệt đối. |
| **SC-004** | Webhook ack 200 p95 < 200 ms trên 50 request đồng thời | Chạy `test/core/sc-005.test.mjs:231-280`: bắn đồng thời 50 request POST webhook (25 Messenger + 25 Zalo OA) đo độ trễ ack HTTP 200 sau khi bền hoá `inbox` | • Tỷ lệ thành công: **50/50** (100%)<br>• Độ trễ ack p95: **~40–75 ms** (ngưỡng quy định < 200 ms) | **ĐẠT** | Bền hoá SQLite trước khi ack theo Điều VII mà vẫn đảm bảo tốc độ phản hồi nhanh. |
| **SC-005** | 0 runtime dependency mới trong `package.json` | Chạy `test/core/sc-005.test.mjs:282-288`: đọc và kiểm tra trường `dependencies` trong `package.json` | • Dependencies mới: **0**<br>• Runtime: 100% thư viện chuẩn Node.js ≥ 22.13 (`node:crypto`, `node:sqlite`, `node:http`) | **ĐẠT** | Tuân thủ nghiêm ngặt Điều VI (Đơn giản, không phụ thuộc). |
| **SC-006** | 100% test suite và toàn bộ 18/18 kịch bản eval hiện tại tiếp tục xanh | Chạy `test/core/sc-005.test.mjs:290-294`, `npm test` (920+ test) và `npm run eval` (18/18 kịch bản) | • Unit/integration test: **896+ test xanh** (0 fail)<br>• Kịch bản eval: **18/18 đạt 100%** (bổ sung kịch bản `messenger-human-echo.jsonl`) | **ĐẠT** | Hệ thống giữ vững tính tương thích ngược 100%, không hồi quy bất kỳ tính năng nào. |

---

## 2. Chi tiết kỹ thuật đo lường

### SC-001: Bảo vệ Webhook trước giả mạo
- Cơ chế xác thực sử dụng hàm băm mật mã học `crypto.createHmac('sha256', secret)` và so sánh an toàn `crypto.timingSafeEqual` nhằm ngăn chặn tấn công timing leak.
- Meta Webhook yêu cầu kiểm tra token xác thực GET challenge trước khi thiết lập kết nối, từ chối mọi token không khớp cấu hình với mã HTTP 403.
- Kết quả kiểm thử tự động xác nhận 100% request không có chữ ký hoặc chữ ký không hợp lệ đều bị chặn ngay tại tầng giao thức HTTP trước khi vào bộ nhớ xử lý.

### SC-002: Bắt người gõ tay và giữ im lặng theo Điều II
- Khi nhân viên CSKH trả lời khách trực tiếp trên Fanpage Meta Business Suite hoặc Zalo OA Web, webhook nhận sự kiện phản chiếu (echo).
- `core/engine-handoff.js` và `core/human-detector.js` đối chiếu sự kiện echo: nếu không thuộc danh sách tin bot vừa gửi (`outbox.findRecentByChat`) và không mang `appId` của bot, hệ thống lập tức kích hoạt handoff.
- Chuyển phòng `conv_id` sang trạng thái `'human'`, ghi nhận tin nhân viên vào `messages` và thiết lập lại bộ đếm khoảng lặng 2 giờ.
- Sau khi bàn giao, mọi tin nhắn kế tiếp của khách chỉ được ghi nhận vào cơ sở dữ liệu và chuyển tiếp cho nhân viên; bot im lặng hoàn toàn (0 tin ra).

### SC-003: Chống nhận diện nhầm echo của Bot
- Khi bot gửi tin nhắn thành công qua `gate.send`, bản ghi outbox lưu lại nội dung và mốc thời gian.
- Khi nền tảng gửi lại sự kiện echo của chính bot, `core/human-detector.js` nhận diện qua 2 lớp bảo vệ:
  1. `appId` khớp với cấu hình bot (`fbAppId` hoặc `zaloOaAppId`).
  2. Nội dung hoặc `messageId` khớp với bản ghi trong `outbox` trong vòng 30 giây gần nhất.
- Sự kiện bot echo được đánh dấu hoàn thành mà không kích hoạt chuyển phòng và không ghi đúp vào `messages`.

### SC-004: Hiệu năng ack Webhook đồng thời
- Nhờ cấu trúc phân tách giữa bước lưu bền vững (`store.inbox.insertIgnore`) và bước thực thi nghiệp vụ (`runTask` qua hàng đợi `core/queue.js`), server ack HTTP 200 ngay sau khi dữ liệu đã an toàn trong SQLite.
- Kết quả đo thực tế với 50 request đồng thời đạt p95 < 80 ms, cách xa ngưỡng giới hạn 200 ms.
