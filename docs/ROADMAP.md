# Lộ trình OZ Zalo Bot

Mỗi mục là một spec spec-kit riêng (`specs/NNN-ten/`). Spec sau chỉ bắt đầu khi spec trước đạt Success Criteria.
Thứ tự xếp theo: an toàn trước, rồi tới thứ ra tiền, rồi mới tới mở rộng.

| Spec | Tên | Cho ai | Ra tiền thế nào | Điều kiện bắt đầu |
|---|---|---|---|---|
| **001** | Nền tảng dùng chung | cả công ty | Không trực tiếp. Là điều kiện để bật lại bot cho khách (bot đang tắt từ 19/10/2026) | Đang làm · làm tiếp: **007**, rồi **005** |
| **002** | Tài khoản & điểm theo người dùng | khách tra cứu | Hiện mọi người dùng trừ điểm vào **một** `OZ_MCP_TOKEN` của công ty. 002: khách liên kết tài khoản Cổng OZ của mình (`xem_tai_khoan`), có hạn mức miễn phí/ngày, hết thì mời nạp điểm. Mỗi lượt tra cứu có tính phí là doanh thu, không còn là chi phí | 001 xong · làm **sau 003** |
| **003** | Gói CSKH bốn nấc | khách Fanpage/Zalo | Báo giá tạm tính + link sàn → hướng dẫn tự tìm hàng → gói dịch vụ tìm nguồn → khoá học 1-1. Mỗi nấc có điểm chuyển người đo được | 001 xong; eval ≥ 30 hội thoại thật; `moneyCheck: true` |
| **004** | Học từ người trả lời | đội CSKH | 1.451 tin nhân viên trả lời tay (7 ngày tới 04/11/2026) thành fixture eval + câu mẫu có nguồn; mỗi lần nhân viên sửa câu bot là một kịch bản mới | 003 chạy thử |
| **005** | Kênh thứ hai | khách Fanpage, Zalo OA | Messenger / Zalo OA theo `contracts/channel.md` với `detectsHumanReplies: true`: người gõ tay trên trang thì bot tự im | 001 xong |
| **006** | Gói nội bộ | nhân viên | Tra KPI, việc của mình, số liệu kế toán trên Google Sheet chung; `audience: 'staff'` | 001 xong; anh chốt phạm vi trợ lý kế toán |
| **007** | Agent giám sát & vòng nâng cấp | anh Thắng, đội dev | Script đo lỗi bằng code + Gemini miễn phí gom nhu cầu tuần → tự mở GitHub issue đúng repo (zalo-bot / ozplugin / hs-code-api), đo lại sau khi sửa. Mỗi lỗi bắt sớm là một lần không mất khách | 001 xong · làm **trước 005** |
| **008** | Cổng AI Studio (addon Chrome + hàng đợi dùng chung) | cả công ty | Chạy Gemini qua giao diện AI Studio thay vì API: soạn nháp CSKH và việc lô gần như 0 đồng; quá hạn thì tự chuyển API. Dùng chung cho hs-code-api, 007, SEO | 001 xong · phải có **trước 003** · sẽ tách repo `ozvietnam/studio-gateway` |
| **009** | Agent tra cứu hải quan (vòng lặp gọi công cụ Cổng + nhớ 4–6 lượt) | khách tra cứu | Bot hiểu câu hỏi gộp và câu hỏi nối tiếp, trả lời đúng ý thay vì đổ dữ liệu; dùng được cả 25 công cụ Cổng thay vì 7 gói cố định. Công cụ tính điểm chỉ chạy khi khách đồng ý | 001 xong lịch sử hội thoại (T033, T037), jobs (T021), eval (T030); chờ Clarify mô hình + ngưỡng chi phí |
| **010** | Giao việc cho thợ ngoài (Antigravity, Muse Code) từ Claude Code | đội dev | Không trực tiếp. Gói Anthropic Ultra đang hết hạn mức giữa phiên; thuê thợ ngoài (Google AI Ultra ~100 USD/tháng, hoặc Muse Code của Meta từ 5 USD/tháng) làm việc khối lượng lớn, Claude Code giao việc rồi chấm bài | **Nghiên cứu, chưa code** · mới có `specs/010-giao-viec-antigravity/spec.md`; chờ anh Thắng chốt 5 câu NEEDS CLARIFICATION (nhà cung cấp + mức gói, xác thực, `useG1Credits`, repo được chạm, máy chạy) |

## Thứ tự anh Thắng chốt (04/11 và 06/11/2026)

**001 → 007 → 005**, **008 trước 003** (cập nhật 04/11 18:05), và **003 trước 002** (cập nhật 06/11): có agent giám sát trước khi mở sang Fanpage. 005: anh chọn đưa lõi sang kênh Fanpage / Zalo OA. Ở đó khách thật đang nhắn nhiều nhất
(1.451 tin nhân viên trả lời tay trong 7 ngày), và kênh Messenger cho phép bot tự im khi thấy người gõ tay trên trang.
Các spec 004, 006 chưa xếp thứ tự; xếp lại khi 005 xong.

Lưu ý khi tới 003 (CSKH): đây là gói rủi ro nhất, vì 18 sự cố trong `specs/001-nen-tang-chung/research.md` đều ở mảng này.
003 cần eval của 004 chạy song song.

## Không làm (và lý do)

- **Không viết lại bằng framework** (NestJS, LangChain…): repo không có dependency và chạy ổn. Thêm framework là thêm thứ phải vận hành mà không chặn được sự cố nào trong research.
- **Không để bot gọi điện, tự chốt đơn, tự đặt giá**: kinh nghiệm 23/09: khâu "gọi chốt" là việc của người. Máy dọn đường (xếp thứ tự, soạn câu mở đầu, nhắc giờ).
- **Không thêm luồng quét định kỳ để "chăm sóc lại"** khách im lặng: Hiến pháp II. Tự về `bot` sau khoảng lặng không phải "chăm sóc lại": nó chỉ đổi trạng thái phòng, không gửi tin nào.
- **Không nhiều tiến trình / nhiều máy** trước khi lưu lượng cần. SQLite một tệp đủ cho vài nghìn tin/ngày.

## Về "lên trending GitHub"

Repo hiện là **private**, nên chưa thể lên trending. Muốn có cộng đồng thì nên mở **phần lõi** (`core/`, `channels/`, `eval/`,
khung gói mẫu) thành một repo công khai riêng: "khung bot Zalo an toàn cho doanh nghiệp, có cửa gửi, người cầm phòng, eval".
Gói nghiệp vụ, tri thức và khoá Cổng OZ vẫn để private. Việc tách repo chỉ nên làm sau khi 001 đạt SC-001…SC-007:
số đo thật là thứ thuyết phục người ngoài, README đẹp thì không.
