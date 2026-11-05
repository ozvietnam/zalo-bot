# Data Model: Nền tảng dùng chung (001)

Một tệp SQLite (`DATA_DIR/bot.db`, mặc định `./data/bot.db`), `PRAGMA journal_mode=WAL`, `busy_timeout=5000`.
Mọi cột thời gian là chuỗi ISO 8601 UTC (`2026-11-04T07:16:00.000Z`). Khoá không bao giờ là tên.

**Cuộc trò chuyện (`conv_id`, US8)**: chat 1-1 → `conv_id = chat_id`; trong nhóm → `conv_id = chat_id:user_id`. Các bảng theo người (`sessions`, `outbox`, `messages`, `customers`, `tickets`, `jobs`) có cột `conv_id` và mọi truy vấn trần/trùng/lịch sử/trạng thái lọc theo `conv_id`. Bảng `convs(conv_id PK, chat_id, user_id, display_name, state, state_by, state_at, state_reason, last_inbound_at, last_outbound_at)` giữ trạng thái `bot|human|blocked` theo người; bảng `chats` chỉ còn thông tin cấp phòng/nhóm (`kind`, `title`, `state` dùng cho `/chan-nhom`). `customers` đổi khoá chính sang `conv_id`.
Lược đồ tạo bằng `core/store/schema.js#migrate()` (được `openStore` gọi), có bảng `meta(key, value)` giữ `schema_version`.

## Bảng

### `inbox`: tin vào đã ghi bền (FR-016)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `update_key` | TEXT PK | `message_id`; không có thì `sha1(raw)` |
| `chat_id` | TEXT NOT NULL | |
| `user_id` | TEXT | |
| `raw` | TEXT NOT NULL | JSON update gốc |
| `status` | TEXT NOT NULL | `pending → processing → done` hoặc `failed`. `inbox.claim(key, at)` đổi `pending → processing` nguyên tử; chỉ ai claim được mới chạy gói (review T015 C1). T020: `processing` quá 5 phút coi như `pending` |
| `claimed_at` | TEXT | lúc claim |
| `received_at` | TEXT NOT NULL | |
| `done_at` | TEXT | |
| `error` | TEXT | đã che bí mật |

Ghi `INSERT OR IGNORE`: update trùng khoá thì không vào lần hai. Đây là chống trùng webhook.

### `chats`: trạng thái phòng (FR-010)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `chat_id` | TEXT PK | |
| `kind` | TEXT | `user | group | staff` |
| `title` | TEXT | tên hiển thị, chỉ để đọc |
| `state` | TEXT NOT NULL DEFAULT `bot` | `bot | human | blocked` |
| `state_by` | TEXT | user_id nhân viên, hoặc `system` |
| `state_at` | TEXT | |
| `state_reason` | TEXT | |
| `last_inbound_at` | TEXT | |
| `last_outbound_at` | TEXT | |

Chuyển trạng thái: `bot → human` (khách xin người, `/nhan`, `/tl`, gói yêu cầu); `human → bot` (chỉ `/tra-bot`);
`* → blocked` (`/chan`); `blocked → bot` (`/tra-bot`). Mỗi lần chuyển ghi một dòng audit `state-change`.

### `sessions`: phiên người dùng (FR-017)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `key` | TEXT PK | `chat_id` hoặc `chat_id:user_id` trong nhóm (giữ cách hiện tại) |
| `data` | TEXT NOT NULL | JSON: `{ goi, last, choBoSung, choXacNhanAnh, ... }` |
| `updated_at` | TEXT NOT NULL | quá `SESSION_TTL_MS` (mặc định 2 giờ) thì coi là phiên mới |

### `outbox`: tin ra và quyết định của cửa (FR-001…FR-008)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | INTEGER PK | |
| `idem_key` | TEXT UNIQUE NOT NULL | xem dưới |
| `chat_id` | TEXT NOT NULL | |
| `turn_id` | TEXT | trỏ về audit |
| `kind` | TEXT NOT NULL | `reply | notice | job_result | staff_relay | ticket | digest` |
| `text` | TEXT NOT NULL | nguyên văn, cửa không sửa |
| `decision` | TEXT NOT NULL | `send | drop | defer | reject` |
| `reason` | TEXT | vd `quiet-hours`, `similar:0.86`, `leak:path`, `cap:chat` |
| `status` | TEXT NOT NULL | `queued | sent | dropped | deferred | rejected | failed` |
| `not_before` | TEXT | với `defer` |
| `parts_sent` | INTEGER DEFAULT 0 | số phần đã gửi khi tin bị chia |
| `attempts` | INTEGER DEFAULT 0 | số lần gửi LỖI (lần lỗi thứ 4 thì dừng; 3 lần thử lại) |
| `next_retry_at` | TEXT | mốc thử lại kế tiếp; `outbox.due` lấy `failed` có `attempts ≤ 3` và mốc đã qua |
| `created_at` / `sent_at` | TEXT | |
| `ctx` | TEXT (JSON) | bối cảnh để chạy lại `decide` khi quét: `{ pack: { id, moneyCheck }, evidenceNumbers: [số], inReplyToAt, debt, staffId }`. `debt` = `hasOpenJob` lúc quyết định đầu. Chỉ lưu **số**, không lưu chữ của khách |

**Khoá idempotency**:
- trả lời: `r:<chat_id>:<update_key>:<chỉ số tin trong lượt>`
- kết quả việc nền: `j:<chat_id>:<maLuot>`
- nhân viên chuyển: `s:<update_key của lệnh /tl>`
- phiếu và bản tin: `t:<ticket_id>:<n>`, `d:<ngày>:<giờ>`

### `jobs`: việc nền Cổng OZ (FR-017, D7)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | INTEGER PK | |
| `chat_id` | TEXT NOT NULL | |
| `session_key` | TEXT NOT NULL | |
| `pack` | TEXT NOT NULL | |
| `ma_luot` | TEXT NOT NULL | UNIQUE(`pack`, `ma_luot`) |
| `result_tool` | TEXT NOT NULL | vd `ket_qua_phan_loai` |
| `context` | TEXT | JSON gói cần để dựng tin kết quả |
| `status` | TEXT NOT NULL | `waiting → polling → waiting | done | expired | failed`. `jobs.claim(id)` đổi `waiting → polling` nguyên tử trước khi hỏi Cổng; `polling` vẫn tính là nợ (`openFor`) |
| `attempts` | INTEGER DEFAULT 0 | |
| `next_poll_at` | TEXT NOT NULL | |
| `expires_at` | TEXT NOT NULL | mặc định tạo + 30 phút |
| `created_at` / `done_at` | TEXT | |

### `tickets`: phiếu cho người (FR-012)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | INTEGER PK | mã hiển thị `P<id>` |
| `chat_id` | TEXT NOT NULL | một phiếu `open` mỗi phòng |
| `reason` | TEXT NOT NULL | `khach-xin-nguoi | goi-yeu-cau | cap | gate-reject | loi-cong` |
| `status` | TEXT NOT NULL | `open | claimed | closed` |
| `claimed_by` | TEXT | |
| `opened_at` / `claimed_at` / `closed_at` | TEXT | |
| `last_forward_at` | TEXT | gộp tin khách: tối đa 1 tin nhóm / 5 phút |

### `audit`: bản ghi sự kiện (FR-018)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | INTEGER PK | |
| `at` | TEXT NOT NULL | |
| `turn_id` | TEXT | một lượt = một `update_key`, hoặc `job:<id>` |
| `chat_id` | TEXT | |
| `type` | TEXT NOT NULL | `inbound | route | tool | gate | outbound | state-change | staff-cmd | error`. Lượt bỏ qua vì chào kết ghi `outbound` với `data.skipped = 'closer'` (không có tin ra; số liệu T029 không đếm là tin gửi) |
| `data` | TEXT NOT NULL | JSON đã che bí mật; kết quả công cụ lưu `sha1` + 500 ký tự đầu |

Giữ 90 ngày; `store.audit.prune(beforeIso)` chạy mỗi ngày lúc 03:00 giờ VN.

### `messages`: toàn bộ tin của phòng (FR-024)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | INTEGER PK | |
| `chat_id` | TEXT NOT NULL | |
| `turn_id` | TEXT | |
| `speaker` | TEXT NOT NULL | `khach | bot | nhan-vien` |
| `speaker_id` | TEXT | `user_id` khách hoặc nhân viên; bot để trống |
| `text` | TEXT | nguyên văn; ảnh ghi `[ảnh] <photo_url>` + chú thích |
| `outbox_id` | INTEGER | với tin bot/nhân viên: trỏ `outbox.id`, chỉ ghi khi `status = sent` |
| `at` | TEXT NOT NULL | |

Không tự xoá. Chỉ bị xoá bởi `/xoa-du-lieu`. Không ghi bản sao vào `audit` (audit chỉ giữ hash + 500 ký tự đầu).

### `customers`: hồ sơ khách (FR-025, FR-026)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `chat_id` | TEXT PK | một hồ sơ mỗi phòng khách (1-1). Nhóm khách: một hồ sơ cho nhóm |
| `display_name` | TEXT | tên Zalo, chỉ để đọc, không bao giờ làm khoá |
| `phone` | TEXT | chỉ khi khách tự gõ; chuẩn hoá `0xxxxxxxxx`; bỏ số trong `COMPANY_PHONES` |
| `labels` | TEXT NOT NULL DEFAULT `'[]'` | JSON `[{ "nhan": "tra-cuu-hs", "nguon": "auto", "at": "…" }]` |
| `interests` | TEXT NOT NULL DEFAULT `'[]'` | JSON `[{ "mon": "máy bơm ly tâm 1.5HP", "hs": "84137090", "at": "…" }]`, giữ 20 mục mới nhất |
| `first_seen_at` / `last_seen_at` | TEXT | |
| `turns` | INTEGER DEFAULT 0 | |
| `note` | TEXT | ghi chú tay của nhân viên (`/ghi P1 …`) |

**Nhãn tự động v1** (code gắn, FR-026): `tra-cuu-hs` (dùng gói hs) · `xin-nguoi` (`wantsHuman`) · `co-sdt` (đã có số) ·
`hoi-ai` (`asksIfBot`) · `nhan-vien-da-nhan` (`/nhan`) · `bi-chan` (`/chan`). Gói thêm nhãn của mình qua `labels` trong kết quả `handle`.
Nhãn có nguồn `staff:*` không bị máy gỡ.

### `meta`
`schema_version`, `last_digest_at`, `last_backup_at`.

## Chỉ mục
`inbox(status, received_at)` · `outbox(chat_id, created_at)` · `outbox(status, not_before)` · `jobs(status, next_poll_at)` ·
`tickets(status)` · UNIQUE `tickets(chat_id)` WHERE `status IN ('open','claimed')` (một phiếu mở mỗi phòng) · `audit(turn_id)` · `audit(chat_id, at)` · `messages(chat_id, at)` · `customers(phone)`.

## Sao lưu (FR-028)
03:00 giờ VN mỗi ngày: `VACUUM INTO '<DATA_DIR>/backup/bot-YYYY-MM-DD.db'`, xoá bản cũ hơn 7 ngày, ghi `meta.last_backup_at`.
`/health` báo `backup: stale` khi bản mới nhất cũ hơn 26 giờ.
