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

## Clarifications

### Session 2026-11-04 (anh Thắng trả lời)

- Q: Phòng đã chuyển cho nhân viên thì khi nào bot được nói lại? → A: Khi nhân viên ra lệnh `/tra-bot`, hoặc phòng tự trở về `bot` sau khoảng lặng lâu (mặc định khoảng 2 giờ; anh Thắng chốt 06/11). Không tự về khi phiếu đóng.
- Q: Nhân viên nhận phiếu và trả lời khách ở đâu? → A: Nhóm Zalo nhân viên (D6). Không làm Telegram, Sheet hay web console ở spec này.
- Q: Xong 001 thì làm spec nào? → A: 005 (kênh Fanpage / Zalo OA) trước. Xem `docs/ROADMAP.md`.
- Q: Cách thực thi `tasks.md`? → A: `superpowers:subagent-driven-development`: mỗi việc một agent làm, một agent khác review trước khi sang việc kế.
- Q: Lõi tự viết hay dùng Hermes Agent? → A: **Lai.** Lõi Node trong repo này giữ mọi luật an toàn bằng code. Hermes/LLM chỉ là "não" soạn câu nháp cho gói cần (CSKH, spec 003) và không có quyền gửi. AI soạn, code quyết gửi hay không.
- Q: Lưu gì về cuộc trò chuyện? → A: **Toàn bộ tin nhắn từng phòng** (khách, bot, nhân viên) và **nhật ký kỹ thuật 90 ngày**. Không đồng bộ sang Sheet ở spec này.
- Q: Có theo dõi, phân loại khách không? → A: **Có: hồ sơ khách + nhãn tự động**, nhân viên sửa được.
- Q: Dữ liệu nằm ở đâu? → A: **SQLite trên máy chạy bot**, sao lưu mỗi ngày.
- (17:54) Anh Thắng: "Trong nhóm chat cả ngàn người, phải nhận diện được đang nói chuyện với ai, tag đúng tên và giữ nhịp phòng chat riêng." → Thêm khái niệm **cuộc trò chuyện** (`conv`): 1-1 thì `conv = chat_id`; trong nhóm thì `conv = chat_id:user_id`. Trạng thái người cầm, phiếu, hồ sơ, lịch sử, trần tin, chống trùng nội dung, hàng đợi đều theo `conv`, không theo cả nhóm. Thay giả định cũ "human áp cho cả nhóm". Xem US8.

### Session 2026-11-07 (issue #55)

- Q: Khách hỏi lại đúng câu cũ sau vài phút thì bot có trả lời không? → A: **Có.** Bước chống trùng nay **tách cửa sổ thời gian theo loại tin**, ngưỡng Jaccard vẫn `0,8`, vị trí bước trong thứ tự kiểm không đổi:
  - Tin **trả lời trực tiếp** câu khách vừa hỏi (còn mốc tin khách trong `directReplyMs` = 10 phút, kể cả `job_result` trả muộn qua việc nền) → cửa sổ **60 giây** (`dupDirectMs`).
  - Tin **chủ động** (không có mốc tin khách, hoặc mốc đã cũ hơn 10 phút) → giữ cửa sổ **15 phút** (`dupWindowMs`).
- Q: Vì sao nới? → A: Luật cũ **không nhằm** để bot im khi khách hỏi lại thật. Nó sinh ra từ sự cố #2 (`specs/001-nen-tang-chung/research.md:11`): khách bấm gửi hai lần, hoặc hai tiến trình cùng xử lý một phòng. Nay lớp chặn chính cho sự cố đó là khoá `outbox.idem_key` UNIQUE (`core/store/schema.js:23`, `core/store/queue.js:53`) và claim nguyên tử bảng `inbox` (`core/store/queue.js:24`) — hai lớp này không phụ thuộc chữ. Jaccard chỉ còn là **lưới an toàn cuối**.
- Q: "Chủ động" ở bước chống trùng có giống bước 3a không? → A: **Không, đây là hai khái niệm khác nhau.** Bước chống trùng phân loại bằng hàm riêng `isDirectReply` (`core/gate-decide.js:29`): `job_result` có mốc tin khách còn trong 10 phút thì tính là **trả lời trực tiếp**. Còn bước 3a thì `job_result` **luôn** là tin chủ động (`core/gate-decide.js:36`), nên vẫn luôn chịu luật `proactive-no-debt` và luật giờ yên (hiến pháp Điều II: khách im thì máy im).
- Q: Tin cũ không có mốc thời gian đọc được thì sao? → A: Coi như **trong** cửa sổ — mặc định an toàn (`core/gate-decide.js:119`).
- Đây là **issue #55**. **Hiến pháp không đổi**: Điều I vẫn giữ bước "trùng nội dung"; chỉ **phạm vi áp dụng** của luật chống trùng trong spec thay đổi.
- **Tiêu chí nghiệm thu:**
  1. Cùng câu hai lần trong 20 giây → chỉ **một** câu trả lời (tin thứ hai bị `drop`).
  2. Khách hỏi lại sau 3 phút → **được** trả lời (`send`).
  3. Tin chủ động trùng trong 15 phút → vẫn **bị bỏ** (`drop`).
  4. Ba mã khác nhau gửi liên tiếp → **đều** được gửi.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Không bao giờ gửi trùng, gửi sai (Priority: P1)

Khách hỏi một lần thì nhận đúng một câu trả lời, dù Zalo gửi lại webhook, bot khởi động lại giữa chừng,
hay khách bấm gửi hai lần liền.

**Why this priority**: Sự cố #1 (2.534 bình luận lặp) và #2 (3 tin gần giống) làm mất uy tín kênh nhanh hơn mọi lợi ích bot mang lại.

**Independent Test**: Phát lại 1.000 update, trong đó 10 % là bản gửi lại cùng `message_id`, và ép khởi động lại ở giữa.
Đếm tin ra trong Zalo giả lập: mỗi `message_id` có đúng một bộ tin trả lời.

**Acceptance Scenarios**:

1. **Given** một tin khách đã được trả lời, **When** Zalo gửi lại đúng update đó, **Then** bot không gửi gì thêm và audit ghi `drop: duplicate-update`.
2. **Given** bot vừa gửi một câu **chủ động** cho conv X, **When** một luồng khác định gửi câu giống ≥ 80 % cho conv X trong 15 phút, **Then** cửa bỏ tin đó và ghi lý do.
3. **Given** bot vừa trả lời khách ở conv X, **When** khách bấm gửi lại đúng câu đó trong 60 giây, **Then** cửa bỏ tin thứ hai (khách chỉ nhận một câu trả lời).
4. **Given** bot đã trả lời khách ở conv X đã lâu hơn 60 giây, **When** khách hỏi lại đúng câu đó, **Then** cửa gửi câu trả lời (không bỏ).
5. **Given** câu trả lời có chứa đường dẫn tệp nội bộ hoặc chuỗi giống token, **When** gửi, **Then** cửa từ chối, khách không nhận gì, nhóm nhân viên nhận cảnh báo.
6. **Given** phòng X đã nhận 8 tin bot trong ngày, **When** có tin thứ 9, **Then** cửa hoãn tin và mở phiếu cho người.

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
4. **Given** phòng ở `human`, **When** nhân viên gõ `/tra-bot P123`, **Then** phòng về `bot`, và bot chỉ trả lời từ tin khách **kế tiếp**, không trả lời bù tin cũ; **Given** phòng `human` không có tin nào trong khoảng lặng lâu (mặc định khoảng 2 giờ), **When** hết khoảng lặng, **Then** phòng tự trở về `bot` (audit `state-change` lý do `idle-timeout`) và bot vẫn im cho tới tin khách **kế tiếp**.
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

### User Story 7 - Lịch sử hội thoại và hồ sơ khách (Priority: P2)

Nhân viên nhận một phòng thì thấy ngay khách là ai, đã nói gì, quan tâm món gì, thuộc nhóm nào,
mà không phải hỏi lại khách. Bot cũng dùng lịch sử đó để không hỏi lại điều khách đã nói.

**Why this priority**: Nhân viên nhận phòng mà không có lịch sử thì phải hỏi lại khách (đúng lỗi "khách bị hỏi lại" ở 201).
Spec 003 (CSKH) và 004 (học từ người) cần dữ liệu này. Ưu tiên P2 vì lõi an toàn (P1) phải có trước.

**Independent Test**: Sau một hội thoại 6 tin (khách hỏi mã HS, để lại số điện thoại, xin gặp người),
phiếu trong nhóm nhân viên có tên, số điện thoại, nhãn `tra-cuu-hs`, `xin-nguoi`; `/ho-so P1` in đủ hồ sơ và 20 tin gần nhất.

**Acceptance Scenarios**:

1. **Given** bất kỳ tin vào hay ra (khách, bot, nhân viên `/tl`), **When** tin được xử lý hoặc gửi, **Then** một dòng `messages` được ghi với người nói, nội dung, giờ.
2. **Given** khách gõ "số em 0912 345 678", **When** xử lý, **Then** hồ sơ có `phone = 0912345678`; số nằm trong `COMPANY_PHONES` (số của OZ khách dán lại) thì không ghi.
3. **Given** khách dùng gói hải quan, **When** lượt xong, **Then** hồ sơ có nhãn `tra-cuu-hs` và `mon_quan_tam` thêm tên hàng/mã HS của lượt.
4. **Given** nhân viên gõ `/gan P1 khoa-hoc`, **When** xử lý, **Then** hồ sơ thêm nhãn `khoa-hoc` với nguồn `staff:<id>`; nhãn do nhân viên gắn không bị máy gỡ.
5. **Given** khách yêu cầu xoá dữ liệu, **When** nhân viên gõ `/xoa-du-lieu P1`, **Then** tin nhắn và hồ sơ của phòng bị xoá, chỉ giữ một dòng audit "đã xoá theo yêu cầu".

---

### User Story 8 - Nhóm đông người: đúng người, đúng tên, nhịp riêng (Priority: P1)

Trong nhóm Zalo hàng nghìn thành viên, mỗi người nhắc bot có **cuộc trò chuyện riêng** với bot: bot biết đang trả lời ai,
gắn đúng tên người đó, nhớ đúng ngữ cảnh của người đó, và việc của người này không làm chậm, không chặn, không lẫn sang người khác.

**Why this priority**: Nhóm là nơi một câu sai bị cả nghìn người đọc. Lẫn ngữ cảnh giữa hai người (gửi kết quả phân loại của A cho B) là lỗi "gửi nhầm phòng" của 201 nhân lên trước đám đông.

**Independent Test**: Fixture nhóm `g1` có 3 người (A, B, và C trùng tên hiển thị với A) xen kẽ 12 tin trong 2 phút:
A hỏi mã HS, B chọn gói 2, C gửi ảnh, A trả lời câu hỏi bổ sung, nhân viên `/nhan` B.
Mỗi người chỉ nhận đúng câu trả lời của mình, có gắn đúng tên; sau khi B bị nhân viên nhận, A và C vẫn được bot trả lời.

**Acceptance Scenarios**:

1. **Given** A và B cùng nhắc bot trong nhóm, **When** bot trả lời, **Then** mỗi câu mở đầu bằng `@<tên người hỏi>` và nằm trong `conv` của người đó (`g1:A`, `g1:B`).
2. **Given** A đang chờ câu hỏi bổ sung của gói 1 và B nhắn một câu bất kỳ, **When** xử lý, **Then** câu của B không bị ghép vào lượt của A.
3. **Given** nhân viên `/nhan` cuộc của B, **When** A nhắn tiếp, **Then** bot vẫn trả lời A; chỉ cuộc của B ở `human`.
4. **Given** 30 người cùng hỏi đúng một câu "8413.70.90" trong 5 phút, **When** trả lời, **Then** mỗi người nhận câu trả lời của mình (chống trùng nội dung tính theo `conv`, không theo nhóm).
5. **Given** A và C trùng tên hiển thị, **When** bot gắn tên, **Then** bot trả lời bằng chế độ trích dẫn tin (reply-to) nếu kênh hỗ trợ; nếu không, thêm 2 ký tự cuối của mã người dùng vào sau tên (`@Nguyễn Văn A ·7f`) để hai người phân biệt được.
6. **Given** việc nền của A đang chạy 3 phút, **When** B và C nhắn, **Then** B và C được xử lý ngay (hàng đợi theo `conv`, không theo nhóm).
7. **Given** nhân viên `/chan-nhom g1`, **When** bất kỳ ai nhắn, **Then** bot im với cả nhóm (chặn cấp nhóm vẫn có).

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
- Trong nhóm khách, bot chỉ phản hồi khi được @nhắc hoặc được trả lời tin; trạng thái `human` áp theo **từng người** (`conv`), chặn cả nhóm bằng `/chan-nhom` (US8, thay giả định cũ).
- Cổng OZ hết điểm hoặc trả 401 → khách nhận câu báo chung, nhóm nhân viên nhận cảnh báo một lần mỗi giờ.

## Requirements *(mandatory)*

### Functional Requirements

**Cửa gửi**
- **FR-001**: Hệ thống MUST đưa mọi tin ra (trả lời, thông báo, kết quả việc nền, tin nhân viên chuyển) qua một cửa gửi duy nhất.
- **FR-002**: Cửa gửi MUST chỉ trả một trong bốn quyết định `send | drop | defer | reject` kèm lý do, và không bao giờ sửa nội dung tin.
- **FR-003**: Cửa gửi MUST có khoá idempotency cho mỗi tin; khoá đã gửi thì không gửi lại, kể cả sau khi khởi động lại.
- **FR-004**: Cửa gửi MUST bỏ tin giống ≥ 0,8 (Jaccard trên tập từ đã chuẩn hoá) với một trong 4 tin bot gần nhất **cùng `conv`** (khoá theo người, không theo cả phòng). Cửa sổ chống trùng MUST **tách theo loại tin**: tin **trả lời trực tiếp** (còn mốc tin khách trong 10 phút) chống trùng trong **60 giây**; tin **chủ động** (không có mốc tin khách, hoặc mốc đã cũ hơn 10 phút) chống trùng trong **15 phút**. Tin không có mốc thời gian đọc được MUST coi như **trong** cửa sổ.
- **FR-005**: Cửa gửi MUST hoãn tin chủ động trong giờ yên tới 07:00 giờ VN, và hoãn kèm mở phiếu khi chạm trần theo phòng hoặc trần theo ngày.
- **FR-006**: Hệ thống MUST xử lý tin của cùng một phòng tuần tự (tin sau chờ tin trước xong).
- **FR-007**: Cửa gửi MUST từ chối tin chứa đường dẫn hệ thống, stack trace, chuỗi giống khoá/token, hoặc mục trong danh sách cấm (số điện thoại cá nhân, số tài khoản…) đọc từ config.
- **FR-008**: Với gói có `moneyCheck: true`, cửa gửi MUST từ chối tin có số tiền không xuất hiện trong bằng chứng của lượt.

**Người trước máy**
- **FR-010**: Mỗi phòng MUST có trạng thái `bot | human | blocked`, lưu bền, đổi được qua lệnh nhân viên hoặc tự trở về `bot` sau khoảng lặng lâu (mặc định khoảng 2 giờ), và ghi audit mỗi lần đổi.
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

**Lịch sử và hồ sơ khách**
- **FR-024**: Hệ thống MUST lưu mọi tin của phòng (khách, bot đã gửi, nhân viên chuyển) vào `messages`, giữ tới khi bị xoá theo yêu cầu.
- **FR-025**: Mỗi phòng khách MUST có một hồ sơ: tên hiển thị, số điện thoại (chỉ khi khách tự gõ), nhãn, món quan tâm, lần đầu/lần cuối nhắn, số lượt.
- **FR-026**: Nhãn tự động MUST do code gắn theo luật (gói đã dùng, ý định "xin người", khách để lại số…), không dùng mô hình ở spec này; nhãn có nguồn `auto` hoặc `staff:<id>`; máy không gỡ nhãn của nhân viên.
- **FR-027**: Phiếu cho người MUST kèm tóm tắt hồ sơ; nhân viên MUST xem được `/ho-so <mã>`, gắn/gỡ nhãn `/gan`, `/go`, và xoá dữ liệu `/xoa-du-lieu <mã>`.
- **FR-028**: Hệ thống MUST sao lưu db mỗi ngày lúc 03:00 giờ VN (`VACUUM INTO DATA_DIR/backup/bot-YYYY-MM-DD.db`), giữ 7 bản.
- **FR-029**: Gói MUST đọc được lịch sử và hồ sơ của phòng hiện tại qua `ctx.history(n)` và `ctx.customer` (chỉ đọc; ghi qua kết quả trả về `labels`, `interests`).

**Nhóm đông người (US8)**
- **FR-030**: Mỗi tin MUST được gán một `conv_id`: `chat_id` với chat 1-1, `chat_id:user_id` trong nhóm. Trạng thái người cầm, phiếu, hồ sơ khách, lịch sử (`ctx.history`), phiên, trần tin theo phòng, chống trùng nội dung và hàng đợi MUST dùng `conv_id`.
- **FR-031**: Trong nhóm, mọi tin bot MUST mở đầu bằng nhãn người nhận; tên trùng trong cùng nhóm MUST được phân biệt (trích dẫn tin nếu kênh hỗ trợ, không thì hậu tố 2 ký tự mã người dùng).
- **FR-032**: Trạng thái `blocked` MUST có hai cấp: theo `conv` (`/chan P<n>`) và theo cả nhóm (`/chan-nhom <chat_id>`).
- **FR-033**: Trần tin bot / ngày theo phòng (`CAP_CHAT_DAY`) MUST tính theo `conv`; thêm trần theo nhóm `CAP_GROUP_DAY` (mặc định 200) để một nhóm không ăn hết trần toàn bot.

### Key Entities

- **Phòng (Chat)**: một cuộc trò chuyện 1-1 hoặc một nhóm khách; khoá là `chat_id`, không bao giờ là tên.
- **Tin vào (Inbox item)**: một update của Zalo đã ghi bền, có trạng thái xử lý.
- **Tin ra (Outbox item)**: một tin chờ hoặc đã đi qua cửa, có khoá idempotency, quyết định và lý do.
- **Phiên (Session)**: trạng thái của người dùng trong một gói (gói đang chọn, mã vừa phân loại…).
- **Việc nền (Job)**: một `maLuot` của Cổng OZ đang chờ kết quả, gắn với phòng và gói.
- **Phiếu (Ticket)**: yêu cầu cho người, gắn với phòng, có người nhận và trạng thái.
- **Bản ghi audit (Audit record)**: một sự kiện trong một lượt.
- **Gói (Pack)**: một module nghiệp vụ theo contract.
- **Tin nhắn (Message)**: một câu trong phòng, có người nói `khach | bot | nhan-vien`.
- **Hồ sơ khách (Customer)**: một hồ sơ mỗi phòng khách; nhãn và món quan tâm có nguồn.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Phát lại 1.000 update có 10 % gửi lại và 3 lần khởi động lại ép buộc: số tin trùng = 0, số tin khách bị mất = 0.
- **SC-002**: Phòng `human`: số tin bot ra = 0 trên toàn bộ fixture eval và trên audit 7 ngày chạy thật.
- **SC-003**: Việc nền đang chạy khi khởi động lại: 100 % giao kết quả đúng một lần, trong 5 phút sau khi lên lại.
- **SC-004**: Webhook trả 200 trong < 200 ms (p95), đo trên máy dev, với 50 update đồng thời.
- **SC-005**: 21 test hiện có đều đạt sau khi chuyển gói; thêm gói mẫu không đổi tệp nào trong `core/`.
- **SC-006**: Từ phiếu tới lúc nhân viên thấy trong nhóm: < 10 giây (p95).
- **SC-007**: Mọi tin ra trong 7 ngày chạy thật đều tra được về một `turn_id` trong audit.
- **SC-008**: Số tin trong `messages` của một phòng bằng số tin khách vào cộng số tin đã gửi (không thiếu, không thừa) trên toàn bộ fixture eval.
- **SC-009**: Phiếu cho người luôn có tóm tắt hồ sơ; nhân viên không phải hỏi lại khách thông tin khách đã gõ (kiểm trên 20 phiếu chạy thật đầu tiên).

## Assumptions

- Kênh v1 là Zalo Bot Platform (`bot-api.zaloplatforms.com`) như code hiện tại; kênh khác (Zalo OA, Messenger) là spec 005.
- Chạy một tiến trình trên Coolify, tệp SQLite nằm trên volume bền.
- Cổng OZ (`mcp.uythacnhapkhau.com/mcp`) giữ nguyên giao thức MCP Streamable HTTP và cách trả `maLuot` / `DANG_XU_LY`.
- Có một nhóm Zalo nhân viên mời được bot vào; chưa có thì phiếu chỉ nằm trong db và `/cho`.
- Danh sách nhân viên (`STAFF_USERS`) do anh Thắng cấp, đọc từ biến môi trường.
