# zalo-hs-bot — Bot Zalo tra cứu hải quan OZ

Bot Zalo (Zalo Bot Platform chính thức) nối với **Cổng OZ** qua MCP (`https://mcp.uythacnhapkhau.com/mcp`).
Bot tự đọc danh sách công cụ của Cổng (`tools/list`), nên Cổng thêm tính năng mới thì bot dùng được mà không cần sửa phần kết nối.
Yêu cầu hệ thống: **Node >= 22.13**, ESM thuần, không phụ thuộc thư viện ngoài (`node:sqlite`, `node:test`).

📚 **Wiki tri thức của repo**: [docs/wiki/index.md](docs/wiki/index.md) — kiến trúc, luồng tin nhắn, gói nghiệp vụ, não AI, an toàn, tiến độ thật.

---

## Kiến trúc: Mô hình Lõi / Gói / Kênh

Hệ thống được thiết kế phân tầng rõ ràng nhằm bảo đảm an toàn dữ liệu và tính mở rộng:

```
[ Khách Zalo ]  <--->  [ Kênh channels/ ]  <--->  [ Lõi core/engine.js ]
                                                        |
                              +-------------------------+-------------------------+
                              |                         |                         |
                    [ Router registry.js ]     [ Người cầm phòng handoff ]   [ Hồ sơ khách customers ]
                              |
                    [ Gói packs/hs/, echo/ ]
                              |
                              v
                    [ CỬA GỬI DUY NHẤT core/gate.js ]  ---> [ Kênh channels/zalo-bot.js ]
                              |
                      (Audit / Outbox / Store)
```

1. **Lớp Kênh (`channels/`)**:
   - Nhận sự kiện từ Zalo Bot Platform (`channels/zalo-bot.js`), chuẩn hoá payload thành đối tượng `Update` dùng chung.
   - Tách biệt hoàn toàn giao thức mạng với logic nghiệp vụ.
2. **Lớp Lõi (`core/`)**:
   - **Bền hoá webhook trước khi phản hồi**: `core/webhook.js` ghi nhận update vào bảng `inbox` SQLite rồi mới trả HTTP 200 cho Zalo, tránh mất tin khi có sự cố.
   - **Hàng đợi theo người (`core/queue.js`, `core/conv.js`)**: Tuần tự hoá xử lý theo `conv_id` (từng người một, kể cả trong nhóm đông người) để tránh tranh chấp trạng thái.
   - **Điều phối (`core/engine.js`)**: Quản lý vòng đời lượt xử lý, nạp hồ sơ khách (`core/customers.js`), kiểm tra trạng thái phòng (`core/handoff.js`), xử lý ý định xin gặp người (`core/intents.js`), và gọi router chọn gói.
   - **Định tuyến gói (`core/registry.js`)**: Tự động nạp các gói nghiệp vụ trong thư mục `packs/`, chọn gói xử lý dựa trên độ ưu tiên (`priority`), phạm vi đối tượng (`audience`: `'public'` hoặc `'staff'`) và hàm khớp lệnh `match(turn)`.
   - **Một cửa gửi duy nhất (`core/gate.js`)**: **Mọi** tin nhắn bot gửi ra ngoài bắt buộc phải đi qua `gate.send()`. Không một tệp nghiệp vụ hay gói nào được gọi trực tiếp `channel.sendText()`. Cửa gửi thi hành nghiêm ngặt:
     - Luật giờ yên: Không nhắn tin chủ động từ 23:00 đến 07:00 giờ VN (`core/gate-decide.js`).
     - Trần hạn mức tin nhắn ngày: `CAP_CHAT_DAY` (cho phòng 1-1), `CAP_GROUP_DAY` (cho nhóm) và `CAP_ALL_DAY` (toàn hệ thống).
     - Chống gửi trùng lặp nội dung (`core/gate-decide.js`): Cửa sổ 60 giây cho câu trả lời trực tiếp, 15 phút cho tin chủ động.
     - Lưới an toàn dữ liệu: Che bí mật và số điện thoại (`core/redact.js`, `core/sdt.js`), kiểm tra căn cứ số tiền (`evidence`).
     - Ghi nhận sổ cái: Bền hoá vào `outbox`, `messages`, và nhật ký kiểm toán `audit`.
   - **Khôi phục tự động & Việc nền (`core/jobs.js`, `gate.recover()`, `engine.recover()`)**: Khi khởi động lại, hệ thống tự động hoàn tất các tin nhắn dở dang và thăm dò kết quả việc nền từ Cổng OZ.
   - **Giám sát vận hành (`core/ops.js`)**: Cung cấp endpoint `/health` (kiểm tra trạng thái SQLite, Cổng OZ, Zalo), `/metrics` (đo lường lượt xử lý, tỷ lệ quyết định cửa gửi, số phiếu mở) và bản tin gộp định kỳ 08:00 và 17:00 giờ VN gửi nhóm nhân viên.
3. **Lớp Gói (`packs/`)**:
   - Chứa logic nghiệp vụ độc lập, đọc dữ liệu ngữ cảnh từ `ctx`, gọi công cụ Cổng OZ và trả về kết quả (danh sách tin nhắn, việc nền hoặc yêu cầu chuyển người). Gói không tự ý gửi tin ra kênh.

---

## Các gói nghiệp vụ hải quan (`packs/hs/`)

Cuối mỗi tin trả lời luôn có dòng menu gói; gõ số để chuyển gói, `menu` để xem chi tiết, `0` để bot tự chọn.

| Số | Gói | Công cụ Cổng OZ | Người dùng gửi |
|---|---|---|---|
| 1 | 🔎 Phân loại mã HS | `phan_loai_hs` → `ket_qua_phan_loai` (chạy nền) | mô tả hàng (tên, chất liệu, công dụng, thông số) |
| 2 | 💰 Thuế & thủ tục nhập khẩu | `tra_thue` + `tra_thu_tuc_nhap_khau`; `tim_ma_hs` khi gõ tên hàng | mã HS [+ nước] |
| 3 | 📝 Viết mô tả khai báo | `sinh_mo_ta_khai_bao` (dùng lại mã + mã lượt của gói 1) | mã HS + tên hàng + thương hiệu, model… |
| 4 | ✅ Kiểm tra mô tả / tờ khai | `soat_to_khai` (miễn phí); `kiem_ma_to_khai` → `ket_qua_soat` khi "Kiểm sâu: có" | mã HS + mô tả + xuất xứ |
| 5 | ⚖️ Pháp luật hải quan | `tra_hieu_luc_van_ban`, `tra_chu_giai`, `tra_tien_le` | số hiệu văn bản / mã HS / mô tả |
| 6 | ®️ Sở hữu trí tuệ | `kiem_tra_shtt` | nhãn hiệu [+ mã HS, xuất xứ] |
| 7 | 📄 Hồ sơ giải trình mã HS | `soan_ho_so_giai_trinh` | mã đã khai, mã HQ áp, mô tả, lý do HQ |

- Gói chỉ hiện khi Cổng có đủ công cụ của gói đó.
- **Tự động** (chưa chọn gói): mã 8 số → gói 2; số hiệu văn bản → 5; "nhãn hiệu" → 6; "giải trình / áp mã" → 7; còn lại → gói 1.
- Phân loại chốt được mã → một tin theo form cố định do code dựng:
  🔍 Hàng → ✅ Mã HS đề xuất (tên trong biểu, đơn vị tính, lý do) → 📝 Mô tả khai báo gợi ý → 💰 Thuế suất → 🔴/✅ Chính sách quản lý → 🔁 Mã khác cần cân nhắc.
- Công việc chạy nền (phân loại, kiểm sâu): bot không gửi câu chờ thừa, xong việc tự động giao kết quả qua một cửa `core/gate.js`.

### Cách thêm gói mới
Xem đặc tả chi tiết giao diện hợp đồng tại [specs/001-nen-tang-chung/contracts/pack.md](specs/001-nen-tang-chung/contracts/pack.md).
Mỗi gói nằm trong một thư mục riêng thuộc `packs/<tên-gói>/` và export mặc định manifest:
```javascript
export default {
  id: 'ten-goi',              // Mã định danh duy nhất
  name: 'Tên hiển thị gói',
  audience: 'public',         // 'public' (mọi người) hoặc 'staff' (chỉ nhân viên)
  priority: 10,               // Số nguyên lớn hơn thì ưu tiên xét trước
  match(turn) { ... },        // Trả boolean: có nhận lượt này không
  async handle(turn, ctx) {   // Xử lý lượt, trả { replies, jobs, handoff, labels, interests }
    return { replies: [{ text: 'Kết quả' }] };
  }
};
```
Lõi `core/registry.js` sẽ tự động quét và nạp gói khi khởi động hệ thống mà không cần sửa đổi mã nguồn lõi.

---

## Handoff & Lệnh nhân viên (`core/handoff.js`)

Khi khách hàng có yêu cầu gặp người (`core/intents.js` phát hiện ý định xin gặp nhân viên) hoặc gói nghiệp vụ chủ động chuyển giao, hệ thống sẽ chuyển phòng sang trạng thái `'human'` và tạo phiếu yêu cầu hỗ trợ gửi vào nhóm Zalo nhân viên (`STAFF_CHAT_ID`).

Nhân viên có tên trong danh sách `STAFF_USERS` thực hiện các lệnh quản trị và tương tác trực tiếp trong nhóm:

| Lệnh | Cú pháp | Ý nghĩa & Hành vi |
|---|---|---|
| `/cho` | `/cho` | Liệt kê các phiếu hỗ trợ đang mở (`status='open'`) kèm thời gian khách đã chờ (phút). |
| `/nhan` | `/nhan <mã>` | Nhân viên nhận xử lý phiếu (`status='claimed'`), phòng chuyển sang `'human'`. |
| `/tl` | `/tl <mã> <nội dung>` | Gửi tin nhắn trả lời tới khách hàng qua cửa gửi duy nhất `core/gate.js`. Đặt lại bộ đếm lặng 2 giờ. |
| `/tra-bot` | `/tra-bot <mã>` | Đóng phiếu (`status='closed'`), trả phòng về cho bot tự động phục vụ tiếp. |
| `/chan` | `/chan <mã>` | Chuyển phòng khách sang `'blocked'`. Bot im lặng hoàn toàn, không xử lý và không chuyển phiếu. |
| `/chan-nhom` | `/chan-nhom <chat_id>` | Chặn toàn bộ nhóm Zalo của khách hàng. |
| `/ho-so` | `/ho-so <mã>` | Xem tóm tắt hồ sơ khách hàng (tên, SĐT, nhãn, số lượt, quan tâm) kèm 20 tin nhắn gần nhất theo giờ VN. |
| `/gan` | `/gan <mã> <nhãn>` | Gắn thêm nhãn quản lý cho khách hàng (nguồn `staff:<id>`, hệ thống tự động không được phép gỡ). |
| `/go` | `/go <mã> <nhãn>` | Gỡ nhãn do nhân viên đã gắn trên hồ sơ khách hàng. |
| `/ghi` | `/ghi <mã> <nội dung>` | Thêm ghi chú nghiệp vụ vào hồ sơ khách hàng. |
| `/xoa-du-lieu` | `/xoa-du-lieu <mã>` | Xoá toàn bộ lịch sử tin nhắn và hồ sơ của người dùng theo `conv_id` (đảm bảo quyền riêng tư). |

*(Lưu ý: `<mã>` có thể là mã phiếu dạng `P12`, `p12`, số `12` hoặc mã `conv_id`).*

---

## Não hiểu câu hỏi và Não biên tập (AI)

- **Não hiểu câu hỏi (Định tuyến thông minh)**: Ở chế độ Tự động, câu hỏi tự do của khách được Gemini (hoặc LLM2 dự phòng) phân tích, trích xuất dữ kiện (mã HS, tên hàng, xuất xứ...) và điền vào khuôn của gói tương ứng.
- **Não biên tập kết quả**: Bản phân tích phân loại dài được tóm tắt thành bản chốt ngắn gọn 4–7 dòng. **Code kiểm tra từng con số** để đảm bảo khớp 100% với dữ liệu gốc của Cổng OZ trước khi gửi ra ngoài.
- **Khoá dự phòng (`packs/hs/llm2.js`)**: Chuẩn OpenAI tương thích, tự động thay thế khi Gemini quá tải hoặc gặp sự cố.

---

## Biến môi trường cấu hình

Sao chép `.env.example` thành `.env` và thiết lập các biến phù hợp:

### 1. Cấu hình lõi và vận hành (Spec 001)
- `STAFF_USERS`: Danh sách `user_id` nhân viên được phép sử dụng lệnh quản trị (ngăn cách bằng dấu phẩy).
- `STAFF_CHAT_ID`: Mã định danh phòng/nhóm Zalo nội bộ nhận phiếu hỗ trợ, cảnh báo lỗi và bản tin gộp.
- `DATA_DIR`: Thư mục lưu trữ cơ sở dữ liệu SQLite (`bot.db`) và các bản sao lưu (mặc định `./data`).
- `CAP_CHAT_DAY`: Trần số tin nhắn bot chủ động gửi tới một phòng 1-1 trong ngày (mặc định `8`).
- `CAP_GROUP_DAY`: Trần số tin nhắn bot gửi trong một nhóm trong ngày (mặc định `200`).
- `CAP_ALL_DAY`: Trần số tin nhắn bot gửi trên toàn hệ thống trong ngày (mặc định `300`).
- `BANNED_PATTERNS`: Danh sách biểu thức chính quy (regex) cấm để lộ ra cho khách (ngăn cách bằng dấu chấm phẩy `;`).
- `SESSION_TTL_MS`: Thời gian duy trì phiên hội thoại với gói nghiệp vụ (mili giây, mặc định `7200000` = 2 giờ).
- `HUMAN_IDLE_MS`: Khoảng thời gian im lặng để phòng có nhân viên tự động trao quyền lại cho bot (mili giây, mặc định `7200000` = 2 giờ).
- `COMPANY_PHONES`: Danh sách số điện thoại nội bộ công ty OZ (ngăn cách bằng dấu phẩy) để bot không nhận diện nhầm thành số khách.

### 2. Cấu hình Kênh và Kết nối Cổng
- `ZALO_BOT_TOKEN`: Mã token bot được cấp từ Zalo Bot Creator (`bot.zapps.me`).
- `ZALO_MODE`: Chế độ hoạt động: `webhook` (triển khai máy chủ production) hoặc `polling` (chạy thử nghiệm local).
- `ZALO_WEBHOOK_PATH`: Đường dẫn tiếp nhận webhook Zalo (mặc định `/webhook/zalo`).
- `ZALO_WEBHOOK_SECRET`: Chuỗi bí mật xác thực webhook từ Zalo.
- `PORT`: Cổng máy chủ HTTP lắng nghe (mặc định `3010`).
- `ALLOW_USERS`: Danh sách ID tài khoản hoặc nhóm được phép dùng bot (để trống = công khai).
- `RATE_LIMIT_PER_MIN`: Giới hạn tốc độ tin nhắn từ một người trong 1 phút (mặc định `10`).
- `OZ_MCP_URL`: Địa chỉ Cổng OZ MCP (`https://mcp.uythacnhapkhau.com/mcp`).
- `OZ_MCP_TOKEN`: Token tài khoản OZ sử dụng các công cụ tính điểm.
- `OZ_MCP_AUTH_HEADER`: Tiêu đề xác thực gửi Cổng OZ (mặc định `Authorization`).

### 3. Cấu hình AI & Khoá dự phòng
- `GEMINI_API_KEY`: Khoá API Google AI Studio cho đọc ảnh và não AI.
- `GEMINI_MODEL`, `GEMINI_BRAIN_MODEL`, `GEMINI_EDITOR_MODEL`: Tên mô hình Gemini tương ứng.
- `LLM2_BASE_URL`, `LLM2_API_KEY`, `LLM2_MODEL`, `LLM2_TIMEOUT_MS`: Cấu hình LLM dự phòng chuẩn OpenAI.
- `LLM_CHINH`: Đặt `llm2` nếu muốn dùng LLM2 làm kênh chính, Gemini làm kênh cứu hộ.

---

## Chạy thử và Kiểm thử

### 1. Khởi chạy trên máy phát triển
```bash
cp .env.example .env    # Điền ZALO_BOT_TOKEN, OZ_MCP_TOKEN...
npm run dev             # Chạy với ZALO_MODE=polling qua server.js
```
Kiểm tra sức khoẻ hệ thống:
```bash
curl -s http://localhost:3010/health | jq
```
Mong đợi:
```json
{
  "ok": true,
  "db": "ok",
  "mcp": { "tools": 7 },
  "zalo": "ok",
  "inboxPending": 0
}
```

Xem số liệu thống kê vận hành:
```bash
curl -s http://localhost:3010/metrics | jq
```

### 2. Kiểm thử tự động
```bash
npm test                 # Chạy toàn bộ test suites (node:test + test.mjs)
npm run eval             # Chạy 12 kịch bản đánh giá hội thoại chuyên sâu
node scripts/kiem-wiki.mjs --nghiem  # Cổng kiểm định wiki tri thức nội bộ
```

### 3. Tra cứu kiểm toán (Audit CLI)
Hệ thống cung cấp công cụ dòng lệnh chỉ-đọc để tra soát nhật ký xử lý, tự động che mờ dữ liệu nhạy cảm:
```bash
npm run audit -- --chat <chat_id> --limit 20
npm run audit -- --turn <turn_id>
```

### 4. Kiểm tay Quickstart
Hướng dẫn thực hiện đầy đủ 6 bước kiểm thử bằng tay có tại [specs/001-nen-tang-chung/quickstart.md](specs/001-nen-tang-chung/quickstart.md).

---

## Triển khai Coolify (Production 24/7)

1. Thiết lập ứng dụng trong Coolify trỏ vào repo: Application → Dockerfile, cổng `3010`, volume gắn vào `./data` (thư mục `DATA_DIR`).
2. Điền biến môi trường: `ZALO_BOT_TOKEN`, `ZALO_MODE=webhook`, `ZALO_WEBHOOK_SECRET`, `OZ_MCP_TOKEN`, `STAFF_CHAT_ID`, `STAFF_USERS`...
3. Kiểm tra health check tại đường dẫn `/health`.
4. Đăng ký webhook chính thức với máy chủ Zalo:
   ```bash
   node --env-file=.env scripts/set-webhook.mjs set https://<domain-cua-ban>/webhook/zalo
   ```

---

Lưu ý: Mọi kết quả phân loại mã HS do bot đưa ra mang tính chất **gợi ý tham khảo**, không thay thế quyết định phân loại chính thức của cơ quan Hải quan.
