# An toàn

> Cập nhật: 2026-11-07 · commit: 0842386

Trang này đối chiếu 9 điều hiến pháp với code thật. Mỗi điều có hai phần rõ ràng: **đã có code ở đâu** và **chưa có code ở đâu**.

Từ 07/11/2026 (T016) repo chỉ có **một đường xử lý**: `server.js` nối thẳng vào lõi `core/`,
thư mục `lib/` đã bị xoá hẳn. Những ghi chú cũ về "đường đang chạy" và "lõi mới chưa nối" không còn đúng.

## Đọc trước: một đường, một cửa gửi

| Điểm vào | Cách gửi tin | Trạng thái |
|---|---|---|
| `server.js:76` (dựng engine) | qua cửa gửi `core/gate.js:106` | đang chạy thật |

Việc nối lõi mới vào chương trình chính là T016, mô tả ở `specs/001-nen-tang-chung/tasks.md:303`,
**đã làm** (commit `6a9cf5e`, vá lỗi sau đó ở `0842386`). Vì vậy, khi đọc "đã có code" bên dưới, hiểu là "đã có code và đang chạy với khách thật".

Tự kiểm bằng một lệnh: chỉ có `core/gate.js:79` gọi `channel.sendText` trong toàn bộ tệp sản xuất
(`core/`, `packs/`, `channels/`, `scripts/` và `server.js`). Điều này bị khoá bằng test
`test/core/one-gate.test.mjs:167`.

## Bảng tổng quan 9 điều

| Điều | Tên | Trạng thái |
|---|---|---|
| I | Một cửa gửi | có |
| II | Người trước máy | có phần (thiếu mã nhường phòng) |
| III | Số tiền do code tra | có phần (chưa gói nào bật cờ) |
| IV | Bằng chứng thắng lời khai | có phần (thiếu câu "đã gửi" trỏ tới bản ghi) |
| V | Tri thức một nhà | có |
| VI | Đơn giản, không phụ thuộc | có phần (một số tệp vượt 300 dòng) |
| VII | Sai thì dừng | có phần (chưa có phiếu/cảnh báo tới nhóm nhân viên) |
| VIII | Trung thực với khách | có phần |
| IX | Bí mật không bao giờ lộ | có phần (chưa che số điện thoại cá nhân) |

## Điều I — Một cửa gửi

**Yêu cầu.** Mọi tin đi ra khách đều qua đúng một hàm `gate.send()`; cửa chỉ được gửi, bỏ, hoãn hoặc từ chối, không bao giờ sửa chữ trong câu (`.specify/memory/constitution.md:10`). Code gửi đi mà không qua cửa là lỗi chặn merge (`.specify/memory/constitution.md:13`).

**Đã có code.**

- Quyết định là hàm thuần, không I/O: `core/gate-decide.js:69`.
- Thi hành quyết định và ghi vào outbox: `core/gate.js:106`.
- Nơi duy nhất trong toàn bộ tệp sản xuất gọi `channel.sendText`: `core/gate.js:79`.
- Cửa không sửa câu: chỉ tách tin dài bằng `splitText` ở `core/gate.js:74`, tin gốc lưu nguyên văn ở `core/gate.js:137`.
- Bốn loại quyết định: **gửi** ở `core/gate-decide.js:119`, **bỏ** — trùng idempotent (`core/gate-decide.js:82`) và trùng nội dung (`core/gate-decide.js:103`), **hoãn** ở `core/gate-decide.js:92`, **từ chối** — tin rỗng (`core/gate-decide.js:79`) và số tiền thiếu bằng chứng (`core/gate-decide.js:116`).
- Gói nghiệp vụ không tự gửi tin: hợp đồng quy định gói chỉ trả về danh sách câu trả lời (`specs/001-nen-tang-chung/contracts/pack.md:23`), lõi đưa từng câu qua `gate.send` tại `core/engine.js:122` (lời gọi cửa ở `core/engine.js:49`).

**Chưa có code.**

- Chưa có tệp test khoá nguyên tắc này trên toàn repo — **đã có**: `test/core/one-gate.test.mjs:167` quét đệ quy
  `core/`, `packs/`, `channels/`, `scripts/` cộng `server.js` và đòi đúng một nơi gọi `.sendText(`.

## Điều II — Người trước máy

**Yêu cầu.** Phòng chat ở trạng thái `human` thì bot im hoàn toàn; phòng trở về `bot` khi nhân viên ra lệnh rõ ràng, hoặc tự trở về sau khoảng lặng lâu (mặc định khoảng 2 giờ), và tự trở về chỉ đổi trạng thái phòng, không gửi tin (`.specify/memory/constitution.md:16`, `.specify/memory/constitution.md:17`). Từ US8 (T037), trong nhóm "phòng do người" được tính theo **từng người** (`conv`), không áp cho cả nhóm.

**Đã có code.**

- Cửa từ chối khi cuộc trò chuyện do người hoặc bị chặn: `core/gate-decide.js:86` trả quyết định từ chối với lý do dạng `chat-human` / `chat-blocked`.
- Trạng thái hiệu dụng đọc qua `effectiveState` (`core/gate.js:22`): `chats.state = 'blocked'` chặn cả nhóm, `convs.state` (`human`/`blocked`) chặn theo người, chat 1-1 lấy `chats.state` cũ, còn lại `bot`.
- Cột trạng thái có sẵn trong lược đồ, mặc định `bot`: bảng `chats` (`core/store/schema.js:15`) và bảng `convs` (`core/store/schema.js:18`).
- Ba loại tin nội bộ được miễn nhóm luật của tin chủ động (trạng thái phòng, giờ yên, trần gửi, trùng nội dung, kiểm số tiền): `core/gate-decide.js:16`.

**Chưa có code.**

- Chưa có tệp *core/handoff.js*, tức chưa có mã chuyển trạng thái cuộc trò chuyện sang `human` và không có mã trả về `bot`. Bảng `convs` và `convs.setState` đã có (`core/store/state.js:33`) nhưng chưa có lệnh nhân viên gọi nó; cột `state` mới chỉ là khung.
- Lõi không có nhánh bàn giao: `core/engine.js:114` chọn gói rồi chạy, không có bước "nhường cuộc trò chuyện cho nhân viên".
- Quyết định ngày 06/11 về việc phòng tự trở về bot sau một khoảng lặng dài **đã có trong hiến pháp** (`.specify/memory/constitution.md:17`, phiên bản 2.0.0) nhưng **chưa có code** — thuộc việc T022 (`specs/001-nen-tang-chung/tasks.md:380`), chưa làm.

## Điều III — Số tiền do code tra

**Yêu cầu.** Thuế, cước, giá, phí chỉ lấy từ kết quả công cụ hoặc bảng dữ liệu; mô hình được diễn đạt, không được tự ra số (`.specify/memory/constitution.md:22`). Gói có cờ `moneyCheck` thì cửa từ chối tin có con số tiền không xuất hiện trong bằng chứng của lượt (`.specify/memory/constitution.md:23`).

**Đã có code.**

- Cửa kiểm cờ `moneyCheck`: `core/gate-decide.js:113`.
- Gom tập số đã có trong bằng chứng: `core/gate-decide.js:44`.
- Từ chối khi có số không có căn cứ: `core/gate-decide.js:116`.
- Bộ đọc số tiền trong câu: `core/text.js:40`.
- Kiểm từng con số của bản chốt do AI viết lại: `packs/hs/editor.js:21`, dùng ở `packs/hs/editor.js:48` (không khớp thì bỏ bản chốt, giữ bản đầy đủ).
- Hợp đồng gói khai cờ này: `specs/001-nen-tang-chung/contracts/pack.md:13`.

**Chưa có code.**

- Gói hải quan duy nhất trong repo đặt `moneyCheck: false` tại `packs/hs/index.js:101`. Luật ở cửa có rồi, nhưng chưa gói nào bật, nên số tiền trong câu trả lời hiện chưa bị chặn ở lớp cửa.

## Điều IV — Bằng chứng thắng lời khai

**Yêu cầu.** Mỗi lượt ghi một bản ghi audit: tin vào, gói được chọn, công cụ đã gọi kèm kết quả, quyết định của cửa, tin ra (`.specify/memory/constitution.md:27`). Câu "đã gửi, đã xong" phải trỏ được tới bản ghi (`.specify/memory/constitution.md:28`).

**Đã có code.**

- Bảng audit: `core/store/schema.js:35`, có chỉ mục theo lượt tại `core/store/schema.js:54`.
- Ghi tin vào: `core/engine.js:100`.
- Ghi gói được chọn: `core/engine.js:115`.
- Ghi tin ra cùng quyết định của cửa: `core/engine.js:130`.
- Ghi lời gọi công cụ: `core/engine-ctx.js:30`; kết quả chỉ lưu dấu vân tay và 500 ký tự đầu đã che, xem `core/engine-ctx.js:42`.
- Quyết định của cửa được ghi riêng: `core/gate.js:60`.
- Lịch sử tin khách: `core/engine.js:106`. Lịch sử tin bot ghi khi gửi thành công: `core/gate.js:98`.
- Test chạy không cần mạng: `package.json:13`.

**Chưa có code.**

- Chưa có câu "đã gửi / đã xong" nào trong tin khách trỏ được tới bản ghi audit tương ứng; hiện bản ghi chỉ dùng để tra cứu nội bộ.

## Điều V — Tri thức một nhà

**Yêu cầu.** Tri thức nghiệp vụ nằm ở Cổng OZ (MCP) hoặc tệp dữ liệu có chủ; không nhúng tri thức vào code hay prompt (`.specify/memory/constitution.md:32`, `.specify/memory/constitution.md:33`).

**Đã có code.**

- Danh mục gói khai báo tên công cụ của Cổng, không chứa bảng mã hay bảng thuế: `packs/hs/packages.js:142`.
- Bot tự đọc danh sách công cụ của Cổng: `core/mcp.js:90` (cache 10 phút, `core/mcp.js:13`), gọi công cụ ở `core/mcp.js:106`.
- Lõi nạp gói theo thư mục, gói tự khai công cụ cần: `core/registry.js:9`.
- Repo không có tệp dữ liệu mã HS hay thuế nào, nên không có tri thức nhúng trong code.

**Chưa có code / chưa xác minh.**

- Não AI có prompt, nhưng prompt chỉ để chọn gói và chép dữ kiện khách đã nêu: `packs/hs/brain.js:93-102` bỏ mã HS mà khách chưa nêu.
- Chưa xác minh: lúc chạy thật, Cổng OZ có phục vụ đúng các công cụ khai trong `packs/hs/packages.js:142` hay không. Việc này cần kiểm ngoài repo.

## Điều VI — Đơn giản, không phụ thuộc

**Yêu cầu.** Node từ 22.13 trở lên, chỉ dùng thư viện chuẩn, không thêm package runtime; mỗi tệp một trách nhiệm, dưới 300 dòng (`.specify/memory/constitution.md:36`, `.specify/memory/constitution.md:37`).

**Đã có code.**

- Khai báo phiên bản Node: `package.json:8`.
- Tệp `package.json` không có mục `dependencies`: toàn bộ phần mềm chạy bằng thư viện chuẩn của Node, trong đó có `node:sqlite` mở ở `core/store.js:9`.
- Dung lượng tệp lõi nằm dưới 300 dòng; tệp lớn nhất trong `core/` là `core/gate.js` (210 dòng), sau đó `core/engine.js` (173 dòng).
- CI chạy test và eval trên Node 22: `.github/workflows/ci.yml:17` và `.github/workflows/ci.yml:18`.

**Chưa có code.**

- Lệnh `npm run audit` trỏ tới tệp chưa tồn tại: `package.json:15`. Chạy lệnh sẽ báo lỗi không tìm thấy tệp.
- Chưa có kiểm tự động nào canh giới hạn 300 dòng; hiện phải đo thủ công. Hai tệp trong `packs/hs/` đang vượt giới hạn này: `packs/hs/packages.js` (436 dòng) và `packs/hs/render.js` (409 dòng).

## Điều VII — Sai thì dừng

**Yêu cầu.** Không chắc trạng thái thì không gửi, và báo nhân viên; mọi bước gửi đều idempotent nên khởi động lại không bao giờ gây gửi trùng (`.specify/memory/constitution.md:41`, `.specify/memory/constitution.md:42`).

**Đã có code.**

- Cửa dừng thay vì gửi: từ chối khi tin rỗng `core/gate-decide.js:79`, từ chối khi không có nợ để gửi chủ động `core/gate-decide.js:91`, bỏ khi trùng nội dung `core/gate-decide.js:103`.
- Báo nhân viên khi quyết định nghiêm trọng: `core/gate.js:64` gọi kênh cảnh báo hoặc tạo phiếu.
- Idempotent: khóa `idem_key` là UNIQUE ở `core/store/schema.js:23`; lỗi khóa trùng được bắt ở `core/gate.js:142`; lõi tự chặn trùng ở `core/engine.js:65` và `core/engine.js:69`.
- Khôi phục khi tiến trình chết giữa chừng: `core/gate.js:198`, được gọi lúc khởi động tại `server.js:77`.
- Thử lại 3 lần, mỗi lần cách nhau 1, 5 rồi 15 phút: `core/gate.js:12`.

**Chưa có code.**

- Callback `onAlert` và `onTicket` hiện chỉ ghi log ở `server.js:66` và `server.js:67`; chưa có đường gửi cảnh báo/phiếu tới nhóm nhân viên (T024 chưa làm).
- Chưa có tệp test riêng cho `recover()`; thư mục `test/core/` không có tệp nào gọi hàm này.

## Điều VIII — Trung thực với khách

**Yêu cầu.** Khách hỏi "người hay máy" thì bot nói thật là trợ lý tự động của OZ và mời gặp người; không hứa thứ công cụ không làm được; mã HS luôn ghi là gợi ý (`.specify/memory/constitution.md:45`, `.specify/memory/constitution.md:46`).

**Đã có code.**

- Mã HS luôn kèm câu "gợi ý tham khảo, không thay thế ý kiến phân loại của Hải quan": `packs/hs/packages.js:196`, `packs/hs/packages.js:240`, `packs/hs/packages.js:247`.
- Kết quả so logo ghi rõ chỉ để tham khảo, không phải ý kiến pháp lý: `packs/hs/flow-photo.js:14`.
- Chưa rõ ý thì hỏi lại một câu thay vì đoán: `packs/hs/brain.js:70` khai hàm hỏi lại, xử lý ở `packs/hs/brain.js:106`.

**Chưa có code.**

- Chưa có câu trả lời cố định kiểu "em là trợ lý tự động của OZ, anh liên hệ nhân viên". Câu đáp cho chào hỏi và câu ngoài phạm vi do mô hình sinh ra, xem `packs/hs/brain.js:72`, nên không kiểm được bằng code. Đây là khoảng trống đã biết, chưa có test khoá.
- Chưa có cơ chế "mời gặp người": bảng phiếu mới chỉ là khung lược đồ ở `core/store/schema.js:32`, chưa có đường ghi và chưa có nhóm nhân viên.

**Chưa xác minh.** Câu bot trả lời thật khi khách hỏi "người hay máy": repo không lưu log hội thoại để đối chiếu.

## Điều IX — Bí mật không bao giờ lộ

**Yêu cầu.** Token, khoá, số điện thoại cá nhân, số tài khoản, giá vốn không bao giờ xuất hiện trong log hay tin gửi khách; lỗi API gửi khách chỉ là câu báo chung, không kèm thông báo lỗi gốc (`.specify/memory/constitution.md:49`, `.specify/memory/constitution.md:50`).

**Đã có code.**

- Che bí mật trong log: `core/redact.js:16` thay chuỗi Bearer, token bot và chuỗi dài giống khoá.
- Dò nội dung không được lộ ra khách: `core/redact.js:24`, gồm đường dẫn tệp ở `core/redact.js:7` và dấu stack ở `core/redact.js:9`.
- Cửa chặn trước khi gửi: `core/gate-decide.js:109` trả quyết định từ chối với lý do dạng `leak-...`.
- Lõi ghi log đã che: `core/engine.js:134` và `core/engine-ctx.js:33`.
- Gói hải quan không kèm lỗi gốc cho khách: `packs/hs/index.js:91` trả câu báo chung, chi tiết lỗi chỉ vào log ở `packs/hs/index.js:90`.
- Lỗi đọc ảnh cũng không lộ lỗi gốc: `packs/hs/vision.js:26-33` trả câu báo chung cho khách.
- Test khoá ba nhánh lỗi trong `test/core/loi-goc-khach.test.mjs`: nhánh chạy gói ở `test/core/loi-goc-khach.test.mjs:101-110`, nhánh mở lại lượt (`ket-qua`) ở `test/core/loi-goc-khach.test.mjs:112-123`, nhánh đọc ảnh ở `test/core/loi-goc-khach.test.mjs:125-135`. Cả ba ca kiểm tin khách không chứa mảnh lỗi gốc (hàm kiểm ở `test/core/loi-goc-khach.test.mjs:76-84`, danh sách mảnh ở `test/core/loi-goc-khach.test.mjs:24` và `test/core/loi-goc-khach.test.mjs:28`). Hai nhánh gói và mở lại lượt kiểm đúng câu báo chuẩn Cổng (nguyên văn ở `test/core/loi-goc-khach.test.mjs:31`, assert ở `test/core/loi-goc-khach.test.mjs:108` và `test/core/loi-goc-khach.test.mjs:121`), nhánh ảnh kiểm đúng câu báo lỗi ảnh (`test/core/loi-goc-khach.test.mjs:133`).
- Lọc chữ lỗi hệ thống lẫn vào kết quả Cổng: `packs/hs/render.js:119`, thay bằng câu cố định ở `packs/hs/render.js:129`.
- Số điện thoại của công ty được đọc từ cấu hình để loại khỏi tin nhắn: `core/config.js:56`.

**Chưa có code.**

- Che bí mật chưa che số điện thoại cá nhân, nhận xét đã ghi ở `docs/sdd/T015-review.md:78`. Tin vào vẫn lưu 500 ký tự đầu trong bản ghi audit.

## Rủi ro đang mở, xếp theo mức độ

1. Chưa có mã nhường phòng cho người: vi phạm điều II.
2. Cờ kiểm số tiền chưa gói nào bật: điều III mới chỉ có ở lớp cửa.
3. Cảnh báo và phiếu mới chỉ ghi log, chưa tới được nhóm nhân viên: điều VII chưa trọn.
4. Hai tệp trong `packs/hs/` vượt giới hạn 300 dòng của điều VI.

## Cách người đọc tự kiểm

```bash
grep -rn "sendText" core packs channels scripts server.js
ls core/handoff.js core/intents.js core/ops.js
node scripts/kiem-wiki.mjs --nghiem
```

## Trang liên quan

- [Tiến độ](tien-do.md) — trạng thái từng việc của spec 001, có bằng chứng theo tệp và dòng.
- [Kiến trúc](kien-truc.md) — các lớp và ranh giới giữa lõi, gói, kênh.
- [Sự cố và bài học](su-co-bai-hoc.md) — sự cố thật đã đo và nguyên nhân.
