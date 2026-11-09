# Hướng dẫn nhanh (Quickstart) — Kênh thứ hai (Fanpage Messenger & Zalo OA)

> Tài liệu hướng dẫn thiết lập, cấu hình và kiểm thử kênh Fanpage Messenger và Zalo OA cho OZ Zalo Bot (Spec 005).

---

## 1. Cấu hình biến môi trường

Khai báo các biến môi trường sau trong tệp cấu hình `.env` (hoặc biến môi trường của container):

```bash
# Kênh Fanpage Messenger
MESSENGER_PAGE_TOKEN="EAA..."             # Page Access Token từ Meta for Developers
MESSENGER_APP_SECRET="sk-gia-loi-goc"      # App Secret để xác thực HMAC-SHA256 (x-hub-signature-256)
MESSENGER_VERIFY_TOKEN="verify_token_123"  # Chuỗi bí mật cho Meta Webhook GET challenge
FB_APP_ID="123456789012345"                # Meta App ID của bot để nhận diện echo của chính bot (SC-003)

# Kênh Zalo Official Account (OA)
ZALO_OA_TOKEN="oa_access_token_..."       # Access Token gọi Zalo OA OpenAPI
ZALO_OA_SECRET="oa_secret_key_..."         # Secret Key để kiểm tra MAC hoặc secret token
ZALO_OA_APP_ID="987654321098765"           # Zalo OA App ID để nhận diện echo của chính bot
```

---

## 2. Cấu hình Webhook trên trang quản trị

### Meta for Developers (Facebook Fanpage Messenger)
1. Truy cập ứng dụng Meta > **Messenger** > **Cài đặt** > **Webhook**.
2. **URL gọi lại (Callback URL)**: `https://<ten-mien-bot>/webhook/messenger`.
3. **Mã xác minh (Verify Token)**: Điền đúng giá trị `MESSENGER_VERIFY_TOKEN`.
4. Nhấn **Xác minh và lưu**: Meta sẽ gửi một request `GET /webhook/messenger?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`. Handler sẽ tự động kiểm tra token và trả lại `hub.challenge` với mã HTTP 200.
5. Đăng ký các trường sự kiện: `messages`, `messaging_postbacks`, `message_echoes`.

### Zalo OA Developers
1. Truy cập trang quản trị ứng dụng Zalo > **Webhook**.
2. **Webhook URL**: `https://<ten-mien-bot>/webhook/zalo-oa`.
3. Điền Secret Key tương ứng với `ZALO_OA_SECRET`.
4. Đăng ký nhận các sự kiện: `user_send_text`, `user_send_image`, `oa_send_text`.

---

## 3. Kiểm thử thủ công từng bước

### Bước 1: Kiểm tra GET Challenge xác thực Meta Webhook
```bash
curl -i -X GET "http://localhost:3000/webhook/messenger?hub.mode=subscribe&hub.verify_token=verify_token_123&hub.challenge=test_challenge_123"
```
- **Kỳ vọng**: HTTP 200 OK, thân phản hồi trả về đúng chuỗi text `test_challenge_123`.

### Bước 2: Kiểm tra từ chối yêu cầu giả mạo (SC-001)
```bash
curl -i -X POST "http://localhost:3000/webhook/messenger" \
  -H "Content-Type: application/json" \
  -d '{"object":"page","entry":[]}'
```
- **Kỳ vọng**: HTTP 403 Forbidden do thiếu chữ ký `x-hub-signature-256`.

### Bước 3: Kiểm tra nhân viên gõ tay trực tiếp trên trang (Điều II & SC-002)
1. Khách hàng gửi tin nhắn tới Fanpage hỏi thủ tục nhập khẩu: Bot trả lời bình thường.
2. Nhân viên CSKH dùng tài khoản Page trên Meta Business Suite hoặc Zalo OA gõ tay trả lời khách:
   - Webhook nhận sự kiện echo (`isEcho: true`).
   - `core/human-detector.js` đối chiếu thấy không có trong `outbox` và không khớp `appId` của bot -> Xác định là nhân viên gõ tay.
   - Phòng chuyển sang trạng thái `'human'`.
   - Ghi bản ghi audit `state-change` và `echo-human`.
   - Ghi tin nhắn vào bảng `messages` với `speaker = 'nhan-vien'`, `speaker_id = 'page'`.
   - Bot im hoàn toàn (0 tin gửi ra khách).
3. Khách nhắn tiếp các câu tiếp theo: Bot tiếp tục im hoàn toàn theo Điều II.
4. Sau 2 giờ không có tương tác mới, phòng tự động trở về trạng thái `'bot'`.

---

## 4. Chạy kiểm thử tự động

```bash
# Kiểm thử đơn vị kênh Messenger & Zalo OA
node --test test/core/channel-messenger.test.mjs
node --test test/core/channel-zalo-oa.test.mjs

# Kiểm thử phát hiện người gõ tay trong Lõi
node --test test/core/engine-human-echo.test.mjs

# Kiểm thử định tuyến webhook đa kênh
node --test test/core/webhook-multi-channel.test.mjs

# Kiểm thử kịch bản eval echo Messenger
node --test test/core/eval-messenger-echo.test.mjs

# Đo lường 6 tiêu chí thành công SC-001..SC-006
node --test test/core/sc-005.test.mjs
```
