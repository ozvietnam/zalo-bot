# Eval: phát lại kịch bản qua đúng lõi

`npm run eval` chạy mọi `eval/fixtures/*.jsonl` qua lõi thật (SQLite, cửa gửi, engine, gói `hs`) với Zalo, Cổng OZ
và đồng hồ giả lập. Không mạng, không tốn token. In `eval: đạt/tổng`; có kịch bản trượt thì thoát 1 (chặn merge, Hiến chương mục cổng merge).

Chạy thư mục khác: `node eval/run.mjs --dir <thư mục>`.

## Định dạng

Mỗi dòng một bước (dòng bắt đầu `//` là ghi chú). Giờ mặc định 2026-11-04 10:00 VN; mọi mốc giờ ghi UTC.

| Bước | Ý nghĩa |
|---|---|
| `{"step":"mcp","tool":"phan_loai_hs","returns":[r1,r2]}` | Cổng giả: lần gọi thứ n trả `returns[n-1]`, hết thì lặp phần tử cuối. Công cụ không khai = Cổng không có công cụ đó |
| `{"step":"in","update":{"id":"m1","text":"…","chatId":"c1"}}` | Khách nhắn (mặc định `c1`/`u1`, tin 1-1). Sau đó chạy việc nền tới khi xong; thêm `"drain":false` để không chạy |
| `{"step":"advance","by":"10m"}` / `{"step":"at","time":"…Z"}` | Nhảy đồng hồ rồi chạy việc đến hạn |
| `{"step":"restart"}` | Đóng lõi, mở lại cùng tệp SQLite, rồi khôi phục đúng như `server.js` lúc khởi động: `gate.recover()` → `engine.recover()` (T020) |
| `{"step":"expect","sentTo":"c1","count":2,"match":"…","notMatch":"…"}` | Đếm và so chữ (regex, không phân biệt hoa thường) mọi tin đã gửi tới phòng |
| `{"step":"staff","text":"/nhan P1"}` | Lệnh nhân viên — chưa có (T025), gặp là trượt |

## Kịch bản hiện có

| Tệp | Sự cố (`specs/001-nen-tang-chung/research.md` §1) |
|---|---|
| `retry-webhook` | #1 Zalo gửi lại cùng tin → trả lời đúng một lần |
| `double-tap` | #2 Khách gửi 2 lần cùng chữ → không nhận 2 câu giống nhau |
| `silent-customer` | #5 Đã trả kết quả, khách im → không tự nhắn thêm |
| `leak` | #7 Cổng trả đường dẫn tệp nội bộ → không lộ cho khách |
| `restart-mid-job` | #11 Khởi động lại giữa lúc phân loại → kết quả vẫn tới |
| `quiet-hours` | #12 Giờ yên 23:00–07:00 VN → tin chủ động hoãn tới sáng |
| `cong-ai-ban` | 06/11/2026: Cổng báo "AI bận" (MiniMax 429) → báo đúng, không bịa mã |

## Còn thiếu so với T030 (chờ tính năng)

| Kịch bản | Chờ |
|---|---|
| `human-room` (#4: nhân viên cầm phòng thì bot im) | T022–T026 handoff |
| `is-bot` (#9: hỏi "người hay máy" không nhận câu khuôn lặp) | T023 |
| `ho-so-khach` (US7) | T033–T036 |
