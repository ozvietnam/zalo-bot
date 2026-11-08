# Nhật ký wiki

> Cập nhật: 2026-11-07 · commit: 0842386

Nhật ký thay đổi của bộ wiki trong docs/wiki. Mỗi dòng ghi: ngày, commit của mã nguồn
đã đọc khi viết, và những trang bị thay đổi hoặc thêm mới.

Quy ước:

- Thêm mục mới **trên đầu** danh sách (mới nhất ở trên).
- Ghi rõ **vì sao** đổi, không chỉ ghi "sửa lỗi".
- Khi trích dẫn trong wiki không còn khớp code, ghi lại ở mục "Cần sửa lại" của trang đó
  và sửa khi có đợt cập nhật tiếp theo.

## 2026-11-07 — Thêm thẻ nghiên cứu 010: giao việc cho thợ ngoài (Antigravity, Muse Code)

- **Commit mã nguồn đã đọc:** `0842386` (code không đổi trong đợt này; chỉ thêm thẻ spec và sửa tài liệu).
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md` (mục 3 thêm dòng spec 010 và đổi tiêu đề mục thành
  "Spec 007, 008, 009, 010"; mục 7 ghi 5 câu chờ chủ repo chốt), `docs/wiki/log.md`.
- **Ngoài wiki:** thêm `specs/010-giao-viec-antigravity/spec.md` (thẻ nghiên cứu, chưa code);
  `docs/ROADMAP.md` thêm một dòng cho spec 010 với trạng thái "nghiên cứu, chưa code".
- **Vì sao:** anh Thắng yêu cầu nghiên cứu cách Claude Code giao việc cho thợ ngoài cho mượt, để dùng thêm
  hạn mức của nhà cung cấp khác khi gói Anthropic Ultra hết hạn mức giữa phiên. Trong phiên, phạm vi được mở rộng
  từ một nhà cung cấp (Antigravity CLI `agy` của Google) sang hai (thêm Muse Code `muse` của Meta). Hai bên dùng
  **chung một hợp đồng giao việc** nên gộp một thẻ, đúng Điều VI. Tên thư mục giữ theo nhà cung cấp khảo sát đầu tiên
  và có ghi chú ngay dưới tiêu đề thẻ.
- **Chốt trong thẻ:** mặt tiếp xúc với Claude Code là **một MCP server stdio tự viết**, phơi một tool
  `giao_viec_tho` có tham số chọn nhà cung cấp; bên dưới gọi chế độ không tương tác của từng bên. Đã loại ACP,
  Remote Control và SDK của cả hai nhà cung cấp (thêm phụ thuộc, phá Điều VI), và chốt **không cài MCP server
  của bên thứ ba** (Điều IX, VII, VI).
- **Điểm nặng nhất:** cả hai nhà cung cấp đều có đường báo xong mà chưa xong. Antigravity: việc cần duyệt mà
  headless không xin được thì bị "soft-denied" nhưng **vẫn exit 0**, không có trường nào trong kết quả báo điều đó.
  Muse Code: chính tài liệu Meta cảnh báo agent có thể kết thúc lượt với exit 0 mà test vẫn đỏ, và bảo phải tự gác
  bằng lệnh test riêng. Vì vậy cổng chấm quyết định phải là **hiện vật** (`git status --porcelain` trong worktree
  riêng của việc) chứ không phải mã thoát — đúng Điều VII và Điều IV.
- **Hai rủi ro riêng của Muse Code, ghi thành mục riêng trong thẻ:** biến API key **ghi đè** đăng nhập gói thuê bao
  nên một biến lọt vào môi trường là âm thầm đổi túi tiền sang trả theo token; và chế độ góp dữ liệu huấn luyện
  **bật mặc định** trên gói thuê bao. Thẻ buộc server phải xoá biến đó khỏi tiến trình con, in rõ đang tiêu túi tiền nào,
  và luôn tắt chế độ góp dữ liệu — Điều IX.
- **Ba điểm đã kiểm chứng, ghi lại để người sau không mắc lại:** `agy` **không** phơi ra MCP server (nó chỉ *tiêu thụ*
  MCP; Muse Code cũng vậy), gói npm `antigravity-for-claude-code` **không tồn tại**, và Claude Code khai MCP bằng
  tệp *.mcp.json* của repo hoặc lệnh `claude mcp add` chứ không bằng tệp cấu hình của Claude Desktop.
- **Chưa đổi hành vi bot:** không sửa `core/`, `packs/`, `channels/`, `eval/`; đây là thẻ nghiên cứu về công cụ dev,
  không nằm trong đường chạy của bot. Bảng "Khớp Hiến pháp" của thẻ kết luận **không cần sửa Hiến pháp**.
- **Kiểm tra:** `node scripts/kiem-wiki.mjs` ĐẠT (16 trang); `npm test` 363 + 34 test xanh và `npm run eval` 9/9 đạt
  tại commit `0842386` (không đổi code nên số test không đổi).

## 2026-11-07 — Vá lỗi do kiểm thử phát hiện sau T016: nạp gói theo tệp mã nguồn, câu báo lỗi có màu

- **Commit mã nguồn đã đọc:** `0842386` (trên đó là `5a78ff1`); cả hai nằm sau `6a9cf5e` (T016).
- **Trang wiki đã sửa:** `docs/wiki/an-toan.md`, `docs/wiki/du-lieu.md`, `docs/wiki/goi-nghiep-vu.md`,
  `docs/wiki/index.md`, `docs/wiki/kiem-thu.md`, `docs/wiki/kien-truc.md`, `docs/wiki/log.md`,
  `docs/wiki/luong-tin-nhan.md`, `docs/wiki/nao-ai.md`, `docs/wiki/nen-tang-zalo.md`,
  `docs/wiki/quan-he-vps-201.md`, `docs/wiki/su-co-bai-hoc.md`, `docs/wiki/thuat-ngu.md`,
  `docs/wiki/tien-do.md`, `docs/wiki/tong-quan.md`, `docs/wiki/trien-khai-van-hanh.md`.
- **Vì sao:** đây **không** phải việc mới mà là **vá lỗi do vai kiểm thử phát hiện sau khi T016 đã nối xong**,
  nên wiki phải đối chiếu lại chứ không chỉ thêm mục mới. Cụ thể:
  (1) `5a78ff1` — `server.js` nạp gói bằng đường dẫn tương đối `packs/`, tức phụ thuộc thư mục làm
  việc; nay dùng `join(import.meta.dirname, 'packs')` nên việc nạp gói không phụ thuộc thư mục làm
  việc (`server.js:72`), và thêm cảnh báo **to** khi không nạp được gói nào thay vì im lặng
  (`server.js:74`). (2) `0842386` — câu báo lỗi chung của lõi mất thẻ màu `{orange}` so với đường cũ;
  đã khôi phục nguyên văn (`core/engine.js:13`).
- **Sửa cả nội dung, không chỉ số dòng:** (1) Vì hai commit trên làm dòng trong `server.js` dịch
  (dòng `VERSION` gộp vào dòng 25; các dòng 27–73 lùi 1; khối dựng engine gộp còn một dòng ở
  `server.js:76`), mọi trích dẫn
  `server.js:N` trong wiki đã đối chiếu lại với tệp thật. (2) Bốn test mới trong
  `test/core/one-gate.test.mjs` và `test/core/engine.test.mjs` làm số test tăng từ 270 lên 274; số
  liệu trong trang tiến độ và trang kiểm thử đã cập nhật, khối output được chép nguyên văn từ lần
  chạy mới. (3) Trang kiến trúc, trang não AI và trang triển khai vận hành được thêm ghi chú về việc
  nạp gói không phụ thuộc thư mục làm việc và về câu báo lỗi có thẻ màu `{orange}`.
- **Lưu ý về cổng kiểm:** `scripts/kiem-wiki.mjs` chỉ bắt trích dẫn **vượt quá độ dài tệp**, không bắt
  trích dẫn lệch dòng; vì vậy phần lớn việc trong đợt này là đối chiếu tay theo tệp thật.
- **Kiểm tra:** `npm test` 274 test xanh và `npm run eval` 7/7 đạt tại commit `0842386`;
  `node scripts/kiem-wiki.mjs --nghiem` ĐẠT.

## 2026-11-07 — Xong T016: nối `server.js` vào lõi `core/`, xoá thư mục `lib/`

- **Commit mã nguồn đã đọc:** `0842386` (T016 xong ở `6a9cf5e`; vá lỗi ở `5a78ff1` và `0842386`).
- **Trang wiki đã sửa:** `docs/wiki/an-toan.md`, `docs/wiki/du-lieu.md`, `docs/wiki/goi-nghiep-vu.md`,
  `docs/wiki/index.md`, `docs/wiki/kiem-thu.md`, `docs/wiki/kien-truc.md`, `docs/wiki/log.md`,
  `docs/wiki/luong-tin-nhan.md`, `docs/wiki/nao-ai.md`, `docs/wiki/nen-tang-zalo.md`,
  `docs/wiki/quan-he-vps-201.md`, `docs/wiki/su-co-bai-hoc.md`, `docs/wiki/thuat-ngu.md`,
  `docs/wiki/tien-do.md`, `docs/wiki/tong-quan.md`, `docs/wiki/trien-khai-van-hanh.md`, `README.md`.
- **Vì sao:** T016 nối lõi `core/` vào chương trình chính và xoá hẳn thư mục `lib/`. Trước đó repo
  có **hai** đường xử lý: đường cũ ở `lib/` và đường lõi ở `core/`, mà nhiều trang wiki vẫn mô tả
  theo kiểu "đường đang chạy" / "lõi mới chưa nối". Nay chỉ còn **một** đường: `server.js` nối
  thẳng vào lõi (`server.js:76`), gọi `gate.recover()` lúc khởi động (`server.js:77`), và chỉ
  `core/gate.js:79` gọi `channel.sendText` trong toàn bộ tệp sản xuất — nguyên tắc này được khoá
  bằng test `test/core/one-gate.test.mjs:167`. Vì vậy các trang phải viết lại phần mô tả: bỏ mô
  hình hai đường, bỏ mục "đường đang chạy (RAM)" trong trang dữ liệu, bỏ câu "lõi dùng chung hiện
  chưa có tác dụng" trong trang triển khai (nay mọi biến môi trường đều ảnh hưởng khách thật),
  và đổi số dòng mọi trích dẫn trỏ vào tệp đã bị xoá (mcp, bot, truot và tinh-hieu trong thư mục
  lib cũ) sang tệp thay thế (`core/mcp.js`, `core/mention.js`, `core/engine.js`,
  `packs/hs/miss-log.js`, `scripts/giam-sat/tinh-hieu.js`).
- **Sửa cả nội dung, không chỉ số dòng:** (1) Trang an toàn: điều I nay **đã có** test khoá
  (`test/core/one-gate.test.mjs:167`), mục "chưa có tệp test" bị bỏ; điều VII ghi `recover()`
  được gọi thật tại `server.js:77`. (2) Trang kiểm thử: bỏ giới hạn cũ "chưa có test bảo chứng
  một cửa gửi" — nay đã có; cập nhật số tệp test và số test đạt. (3) Trang nền tảng Zalo §10: mô tả
  cũ nói đường cũ trả khách **120 ký tự đầu lỗi gốc** — đối chiếu lịch sử code cho thấy đường cũ
  từng trả kèm lỗi gốc, nhưng lỗi đó đã được vá trước khi thư mục bị xoá; đã viết lại cho đúng
  thứ tự thời gian, không ghi "chưa xác minh" cho điều đã đọc code. (4) Trang triển khai và vận hành: giám sát nay đọc `bot.db` có dữ liệu thật nên mục
  "mâu thuẫn vận hành" đổi thành "dữ liệu giám sát giờ phản ánh hoạt động thật". (5) Trang tiến độ:
  T016 chuyển sang **Xong** kèm bằng chứng; các ghi chú cũ nói lõi chưa nối được ghi lại là lịch sử.
  (6) Ba trang còn sót: trang não AI sửa lại số dòng `server.js` và câu "não AI hiện chỉ nối ở đường đang
  chạy" — nay não **đã** được nối vào lõi đang chạy; trang quan hệ VPS 201 bỏ `lib/` khỏi danh sách mã;
  trang sự cố và bài học đổi câu "hai đường xử lý" thành "một đường xử lý".
- **Kiểm tra:** `npm test` 274 test xanh và `npm run eval` 7/7 đạt tại commit `0842386`
  (lần chạy gần nhất trong phiên sửa wiki này); `node scripts/kiem-wiki.mjs --nghiem` ĐẠT.

## 2026-11-07 — Phản ánh hai quyết định ngày 06/11 của chủ repo

- **Commit mã nguồn đã đọc:** `ef2b48f` (code không đổi trong đợt này; chỉ sửa tài liệu).
- **Lý do:** phản ánh hai quyết định của chủ repo ngày 06/11 mà repo chưa có:
  hiến pháp Điều II cho phép phòng `human` tự trở về `bot` sau khoảng lặng lâu,
  và thứ tự làm spec 003 trước 002.
- **Ngoài wiki:** hiến pháp lên phiên bản 2.0.0 và thêm mục lịch sử sửa đổi
  (`.specify/memory/constitution.md`); `specs/001-nen-tang-chung/spec.md`,
  `specs/001-nen-tang-chung/tasks.md`, `specs/001-nen-tang-chung/data-model.md`,
  `specs/001-nen-tang-chung/research.md` khớp Điều II mới; `docs/ROADMAP.md` thêm "003 trước 002".
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md`, `docs/wiki/an-toan.md`, `docs/wiki/su-co-bai-hoc.md`.
- **Chưa có code:** luật tự trở về sau khoảng lặng thuộc việc T022, chưa viết; đường đang chạy không đổi gì.
- **Kiểm tra:** `npm test`, `npm run eval`, `node scripts/kiem-wiki.mjs --nghiem` đều đạt.
## 2026-11-07 — Xong T038 (issue #27): gắn đúng tên trong nhóm, tách người trùng tên

- **Commit mã nguồn đã đọc:** `6e94671`. Lưu ý: code T038 còn ở working tree, **chưa có commit riêng**.
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md`, `docs/wiki/luong-tin-nhan.md`, `docs/wiki/log.md`.
- **Ngoài wiki:** `specs/001-nen-tang-chung/tasks.md` (tick ô Step 1 của T038, thêm ghi chú cho T019).
- **Vì sao:** T038 gắn tên người nhận ở đầu mọi tin ra trong nhóm; người trùng tên trong nhóm được phân biệt bằng hậu tố 2 ký tự cuối `userId` (FR-031, `core/mention.js:29`). Lõi tính `namePrefix` khi xử lý lượt (`core/engine.js:82`) và gắn lại tên lúc gửi kết quả việc nền (`core/jobs.js:84` — tệp này tên cũ là *core/engine-jobs.js*, tách ra ở T021). Bảng `convs` thêm `listByChat` để lấy danh sách người đã từng nhắn trong nhóm (`core/store/state.js:35`). Test nằm ở `test/core/group-tag.test.mjs`.
- **Kiểm tra:** `npm test` 254/254 đạt (cộng 34 test cũ ở `test/test.mjs`), `npm run eval` 7/7
  kịch bản đạt, `node scripts/kiem-wiki.mjs --nghiem` ĐẠT (16 trang).

## 2026-11-07 — Xong T037 (issue #26): cuộc trò chuyện riêng trong nhóm, khoá `conv_id`

- **Commit mã nguồn đã đọc:** `1316cfe`. Sáu commit trên `main`: `fd436d0`, `f4e7a4a`, `e6162b2`
  (feat) rồi `278f833`, `009c7d6`, `1316cfe` (fix).
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md`, `docs/wiki/du-lieu.md`, `docs/wiki/an-toan.md`,
  `docs/wiki/kiem-thu.md`, `docs/wiki/kien-truc.md`, `docs/wiki/luong-tin-nhan.md`,
  `docs/wiki/thuat-ngu.md`, `docs/wiki/tong-quan.md`, `docs/wiki/trien-khai-van-hanh.md`,
  `docs/wiki/log.md`.
- **Ngoài wiki:** `specs/001-nen-tang-chung/tasks.md` (tick ô Step 1 của T037),
  `specs/001-nen-tang-chung/data-model.md`, `specs/001-nen-tang-chung/contracts/send-gate.md`.
- **Vì sao:** T037 đổi khoá của mọi thứ theo người sang `conv_id` — chat 1-1 thì `conv_id = chat_id`,
  trong nhóm thì `conv_id = chat_id:user_id` (`core/conv.js:10`). Trạng thái "người cầm phòng"
  nay đọc theo người qua `effectiveState` (`core/gate.js:22`): `chats.state = 'blocked'` chặn cả
  nhóm, còn `human`/`blocked` ở bảng `convs` chỉ chặn đúng người đó. Lược đồ có bảng `convs` và cột
  `conv_id` ở `outbox`, `jobs`, `tickets`, `messages`, `audit`; `customers` khoá theo `conv_id`
  (`core/store/schema.js:17`). Cửa có thêm luật trần ngày của nhóm `cap:group`
  (`CAP_GROUP_DAY=200`, `core/gate-decide.js:97`). Vì vậy các trang wiki và spec phải đồng bộ lại:
  số bảng, số chỉ mục, danh sách `facts`, thứ tự kiểm của cửa, khoá idempotency và cách đọc
  trạng thái phòng.
- **Kiểm tra:** `npm test` 249/249 đạt (cộng 34 test cũ ở `test/test.mjs`), `npm run eval` 7/7
  kịch bản đạt, `node scripts/kiem-wiki.mjs --nghiem` ĐẠT (16 trang).

## 2026-11-07 — Vá câu báo lỗi gửi khách (issue #23), sửa trang an toàn

- **Commit mã nguồn đã đọc:** `ef2b48f`. Lưu ý: thay đổi code của issue #23 (sửa tệp lib/bot.js, dòng trả câu báo kèm lỗi gốc,
  thêm `test/core/loi-goc-khach.test.mjs`) còn nằm ở working tree, **chưa có commit riêng**.
- **Trang wiki đã sửa:** `docs/wiki/an-toan.md`, `docs/wiki/kiem-thu.md`, `docs/wiki/log.md`.
- **Vì sao:** đường đang chạy trước đây kèm lỗi gốc vào câu báo gửi khách (in 120 ký tự đầu của
  `e.message`), khách thật nhận được lỗi gốc — vi phạm Hiến pháp Điều IX
  (`.specify/memory/constitution.md:50`). Sau khi sửa, câu báo gửi khách không còn kèm lỗi gốc,
  chi tiết chỉ vào log. Trang an toàn được cập nhật cho khớp: chuyển nhận định "không kèm lỗi gốc"
  của đường đang chạy từ "Chưa có code" sang "Đã có code" (kèm test khoá), bổ sung dòng log
  trong lib/bot.js vào khoảng trống log chưa che, đổi ô Điều IX trong bảng tổng quan thành
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
