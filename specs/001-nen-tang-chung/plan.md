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
| I. Một cửa gửi | Gói chỉ trả `replies`; chỉ `core/gate.js` gọi `channel.sendText` (kiểm bằng `grep` trong test T016 — `test/core/one-gate.test.mjs`) | ✅ |
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
├── mcp.js                # MCP client (Streamable HTTP) cho Cổng OZ — T016. Lý do: hạ tầng dùng chung cho MỌI gói (createEngine tiêm vào như `mcp` rồi bọc audit), không phải kênh khách, không phải nghiệp vụ gói ⇒ thuộc lõi.
├── time.js               # UTC ↔ giờ VN, isQuietHours, nextMorning
├── redact.js             # che token/đường dẫn; dùng cho log, audit, lỗi
├── store.js              # node:sqlite: migrate, các hàm truy vấn theo bảng
├── store/                # schema.js, queue.js, state.js, records.js, util.js: tách theo bảng cho store.js ghép (mỗi tệp < 300 dòng)
├── text.js               # normVi, jaccard, extractMoney
├── gate.js               # decide() thuần + send() thi hành + sweepOutbox()
├── queue.js              # hàng đợi theo chat_id
├── webhook.js            # handler HTTP /health + POST webhook — T018. Lý do: handler phải test được bằng HTTP thật cổng 0 (tasks.md:332) mà `server.js` chạy side-effect lúc import nên không import được trong test; thêm nữa `test/core/one-gate.test.mjs:141` chặn `server.js` quá 120 dòng. Cùng họ với `core/health.js`, không thêm dependency.
├── handoff.js            # trạng thái phòng, lệnh nhân viên
├── handoff-ticket.js     # phiếu vào nhóm nhân viên + gộp tin — T024. Lý do: gộp vào `handoff.js` thì tệp lên 320 dòng, quá hạn 300 của Điều VI; hai trách nhiệm cũng khác nhau (trạng thái phòng KHÔNG gửi tin, phiếu thì gửi qua cửa). Cùng lối `gate-decide.js` tách khỏi `gate.js` và `engine-ctx.js` tách khỏi `engine.js`; không thêm dependency, `createHandoff` vẫn là cửa vào duy nhất
├── jobs.js               # bộ hỏi kết quả việc nền
├── registry.js           # nạp packs/, lọc audience + requiresTools, chọn gói
├── engine.js             # một lượt: inbox → state → pack → gate → audit
├── engine-ctx.js  engine-jobs.js   # ctx cho gói (MCP ghi audit, đệm công cụ, phiên, lịch sử) và bộ hỏi việc nền tối thiểu, tách cho engine.js < 300 dòng (T015; engine-jobs.js chuyển thành jobs.js ở T021)
├── engine-handoff.js     # người trước máy trong một lượt (lệnh nhân viên, phòng ≠ bot thì im + phiếu, "gặp người"/"người hay máy", gói trả `handoff`) — T026. Lý do: cắm thẳng vào `engine.js` thì tệp lên quá 300 dòng (Điều VI); cùng lối `engine-ctx.js`. Tệp không tự gửi, câu cho khách đi qua `reply` của engine (tức `gate.send`)
├── mention.js            # stripMention + isGroup chuyển từ lib/bot.js, lõi bỏ "@Tên bot" ở text và caption (T015)
├── audit.js              # ghi + đọc audit
├── customers.js          # hồ sơ khách, nhãn theo luật, SĐT
├── sdt.js                # ngữ pháp số điện thoại — nguồn DUY NHẤT cho hồ sơ khách (core/customers.js) và che log (scripts/audit.mjs) — T029. Lý do: (1) core/customers.js đã sát giới hạn 300 dòng (Điều VI hiến pháp); (2) lõi (ghi hồ sơ) và cửa ra log (che) phải dùng CHUNG một bộ luật SĐT — nếu mỗi bên tự viết regex thì hai bên trôi lệch nhau và SĐT lọt ra stdout của `npm run audit` (đã xảy ra ở T029 vòng 3–4).
├── backup.js             # VACUUM INTO mỗi ngày, giữ 7 bản
└── ops.js                # /health, /metrics, bản tin gộp
channels/
├── zalo-bot.js           # từ lib/zalo.js, theo contracts/channel.md
└── zalo-polling.js      # vòng lặp polling getUpdates của kênh Zalo — T016. Lý do: đọc tin là việc của KÊNH, không phải của lõi; tách ra để server.js chỉ nối dây và còn ≤ 120 dòng (tasks.md T016).
packs/
└── hs/
    ├── index.js          # manifest + match/handle/onJobResult/footer
    ├── packages.js       # từ lib/packages.js (bỏ vòng chờ waitJob)
    ├── miss-log.js       # sổ ghi lượt "trượt từ vựng" — T016. Lý do: CHỈ gói hs ghi sổ này (packages.js, flow-turn.js) ⇒ nghiệp vụ của gói, không phải hạ tầng chung.
    ├── router.js  render.js  input.js  format.js  vision.js   # chuyển nguyên
    ├── jobs.js           # toJob/waitJob tách từ packages.js để packages.js < 300 dòng (T014)
    ├── flow-turn.js  flow-photo.js   # phiên/bằng chứng/PackResult và lượt ảnh, tách từ index.js cho < 300 dòng (T014)
    ├── nhanh-hoi-hang.js # dựng câu hỏi thuộc tính (`hoiThuocTinh: true`) và giả định mặc định theo nhóm mặt hàng (ắc quy 85.07, điện gia dụng, cơ khí/vật liệu) — OZV-837. Lý do tệp mới: (1) `packs/hs/dien-cho-thieu.js` đã chạm 299/300 dòng (Điều VI), thêm nhánh hỏi chiều cao bình ắc quy vào thẳng tệp đó sẽ vượt trần 300 dòng; (2) tách theo đúng ranh trách nhiệm: `dien-cho-thieu.js` điều phối `kiemTraThongTinPhanLoai` và giữ nhánh xác nhận TÊN hàng (`hoiXacNhanTen`), còn tệp này dựng các nhánh hỏi THUỘC TÍNH khi tên hàng đã rõ. Không thêm dependency; tệp không gửi tin.
    ├── so-tay-hoi.js     # lớp hỏi lại lấy câu từ NGUỒN CHUNG: `hoSo.ketLuan.cauHoi` → `so_tay_questions` của Cổng → regex cũ làm dự phòng (issue #177 mục 1 và 6, OZV-770). Lý do tệp mới: (1) `packs/hs/dien-cho-thieu.js` đã 275/300 dòng, cắm thêm vào là vượt hạn 300 của Điều VI; (2) hai trách nhiệm khác nhau — `dien-cho-thieu.js` tự DỰNG câu bằng regex, tệp này chỉ ĐỌC câu của nguồn chung (hồ sơ / Cổng) và không bịa câu. Không thêm dependency; tệp không gửi tin, chỉ trả dữ liệu cho `packages.js`.
    ├── test/giup-duong-that-hs.mjs  # bộ đồ nghề dựng mạch giả chạy gói HS trên ĐƯỜNG THẬT (`hs.handle` → `packages.js` → `so-tay-hoi.js` → `doc-tra-loi.js` → `phan_loai_hs`) — OZV-795. Lý do tệp mới: tách từ `soat-791-khoa-cong-la.test.mjs` để test OZV-795 dùng CÙNG một kiểu dựng mạch; lớp lỗi rụng tên hàng đã tái xuất ba lần (#213 → #228/OZV-782 → OZV-791) một phần vì mỗi chỗ đo một kiểu. Không kết thúc bằng `.test.mjs` nên `npm test` không thu thập làm tệp test.
    ├── test/khoa-cong-that.mjs      # fixture KHOÁ CÂU HỎI THẬT của Cổng cho `so_tay_questions`, chép 14/11/2026 từ repo công khai `github.com/ozvietnam/hs-code-api` — OZV-795. Lý do tệp mới: khoá phải lấy từ nguồn thật, không gõ tay vào test; đặt phẳng trong `test/` theo tiền lệ `test/cong-that-85094000.mjs`, không mở thư mục `fixtures/` mới. Dữ liệu công khai, không có thông tin khách.
    └── test/hs.test.mjs
eval/
├── run.mjs               # phát lại fixture qua engine với kênh + MCP giả
└── fixtures/*.jsonl
test/
├── test.mjs              # 21 test hiện có, chỉ sửa đường import
├── helpers/fakes.mjs     # Zalo giả, MCP giả, đồng hồ giả, db :memory:
├── helpers/legacy-bot.mjs  # createBot chữ ký cũ trên engine, CHỈ cho test.mjs (T015; nằm ở test/ để server.js không dùng nhầm luật nới)
├── helpers/audit-fixture.mjs  # fixture db audit dùng chung cho các test CLI — dựng db bằng LÕI THẬT để test CLI không dùng dữ liệu bịa — T029. Lý do: dùng chung cho `test/core/audit-cli.test.mjs` + `test/core/audit-masking.test.mjs` để không lặp code fixture; KHÔNG phải tệp test (không kết thúc bằng `.test.mjs`) nên `npm test` không thu thập — lệnh `node --test "test/core/**/*.test.mjs"` chỉ gom tệp trong `test/core/`.
└── core/*.test.mjs       # test của từng module lõi
scripts/
├── set-webhook.mjs       # giữ nguyên
├── giam-sat.mjs          # agent giám sát hằng ngày (dùng scripts/giam-sat/)
├── giam-sat/             # issue.js, telegram.js, tinh-hieu.js — T016. Lý do: thuộc spec 007 (không phải spec 001), nhưng tasks.md T016 yêu cầu dọn hết `lib/`; đặt cạnh `scripts/giam-sat.mjs` (tệp dùng chúng) cho tự nhiên.
└── audit.mjs             # npm run audit -- --chat <id> | --turn <id>
```

**Structure Decision**: Một project. `core/` là lõi chung, `packs/` là nghiệp vụ, `channels/` là kênh.
`lib/` bị xoá ở bước NGAY SAU T016: T016 tạo bản mới ở vị trí mới (`core/mcp.js`, `packs/hs/miss-log.js`, `scripts/giam-sat/`) và sửa đường import; bước sau xoá tệp cũ trong `lib/` (kèm viết lại một tệp test). Gói và kênh không import lẫn nhau, chỉ import `core/types.js`.
Ngoại lệ duy nhất: `packs/hs/render.js` import `findLeak` từ `core/redact.js` để lọc câu lỗi nghiệp vụ của Cổng bằng đúng bộ dò lộ của cửa gửi (T015 vòng 2; chép bản thứ hai thì hai bộ dò sẽ lệch nhau).

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
