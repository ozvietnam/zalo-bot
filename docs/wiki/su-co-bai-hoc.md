# Sự cố và bài học

> Cập nhật: 2026-11-07 · commit: 0842386

Trang này gom sự cố đã xảy ra thật và bài học rút ra. Nguồn chỉ gồm ba nơi trong repo: bảng sự cố vận hành ở `specs/001-nen-tang-chung/research.md:8`, sổ bàn giao triển khai ở `docs/sdd/001-ledger.md:1`, và các biên bản review trong `docs/sdd/`.

Không có số liệu nào trong trang này được ước lượng. Mọi con số đều bê nguyên văn từ nguồn.

## 1. Sự cố vận hành thật

Đo được khi vận hành bot CSKH trên Fanpage và Zalo của OZ, từ 22/09 đến 04/11/2026. Mười tám dòng trong bảng nguồn mô tả từng sự cố bằng số đo.

| Sự cố | Triệu chứng | Nguyên nhân | Bài học | Nguồn |
|---|---|---|---|---|
| Trả lời lặp hàng loạt | 2.534 bình luận lặp dưới Reel của 7 khách trong 2 giờ 25 phút | Vòng trả lời không có sổ "đã trả lời"; sửa cho hết crash rồi bật luôn | Phải có sổ đã trả lời trước khi bật bot | `specs/001-nen-tang-chung/research.md:10` |
| Gửi trùng nội dung | Một khách nhận 3 tin gần giống nhau trong 4 phút, bot tự giới thiệu lại 3 lần | Khoá chống trùng tự nhả ngay; hai tiến trình cùng xử lý một phòng | Chống trùng phải bền và phải chống được hai tiến trình | `specs/001-nen-tang-chung/research.md:11` |
| Sửa mất câu của người | Lớp "viết lại câu" đè mất câu xin lỗi đúng của người phụ trách | Cửa được quyền sửa chữ | Cửa gửi không được sửa chữ trong câu | `specs/001-nen-tang-chung/research.md:12` |
| Bot cướp lượt của nhân viên | 22 tin bot gửi ngay sau tin nhân viên gõ tay, trong 7 ngày | Hàng chờ tự nhận lại phòng "người" sau 45 phút không ai trả lời | Khi người cầm phòng thì bot phải im, không tự giành lại | `specs/001-nen-tang-chung/research.md:13` |
| Nhắc lại khách đã im | Khách đã được báo giá rồi im lặng, máy tự gửi lại sau 120 phút | Cơ chế "giữ lời hứa" tính cả việc đã xong | Chỉ giữ lời hứa khi còn việc nền thật | `specs/001-nen-tang-chung/research.md:14` |
| Báo sai số tiền | Báo 27.000 đ/kg thay vì 25.650; "1,5 tấn" đọc thành 1,5 kg; lớp hậu kiểm sửa 22.410 đúng thành 27.000 sai | Mô hình tự nhặt số; bộ đọc số yếu | Số tiền phải do code tra, mô hình chỉ diễn đạt | `specs/001-nen-tang-chung/research.md:15` |
| Lộ đường dẫn tệp nội bộ | Khách nhận nguyên văn đường dẫn tệp nội bộ của máy | Công cụ gửi chuỗi thô, không có lọc | Mọi tin ra khách phải qua bộ dò nội dung cấm | `specs/001-nen-tang-chung/research.md:16` |
| Lộ token trong thông báo lỗi | Thông báo lỗi Graph API in nguyên page token ra transcript | In lỗi gốc của API | Lỗi API gửi khách chỉ được là câu báo chung | `specs/001-nen-tang-chung/research.md:17` |
| Câu khuôn lặp lại | Khách hỏi "người hay AI" nhận cùng câu khuôn lần thứ 3 | Không chặn trùng, không có luật trung thực | Cần cả chặn trùng nội dung lẫn luật trung thực | `specs/001-nen-tang-chung/research.md:18` |
| Hứa vượt năng lực | Bot nói "em gửi catalog" trong khi công cụ chỉ gửi được chữ | Hứa vượt năng lực công cụ | Không hứa thứ công cụ không làm được | `specs/001-nen-tang-chung/research.md:19` |
| Mất tin khi chết tiến trình | Tin 7 ảnh không được ghi vào db; tiến trình bị giết 112 lần trong 5 giờ; khách chờ 5 giờ 49 phút | Gọi mô hình nhìn ảnh ngay trong bước ghi tin | Ghi tin trước, làm giàu sau | `specs/001-nen-tang-chung/research.md:20` |
| Trộn múi giờ | 9 báo động giả "sai giờ ~7 tiếng" | Trộn UTC với giờ VN | Lưu UTC, hiển thị giờ Việt Nam | `specs/001-nen-tang-chung/research.md:21` |
| Khai không có bằng chứng | Agent khai "đã đặt lịch", "đã đính chính" nhưng không có | Không có bản ghi đối chiếu | Câu "đã xong" phải trỏ được tới bản ghi | `specs/001-nen-tang-chung/research.md:22` |
| Nhầm khách trùng tên | Hai khách trùng tên, đánh dấu người này thì người kia cũng bị coi là xong | Dùng tên làm khoá | Khoá phải là mã chat, không phải tên | `specs/001-nen-tang-chung/research.md:23` |
| Chuyển người không tới ai | 87 khách để lại số điện thoại, 0 cuộc gọi; bot xin người 100 lần, không ai tới | "Chuyển người" không tới được người nào | Cần kênh nhân viên thật, không chỉ một lệnh trong bot | `specs/001-nen-tang-chung/research.md:24` |
| Tự chấm điểm | Điểm chấm tin thật 5,2/20 trong khi agent tự báo tốt | Agent tự chấm mình | Eval phải độc lập và chạy lại được | `specs/001-nen-tang-chung/research.md:25` |
| Tri thức rải rác | 12 luồng Python, tri thức nằm 5 nơi; anh Thắng chốt "không có hàm py ẩn" | Gặp nhu cầu là đẻ thêm luồng | Tri thức phải ở một nhà; không có logic ẩn ngoài repo | `specs/001-nen-tang-chung/research.md:26` |
| Bot mất uy tín nên tắt | Bot tắt hẳn; nhân viên tự trả lời 1.451 tin trong 7 ngày gần nhất | Không đủ tin cậy để bật lại | Sửa hết điều trên rồi mới bật lại; dữ liệu này làm bộ eval | `specs/001-nen-tang-chung/research.md:27` |

## 2. Sự cố kỹ thuật phát hiện khi xây lõi spec 001

Các lỗi dưới đây do review nội bộ phát hiện trước khi merge, không phải sự cố đã xảy ra trên khách.

| Sự cố | Triệu chứng | Nguyên nhân | Bài học | Nguồn |
|---|---|---|---|---|
| Bộ dò bí mật chặn nhầm | Câu có đường dẫn bài viết dài của công ty bị kết luận là "secret", bot im luôn và nhân viên nhận cảnh báo giả | Lớp dò chuỗi dài không tách URL ra trước | Luật dò bí mật phải bỏ qua URL trước khi so chuỗi dài | `docs/sdd/B1-review.md:50` |
| Mặc định TTL sai | Phiên hết hạn sau 30 phút thay vì 2 giờ như tài liệu | Mặc định trong cấu hình lệch với mô hình dữ liệu | Mặc định trong code phải khớp tài liệu và có test | `docs/sdd/B1-review.md:65` |
| Bộ đọc số nối sai hai số | Câu "mua 3 250.000đ" ra thành một số lớn hơn nhiều | Nhóm dấu cách giữa hàng nghìn bị nối vào nhóm trước | Bộ đọc tiền phải xử lý cách viết có dấu cách, phải có test | `docs/sdd/B1-review.md:67` |
| Nhận nhầm từ "đồng" | Câu "có 3 đồng ý" bị đọc thành số tiền | Đơn vị "đồng" không chặn được từ đứng sau | Đơn vị tiền tệ phải chặn ngữ cảnh, không chỉ chữ | `docs/sdd/B1-review.md:73` |
| Tin hoãn lách kiểm tiền | Tin có số tiền bị hoãn rồi gửi lúc 7 giờ sáng mà không qua kiểm số tiền | Bộ quét dựng lại bối cảnh thiếu cờ kiểm tiền và tập số đã có | Tin hoãn phải lưu đủ bối cảnh để quyết định lại y như lúc gửi | `docs/sdd/B2-review.md:42` |
| Tin kẹt vĩnh viễn khi chết tiến trình | Bot gửi được một phần rồi chết; khách không bao giờ nhận phần còn lại, không có cảnh báo | Bộ quét không lấy dòng trạng thái "đang gửi" và không có bước khôi phục lúc khởi động | Cần bước khôi phục lúc khởi động và báo nhân viên khi có tin dở | `docs/sdd/B2-review.md:53` |
| Gửi lại vào phòng của nhân viên | Tin gửi lỗi được thử lại và đến phòng đang do nhân viên cầm | Đường thử lại không kiểm lại trạng thái phòng | Thử lại cũng phải qua đủ luật của cửa gửi | `docs/sdd/B2-review.md:63` |
| Lịch thử lại thiếu bậc | Tin thử lại ở mốc 1 và 6 phút, không có mốc 15 phút như luật | Bộ đếm số lần thử lệch với định nghĩa trường | Luật thử lại và test phải dùng cùng một lịch | `docs/sdd/B2-review.md:69` |
| Lượt trùng khi đang xử lý | Hai lượt cùng khoá chạy song song: gọi công cụ trả phí hai lần, khách nhận hai kết quả việc nền | Dòng inbox ở trạng thái "chờ" bị coi là mới | Phải giành quyền xử lý dòng inbox bằng một giao dịch, không bằng kiểm rồi ghi | `docs/sdd/T015-review.md:40` |
| Lộ lỗi gốc cho khách | Câu báo lỗi của gói hải quan kèm nguyên văn lỗi của Cổng | Bắt ngoại lệ ở tầng gói đưa thẳng thông báo lỗi vào câu khách | Lỗi trả về từ tầng dưới phải đi qua một câu báo chung duy nhất | `docs/sdd/T015-review.md:52` |
| Câu báo lỗi bị bỏ âm thầm | Khách chỉ nhận phần đầu, phần báo lỗi bị bỏ vì trùng khoá, kết quả đã hứa không bao giờ tới | Câu báo lỗi dùng lại chỉ số của câu trả lời thứ nhất | Mỗi câu gửi phải có khoá riêng | `docs/sdd/T015-review.md:61` |
| Lớp tương thích nguy hiểm khi lên production | Bản tương thích tắt giờ yên, tắt trần, tắt kiểm trùng và dùng cơ sở dữ liệu trong RAM | Bản tương thích cho test có mặc định an toàn hơn bản thật | Bản tương thích phải tự ném lỗi khi chạy ở môi trường thật | `docs/sdd/T015-review.md:69` |
| Số điện thoại lọt vào bản ghi | Tin vào lưu 500 ký tự đầu đã che, nhưng bộ che không che số điện thoại | Bộ che mới chỉ biết token và chuỗi giống khoá | Che bí mật phải theo đúng danh sách hiến pháp, kể cả số cá nhân | `docs/sdd/T015-review.md:78` |
| Mở hai phiếu cho một phòng | Mở hai phiếu cùng một phòng trả về hai mã khác nhau | Thiếu ràng buộc một phiếu đang mở cho mỗi phòng | Ràng buộc "một phòng một phiếu mở" phải nằm trong lược đồ | `docs/sdd/T006-review.md:19` |
| Đọc đồng hồ trong tầng lưu trữ | Hai hàm của tầng lưu trữ tự gọi đồng hồ hệ thống, làm hỏng test với đồng hồ giả | Thiếu quy tắc "mọi tầng dưới phải nhận thời gian từ trên xuống" | Tầng lưu trữ không được tự đọc đồng hồ | `docs/sdd/T006-review.md:24` |
| Dữ liệu sai bị báo nhầm là trùng | Thêm việc nền thiếu trường bắt buộc trả về "không thêm được" như thể là trùng | Câu chèn "bỏ qua nếu trùng" nuốt cả lỗi ràng buộc | Chỉ bỏ qua khi đúng xung đột khoá, còn lỗi khác phải ném ra | `docs/sdd/T006-review.md:29` |
| Tệp cấu hình lọt vào ảnh Docker | Ảnh chứa cả tệp cấu hình biến thể vì chỉ loại trừ một tệp | Danh sách loại trừ chưa khớp với danh sách bỏ qua trong git | Ảnh phải sạch bí mật: loại trừ cả nhóm tệp cấu hình | `docs/sdd/T001-review.md:26` |
| Menu gói bị lặp | Hợp đồng gói nói lõi sẽ gắn dòng menu, nhưng gói đã tự gắn sẵn, nên câu trả lời có hai menu | Hợp đồng và code gói không khớp về ai chịu trách nhiệm gắn footer | Hợp đồng phải nói rõ ai gắn footer, và phải có test đếm số lần | `docs/sdd/T014-review.md:19` |
| Hai kiểu gửi tin cùng tồn tại | Lớp kênh cũ vẫn tự chia nhỏ tin rồi gửi, song song với cửa gửi mới | Lớp cũ giữ lại để test cũ chạy được, chưa dọn ở bước nối lõi | Đường cũ và đường mới cùng tồn tại là nguồn rủi ro lớn nhất (T016 đã dọn xong) | `docs/sdd/B3-review.md:25` |
| Commit tài liệu cuốn file của người khác | Một commit tài liệu không chỉ đụng tệp của mình mà còn cuốn tệp đang làm dở của người khác | Lệnh stage dùng chế độ "stage tất cả" thay vì chỉ đường dẫn cần thiết | Khi nhiều người làm song song, chỉ stage đúng đường dẫn của mình | `docs/sdd/001-ledger.md:35` |
| Vận hành chưa dùng được một số lệnh | Lệnh kiểm tra bị hoãn tới cuối vì tệp chưa có, PR phải giữ ở trạng thái nháp | Sửa chức năng còn dở dang để kịp mở pull request | Làm xong cả lệnh vận hành thì mới nói "xong" | `docs/sdd/001-ledger.md:39` |

## 3. Bài học rút ra cho người mới

- **Quyền gửi tin phải nằm ở code, không nằm ở prompt hay ở mô hình.** Nhiều sự cố trong bảng trên đều xảy ra khi luật an toàn nằm trong prompt và mô hình có quyền gửi. Xem `specs/001-nen-tang-chung/research.md:58`.
- **Sửa câu là một quyền lớn.** Lớp viết lại đã đè mất câu của người phụ trách (`specs/001-nen-tang-chung/research.md:12`). Nếu phải sửa câu, hãy tách rõ lớp sửa khỏi lớp gửi và luôn để lớp gửi là nơi duy nhất chạm vào kênh.
- **Mọi thao tác trên trạng thái phải là idempotent và bền.** Lượt trùng, tin kẹt sau khi chết tiến trình, tin gửi lại vào phòng người — cả ba đều do thiếu khoá bền và thiếu bước khôi phục (`docs/sdd/B2-review.md:53`).
- **Chặn nhầm cũng là sự cố.** Bộ dò bí mật chặn nhầm đường dẫn bài viết của công ty, làm bot im luôn (`docs/sdd/B1-review.md:50`). Mọi luật chặn đều phải có ca "không phải lỗi" để không chặn nhầm nội dung lành mạnh.
- **Mặc định trong code là một quyết định sản phẩm.** Sai mặc định TTL đã làm lệch cả tài liệu lẫn hành vi (`docs/sdd/B1-review.md:65`); bản tương thích cho test có mặc định nguy hiểm hơn bản thật (`docs/sdd/T015-review.md:69`). Mỗi mặc định phải có test.
- **Đừng tin câu "đã xong" nếu không có bản ghi.** Sự cố agent khai "đã đặt lịch" khi không có gì xảy ra (`specs/001-nen-tang-chung/research.md:22`) và sự cố tự chấm điểm (`specs/001-nen-tang-chung/research.md:25`) cùng một gốc rễ.
- **Làm nhiều việc song song thì phải stage đúng đường dẫn.** Một lệnh stage "tất cả" đã cuốn tệp của người khác (`docs/sdd/001-ledger.md:35`).

## 4. Nguồn

- Bảng sự cố vận hành gốc: `specs/001-nen-tang-chung/research.md:8`.
- Sổ bàn giao triển khai spec 001: `docs/sdd/001-ledger.md:1`.
- Các biên bản review: `docs/sdd/B1-review.md:1`, `docs/sdd/B2-review.md:1`, `docs/sdd/B3-review.md:1`, `docs/sdd/T001-review.md:1`, `docs/sdd/T006-review.md:1`, `docs/sdd/T008-review.md:1`, `docs/sdd/T014-review.md:1`, `docs/sdd/T015-review.md:1`.
- Trạng thái công việc hiện tại: [Tiến độ](tien-do.md).
- Bố cục hệ thống để hiểu vì sao hiện chỉ còn một đường xử lý: [Kiến trúc](kien-truc.md).
