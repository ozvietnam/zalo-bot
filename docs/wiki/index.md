# Wiki tri thức — bot Zalo hải quan OZ

> Cập nhật: 2026-11-07 · commit: 0842386

Wiki mô tả bot Zalo tra cứu hải quan của OZ Việt Nam: bot nói chuyện với khách trên Zalo,
gọi công cụ hải quan qua Cổng OZ, rồi trả lời. Mỗi nhận định trong wiki đều kèm
đường dẫn tới tệp và số dòng trong mã nguồn, để người đọc tự mở ra kiểm.

Wiki viết bằng tiếng Việt, câu ngắn. Thuật ngữ tiếng Anh được giải thích trong ngoặc
ở lần dùng đầu. Từ tiếng Anh giữ nguyên khi là tên công cụ, biến hoặc tên tệp.

## Mục lục

| Trang | Dành cho | Nội dung |
|---|---|---|
| [Tổng quan](tong-quan.md) | Mọi người | Bot này làm gì, chạy ở đâu, giới hạn rõ ràng. |
| [Kiến trúc](kien-truc.md) | Kỹ thuật | Các lớp: kênh, lõi, gói, não AI, cổng OZ. Một đường xử lý duy nhất trong repo. |
| [Luồng tin nhắn](luong-tin-nhan.md) | Kỹ thuật | Tin khách đi qua đâu, tin bot đi ra đâu. |
| [Gói nghiệp vụ](goi-nghiep-vu.md) | Nghiệp vụ, kỹ thuật | 7 gói hải quan, điều kiện và công cụ từng gói. |
| [Não AI](nao-ai.md) | Kỹ thuật | Não định tuyến, não biên tập, khoá dự phòng. |
| [Dữ liệu](du-lieu.md) | Kỹ thuật, vận hành | Dữ liệu lưu ở đâu, bảng nào, giữ bao lâu. |
| [An toàn](an-toan.md) | Kỹ thuật, quản trị | Nguyên tắc bắt buộc, phần nào đang thực thi, phần nào chưa. |
| [Nền tảng Zalo](nen-tang-zalo.md) | Kỹ thuật, vận hành | Zalo Bot Platform: webhook, polling, giới hạn kỹ thuật. |
| [Triển khai và vận hành](trien-khai-van-hanh.md) | Vận hành | Cài đặt, biến môi trường, chạy 24/7, giám sát. |
| [Kiểm thử](kiem-thu.md) | Kỹ thuật | Cách chạy test, bộ eval, cổng kiểm wiki. |
| [Quan hệ với VPS 201](quan-he-vps-201.md) | Mọi người | Repo này nối với máy CSKH hiện tại ra sao, đường chuyển kênh |
| [Tiến độ](tien-do.md) | Mọi người | Trạng thái thật từng việc T0xx, mâu thuẫn tài liệu ↔ code. |
| [Sự cố và bài học](su-co-bai-hoc.md) | Vận hành, kỹ thuật | Sự cố đã gặp, cách xử lý, cách phòng tái diễn. |
| [Thuật ngữ](thuat-ngu.md) | Mọi người | Từ vựng dùng trong wiki và trong mã nguồn. |
| [Nhật ký](log.md) | Kỹ thuật | Lịch sử thay đổi wiki: ngày, commit, trang đã đổi. |

## Đọc gì trước

### Người mới phát triển

1. [Tổng quan](tong-quan.md) — bot làm gì, khách dùng thế nào.
2. [Kiến trúc](kien-truc.md) — các lớp và ranh giới giữa chúng.
3. [Luồng tin nhắn](luong-tin-nhan.md) — theo dõi một tin khách đi qua hệ thống.
4. [Tiến độ](tien-do.md) — trạng thái thật, phần nào chưa xong. Đọc trang này **trước khi** sửa code,
   để không tưởng mình đang sửa phần đã chạy.

### Người vận hành

1. [Nền tảng Zalo](nen-tang-zalo.md) — giới hạn của nền tảng, lỗi thường gặp.
2. [Triển khai và vận hành](trien-khai-van-hanh.md) — chạy, theo dõi, khôi phục.
3. [An toàn](an-toan.md) — những gì bot được và không được phép làm.
4. [Sự cố và bài học](su-co-bai-hoc.md) — khi có sự cố, đọc trang này trước.

### Nhân viên nghiệp vụ (khai báo hải quan)

1. [Gói nghiệp vụ](goi-nghiep-vu.md) — 7 gói, mỗi gói cần đủ dữ liệu gì.
2. [Tổng quan](tong-quan.md) — bot trả lời được gì và không trả lời được gì.
3. [Thuật ngữ](thuat-ngu.md) — mã HS, tờ khai, thuế suất, pháp luật.

Lưu ý chung: mã HS bot đưa ra là **gợi ý**, không thay thế ý kiến phân loại của Hải quan
(`README.md:109`).

## Quy ước của wiki

- Mỗi trang (trừ trang này, [Thuật ngữ](thuat-ngu.md) và [Nhật ký](log.md)) có dòng
  `> Cập nhật: YYYY-MM-DD · commit: abc1234` ngay dưới tiêu đề. `commit` là mã commit
  của **mã nguồn đã đọc** khi viết trang đó.
- Mỗi nhận định về code kèm trích dẫn dạng `tệp:dòng`. Mở tệp đó và tới đúng dòng để kiểm.
- Chỗ nào chưa kiểm được thì ghi rõ "chưa xác minh", không đoán.
- Trang [Tiến độ](tien-do.md) ghi cả **hai phía** khi tài liệu và code mâu thuẫn; wiki không tự chọn bên nào đúng.
- Link ngoài repo chỉ dùng khi mở được; ưu tiên link trong repo.
- Repo này công khai: wiki không chứa IP nội bộ, khoá bí mật, số điện thoại, tên khách hay nội dung tin nhắn.

## Kiểm tra wiki

Một cổng máy kiểm wiki (không dùng AI, không cần thư viện ngoài):

```bash
node scripts/kiem-wiki.mjs --nghiem
```

Cổng kiểm: tiêu đề có, dòng cập nhật có, trích dẫn trỏ tới tệp thật, số dòng không vượt độ dài tệp,
link nội bộ sống, mọi trang có trong mục lục, không còn chỗ trống, không lộ bí mật.
Cổng nằm trong `scripts/kiem-wiki.mjs:2` và được CI chạy mỗi lần đẩy code
(`.github/workflows/ci.yml:27`).
