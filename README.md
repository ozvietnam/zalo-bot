# zalo-hs-bot — Bot Zalo tra cứu hải quan OZ

Bot Zalo (Zalo Bot Platform chính thức) nối với **Cổng OZ** qua MCP (`https://mcp.uythacnhapkhau.com/mcp`).
Bot tự đọc danh sách công cụ của Cổng (`tools/list`), nên Cổng thêm tính năng mới thì bot dùng được mà không cần
sửa phần kết nối. Node 20+, không thư viện ngoài.

## Các gói người dùng chọn

Cuối mỗi tin trả lời luôn có dòng menu gói; gõ số để chuyển gói, `menu` để xem chi tiết, `0` để bot tự chọn.

| Số | Gói | Công cụ Cổng OZ | Người dùng gửi |
|---|---|---|---|
| 1 | 🔎 Phân loại mã HS | `phan_loai_hs` → `ket_qua_phan_loai` (chạy nền) | mô tả hàng (tên, chất liệu, công dụng, thông số) |
| 2 | 💰 Thuế & thủ tục nhập khẩu | `tra_thue` + `tra_thu_tuc_nhap_khau`; `tim_ma_hs` khi gõ tên hàng | mã HS [+ nước] |
| 3 | 📝 Viết mô tả khai báo | `sinh_mo_ta_khai_bao` (dùng lại mã + mã lượt của gói 1) | mã HS + tên hàng + thương hiệu, model… |
| 4 | ✅ Kiểm tra mô tả / tờ khai | `soat_to_khai` (miễn phí); `kiem_ma_to_khai` → `ket_qua_soat` khi "Kiểm sâu: có" | mã HS + mô tả + xuất xứ |
| 5 | ⚖️ Pháp luật hải quan | `tra_hieu_luc_van_ban`, `tra_chu_giai`, `tra_tien_le` | số hiệu văn bản / mã HS / mô tả |
| 6 | ®️ Sở hữu trí tuệ | `kiem_tra_shtt` | nhãn hiệu [+ mã HS, xuất xứ] |
| 7 | 📄 Hồ sơ giải trình mã HS | `soan_ho_so_giai_trinh` | mã đã khai, mã HQ áp, mô tả, lý do HQ |

- Gói chỉ hiện khi Cổng có đủ công cụ của gói đó.
- **Tự động** (chưa chọn gói): mã 8 số → gói 2; số hiệu văn bản → 5; "nhãn hiệu" → 6; "giải trình / áp mã" → 7;
  còn lại → gói 1.
- Gói nhớ theo từng người (trong nhóm: từng người một) trong 2 giờ. Gói 1 xong, gói 2/3/4 dùng lại mã vừa phân loại.
- Công việc chạy nền: bot báo "⏳ đang xử lý" rồi tự gửi kết quả. Quá 4 phút thì gõ `kết quả <mã lượt>`.
- Thêm gói mới: thêm một mục vào `PACKAGES` trong `lib/packages.js`. Công cụ mới chưa có mẫu hiển thị riêng vẫn hiện
  được nhờ bộ dựng chung trong `lib/render.js`.

## 1. Tạo bot Zalo

1. Vào `bot.zapps.me` (Zalo Bot Creator) → **Tạo bot** → nhận **Bot Token**. Giữ bí mật.
2. Lấy khoá/tài khoản OZ cho bot → điền `OZ_MCP_TOKEN`. Công cụ tính điểm trừ vào tài khoản này cho **mọi**
   người dùng bot → nên giới hạn `ALLOW_USERS` nếu chỉ dùng nội bộ.

## 2. Chạy thử trên máy (không cần tên miền)

```bash
cp .env.example .env    # điền ZALO_BOT_TOKEN, OZ_MCP_TOKEN
node --env-file=.env server.js
```
Khởi động đúng sẽ có: `[bot] đăng nhập: …`, `[mcp] Cổng OZ có N công cụ; gói khả dụng: 1, 2, …`.
Gỡ lỗi: `set DEBUG=1` (Windows) rồi chạy lại để in mọi gói tin.

## 3. Dùng trong nhóm Zalo

1. Zalo Bot Creator → chọn bot → **Mời Bot vào nhóm** → chia sẻ link vào nhóm; **trưởng nhóm** bấm link → xác nhận.
2. Trong nhóm bot chỉ nhận tin khi được **@nhắc tên** hoặc khi có người **trả lời tin của bot**:
   `@Tên bot 84137090`, `@Tên bot 6`, `@Tên bot máy bơm nước ly tâm 1.5HP`.

## 4. Triển khai Coolify (chạy 24/7)

1. Đẩy thư mục lên repo (vd `ozvietnam/zalo-hs-bot`) → Coolify: Application → Dockerfile, cổng 3000, health `/health`.
2. Biến môi trường: `ZALO_BOT_TOKEN`, `ZALO_MODE=webhook`, `ZALO_WEBHOOK_SECRET` (32 ký tự ngẫu nhiên), `OZ_MCP_TOKEN`.
3. Tắt bản chạy thử trên máy, rồi đăng ký webhook:
   `node --env-file=.env scripts/set-webhook.mjs set https://<tên-miền>/webhook/zalo`

## 5. Kiểm thử

```bash
npm test     # không cần mạng (Zalo + Cổng OZ giả lập)
```

Kết quả là tham khảo; mã HS là **gợi ý**, không thay thế ý kiến phân loại của Hải quan.
