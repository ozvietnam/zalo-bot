# Hiến pháp OZ Zalo Bot

Repo dùng chung cho toàn công ty OZ Việt Nam: một lõi chạy nhiều **gói** (tra cứu hải quan, CSKH, nội bộ…).
Mỗi điều dưới đây đến từ một sự cố có thật khi vận hành bot trên Fanpage và Zalo của OZ (VPS 201, 09–10/2026).
Bằng chứng xem `specs/001-nen-tang-chung/research.md` §1.

## Nguyên tắc cốt lõi

### I. Một cửa gửi (NON-NEGOTIABLE)
Mọi tin đi ra khách đều qua đúng một hàm `gate.send()`. Cửa chỉ được **gửi / bỏ / hoãn / từ chối**,
không bao giờ sửa chữ trong câu. Cửa kiểm, theo thứ tự: phòng đang do người cầm → khoá idempotency →
giờ yên cho tin chủ động → trần theo phòng và theo ngày → trùng nội dung → lộ thông tin nội bộ → số tiền không có căn cứ.
Code gửi đi mà không qua cửa là lỗi chặn merge.

### II. Người trước máy (NON-NEGOTIABLE)
Phòng chat ở trạng thái `human` (nhân viên đã nhận, hoặc người đang trả lời) thì bot **im hoàn toàn**:
không trả lời, không soạn nháp, không quét lại, không gọi mô hình. Phòng chỉ trở về `bot` khi nhân viên ra lệnh rõ ràng.
Bot chỉ nói khi khách vừa nhắn mới, hoặc khi đang nợ khách một kết quả đã hứa (có bản ghi việc nền).
Khách im thì máy im: không nhắc lại, không "chăm sóc lại" tự phát.

### III. Số tiền do code tra
Thuế, cước, giá, phí chỉ lấy từ kết quả công cụ hoặc bảng dữ liệu. Mô hình được diễn đạt, không được tự ra số.
Gói có cờ `moneyCheck` thì cửa gửi từ chối tin có con số tiền không xuất hiện trong bằng chứng của lượt
(kết quả công cụ hoặc lời khách).

### IV. Bằng chứng thắng lời khai
Mỗi lượt ghi một bản ghi audit: tin vào, gói được chọn, công cụ đã gọi kèm kết quả, quyết định của cửa, tin ra.
Câu "đã gửi / đã xong" phải trỏ được tới bản ghi. `npm test` chạy không cần mạng (Zalo và Cổng OZ đều giả lập).
Tính năng mới mà không có test đỏ trước thì không merge.

### V. Tri thức một nhà
Tri thức nghiệp vụ (mã HS, thuế, thủ tục, giá, bảng cước) nằm ở **Cổng OZ (MCP)** hoặc tệp dữ liệu có chủ.
Không nhúng tri thức vào code hay prompt. Gói đọc tri thức qua công cụ; Cổng thêm công cụ thì bot dùng được ngay.

### VI. Đơn giản, không phụ thuộc
Node ≥ 22.13, chỉ dùng thư viện chuẩn (`node:sqlite`, `node:test`, `fetch`). Không thêm package runtime.
Mỗi tệp một trách nhiệm, dưới 300 dòng. Trước khi tạo tệp hay luồng mới phải trả lời được:
"nó thuộc chỗ nào trong lõi, hay thuộc gói nào?". Không có logic ẩn ngoài repo (cron rời, script vá tay).

### VII. Sai thì dừng
Không chắc trạng thái thì không gửi, và báo nhân viên. Một lần crash còn đỡ hơn một vòng lặp gửi sai.
Mọi bước gửi đều idempotent nên khởi động lại không bao giờ gây gửi trùng.

### VIII. Trung thực với khách
Khách hỏi "người hay máy" thì bot nói thật là trợ lý tự động của OZ và mời gặp người. Không hứa thứ công cụ
không làm được (vd "em gửi catalog" khi chỉ gửi được chữ). Mã HS luôn ghi là gợi ý.

### IX. Bí mật không bao giờ lộ
Token, khoá, số điện thoại cá nhân, số tài khoản, giá vốn không bao giờ xuất hiện trong log hay tin gửi khách.
Lỗi API gửi khách chỉ là câu báo chung, không kèm thông báo lỗi gốc.

## Ràng buộc kỹ thuật

- Thời gian lưu UTC dạng ISO 8601; hiển thị và giờ yên theo `Asia/Ho_Chi_Minh`.
- Giờ yên 23:00–07:00 giờ VN: tin **chủ động** (kết quả việc nền, thông báo) được hoãn tới 07:00;
  trả lời trực tiếp tin khách vừa gửi (trong 10 phút) vẫn được gửi.
- Một tiến trình, một tệp SQLite trên volume. Mở rộng nhiều tiến trình là việc của một spec riêng.
- Ngôn ngữ: tài liệu và tin nhắn tiếng Việt; tên kỹ thuật giữ tiếng Anh.

## Quy trình làm việc

1. Mọi tính năng đi theo spec-kit: specify → clarify → plan → tasks → analyze → implement
   (trong Claude Code: `/speckit-specify` … `/speckit-implement`, xem `AGENTS.md`). Một spec một thư mục `specs/NNN-ten/`, một nhánh cùng tên.
2. Khi thực thi, dùng các skill Superpowers: `test-driven-development` (đỏ → xanh → commit),
   `systematic-debugging` khi có lỗi, `verification-before-completion` trước khi báo xong,
   `requesting-code-review` trước khi merge.
3. Cổng merge: `npm test` xanh; `npm run eval` không tụt điểm so với `main`; không vi phạm điều I–IX.
4. Gói mới chỉ được bật cho khách thật sau khi: chạy eval trên ≥ 30 hội thoại thật đạt ngưỡng của gói,
   rồi chạy thử với danh sách người dùng giới hạn ít nhất 3 ngày.

## Quản trị

Hiến pháp đứng trên mọi tài liệu khác trong repo. Sửa hiến pháp bằng PR riêng, ghi lý do và bằng chứng,
tăng số phiên bản (MAJOR: đổi/bỏ nguyên tắc; MINOR: thêm nguyên tắc; PATCH: sửa chữ). Sửa MAJOR cần anh Thắng duyệt.
Mỗi PR phải tự kiểm theo bảng "Constitution Check" trong `plan.md` của spec tương ứng.

**Version**: 1.0.0 | **Ratified**: 2026-11-04 | **Last Amended**: 2026-11-04
