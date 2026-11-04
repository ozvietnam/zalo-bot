# Contract: Kênh (Channel adapter)

`channels/<ten>.js`. v1 chỉ có `zalo-bot` (chuyển từ `lib/zalo.js`). Kênh khác (Zalo OA, Messenger) dùng cùng contract ở spec 005.

```js
export function createChannel(opts) -> {
  name: 'zalo-bot',
  maxText: 2000,
  parse(raw) -> Update | null,                 // = parseUpdate() hiện tại, thêm updateKey
  sendText(chatId, text) -> Promise<void>,     // gửi MỘT phần (cửa đã chia sẵn)
  typing(chatId) -> Promise<void>,             // lỗi thì nuốt
  getMe() -> Promise<{ id, name }>,
  verifyWebhook(req) -> boolean,               // header x-bot-api-secret-token, so bằng safeEqual
  poll?(onUpdate) -> { stop() },               // chế độ polling
  capabilities: { detectsHumanReplies: false } // true khi kênh thấy được tin người gõ tay (Messenger)
}
```

`Update`: `{ updateKey, event, chatId, userId, userName, chatType, text, photoUrl, caption, messageId, raw }`.

Luật:
- Kênh không giữ trạng thái nghiệp vụ, không biết gì về gói.
- Lỗi ném ra là `Error` có `status`; nội dung lỗi không chứa token (giữ cách làm hiện tại của `lib/zalo.js`).
- `detectsHumanReplies = true` thì lõi tự chuyển phòng sang `human` khi thấy tin trang gửi mà không có trong `outbox`
  (đây đúng là luật "người đang trả lời thì bot im" anh Thắng chốt 08/10/2026).
