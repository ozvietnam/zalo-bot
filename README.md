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
- Sau khi phân loại ra mã, bot **tự kèm trong cùng tin**: thuế + **chính sách nhập khẩu** (gói 2, miễn phí) — mục chính
  sách gọn bằng tiếng Việt: hàng CÓ dính chính sách quản lý không, là gì, và văn bản nào dẫn tới (kèm còn/hết hiệu lực).
  Chú giải + tiền lệ (gói 5) KHÔNG tự kèm nữa — gõ "5" khi cần. Mô tả có **thương hiệu** thì tự kiểm rủi ro nhãn hiệu
  (gói 6, **tính điểm**). Bản chốt ngắn do AI biên tập; gõ "chi tiết" để xem bản phân tích đầy đủ.
- Gói nhớ theo từng người (trong nhóm: từng người một) trong 2 giờ. Gói 1 xong, gói 2/3/4 dùng lại mã vừa phân loại.
- Công việc chạy nền (phân loại, kiểm sâu): bot **không gửi câu chờ**, xong thì tự gửi kết quả. Lâu quá thì gõ `kết quả <mã lượt>`.
- Thêm gói mới: thêm một mục vào `PACKAGES` trong `lib/packages.js`. Công cụ mới chưa có mẫu hiển thị riêng vẫn hiện
  được nhờ bộ dựng chung trong `lib/render.js`.

## Não hiểu câu hỏi (AI)

Ở chế độ **Tự động**, câu tự do của khách được Gemini (AI Studio, function calling) hiểu trước khi tra:
chọn gói và chép dữ kiện (tên hàng, mã HS, xuất xứ…) thành văn bản theo mẫu — gói chạy như thể khách gõ đúng khuôn.
Chưa rõ ý hoặc thiếu dữ kiện → bot **hỏi lại một câu** thay vì đoán mò; chào hỏi/xã giao → trả lời ngắn, dẫn về menu.

- Dùng chung `GEMINI_API_KEY` với đọc ảnh; đổi mẫu bằng `GEMINI_BRAIN_MODEL` (mặc định `gemini-flash-lite-latest`); tắt bằng `GEMINI_BRAIN=0`.
- AI chỉ được chọn trong các gói khả dụng và điền dữ kiện khách đã nêu; code kiểm lại khuôn (mã HS, độ tin cậy ≥ 0.5) trước khi chạy.
- Gemini lỗi/quá tải → tự rơi về bộ dò từ khoá như trước, bot không chết; lệnh chắc chắn (menu, "gói 2", hỏi kết quả) và gói khách đã chọn không tốn lượt AI.

## Não biên tập kết quả (AI)

Kết quả phân loại + thuế (bản dài: nhiều mã ứng viên, lý do từng dòng) được Gemini viết lại thành **bản chốt 4–7 dòng** — mã chính, lý do ngắn, thuế suất, cảnh báo. Gõ **"chi tiết"** để xem lại bản phân tích đầy đủ của lượt gần nhất (giữ trong phiên ~2 giờ).

- An toàn số liệu (Hiến chương III): **code kiểm từng con số** trong bản chốt phải khớp kết quả gốc; không khớp hoặc Gemini lỗi → gửi bản đầy đủ như cũ.
- Mẫu: `GEMINI_EDITOR_MODEL` (mặc định `gemini-flash-latest`); tắt: `GEMINI_EDITOR=0`. Không biên tập khi đang hỏi dữ kiện bổ sung (câu hỏi của Cổng tới khách nguyên văn).
- Bot lọc bỏ mệnh đề lẫn ký tự Trung trong lý do do engine Cổng trả về (che tạm, đã báo bên `hs-code-api`).

## Khoá dự phòng (LLM thứ hai)

Khi Gemini lỗi, quá tải hoặc quá giờ, não định tuyến và não biên tập tự chuyển sang một cổng LLM khác theo chuẩn OpenAI (`/chat/completions`) — `packs/hs/llm2.js`.

- Cấu hình chung, không gắn nhà cung cấp: `LLM2_BASE_URL` (phần trước `/chat/completions`), `LLM2_API_KEY`, `LLM2_MODEL`; tuỳ chọn `LLM2_TIMEOUT_MS` (mặc định 20000). Thiếu 1 trong 3 biến = tắt.
- Có dự phòng thì chỉ thử 1 mẫu Gemini rồi chuyển. Kết quả dự phòng qua đúng các luật như Gemini: lọc mã HS tự đoán, ngưỡng `doChac`, code kiểm từng con số của bản chốt.
- Không có `GEMINI_API_KEY` mà có dự phòng → hai não chạy thẳng bằng dự phòng. Đọc ảnh vẫn chỉ dùng Gemini.
- `LLM_CHINH=llm2` → đảo vai: khoá llm2 chạy chính cho hai não, Gemini chỉ cứu khi llm2 lỗi/quá giờ. Câu trả lời của llm2 bị luật loại thì không hỏi thêm Gemini (không tốn hai lượt).
- Lưu ý: mọi câu khách gửi tới não sẽ đi qua nhà cung cấp này — chỉ dùng nhà cung cấp công ty đã đồng ý.

## Giao diện trả về (rich text)

Bot dùng `text_styles` của Zalo Bot API (in đậm, màu, cỡ chữ) — nên tin nhắn có **chữ đậm và màu**,
không phải text thuần.

- Mọi nội dung giao diện viết bằng thẻ: `{b}đậm{/b}`, `{red}…{/red}`, `{orange}…{/orange}`, `{green}…{/green}`, `{yellow}…{/yellow}`.
- `lib/style.js` bỏ thẻ và dịch sang `text_styles` (offset tính theo **UTF-16 code unit** như Zalo yêu cầu — emoji tính 2 đơn vị).
- Thẻ lạ / thẻ không khớp / dữ liệu MCP chứa `{` `}` → **giữ nguyên chữ**, không mất dữ liệu.
- Tin >2000 ký tự được chia đoạn, mỗi đoạn giữ đúng định dạng; thẻ bị cắt dở được cân bằng trước khi gửi.
- Thêm màu mới: mở `CODES` trong `lib/style.js` (mã màu Zalo: `c_db342e` đỏ, `c_f27806` cam, `c_f7b503` vàng, `c_15a85f` xanh).

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
