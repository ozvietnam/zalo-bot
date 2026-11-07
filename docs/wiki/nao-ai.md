# Não AI
> Cập nhật: 2026-11-07 · commit: 64a728a

"Não" là tên gọi cho lớp AI (trí tuệ nhân tạo) đọc hiểu câu của khách. Trong repo có ba lớp não:

1. **Não định tuyến** — hiểu khách muốn gì, chọn gói, chép dữ kiện về đúng khuôn.
2. **Não biên tập** — rút gọn kết quả dài thành bản chốt ngắn.
3. **Khoá dự phòng** — một cổng LLM thứ hai để cứu khi nhà cung cấp chính lỗi.

Xem thêm: [Gói nghiệp vụ](goi-nghiep-vu.md) · [An toàn](an-toan.md) · [Luồng tin nhắn](luong-tin-nhan.md) · [Triển khai và vận hành](trien-khai-van-hanh.md)

> [!WARNING]
> Mọi câu khách gõ đi qua lớp não sẽ tới nhà cung cấp LLM của công ty. Chỉ dùng nhà cung cấp đã được công ty đồng ý.

## 1. Não định tuyến

Tệp: `packs/hs/brain.js`.

### Khi nào não được gọi

- Não **chỉ** hỏi ở chế độ Tự động. Điều kiện: không có não, hoặc kết quả bộ dò từ khoá không phải chạy gói, hoặc không ở chế độ Tự động thì trả nguyên kết quả cũ (`packs/hs/brain.js:197`).
- Lệnh rõ ràng không tốn lượt AI: mở menu, chọn gói, hỏi kết quả lượt, xem chi tiết (`packs/hs/router.js:14`).
- Khách đang mở một gói thì tin mới chạy thẳng gói đó, không hỏi não (`packs/hs/router.js:36`).

### Cách não trả lời

Não dùng cơ chế **function calling**: Gemini được cho danh sách hàm (function) và phải chọn một hàm cùng tham số.

Danh sách có 9 hàm (`packs/hs/brain.js:57`):

- 7 hàm theo gói: phân loại, thuế thủ tục, viết mô tả, kiểm tra, pháp luật, nhãn hiệu, giải trình.
- `hoi_lai` — chưa rõ ý hoặc thiếu dữ kiện bắt buộc thì hỏi lại **một** câu ngắn (`packs/hs/brain.js:70`).
- `khac` — chào hỏi, cảm ơn, câu ngoài phạm vi tra cứu thì trả lời ngắn, dẫn về menu (`packs/hs/brain.js:72`).

Chỉ gói đang khả dụng mới được đưa vào danh sách hàm. Mỗi hàm bắt buộc có trường `doChac` — độ tin cậy từ 0.0 đến 1.0 (`packs/hs/brain.js:67`).

### Kiểm khuôn sau khi AI trả lời

Kết quả AI **không** được tin thẳng. Code kiểm lại trong hàm `chuanHoa` (`packs/hs/brain.js:96`):

- **Chỉ giữ mã HS khách đã nêu.** Mã do AI tự đoán ra bị bỏ, có ghi log lý do (`packs/hs/brain.js:101`, `packs/hs/brain.js:102`).
- **Độ tin cậy phải đủ.** Dưới ngưỡng mặc định 0.5 thì bỏ kết quả AI (`packs/hs/brain.js:110`, `packs/hs/brain.js:120`).
- **Gói phải còn khả dụng.** Không còn trong danh sách công cụ Cổng thì bỏ (`packs/hs/brain.js:110`).
- **Kết quả cuối cùng vẫn phải khớp khuôn đầu vào của gói.** Mỗi gói có hàm `dung` riêng, thiếu trường bắt buộc thì trả `null` và não bỏ kết quả (`packs/hs/brain.js:36`, `packs/hs/brain.js:111`, `packs/hs/brain.js:112`).

Sau khi kiểm, não trả về một trong ba kiểu: chạy gói, hỏi lại, hoặc trả lời ngoài lề (`packs/hs/brain.js:116`, `packs/hs/brain.js:199`).

### Cấu hình

- Mẫu mặc định: `gemini-flash-lite-latest` (`packs/hs/brain.js:119`).
- Không có khoá và không có khoá dự phòng thì não không được tạo ra (`packs/hs/brain.js:121`).
- Không có khoá nhưng có dự phòng thì não chạy thẳng bằng dự phòng.

## 2. Não biên tập

Tệp: `packs/hs/editor.js`.

Kết quả phân loại gốc rất dài: nhiều mã ứng viên, lý do từng dòng. Não biên tập viết lại thành **bản chốt 4–7 dòng** cho khách (`packs/hs/editor.js:9`).

### Luật an toàn số liện

Hiến pháp điều III nói số tiền và thuế phải do code tra, không do mô hình tự ra. Vì vậy:

- Hàm `soDungChuan` kiểm **từng dãy số** trong bản chốt có xuất hiện trong bản gốc không (`packs/hs/editor.js:21`). So sánh đã bỏ dấu chấm, dấu phẩy và khoảng trắng, nên khác cách viết mã HS vẫn khớp.
- Không khớp thì **bỏ bản chốt**, giữ nguyên bản đầy đủ, khách không thấy con số sai (`packs/hs/editor.js:48`).
- Bản gốc dưới 80 ký tự thì đã ngắn, không tốn lượt AI (`packs/hs/editor.js:35`).

### Khi nào không biên tập

- Cổng đang hỏi khách bổ sung dữ kiện: câu hỏi phải tới khách nguyên văn (`packs/hs/packages.js:243`).

### Lệnh "chi tiết"

Bản đầy đủ được giữ trong phiên. Khách gõ `chi tiết` để mở lại bản phân tích đầy đủ của lượt gần nhất (`packs/hs/index.js:80`). Phiên giữ khoảng 2 giờ.

### Lọc chữ Trung

Đôi khi kết quả từ Cổng lẫn mệnh đề tiếng Trung. Bộ dựng câu bỏ cả câu chứa ký tự Trung (`packs/hs/render.js:53`, `packs/hs/render.js:55`). Đây là cách che tạm; phần sửa gốc nằm ở bên Cổng OZ.

## 3. Khoá dự phòng (LLM thứ hai)

Tệp: `packs/hs/llm2.js`.

Khi Gemini lỗi, quá tải hoặc quá giờ, hai lớp não tự chuyển sang một cổng LLM khác theo chuẩn OpenAI (`POST {base}/chat/completions`, `packs/hs/llm2.js:21`).

| Đặc điểm | Chi tiết | Chỗ |
|---|---|---|
| Cấu hình | Không gắn với nhà cung cấp nào: `LLM2_BASE_URL`, `LLM2_API_KEY`, `LLM2_MODEL` | `packs/hs/llm2.js:3` |
| Bật/tắt | Thiếu một trong ba biến thì tắt, không lỗi | `packs/hs/llm2.js:20` |
| Thời gian chờ | Mặc định 20 giây mỗi lượt | `packs/hs/llm2.js:19` |
| Gọi công cụ | Bắt buộc chọn hàm (`tool_choice: 'required'`) | `packs/hs/llm2.js:32` |
| Xử lý lỗi | Không bao giờ ném lỗi ra ngoài; lỗi thì trả `null` | `packs/hs/llm2.js:57` |

### Thứ tự thử

- Có khoá dự phòng thì não thử **một** mẫu Gemini rồi chuyển, không thử hai mẫu để khách khỏi chờ thêm một lượt quá giờ (`packs/hs/brain.js:126`, `packs/hs/brain.js:128`).
- `LLM_CHINH=llm2` thì đảo vai: khoá dự phòng chạy chính, Gemini chỉ cứu khi khoá dự phòng lỗi (`packs/hs/brain.js:123`, `server.js:39`).
- Không có `GEMINI_API_KEY` nhưng có dự phòng thì hai não chạy thẳng bằng dự phòng. Đọc ảnh vẫn chỉ dùng Gemini.
- Cùng luật an toàn cho cả hai nhà cung cấp: mã tự đoán bị loại, ngưỡng độ tin cậy, kiểm từng con số của bản chốt.

## 4. Bảng biến môi trường

| Biến | Mặc định | Tác dụng | Chỗ |
|---|---|---|---|
| `GEMINI_API_KEY` | — | Khoá Gemini. Dùng chung cho đọc ảnh và cả hai não. Trống thì tắt đọc ảnh | `.env.example:21` |
| `GEMINI_MODEL` | `gemini-flash-latest` | Mẫu đọc thông số từ ảnh | `.env.example:22` |
| `GEMINI_BRAIN_MODEL` | `gemini-flash-lite-latest` | Mẫu não định tuyến | `.env.example:25` |
| `GEMINI_EDITOR_MODEL` | `gemini-flash-latest` | Mẫu não biên tập | `.env.example:27` |
| `GEMINI_BRAIN` | — | Đặt `0` để tắt não định tuyến | `server.js:42` |
| `GEMINI_EDITOR` | — | Đặt `0` để tắt não biên tập | `server.js:45` |
| `LLM2_BASE_URL` | — | Phần địa chỉ **trước** `/chat/completions` | `.env.example:32` |
| `LLM2_API_KEY` | — | Khoá của cổng dự phòng | `.env.example:33` |
| `LLM2_MODEL` | — | Tên mẫu của cổng dự phòng | `.env.example:34` |
| `LLM2_TIMEOUT_MS` | 20000 | Thời gian chờ mỗi lượt dự phòng | `.env.example:36` |
| `LLM_CHINH` | — | Đặt `llm2` để khoá dự phòng làm mô hình chính | `.env.example:39` |

Biến được nối ở tệp khởi động: não định tuyến (`server.js:41`), não biên tập (`server.js:44`), khoá dự phòng (`server.js:36`).

Lưu ý: cấu hình của lõi mới (`core/config.js`) chưa có các khoá não AI; não AI hiện chỉ nối ở đường đang chạy. Xem [Kiến trúc](kien-truc.md).

## 5. Bảng "khi nào rơi về đường cũ"

"Đường cũ" ở đây là bộ dò từ khoá bằng quy tắc, tức `autoPick` trong bộ định tuyến. Não rơi về đó khi:

| Điều kiện | Nơi xử lý |
|---|---|
| Tắt não bằng `GEMINI_BRAIN=0`, hoặc thiếu cả khoá chính lẫn khoá dự phòng | `packs/hs/brain.js:121` |
| Não không được gọi vì tin không ở chế độ Tự động | `packs/hs/brain.js:197` |
| Gemini lỗi 429, 500, 502, 503, 504 (quá tải) thì thử mẫu kế rồi chuyển dự phòng | `packs/hs/brain.js:20`, `packs/hs/brain.js:169` |
| Gemini lỗi khác (sai khoá, sai đầu vào) thì bỏ Gemini, sang dự phòng hoặc rơi về quy tắc | `packs/hs/brain.js:170` |
| Hết mẫu Gemini và không có khoá dự phòng thì trả `null` | `packs/hs/brain.js:183` |
| Độ tin cậy dưới ngưỡng 0.5 hoặc gói không còn khả dụng | `packs/hs/brain.js:110` |
| Não tự đoán mã HS khách chưa nêu → bỏ trường mã, dùng dữ kiện của khách | `packs/hs/brain.js:101` |
| Não trả lời không khớp khuôn đầu vào của gói | `packs/hs/brain.js:111`, `packs/hs/brain.js:112` |
| Bản chốt có số không khớp bản gốc → giữ bản đầy đủ | `packs/hs/editor.js:48` |
| Bản gốc dưới 80 ký tự → không biên tập | `packs/hs/editor.js:35` |
| Cổng đang hỏi khách bổ sung dữ kiện → gửi nguyên văn, không biên tập | `packs/hs/packages.js:243` |

Điểm mấu chốt: não **không bao giờ** làm bot chết. Mọi lỗi đều trở thành `null` để nơi gọi rơi về đường cũ (`packs/hs/brain.js:117`).

## 6. Xem thêm

- [Gói nghiệp vụ](goi-nghiep-vu.md) — não chọn gói nào, dữ kiện khách nào chạy được.
- [An toàn](an-toan.md) — điều III (số tiền do code tra) mà não biên tập phải giữ.
- [Kiểm thử](kiem-thu.md) — bộ test riêng cho não định tuyến, não biên tập và khoá dự phòng.
