# Feature Specification: Cổng AI Studio, addon Chrome và hàng đợi dùng chung

**Feature Branch**: `008-cong-ai-studio`

**Created**: 2026-11-04

**Status**: Draft

**Input**: Anh Thắng (04/11/2026 18:01): "Vẫn cần triển khai addon điều khiển giao diện Studio của Gemini. Hỏi trực tiếp trên đó, bấm nút Run, đợi kết quả trả về và copy sang khung chat nhanh hơn nhiều, đỡ tốn token. Cái khó là cùng lúc có vài chục yêu cầu thì xử lý hàng đợi, cần bao nhiêu cửa sổ. Gemini key có giới hạn, lâu dài không đáp ứng được."

## Clarifications

### Session 2026-11-04 (anh Thắng trả lời)

- Q: Addon dùng cho việc nào? → A: **Cả việc lô và soạn nháp trả lời khách** (não CSKH của spec 003).
- Q: Chạy trên máy nào? → A: **Một máy riêng, luôn bật, Chrome profile riêng** chỉ dùng cho việc này. Addon kéo việc từ hàng đợi trên VPS.
- Q: Tab hỏng, bị giới hạn hoặc quá hạn thì sao? → A: **Chờ tab; quá hạn thì chuyển API** (Gemini API, rồi MiniMax qua 9Router như ở 201).

## Bối cảnh và ranh giới

- Đây là **một dịch vụ dùng chung cho cả công ty**, không riêng bot Zalo. Các repo khác cũng gọi được: vòng soạn dữ liệu của hs-code-api, gom nhu cầu tuần của spec 007, viết bài SEO. Spec được viết ở đây vì bot Zalo là khách hàng đầu tiên. Khi bắt tay làm thì tách thành repo `ozvietnam/studio-gateway`.
- Hiến pháp vẫn áp nguyên: **AI soạn, code quyết định gửi**. Nháp từ AI Studio về bot vẫn phải qua cửa gửi của 001 như mọi câu khác (điều I, III). Nháp trả về chậm hoặc sai khuôn thì không được gửi.
- Rủi ro anh đã chấp nhận: điều khoản của Google về tự động hoá giao diện, giao diện có thể đổi, giao diện cũng có hạn mức theo tài khoản. Spec giảm rủi ro bằng ba cách: nhịp thao tác như người, một tài khoản, và dự phòng API. **Không dùng nhiều tài khoản Google để lách hạn mức.**

## Cần bao nhiêu cửa sổ (định lượng)

Số tab cần mở tính theo định luật Little: **N = λ × W**, với λ là số yêu cầu mỗi giây lúc cao điểm, W là thời gian AI Studio xử lý một yêu cầu.

| Tình huống | λ | W (ước) | N tối thiểu | Ghi chú |
|---|---|---|---|---|
| Soạn nháp CSKH, giờ cao điểm | 30 yêu cầu / phút = 0,5/s | 20 s | **10 tab** | hạn chờ 45 s |
| Soạn nháp CSKH, bình thường | 6 / phút = 0,1/s | 20 s | 2 tab | |
| Việc lô (300 mục JSON) | đẩy một lần | 60 s/mục | 5 tab → ~60 phút | không có hạn gấp |

Các số W và λ chỉ là ước lượng. Bản đầu chạy với **3 tab** và đo W thật. Bộ điều phối tự mở thêm tab tới `MAX_TABS` (mặc định 8) khi việc chờ lâu hơn hạn. Nó đóng bớt tab khi rảnh 10 phút, và giảm ngay khi AI Studio báo giới hạn (nhiều tab hơn không vượt được hạn mức của tài khoản).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Hàng đợi có ưu tiên và hạn chờ (Priority: P1)

Repo nào cũng gửi được một yêu cầu tới hàng đợi trên VPS. Yêu cầu có mức ưu tiên và hạn chờ. Việc soạn nháp cho khách luôn đi trước việc lô.

**Independent Test**: Đẩy 300 việc lô, rồi đẩy 1 việc khách. Tab rảnh kế tiếp phải nhận việc khách trước.

**Acceptance Scenarios**:

1. **Given** có việc `kind: 'khach'` (ưu tiên 0, hạn 45 s) và 300 việc `kind: 'lo'` (ưu tiên 9), **When** một tab rảnh, **Then** tab nhận việc khách.
2. **Given** việc khách quá 45 s chưa có tab nhận, **When** hết hạn, **Then** hàng đợi chạy dự phòng API ngay. Nếu tab trả kết quả muộn, kết quả đó bị bỏ, không gửi khách hai câu.
3. **Given** hai yêu cầu giống hệt nhau (cùng hash nội dung và khuôn) trong 10 phút, **When** đẩy, **Then** dùng lại kết quả, không chạy lần hai.

---

### User Story 2 - Addon điều khiển nhiều tab AI Studio (Priority: P1)

Addon Chrome (Manifest V3) trên máy riêng nhận việc từ hàng đợi rồi làm như người: điền system instructions, dán nội dung, bấm Run, chờ chạy xong, lấy kết quả, trả về hàng đợi.

**Independent Test**: Trên một trang giả lập giống AI Studio (HTML tĩnh có ô nhập, nút Run, vùng kết quả xuất hiện chậm 5 giây), addon xử lý xong 10 việc qua 3 tab và trả đủ 10 kết quả đúng mã việc.

**Acceptance Scenarios**:

1. **Given** addon đã nhận một việc, **When** quá 120 s không có kết quả, **Then** việc được trả lại hàng đợi và tab đó được tải lại.
2. **Given** AI Studio hiện thông báo giới hạn hoặc lỗi, **When** addon thấy, **Then** báo `rate_limited` kèm giờ, tab nghỉ 15 phút, việc quay về hàng đợi.
3. **Given** phiên Google bị đăng xuất, **When** addon thấy trang đăng nhập, **Then** dừng nhận việc và báo vào nhóm nhân viên một lần. Addon không tự gõ mật khẩu.
4. **Given** việc yêu cầu JSON theo khuôn, **When** kết quả về, **Then** VPS kiểm khuôn. Sai khuôn thì chạy lại một lần trong cuộc trò chuyện mới, sai lần nữa thì chuyển dự phòng.

---

### User Story 3 - Não CSKH cắm vào bot qua cổng (Priority: P2)

Bot Zalo gọi `brain.draft(conv, yêu cầu)`. Cổng ẩn danh nội dung, gửi vào hàng đợi với hạn 45 s, và trả về nháp. Nháp vào gói CSKH, rồi đi qua cửa gửi như mọi câu khác.

**Independent Test**: Fixture eval của 003: tab giả trả nháp sau 10 s thì khách nhận câu đó. Tab giả im lặng thì sau 45 s khách nhận nháp từ API dự phòng. Không trường hợp nào khách nhận hai câu.

**Acceptance Scenarios**:

1. **Given** hội thoại có tên và số điện thoại khách, **When** gửi sang AI Studio, **Then** tên thành "Khách", số bị che. Khi nháp trả về, lõi thay lại tên thật trước khi vào cửa gửi.
2. **Given** nháp có số tiền, **When** vào cửa gửi, **Then** áp `moneyCheck` như mọi câu khác (Hiến pháp III).

---

### User Story 4 - Nhìn thấy cổng đang chạy ra sao (Priority: P2)

**Acceptance Scenarios**:

1. **Given** cổng đang chạy, **When** gọi `/metrics`, **Then** thấy: số tab sống, việc chờ theo loại, thời gian chờ p95, W p50/p95, số lần bị giới hạn, tỉ lệ chuyển dự phòng.
2. **Given** tỉ lệ dự phòng > 30 % trong một giờ, **When** đến bản tin, **Then** nhóm nhân viên được báo một lần.

### Edge Cases

- Máy chạy addon mất mạng hoặc tắt: hợp đồng thuê việc hết hạn, việc quay về hàng đợi, việc khách chuyển dự phòng sau 45 s.
- Google đổi giao diện, addon không còn tìm thấy nút Run: bộ chọn phần tử nằm trong một tệp cấu hình sửa được, không phải viết lại code. Tỉ lệ lỗi tăng vọt thì cổng tự chuyển hết sang dự phòng và báo.
- Kết quả rất dài: lấy bằng nút Copy của AI Studio thay vì đọc DOM, để không mất định dạng.
- Hai tab cùng nhận một việc: hàng đợi cấp hợp đồng thuê nguyên tử (một việc, một người thuê, có hạn).

## Requirements *(mandatory)*

- **FR-001**: Hàng đợi MUST chạy trên VPS, lưu bền (SQLite), có API: tạo việc, xem việc, thuê việc (long-poll), trả kết quả, nhịp tim.
- **FR-002**: Mỗi việc MUST có `kind` (`khach | nhan-vien | lo`), ưu tiên, hạn chờ, khuôn kết quả (nếu cần JSON) và chuỗi dự phòng.
- **FR-003**: Thuê việc MUST là nguyên tử, có hạn 120 s, gia hạn bằng nhịp tim. Hết hạn thì việc quay lại hàng đợi.
- **FR-004**: Addon MUST là Chrome MV3, chỉ chạy trên `aistudio.google.com`, xác thực với hàng đợi bằng token riêng, và không đọc trang nào khác.
- **FR-005**: Addon MUST quản lý một nhóm tab (mặc định 3, tối đa `MAX_TABS`). Mỗi việc mở một cuộc trò chuyện mới (không lẫn ngữ cảnh giữa các việc).
- **FR-006**: Bộ chọn phần tử (ô nhập, nút Run, vùng kết quả, dấu hiệu đang chạy, thông báo giới hạn, trang đăng nhập) MUST nằm trong một tệp cấu hình có phiên bản.
- **FR-007**: Nội dung có dữ liệu khách MUST được ẩn danh trước khi vào hàng đợi.
- **FR-008**: Quá hạn, sai khuôn hai lần, hoặc tab báo giới hạn thì MUST chuyển sang chuỗi dự phòng (Gemini API, rồi MiniMax qua 9Router). Kết quả muộn của tab sau khi đã dự phòng MUST bị bỏ.
- **FR-009**: Hệ thống MUST NOT dùng nhiều tài khoản Google để lách hạn mức, và MUST NOT tự đăng nhập.
- **FR-010**: Nhịp thao tác MUST có độ trễ giống người (gõ/dán, bấm cách nhau 300–1.500 ms ngẫu nhiên), mỗi tab tối đa 1 việc cùng lúc.

## Success Criteria *(mandatory)*

- **SC-001**: Nháp cho khách: p95 thời gian từ lúc gửi tới lúc có nháp (kể cả dự phòng) < 50 s.
- **SC-002**: 0 lần khách nhận hai câu cho cùng một tin (nháp muộn bị bỏ).
- **SC-003**: Tỉ lệ việc chạy qua addon (không dự phòng) ≥ 80 % trong tuần đầu chạy thật. Số này đo được chi phí API tiết kiệm.
- **SC-004**: Google đổi giao diện thì sửa xong trong ≤ 30 phút, chỉ bằng tệp bộ chọn (đo ở lần đổi đầu tiên).

## Assumptions

- Có một máy luôn bật (Mac hoặc PC) với một Chrome profile chỉ dùng cho việc này, đã đăng nhập một tài khoản Google.
- Hàng đợi đặt trên VPS mà cả bot lẫn máy addon cùng gọi được (qua tunnel Cloudflare hiện có).
- Spec 001 xong (cửa gửi, ẩn danh). Spec 003 dùng cổng làm não.
- **[NEEDS CLARIFICATION]** Hạn mức thật của giao diện AI Studio trên một tài khoản: phải đo trong tuần đầu, chưa có tài liệu.

## Không làm (và lý do)

- **Không để addon tự gửi tin cho khách**: addon chỉ trả nháp về hàng đợi, lõi bot quyết định có gửi hay không.
- **Không dùng nhiều tài khoản để nhân hạn mức**: vi phạm điều khoản, có thể mất cả tài khoản.
- **Không chạy addon trên Chrome hằng ngày của anh**: tab việc sẽ chiếm trình duyệt anh đang dùng, và tắt Chrome là hàng đợi dừng.
