# Feature Specification: Nền tảng dùng chung cho bot Zalo toàn công ty

**Feature Branch**: `001-nen-tang-chung`

**Created**: 2026-11-04

**Status**: Draft

**Input**: Anh Thắng (04/11/2026): "Anh đang xây lại một repo xịn dùng chung cho toàn công ty. Em đọc và xây dựng lại kế hoạch, dựa trên những kinh nghiệm vận hành đã có."

## Bối cảnh

Repo hiện có là bot tra cứu hải quan (7 gói, nối với Cổng OZ qua MCP). Bot chạy tốt khi chỉ có một gói tra cứu
và một tiến trình không bao giờ khởi động lại. Muốn **dùng chung cho toàn công ty**, tức nhiều gói như CSKH,
nội bộ, kế toán chạy trên cùng một bot, thì lõi phải đạt bốn điều mà vận hành thật ở VPS 201 đã chứng minh là bắt buộc:
không gửi sai hay gửi trùng, người luôn đứng trước máy, không mất việc khi khởi động lại, và mọi thứ đều đo được
(xem `research.md` §1, 18 sự cố).

Spec này **không thêm tính năng mới cho khách**. Nó dựng lõi, rồi chuyển 7 gói hải quan hiện có sang lõi mới,
giữ nguyên hành vi. Các gói mới (CSKH, nội bộ…) là các spec sau, xem `docs/ROADMAP.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Không bao giờ gửi trùng, gửi sai (Priority: P1)

Khách hỏi một lần thì nhận đúng một câu trả lời, dù Zalo gửi lại webhook, bot khởi động lại giữa chừng,
hay khách bấm gửi hai lần liền.

**Why this priority**: Sự cố #1 (2.534 bình luận lặp) và #2 (3 tin gần giống) làm mất uy tín kênh nhanh hơn mọi lợi ích bot mang lại.

**Independent Test**: Phát lại 1.000 update, trong đó 10 % là bản gửi lại cùng `message_id`, và ép khởi động lại ở giữa.
Đếm tin ra trong Zalo giả lập: mỗi `message_id` có đúng một bộ tin trả lời.

**Acceptance Scenarios**:

1. **Given** một tin khách đã được trả lời, **When** Zalo gửi lại đúng update đó, **Then** bot không gửi gì thêm và audit ghi `drop: duplicate-update`.
2. **Given** bot vừa gửi một câu cho phòng X, **When** một luồng khác định gửi câu giống ≥ 80 % cho phòng X trong 15 phút, **Then** cửa bỏ tin đó và ghi lý do.
3. **Given** câu trả lời có chứa đường dẫn tệp nội bộ hoặc chuỗi giống token, **When** gửi, **Then** cửa từ chối, khách không nhận gì, nhóm nhân viên nhận cảnh báo.
4. **Given** phòng X đã nhận 8 tin bot trong ngày, **When** có tin thứ 9, **Then** cửa hoãn tin và mở phiếu cho người.

---

### User Story 2 - Nhân viên cầm phòng, bot im (Priority: P1)

Khi nhân viên nhận một phòng, hoặc khách xin gặp người, bot ngừng hẳn với phòng đó. Nhân viên trả lời khách
ngay trong nhóm Zalo nhân viên mà không cần vào máy chủ.

**Why this priority**: Sự cố #4 (22 tin bot chen ngang người trong 7 ngày) và #15 (bot xin người 100 lần, không ai tới).

**Independent Test**: Đưa phòng sang `human` bằng lệnh `/nhan`, rồi gửi 10 tin khách vào phòng đó.
Zalo giả lập không nhận tin bot nào; nhóm nhân viên nhận đúng một phiếu kèm các tin đã gộp.

**Acceptance Scenarios**:

1. **Given** khách nhắn "cho em gặp nhân viên", **When** bot xử lý, **Then** bot trả một câu báo đã chuyển người, phòng sang `human`, nhóm nhân viên nhận phiếu có mã phòng, tên khách, 5 tin gần nhất.
2. **Given** phòng ở `human`, **When** khách nhắn tiếp, **Then** bot không gọi gói nào, không gọi Cổng OZ, chỉ chuyển nguyên văn tin vào phiếu.
3. **Given** nhân viên gõ `/tl P123 Dạ anh chờ em 5 phút` trong nhóm, **When** bot xử lý, **Then** khách nhận đúng câu đó; audit ghi người gửi là nhân viên.
4. **Given** phòng ở `human`, **When** nhân viên gõ `/tra-bot P123`, **Then** phòng về `bot`, và bot chỉ trả lời từ tin khách **kế tiếp**, không trả lời bù tin cũ.
5. **Given** khách hỏi "bạn là người hay máy", **When** bot trả lời, **Then** câu trả lời nói rõ là trợ lý tự động của OZ và chỉ cách gặp người.

---

### User Story 3 - Không mất việc khi khởi động lại (Priority: P1)

Bot khởi động lại (deploy, crash, máy chủ khởi động lại) thì mọi tin đang chờ, mọi việc nền đang chạy, mọi phiên
người dùng (gói đang chọn, mã vừa phân loại) vẫn còn.

**Why this priority**: Phân loại HS chạy nền 1–4 phút. Hiện nay deploy trong lúc đó là khách mất kết quả.

**Independent Test**: Gửi một yêu cầu phân loại, dừng tiến trình khi việc nền đang `DANG_XU_LY`, rồi khởi động lại.
Khách nhận kết quả đúng một lần.

**Acceptance Scenarios**:

1. **Given** tin khách đã ghi vào `inbox` nhưng chưa xử lý, **When** tiến trình chết rồi lên lại, **Then** tin được xử lý đúng một lần.
2. **Given** việc nền `maLuot=X` đang chờ, **When** khởi động lại, **Then** bộ hỏi kết quả tiếp tục và gửi kết quả khi xong.
3. **Given** việc nền xong lúc 23:30 giờ VN, **When** gửi kết quả, **Then** tin được hoãn tới 07:00 và gửi đúng một lần.
4. **Given** khách gửi 2 tin trong 1 giây, **When** xử lý, **Then** tin thứ hai chỉ chạy sau khi tin thứ nhất xong, trên phiên đã cập nhật.

---

### User Story 4 - Thêm gói mới không đụng lõi (Priority: P2)

Một bộ phận (CSKH, kế toán…) thêm được gói của mình bằng cách tạo thư mục trong `packs/`, không sửa tệp nào trong `core/`.

**Why this priority**: Đây là điều làm repo "dùng chung cho toàn công ty". Ưu tiên sau P1 vì gói nào cũng phải chạy trên một lõi an toàn trước.

**Independent Test**: Thêm gói mẫu `packs/echo/` cho nhân viên. `git diff --stat main -- core/` bằng rỗng; gói chạy được qua test.

**Acceptance Scenarios**:

1. **Given** 7 gói hải quan đã chuyển sang `packs/hs/`, **When** chạy lại 21 test cũ, **Then** tất cả đều đạt.
2. **Given** gói có `audience: 'staff'`, **When** người không có trong danh sách nhân viên gọi gói, **Then** gói không hiện trong menu và không chạy được.
3. **Given** Cổng OZ thiếu công cụ bắt buộc của gói, **When** khởi động, **Then** gói tự ẩn và log ghi lý do (giữ hành vi hiện có).

---

### User Story 5 - Vận hành nhìn thấy được (Priority: P2)

Người phụ trách xem được bot đang làm gì mà không cần đọc log thô.

**Why this priority**: Sự cố #13: lời khai không có bản ghi đối chiếu.

**Independent Test**: Sau một loạt hội thoại giả lập, `GET /metrics` trả đúng số lượt, số tin bị cửa chặn theo lý do,
số phiếu đang chờ người; lệnh `npm run audit -- --chat <id>` in ra từng lượt.

**Acceptance Scenarios**:

1. **Given** bot đang chạy, **When** gọi `/health`, **Then** trả trạng thái db, Cổng OZ (số công cụ), Zalo (`getMe`), số tin `inbox` đang chờ.
2. **Given** là 08:00 và 17:00 giờ VN, **When** đến giờ, **Then** nhóm nhân viên nhận **một** bản tin gộp: số lượt, lỗi, tin bị chặn, phiếu chờ người quá 15 phút.
3. **Given** một lượt bất kỳ, **When** tra audit theo `turn_id`, **Then** thấy đủ tin vào, gói, công cụ đã gọi, quyết định cửa, tin ra.

---

### User Story 6 - Kiểm trước khi bật (Priority: P3)

Trước khi merge hay bật một gói, chạy phát lại các hội thoại mẫu và có điểm so với `main`.

**Why this priority**: Sự cố #16. Ưu tiên P3 vì cần lõi chạy được trước. Bắt buộc trước khi làm spec 003 (CSKH).

**Independent Test**: `npm run eval` chạy bộ fixture, in số kịch bản đạt / tổng, trả mã thoát ≠ 0 khi có kịch bản trượt.

**Acceptance Scenarios**:

1. **Given** fixture "khách gửi lại webhook", **When** chạy eval, **Then** kịch bản đạt khi đúng một tin ra.
2. **Given** một thay đổi làm tụt một kịch bản đang đạt trên `main`, **When** chạy CI, **Then** CI đỏ và in tên kịch bản.

### Edge Cases

- Khách chỉ nhắn "ok", "cảm ơn", 👍 sau khi đã có câu trả lời → không trả lời (khách đã đóng).
- Tin dài hơn 2.000 ký tự bị chia nhiều phần → khoá idempotency theo từng phần, khởi động lại giữa chừng thì chỉ gửi phần còn thiếu.
- Bot bị xoá khỏi nhóm nhân viên → phiếu vẫn ghi db; `/health` báo `staff: unreachable`; không chặn trả lời khách.
- Tệp db bị khoá hoặc hỏng → tiến trình không nhận webhook (trả 503) thay vì xử lý mà không ghi được (VII).
- Hai nhân viên cùng `/nhan` một phòng → người đầu được, người sau nhận câu "phòng đã có X nhận".
- Nhân viên `/tl` vào phòng đang ở `bot` → vẫn gửi được, đồng thời phòng sang `human` (người đã vào cuộc).
- Trong nhóm khách, bot chỉ phản hồi khi được @nhắc hoặc được trả lời tin; trạng thái `human` áp theo cả nhóm.
- Cổng OZ hết điểm hoặc trả 401 → khách nhận câu báo chung, nhóm nhân viên nhận cảnh báo một lần mỗi giờ.

## Requirements *(mandatory)*

### Functional Requirements

**Cửa gửi**
- **FR-001**: Hệ thống MUST đưa mọi tin ra (trả lời, thông báo, kết quả việc nền, tin nhân viên chuyển) qua một cửa gửi duy nhất.
- **FR-002**: Cửa gửi MUST chỉ trả một trong bốn quyết định `send | drop | defer | reject` kèm lý do, và không bao giờ sửa nội dung tin.
- **FR-003**: Cửa gửi MUST có khoá idempotency cho mỗi tin; khoá đã gửi thì không gửi lại, kể cả sau khi khởi động lại.
- **FR-004**: Cửa gửi MUST bỏ tin giống ≥ 0,8 (Jaccard trên tập từ đã chuẩn hoá) với một trong 4 tin bot gần nhất của cùng phòng trong 15 phút.
- **FR-005**: Cửa gửi MUST hoãn tin chủ động trong giờ yên tới 07:00 giờ VN, và hoãn kèm mở phiếu khi chạm trần theo phòng hoặc trần theo ngày.
- **FR-006**: Hệ thống MUST xử lý tin của cùng một phòng tuần tự (tin sau chờ tin trước xong).
- **FR-007**: Cửa gửi MUST từ chối tin chứa đường dẫn hệ thống, stack trace, chuỗi giống khoá/token, hoặc mục trong danh sách cấm (số điện thoại cá nhân, số tài khoản…) đọc từ config.
- **FR-008**: Với gói có `moneyCheck: true`, cửa gửi MUST từ chối tin có số tiền không xuất hiện trong bằng chứng của lượt.

**Người trước máy**
- **FR-010**: Mỗi phòng MUST có trạng thái `bot | human | blocked`, lưu bền, đổi được qua lệnh nhân viên và ghi audit mỗi lần đổi.
- **FR-011**: Phòng `human` hoặc `blocked`: hệ thống MUST NOT gọi gói, Cổng OZ hay mô hình nào, và cửa gửi MUST từ chối mọi tin không phải của nhân viên.
- **FR-012**: Khi chuyển người, hệ thống MUST mở một phiếu trong nhóm nhân viên (mã phòng, tên, 5 tin gần nhất) và gộp tin khách mới vào phiếu đó, tối đa một tin nhóm / phòng / 5 phút.
- **FR-013**: Nhân viên MUST gửi được tin tới khách bằng `/tl <mã> <nội dung>`, nhận phòng bằng `/nhan <mã>`, trả phòng bằng `/tra-bot <mã>`, chặn bằng `/chan <mã>`, xem hàng chờ bằng `/cho`.
- **FR-014**: Hệ thống MUST chuyển phòng sang `human` khi khách xin gặp người, khi nhân viên `/tl`, hoặc khi gói trả yêu cầu chuyển người.
- **FR-015**: Hệ thống MUST NOT gửi tin chủ động cho một phòng, trừ khi có bản ghi việc nền chưa giao kết quả cho đúng phòng đó.

**Bền vững**
- **FR-016**: Hệ thống MUST ghi update vào `inbox` trước khi trả HTTP 200; khi khởi động MUST xử lý tiếp các dòng `pending`.
- **FR-017**: Phiên người dùng, chống trùng update, việc nền MUST lưu bền và còn nguyên sau khi khởi động lại.

**Gói và vận hành**
- **FR-018**: Mỗi lượt MUST ghi audit: tin vào, gói, công cụ đã gọi (tên, tham số đã che, hash kết quả), quyết định cửa, tin ra.
- **FR-019**: Gói MUST khai báo theo contract `contracts/pack.md`; lõi tự nạp gói trong `packs/`, lọc theo `audience` và công cụ Cổng OZ.
- **FR-020**: Hệ thống MUST có `/health`, `/metrics`, và một bản tin gộp cho nhóm nhân viên lúc 08:00 và 17:00 giờ VN.
- **FR-021**: Repo MUST có `npm run eval` phát lại fixture qua đúng lõi với Zalo và Cổng OZ giả lập; CI chạy cả `npm test` và `npm run eval`.
- **FR-022**: Tin gửi khách và log MUST NOT chứa token hay thông báo lỗi gốc của API ngoài.
- **FR-023**: Thời gian MUST lưu UTC; mọi phép so giờ yên và giờ bản tin dùng `Asia/Ho_Chi_Minh`.

### Key Entities

- **Phòng (Chat)**: một cuộc trò chuyện 1-1 hoặc một nhóm khách; khoá là `chat_id`, không bao giờ là tên.
- **Tin vào (Inbox item)**: một update của Zalo đã ghi bền, có trạng thái xử lý.
- **Tin ra (Outbox item)**: một tin chờ hoặc đã đi qua cửa, có khoá idempotency, quyết định và lý do.
- **Phiên (Session)**: trạng thái của người dùng trong một gói (gói đang chọn, mã vừa phân loại…).
- **Việc nền (Job)**: một `maLuot` của Cổng OZ đang chờ kết quả, gắn với phòng và gói.
- **Phiếu (Ticket)**: yêu cầu cho người, gắn với phòng, có người nhận và trạng thái.
- **Bản ghi audit (Audit record)**: một sự kiện trong một lượt.
- **Gói (Pack)**: một module nghiệp vụ theo contract.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Phát lại 1.000 update có 10 % gửi lại và 3 lần khởi động lại ép buộc: số tin trùng = 0, số tin khách bị mất = 0.
- **SC-002**: Phòng `human`: số tin bot ra = 0 trên toàn bộ fixture eval và trên audit 7 ngày chạy thật.
- **SC-003**: Việc nền đang chạy khi khởi động lại: 100 % giao kết quả đúng một lần, trong 5 phút sau khi lên lại.
- **SC-004**: Webhook trả 200 trong < 200 ms (p95), đo trên máy dev, với 50 update đồng thời.
- **SC-005**: 21 test hiện có đều đạt sau khi chuyển gói; thêm gói mẫu không đổi tệp nào trong `core/`.
- **SC-006**: Từ phiếu tới lúc nhân viên thấy trong nhóm: < 10 giây (p95).
- **SC-007**: Mọi tin ra trong 7 ngày chạy thật đều tra được về một `turn_id` trong audit.

## Assumptions

- Kênh v1 là Zalo Bot Platform (`bot-api.zaloplatforms.com`) như code hiện tại; kênh khác (Zalo OA, Messenger) là spec 005.
- Chạy một tiến trình trên Coolify, tệp SQLite nằm trên volume bền.
- Cổng OZ (`mcp.uythacnhapkhau.com/mcp`) giữ nguyên giao thức MCP Streamable HTTP và cách trả `maLuot` / `DANG_XU_LY`.
- Có một nhóm Zalo nhân viên mời được bot vào; chưa có thì phiếu chỉ nằm trong db và `/cho`.
- Danh sách nhân viên (`STAFF_USERS`) do anh Thắng cấp, đọc từ biến môi trường.
