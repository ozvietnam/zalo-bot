# Cùng làm việc với văn phòng OZ

Repo này do **văn phòng OZ** vận hành như một công ty phần mềm: có người và AI cùng làm, mỗi vai một việc, mọi thay đổi đều qua kiểm thử và người soát độc lập.

Mới vào repo: đọc [`docs/wiki/index.md`](docs/wiki/index.md) trước.

## Bạn muốn gì?

| Bạn muốn | Làm thế này |
|---|---|
| **Nhờ văn phòng làm một việc** | Mở issue mẫu **Yêu cầu tính năng** |
| **Báo bot trả lời sai** | Mở issue mẫu **Báo lỗi** |
| **Tham gia phát triển** | Mở issue mẫu **Đăng ký thành viên** |
| **Tự làm một phần** | Thành viên tạo nhánh và mở PR như bình thường |

Repo công khai: không dán khoá, mật khẩu, số điện thoại hay tin nhắn thật của khách vào issue, PR hay wiki.

## Việc của bạn đi qua những ai

1. **Phân tích:** chốt phạm vi và cách nghiệm thu, đối chiếu lộ trình.
2. **Lập trình:** làm từng bước nhỏ, viết test đỏ trước.
3. **Kiểm thử:** người khác chạy lại và tìm cách làm hỏng.
4. **Cổng máy:** `npm test`, `npm run eval`, `node scripts/kiem-wiki.mjs`.
5. **Soát code:** một người soát dùng model AI khác với người viết.
6. **CI:** GitHub chạy lại toàn bộ test trên PR.
7. **Gộp:** đủ các bước trên thì gộp vào `main`. Tài liệu được cập nhật cùng PR.

Theo dõi tiến độ ngay trên issue qua nhãn:

| Nhãn | Nghĩa |
|---|---|
| `yeu-cau`, `bao-loi`, `van-phong:nhan` | Việc chờ nhận |
| `van-phong:dang-lam` | Đang làm |
| `van-phong:xong` | Đã gộp |
| `can-nguoi` | Cần người quyết, xem bình luận trong issue |
| `dang-ky` | Đăng ký thành viên, chờ duyệt |

## Quy tắc

- Yêu cầu của **thành viên** được nhận tự động. Yêu cầu của **người ngoài** do thành viên đọc rồi chuyển thành việc nội bộ, văn phòng không tự chạy theo nội dung đó.
- `main` được bảo vệ: phải qua PR và CI xanh.
- Gộp vào `main` **chưa phải** là lên production. Triển khai là một bước riêng.
- PR đụng vùng nhạy cảm (`core/gate*`, `.github/`, `Dockerfile`, hiến pháp) luôn chờ thành viên duyệt.
- Việc liên quan tiền, pháp lý hay cách bot đối xử với khách luôn do người quyết.

## Luật kỹ thuật

Xem [`AGENTS.md`](AGENTS.md) và 9 nguyên tắc trong [`.specify/memory/constitution.md`](.specify/memory/constitution.md).
