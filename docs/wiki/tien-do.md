# Tiến độ

> Cập nhật: 2026-11-07 · commit: 0842386

Trang này ghi **trạng thái thật**, đối chiếu với **code** ở commit `0842386`, không tin tài liệu.
Nguyên tắc: mỗi việc T0xx ghi rõ **xong / dở / chưa làm**, kèm bằng chứng `tệp:dòng`.
Chỗ nào chưa kiểm được thì ghi "chưa xác minh".
T016 (nối `server.js` vào lõi, xoá `lib/`) **đã xong** ở commit `0842386` (bản nối xong ở `6a9cf5e`) — xem [Nhật ký](log.md).

Nguồn đối chiếu: mã nguồn ở nhánh `main`, sổ làm việc `docs/sdd/001-ledger.md:10-37`,
danh sách việc `specs/001-nen-tang-chung/tasks.md:563`.

## 1. Bảng trạng thái spec 001 (T001–T038)

| Mã | Việc | Trạng thái | Bằng chứng |
|---|---|---|---|
| T001 | Bộ chạy test, scripts, Docker | Xong | `package.json:8` (Node ≥ 22.13), `package.json:13` (lệnh test), `Dockerfile:6-8` (DATA_DIR + volume) |
| T002 | Đồ giả test dùng chung | Xong | `test/helpers/fakes.mjs`, `test/core/fakes.test.mjs` |
| T003 | `core/time.js` (giờ VN) | Xong | `core/time.js`, `test/core/time.test.mjs` |
| T004 | `core/redact.js` (che bí mật) | Xong | `core/redact.js`, `test/core/redact.test.mjs` |
| T005 | `core/config.js` (cấu hình) | Xong | `core/config.js:34`, `test/core/config.test.mjs` |
| T006 | `core/store.js` (SQLite) | Xong | `core/store.js:9`, `core/store/schema.js:10-44` (11 bảng) |
| T007 | `core/text.js` (chuẩn hoá tiếng Việt) | Xong | `core/text.js`, `test/core/text.test.mjs` |
| T008 | `gate.decide()` (hàm thuần) | Xong | `core/gate-decide.js:6`, `test/core/gate-decide.test.mjs` |
| T009 | `gate.send()` (chia phần, idempotent) | Xong | `core/gate.js:106`, `core/gate.js:74`, `test/core/gate-send.test.mjs` |
| T010 | `gate.sweep()` (tin hoãn, thử lại) | Xong | `core/gate.js:180`, `core/gate.js:160` |
| T011 | `core/types.js` (kiểu dùng chung) | Xong | `core/types.js` |
| T012 | `channels/zalo-bot.js` (adapter kênh) | Xong | `channels/zalo-bot.js:13`, `test/core/channel.test.mjs` |
| T013 | `core/registry.js` (chọn gói) | Xong | `core/registry.js:9`, `core/registry.js:34`, `test/core/registry.test.mjs` |
| T014 | Chuyển 7 gói hải quan sang `packs/hs/` | Xong | `packs/hs/packages.js:142`, `packs/hs/index.js:96`, `docs/sdd/001-ledger.md:30` (36 lượt đối chiếu khớp) |
| T015 | `core/engine.js` (một lượt) | Xong | `core/engine.js:27`, `core/engine.js:60`, `docs/sdd/001-ledger.md:37` |
| T016 | Nối `server.js`, xoá `lib/`, khoá một cửa gửi | **Xong** | `server.js:1-2` (tệp chỉ nối dây), `server.js:77` (dựng engine), `server.js:78` (gọi `gate.recover()`); gói nạp theo đường dẫn tương đối tới **tệp mã nguồn** nên không phụ thuộc thư mục làm việc (`server.js:73`), và có cảnh báo to khi không nạp được gói nào (`server.js:75`); thư mục `lib/` đã bị xoá hẳn; `core/gate.js:79` là nơi duy nhất gọi `channel.sendText`, bị khoá bởi `test/core/one-gate.test.mjs:167`; câu báo lỗi chung của lõi giữ nguyên thẻ màu `{orange}` (`core/engine.js:13`); `npm test` (274 test) và `npm run eval` (7/7) xanh tại commit `0842386` |
| T017 | Gói mẫu `packs/echo/` | **Xong** | `packs/echo/index.js:10` (gói export mặc định), `packs/echo/index.js:14` (`audience:'staff'`), `packs/echo/index.js:17` (`priority: 100`); `packs/echo/test/echo.test.mjs:53` (nhân viên gõ `/echo xin chào` → reply `xin chào`), `packs/echo/test/echo.test.mjs:74` (khách gõ `/echo xin chào` → gói `echo` không được chọn); lõi lọc gói `audience:'staff'` trước khi gọi `match` ở `core/registry.js:40`, lấy danh sách `STAFF_USERS` ở `core/config.js:53` và gắn cờ `isStaff` ở `core/engine.js:113`; `git diff --stat main -- core/` rỗng |
| T018 | Webhook ghi `inbox` trước khi trả 200 | **Xong** | Handler HTTP tách sang tệp mới `core/webhook.js` (90 dòng): sai method/đường dẫn → 404 (`core/webhook.js:34`), sai secret → 403 (`core/webhook.js:35`), gom body theo Buffer để không cắt ký tự nhiều byte (`core/webhook.js:39-41`), JSON hỏng → 400 (`core/webhook.js:46`); update không parse được/thiếu `chatId` → ack 200 và bỏ qua, chỉ log khoá cấp cao (`core/webhook.js:54-58`); ghi `inbox` pending bằng `store.inbox.insertIgnore` (`core/webhook.js:62-65`), lỗi db → 503 để Zalo gửi lại (`core/webhook.js:66-68`), **chỉ sau khi bền hoá mới trả 200** (`core/webhook.js:70`); trùng khoá thì bỏ qua (`core/webhook.js:71`), khoá hàng đợi là `convId` theo người (`core/webhook.js:72`), xử lý chạy nền qua `runTask` (`core/webhook.js:83-85`), lỗi không lường được → 500 (`core/webhook.js:23-27`). `server.js` chỉ nối dây, gọi `createWebhookHandler` (`server.js:16`, `server.js:87-92`); test HTTP thật cổng 0 trong `test/core/webhook.test.mjs` (33 test, tệp 612 dòng) |
| T019 | *core/queue.js* (hàng đợi theo người (`conv_id`)) | **Xong** | Tệp mới `core/queue.js` (35 dòng) — `createQueue()` trả `{ run, size }` (`core/queue.js:10`, `core/queue.js:34`); `run(key, fn)` nối chuỗi theo khoá trong `Map` (`core/queue.js:19-32`): chuỗi công khai trả về cho người gọi và reject khi `fn` lỗi (`core/queue.js:22`), chuỗi nội bộ **nuốt lỗi** để lượt sau cùng khoá vẫn chạy (`core/queue.js:24`), dọn khoá **có điều kiện** `chuoi.get(key) === duoi` nên không xoá nhầm chuỗi mới (`core/queue.js:29-31`); cùng khoá thì một lượt tại một thời điểm, khác khoá thì chạy song song; tệp thuần túy — không gửi tin, không log (Điều I và IX). Nối vào handler ở `server.js:89` (dựng queue) và `server.js:90` (`runTask: (key, fn) => queue.run(key, fn)`); khoá là **`convId` theo người** (`core/webhook.js:73`), không phải `chatId` theo phòng. Test: `test/core/queue.test.mjs:20-109` (7 test). Cùng PR còn sửa lời bình cơ chế lỗi ở `core/webhook.js:74-90` và viết lại 2 test L2 ở `test/core/webhook.test.mjs:399-470` (đếm số lần `res.end` thay vì bắt `uncaughtException`) |
| T020 | Khôi phục khi khởi động | **Xong** | Hai tầng, gọi đúng thứ tự lúc khởi động (`specs/001-nen-tang-chung/contracts/send-gate.md:52`): `gate.recover()` ở `server.js:84` (outbox `queued` → `failed`, bộ quét gửi tiếp **các phần còn thiếu** theo `parts_sent`), rồi `engine.recover()` ở `server.js:85`. Hàm mới `core/engine.js:187` trả `Promise<number>`: đưa dòng `inbox` `processing` về `pending` (`core/store/queue.js:35`) rồi chạy lại mọi dòng `pending` theo `received_at`, qua hàng đợi theo **người** (`convId`) như đường webhook (`core/engine.js:207`). Webhook đã ack 200 nên Zalo không gửi lại — không chạy lại là mất tin. Dòng `raw` không dựng lại được Update → `markFailed` (`core/engine.js:196`), nếu không sẽ bị nhặt lại mãi. `engine.recover()` **không chặn** `server.listen` (`server.js:86`) để `/health` và webhook không chết đói. **Mốc giờ:** lượt phát lại mang mốc khách nhắn THẬT (`inbox.received_at`) qua `process(u, { replayedAt })` (`core/engine.js:71`), không đóng dấu `now()` — nếu đóng dấu `now()` thì cửa coi tin cũ là "trả lời trực tiếp" (`core/gate-decide.js:36-40`) và nhắn khách lúc 1 giờ sáng, vi phạm giờ yên. Tin khách chưa ai trả lời là **món nợ với khách** nên `reply()` khai `debt: true` (`core/engine.js:60`) và cửa nhận vào `hasOpenJob` (`core/gate.js:124`): ban ngày trả lời ngay, trong giờ yên **hoãn tới 07:00** rồi giao — không nhắn đêm, cũng không mất tin. Lịch sử ghi mốc thật (`core/engine.js:129`), audit giữ `at` = lúc ghi sổ kèm `receivedAt` (`core/engine.js:123`, Điều IV). Lệch có chủ ý so với tài liệu: **không** chờ 5 phút như `specs/001-nen-tang-chung/data-model.md:18` ghi, vì chờ sẽ mất tin khi container khởi động lại trong vòng 5 phút; lý do đầy đủ ghi ở `specs/001-nen-tang-chung/tasks.md:391`, phần mốc giờ ở `specs/001-nen-tang-chung/tasks.md:368`. Test: `test/core/recover.test.mjs` (17 test, có ca dựng lại từ payload **gốc** của Zalo cả khi không có `message_id`, và ca khách nhắn 22:50 VN / bot lên lại 01:00 VN → hoãn tới sáng) và `test/core/stress.test.mjs` (SC-001: 1.000 update, 100 phòng, 10 % gửi lại, 3 lần khởi động lại trong đó **một lần lên lại giữa giờ yên** → 0 tin trùng, 0 tin mất, 0 tin cũ gửi ban đêm). **Bộ chặn tốc độ không áp cho lượt phát lại** (`core/engine.js:108`): `limited()` là cửa sổ 60 giây theo `now()`, còn `recover()` chạy cả tồn đọng ở cùng một mốc `now()`, nên nếu đo thì từ tin thứ 11 của cùng một người trở đi khách nhận câu "gửi hơi nhanh" thay cho câu trả lời mà dòng `inbox` vẫn `markDone` — mất tin thật; bộ chặn giữ nguyên tác dụng trên đường thường. Khẳng định "0 tin mất" của SC-001 nay phủ cả đường phát lại chạm ngưỡng đó: `test/core/stress.test.mjs` nhồi 14 tin tồn đọng của **một** người vào một lần `recover()` (`test/core/stress.test.mjs:24`). `npm test` 350/350 và `npm run eval` 7/7 xanh |
| T021 | `core/jobs.js` (việc nền bền) | **Xong** | `core/jobs.js:31` (`createJobs` → `{ add, tick, recover }`, 128 dòng), tách khỏi *core/engine-jobs.js* (tệp cũ đã xoá); nhận việc gói trả trong lượt ở `core/jobs.js:39`, hỏi Cổng ở `core/jobs.js:74` theo nhịp 6→12→24→48→60 s (`core/jobs.js:22`), hết hạn sau 30 phút (`core/jobs.js:19`), kết quả qua đúng một cửa `gate.send` ở `core/jobs.js:89` với khoá idem `j:<conv_id>:<maLuot>` (`core/jobs.js:88`); việc hứa mà không giao được thì **báo người** qua `onAlert` (`core/jobs.js:105`, nối ở `server.js:81`) — trước đây chỉ ghi log; thêm `recover()` đưa dòng kẹt `polling` về `waiting` khi tiến trình chết lúc đang hỏi Cổng (`core/jobs.js:117`, gọi lúc khởi động ở `server.js:84`, tầng lưu `core/store/queue.js:101`); lõi nối ở `core/engine.js:39`, `core/engine.js:150`, `core/engine.js:229`; test riêng `test/core/jobs.test.mjs` (10 test, 233 dòng) đủ 5 ca của `specs/001-nen-tang-chung/tasks.md:370`; `npm test` (335 + 34) và `npm run eval` (7/7) xanh |
| T022 | *core/handoff.js* (trạng thái phòng) | Chưa | không có tệp *core/handoff.js* |
| T023 | `core/intents.js` (gặp người / người hay máy) | **Xong** | Tệp mới `core/intents.js` (204 dòng), thuần văn bản — không I/O, không gửi tin: `wantsHuman` ở `core/intents.js:120` (xin gặp người, FR-014), `asksIfBot` ở `core/intents.js:185` (hỏi người hay máy, Điều VIII), hằng `REPLY_HANDOFF` ở `core/intents.js:197` và `REPLY_IS_BOT` ở `core/intents.js:202` (nói thật là trợ lý tự động của OZ rồi chỉ câu "gặp nhân viên" mà `wantsHuman` nhận ra). Khớp trên `normVi` (`core/text.js:3`) nên phải né từ nghiệp vụ trùng nhau sau khi bỏ dấu, bằng **ba lớp** (`core/intents.js:6-19`): hệ từ "là/phải"; chủ ngữ — gọi thẳng bot ("bạn/mày là bot") thì đủ, còn chủ ngữ chỉ định ("cái này/đây") **và ngôi thứ nhất** ("em/anh/chị/mình", khách dùng để tả hàng của chính mình) buộc thêm tiểu từ hỏi **cuối câu** (`core/intents.js:148`, `core/intents.js:149`); và kiểm dấu thanh trên bản gốc cho cặp "ạ"/"à" (`core/intents.js:30`) cùng "gói"/"gọi" (`core/intents.js:113`) — hai cặp này `normVi` làm trùng hoàn toàn. Các ca đã có test khoá: `asksIfBot` trả `false` cho "dạ cái này là máy ạ", "hàng của anh là máy ạ", "lô của anh là máy", "hàng này chỉ là máy", "cái này là máy đó ạ" (`test/core/intents.test.mjs:104`, `test/core/intents.test.mjs:121`, `test/core/intents.test.mjs:133`, `test/core/intents.test.mjs:140`) — khách tả hàng; chưa phủ hết lớp câu này, chỉ phủ các dạng đã lường. Tiểu từ hỏi phải ở cuối câu nên "là máy không chịu thuế" không khớp (`core/intents.js:39`); "có phải X không" chỉ tính khi X là **vị ngữ** của "phải" và sau X chỉ còn tiểu từ hỏi tới hết mệnh đề, nên "có phải máy này chịu thuế không" và "có phải máy không chịu thuế" ("không" phủ định) đều không khớp (`core/intents.js:166`); "đó" không tính là tiểu từ hỏi ở nhánh này vì thường là chỉ định/nhấn mạnh (`core/intents.js:154`); mệnh đề "người hay máy" được loại **riêng khỏi mệnh đề đó**, không chặn cả câu, nên "máy hay bị lỗi, cho em gặp nhân viên" vẫn là lời xin gặp người (`core/intents.js:47`, `core/intents.js:120`); "ai ở đây cũng…" (= mọi người) không phải hỏi có ai trực (`core/intents.js:96`); "gặp người nhận/bán" là vai nghiệp vụ nên không tính (`core/intents.js:56`); "vận chuyển" không phải xin chuyển người (`core/intents.js:66`). Lời xin gián tiếp cũng nhận ("cho em số điện thoại nhân viên", "có ai hỗ trợ không" — `core/intents.js:78`, `core/intents.js:83`), nhưng "nối/số" trần thì không, vì trùng "nội/nơi/nói" và "số nhân viên" (đếm người) / "số máy" (số khung của hàng). Test `test/core/intents.test.mjs` (27 test, 270 dòng) đủ 4 nhóm khẳng định của `specs/001-nen-tang-chung/tasks.md:408-415`, và có ca cho **dạng trần** của từ mơ hồ ("là máy ạ", "là bột ạ" — không có danh từ đi sau đỡ). **Chưa cắm vào engine** nên chưa đổi hành vi với khách: việc cắm là T026 (`specs/001-nen-tang-chung/tasks.md:440`); kịch bản eval `is-bot` thuộc T030. `npm test` (390 + 34) và `npm run eval` (9/9) xanh |
| T024 | Phiếu vào nhóm nhân viên + gộp tin | Chưa | bảng `tickets` đã có sẵn ở `core/store/schema.js:32`, nhưng phần phiếu chưa làm |
| T025 | Lệnh nhân viên | Chưa | không có tệp *core/handoff.js* |
| T026 | Cắm handoff vào engine | Chưa | `core/engine.js` không có nhánh handoff (luồng ở `core/engine.js:133-144` chỉ có chọn gói rồi trả lời) |
| T027 | `/health` và `/metrics` | **Xong** | tệp mới `core/ops.js`: `createOps` trả `{health, metrics}` (`core/ops.js:37`); `health()` (`core/ops.js:53`) đo db bằng `store.ping()` (`core/store.js:51`) và hỏi Cổng OZ/Zalo song song với mốc chặn 2,5 s (`core/ops.js:8`) để `/health` luôn trong 5 s của `HEALTHCHECK`; `metrics()` (`core/ops.js:77`): `turns` đếm từ `inbox` (`core/store/queue.js:30`), quyết định cửa đếm từ `outbox` (`core/store/queue.js:81`) cộng bù `empty`/`duplicate-idem` từ `audit` (`core/store/records.js:23`), `tickets.open` (`core/store/state.js:80`), `jobs.waiting` (`core/store/queue.js:119`); dòng audit JSON hỏng bị bỏ qua kèm cảnh báo (`core/ops.js:103`). Đường HTTP: `GET /health` trả 503 khi `ok=false` (`core/webhook.js:38`), `GET /metrics` kèm `?since=` (chuỗi ISO; sai định dạng → 400) (`core/webhook.js:46`); nối vào server ở `server.js:93` và `server.js:94`; index `received_at` cho `inbox` (`core/store/schema.js:46`). Test: `test/core/ops.test.mjs` (tệp mới) và `test/core/webhook.test.mjs`. Cổng máy: `npm test` 448/448, `npm run eval` 9/9, `node scripts/kiem-wiki.mjs --nghiem` → "wiki: ĐẠT (16 trang)". Vận hành: mặc định `GET /metrics` tính từ **lúc tiến trình khởi động**; muốn số liệu từ mốc khác thì truyền `?since=` với chuỗi ISO. `store.ping()` chỉ kiểm kết nối **đọc** được, **không** phát hiện db bị khoá ghi bởi tiến trình khác (chưa làm; cần task riêng). |
| T028 | Bản tin gộp 08:00 và 17:00 | Chưa | không có tệp *core/ops.js* |
| T029 | Lệnh npm run audit | Chưa | `package.json:15` khai lệnh trỏ tới tệp *scripts/audit.mjs* **không tồn tại** |
| T030 | `eval/run.mjs` + 9 kịch bản | Dở | `eval/run.mjs:1` đã có; thư mục `eval/fixtures/` mới có 7 kịch bản, thiếu `human-room`, `is-bot`, `ho-so-khach` |
| T031 | CI | Xong | `.github/workflows/ci.yml:17` chạy `npm test`, `.github/workflows/ci.yml:18` chạy `npm run eval`, `.github/workflows/ci.yml:27` chạy cổng kiểm wiki |
| T032 | README + kiểm tay quickstart | Dở | phần "thêm gói mới" đã trỏ sang `packs/hs/packages.js` (`README.md:33`); phần quickstart và mô hình lõi/gói/kênh chưa viết lại đầy đủ |
| T033 | Ghi mọi tin vào `messages` | Xong (lõi) | `core/engine.js:126` ghi tin khách, `core/gate.js:98` ghi tin bot khi đã gửi |
| T034 | *core/customers.js* (hồ sơ + nhãn) | **Xong** | tệp mới `core/customers.js`: `createCustomers` ở `core/customers.js:102`, `extractPhone` ở `core/customers.js:63`, `looksLikeHsCode` ở `core/customers.js:31`; hồ sơ khóa theo **người** (`conv_id`, FR-030) ở `core/store/records.js:34`; nhãn tự động + bảo vệ nhãn của nhân viên ở `core/customers.js:122` (gắn) và `core/customers.js:148` (gỡ); test `test/core/customers.test.mjs` (32 test, ví dụ `test/core/customers.test.mjs:23` cho `extractPhone`, `test/core/customers.test.mjs:136` cho `touch`); `npm test` 395/395, `npm run eval` 9/9, `node scripts/kiem-wiki.mjs` → "wiki: ĐẠT (16 trang)" |
| T035 | Cắm hồ sơ khách vào engine | Chưa | `core/engine.js` không gọi hồ sơ khách |
| T036 | Lệnh hồ sơ + *core/backup.js* (sao lưu) | Chưa | không có tệp *core/backup.js* |
| T037 | Khoá theo `conv_id` trong nhóm | Xong | `core/conv.js:1` (convIdOf), `core/gate.js:22` (effectiveState), `test/core/conv.test.mjs:1` (test conv đủ trường hợp) |
| T038 | Gắn tên trong nhóm, hàng đợi theo người | Xong | `core/mention.js:15` (groupNameTag), `core/engine.js:94` (namePrefix), `core/jobs.js:84` (gắn lại tên khi job xong; tệp đổi tên từ *core/engine-jobs.js* ở T021), `test/core/group-tag.test.mjs:51` |
| T039 | Cửa sổ chống trùng tách theo loại tin (issue #55) | **Xong** | cửa sổ chọn theo `isDirectReply` (`core/gate-decide.js:119`): `dupDirectMs` 60 giây cho câu trả lời trực tiếp (`core/gate-decide.js:12`), `dupWindowMs` 15 phút cho tin chủ động (`core/gate-decide.js:13`); `job_result` mang mốc tin khách (`core/jobs.js:45`, `core/jobs.js:93`) nên khách hỏi lại qua việc nền cũng được trả lời, nhưng vẫn luôn chịu luật nợ việc nền và giờ yên (`core/gate-decide.js:36`); store trả kèm mốc gửi (`core/store/queue.js:67`); `npm test` (313 test) và `npm run eval` (9/9, thêm `eval/fixtures/hoi-lai.jsonl` và `eval/fixtures/ba-ma-khac-nhau.jsonl`) xanh |

## 2. Kết luận trạng thái spec 001

Lõi `core/` đã xong phần nền: T001–T015, tức là có engine một lượt, cửa gửi, lưu bền SQLite,
chọn gói, adapter kênh và 7 gói hải quan. Có bằng chứng ghi trong sổ làm việc `docs/sdd/001-ledger.md:10-37`.
Ngoài ra T037 đã xong: khoá chuyển sang `conv_id` (mỗi người một cuộc trò chuyện trong nhóm), xem `core/conv.js:10`.
T038 đã xong: tin ra trong nhóm gắn tên người nhận, tên trùng phân biệt bằng hậu tố 2 ký tự cuối `userId`, xem `core/mention.js:15`.

**T016 đã làm.** `server.js` nay chỉ nối dây (`server.js:1-2`) và dựng engine ở `server.js:77`;
thư mục `lib/` đã bị xoá hẳn. Trong toàn bộ tệp sản xuất chỉ một chỗ gọi kênh: `core/gate.js:79`,
và điều này bị khoá bằng `test/core/one-gate.test.mjs:167`.

Hệ quả thực tế: các luật của lõi **bắt đầu có tác dụng với khách thật** — giờ yên
(`core/gate-decide.js:103`), trần tin theo ngày (`core/gate-decide.js:7-9`), chống trùng nội dung
(`core/gate-decide.js:126`), audit từng lượt (`core/engine.js:118`, `core/engine.js:135`, `core/engine.js:150`)
và lịch sử hội thoại bền (`core/store/schema.js:38`).
Phần còn thiếu của hiến pháp (nhường phòng cho người, phiếu/cảnh báo tới nhóm nhân viên) xem [An toàn](an-toan.md).

## 3. Spec 007, 008, 009, 010

| Spec | Trạng thái | Bằng chứng |
|---|---|---|
| 007 — Agent giám sát | Spec còn Draft nhưng **code đã có gần xong** | `specs/007-giam-sat-nang-cap/spec.md:7`; đo 9 tín hiệu ở `scripts/giam-sat/tinh-hieu.js:37`, mở issue đúng repo ở `scripts/giam-sat/issue.js:51`, báo Telegram ở `scripts/giam-sat/telegram.js:10`, chạy lệnh ở `scripts/giam-sat.mjs:2` |
| 008 — Cổng AI Studio | **Chỉ có spec** | `specs/008-cong-ai-studio/spec.md:7` (Draft); chưa có mã nguồn trong repo này, dự kiến tách repo riêng |
| 009 — Agent tra cứu hải quan | **Chỉ có spec** | `specs/009-agent-tra-cuu/spec.md:7` (Draft); não hiện tại ở `packs/hs/brain.js` chỉ chọn một gói, chưa phải vòng lặp gọi nhiều công cụ |
| 010 — Giao việc cho thợ ngoài (Antigravity, Muse Code) | **Chỉ có spec, ghi là nghiên cứu** | `specs/010-giao-viec-antigravity/spec.md:7` (Nghiên cứu — chưa code); chưa có mã nguồn: không có tệp *scripts/mcp-tho.mjs*, không có *.agents/hooks.json*, `.gitignore` chưa có `.agy-logs/` và `.worktrees/`; thẻ còn 5 câu NEEDS CLARIFICATION chờ chủ repo chốt |

## 4. Việc nên làm tiếp theo

Thứ tự chạy thật của spec 001 ghi ở `specs/001-nen-tang-chung/tasks.md:563`:
T001–T015 → **T037–T038** → T016–T026 → T033–T036 → T027–T032.

Bám theo trạng thái code hiện tại:

1. **T018–T021** — webhook ghi `inbox` trước khi trả 200, hàng đợi theo người (`conv_id`), khôi phục khi khởi động, việc nền bền. T016 đã xong nên đây là nhóm kế tiếp.
2. **T022–T026** — người cầm phòng (handoff) và lệnh nhân viên.
3. **T033–T036** — lịch sử (đã có phần lõi), hồ sơ khách, sao lưu.
4. **T027–T032** — health/metrics, bản tin, `npm run audit`, đủ 9 kịch bản eval, viết lại README.

Sau khi 001 đạt Success Criteria, thứ tự giữa các spec khác là `docs/ROADMAP.md:20`:
**001 → 007 → 005**, **008 trước 003**, và **003 trước 002**.

## 5. Mâu thuẫn giữa tài liệu và code

Ghi cả hai phía. Không tự chọn bên nào đúng.

1. **Danh sách việc gần như chưa tick ô nào, dù code đã xong T001–T015, T037 và T038.**
   - Tài liệu nói: gần như mọi bước trong `specs/001-nen-tang-chung/tasks.md` vẫn là `- [ ]` (chưa đánh dấu).
   - Code thật nói: `docs/sdd/001-ledger.md:10-37` ghi T001–T015 hoàn tất, và `core/` có đủ các tệp tương ứng. Đã tick ô Step 1 cho T037 (`specs/001-nen-tang-chung/tasks.md:293`) sau khi khoá `conv_id` xong, và cho T038 (`specs/001-nen-tang-chung/tasks.md:300`).
2. **`npm run audit` trỏ tới tệp không tồn tại.**
   - Tài liệu/lệnh nói: `package.json:15` khai `"audit": "node scripts/audit.mjs"`.
   - Code thật nói: không có tệp *scripts/audit.mjs* trong repo → chạy lệnh sẽ lỗi.
3. **README chưa mô tả đủ mô hình lõi/gói/kênh.**
   - Tài liệu nói: `README.md:33` trỏ sang `packs/hs/packages.js` (đã sửa ở phiên cập nhật wiki này; trước đó là lib/packages.js).
   - Code thật nói: lõi nạp gói theo mẫu thư mục, ví dụ `packs/hs/index.js` (`core/registry.js:9`), và mọi tin ra đều qua `core/gate.js:79` — README chưa nói rõ điều này (việc của T032).
4. **`docs/TIEP-TUC.md` đã cũ ở một chỗ.**
   - Tài liệu nói: `docs/TIEP-TUC.md:13` — "`npm run eval` vẫn đỏ được chấp nhận tới T030" (hàm ý bộ chạy eval chưa có).
   - Code thật nói: `eval/run.mjs:1` đã có và đã có 7 kịch bản.
5. **"Đã ship lên production" trong nhật ký cũ không đồng nghĩa với lõi `core/`.**
   - Tài liệu nói: `docs/TIEP-TUC.md:5` ghi các PR não AI và biên tập "đã ship lên production".
   - Code thật nói: khi đó production còn nối lib/bot.js; nay T016 đã xong, production nối lõi `core/` (`server.js:77`) và `lib/` đã bị xoá. Những gì "ship" trong nhật ký cũ là đường cũ.
6. **README và `package.json` lệch về phiên bản Node.**
   - Tài liệu nói: `README.md:5` — "Node 20+".
   - Code thật nói: `package.json:8` yêu cầu Node từ 22.13.

## 6. Hai quyết định của chủ repo ngày 06/11 (đã phản ánh) và việc còn chờ

Hai quyết định dưới đây đã được sửa theo `Quản trị` (`.specify/memory/constitution.md:73`):
hiến pháp lên **2.0.0** (`.specify/memory/constitution.md:77`), có mục lịch sử sửa đổi ở
`.specify/memory/constitution.md:79`. Chủ repo đã duyệt và gộp ngày 07/11/2026.

1. **Hiến pháp Điều II** đổi thành: "nhân viên ra lệnh trả về bot, hoặc tự trả về sau khoảng lặng lâu
   (đề xuất khoảng 2 giờ)".
   - Đã phản ánh: `.specify/memory/constitution.md:17` (Điều II mới), `.specify/memory/constitution.md:77`
     (phiên bản 2.0.0), `.specify/memory/constitution.md:79` (mục lịch sử sửa đổi); tài liệu spec khớp theo ở
     `specs/001-nen-tang-chung/spec.md:26`, `specs/001-nen-tang-chung/spec.md:72`,
     `specs/001-nen-tang-chung/spec.md:212`, `specs/001-nen-tang-chung/tasks.md:380`,
     `specs/001-nen-tang-chung/data-model.md:39`, `specs/001-nen-tang-chung/research.md:71`.
   - Còn chờ: **code tự trở về chưa có** — T022 (`specs/001-nen-tang-chung/tasks.md:380`) chưa làm,
     và PR sửa hiến pháp còn chờ chủ repo duyệt.
2. **Spec 003 làm trước 002.**
   - Đã phản ánh: `docs/ROADMAP.md:20` ghi "**003 trước 002** (cập nhật 06/11)"; `docs/ROADMAP.md:9`
     ghi 002 "làm **sau 003**".
   - Còn chờ: không có gì về code — đây chỉ là thứ tự spec, không đổi đường đang chạy.

## 7. Câu hỏi cần người quyết

- Không có vướng về tiền hay pháp lý trong việc ghi wiki này.
- PR sửa hiến pháp Điều II và đổi thứ tự 003/002 đã soạn xong, chờ chủ repo duyệt.
- Thẻ 010 (giao việc cho thợ ngoài) có **5 câu chờ chủ repo chốt**, trong đó 3 câu về tiền và dữ liệu:
  chọn nhà cung cấp và mức gói nào trước; xác thực bằng gói thuê bao đã mua hay bằng API key trả theo token;
  và có bật `useG1Credits` khi hết hạn mức hay dừng. Riêng Muse Code có hai cờ **bắt buộc phải tắt tường minh**
  (chế độ góp dữ liệu huấn luyện, và biến API key ghi đè đăng nhập gói thuê bao).
  Xem `specs/010-giao-viec-antigravity/spec.md` mục Assumptions.
- Ngoài hai quyết định trên, `docs/TIEP-TUC.md:59-64` còn liệt kê các việc đang chờ chủ repo chốt:
  số profile Chrome cho spec 008, cách vào máy văn phòng và VPS, danh sách nhóm Zalo nhân viên
  cùng `STAFF_CHAT_ID`/`STAFF_USERS` (cần trước T024), và cách đọc log Cổng OZ cho spec 007.
  Mục đích của T024 là gửi phiếu vào nhóm nhân viên, nên hai biến này chặn việc đó.

## Cách đọc trang này

Cột "Trạng thái" là kết luận của người đọc khi đối chiếu code, không phải lời của tác giả tài liệu.
Khi code đổi, đối chiếu lại và cập nhật trang này, rồi ghi vào [Nhật ký](log.md).
