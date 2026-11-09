# Feature Specification: Kênh thứ hai — Fanpage Messenger & Zalo OA

**Feature Branch**: `005-kenh-thu-hai`

**Created**: 2026-11-09

**Status**: Draft (theo lộ trình chốt `docs/ROADMAP.md:12,21-22`: `001 → 007 → 005`)

**Input**: Quyết định của anh Thắng (`docs/ROADMAP.md:12,21-22`): "Đưa lõi `core/` sang kênh Fanpage Messenger / Zalo OA theo `specs/001-nen-tang-chung/contracts/channel.md:1-25` với `capabilities: { detectsHumanReplies: true }` (khi thấy tin nhân viên gõ tay trực tiếp trên trang mà không có trong `outbox` của bot, lõi tự chuyển cuộc trò chuyện `conv_id` sang trạng thái `'human'` và im lặng theo Điều II Hiến pháp)."

---

## Clarifications

### Session 2026-11-09 (Đúc kết từ Roadmap và Hiện trạng Vận hành)

- **Q: Kênh thứ hai gồm những nền tảng nào?**
  - **A**: Meta Facebook Fanpage Messenger (`channels/messenger.js`) và Zalo Official Account (`channels/zalo-oa.js`). Cả hai kênh đều tuân thủ hợp đồng adapter chuẩn `specs/001-nen-tang-chung/contracts/channel.md:1-25`. Kênh `channels/zalo-bot.js` (Zalo Bot Platform cá nhân) hiện tại giữ nguyên không đổi.
- **Q: Vì sao tính năng `detectsHumanReplies: true` là bắt buộc đối với Fanpage Messenger?**
  - **A**: Số liệu thực tế trong 7 ngày (tính đến 04/11/2026) ghi nhận **1.451 tin nhân viên trả lời tay** trên giao diện Meta Business Suite của Fanpage (`docs/ROADMAP.md:11,21-22`). Bài học sự cố #4 trong nghiên cứu nền tảng (`specs/001-nen-tang-chung/research.md:13`) cho thấy: khi nhân viên đang tư vấn khách mà bot không biết và nhảy vào trả lời (chen ngang 22 tin), khách hàng hoang mang và trải nghiệm bị gãy đổ. Vì vậy, khả năng tự động phát hiện nhân viên gõ tay trên trang để bot im ngay lập tức là điều kiện tiên quyết để đưa bot lên Fanpage.
- **Q: Kênh phát hiện nhân viên gõ tay bằng cơ chế kỹ thuật nào?**
  - **A**: Meta Messenger gửi webhook cho mọi tin nhắn phát ra từ Fanpage qua sự kiện `message_echoes` (có trường `message.is_echo: true`, kèm `app_id` và `message_id`). Zalo OA cũng gửi sự kiện tin nhắn xuất phát từ OA (`oa_send_text`). Khi nhận sự kiện này, hệ thống đối chiếu với bảng `outbox` của bot (hoặc kiểm tra `app_id` gửi tin): nếu tin nhắn không xuất phát từ `outbox` của bot (hoặc không mang `app_id` của bot), hệ thống kết luận 100% đây là tin nhân viên gõ tay trực tiếp.
- **Q: Khi phát hiện tin người gõ tay, bot sẽ xử lý như thế nào?**
  - **A**: Lõi bot lập tức chuyển cuộc trò chuyện `conv_id` sang trạng thái `'human'` thông qua `handoff.toHuman(convId, 'nhan-vien-go-tay', 'echo-detected')`, ghi nhận một bản ghi audit `state-change`, ghi nhận tin nhắn vào bảng `messages` với `speaker: 'nhan-vien'`, và gọi `handoff.touch(convId)` để kích hoạt/đặt lại bộ đếm khoảng lặng 2 giờ (Điều II). Bot tuyệt đối im lặng, không gửi bất kỳ tin nào ra khách.
- **Q: Xác thực Webhook thực hiện như thế nào để đảm bảo an toàn?**
  - **A**: Dùng 100% thư viện chuẩn Node.js (`node:crypto`), không thêm dependency ngoài:
    - Meta Messenger: Xác thực challenge `hub.verify_token` khi đăng ký webhook (phương thức GET); xác thực chữ ký gói tin `x-hub-signature-256` (HMAC-SHA256 với App Secret) bằng hàm so sánh an toàn thời gian hằng `safeEqual` (phương thức POST).
    - Zalo OA: Xác thực chữ ký MAC hoặc header bí mật bằng `safeEqual`.
- **Q: Cấu trúc định tuyến đa kênh trên Server như thế nào?**
  - **A**: Server HTTP `server.js` và `core/webhook.js` hỗ trợ tiếp nhận nhiều webhook trên các đường dẫn tách biệt (ví dụ: `/webhook/messenger`, `/webhook/zalo-oa`, `/webhook/zalo-bot`) hoặc định tuyến qua tiền tố URL. Tất cả các kênh đều dùng chung một bộ nhớ SQLite `core/store.js`, chung hàng đợi tuần tự `core/queue.js`, và **chung đúng một cửa gửi duy nhất `core/gate.js`** theo Điều I Hiến pháp.

---

## Bối cảnh

Tại OZ Việt Nam, kênh Fanpage Facebook và Zalo Official Account là hai kênh tiếp xúc khách hàng lớn nhất:
- Trong 7 ngày đầu tháng 11/2026, đội ngũ CSKH đã xử lý thủ công 1.451 tin nhắn trực tiếp trên Fanpage (`docs/ROADMAP.md:11,21-22`). Khách hàng nhắn hỏi thủ tục hải quan, cước vận chuyển và kiểm tra mã HS liên tục trên Fanpage.
- Trước đây, ở VPS 201 cũ, bot và người thường xuyên giẫm chân nhau: nhân viên đang tư vấn thì bot nhảy vào trả lời theo từ khóa, hoặc bot tự động ngắt trạng thái hỗ trợ của nhân viên sau 45 phút gây ra sự cố chen ngang 22 tin nhắn (`specs/001-nen-tang-chung/research.md:13`).
- Tại Spec 001, chúng ta đã xây dựng nền tảng vững chắc: máy trạng thái phòng chat theo người (`core/handoff.js`), cửa gửi duy nhất kiểm soát giờ yên và chống lộ thông tin (`core/gate.js`), hàng đợi tuần tự theo người (`core/queue.js`). Tuy nhiên, kênh `channels/zalo-bot.js` có `capabilities: { detectsHumanReplies: false }` vì Zalo cá nhân không có webhook báo tin người gõ.
- Meta Messenger và Zalo OA cung cấp cơ chế webhook phản chiếu (echo). Spec 005 khai thác tính năng này để hiện thực hóa `detectsHumanReplies: true`: **Người xuất hiện là máy tự lui** — giải quyết triệt để vấn đề chen ngang và cho phép đưa bot vào hỗ trợ đội ngũ CSKH an toàn 100%.

---

## Bảng đối chiếu 9 điều Hiến pháp

| Điều | Nguyên tắc Hiến pháp | Yêu cầu thực thi trong Spec 005 |
|---|---|---|
| **I. Một cửa gửi** (NON-NEGOTIABLE) | Mọi tin đi ra khách đều qua đúng một hàm `gate.send()`. Không bypass. | Cả hai kênh mới (`channels/messenger.js`, `channels/zalo-oa.js`) chỉ là adapter nhận lệnh từ `core/gate.js` qua hàm `sendText(chatId, text)`. Kênh tuyệt đối không tự gọi API gửi tin cho khách ngoài cửa gửi. |
| **II. Người trước máy** (NON-NEGOTIABLE) | Phòng ở trạng thái `human` thì bot im hoàn toàn. Khách im thì máy im. | Trọng tâm của Spec 005: Khai thác `message_echoes` để phát hiện nhân viên gõ tay trực tiếp trên Business Suite/OA. Ngay khi phát hiện, tự động chuyển `conv_id` sang `'human'`, ghi audit, đặt lại khoảng lặng 2 giờ. Bot im 100%. |
| **III. Số tiền do code tra** | Thuế, cước, giá, phí chỉ lấy từ công cụ. | Áp dụng chung cho mọi kênh qua tầng lõi `core/engine.js` và `core/gate.js`. Kênh Messenger và Zalo OA thừa hưởng toàn bộ cơ chế bảo vệ của `moneyCheck: true`. |
| **IV. Bằng chứng thắng lời khai** | Mỗi lượt ghi một bản ghi audit. `npm test` chạy không cần mạng. | Ghi audit đầy đủ: sự kiện echo phát hiện người gõ (`state-change`), tin nhắn nhân viên vào `messages`, webhook parse, và mọi quyết định gửi tin. Test adapter dùng mock `fetchImpl` thuần Node.js, không gọi ra Meta hay Zalo thật. |
| **V. Tri thức một nhà** | Tri thức nghiệp vụ nằm ở Cổng OZ MCP hoặc file dữ liệu có chủ. | Kênh Messenger và Zalo OA chỉ làm nhiệm vụ giao tiếp I/O và chuẩn hóa `Update`, không chứa bất kỳ tri thức nghiệp vụ hải quan hay logic bán hàng nào. |
| **VI. Đơn giản, không phụ thuộc** | Node ≥ 22.13, chỉ dùng thư viện chuẩn, mỗi tệp < 300 dòng. | Không dùng thư viện Meta SDK hay Zalo SDK ngoài. Sử dụng `node:crypto`, `node:test`, `fetch`. Tách nhỏ module adapter, parser, detector đảm bảo mỗi tệp dưới 300 dòng. |
| **VII. Sai thì dừng** | Không chắc trạng thái thì không gửi. Idempotency bền vững. | Xác thực webhook thất bại lập tức từ chối 403. Nếu không chắc một tin echo là do bot hay nhân viên gửi, nguyên tắc an toàn bắt buộc xem như nhân viên gửi để bot nhường người. |
| **VIII. Trung thực với khách** | Hỏi "người hay máy" thì bot nói thật. Không hứa hão. | Kênh Messenger và Zalo OA thừa hưởng `core/intents.js` (`asksIfBot`, `REPLY_IS_BOT`, `REPLY_HANDOFF`). Khách hỏi trên Fanpage hay Zalo OA đều nhận câu trả lời trung thực. |
| **IX. Bí mật không bao giờ lộ** | Token, App Secret, SĐT thật không vào log hay tin gửi khách. | Meta Page Access Token, App Secret, Zalo OA Secret được che qua `core/redact.js`. Lỗi ném ra từ adapter chỉ chứa mã trạng thái HTTP, không chứa token. SĐT test chỉ dùng `0912345678`. |

---

## User Scenarios & Testing

### User Story 1 — Adapter kênh Messenger & Zalo OA chuẩn hoá và bảo mật (Priority: P1)

Là lập trình viên hệ thống, tôi muốn có các adapter kênh `channels/messenger.js` và `channels/zalo-oa.js` tuân thủ đúng hợp đồng `specs/001-nen-tang-chung/contracts/channel.md:1-25`, xác thực webhook an toàn bằng crypto thuần và chia phần tin nhắn theo giới hạn ký tự, để bot kết nối được với khách hàng trên Fanpage và Zalo OA.

- **Why this priority**: Không có adapter kênh đạt chuẩn bảo mật thì không thể nhận và gửi tin nhắn an toàn trên Fanpage/Zalo OA.
- **Independent Test**: Khởi tạo adapter kênh với mock `fetchImpl`, gửi request webhook có chữ ký hợp lệ/không hợp lệ, gọi `sendText`, `typing`. Kiểm tra xác thực chữ ký (Meta HMAC-SHA256, Zalo MAC), kiểm tra phân chia tin nhắn ≤ 2.000 ký tự.

**Acceptance Scenarios**:
1. **Given** một webhook request từ Meta có header `x-hub-signature-256` khớp với HMAC-SHA256 của payload tính bằng `APP_SECRET`, **When** gọi `channel.verifyWebhook(req)`, **Then** trả về `true`.
2. **Given** một webhook request có chữ ký bị sai lệch hoặc thiếu header chữ ký, **When** gọi `channel.verifyWebhook(req)`, **Then** trả về `false` mà không ném ngoại lệ.
3. **Given** Meta gửi request GET xác thực webhook với `hub.mode=subscribe` và `hub.verify_token`, **When** verify_token khớp cấu hình, **Then** trả về HTTP 200 kèm chuỗi `hub.challenge`.
4. **Given** tin nhắn dài 3.500 ký tự từ cửa gửi `gate.send`, **When** gọi `channel.sendText(chatId, text)`, **Then** adapter gửi thành công qua API của nền tảng (cửa đã chia đoạn ≤ 2.000 ký tự theo `maxText`).

---

### User Story 2 — Phát hiện nhân viên gõ tay và tự động nhường phòng (Priority: P1)

Là nhân viên CSKH trực Fanpage OZ, khi tôi vào giao diện Meta Business Suite hoặc Zalo OA để gõ tin nhắn tư vấn trực tiếp cho khách hàng, tôi muốn bot nhận diện được tin nhắn của tôi, tự động chuyển phòng sang trạng thái `'human'` và im lặng hoàn toàn, để không làm phiền khách và không làm gián đoạn cuộc tư vấn.

- **Why this priority**: Đây là tính năng cốt lõi của Spec 005, giải quyết triệt để 1.451 trường hợp trả lời tay và chặn đứng sự cố chen ngang 22 tin nhắn trong quá khứ.
- **Independent Test**: Nạp một chuỗi sự kiện webhook giả lập gồm tin nhắn khách hỏi → bot trả lời (ghi outbox) → nhân viên gõ tay trên Fanpage (sự kiện echo không có trong outbox). Đo lường: trạng thái phòng chuyển sang `'human'`, audit ghi nhận `state-change`, và các tin nhắn kế tiếp của khách bot đều im lặng (0 tin gửi ra).

**Acceptance Scenarios**:
1. **Given** một sự kiện echo gửi về từ Meta Messenger (`is_echo: true`), **When** đối chiếu không tìm thấy tin nhắn tương ứng trong `outbox` của bot trong 30 giây gần nhất, **Then** hệ thống xác định là nhân viên gõ tay (`detectsHumanReplies: true`), chuyển phòng `conv_id` sang `'human'`, ghi audit `state-change` với lý do `echo-detected`, và ghi tin vào `messages` với `speaker: 'nhan-vien'`.
2. **Given** phòng vừa chuyển sang `'human'` do nhân viên gõ tay, **When** khách hàng nhắn tiếp câu hỏi mới, **Then** bot tuân thủ Điều II: im hoàn toàn, ghi nhận tin nhắn khách vào `messages`, không gọi mô hình AI, không gửi bất kỳ tin nào ra ngoài.
3. **Given** bot vừa gửi một tin trả lời qua `gate.send` (đã ghi `outbox`), **When** Meta gửi về sự kiện echo của chính tin đó, **Then** hệ thống nhận diện đây là echo của bot (khớp `outbox` hoặc khớp `app_id`), không chuyển phòng sang `'human'`, không làm gián đoạn luồng tự động của bot.
4. **Given** phòng đang ở trạng thái `'human'` sau khi nhân viên gõ tay, **When** cả nhân viên và khách im lặng quá khoảng lặng 2 giờ (`HUMAN_IDLE_MS`), **Then** phòng tự động chuyển về `'bot'` trong lần tương tác kế tiếp mà không gửi bất kỳ tin nhắn tự phát nào.

---

### User Story 3 — Định tuyến đa kênh thống nhất và kiểm thử hành vi chung (Priority: P2)

Là kỹ sư vận hành hệ thống, tôi muốn máy chủ bot tiếp nhận webhook từ nhiều kênh (Zalo Bot, Messenger, Zalo OA) qua một kiến trúc định tuyến rõ ràng, dùng chung một cửa gửi `core/gate.js` và vượt qua bộ kịch bản eval ứng xử chuẩn `eval/chung/`, để đảm bảo bot nhất quán trên mọi nền tảng.

- **Why this priority**: Đảm bảo hệ thống mở rộng đa kênh mà không làm phân mảnh logic nghiệp vụ, giữ vững nguyên tắc "Một cửa gửi" và "Bằng chứng thắng lời khai".
- **Independent Test**: Chạy `eval/run.mjs` với các kịch bản chung và kịch bản echo giả lập, kiểm tra định tuyến request từ các endpoint webhook khác nhau vào đúng hàng đợi `convId`.

**Acceptance Scenarios**:
1. **Given** các request đến từ đường dẫn `/webhook/messenger`, `/webhook/zalo-oa` và `/webhook/zalo-bot`, **When** máy chủ tiếp nhận, **Then** mỗi request được xác thực và phân tích bởi adapter kênh tương ứng, bền hoá vào `inbox`, và chạy qua hàng đợi `conv_id` riêng biệt (`fb:<psid>`, `oa:<uid>`, `u:<uid>`).
2. **Given** tin nhắn từ bất kỳ kênh nào, **When** bot trả lời, **Then** mọi phản hồi đều đi qua `core/gate.js`, tuân thủ giờ yên 23:00–07:00 VN, và được kiểm tra rò rỉ bí mật trước khi gửi.
3. **Given** bộ kịch bản eval chuẩn `eval/chung/`, **When** chạy kiểm thử trên adapter Messenger và Zalo OA, **Then** 100% kịch bản eval đạt yêu cầu.

---

## Edge Cases

1. **Meta Webhook gửi gộp nhiều messaging event trong một POST**:
   - Meta có thể gửi `entry[].messaging[]` chứa đồng thời cả tin nhắn của khách và tin echo của nhân viên trong một payload duy nhất.
   - *Cách xử lý*: Parser duyệt tuần tự từng event trong mảng `messaging`, sinh `Update` độc lập cho từng tin với `updateKey` duy nhất, bền hoá từng tin vào `inbox` theo thứ tự thời gian (`timestamp`).
2. **Độ trễ mạng giữa lúc Bot gửi API và lúc nhận Webhook Echo**:
   - Bot vừa gọi Meta Send API thành công nhưng bản ghi `outbox` vừa mới ghi nhận, vài mili-giây sau webhook echo đã dội về.
   - *Cách xử lý*: Thuật toán đối chiếu `outbox` kiểm tra theo cả `message_id` (mid do Meta trả về khi gọi Send API thành công) và cửa sổ thời gian gần nhất (30 giây) kèm nội dung chuẩn hóa.
3. **Nhân viên thu hồi tin nhắn trên Fanpage**:
   - Meta gửi sự kiện `message_unsend`.
   - *Cách xử lý*: Kênh ghi nhận sự kiện thu hồi vào `audit`, không làm crash bot, cập nhật trạng thái tin nhắn nếu cần.
4. **Khách hàng gửi file đính kèm dạng Sticker, Like to, Audio hoặc Vị trí**:
   - Meta gửi các attachment type khác ảnh (sticker, thumbsup, audio, location).
   - *Cách xử lý*: Parser chuẩn hóa về dạng văn bản đại diện `[nhãn dán]`, `[thoại] <url>`, `[vị trí]` tương tự như cách xử lý hiện tại của Zalo Bot, không để `text = null` làm crash handler.
5. **Request GET xác thực Webhook Meta bị quét bởi crawler lạ**:
   - *Cách xử lý*: Chỉ trả lời HTTP 200 kèm `hub.challenge` khi `hub.verify_token` khớp chính xác với `config.messengerVerifyToken` qua `safeEqual`. Mọi trường hợp khác trả HTTP 403.

---

## Requirements

### Functional Requirements

- **FR-001**: Hệ thống MUST hiện thực module `channels/messenger.js` tuân thủ đầy đủ hợp đồng `specs/001-nen-tang-chung/contracts/channel.md:1-25` với `name: 'messenger'`, `maxText: 2000`, `capabilities: { detectsHumanReplies: true }`.
- **FR-002**: Hệ thống MUST hiện thực module `channels/zalo-oa.js` tuân thủ đầy đủ hợp đồng `specs/001-nen-tang-chung/contracts/channel.md:1-25` với `name: 'zalo-oa'`, `maxText: 2000`, `capabilities: { detectsHumanReplies: true }`.
- **FR-003**: Hệ thống MUST xác thực chữ ký webhook Meta (`x-hub-signature-256`) và Zalo OA bằng crypto thuần (`safeEqual`, HMAC-SHA256) không timing leak và không phụ thuộc thư viện ngoài.
- **FR-004**: Hệ thống MUST hỗ trợ xác thực GET challenge của Meta Webhook (`hub.mode === 'subscribe'` và kiểm tra `hub.verify_token`).
- **FR-005**: Parser của adapter MUST chuẩn hóa payload thành cấu trúc `Update` thống nhất: `updateKey`, `event`, `chatId`, `userId`, `userName`, `text`, `photoUrl`, `messageId`, `raw`, kèm cờ `isEcho` (boolean) và `appId` (string|null).
- **FR-006**: Khi nhận `Update` có cờ `isEcho: true`, hệ thống MUST đối chiếu với bảng `outbox` của bot trong vòng 30 giây gần nhất:
  - Nếu khớp tin bot đã gửi (theo `message_id` hoặc nội dung + thời gian): bỏ qua (hoặc xác nhận trạng thái giao tin).
  - Nếu KHÔNG khớp: xác định là tin nhân viên gõ tay trực tiếp trên trang.
- **FR-007**: Khi phát hiện tin nhân viên gõ tay trực tiếp trên trang, hệ thống MUST:
  - Gọi `handoff.toHuman(convId, 'nhan-vien-go-tay', 'echo-detected')` để chuyển phòng sang `'human'`.
  - Ghi một bản ghi audit `state-change` với lý do `echo-detected`.
  - Ghi tin nhắn vào bảng `messages` với `speaker: 'nhan-vien'`, `speaker_id: 'page'`.
  - Gọi `handoff.touch(convId)` để đặt lại bộ đếm khoảng lặng 2 giờ.
  - Im hoàn toàn theo Điều II Hiến pháp (không gửi bất kỳ tin nào ra khách).
- **FR-008**: Khi phòng ở trạng thái `'human'`, bot MUST tuân thủ Điều II: im hoàn toàn, ghi nhận tin khách vào `messages`, không gọi mô hình AI, không gửi tin nhắn chen ngang.
- **FR-009**: Hệ thống MUST hỗ trợ định tuyến đa kênh trên `server.js` và `core/webhook.js` (qua URL endpoint riêng biệt như `/webhook/messenger`, `/webhook/zalo-oa`, `/webhook/zalo-bot` hoặc phân giải theo cấu hình), bền hoá vào `inbox` trước khi trả HTTP 200.
- **FR-010**: Hệ thống MUST cô lập định danh cuộc trò chuyện `conv_id` theo tiền tố kênh (ví dụ: `fb:<psid>` cho Messenger, `oa:<user_id>` cho Zalo OA, `u:<user_id>` cho Zalo Bot cá nhân) đảm bảo hàng đợi tuần tự và hồ sơ khách hàng không bị xung đột.

---

## Key Entities

- **ChannelAdapter**: Đối tượng adapter chuẩn theo `contracts/channel.md`, xuất khẩu các phương thức `name`, `maxText`, `capabilities`, `parse(raw)`, `sendText(chatId, text)`, `typing(chatId)`, `verifyWebhook(req)`.
- **ChannelUpdate**: Đối tượng chuẩn hóa biểu diễn sự kiện đến từ webhook, mở rộng với `isEcho` và `appId` để nhận diện phản chiếu từ trang.
- **OutboxRecord**: Bản ghi tin nhắn bot gửi đi trong bảng `outbox` của SQLite (`core/store/queue.js`), dùng làm căn cứ đối chiếu phát hiện người gõ tay.
- **HumanEchoDetector**: Cơ chế kiểm tra và đối chiếu sự kiện echo với các tin nhắn bot vừa gửi trong `outbox` để phát hiện nhân viên trả lời tay.
- **ChannelRouter**: Bộ định tuyến webhook đa kênh trên HTTP server, tiếp nhận request, gọi đúng adapter kênh để verify/parse, bền hoá vào `inbox` và đẩy vào hàng đợi `convId`.

---

## Success Criteria

- **SC-001**: 100% request webhook giả mạo (sai HMAC, sai verify token, thiếu chữ ký) bị từ chối với mã HTTP 403 Forbidden.
- **SC-002**: Trên kịch bản kiểm thử giả lập 50 tin nhắn nhân viên gõ tay trực tiếp trên Fanpage/Zalo OA: 100% được phát hiện chính xác, phòng chuyển sang `'human'`, bot gửi **0 tin nhắn chen ngang** (Điều II).
- **SC-003**: 0 trường hợp tin bot tự gửi qua `gate.send` bị nhận nhầm thành tin nhân viên gõ tay (0 false-positive handoff khi nhận sự kiện echo của bot).
- **SC-004**: Thời gian phản hồi webhook ack 200 sau khi bền hoá vào `inbox` đạt p95 < 200 ms trên 50 request đồng thời cho cả Messenger và Zalo OA.
- **SC-005**: 0 runtime dependency mới được thêm vào `package.json` (100% Node.js ≥ 22.13 thuần).
- **SC-006**: 100% test suite hiện có (855+ test) và toàn bộ 17/17 kịch bản eval hiện tại tiếp tục xanh mà không bị hồi quy.

---

## Assumptions

- Việc phát triển mã nguồn thực thi sẽ được chia nhỏ thành các task TDD độc lập `T501..T508` thực hiện trong các PR kế tiếp.
- Khách hàng trên Messenger được định danh duy nhất bằng PSID (Page-Scoped ID) theo chính sách của Meta Graph API.
- Doanh nghiệp đã đăng ký Meta App và Zalo OA App với quyền nhận webhook messaging và gửi tin nhắn (Send API / OpenAPI).
- Cấu hình môi trường bổ sung các biến: `MESSENGER_PAGE_TOKEN`, `MESSENGER_APP_SECRET`, `MESSENGER_VERIFY_TOKEN`, `ZALO_OA_TOKEN`, `ZALO_OA_SECRET`.

---

## Không làm (và lý do)

- **Không thêm thư viện Facebook/Zalo SDK bên ngoài**: Tuân thủ Điều VI Hiến pháp (đơn giản, không phụ thuộc). Thư viện ngoài làm phình bundle, khó kiểm soát rò rỉ dữ liệu và dễ gãy khi Node cập nhật.
- **Không nhúng bot vào chat nhóm trên Fanpage Messenger**: Messenger hiện chỉ hỗ trợ bot chat 1-1 giữa Page và User (PSID). Không phát sinh logic nhóm phức tạp như Zalo cá nhân.
- **Không tự động gửi tin nhắn chào mừng (proactive greeting) khi khách chưa nhắn**: Tuân thủ Điều II Hiến pháp ("Khách im thì máy im: không nhắc lại, không chăm sóc lại tự phát"). Bot chỉ phản hồi khi khách chủ động gửi tin trước.
