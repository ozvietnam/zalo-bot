# Bảng công cụ Cổng OZ & Quy chuẩn xử lý dữ liệu

Tài liệu này chuẩn hoá hợp đồng tích hợp công cụ qua Cổng OZ (giao thức MCP - Model Context Protocol). Bảng dưới đây liệt kê các công cụ đang được triển khai, các tham số chính, tính chất thu phí/tính điểm, thời gian chờ tiêu chuẩn, và nguyên tắc bắt buộc khi xử lý nhãn dữ liệu `AI_CHUA_KIEM`.

---

## 1. Bảng công cụ Cổng OZ

| Tên công cụ | Tham số chính | Tính điểm / Tra cứu | Thời gian chờ (Timeout) | Mục đích & Gói sử dụng |
|---|---|---|---|---|
| `phan_loai_hs` | `tenHang` (bắt buộc), `chatLieu`, `congDung`, `thongSo`, `nguonThongSo` | Bắt đầu việc nền (tính điểm khi ra kết quả) | 150 giây (kết nối) / Việc nền đến 30 phút | Gói 1: AI gợi ý mã HS từ mô tả |
| `bo_sung_du_kien` | `maLuot` (UUID), `boSung` (chuỗi dữ kiện) | Tra cứu tiếp tục (không tính điểm thêm) | 150 giây | Gói 1: Bổ sung dữ kiện cho lượt phân loại trước |
| `ket_qua_phan_loai` | `maLuot` (UUID) | Tra cứu kết quả (không trừ thêm điểm) | 150 giây (truy vấn định kỳ qua việc nền) | Gói 1: Nhận kết quả phân loại mã HS |
| `tra_thue` | `maHs` (4/6/8 số), `xuatXu` (mã quốc gia, mặc định 'CN') | Chỉ tra cứu (miễn phí) | 150 giây | Gói 2: Biểu thuế MFN, ACFTA, VAT |
| `tra_thu_tuc_nhap_khau` | `maHs` (8 số) | Chỉ tra cứu (miễn phí) | 150 giây | Gói 2: Chính sách nhập khẩu, giấy phép, KTCN |
| `tim_ma_hs` | `tuKhoa` (chuỗi), `gioiHan` (số lượng, mặc định 6) | Chỉ tra cứu (miễn phí) | 150 giây | Gói 2: Tìm mã HS theo từ khóa tên hàng |
| `sinh_mo_ta_khai_bao` | `maHs`, `tenHang`, `chatLieu`, `congDung`, `thongSo`, `thuongHieu`, `model`, `xuatXu` | Tính điểm (hoặc kèm gói phân loại) | 150 giây | Gói 3: Soạn mô tả hàng hóa theo chỉ tiêu 1.78 |
| `soat_to_khai` | `dongHang` (danh sách dòng hàng kèm mã HS, mô tả) | Chỉ tra cứu nhanh (miễn phí) | 150 giây | Gói 4: Soát lỗi kỹ thuật tờ khai |
| `kiem_ma_to_khai` | `dongHang` (kèm mã HS, mô tả, `maLuotPhanLoai`) | Tính điểm (kiểm sâu bằng AI) | 150 giây (chạy việc nền) | Gói 4: So sánh mô tả với mã HS bằng AI |
| `ket_qua_soat` | `maLuot` (UUID) | Tra cứu kết quả (không tính điểm thêm) | 150 giây | Gói 4: Nhận kết quả kiểm sâu tờ khai |
| `tra_hieu_luc_van_ban` | `soHieu` (danh sách số hiệu văn bản) | Chỉ tra cứu (miễn phí) | 150 giây | Gói 5: Kiểm tra tình trạng hiệu lực văn bản |
| `tra_chu_giai` | `maHs` (chương/nhóm) | Chỉ tra cứu (miễn phí) | 150 giây | Gói 5: Tra cứu chú giải pháp lý HS |
| `tra_tien_le` | `maHs` (8 số) HOẶC `moTa` (chuỗi mô tả) | Chỉ tra cứu (miễn phí) | 150 giây | Gói 5: Tra cứu thông báo phân loại TB-TCHQ |
| `tra_cay_hs` | `maHs` (4/6 số) | Chỉ tra cứu (miễn phí) | 150 giây | Gói 5: Nở nhánh mã HS tìm các mã lá 8 số |
| `kiem_tra_shtt` | `tenNhan`, `maHs`, `xuatXu`, `tenNguoiNhap` | Tính điểm | 150 giây | Gói 6: Đèn rủi ro nhãn hiệu hàng hoá |
| `soan_ho_so_giai_trinh` | `loai`, `maKhai`, `maHaiQuan`, `moTaHang`, `lyDoHaiQuan`, `taiLieuCo` | Tính điểm | 150 giây | Gói 7: Dàn ý và hồ sơ giải trình tranh chấp mã |

---

## 2. Quy chuẩn xử lý nhãn `AI_CHUA_KIEM`

### 2.1. Quyết định kỹ thuật chốt một cách hiểu duy nhất
Trong kết quả trả về từ Cổng OZ, một số khối thông tin (đặc biệt là tóm tắt cảnh báo rủi ro chính sách, điều kiện giấy phép tổng hợp bằng LLM) có thể đi kèm trường nhãn nhận diện chất lượng dữ liệu:
```json
"nhanAi": "AI_CHUA_KIEM"
```

**Nguyên tắc xử lý:**
> Khi một khối đối tượng (object) chứa cờ `"nhanAi": "AI_CHUA_KIEM"`, hệ thống **BỎ TOÀN BỘ KHỐI ĐÓ** (bỏ cả object), tuyệt đối **KHÔNG** chọn lọc bỏ từng trường hay hiển thị một phần nội dung chưa kiểm chứng.

Logic này khớp chính xác với mã nguồn đang vận hành tại `packs/hs/render.js:161`:
```javascript
const w = x.warnings?.nhanAi === 'AI_CHUA_KIEM' ? null : x.warnings;
```

### 2.2. Lý do nghiệp vụ & pháp lý
1. **Tuân thủ Hiến pháp Điều V và VIII:** Tri thức hải quan phải có căn cứ xác thực từ văn bản quy phạm pháp luật hoặc kết quả kiểm tra chuyên môn. Tóm tắt do AI tạo ra chưa qua chuyên gia rà soát tiềm ẩn nguy cơ sai lệch điều kiện quản lý chuyên ngành, có thể khiến doanh nghiệp bị xử phạt vi phạm hành chính hoặc giam giữ hàng tại cảng.
2. **Nguyên tắc "Sai thì dừng" (Điều VII):** Thà không hiển thị cảnh báo chưa được kiểm định còn hơn cung cấp cho người dùng một cảnh báo sai hoặc thiếu chính xác.

### 2.3. Ví dụ minh hoạ

#### Ca 1: Cổng trả về khối cảnh báo có nhãn `AI_CHUA_KIEM`
- **Dữ liệu thô từ Cổng:**
```json
{
  "hsCode": "84137090",
  "taxNkPreferential": 0,
  "taxVat": "10%",
  "warnings": {
    "requiresLicense": false,
    "requiresInspection": true,
    "dualUseControl": true,
    "summary": "Sản phẩm hóa chất thuộc lĩnh vực CNTT cần kiểm tra chuyên ngành theo thông tư hướng dẫn...",
    "nhanAi": "AI_CHUA_KIEM"
  }
}
```
- **Xử lý chuẩn:**
  Toàn bộ khối `warnings` bị loại bỏ hoàn toàn (`w = null`).
- **Kết quả hiển thị cho khách:**
  Chỉ hiển thị thông tin thuế suất đã xác thực:
  ```text
  💰 Thuế — 8413.70.90 (xuất xứ CN)
  • NK ưu đãi (MFN): 0%
  • VAT: 10%
  ```
  Tuyệt đối không xuất hiện dòng `Chính sách` hay nội dung cảnh báo từ khối `warnings`.

#### Ca 2: Cổng trả về khối cảnh báo đã qua kiểm chứng (không có nhãn `AI_CHUA_KIEM`)
- **Dữ liệu thô từ Cổng:**
```json
{
  "hsCode": "84137090",
  "taxNkPreferential": 0,
  "taxVat": "10%",
  "warnings": {
    "requiresLicense": false,
    "requiresInspection": true,
    "summary": "Mặt hàng cần kiểm tra chất lượng theo QCVN trước khi thông quan."
  }
}
```
- **Xử lý chuẩn:**
  Khối `warnings` được giữ lại và hiển thị cảnh báo theo khuôn mẫu quy định.
