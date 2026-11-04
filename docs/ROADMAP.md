# Lộ trình OZ Zalo Bot

Mỗi mục là một spec spec-kit riêng (`specs/NNN-ten/`). Spec sau chỉ bắt đầu khi spec trước đạt Success Criteria.
Thứ tự xếp theo: an toàn trước, rồi tới thứ ra tiền, rồi mới tới mở rộng.

| Spec | Tên | Cho ai | Ra tiền thế nào | Điều kiện bắt đầu |
|---|---|---|---|---|
| **001** | Nền tảng dùng chung | cả công ty | Không trực tiếp. Là điều kiện để bật lại bot cho khách (bot đang tắt từ 19/10/2026) | Đang làm |
| **002** | Tài khoản & điểm theo người dùng | khách tra cứu | Hiện mọi người dùng trừ điểm vào **một** `OZ_MCP_TOKEN` của công ty. 002: khách liên kết tài khoản Cổng OZ của mình (`xem_tai_khoan`), có hạn mức miễn phí/ngày, hết thì mời nạp điểm. Mỗi lượt tra cứu có tính phí là doanh thu, không còn là chi phí | 001 xong |
| **003** | Gói CSKH bốn nấc | khách Fanpage/Zalo | Báo giá tạm tính + link sàn → hướng dẫn tự tìm hàng → gói dịch vụ tìm nguồn → khoá học 1-1. Mỗi nấc có điểm chuyển người đo được | 001 xong; eval ≥ 30 hội thoại thật; `moneyCheck: true` |
| **004** | Học từ người trả lời | đội CSKH | 1.451 tin nhân viên trả lời tay (7 ngày tới 04/11/2026) thành fixture eval + câu mẫu có nguồn; mỗi lần nhân viên sửa câu bot là một kịch bản mới | 003 chạy thử |
| **005** | Kênh thứ hai | khách Fanpage, Zalo OA | Messenger / Zalo OA theo `contracts/channel.md` với `detectsHumanReplies: true`: người gõ tay trên trang thì bot tự im | 001 xong |
| **006** | Gói nội bộ | nhân viên | Tra KPI, việc của mình, số liệu kế toán trên Google Sheet chung; `audience: 'staff'` | 001 xong; anh chốt phạm vi trợ lý kế toán |

## Vì sao 002 đứng trước 003

Ba lý do. Gói hải quan đã chạy được và đã có người dùng. Mỗi lượt phân loại đang trừ điểm của công ty. 002 không cần
mô hình mới hay tri thức mới, chỉ cần tài khoản và hạn mức. Còn CSKH (003) là gói rủi ro nhất: 18 sự cố trong
`specs/001-nen-tang-chung/research.md` đều ở mảng này. Nó cần eval của 004 chạy song song.

## Không làm (và lý do)

- **Không viết lại bằng framework** (NestJS, LangChain…): repo không có dependency và chạy ổn. Thêm framework là thêm thứ phải vận hành mà không chặn được sự cố nào trong research.
- **Không để bot gọi điện, tự chốt đơn, tự đặt giá**: kinh nghiệm 23/09: khâu "gọi chốt" là việc của người. Máy dọn đường (xếp thứ tự, soạn câu mở đầu, nhắc giờ).
- **Không thêm luồng quét định kỳ để "chăm sóc lại"** khách im lặng: Hiến pháp II.
- **Không nhiều tiến trình / nhiều máy** trước khi lưu lượng cần. SQLite một tệp đủ cho vài nghìn tin/ngày.

## Về "lên trending GitHub"

Repo hiện là **private**, nên chưa thể lên trending. Muốn có cộng đồng thì nên mở **phần lõi** (`core/`, `channels/`, `eval/`,
khung gói mẫu) thành một repo công khai riêng: "khung bot Zalo an toàn cho doanh nghiệp, có cửa gửi, người cầm phòng, eval".
Gói nghiệp vụ, tri thức và khoá Cổng OZ vẫn để private. Việc tách repo chỉ nên làm sau khi 001 đạt SC-001…SC-007:
số đo thật là thứ thuyết phục người ngoài, README đẹp thì không.
