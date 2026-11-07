# Tổng quan

> Cập nhật: 2026-11-07 · commit: 64a728a

Bot Zalo của OZ Việt Nam: khách nhắn Zalo, bot tra cứu **hải quan** (mã HS, thuế, thủ tục, nhãn hiệu…) qua **Cổng OZ** rồi trả lời.

## Bot làm gì

- Nhận tin nhắn chữ và ảnh của khách trên Zalo, tự chọn gói tra cứu phù hợp.
- Gọi **Cổng OZ** qua giao thức **MCP** (Model Context Protocol) để tra dữ liệu. Số liệu do Cổng OZ trả; não biên tập chỉ được rút gọn khi mọi con số trong bản rút gọn đều có sẵn ở bản gốc (`packs/hs/editor.js:21`).
- Có **não AI** (Gemini, có khoá dự phòng; hỏng cả hai thì rơi về luật so khớp) hiểu câu hỏi và biên tập kết quả cho gọn (`packs/hs/brain.js:5`, `packs/hs/brain.js:200`).
- Có **cửa gửi duy nhất** (một chỗ quyết định gửi/bỏ/hoãn/từ chối mọi tin đi) ở đường lõi.

## Cho ai

| Người dùng | Dùng gì | Trang nên đọc |
|---|---|---|
| Khách tra cứu hải quan | 7 gói tra cứu qua Zalo | [Tổng quan](tong-quan.md), [Gói nghiệp vụ](goi-nghiep-vu.md) |
| Nhân viên nghiệp vụ | Lệnh nhân viên, phiếu chờ | [Vận hành](trien-khai-van-hanh.md), [Thuật ngữ](thuat-ngu.md) |
| Người vận hành (deploy) | Webhook, biến môi trường, giám sát | [Triển khai & vận hành](trien-khai-van-hanh.md) |
| Dev mới / AI | Kiến trúc, luồng tin, dữ liệu | Bắt đầu từ [index.md](index.md) |

## Các gói (7 gói con)

Khai báo chung một mảng `PACKAGES` trong `packs/hs/packages.js:142`:

1. Phân loại mã HS — `phan_loai_hs`
2. Thuế & thủ tục nhập khẩu — `tra_thue`, `tra_thu_tuc_nhap_khau`
3. Viết mô tả khai báo — `sinh_mo_ta_khai_bao`
4. Kiểm tra mô tả / tờ khai — `soat_to_khai`, `kiem_ma_to_khai`
5. Pháp luật hải quan — `tra_hieu_luc_van_ban`, `tra_chu_giai`, `tra_tien_le`
6. Sở hữu trí tuệ — `kiem_tra_shtt`
7. Hồ sơ giải trình mã HS — `soan_ho_so_giai_trinh`

Chi tiết từng gói, cách gọi Cổng OZ và cách thêm gói mới: xem [Gói nghiệp vụ](goi-nghiep-vu.md).

## Đang chạy ra sao

- **Điểm vào** là một tiến trình `server.js`, khởi động bằng `node server.js` (`package.json:12`).
- **Hai chế độ nhận tin** (`server.js:17`): `ZALO_MODE=webhook` (mặc định, Zalo đẩy tin về) hoặc `ZALO_MODE=polling` (bot tự gọi `getUpdates`).
- **Nối tới Zalo** qua kênh `channels/zalo-bot.js`, gốc API `https://bot-api.zaloplatforms.com` (`channels/zalo-bot.js:10`).
- **Nối tới Cổng OZ** qua client MCP trong `lib/mcp.js:7`.

### Hai đường xử lý (quan trọng)

| | Đường A (đang chạy) | Đường B (lõi mới) |
|---|---|---|
| Tệp | `server.js` → `lib/bot.js` | `core/engine.js` + `core/gate.js` + `core/store.js` |
| Trạng thái | Đang được `server.js` nối (`server.js:7`) | Đã có code nhưng **chưa nối** vào `server.js` |
| Gửi tin | Gọi thẳng `zalo.sendText`, chưa qua cửa | Chỉ qua `core/gate.js:64` |
| Lưu trữ | Trong bộ nhớ (RAM) | SQLite bền |

Đây là điểm lệch lớn nhất giữa tài liệu và code — xem [Tiến độ](tien-do.md) và [Kiến trúc](kien-truc.md).

## Trạng thái hiện tại

Repo vẫn ghi bot **đang tắt với khách từ 19/10/2026**, chờ nền tảng dùng chung xong (`docs/ROADMAP.md:8`). Trạng thái thật từng việc: xem [Tiến độ](tien-do.md).

## Đọc tiếp

- Muốn hiểu hệ thống gồm những gì: [Kiến trúc](kien-truc.md)
- Muốn biết một tin đi qua đâu: [Luồng tin nhắn](luong-tin-nhan.md)
- Muốn biết an toàn được giữ thế nào: [An toàn](an-toan.md)
