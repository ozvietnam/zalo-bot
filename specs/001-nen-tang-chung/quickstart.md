# Quickstart: kiểm spec 001 bằng tay

Chạy sau khi xong `tasks.md`. Mọi bước đều không cần tài khoản Zalo thật trừ mục 5.

## 1. Test và eval
```bash
npm test            # unit + contract + 21 test cũ
npm run eval        # in: "eval: N/N kịch bản đạt"
```

## 2. Chạy thử trên máy
```bash
cp .env.example .env      # điền ZALO_BOT_TOKEN, OZ_MCP_TOKEN, STAFF_USERS, STAFF_CHAT_ID
npm run dev               # = node --env-file=.env --disable-warning=ExperimentalWarning server.js (ZALO_MODE=polling)
curl -s localhost:3010/health | jq
```
Mong đợi: `{ ok: true, db: "ok", mcp: { tools: N }, zalo: "ok", inboxPending: 0 }`.

## 3. Thử không trùng (US1)
Nhắn bot `8413709090`. Trong lúc bot đang trả lời, tắt tiến trình (Ctrl+C) rồi chạy lại.
Mong đợi: nhận đúng một câu trả lời. `npm run audit -- --chat <chat_id>` thấy một `inbound`, một `outbound sent`.

## 4. Thử việc nền qua khởi động lại (US3)
Gửi mô tả hàng để phân loại (gói 1). Thấy "⏳ đang xử lý" thì tắt bot, đợi 30 giây, bật lại.
Mong đợi: kết quả tới đúng một lần. Thử lúc 23:xx thì kết quả tới lúc 07:00.

## 5. Thử người cầm phòng (US2)
1. Nhắn bot: `cho em gặp nhân viên` → nhận câu báo đã chuyển; nhóm nhân viên nhận phiếu `P<n>`.
2. Nhắn thêm 3 tin → bot không trả lời; nhóm nhận các tin đã gộp.
3. Trong nhóm nhân viên gõ `/tl P<n> Dạ em đây ạ` → khách nhận đúng câu đó.
4. Gõ `/tra-bot P<n>` → nhắn bot `8413709090` → bot trả lời lại bình thường.

## 6. Số đo
`curl -s localhost:3010/metrics | jq` có `turns`, `gate.{send,drop,defer,reject}` theo lý do, `tickets.open`, `jobs.waiting`.
