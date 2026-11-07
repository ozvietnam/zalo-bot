# Thuật ngữ

> Cập nhật: 2026-11-07 · commit: 0842386

Trang này giải nghĩa các từ tiếng Anh và từ viết tắt dùng trong mã nguồn, trong
tài liệu và trong wiki này. Mục cuối là các từ do chính repo đặt ra, không phải
thuật ngữ chuẩn của ngành.

Từ nào không chắc chắn thì ghi rõ "chưa xác minh".

## Nền tảng Zalo

**Bot** — tài khoản tự động trả lời trên Zalo. Repo này dùng Zalo Bot Platform
chính thức, đặt tên trong `README.md:3`.

**Webhook** (cổng gọi lại) — cách Zalo đẩy tin nhắn về máy chủ của bot: mỗi khi
có tin, Zalo gọi HTTP tới một địa chỉ mà bot đăng ký. Trong repo, bot kiểm tra
chữ ký bằng `safeEqual` rồi trả HTTP 200 (`server.js:85`, hàm so chữ ký ở `channels/zalo-bot.js:31`).

**Polling** (thăm dò) — cách bot chủ động hỏi Zalo "có tin mới không" qua lệnh
`getUpdates` (`channels/zalo-bot.js:95`). Trong repo có chốt chặn: nếu bot đang có
webhook thì không chạy polling, vì xoá webhook làm bot thật ngừng nhận tin
(`channels/zalo-polling.js:11`, `channels/zalo-bot.js:49`).

**Chat / phòng chat** — nơi khách và bot nói chuyện. Mỗi chat có một `chat_id`
dùng làm khoá. Trạng thái cấp phòng là `bot` (máy trả lời) hoặc `human` (nhân viên
đã cầm phòng, bot phải im) (`core/store/schema.js:15`).

**Conv / cuộc trò chuyện** — khoá theo **người**: chat 1-1 thì `conv_id = chat_id`,
trong nhóm thì `conv_id = chat_id:user_id` (`core/conv.js:10`). Trạng thái
`bot`/`human`/`blocked` theo từng người nằm ở bảng `convs`
(`core/store/schema.js:17`).

**Text styles** (định dạng chữ) — cách làm chữ đậm, nghiêng, màu trong tin Zalo.
Repo không dùng markdown mà dùng thẻ riêng `{b}…{/b}` rồi đổi thành mảng
`text_styles` (`packs/hs/style.js:3`).

**Rich text** (tin giàu định dạng) — tin có kèm định dạng, khác tin chữ thuần.

**Official Account (OA)** — tài khoản Zalo chính thức của tổ chức. Repo hiện chưa
dùng OA; OA và Fanpage là kênh thứ hai, thuộc spec 005
(`docs/ROADMAP.md:12`).

**ZNS** — không xuất hiện trong repo. Chưa xác minh.

## Giao thức và công cụ nội bộ

**Cổng OZ** — nơi tập trung tri thức nghiệp vụ của công ty: mã HS, thuế, thủ tục,
giá. Bot gọi vào đó qua MCP. Theo Hiến pháp, tri thức nằm ở Cổng chứ không nhúng
vào mã nguồn (`.specify/memory/constitution.md:32`).

**MCP** (Model Context Protocol) — giao thức chuẩn để một ứng dụng gọi công cụ
của nơi khác. Client trong repo là `core/mcp.js`, nói JSON-RPC 2.0 qua Streamable
HTTP (`core/mcp.js:1`).

**JSON-RPC 2.0** — định dạng tin nhắn gọi hàm: mỗi yêu cầu có `method`, `params`,
`id`; mỗi câu trả lời có `id` khớp. Xem `core/mcp.js:57`.

**Streamable HTTP** — kiểu truyền HTTP cho MCP, một đầu chốt, không phải WebSocket
cũ. `initialize` trả về `Mcp-Session-Id`, client gửi kèm ở mọi request sau
(`core/mcp.js:29`).

**SSE** (Server-Sent Events) — kiểu trả lời dạng luồng, `text/event-stream`.
Client của repo nhận được cả JSON lẫn SSE (`core/mcp.js:25`).

**Tool** (công cụ) — một hàm mà Cổng OZ cung cấp, ví dụ `phan_loai_hs`,
`tra_tien_le`, `kiem_tra_shtt`. Danh sách gói khai ở `packs/hs/packages.js:142`;
mỗi gói liệt kê công cụ của mình trong trường `congCu`.

**Function calling** (gọi hàm) — cách mô hình ngôn ngữ chọn đúng một hàm cần gọi
và điền tham số. Não định tuyến trong repo dùng đúng cơ chế này
(`packs/hs/brain.js`).

**Fallback** (khoá dự phòng) — đường thay thế khi đường chính hỏng. Ở đây là
`packs/hs/llm2.js`, một cổng LLM khác theo chuẩn OpenAI.

## Kiến trúc bot

**Core** (lõi) — phần không biết nghiệp vụ: xử lý một lượt khách, chọn gói, quyết
định gửi, lưu bền. Nằm ở `core/`.

**Channel** (kênh) — phần biết cách nói chuyện với một nền tảng, không biết nghiệp
vụ. Hiện chỉ có kênh Zalo (`channels/zalo-bot.js:13`). Hợp đồng của kênh ở
`specs/001-nen-tang-chung/contracts/channel.md`.

**Pack** (gói) — phần biết nghiệp vụ, không gửi tin. Gói trả về `replies`, `jobs`
hoặc `handoff`; hợp đồng ở `specs/001-nen-tang-chung/contracts/pack.md`.

**Turn** (lượt) — một lượt xử lý của khách, gắn với một `turn_id`. Mỗi lượt sinh
một bản ghi audit (`.specify/memory/constitution.md:27`).

**Send gate** (cửa gửi) — nơi duy nhất được phép quyết định gửi, bỏ, hoãn hoặc
từ chối một tin. Hợp đồng ở `specs/001-nen-tang-chung/contracts/send-gate.md`.
Trong lõi mới, `core/gate.js` là tệp duy nhất gọi `channel.sendText`
(`core/gate.js:79`).

**Decision** (quyết định) — kết quả của cửa: `send`, `drop`, `defer` hoặc
`reject` (`core/gate.js:13`).

**Registry** (sổ đăng ký) — bộ nạp và chọn gói theo điều kiện
(`core/registry.js:34`).

**Contract** (hợp đồng) — văn bản ghi rõ giao diện giữa hai lớp, để lớp này đổi
không làm lớp kia hỏng.

**Re-export** (tái xuất) — tệp một dòng chỉ chuyển tiếp tên từ tệp khác. Thư mục
`lib/` từng chứa nhiều tệp như vậy và đã bị xoá hẳn (T016); nay mã thật nằm trực tiếp
trong `packs/hs/` và `channels/`.

**Store** (kho dữ liệu) — lớp lưu bền, ở đây là SQLite. `openStore` mở tệp cơ sở
dữ liệu (`core/store.js:9`).

**Inbox** (hộp thư đến) — bảng lưu tin khách vừa nhận, trạng thái
`pending` → `processing` → `done`, dùng để chống chạy trùng
(`core/store/schema.js:11`).

**Outbox** (hộp thư ra) — bảng lưu tin chờ gửi cùng quyết định của cửa, trạng
thái gửi và số phần đã gửi. `idem_key` là khoá duy nhất chống gửi trùng
(`core/store/schema.js:22`).

**Idempotency** (tính chống trùng) — gọi lại cùng một việc thì kết quả không
đổi và không gửi trùng tin. Ở đây là khoá `idem_key` trong outbox; cùng một
khoá, cửa trả `drop` với lý do `duplicate-idem`
(`specs/001-nen-tang-chung/contracts/send-gate.md`).

**Job** (việc nền) — việc chạy lâu, kết quả về sau qua tin `job_result`. Lưu bền
trong bảng `jobs` (`core/store/schema.js:27`).

**Handoff** (bàn giao) — chuyển phòng chat từ máy sang người nhân viên, hoặc
ngược lại. *Chưa có mã nguồn trong repo*, mới chỉ có trong đặc tả.

**Ticket** (phiếu) — phiếu giao việc cho nhân viên trong nhóm nhân viên, ví dụ
"khách cần người gọi". Bảng `tickets` đã có sẵn (`core/store/schema.js:32`),
nhưng phần tạo phiếu từ gói chưa làm.

**Audit** (bản ghi kiểm toán) — dòng ghi lại mỗi lượt: tin vào, gói đã chọn, công
cụ đã gọi, quyết định của cửa, tin ra. Bảng `audit` (`core/store/schema.js:35`).

**Session** (phiên) — trạng thái nhớ của một phòng, có thời hạn sống (TTL).
Lưu trong bảng `sessions` (`core/store/schema.js:20`).

**Quiet hours** (giờ yên) — khung 23:00–07:00 giờ VN, tin chủ động bị hoãn tới
sáng; trả lời trực tiếp tin khách vừa gửi vẫn đi
(`.specify/memory/constitution.md:55`). Hàm kiểm ở `core/time.js:12`.

**Proactive** (chủ động) — tin bot tự gửi khi khách không vừa nhắn: kết quả việc
nền, thông báo. Cửa phân biệt chủ động với trả lời trực tiếp
(`core/gate-decide.js:27`).

**Cap** (trần) — giới hạn số tin gửi: 8 tin mỗi người mỗi ngày, 200 tin mỗi
ngày mỗi nhóm và 300 tin mỗi ngày toàn hệ thống (`core/gate-decide.js:7-9`).

**Redact** (che bí mật) — thay token, khoá, số tài khoản bằng dấu che trước khi
ghi log hoặc gửi tin (`core/redact.js:16`).

**Find leak** (phát hiện rò) — kiểm tra một chuỗi xem có chứa đường dẫn tệp nội
bộ, mã stack hoặc khoá không (`core/redact.js:24`).

**Money check** (kiểm tra số tiền) — cờ của gói: nếu bật, cửa từ chối tin có số
tiền không xuất hiện trong bằng chứng của lượt (`.specify/memory/constitution.md:23`).

**Fixture** (dữ liệu mẫu) — tệp dữ liệu cố định dùng cho test hoặc eval. Ở đây
kịch bản eval là tệp `.jsonl`, mỗi dòng một bước (`eval/README.md:10`).

**Eval** (đánh giá) — bộ chạy phát lại kịch bản qua đúng lõi để đo hành vi, không
cần mạng và không tốn token (`eval/README.md:3`).

**Smoke test** (kiểm tra mồi) — bài test tối thiểu xác nhận môi trường chạy được,
ở đây là `node:sqlite` có sẵn (`test/core/smoke.test.mjs:5`).

**TTL** (thời hạn sống) — số mili giây một bản ghi còn dùng được. TTL phiên mặc
định 2 giờ (`core/config.js:60`).

**UTC** — múi giờ lưu trữ. Repo lưu UTC dạng ISO 8601 và hiển thị theo giờ Việt
Nam (`.specify/memory/constitution.md:54`).

## Hải quan và nghiệp vụ

**Mã HS** — mã phân loại hàng theo Hệ thống Hòa Cam, 8 chữ số ở Việt Nam. Bot gợi
ý mã HS, không phải kết luận phân loại.

**Mã lá** — mã 8 số nằm trong một mã 4 hoặc 6 số. Khi khách đưa mã ngắn, bot nở
mã lá bằng công cụ `tra_cay_hs` (`packs/hs/packages.js:80`).

**Mô tả hàng** — phần khách nhập để bot soát tờ khai, ví dụ tên, thương hiệu, thông
số kỹ thuật.

**Tờ khai** — tờ khai hải quan. Gói "Kiểm tra" soát mô tả hàng với mã HS trước khi
khai (`packs/hs/packages.js:307`).

**Thuế suất** — tỷ lệ tính thuế theo mã HS. Số tiền chỉ lấy từ kết quả công cụ,
không do mô hình tự tính (`.specify/memory/constitution.md:22`).

**ACFTA** — hiệp định thương mại tự do ASEAN–Trung Quốc. Gói thuế nhắc tới
"ACFTA hàng TQ" (`packs/hs/packages.js:255`).

**C/O** (Certificate of Origin) — chứng nhận xuất xứng. Gói kiểm tra tờ khai nhắc
"C/O mẫu E" (`packs/hs/packages.js:308`).

**GIR** — viết tắt của *General Interpretative Rules*, bộ quy tắc giải thích cách
áp dụng Hệ thống Hòa Cam khi phân loại. Repo chỉ nhắc trong mô tả gói phân loại
(`packs/hs/packages.js:145`).

**SHTT** (sở hữu trí tuệ) — ở đây là nhóm hàng có rủi ro nhãn hiệu; gói 6 kiểm
bằng công cụ `kiem_tra_shtt` (`packs/hs/packages.js:368`).

**Tiền lệ** — văn bản trước đây đã phân loại một mã cụ thể, dùng làm căn cứ khi
điều chỉnh. Gói pháp luật tra tiền lệ từ công cụ `tra_tien_le`
(`packs/hs/packages.js:336`).

**TB-TCHQ** — Thông tư của Tổng cục Hải quan; nơi lưu tiền lệ phân loại
(`packs/hs/packages.js:336`).

**Chính sách nhập khẩu** — cấm, giấy phép, kiểm tra chuyên ngành theo mã HS. Gói 2
tóm tắt phần này bằng công cụ `tra_thue_tuc_nhap_khau`.

**CAN_DU_KIEN** — mã trạng thái: lượt phân loại thiếu dữ kiện, bot phải hỏi khách
thêm (`packs/hs/packages.js:192`).

**TIEN_LE_RONG** — mã trạng thái: công cụ tra tiền lệ không trả về tiền lệ nào
(`packs/hs/packages.js:70`).

**GO_LAI** — mã trạng thái: khách gõ lại hoặc sửa mô tả hàng (`packs/hs/miss-log.js:3`).

**Sổ trượt từ vựng** — sổ ghi lại các lượt "trượt" (thiếu dữ kiện, không có tiền
lệ, khách gõ lại) để ca đêm quét, nạp điển đồng nghĩa hoặc mở issue. Ghi mỗi
ngày một tệp JSONL, **không lưu mã chat hay mã người dùng** (`packs/hs/miss-log.js:4`).

## Trạng thái và quy ước nội bộ

*Dùng trong tài liệu và log, không phải thuật ngữ chuẩn.*

- `bot` / `human` — trạng thái phòng chat: máy trả lời, hoặc nhân viên đã cầm phòng và bot phải im (`.specify/memory/constitution.md:16`).
- `reply`, `notice`, `job_result`, `staff_relay`, `ticket`, `digest` — các loại tin mà cửa gửi phân biệt. `staff_relay`, `ticket` và `digest` không bao giờ chủ động (`core/gate-decide.js:16`).
- `sent`, `queued`, `dropped`, `deferred`, `rejected`, `failed` — trạng thái của một dòng trong outbox (`core/gate.js:13`).
- `pending` → `processing` → `done` — vòng đời của một lượt trong bảng `inbox`.
- `skip` — một lượt bị bỏ qua: trùng, không thuộc danh sách người dùng, vượt giới hạn tần suất, khách chỉ nói lời cảm ơn. Lý do cụ thể nằm trong audit.

## Trang liên quan

- [Kiến trúc](kien-truc.md) — vị trí từng lớp trong mã nguồn.
- [Gói nghiệp vụ](goi-nghiep-vu.md) — 7 gói và công cụ của từng gói.
- [Luồng tin nhắn](luong-tin-nhan.md) — đi theo một lượt khách.
- [An toàn](an-toan.md) — các nguyên tắc của Hiến pháp.
