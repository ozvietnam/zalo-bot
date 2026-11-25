# Triển khai và vận hành

> Cập nhật: 2026-11-26 · commit: 7b9c55b

Trang này nói cách cài, chạy, theo dõi và khôi phục bot. Mọi nhận định về code kèm
`tệp:dòng` để mở ra kiểm.

**Cảnh báo quan trọng.** Từ 07/11/2026 (T016) bot chạy thẳng vào lõi `core/`:
`server.js` chỉ nối dây (`server.js:1-2`) và dựng engine ở `server.js:76`.
Gói nghiệp vụ được nạp theo đường dẫn tương đối tới **tệp mã nguồn** (`server.js:72`), nên
việc nạp gói không phụ thuộc thư mục làm việc khi chạy.
Thư mục `lib/` đã bị xoá hẳn, nên **mọi** biến môi trường mô tả dưới đây đều có tác dụng
với khách thật — chi tiết ở [An toàn](an-toan.md).

## 1. Yêu cầu và cài đặt

| Mục | Yêu cầu | Bằng chứng |
|---|---|---|
| Node.js | Từ 22.13 trở lên | `package.json:8` |
| Thư viện ngoài | Không cần, repo không khai `dependencies` | `package.json:1-21` |
| `ffmpeg` | Cần nếu bật trả lời bằng giọng nói (`VOICE_REPLIES` khác `off`) | `core/giong-noi.js:82`, `Dockerfile:5` |
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

`ZALO_MODE` chọn chế độ, mặc định là `webhook` (`core/config.js:37`); lõi có kiểm tra
giá trị hợp lệ (`core/config.js:38`).

### Webhook (production)

- HTTP server nhận POST tại `ZALO_WEBHOOK_PATH`, mặc định `/webhook/zalo` (`core/config.js:44`).
- Chỉ nhận đúng method POST và đúng đường dẫn, còn lại trả 404 (`server.js:84`).
- Kiểm tra header `x-bot-api-secret-token` bằng so sánh không rò rỉ thời gian; sai hoặc
  thiếu mã thì trả 403 (`server.js:85`, hàm so ở `channels/zalo-bot.js:31`).
- Body quá 1 MB thì hủy kết nối (`server.js:87`); JSON hỏng thì trả 400 (`server.js:90`).
- Trả 200 **ngay** rồi mới xử lý nền, để Zalo không gửi lại (`server.js:91`, `server.js:93`).

Đăng ký webhook sau khi deploy:

```bash
node --env-file=.env scripts/set-webhook.mjs set https://<tên-miền>/webhook/zalo
```

Lệnh này bắt buộc URL `https://` (`scripts/set-webhook.mjs:12`) và mã bí mật dài 8–256
ký tự (`scripts/set-webhook.mjs:14`). Xem webhook đang đặt: `npm run webhook:info`
(`package.json:17`). Kiểm tra đường webhook từ Internet: `scripts/kiem-webhook.mjs:1`.

### Polling (chạy thử, máy không có tên miền)

- Vòng lặp gọi `getUpdates` với độ trễ dài 30 giây (`channels/zalo-polling.js:31`), nghỉ tối thiểu
  `POLL_GAP_MS` giữa hai lần gọi (`channels/zalo-polling.js:26`).
- Khi lỗi (khác phải hết thời gian chờ) thì lùi dần: 3 giây rồi 10 giây nếu bị chặn
  giới hạn, tối đa 120 giây (`channels/zalo-polling.js:43`).
- **Không được chạy polling khi bot thật đang có webhook.** Trước khi vào vòng lặp,
  chương trình kiểm tra và dừng hẳn nếu thấy webhook (`channels/zalo-polling.js:11`, `channels/zalo-bot.js:54`).
  Muốn cố ý chiếm thì đặt `ZALO_FORCE_POLLING`; chương trình sẽ cảnh báo phải đặt lại
  webhook sau (`channels/zalo-polling.js:16`).

## 3. Biến môi trường

Chỉ ghi **tên** biến và ý nghĩa. Giá trị thật nằm trong `.env` ở máy chủ, không đưa vào repo.

### Kênh Zalo

| Biến | Ý nghĩa | Bằng chứng |
|---|---|---|
| `ZALO_BOT_TOKEN` | Token bot, bắt buộc | `core/config.js:35-36` |
| `ZALO_MODE` | `webhook` hoặc `polling` | `core/config.js:37` |
| `ZALO_WEBHOOK_PATH` | Đường dẫn nhận webhook | `core/config.js:44` |
| `ZALO_WEBHOOK_SECRET` | Mã bí mật so khớp lúc đặt webhook | `core/config.js:45`, cảnh báo lúc khởi động ở `server.js:103` |
| `ZALO_API_BASE` | Đổi địa chỉ API Zalo | `server.js:39` |
| `ZALO_FORCE_POLLING` | Cho phép polling xoá webhook đang có | `channels/zalo-polling.js:11` |
| `POLL_GAP_MS` | Nghỉ tối thiểu giữa hai lần `getUpdates` | `channels/zalo-polling.js:26` |
| `BOT_NAMES` | Tên bot để bỏ phần nhắc tên trong nhóm | `core/config.js:62` |
| `ALLOW_USERS` | Danh sách người được dùng bot, để trống là mở | `core/config.js:52` |
| `RATE_LIMIT_PER_MIN` | Số tin tối đa mỗi người mỗi phút | `core/config.js:51` |

### Cổng OZ (MCP)

| Biến | Ý nghĩa | Bằng chứng |
|---|---|---|
| `OZ_MCP_URL` | Địa chỉ cổng, có giá trị mặc định trong code | `core/config.js:46` |
| `OZ_MCP_TOKEN` | Khoá/tài khoản OZ của bot | `core/config.js:47` |
| `OZ_MCP_AUTH_HEADER` | Tên header gửi khoá, mặc định `Authorization` | `core/config.js:48` |

Cổng OZ dùng cho công cụ tính điểm, nên mọi người dùng bot đều trừ vào tài khoản này.
README khuyên giới hạn `ALLOW_USERS` nếu chỉ dùng nội bộ (`README.md:78-79`).

### Não AI

| Biến | Ý nghĩa | Bằng chứng |
|---|---|---|
| `GEMINI_API_KEY` | Khoá dùng chung cho đọc ảnh, não định tuyến, não biên tập | `core/config.js:49` |
| `GEMINI_MODEL` | Mẫu đọc ảnh | `core/config.js:50` |
| `GEMINI_BRAIN` | Tắt não định tuyến bằng `0` | `server.js:46` |
| `GEMINI_BRAIN_MODEL` | Mẫu não định tuyến | `server.js:46` |
| `GEMINI_EDITOR` | Tắt não biên tập bằng `0` | `server.js:47` |
| `GEMINI_EDITOR_MODEL` | Mẫu não biên tập | `server.js:47` |
| `LLM2_BASE_URL`, `LLM2_API_KEY`, `LLM2_MODEL` | Khoá dự phòng theo chuẩn OpenAI; thiếu một biến là tắt | `server.js:44` |
| `LLM2_TIMEOUT_MS` | Thời gian chờ mỗi lần gọi dự phòng | `server.js:44` |
| `LLM_CHINH` | `llm2` để đảo vai chính/dự phòng | `server.js:45` |

Mọi câu khách gửi tới não sẽ đi qua nhà cung cấp LLM đang cấu hình — chỉ dùng nhà
cung cấp công ty đã đồng ý (`README.md:62`). Chi tiết ở [Não AI](nao-ai.md).

### Lõi dùng chung (spec 001) — **đã có tác dụng**

Các biến dưới đây được đọc bởi `core/config.js:34`, và `server.js` gọi hàm đó lúc
khởi động (`server.js:30`). Từ T016, chúng có tác dụng với khách thật.

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
| `PORT` | Cổng HTTP; mặc định trong code là 3010, Docker đặt 3000 | `core/config.js:43`, `Dockerfile:6` |
| `DEBUG` | Bật in log chi tiết | `server.js:24` |
| `APP_VERSION` / `SOURCE_COMMIT` | Commit đang chạy, hiện ở `/health` | `server.js:25` |
| `TRUOT_DIR` | Thư mục ghi sổ trượt từ vựng; đặt `off` để tắt | `server.js:49` |
| `GITHUB_TOKEN` / `GH_TOKEN` | Mở issue khi giám sát phát hiện sự cố | `scripts/giam-sat/issue.js:12` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Gửi bản tin giám sát; thiếu thì bỏ qua | `scripts/giam-sat/telegram.js:11-12` |

### Giọng nói, hạn giờ và hồ sơ HS (thêm sau bản `a84e8bb` 11/11)

Các biến dưới đây đều có giá trị mặc định trong code nên **không bắt buộc đặt**, nhưng
riêng `PUBLIC_BASE_URL` đổi cả tên miền mặc định — người chuyển bản phải biết (mục 10):

| Biến | Ý nghĩa | Bằng chứng |
|---|---|---|
| `PUBLIC_BASE_URL` | Tiền tố URL tệp giọng nói gửi khách; **mặc định đổi** từ `zalo-bot.` sang `chatbot.uythacnhapkhau.com` (PR #254 / OZV-1703) | `core/config.js:72`, dựng URL ở `core/giong-noi.js:144` |
| `GEMINI_TTS_TIMEOUT_MS` | Hạn mỗi lần gọi Gemini TTS, mặc định 30 giây (PR #225 / OZV-709) | `core/config.js:80` |
| `FFMPEG_TIMEOUT_MS` | Hạn mỗi lần chạy `ffmpeg` đổi PCM sang AAC, mặc định 20 giây (PR #225 / OZV-709) | `core/config.js:81` |
| `CAU_TAM_SAU_MS` | Đã báo "đang tra" mà lượt chưa xong sau ngần này thì gửi một câu tạm đúng giọng; mặc định 120000, `0` tắt (PR #215 / OZV-496) | `core/config.js:86` |
| `SEND_TIMEOUT_MS` | Hạn lời gọi gửi tin của adapter kênh, mặc định 15 giây — kênh Zalo bot để 40 giây vì còn tải tệp (PR #226 / OZV-763) | `core/config.js:90` |
| `HS_HO_SO` | Bật động cơ hỏi lại theo `so_tay_questions`/`cauHoi` hồ sơ; **mặc định BẬT**, tắt bằng `0`/`false`/`off` (PR #228, #245) | `packs/hs/so-tay-hoi.js:10` |

## 4. Chạy 24/7 với Docker

`Dockerfile` đóng gói sẵn:

- Nền `node:22-alpine`, thư mục làm việc `/app` (`Dockerfile:1-2`).
- **`ffmpeg` cài trong ảnh** (`Dockerfile:5`): khâu giọng nói gọi `spawn('ffmpeg')` để đổi
  PCM của Gemini TTS sang AAC (`core/giong-noi.js:82`). Thiếu nó thì mỗi tin thoại ném
  `spawn ffmpeg ENOENT`, vào `audit` thành `error stage=voice` còn khách chỉ nhận tin chữ.
- Biến mặc định khi build: `NODE_ENV=production`, `PORT=3000`, `DATA_DIR=/app/data`,
  `APP_VERSION` lấy từ build argument `SOURCE_COMMIT` (`Dockerfile:8-9`).
- Thư mục dữ liệu được tạo và chuyển quyền cho user `node` trước khi chạy
  (`Dockerfile:10`), và khai báo là volume (`Dockerfile:11`).
- Cổng 3000 (`Dockerfile:12`), kiểm tra sức khoẻ mỗi 30 giây gọi `/health`
  (`Dockerfile:13`), chạy bằng user không phải root (`Dockerfile:14`).

Chạy ngoài Docker (máy lập trình, `npm run dev`) thì **phải tự cài `ffmpeg`**
(`apt install ffmpeg` / `brew install ffmpeg`), nếu không khâu giọng nói sẽ lỗi y hệt.

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
(`core/health.js:3-9`), phục vụ `server.js:81-82`. Mục đích là xác minh production
đã build lại với code mới mà không cần đọc log (`core/health.js:1-2`).
Phiên bản đọc từ `APP_VERSION` hoặc `SOURCE_COMMIT` (`server.js:25`).

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
   (`scripts/giam-sat/tinh-hieu.js:5-15`).
4. Mở issue GitHub hoặc bình luận vào issue cũ, tối đa 5 issue mới mỗi repo mỗi ngày
   (`scripts/giam-sat/issue.js:51`).
5. Lưu bản tin dạng Markdown trong `DATA_DIR` (`scripts/giam-sat.mjs:78`).
6. Gửi bản tin Telegram cho CEO; nếu thiếu biến cấu hình thì bỏ qua, không báo lỗi
   (`scripts/giam-sat/telegram.js:10`).

**Dữ liệu giám sát giờ phản ánh hoạt động thật.** Trước T016, đường đang chạy không ghi
SQLite, nên `bot.db` do chính script giám sát tạo ra (`scripts/giam-sat.mjs:30`) và luôn
rỗng. Nay bot mở cơ sở dữ liệu ngay khi khởi động (`server.js:38`) và ghi tin, outbox,
jobs, audit (`core/engine.js:100`, `core/engine.js:115`, `core/engine.js:130`), nên bản tin
giám sát phản ánh hoạt động thật của bot. Trạng thái chi tiết: [Tiến độ](tien-do.md).

### Cảnh báo của lõi

Cửa gửi gọi callback cảnh báo `onAlert` khi: tin có dấu hiệu lộ bí
mật bị từ chối, vượt trần toàn hệ thống, hoặc vượt trần của nhóm; và gọi callback
tạo phiếu `onTicket` khi vượt trần của cuộc trò chuyện hoặc số tiền không có căn cứ
(`core/gate.js:64`). Khi gửi lỗi quá số lần thử thì cũng gọi cảnh báo
(`core/gate.js:90`).

Cơ chế này **đã được nối** vào chương trình chính, nhưng callback hiện chỉ ghi log
(`server.js:66`, `server.js:67`); chưa có đường gửi cảnh báo tới nhóm nhân viên (T024 chưa làm).

## 6. Khôi phục sau sự cố

Cửa gửi có hàm `recover()`: đổi các dòng `outbox` còn `queued` sang `failed` để bộ
quét thử lại từ đoạn đã gửi, và ghi một bản ghi audit lý do `crash-mid-send`
(`core/gate.js:198-206`). Nếu đã gửi được một phần thì còn gọi cảnh báo
(`core/gate.js:204`).

**Hàm này đã được gọi lúc khởi động** (`server.js:77`), nên tin nằm trôi trạng thái `queued`
sau khi tiến trình chết giữa chừng vẫn được gửi lại. Phần còn thiếu của T020 là tệp test
riêng cho `recover()` và hàm tương đương ở tầng engine, xem [Tiến độ](tien-do.md).

Các việc vận hành khi bot không trả lời, theo thứ tự nên làm:

1. Xem `/health`: còn sống không, `startedAt` có đúng lần deploy không
   (`server.js:81-82`).
2. Xem log khởi động: dòng `[bot] đăng nhập` báo lỗi nghĩa là token sai
   (`server.js:57`); dòng `[bot] KHÔNG nạp được gói nào` báo kiểm lại thư mục
   `packs/` (`server.js:74`); dòng `[mcp] chưa kết nối được Cổng OZ` báo kiểm lại URL và
   token Cổng (`server.js:101`).
3. Nếu bot không nhận được tin trong nhóm: kiểm tra bot đã được mời vào nhóm và
   trưởng nhóm đã xác nhận (`README.md:92`).
4. Nếu dùng polling mà bot im: kiểm tra chương trình đã dừng vì còn webhook
   (`channels/zalo-polling.js:11-14`).
5. Chạy `npm test` và `npm run eval` để biết phần mềm còn đúng không (xem [Kiểm thử](kiem-thu.md)).

## 7. Sao lưu dữ liệu

Trạng thái thật:

- Cơ sở dữ liệu SQLite của lõi: `DATA_DIR/bot.db` (`scripts/giam-sat.mjs:19`), do bot mở
  lúc khởi động (`server.js:38`).
- Sổ trượt từ vựng: mỗi ngày một tệp JSONL trong thư mục `TRUOT_DIR`
  (`packs/hs/miss-log.js:29`), không lưu mã chat hay người dùng (`packs/hs/miss-log.js:4`).
- Bản tin giám sát hằng ngày: tệp Markdown trong `DATA_DIR` (`scripts/giam-sat.mjs:78`).

Việc sao lưu tự động (T036, PR #77 commit `da8ffbe`) **đã xong**: `core/backup.js:63`
chạy khi 03:00 giờ VN qua bộ quét nền 5 giây (`server.js:102`), dùng
`store.vacuumInto` (`core/store.js:58`) sao lưu db sang thư mục `DATA_DIR/backup/bot-<ngày VN>.db`
và tự động giữ đúng 7 bản mới nhất (`core/backup.js:48`).

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
| Bot không nhận tin | Kiểm tra webhook (403 là sai mã, 404 là sai đường dẫn), rồi log khởi động (`server.js:84-85`) |
| Khách phàn về trả lời | Bật `DEBUG` để in log chi tiết (`server.js:24`), chạy lại và đọc log |
| Hằng ngày | Job giám sát lúc 07:30 tự chạy; kiểm tra issue mới và bản tin Telegram (`scripts/giam-sat.mjs:2`) |
| Trước khi mở PR | `npm test`, `npm run eval`, `node scripts/kiem-wiki.mjs` phải xanh (`CONTRIBUTING.md:23`) |
| Đổi hành vi | Cập nhật wiki cùng PR (`AGENTS.md`) |

## 10. Chuyển đường tin từ `a84e8bb` (11/11) sang `main` (2026-11)

Bản đang chạy đường tin Zalo thật là `a84e8bb` (11/11). Khoảng `a84e8bb..main` (`7b9c55b`)
gồm **77 commit / 79 số PR** (#187–#283) — nhiều hơn con số 14 commit nhìn thấy ở
`git log --oneline | head` lúc chia việc. Bảng dưới gom theo nhóm: mỗi dòng nói cần làm gì
khi chuyển đường tin; mọi số PR trong khoảng đều có mặt.

### Không cần gì thêm (chỉ việc deploy)

| Nhóm PR | Việc chính | Khi chuyển đường tin |
|---|---|---|
| #202, #213, #214, #216, #218, #219, #227, #229, #230, #231, #233, #234, #237, #239, #242, #244, #247, #248, #249, #250, #253, #262, #263, #264, #265, #267, #268, #269, #270–#283 | Sửa bóc câu, giữ tên hàng, đọc mã nước, hỏi lại thuộc tính, việc nền gọi lại (OZV-437 và các vá trước đó) | Không cần gì — code thuần trong `packs/hs/`, `core/` |
| #232, #235, #241 | Khoá hồi quy bằng dữ liệu thật (123 khoá câu hỏi Cổng, gói hs thật, ffmpeg) | Không cần gì — chỉ thêm/chỉnh test |
| #209, #204 | Đo thật trên main bằng chính gói `packs/hs`; dựng bộ đo độ đúng phân loại | Không cần gì — công cụ đo |
| #220, #238, #240, #243, #246, #251, #252, #255, #260, #261, #266 | Sửa script giám sát/QA/eval, khoá `qa-that/` khỏi git, script gpu-nha, cập nhật wiki | Không cần gì trên máy chủ bot; `qa-that/*.md` cũ còn sót trên đĩa do `git rm --cached` thì xoá tay được |
| #187, #190, #192, #208, #210, #211, #221, #223, #224 và commit `f0ecd11` (T808) | Hạng mục Spec 008: `gateway/` (hàng đợi, `/metrics` dịch vụ, anonymizer hai chiều) | Không cần gì cho đường tin Zalo — `gateway/` là dịch vụ riêng, `server.js` không nạp (xem `server.js:1-2`) |

### Phải biết / phải làm

| PR | Việc | Khi chuyển đường tin |
|---|---|---|
| #236 (OZV-804) | `Dockerfile` thêm `RUN apk add --no-cache ffmpeg` (`Dockerfile:5`) | **Build lại ảnh Docker**, không chỉ restart container cũ. Không có ffmpeg thì mỗi tin thoại lỗi `spawn ffmpeg ENOENT`, khách chỉ nhận tin chữ |
| #254 (OZV-1703) | Mặc định `PUBLIC_BASE_URL` đổi từ `zalo-bot.` sang `chatbot.uythacnhapkhau.com` (`core/config.js:72`) | Kiểm tra biến này trong env máy chủ. Chưa đặt thì URL tệp giọng nói (`core/giong-noi.js:144`) đổi sang tên miền mới — phải chắc tên miền đó phục vụ được `/am-thanh/` từ Internet. Đang đặt sẵn thì không đổi gì |
| #225 (OZV-709) | Thêm `GEMINI_TTS_TIMEOUT_MS`, `FFMPEG_TIMEOUT_MS` | Không bắt buộc đặt — đã có mặc định (mục 3) |
| #226 (OZV-763) | Thêm `SEND_TIMEOUT_MS` | Không bắt buộc đặt — đã có mặc định (mục 3) |
| #215 (OZV-496) | Thêm `CAU_TAM_SAU_MS` — câu tạm "Cổng đang bận" sau 2 phút | Không bắt buộc đặt — mặc định 120000 (mục 3) |
| #228, #245 (OZV-770, OZV-868) | Động cơ hỏi lại theo `so_tay_questions`/`cauHoi` hồ sơ, cờ `HS_HO_SO` | Hành vi mới **bật sẵn** sau khi chuyển (`packs/hs/so-tay-hoi.js:10`); hiện pctx không mang `env` nên chưa tắt được qua biến — biết trước là bot hỏi lại theo sổ tay Cổng |
| #256–#259 (Phương án 1 OZV-1527) | Menu số `0–3` cuối tin Giọng Quyên, nhận phím `0–3`, câu hỏi tách mã card mạng, cảnh báo giấy phép kèm số hiệu + thời gian cấp | **Mặc định TẮT từ OZV-2326** — dòng menu chỉ render khi cờ `MENU_SO_0_3` bật (`packs/hs/giong-quyen.js:118`, khai báo field `menuSo03` ở `core/config.js:95`); set `MENU_SO_0_3=1` trên bot thật chỉ sau khi CEO duyệt Phương án 1. Nhận phím `0–3` dựa phiên (`packs/hs/luong-chu.js:138`) nên vẫn chạy kể cả khi cờ TẮT |
| #222 (OZV-686) | `npm test` chạy thêm `test/gateway/**/*.test.mjs` | Không đụng máy chủ — chỉ máy tính và CI |

Không có gì khác phải làm: **không dependency mới** (repo không khai, `package.json:1-21`;
`package-lock.json` không đổi trong khoảng), **không migration** — không bảng mới, không
`ALTER`; cột `outbox.ctx` đọc ở bản mới đã có từ trước `a84e8bb` (`core/store/queue.js:41`).

### Lượt chuyển đường tin (một lượt cho QT)

1. Lấy duyệt CEO cho Phương án 1 (menu `0–3` bật sẵn khi chuyển); kiểm `PUBLIC_BASE_URL`
   trong env máy chủ theo dòng #254 ở bảng trên.
2. Sao lưu `DATA_DIR/bot.db` như mục 7, rồi **build lại ảnh Docker từ `main`** (nhận
   ffmpeg, `Dockerfile:5`) và triển khai ảnh mới.
3. Kiểm `/health` trả commit mới (`server.js:25`); gửi thử một tin hỏi phân loại HS và
   một tin xin trả lời bằng giọng nói.
4. Theo dõi `/metrics` và log hôm đó, để ý dòng `error stage=voice` (`core/giong-noi.js`);
   sự cố thì theo mục 6.
5. Muốn tinh chỉnh: các biến tùy chọn ở mục 3 (giọng nói, hạn giờ) — đặt trong `.env`
   rồi khởi động lại.

## Trang liên quan

- [Kiến trúc](kien-truc.md) — một đường xử lý, ranh giới giữa lõi, gói, kênh.
- [Dữ liệu](du-lieu.md) — bảng nào lưu gì, giữ bao lâu.
- [An toàn](an-toan.md) — nguyên tắc nào đang thực thi, nguyên tắc nào chưa.
- [Tiến độ](tien-do.md) — trạng thái thật từng việc T0xx.
- [Sự cố và bài học](su-co-bai-hoc.md) — sự cố đã gặp và cách xử lý.
