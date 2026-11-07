# AGENTS.md: cách làm việc trong repo này

Repo bot Zalo dùng chung cho toàn công ty OZ Việt Nam. Người và agent (Claude Code, Codex, Cursor…) đều theo đúng quy trình dưới đây.

## Giao thức phiên làm việc

- **Đầu phiên:** đọc `docs/wiki/index.md` (bản đồ tri thức) rồi `docs/wiki/tien-do.md` (tiến độ thật) trước khi làm việc.
- **Cuối phiên:** nếu đã đổi hành vi hoặc trạng thái một việc thì cập nhật trang wiki liên quan và ghi vào `docs/wiki/log.md`.

## Đọc trước khi làm bất cứ việc gì
- **`docs/wiki/index.md`**: bản đồ tri thức của repo (kiến trúc, luồng, vận hành, tiến độ thật). Đổi hành vi thì cập nhật wiki cùng PR.
0. **`docs/TIEP-TUC.md`**: nhật ký phiên cũ — **đã cũ**, không phải tiến độ thật. Tiến độ thật và việc làm tiếp nằm ở `docs/wiki/tien-do.md`.
1. `.specify/memory/constitution.md`: 9 nguyên tắc không thương lượng. Vi phạm là lỗi chặn merge.
2. `docs/ROADMAP.md`: spec nào đang làm, spec nào chưa được làm.
3. Thư mục spec đang làm, ví dụ `specs/001-nen-tang-chung/`: `spec.md` → `plan.md` → `tasks.md`.

## Công cụ
- **spec-kit** (github/spec-kit, cần Python 3.11+ và `uv`): `uv tool install specify-cli`, rồi trong repo chạy
  `specify init --here --integration claude` (giữ nguyên `.specify/memory/constitution.md` và `specs/` đã có).
  Trong Claude Code gọi skill: `/speckit-specify`, `/speckit-clarify`, `/speckit-plan`, `/speckit-tasks`,
  `/speckit-analyze`, `/speckit-implement` (agent khác: xem cú pháp ở tài liệu spec-kit "integrations").
- **Superpowers** (obra/superpowers) cho Claude Code: `/plugin install superpowers@claude-plugins-official`.
  Skill dùng trong repo: `brainstorming` (trước spec mới), `writing-plans` (viết `tasks.md`),
  `subagent-driven-development` hoặc `executing-plans` (làm `tasks.md`), `test-driven-development`,
  `systematic-debugging`, `verification-before-completion`, `requesting-code-review`, `finishing-a-development-branch`.

## Luật làm việc
- Một spec một nhánh `NNN-ten`. Một việc trong `tasks.md` một commit (hoặc vài commit nhỏ), test đỏ trước.
- Không thêm dependency. Không tạo tệp ngoài cấu trúc trong `plan.md` mà không ghi lý do vào `plan.md`.
- Chỉ `core/gate.js` được gửi tin. Gói chỉ trả dữ liệu.
- `npm test` và `npm run eval` phải xanh trước khi mở PR. Báo "xong" thì kèm đầu ra của hai lệnh đó.
- Không commit `.env`, token, dữ liệu khách thật. Fixture eval dùng hội thoại đã ẩn danh (thay tên, số điện thoại).
- Thời gian: lưu UTC, hiển thị giờ VN. Đừng dùng giờ địa phương của máy.

## Văn phòng OZ
Repo do văn phòng vận hành: gửi yêu cầu, đăng ký thành viên và quy trình làm việc xem [`CONTRIBUTING.md`](CONTRIBUTING.md).
Cổng máy: `npm test`, `npm run eval`, `node scripts/kiem-wiki.mjs`.
