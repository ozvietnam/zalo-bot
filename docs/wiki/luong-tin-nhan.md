# Luồng tin nhắn

> Cập nhật: 2026-11-14 · commit: 401d34a

Một tin khách đi qua những hàm nào, từ lúc vào tới lúc gửi đi.

Từ 07/11/2026 (T016) bot chạy **một đường duy nhất**: `server.js` nối thẳng vào lõi `core/`.
Thư mục `lib/` đã bị xoá hẳn; không còn đường nào tự gọi kênh để gửi tin ngoài cửa gửi.

## Đường webhook (mặc định)

```
Zalo POST /webhook/zalo
  │
  ├─ server.js:84  kiểm ZALO_MODE + đường dẫn  ── sai ──► 404
  ├─ server.js:85  so secret header (safeEqual)    ── sai ──► 403
  ├─ server.js:90  JSON.parse body                ── hỏng ─► 400
  ├─ server.js:91  trả 200 NGAY (Zalo không gửi lại)
  └─ server.js:93  engine.process(payload)  (chạy nền)
        ├─ core/engine.js:60     parse update chuẩn hoá
        ├─ core/engine.js:65-68  ghi inbox + claim (chống trùng)
        ├─ core/engine.js:76     kiểm ALLOW_USERS
        ├─ core/engine.js:87     giới hạn lượt mỗi phút
        ├─ core/engine.js:102    lấy phiên bền (SQLite)
        ├─ core/engine.js:113    hỏi Cổng OZ công cụ nào khả dụng
        ├─ core/engine.js:114    registry.pick  (chọn gói)
        ├─ core/engine.js:118    pack.handle → gọi công cụ Cổng OZ
        └─ core/engine.js:122    reply() → gate.send ──► core/gate.js:79 channel.sendText
```

Polling chạy cùng logic nhưng lấy tin từ `getUpdates`: vòng lặp ở `channels/zalo-polling.js:22`,
gọi `getUpdates` ở `channels/zalo-polling.js:31`, đưa vào engine ở `channels/zalo-polling.js:34`.

Trước khi chạy polling, bot kiểm tra xem bot thật đang có webhook không — nếu có thì dừng hẳn,
tránh xoá nhầm webhook production (`channels/zalo-bot.js:54`, `channels/zalo-polling.js:11`).

## Bảng từng bước

| Bước | Hàm | Ghi chú |
|---|---|---|
| 1 | `server.js:80` | Tạo HTTP server |
| 2 | `server.js:81` | `GET /health` trả trạng thái |
| 3 | `server.js:85` | Xác thực header `x-bot-api-secret-token` (`channels/zalo-bot.js:31`) |
| 4 | `server.js:91` | Trả 200 trước khi xử lý |
| 5 | `core/engine.js:58` | `process` — hàm chính của một lượt |
| 6 | `channels/zalo-bot.js:136` | `parseUpdate` — chuẩn hoá payload |
| 7 | `core/engine.js:65-68` | Chống trùng bằng bảng `inbox` (claim nguyên tử) |
| 8 | `core/engine.js:87` | Giới hạn lượt mỗi phút |
| 9 | `core/engine.js:114` | `registry.pick` chọn gói |
| 10 | `core/mcp.js:106` | Gọi công cụ Cổng OZ (bọc audit ở `core/engine-ctx.js:29`) |
| 11 | `core/engine.js:122` | Dựng câu trả lời + menu gói, gửi qua cửa |
| 12 | `core/gate.js:74` | Cửa tách tin theo giới hạn 2000 ký tự (`channels/zalo-bot.js:8`), gửi kèm định dạng (`channels/zalo-bot.js:25`) |

## Nhánh ảnh

- Sự kiện ảnh đi qua `packs/hs/flow-photo.js:8` (`photoFlow`).
- Nếu đang ở gói kiểm nhãn hiệu thì gọi `kiem_tra_shtt_anh` bằng ảnh (`packs/hs/flow-photo.js:13`).
- Nếu có bật đọc ảnh bằng AI thì đọc thông số và chờ khách xác nhận bằng "ok" (`packs/hs/flow-photo.js:20`,
  xử lý xác nhận ở `packs/hs/index.js:37-41`).
- Nếu không bật đọc ảnh, bot mời khách gõ bằng chữ (`packs/hs/flow-photo.js:16-19`).

## Nhánh nhóm

- Nhóm được nhận biết khi `chat_type` có chữ "group", hoặc khi `userId` khác `chatId` (`core/mention.js:4-7`).
- Trong nhóm, bot **không bắt buộc** phải được nhắc tên: nó bỏ phần nhắc tên ở đầu/cuối tin rồi vẫn trả lời
  (`core/mention.js:33`). Việc bỏ nhắc tên áp dụng cho cả chú thích ảnh (`core/engine.js:92-93`).
- Câu trả lời trong nhóm được ghi kèm tên người hỏi (`core/engine.js:19`, `core/engine.js:79`).
  Người trùng tên trong nhóm được phân biệt bằng hậu tố 2 ký tự cuối `userId` (`core/mention.js:15-29`).
- Tin không phải chữ trong nhóm thì bỏ qua, không trả lời (`core/engine.js:83`).

## Nhánh lỗi

| Lỗi | Xử lý | Chỗ xử lý |
|---|---|---|
| Sai secret webhook | Trả 403, không xử lý | `server.js:85` |
| Body JSON hỏng | Trả 400 | `server.js:90` |
| Vượt giới hạn lượt | Nhắc khách chờ 1 phút | `core/engine.js:88` (câu báo ở `core/engine.js:12`) |
| Cổng OZ lỗi | Câu báo **chung**, không kèm lỗi gốc | `packs/hs/index.js:91` (chi tiết chỉ vào log ở `packs/hs/index.js:90`) |
| Cổng OZ lỗi ở tầng lõi | Câu báo chung của lõi (có thẻ màu `{orange}`), có kèm menu gói | `core/engine.js:13` (gửi ở `core/engine.js:139`) |
| Gọi Cổng OZ lỗi khi xử lý ảnh | Câu báo chung cho khách, không lộ lỗi Gemini | `packs/hs/vision.js:26-33` |
| Cổng xong lượt nhưng máy phân loại bận (`nextAction.type = RETRY` hoặc `reasonCode = ENGINE_TIMEOUT`) | Hỏi Cổng lại, tối đa 2 lần, giãn cách 20s rồi 60s, vẫn trong ngưỡng 10 phút; hết lượt gọi lại thì trả đúng câu "AI bận…" của Cổng, không bịa mã | `packs/hs/jobs.js:32` (nhận verdict), `packs/hs/jobs.js:73` (gọi lại), giãn cách ở `packs/hs/jobs.js:29` |

## Ba đường chạy nền

- **Việc nền**: `core/engine.js:164` gọi `core/jobs.js:55`, hỏi kết quả ở `core/jobs.js:74`,
  dựng câu ở `core/jobs.js:81`, gửi qua cửa ở `core/jobs.js:89`.
- **Quét tin hoãn / tin lỗi**: `core/gate.js:176` lấy tin đến hạn rồi chạy lại quyết định (`core/gate.js:156`).
- **Khởi động lại**: `core/gate.js:198` chuyển tin dở dang sang trạng thái để quét gửi tiếp; `server.js:77` gọi hàm này
  lúc khởi động.

Đặc điểm lớn nhất của đường này: mọi tin ra đều đi qua `core/gate.js:79` (một cửa gửi), và có bản ghi audit
cho từng lượt (`core/engine.js:100`, `core/engine.js:115`, `core/engine.js:130`).

Liên quan: [Kiến trúc](kien-truc.md), [Dữ liệu](du-lieu.md), [An toàn](an-toan.md).
