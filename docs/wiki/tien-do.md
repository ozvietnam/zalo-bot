# Tiến độ

> Cập nhật: 2026-11-07 · commit: 1316cfe

Trang này ghi **trạng thái thật**, đối chiếu với **code** ở commit `1316cfe`, không tin tài liệu.
Nguyên tắc: mỗi việc T0xx ghi rõ **xong / dở / chưa làm**, kèm bằng chứng `tệp:dòng`.
Chỗ nào chưa kiểm được thì ghi "chưa xác minh".

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
| T010 | `gate.sweep()` (tin hoãn, thử lại) | Xong | `core/gate.js:169`, `core/gate.js:149` |
| T011 | `core/types.js` (kiểu dùng chung) | Xong | `core/types.js` |
| T012 | `channels/zalo-bot.js` (adapter kênh) | Xong | `channels/zalo-bot.js:13`, `test/core/channel.test.mjs` |
| T013 | `core/registry.js` (chọn gói) | Xong | `core/registry.js:9`, `core/registry.js:34`, `test/core/registry.test.mjs` |
| T014 | Chuyển 7 gói hải quan sang `packs/hs/` | Xong | `packs/hs/packages.js:142`, `packs/hs/index.js:96`, `docs/sdd/001-ledger.md:30` (36 lượt đối chiếu khớp) |
| T015 | `core/engine.js` (một lượt) | Xong | `core/engine.js:25`, `core/engine.js:58`, `docs/sdd/001-ledger.md:37` |
| T016 | Nối `server.js`, xoá `lib/`, khoá một cửa gửi | **Chưa** | `server.js:7` vẫn nối `lib/bot.js`; `lib/bot.js:112` tự gọi `zalo.sendText` |
| T017 | Gói mẫu `packs/echo/` | Chưa | thư mục `packs/` chỉ có `hs/` |
| T018 | Webhook ghi `inbox` trước khi trả 200 | Chưa | `server.js:71` trả 200 rồi xử lý tại chỗ, không ghi bảng `inbox` |
| T019 | *core/queue.js* (hàng đợi theo phòng) | Chưa | không có tệp *core/queue.js*; `core/store/queue.js` là tầng lưu trữ, không phải hàng đợi |
| T020 | Khôi phục khi khởi động | Dở | có `core/gate.js:191` (`recover`) nhưng `core/engine.js` không có `recover`; thiếu tệp *test/core/recover.test.mjs* |
| T021 | *core/jobs.js* (việc nền bền) | Chưa | không có tệp *core/jobs.js*; bộ hỏi việc nền nằm trong `core/engine-jobs.js` |
| T022 | *core/handoff.js* (trạng thái phòng) | Chưa | không có tệp *core/handoff.js* |
| T023 | *core/intents.js* (gặp người / người hay máy) | Chưa | không có tệp *core/intents.js* |
| T024 | Phiếu vào nhóm nhân viên + gộp tin | Chưa | bảng `tickets` đã có sẵn ở `core/store/schema.js:32`, nhưng phần phiếu chưa làm |
| T025 | Lệnh nhân viên | Chưa | không có tệp *core/handoff.js* |
| T026 | Cắm handoff vào engine | Chưa | `core/engine.js` không có nhánh handoff (luồng ở `core/engine.js:111-128` chỉ có chọn gói rồi trả lời) |
| T027 | `/health` và `/metrics` | Dở | `core/health.js:3` chỉ trả `{ok, mode, startedAt, version}`; chưa có `/metrics` |
| T028 | Bản tin gộp 08:00 và 17:00 | Chưa | không có tệp *core/ops.js* |
| T029 | Lệnh npm run audit | Chưa | `package.json:15` khai lệnh trỏ tới tệp *scripts/audit.mjs* **không tồn tại** |
| T030 | `eval/run.mjs` + 9 kịch bản | Dở | `eval/run.mjs:1` đã có; thư mục `eval/fixtures/` mới có 7 kịch bản, thiếu `human-room`, `is-bot`, `ho-so-khach` |
| T031 | CI | Xong | `.github/workflows/ci.yml:17` chạy `npm test`, `.github/workflows/ci.yml:18` chạy `npm run eval`, `.github/workflows/ci.yml:27` chạy cổng kiểm wiki |
| T032 | README + kiểm tay quickstart | Dở | `README.md:33` còn dạy "thêm gói mới: thêm một mục vào `PACKAGES` trong `lib/packages.js`" — đường cũ |
| T033 | Ghi mọi tin vào `messages` | Xong (lõi) | `core/engine.js:104` ghi tin khách, `core/gate.js:97` ghi tin bot khi đã gửi |
| T034 | *core/customers.js* (hồ sơ + nhãn) | Chưa | không có tệp *core/customers.js*; bảng `customers` đã có ở `core/store/schema.js:41` |
| T035 | Cắm hồ sơ khách vào engine | Chưa | `core/engine.js` không gọi hồ sơ khách |
| T036 | Lệnh hồ sơ + *core/backup.js* (sao lưu) | Chưa | không có tệp *core/backup.js* |
| T037 | Khoá theo `conv_id` trong nhóm | Xong | `core/conv.js:1` (convIdOf), `core/gate.js:22` (effectiveState), `test/core/conv.test.mjs:1` (test conv đủ trường hợp) |
| T038 | Gắn tên trong nhóm, hàng đợi theo người | Chưa | không có tệp *test/core/group-tag.test.mjs* |

## 2. Kết luận trạng thái spec 001

Lõi `core/` đã xong phần nền: T001–T015, tức là có engine một lượt, cửa gửi, lưu bền SQLite,
chọn gói, adapter kênh và 7 gói hải quan. Có bằng chứng ghi trong sổ làm việc `docs/sdd/001-ledger.md:10-37`.
Ngoài ra T037 đã xong: khoá chuyển sang `conv_id` (mỗi người một cuộc trò chuyện trong nhóm), xem `core/conv.js:10`.

**Việc chuyển giao T016 chưa làm.** `server.js:7` vẫn nối `lib/bot.js`, và `lib/bot.js:112`
gọi thẳng `zalo.sendText` — tức bot đang chạy **không đi qua cửa gửi** của lõi.
Trong lõi mới, chỉ một chỗ gọi kênh: `core/gate.js:79`.

Hệ quả thực tế: nhiều tính năng của lõi (giờ yên, trần tin theo ngày, chống trùng nội dung,
audit, lịch sử hội thoại) hiện **chưa có tác dụng với khách thật**, vì đường đang chạy là đường cũ.
Chi tiết về mức độ thực thi từng nguyên tắc an toàn: xem [An toàn](an-toan.md).

## 3. Spec 007, 008, 009

| Spec | Trạng thái | Bằng chứng |
|---|---|---|
| 007 — Agent giám sát | Spec còn Draft nhưng **code đã có gần xong** | `specs/007-giam-sat-nang-cap/spec.md:7`; đo 9 tín hiệu ở `lib/giam-sat/tinh-hieu.js:37`, mở issue đúng repo ở `lib/giam-sat/issue.js:6`, báo Telegram ở `lib/giam-sat/telegram.js:10`, chạy lệnh ở `scripts/giam-sat.mjs:2` |
| 008 — Cổng AI Studio | **Chỉ có spec** | `specs/008-cong-ai-studio/spec.md:7` (Draft); chưa có mã nguồn trong repo này, dự kiến tách repo riêng |
| 009 — Agent tra cứu hải quan | **Chỉ có spec** | `specs/009-agent-tra-cuu/spec.md:7` (Draft); não hiện tại ở `packs/hs/brain.js` chỉ chọn một gói, chưa phải vòng lặp gọi nhiều công cụ |

## 4. Việc nên làm tiếp theo

Thứ tự chạy thật của spec 001 ghi ở `specs/001-nen-tang-chung/tasks.md:563`:
T001–T015 → **T037–T038** → T016–T026 → T033–T036 → T027–T032.

Bám theo trạng thái code hiện tại:

1. **T038** (chưa làm) — gắn đúng tên trong nhóm, tách người trùng tên, hàng đợi theo người. T037 (khoá theo `conv_id`) đã xong.
2. **T016** — nối `server.js` vào lõi `core/`, xoá `lib/`, khoá "một cửa gửi". Đây là bước bật lại an toàn cho khách.
3. **T018–T021** — webhook ghi `inbox` trước, hàng đợi theo phòng, khôi phục khi khởi động, việc nền bền.
4. **T022–T026** — người cầm phòng (handoff) và lệnh nhân viên.
5. **T033–T036** — lịch sử (đã có phần lõi), hồ sơ khách, sao lưu.
6. **T027–T032** — health/metrics, bản tin, `npm run audit`, đủ 9 kịch bản eval, viết lại README.

Sau khi 001 đạt Success Criteria, thứ tự giữa các spec khác là `docs/ROADMAP.md:20`:
**001 → 007 → 005**, và **008 trước 003**.

## 5. Mâu thuẫn giữa tài liệu và code

Ghi cả hai phía. Không tự chọn bên nào đúng.

1. **Danh sách việc gần như chưa tick ô nào, dù code đã xong T001–T015 và T037.**
   - Tài liệu nói: gần như mọi bước trong `specs/001-nen-tang-chung/tasks.md` vẫn là `- [ ]` (chưa đánh dấu).
   - Code thật nói: `docs/sdd/001-ledger.md:10-37` ghi T001–T015 hoàn tất, và `core/` có đủ các tệp tương ứng. Riêng T037 đã tick ô Step 1 (`specs/001-nen-tang-chung/tasks.md:293`) sau khi khoá `conv_id` xong.
2. **Hiến pháp Điều II chưa phản ánh quyết định ngày 06/11.**
   - Tài liệu nói: `.specify/memory/constitution.md:17` — phòng "chỉ trở về `bot` khi nhân viên ra lệnh rõ ràng"; `.specify/memory/constitution.md:77` ghi "Last Amended: 2026-11-04".
   - Nghịch thêm: `specs/001-nen-tang-chung/tasks.md:380` (T022) yêu cầu "không có hàm nào tự đưa `human → bot` theo thời gian" — trái với quyết định mới.
3. **`docs/ROADMAP.md` chưa phản ánh "spec 003 làm trước 002".**
   - Tài liệu nói: `docs/ROADMAP.md:22` — "Các spec 002, 003, 004, 006 chưa xếp thứ tự".
   - Code/tài liệu khác: không tìm thấy chỗ nào trong repo ghi 003 trước 002.
4. **`npm run audit` trỏ tới tệp không tồn tại.**
   - Tài liệu/lệnh nói: `package.json:15` khai `"audit": "node scripts/audit.mjs"`.
   - Code thật nói: không có tệp *scripts/audit.mjs* trong repo → chạy lệnh sẽ lỗi.
5. **README dạy làm gói theo đường cũ.**
   - Tài liệu nói: `README.md:33` — "thêm một mục vào `PACKAGES` trong `lib/packages.js`".
   - Code thật nói: `lib/packages.js` chỉ là tệp chuyển tiếp sang `packs/hs/packages.js`; lõi nạp gói theo mẫu thư mục gói, ví dụ `packs/hs/index.js` (`core/registry.js:9`). Mô hình lõi/gói/kênh chưa được mô tả trong README (việc của T032).
6. **`docs/TIEP-TUC.md` đã cũ ở một chỗ.**
   - Tài liệu nói: `docs/TIEP-TUC.md:13` — "`npm run eval` vẫn đỏ được chấp nhận tới T030" (hàm ý bộ chạy eval chưa có).
   - Code thật nói: `eval/run.mjs:1` đã có và đã có 7 kịch bản.
7. **"Đã ship lên production" không đồng nghĩa với lõi `core/`.**
   - Tài liệu nói: `docs/TIEP-TUC.md:5` ghi các PR não AI và biên tập "đã ship lên production".
   - Code thật nói: production nối `lib/bot.js` tại `server.js:7`; lõi `core/` chưa được nối (T016 chưa làm). Những gì "ship" là đường cũ.
8. **README và `package.json` lệch về phiên bản Node.**
   - Tài liệu nói: `README.md:5` — "Node 20+".
   - Code thật nói: `package.json:8` yêu cầu Node từ 22.13.

## 6. Hai quyết định của chủ repo ngày 06/11 (chỉ ghi nhận)

Hai quyết định dưới đây được ghi nhận tại đây. Việc này **không** sửa hiến pháp hay lộ trình;
sửa chính thức phải làm theo `Quản trị` trong `.specify/memory/constitution.md:72-75` (PR riêng).

1. **Hiến pháp Điều II** đổi thành: "nhân viên ra lệnh trả về bot, hoặc tự trả về sau khoảng lặng lâu
   (đề xuất khoảng 2 giờ)".
   - Hiện trạng repo: **chưa phản ánh**. `.specify/memory/constitution.md:17` vẫn ghi phòng chỉ trở về `bot`
     khi nhân viên ra lệnh rõ ràng, và `specs/001-nen-tang-chung/tasks.md:380` còn cấm tự hồi theo thời gian.
   - Cần làm sau: mở PR riêng sửa hiến pháp (tăng phiên bản) và sửa lại yêu cầu của T022 cho khớp.
2. **Spec 003 làm trước 002.**
   - Hiện trạng repo: **chưa phản ánh**. `docs/ROADMAP.md:22` vẫn ghi 002, 003, 004, 006 "chưa xếp thứ tự";
     `docs/ROADMAP.md:20` mới chỉ nói "008 trước 003".
   - Cần làm sau: cập nhật lại thứ tự trong `docs/ROADMAP.md`.

## 7. Câu hỏi cần người quyết

- Không có vướng về tiền hay pháp lý trong việc ghi wiki này.
- Việc sửa hiến pháp Điều II và việc đổi thứ tự 003/002 là việc riêng, cần chủ repo duyệt.
- Ngoài hai quyết định trên, `docs/TIEP-TUC.md:59-64` còn liệt kê các việc đang chờ chủ repo chốt:
  số profile Chrome cho spec 008, cách vào máy văn phòng và VPS, danh sách nhóm Zalo nhân viên
  cùng `STAFF_CHAT_ID`/`STAFF_USERS` (cần trước T024), và cách đọc log Cổng OZ cho spec 007.
  Mục đích của T024 là gửi phiếu vào nhóm nhân viên, nên hai biến này chặn việc đó.

## Cách đọc trang này

Cột "Trạng thái" là kết luận của người đọc khi đối chiếu code, không phải lời của tác giả tài liệu.
Khi code đổi, đối chiếu lại và cập nhật trang này, rồi ghi vào [Nhật ký](log.md).
