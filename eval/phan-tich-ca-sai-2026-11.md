# Phân tích nhóm nguyên nhân các ca SAI — bộ đo độ đúng HS (OZV-323, Số đo 2)

> Thẻ OZV-2323 · viết 26/11/2026 · phân tích trên dữ liệu có sẵn, **không chạy Cổng thật** (luật "một phép đo, một chủ" — OZV-608: bộ 50 ca do GĐ hs-code-api làm chủ).
> Phạm vi: chỉ thêm tệp này. Không sửa `core/`, `packs/`, `scripts/`, không đổi test.

## 1. Nguồn dữ liệu

- Phép đo được phân tích: **mốc Cổng thật 12/11** do GĐ hs-code-api công bố — top-1 **33/50 (66%)**, top-3 **40/50 (80%)** (báo cáo gốc `bao-cao/do-dung/2026-11-12.md` tại `zalo-bot@d776735`, tệp bị `.gitignore` nên không còn trong git).
- Dữ liệu từng ca lấy từ **ảnh chụp phép đo đó**: `/paperclip/workspaces/hs-code-api/tests/bo-50-ca-tb-tchq.json` (`version: "2026-11-12"`, trường `chuanCong1211` = `{tong:50, top1:33, top3:40, khongRaMa:7, dung6So:5, roiVaoMaLan:1}`, mỗi ca có `maBot`, `top1`, `top3`, `giay`).
- Đã đối chiếu bộ đề 2 nơi: `eval/bo-de/phan-loai-tu-luat.json` trên main `c531f1a` khớp **50/50 ca** (mã + câu khách) với bản trong tệp ảnh chụp ⇒ phân tích đúng bộ đề hiện hành.
- Kiểm khớp số: 33 đúng + 7 ca "đúng nhưng không vị trí 1" = **40 top-3** ✓; sai top-1 = 7+7+3 = **17** ✓.

## 2. Số tổng

| Chỉ số | Giá trị |
|---|---|
| Tổng ca | **50** |
| Sai top-1 | **17** (33 đúng = 66%) |
| Trong đó đúng top-3 | 7 (top-3 = 40/50 = 80%) |
| Sai cả top-3 | 10 |

## 3. Bảng đếm theo nhóm nguyên nhân (mỗi ca gán đúng 1 nhóm chính)

| Nhóm | Số ca | STT ca |
|---|---|---|
| **A — bot không gửi mã nào cho khách** | **7** | 24, 26, 27, 30, 31, 45, 46 |
| — A1: chạm trần chờ 120s của thước đo ngày đó | 5 | 26, 27, 31, 45, 46 (dừng 120.1–120.7s) |
| — A2: trả lời xong trong trần nhưng không gửi mã | 2 | 24 (44.7s), 30 (112.0s) |
| **B — mã đúng có trong top-3 nhưng bị xếp sau mã khác** | **7** | 10, 16, 19, 23, 36, 41, 50 |
| **C — bot chọn hẳn mã khác, không có trong top-3** | **3** | 9, 14, 39 |

Tách A1/A2: 5 ca A1 dừng **đúng mốc ~120 giây** — trần chờ của thước đo ngày 12/11 (`scripts/qa-that.mjs:29` `CHO_TRA_CONG_MS = 120_000`) ngắn hơn trần một lời gọi Cổng (150s, `core/mcp.js:106`) và far hơn trần poll của bot (10 phút). Bằng chứng OZV-608: 13/13 ca đụng trần đều dừng 120.0–121.0s; chính ca #27 (72122020) chấm **đúng** khi được 124.9s trong bài đo 13/11. Trần này đã nâng lên 240s (OZV-842) ⇒ **5/7 nhóm A là lỗi thước đo, đã sửa, không phải bot kém**.

## 4. Ba ví dụ đại diện mỗi nhóm

**Nhóm A (không gửi mã):**
- **#27 — 72122020** (fero-mangan 45,24%): dừng 120.7s, đúng mốc trần thước. Chứng minh không phải ca khó: cùng ca này qua trần 120s thì ra đúng mã (124.9s, OZV-608).
- **#46 — 90111000**: dừng 120.6s, cùng dấu hiệu A1.
- **#24 — 72082600** (thép tấm cán nóng): chỉ 44.7s, bot trả lời xong nhưng không có mã nào trong tin gửi khách — A2, cần log tin để kết luận (ảnh chụp không lưu).

**Nhóm B (xếp hạng sai):**
- **#10 — đáp 39199092, bot ra 39191092** (màng nhựa PET in hoa văn một mặt): chỉ lệch 2 số cuối, bot chọn mã cùng heading 3919.91 thay vì 3919.90.
- **#23 — đáp 72021900, bot ra 72023000** (hợp kim fero-mangan C=0,52%, Si=3,47%, Mn=45,24%): rơi trúng mã `maLan` — mã 7202.30 mà văn bản TB-TCHQ đã loại trừ cho ca này.
- **#50 — đáp 95063200, bot ra 95030099** (bóng golf): mã đúng ở vị trí sau, bot đẩy 9503.00.99 lên đầu.

**Nhóm C (sai hẳn):**
- **#9 — đáp 39073030, bot ra 32082090** (sơn từ polyme acrylic): lệch cả chương — sơn/n vecni 32.08 thay vì polyme acrylic 39.07.
- **#14 — đáp 42029190, bot ra 42023200** (vỏ điện thoại kiểu ví dẹt): rơi vào mã anh em cùng heading 4202 mà văn bản đã loại trừ (`maLan`).
- **#39 — đáp 85072094, bot ra 85072099** (ắc quy chì kín 6-DZF-12 cho xe đạp điện): đúng 6 số đầu, lệch 2 số cuối.

## 5. Kiểm 3 giả thuyết của thẻ

| Giả thuyết | Kết luận | Căn cứ |
|---|---|---|
| (a) sai vì tên hàng ngắn/thiếu đơn vị | **BỊ BÁC** | Độ dài trung bình câu khách: nhóm đúng 33 ca = 191 ký tự, nhóm sai 17 ca = 193 ký tự — như nhau; bộ đề nguyên bản đã dài 100–400 ký tự kèm thông số. |
| (b) sai vì nhiều mã cùng heading | **XÁC NHẬN MỘT PHẦN** — đây là cụm nguyên nhân lớn nhất | 10 ca B+C: 5/10 bot chọn trúng cùng heading 4 số đầu với đáp án (#10, 23, 36, 14, 39); 3/10 rơi trúng `maLan` (#23, 14, 39 — mã văn bản đã loại trừ); chỉ 3/10 lệch cả chương (#16, 41, 9). |
| (c) LLM không theo lệnh trả JSON | **KHÔNG KIỂM ĐƯỢC** | Ảnh chụp 12/11 không lưu log LLM/JSON từng ca; chỉ có 2 ca A2 nghi vấn (#24, #30) nhưng cũng có thể là tin lỗi Cổng — cần log tin gửi khách từng ca mới kết luận được. |

## 6. Hướng đề xuất (xếp theo nhóm đông nhất)

Nhóm cần cải tiến đông nhất là **B (7 ca) + 2 ca C cùng bản chất mã anh em (#14, #39) = 9/17 ca**, và chúng chung một nút xoay: **thứ tự mã bot chọn để chốt đầu tiên**.

1. **Nút xoay xếp hạng (khắc phục 9/17 ca):** đưa mã có tiền lệ TB-TCHQ chắc chắn lên vị trí 1. Lever này **đã đo được bên hs-code-api** (OZV-517): phát lại ảnh chụp 12/11 với mã tiền lệ chắc chắn đứng đầu → top-1 **33→42/50**; thuật toán đối chiếu tiền lệ thuần (không LLM) khớp **50/50** mã. Điều kiện an toàn đã ghi ở OZV-517: chỉ đẩy khi chắc chắn, không bỏ qua bước chốt dòng 8. Việc nằm ở Cổng (`lib/engine-loop.js` `kiemTruocChot`) — **CẦN GĐ hs-code-api** gộp nhánh xếp hạng đã mở.
2. **Đo lại mốc bằng thước mới trước khi so sánh:** 5 ca A1 là lỗi trần 120s (đã nâng 240s, OZV-842). Mốc 66%/80% pha lẫn lỗi hạ tầng — xin chủ bộ đo (GĐ hs-code-api) đo lại một lượt bằng thước 240s để có mốc sạch. **Mốc kỳ vọng cho Số đo 2 sau hai việc trên: top-1 ≥ 42/50 (84%), không-ra-mã ≤ 2/50.**
3. **A2 (2 ca) + giả thuyết (c):** lưu log tin gửi khách từng ca khi đo — bẫy "không ra mã" lẫn "tin lỗi Cổng" lẫn "LLM trả sai khuôn" hiện không tách được từ ảnh chụp.
4. **Nhóm C thuần (3 ca):** 2 ca lệch cả chương (#9 sơn/polyme, #16 màng-nhựa-in/nhãn-in, #41 máy-phun/máy-tăm-nước) là biên giới heading thật — cần luật phân biệt có căn cứ (kiểu `phan_biet_*` của sổ tay, như OZV-2318 làm cho 8413↔4016) thay vì chỉnh xếp hạng.

## 7. Điều chưa chắc

- Giả thuyết (c) không kiểm được — không có log LLM từng ca (mục 5).
- A2: chưa đọc được tin bot gửi khách ca #24/#30 — ảnh chụp chỉ lưu mã đầu.
- Trường `chuanCong1211.dung6So: 5` của tệp nguồn không dựng lại được từ dữ liệu per-case (chỉ #39 khớp 6 số đầu trên mã bot đầu tiên) — có lẽ đếm trên cả danh sách mã bot đưa, trường đó không lưu trong ảnh chụp. Báo cáo này dùng số tự đếm per-case (17/7/7/3) và không khẳng định lại `dung6So=5`.
- Số liệu là ảnh chụp của phép đo **12/11 trên main `d776735`**; bot main đã đi tiếp (`c531f1a`), một phần ca có thể đã khác. Đo lại là việc của chủ bộ đo (mục 6.2), không phải zalo-bot tự đo (luật OZV-608).

## 8. Kiểm đường đo (lượt chạy 1/3 — `--mock`)

```
$ TMPDIR=/tmp/ozv2323-tmp node scripts/do-dung-hs.mjs --mock   (worktree main c531f1a)
📊 top-1 0/50 (0.0%) · top-3 0/50 (0.0%) · trung bình 0.1s
```

Mock luôn trả `85371099` nên 0/50 là **bình thường** — lượt này chỉ chứng minh đường đo sống: 50 ca chạy hết, báo cáo sinh `bao-cao/do-dung/2026-11-26-mock.md`, không ca nào chết oan vì trần chờ 240s.
