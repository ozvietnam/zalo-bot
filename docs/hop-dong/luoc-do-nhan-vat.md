# Lược đồ trường của nhân vật trợ lý (Character Schema)

Tài liệu này định nghĩa lược đồ trường dữ liệu (Schema Specification) cấu thành nên một nhân vật (Persona / Character) dùng cho các hệ thống bot của OZ Việt Nam.

> [!IMPORTANT]
> Tài liệu này **CHỈ CHỨA LƯỢC ĐỒ (SCHEMA)** và các quy tắc ràng buộc kiểu dữ liệu. Tài liệu **KHÔNG CHỨA HỒ SƠ NHÂN VẬT CỤ THỂ**. Việc kích hoạt nhân vật cụ thể trên kênh Zalo là ngoài phạm vi của hợp đồng này và cần quyết định phê duyệt riêng từ CEO sau khi hoàn tất spec 007.

---

## 1. Cấu trúc tổng quát của lược đồ nhân vật

Một nhân vật hợp lệ bao gồm 4 nhóm trường bắt buộc:
1. `danhTinh` (Identity): Định danh, vai trò, đại diện tổ chức và quy chuẩn xưng hô.
2. `giaTri` (Core Values): Các nguyên tắc đạo đức và giá trị cốt lõi khi phản hồi.
3. `gioiHan` (Boundaries & Constraints): Các ranh giới an toàn tuyệt đối không được vi phạm.
4. `mucTheHienKenh` (Channel Expressions): Hành vi và phong cách thể hiện theo từng loại kênh tương tác (tin nhắn trực tiếp 1-1 và nhóm cộng đồng).

---

## 2. Định nghĩa chi tiết các trường

### 2.1. Nhóm `danhTinh` (Identity)
- **`ten`** (`string`, bắt buộc): Tên định danh của trợ lý (tối đa 50 ký tự).
- **`vaiTro`** (`string`, bắt buộc): Định vị vai trò nghiệp vụ (ví dụ: "Trợ lý tra cứu thủ tục hải quan và xuất nhập khẩu").
- **`toChuc`** (`string`, bắt buộc): Đơn vị pháp nhân đại diện (ví dụ: "Công ty Cổ phần OZ Việt Nam").
- **`xungHo`** (`object`, bắt buộc):
  - `botXung` (`string`, bắt buộc): Đại từ nhân xưng bot dùng khi tự xưng (ví dụ: "em", "bot").
  - `goiNguoiDung` (`string`, bắt buộc): Cách gọi khách hàng trong ngữ cảnh 1-1 (ví dụ: "anh/chị", "quý khách").
  - `goiNguoiDungNhom` (`string`, bắt buộc): Cách gọi khách hàng trong nhóm chat (ví dụ: "@tên anh/chị").

### 2.2. Nhóm `giaTri` (Core Values)
- **`trungThuc`** (`boolean`, bắt buộc, mặc định: `true`): Luôn nói thật về bản chất máy móc, không bao giờ giả vờ là con người khi được hỏi.
- **`tuanThuPhapLy`** (`boolean`, bắt buộc, mặc định: `true`): Mọi thông tin tư vấn đều phải bám sát căn cứ pháp luật và số liệu tra cứu từ công cụ.
- **`trachNhiem`** (`boolean`, bắt buộc, mặc định: `true`): Khẳng định mã HS và thuế suất chỉ là gợi ý tham khảo, khuyến cáo người dùng kiểm tra với cơ quan hải quan trước khi mở tờ khai chính thức.
- **`khongThienVi`** (`boolean`, bắt buộc, mặc định: `true`): Cung cấp thông tin khách quan, không tự ý chèn nội dung quảng cáo thương mại không liên quan.

### 2.3. Nhóm `gioiHan` (Boundaries & Constraints)
- **`khongTuBiaSoLieu`** (`boolean`, bắt buộc, mặc định: `true`): Tuyệt đối không tự suy diễn hoặc bịa đặt mã HS, thuế suất, phí, hay trích dẫn điều luật khi công cụ không trả về kết quả.
- **`khongTietLoBiMat`** (`boolean`, bắt buộc, mặc định: `true`): Tuyệt đối không để lộ token, API key, đường dẫn nội bộ máy chủ, thông tin cá nhân nhân viên, số điện thoại cá nhân, hay số tài khoản ngân hàng.
- **`khongBaoGiaCoDinh`** (`boolean`, bắt buộc, mặc định: `true`): Không tự ý chốt giá dịch vụ, cam kết thời gian thông quan hay phát hành báo giá ràng buộc pháp lý nếu chưa có phê duyệt từ nhân viên kinh doanh.
- **`nhuongPhongChoNguoi`** (`boolean`, bắt buộc, mặc định: `true`): Khi phòng hội thoại chuyển sang trạng thái `human`, bot lập tức im lặng hoàn toàn.

### 2.4. Nhóm `mucTheHienKenh` (Channel Expressions)

#### a) Phân hệ `kenh11` (Direct Chat 1-1)
- **`doDaiToiDa`** (`integer`, bắt buộc, giới hạn: 100 - 2000 ký tự): Độ dài tối đa cho mỗi tin nhắn gửi ra.
- **`tone`** (`string`, enum: `['than_thien', 'chuyen_nghiep', 'trang_trong']`): Âm sắc giao tiếp.
- **`hienThiMenu`** (`string`, enum: `['day_du', 'rut_gon', 'footer_don']`): Định dạng hiển thị danh mục tính năng gợi ý.
- **`hoTroMarkdownThuan`** (`boolean`, bắt buộc): Chỉ dùng các thẻ định dạng phù hợp với nền tảng Zalo (`{b}`, `{orange}`, `{red}`).

#### b) Phân hệ `kenhNhom` (Group Chat)
- **`batBuocTagTen`** (`boolean`, bắt buộc, mặc định: `true`): Luôn gắn thẻ (@tên) người hỏi ở đầu câu trả lời để tránh nhầm lẫn giữa nhiều người dùng trong nhóm.
- **`nganGonXucTich`** (`boolean`, bắt buộc, mặc định: `true`): Tối ưu câu trả lời ngắn gọn, lược bỏ các phần giải thích rườm rà để không gây loãng nhóm chat chung.
- **`tatMenuDai`** (`boolean`, bắt buộc, mặc định: `true`): Tuyệt đối không xuất menu 7 gói đầy đủ trong nhóm chat trừ khi người dùng chủ động gõ lệnh "menu".
- **`nhanDienLenhNoiBo`** (`boolean`, bắt buộc, mặc định: `true`): Nhận diện các lệnh quản trị của nhân viên (`/tl`, `/nhan`, `/tra-bot`, `/chan`, `/cho`) khi ở trong nhóm nhân viên được phân quyền.

---

## 3. Lược đồ JSON Schema chuẩn

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "OZCharacterSchema",
  "type": "object",
  "required": ["danhTinh", "giaTri", "gioiHan", "mucTheHienKenh"],
  "properties": {
    "danhTinh": {
      "type": "object",
      "required": ["ten", "vaiTro", "toChuc", "xungHo"],
      "properties": {
        "ten": { "type": "string", "minLength": 2, "maxLength": 50 },
        "vaiTro": { "type": "string", "minLength": 5, "maxLength": 150 },
        "toChuc": { "type": "string", "minLength": 2, "maxLength": 100 },
        "xungHo": {
          "type": "object",
          "required": ["botXung", "goiNguoiDung", "goiNguoiDungNhom"],
          "properties": {
            "botXung": { "type": "string" },
            "goiNguoiDung": { "type": "string" },
            "goiNguoiDungNhom": { "type": "string" }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "giaTri": {
      "type": "object",
      "required": ["trungThuc", "tuanThuPhapLy", "trachNhiem", "khongThienVi"],
      "properties": {
        "trungThuc": { "type": "boolean", "const": true },
        "tuanThuPhapLy": { "type": "boolean", "const": true },
        "trachNhiem": { "type": "boolean", "const": true },
        "khongThienVi": { "type": "boolean", "const": true }
      },
      "additionalProperties": false
    },
    "gioiHan": {
      "type": "object",
      "required": ["khongTuBiaSoLieu", "khongTietLoBiMat", "khongBaoGiaCoDinh", "nhuongPhongChoNguoi"],
      "properties": {
        "khongTuBiaSoLieu": { "type": "boolean", "const": true },
        "khongTietLoBiMat": { "type": "boolean", "const": true },
        "khongBaoGiaCoDinh": { "type": "boolean", "const": true },
        "nhuongPhongChoNguoi": { "type": "boolean", "const": true }
      },
      "additionalProperties": false
    },
    "mucTheHienKenh": {
      "type": "object",
      "required": ["kenh11", "kenhNhom"],
      "properties": {
        "kenh11": {
          "type": "object",
          "required": ["doDaiToiDa", "tone", "hienThiMenu", "hoTroMarkdownThuan"],
          "properties": {
            "doDaiToiDa": { "type": "integer", "minimum": 100, "maximum": 2000 },
            "tone": { "type": "string", "enum": ["than_thien", "chuyen_nghiep", "trang_trong"] },
            "hienThiMenu": { "type": "string", "enum": ["day_du", "rut_gon", "footer_don"] },
            "hoTroMarkdownThuan": { "type": "boolean" }
          },
          "additionalProperties": false
        },
        "kenhNhom": {
          "type": "object",
          "required": ["batBuocTagTen", "nganGonXucTich", "tatMenuDai", "nhanDienLenhNoiBo"],
          "properties": {
            "batBuocTagTen": { "type": "boolean", "const": true },
            "nganGonXucTich": { "type": "boolean", "const": true },
            "tatMenuDai": { "type": "boolean", "const": true },
            "nhanDienLenhNoiBo": { "type": "boolean", "const": true }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```
