# Quy định đồng bộ mã nguồn một chiều (One-Way Sync)

Tài liệu này quy định việc chia sẻ và sao chép mã nguồn, hợp đồng ứng xử và bộ ca kiểm từ repo `ozvietnam/zalo-bot` (upstream) sang một repo riêng tư khác của OZ (downstream) để đảm bảo đồng nhất tiêu chuẩn chất lượng và an toàn bảo mật.

---

## 1. Nguyên tắc cốt lõi

### 1.1. Chiều đồng bộ: MỘT CHIỀU DUY NHẤT (One-Way Only)
- **Chiều cho phép:** Chỉ sao chép mã từ `ozvietnam/zalo-bot` (nguồn chính tắc - Single Source of Truth) sang repo riêng tư downstream.
- **CẤM TUYỆT ĐỐI nhận nội dung ngược chiều:** Không bao giờ gộp (merge), kéo (cherry-pick), hay nhận mã ngược chiều từ repo riêng tư quay trở lại repo `zalo-bot`. Mọi đóng góp, sửa đổi hay cải tiến kiến trúc cốt lõi phải được thực hiện trực tiếp tại `ozvietnam/zalo-bot` thông qua quy trình phát triển và kiểm thử nghiêm ngặt trước khi được đồng bộ sang nơi khác.

### 1.2. Quy ước ghim commit ở dòng đầu tệp chép (Commit Pinning Header)
Mọi tệp mã nguồn và tài liệu khi được sao chép sang repo downstream bắt buộc phải có dòng ghi chú ghim commit nguồn ở ngay dòng 1:

- Đối với tệp mã JavaScript (`.js`, `.mjs`):
  ```javascript
  // Nguồn: ozvietnam/zalo-bot@<commit-hash> · Chép một chiều, không sửa trực tiếp ở đây
  ```
- Đối với tệp Markdown (`.md`):
  ```markdown
  <!-- Nguồn: ozvietnam/zalo-bot@<commit-hash> · Chép một chiều, không sửa trực tiếp ở đây -->
  ```
- Đối với tệp JSON (`.json`):
  Các tệp JSON trong `eval/chung/` có trường `_nguon`:
  ```json
  "_nguon": "ozvietnam/zalo-bot@<commit-hash> (chep-mot-chieu)"
  ```

`<commit-hash>` là mã commit rút gọn (7 ký tự) hoặc đầy đủ của nhánh `main` tại thời điểm thực hiện sao chép.

---

## 2. Danh sách các tệp được phép chép sang repo khác

Chỉ các tệp tài liệu hợp đồng và mô-đun thuần túy (không phụ thuộc vào hạ tầng SQLite hay Zalo webhook của zalo-bot) mới được phép chép sang repo khác:

### 2.1. Tài liệu hợp đồng (`docs/hop-dong/`)
1. `docs/hop-dong/luat-ung-xu.md`: Các quy chuẩn ứng xử có mã số ổn định (`UX-01`…), trỏ tới hiến pháp và logic thực thi.
2. `docs/hop-dong/cong-cu-cong-oz.md`: Bảng đặc tả các công cụ Cổng OZ, tham số, timeout và quy chuẩn xử lý nhãn `AI_CHUA_KIEM`.
3. `docs/hop-dong/luoc-do-nhan-vat.md`: Lược đồ trường của nhân vật bot (danh tính, giá trị, giới hạn, hành vi theo kênh).
4. `docs/hop-dong/chep-mot-chieu.md`: Chính tài liệu này, đóng vai trò là quy chế vận hành đồng bộ.

### 2.2. Mô-đun thuần trong `core/`
1. `core/sanitizer.js`: Mô-đun thuần không I/O, Node 22, chuyên trách che số điện thoại Việt Nam, số tài khoản ngân hàng, và kiểm tra số học theo giá trị (chuẩn hoá dấu phẩy/chấm và phần trăm).

### 2.3. Bộ ca kiểm trung lập (`eval/chung/`)
1. `eval/chung/01-cong-loi-khong-bia-hs.json`: Ca kiểm Cổng lỗi không tự ý sinh mã HS giả.
2. `eval/chung/02-phan-biet-gia-tri-so.json`: Ca kiểm phân biệt giá trị số học giữa `2.5%` và `25%`.
3. `eval/chung/03-chan-sdt-va-so-tai-khoan.json`: Ca kiểm chặn rò rỉ số điện thoại và số tài khoản trong câu trả lời.
4. `eval/chung/04-hoi-nguoi-hay-may.json`: Ca kiểm bot nói thật khi được hỏi về danh tính người hay máy.
5. `eval/chung/05-khach-xin-sdt.json`: Ca kiểm xử lý khi khách xin số điện thoại liên hệ cá nhân.

---

## 3. Quy trình thực hiện sao chép

1. Đảm bảo toàn bộ test và eval trên `main` của `ozvietnam/zalo-bot` xanh tuyệt đối (`npm test`, `npm run eval`, `node scripts/kiem-wiki.mjs --nghiem`).
2. Xác định commit hash mới nhất trên `main`.
3. Sao chép các tệp nằm trong danh mục mục 2 sang repo đích.
4. Thêm dòng ghim commit header tương ứng vào đầu mỗi tệp tại repo đích.
5. Kiểm tra tính toàn vẹn của tệp sau khi chép tại repo đích.
