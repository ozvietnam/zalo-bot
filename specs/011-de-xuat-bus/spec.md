# Feature Specification: Khung đề xuất bus và điều phối tác vụ (ZB-01)

**Feature Branch**: `011-de-xuat-bus`

**Created**: 2026-11-09

**Status**: Draft

**Input**: Người quyết thay CEO (`oz-quyet`) phê duyệt lúc 08:00 từ kết quả `đề xuất bus`: "Duyệt mở ZB-01: tạo khung spec 011, CHỈ tài liệu, không đổi mã chạy, không chặn spec 007/005. ZB-05/ZB-06 không bắt đầu, chờ CEO chốt sau khi 007 xong."

## Bối cảnh và ranh giới

- Spec 011 là khung tài liệu kiến trúc và đặc tả quy trình điều phối đề xuất bus trong hệ sinh thái bot Zalo và văn phòng OZ.
- **Ranh giới bất khả xâm phạm**:
  1. Thẻ ZB-01 CHỈ tạo tài liệu khung đặc tả Markdown, tuyệt đối KHÔNG can thiệp hoặc sửa đổi mã nguồn thực thi hiện tại (`core/`, `packs/`, `channels/`, `server.js`).
  2. Không làm thay đổi hay cản trở tiến độ của các spec ưu tiên theo lộ trình đã được phê duyệt tại `docs/ROADMAP.md` (**001 → 007 → 005**).
  3. Hai thẻ ZB-05 và ZB-06 được giữ nguyên trạng thái chờ (Pending), không được phép triển khai cho đến khi spec 007 hoàn tất và có quyết định chính thức từ CEO.

## Khớp Hiến pháp (đối chiếu trước)

| Điều | Tuân thủ thế nào |
|---|---|
| I. Một cửa gửi | Mọi thông tin gửi ra bên ngoài (nếu có sau này) bắt buộc phải đi qua duy nhất `core/gate.js:68`. Khung spec 011 không thêm bất kỳ luồng gửi nào. |
| II. Người trước máy | Không tự phát gửi tin cho khách. Khi nhân viên tiếp quản hoặc phòng ở trạng thái `human`, bot giữ im lặng tuyệt đối. |
| III. Số tiền do code tra | Không can thiệp hay tự sinh bất kỳ con số tiền bạc, cước phí nào. |
| IV. Bằng chứng thắng lời khai | Mọi đề xuất tài liệu phải đối chiếu với hiện trạng mã nguồn thực tế và kiểm tra bằng cổng máy. |
| V. Tri thức một nhà | Tri thức nghiệp vụ nằm ở Cổng OZ (MCP) hoặc bảng dữ liệu có chủ, không tự ý nhúng logic nghiệp vụ vào tài liệu. |
| VI. Đơn giản, không phụ thuộc | Chỉ gồm các tệp tài liệu Markdown, không thêm dependency, tuân thủ cấu trúc spec-kit. |
| VII. Sai thì dừng | Khi phát hiện mâu thuẫn hoặc chưa có quyết định của người có thẩm quyền, dừng lại và ghi nhận báo cáo. |
| VIII. Trung thực với khách | Không hứa hẹn tính năng chưa triển khai. |
| IX. Bí mật không bao giờ lộ | Tài liệu công khai: không chứa IP nội bộ, khoá bí mật, số tài khoản hay số điện thoại/thông tin khách hàng. |

## User Scenarios & Testing

### User Story 1 - Khung tài liệu kiến trúc ZB-01 (Priority: P1)

Tạo khung đặc tả spec 011 chuẩn spec-kit phục vụ định hướng kiến trúc điều phối tác vụ bus mà không ảnh hưởng tới hệ thống đang vận hành.

**Acceptance Scenarios**:
1. **Given** kho mã nguồn đang vận hành ổn định trên nhánh `main`, **When** mở thẻ ZB-01, **Then** chỉ bổ sung các tệp Markdown trong thư mục `specs/011-de-xuat-bus/`, không có bất kỳ tệp thực thi nào bị sửa đổi.
2. **Given** bộ kiểm tra cổng máy (`npm test`, `npm run eval`, `node scripts/kiem-wiki.mjs`), **When** chạy kiểm thử, **Then** toàn bộ 100% các bài kiểm tra đều đạt kết quả xanh hợp lệ.

---

### User Story 2 - Trạng thái chờ cho ZB-05 và ZB-06 (Priority: P3)

Ghi nhận các đề xuất ZB-05 và ZB-06 vào khung dự thảo nhưng khoá ở trạng thái chờ (Pending) cho đến khi có quyết định của CEO.

**Acceptance Scenarios**:
1. **Given** spec 007 (Agent giám sát) chưa hoàn thành nghiệm thu toàn diện, **When** rà soát trạng thái triển khai, **Then** ZB-05 và ZB-06 không có bất kỳ hành động viết mã nào được thực hiện.
2. **Given** CEO chưa có văn bản phê duyệt chính thức sau khi spec 007 xong, **When** lập kế hoạch sprint tiếp theo, **Then** ZB-05 và ZB-06 tiếp tục giữ nguyên trạng thái chờ.

## Requirements

- **FR-001**: Khung spec 011 MUST là tài liệu dự thảo (Draft) theo cấu trúc spec-kit chuẩn.
- **FR-002**: Việc mở thẻ ZB-01 MUST NOT thay đổi bất kỳ tệp thực thi nào trong `core/`, `packs/`, `channels/` hay `server.js`.
- **FR-003**: Spec 011 MUST NOT can thiệp hoặc làm chậm lộ trình ưu tiên của spec 007 và spec 005.
- **FR-004**: Tuyệt đối MUST NOT thêm bất kỳ tin nhắn gửi chủ động nào cho khách hàng (tuân thủ Điều I và II Hiến pháp).
- **FR-005**: Tuyệt đối MUST NOT can thiệp logic tính toán tiền bạc, cước phí (tuân thủ Điều III Hiến pháp).
- **FR-006**: Toàn bộ tài liệu MUST bảo mật thông tin nội bộ, không chứa IP, mật khẩu, khoá API hay dữ liệu khách hàng (tuân thủ Điều IX Hiến pháp).
- **FR-007**: Hai thẻ ZB-05 và ZB-06 MUST giữ nguyên trạng thái chờ (Pending) cho đến khi CEO phê duyệt sau khi spec 007 hoàn tất.

## Success Criteria

- **SC-001**: PR ZB-01 chỉ chứa các tệp Markdown trong thư mục `specs/011-de-xuat-bus/`.
- **SC-002**: Toàn bộ cổng kiểm tra máy (`npm test`, `npm run eval`, `node scripts/kiem-wiki.mjs --nghiem`) báo xanh 100%.
- **SC-003**: 0 tin gửi chủ động, 0 can thiệp tiền bạc, 0 rò rỉ dữ liệu cá nhân hay bí mật nội bộ.

## Assumptions

- Khung spec 011 trong ZB-01 là tài liệu dự thảo (Draft) theo cấu trúc spec-kit, không làm thay đổi thứ tự ưu tiên của lộ trình 001 -> 007 -> 005 trong `docs/ROADMAP.md`.
- Hai thẻ ZB-05 và ZB-06 được giữ nguyên trạng thái chờ (Pending) và không có bất kỳ hành động triển khai nào cho đến khi CEO phê duyệt.

## Không làm (và lý do)

- **Không đổi mã chạy trong core/, packs/, channels/, server.js**: ZB-01 chỉ là khung tài liệu kiến trúc, không làm thay đổi hành vi hệ thống đang chạy.
- **Không gửi tin chủ động cho khách**: Tuân thủ nghiêm ngặt Điều I và II Hiến pháp.
- **Không can thiệp tiền bạc hay bảng giá**: Tuân thủ Điều III Hiến pháp.
- **Không bắt đầu ZB-05 và ZB-06**: Chờ CEO chốt sau khi spec 007 xong.
