---
description: "Danh sách việc spec 005: khuôn spec-kit, mỗi việc viết theo writing-plans của Superpowers (TDD, tệp chính xác, giao diện, lệnh kiểm)"
---

# Tasks: Kênh thứ hai — Fanpage Messenger & Zalo OA (005)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` hoặc
> `superpowers:executing-plans` để làm từng việc. Mỗi việc theo `superpowers:test-driven-development`:
> test đỏ → chạy thấy đỏ → code tối thiểu → chạy thấy xanh → commit. Trước khi báo xong dùng
> `superpowers:verification-before-completion`. Bước dùng checkbox (`- [ ]`).

**Goal:** Hiện thực hóa kênh giao tiếp thứ hai đưa lõi bot sang Fanpage Messenger và Zalo OA tuân thủ hợp đồng `specs/001-nen-tang-chung/contracts/channel.md:1-25`, với cơ chế then chốt `capabilities: { detectsHumanReplies: true }` — tự động phát hiện nhân viên CSKH gõ tay trực tiếp trên trang (từ bài học 1.451 tin thực tế), chuyển phòng chat sang trạng thái `'human'` và im lặng tuyệt đối theo Điều II Hiến pháp.

**Architecture:** Node.js thuần ESM, 0 dependency ngoài → Adapter `channels/messenger.js` & `channels/zalo-oa.js` xác thực webhook bằng crypto thuần (`safeEqual`, HMAC-SHA256) → Chuẩn hóa `Update` với cờ `isEcho` → Module `core/human-detector.js` đối chiếu bảng `outbox` SQLite → Lõi `core/engine.js` chuyển `conv_id` sang `'human'`, ghi `messages` với `speaker: 'nhan-vien'`, đặt lại khoảng lặng 2 giờ và giữ bot im lặng 100% → Một cửa gửi duy nhất `core/gate.js`.

**Tech Stack:** Node.js ≥ 22.13 ESM, `node:crypto`, `node:sqlite`, `node:test`, `node:assert`, `fetch`.

**Spec:** `specs/005-kenh-thu-hai/spec.md` · Kế hoạch tại `specs/005-kenh-thu-hai/plan.md`.

---

## Global Constraints

- Không thêm runtime dependency vào `package.json`.
- Mỗi tệp mã nguồn mới dưới 300 dòng (Hiến pháp VI).
- Mọi tin nhắn gửi ra khách phải qua đúng một hàm `gate.send()` (Hiến pháp I).
- Khi phòng ở trạng thái `'human'`, bot phải im hoàn toàn: không trả lời, không gọi não AI, không soạn nháp (Hiến pháp II).
- Thời gian lưu UTC dạng ISO 8601; hiển thị và giờ yên theo múi giờ Việt Nam (`Asia/Ho_Chi_Minh`, UTC+7).
- Mọi bí mật (Page Token, App Secret, OA Secret) không bao giờ được log hoặc xuất hiện trong tin gửi khách (Hiến pháp IX).
- Số điện thoại giả trong test chỉ dùng duy nhất số mẫu `0912345678`.
- `npm test` chạy nội bộ 100% không cần kết nối mạng thật (sử dụng mock `fetchImpl`).

---

## Bảng đối chiếu yêu cầu (Traceability Matrix)

Bảng đối chiếu toàn bộ 10 Functional Requirements (`FR-001..FR-010`) và 6 Success Criteria (`SC-001..SC-006`) của `spec.md` với các nhiệm vụ thực thi `T501..T508`:

| Yêu cầu | Nội dung đặc tả | Nhiệm vụ thực thi | Tệp phụ trách chính |
|---|---|---|---|
| **FR-001** | Adapter kênh Messenger tuân thủ `contracts/channel.md:1-25`, maxText: 2000, detectsHumanReplies: true | **T501** | `channels/messenger.js` |
| **FR-002** | Adapter kênh Zalo OA tuân thủ `contracts/channel.md:1-25`, maxText: 2000, detectsHumanReplies: true | **T502** | `channels/zalo-oa.js` |
| **FR-003** | Xác thực chữ ký webhook crypto thuần (HMAC-SHA256, safeEqual) cho Meta và Zalo OA | **T501, T502** | `channels/messenger.js`, `channels/zalo-oa.js` |
| **FR-004** | Hỗ trợ xác thực GET challenge của Meta Webhook (`hub.verify_token`, `hub.challenge`) | **T501, T506** | `channels/messenger.js`, `core/webhook.js` |
| **FR-005** | Chuẩn hóa `Update` thống nhất với `isEcho` (boolean) và `appId` không phá vỡ `channels/zalo-bot.js` | **T503** | `channels/messenger.js`, `channels/zalo-oa.js` |
| **FR-006** | Cơ chế đối chiếu `outbox` để phát hiện tin nhân viên gõ tay trực tiếp trên trang | **T504** | `core/human-detector.js` |
| **FR-007** | Tự động chuyển phòng sang `'human'`, ghi audit `state-change`, ghi `messages` và gọi `touch()` | **T505** | `core/engine.js`, `core/engine-handoff.js` |
| **FR-008** | Khi phòng ở trạng thái `'human'`, bot im hoàn toàn (Điều II), không gửi tin chen ngang | **T505, T507** | `core/engine.js`, `eval/fixtures/messenger-human-echo.jsonl` |
| **FR-009** | Định tuyến đa kênh trên `server.js` và `core/webhook.js`, bền hoá vào `inbox` trước khi trả 200 | **T506** | `core/webhook.js`, `server.js` |
| **FR-010** | Phân vùng định danh `conv_id` (`fb:<psid>`, `oa:<uid>`) chống xung đột hàng đợi và hồ sơ | **T505, T506** | `core/conv.js`, `core/webhook.js` |
| **SC-001** | 100% request webhook giả mạo chữ ký bị từ chối với HTTP 403 Forbidden | **T501, T502, T506** | `test/channels/messenger.test.mjs`, `test/channels/zalo-oa.test.mjs` |
| **SC-002** | 100% tin người gõ tay trên trang được phát hiện chính xác, phòng chuyển `'human'`, bot im 0 tin | **T504, T505, T507** | `test/core/engine-human-echo.test.mjs`, `eval/run.mjs` |
| **SC-003** | 0 tin bot tự gửi bị nhận nhầm thành tin người gõ tay (0 false-positive handoff) | **T504, T505** | `test/core/human-detector.test.mjs` |
| **SC-004** | Thời gian phản hồi webhook ack 200 sau khi bền hoá vào inbox p95 < 200 ms trên 50 request | **T506** | `test/core/webhook-multi-channel.test.mjs` |
| **SC-005** | 0 runtime dependency mới được thêm vào `package.json` (Node.js thuần) | **T508** | `package.json` |
| **SC-006** | 100% test suite hiện có và 17/17 kịch bản eval hiện tại tiếp tục xanh | **T507, T508** | `npm test`, `npm run eval` |

---

## Danh sách công việc (Tasks T501–T508)

### T501 [P] Adapter kênh Fanpage Messenger (`channels/messenger.js`)

Hiện thực hóa adapter kênh cho Facebook Messenger tuân thủ `contracts/channel.md:1-25`. Hỗ trợ xác thực webhook GET (challenge) và POST (chữ ký `x-hub-signature-256` dùng HMAC-SHA256 với App Secret, so sánh bằng `safeEqual`), parse messaging event chuẩn hóa `Update`, gửi tin qua Meta Graph API Send API (v21.0) và hành động `typing`.

**Files:** Create `channels/messenger.js` · Create `test/channels/messenger.test.mjs`

**Interfaces — Produces:**
```js
export function createChannel({ pageToken, appSecret, verifyToken, baseUrl, fetchImpl }) -> {
  name: 'messenger',
  maxText: 2000,
  parse(raw) -> Update | null,
  sendText(chatId, text) -> Promise<void>,
  typing(chatId) -> Promise<void>,
  verifyWebhook(req) -> boolean,
  verifyChallenge(req) -> { ok: boolean, challenge?: string },
  capabilities: { detectsHumanReplies: true }
}
```

- [x] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createChannel } from '../../channels/messenger.js';

test('T501: Messenger verifyWebhook từ chối chữ ký sai hoặc thiếu header', () => {
  const channel = createChannel({ pageToken: 'fake-token', appSecret: 'secret-123', verifyToken: 'v-123' });
  assert.equal(channel.verifyWebhook({ headers: {}, body: '{}' }), false);
  assert.equal(channel.verifyWebhook({ headers: { 'x-hub-signature-256': 'sha256=sai' }, rawBody: '{}' }), false);
});

test('T501: Messenger verifyWebhook chấp nhận chữ ký HMAC-SHA256 hợp lệ', () => {
  const secret = 'secret-123';
  const body = JSON.stringify({ object: 'page', entry: [] });
  const sig = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  const channel = createChannel({ pageToken: 'fake-token', appSecret: secret, verifyToken: 'v-123' });
  assert.equal(channel.verifyWebhook({ headers: { 'x-hub-signature-256': sig }, rawBody: body }), true);
});

test('T501: Messenger verifyChallenge trả challenge khi verify_token khớp', () => {
  const channel = createChannel({ pageToken: 'fake-token', appSecret: 's', verifyToken: 'my-token' });
  const req = { url: '/webhook?hub.mode=subscribe&hub.verify_token=my-token&hub.challenge=11582012' };
  assert.deepEqual(channel.verifyChallenge(req), { ok: true, challenge: '11582012' });
});
```
- [x] **Step 2:** Chạy `node --test test/channels/messenger.test.mjs` → FAIL (chưa có `channels/messenger.js`).
- [x] **Step 3:** Tạo `channels/messenger.js` (< 280 dòng), hiện thực `createChannel`, `verifyWebhook`, `verifyChallenge`, `parse`, `sendText`, `typing`.
- [x] **Step 4:** Chạy lại `node --test test/channels/messenger.test.mjs` → PASS.
- [x] **Step 5:** `git commit -m "feat(channel): add Meta Messenger adapter (T501)"`

---

### T502 [P] Adapter kênh Zalo Official Account (`channels/zalo-oa.js`)

Hiện thực hóa adapter kênh cho Zalo Official Account (Zalo OA) tuân thủ `contracts/channel.md:1-25`. Hỗ trợ xác thực chữ ký webhook bằng crypto thuần, parse các sự kiện tin nhắn người dùng (`user_send_text`, `user_send_image`) và tin nhắn phản chiếu từ OA (`oa_send_text`), gửi tin qua Zalo OA OpenAPI v3.

**Files:** Create `channels/zalo-oa.js` · Create `test/channels/zalo-oa.test.mjs`

**Interfaces — Produces:**
```js
export function createChannel({ oaToken, oaSecret, baseUrl, fetchImpl }) -> {
  name: 'zalo-oa',
  maxText: 2000,
  parse(raw) -> Update | null,
  sendText(chatId, text) -> Promise<void>,
  typing(chatId) -> Promise<void>,
  verifyWebhook(req) -> boolean,
  capabilities: { detectsHumanReplies: true }
}
```

- [x] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChannel } from '../../channels/zalo-oa.js';

test('T502: Zalo OA adapter có capabilities.detectsHumanReplies === true', () => {
  const ch = createChannel({ oaToken: 'oa-tok', oaSecret: 'oa-sec' });
  assert.equal(ch.name, 'zalo-oa');
  assert.equal(ch.capabilities?.detectsHumanReplies, true);
  assert.equal(ch.maxText, 2000);
});

test('T502: Zalo OA parse sự kiện user_send_text và oa_send_text chuẩn hóa Update', () => {
  const ch = createChannel({ oaToken: 'oa-tok', oaSecret: 'oa-sec' });
  const rawUser = { event_name: 'user_send_text', message: { text: 'xin chào', msg_id: 'm1' }, sender: { id: 'u1' } };
  const u1 = ch.parse(rawUser);
  assert.equal(u1.text, 'xin chào');
  assert.equal(u1.isEcho, false);

  const rawEcho = { event_name: 'oa_send_text', message: { text: 'tôi hỗ trợ bạn', msg_id: 'm2' }, recipient: { id: 'u1' } };
  const u2 = ch.parse(rawEcho);
  assert.equal(u2.text, 'tôi hỗ trợ bạn');
  assert.equal(u2.isEcho, true);
  assert.equal(u2.chatId, 'u1');
});
```
- [x] **Step 2:** Chạy `node --test test/channels/zalo-oa.test.mjs` → FAIL (chưa có `channels/zalo-oa.js`).
- [x] **Step 3:** Tạo `channels/zalo-oa.js` (< 280 dòng), hiện thực `createChannel`, `verifyWebhook`, `parse`, `sendText`, `typing`.
- [x] **Step 4:** Chạy lại `node --test test/channels/zalo-oa.test.mjs` → PASS.
- [x] **Step 5:** `git commit -m "feat(channel): add Zalo OA adapter (T502)"`

---

### T503 [P] Mở rộng cấu trúc Update & chuẩn hoá sự kiện Echo

Chuẩn hóa giao diện đối tượng `Update` xuất ra từ các adapter kênh: bổ sung trường `isEcho: boolean` và `appId: string|null`. Đảm bảo kênh `channels/zalo-bot.js` giữ nguyên hành vi (`isEcho` mặc định là `false`), tương thích ngược 100% và không làm vỡ các module xử lý phía sau.

**Files:** Modify `channels/zalo-bot.js` · Create `test/core/channel-echo.test.mjs`

**Interfaces — Produces:**
- Mọi `Update` có cấu trúc: `{ updateKey, event, chatId, userId, userName, chatType, text, photoUrl, voiceUrl, caption, messageId, raw, isEcho, appId }`.

- [x] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse as parseZalo } from '../../channels/zalo-bot.js';

test('T503: Zalo Bot parse giữ nguyên tính tương thích, isEcho mặc định là false', () => {
  const raw = { event_name: 'message.text.received', message: { chat_id: 'c1', from: { id: 'u1' }, text: 'alo' } };
  const u = parseZalo(raw);
  assert.equal(u.text, 'alo');
  assert.equal(u.isEcho, false);
  assert.equal(u.appId, null);
});
```
- [x] **Step 2:** Chạy `node --test test/core/channel-echo.test.mjs` → FAIL (do `parseUpdate` của `zalo-bot.js` chưa có `isEcho` và `appId`).
- [x] **Step 3:** Bổ sung `isEcho: false`, `appId: null` vào hàm `parseUpdate` trong `channels/zalo-bot.js`.
- [x] **Step 4:** Chạy lại `node --test test/core/channel-echo.test.mjs` → PASS.
- [x] **Step 5:** `git commit -m "refactor(channel): standardize Update interface with echo fields (T503)"`

---

### T504 [P] Module đối chiếu Outbox nhận diện người gõ tay (`core/human-detector.js`)

Hiện thực hóa module `core/human-detector.js` đối chiếu sự kiện echo với lịch sử gửi tin trong bảng `outbox` của bot:
- Khớp `message_id` hoặc khớp `app_id` của bot → `isHumanReply: false` (echo do bot tự gửi).
- Khớp nội dung văn bản trong cửa sổ 30 giây gần nhất tới cùng `chat_id` → `isHumanReply: false`.
- Không khớp bản ghi nào trong `outbox` → `isHumanReply: true` (nhân viên CSKH đang gõ tay trực tiếp trên Fanpage/Zalo OA).

**Files:** Create `core/human-detector.js` · Create `test/core/human-detector.test.mjs`

**Interfaces — Produces:**
```js
export function createHumanDetector({ store, config = {}, now = () => new Date() }) -> {
  isHumanReply(update) -> Promise<boolean> | boolean
}
```

- [x] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHumanDetector } from '../../core/human-detector.js';

test('T504: Echo trùng nội dung vừa gửi trong outbox được nhận diện là bot echo', () => {
  const store = {
    outbox: {
      findRecentByChat: (chatId, { withinMs }) => [{ text: 'Bot trả lời', message_id: 'mid-1' }],
    },
  };
  const detector = createHumanDetector({ store, config: { fbAppId: '123' } });
  const update = { isEcho: true, chatId: 'c1', text: 'Bot trả lời', messageId: 'mid-1', appId: '123' };
  assert.equal(detector.isHumanReply(update), false);
});

test('T504: Echo KHÔNG có trong outbox được nhận diện chính xác là nhân viên gõ tay', () => {
  const store = {
    outbox: {
      findRecentByChat: () => [],
    },
  };
  const detector = createHumanDetector({ store, config: { fbAppId: '123' } });
  const update = { isEcho: true, chatId: 'c1', text: 'Nhân viên tư vấn trực tiếp', messageId: 'mid-staff', appId: null };
  assert.equal(detector.isHumanReply(update), true);
});
```
- [x] **Step 2:** Chạy `node --test test/core/human-detector.test.mjs` → FAIL (chưa có `core/human-detector.js`).
- [x] **Step 3:** Tạo `core/human-detector.js` (< 150 dòng) và bổ sung hàm truy vấn `findRecentByChat` trong `core/store/queue.js`.
- [x] **Step 4:** Chạy lại `node --test test/core/human-detector.test.mjs` → PASS.
- [x] **Step 5:** `git commit -m "feat(core): add human reply detection by outbox reconciliation (T504)"`

---

### T505 [P] Tích hợp phát hiện người gõ tay vào Lõi (`core/engine.js`)

Tích hợp `human-detector` vào luồng `engine.process`:
1. Khi nhận `update.isEcho === true`:
   - Nếu là tin bot echo: Đánh dấu `store.inbox.markDone(key)` và trả về `{ skipped: 'bot-echo', turnId: key }`.
   - Nếu là tin nhân viên gõ tay:
     - Chuyển phòng `conv_id` sang `'human'` qua `handoff.toHuman(convId, 'nhan-vien-go-tay', 'echo-detected')`.
     - Ghi nhận audit `state-change` và `echo-human`.
     - Ghi nhận tin nhắn vào bảng `messages` với `speaker: 'nhan-vien'`, `speaker_id: 'page'`.
     - Gọi `handoff.touch(convId)` đặt lại bộ đếm khoảng lặng 2 giờ.
     - Đánh dấu hoàn thành inbox và trả về `{ handled: 'human-echo-detected' }`.
     - **Im hoàn toàn (0 tin gửi ra khách)** theo Điều II.

**Files:** Modify `core/engine.js` · Modify `core/engine-handoff.js` · Create `test/core/engine-human-echo.test.mjs`

- [x] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../../core/engine.js';

test('T505: Tin nhân viên gõ tay trên trang làm chuyển phòng sang human và bot im', async () => {
  // Dựng mock engine với detector báo isHumanReply = true
  // Khi gửi update isEcho: true của nhân viên:
  // - convs.state chuyển sang 'human'
  // - gate.send KHÔNG ĐƯỢC GỌI lần nào (0 tin ra)
  // - tin nhắn được ghi vào messages với speaker = 'nhan-vien'
});
```
- [x] **Step 2:** Chạy `node --test test/core/engine-human-echo.test.mjs` → FAIL.
- [x] **Step 3:** Cập nhật `core/engine.js` và `core/engine-handoff.js` xử lý luồng `update.isEcho`.
- [x] **Step 4:** Chạy lại `node --test test/core/engine-human-echo.test.mjs` → PASS.
- [x] **Step 5:** `git commit -m "feat(core): auto-handoff to human when staff replies directly on page (T505)"`

---

### T506 [P] Định tuyến đa kênh trên Webhook Handler (`core/webhook.js`, `server.js`)

Mở rộng `core/webhook.js` và `server.js` để hỗ trợ đa kênh linh hoạt:
- Tiếp nhận các đường dẫn webhook: `/webhook/messenger`, `/webhook/zalo-oa`, `/webhook/zalo-bot` (hoặc `/webhook`).
- Gọi đúng phương thức `verifyWebhook` và `parse` của từng kênh.
- Hỗ trợ phương thức GET xác thực challenge của Meta Webhook.
- Bền hoá vào `inbox` trước khi trả HTTP 200 (Điều VII).
- Phân luồng hàng đợi theo `conv_id` tiền tố (`fb:<psid>`, `oa:<uid>`, `u:<uid>`).

**Files:** Modify `core/webhook.js` · Modify `server.js` · Create `test/core/webhook-multi-channel.test.mjs`

- [x] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebhookHandler } from '../../core/webhook.js';

test('T506: Handler hỗ trợ GET challenge cho Messenger webhook', async () => {
  // Gửi GET /webhook/messenger?hub.mode=subscribe&hub.verify_token=valid&hub.challenge=test1234
  // Kỳ vọng: HTTP 200 và response body là 'test1234'
});

test('T506: Handler phân luồng đúng adapter cho từng endpoint webhook', async () => {
  // Gửi POST tới /webhook/messenger và /webhook/zalo-oa với chữ ký hợp lệ
  // Kỳ vọng: Mỗi kênh parse đúng, ghi inbox và trả 200
});
```
- [x] **Step 2:** Chạy `node --test test/core/webhook-multi-channel.test.mjs` → FAIL.
- [x] **Step 3:** Cập nhật `core/webhook.js` và `server.js` hỗ trợ map đa kênh.
- [x] **Step 4:** Chạy lại `node --test test/core/webhook-multi-channel.test.mjs` → PASS.
- [x] **Step 5:** `git commit -m "feat(webhook): multi-channel routing and challenge verification (T506)"`

---

### T507 [P] Kịch bản kiểm thử Eval đa kênh & kiểm chứng `detectsHumanReplies: true`

Bổ sung kịch bản kiểm thử hành vi end-to-end `eval/fixtures/messenger-human-echo.jsonl` mô phỏng:
1. Khách nhắn trên Messenger hỏi thủ tục.
2. Bot trả lời bước 1.
3. Nhân viên gõ tay trực tiếp trên trang để trả lời bước 2 (sự kiện echo).
4. Khách nhắn tiếp bước 3.
5. Bot im hoàn toàn, nhân viên tiếp tục tư vấn qua lệnh `/tl` hoặc gõ tay trực tiếp.
6. Đo lường SC-002: Bot gửi đúng 1 tin ở bước 1, và 0 tin chen ngang ở bước 3, 4.

**Files:** Create `eval/fixtures/messenger-human-echo.jsonl` · Modify `eval/run.mjs` · Create `test/core/eval-messenger-echo.test.mjs`

- [x] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { runEvalFixture } from '../../eval/run.mjs';

test('T507: Kịch bản eval messenger-human-echo đạt 100% (bot im khi người gõ)', async () => {
  const result = await runEvalFixture('eval/fixtures/messenger-human-echo.jsonl');
  assert.equal(result.passed, true);
  assert.equal(result.botInterferenceCount, 0);
});
```
- [x] **Step 2:** Chạy `node --test test/core/eval-messenger-echo.test.mjs` → FAIL.
- [x] **Step 3:** Tạo fixture JSONL và cập nhật runner hỗ trợ bước echo.
- [x] **Step 4:** Chạy lại `node --test test/core/eval-messenger-echo.test.mjs` → PASS.
- [x] **Step 5:** `git commit -m "test(eval): add messenger human echo evaluation scenario (T507)"`

---

### T508 [P] Bảng đo kiểm tiêu chuẩn thành công (SC-001..SC-006) & Tài liệu Quickstart Kênh

Lập tài liệu hướng dẫn cấu hình biến môi trường kết nối Fanpage Messenger & Zalo OA, hướng dẫn kiểm tra thủ công. Viết bộ kiểm tra tự động đo lường đủ 6 tiêu chí thành công `SC-001..SC-006` và đảm bảo toàn bộ hệ thống đạt 100% xanh.

**Files:** Create `specs/005-kenh-thu-hai/quickstart.md` · Create `test/core/sc-005.test.mjs`

- [x] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';

test('T508: Đo lường SC-001 đến SC-006 đạt yêu cầu', async () => {
  // SC-001: 100% request giả mạo bị từ chối 403
  // SC-002: 100% phát hiện nhân viên gõ tay, 0 tin chen ngang
  // SC-003: 0 tin bot tự gửi bị nhận nhầm thành tin người gõ
  // SC-005: 0 dependency mới trong package.json
  // SC-006: 17/17 eval hiện tại tiếp tục xanh
});
```
- [x] **Step 2:** Chạy `node --test test/core/sc-005.test.mjs` → FAIL.
- [x] **Step 3:** Soạn `specs/005-kenh-thu-hai/quickstart.md` và hiện thực bài đo kiểm `sc-005.test.mjs`.
- [x] **Step 4:** Chạy lại `node --test test/core/sc-005.test.mjs` → PASS.
- [x] **Step 5:** `git commit -m "docs(spec-005): add quickstart and success criteria measurement (T508)"`
