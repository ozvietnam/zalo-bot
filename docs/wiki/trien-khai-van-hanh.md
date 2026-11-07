# Triển khai và vận hành

> Cập nhật: 2026-11-07 · commit: 1316cfe

Trang này nói cách cài, chạy, theo dõi và khôi phục bot. Mọi nhận định về code kèm
`tệp:dòng` để mở ra kiểm.

**Cảnh báo quan trọng.** Repo có hai đường xử lý (xem [Kiến trúc](kien-truc.md)).
Đường đang chạy là `server.js` → `lib/bot.js`, và nó **không** dùng lớp cấu hình
`core/config.js`, không ghi SQLite, không có cửa gửi. Vì vậy nhiều biến môi trường
mô tả dưới đây **hiện chưa có tác dụng với khách thật** — chi tiết ở [An toàn](an-toan.md).

## 1. Yêu cầu và cài đặt

| Mục | Yêu cầu | Bằng chứng |
|---|---|---|
| Node.js | Từ 22.13 trở lên | `package.json:8` |
| Thư viện ngoài | Không cần, repo không khai `dependencies` | `package.json:1-21` |
| Cấu hình | File `.env` theo mẫu `.env.example` | `.env.example:1` |

Hai bên đang lệch nhau về phiên bản Node, ghi rõ cả hai:

- Tài liệu nói: `README.md:5` — "Node 20+, không thư viện ngoài".
- Code thật nói: `package.json:8` — `"node": ">=22.13"`.

Cài và chạy thử trên máy (không cần tên miền công khai):

```bash
cp .env.example .env          # điền ZALO_BOT_TOKEN, OZ_MCP_TOKEN
node --env-file=.env server.js
```

Lệnh trên khớp với `npm run dev` (`package.json:11`); `npm start` thì không nạp `.env`
(`package.json:12`). Hướng dẫn gốc cũng mô tả đúng hai lệnh này (`README.md:84-85`).

## 2. Hai chế độ chạy

`ZALO_MODE` chọn chế độ, mặc định là `webhook` (`server.js:17`); lõi có kiểm tra
giá trị hợp lệ (`core/config.js:37-38`).

### Webhook (production)

- HTTP server nhận POST tại `ZALO_WEBHOOK_PATH`, mặc định `/webhook/zalo` (`server.js:19`).
- Chỉ nhận đúng method POST và đúng đường dẫn, còn lại trả 404 (`server.js:62`).
- Kiểm tra header `x-bot-api-secret-token` bằng so sánh không rò rỉ thời gian; sai hoặc
  thiếu mã thì trả 403 (`server.js:63`).
- Body quá 1 MB thì hủy kết nối (`server.js:66`); JSON hỏng thì trả 400 (`server.js:69`).
- Trả 200 **ngay** rồi mới xử lý nền, để Zalo không gửi lại (`server.js:71`, `server.js:73`).

Đăng ký webhook sau khi deploy:

```bash
node --env-file=.env scripts/set-webhook.mjs set https://<tên-miền>/webhook/zalo
```

Lệnh này bắt buộc URL `https://` (`scripts/set-webhook.mjs:12`) và mã bí mật dài 8–256
ký tự (`scripts/set-webhook.mjs:14`). Xem webhook đang đặt: `npm run webhook:info`
(`package.json:17`). Kiểm tra đường webhook từ Internet: `scripts/kiem-webhook.mjs:1`.

### Polling (chạy thử, máy không có tên miền)

- Vòng lặp gọi `getUpdates` với độ trễ dài 30 giây (`server.js:88`), nghỉ tối thiểu
  `POLL_GAP_MS` giữa hai lần gọi (`server.js:83`).
- Khi lỗi (khác phải hết thời gian chờ) thì lùi dần: 3 giây rồi 10 giây nếu bị chặn
  giới hạn, tối đa 120 giây (`server.js:101`).
- **Không được chạy polling khi bot thật đang có webhook.** Trước khi vào vòng lặp,
  chương trình kiểm tra và dừng hẳn nếu thấy webhook (`server.js:133`, `channels/zalo-bot.js:54`).
  Muốn cố ý chiếm thì đặt `ZALO_FORCE_POLLING`; chương trình sẽ cảnh báo phải đặt lại
  webhook sau (`server.js:138`).

## 3. Biến môi trường

Chỉ ghi **tên** biến và ý nghĩa. Giá trị thật nằm trong `.env` ở máy chủ, không đưa vào repo.

### Kênh Zalo

| Biến | Ý nghĩa | Bằng chứng |
|---|---|---|
| `ZALO_BOT_TOKEN` | Token bot, bắt buộc | `server.js:26`, `core/config.js:35-36` |
| `ZALO_MODE` | `webhook` hoặc `polling` | `server.js:17` |
| `ZALO_WEBHOOK_PATH` | Đường dẫn nhận webhook | `server.js:19` |
| `ZALO_WEBHOOK_SECRET` | Mã bí mật so khớp lúc đặt webhook | `server.js:20`, `server.js:130` |
| `ZALO_API_BASE` | Đổi địa chỉ API Zalo | `server.js:26` |
| `ZALO_FORCE_POLLING` | Cho phép polling xoá webhook đang có | `server.js:133` |
| `POLL_GAP_MS` | Nghỉ tối thiểu giữa hai lần `getUpdates` | `server.js:83` |
| `BOT_NAMES` | Tên bot để bỏ phần nhắc tên trong nhóm | `server.js:34` |
| `ALLOW_USERS` | Danh sách người được dùng bot, để trống là mở | `server.js:53` |
| `RATE_LIMIT_PER_MIN` | Số tin tối đa mỗi người mỗi phút | `server.js:52` |

### Cổng OZ (MCP)

| Biến | Ý nghĩa | Bằng chứng |
|---|---|---|
| `OZ_MCP_URL` | Địa chỉ cổng, có giá trị mặc định trong code | `server.js:29` |
| `OZ_MCP_TOKEN` | Khoá/tài khoản OZ của bot | `server.js:30` |
| `OZ_MCP_AUTH_HEADER` | Tên header gửi khoá, mặc định `Authorization` | `server.js:31` |

Cổng OZ dùng cho công cụ tính điểm, nên mọi người dùng bot đều trừ vào tài khoản này.
README khuyên giới hạn `ALLOW_USERS` nếu chỉ dùng nội bộ (`README.md:78-79`).

### Não AI

| Biến | Ý nghĩa | Bằng chứng |
|---|---|---|
| `GEMINI_API_KEY` | Khoá dùng chung cho đọc ảnh, não định tuyến, não biên tập | `server.js:41` |
| `GEMINI_MODEL` | Mẫu đọc ảnh | `server.js:51` |
| `GEMINI_BRAIN` | Tắt não định tuyến bằng `0` | `server.js:42` |
| `GEMINI_BRAIN_MODEL` | Mẫu não định tuyến | `server.js:41` |
| `GEMINI_EDITOR` | Tắt não biên tập bằng `0` | `server.js:45` |
| `GEMINI_EDITOR_MODEL` | Mẫu não biên tập | `server.js:44` |
| `LLM2_BASE_URL`, `LLM2_API_KEY`, `LLM2_MODEL` | Khoá dự phòng theo chuẩn OpenAI; thiếu một biến là tắt | `server.js:36` |
| `LLM2_TIMEOUT_MS` | Thời gian chờ mỗi lần gọi dự phòng | `server.js:37` |
| `LLM_CHINH` | `llm2` để đảo vai chính/dự phòng | `server.js:39` |

Mọi câu khách gửi tới não sẽ đi qua nhà cung cấp LLM đang cấu hình — chỉ dùng nhà
cung cấp công ty đã đồng ý (`README.md:62`). Chi tiết ở [Não AI](nao-ai.md).

### Lõi dùng chung (spec 001) — **hiện chưa có tác dụng**

Các biến dưới đây được đọc bởi `core/config.js`, nhưng hàm `loadConfig` chưa được
gọi ở nơi nào ngoài test (`core/config.js:34`, `test/core/config.test.mjs:8`).
`server.js` chỉ import `core/health.js` từ thư mục `core/` (`server.js:14`).
Chúng sẽ có tác dụng khi lõi được nối vào chương trình chính (việc T016).

| Biến | Ý nghĩa | Bằng chứng |
|---|---|---|
| `DATA_DIR` | Thư mục dữ liệu SQLite, mặc định `./data` | `core/config.js:55` |
| `STAFF_USERS` | Người dùng nội bộ được dùng lệnh nội bộ | `core/config.js:53` |
| `STAFF_CHAT_ID` | Phòng nhận phiếu, cảnh báo và bản tin | `core/config.js:54` |
| `CAP_CHAT_DAY` | Trần tin bot chủ động mỗi người (cuộc trò chuyện) mỗi ngày | `core/config.js:57` |
| `CAP_GROUP_DAY` | Trần tin bot chủ động mỗi nhóm mỗi ngày | `core/config.js:58` |
| `CAP_ALL_DAY` | Trần tin bot toàn hệ thống mỗi ngày | `core/config.js:59` |
| `SESSION_TTL_MS` | Thời gian giữ phiên hội thoại | `core/config.js:60` |
| `BANNED_PATTERNS` | Mẫu regex cấm lộ ra khách, ngăn bằng dấu chấm phẩy | `core/config.js:61` |
| `COMPANY_PHONES` | Số điện thoại công ty, bot không coi là số khách | `core/config.js:56` |

### Vận hành và giám sát

| Biến | Ý nghĩa | Bằng chứng |
|---|---|---|
| `PORT` | Cổng HTTP; chương trình đang chạy mặc định 3000 | `server.js:18` |
| `DEBUG` | Bật in log chi tiết | `server.js:21` |
| `APP_VERSION` / `SOURCE_COMMIT` | Commit đang chạy, hiện ở `/health` | `server.js:24` |
| `TRUOT_DIR` | Thư mục ghi sổ trượt từ vựng; đặt `off` để tắt | `server.js:49` |
| `GITHUB_TOKEN` / `GH_TOKEN` | Mở issue khi giám sát phát hiện sự cố | `lib/giam-sat/issue.js:12` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Gửi bản tin giám sát; thiếu thì bỏ qua | `lib/giam-sat/telegram.js:11-13` |

## 4. Chạy 24/7 với Docker

`Dockerfile` đóng gói sẵn:

- Nền `node:22-alpine`, thư mục làm việc `/app` (`Dockerfile:1-2`).
- Biến mặc định khi build: `NODE_ENV=production`, `PORT=3000`, `DATA_DIR=/app/data`,
  `APP_VERSION` lấy từ build argument `SOURCE_COMMIT` (`Dockerfile:5-6`).
- Thư mục dữ liệu được tạo và chuyển quyền cho user `node` trước khi chạy
  (`Dockerfile:7`), và khai báo là volume (`Dockerfile:8`).
- Cổng 3000 (`Dockerfile:9`), kiểm tra sức khoẻ mỗi 30 giây gọi `/health`
  (`Dockerfile:10`), chạy bằng user không phải root (`Dockerfile:11`).

Hai điểm vận hành phải biết:

1. **Volume phải có tên (named volume).** Nếu gắn thư mục host vào `/app/data` thì
   thư mục đó thuộc root, tiến trình chạy bằng user `node` sẽ không ghi được. Sổ làm
   việc của spec 001 đã ghi lại đúng điểm này, và nói việc này thuộc T032 (README)
   (`docs/sdd/001-ledger.md:11`).
2. **Gộp vào `main` không đồng nghĩa với lên production.** Triển khai là một bước
   riêng (`CONTRIBUTING.md:42`).

## 5. Theo dõi

### Kiểm tra sức khoẻ

`GET /health` trả JSON gồm `ok`, `mode`, `startedAt` và `version` nếu có
(`core/health.js:3-9`), phục vụ `server.js:59-61`. Mục đích là xác minh production
đã build lại với code mới mà không cần đọc log (`core/health.js:1-2`).
Phiên bản đọc từ `APP_VERSION` hoặc `SOURCE_COMMIT` (`server.js:24`).

### Agent giám sát hằng ngày

`npm run giam-sat` chạy `scripts/giam-sat.mjs` (`package.json:18`), dự kiến cron lúc
07:30 (`scripts/giam-sat.mjs:2`). Có `npm run giam-sat:dry` để chạy thử không gửi
(`package.json:19`).

Các bước của lần chạy:

1. Mở SQLite tại `DATA_DIR/bot.db` (`scripts/giam-sat.mjs:19`); không thấy thì báo
   và dừng (`scripts/giam-sat.mjs:21-24`).
2. Đọc bống `messages`, `outbox`, `jobs`, `audit` trong ngày (`scripts/giam-sat.mjs:36-47`).
3. Tính 9 tín hiệu vận hành: rò rỉ, số tiền không căn cứ, lỗi công cụ, công cụ trả
   rỗng, việc nền hết hạn, hỏi lại nhiều, người thay bot, khách bực, xin lỗi tay
   (`lib/giam-sat/tinh-hieu.js:6-14`).
4. Mở issue GitHub hoặc bình luận vào issue cũ, tối đa 5 issue mới mỗi repo mỗi ngày
   (`lib/giam-sat/issue.js:6-7`).
5. Lưu bản tin dạng Markdown trong `DATA_DIR` (`scripts/giam-sat.mjs:78`).
6. Gửi bản tin Telegram cho CEO; nếu thiếu biến cấu hình thì bỏ qua, không báo lỗi
   (`lib/giam-sat/telegram.js:13`).

**Mâu thuẫn vận hành cần biết.** Script giám sát đọc `DATA_DIR/bot.db`, nhưng đường
đang chạy **không** ghi SQLite: trong `lib/` và `server.js` không có chỗ nào mở cơ sở
dữ liệu (đã kiểm bằng `grep` toàn bộ `lib/` và `server.js`; chỉ `scripts/giam-sat.mjs:7`
mới import `node:sqlite`). Nói cách khác, ở production hiện tại `bot.db` do chính
script giám sát tạo ra (`scripts/giam-sat.mjs:30`) và luôn rỗng — tức bản tin giám sát
không phản ánh hoạt động thật của bot. Việc nối lõi mới (T016) mới làm cho phần này
có dữ liệu. Trạng thái chi tiết: [Tiến độ](tien-do.md).

### Cảnh báo của lõi

Trong lõi mới, cửa gửi gọi callback cảnh báo `onAlert` khi: tin có dấu hiệu lộ bí
mật bị từ chối, vượt trần toàn hệ thống, hoặc vượt trần của nhóm; và gọi callback
tạo phiếu `onTicket` khi vượt trần của cuộc trò chuyện hoặc số tiền không có căn cứ
(`core/gate.js:64`). Khi gửi lỗi quá số lần thử thì cũng gọi cảnh báo
(`core/gate.js:90`). Cơ chế này chưa được nối vào chương trình chính.

## 6. Khôi phục sau sự cố

Cửa gửi có hàm `recover()`: đổi các dòng `outbox` còn `queued` sang `failed` để bộ
quét thử lại từ đoạn đã gửi, và ghi một bản ghi audit lý do `crash-mid-send`
(`core/gate.js:191-199`). Nếu đã gửi được một phần thì còn gọi cảnh báo
(`core/gate.js:197`).

**Hiện chưa ai gọi `recover()` khi khởi động.** Hàm này chỉ được gọi trong test
(`test/core/gate-send.test.mjs:439`); `server.js` không import `core/gate.js`
(`server.js:4-14`). Hậu quả: tin nằm trôi trạng thái `queued` sau khi tiến trình chết
giữa chừng sẽ không được gửi lại. Đây là việc T020 chưa làm, xem [Tiến độ](tien-do.md).

Các việc vận hành khi bot không trả lời, theo thứ tự nên làm:

1. Xem `/health`: còn sống không, `startedAt` có đúng lần deploy không
   (`server.js:59-61`).
2. Xem log khởi động: dòng `[bot] đăng nhập` báo lỗi nghĩa là token sai
   (`server.js:115`); dòng `[mcp] chưa kết nối được Cổng OZ` báo kiểm lại URL và
   token Cổng (`server.js:126`).
3. Nếu bot không nhận được tin trong nhóm: kiểm tra bot đã được mời vào nhóm và
   trưởng nhóm đã xác nhận (`README.md:92`).
4. Nếu dùng polling mà bot im: kiểm tra chương trình đã dừng vì còn webhook
   (`server.js:133-136`).
5. Chạy `npm test` và `npm run eval` để biết phần mềm còn đúng không (xem [Kiểm thử](kiem-thu.md)).

## 7. Sao lưu dữ liệu

Trạng thái thật:

- Cơ sở dữ liệu SQLite của lõi mới: `DATA_DIR/bot.db` (`scripts/giam-sat.mjs:19`).
  Ở production hiện tại chưa có dữ liệu vì đường đang chạy không ghi SQLite.
- Sổ trượt từ vựng: mỗi ngày một tệp JSONL trong thư mục `TRUOT_DIR`
  (`lib/truot.js:28`), không lưu mã chat hay người dùng (`lib/truot.js:3`).
- Bản tin giám sát hằng ngày: tệp Markdown trong `DATA_DIR` (`scripts/giam-sat.mjs:78`).

Việc sao lưu có bản dựng riêng trong đặc tả (T036) **chưa làm**; chưa có tệp nào
trong repo lo việc này. Vì vậy hiện chưa có lệnh sao lưu nào để chạy, và việc dữ liệu
nằm trên volume có bị mất khi deploy lại hay không thì **chưa xác minh** — cần kiểm
cấu hình volume thật ở Coolify.

## 8. CI và quy trình mở PR

GitHub Actions chạy hai job (`.github/workflows/ci.yml:8-27`):

| Job | Việc | Bằng chứng |
|---|---|---|
| `test` | `npm test` rồi `npm run eval`, trên Node 22 | `.github/workflows/ci.yml:16-18` |
| `wiki` | `node scripts/kiem-wiki.mjs` | `.github/workflows/ci.yml:27` |

Job chạy khi có pull request và khi push lên `main` (`.github/workflows/ci.yml:3-4`).

Quy trình của văn phòng (7 bước) nằm ở `CONTRIBUTING.md:20-26`: phân tích → lập
trình (test đỏ trước) → kiểm thử độc lập → cổng máy → soát code bằng model khác →
CI → gộp. Thêm quy tắc: `main` được bảo vệ, phải qua PR và CI xanh
(`CONTRIBUTING.md:41`); PR đụng vùng nhạy cảm như cửa gửi, hạ tầng CI, Dockerfile hay
hiến pháp thì luôn chờ thành viên duyệt (`CONTRIBUTING.md:43`).

Ba cổng máy phải xanh trước khi mở PR (`CONTRIBUTING.md:23`):

```bash
npm test
npm run eval
node scripts/kiem-wiki.mjs
```

## 9. Khi nào làm gì

| Tình huống | Việc cần làm |
|---|---|
| Chạy thử trên máy | `cp .env.example .env`, điền token, rồi `npm run dev` (`package.json:11`) |
| Deploy lên production | Build bằng `Dockerfile`, đặt biến môi trường, gắn named volume cho `/app/data`, rồi đăng ký webhook (`README.md:98-101`) |
| Đổi cấu hình | Sửa `.env` ở máy chủ, khởi động lại tiến trình; kiểm tra `/health` trả `startedAt` mới (`core/health.js:7`) |
| Bot không nhận tin | Kiểm tra webhook (403 là sai mã, 404 là sai đường dẫn), rồi log khởi động (`server.js:62-63`) |
| Khách phàn về trả lời | Bật `DEBUG` để in log chi tiết (`server.js:21`), chạy lại và đọc log |
| Hằng ngày | Job giám sát lúc 07:30 tự chạy; kiểm tra issue mới và bản tin Telegram (`scripts/giam-sat.mjs:2`) |
| Trước khi mở PR | `npm test`, `npm run eval`, `node scripts/kiem-wiki.mjs` phải xanh (`CONTRIBUTING.md:23`) |
| Đổi hành vi | Cập nhật wiki cùng PR (`AGENTS.md`) |

## Trang liên quan

- [Kiến trúc](kien-truc.md) — hai đường xử lý, ranh giới giữa lõi, gói, kênh.
- [Dữ liệu](du-lieu.md) — bảng nào lưu gì, giữ bao lâu.
- [An toàn](an-toan.md) — nguyên tắc nào đang thực thi, nguyên tắc nào chưa.
- [Tiến độ](tien-do.md) — trạng thái thật từng việc T0xx.
- [Sự cố và bài học](su-co-bai-hoc.md) — sự cố đã gặp và cách xử lý.
