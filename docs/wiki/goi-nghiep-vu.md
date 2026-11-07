# Gói nghiệp vụ và Cổng OZ
> Cập nhật: 2026-11-07 · commit: 0842386

Trang này nói về **gói** (pack) — đơn vị nghiệp vụ của bot — và về **Cổng OZ**, nơi mọi tri thức nghiệp vụ nằm.

Xem thêm: [Tổng quan](tong-quan.md) · [Kiến trúc](kien-truc.md) · [Luồng tin nhắn](luong-tin-nhan.md) · [An toàn](an-toan.md) · [Tiến độ](tien-do.md)

## 1. Gói là gì

- Gói gom logic nghiệp vụ: biết hỏi Cổng OZ câu gì, biết dựng câu trả lời thế nào.
- Gói **không** gửi tin khách. Gói chỉ trả về dữ liệu cho lõi.
- Repo hiện có một gói nghiệp vụ: tra cứu hải quan, nằm ở thư mục `packs/hs/`.
- Danh sách gói con nằm trong biến `PACKAGES` (`packs/hs/packages.js:142`).

Lõi không biết gói làm gì. Lõi chỉ lọc gói theo đối tượng người dùng và theo công cụ Cổng có sẵn, rồi hỏi từng gói theo thứ tự ưu tiên (`core/registry.js:38`, `core/registry.js:47`).

## 2. Danh mục 7 gói tra cứu hải quan

| Số | Gói | Id | Công cụ Cổng OZ (tên hàm thật) | Khách gửi | Đặc biệt |
|---|---|---|---|---|---|
| 1 | 🔎 Phân loại mã HS | `phan-loai` | `phan_loai_hs`, `bo_sung_du_kien` | tên hàng, chất liệu, công dụng, thông số | Chạy nền, bot không chờ (`packs/hs/packages.js:179`). Thiếu dữ kiện thì bot hỏi lại khách (`packs/hs/packages.js:215`) |
| 2 | 💰 Thuế & thủ tục nhập khẩu | `thue-thu-tuc` | `tra_thue`, `tra_thu_tuc_nhap_khau`, `tim_ma_hs` | mã HS, thêm nước xuất xứ | Gõ tên hàng thì dùng `tim_ma_hs` để tìm mã trước (`packs/hs/packages.js:262`) |
| 3 | 📝 Viết mô tả khai báo | `mo-ta` | `sinh_mo_ta_khai_bao` | mã HS, tên hàng, thương hiệu, model | Dùng lại mã vừa phân loại |
| 4 | ✅ Kiểm tra mô tả / tờ khai | `kiem-tra` | `soat_to_khai`, `kiem_ma_to_khai` | mã HS, mô tả, xuất xứ | "Kiểm sâu" thì chuyển sang `kiem_ma_to_khai` và chạy nền (`packs/hs/packages.js:319`) |
| 5 | ⚖️ Pháp luật hải quan | `phap-luat` | `tra_hieu_luc_van_ban`, `tra_chu_giai`, `tra_tien_le` | số hiệu văn bản, mã HS, mô tả | Cần có **ít nhất một** trong ba công cụ thì mới hiện (`packs/hs/packages.js:338`) |
| 6 | ®️ Sở hữu trí tuệ (nhãn hiệu) | `shtt` | `kiem_tra_shtt` | nhãn hiệu, thêm mã HS, xuất xứ | Trừ điểm vào tài khoản Cổng của công ty |
| 7 | 📄 Hồ sơ giải trình mã HS | `giai-trinh` | `soan_ho_so_giai_trinh` | mã đã khai, mã Hải quan áp, mô tả, lý do | Trừ điểm vào tài khoản Cổng của công ty |

Hai cột khác nhau, đừng lẫn:

- **Công cụ bắt buộc** — trường `congCu` trong từng gói (`packs/hs/packages.js:146`). Thiếu công cụ này thì gói không hiện với khách.
- **Công cụ gọi thêm khi chạy** — code gọi có điều kiện qua hàm `has(ctx, ...)`. Cổng không có thì bỏ mục đó, bot vẫn trả lời được.

### Gói nào đang hiện với khách

Danh sách công cụ Cổng được đọc 1 lần rồi cache. Hàm `availablePackages` lọc các gói đủ công cụ bắt buộc (`packs/hs/packages.js:413`). Nếu chưa lấy được danh sách công cụ, bot tạm coi như mọi gói đều có (`packs/hs/packages.js:414`).

Kết quả: Cổng OZ thêm công cụ mới thì bot dùng được ngay, không phải sửa phần kết nối.

## 3. Cổng OZ (MCP)

Cổng OZ là nơi giữ tri thức nghiệp vụ: mã HS, thuế suất, thủ tục, giá, bảng cước. Bot **không** nhúng tri thức này vào code. Nguyên tắc này nằm ở Hiến pháp điều V, xem [An toàn](an-toan.md).

Giao thức: MCP (Model Context Protocol) — cách để bot gọi công cụ của một máy chủ khác. Client nằm ở `core/mcp.js`.

| Nội dung | Chi tiết | Chỗ |
|---|---|---|
| Giao thức | Streamable HTTP + JSON-RPC 2.0 | `core/mcp.js:1` |
| Địa chỉ mặc định | `https://mcp.uythacnhapkhau.com/mcp` | `core/mcp.js:8` |
| Xác thực | Gửi token qua header; mặc định `Authorization: Bearer <token>` | `core/mcp.js:28` |
| Bắt tay | `initialize` → lưu `Mcp-Session-Id` → `notifications/initialized` | `core/mcp.js:77`, `core/mcp.js:82` |
| Liệt kê công cụ | `tools/list`, cache 10 phút | `core/mcp.js:96`, `core/mcp.js:13` |
| Gọi công cụ | `tools/call`, hết giờ sau 150 giây | `core/mcp.js:108` |
| Phiên hết hạn | Tự khởi tạo lại một lần rồi thử lại | `core/mcp.js:60` |

Ghi chú vận hành:

- Tên biến môi trường: `OZ_MCP_URL`, `OZ_MCP_TOKEN`, `OZ_MCP_AUTH_HEADER`. Xem [Triển khai và vận hành](trien-khai-van-hanh.md).
- Kết quả Cổng trả về có thể là JSON hoặc luồng sự kiện; client tự bóc ra phần dữ liệu (`core/mcp.js:129`, `core/mcp.js:134`).
- Tri thức nghiệp vụ nằm ở Cổng, không nằm ở prompt. Xem [Não AI](nao-ai.md).

## 4. Thêm gói mới

Từ 07/11/2026 (T016) chỉ còn **một** cách: thêm gói vào lõi. Thư mục `lib/` đã bị xoá hẳn nên
đường "làm tạm" cũ không còn tồn tại (xem [Kiến trúc](kien-truc.md) và [Tiến độ](tien-do.md)).

### 4.1. Thêm gói mới vào lõi

1. Tạo thư mục `packs/<id>/`, trong đó có tệp index.js xuất một đối tượng gói mặc định.
2. Khai báo các trường theo hợp đồng gói (`specs/001-nen-tang-chung/contracts/pack.md:8`):
   - `audience`: `'public'` (khách) hoặc `'staff'` (nhân viên) (`specs/001-nen-tang-chung/contracts/pack.md:12`).
   - `moneyCheck`: `true` để cửa gửi từ chối tin có số tiền không có bằng chứng (`specs/001-nen-tang-chung/contracts/pack.md:13`).
   - `requiresTools`: công cụ Cổng tối thiểu; thiếu thì gói bị ẩn (`specs/001-nen-tang-chung/contracts/pack.md:14`).
   - `priority`: số lớn được hỏi trước (`specs/001-nen-tang-chung/contracts/pack.md:15`).
   - `match`: hàm trả `true` nếu gói nhận tin này.
3. Hàm `handle` trả về `replies`, `evidence`, `jobs`, `handoff`, `labels`, `interests`. Gói **không** tự gửi tin (`specs/001-nen-tang-chung/contracts/pack.md:21`).
4. Không cần đăng ký thủ công: lõi tự nạp mọi thư mục con có tệp index.js (`core/registry.js:9`).

### 4.2. Thêm gói con trong gói hải quan

Thêm một mục vào mảng `PACKAGES` trong `packs/hs/packages.js:142`, mỗi mục có số, tên, công cụ Cổng, mẫu đầu vào và hàm chạy gói. Gói con được liệt kê cho khách qua `menuText` (`packs/hs/packages.js:424`).

### 4.3. Ràng buộc chung

- Mỗi tệp dưới 300 dòng; không thêm thư viện ngoài (Hiến pháp điều VI).
- Gói không được tự gửi tin, không được tự quyết định trả lời khách.
- Không nhúng tri thức nghiệp vụ vào code của gói.

## 5. Xem thêm

- [An toàn](an-toan.md) — điều III (số tiền do code tra) và điều V (tri thức một nhà).
- [Não AI](nao-ai.md) — não chọn gói và soạn câu trả lời.
- [Luồng tin nhắn](luong-tin-nhan.md) — gói được gọi ở bước nào.
- [Kiểm thử](kiem-thu.md) — cách kiểm một gói mới.
