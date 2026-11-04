# Implementation Plan: Nền tảng dùng chung cho bot Zalo toàn công ty

**Branch**: `001-nen-tang-chung` | **Date**: 2026-11-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-nen-tang-chung/spec.md`

## Summary

Tách `lib/bot.js` thành một **lõi** có bốn thứ vận hành thật đã chứng minh là bắt buộc: cửa gửi duy nhất, người cầm phòng,
lưu bền (SQLite), audit và eval. Bảy gói hải quan hiện có chuyển nguyên vào `packs/hs/` theo một contract gói.
Hành vi với khách không đổi: 21 test cũ phải xanh ở mọi bước.

## Technical Context

**Language/Version**: JavaScript (ESM), Node.js ≥ 22.13 (Docker `node:22-alpine`)

**Primary Dependencies**: không có. Chỉ thư viện chuẩn: `node:http`, `node:sqlite`, `node:test`, `node:crypto`, `fetch`

**Storage**: SQLite một tệp `DATA_DIR/bot.db` (WAL) trên volume Coolify

**Testing**: `node --test` (unit, contract) + `test/test.mjs` hiện có (giữ nguyên) + `npm run eval` (phát lại fixture)

**Target Platform**: Linux container trên Coolify; chạy thử trên Windows/macOS bằng `ZALO_MODE=polling`

**Project Type**: web service (webhook) + worker trong cùng tiến trình

**Performance Goals**: webhook ack p95 < 200 ms; chuyển phiếu tới nhóm nhân viên p95 < 10 s

**Constraints**: một tiến trình; không dependency runtime; mỗi tệp < 300 dòng; giờ yên 23–07 giờ VN cho tin chủ động

**Scale/Scope**: vài nghìn tin/ngày, vài chục nhân viên, ≤ 10 gói

## Constitution Check

*GATE: phải đạt trước Phase 0, kiểm lại sau Phase 1.*

| Điều | Kiểm | Kết quả |
|---|---|---|
| I. Một cửa gửi | Gói chỉ trả `replies`; chỉ `core/gate.js` gọi `channel.sendText` (kiểm bằng `grep` trong test T020) | ✅ |
| II. Người trước máy | `engine` dừng trước `registry` khi phòng `human`/`blocked`; cửa từ chối lớp hai | ✅ |
| III. Số tiền do code tra | `moneyCheck` ở cửa; gói hs đặt `false` ở v1 vì số thuế lấy nguyên văn từ Cổng; gói CSKH (spec 003) đặt `true` | ✅ |
| IV. Bằng chứng | Bảng `audit`; mọi tin ra có `turn_id`; test không cần mạng | ✅ |
| V. Tri thức một nhà | Không thêm tri thức nào vào code; gói hs vẫn đọc từ Cổng OZ | ✅ |
| VI. Đơn giản | 0 dependency; `node:sqlite` (D1); các tệp mới đều < 300 dòng | ✅, chấp nhận cảnh báo `ExperimentalWarning` của `node:sqlite` (ẩn bằng `--disable-warning=ExperimentalWarning`) |
| VII. Sai thì dừng | db lỗi → webhook trả 503; cửa từ chối khi không đọc được `facts` | ✅ |
| VIII. Trung thực | Câu trả lời "người hay máy" là câu cố định của lõi, gói không ghi đè | ✅ |
| IX. Bí mật | `core/redact.js` dùng chung cho log, audit, lỗi gửi khách; SĐT và nội dung tin chỉ nằm trong `messages`/`customers`, không vào audit hay log | ✅ |
| Lõi lai (D9) | Spec này không gọi mô hình nào; giao diện `brain.draft()` để spec 003 | ✅ |

## Project Structure

### Documentation (this feature)

```text
specs/001-nen-tang-chung/
├── spec.md
├── plan.md              # tệp này
├── research.md          # kinh nghiệm vận hành + quyết định
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── pack.md
│   ├── send-gate.md
│   └── channel.md
└── tasks.md
```

### Source Code (repository root)

```text
server.js                 # chỉ nối dây: config → store → channel → engine → http/poll
core/
├── config.js             # đọc + kiểm biến môi trường, trả object đóng băng
├── time.js               # UTC ↔ giờ VN, isQuietHours, nextMorning
├── redact.js             # che token/đường dẫn; dùng cho log, audit, lỗi
├── store.js              # node:sqlite: migrate, các hàm truy vấn theo bảng
├── store/                # schema.js, queue.js, state.js, records.js, util.js: tách theo bảng cho store.js ghép (mỗi tệp < 300 dòng)
├── text.js               # normVi, jaccard, extractMoney
├── gate.js               # decide() thuần + send() thi hành + sweepOutbox()
├── queue.js              # hàng đợi theo chat_id
├── handoff.js            # trạng thái phòng, phiếu, lệnh nhân viên
├── jobs.js               # bộ hỏi kết quả việc nền
├── registry.js           # nạp packs/, lọc audience + requiresTools, chọn gói
├── engine.js             # một lượt: inbox → state → pack → gate → audit
├── engine-ctx.js  engine-jobs.js   # ctx cho gói (MCP ghi audit, đệm công cụ, phiên, lịch sử) và bộ hỏi việc nền tối thiểu, tách cho engine.js < 300 dòng (T015; engine-jobs.js chuyển thành jobs.js ở T021)
├── mention.js            # stripMention + isGroup chuyển từ lib/bot.js, lõi bỏ "@Tên bot" ở text và caption (T015)
├── audit.js              # ghi + đọc audit
├── customers.js          # hồ sơ khách, nhãn theo luật, SĐT
├── backup.js             # VACUUM INTO mỗi ngày, giữ 7 bản
└── ops.js                # /health, /metrics, bản tin gộp
channels/
└── zalo-bot.js           # từ lib/zalo.js, theo contracts/channel.md
packs/
└── hs/
    ├── index.js          # manifest + match/handle/onJobResult/footer
    ├── packages.js       # từ lib/packages.js (bỏ vòng chờ waitJob)
    ├── router.js  render.js  input.js  format.js  vision.js   # chuyển nguyên
    ├── jobs.js           # toJob/waitJob tách từ packages.js để packages.js < 300 dòng (T014)
    ├── flow-turn.js  flow-photo.js   # phiên/bằng chứng/PackResult và lượt ảnh, tách từ index.js cho < 300 dòng (T014)
    └── test/hs.test.mjs
eval/
├── run.mjs               # phát lại fixture qua engine với kênh + MCP giả
└── fixtures/*.jsonl
test/
├── test.mjs              # 21 test hiện có, chỉ sửa đường import
├── helpers/fakes.mjs     # Zalo giả, MCP giả, đồng hồ giả, db :memory:
├── helpers/legacy-bot.mjs  # createBot chữ ký cũ trên engine, CHỈ cho test.mjs (T015; nằm ở test/ để server.js không dùng nhầm luật nới)
└── core/*.test.mjs       # test của từng module lõi
scripts/
├── set-webhook.mjs       # giữ nguyên
└── audit.mjs             # npm run audit -- --chat <id> | --turn <id>
```

**Structure Decision**: Một project. `core/` là lõi chung, `packs/` là nghiệp vụ, `channels/` là kênh.
`lib/` bị xoá sau khi chuyển xong (T030). Gói và kênh không import lẫn nhau, chỉ import `core/types.js`.

## Luồng một lượt

```text
POST /webhook ─► verifyWebhook ─► store.inbox.insertIgnore ─► 200 (hoặc 503 nếu db lỗi)
                                         │
                                         ▼
                             queue.run(chatId, engine.process)
                                         │
     ┌──── phòng human/blocked ◄── handoff.stateOf(chatId)
     │       └─► handoff.forward(ticket)  (không gọi gói)
     │
     ├──── tin nhân viên trong STAFF_CHAT_ID ─► handoff.command(/tl /nhan /tra-bot /chan /cho)
     │
     ├──── "gặp người / người hay máy" ─► câu cố định của lõi (+ handoff)
     │
     └──── registry.pick(turn) ─► pack.handle(turn, ctx)
                                     │ replies, evidence, jobs, handoff
                                     ▼
                       gate.send(reply_i) …  jobs.add(…)  handoff.open(…)
                                     ▼
                              audit · inbox.done
```

## Thứ tự làm và lý do

1. **Nền** (config, time, redact, store, text): mọi phần khác cần.
2. **Cửa gửi (US1)**: hàm thuần `decide` test được ngay, chưa đụng tới bot cũ.
3. **Engine + registry + chuyển gói hs (US4)**: thay `lib/bot.js` bằng `core/engine.js`; 21 test cũ là lưới an toàn.
   Làm trước US3 vì US3 và US2 đều cắm vào engine.
4. **Bền vững (US3)**: inbox, queue, jobs.
5. **Người cầm phòng (US2)**.
6. **Lịch sử và hồ sơ khách (US7)**: cắm vào engine và phiếu sau khi handoff chạy.
7. **Vận hành (US5)**, rồi **eval (US6)**.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `node:sqlite` còn "experimental" trên Node 22 | Lưu bền mà không thêm dependency (VI) | Tệp JSON: không có giao dịch, không UNIQUE, hai luồng ghi đè nhau (đúng loại lỗi research #2) |
