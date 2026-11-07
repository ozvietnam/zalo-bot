# Dữ liệu

> Cập nhật: 2026-11-07 · commit: 1316cfe

Nơi bot giữ dữ liệu: SQLite cho đường lõi mới, bộ nhớ (RAM) cho đường đang chạy.

## Lược đồ SQLite

Lược đồ phiên bản `1` nằm trong `core/store/schema.js:7`, tạo bằng `migrate` khi mở store (`core/store.js:9`). Có **11 bảng**:

| Bảng | Ý nghĩa | Cột chính | Dòng |
|---|---|---|---|
| `meta` | Khoá–giá trị cấu hình, gồm `schema_version` | key, value | `core/store/schema.js:10` |
| `inbox` | Tin vào, chống xử lý trùng | update_key (khóa chính), chat_id, user_id, raw, status, received_at, claimed_at, done_at, error | `core/store/schema.js:11` |
| `chats` | Thông tin phòng/nhóm; `state` cấp phòng (chặn cả nhóm, hoặc chat 1-1) | chat_id (khóa chính), kind, title, state, state_by, state_at, state_reason, last_inbound_at, last_outbound_at | `core/store/schema.js:14` |
| `convs` | Cuộc trò chuyện theo người; `state` theo người (`bot`/`human`/`blocked`) | conv_id (khóa chính), chat_id, user_id, display_name, state, state_by, state_at, state_reason, last_inbound_at, last_outbound_at | `core/store/schema.js:17` |
| `sessions` | Phiên làm việc của người dùng | key (khóa chính), data (JSON), updated_at | `core/store/schema.js:20` |
| `outbox` | Hàng đợi tin đi | id, idem_key (duy nhất), conv_id, chat_id, turn_id, kind, text, decision, reason, status, not_before, parts_sent, attempts, next_retry_at, created_at, sent_at, ctx | `core/store/schema.js:22` |
| `jobs` | Việc nền đang chờ kết quả | id, conv_id, chat_id, session_key, pack, ma_luot, result_tool, context, status, attempts, next_poll_at, expires_at, created_at, done_at | `core/store/schema.js:27` |
| `tickets` | Phiếu chuyển nhân viên | id, conv_id, chat_id, reason, status, claimed_by, opened_at, claimed_at, closed_at, last_forward_at | `core/store/schema.js:32` |
| `audit` | Bằng chứng từng lượt | id, at, turn_id, conv_id (nullable), chat_id, type, data | `core/store/schema.js:35` |
| `messages` | Lịch sử hội thoại | id, conv_id, chat_id, turn_id, speaker, speaker_id, text, outbox_id, at | `core/store/schema.js:38` |
| `customers` | Hồ sơ khách | conv_id (khóa chính), chat_id, display_name, phone, labels, interests, first_seen_at, last_seen_at, turns, note | `core/store/schema.js:41` |

Cột `conv_id` có mặt ở `outbox`, `jobs`, `tickets`, `messages` (đều `NOT NULL`) và ở `audit`
(để trống được). Bảng `customers` đổi khoá chính từ `chat_id` sang `conv_id` nhưng vẫn giữ cột
`chat_id` (`core/store/schema.js:42`).

Có 15 chỉ mục, trong đó chỉ mục duy nhất `ux_tickets_open` bảo đảm mỗi cuộc trò chuyện (conv)
chỉ có một phiếu đang mở (`core/store/schema.js:53`). Năm chỉ mục mới theo `conv_id`:
`ix_convs_chat` (`core/store/schema.js:46`), `ix_outbox_conv` (`core/store/schema.js:48`),
`ix_jobs_conv` (`core/store/schema.js:51`), `ix_audit_conv` (`core/store/schema.js:56`),
`ix_messages_conv` (`core/store/schema.js:58`).

## Phiên (session)

- **Đường lõi (bền)**: phiên lưu trong bảng `sessions`, đọc và ghi qua `sessionApi` (`core/engine-ctx.js:50`). Khoá phiên là `convId` — `chatId` với khách lẻ, `chatId:userId` trong nhóm (`core/engine.js:100`, `core/conv.js:10`). Thời hạn mặc định 2 giờ (`core/config.js:60`), được gia hạn mỗi lượt (`core/engine-ctx.js:56`).
- **Đường đang chạy (RAM)**: phiên nằm trong một `Map` trong tiến trình (`lib/bot.js:32`), mất trắng khi khởi động lại.

## Outbox (hàng đợi tin đi)

- Mỗi tin chuẩn bị gửi ghi một dòng outbox. `idem_key` là UNIQUE, nên gửi trùng sẽ bị chặn và báo lỗi `DUPLICATE_IDEM` (`core/store/queue.js:53`).
- Bốn quyết định của cửa được đổi thành trạng thái dòng: `send` → `queued`, `drop` → `dropped`, `defer` → `deferred`, `reject` → `rejected` (`core/gate.js:13`).
- Tin dài được chia nhiều phần (`core/gate.js:74`); số phần đã gửi lưu ở `parts_sent` (`core/gate.js:75`) và cập nhật sau mỗi phần (`core/gate.js:81`). Nhờ vậy tiến trình chết giữa chừng không gửi lại phần đã bay.
- Gửi lỗi thì tăng `attempts` và hẹn lại bằng `next_retry_at` (`core/gate.js:88`); hết số lần thì báo cảnh báo.
- Cột `ctx` lưu bối cảnh để chạy lại quyết định khi quét tin hoãn (`core/gate.js:132`).
- Lúc khởi động lại, tin còn `queued` được chuyển sang trạng thái để bộ quét gửi tiếp (`core/gate.js:191`).

## Việc nền (jobs)

- Mỗi việc nền có `ma_luot` (mã lượt phía Cổng OZ) và `result_tool` (tên công cụ để hỏi kết quả).
- Ràng buộc UNIQUE trên `(pack, ma_luot)` nên không ghi trùng việc (`core/store/schema.js:31`).
- Bộ quét hỏi theo nhịp 6 giây rồi 12, 24, 48, tối đa 60 giây (`core/engine-jobs.js:6`); việc quá 30 phút thì hết hạn (`core/engine-jobs.js:8`).

## Nơi lưu dữ liệu

- Thư mục dữ liệu lấy từ biến môi trường `DATA_DIR`, mặc định `./data` (`core/config.js:55`).
- Tên tệp db là `bot.db`, ghép từ `DATA_DIR` (`scripts/giam-sat.mjs:19`).
- Trong Docker, `DATA_DIR=/app/data` và `/app/data` là một volume (`Dockerfile:6`, `Dockerfile:8`).
- Sổ ghi lượt "trượt từ vựng" là tệp JSONL theo ngày trong thư mục riêng, không lưu mã phòng hay người dùng (`lib/truot.js:3`, `lib/truot.js:28`).

## Cảnh báo: đường đang chạy chưa ghi SQLite

Đường A (qua `lib/bot.js`) chỉ giữ dữ liệu trong RAM. Tệp `bot.db` do script giám sát tự mở để đọc, và chính script cũng ghi rõ bot.db chỉ xuất hiện khi bot nhận tin đầu tiên (`scripts/giam-sat.mjs:29`). Nói cách khác: **mở `bot.db` ở production không có nghĩa là bot đang ghi dữ liệu bền**.

Lý do và việc cần làm: xem [Tiến độ](tien-do.md).

Liên quan: [Kiến trúc](kien-truc.md), [Luồng tin nhắn](luong-tin-nhan.md).
