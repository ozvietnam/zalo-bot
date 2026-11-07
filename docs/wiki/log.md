# Nhật ký wiki

> Cập nhật: 2026-11-07 · commit: 64a728a

Nhật ký thay đổi của bộ wiki trong docs/wiki. Mỗi dòng ghi: ngày, commit của mã nguồn
đã đọc khi viết, và những trang bị thay đổi hoặc thêm mới.

Quy ước:

- Thêm mục mới **trên đầu** danh sách (mới nhất ở trên).
- Ghi rõ **vì sao** đổi, không chỉ ghi "sửa lỗi".
- Khi trích dẫn trong wiki không còn khớp code, ghi lại ở mục "Cần sửa lại" của trang đó
  và sửa khi có đợt cập nhật tiếp theo.

## 2026-11-07 — Đưa wiki thành cửa vào; sửa trích dẫn

- **Commit mã nguồn đã đọc:** `64a728a` (code không đổi trong đợt này; chỉ sửa tài liệu).
- **Trang wiki đã sửa:**
  - `docs/wiki/luong-tin-nhan.md`: sơ đồ đường A ghi `server.js:67` cho bước `JSON.parse`; dòng đúng là `server.js:69` (`server.js:67` là `req.on('end', ...)`).
  - `docs/wiki/an-toan.md`: kiểm lại Điều VI — đã trỏ đúng `package.json:8`, không cần sửa.
- **Ngoài wiki:** thêm giao thức đầu phiên / cuối phiên vào `AGENTS.md`; thêm dòng cảnh báo tài liệu cũ ở đầu `docs/TIEP-TUC.md`.

## 2026-11-07 — Tạo wiki lần đầu

- **Commit mã nguồn đã đọc:** `64a728a` (nhánh main).
- **Trang tạo mới (15 trang):** index.md, tong-quan.md, kien-truc.md, luong-tin-nhan.md,
  goi-nghiep-vu.md, nao-ai.md, du-lieu.md, an-toan.md, nen-tang-zalo.md,
  trien-khai-van-hanh.md, kiem-thu.md, tien-do.md, su-co-bai-hoc.md, thuat-ngu.md, log.md.
- **Nguồn:** đọc trực tiếp mã nguồn, không sao chép tài liệu cũ. Mọi nhận định về code
  đều kèm đường dẫn tệp và số dòng để người đọc mở ra kiểm.
- **Điểm đáng chú ý ghi lại trong trang tiến độ:** repo có hai đường xử lý.
  Lõi mới trong thư mục core đã xong phần nền (T001–T015) nhưng **chưa** được nối vào
  điểm vào của tiến trình; đường đang chạy vẫn là đường cũ trong thư mục lib, tự gửi tin
  không qua cửa gửi. Mọi tính năng an toàn của lõi vì thế chưa có tác dụng với khách thật.
- **Mâu thuẫn tài liệu ↔ code:** ghi cả hai phía trong trang tiến độ, không tự chọn bên nào đúng.
- **Quyết định của chủ repo ngày 06/11:** chỉ **ghi nhận** trong trang tiến độ, không sửa
  hiến pháp hay lộ trình. Việc sửa chính thức là một PR riêng, do chủ repo quyết.
- **Kiểm tra:** chạy `node scripts/kiem-wiki.mjs --nghiem` phải đạt; CI cũng chạy cổng này.
