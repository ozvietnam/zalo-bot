# Kiểm thử

> Cập nhật: 2026-11-11 · commit: a84e8bb

Trang này nói: repo có những cổng kiểm nào, chạy lệnh gì, bộ test nằm ở đâu, số liệu kiểm thử thực tế và các công cụ đo lường chất lượng.

## Các cổng kiểm và lệnh CLI

| Cổng / Lệnh | Câu lệnh | Kiểm gì | Khai báo ở |
|---|---|---|---|
| Test | `npm test` | Test tự động của lõi, giám sát và gói hải quan, không cần mạng | `package.json:13` |
| Eval | `npm run eval` | Phát lại kịch bản sự cố qua đúng lõi, in `eval: đạt/tổng` (17/17) | `package.json:14` |
| Audit | `npm run audit` | CLI chỉ đọc tra cứu sổ nhật ký audit, che số điện thoại và bí mật | `package.json:15` |
| Đo SC | `npm run do-sc` | Đo lường SC-002, SC-007, SC-009 trên database SQLite thật | `package.json:16` |
| Wiki | `node scripts/kiem-wiki.mjs` | Kiểm tiêu đề, mốc cập nhật, trích dẫn tới tệp thật, link sống | `scripts/kiem-wiki.mjs:1` |
| QA thật | `node scripts/qa-that.mjs` | Bộ chạy QA kịch bản thực tế đích G2–G4 (5 kịch bản tự nhiên) | `scripts/qa-that.mjs:1` |
| Đo độ đúng HS | `node scripts/do-dung-hs.mjs` | Chấm top-1/top-3 mã HS tám số trên bộ đề dựng từ văn bản pháp luật | `scripts/do-dung-hs.mjs:1` |
| Webhook | `npm run webhook:info` | Đặt hoặc xem cấu hình webhook của bot Zalo | `package.json:17`, `package.json:18` |
| Giám sát | `npm run giam-sat` | Chạy bộ quét giám sát 9 tín hiệu chất lượng và sự cố | `package.json:19`, `package.json:20` |

Cổng wiki có chế độ nghiêm ngặt: `node scripts/kiem-wiki.mjs --nghiem`. Chế độ này coi trích dẫn vượt quá số dòng tệp là lỗi chặn merge (`scripts/kiem-wiki.mjs:53`). Ba cổng `npm test`, `npm run eval` và kiểm wiki nghiêm là điều kiện bắt buộc trước khi mở PR theo Hiến pháp (`.specify/memory/constitution.md:67`).

---

## Cấu trúc bộ test

Bộ kiểm thử tự động gồm **74 tệp test** chạy qua `node --test` (51 tệp trong `test/core/`, 12 tệp trong `test/giam-sat/`, 11 tệp trong `packs/`), cộng thêm 1 bộ test hành vi truyền thống trong `test/test.mjs`.

### 1. `test/core/` — Kiểm thử đơn vị & tích hợp của lõi

Bao gồm 51 tệp kiểm thử tự động, phủ toàn diện các thành phần của hệ thống lõi:

| Nhóm chức năng | Tệp test tiêu biểu | Nội dung kiểm thử |
|---|---|---|
| **Lưu trữ & Dữ liệu** | `test/core/store.test.mjs`<br>`test/core/smoke.test.mjs`<br>`test/core/backup.test.mjs` | Lược đồ 11 bảng SQLite (`core/store/schema.js:10`), claim inbox/jobs nguyên tử, TTL session, sao lưu database 03:00 VN (`core/backup.js:63`) |
| **Cửa gửi & Chống trùng** | `test/core/one-gate.test.mjs`<br>`test/core/gate-send.test.mjs`<br>`test/core/gate-decide.test.mjs` | Quét toàn repo xác nhận duy nhất `core/gate.js:82` gọi `sendText`, 4 loại quyết định cửa, chống trùng Jaccard, giờ yên |
| **Xử lý hội thoại** | `test/core/engine.test.mjs`<br>`test/core/queue.test.mjs`<br>`test/core/conv.test.mjs`<br>`test/core/group-tag.test.mjs` | Hàng đợi tuần tự theo người (`convId`), gắn tên phân biệt trong nhóm chat, giới hạn tần suất 60s |
| **Bàn giao người (Handoff)** | `test/core/handoff-state.test.mjs`<br>`test/core/handoff-ticket.test.mjs`<br>`test/core/handoff-cmd.test.mjs`<br>`test/core/engine-handoff.test.mjs` | Máy trạng thái phòng (`core/handoff.js:100`), tự về bot sau 2 giờ lặng, mở phiếu vào nhóm nhân viên, lệnh `/tl`, `/nhan`, `/tra-bot` |
| **Nhận diện ý định** | `test/core/intents.test.mjs` | Nhận diện khách xin gặp người (`wantsHuman`), hỏi người hay máy (`asksIfBot`), né từ ngữ mơ hồ |
| **Bảo mật & Ẩn danh** | `test/core/sdt.test.mjs`<br>`test/core/sanitizer.test.mjs`<br>`test/core/redact.test.mjs`<br>`test/core/loi-goc-khach.test.mjs` | Che số điện thoại (`core/sdt.js:167`), phân biệt mã HS với SĐT, lọc số tài khoản (`core/sanitizer.js:108`), chặn rò rỉ lỗi gốc |
| **Hồ sơ & Tra cứu audit** | `test/core/customers.test.mjs`<br>`test/core/engine-customers.test.mjs`<br>`test/core/audit-cli.test.mjs`<br>`test/core/audit-masking.test.mjs` | Quản lý hồ sơ khách (`core/customers.js:102`), CLI `npm run audit` chỉ-đọc và che dữ liệu cá nhân (`scripts/audit.mjs:1`) |
| **Vận hành & Chịu lỗi** | `test/core/recover.test.mjs`<br>`test/core/stress.test.mjs`<br>`test/core/jobs.test.mjs`<br>`test/core/ops.test.mjs`<br>`test/core/webhook.test.mjs` | Khôi phục sau sập nguồn T020 (`core/engine.js:265`), SC-001 chịu tải 1.000 update, việc nền bền vững, `/health` và `/metrics` |

### 2. `test/giam-sat/` — Kiểm thử hệ thống giám sát (Spec 007)

Bao gồm 12 tệp test chuyên biệt cho Agent giám sát:
- `test/giam-sat/tinh-hieu.test.mjs`: Bắt đủ 9/9 tín hiệu chất lượng có fingerprint và `turn_id`.
- `test/giam-sat/giam-sat-sc002-tuan.test.mjs`: Kiểm tra SC-002 bảo đảm 0 rò rỉ dữ liệu khách trong issue (`scripts/giam-sat/sc-002.js:47`).
- `test/giam-sat/cong-oz.test.mjs`: Đọc số đo Cổng OZ và bắt cảnh báo công cụ chậm.
- `test/giam-sat/digest-delivery.test.mjs`: Gửi bản tin qua hộp thư riêng an toàn.
- `test/giam-sat/readonly-store.test.mjs`, `test/giam-sat/vong-lap.test.mjs`, `test/giam-sat/so-nhat-ky.test.mjs`: Đảm bảo an toàn chỉ đọc dữ liệu và đo lường vòng lặp cải tiến.

### 3. `packs/` — Kiểm thử các gói nghiệp vụ

- `packs/hs/test/`: 9 tệp test cho nghiệp vụ hải quan (`packs/hs/test/hs.test.mjs`, `packs/hs/test/brain.test.mjs`, `packs/hs/test/editor.test.mjs`, `packs/hs/test/llm2.test.mjs`, `packs/hs/test/policy.test.mjs`, `packs/hs/test/style.test.mjs`, `packs/hs/test/dien-cho-thieu.test.mjs`, `packs/hs/test/giong-quyen.test.mjs`, `packs/hs/test/trinh-bay.test.mjs`).
- `packs/echo/test/`: 2 tệp test cho gói mẫu (`packs/echo/test/echo.test.mjs`, `packs/echo/test/echo-engine.test.mjs`), chứng minh khả năng nạp gói động mà không sửa bất kỳ dòng nào trong `core/`.

### 4. `test/test.mjs` — Bộ test kiểm tra hành vi cũ

Bộ test tự viết kiểm tra tương thích ngược và chuyển đổi 7 gói hải quan: 34 test đạt 100%.

---

## Bộ eval kịch bản

`npm run eval` chạy bộ đánh giá tự động `eval/run.mjs:1` (311 dòng). Bộ chạy dựng đúng lõi thật (store SQLite, cửa gửi, engine, máy trạng thái handoff, gói hải quan) với kênh Zalo giả, Cổng OZ giả và đồng hồ giả lập (`eval/run.mjs:24`). Toàn bộ quá trình chạy hoàn toàn offline, 0 tốn token và độc lập với môi trường mạng.

### Cơ chế thực thi các bước (.jsonl)

Một kịch bản là một tệp `.jsonl`, mỗi dòng là một bước xử lý tuần tự:
1. `mcp`: Cấu hình danh sách kết quả giả lập từ Cổng OZ (`eval/run.mjs:38`).
2. `config`: Nạp biến cấu hình riêng cho kịch bản (`eval/run.mjs:108`).
3. `in`: Khách gửi tin nhắn đến bot (`eval/run.mjs:110`).
4. `staff`: **Lệnh nhân viên CSKH** (`/tl`, `/nhan`, `/tra-bot`, `/chan`, `/cho`) gửi trong nhóm nhân viên `staffChatId` (`eval/run.mjs:113-127`), được đưa vào `engine.process` và điều khiển qua `core/handoff.js:177`.
5. `advance` / `at`: Điều chỉnh thời gian giả lập (`eval/run.mjs:129`, `eval/run.mjs:130`).
6. `restart`: Mô phỏng sập nguồn và khởi động lại chuẩn: đóng SQLite, mở lại và gọi tuần tự `gate.recover()`, `jobs.recover()`, `engine.recover()` (`eval/run.mjs:101`).
7. `expect`: Khẳng định số lượng tin gửi ra, mẫu regex cần chứa hoặc cấm chứa (`eval/run.mjs:132-143`).
8. `checkMessages`: Tự động kiểm tra tiêu chí SC-008 ở cuối mỗi kịch bản (`eval/run.mjs:149`, `eval/run.mjs:167`), đối chiếu dòng `inbox done`, `outbox sent` và dòng bảng `messages`.

### 17 kịch bản eval hiện có (17/17 đạt)

Bộ eval gồm 12 kịch bản tích hợp luồng và 5 ca kiểm trung lập:

| STT | Kịch bản | Ngăn chặn sự cố gì |
|---|---|---|
| 1 | `eval/fixtures/retry-webhook.jsonl` | Zalo gửi lại cùng một tin nhắn → bot trả lời đúng 1 lần |
| 2 | `eval/fixtures/double-tap.jsonl` | Khách bấm gửi 2 lần cùng nội dung → không nhận 2 câu giống nhau |
| 3 | `eval/fixtures/silent-customer.jsonl` | Đã trả kết quả, khách im lặng → bot không tự động nhắn thêm |
| 4 | `eval/fixtures/leak.jsonl` | Cổng trả đường dẫn tệp nội bộ hoặc stack → bot không làm lộ ra khách |
| 5 | `eval/fixtures/restart-mid-job.jsonl` | Tiến trình chết giữa lúc phân loại → kết quả việc nền vẫn được giao đủ |
| 6 | `eval/fixtures/quiet-hours.jsonl` | Khung giờ yên 23:00–07:00 VN → tin nhắn chủ động hoãn tới sáng hôm sau |
| 7 | `eval/fixtures/cong-ai-ban.jsonl` | Cổng OZ báo bận/lỗi → báo lỗi thân thiện, không bịa mã HS |
| 8 | `eval/fixtures/human-room.jsonl` | Phòng chuyển sang nhân viên tiếp quản (`/nhan`, `/tl`) → bot im tuyệt đối |
| 9 | `eval/fixtures/is-bot.jsonl` | Khách hỏi "người hay máy" → bot nói thật là trợ lý tự động của OZ |
| 10 | `eval/fixtures/ho-so-khach.jsonl` | Mở phiếu bàn giao → phiếu luôn kèm tóm tắt hồ sơ khách và nhu cầu |
| 11 | `eval/fixtures/hoi-lai.jsonl` | Thiếu dữ kiện phân loại → bot hỏi lại ngắn gọn thay vì gọi bừa |
| 12 | `eval/fixtures/ba-ma-khac-nhau.jsonl` | Khách tra cứu 3 mặt hàng khác nhau trong cùng phiên → không bị lẫn lộn |
| 13 | `eval/chung/01-cong-loi-khong-bia-hs.json` | Cổng lỗi không tự ý phỏng đoán mã HS |
| 14 | `eval/chung/02-phan-biet-gia-tri-so.json` | Phân biệt chính xác giá trị số trong bản chốt AI |
| 15 | `eval/chung/03-chan-sdt-va-so-tai-khoan.json` | Lọc và che triệt để số điện thoại và số tài khoản ngân hàng |
| 16 | `eval/chung/04-hoi-nguoi-hay-may.json` | Phản hồi trung thực quy chuẩn khi khách hỏi vai trò bot |
| 17 | `eval/chung/05-khach-xin-sdt.json` | Khách xin số điện thoại hỗ trợ → chuyển tiếp quy trình CSKH |

---

## Bộ đo độ đúng phân loại HS

`node scripts/do-dung-hs.mjs` (`scripts/do-dung-hs.mjs:1`) trả lời một câu mà trước đây repo không đo được: **bot ra mã HS đúng bao nhiêu phần trăm?** Các cổng `npm test`, `npm run eval`, `qa-that` chỉ kiểm bot có *hành xử* đúng (không trùng tin, không bịa số hiệu, hỏi lại khi thiếu dữ kiện); chúng không nói mã trả ra có đúng mã của văn bản hay không.

### Bộ đề dựng từ văn bản pháp luật

Bộ đề nằm ở `eval/bo-de/phan-loai-tu-luat.json`: **50 ca, trải 26 chương** biểu thuế. Mỗi ca dựng từ hai nguồn pháp luật, không từ tờ khai cũ hay bộ vàng nội bộ (`oz-gold-final.jsonl`) — theo chỉ đạo CEO 10/11 "phân loại HS bám luật":

- **tên dòng biểu thuế** (trường `tenDongBieuThue`, trỏ về dòng tám số bằng `nguon.tepBieuThue`);
- **Thông báo kết quả phân loại của Tổng cục Hải quan** (`nguon.loai = "TB-TCHQ"`, kèm `nguon.soHieu`, `nguon.nam` và `nguon.trich` trích nguyên văn đoạn căn cứ).

Ca nào văn bản đã nêu rõ mã dễ lẫn thì ghi vào `maLan` (50/50 ca có), nên bộ đề nặng về **ranh giới khó** chứ không phải hàng dễ. Câu khách (`cauKhach`) bị máy kiểm ba điều, vì hỏng một trong ba là bộ đề chấm oan con bot:

- **không chứa sẵn mã HS** — mớm đáp án thì phép đo thành vô nghĩa;
- **không phải tên nhóm/dòng biểu thuế chép lại** từ đoạn trích. Khách thật gõ "sạc pin cho điện thoại di động", không gõ nguyên văn tên nhóm trong ngoặc kép của Thông báo; chép như vậy thì ca thiếu hẳn dữ kiện nhận dạng và bot bị chấm trượt dù làm đúng luật;
- **nguồn không được là thông báo đính chính**. Thông báo đính chính chỉ sửa câu chữ của một Thông báo khác: không có tên hàng, và mã trong phần "nội dung đã ban hành" chính là mã **sai** đang được sửa. Hai ca bị bỏ vì lỗi này (`2174/TB-TCHQ` đính chính `1811/TB-TCHQ`, `1377/TB-TCHQ` đính chính `1182/TB-TCHQ`) — riêng ca `2174` còn lấy luôn mã `3208.20.90` mà chính văn bản đó sửa thành `3208.90.90`.

### Cách chấm

Bộ đo chạy từng ca qua **đúng đường bot thật** (dùng lại `runSingleScenario` của `scripts/qa-that.mjs:406`, không dựng đường riêng), rồi chấm trên **tin gửi khách** — đúng thứ khách nhìn thấy, không phải dữ liệu thô của Cổng:

- `top1`: mã ở dòng `✅ Mã HS đề xuất` (`packs/hs/render.js:293`) đúng mã của văn bản;
- `top3`: mã đúng nằm trong mã chốt + mục `🔁 Mã khác cần cân nhắc` (`packs/hs/render.js:329`);
- đo ở **tám số**: đúng 6 số đầu mà lệch 2 số cuối **không** tính là đúng, chỉ ghi cờ `dung6So` để biết lệch ở cấp nào;
- `roiVaoMaLan`: bot rơi vào đúng mã mà văn bản đã loại trừ — ca trượt đáng lo nhất;
- `msTrungBinh`: thời gian trung bình một ca.

Khi một ca vừa `roiVaoMaLan` vừa `dung6So` thì lý do in ra là **"rơi vào mã dễ lẫn"**, không phải "lệch 2 số cuối". Mã dễ lẫn thường cùng 6 số đầu với mã đúng (6 ca trong bộ đề: `8504.40.19` ↔ `8504.40.11`, `7209.16.10` ↔ `7209.16.90`…); gọi tên "lệch 2 số cuối" nghe như sai nhỏ, trong khi bot đã rơi vào đúng cái mã văn bản loại trừ — lỗi nặng hơn và đúng chỗ cần sửa.

Hàm đọc mã (`docMaTuTin`) phải biết **cả hai khuôn tin** bot thật gửi khách, thiếu một khuôn là độ đúng ra thấp giả:

- **form đầy đủ** (`packs/hs/render.js:293,329`): chỉ nhặt mã trong **vùng liệt kê mã**, mỗi dòng một mã — render in `• 2106.10.00 — không phải 2106.90.00 vì…`, nhặt cả hai thì mã bị *loại trừ* trong lý do lại được tính là mã bot đề xuất và đẩy mã thật ra khỏi top-3;
- **giọng Quyên** (`packs/hs/giong-quyen.js:67,70`), là khuôn dùng ở chat riêng: `Dạ … thì mã phù hợp nhất là {b}8509.40.00{/b} (…)`. Tin này không có tiêu đề mục nào nên vòng quét theo vùng liệt kê bỏ qua sạch; nhặt được mã ở câu chốt rồi là **đóng vùng** ngay, vì các dòng sau là thuế/chính sách/lưu ý và mã trong đó (số hiệu văn bản) không phải mã bot đề xuất.

### Tự kiểm cái thước

`test/core/do-dung-hs.test.mjs` có hai bài chạy bộ đo qua lõi thật với Cổng kịch bản: Cổng trả **đúng** mã của văn bản thì bộ đo phải báo **100%**, trả **sai** thì phải báo **0%**. Thiếu hai bài này thì một bộ đo hỏng (đọc sai khuôn tin, sai tên công cụ…) luôn báo 0% và trông y như một con bot kém.

### Giới hạn hiện tại

Chế độ `--mock` chỉ kiểm **đường đo chạy được**: Cổng OZ giả chỉ biết vài món nên mọi con số ra từ `--mock` **không phải độ đúng thật của bot**. Muốn có số thật phải chạy không có `--mock`, cần `OZ_MCP_TOKEN` và `GEMINI_API_KEY` — chưa chạy được trong môi trường agent vì repo chỉ có `.env.example`.

---

## Bảng đối chiếu mục tiêu thành công (SC-001 đến SC-009)

Đối chiếu đầy đủ với tài liệu nghiệm thu `specs/001-nen-tang-chung/sc-do.md:11`:

| Mã SC | Tiêu chí đặc tả | Phương pháp đo & Bằng chứng mã nguồn | Kết quả đo thực tế | Đánh giá |
|---|---|---|---|---|
| **SC-001** | 1.000 update, 10% lặp, 3 lần reboot: trùng = 0, mất = 0 | `test/core/stress.test.mjs:47-192`, `core/gate.js:214`, `core/engine.js:265` | • Tin trùng: **0**<br>• Tin mất: **0**<br>• Tin phát lại: **14/14**<br>• Tin cũ giờ yên: **0** | **ĐẠT** (Lab) |
| **SC-002** | Phòng `human`: tin bot ra = 0 trên eval và audit 7 ngày chạy thật | `core/engine.js:164`, `core/engine-handoff.js:49`, `eval/fixtures/human-room.jsonl:1`, `scripts/giam-sat/sc-002.js:47` | • Lab: **0** tin bot tự động gửi<br>• Thật: Chờ 7 ngày mở lại bot | **ĐẠT** (Lab)<br>*Chờ đo thực địa* |
| **SC-003** | Việc nền lúc restart: 100% giao đúng 1 lần, < 5 phút | `test/core/jobs.test.mjs:134-179`, `test/core/recover.test.mjs:75-120`, `eval/fixtures/restart-mid-job.jsonl` | • Giao việc: **100%**<br>• Đúng **1 lần** (nhờ khoá idem)<br>• Thời gian: **< 5 phút** | **ĐẠT** (Lab) |
| **SC-004** | Webhook trả 200 trong < 200 ms (p95), 50 update đồng thời | `test/core/webhook.test.mjs:645-729`, `core/webhook.js:40` | • Phản hồi: **50/50** HTTP 200<br>• Client ack: p95 = **~40–50 ms** (ngưỡng < 200 ms) | **ĐẠT** (Lab) |
| **SC-005** | 21 test cũ đạt sau chuyển gói; thêm gói mẫu không đổi `core/` | `test/test.mjs:1`, `packs/echo/test/echo.test.mjs:1` | • Test chuyển gói: **34/34** đạt<br>• Gói mẫu `packs/echo/`: nạp động, `git diff core/` rỗng | **ĐẠT** (Lab) |
| **SC-006** | Phiếu → nhân viên thấy trong nhóm < 10 giây (p95) | `core/handoff-ticket.js:107-136`, `server.js:104`, `test/core/handoff-ticket.test.mjs:61-120` | • Mở phiếu mới: gửi tức thì (< 100 ms)<br>• Quét dồn tin: mỗi 5s<br>• Tổng trễ: p95 **< 10 giây** | **ĐẠT** (Lab) |
| **SC-007** | Mọi tin ra 7 ngày chạy thật tra được `turn_id` trong audit | `core/gate.js:59`, `test/core/one-gate.test.mjs:200`, `scripts/do-sc-thuc.mjs:1` | • Lab: **100%** tin outbox có audit `gate`<br>• Thật: Chờ 7 ngày mở lại bot | **ĐẠT** (Lab)<br>*Chờ đo thực địa* |
| **SC-008** | Đếm `messages` bằng fixture eval (khách vào + tin ra = messages) | `eval/run.mjs:149`, `eval/run.mjs:167` (hàm `checkMessages`) | • Đạt: **12/12** kịch bản (100%)<br>• Khách vào: 22, Tin gửi: 19, Messages: 41 | **ĐẠT** (Lab) |
| **SC-009** | 20 phiếu chạy thật đầu tiên luôn có tóm tắt hồ sơ khách | `core/handoff-ticket.js:50` (`dongHoSo`), `test/core/engine-customers.test.mjs:83-100` | • Lab: **100%** phiếu có khối tóm tắt<br>• Thật: Chờ soát 20 phiếu thật đầu tiên | **ĐẠT** (Lab)<br>*Chờ đo thực địa* |

**Tổng kết:** **6/9 Đạt trọn vẹn trong lab**, **3/9 Đạt về code** (chờ nghiệm thu chạy thật 7 ngày: SC-002, SC-007, SC-009).

---

## Tự động hoá CI

Quy trình CI trên GitHub Actions (`.github/workflows/ci.yml`) tự động thực thi khi có Pull Request hoặc push lên `main`:
1. `npm test`: Chạy 74 tệp test đơn vị và test chuyển gói (Node 22).
2. `npm run eval`: Chạy 17/17 kịch bản eval kiểm tra chống sự cố và đối chiếu `messages` (SC-008).
3. `node scripts/kiem-wiki.mjs`: Kiểm tra tính toàn vẹn của wiki.

---

## Kết quả chạy nghiệm thu thực tế

Kết quả thực thi tại commit `14595d4` ngày 2026-11-10:

```
npm test
  # tests 844
  # pass 844
  # fail 0
  # skipped 0
  # todo 0
  → 34 test đạt          (phần test/test.mjs)
  Tổng cộng: 878 test đạt 100%.

npm run eval
  ✓ ba-ma-khac-nhau
  ✓ cong-ai-ban
  ✓ double-tap
  ✓ ho-so-khach
  ✓ hoi-lai
  ✓ human-room
  ✓ is-bot
  ✓ leak
  ✓ quiet-hours
  ✓ restart-mid-job
  ✓ retry-webhook
  ✓ silent-customer
  ✓ chung/01-cong-loi-khong-bia-hs
  ✓ chung/02-phan-biet-gia-tri-so
  ✓ chung/03-chan-sdt-va-so-tai-khoan
  ✓ chung/04-hoi-nguoi-hay-may
  ✓ chung/05-khach-xin-sdt
  eval: 17/17 kịch bản đạt

node scripts/kiem-wiki.mjs --nghiem
  wiki: ĐẠT (16 trang).
```

---

## Giới hạn và các điểm cần lưu ý

- **Test sử dụng đồ giả offline**: Các bài test gọi mô hình AI (não định tuyến, não biên tập, vision) và Cổng OZ đều truyền `fakeMcp` và `fetch` giả lập để bảo đảm tính tất định và không phụ thuộc mạng, tuân thủ nguyên tắc không mạng của Hiến pháp (`.specify/memory/constitution.md:28`).
- **Nghiệm thu thực địa 3 chỉ số**: Ba chỉ số SC-002, SC-007, SC-009 đã hoàn tất 100% về mặt mã nguồn và test kiểm chứng trong lab; việc nghiệm thu trên dữ liệu thực tế 7 ngày sẽ được đo bằng công cụ `scripts/do-sc-thuc.mjs:1` (`npm run do-sc`) ngay khi mở lại bot cho khách hàng.

---

## Trang liên quan

- [Tiến độ](tien-do.md) — trạng thái chi tiết từng đầu việc T0xx và đo lường SC.
- [An toàn](an-toan.md) — đối chiếu 9 nguyên tắc Hiến pháp và các lớp bảo vệ.
- [Kiến trúc](kien-truc.md) — thiết kế một đường xử lý duy nhất trong repo.
- [Sự cố và bài học](su-co-bai-hoc.md) — các sự cố thực tế làm cơ sở cho bộ eval.
