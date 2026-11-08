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
| `convId` | tuỳ chọn | khoá cuộc trò chuyện: 1-1 thì `chatId`, nhóm thì `chatId:userId`. Cửa fallback `msg.convId ?? msg.chatId` (thiếu thì coi như chat 1-1) |
| `isGroup` | tuỳ chọn | cửa tự suy `msg.isGroup === true \|\| convId !== chatId`; truyền tường minh cũng được |
| `inReplyToAt` | với `reply`/`notice`/`job_result` | thời điểm tin khách được trả lời. `job_result` lấy từ `context.receivedAt` của dòng `jobs` (`core/jobs.js`, `core/jobs.js`); dòng cũ không có trường đó → `null` → coi là tin chủ động |
| `pack` | | để áp `moneyCheck` |
| `evidence` | | mảng kết quả công cụ + lời khách của lượt |

## `facts` (thi hành tự đọc từ db rồi đưa vào `decide`)
`chatState`, `idemExists`, `hasOpenJob` (conv có dòng `jobs` đang `waiting` hoặc vừa `done` mà chưa giao), `recentBotTexts` (**≤ 4 tin kèm mốc gửi** trong 15 phút, theo `conv`), `sentTodayChat` (theo conv), `sentTodayGroup` (theo chat, chỉ khi `isGroup`), `sentTodayAll` (mọi chat), `isGroup`, `now`. (`decide` không đọc đồng hồ: `now` lấy từ `facts.now`, thiếu thì từ `msg.now`, vẫn thiếu thì ném lỗi.)

Hợp đồng tầng lưu trữ: `store.outbox.recentBotMsgs(convId, sinceIso, limit) -> [{ text, at }]` (`core/store/queue.js:62`) — đọc theo cửa sổ **dài** 15 phút, còn `decide` tự lọc cửa sổ ngắn hơn cho tin trả lời trực tiếp (`core/gate.js:41`). Tên fact truyền vào `decide` vẫn là `facts.recentBotTexts`; mỗi phần tử là `{ text, at }`, chuỗi trần (không có mốc) vẫn chấp nhận và được coi như **trong** cửa sổ.

## Thứ tự kiểm (tin đầu tiên trượt thì dừng)
| # | Điều kiện | Quyết định | `reason` |
|---|---|---|---|
| 0 | `text` rỗng hoặc chỉ khoảng trắng | `reject` | `empty` |
| 1 | `idemExists` | `drop` | `duplicate-idem` |
| 2 | `chatState ∈ {human, blocked}` và `kind ∉ {staff_relay, ticket, digest}` | `reject` | `chat-human` / `chat-blocked` |
| 3a | Tin **chủ động** (`kind = job_result`, hoặc `reply`/`notice` mà `now − inReplyToAt > 10 phút`) nhưng không có việc nền đang nợ phòng này (`facts.hasOpenJob = false`) | `reject` | `proactive-no-debt` (FR-015: khách im thì máy im) |
| 3b | Tin chủ động và đang trong giờ yên | `defer` | `quiet-hours`, `notBefore` = 07:00 VN kế tiếp |
| 4 | `kind ∈ {reply, notice, job_result}` và `sentTodayChat ≥ CAP_CHAT_DAY` | `defer` + mở phiếu (theo conv) | `cap:chat` |
| 5 | như trên, `isGroup` và `sentTodayGroup ≥ CAP_GROUP_DAY` | `defer` + cảnh báo (theo chat) | `cap:group` |
| 6 | như trên và `sentTodayAll ≥ CAP_ALL_DAY` | `defer` + cảnh báo | `cap:all` |
| 7 | Jaccard(`text`, một tin trong `recentBotTexts`) ≥ 0,8 — cửa sổ **tách theo loại tin**: tin **trả lời trực tiếp** (còn mốc tin khách trong 10 phút) dùng cửa sổ **60 giây**, tin **chủ động** dùng cửa sổ **15 phút**; tin không có mốc đọc được coi như **trong** cửa sổ | `drop` | `similar:<điểm>` |
| 8 | `text` khớp mẫu lộ (đường dẫn `/home/`, `/opt/`, `C:\`, stack `at x (file:line)`, chuỗi ≥ 32 ký tự base64/hex, `Bearer `, mục trong `BANNED_PATTERNS`) | `reject` + cảnh báo | `leak:<loại>` |
| 9 | `pack.moneyCheck` và có số tiền trong `text` không thấy trong `evidence` | `reject` + mở phiếu (theo conv) | `money:<số>` |
| — | còn lại | `send` | `ok` |

### Hai khái niệm "chủ động" — đọc kỹ, dễ hiểu sai nhất
- **Bước 3a/3b (nợ việc nền, giờ yên)**: `job_result` **luôn** là tin chủ động, không có ngoại lệ. Nó luôn chịu luật `proactive-no-debt` và luật giờ yên (hiến pháp Điều II: khách im thì máy im) — kể cả khi nó trả lời đúng câu khách vừa hỏi.
- **Bước 7 (chống trùng)**: phân loại **riêng**, bằng hàm `isDirectReply` (`core/gate-decide.js:29`), **không** dùng định nghĩa chủ động của bước 3a. Ở đây `job_result` **có mốc tin khách** (`inReplyToAt`) còn trong 10 phút thì tính là **trả lời trực tiếp** → đi cửa sổ ngắn 60 giây; không có mốc (hoặc mốc đã cũ) thì mới là tin chủ động → cửa sổ dài 15 phút. Lý do: việc nền chỉ trả lời **trễ**, nên chờ Cổng OZ phân loại vài phút là chuyện thường.
- `job_result` lấy mốc tin khách ở đâu: `core/jobs.js` ghi `receivedAt` vào `context` của dòng `jobs`, rồi truyền sang `gate.send({ …, inReplyToAt })`. Dòng `jobs` cũ (trước thay đổi này) không có trường đó → `inReplyToAt = null` → vẫn là tin chủ động, giữ hành vi cũ.

Số thứ tự trong bảng này **lệch một bậc** so với chú thích trong code: code gộp ba luật trần ngày vào khối `// 4, 5` (`core/gate-decide.js:102`) và đánh số luật chống trùng là **6** (`core/gate-decide.js:108`), còn bảng này tách `cap:chat`/`cap:group`/`cap:all` thành 4/5/6 nên luật chống trùng là **7**. Thứ tự kiểm thực tế không đổi.

Số tiền = số có ≥ 1 chữ số, chỉ dùng dấu `.`/`,` ngăn nghìn hoặc thập phân (dấu cách **không** ngăn nghìn: `25 650đ` ra `650`), đi kèm `đ`, `vnd`, `đồng`, `₫`, `tr`, `triệu`, `k`, `tệ`, `¥`, `$`, `usd`. `%` **không** phải tiền (là thuế suất). `k` = ×1.000, `tr`/`triệu` = ×1.000.000; `đồng` không tính khi là từ khác (`đồng ý`). Chuỗi dài ở dòng 8 không tính khi nằm trong URL và phải có cả chữ lẫn số.
So khớp sau khi chuẩn hoá về số nguyên (bài học "1,5 tấn" và "1.234.000đ", research #6).

## Luật thi hành
1. Ghi dòng `outbox` với quyết định **trước** khi gọi kênh, kèm `ctx` (JSON: `pack.{id,moneyCheck}`, `evidenceNumbers` (chỉ số, không lưu chữ khách), `inReplyToAt`, `debt` = `hasOpenJob` lúc quyết định đầu, `staffId`, `isGroup`). `idem_key` UNIQUE nên hai luồng cùng ghi thì một luồng bị từ chối ở db. Dòng `outbox` luôn có `conv_id` (khoá theo người) và `chat_id` (nơi gửi).
2. `send` → chia tin theo 2.000 ký tự → gửi từng phần, tăng `parts_sent` sau mỗi phần → `status = sent`. `messages` chỉ ghi sau `sent` (không ghi `ticket`/`digest`).
3. Kênh lỗi → `status = failed`, `attempts += 1`, ghi audit `error`; **không** tự thử lại trong lượt. Bộ quét thử lại tối đa **3 lần**, ở **+1, +5, +15 phút** sau lần lỗi thứ 1, 2, 3 (`failed` đến hạn khi `attempts ≤ 3` và `next_retry_at` đã qua), tiếp tục từ `parts_sent`. Lần lỗi thứ 4: dừng, `next_retry_at = NULL`, `onAlert(chat, 'send-failed')` đúng một lần.
4. Mọi tin `defer` và `failed` đến hạn đều **chạy lại `decide` ĐẦY ĐỦ** với `facts` mới (phòng có thể đã sang `human`, có thể đang giờ yên), chỉ bỏ bước idem vì là chính dòng đó. Msg dựng lại từ dòng + `ctx`; `hasOpenJob = ctx.debt || nợ hiện tại`. Hệ quả có chủ ý: một `reply` bị `cap:chat` hoãn sang sáng hôm sau là tin chủ động, nên bị `reject proactive-no-debt` nếu không có nợ việc nền (phiếu đã mở lúc chạm trần). `onAlert`/`onTicket` chỉ gọi khi `reason` của dòng đổi. Ngoại lệ: dòng từng `failed` mà nay bị `reject proactive-no-debt` thì gọi `onTicket(conv, "send-failed")` một lần (khách chưa nhận được câu trả lời; phiếu khoá theo `conv_id`).
5. `cap:chat` / `cap:all` hoãn thẳng tới **07:00 VN sau nửa đêm VN kế tiếp** (một bước, không đụng giờ yên). `quiet-hours` hoãn tới 07:00 VN kế tiếp.
6. `recover()` gọi **một lần lúc khởi động**, trước sweep đầu: mọi dòng `queued` (tiến trình cũ chết giữa chừng) thành `failed`, `next_retry_at = now`, `attempts` giữ nguyên; `onAlert(chat, 'crash-mid-send')` khi `parts_sent > 0`. `sweep()` không bao giờ tự nhặt dòng `queued`. Chấp nhận gửi lặp tối đa MỘT phần đang bay lúc sập (at-least-once).
7. `sweep()` chạy chồng thì lần sau trả 0 ngay.
8. Cửa **không bao giờ** sửa `text`. Muốn khác thì gói phải trả câu khác.
9. Mỗi quyết định ghi một dòng audit `gate` (`staff_relay` thêm `leakCheck: 'skipped'`).

## Bản tin gộp (`kind = digest`, T028)

Bản tin gộp 08:00 và 17:00 giờ VN gửi cho phòng nhân viên, đi qua cửa gửi này.

- `digest` nằm trong `NEVER_PROACTIVE` (`core/gate-decide.js:18`) nên **được miễn** bước 2 (chat human/blocked), 3a/3b (nợ việc nền, giờ yên), 4/5/6 (trần ngày) và 7 (chống trùng) ở tầng cửa. Vì vậy **lớp gọi tự chịu giờ yên** (hiến pháp Điều II): `core/ops.js` chỉ bắn trong hai giờ 08:00 và 17:00 giờ VN.
- Vì cửa miễn luật giờ yên cho `digest`, dòng `digest` gửi hỏng **không được** để bộ quét nền (`sweep()`) thử gửi lại vào lúc bất kỳ — nếu không, bản tin 08:00 có thể bắn lúc 23:30 giờ VN (giờ yên) hoặc 09:00 (ngoài hai giờ bắn). `core/ops.js` hết lượt thử lại của dòng đó ngay khi gửi hỏng (kỳ đó coi như mất; bản tin kỳ sau vẫn báo số liệu mới).
- Khoá idempotency: `d:<ngày giờ VN>:<giờ>` (ví dụ `d:2026-11-05:08`) — một khoá mỗi kỳ, nên khởi động lại giữa kỳ không gửi hai lần.
- Bản tin gộp **không** ghi vào `messages` (xem luật thi hành 2).
- Nội dung chỉ gồm **số tổng hợp + tên lý do** (Điều IX): không tên, không số điện thoại, không `chat_id`/`conv_id`, không nội dung tin khách, không đường dẫn. Một tin, tối đa 2.000 ký tự (không bị chia).
