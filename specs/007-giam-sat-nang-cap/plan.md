# Implementation Plan: Agent giám sát và vòng nâng cấp repo nguồn

**Branch**: `007-giam-sat-nang-cap` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-giam-sat-nang-cap/spec.md`

## Summary

Hiện thực hóa hệ thống Agent giám sát độc lập chạy định kỳ hằng ngày (07:30 VN) và hằng tuần (thứ Hai 08:00 VN). Hệ thống đọc dữ liệu chỉ-đọc từ SQLite của bot Zalo và các nguồn phụ (kho dữ liệu máy chủ Fanpage cũ, số đo Cổng OZ), tính toán 9 tín hiệu lỗi bằng code thuần túy (không AI), gom nhóm nhu cầu bằng Gemini AI Studio (miễn phí), tự động mở hoặc bình luận GitHub issue vào đúng repo đích (`zalo-bot`, `ozplugin`, `hs-code-api`), và gửi bản tin tổng hợp vào nhóm nhân viên qua cửa gửi chuẩn `kind: 'digest'` của Spec 001.

Hệ thống tuân thủ nghiêm ngặt nguyên tắc chỉ-đọc (FR-005), bảo vệ bí mật khách hàng (FR-004), và đảm bảo vòng lặp nâng cấp khép kín đo lường trước/sau sửa đổi (US6).

## Technical Context

**Language/Version**: JavaScript (ESM), Node.js ≥ 22.13 (Docker `node:22-alpine`)

**Primary Dependencies**: Không có runtime dependencies ngoài thư viện chuẩn Node.js:
- `node:sqlite` (kết nối chỉ-đọc `DatabaseSync` với cờ `readOnly: true`)
- `node:test`, `node:assert` (chạy kiểm thử unit và contract)
- `node:crypto` (tính băm sha256 cho fingerprint, sha1 cho ẩn danh)
- `node:fs`, `node:path` (đọc ghi tệp bản tin và dữ liệu sao lưu)
- `fetch` (kết nối GitHub REST API v3, Google Gemini API, và webhook Zalo nội bộ)

**Storage**:
- Cơ sở dữ liệu nguồn: `DATA_DIR/bot.db` (chỉ-đọc tuyệt đối, không mở ở chế độ ghi).
- Lưu trữ trạng thái giám sát: `DATA_DIR/giam-sat.db` (SQLite riêng ghi nhận lịch sử các lần chạy, fingerprint issue, số đo trước/sau theo FR-011) hoặc file JSONL trong `DATA_DIR/`.
- Nguồn phụ: bản sao tệp `fb-inbox.db` (chỉ-đọc từ máy chủ Fanpage).

**Testing**: `node --test test/giam-sat/**/*.test.mjs` với fixture SQLite giả lập trong bộ nhớ (`:memory:`) hoặc file test db tạm, không gọi mạng thật khi chạy test tự động.

**Target Platform**: Lệnh CLI Node.js (`scripts/giam-sat.mjs`) chạy theo lịch định kỳ (cron job hoặc Coolify scheduled task) trong container môi trường sản xuất.

**Constraints**:
- Tuân thủ 9 nguyên tắc Hiến pháp OZ Zalo Bot.
- Tuyệt đối không sửa code bot, không mở PR, không ghi vào `bot.db` của bot (FR-005).
- Không gửi tin nhắn trực tiếp cho khách hàng (FR-005).
- Mọi dữ liệu trích dẫn rời khỏi bot phải được ẩn danh hoàn toàn (FR-004).
- Mỗi tệp mã nguồn dưới 300 dòng (Hiến pháp VI).
- Giờ giấc chuẩn hóa theo múi giờ Việt Nam (`Asia/Ho_Chi_Minh`, UTC+7).

## Constitution Check

*GATE: Kiểm tra mức độ tuân thủ 9 nguyên tắc Hiến pháp trước khi triển khai.*

| Điều | Kiểm tra hiện trạng & Ràng buộc triển khai | Kết quả |
|---|---|---|
| I. Một cửa gửi | Bản tin giám sát gửi vào nhóm nhân viên Zalo phải đi qua cửa gửi duy nhất `core/gate.js` với `kind: 'digest'`. Tuyệt đối không tự ý gọi trực tiếp API Zalo gửi khách. Kênh Telegram chỉ là kênh phụ cho CEO khi có biến môi trường. | ✅ |
| II. Người trước máy | Agent giám sát không tham gia vào luồng phản hồi khách, không can thiệp trạng thái phòng chat (`bot`/`human`/`blocked`). Khi phát hiện nhân viên vào thay bot (`NGUOI-THAY`), hệ thống chỉ ghi nhận tín hiệu giám sát để cải tiến code. | ✅ |
| III. Số tiền do code tra | Giám sát kiểm tra tín hiệu `GATE-MONEY` để phát hiện kịp thời các trường hợp cửa gửi phải chặn tin vì gói nghiệp vụ sinh số tiền không có căn cứ. | ✅ |
| IV. Bằng chứng thắng lời khai | Mọi phát hiện phải kèm danh sách `turn_id` cụ thể. Ở US3, kết quả gom nhóm của Gemini bắt buộc phải qua bước kiểm tra đối chiếu `turn_id` thật trong database; trích dẫn sai bị loại bỏ ngay lập tức. | ✅ |
| V. Tri thức một nhà | Giám sát không tự đưa ra kết luận nghiệp vụ hải quan hay luật thuế; chỉ định tuyến issue lỗi về đúng repo phụ trách (`zalo-bot` cho luồng bot, `ozplugin` cho công cụ Cổng OZ, `hs-code-api` cho dữ liệu mã và thuế). | ✅ |
| VI. Đơn giản, không phụ thuộc | Sử dụng 100% thư viện chuẩn Node.js (không dùng octokit, không dùng axios). Cấu trúc các tệp trong `scripts/giam-sat/` được chia nhỏ, đảm bảo mỗi tệp dưới 300 dòng. | ✅ |
| VII. Sai thì dừng | Khi db bot không tồn tại hoặc lỗi kết nối, script dừng lại và báo lỗi ngay, tuyệt đối không tự ý khởi tạo hoặc ghi đè schema làm hỏng `bot.db` của bot đang chạy. | ✅ |
| VIII. Trung thực | Báo cáo số đo thực tế từ database, không làm mịn hay giấu lỗi. Issue và bản tin ghi rõ nguồn gốc tự động sinh từ Agent giám sát, không giả mạo người viết. | ✅ |
| IX. Bí mật không bao giờ lộ | Tích hợp sâu `core/redact.js` và `core/sdt.js`: che toàn bộ token, khóa bí mật, đường dẫn server, số điện thoại cá nhân (09xx xxx 678), số tài khoản ngân hàng và tên khách trước khi đẩy lên GitHub issue công khai hoặc gửi bản tin. | ✅ |

## Quyết định kiến trúc & Clarifications

### 1. Mô hình thực thi: CLI chạy theo lịch vs Nhúng vào tiến trình bot (`spec.md:189`)
- **Quyết định**: Giữ mô hình **lệnh CLI chạy theo lịch** (`node scripts/giam-sat.mjs` chạy qua cron / Coolify scheduled task) lúc 07:30 sáng hằng ngày và thứ Hai lúc 08:00 sáng cho bản tin tuần.
- **Lý do**:
  1. **Độc lập và an toàn (FR-005)**: Tiến trình giám sát chạy riêng biệt, mở SQLite ở chế độ `readOnly: true`, triệt tiêu hoàn toàn rủi ro gây tranh chấp ghi (WAL lock) hoặc làm crash tiến trình chính của bot Zalo.
  2. **Khả năng quan sát độc lập**: Nếu tiến trình bot Zalo gặp sự cố dừng hoạt động, script giám sát độc lập vẫn chạy theo lịch và báo động sự cố kịp thời.
  3. **Tiết kiệm tài nguyên**: Các tác vụ nặng (tính Jaccard text toàn bộ hội thoại ngày, gọi Gemini gom nhóm tuần) chỉ chạy 1 lần trong ngày/tuần thay vì thường trực chiếm dụng RAM của tiến trình bot.

### 2. Thu thập log Cổng OZ: Coolify API vs `/metrics` Endpoint (`spec.md:188`)
- **Trạng thái**: Câu hỏi Clarification chờ xác nhận chính thức từ quản trị viên.
- **Đề xuất khuyến nghị**: **Ưu tiên sử dụng endpoint `/metrics` của ozplugin**.
- **Lý do**:
  1. Endpoint HTTP `/metrics` là chuẩn công nghiệp (tương tự chuẩn Prometheus/OpenTelemetry), trả về số liệu tổng hợp (p50, p95, tỉ lệ lỗi, số lượt gọi từng công cụ) có cấu trúc sẵn, nhẹ nhàng và ổn định.
  2. Đọc log thô qua biến môi trường `COOLIFY_API_URL` đòi hỏi cấp token quản trị (vi phạm nguyên tắc đặc quyền tối thiểu) và phải xử lý parse log thô tốn kém, dễ gãy khi định dạng log thay đổi.
  3. Khi ozplugin chưa có `/metrics`, tầng giám sát US1 (`TOOL-ERR`, `TOOL-EMPTY`) từ bảng `audit` của bot đã đáp ứng phần lớn nhu cầu đo lường từ phía client.

### 3. Xử lý 4 điểm lệch giữa code hiện tại và Spec
1. **Gửi bản tin vào Telegram vs Cửa gửi 001 `kind: 'digest'` (Lệch `scripts/giam-sat.mjs:84-86` vs FR-010)**:
   - *Giải pháp*: Tích hợp module gửi bản tin vào nhóm nhân viên Zalo qua cửa gửi lõi `core/gate.js` với `kind: 'digest'` và `chat_id: process.env.STAFF_CHAT_ID` (thông qua hộp thư riêng). Kênh Telegram trong `scripts/giam-sat/telegram.js` được giữ lại làm kênh phụ tuỳ chọn (chỉ kích hoạt khi có đủ `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID`).
2. **Khởi tạo schema ghi db `openStore` vs Nguyên tắc chỉ-đọc (Lệch `scripts/giam-sat.mjs:30-31` vs FR-005)**:
   - *Giải pháp*: Loại bỏ hoàn toàn lệnh `openStore(DB_PATH)` trong script giám sát. Mở trực tiếp bằng `new DatabaseSync(DB_PATH, { readOnly: true })`. Nếu tệp `bot.db` chưa tồn tại hoặc thiếu bảng, script báo lỗi và thoát với mã 1 (tương tự pattern ở `scripts/audit.mjs:174`).
3. **Ánh xạ người nói `speaker === 'bot_out'` vs Lõi bot (Lệch `scripts/giam-sat.mjs:38`)**:
   - *Giải pháp*: Chuẩn hóa theo đúng các giá trị trường `speaker` trong bảng `messages` của lõi bot: `'khach'` (tin khách nhắn vào), `'bot'` (tin bot gửi ra), `'nhan-vien'` (tin nhân viên trả lời qua lệnh `/tl` hoặc gõ tay). Chuyển đổi bộ lọc trong `tinh-hieu.js` từ `'user'` / `'staff'` sang đúng bộ giá trị chuẩn của lõi.
4. **Mốc thời gian UTC vs Giờ Việt Nam (Lệch `scripts/giam-sat.mjs:17,33-34` vs Ràng buộc giờ VN)**:
   - *Giải pháp*: Sử dụng hàm xử lý thời gian chuẩn từ `core/time.js` (`vnDateKey`, `vnDayBoundsUtc`). Mốc đầu ngày và cuối ngày của ngày xét $D$ phải là khoảng thời gian tương ứng với $[00:00:00, 23:59:59.999]$ giờ Việt Nam (tức từ 17:00:00 UTC của ngày $D-1$ đến 16:59:59.999 UTC của ngày $D$).

### 4. Đánh giá 3 phương án kết nối bản tin giám sát vào cửa gửi gate (FR-010)

Để đưa bản tin giám sát từ CLI độc lập vào cửa gửi duy nhất `core/gate.js` với `kind: 'digest'` tới nhóm nhân viên `STAFF_CHAT_ID` mà vẫn tuân thủ nguyên tắc chỉ-đọc của `bot.db` (FR-005), ba phương án kiến trúc đã được cân nhắc:

- **Phương án (a) Hộp thư riêng (Đã chốt & áp dụng)**:
  - *Cơ chế*: CLI `giam-sat` ghi bản tin đã ẩn danh vào hộp thư riêng (`hop-thu-giam-sat.json` hoặc SQLite riêng) nằm trong `DATA_DIR`, hoàn toàn độc lập với `bot.db`. Mỗi bản tin mang khoá `idemKey` theo kỳ (ví dụ `digest:ngay:YYYY-MM-DD` hoặc `digest:tuan:YYYY-Www`). Tiến trình bot quét hộp thư định kỳ qua vòng lặp nền 5 giây (`setInterval`), gọi `gate.send({ kind: 'digest', chatId: STAFF_CHAT_ID, idemKey, ... })`, và cập nhật trạng thái `sent` trong hộp thư.
  - *Ưu điểm*:
    1. Giữ trọn vẹn FR-005: CLI `giam-sat.mjs` mở `bot.db` với `readOnly: true`, tuyệt đối không ghi `bot.db`.
    2. Độc lập tiến trình & chịu lỗi cao: Nếu bot đang khởi động lại hoặc tắt lúc CLI chạy, bản tin vẫn nằm an toàn trong hộp thư và được quét gửi ngay khi bot hoạt động lại.
    3. Không mở thêm cổng mạng hay endpoint HTTP mới (triệt tiêu rủi ro bảo mật nội bộ).
    4. Tránh xung đột khóa: Hộp thư sử dụng cơ chế ghi nguyên tử (atomic rename file JSON), không gây tranh chấp SQLite WAL với `bot.db`.

- **Phương án (b) Mở endpoint HTTP nội bộ trên tiến trình bot (Bị loại bỏ)**:
  - *Cơ chế*: Tiến trình bot mở thêm endpoint nội bộ (ví dụ `POST /internal/digest`), CLI gọi HTTP POST để bot nhận và chuyển tiếp qua `gate.send`.
  - *Lý do loại bỏ*: Mở thêm bề mặt tấn công mạng (attack surface), đòi hỏi cơ chế xác thực riêng (shared secret / token nội bộ); nếu tiến trình bot sập đúng lúc cron chạy thì request lỗi và bản tin bị mất trừ khi CLI xây dựng hàng đợi thử lại phức tạp.

- **Phương án (c) Chạy toàn bộ giám sát trực tiếp trong tiến trình bot (Bị loại bỏ)**:
  - *Cơ chế*: Đưa logic giám sát vào một timer/scheduler chạy bên trong tiến trình chính của bot Zalo.
  - *Lý do loại bỏ*: Tác vụ tính toán 9 tín hiệu, đọc nhiều bảng dữ liệu và tính Jaccard tiêu tốn CPU/RAM, gây nguy cơ nghẽn event loop làm chậm việc phản hồi tin nhắn của khách hàng; nguy cơ tranh chấp khóa SQLite giữa luồng chat và luồng giám sát; mất tính linh hoạt của CLI (khó chạy `--dry-run`, `--ngay=...` theo nhu cầu điều tra).

## Project Structure

### Documentation (this feature)

```text
specs/007-giam-sat-nang-cap/
├── spec.md              # Đặc tả yêu cầu gốc
├── plan.md              # Kế hoạch triển khai kiến trúc (tệp này)
└── tasks.md             # Danh sách việc chi tiết (T701+) kèm bảng đối chiếu FR/SC
```

### Source Code

```text
scripts/
├── giam-sat.mjs                 # Entrypoint CLI giám sát hằng ngày & hằng tuần
└── giam-sat/
    ├── tinh-hieu.js             # Tính 9 tín hiệu bằng code thuần (US1, FR-001)
    ├── issue.js                 # Mở/bình luận GitHub issue qua REST API (US2, FR-003, FR-007, FR-008)
    ├── an-danh.js               # Ẩn danh bằng chứng: tên, SĐT, STK, token (FR-004)
    ├── digest.js                # Soạn và gửi bản tin qua cửa gửi kind:'digest' (FR-010)
    ├── telegram.js              # Kênh phụ gửi Telegram cho CEO (tuỳ chọn)
    ├── gemini-cluster.js        # Gom nhóm nhu cầu tuần qua Gemini AI Studio (US3, FR-006)
    ├── nguon-fanpage.js         # Đọc dữ liệu bản sao máy chủ Fanpage FB inbox (US4, FR-009)
    ├── cong-oz.js               # Đọc số đo sức khoẻ Cổng OZ qua /metrics (US5, FR-009)
    ├── vong-lap.js              # Đối chiếu số đo trước/sau của issue đã đóng (US6, SC-005)
    └── so-nhat-ky.js            # Ghi bản ghi thực thi từng lần chạy giám sát (FR-011)

test/
└── giam-sat/
    ├── tinh-hieu.test.mjs       # Kiểm thử 9 tín hiệu trên db fixture mẫu (SC-001)
    ├── an-danh.test.mjs         # Kiểm thử che sạch thông tin nhạy cảm (SC-002)
    ├── issue.test.mjs           # Kiểm thử tạo issue, chống trùng, trần 5 issue (SC-004)
    ├── digest.test.mjs          # Kiểm thử định dạng bản tin ngày và tuần
    ├── gemini-cluster.test.mjs  # Kiểm thử xác thực turn_id của kết quả AI
    └── vong-lap.test.mjs        # Kiểm thử đo lường trước/sau đóng issue
```

## Luồng thực thi (Data Flow)

### Luồng hằng ngày (07:30 VN):
```text
Cron/Scheduler (07:30 VN)
  │
  ▼
scripts/giam-sat.mjs (readOnly: true)
  │
  ├─► Đọc bot.db (messages, outbox, jobs, audit theo mốc ngày VN)
  │
  ├─► tinhHieu() ──► 9 tín hiệu: GATE-LEAK, GATE-MONEY, TOOL-ERR,
  │                  TOOL-EMPTY, JOB-EXPIRED, HOI-LAI, NGUOI-THAY,
  │                  KHACH-BUC, XIN-LOI-TAY
  │
  ├─► anDanhBangChung() (redact token, che SĐT qua core/sdt.js, ẩn danh tên khách)
  │
  ├─► xuLyIssue() ──► GitHub REST API (tìm issue cũ theo label, comment hoặc tạo mới ≤ 5/repo/ngày)
  │
  ├─► dungBanTin() ──► Gửi nhóm nhân viên (Zalo digest) + Telegram CEO (tuỳ chọn)
  │
  └─► ghiSoNhatKy() ──► Lưu nhật ký thực thi vào giam-sat.db / jsonl
```

### Luồng hằng tuần (Thứ Hai 08:00 VN):
```text
scripts/giam-sat.mjs --tuan
  │
  ├─► Đọc hội thoại tuần có can thiệp nhân viên (NGUOI-THAY, tin nhắn tay)
  │
  ├─► gemini-cluster.js ──► Gọi Gemini AI Studio (1 lần duy nhất trong tuần, 0 đồng)
  │                          Gom nhóm nhu cầu & gợi ý công cụ Cổng OZ
  │
  ├─► kiemTraTurnId() ──► Loại bỏ trích dẫn ảo (Hiến pháp IV)
  │
  ├─► vong-lap.js ──► Đo lại tín hiệu của các issue đã đóng trong 14 ngày
  │
  └─► Gửi bản tin tuần & mở issue nâng cấp tính năng mới
```

## Thứ tự triển khai (Phases)

1. **Phase 1: Sửa chữa 4 điểm lệch nền tảng (Foundation & Alignments)**
   - Khắc phục mở SQLite chỉ-đọc (`readOnly: true`), cấm `openStore`.
   - Chuẩn hóa thời gian theo giờ Việt Nam (`Asia/Ho_Chi_Minh`) cho truy vấn dữ liệu.
   - Chuẩn hóa ánh xạ người nói (`speaker`) khớp với lõi bot (`khach`, `nhan-vien`, `bot`).
   - Tích hợp cửa gửi bản tin `kind: 'digest'` vào nhóm nhân viên, hạ Telegram thành kênh phụ.

2. **Phase 2: Bắt lỗi số đo bằng code (US1 & US2 - Core Findings & GitHub Issues)**
   - Hoàn thiện tính toán 9 tín hiệu với fingerprint chuẩn chống trùng.
   - Xây dựng module ẩn danh bằng chứng (`an-danh.js`) dùng chung `core/redact.js` và `core/sdt.js`.
   - Hoàn thiện xử lý GitHub issue: mở mới, cộng dồn bình luận, giới hạn 5 issue/repo/ngày, tự mở lại sau 3 ngày vượt ngưỡng.
   - Kiểm thử độc lập trên fixture db 9 lỗi mẫu (SC-001).

3. **Phase 3: Vòng lặp tuần & Nhu cầu nâng cấp (US3 & US6 - Gemini Clustering & Closed Loop)**
   - Tích hợp Gemini AI Studio đọc lô hội thoại tuần, schema JSON cố định, kiểm tra tính hợp lệ của `turn_id`.
   - Xây dựng bộ đo trước/sau cho các issue giám sát đã đóng trong 14 ngày.
   - Bản tin tổng hợp sáng thứ Hai (08:00 VN).

4. **Phase 4: Mở rộng nguồn dữ liệu & Vận hành (US4, US5, Edge Cases)**
   - Nạp chỉ-đọc bản sao dữ liệu máy chủ Fanpage FB inbox (`nguon-fanpage.js`).
   - Tích hợp đọc số đo sức khỏe Cổng OZ qua endpoint `/metrics` (`cong-oz.js`).
   - Xử lý các edge cases (GitHub rate limit, Gemini lỗi, khách xoá dữ liệu).
   - Ghi sổ nhật ký thực thi (FR-011).

## Complexity Tracking

| Điểm kiến trúc | Lý do cần thiết | Giải pháp đơn giản hơn bị từ chối vì |
|---|---|---|
| Lệnh CLI chạy cron riêng biệt | Đảm bảo tuyệt đối nguyên tắc chỉ-đọc (FR-005) và không ảnh hưởng tiến trình bot | Nhúng vào tiến trình bot: nguy cơ xung đột khóa SQLite WAL và làm sập bot khi tác vụ phân tích nặng |
| Cổng `/metrics` cho Cổng OZ | Chuẩn đo lường HTTP ổn định, không phụ thuộc vào hạ tầng Coolify | Đọc log qua API Coolify: đòi hỏi cấp quyền admin Coolify, format log thô dễ thay đổi |
| Tách kênh Telegram thành phụ | Đáp ứng FR-010 (bản tin phải vào nhóm nhân viên qua kênh Zalo 001) | Chỉ dùng Telegram: nhân viên vận hành Zalo không theo dõi được bản tin chất lượng bot |
