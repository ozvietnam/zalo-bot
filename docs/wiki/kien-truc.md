# Kiến trúc

> Cập nhật: 2026-11-07 · commit: 0842386

Từ 07/11/2026 (T016) repo chỉ có **một lớp chạy thật**: lõi `core/` đã được nối vào `server.js`.
Thư mục `lib/` đã bị xoá hẳn, nên không còn "đường cũ" nào chạy song song.

## Bản đồ thư mục

| Thư mục / tệp | Vai trò |
|---|---|
| `server.js` | Điểm vào của tiến trình: chỉ nối dây (config → store → kênh → cửa → engine → HTTP), không gửi tin (`server.js:1-2`) |
| `core/` | Lõi spec 001: engine (một lượt), cửa gửi, store SQLite, registry chọn gói, client MCP, cấu hình |
| `channels/` | Adapter kênh Zalo Bot Platform (gửi/nhận, định dạng rich text) + chế độ polling |
| `packs/` | Gói nghiệp vụ. Hiện chỉ có `packs/hs/` (tra cứu hải quan) |
| `scripts/` | Công cụ vận hành: giám sát (`scripts/giam-sat.mjs`), đặt/kiểm webhook, kiểm wiki, 9 tín hiệu (`scripts/giam-sat/tinh-hieu.js`) |
| `eval/` | Bộ chạy phát lại kịch bản, không cần mạng |
| `test/` | Test `node:test` của lõi (`test/core/`) + bộ test cũ (`test/test.mjs`) |
| `specs/`, `docs/` | Đặc tả spec-kit, hiến pháp, sổ nhật ký công việc |

## Các lớp

1. **Kênh** (`channels/zalo-bot.js`) — biết Zalo, không biết nghiệp vụ. Có hai lớp: `createChannel` theo contract lõi (`channels/zalo-bot.js:13`) và `createZaloClient` cho chế độ polling (`channels/zalo-bot.js:69`, dùng ở `channels/zalo-polling.js:10`).
2. **Lõi** (`core/`) — không biết gói làm gì. `createEngine` xử lý một lượt khách (`core/engine.js:25`); `createGate` là cửa gửi (`core/gate.js:15`); hàm quyết định thuần nằm riêng ở `core/gate-decide.js:69`; `openStore` mở SQLite (`core/store.js:9`); `createRegistry` nạp và chọn gói (`core/registry.js:34`).
3. **Gói** (`packs/`) — biết nghiệp vụ, không gửi tin. Gói khai báo ở `packs/hs/index.js:96`, trả về `replies` / `jobs` theo hợp đồng `core/types.js:54` (kèm `handoff`, `labels`, `interests`), không tự gọi kênh.
4. **Cổng OZ (MCP)** (`core/mcp.js`) — client JSON-RPC 2.0 qua Streamable HTTP; `callTool` ở `core/mcp.js:106`.
5. **Não AI** (`packs/hs/brain.js`, `packs/hs/editor.js`, `packs/hs/llm2.js`) — hiểu câu hỏi, biên tập kết quả, có khoá dự phòng.

## Một đường xử lý

```
Zalo ──webhook──► server.js:93 ─┐
                                  ├──► core/engine.js ─► registry.pick ─► pack.handle
Zalo ──polling──► channels/zalo-polling.js:34 ─┘        │                       │
                                                      │              replies/jobs ┤
                                                      ▼                       ▼
                                               core/store.js (SQLite)   core/gate.js:79
                                                      ▲                       │
                                                      └──── jobs/outbox ◄── sweep ◄──┘
```

- `server.js` chỉ nối dây: `loadConfig` (`server.js:30`), `openStore` (`server.js:38`), `createChannel` (`server.js:40`), `createMcpClient` (`server.js:41`), `createGate` (`server.js:60`), `createRegistry` (`server.js:72`), `createEngine` (`server.js:76`). Gói được nạp theo đường dẫn tương đối tới **tệp mã nguồn** (`server.js:72`), nên việc nạp gói không phụ thuộc thư mục làm việc.
- `core/engine.js` xử lý một lượt: ghi `inbox` rồi claim nguyên tử (`core/engine.js:65-68`), chọn gói (`core/engine.js:114`), chạy gói (`core/engine.js:118`), rồi gửi từng câu qua cửa (`core/engine.js:122`, lời gọi cửa ở `core/engine.js:49`).
- Chỉ một tệp được gọi `channel.sendText`: `core/gate.js:79`. Điều này bị khoá bằng test `test/core/one-gate.test.mjs:167`.
- Việc nền chạy ở `core/jobs.js:55`; kết quả quay lại cửa ở `core/jobs.js:89`.
- Tin hoãn hoặc gửi lỗi được quét lại ở `core/gate.js:176`; tin dở dang lúc khởi động lại được bàn giao ở `core/gate.js:198` (gọi từ `server.js:77`).

## Bảng "sự vật → tệp"

| Sự vật | Tệp chính |
|---|---|
| Điểm vào, nối dây | `server.js` |
| Tiếp nhận tin ở chế độ polling | `channels/zalo-polling.js` |
| Một lượt khách (lõi) | `core/engine.js`, `core/engine-ctx.js` |
| Việc nền bền (lõi) | `core/jobs.js` |
| Cửa gửi (quyết định + thi hành) | `core/gate.js`, `core/gate-decide.js` |
| Lưu trữ SQLite | `core/store.js`, `core/store/schema.js` |
| Chọn gói | `core/registry.js` |
| Cấu hình đọc từ môi trường | `core/config.js` |
| Kênh Zalo | `channels/zalo-bot.js` |
| Client MCP Cổng OZ | `core/mcp.js` |
| Gói hải quan | `packs/hs/index.js`, `packs/hs/packages.js` |
| Sổ ghi lượt "trượt từ vựng" | `packs/hs/miss-log.js` |
| Não AI | `packs/hs/brain.js`, `packs/hs/editor.js`, `packs/hs/llm2.js` |
| Giám sát | `scripts/giam-sat.mjs`, `scripts/giam-sat/tinh-hieu.js` |

Liên quan: [Luồng tin nhắn](luong-tin-nhan.md), [Dữ liệu](du-lieu.md).
