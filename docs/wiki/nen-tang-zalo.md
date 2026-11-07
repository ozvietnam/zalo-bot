# Nền tảng Zalo

> Cập nhật: 2026-11-07 · commit: 64a728a

Trang này mô tả nền tảng mà bot đang dùng: **Zalo Bot Platform** (bot tự nhắn qua Zalo).

Có hai loại nguồn, và trang này luôn nói rõ nguồn nào đang được dùng:

- **Theo tài liệu chính thức**: các link dẫn trong trang này (mục 1–7). Tất cả link đều đã mở thật trước khi ghi.
- **Theo code trong repo**: mọi nhận định đều kèm `tệp:dòng`, mở ra là đối chiếu được.

Chỗ nào chưa có tài liệu chính thức trong tay thì ghi "**chưa xác minh**" — không đoán.

## 1. Bot API: cách gọi

Tài liệu chính thức ([Gọi API](https://bot.zapps.me/docs/call-api/)):

- Đường dẫn: `https://bot-api.zaloplatforms.com/bot<BOT_TOKEN>/<functionName>`. Token bot nằm ngay trong đường dẫn.
- Cả `GET` và `POST` đều dùng được. Tham số truyền theo 4 kiểu: query string, form, JSON, multipart (cho file).
- Bắt buộc HTTPS, encoding UTF-8, tên hàm phân biệt hoa thường.
- Mọi lời gọi trả về một object JSON có `ok`, `result`, `description`, `error_code`.

Code trong repo chỉ dùng `POST` với body JSON:

- Base URL mặc định: `channels/zalo-bot.js:10`.
- Ghép base + token + tên hàm: `channels/zalo-bot.js:71`.
- Gửi `POST` kèm `Content-Type: application/json`: `channels/zalo-bot.js:74`.
- Timeout mặc định của một lệnh bot: 40.000 ms (`channels/zalo-bot.js:73`).
- Lỗi: chỉ nêu tên phương thức, không log token (`channels/zalo-bot.js:83-85`).

## 2. Các lệnh bot repo đang dùng

| Lệnh | Việc | Chỗ gọi trong repo | Tài liệu |
|---|---|---|---|
| `getMe` | Lấy thông tin bot (tên) | `channels/zalo-bot.js:94`, dùng ở `server.js:112` | [getMe](https://bot.zapps.me/docs/apis/getMe/) |
| `getUpdates` | Nhận tin bằng long polling | `channels/zalo-bot.js:95`, dùng ở `server.js:88` | [getUpdates](https://bot.zapps.me/docs/apis/getUpdates/) |
| `sendMessage` | Gửi tin | `channels/zalo-bot.js:27` và `channels/zalo-bot.js:106` | [sendMessage](https://bot.zapps.me/docs/apis/sendMessage/) |
| `sendChatAction` | Báo trạng thái "đang nhập" | `channels/zalo-bot.js:29` và `channels/zalo-bot.js:96` | [sendChatAction](https://bot.zapps.me/docs/apis/sendChatAction/) |
| `setWebhook` | Đặt webhook | `channels/zalo-bot.js:97`, gọi ở `scripts/set-webhook.mjs:15` | [setWebhook](https://bot.zapps.me/docs/apis/setWebhook/) |
| `deleteWebhook` | Xoá webhook | `channels/zalo-bot.js:98`, gọi ở `server.js:80` và `scripts/set-webhook.mjs:17` | [deleteWebhook](https://bot.zapps.me/docs/apis/deleteWebhook/) |
| `getWebhookInfo` | Xem webhook đang đặt | `channels/zalo-bot.js:99`, đọc ở `channels/zalo-bot.js:57` | [getWebhookInfo](https://bot.zapps.me/docs/apis/getWebhookInfo/) |

Tài liệu còn mô tả `sendPhoto`, `sendSticker`, `sendVoice`, `testWebhook` — repo **chưa** dùng tới.

## 3. Gửi tin

Theo [tài liệu `sendMessage`](https://bot.zapps.me/docs/apis/sendMessage/):

- `POST` với body JSON, tối thiểu là `{"chat_id": "...", "text": "..."}`.
- `text` dài **từ 1 đến 2000 ký tự**.
- Định dạng chữ: `text_styles` là mảng các đoạn `{"start": 0, "len": 5, "st": ["b", "c_db342e"]}`. `start` và `len` tính theo **UTF-16 code unit**. `st` gồm mã chữ đậm, nghiêng, gạch chân, gạch ngang, màu, cỡ chữ, danh sách và thụt lề. Nếu có `parse_mode` thì `parse_mode` thắng, `text_styles` bị bỏ qua.

Code trong repo:

- Hạn mức 2000 ký tự đặt sẵn: `channels/zalo-bot.js:8`.
- Client cũ tự chia tin dài rồi gửi từng phần: `channels/zalo-bot.js:102-107`.
- Kênh mới theo contract chỉ gửi **một** phần, vì cửa gửi đã chia sẵn: `channels/zalo-bot.js:22-28`.
- Bot dùng thẻ riêng `{b}…{/b}` rồi đổi sang `text_styles`: `packs/hs/style.js:44` và `packs/hs/style.js:97`; gắn vào body ở `channels/zalo-bot.js:25-26` và `channels/zalo-bot.js:105`.
- Trạng thái "đang nhập": `sendChatAction` với `action` là `typing` (`channels/zalo-bot.js:29`). Tài liệu liệt kê `typing` và `upload_photo` (đang "sắp ra mắt"). Repo gọi lệnh này trước khi trả lời ở `lib/bot.js:165`, và ở đường lõi tại `core/engine.js:113`. Lỗi của lệnh này bị nuốt (`channels/zalo-bot.js:96`) nên bot vẫn gửi tin được.
- Ảnh: update có trường `photo_url` (`channels/zalo-bot.js:148`) và `caption` (`channels/zalo-bot.js:149`). Repo **chưa** gọi `sendPhoto`.

## 4. Nhận tin: hai chế độ

### 4.1 Webhook (mặc định)

Chế độ mặc định là webhook (`server.js:17`). Đường dẫn nhận mặc định là `/webhook/zalo`, đổi bằng biến `ZALO_WEBHOOK_PATH` (`server.js:19`).

Luồng trong code:

1. Chỉ nhận `POST` đúng đường dẫn, sai thì 404 (`server.js:62`).
2. So header khoá webhook, sai thì 403 (`server.js:63`).
3. Đọc body, quá 1.000.000 byte thì huỷ kết nối (`server.js:66`); JSON hỏng thì 400 (`server.js:69`).
4. **Trả 200 ngay** để Zalo không gửi lại (`server.js:71`), rồi mới xử lý ở nền (`server.js:73`).

Theo tài liệu [Webhook](https://bot.zapps.me/docs/webhook/) và [setWebhook](https://bot.zapps.me/docs/apis/setWebhook/):

- Trang `setWebhook` cảnh báo: webhook URL phải truy cập được từ Internet công khai. `localhost`, địa chỉ loopback và IP nội bộ bị từ chối. Muốn thử ở máy thì phải mở một đường ra public — tài liệu gợi ý dùng tunnel như ngrok hoặc Cloudflare Tunnel. Tham số `url` được tài liệu mô tả là "URL nhận thông báo dạng HTTPS"; trang `Webhook` chỉ khuyến nghị dùng HTTPS để tăng bảo mật.
- Zalo gọi webhook kèm header `X-Bot-Api-Secret-Token`.
- Khi đặt xong, hệ thống tự gửi thử một request tới webhook URL đã đăng ký và trả kết quả trong trường `result.verification` (kèm `outcome` và `hint`). URL vẫn được lưu dù kết quả thử là thành công hay thất bại.
- Trang `Webhook` liệt kê **năm** tên sự kiện: `message.text.received`, `message.image.received`, `message.sticker.received`, `message.voice.received` và `message.unsupported.received`. Sự kiện cuối thay cho nội dung tin khi người gửi thuộc nhóm đối tượng đặc biệt (trẻ em, người khuyết tật, người không biết chữ) — hệ thống chỉ nhận tên sự kiện, không nhận nội dung tin.

Code đọc tên sự kiện từ `event_name` (`channels/zalo-bot.js:142`) và lấy ảnh từ `photo_url` (`channels/zalo-bot.js:148`).

**Chưa xác minh**: trang webhook không nói thời hạn phải trả lời (ACK) và không nói số lần Zalo thử lại. Repo trả 200 ngay (`server.js:71`) nên vẫn đúng nguyên tắc "trả lời nhanh", nhưng con số cụ thể thì chưa có tài liệu để dẫn.

### 4.2 Polling

Chế độ polling tự gọi `getUpdates`. Theo [tài liệu `getUpdates`](https://bot.zapps.me/docs/apis/getUpdates/):

- Tham số `timeout` là số giây chờ, mặc định 30 giây; đây là long polling.
- **Webhook và polling loại trừ lẫn nhau**: đã đặt webhook thì `getUpdates` không dùng được, phải `deleteWebhook` trước.
- Tài liệu khuyên dùng polling cho môi trường thử, webhook cho chạy thật.

Code:

- Vòng lặp polling: `server.js:79`; xoá webhook trước khi bắt đầu: `server.js:80`.
- Chờ 30 giây mỗi lần: `server.js:88`; client tự tính timeout HTTP là `(30 + 10) * 1000` ms (`channels/zalo-bot.js:95`).
- Nghỉ tối thiểu giữa hai lần gọi: `POLL_GAP_MS`, mặc định 1500 ms (`server.js:83`).
- Khi lỗi (khác timeout): lùi dần 3 giây, 10 giây nếu gặp mã 429, nhân đôi mỗi lần, tối đa 120 giây (`server.js:101`). Lỗi timeout thì coi như bình thường, không lùi (`server.js:98-99`).
- **Chống xoá nhầm webhook production**: trước khi polling, bot đọc `getWebhookInfo`; nếu bot đang có webhook thì dừng hẳn trừ khi bật `ZALO_FORCE_POLLING` (`channels/zalo-bot.js:54`, `server.js:133`). Lý do ghi ngay trong code: xoá webhook làm bot thật ngừng nhận tin, đã xảy ra sự cố ngày 06/11/2026 (`channels/zalo-bot.js:50`). Khi cố ý chiếm bot, bot cảnh báo phải đặt lại webhook sau (`server.js:138`).

## 5. Xác thực

- Khoá webhook (`secret_token`): tài liệu nói dài **từ 8 đến 256 ký tự**. Repo kiểm lúc đặt webhook (`scripts/set-webhook.mjs:14`) và cảnh báo khi secret quá ngắn lúc khởi động (`server.js:130`).
- Header: tài liệu viết `X-Bot-Api-Secret-Token`; repo đọc `x-bot-api-secret-token` (`server.js:63`). HTTP header không phân biệt hoa thường nên hai cách viết là một.
- So sánh thời gian hằng (không lộ sai sót qua thời gian): `channels/zalo-bot.js:164`, dùng ở `server.js:63` và `channels/zalo-bot.js:34`.
- Token bot nằm trong đường dẫn nên phải cẩn thận khi log; client chỉ nêu tên phương thức khi lỗi (`channels/zalo-bot.js:83-85`).

## 6. Cấu trúc update

Một update từ Zalo được chuẩn hoá thành các trường sau (`channels/zalo-bot.js:136`):

| Trường | Ý nghĩa | Dòng |
|---|---|---|
| `event` | Tên sự kiện, mặc định `message.text.received` | `channels/zalo-bot.js:142` |
| `chatId` | Id người nhận hoặc cuộc trò chuyện | `channels/zalo-bot.js:140` |
| `userId` | Id người gửi | `channels/zalo-bot.js:144` |
| `userName` | Tên hiển thị | `channels/zalo-bot.js:145` |
| `chatType` | Loại phòng | `channels/zalo-bot.js:146` |
| `text` | Nội dung chữ | `channels/zalo-bot.js:147` |
| `photoUrl` | Đường dẫn ảnh | `channels/zalo-bot.js:148` |
| `caption` | Chú thích ảnh | `channels/zalo-bot.js:149` |
| `messageId` | Id tin, dùng chống trùng | `channels/zalo-bot.js:150` |

- Nhóm được nhận biết khi `chat_type` chứa chữ "group" hoặc `userId` khác `chatId` (`lib/bot.js:11`). Tài liệu `Webhook` nói `chat_type` chỉ có hai giá trị: `PRIVATE` và `GROUP` (ghi rõ là Beta).
- Bỏ phần "@Tên bot" ở đầu và cuối tin: `lib/bot.js:17`.
- Khoá chống trùng: ưu tiên `message_id`, không có thì lấy sha1 của JSON đã sắp khoá (`channels/zalo-bot.js:44`, `channels/zalo-bot.js:155`).

## 7. Giới hạn kỹ thuật đo được từ repo

| Giới hạn | Giá trị trong repo | Chỗ |
|---|---|---|
| Kích thước body webhook | 1.000.000 byte | `server.js:66` |
| Timeout một lệnh bot | 40.000 ms | `channels/zalo-bot.js:73` |
| Chờ `getUpdates` | 30 giây (timeout HTTP 40 giây) | `channels/zalo-bot.js:95` |
| Timeout gọi công cụ Cổng OZ | 150.000 ms | `lib/mcp.js:105` |
| Timeout não định tuyến | 15.000 ms | `packs/hs/brain.js:119` |
| Timeout khoá dự phòng | 20.000 ms | `packs/hs/llm2.js:19` |
| Số lượt khách mỗi phút | 10 (mặc định) | `server.js:52`, `lib/bot.js:64` |
| Ký tự tối đa mỗi tin | 2000 | `channels/zalo-bot.js:8` |

### Mã lỗi API (theo [bảng mã lỗi](https://bot.zapps.me/docs/error-code/))

| Mã | Ý nghĩa theo tài liệu | Xử lý trong repo |
|---|---|---|
| 400 | Sai đường dẫn hoặc tên API không hợp lệ | Ném lỗi kèm mã HTTP (`channels/zalo-bot.js:86`) |
| 401 | Token đã hết hạn hoặc không hợp lệ | Như trên; thông báo lỗi khi khởi động chỉ ra kiểm token (`server.js:115`) |
| 403 | Lỗi phía máy chủ của Zalo | Như trên |
| 404 | Yêu cầu truy cập không lệ | Như trên |
| 408 | Quá thời gian xử lý cho phép | Polling coi là hết thời gian chờ, không lùi (`server.js:98-99`) |
| 429 | Vượt quá giới hạn sử dụng API cho phép | Polling lùi 10 giây rồi nhân đôi, tối đa 120 giây (`server.js:101`) |

Tài liệu cũng nói mỗi lỗi có thêm mô tả trong trường `description` của phản hồi; client của repo
lấy trường `description` (hoặc `message`) để đưa vào thông báo lỗi nội bộ (`channels/zalo-bot.js:84`).

## 8. Giới hạn chưa xác minh

Đây là phần quan trọng: có những giới hạn của nền tảng mà **repo không có tài liệu chính thức để dẫn**.

- **Con số cụ thể của hạn mức gửi tin**: chưa xác minh. Tài liệu chỉ nói có hạn mức qua mã lỗi 429
  ("Vượt quá giới hạn sử dụng API cho phép"), không nói bao nhiêu tin mỗi phút hay mỗi ngày.
  **Khung thời gian bot được nhắn lại** sau khi người dùng nhắn: chưa xác minh. Chính repo cũng
  ghi vậy — giới hạn này "chưa có tài liệu chính thức trong tay" (`specs/001-nen-tang-chung/research.md:81`).
- **Thời hạn ACK của webhook** và số lần Zalo thử lại: chưa xác minh.
- **Số tin tối đa trong một ngày** hoặc trong một cuộc trò chuyện: chưa xác minh.
- **Tính năng nhóm**: repo ghi rằng tài liệu mới chỉ mô tả sơ lược (bot nhận sự kiện khi được @nhắc hoặc được trích dẫn), chưa có trường để @nhắc một người hay trả lời trích dẫn, và tính năng nhóm còn đang thử nghiệm (`specs/001-nen-tang-chung/research.md:80`).
- **Tên sự kiện**: trang `Webhook` nêu đúng năm tên (`message.text.received`, `message.image.received`, `message.sticker.received`, `message.voice.received`, `message.unsupported.received`). Sự kiện nào khác ngoài danh sách này (theo dõi, mở hội thoại…) chưa xác minh trong tài liệu tôi đã mở.

Vì các mục trên chưa xác minh, cửa gửi của lõi phải đọc giới hạn từ cấu hình để chỉnh được mà không phải sửa code (`specs/001-nen-tang-chung/research.md:81`).

## 9. Công cụ trong repo

- `scripts/set-webhook.mjs` — đặt, xem, xoá webhook. Ba nhánh lệnh: `set` (`scripts/set-webhook.mjs:11`), `delete` (`scripts/set-webhook.mjs:16`), mặc định là xem (`scripts/set-webhook.mjs:18`). Bản dùng nhanh: `npm run webhook:set` và `npm run webhook:info` (`package.json:16`, `package.json:17`).
- `scripts/kiem-webhook.mjs` — kiểm đường webhook từ Internet. Gửi ba thử: đúng mã (`scripts/kiem-webhook.mjs:13`), đúng mã kèm User-Agent giả dạng Zalo (`scripts/kiem-webhook.mjs:14`), sai mã (`scripts/kiem-webhook.mjs:15`). Chỉ in trạng thái HTTP và 120 ký tự đầu phản hồi (`scripts/kiem-webhook.mjs:8`).

## 10. Giới hạn vận hành của chính bot

- Khi Cổng OZ lỗi, **đường đang chạy** trả câu kèm 120 ký tự đầu của thông báo lỗi gốc (`lib/bot.js:214`) — vi phạm điều IX hiến pháp. Đường lõi mới làm đúng: trả câu báo chung, không kèm lỗi gốc (`packs/hs/index.js:91`).
- `sendChatAction` lỗi thì bị nuốt, bot vẫn gửi tin (`channels/zalo-bot.js:96`).
- Lệnh bot lỗi sẽ ném `Error` kèm mã HTTP (`channels/zalo-bot.js:86`) để tầng trên quyết định có thử lại hay không.

Liên quan: [Luồng tin nhắn](luong-tin-nhan.md), [Kiến trúc](kien-truc.md), [Triển khai và vận hành](trien-khai-van-hanh.md).
