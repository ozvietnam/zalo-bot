# Kiến trúc

> Cập nhật: 2026-11-07 · commit: 1316cfe

Repo có **hai lớp chồng nhau**: lõi mới trong `core/` và đường cũ trong `lib/` vẫn đang chạy. Trang này nói rõ hai đường, chỗ nào đang dùng.

## Bản đồ thư mục

| Thư mục / tệp | Vai trò |
|---|---|
| `server.js` | Điểm vào của tiến trình: HTTP server, webhook, polling, dựng bot |
| `core/` | Lõi spec 001: engine (một lượt), cửa gửi, store SQLite, registry chọn gói |
| `channels/` | Adapter kênh Zalo Bot Platform (gửi/nhận, định dạng rich text) |
| `lib/` | Đường cũ đang chạy: `lib/bot.js` + client MCP (`lib/mcp.js`) + sổ trượt từ vựng (`lib/truot.js`); 10 tệp một dòng chỉ là re-export sang `packs/hs/` hoặc `channels/` |
| `packs/` | Gói nghiệp vụ. Hiện chỉ có `packs/hs/` (tra cứu hải quan) |
| `scripts/` | Công cụ vận hành: giám sát, đặt/kiểm webhook, kiểm wiki |
| `eval/` | Bộ chạy phát lại kịch bản, không cần mạng |
| `test/` | Test `node:test` của lõi (`test/core/`) + bộ test cũ (`test/test.mjs`) |
| `specs/`, `docs/` | Đặc tả spec-kit, hiến pháp, sổ nhật ký công việc |

## Các lớp

1. **Kênh** (`channels/zalo-bot.js`) — biết Zalo, không biết nghiệp vụ. Có hai lớp: `createChannel` theo contract lõi (`channels/zalo-bot.js:13`) và `createZaloClient` là đường cũ (`channels/zalo-bot.js:69`).
2. **Lõi** (`core/`) — không biết gói làm gì. `createEngine` xử lý một lượt khách (`core/engine.js:25`); `createGate` là cửa gửi (`core/gate.js:15`); hàm quyết định thuần nằm riêng ở `core/gate-decide.js:69`; `openStore` mở SQLite (`core/store.js:9`); `createRegistry` nạp và chọn gói (`core/registry.js:34`).
3. **Gói** (`packs/`) — biết nghiệp vụ, không gửi tin. Gói khai báo ở `packs/hs/index.js:96`, trả về `replies` / `jobs` theo hợp đồng `core/types.js:53` (kèm `handoff`, `labels`, `interests`), không tự gọi kênh.
4. **Cổng OZ (MCP)** (`lib/mcp.js`) — client JSON-RPC 2.0 qua Streamable HTTP; `callTool` ở `lib/mcp.js:105`.
5. **Não AI** (`packs/hs/brain.js`, `packs/hs/editor.js`, `packs/hs/llm2.js`) — hiểu câu hỏi, biên tập kết quả, có khoá dự phòng.

## Hai đường xử lý

### Đường A — đang chạy (qua `lib/bot.js`)

```
server.js  ──import──►  lib/bot.js  ──►  packs/hs/*  ──►  lib/mcp.js  ──►  Cổng OZ
    │                                              │
    └──────────────────────────────────────────────┴──►  channels/zalo-bot.js (gửi thẳng)
```

- `server.js` import `createBot` từ `./lib/bot.js` (`server.js:7`).
- Mọi logic lọc/chọn gói nằm trong `handleUpdate` (`lib/bot.js:106`).
- Tin đi ra bằng `zalo.sendText` gọi thẳng từ `lib/bot.js:112` — **không qua cửa gửi**.
- Dữ liệu tạm nằm trong RAM: bộ chống trùng `seen` (`lib/bot.js:30`) và bản đồ phiên `sessions` (`lib/bot.js:32`). Không có SQLite, không có audit.

### Đường B — lõi mới (`core/`), chưa nối vào `server.js`

```
update ─► core/engine.js ─► registry.pick ─► pack.handle
             │                                  │
             │                     replies/jobs ─┤
             ▼                                  ▼
      core/store.js (SQLite)            core/gate.js ─► channels/zalo-bot.js
             ▲                                  │
             └────── jobs/outbox ◄── sweep ◄───┘
```

- `core/engine.js` xử lý một lượt: ghi `inbox` rồi claim nguyên tử (`core/engine.js:65-68`), chọn gói (`core/engine.js:112`), chạy gói (`core/engine.js:116`), rồi gửi từng câu qua cửa (`core/engine.js:120`, lời gọi cửa ở `core/engine.js:49`).
- Chỉ một tệp được gọi `channel.sendText`: `core/gate.js:79`.
- Việc nền chạy ở `core/engine-jobs.js:24`; kết quả quay lại cửa ở `core/engine-jobs.js:55`.
- Tin hoãn hoặc gửi lỗi được quét lại ở `core/gate.js:169`; tin dở dang lúc khởi động lại được bàn giao ở `core/gate.js:191`.
- Ai đang dùng đường B: **chỉ test, eval và script giám sát** — `server.js` không import `core/engine.js`, `core/store.js` hay `core/gate.js`.

### Kết luận

Lõi `core/` đã có đủ engine + cửa + store nhưng **chưa được nối vào `server.js`**. Việc T016 của spec 001 chưa xong. Chi tiết trạng thái từng việc: [Tiến độ](tien-do.md).

## Bảng "sự vật → tệp"

| Sự vật | Tệp chính |
|---|---|
| Điểm vào, webhook, polling | `server.js` |
| Một lượt khách (lõi) | `core/engine.js`, `core/engine-ctx.js`, `core/engine-jobs.js` |
| Cửa gửi (quyết định + thi hành) | `core/gate.js`, `core/gate-decide.js` |
| Lưu trữ SQLite | `core/store.js`, `core/store/schema.js` |
| Chọn gói | `core/registry.js` |
| Cấu hình đọc từ môi trường | `core/config.js` |
| Kênh Zalo | `channels/zalo-bot.js` |
| Client MCP Cổng OZ | `lib/mcp.js` |
| Đường cũ đang chạy | `lib/bot.js` |
| Gói hải quan | `packs/hs/index.js`, `packs/hs/packages.js` |
| Não AI | `packs/hs/brain.js`, `packs/hs/editor.js`, `packs/hs/llm2.js` |
| Giám sát | `scripts/giam-sat.mjs`, `lib/giam-sat/tinh-hieu.js` |

Liên quan: [Luồng tin nhắn](luong-tin-nhan.md), [Dữ liệu](du-lieu.md).
