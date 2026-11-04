# Contract: Cửa gửi (Send Gate)

`core/gate.js`. Hai phần: **quyết định** (hàm thuần, không I/O, test dễ) và **thi hành** (ghi `outbox`, gọi kênh).

```js
// Quyết định, thuần
decide(msg, facts, rules) -> { decision: 'send'|'drop'|'defer'|'reject', reason: string, notBefore?: string }

// Thi hành: lõi chỉ gọi hàm này để gửi
send(msg) -> Promise<{ id, decision, reason, status }>
```

## `msg`
| Trường | | |
|---|---|---|
| `idemKey` | bắt buộc | xem `data-model.md` |
| `chatId`, `turnId`, `kind`, `text` | bắt buộc | `kind ∈ reply | notice | job_result | staff_relay | ticket | digest` |
| `inReplyToAt` | với `reply`/`notice` | thời điểm tin khách được trả lời |
| `pack` | | để áp `moneyCheck` |
| `evidence` | | mảng kết quả công cụ + lời khách của lượt |

## `facts` (thi hành tự đọc từ db rồi đưa vào `decide`)
`chatState`, `idemExists`, `hasOpenJob` (phòng có dòng `jobs` đang `waiting` hoặc vừa `done` mà chưa giao), `recentBotTexts` (≤ 4 tin trong 15 phút), `sentTodayChat`, `sentTodayAll`, `now`. (`decide` không đọc đồng hồ: `now` lấy từ `facts.now`, thiếu thì từ `msg.now`, vẫn thiếu thì ném lỗi.)

## Thứ tự kiểm (tin đầu tiên trượt thì dừng)
| # | Điều kiện | Quyết định | `reason` |
|---|---|---|---|
| 0 | `text` rỗng hoặc chỉ khoảng trắng | `reject` | `empty` |
| 1 | `idemExists` | `drop` | `duplicate-idem` |
| 2 | `chatState ∈ {human, blocked}` và `kind ∉ {staff_relay, ticket, digest}` | `reject` | `chat-human` / `chat-blocked` |
| 3a | Tin **chủ động** (`kind = job_result`, hoặc `reply`/`notice` mà `now − inReplyToAt > 10 phút`) nhưng không có việc nền đang nợ phòng này (`facts.hasOpenJob = false`) | `reject` | `proactive-no-debt` (FR-015: khách im thì máy im) |
| 3b | Tin chủ động và đang trong giờ yên | `defer` | `quiet-hours`, `notBefore` = 07:00 VN kế tiếp |
| 4 | `kind ∈ {reply, notice, job_result}` và `sentTodayChat ≥ CAP_CHAT_DAY` | `defer` + mở phiếu | `cap:chat` |
| 5 | như trên và `sentTodayAll ≥ CAP_ALL_DAY` | `defer` + cảnh báo | `cap:all` |
| 6 | Jaccard(`text`, một tin trong `recentBotTexts`) ≥ 0,8 | `drop` | `similar:<điểm>` |
| 7 | `text` khớp mẫu lộ (đường dẫn `/home/`, `/opt/`, `C:\`, stack `at x (file:line)`, chuỗi ≥ 32 ký tự base64/hex, `Bearer `, mục trong `BANNED_PATTERNS`) | `reject` + cảnh báo | `leak:<loại>` |
| 8 | `pack.moneyCheck` và có số tiền trong `text` không thấy trong `evidence` | `reject` + mở phiếu | `money:<số>` |
| — | còn lại | `send` | `ok` |

Số tiền = số có ≥ 1 chữ số, chỉ dùng dấu `.`/`,` ngăn nghìn hoặc thập phân (dấu cách **không** ngăn nghìn: `25 650đ` ra `650`), đi kèm `đ`, `vnd`, `đồng`, `₫`, `tr`, `triệu`, `k`, `tệ`, `¥`, `$`, `usd`. `%` **không** phải tiền (là thuế suất). `k` = ×1.000, `tr`/`triệu` = ×1.000.000; `đồng` không tính khi là từ khác (`đồng ý`). Chuỗi dài ở dòng 7 không tính khi nằm trong URL và phải có cả chữ lẫn số.
So khớp sau khi chuẩn hoá về số nguyên (bài học "1,5 tấn" và "1.234.000đ", research #6).

## Luật thi hành
1. Ghi dòng `outbox` với quyết định **trước** khi gọi kênh, kèm `ctx` (JSON: `pack.{id,moneyCheck}`, `evidenceNumbers` (chỉ số, không lưu chữ khách), `inReplyToAt`, `debt` = `hasOpenJob` lúc quyết định đầu, `staffId`). `idem_key` UNIQUE nên hai luồng cùng ghi thì một luồng bị từ chối ở db.
2. `send` → chia tin theo 2.000 ký tự → gửi từng phần, tăng `parts_sent` sau mỗi phần → `status = sent`. `messages` chỉ ghi sau `sent` (không ghi `ticket`/`digest`).
3. Kênh lỗi → `status = failed`, `attempts += 1`, ghi audit `error`; **không** tự thử lại trong lượt. Bộ quét thử lại tối đa **3 lần**, ở **+1, +5, +15 phút** sau lần lỗi thứ 1, 2, 3 (`failed` đến hạn khi `attempts ≤ 3` và `next_retry_at` đã qua), tiếp tục từ `parts_sent`. Lần lỗi thứ 4: dừng, `next_retry_at = NULL`, `onAlert(chat, 'send-failed')` đúng một lần.
4. Mọi tin `defer` và `failed` đến hạn đều **chạy lại `decide` ĐẦY ĐỦ** với `facts` mới (phòng có thể đã sang `human`, có thể đang giờ yên), chỉ bỏ bước idem vì là chính dòng đó. Msg dựng lại từ dòng + `ctx`; `hasOpenJob = ctx.debt || nợ hiện tại`. Hệ quả có chủ ý: một `reply` bị `cap:chat` hoãn sang sáng hôm sau là tin chủ động, nên bị `reject proactive-no-debt` nếu không có nợ việc nền (phiếu đã mở lúc chạm trần). `onAlert`/`onTicket` chỉ gọi khi `reason` của dòng đổi.
5. `cap:chat` / `cap:all` hoãn thẳng tới **07:00 VN sau nửa đêm VN kế tiếp** (một bước, không đụng giờ yên). `quiet-hours` hoãn tới 07:00 VN kế tiếp.
6. `recover()` gọi **một lần lúc khởi động**, trước sweep đầu: mọi dòng `queued` (tiến trình cũ chết giữa chừng) thành `failed`, `next_retry_at = now`, `attempts` giữ nguyên; `onAlert(chat, 'crash-mid-send')` khi `parts_sent > 0`. `sweep()` không bao giờ tự nhặt dòng `queued`. Chấp nhận gửi lặp tối đa MỘT phần đang bay lúc sập (at-least-once).
7. `sweep()` chạy chồng thì lần sau trả 0 ngay.
8. Cửa **không bao giờ** sửa `text`. Muốn khác thì gói phải trả câu khác.
9. Mỗi quyết định ghi một dòng audit `gate` (`staff_relay` thêm `leakCheck: 'skipped'`).
