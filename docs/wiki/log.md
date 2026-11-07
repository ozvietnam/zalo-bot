# Nhật ký wiki

> Cập nhật: 2026-11-07 · commit: ef2b48f

Nhật ký thay đổi của bộ wiki trong docs/wiki. Mỗi dòng ghi: ngày, commit của mã nguồn
đã đọc khi viết, và những trang bị thay đổi hoặc thêm mới.

Quy ước:

- Thêm mục mới **trên đầu** danh sách (mới nhất ở trên).
- Ghi rõ **vì sao** đổi, không chỉ ghi "sửa lỗi".
- Khi trích dẫn trong wiki không còn khớp code, ghi lại ở mục "Cần sửa lại" của trang đó
  và sửa khi có đợt cập nhật tiếp theo.

## 2026-11-07 — Vá câu báo lỗi gửi khách (issue #23), sửa trang an toàn

- **Commit mã nguồn đã đọc:** `ef2b48f`. Lưu ý: thay đổi code của issue #23 (sửa `lib/bot.js:214`,
  thêm `test/core/loi-goc-khach.test.mjs`) còn nằm ở working tree, **chưa có commit riêng**.
- **Trang wiki đã sửa:** `docs/wiki/an-toan.md`, `docs/wiki/kiem-thu.md`, `docs/wiki/log.md`.
- **Vì sao:** đường đang chạy trước đây kèm lỗi gốc vào câu báo gửi khách (in 120 ký tự đầu của
  `e.message`), khách thật nhận được lỗi gốc — vi phạm Hiến pháp Điều IX
  (`.specify/memory/constitution.md:50`). Sau khi sửa, câu báo gửi khách không còn kèm lỗi gốc,
  chi tiết chỉ vào log. Trang an toàn được cập nhật cho khớp: chuyển nhận định "không kèm lỗi gốc"
  của đường đang chạy từ "Chưa có code" sang "Đã có code" (kèm test khoá), bổ sung dòng log
  `lib/bot.js:213` vào khoảng trống log chưa che, đổi ô Điều IX trong bảng tổng quan thành
  "có phần", và bỏ mục rủi ro "Câu báo lỗi của đường đang chạy kèm lỗi gốc". Trang kiểm thử
  cập nhật số liệu cho khớp sau khi thêm test: 23 tệp test (17 trong `test/core/`), `npm test`
  226/226 đạt, thêm tệp test mới vào bảng `test/core/` và cập nhật mục "Kết quả chạy gần nhất".
  Sau đó tệp `test/core/loi-goc-khach.test.mjs` được viết lại (135 dòng) thành 3 ca test khoá cả ba
  nhánh lỗi của đường đang chạy — nhánh chạy gói, nhánh mở lại lượt (`ket-qua`) và nhánh đọc ảnh
  (`test/core/loi-goc-khach.test.mjs:101-135`). Trang an toàn và trang kiểm thử đã đồng bộ lại
  trích dẫn theo dòng mới, số test tăng lên 226; trang kiểm thử đã cập nhật số liệu "Kết quả chạy
  gần nhất" thành 226/226 và tổng 260 test.

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
