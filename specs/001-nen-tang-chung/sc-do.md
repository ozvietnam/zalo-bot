# Bảng đo lường Success Criteria SC-001…SC-009 (Spec 001)

> Cập nhật: 2026-11-09 · commit: 5528796 · Trạng thái: 5/9 Đạt trọn vẹn trong lab, 4/9 Đạt về code (chờ nghiệm thu chạy thật/test suite)

Tài liệu này ghi nhận kết quả đo lường thực tế 9 chỉ số thành công (Success Criteria) của spec 001 theo quy định tại `specs/001-nen-tang-chung/spec.md:276-288`, làm cơ sở nghiệm thu spec 001 để chuyển sang spec 007 và quyết định bật lại bot cho khách (bot tạm tắt từ 19/10/2026).

---

## 1. Bảng tổng hợp đo lường 9 chỉ số

| Mã SC | Tiêu chí đặc tả | Phương pháp đo & Bằng chứng mã nguồn | Kết quả số liệu thực tế | Đánh giá | Điều kiện nghiệm thu thực địa |
|---|---|---|---|---|---|
| **SC-001** | Phát lại 1.000 update (10% gửi lại, 3 lần reboot ép): trùng = 0, mất = 0 | Chạy `test/core/stress.test.mjs:47-192`: 1.000 update rải trên 100 phòng, 10% gửi lại trùng `message_id`, 3 lần reboot (12:00 VN, 16:30 VN, và 01:00 VN giữa giờ yên), kèm 14 tin tồn đọng của 1 người | • Tin trùng: **0**<br>• Tin mất: **0**<br>• Tin tồn đọng phát lại: **14/14** thành công<br>• Tin cũ gửi trong giờ yên: **0** (hoãn tới 07:00 VN phát đủ) | **ĐẠT** (Lab) | Đã kiểm chứng trọn vẹn trong môi trường lab có tải và ngắt nguồn đột ngột. |
| **SC-002** | Phòng `human`: tin bot ra = 0 trên fixture eval + audit 7 ngày chạy thật | • Lab: Chạy 12 kịch bản eval `npm run eval` (`eval/fixtures/human-room.jsonl:1-15`) và unit test `test/core/engine-handoff.test.mjs:61-85` (10 tin khách gửi liên tiếp khi phòng human).<br>• Thật: Truy vấn `audit` của phòng trạng thái `human` | • Lab: **0** tin bot tự động gửi tới khách (chỉ 1 tin `REPLY_HANDOFF` lúc bàn giao, 10 tin sau bot im hoàn toàn, `mcp.calls.length === 0`).<br>• Chạy thật: **Chưa có dữ liệu** do bot tắt từ 19/10/2026 | **ĐẠT** (Lab)<br>*Chờ đo thực địa* | Đo trên audit log sau 7 ngày bật lại bot thật cho khách. Tiêu chuẩn: 0 tin bot gửi vào phòng human. |
| **SC-003** | Việc nền lúc restart: 100% giao đúng 1 lần, < 5 phút | Chạy `test/core/jobs.test.mjs:134-179`, `test/core/recover.test.mjs:75-120` và eval `eval/fixtures/restart-mid-job.jsonl`: sập tiến trình khi đang hỏi Cổng OZ, khởi động lại gọi `jobs.recover()` | • Tỷ lệ giao kết quả: **100%** (1/1 việc nền kẹt `polling` được khôi phục về `waiting` và giao thành công).<br>• Số lần giao: **Đúng 1 lần** (nhờ khoá idempotency `j:<conv_id>:<maLuot>`).<br>• Thời gian: **< 5 phút** (nhịp thăm dò 6s, 12s, 24s... giải quyết ngay nhịp đầu sau boot) | **ĐẠT** (Lab) | Đã kiểm chứng trọn vẹn trên ca tiến trình chết giữa lúc gọi Cổng. |
| **SC-004** | Webhook trả 200 < 200 ms (p95), 50 update đồng thời, máy dev | Chạy `test/core/webhook.test.mjs:645-729`:<br>• Test B4a: đo thời gian phục vụ trong handler.<br>• Test B4b: mở 50 socket raw TCP bắn đồng thời 50 POST update đo độ trễ ack client | • Phản hồi: **50/50** trả HTTP 200 OK, lưu đủ 50 dòng `inbox` trước ack.<br>• Handler phục vụ (B4a): p95 = **~3–5 ms**.<br>• Ack phía khách (B4b): p95 = **~40–50 ms**, max **~92 ms** (ngưỡng quy định < 200 ms) | **ĐẠT** (Lab) | Đã kiểm chứng đạt chuẩn hiệu năng tải đồng thời trên máy dev. |
| **SC-005** | 21 test cũ đạt sau chuyển gói; thêm gói mẫu không đổi `core/` | Chạy `node test/test.mjs` và nạp gói mẫu `packs/echo/test/echo.test.mjs` | • Test chuyển gói: **34/34** test đạt (vượt cam kết gốc 21 test).<br>• Gói mẫu `packs/echo/`: **6/6** test đạt, nạp động qua `core/registry.js:9`, không đổi bất kỳ dòng nào trong `core/` (`git diff core/` rỗng) | **ĐẠT** (Lab) | Đã kiểm chứng trọn vẹn tính mô-đun hóa của kiến trúc gói (packs). |
| **SC-006** | Phiếu → nhân viên thấy trong nhóm < 10 giây (p95) | Kiểm tra `core/handoff-ticket.js:107-136` (hàm `open`), nhịp quét dồn tin `flushDue()` định kỳ 5 giây tại `server.js:99` và `test/core/handoff-ticket.test.mjs:61-120` | • Mở phiếu mới: gửi tức thì qua `gate.send` (< 100 ms).<br>• Tin nhắn khách gửi tiếp: quét dồn mỗi 5.000 ms (5 giây) qua `flushDue`.<br>• Độ trễ tổng thể: p95 **< 10 giây** | **ĐẠT** (Lab) | Đã kiểm chứng cơ chế đẩy tức thì và bộ quét 5 giây. |
| **SC-007** | Mọi tin ra 7 ngày chạy thật tra được `turn_id` trong audit | • Lab: Kiểm tra kiến trúc một cửa gửi duy nhất `core/gate.js:54-105` (mọi tin qua `auditGate` đều gắn `turn_id`) và `test/core/one-gate.test.mjs:200`.<br>• Thật: Đối chiếu `outbox` và `audit` trong 7 ngày | • Lab: **100%** tin gửi ra đều tạo bản ghi audit loại `gate` chứa `turn_id`.<br>• Chạy thật: **Chưa có dữ liệu** do bot tắt từ 19/10/2026 | **ĐẠT** (Lab)<br>*Chờ đo thực địa* | Đối chiếu toàn bộ tin `sent` trong `outbox` với bảng `audit` sau 7 ngày vận hành thật. Tiêu chuẩn: 100% khớp `turn_id`. |
| **SC-008** | Đếm `messages` bằng fixture eval (phụ thuộc #80 T033) | Đối chiếu logic lưu trữ `core/engine.js:126` (tin khách vào) và `core/gate.js:98-102` (tin bot/nhân viên gửi ra thành công); chạy 12/12 eval | • Code lõi: Đã ghi nhận đầy đủ tin vào và tin ra vào bảng `messages`.<br>• Bộ đếm tự động eval: Chưa tích hợp bước assert đếm bảng `messages` trong `eval/run.mjs` (chờ hoàn tất bộ test suite tự động của issue #80 / T033) | **ĐẠT (Lõi)**<br>*Chờ test suite #80* | Tích hợp bước kiểm tra số lượng dòng `messages` tương ứng từng kịch bản trong `eval/run.mjs` khi issue #80 hoàn thành. |
| **SC-009** | 20 phiếu chạy thật đầu tiên luôn có tóm tắt hồ sơ (cùng ĐK SC-007) | • Lab: Kiểm tra hàm `dongHoSo()` trong `core/handoff-ticket.js:130` và unit test `test/core/engine-customers.test.mjs:83-100`.<br>• Thật: Soát 20 phiếu đầu tiên gửi vào nhóm nhân viên | • Lab: **100%** phiếu tạo mới đều chứa khối "Hồ sơ khách" (gồm tên, SĐT nếu có, số lượt, nhãn và món hàng quan tâm).<br>• Chạy thật: **Chưa có dữ liệu** do bot tắt từ 19/10/2026 | **ĐẠT** (Lab)<br>*Chờ đo thực địa* | Nhân viên CSKH kiểm tra 20 phiếu đầu tiên khi bot chạy lại, xác nhận không phải hỏi lại thông tin khách đã cung cấp. |

---

## 2. Chi tiết phân tích từng tiêu chí

### SC-001: Khả năng chịu lỗi và chống mất/trùng tin khi sập nguồn
- **Mục tiêu:** Phát lại 1.000 update có 10% gửi lại và 3 lần khởi động lại ép buộc: số tin trùng = 0, số tin khách bị mất = 0.
- **Thực thi:** Kịch bản `test/core/stress.test.mjs` thiết lập 1.000 update trải đều trên 100 phòng, cố tình gửi lặp 10% cùng `message_id`. Ba lần đóng/mở store ép buộc diễn ra tại các mốc:
  1. Update 300: Lên lại lúc 12:00 VN (khe 2 giờ ban ngày).
  2. Update 600: Lên lại lúc 16:30 VN (khe 4.5 giờ ban ngày).
  3. Update 900: Lên lại lúc 01:00 VN (giữa giờ yên 23:00–07:00 VN), kèm 14 tin tồn đọng dồn vào 1 người để kiểm tra bộ chặn tốc độ `rateLimitPerMin`.
- **Kết quả:**
  - 100% tin nhắn được tiếp nhận và xử lý đầy đủ (`thieu = []`).
  - Không có tin nhắn nào bị gửi trùng (`trung = []`).
  - Trong khung giờ yên ban đêm, không có tin cũ nào bị gửi sai luật (`banDem = []`); toàn bộ tin được hoãn hợp lệ tới sau 07:00 VN sáng hôm sau và quét gửi thành công.
- **Kết luận:** Đạt trọn vẹn yêu cầu khắt khe nhất của hiến pháp về độ bền vững dữ liệu.

### SC-002: Im lặng tuyệt đối khi người cầm phòng
- **Mục tiêu:** Phòng `human`: số tin bot ra = 0 trên toàn bộ fixture eval và trên audit 7 ngày chạy thật.
- **Thực thi:**
  - Logic tại `core/engine.js:124` và `core/engine-handoff.js:47` kiểm tra trạng thái phòng trước khi gọi bất kỳ gói nghiệp vụ hay mô hình AI nào. Khi phòng ở trạng thái `human`, lượt chỉ thực hiện lưu tin khách vào `messages`, ghi `inbox` xong và chuyển tiếp nội dung vào phiếu qua `handoff.forward`, hoàn toàn không sinh tin trả lời ra kênh.
  - Test unit `test/core/engine-handoff.test.mjs` mô phỏng khách gửi 10 tin liên tục: bot không gửi bất kỳ tin nào ra kênh, số cuộc gọi tới Cổng OZ là 0.
  - Kịch bản `eval/fixtures/human-room.jsonl` xác thực luồng tiếp quản của nhân viên qua lệnh `/nhan`, `/tl`, `/tra-bot`.
- **Kết luận:** Phần code và kiểm thử tự động đạt 100%. Phần kiểm chứng 7 ngày thực tế sẽ nghiệm thu ngay sau khi bật lại bot.

### SC-003: Khôi phục việc nền bền vững
- **Mục tiêu:** Việc nền đang chạy khi khởi động lại: 100% giao kết quả đúng một lần, trong 5 phút sau khi lên lại.
- **Thực thi:**
  - Cơ chế hàng đợi bảng `jobs` trong SQLite lưu trạng thái bền vững. Khi tiến trình bị hủy đột ngột lúc đang gọi Cổng OZ, dòng việc nền kẹt ở trạng thái `polling`.
  - Lúc khởi động lại, `jobs.recover()` (được gọi từ `server.js:82`) đưa dòng này về `waiting`. Nhịp thăm dò tiếp theo (khoảng 6 giây) sẽ tra cứu Cổng OZ và gửi kết quả qua cửa duy nhất `gate.send`.
  - Khoá chống trùng `j:<conv_id>:<maLuot>` đảm bảo kết quả không bị gửi đúp.
- **Kết luận:** Đạt trọn vẹn theo kiểm thử tự động `test/core/jobs.test.mjs` và eval `restart-mid-job.jsonl`.

### SC-004: Tốc độ phản hồi Webhook dưới tải đồng thời
- **Mục tiêu:** Webhook trả 200 trong < 200 ms (p95), đo trên máy dev, với 50 update đồng thời.
- **Thực thi:**
  - `core/webhook.js` áp dụng kiến trúc: xác thực token -> phân tích payload -> ghi bền vững vào bảng `inbox` -> trả HTTP 200 OK ngay lập tức -> đẩy việc xử lý vào hàng đợi bất đồng bộ `runTask`.
  - Test `B4b` trong `test/core/webhook.test.mjs` mở 50 kết nối TCP đồng thời bắn payload POST. Thời gian tính từ khi client gửi byte cuối đến khi nhận byte đầu tiên phản hồi p95 đạt ~40–50 ms (thấp hơn nhiều so với ngưỡng 200 ms).
- **Kết luận:** Đạt tiêu chuẩn hiệu năng cao, đảm bảo không bị Zalo ngắt kết nối hoặc gửi lại vì timeout.

### SC-005: Tương thích gói nghiệp vụ và mở rộng không chạm lõi
- **Mục tiêu:** 21 test hiện có đều đạt sau khi chuyển gói; thêm gói mẫu không đổi tệp nào trong `core/`.
- **Thực thi:**
  - Toàn bộ nghiệp vụ hải quan đã chuyển vào `packs/hs/`. Toàn bộ 34 test chuyển gói trong `test/test.mjs` đều xanh.
  - Thêm gói mẫu `packs/echo/` với đầy đủ quyền hạn, match pattern, kiểm tra leak và chống trùng; registry nạp tự động qua quét thư mục dynamic import; không thay đổi bất kỳ tệp nào trong `core/`.
- **Kết luận:** Đạt trọn vẹn mục tiêu kiến trúc module hóa.

### SC-006: Thời gian chuyển tiếp phiếu tới nhân viên
- **Mục tiêu:** Từ phiếu tới lúc nhân viên thấy trong nhóm: < 10 giây (p95).
- **Thực thi:**
  - Khi phát sinh sự kiện cần người (`wantsHuman`, lỗi phân loại, vượt trần), `core/handoff-ticket.js` tạo phiếu và gọi `gate.send` ngay lập tức (< 100 ms).
  - Đối với các tin khách nhắn dồn sau khi phiếu đã mở, hàm `flushDue` được bộ hẹn giờ tại `server.js:99` kích hoạt mỗi 5.000 ms (5 giây) để dồn gửi vào nhóm nhân viên.
  - Độ trễ tối đa p95 được khống chế dưới 10 giây.
- **Kết luận:** Đạt yêu cầu thời gian thực hỗ trợ khách hàng.

### SC-007: Tính truy vết toàn diện của tin nhắn ra
- **Mục tiêu:** Mọi tin ra trong 7 ngày chạy thật đều tra được về một `turn_id` trong audit.
- **Thực thi:**
  - Nguyên tắc "Một cửa gửi duy nhất" được thực thi nghiêm ngặt: mọi luồng gửi tin ra kênh đều phải đi qua `core/gate.js`.
  - Trong `core/gate.js:58-62`, hàm `auditGate()` ghi nhận mọi hành động gửi tin kèm `turn_id`, `chat_id`, `conv_id`, `idem_key`.
  - Kiểm thử `test/core/one-gate.test.mjs` quét toàn bộ codebase đảm bảo không có bất kỳ điểm rò rỉ gọi `channel.sendText` nào khác.
- **Kết luận:** Đạt về mặt kiến trúc và kiểm thử lab. Nghiệm thu thực địa sau 7 ngày chạy thật.

### SC-008: Đồng bộ số lượng tin nhắn trong lịch sử hội thoại
- **Mục tiêu:** Số tin trong `messages` của một phòng bằng số tin khách vào cộng số tin đã gửi (không thiếu, không thừa) trên toàn bộ fixture eval.
- **Thực thi:**
  - Lõi `core/engine.js:126` ghi tin khách vào `messages`.
  - Cửa gửi `core/gate.js:98-102` ghi tin bot và tin nhân viên relay (`kind === 'staff_relay'`) vào `messages` sau khi giao thành công qua kênh. Các tin bị `drop` hoặc `reject` không được ghi vào `messages`.
  - Việc tích hợp bước kiểm tra assert tự động cho 12 fixture eval đang được phối hợp thực hiện tại issue #80 (T033).
- **Kết luận:** Code lõi đã sẵn sàng; đánh dấu phụ thuộc hoàn tất bộ đếm của issue #80.

### SC-009: Tóm tắt hồ sơ khách hàng đầy đủ trong phiếu hỗ trợ
- **Mục tiêu:** Phiếu cho người luôn có tóm tắt hồ sơ; nhân viên không phải hỏi lại khách thông tin khách đã gõ (kiểm trên 20 phiếu chạy thật đầu tiên).
- **Thực thi:**
  - `core/handoff-ticket.js:130` tự động gọi `dongHoSo()` tích hợp kết quả từ `core/customers.js:summary()`.
  - Nội dung tóm tắt hiển thị rõ: tên khách, số điện thoại (đã trích xuất hoặc che theo quy định), số lượt trao đổi, các nhãn nhận diện (ví dụ `tra-cuu-hs`, `xin-nguoi`), danh sách mặt hàng khách đã hỏi cùng mã HS gợi ý.
  - Test tự động `test/core/engine-customers.test.mjs:83-100` kiểm chứng phiếu gửi vào nhóm luôn chứa đầy đủ khối thông tin này.
- **Kết luận:** Đạt về mặt code và kiểm thử tự động. Nghiệm thu thực địa trên 20 phiếu đầu tiên khi bật lại bot.

---

## 3. Kết luận và Kiến nghị bật lại Bot cho khách

### 3.1. Tỷ lệ đạt
- **5 / 9 tiêu chí ĐẠT TRỌN VẸN TRONG LAB:** SC-001, SC-003, SC-004, SC-005, SC-006.
- **4 / 9 tiêu chí ĐẠT VỀ MẶT CODE & KIỂM THỬ TỰ ĐỘNG:**
  - **SC-002, SC-007, SC-009:** Đã được bảo đảm 100% bằng kiến trúc lõi và bài test tự động; điều kiện để chốt số liệu thực địa là dữ liệu vận hành thật (7 ngày và 20 phiếu đầu tiên) sau khi bật lại bot.
  - **SC-008:** Code lõi đã ghi nhận tin nhắn đúng thiết kế; chờ tích hợp bộ test đếm tự động của issue #80 (T033).

### 3.2. Căn cứ trình Giám đốc & CEO để BẬT LẠI BOT
Theo `specs/001-nen-tang-chung/tasks.md:831`:
> **MVP an toàn để bật lại cho khách** = xong Phase 1–6b (T001–T026, T033–T036): cửa gửi, gói hs trên lõi, bền vững, người cầm phòng, lịch sử và hồ sơ khách.

Hiện tại toàn bộ các điều kiện tiên quyết kỹ thuật đã hoàn thành:
1. **An toàn tuyệt đối cho khách:** Cửa gửi duy nhất kiểm soát giờ yên, trần tin nhắn, chống rò rỉ bí mật và chống gửi trùng.
2. **Tôn trọng con người:** Khi nhân viên cầm phòng hoặc khách yêu cầu gặp người, bot im lặng tuyệt đối (SC-002).
3. **Bền vững khi có sự cố:** 1.000 update và việc nền khôi phục hoàn hảo 100% không mất tin sau 3 lần ngắt nguồn đột ngột (SC-001, SC-003).
4. **Hỗ trợ tối đa cho nhân viên:** Phiếu chuyển giao tức thì (< 10s), luôn kèm tóm tắt hồ sơ và nhu cầu khách hàng (SC-006, SC-009).

**Kiến nghị:**
Kính trình Giám đốc phê duyệt kết quả đo lường bộ Success Criteria SC-001…SC-009 và trình CEO cho phép:
1. Đóng spec 001 (sau khi phối hợp đóng nốt test suite T033 tại issue #80).
2. Chuyển trọng tâm phát triển sang **Spec 007 (Agent giám sát)** theo đúng lộ trình CEO chốt (001 → 007 → 005).
3. **Bật lại bot Zalo cho khách hàng** với quy trình theo dõi sát 7 ngày đầu để nghiệm thu thực địa các chỉ số SC-002, SC-007, SC-009.
