# An toàn

> Cập nhật: 2026-11-10 · commit: 14595d4

Trang này đối chiếu 9 điều hiến pháp với code thật trên nhánh `main`. Mỗi điều có hai phần rõ ràng: **đã có code ở đâu** và **điểm cần lưu ý / kiểm chứng**.

Hệ thống tuân thủ kiến trúc **một đường xử lý duy nhất**: `server.js:85` nối thẳng vào lõi `core/engine.js:37`, mọi tin ra ngoài đều qua đúng một cửa gửi `core/gate.js:117` và được bảo vệ bởi nhiều lớp kiểm duyệt độc lập.

## Đọc trước: một đường, một cửa gửi

| Điểm vào | Cách gửi tin | Trạng thái |
|---|---|---|
| `server.js:85` (dựng engine) | qua cửa gửi `core/gate.js:117` | đang chạy thật |

Nơi duy nhất trong toàn bộ mã nguồn sản xuất gọi `channel.sendText` là `core/gate.js:82`. Nguyên tắc này được bảo chứng bằng bài kiểm thử hồi quy quét đệ quy toàn bộ repo tại `test/core/one-gate.test.mjs:200`.

## Bảng tổng quan 9 điều

| Điều | Tên | Trạng thái |
|---|---|---|
| I | Một cửa gửi | Đạt (`core/gate.js:117`, `core/gate-decide.js:78`, `test/core/one-gate.test.mjs:200`) |
| II | Người trước máy | Đạt (`core/handoff.js:100`, `core/engine.js:127`, `core/gate-decide.js:98`, `core/intents.js:120`) |
| III | Số tiền do code tra | Cửa sẵn sàng (`core/gate-decide.js:140`, `core/sanitizer.js:189`, `packs/hs/editor.js:45`; gói hs đặt `moneyCheck: false` ở `packs/hs/index.js:24`) |
| IV | Bằng chứng thắng lời khai | Đạt (`core/store/schema.js:35`, `core/gate.js:59`, `core/engine.js:143`, `scripts/audit.mjs:1`) |
| V | Tri thức một nhà | Đạt (`packs/hs/packages.js:142`, `core/mcp.js:90`, `core/registry.js:9`) |
| VI | Đơn giản, không phụ thuộp | Đạt phần lớn (`package.json:8` Node ≥ 22.13, 0 dependency; 1 tệp `core/` vượt 300 dòng (`core/engine.js`); 2 tệp `packs/hs/` vượt 300 dòng) |
| VII | Sai thì dừng | Đạt (`core/gate-decide.js:91`, `core/gate.js:214`, `core/handoff-ticket.js:107`, `server.js:74`, `server.js:87`) |
| VIII | Trung thực với khách | Đạt (`core/intents.js:185`, `core/intents.js:202`, `packs/hs/packages.js:196`) |
| IX | Bí mật không bao giờ lộ | Đạt (`core/redact.js:16`, `core/sdt.js:167`, `core/sanitizer.js:77`, `scripts/audit.mjs:29`, `core/gate-decide.js:135`) |

---

## Điều I — Một cửa gửi

**Yêu cầu.** Mọi tin đi ra khách đều qua đúng một hàm `gate.send()`; cửa chỉ được gửi, bỏ, hoãn hoặc từ chối, không bao giờ sửa chữ trong câu (`.specify/memory/constitution.md:10`). Code gửi đi mà không qua cửa là lỗi chặn merge (`.specify/memory/constitution.md:13`).

**Đã có code.**

- Quyết định là hàm thuần, không I/O: `core/gate-decide.js:78`.
- Thi hành quyết định và ghi vào outbox: `core/gate.js:117`.
- Nơi duy nhất gọi `channel.sendText`: `core/gate.js:82`.
- Cửa không sửa câu: chỉ tách tin dài bằng `splitText` ở `core/gate.js:76`, tin gốc lưu nguyên văn ở `core/gate.js:146`.
- Bốn loại quyết định:
  - **gửi**: `core/gate-decide.js:146`.
  - **bỏ**: trùng idempotent (`core/gate-decide.js:94`) và trùng nội dung theo Jaccard (`core/gate-decide.js:130`).
  - **hoãn**: giờ yên hoặc vượt trần gửi (`core/gate-decide.js:104`, `core/gate-decide.js:109`).
  - **từ chối**: tin rỗng (`core/gate-decide.js:91`), phòng do người / bị chặn (`core/gate-decide.js:98`), gửi chủ động không có nợ (`core/gate-decide.js:103`), rò rỉ dữ liệu (`core/gate-decide.js:136`), số tiền thiếu bằng chứng (`core/gate-decide.js:143`).
- Gói nghiệp vụ không tự gửi tin: chỉ trả về câu trả lời (`specs/001-nen-tang-chung/contracts/pack.md:23`), lõi đưa từng câu qua `reply` gọi `gate.send` tại `core/engine.js:215`.
- Test khoá một cửa gửi trên toàn repo: `test/core/one-gate.test.mjs:200`.

**Điểm cần lưu ý.**
Không có ngoại lệ. Mọi tin nội bộ, tin báo lỗi, phiếu nhân viên, bản tin gộp đều phải đi qua `core/gate.js`.

---

## Điều II — Người trước máy

**Yêu cầu.** Phòng chat ở trạng thái `human` thì bot im hoàn toàn; phòng trở về `bot` khi nhân viên ra lệnh rõ ràng, hoặc tự trở về sau khoảng lặng lâu (mặc định khoảng 2 giờ), và tự trở về chỉ đổi trạng thái phòng, không gửi tin (`.specify/memory/constitution.md:16`, `.specify/memory/constitution.md:17`). Trong nhóm, trạng thái tính theo từng người (`convId`), không chặn cả nhóm.

**Đã có code.**

- Cửa từ chối gửi tin khi cuộc trò chuyện do người hoặc bị chặn: `core/gate-decide.js:98`.
- Trạng thái hiệu dụng đọc qua `effectiveState` (`core/gate.js:22`): `chats.state = 'blocked'` chặn cả nhóm, `convs.state` (`human`/`blocked`) chặn theo từng người (`convId`).
- Máy trạng thái phòng quản lý theo người tại `core/handoff.js:100` (`stateOf`), `core/handoff.js:137` (`toHuman`), `core/handoff.js:139` (`toBot`), `core/handoff.js:141` (`block`), `core/handoff.js:147` (`touch`).
- Cơ chế tự trở về bot sau khoảng lặng: `HUMAN_IDLE_MS = 7_200_000` (2 giờ) tại `core/handoff.js:32`. Bộ đếm tính từ tin cuối của người, không tính tin bot.
- Lõi nhường phòng cho người: `core/engine.js:127` đọc trạng thái phòng trước khi ghi nhận mốc tin mới, và tại `core/engine.js:164` chuyển nhánh xử lý sang `human.im` (`core/engine-handoff.js:49`): bot im hoàn toàn (0 tin ra), ghi nhận tin vào bảng `messages` và chuyển tiếp nội dung tin nhắn khách vào phiếu hỗ trợ qua `handoff.forward`.
- Nhận diện ý định gặp người: `core/intents.js:120` (`wantsHuman`), lõi chuyển phòng và mở phiếu tại `core/engine-handoff.js:62`.
- Lệnh nhân viên điều khiển phòng: `core/handoff.js:177` (`/tl`, `/nhan`, `/tra-bot`, `/chan`, `/chan-nhom`, `/cho`).
- Test kiểm chứng: `test/core/handoff-state.test.mjs`, `test/core/engine-handoff.test.mjs`, kịch bản eval `eval/fixtures/human-room.jsonl`.

**Điểm cần lưu ý.**
Phòng `human` chỉ được trả về `bot` khi nhân viên gõ `/tra-bot` hoặc sau 2 giờ không có tin nhắn mới từ người.

---

## Điều III — Số tiền do code tra

**Yêu cầu.** Thuế, cước, giá, phí chỉ lấy từ kết quả công cụ hoặc bảng dữ liệu; mô hình được diễn đạt, không được tự ra số (`.specify/memory/constitution.md:22`). Gói có cờ `moneyCheck` thì cửa từ chối tin có con số tiền không xuất hiện trong bằng chứng của lượt (`.specify/memory/constitution.md:23`).

**Đã có code.**

- Cửa kiểm cờ `moneyCheck`: `core/gate-decide.js:140`.
- Gom tập số đã có trong bằng chứng: `core/gate-decide.js:53` (`evidenceNumbers`).
- Từ chối khi có số không có căn cứ trong bằng chứng: `core/gate-decide.js:143`.
- Bộ trích xuất số tiền trong văn bản: `core/text.js:40` (`extractMoney`).
- Não biên tập kiểm từng con số của bản chốt viết lại so với bản gốc: `packs/hs/editor.js:45` (`soDungChuan`). Lệch số thì huỷ bản chốt, giữ bản đầy đủ.
- Mô-đun kiểm số theo giá trị: `core/sanitizer.js:189` (`kiemSoTheoGiaTri`), chuẩn hoá giá trị số tại `core/sanitizer.js:135` (`chuanHoaGiaTriSo`).

**Điểm cần lưu ý.**
Gói hải quan hiện đặt `moneyCheck: false` tại `packs/hs/index.js:24` vì dữ liệu thuế trả về từ Cổng OZ dạng văn bản phong phú chưa có schema số cố định. Tuy nhiên, toàn bộ hạ tầng kiểm duyệt ở cửa và não biên tập (`packs/hs/editor.js`) đã sẵn sàng kích hoạt.

---

## Điều IV — Bằng chứng thắng lời khai

**Yêu cầu.** Mỗi lượt ghi một bản ghi audit: tin vào, gói được chọn, công cụ đã gọi kèm kết quả, quyết định của cửa, tin ra (`.specify/memory/constitution.md:27`). Câu "đã gửi, đã xong" phải trỏ được tới bản ghi (`.specify/memory/constitution.md:28`).

**Đã có code.**

- Bảng audit: `core/store/schema.js:35`, chỉ mục theo lượt tại `core/store/schema.js:54`.
- Ghi tin vào: `core/engine.js:143` (`ghiVao`).
- Ghi gói được chọn: `core/engine.js:204`.
- Ghi tin ra cùng quyết định của cửa: `core/gate.js:59` (`auditGate`), lưu `turn_id`, `chat_id`, `conv_id`, `idemKey`, `decision`, `reason`.
- Ghi kết quả công cụ Cổng OZ: `core/engine-ctx.js:30`.
- Lịch sử tin khách: `core/engine.js:192`. Lịch sử tin bot/nhân viên: `core/gate.js:107`.
- CLI tra cứu audit: `scripts/audit.mjs:1` mở SQLite ở chế độ chỉ đọc `scripts/audit.mjs:176`, định dạng giờ VN `scripts/audit.mjs:158`, che dữ liệu nhạy cảm theo Điều IX (`scripts/audit.mjs:29`). Chạy bằng lệnh `npm run audit` (`package.json:15`).
- Kiểm tra tính toàn vẹn `messages`: hàm `checkMessages` trong `eval/run.mjs:167` đối chiếu số tin khách vào, tin gửi ra và số dòng `messages` trên toàn bộ các kịch bản eval.

**Điểm cần lưu ý.**
Mọi tin nhắn thành công trên hệ thống đều có thể truy vết ngược về mã lượt `turn_id` tương ứng qua `npm run audit -- --turn <id>`.

---

## Điều V — Tri thức một nhà

**Yêu cầu.** Tri thức nghiệp vụ nằm ở Cổng OZ (MCP) hoặc tệp dữ liệu có chủ; không nhúng tri thức vào code hay prompt (`.specify/memory/constitution.md:32`, `.specify/memory/constitution.md:33`).

**Đã có code.**

- Danh mục gói khai báo tên công cụ của Cổng, không chứa bảng mã hay bảng thuế: `packs/hs/packages.js:142`.
- Bot tự đọc danh sách công cụ của Cổng OZ: `core/mcp.js:90` (cache 10 phút tại `core/mcp.js:13`), gọi công cụ ở `core/mcp.js:106`.
- Lõi nạp gói theo thư mục, gói tự khai công cụ cần: `core/registry.js:9`.
- Não AI chỉ định tuyến và chép dữ kiện: `packs/hs/brain.js:93`.

**Điểm cần lưu ý.**
Repo hoàn toàn không lưu trữ tệp dữ liệu biểu thuế hay mã HS cứng, toàn bộ truy vấn được uỷ thác sang Cổng OZ.

---

## Điều VI — Đơn giản, không phụ thuộc

**Yêu cầu.** Node từ 22.13 trở lên, chỉ dùng thư viện chuẩn, không thêm package runtime; mỗi tệp một trách nhiệm, dưới 300 dòng (`.specify/memory/constitution.md:36`, `.specify/memory/constitution.md:37`).

**Đã có code.**

- Khai báo phiên bản Node: `package.json:8` (`>=22.13`).
- Không có `dependencies` trong `package.json`: toàn bộ hệ thống sử dụng thư viện chuẩn của Node.js (bao gồm `node:sqlite` mở ở `core/store.js:9`).
- Giới hạn độ dài tệp: các tệp trong `core/` phần lớn dưới 300 dòng (ví dụ `core/gate.js`: 226 dòng, `core/handoff.js`: 297 dòng, `core/sanitizer.js`: 218 dòng, `core/sdt.js`: 178 dòng); ngoại lệ đang mở được ghi ở mục "Điểm cần lưu ý" bên dưới.
- CLI tra cứu audit cũng dưới 300 dòng: `scripts/audit.mjs` (249 dòng).
- CI chạy test và eval trên Node 22: `.github/workflows/ci.yml:17` và `.github/workflows/ci.yml:18`.

**Điểm cần lưu ý.**
Hiện tại có ba tệp vượt quá 300 dòng: `packs/hs/packages.js` (627 dòng), `packs/hs/render.js` (471 dòng) và `core/engine.js` (337 dòng) — đo bằng `wc -l` sau khi gộp `origin/main` vào nhánh PR 176 (2026-11-10). `core/engine.js` vượt mốc vì vá #170 thêm nhánh "bot vừa hỏi lại" và cờ `choKhachTraLoi`; ba tệp này thuộc phạm vi refactor trong các spec nghiệp vụ kế tiếp.

---

## Điều VII — Sai thì dừng

**Yêu cầu.** Không chắc trạng thái thì không gửi, và báo nhân viên; mọi bước gửi đều idempotent nên khởi động lại không bao giờ gây gửi trùng (`.specify/memory/constitution.md:41`, `.specify/memory/constitution.md:42`).

**Đã có code.**

- Cửa dừng thay vì gửi: từ chối khi tin rỗng `core/gate-decide.js:91`, từ chối khi không có nợ `core/gate-decide.js:103`, bỏ khi trùng nội dung `core/gate-decide.js:130`.
- Báo nhân viên và tạo phiếu: `core/gate.js:66` gọi `onTicket` hoặc `onAlert`, nối vào `handoff.open` ở `server.js:74`.
- Chống gửi trùng nhiều tầng: khóa `idem_key` UNIQUE tại `core/store/schema.js:23`, cờ chống chồng nhịp `dangGui` (`core/handoff-ticket.js:174`) và `dangQuet` (`core/handoff-ticket.js:251`).
- Khôi phục khi tiến trình chết giữa chừng: `gate.recover()` (`core/gate.js:214`), `jobs.recover()` (`core/jobs.js:117`), `engine.recover()` (`core/engine.js:265`) được gọi lúc khởi động tại `server.js:87-88`.
- Thử lại 3 lần có giãn cách: `core/gate.js:12` (1, 5, 15 phút).
- Đẩy phiếu vào nhóm nhân viên: `core/handoff-ticket.js:107`, bộ quét định kỳ 5 giây `flushDue` tại `server.js:104`.
- Test tự động chứng minh: `test/core/recover.test.mjs`, `test/core/stress.test.mjs` (SC-001: 1.000 update, 3 lần reboot → 0 tin trùng, 0 tin mất).

---

## Điều VIII — Trung thực với khách

**Yêu cầu.** Khách hỏi "người hay máy" thì bot nói thật là trợ lý tự động của OZ và mời gặp người; không hứa thứ công cụ không làm được; mã HS luôn ghi là gợi ý (`.specify/memory/constitution.md:45`, `.specify/memory/constitution.md:46`).

**Đã có code.**

- Nhận diện câu hỏi "người hay máy": `core/intents.js:185` (`asksIfBot`).
- Phản hồi trung thực định sẵn: `core/intents.js:202` (`REPLY_IS_BOT`), khẳng định là trợ lý tự động OZ và chỉ dẫn câu "gặp nhân viên".
- Xử lý ý định xin gặp người: `core/intents.js:120` (`wantsHuman`), phản hồi câu định sẵn `core/intents.js:197` (`REPLY_HANDOFF`), chuyển phòng sang `human` và mở phiếu hỗ trợ tại `core/engine-handoff.js:62`.
- Mã HS luôn kèm thông báo pháp lý: `packs/hs/packages.js:196`.
- So khớp logo chỉ mang tính tham khảo: `packs/hs/flow-photo.js:14`.
- Chưa rõ ý thì hỏi lại một câu thay vì phỏng đoán: `packs/hs/brain.js:70`.
- Bảo chứng bằng kịch bản eval: `eval/fixtures/is-bot.jsonl`, `eval/chung/04-hoi-nguoi-hay-may.json`.

---

## Điều IX — Bí mật không bao giờ lộ

**Yêu cầu.** Token, khoá, số điện thoại cá nhân, số tài khoản, giá vốn không bao giờ xuất hiện trong log hay tin gửi khách; lỗi API gửi khách chỉ là câu báo chung, không kèm thông báo lỗi gốc (`.specify/memory/constitution.md:49`, `.specify/memory/constitution.md:50`).

**Đã có code.**

- Che bí mật token/Bearer trong log: `core/redact.js:16`.
- Phát hiện đường dẫn nội bộ và stack trace: `core/redact.js:24`.
- Cửa chặn tin rò rỉ: `core/gate-decide.js:135` (`findLeak`).
- Che số điện thoại cá nhân theo chuẩn quốc gia: `core/sdt.js:167` (`cheSdt`), phân biệt rõ mã HS và số điện thoại (`core/sdt.js:21` `looksLikeHsCode`).
- Mô-đun khử trùng dữ liệu nhạy cảm: `core/sanitizer.js:77` (`cheSdt`), `core/sanitizer.js:108` (`cheSoTaiKhoan`), `core/sanitizer.js:122` (`cheThongTinNhayCam`).
- CLI tra cứu audit che trước khi in: `scripts/audit.mjs:29` (kết hợp `cheSdt`, `redact`, regex khoá và đường dẫn nội bộ).
- Giám sát an toàn 0 rò rỉ dữ liệu (SC-002 của spec 007): `scripts/giam-sat/sc-002.js:47` (`kiemTraSc002` quét 0 rò rỉ SĐT, STK, token, tên khách thật).
- Lỗi API không kèm thông báo lỗi gốc: `packs/hs/index.js:91`, `packs/hs/vision.js:26-33`, bảo chứng bởi test `test/core/loi-goc-khach.test.mjs:101-135`.

---

## Bảng đối chiếu mục tiêu an toàn (SC-001, SC-002, SC-007)

Theo bảng đo lường tại `specs/001-nen-tang-chung/sc-do.md:11`:

| Mã SC | Mục tiêu an toàn | Bằng chứng thực thi mã nguồn | Kết quả đo thực tế | Trạng thái |
|---|---|---|---|---|
| **SC-001** | 1.000 update, 10% lặp, 3 lần reboot ép buộc: trùng = 0, mất = 0 | `test/core/stress.test.mjs:47-192`, `core/gate.js:214`, `core/engine.js:265` | • Tin trùng: **0**<br>• Tin mất: **0**<br>• Tin phát lại: **14/14**<br>• Tin cũ gửi trong giờ yên: **0** | **ĐẠT** (Lab) |
| **SC-002** | Phòng `human`: tin bot ra = 0 trên eval và audit 7 ngày chạy thật | `core/engine.js:164`, `core/engine-handoff.js:49`, `eval/fixtures/human-room.jsonl:1`, `scripts/giam-sat/sc-002.js:47`, `test/giam-sat/giam-sat-sc002-tuan.test.mjs:1` | • Lab: **0** tin bot tự động gửi (chỉ 1 tin bàn giao `REPLY_HANDOFF`)<br>• Thật: Chờ đo sau 7 ngày mở lại bot | **ĐẠT** (Lab)<br>*Chờ đo thực địa* |
| **SC-007** | Mọi tin ra trong 7 ngày chạy thật tra được `turn_id` trong audit | `core/gate.js:59`, `test/core/one-gate.test.mjs:200`, `scripts/do-sc-thuc.mjs:1` | • Lab: **100%** tin gửi ra đều tạo bản ghi audit loại `gate` có `turn_id`<br>• Thật: Chờ đo sau 7 ngày mở lại bot | **ĐẠT** (Lab)<br>*Chờ đo thực địa* |

---

## Sơ đồ các lớp bảo vệ

Mọi tin nhắn tương tác đi qua hệ thống phòng vệ đa tầng:

```
[Khách nhắn qua Zalo]
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Webhook & Hàng đợi (core/webhook.js:40, core/queue.js:10) │
│    - Xác thực secret, lưu bền vững inbox trước khi HTTP 200 │
│    - Xếp hàng đợi tuần tự theo người (convId)               │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Lõi & Hand-off (core/engine.js:127, core/handoff.js:100)  │
│    - Phòng 'human'/'blocked': bot im 100%, chuyển phiếu     │
│    - Khách hỏi bot / xin người: phản hồi cố định định sẵn   │
│    - Giới hạn tần suất: core/engine.js:181                  │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Khử trùng dữ liệu (core/redact.js:16, core/sdt.js:167)    │
│    - Che số điện thoại cá nhân (core/sdt.js:167)            │
│    - Lọc số tài khoản & dữ liệu nhạy cảm (core/sanitizer.js) │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Cửa kiểm duyệt duy nhất (core/gate.js:117, core/gate-decide.js:78) │
│    - Quyết định: send / drop / defer / reject               │
│    - Chặn rò rỉ (leak), giờ yên, hạn mức ngày, trùng Jaccard│
│    - Kiểm tra số tiền có căn cứ: core/gate-decide.js:140    │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Bền hoá & Giám sát (core/gate.js:59, scripts/audit.mjs:1) │
│    - Ghi audit với turn_id, chat_id, conv_id                │
│    - Giám sát tự động 0 rò rỉ: scripts/giam-sat/sc-002.js   │
│    - Thống kê vận hành: /metrics (core/ops.js:77, server.js:95)│
└─────────────────────────────────────────────────────────────┘
         │
         ▼
[Gửi ra Zalo qua channel.sendText — duy nhất tại core/gate.js:82]
```

---

## Rủi ro cơ chế hộp thư riêng giám sát (T704, spec 007)

Cơ chế hộp thư riêng cho bản tin giám sát (`scripts/giam-sat/digest.js:1`, `core/digest-scan.js:1`) chứa các biện pháp phòng vệ an toàn:
- **Rủi ro gửi ban đêm (giờ yên)**: Bộ quét `core/digest-scan.js:33` chủ động kiểm tra `isQuietHours()` để không gửi trong giờ yên 23:00–07:00 VN, dù cửa `core/gate.js` miễn giờ yên cho loại `digest`.
- **Rủi ro dồn ứ bản tin cũ**: Bản tin quá hạn (>24 giờ đối với ngày, >7 ngày đối với tuần) được bộ quét tự động đánh dấu `het-han` (`core/digest-scan.js:63`) và không gửi bù, tránh làm ngập tin nhân viên khi bot khởi động lại sau nhiều ngày tắt.
- **Rủi ro rò rỉ bí mật trong lỗi hộp thư**: Mọi thông báo lỗi và lý do từ chối được lọc qua `redact()` (`core/digest-scan.js:90`) trước khi ghi vào trường `lastError` của tệp hộp thư.
- **Rủi ro tranh chấp ghi tệp**: Mỗi bản tin lưu thành một tệp riêng theo `idemKey` (`scripts/giam-sat/digest.js:52`), sử dụng cơ chế ghi nguyên tử qua tệp tạm rồi đổi tên, loại bỏ hoàn toàn việc đọc-sửa-ghi chung một tệp.

---

## Điểm cần lưu ý / Rủi ro đang mở

1. **Cờ kiểm số tiền chưa bật trong gói hải quan**: `moneyCheck: false` tại `packs/hs/index.js:24`. Luật ở lớp cửa `core/gate-decide.js:140` và não biên tập `packs/hs/editor.js:45` đã sẵn sàng, sẽ bật khi biểu thuế có schema chặt chẽ.
2. **Ba tệp vượt 300 dòng**: `packs/hs/packages.js` (627 dòng), `packs/hs/render.js` (471 dòng) và `core/engine.js` (337 dòng) cần được chia nhỏ theo Điều VI trong các spec nghiệp vụ kế tiếp.
3. **Nghiệm thu thực địa 7 ngày**: Tiêu chí SC-002 (bot im trong phòng human) và SC-007 (mọi tin ra có `turn_id` trong audit) đã đạt 100% trong lab và chờ đo 7 ngày thực tế bằng lệnh `npm run do-sc` khi bot mở lại cho khách thật.

---

## Cách người đọc tự kiểm

```bash
# Kiểm tra nguyên tắc một cửa gửi duy nhất
grep -rn "sendText" core packs channels scripts server.js

# Kiểm tra sự tồn tại của các mô-đun an toàn cốt lõi
ls core/gate.js core/handoff.js core/intents.js core/sdt.js core/sanitizer.js scripts/audit.mjs scripts/giam-sat/sc-002.js

# Kiểm tra CLI tra cứu audit
npm run audit -- --help

# Chạy cổng kiểm tra wiki nghiêm ngặt
node scripts/kiem-wiki.mjs --nghiem
```

## Trang liên quan

- [Tiến độ](tien-do.md) — trạng thái từng việc của spec 001, có bằng chứng theo tệp và dòng.
- [Kiến trúc](kien-truc.md) — các lớp và ranh giới giữa lõi, gói, kênh.
- [Kiểm thử](kiem-thu.md) — cấu trúc các bộ test, eval và cổng kiểm máy.
- [Sự cố và bài học](su-co-bai-hoc.md) — sự cố thật đã đo và nguyên nhân.
