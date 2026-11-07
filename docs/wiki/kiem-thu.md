# Kiểm thử

> Cập nhật: 2026-11-07 · commit: 0842386

Trang này nói: repo có những cổng kiểm nào, chạy lệnh gì, bộ test nằm ở đâu, và
bộ kiểm thử còn thiếu gì. Kết quả chạy ghi trong mục "Kết quả chạy gần nhất" là của
ngày 07/11/2026 trên commit `0842386` (sau T016 — nối `server.js` vào lõi, xoá `lib/`).

## Ba cổng kiểm

| Cổng | Lệnh | Kiểm gì | Khai báo ở |
|---|---|---|---|
| Test | `npm test` | Test tự động của lõi và của gói hải quan, không cần mạng | `package.json:13` |
| Eval | `npm run eval` | Phát lại kịch bản sự cố qua đúng lõi, in `eval: đạt/tổng` | `package.json:14` |
| Wiki | `node scripts/kiem-wiki.mjs` | Trang wiki: tiêu đề, dòng cập nhật, trích dẫn tới tệp thật, link sống, không lộ bí mật | `scripts/kiem-wiki.mjs:1` |

Cổng wiki có thêm chế độ nghiêm: `node scripts/kiem-wiki.mjs --nghiem`. Chế độ này
coi trích dẫn vượt quá độ dài tệp là lỗi, không chỉ là cảnh báo
(`scripts/kiem-wiki.mjs:51`). Ba cổng này là cổng merge theo Hiến pháp
(`.specify/memory/constitution.md:67`).

Lệnh khác trong `package.json`:

- `npm run audit` khai trỏ tới *scripts/audit.mjs* (`package.json:15`). **Tệp đó chưa tồn tại** trong repo nên lệnh này lỗi khi chạy. Chỉ ghi nhận ở đây, không sửa.
- `npm run webhook:set` / `npm run webhook:info` đặt và xem webhook của bot (`package.json:16`, `package.json:17`).
- `npm run giam-sat` / `npm run giam-sat:dry` chạy script giám sát (`package.json:18`, `package.json:19`). Chi tiết ở [Triển khai và vận hành](trien-khai-van-hanh.md).

## Cấu trúc bộ test

Có **26 tệp test** chạy bằng `node --test` (20 tệp trong `test/core/`, 6 tệp trong
`packs/hs/test/`), cộng 1 bộ test riêng trong `test/test.mjs`.

### `test/core/` — test của lõi mới

| Tệp | Phủ cái gì |
|---|---|
| `test/core/smoke.test.mjs` | `node:sqlite` có sẵn và ghi được (`test/core/smoke.test.mjs:4`) |
| `test/core/store.test.mjs` | Lược đồ, migrate idempotent, claim inbox/jobs, TTL phiên, outbox, tickets, audit, messages, customers, transaction |
| `test/core/engine.test.mjs` | Một lượt khách: audit, chống trùng, phiên, nhịp việc nền, câu báo lỗi chung (đúng nguyên văn đường cũ, có thẻ màu `{orange}` — `test/core/engine.test.mjs:110`), giới hạn tần suất |
| `test/core/gate-send.test.mjs` | Cửa gửi: ghi outbox trước khi gửi, chống trùng, chia tin, hoãn giờ yên, trần, quét lại, thử lại |
| `test/core/gate-decide.test.mjs` | Bảng quyết định thuần của cửa (`decide`), theo đúng thứ tự điều kiện |
| `test/core/conv.test.mjs` | Khoá theo `conv_id` (T037): `convIdOf` cho chat 1-1 và nhóm (`test/core/conv.test.mjs:18`), trần ngày theo người và trần ngày của nhóm (`test/core/conv.test.mjs:138`), trạng thái theo người so với chặn cả nhóm (`test/core/conv.test.mjs:160`), phiếu và việc nền theo `conv_id` (`test/core/conv.test.mjs:261`) |
| `test/core/channel.test.mjs` | Adapter Zalo: chuẩn hoá update, khoá webhook, gửi tin, chặn polling khi đang có webhook |
| `test/core/registry.test.mjs` | Nạp và chọn gói theo thư mục, độ ưu tiên, điều kiện công cụ |
| `test/core/config.test.mjs` | Nạp cấu hình từ biến môi trường, ném lỗi khi giá trị sai |
| `test/core/time.test.mjs` | Giờ VN không phụ thuộc múi giờ máy, khung giờ yên |
| `test/core/text.test.mjs` | Chuẩn hoá tiếng Việt, so trùng, đọc số tiền, tách tin |
| `test/core/redact.test.mjs` | Che bí mật và phát hiện đường dẫn nội bộ trong tin gửi |
| `test/core/loi-goc-khach.test.mjs` | Khách không thấy lỗi gốc khi Cổng OZ lỗi, 3 ca: nhánh chạy gói (`test/core/loi-goc-khach.test.mjs:101`), nhánh mở lại lượt `ket-qua` (`test/core/loi-goc-khach.test.mjs:112`), nhánh đọc ảnh (`test/core/loi-goc-khach.test.mjs:125`); không lộ đường dẫn nội bộ hay khoá (`test/core/loi-goc-khach.test.mjs:24`), phải có câu báo chuẩn (`test/core/loi-goc-khach.test.mjs:108`) |
| `test/core/health.test.mjs` | Nội dung trả lời `/health` (`test/core/health.test.mjs:1`) |
| `test/core/eval-run.test.mjs` | Bản thân bộ chạy eval: thư mục rỗng → `eval: 0/0`; kịch bản sai → thoát 1 và in tên kịch bản (`test/core/eval-run.test.mjs:12`, `test/core/eval-run.test.mjs:21`) |
| `test/core/fakes.test.mjs` | Bản thân bộ đồ giả dùng chung |
| `test/core/giam-sat.test.mjs` | 9 tín hiệu giám sát (spec 007) |
| `test/core/giam-sat-telegram.test.mjs` | Gửi tin cảnh báo qua Telegram |
| `test/core/group-tag.test.mjs` | Gắn tên người nhận trong nhóm (T038): tên trùng nhau thì phân biệt bằng hậu tố 2 ký tự cuối `userId` (`test/core/group-tag.test.mjs:51`) |
| `test/core/one-gate.test.mjs` | Một cửa gửi: quét đệ quy `core/`, `packs/`, `channels/`, `scripts/` cộng `server.js` và đòi đúng một nơi gọi `.sendText(` (`test/core/one-gate.test.mjs:167`); thêm ra đó là đòi `server.js` không dài quá 120 dòng (`test/core/one-gate.test.mjs:141`), thư mục `lib/` không còn tồn tại (`test/core/one-gate.test.mjs:173`), gói được nạp theo đường dẫn tương đối tới **tệp mã nguồn** nên không phụ thuộc thư mục làm việc (`test/core/one-gate.test.mjs:146`) và `server.js` phải **cảnh báo to** khi không nạp được gói nào (`test/core/one-gate.test.mjs:153`) |

### `packs/hs/test/` — test của gói hải quan

`packs/hs/test/hs.test.mjs` (hành vi của 7 gói con), `packs/hs/test/brain.test.mjs`
(não định tuyến), `packs/hs/test/editor.test.mjs` (não biên tập),
`packs/hs/test/llm2.test.mjs` (khoá dự phòng), `packs/hs/test/policy.test.mjs`
(chính sách nhập khẩu), `packs/hs/test/style.test.mjs` (định dạng rich text).

### Đồ giả — không dùng mạng

`test/helpers/fakes.mjs` cấp 3 đồ giả dùng chung:

- `fakeChannel` — kênh giả, ghi lại tin đã gửi, có thể cố ý lỗi (`test/helpers/fakes.mjs:3`).
- `fakeMcp` — Cổng OZ giả, chạy theo kịch bản định sẵn (`test/helpers/fakes.mjs:23`).
- `fakeClock` — đồng hồ giả, nhảy thời gian được (`test/helpers/fakes.mjs:41`).

`test/helpers/legacy-bot.mjs` là bọc riêng cho test: nó dựng `createBot` cũ trên
lõi mới để bộ test cũ chạy được (`test/helpers/legacy-bot.mjs:1`). Tệp này đặt ở
trong `test/` để `server.js` không vô tình import nhầm — có test canh điều đó
(`test/core/engine.test.mjs:302`).

Các test gọi mô hình ngôn ngữ (não định tuyến, não biên tập, khoá dự phòng) truyền
`fetch` giả vào nên cũng không cần mạng, ví dụ `packs/hs/test/editor.test.mjs:10`.
Hiến pháp quy định `npm test` phải chạy được không mạng
(`.specify/memory/constitution.md:28`).

### `test/test.mjs` — bộ test cũ

Đây không phải `node --test` mà là bộ tự viết: hàm `t()` tự đếm và in dấu tick
(`test/test.mjs:15`), cuối file in tổng (`test/test.mjs:536`). Bộ này kiểm tra hành vi
cũ của đường chạy thật (bot cũ, não AI, sổ trượt, định dạng tin).

## Bộ eval

`npm run eval` chạy `eval/run.mjs`. Bộ chạy dựng đúng lõi thật (SQLite, cửa gửi,
engine, gói hải quan) với kênh, Cổng OZ và đồng hồ giả lập
(`eval/run.mjs:56`, đồ giả lấy từ `eval/run.mjs:22`). Không mạng, không tốn token.

Một kịch bản là một tệp `.jsonl`, mỗi dòng một bước. Mốc giờ mặc định là
10:00 giờ VN (`eval/run.mjs:24`). Các bước: `mcp` (kịch bản công cụ), `in` (khách
nhắn), `advance`/`at` (nhảy đồng hồ), `restart` (đóng lõi, mở lại cùng tệp SQLite
— `eval/run.mjs:83`), `expect` (đếm và so chữ tin đã gửi). Bước `staff` (lệnh
nhân viên) hiện **luôn trượt** vì tính năng chưa có (`eval/run.mjs:92`).

Kết quả in dạng `eval: đạt/tổng kịch bản đạt` (`eval/run.mjs:121`) và tiến trình
thoát mã 1 nếu có kịch bản trượt (`eval/run.mjs:122`).

### Bảy kịch bản đang có

| Tệp | Sự cố mà kịch bản chặn |
|---|---|
| `eval/fixtures/retry-webhook.jsonl` | Zalo gửi lại cùng tin → trả lời đúng một lần |
| `eval/fixtures/double-tap.jsonl` | Khách gửi hai lần cùng chữ → không nhận hai câu giống nhau |
| `eval/fixtures/silent-customer.jsonl` | Đã trả kết quả, khách im → không tự nhắn thêm |
| `eval/fixtures/leak.jsonl` | Cổng trả đường dẫn tệp nội bộ → không lộ cho khách |
| `eval/fixtures/restart-mid-job.jsonl` | Khởi động lại giữa lúc phân loại → kết quả vẫn tới |
| `eval/fixtures/quiet-hours.jsonl` | Giờ yên 23:00–07:00 giờ VN → tin chủ động hoãn tới sáng |
| `eval/fixtures/cong-ai-ban.jsonl` | Cổng báo bận → báo đúng, không bịa mã |

Nguồn bảng này: `eval/README.md:25`.

### So với yêu cầu trong spec

Spec 001 yêu cầu **9 kịch bản** (`specs/001-nen-tang-chung/tasks.md:518`) và
bước kiểm tra là `npm run eval` phải in `eval: 9/9`
(`specs/001-nen-tang-chung/tasks.md:530`).

Hiện mới có 7. Ba kịch bản còn thiếu được ghi rõ trong `eval/README.md:37`:
`human-room` (chờ T022–T026), `is-bot` (chờ T023) và `ho-so-khach` (chờ
T033–T036). Tức là **còn thiếu 3 kịch bản so với spec** — ghi nhận tại đây, không
sửa gì trong spec.

## CI

`.github/workflows/ci.yml` có hai job:

| Job | Câu lệnh | Dòng |
|---|---|---|
| `test` | `npm test` rồi `npm run eval` | `.github/workflows/ci.yml:17`, `.github/workflows/ci.yml:18` |
| `wiki` | `node scripts/kiem-wiki.mjs` | `.github/workflows/ci.yml:27` |

Cả hai job dùng Node 22 (`.github/workflows/ci.yml:16`, `.github/workflows/ci.yml:26`).
Job `test` có giới hạn 15 phút, job `wiki` có giới hạn 5 phút. Workflow chạy khi
có pull request và khi push lên `main` (`.github/workflows/ci.yml:3`).

Lưu ý: job `wiki` chạy cổng **không** có `--nghiem`. Nghĩa là trích dẫn vượt số
dòng chỉ ra cảnh báo chứ không làm đỏ CI. Muốn cổng nghiêm thì phải tự chạy
`node scripts/kiem-wiki.mjs --nghiem`.

## Khi nào chạy cái nào

| Tình huống | Chạy |
|---|---|
| Sửa code trong `core/`, `packs/`, `channels/` | `npm test` |
| Sửa hành vi gửi tin, giờ yên, chống trùng, việc nền | `npm test` + `npm run eval` |
| Thêm hoặc đổi gói nghiệp vụ | `npm test` (gói có test riêng trong `packs/hs/test/`) |
| Sửa hoặc thêm trang wiki | `node scripts/kiem-wiki.mjs --nghiem` |
| Đổi hành vi, cần cập nhật wiki | `npm test` + `npm run eval` + cổng wiki |
| Trước khi mở PR | `npm test` + `npm run eval` + cổng wiki, đủ ba cùng xanh |

Hiến pháp yêu cầu việc mới phải có test đỏ trước khi sửa
(`.specify/memory/constitution.md:29`) và `npm run eval` không được tụt điểm so
với `main` (`.specify/memory/constitution.md:67`).

## Kết quả chạy gần nhất

Ngày 07/11/2026, chạy tại thư mục gốc repo trên commit `0842386` (sau T016 — nối
`server.js` vào lõi, xoá `lib/`, thêm `test/core/one-gate.test.mjs`):

```
npm test
  # tests 274
  # pass 274
  # fail 0
  # skipped 0
  # todo 0
  → 34 test đạt          (phần test/test.mjs)

npm run eval
  ✓ cong-ai-ban
  ✓ double-tap
  ✓ leak
  ✓ quiet-hours
  ✓ restart-mid-job
  ✓ retry-webhook
  ✓ silent-customer
  eval: 7/7 kịch bản đạt

node scripts/kiem-wiki.mjs --nghiem
  wiki: ĐẠT (16 trang).
```

Lệnh `npm test` đạt 274 test, 0 trượt (phần `test/test.mjs` in thêm "34 test đạt").
Lệnh `npm run eval` đạt 7/7 kịch bản. Cổng wiki nghiêm đạt ở 16 trang.

## Giới hạn của bộ kiểm thử

Các điểm này đọc từ code, không phải suy đoán:

- **"Một cửa gửi" nay đã có test bảo chứng trên toàn repo.** Tệp
  `test/core/one-gate.test.mjs:167` quét đệ quy `core/`, `packs/`, `channels/`, `scripts/`
  cộng `server.js` và đòi đúng một nơi gọi `.sendText(` — đó là `core/gate.js:79`.
  Trước T016, đường cũ ở lib/bot.js gọi thẳng `zalo.sendText` và không có tệp test
  nào khẳng định điều đó.
- **Chưa có bộ test cho việc nền bền và hàng đợi theo phòng.** Việc nền mới có
  bộ đồ giả đồng hồ trong test của engine, chưa có tệp riêng.
- **Bản tin gộp 08:00/17:00, lệnh nhân viên và hồ sơ khách chưa có kịch bản eval.**
  Bước `staff` trong eval luôn trượt (`eval/run.mjs:92`).
- **Chưa có `/metrics`.** Cổng `/health` chỉ trả trạng thái khởi động và phiên bản
  (`test/core/health.test.mjs:1`).
- **`npm run audit` chưa chạy được** vì tệp đích chưa tồn tại (`package.json:15`).
- **Điểm mờ:** các test của não AI kiểm luật an toàn bằng `fetch` giả, không kiểm
  hành vi thật của nhà cung cấp mô hình.

## Trang liên quan

- [Kiến trúc](kien-truc.md) — một đường xử lý trong repo.
- [Tiến độ](tien-do.md) — trạng thái T0xx của spec 001, kèm mâu thuẫn tài liệu và code.
- [Sự cố và bài học](su-co-bai-hoc.md) — nguồn của các kịch bản eval.
- [An toàn](an-toan.md) — các nguyên tắc mà bộ test kiểm được và không kiểm được.
