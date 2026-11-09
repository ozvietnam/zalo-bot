# Bảng đo lường Success Criteria SC-001…SC-006 (Spec 007)

> Cập nhật: 2026-11-09 · commit: c4d099d · Trạng thái: 5/6 Đạt trọn vẹn trong lab, 1/6 Đạt về code (chờ theo dõi 4 tuần chạy thật)

Tài liệu này ghi nhận kết quả đo lường thực tế 6 chỉ số thành công (Success Criteria) của spec 007 (Agent giám sát chất lượng bot) theo quy định tại `specs/007-giam-sat-nang-cap/spec.md:174-181`, làm căn cứ nghiệm thu tính năng và khép vòng lặp cải tiến tuần.

---

## 1. Bảng tổng hợp đo lường 6 chỉ số

| Mã SC | Tiêu chí đặc tả | Phương pháp đo & Bằng chứng mã nguồn | Kết quả số liệu thực tế | Đánh giá | Điều kiện nghiệm thu thực địa |
|---|---|---|---|---|---|
| **SC-001** | Bắt đủ 9/9 tín hiệu cài sẵn trên db mẫu, 0 phát hiện thừa | Chạy `test/giam-sat/tinh-hieu.test.mjs:6-17` với fixture `test/helpers/giam-sat-fixture.mjs:1-244` cài sẵn 9 lỗi: GATE-LEAK, GATE-MONEY, TOOL-ERR, TOOL-EMPTY, JOB-EXPIRED, HOI-LAI, NGUOI-THAY, KHACH-BUC, XIN-LOI-TAY. Mã nguồn: `scripts/giam-sat/tinh-hieu.js:60-207`. | • Phát hiện đúng: **9/9** tín hiệu.<br>• Phát hiện thừa: **0**.<br>• Mỗi phát hiện đều có fingerprint ổn định và `turnIds` không rỗng (`test/giam-sat/tinh-hieu.test.mjs:19-40`). | **ĐẠT** (Lab) | Đã kiểm chứng trọn vẹn trong môi trường lab trên fixture chuẩn. |
| **SC-002** | 0 issue chứa SĐT, STK, token hay tên khách thật | Chạy `test/giam-sat/giam-sat-sc002-tuan.test.mjs:15-73` và `test/giam-sat/an-danh.test.mjs:1-110`. Quét tự động bằng hàm `kiemTraSc002` trong `scripts/giam-sat/sc-002.js:20-75` tích hợp tại `scripts/giam-sat.mjs:191-200`. | • Issue chứa SĐT/STK/token: **0**.<br>• Issue chứa tên khách thật: **0** (`hopLe: true`, `viPham: []`).<br>• Tên khách chuyển thành nhãn Khách A, Khách B qua `taoBangKhach` (`scripts/giam-sat/an-danh.js:47-97`). | **ĐẠT** (Lab) | Cổng quét tự động chạy mỗi phiên giám sát trước khi đẩy issue lên GitHub. |
| **SC-003** | ≥ 80% issue giám sát được người xử lý gắn nhãn "đúng vấn đề" trong 4 tuần đầu | Cơ chế lưu trữ và sổ nhật ký tại `scripts/giam-sat/so-nhat-ky.js:59-130` (bảng `nhat_ky` và `issues` trong `data/giam-sat.db`). Test tại `test/giam-sat/so-nhat-ky.test.mjs:6-55`. | • Sổ nhật ký: **Đầy đủ** các trường (ngày, số tin, phát hiện, issue mới, comment, lỗi).<br>• Trạng thái chạy thật: **Chờ theo dõi** khi bot hoạt động thực tế 4 tuần. | **ĐẠT** (Code)<br>*Chờ đo 4 tuần* | Theo dõi trên GitHub issues và đối chiếu với bảng `issues` trong `data/giam-sat.db` sau 4 tuần chạy thật đầu tiên. |
| **SC-004** | Lỗi lặp lại không sinh issue trùng: số issue mở / số fingerprint khác nhau = 1 | Chạy `test/giam-sat/issue.test.mjs:5-53` kiểm tra cơ chế kiểm tra fingerprint trong `scripts/giam-sat/issue.js:46-135` và sinh fingerprint chuẩn tại `scripts/giam-sat/tinh-hieu.js:65`. | • Khi lỗi trùng fingerprint xuất hiện: **0** issue mới được tạo.<br>• Chuyển thành **1** comment bổ sung bằng chứng vào issue đang mở.<br>• Tỷ lệ issue mở / số fingerprint: **1.0** (1/1). | **ĐẠT** (Lab) | Đã kiểm chứng trọn vẹn cơ chế chống trùng issue qua API GitHub giả lập. |
| **SC-005** | Mỗi issue đã đóng có số đo trước/sau trong bản tin tuần kế tiếp | Chạy `test/giam-sat/vong-lap.test.mjs:6-300` và `test/giam-sat/digest-delivery.test.mjs:40-70`. Mã nguồn: `scripts/giam-sat/vong-lap.js:18-265`, `scripts/giam-sat/digest.js:42-105`, tích hợp tại `scripts/giam-sat.mjs:84-96, 157, 203`. | • Đo lường trước/sau: **10** lần trước → **2** lần sau (giảm 80%).<br>• Chấp nhận `decision IN ('block', 'reject')` cho leak/money.<br>• Đếm đủ tín hiệu hội thoại từ `messages`.<br>• Hiển thị rõ trên bản tin tuần: `• #45 HOI-LAI: 10 → 2 (giảm 80%)` hoặc `Chưa đủ 7 ngày sau khi đóng để đo`. | **ĐẠT** (Lab) | Đã kiểm chứng khép vòng lặp trên SQLite thật và tích hợp bản tin tuần. |
| **SC-006** | Chi phí AI = 0 đồng (Gemini AI Studio miễn phí), tối đa 1 lần gọi Gemini / tuần cho US3 | Chạy `test/giam-sat/gemini-cluster.test.mjs:27-67` kiểm tra hàm `gomNhomNhuCau` trong `scripts/giam-sat/gemini-cluster.js:70-150` và tích hợp tại `scripts/giam-sat.mjs:118-146`. | • Số lần gọi API Gemini trong tuần: đúng **1** lần cho cả lô 50 hội thoại.<br>• Chi phí: **0 VNĐ** (sử dụng tier Free của Google AI Studio).<br>• Không có API key thì bỏ qua an toàn, không tốn phí. | **ĐẠT** (Lab) | Đã kiểm chứng xác thực turnIds và gom nhóm tuần với mock fetcher 1 lần gọi. |

---

## 2. Chi tiết phân tích từng tiêu chí

### SC-001: Phát hiện chính xác 9 tín hiệu lỗi từ dữ liệu bot
- **Mục tiêu:** Trên db mẫu có 9 lỗi cài sẵn: bắt đủ 9, 0 phát hiện thừa.
- **Thực thi:**
  - `scripts/giam-sat/tinh-hieu.js:60-207` hiện thực hóa hàm thuần túy `tinhHieu` phân tích 4 nguồn dữ liệu SQLite (`messages`, `outbox`, `jobs`, `audit`) độc lập hoàn toàn với mạng và AI.
  - Bộ 9 tín hiệu được quy định ngưỡng rõ ràng tại `scripts/giam-sat/tinh-hieu.js:5-15`:
    1. `GATE-LEAK`: Chặn gửi vì lộ thông tin nội bộ (ngưỡng min: 1).
    2. `GATE-MONEY`: Chặn gửi vì số tiền không có căn cứ (ngưỡng min: 1).
    3. `TOOL-ERR`: Lỗi công cụ phân loại theo tool (ngưỡng min: 3).
    4. `TOOL-EMPTY`: Công cụ trả kết quả rỗng (ngưỡng min: 3).
    5. `JOB-EXPIRED`: Việc nền quá hạn mà chưa có kết quả (ngưỡng min: 1).
    6. `HOI-LAI`: Khách hỏi lại câu gần giống trong 30 phút sau khi bot trả lời qua Jaccard similarity ≥ 0.8 (ngưỡng min: 3 phòng).
    7. `NGUOI-THAY`: Nhân viên phải vào can thiệp trong vòng 15 phút sau bot (ngưỡng min: 3 phòng).
    8. `KHACH-BUC`: Khách thể hiện thái độ bức xúc, khó hiểu (ngưỡng min: 2 phòng).
    9. `XIN-LOI-TAY`: Nhân viên xin lỗi / nhắn gửi nhầm ngay sau tin bot (ngưỡng min: 1 lần).
- **Kết quả:** Kiểm thử `test/giam-sat/tinh-hieu.test.mjs:6-17` chạy trên fixture chuẩn đạt 9/9 tín hiệu, không phát hiện thừa nào.

### SC-002: Bảo vệ tuyệt đối thông tin định danh và bí mật (PII & Secret)
- **Mục tiêu:** 0 issue chứa SĐT, STK, token hay tên khách thật (kiểm chứng bằng script quét toàn bộ issue đã mở).
- **Thực thi:**
  - Quy trình ẩn danh đa tầng:
    1. Bảng tra tên khách `taoBangKhach` trích xuất tên hiển thị thật và thay bằng bí danh `Khách A`, `Khách B` (`scripts/giam-sat/an-danh.js:47-97`).
    2. `core/redact.js` và các bộ regex che số điện thoại di động VN (`core/sdt.js`), tài khoản ngân hàng, token và khoá truy cập giả lập, đường dẫn tệp hệ thống nội bộ.
  - Lưới an toàn tự động: Hàm `kiemTraSc002` (`scripts/giam-sat/sc-002.js:20-75`) được gọi tại `scripts/giam-sat.mjs:191-200` quét toàn bộ tiêu đề và nội dung issue trước khi gửi ra ngoài.
- **Kết quả:** `test/giam-sat/giam-sat-sc002-tuan.test.mjs:15-73` xác nhận 100% issue sạch đạt chuẩn kiểm tra, phát hiện và chặn đứng mọi vi phạm mẫu.

### SC-003: Đo lường mức độ hữu ích của issue giám sát
- **Mục tiêu:** ≥ 80% issue giám sát được người xử lý gắn nhãn "đúng vấn đề" trong 4 tuần đầu.
- **Thực thi:**
  - `scripts/giam-sat/so-nhat-ky.js:59-130` tự động lưu trữ mọi phiên giám sát vào SQLite `data/giam-sat.db` (bảng `nhat_ky` và bảng `issues`).
  - Mỗi issue được đánh dấu fingerprint, repo, mã tín hiệu, số đo và liên kết để người phụ trách gắn nhãn `dung-van-de`.
- **Kết quả:** Phần mã nguồn và sổ theo dõi đã hoàn tất trọn vẹn trong `test/giam-sat/so-nhat-ky.test.mjs:6-55`. Tiêu chí ở trạng thái theo dõi trong 4 tuần vận hành thật của bot.

### SC-004: Chống trùng lặp issue qua dấu vân tay fingerprint
- **Mục tiêu:** Lỗi lặp lại không sinh issue trùng: số issue mở / số fingerprint khác nhau = 1.
- **Thực thi:**
  - Mỗi tín hiệu phát hiện được gán một fingerprint bất biến dạng `${ma}${cheDo ? `:${cheDo}` : ''}` (`scripts/giam-sat/tinh-hieu.js:65`).
  - Trước khi tạo issue mới trên GitHub, `scripts/giam-sat/issue.js:46-135` tìm kiếm các issue đang mở mang cùng fingerprint. Nếu tìm thấy, hệ thống chuyển sang gửi comment bổ sung bằng chứng ngày mới thay vì mở issue trùng lặp.
- **Kết quả:** Kiểm thử `test/giam-sat/issue.test.mjs:5-53` xác nhận 0 issue bị mở trùng, comment được gửi đúng issue đích, đạt tỷ lệ 1.0 tuyệt đối.

### SC-005: Khép vòng lặp tuần đo lường trước/sau khi đóng issue
- **Mục tiêu:** Mỗi issue đã đóng có số đo trước/sau trong bản tin tuần kế tiếp.
- **Thực thi (T711 & T713):**
  - Hàm `doLuongTruocSau` (`scripts/giam-sat/vong-lap.js:195-265`) so sánh số đo 7 ngày trước khi đóng và 7 ngày sau khi đóng cho các issue đóng trong vòng 14 ngày gần nhất.
  - Hàm `demTinHieuSqlite` (`scripts/giam-sat/vong-lap.js:18-185`) hỗ trợ:
    - Bắt đúng cả `decision IN ('block', 'reject')` cho `GATE-LEAK`/`CHUA-LOC-NOI-BO` và `GATE-MONEY`/`SAI-SO`.
    - Đếm chính xác số hội thoại phát sinh các lỗi `HOI-LAI`, `NGUOI-THAY`, `KHACH-BUC`, `XIN-LOI-TAY` từ bảng `messages`.
  - Soạn bản tin tuần: `scripts/giam-sat/digest.js:42-105` hiển thị khối `Vòng lặp cải tiến (trước/sau 7 ngày):` liệt kê chi tiết từng issue (ví dụ `• #45 HOI-LAI: 10 → 2 (giảm 80%)` hoặc ghi chú `Chưa đủ 7 ngày sau khi đóng để đo`).
  - Tích hợp luồng chạy: `scripts/giam-sat.mjs:84-96, 157, 203` chuyển tiếp `vongLap: ketQuaVongLap` vào `soanBanTin`.
- **Kết quả:** Kiểm thử `test/giam-sat/vong-lap.test.mjs:6-300` đạt 100% trên SQLite mẫu; bản tin tuần thể hiện đầy đủ kết quả đo lường.

### SC-006: Tối ưu chi phí và tần suất gọi AI
- **Mục tiêu:** Chi phí AI = 0 đồng (Gemini AI Studio miễn phí), tối đa 1 lần gọi Gemini / tuần cho US3.
- **Thực thi:**
  - Luồng tuần `scripts/giam-sat.mjs:118-146` chỉ kích hoạt gom nhóm nhu cầu khi có cờ `tuan = true`.
  - Toàn bộ hội thoại trong tuần của khách và nhân viên được lọc sạch, ẩn danh và gom vào đúng 1 mảng JSON gửi trong 1 lượt gọi duy nhất tới mô hình `gemini-1.5-flash` qua Google AI Studio (`scripts/giam-sat/gemini-cluster.js:70-150`).
  - Hàm `xacThucTurnIds` đối chiếu nghiêm ngặt mọi `turn_id` do Gemini trích dẫn với `dbTurns` thực tế để loại trừ hoàn toàn hiện tượng ảo giác AI.
- **Kết quả:** Kiểm thử `test/giam-sat/gemini-cluster.test.mjs:27-67` xác nhận số lần gọi fetcher đúng 1 lần cho lô 50 hội thoại; sử dụng tài nguyên miễn phí với chi phí 0 VNĐ.
