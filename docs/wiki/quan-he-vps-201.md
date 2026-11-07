# Quan hệ với VPS 201

> Cập nhật: 2026-11-07 · commit: 77ab8c3

VPS 201 là máy chăm sóc khách Fanpage và Zalo của OZ, chạy Hermes Agent (khung agent) và Python từ 22/09/2026 (`specs/001-nen-tang-chung/research.md:5`). Repo này là lõi được viết lại từ bài học ở máy đó. Hai bên chưa nối nhau lúc chạy: mã trong `core/`, `lib/`, `channels/`, `packs/` không gọi tới 201.

## Bốn mối nối

| Mối nối | Nội dung | Nguồn |
|---|---|---|
| Bài học | 18 sự cố đo được ở 201 trở thành yêu cầu của lõi | `specs/001-nen-tang-chung/research.md:5` |
| Não | Lõi giữ luật an toàn bằng code. Hermes hoặc LLM chỉ soạn nháp, không có quyền gửi | `specs/001-nen-tang-chung/spec.md:30` |
| Dữ liệu | Spec 007 đọc bản sao cơ sở dữ liệu inbox của 201, chỉ đọc, không mở issue vào đó | `specs/007-giam-sat-nang-cap/spec.md:34`, `specs/007-giam-sat-nang-cap/spec.md:108` |
| Kênh | Spec 005 đưa lõi sang Fanpage và Zalo OA, nơi khách thật đang nhắn | `docs/ROADMAP.md:20` |

## Trạng thái đo ngày 07/11/2026

Đo trực tiếp trên máy 201, không có trong repo:

- Fanpage đang ở chế độ chỉ quan sát từ 19/10/2026 theo quyết định của chủ repo. Từ 30/10 tới 07/11 máy gửi 0 tin; tin trả lời đến từ nhân viên và mẫu tự động của Page.
- Zalo 1-1 của nhân viên ảo: tin cuối ngày 29/09/2026.
- Máy vẫn quét inbox và ghi tin khách vào cơ sở dữ liệu, bằng nguồn LLM miễn phí.
- Ngày 07/11/2026 chủ repo cho tắt MiniMax trên máy này: ca rà soát 30 phút, vòng tự kiểm thử, việc danh bạ, video Zalo và vòng nội dung Fanpage đã dừng. Các chức năng giám sát này chờ spec 007.
- Hai bot Zalo riêng còn chạy trên 201: OZ Kế toán và OZ Nguồn Hàng. Chúng không đi qua lõi này.

## Đường chuyển

1. Xong spec 001, đạt các chỉ số thành công (`specs/001-nen-tang-chung/spec.md:262`). Đây là điều kiện để bật lại bot cho khách (`docs/ROADMAP.md:8`).
2. Spec 007: giám sát đọc dữ liệu 201.
3. Spec 005: lõi nhận kênh Fanpage và Zalo OA.
4. Spec 003 (sau 008): gói CSKH trên lõi, thay luồng Python ở 201.
5. Hai bot riêng chuyển thành gói theo spec 006 nếu chủ repo chốt.

Trong lúc đó không bật lại việc gửi khách từ 201: các sự cố trong `specs/001-nen-tang-chung/research.md:5` chưa có cửa gửi nào chặn ở đường đó.
