# Tiếp tục: trạng thái cuối phiên 04/11/2026 18:20

Đọc tệp này đầu tiên khi làm tiếp. Nhánh làm việc: `001-nen-tang-chung` (draft PR #3). Đầu tiên chạy `npm test`: lúc dừng có **147 test lõi đạt + "21 test đạt"**.

## 1. Đã xong (mỗi việc: một agent làm, một agent khác review, có vòng sửa)

| Việc | Nội dung | Commit cuối |
|---|---|---|
| T001 | Bộ chạy `node:test`, scripts, Docker volume `/app/data` | 9744ec9 |
| T002–T005, T007 | fakes, `core/time.js`, `core/redact.js`, `core/config.js`, `core/text.js` | b7cb56f |
| T006 | `core/store.js` SQLite, 10 bảng (+`core/store/*`) | 79d359b |
| T008–T010 | Cửa gửi: `decide` + `send` + `sweep` + `recover`, `outbox.ctx` | cde215f |
| T011–T013 | `core/types.js`, `channels/zalo-bot.js`, `core/registry.js` | af36915 |
| T014 | 7 gói hải quan → `packs/hs/` (36 lượt đối chiếu khớp bot cũ) | 05e9bed |
| T015 | `core/engine.js`: một lượt, claim nguyên tử, không lộ lỗi hệ thống | 1d4ea55 |

Sổ chi tiết (quyết định, việc gác lại, phát hiện review): `docs/sdd/001-ledger.md` và `docs/sdd/*-review.md`.

## 2. Làm tiếp theo đúng thứ tự

1. **T037** (đang dở): chuyển khoá sang `conv_id` cho nhóm nghìn người. Phần dở nằm ở nhánh **`wip/t037-conv`** (commit 85bd51a: `core/conv.js`, sửa `schema.js`, test đỏ; **chưa xong, test chưa qua**). Lấy về bằng `git checkout wip/t037-conv -- core/conv.js core/store/schema.js test/core/conv.test.mjs`, hoặc làm lại từ đầu theo brief T037 trong `tasks.md`. Danh sách mọi chỗ đang khoá theo `chatId` nằm trong `docs/sdd/T015-report.md`, mục "Places keyed by chatId".
2. **T038**: gắn đúng tên trong nhóm, tách người trùng tên, hàng đợi theo người.
3. **T016 → T026**: nối `server.js`, xoá `lib/`, webhook ghi inbox trước, queue, recover, jobs, handoff.
4. **T033 → T036**: lịch sử, hồ sơ khách, lệnh nhân viên, sao lưu.
5. **T027 → T032**: health/metrics, bản tin, audit CLI, **eval** (`npm run eval` đang đỏ vì `eval/run.mjs` chưa có; đã chấp nhận tới T030), CI, README.

Thứ tự đầy đủ ghi ở cuối `specs/001-nen-tang-chung/tasks.md` ("Thứ tự chạy thật").

## 3. Việc đã gác lại, phải làm ở task sau

| Mang sang | Việc |
|---|---|
| T016 | `gate.send({text: undefined})` phải trả `reject empty`, không ném lỗi · bỏ việc chia tin ở `createZaloClient` cũ · ghi luật "lược đồ v1 đóng băng từ lần deploy đầu, sau đó đổi phải có migration + tăng version" |
| T020 | Lúc khởi động: gọi `gate.recover()` **trước**, rồi `engine.recover()` · dòng inbox `processing` quá 5 phút thì trả về `pending` |
| T021 | Job `polling` quá `expires_at` không còn tính là nợ (review T015 N1) · tách bộ hỏi việc nền ra `core/jobs.js` · thông báo hết hạn khớp 30 phút |
| T032 | README: Coolify phải dùng **named volume** cho `/app/data` (bind mount thì thư mục thuộc root, bot không ghi được) · nhắc cột `outbox.ctx` trong plan |

## 4. Quy trình khi làm tiếp (đã dùng cả phiên)

- Điều phối theo `superpowers:subagent-driven-development`. Mỗi việc: trích brief từ `tasks.md` (mục `### T0NN` + Global Constraints) → agent làm (sonnet cho việc gọn, opus cho việc rủi ro) → gói diff `BASE..HEAD` → agent review (opus cho cửa gửi/engine) → vòng sửa → kiểm lại phạm vi sửa → ghi sổ.
- Commit tài liệu khi có agent đang làm thì **chỉ `git add` đúng đường dẫn**, không `-A` (đã lỡ một lần).
- Đẩy lên GitHub đôi khi lỗi 500: đợi vài giây rồi thử lại.

## 5. Chờ anh Thắng chốt

1. **Spec 008, 5 profile Chrome**: mỗi profile một luồng có chủ (CSKH, hs-code-api, SEO, 007, dự phòng) như em đề xuất, hay cách khác. Không dùng nhiều tài khoản để nhân hạn mức cho một luồng.
2. **Quyền vào văn phòng OZ ảo và VPS Windows 11** (dev server đang cấp): cách truy cập, Chrome + Node 22, tắt ngủ/khoá màn hình, profile do người đăng nhập sẵn.
3. **Nhóm Zalo nhân viên** (`STAFF_CHAT_ID`) và danh sách `STAFF_USERS`: cần trước T024.
4. Spec 007: cách đọc log Cổng OZ trên Coolify (API log, hay ozplugin tự xuất `/metrics`).

## 6. Các spec đã viết

| Spec | Trạng thái |
|---|---|
| `specs/001-nen-tang-chung/` | spec + plan + data-model + contracts + 38 việc; đang làm |
| `specs/007-giam-sat-nang-cap/` | spec (agent giám sát → GitHub issue), làm sau 001, trước 005 |
| `specs/008-cong-ai-studio/` | spec (addon Chrome + hàng đợi AI Studio), làm trước 003; sẽ tách repo `ozvietnam/studio-gateway` |
| `docs/ROADMAP.md` | thứ tự: 001 → 007 → 005; 008 trước 003 |
