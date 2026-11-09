# Hợp đồng ứng xử chung (Behavior Contracts)

Tài liệu này chuẩn hoá các quy tắc ứng xử cốt lõi của trợ lý bot tự động OZ Việt Nam thành các hợp đồng ứng xử có mã số ổn định (`UX-01`…), trỏ thẳng tới các điều khoản Hiến pháp và mã nguồn đang thực thi. Đây là bộ quy chuẩn dùng chung cho `ozvietnam/zalo-bot` và các hệ thống dịch vụ khách hàng khác của OZ.

---

## Danh mục các luật ứng xử

| Mã luật | Tên luật | Điều Hiến pháp | Vị trí code thực thi |
|---|---|---|---|
| **UX-01** | Cổng OZ lỗi khi khách hỏi mã HS | Điều V, VII, VIII | `packs/hs/render.js:127`, `packs/hs/index.js:71`, `core/engine.js:13` |
| **UX-02** | Khách hỏi pháp luật hải quan | Điều V, VIII | `packs/hs/packages.js:340`, `packs/hs/packages.js:107`, `packs/hs/render.js:180` |
| **UX-03** | Khách xin số điện thoại / thông tin liên hệ | Điều II, VIII, IX | `core/intents.js:78`, `core/intents.js:197`, `core/engine-handoff.js:63` |
| **UX-04** | Khách hỏi người hay máy | Điều VIII | `core/intents.js:185`, `core/intents.js:202`, `core/engine-handoff.js:66` |
| **UX-05** | Chuyển người thật (Handoff) | Điều I, II | `core/handoff.js:32`, `core/handoff-ticket.js:116`, `core/engine-handoff.js:47` |
| **UX-06** | Giờ yên (Quiet Hours) | Ràng buộc kỹ thuật, Điều I, II | `core/gate-decide.js:24`, `core/gate.js:124` |
| **UX-07** | Che bí mật và thông tin nhạy cảm | Điều IX | `core/redact.js:16`, `core/sdt.js:167`, `core/gate-decide.js:68` |

---

## Chi tiết từng luật ứng xử

### UX-01: Cổng OZ lỗi khi khách hỏi mã HS
- **Tình huống:** Khách hàng gửi yêu cầu tra cứu hoặc phân loại mã HS, nhưng Cổng dịch vụ Cổng OZ (MCP) gặp sự cố kết nối, quá thời gian chờ (timeout), trả về lỗi 5xx hoặc trạng thái không có kết quả (`AI bận`, `NEEDS_EXPERT`).
- **Điều Hiến pháp:**
  - **Điều V (Tri thức một nhà):** Tri thức nghiệp vụ nằm ở Cổng OZ; bot không tự bịa đặt tri thức ngoài Cổng.
  - **Điều VII (Sai thì dừng):** Không chắc chắn trạng thái thì dừng lại và thông báo trung thực; thà báo lỗi còn hơn đưa kết quả sai.
  - **Điều VIII (Trung thực với khách):** Mã HS luôn là gợi ý tham khảo; không đưa thông tin giả định.
- **Code thực thi:**
  - `packs/hs/render.js:127`: Hàm `renderError` hiển thị lỗi thân thiện từ Cổng, tuyệt đối không tạo mã HS giả.
  - `packs/hs/index.js:71`: Gọi công cụ Cổng OZ với cơ chế bắt lỗi an toàn.
  - `core/engine.js:13`: Định dạng thông báo lỗi hệ thống chung cho khách `{orange}`.
- **Quy tắc bắt buộc:**
  1. Tuyệt đối **KHÔNG ĐƯỢC BỊA MÃ HS** khi Cổng lỗi hoặc AI bận.
  2. Báo lỗi rõ ràng, lịch sự cho khách và gợi ý khách thử lại hoặc gửi thêm mô tả chi tiết.

---

### UX-02: Khách hỏi pháp luật hải quan
- **Tình huống:** Khách hỏi về hiệu lực văn bản quy phạm pháp luật (nghị định, thông tư), chú giải pháp lý HS, hoặc tiền lệ phân loại hải quan (thông báo kết quả phân loại TB-TCHQ).
- **Điều Hiến pháp:**
  - **Điều V (Tri thức một nhà):** Dữ liệu văn bản pháp luật, chú giải và tiền lệ do Cổng OZ tra cứu từ cơ sở dữ liệu pháp luật.
  - **Điều VIII (Trung thực với khách):** Cung cấp thông tin chuẩn xác theo văn bản gốc; ghi nhận rõ ràng nếu văn bản đã hết hiệu lực hoặc bị bãi bỏ.
- **Code thực thi:**
  - `packs/hs/packages.js:340`: Gói 5 (`phap-luat`) phụ trách tra cứu hiệu lực văn bản, chú giải chương/nhóm, tiền lệ phân loại.
  - `packs/hs/packages.js:107`: Hàm `tienLeNhanh` tự động mở rộng nhánh mã 4/6 số sang các mã lá 8 số để tra cứu tiền lệ, báo rõ số lượng mã đã rà soát.
  - `packs/hs/render.js:180`: Hàm `phanTichChinhSach` đối chiếu trạng thái hiệu lực văn bản (`CON_HIEU_LUC`, `HET_HIEU_LUC`, `HET_HIEU_LUC_MOT_PHAN`).
- **Quy tắc bắt buộc:**
  1. Mọi trích dẫn pháp luật phải kèm số hiệu văn bản có căn cứ từ công cụ.
  2. Văn bản đã hết hiệu lực hoặc bãi bỏ phải ghi chú cảnh báo rõ ràng cho khách.
  3. Tiền lệ không tìm thấy phải thông báo đã dò bao nhiêu mã, không được tự suy diễn tiền lệ.

---

### UX-03: Khách xin số điện thoại / thông tin liên hệ
- **Tình huống:** Khách hàng hỏi xin số điện thoại cá nhân của nhân viên, hotline, hoặc đề nghị gọi điện thoại trao đổi trực tiếp.
- **Điều Hiến pháp:**
  - **Điều II (Người trước máy):** Khách cần trao đổi trực tiếp thì chủ động kết nối nhân viên tiếp nhận.
  - **Điều VIII (Trung thực với khách):** Hướng dẫn kênh liên hệ đúng thẩm quyền.
  - **Điều IX (Bí mật không bao giờ lộ):** Tuyệt đối không để lộ số điện thoại cá nhân của nhân viên trong câu trả lời bot.
- **Code thực thi:**
  - `core/intents.js:78`: Hàm `wantsHuman` nhận diện các mẫu câu xin số điện thoại, xin gặp người hỗ trợ.
  - `core/intents.js:197`: Hằng số câu trả lời chuẩn `REPLY_HANDOFF`.
  - `core/engine-handoff.js:63`: Gắn nhãn `xin-nguoi`, trả lời câu chuyển tiếp và mở phiếu cho nhân viên.
- **Quy tắc bắt buộc:**
  1. Không cung cấp số điện thoại cá nhân của nhân viên hoặc thông tin chưa được công khai.
  2. Thông báo bot đã ghi nhận yêu cầu và kết nối nhân viên phụ trách hỗ trợ trực tiếp.

---

### UX-04: Khách hỏi người hay máy
- **Tình huống:** Khách hỏi trực diện hoặc gián tiếp: "Bạn là người hay bot?", "Người hay máy đấy?", "Có phải AI không?".
- **Điều Hiến pháp:**
  - **Điều VIII (Trung thực với khách - NON-NEGOTIABLE):** Khách hỏi "người hay máy" thì bot phải nói thật là trợ lý tự động của OZ và hướng dẫn cách gặp nhân viên nếu muốn.
- **Code thực thi:**
  - `core/intents.js:185`: Hàm `asksIfBot` phân tích câu hỏi người hay máy bằng xử lý ngôn ngữ tự nhiên tiếng Việt, né tránh nhầm lẫn với các mô tả hàng hoá có từ "máy" (như máy bơm, máy hút bụi).
  - `core/intents.js:202`: Hằng số `REPLY_IS_BOT` khẳng định: "Dạ em là trợ lý tự động của OZ Việt Nam…".
  - `core/engine-handoff.js:66`: Gửi phản hồi `REPLY_IS_BOT` và giữ phòng ở trạng thái `bot` để tiếp tục phục vụ.
- **Quy tắc bắt buộc:**
  1. Luôn thừa nhận là trợ lý tự động, không giả vờ làm người thật.
  2. Kèm theo câu hướng dẫn khách gõ "gặp nhân viên" nếu muốn trao đổi với nhân sự thật.

---

### UX-05: Chuyển người thật (Handoff)
- **Tình huống:** Khách xin gặp nhân viên (`wantsHuman`), hoặc gói nghiệp vụ yêu cầu chuyển giao, hoặc nhân viên gõ lệnh tiếp quản phòng.
- **Điều Hiến pháp:**
  - **Điều I (Một cửa gửi):** Mọi tin nhắn đều đi qua cửa kiểm soát duy nhất `gate.send`.
  - **Điều II (Người trước máy - NON-NEGOTIABLE):** Khi phòng ở trạng thái `human`, bot IM LẶNG HOÀN TOÀN: không trả lời, không soạn nháp, không gọi mô hình.
- **Code thực thi:**
  - `core/handoff.js:32`: Ngưỡng tự động trở về bot sau khoảng lặng lâu (`HUMAN_IDLE_MS = 7_200_000`, 2 giờ).
  - `core/handoff-ticket.js:116`: Hàm `open` tạo phiếu `P<id>` gửi vào nhóm nhân viên kèm lịch sử tóm tắt và hồ sơ khách.
  - `core/engine-handoff.js:47`: Kiểm tra trạng thái phòng, nếu là `human` thì chỉ lưu tin khách và chuyển tiếp (`forward`), bot không phát ngôn.
- **Quy tắc bắt buộc:**
  1. Khi đã chuyển sang người, bot phải im lặng tuyệt đối cho đến khi nhân viên trả lại hoặc hết thời gian khoảng lặng 2 giờ.
  2. Mọi thông tin chuyển vào nhóm nhân viên phải được che dữ liệu nhạy cảm theo từng dòng.

---

### UX-06: Giờ yên (Quiet Hours)
- **Tình huống:** Tin nhắn gửi ra trong khung giờ từ 23:00 đến 07:00 sáng theo giờ Việt Nam (`Asia/Ho_Chi_Minh`).
- **Điều Hiến pháp:**
  - **Ràng buộc kỹ thuật (Giờ yên):** Tin chủ động (kết quả việc nền, nhắc việc, bản tin) bị hoãn tới 07:00 sáng; trả lời trực tiếp trong vòng 10 phút vẫn được gửi.
  - **Điều I (Một cửa gửi):** Cửa gửi kiểm soát điều kiện giờ yên trước khi phát tin.
- **Code thực thi:**
  - `core/gate-decide.js:24`: Hàm `inQuietHours` tính toán chính xác theo giờ Việt Nam độc lập với múi giờ của máy chủ.
  - `core/gate.js:124`: Hoãn các tin chủ động / việc nền mang cờ `hasOpenJob` đến 07:00 sáng; câu trả lời trực tiếp `isDirectReply` được gửi ngay.
- **Quy tắc bắt buộc:**
  1. Không làm phiền khách hàng ban đêm bằng các tin nhắn chủ động hoặc thông báo chậm trễ.
  2. Đảm bảo việc nợ khách không bị mất: lưu trạng thái `debt: true` và tự động gửi lúc 07:00 sáng khi hết giờ yên.

---

### UX-07: Che bí mật và thông tin nhạy cảm
- **Tình huống:** Tin nhắn, nhật ký audit, hoặc nội dung trao đổi có nguy cơ chứa mã token, khoá API, đường dẫn thư mục máy chủ, số điện thoại, hoặc số tài khoản ngân hàng.
- **Điều Hiến pháp:**
  - **Điều IX (Bí mật không bao giờ lộ - NON-NEGOTIABLE):** Token, khoá, số điện thoại cá nhân, số tài khoản không bao giờ xuất hiện trong log hoặc tin gửi khách.
- **Code thực thi:**
  - `core/redact.js:16`: Hàm `redact` che khoá Bearer, bot token, chuỗi bí mật dài.
  - `core/redact.js:24`: Hàm `findLeak` phát hiện dấu vết đường dẫn tệp (`/home/`, `/opt/`, `C:\`), stack trace.
  - `core/sdt.js:167`: Hàm `cheSdt` che số điện thoại Việt Nam dạng di động và cố định.
  - `core/gate-decide.js:68`: Cửa gửi từ chối phát hành bất kỳ tin nhắn nào vi phạm `findLeak`.
- **Quy tắc bắt buộc:**
  1. Cửa gửi chặn ngay lập tức tin nhắn nếu phát hiện dấu hiệu rò rỉ bí mật.
  2. Báo cáo kiểm thử và nhật ký lưu trữ tuân thủ chuẩn an toàn cho kho mã nguồn công khai.
