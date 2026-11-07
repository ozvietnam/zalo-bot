# Luồng tin nhắn

> Cập nhật: 2026-11-07 · commit: 1316cfe

Một tin khách đi qua những hàm nào, từ lúc vào tới lúc gửi đi. Có **hai đường**; đường A đang chạy, đường B là lõi mới.

## Đường A — đang chạy (webhook)

```
Zalo POST /webhook/zalo
  │
  ├─ server.js:62  kiểm ZALO_MODE + đường dẫn  ── sai ──► 404
  ├─ server.js:63  so secret header (safeEqual)    ── sai ──► 403
  ├─ server.js:69  JSON.parse body                ── hỏng ─► 400
  ├─ server.js:71  trả 200 NGAY (Zalo không gửi lại)
  └─ server.js:73  bot.handleUpdate(payload)  (chạy nền)
        ├─ lib/bot.js:107  parseUpdate            (ra update chuẩn hoá)
        ├─ lib/bot.js:109  chống trùng messageId
        ├─ lib/bot.js:110  kiểm ALLOW_USERS
        ├─ lib/bot.js:120  giới hạn lượt mỗi phút
        ├─ lib/bot.js:125  lấy phiên (RAM)
        ├─ lib/bot.js:126  hỏi Cổng OZ công cụ nào khả dụng
        ├─ lib/bot.js:165  routeThongMinh  (não định tuyến)
        ├─ lib/bot.js:194  pkg.chay → gọi công cụ Cổng OZ
        └─ lib/bot.js:196  send(...)  ──► lib/bot.js:112 zalo.sendText
                                                    └─► channels/zalo-bot.js:102 tách + gửi
```

Polling chạy cùng logic nhưng lấy tin từ `getUpdates`: `server.js:79` mở vòng lặp, `server.js:88` gọi `getUpdates`, `server.js:91` đưa vào `bot.handleUpdate`.

Trước khi chạy polling, bot kiểm tra xem bot thật đang có webhook không — nếu có thì dừng hẳn, tránh xoá nhầm webhook production (`server.js:133`, `channels/zalo-bot.js:54`).

## Bảng từng bước (đường A)

| Bước | Hàm | Ghi chú |
|---|---|---|
| 1 | `server.js:58` | Tạo HTTP server |
| 2 | `server.js:59` | `GET /health` trả trạng thái |
| 3 | `server.js:63` | Xác thực header `x-bot-api-secret-token` |
| 4 | `server.js:71` | Trả 200 trước khi xử lý |
| 5 | `lib/bot.js:106` | `handleUpdate` — hàm chính |
| 6 | `channels/zalo-bot.js:136` | `parseUpdate` — chuẩn hoá payload |
| 7 | `lib/bot.js:109` | Chống trùng bằng `messageId` |
| 8 | `lib/bot.js:120` | Giới hạn lượt mỗi phút |
| 9 | `lib/bot.js:165` | Não định tuyến chọn gói |
| 10 | `lib/mcp.js:105` | Gọi công cụ Cổng OZ |
| 11 | `lib/bot.js:196` | Dựng câu trả lời + menu gói |
| 12 | `channels/zalo-bot.js:102` | Tách tin theo giới hạn 2000 ký tự (`channels/zalo-bot.js:8`), gửi kèm định dạng (`channels/zalo-bot.js:105`) |

## Nhánh ảnh

- Sự kiện ảnh đi qua `lib/bot.js:76` (`handlePhoto`).
- Nếu đang ở gói kiểm nhãn hiệu thì gọi `kiem_tra_shtt_anh` bằng ảnh (`lib/bot.js:80`).
- Nếu có bật đọc ảnh bằng AI thì đọc thông số và chờ khách xác nhận bằng "ok" (`lib/bot.js:141`).
- Nếu không bật đọc ảnh, bot mời khách gõ bằng chữ (`lib/bot.js:86`).

## Nhánh nhóm

- Nhóm được nhận biết khi `chat_type` có chữ "group", hoặc khi `userId` khác `chatId` (`lib/bot.js:11`).
- Trong nhóm, bot **không bắt buộc** phải được nhắc tên: nó bỏ phần nhắc tên ở đầu/cuối tin rồi vẫn trả lời (`lib/bot.js:17`). Ở đường lõi, việc bỏ nhắc tên áp dụng cho cả chú thích ảnh (`core/engine.js:91`).
- Câu trả lời trong nhóm được ghi kèm tên người hỏi (`lib/bot.js:112`).
- Tin không phải chữ trong nhóm thì bỏ qua, không trả lời (`lib/bot.js:116`).

## Nhánh lỗi

| Lỗi | Xử lý | Chỗ xử lý |
|---|---|---|
| Sai secret webhook | Trả 403, không xử lý | `server.js:63` |
| Body JSON hỏng | Trả 400 | `server.js:69` |
| Vượt giới hạn lượt | Nhắc khách chờ 1 phút | `lib/bot.js:121` |
| Cổng OZ lỗi | Câu báo **kèm 120 ký tự đầu của lỗi gốc** — chưa đúng điều IX hiến pháp ở đường đang chạy | `lib/bot.js:214` |
| Cổng OZ lỗi (đường lõi) | Câu báo chung, không kèm lỗi gốc | `packs/hs/index.js:91` |
| Gọi Cổng OZ lỗi khi xử lý ảnh | Câu báo chung cho khách | `lib/bot.js:133` |

## Đường B — lõi mới (chưa nối vào `server.js`)

```
update ─► core/engine.js:58  process
            ├─ core/engine.js:65-68  ghi inbox + claim nguyên tử
            ├─ core/engine.js:73-75  convId + chats/convs.upsertSeen
            ├─ core/engine.js:76  kiểm ALLOW_USERS
            ├─ core/engine.js:85  giới hạn lượt
            ├─ core/engine.js:98  audit inbound (đã che bí mật)
            ├─ core/engine.js:104 ghi tin khách vào messages
            ├─ core/engine.js:106 câu chào kết ──► im
            ├─ core/engine.js:112 registry.pick  (chọn gói)
            ├─ core/engine.js:116 pack.handle
            ├─ core/engine.js:120 gửi từng câu qua cửa (core/engine.js:49)
            └─ core/engine.js:126 ghi việc nền vào jobs
```

Ba đường nữa chạy nền:

- **Việc nền**: `core/engine.js:160` gọi `core/engine-jobs.js:24`, hỏi kết quả ở `core/engine-jobs.js:44`, dựng câu ở `core/engine-jobs.js:51`, gửi qua cửa ở `core/engine-jobs.js:55`.
- **Quét tin hoãn / tin lỗi**: `core/gate.js:169` lấy tin đến hạn rồi chạy lại quyết định.
- **Khởi động lại**: `core/gate.js:191` chuyển tin dở dang sang trạng thái để quét gửi tiếp.

Khác biệt lớn nhất so với đường A: mọi tin ra đều đi qua `core/gate.js:79` (một cửa gửi), và có bản ghi audit cho từng lượt.

Liên quan: [Kiến trúc](kien-truc.md), [Dữ liệu](du-lieu.md), [An toàn](an-toan.md).
