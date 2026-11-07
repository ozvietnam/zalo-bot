# Research: Nền tảng dùng chung (001)

## 1. Kinh nghiệm vận hành → yêu cầu

Nguồn: vận hành bot CSKH trên Fanpage + Zalo của OZ tại VPS 201 (Hermes Agent + Python), 22/09–04/11/2026.
Mỗi dòng là một sự cố đo được bằng log hoặc db. Cột cuối là chỗ spec này chặn sự cố đó.

| # | Ngày | Sự cố đo được | Gốc | Chặn bằng |
|---|---|---|---|---|
| 1 | 25/09 | 2.534 bình luận lặp dưới Reel của 7 khách trong 2 giờ 25 phút | Vòng trả lời không có sổ "đã trả lời", sửa cho hết crash rồi bật luôn | Hiến pháp I, VII · FR-001, FR-003 |
| 2 | 23/09 | Một khách Zalo nhận 3 tin gần giống nhau trong 4 phút, bot tự giới thiệu lại 3 lần | Khoá chống chạy trùng tự nhả ngay; hai tiến trình cùng xử lý một phòng | FR-004, FR-006 |
| 3 | 26/09 | Lớp "viết lại câu" đè mất câu xin lỗi đúng của người phụ trách | Cửa được quyền sửa chữ | Hiến pháp I (cửa không sửa chữ) |
| 4 | 01–08/10 | 22 tin bot gửi ngay sau tin nhân viên gõ tay, trong 7 ngày | Hàng chờ tự nhận lại phòng "người" sau 45 phút không ai trả lời | Hiến pháp II · FR-010…FR-014 |
| 5 | 28/09 | Khách đã được báo giá rồi im lặng, máy tự gửi lại sau 120 phút | Cơ chế "giữ lời hứa" tính cả việc đã xong | Hiến pháp II · FR-015 |
| 6 | 22/09 | Báo 27.000 đ/kg thay vì 25.650 (300 kg, bậc −5 %); "1,5 tấn" đọc thành 1,5 kg; lớp hậu kiểm sửa 22.410 đúng thành 27.000 sai | Mô hình tự nhặt số; bộ đọc số yếu | Hiến pháp III · FR-008 |
| 7 | 27/09 | Khách nhận nguyên văn đường dẫn tệp nội bộ của máy | Công cụ gửi chuỗi thô, không có lọc | Hiến pháp IX · FR-007 |
| 8 | 25/09 | Thông báo lỗi Graph API in nguyên page token ra transcript | In lỗi gốc của API | Hiến pháp IX · FR-022 |
| 9 | 26/09 | Khách hỏi "người hay AI" nhận cùng câu khuôn lần thứ 3 | Không chặn trùng, không có luật trung thực | Hiến pháp VIII · FR-006 |
| 10 | 26/09 | Bot nói "em gửi catalog" trong khi công cụ chỉ gửi được chữ | Hứa vượt năng lực công cụ | Hiến pháp VIII |
| 11 | 28/09 | Tin 7 ảnh không được ghi vào db; tiến trình bị giết 112 lần trong 5 giờ; khách chờ 5 giờ 49 phút | Gọi mô hình nhìn ảnh ngay trong bước ghi tin | FR-016 (ghi trước, làm giàu sau) |
| 12 | 26/09 | 9 báo động giả "sai giờ ~7 tiếng" | Trộn UTC với giờ VN | Ràng buộc thời gian · FR-023 |
| 13 | 24–25/09 | Agent khai "đã đặt lịch", "đã đính chính" nhưng không có | Không có bản ghi đối chiếu | Hiến pháp IV · FR-018 |
| 14 | 23/09 | Hai khách trùng tên, đánh dấu người này thì người kia cũng bị coi là xong | Dùng tên làm khoá | Data model: khoá là `chat_id` |
| 15 | 23/09 | 87 khách để lại số điện thoại, 0 cuộc gọi; bot xin người 100 lần, không ai tới | "Chuyển người" không tới được người nào | FR-012 (phiếu vào nhóm nhân viên) · FR-020 (một bản tin gộp) |
| 16 | 02–04/10 | Điểm chấm tin thật 5,2/20 trong khi agent tự báo tốt | Agent tự chấm mình | FR-021 (eval độc lập, chạy lại được) |
| 17 | 25/09 | 12 luồng Python, tri thức nằm 5 nơi; anh Thắng chốt "không có hàm py ẩn" | Gặp nhu cầu là đẻ thêm luồng | Hiến pháp V, VI · contract gói |
| 18 | 19/10–04/11 | Bot tắt hẳn; nhân viên tự trả lời 1.451 tin trong 7 ngày gần nhất | Không đủ tin cậy để bật lại | Spec này là điều kiện để bật lại; 1.451 tin là dữ liệu eval cho spec 003 |

## 2. Hiện trạng repo (đo 04/11/2026, commit 171cadb)

- Node 20+, không dependency, 1.583 dòng; `npm test` có 21 test, đều đạt.
- Đã tốt, giữ nguyên: client MCP tự đọc `tools/list`; 7 gói tra cứu; chống trùng `message_id`;
  giới hạn 10 tin/người/phút; bot trong nhóm chỉ trả lời khi được @nhắc; đọc ảnh qua Gemini rồi bắt người dùng xác nhận;
  `safeEqual` cho secret webhook; client Zalo không log token.
- Lỗ hổng mà spec này lấp:
  1. Mọi trạng thái nằm trong `Map` (phiên, chống trùng, việc nền). Khởi động lại là mất. Việc phân loại đang chạy nền (1–4 phút)
     bị mất kết quả, và Zalo gửi lại webhook thì có thể bị xử lý lần hai.
  2. Webhook trả 200 rồi xử lý trong bộ nhớ. Crash giữa chừng thì mất tin khách.
  3. Không xếp hàng theo phòng: hai tin liền nhau của cùng một người chạy song song trên cùng một phiên.
  4. Gửi tin rải rác ở nhiều chỗ (`send`, `notify`, `zalo.sendText`), không có một cửa chung.
  5. Không có trạng thái "người cầm phòng", không có kênh cho nhân viên.
  6. Không có audit, không có số đo, không có eval.
  7. `lib/bot.js` gộp hết mọi việc; muốn thêm gói không phải tra cứu (CSKH, nội bộ) thì phải sửa lõi.

## 3. Quyết định

| # | Quyết định | Lý do | Phương án bị loại |
|---|---|---|---|
| D1 | Lưu trữ bằng `node:sqlite` (một tệp, WAL), Node ≥ 22.13 | Không thêm dependency (VI); một tiến trình là đủ cho lưu lượng hiện tại; đã chạy thử được trên Node 22.22 | Redis/Postgres: thêm dịch vụ phải vận hành. `better-sqlite3`: là dependency native |
| D2 | Ghi tin vào bảng `inbox` **trước** khi trả 200; xử lý sau; khởi động lên thì xử lý tiếp các dòng còn `pending` | Sự cố #11: ghi trước, làm giàu sau | Xử lý trong bộ nhớ như hiện nay |
| D3 | Hàng đợi theo phòng trong tiến trình (chuỗi promise theo `chat_id`) | Chặn sự cố #2 mà không cần hệ thống queue ngoài | BullMQ/RabbitMQ: thừa với một tiến trình |
| D4 | Gói **trả về** danh sách tin; chỉ lõi gửi, qua `gate` | Hiến pháp I: không cách nào để gói gửi vòng qua cửa | Đưa `zalo` vào cho gói tự gọi (cách hiện nay) |
| D5 | Chống trùng nội dung bằng Jaccard trên tập từ đã chuẩn hoá (bỏ dấu, thường), ngưỡng 0,8, so với 4 tin gần nhất trong 15 phút | Ngưỡng 0,8 và cửa sổ 15 phút đã dùng thật trên 201, bắt đúng ca #2 và #9 | Levenshtein: chậm với tin dài, nhạy với thứ tự câu |
| D6 | Nhân viên cầm phòng qua **một nhóm Zalo nhân viên** có mời bot: bot đưa phiếu vào nhóm; nhân viên trả lời bằng lệnh `/tl <mã> <nội dung>`, `/nhan <mã>`, `/tra-bot <mã>` | Zalo Bot Platform không có giao diện cho người trả lời thay bot; nhóm Zalo thì nhân viên đã dùng hằng ngày | Web console: để dành cho spec sau |
| D7 | Việc nền (`maLuot`) lưu vào bảng `jobs`; một bộ hỏi kết quả duy nhất chạy theo lịch; khởi động lên thì chạy tiếp | Không mất kết quả khi khởi động lại; tin kết quả là tin chủ động nên chịu giờ yên | Vòng `while` chờ trong lượt xử lý như hiện nay |
| D8 | Eval = phát lại hội thoại mẫu (`eval/fixtures/*.jsonl`) qua đúng lõi, với Zalo và Cổng OZ giả lập, chấm bằng các khẳng định (assertion) | Chạy lại được, không tốn token, chặn được tụt chất lượng ở cổng merge | Để agent tự chấm (sự cố #16) |

| D9 | **Lõi lai**: lõi Node tự viết giữ luật an toàn; Hermes/LLM chỉ là "não" soạn nháp cho gói cần, qua một giao diện `brain.draft()` định nghĩa ở spec 003 | 18 sự cố ở 201 đều xảy ra khi luật an toàn nằm trong prompt/skill của agent và agent có quyền gửi; lõi lai giữ được sức mạnh của AI mà quyền gửi nằm ở code (anh Thắng chốt 04/11) | Hermes làm lõi (mô hình đã phải tắt từ 19/10); không dùng AI (CSKH không tự nhiên) |
| D10 | Lưu **toàn bộ tin nhắn** (`messages`) tách khỏi `audit` | Nhân viên cần lịch sử khi nhận phòng; spec 004 học từ tin người trả lời; audit thì xoá sau 90 ngày | Chỉ đếm số: nhân viên phải hỏi lại khách |
| D11 | **Hồ sơ khách + nhãn do code gắn** trong 001; phân loại bằng mô hình để spec 003 | Nhãn theo luật kiểm được bằng test; 201 từng bị mô hình đổi nhóm khách theo từng lượt (bài 129) | Gắn nhãn bằng LLM ngay: không test được, đổi nhãn tuỳ hứng |

## 4. Mặc định em đã chọn (đổi được, ghi ở `.env`)

| Tham số | Mặc định | Nguồn |
|---|---|---|
| Trần tin bot / phòng / ngày | 8 | Trần đã dùng trên 201 |
| Trần tin bot / ngày toàn bot | 300 | ~2 lần lưu lượng tra cứu dự kiến |
| Giờ yên | 23:00–07:00 giờ VN | Luật đang áp trên 201 |
| "Trả lời trực tiếp" | tin ra trong 10 phút kể từ tin khách | Ngoài khoảng này coi là tin chủ động |
| Phiếu chờ người quá hạn | 15 phút → nhắc một lần trong bản tin gộp | Mắt canh "khách chờ > 15 phút" trên 201 |
| Phòng `human` tự về `bot` | Tự về sau khoảng lặng lâu, mặc định khoảng 2 giờ | Hiến pháp II, anh Thắng chốt 04/11; đổi 06/11 |
| Giữ tin nhắn | Tới khi bị xoá theo yêu cầu (`/xoa-du-lieu`) | Anh chọn lưu toàn bộ |
| Giữ audit | 90 ngày | Anh chọn |
| Số của OZ không ghi làm số khách | `COMPANY_PHONES` (vd 0916366669, 0966992369) | 201: số trong bài giới thiệu Page bị khách dán lại ở hàng chục phòng |

## 5. Để mở, không chặn spec này

- **Nhóm Zalo nhân viên** (`STAFF_CHAT_ID`): anh tạo nhóm, mời bot vào, rồi điền id. Chưa có thì phiếu chỉ ghi vào db và audit.
- **Tính điểm theo từng người dùng** trên Cổng OZ (hiện mọi người dùng trừ điểm vào một `OZ_MCP_TOKEN` chung): làm ở spec 002.
- **Gắn tên / trích dẫn tin trong nhóm trên Zalo Bot Platform**: tài liệu chính thức mới mô tả sơ lược (bot nhận sự kiện khi được @nhắc hoặc được trích dẫn; `chat.id` là id nhóm), chưa có trường để @nhắc một người hay trả lời trích dẫn; tính năng nhóm còn đang thử nghiệm nội bộ (theo issue goclaw #1543). v1 gắn tên bằng chữ `@Tên` (như code hiện tại) + hậu tố khi trùng tên; `capabilities.replyTo` bật khi Zalo công bố API.
- **Giới hạn gửi của Zalo Bot Platform** (rate limit, khung thời gian bot được nhắn sau tin người dùng): chưa có tài liệu
  chính thức trong tay. Cửa gửi đọc giới hạn từ config để chỉnh mà không phải sửa code.
