# Feature Specification: Agent giám sát và vòng nâng cấp repo nguồn

**Feature Branch**: `007-giam-sat-nang-cap`

**Created**: 2026-11-04

**Status**: Draft (chờ 001 xong; làm **trước** 005)

**Input**: Anh Thắng (04/11/2026): "Từ những phiên làm việc, chat trả lời khách hàng, có agent giám sát, bắt bug, đặt câu hỏi cần nâng cấp các repo nguồn, MCP sao cho phù hợp với yêu cầu thực tế."

## Clarifications

### Session 2026-11-04 (anh Thắng trả lời)

- Q: Agent giám sát được làm gì khi thấy vấn đề? → A: **Tự mở GitHub issue đúng repo**, kèm bằng chứng. Không sửa code, không mở PR, không nhắn khách.
- Q: Đọc nguồn nào? → A: Cả bốn nguồn: hội thoại + nhật ký của bot Zalo; tin nhân viên trả lời tay; nhật ký Cổng OZ (MCP); Fanpage + db VPS 201.
- Q: Não chạy ở đâu? → A: **Script + Gemini (Google AI Studio, miễn phí)**. Script tính mọi số đo bằng code; Gemini đọc cả lô một lần để gom nhóm và viết câu hỏi. Claude chỉ điều phối.
- Q: Làm khi nào? → A: Ngay sau 001, trước 005.

## Bối cảnh

Ở VPS 201, lỗi chỉ được phát hiện khi anh Thắng tự đọc phòng chat hoặc khách phàn nàn: 2.534 bình luận lặp (25/09), khách chờ
5 giờ 49 phút (28/09), 22 tin chen ngang người (10/2026). Những tín hiệu đó **đã nằm sẵn trong db**, nhưng không ai đọc có hệ thống.
Agent kiểm thử 201 từng chứng minh: bộ đo bằng code bắt được lỗi thật (lặp câu, né câu "người hay AI", sai giờ). Spec này biến việc đọc đó
thành một vòng lặp đều đặn: **tín hiệu → issue đúng repo → người/agent dev sửa → đo lại xem tín hiệu có giảm không**.

Bốn repo/hệ thống mà vấn đề có thể thuộc về:

| Nơi | Vấn đề thuộc về nó khi… |
|---|---|
| `ozvietnam/zalo-bot` | luồng hội thoại, cửa gửi, chọn gói, câu chữ của bot, chuyển người |
| `ozvietnam/ozplugin` (Cổng OZ MCP) | công cụ lỗi, chậm, trả rỗng; khách hỏi thứ Cổng chưa có công cụ |
| `ozvietnam/hs-code-api` | mã HS gợi ý sai, thiếu dữ liệu biểu thuế/chú giải/tiền lệ |
| VPS 201 (Hermes, Fanpage) | chỉ là **nguồn đọc** ở spec này; không mở issue vào đây |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bắt lỗi bằng số đo, không bằng cảm tính (Priority: P1)

Mỗi ngày, script đọc dữ liệu bot Zalo và tính các tín hiệu lỗi có ngưỡng. Tín hiệu vượt ngưỡng thì thành một **phát hiện** (finding) có bằng chứng.

**Why this priority**: Đây là phần chắc chắn nhất (code, không AI) và bắt được loại lỗi đã gây thiệt hại thật.

**Independent Test**: Nạp một db mẫu có sẵn 9 kiểu lỗi (bảng dưới). Script ra đúng 9 phát hiện, mỗi phát hiện trỏ tới đúng `turn_id`, và không có phát hiện thừa.

**Tín hiệu v1** (mỗi dòng là một bài học từ 201 hoặc từ 001):

| Mã | Tín hiệu | Ngưỡng mặc định | Repo đích |
|---|---|---|---|
| `GATE-LEAK` | cửa từ chối vì lộ thông tin | ≥ 1 / ngày | zalo-bot |
| `GATE-MONEY` | cửa từ chối vì số tiền không căn cứ | ≥ 1 / ngày | zalo-bot (nếu gói soạn sai) |
| `TOOL-ERR` | một công cụ Cổng OZ lỗi/timeout | ≥ 5 % lượt gọi hoặc ≥ 3 lần / ngày | ozplugin |
| `TOOL-EMPTY` | công cụ trả rỗng cho đầu vào hợp lệ | ≥ 3 lần / ngày / công cụ | ozplugin hoặc hs-code-api |
| `JOB-EXPIRED` | việc nền quá 30 phút không có kết quả | ≥ 1 / ngày | ozplugin |
| `HOI-LAI` | khách hỏi lại gần giống câu trước (Jaccard ≥ 0,8) trong 30 phút sau khi bot đã trả lời | ≥ 3 phòng / ngày | zalo-bot |
| `NGUOI-THAY` | nhân viên vào phòng trong 15 phút sau câu trả lời của bot (bot trả lời chưa đủ) | ≥ 3 phòng / ngày | zalo-bot hoặc ozplugin |
| `KHACH-BUC` | khách gõ câu bực/khó hiểu ("chả hiểu", "lần thứ 3", "bot à", "người hay máy") | ≥ 2 phòng / ngày | zalo-bot |
| `XIN-LOI-TAY` | nhân viên gõ xin lỗi / "gửi nhầm" ngay sau tin bot | ≥ 1 / ngày | zalo-bot |

**Acceptance Scenarios**:

1. **Given** công cụ `tra_thue` lỗi 4/50 lượt hôm qua, **When** script chạy 07:30, **Then** có một phát hiện `TOOL-ERR` cho `tra_thue` với tỉ lệ 8 %, 4 `turn_id`, thông báo lỗi đã che bí mật.
2. **Given** một ngày không tín hiệu nào vượt ngưỡng, **When** script chạy, **Then** không có phát hiện nào và bản tin ghi "0 phát hiện".

---

### User Story 2 - Mở issue đúng repo, không trùng, không lộ khách (Priority: P1)

Mỗi phát hiện thành một GitHub issue ở đúng repo, viết tiếng Việt, có bằng chứng đã ẩn danh. Vấn đề cũ lặp lại thì cộng dồn vào issue cũ.

**Why this priority**: Phát hiện mà không tới tay người sửa thì như không có. Đây đúng là bài học 23/09: bot xin người 100 lần, không ai tới.

**Independent Test**: Chạy hai ngày liền với cùng một lỗi `TOOL-ERR tra_thue`. Ngày một mở 1 issue; ngày hai **không** mở issue mới, chỉ thêm 1 bình luận "+1 ngày, 6 lần" vào issue cũ.

**Acceptance Scenarios**:

1. **Given** một phát hiện mới, **When** mở issue, **Then** issue có: tiêu đề `[giám sát] <mã>: <tóm tắt>`, nhãn `giam-sat` + mã tín hiệu, mục *Số đo*, *Bằng chứng* (≤ 5 đoạn hội thoại đã ẩn danh + `turn_id`), *Câu hỏi cho repo* (điều cần quyết/nâng cấp), *Cách đo lại*.
2. **Given** đoạn hội thoại có tên khách, số điện thoại, số tài khoản, **When** đưa vào issue, **Then** tên thành "Khách A/B", số thành `09xx xxx 678`, không còn chuỗi nào khớp mẫu SĐT/STK/token.
3. **Given** đã mở 5 issue mới cho một repo trong ngày, **When** có phát hiện thứ 6, **Then** không mở thêm, phát hiện đó vào bản tin ngày.
4. **Given** issue giám sát đã đóng (đã sửa), **When** tín hiệu đó vẫn vượt ngưỡng 3 ngày sau khi đóng, **Then** mở lại issue kèm số đo mới ("đã sửa nhưng chưa hết").

---

### User Story 3 - Nhu cầu thật mà bot và Cổng OZ chưa đáp ứng (Priority: P2)

Mỗi tuần, Gemini đọc các phòng nhân viên phải vào thay bot cùng toàn bộ tin nhân viên trả lời tay, gom thành các nhóm nhu cầu
("khách hỏi X, chưa có công cụ nào trả lời"), rồi đặt câu hỏi nâng cấp cho đúng repo.

**Why this priority**: Đây là nguồn ý tưởng nâng cấp quý nhất (chỗ người phải làm thay máy). Nhưng nó dùng AI nên đứng sau phần code-thuần.

**Independent Test**: Lô mẫu 40 phòng, trong đó 12 phòng khách hỏi "cước vận chuyển về Hà Nội". Kết quả có một nhóm "cước vận chuyển" với 12 phòng,
đề xuất công cụ cho `ozplugin`, và mọi `turn_id` trích dẫn đều có thật trong db.

**Acceptance Scenarios**:

1. **Given** Gemini trả một nhóm có `turn_id` không tồn tại trong db, **When** script kiểm, **Then** nhóm đó bị loại, ghi vào bản tin "AI trích dẫn sai" (Hiến pháp IV: bằng chứng thắng lời khai).
2. **Given** một nhóm có < 3 phòng, **When** lọc, **Then** không mở issue (chưa đủ bằng chứng), chỉ ghi vào bản tin tuần.
3. **Given** nhóm đạt ngưỡng, **When** mở issue, **Then** issue ghi số phòng, 3–5 ví dụ đã ẩn danh, tin nhân viên đã trả lời thế nào (cách người làm), và câu hỏi cụ thể cho repo (vd "Cổng OZ có nên có công cụ `tra_cuoc_van_chuyen(tuyen, kg)` đọc bảng cước chính thức?").

---

### User Story 4 - Đọc kho cũ ở VPS 201 và Fanpage (Priority: P2)

Nạp chỉ-đọc dữ liệu cũ ở 201 (1.658 phòng FB, tin nhân viên trả lời tay) để chạy cùng bộ phân tích của US1 và US3.

**Why this priority**: Kho tình huống thật lớn nhất, có sẵn ngay, trước cả khi bot Zalo có nhiều người dùng.

**Independent Test**: Nhập một bản sao `fb-inbox.db` → bảng chuẩn hoá `nguon_201.messages`. Số tin nhập bằng số tin trong db gốc. Không có lệnh ghi nào chạm db gốc.

**Acceptance Scenarios**:

1. **Given** kết nối tới 201, **When** nhập, **Then** chỉ dùng bản sao db (copy rồi đọc), không mở db gốc ở chế độ ghi.
2. **Given** tin Page có `cua_bot = 0` nhưng là thông báo hệ thống ("đã trả lời về một bài viết"), **When** chuẩn hoá, **Then** không tính là tin nhân viên.

---

### User Story 5 - Sức khoẻ Cổng OZ (Priority: P3)

Đọc nhật ký Cổng OZ (ozplugin trên Coolify) để đo độ trễ và tỉ lệ lỗi từng công cụ, nhìn từ phía máy chủ thay vì chỉ từ phía bot.

**Why this priority**: Bot đã thấy lỗi công cụ từ phía nó (US1 `TOOL-ERR`). Nhật ký máy chủ chỉ thêm chiều sâu khi cần điều tra.

**Independent Test**: Với mẫu log 1 ngày, script ra bảng p50/p95 độ trễ và tỉ lệ lỗi theo từng công cụ, khớp với đếm tay trên mẫu.

**Acceptance Scenarios**:

1. **Given** công cụ có p95 > 30 s trong ngày, **When** tính, **Then** có phát hiện `TOOL-SLOW` gửi `ozplugin`.

---

### User Story 6 - Vòng lặp khép kín (Priority: P2)

Mỗi tuần, bản tin cho anh Thắng và nhóm nhân viên: issue đã mở, issue đã đóng, và **tín hiệu có giảm sau khi sửa không**.

**Why this priority**: Không đo lại sau khi sửa thì không biết sửa có thật hay chỉ là "đã khai sửa" (bài học 201: "đã đính chính" mà không có).

**Independent Test**: Issue `HOI-LAI` đóng ngày D. Tuần sau, bản tin có dòng "HOI-LAI: 7 phòng/ngày trước sửa → 1 phòng/ngày sau sửa".

**Acceptance Scenarios**:

1. **Given** thứ Hai 08:00 giờ VN, **When** đến giờ, **Then** nhóm nhân viên nhận một tin: số phát hiện theo mã, issue mở/đóng theo repo, so sánh trước/sau cho từng issue đã đóng trong 14 ngày.

### Edge Cases

- GitHub API lỗi hoặc hết hạn mức → phát hiện vẫn lưu db, lần chạy sau mở bù; không mất phát hiện.
- Gemini hết hạn mức miễn phí → US1 (code) vẫn chạy đủ; US3 hoãn sang hôm sau, bản tin ghi rõ.
- Một lỗi thuộc hai repo (công cụ trả rỗng vì dữ liệu HS thiếu) → mở ở repo được luật định tuyến chọn, nhắc repo kia trong nội dung.
- Khách đã yêu cầu xoá dữ liệu (001 `/xoa-du-lieu`) → không còn trong nguồn; issue cũ giữ nguyên vì đã ẩn danh.
- Giờ yên: script không gửi gì cho khách bao giờ; bản tin chỉ vào nhóm nhân viên ngoài giờ yên.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống MUST tính các tín hiệu US1 bằng code, từ db của bot, theo ngưỡng đọc từ config.
- **FR-002**: Mỗi phát hiện MUST có: mã tín hiệu, số đo, khoảng thời gian, danh sách `turn_id` bằng chứng, repo đích, dấu vân tay (fingerprint) để chống trùng.
- **FR-003**: Hệ thống MUST mở GitHub issue ở repo đích bằng một token chỉ có quyền issues (không có quyền code), với khuôn mục ở US2; trùng fingerprint thì bình luận vào issue đang mở thay vì mở mới.
- **FR-004**: Hệ thống MUST ẩn danh mọi đoạn hội thoại trước khi rời db: tên → nhãn, SĐT/STK/email → che, token → `***` (dùng `core/redact.js` của 001 + luật ẩn danh mới).
- **FR-005**: Hệ thống MUST NOT sửa code, mở PR, ghi vào db của bot, hay gửi tin cho khách.
- **FR-006**: Gemini MUST nhận toàn bộ lô của tuần trong **một** lần gọi (system instructions + dữ liệu đã ẩn danh) và MUST trả JSON theo schema cố định; script MUST kiểm mọi `turn_id` trích dẫn tồn tại, loại phần trích dẫn sai.
- **FR-007**: Trần 5 issue mới / repo / ngày; phần dư vào bản tin.
- **FR-008**: Issue đã đóng mà tín hiệu vẫn vượt ngưỡng 3 ngày liền MUST được mở lại kèm số đo mới.
- **FR-009**: Nguồn 201 MUST đọc từ bản sao db, chỉ đọc; nguồn Cổng OZ MUST đọc log chỉ đọc.
- **FR-010**: Bản tin ngày (07:30) và tuần (thứ Hai 08:00) giờ VN MUST vào nhóm nhân viên qua cửa gửi của 001 (`kind: 'digest'`).
- **FR-011**: Mỗi lần chạy MUST ghi một bản ghi: nguồn đã đọc, số tin, số phát hiện, số issue mở/bình luận, lỗi.

### Key Entities

- **Tín hiệu (Signal)**: một luật đo có mã, ngưỡng, repo đích.
- **Phát hiện (Finding)**: một lần tín hiệu vượt ngưỡng, có bằng chứng và fingerprint.
- **Nhóm nhu cầu (Need cluster)**: kết quả Gemini đã được script kiểm trích dẫn.
- **Liên kết issue (Issue link)**: fingerprint ↔ repo + số issue + trạng thái + số đo trước/sau.

## Success Criteria *(mandatory)*

- **SC-001**: Trên db mẫu có 9 lỗi cài sẵn: bắt đủ 9, 0 phát hiện thừa.
- **SC-002**: 0 issue chứa SĐT, STK, token hay tên khách thật (kiểm bằng script quét toàn bộ issue đã mở).
- **SC-003**: ≥ 80 % issue giám sát được người xử lý gắn nhãn "đúng vấn đề" trong 4 tuần đầu.
- **SC-004**: Lỗi lặp lại không sinh issue trùng: số issue mở / số fingerprint khác nhau = 1.
- **SC-005**: Mỗi issue đã đóng có số đo trước/sau trong bản tin tuần kế tiếp.
- **SC-006**: Chi phí AI = 0 đồng (Gemini AI Studio miễn phí), tối đa 1 lần gọi Gemini / tuần cho US3.

## Assumptions

- Spec 001 xong: có `messages`, `audit`, `outbox`, `customers`, `core/redact.js`, cửa gửi `digest`.
- Anh Thắng cấp một GitHub token **chỉ quyền issues** cho ba repo `zalo-bot`, `ozplugin`, `hs-code-api` (fine-grained PAT).
- Có `GEMINI_API_KEY` miễn phí (repo đã dùng biến này cho đọc ảnh).
- Truy cập 201 qua đường SSH chỉ đọc đã có của trạm oz-brain; truy cập log Cổng OZ qua Coolify: **[NEEDS CLARIFICATION: Coolify có API đọc log không, hay cần ozplugin tự xuất số đo ra một endpoint `/metrics`?]**
- Chạy cùng tiến trình bot (bộ quét) hoặc một lệnh `npm run giam-sat` theo lịch: quyết định ở `plan.md` của spec này.

## Không làm (và lý do)

- **Không để agent giám sát tự sửa code hay mở PR**: người giám sát mà kiêm luôn việc sửa thì tự chấm bài mình (201 từng báo "đã sửa" khi chưa sửa).
- **Không gắn nhãn chất lượng bằng AI cho từng tin**: tốn và không kiểm được; AI chỉ gom nhóm lô tuần, mọi số đo là code.
- **Không mở issue vào VPS 201**: 201 đang ở chế độ chỉ quan sát; dữ liệu của nó chỉ là nguồn học.
