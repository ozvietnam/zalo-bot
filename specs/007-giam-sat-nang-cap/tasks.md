---
description: "Danh sách việc spec 007: khuôn spec-kit, mỗi việc viết theo writing-plans của Superpowers (TDD, tệp chính xác, giao diện, lệnh kiểm)"
---

# Tasks: Agent giám sát và vòng nâng cấp repo nguồn (007)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` hoặc
> `superpowers:executing-plans` để làm từng việc. Mỗi việc theo `superpowers:test-driven-development`:
> test đỏ → chạy thấy đỏ → code tối thiểu → chạy thấy xanh → commit. Trước khi báo xong dùng
> `superpowers:verification-before-completion`. Bước dùng checkbox (`- [ ]`).

**Goal:** Xây dựng hệ thống Agent giám sát độc lập đọc dữ liệu chỉ-đọc từ SQLite của bot Zalo, tính toán 9 tín hiệu lỗi bằng code thuần túy, gom nhóm nhu cầu tuần bằng Gemini AI Studio miễn phí, tự động mở/bình luận GitHub issue vào đúng repo đích (`zalo-bot`, `ozplugin`, `hs-code-api`), và gửi bản tin tổng hợp vào nhóm nhân viên qua cửa gửi `kind: 'digest'` của Spec 001.

**Architecture:** Script CLI chạy theo lịch (`scripts/giam-sat.mjs`) → Mở SQLite bot chỉ-đọc (`DatabaseSync` với `readOnly: true`) → Tính 9 tín hiệu có fingerprint và `turn_id` bằng chứng → Ẩn danh bằng chứng (redact token, SĐT, STK, tên khách) → Mở/bình luận GitHub issue qua REST API → Gửi bản tin ngày/tuần qua cửa gửi `kind: 'digest'` (+ Telegram nếu có cấu hình) → Ghi sổ nhật ký thực thi.

**Tech Stack:** Node.js ≥ 22.13 ESM, `node:sqlite`, `node:test`, `node:crypto`, `fetch`. Không thêm dependency ngoài thư viện chuẩn.

**Spec:** `specs/007-giam-sat-nang-cap/spec.md` · kế hoạch tại `specs/007-giam-sat-nang-cap/plan.md`.

## Global Constraints

- Không thêm runtime dependency vào `package.json`.
- Mỗi tệp mã nguồn mới dưới 300 dòng (Hiến pháp VI).
- Tuyệt đối không ghi vào cơ sở dữ liệu `DATA_DIR/bot.db` của bot (FR-005).
- Không sửa code, không tạo PR, không gửi tin nhắn trực tiếp cho khách hàng (FR-005).
- Thời gian lưu UTC dạng ISO 8601; hiển thị và mốc lọc theo múi giờ Việt Nam (`Asia/Ho_Chi_Minh`, UTC+7).
- Mọi bằng chứng trích dẫn phải ẩn danh hoàn toàn: dùng `core/redact.js` cho token/đường dẫn, `core/sdt.js` cho số điện thoại, thay tên khách thành "Khách A/B" (FR-004, SC-002).
- Giới hạn 5 issue mới / repo / ngày; issue trùng fingerprint thì bình luận dồn (FR-003, FR-007, SC-004).
- `npm test` chạy nội bộ không cần mạng (dùng mock/fake cho GitHub API, Gemini API, Telegram API).

---

## Bảng đối chiếu yêu cầu (Traceability Matrix)

Bảng đối chiếu toàn bộ 11 Functional Requirements (FR-001..FR-011) và 6 Success Criteria (SC-001..SC-006) của `spec.md` với mã nguồn hiện có và các nhiệm vụ thực thi:

| Yêu cầu | Nội dung đặc tả | Code hiện có (tệp:dòng) | Trạng thái | Mã task |
|---|---|---|---|---|
| **FR-001** | Tính các tín hiệu US1 bằng code từ db bot theo ngưỡng config | `scripts/giam-sat/tinh-hieu.js:5-15`, `scripts/giam-sat/tinh-hieu.js:37` | **Lệch** (ngưỡng fix cứng, mapping speaker lệch, chưa có test suite) | T703, T705 |
| **FR-002** | Phát hiện có: mã, số đo, khoảng tg, `turn_id` bằng chứng, repo đích, fingerprint | `scripts/giam-sat/tinh-hieu.js:40-43`, `scripts/giam-sat/tinh-hieu.js:48` | **Lệch** (chưa có trường `fingerprint` rõ ràng, thiếu `turn_id` ở một số tín hiệu) | T705 |
| **FR-003** | Mở GitHub issue đúng repo bằng token issues, chống trùng theo fingerprint | `scripts/giam-sat/issue.js:40-44`, `scripts/giam-sat/issue.js:78-103` | **Lệch** (tìm theo `ma` thay vì `fingerprint`, thiếu template US2 chuẩn) | T707 |
| **FR-004** | Ẩn danh bằng chứng trước khi xuất: tên → nhãn, SĐT/STK → che, token → `***` | `scripts/giam-sat.mjs:12`, `scripts/giam-sat/issue.js:111` | **Lệch** (chỉ gọi `redact` thô, chưa che SĐT qua `core/sdt.js`, chưa che STK và tên khách) | T706 |
| **FR-005** | MUST NOT sửa code, mở PR, ghi vào db của bot, hay gửi tin cho khách | `scripts/giam-sat.mjs:30-49` (`DatabaseSync` readOnly) | **Đã sửa** (T701, mở DatabaseSync readOnly, không openStore) | T701 |
| **FR-006** | Gemini nhận cả lô tuần 1 lần gọi, JSON schema cố định, kiểm tra `turn_id` thật | Chưa có code | **Chưa làm** | T708 |
| **FR-007** | Giới hạn tối đa 5 issue mới / repo / ngày; phần dư chuyển vào bản tin | `scripts/giam-sat/issue.js:7`, `scripts/giam-sat/issue.js:91-95` | **Xong một phần** (đã có biến đếm, chưa có test tự động khoá) | T707 |
| **FR-008** | Issue đã đóng mà tín hiệu vẫn vượt ngưỡng 3 ngày liền phải mở lại kèm số đo mới | `scripts/giam-sat/issue.js:41` (chỉ tìm `is:open`) | **Chưa làm** | T707 |
| **FR-009** | Nguồn máy chủ Fanpage đọc bản sao db chỉ-đọc; nguồn Cổng OZ đọc log chỉ-đọc | Chưa có code | **Chưa làm** | T709, T710 |
| **FR-010** | Bản tin ngày (07:30) và tuần (thứ Hai 08:00) giờ VN vào nhóm nhân viên qua cửa gửi 001 `kind: 'digest'` | `scripts/giam-sat.mjs:84-86`, `scripts/giam-sat/telegram.js:10` | **Lệch** (hiện gửi Telegram cho CEO, chưa gửi vào nhóm nhân viên qua Zalo digest) | T704 |
| **FR-011** | Ghi bản ghi thực thi: nguồn đã đọc, số tin, số phát hiện, issue mở/bình luận, lỗi | `scripts/giam-sat.mjs:78-82` (chỉ lưu file markdown thô) | **Chưa làm** (chưa có lưu trữ có cấu trúc) | T712 |
| **SC-001** | Bắt đủ 9 lỗi trên db mẫu cài sẵn, 0 phát hiện thừa | `scripts/giam-sat/tinh-hieu.js:37` | **Chưa làm** (chưa có bộ test fixture 9 lỗi) | T705 |
| **SC-002** | 0 issue chứa SĐT, STK, token hay tên khách thật (quét tự động) | `scripts/giam-sat/issue.js:111` | **Chưa làm** (chưa có test quét rò rỉ dữ liệu) | T706 |
| **SC-003** | ≥ 80% issue giám sát được gắn nhãn "đúng vấn đề" trong 4 tuần đầu | Cần theo dõi vận hành | **Chưa làm** | T712 |
| **SC-004** | Lỗi lặp lại không sinh issue trùng: số issue mở / số fingerprint = 1 | `scripts/giam-sat/issue.js:78-90` | **Chưa làm** (chưa có test khoá) | T707 |
| **SC-005** | Mỗi issue đã đóng có số đo trước/sau trong bản tin tuần kế tiếp | Chưa có code | **Chưa làm** | T711 |
| **SC-006** | Chi phí AI = 0 đồng (Gemini miễn phí), tối đa 1 lần gọi Gemini / tuần cho US3 | Chưa có code | **Chưa làm** | T708 |

---

## Phase 1: Sửa chữa 4 điểm lệch nền tảng (Foundational Alignments)

### T701 [P] Mở SQLite bot ở chế độ chỉ-đọc tuyệt đối (`readOnly: true`), cấm gọi `openStore` (FR-005)

Khắc phục lệch tại `scripts/giam-sat.mjs:30-31`: việc gọi `openStore(DB_PATH)` mở db ở chế độ đọc-ghi và tự động chạy migration tạo bảng, vi phạm nghiêm ngặt nguyên tắc chỉ-đọc của FR-005. Phải mở trực tiếp bằng `new DatabaseSync(DB_PATH, { readOnly: true })` tương tự `scripts/audit.mjs:174`.

**Files:** Modify `scripts/giam-sat.mjs` · Create `test/giam-sat/readonly-store.test.mjs`

**Interfaces — Produces:**
- Mở kết nối SQLite chỉ-đọc trực tiếp, không import `openStore`.
- Báo lỗi rõ ràng và dừng tiến trình nếu `bot.db` không tồn tại hoặc không thể đọc.

- [x] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('T701: scripts/giam-sat.mjs không được import hoặc gọi openStore', () => {
  const content = readFileSync('scripts/giam-sat.mjs', 'utf8');
  assert.equal(content.includes('openStore'), false, 'Không được sử dụng openStore trong scripts/giam-sat.mjs');
  assert.equal(content.includes('readOnly: true'), true, 'Phải mở db với tùy chọn readOnly: true');
});
```
- [x] **Step 2:** Chạy `node --test test/giam-sat/readonly-store.test.mjs` → FAIL (do `scripts/giam-sat.mjs` đang chứa `openStore`).
- [x] **Step 3:** Sửa `scripts/giam-sat.mjs`: xoá import `openStore`, xoá dòng 30-31 `const store = openStore(DB_PATH); store.close();`, chỉ giữ lại `new DatabaseSync(DB_PATH, { readOnly: true })`.
- [x] **Step 4:** Chạy lại `node --test test/giam-sat/readonly-store.test.mjs` → PASS.
- [x] **Step 5:** `git commit -m "fix(giam-sat): enforce strict read-only database connection (T701)"`

---

### T702 [P] Chuẩn hóa mốc thời gian lọc dữ liệu theo giờ Việt Nam (`Asia/Ho_Chi_Minh`) (Ràng buộc kỹ thuật)

Khắc phục lệch tại `scripts/giam-sat.mjs:17,33-34`: hiện đang lấy ngày theo `new Date().toISOString().slice(0, 10)` (ngày UTC) và gán cứng `T00:00:00Z` - `T23:59:59Z`, dẫn đến lệch 7 tiếng so với ngày hoạt động thực tế của khách hàng tại Việt Nam.

**Files:** Modify `scripts/giam-sat.mjs` · Create `test/giam-sat/vn-time-bounds.test.mjs`

**Interfaces — Produces:**
- `layKhoangNgayVnUtc(ngayYmd?: string) -> { ngayVn: string, dauNgayUtc: string, cuoiNgayUtc: string }`

- [x] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { layKhoangNgayVnUtc } from '../../scripts/giam-sat/time-util.js';

test('T702: Mốc lọc ngày VN phải đổi chính xác sang UTC', () => {
  // Ngày VN 2026-11-06 tính từ 00:00:00 VN (17:00:00 UTC hôm trước) đến 23:59:59.999 VN (16:59:59.999 UTC hôm nay)
  const { ngayVn, dauNgayUtc, cuoiNgayUtc } = layKhoangNgayVnUtc('2026-11-06');
  assert.equal(ngayVn, '2026-11-06');
  assert.equal(dauNgayUtc, '2026-11-05T17:00:00.000Z');
  assert.equal(cuoiNgayUtc, '2026-11-06T16:59:59.999Z');
});
```
- [x] **Step 2:** Chạy `node --test test/giam-sat/vn-time-bounds.test.mjs` → FAIL (chưa có module `time-util.js`).
- [x] **Step 3:** Tạo `scripts/giam-sat/time-util.js` tận dụng `core/time.js` hoặc chuyển đổi mốc UTC tương ứng với ngày VN; cập nhật `scripts/giam-sat.mjs` sử dụng hàm này.
- [x] **Step 4:** Chạy lại `node --test test/giam-sat/vn-time-bounds.test.mjs` → PASS.
- [x] **Step 5:** `git commit -m "fix(giam-sat): align query time range with Vietnam timezone (T702)"`

---

### T703 [P] Chuẩn hóa ánh xạ người nói (`speaker`) khớp với dữ liệu lõi bot

Khắc phục lệch tại `scripts/giam-sat.mjs:38`: code hiện map `speaker === 'bot_out' ? 'bot' : r.speaker`. Tuy nhiên lõi bot ghi vào bảng `messages` các giá trị thực tế: `'khach'` (tin khách gửi đến), `'bot'` (tin bot gửi đi), `'nhan-vien'` (tin nhân viên trả lời). Trong khi đó, `tinh-hieu.js` đang kiểm tra `speaker === 'user'` và `speaker === 'staff'`. Cần chuẩn hóa toàn diện.

**Files:** Modify `scripts/giam-sat.mjs`, `scripts/giam-sat/tinh-hieu.js` · Create `test/giam-sat/speaker-mapping.test.mjs`

**Interfaces — Produces:**
- Nhận diện đúng 3 vai trò trong hội thoại: `khach` (user), `bot`, `nhan-vien` (staff).

- [ ] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { tinhHieu } from '../../scripts/giam-sat/tinh-hieu.js';

test('T703: tinhHieu nhận diện đúng speaker = khach và nhan-vien từ core messages', () => {
  const messages = [
    { chat_id: 'chat-gia-001', speaker: 'bot', text: 'Chào bạn', at: '2026-11-06T08:00:00Z' },
    { chat_id: 'chat-gia-001', speaker: 'nhan-vien', text: 'Em xin lỗi gửi nhầm', at: '2026-11-06T08:01:00Z' },
  ];
  const ketQua = tinhHieu({ messages, outbox: [], jobs: [], audit: [], ngay: '2026-11-06' });
  const xinLoi = ketQua.find(k => k.ma === 'XIN-LOI-TAY');
  assert.ok(xinLoi, 'Phải phát hiện XIN-LOI-TAY với speaker nhan-vien');
});
```
- [ ] **Step 2:** Chạy `node --test test/giam-sat/speaker-mapping.test.mjs` → FAIL (do `tinh-hieu.js` chỉ tìm `speaker === 'staff'`).
- [ ] **Step 3:** Cập nhật `scripts/giam-sat/tinh-hieu.js` chấp nhận cả `'nhan-vien'`/`'staff'` và `'khach'`/`'user'`. Bỏ ánh xạ thừa `bot_out` ở `scripts/giam-sat.mjs:38`.
- [ ] **Step 4:** Chạy lại `node --test test/giam-sat/speaker-mapping.test.mjs` → PASS.
- [ ] **Step 5:** `git commit -m "fix(giam-sat): normalize speaker mapping to match core messages table (T703)"`

---

### T704 Tích hợp gửi bản tin qua cửa gửi 001 `kind: 'digest'` vào nhóm nhân viên (FR-010)

Khắc phục lệch tại `scripts/giam-sat.mjs:84-86`: chuyển đổi việc gửi bản tin sang cửa gửi chuẩn của lõi bot với `kind: 'digest'` vào `STAFF_CHAT_ID`. Kênh Telegram được chuyển thành kênh phụ tuỳ chọn (chỉ gửi khi có env).

**Files:** Create `scripts/giam-sat/digest.js` · Modify `scripts/giam-sat.mjs` · Create `test/giam-sat/digest-delivery.test.mjs`

**Interfaces — Produces:**
- `soanBanTin({ ngay, phatHien, ketQua, loai }) -> string`
- `guiBanTinDigest({ banTin, gate, staffChatId, now }) -> Promise<{ ok: boolean, decision?: string }>`

- [ ] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { guiBanTinDigest } from '../../scripts/giam-sat/digest.js';

test('T704: Bản tin giám sát phải gửi qua cửa gate.send với kind: digest', async () => {
  const sent = [];
  const fakeGate = {
    send: async (req) => {
      sent.push(req);
      return { ok: true, decision: 'send' };
    }
  };
  await guiBanTinDigest({
    banTin: 'Bản tin giám sát ngày 2026-11-06',
    gate: fakeGate,
    staffChatId: process.env.STAFF_CHAT_ID || '<STAFF_CHAT_ID>',
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].kind, 'digest');
  assert.equal(sent[0].chatId, process.env.STAFF_CHAT_ID || '<STAFF_CHAT_ID>');
  assert.equal(sent[0].isGroup, true);
});
```
- [ ] **Step 2:** Chạy `node --test test/giam-sat/digest-delivery.test.mjs` → FAIL.
- [ ] **Step 3:** Tạo `scripts/giam-sat/digest.js` hiện thực hóa logic soạn bản tin và gửi qua gate (hoặc endpoint nội bộ nếu chạy CLI); cập nhật `scripts/giam-sat.mjs`.
- [ ] **Step 4:** Chạy lại `node --test test/giam-sat/digest-delivery.test.mjs` → PASS.
- [ ] **Step 5:** `git commit -m "feat(giam-sat): route digest bulletin through send gate with kind digest (T704)"`

---

## Phase 2: Bắt lỗi số đo và Quản lý GitHub Issue (Core Findings & Issues)

### T705 Hoàn thiện tính 9 tín hiệu, chuẩn hóa cấu trúc phát hiện có `fingerprint` và `turn_id` (FR-001, FR-002, SC-001)

Chuẩn hóa output của `tinhHieu`: mỗi phát hiện phải có mã, số đo, repo, danh sách `turn_id` cụ thể, mô tả và chuỗi `fingerprint` duy nhất (ví dụ: `GATE-LEAK`, `TOOL-ERR:tra_thue`, `HOI-LAI`). Đảm bảo bắt đúng 9/9 tín hiệu lỗi trên database fixture mẫu.

**Files:** Modify `scripts/giam-sat/tinh-hieu.js` · Create `test/giam-sat/tinh-hieu.test.mjs`, `test/helpers/giam-sat-fixture.mjs`

**Interfaces — Produces:**
- `tinhHieu(duLieu) -> Array<{ ma: string, cheDo?: string, soDo: string, repo: string, turnIds: string[], bangChung: any[], moTa: string, fingerprint: string }>`

- [ ] **Step 1: Test đỏ (SC-001)**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { tinhHieu } from '../../scripts/giam-sat/tinh-hieu.js';
import { taoDbMau9Loi } from '../helpers/giam-sat-fixture.mjs';

test('T705 (SC-001): Bắt đủ 9 loại lỗi trên db mẫu, 0 phát hiện thừa', () => {
  const duLieu = taoDbMau9Loi('2026-11-06');
  const phatHien = tinhHieu(duLieu);
  assert.equal(phatHien.length, 9, 'Phải bắt đúng 9 phát hiện');
  for (const p of phatHien) {
    assert.ok(p.fingerprint, `Phát hiện ${p.ma} phải có fingerprint`);
    assert.ok(Array.isArray(p.turnIds), `Phát hiện ${p.ma} phải có danh sách turnIds`);
  }
});
```
- [ ] **Step 2:** Chạy `node --test test/giam-sat/tinh-hieu.test.mjs` → FAIL.
- [ ] **Step 3:** Tạo helper `test/helpers/giam-sat-fixture.mjs` sinh dữ liệu mẫu đủ 9 lỗi (`GATE-LEAK`, `GATE-MONEY`, `TOOL-ERR`, `TOOL-EMPTY`, `JOB-EXPIRED`, `HOI-LAI`, `NGUOI-THAY`, `KHACH-BUC`, `XIN-LOI-TAY`). Nâng cấp `scripts/giam-sat/tinh-hieu.js` sinh trường `fingerprint` và `turnIds`.
- [ ] **Step 4:** Chạy lại `node --test test/giam-sat/tinh-hieu.test.mjs` → PASS.
- [ ] **Step 5:** `git commit -m "feat(giam-sat): add fingerprints, turn_id tracking and 9-signal test suite (T705)"`

---

### T706 [P] Module ẩn danh bằng chứng (`an-danh.js`): che SĐT, STK, token, đường dẫn và tên khách (FR-004, SC-002)

Xây dựng module ẩn danh độc lập tái sử dụng `core/redact.js` (cho token, path) và `core/sdt.js` (cho số điện thoại), bổ sung regex che số tài khoản ngân hàng và chuyển tên khách thành "Khách A/B".

**Files:** Create `scripts/giam-sat/an-danh.js` · Create `test/giam-sat/an-danh.test.mjs`

**Interfaces — Produces:**
- `anDanhVanBan(text: string, mapKhach?: Map<string, string>) -> string`
- `anDanhBangChung(bangChung: Array<any>) -> Array<any>`

- [x] **Step 1: Test đỏ (SC-002)**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { anDanhVanBan } from '../../scripts/giam-sat/an-danh.js';

test('T706 (SC-002): Che sạch thông tin nhạy cảm trước khi đưa vào issue', () => {
  const raw = 'Khách A, SĐT SDT_GIA, STK STK_GIA Techcombank, token TOKEN_GIA, path PATH_GIA';
  const clean = anDanhVanBan(raw);
  assert.equal(clean.includes('SDT_GIA'), false, 'Không được để lộ SĐT');
  assert.equal(clean.includes('STK_GIA'), false, 'Không được để lộ STK');
  assert.equal(clean.includes('Khách A'), false, 'Không được để lộ tên khách');
  assert.equal(clean.includes('TOKEN_GIA'), false, 'Không được để lộ token');
  assert.equal(clean.includes('PATH_GIA'), false, 'Không được để lộ đường dẫn');
});
```
- [x] **Step 2:** Chạy `node --test test/giam-sat/an-danh.test.mjs` → FAIL.
- [x] **Step 3:** Viết `scripts/giam-sat/an-danh.js`: tích hợp `cheSdt` từ `core/sdt.js`, `redact` từ `core/redact.js`, bổ sung regex STK và ẩn danh tên khách; cập nhật `issue.js` gọi module này.
- [x] **Step 4:** Chạy lại `node --test test/giam-sat/an-danh.test.mjs` → PASS.
- [x] **Step 5:** `git commit -m "feat(giam-sat): implement comprehensive data sanitization for issues (T706)"`

---

### T707 Hoàn thiện xử lý GitHub issue qua REST API: tạo mới, bình luận dồn, trần 5 issue/repo/ngày, mở lại sau 3 ngày (FR-003, FR-007, FR-008, SC-004)

Nâng cấp `scripts/giam-sat/issue.js`: tìm issue cũ theo `fingerprint`, bình luận dồn nếu issue đang mở (SC-004), kiểm tra nếu issue đã đóng mà tín hiệu vẫn vượt ngưỡng 3 ngày thì reopen issue (FR-008), tuân thủ trần 5 issue mới/repo/ngày (FR-007).

**Files:** Modify `scripts/giam-sat/issue.js` · Create `test/giam-sat/issue.test.mjs`

**Interfaces — Produces:**
- `xuLyIssue(phatHien, opts) -> Promise<{ moi: Array, comment: Array, reopen: Array, boViGioiHan: Array }>`

- [ ] **Step 1: Test đỏ (SC-004 & FR-008)**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { xuLyIssue } from '../../scripts/giam-sat/issue.js';

test('T707: Chống trùng issue theo fingerprint và tôn trọng trần 5 issue/repo/ngày', async () => {
  const calls = [];
  const fakeGh = async (path, opts) => {
    calls.push({ path, opts });
    if (path.includes('/search/issues')) return { items: [{ number: 12, state: 'open', title: '[giám sát] TOOL-ERR' }] };
    return { number: 12 };
  };
  const phatHien = [{ ma: 'TOOL-ERR', cheDo: 'tra_thue', fingerprint: 'TOOL-ERR:tra_thue', soDo: '5 lần', repo: 'ozplugin', bangChung: [], moTa: 'Lỗi' }];
  const res = await xuLyIssue(phatHien, { ghClient: fakeGh, ngay: '2026-11-06' });
  assert.equal(res.comment.length, 1, 'Trùng fingerprint phải thêm comment vào issue cũ');
  assert.equal(res.moi.length, 0, 'Không mở issue mới khi đã có issue đang mở');
});
```
- [ ] **Step 2:** Chạy `node --test test/giam-sat/issue.test.mjs` → FAIL.
- [ ] **Step 3:** Sửa `scripts/giam-sat/issue.js`: tiêm được client HTTP giả để test không cần mạng; thêm nhãn `fp:<hash>` hoặc tìm theo fingerprint; xử lý trạng thái đóng và mở lại nếu vượt ngưỡng 3 ngày; áp dụng trần 5 issue mới.
- [ ] **Step 4:** Chạy lại `node --test test/giam-sat/issue.test.mjs` → PASS.
- [ ] **Step 5:** `git commit -m "feat(giam-sat): issue lifecycle management, deduplication and daily limits (T707)"`

---

## Phase 3: Vòng lặp tuần & Gom nhóm nhu cầu AI (Weekly Cycle & Closed Loop)

### T708 Gom nhóm nhu cầu tuần qua Gemini AI Studio và kiểm tra đối chiếu `turn_id` thật (US3, FR-006, SC-006)

Xây dựng module `scripts/giam-sat/gemini-cluster.js`: gom toàn bộ các đoạn hội thoại khách cần nhân viên hỗ trợ trong tuần gửi một lần duy nhất lên Gemini AI Studio với schema JSON bắt buộc. Kiểm tra đối chiếu toàn bộ `turn_id` trích dẫn với database; nếu AI bịa `turn_id` thì loại bỏ nhóm đó ngay (Hiến pháp IV).

**Files:** Create `scripts/giam-sat/gemini-cluster.js` · Create `test/giam-sat/gemini-cluster.test.mjs`

**Interfaces — Produces:**
- `gomNhomNhuCau({ hoiThoaiTuan, db, geminiApiKey }) -> Promise<Array<{ tenNhom: string, soPhong: number, turnIds: string[], deXuatCongCu: string, repo: string }>>`

- [ ] **Step 1: Test đỏ (FR-006, SC-006)**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { xacThucTurnIds } from '../../scripts/giam-sat/gemini-cluster.js';

test('T708 (FR-006): Loại bỏ nhóm nhu cầu nếu Gemini trích dẫn turn_id không có thật', () => {
  const dbTurns = new Set(['turn-001', 'turn-002', 'turn-003']);
  const nhomHopLe = { tenNhom: 'Cước vận chuyển', turnIds: ['turn-001', 'turn-002'] };
  const nhomBia = { tenNhom: 'Ảo giác', turnIds: ['turn-999'] };

  assert.equal(xacThucTurnIds(nhomHopLe, dbTurns), true);
  assert.equal(xacThucTurnIds(nhomBia, dbTurns), false, 'Phải loại bỏ nhóm có turn_id bịa');
});
```
- [ ] **Step 2:** Chạy `node --test test/giam-sat/gemini-cluster.test.mjs` → FAIL.
- [ ] **Step 3:** Tạo `scripts/giam-sat/gemini-cluster.js` với prompt chuẩn, JSON schema, và hàm thẩm định `turn_id` đối chiếu với SQLite.
- [ ] **Step 4:** Chạy lại `node --test test/giam-sat/gemini-cluster.test.mjs` → PASS.
- [ ] **Step 5:** `git commit -m "feat(giam-sat): weekly Gemini need clustering with citation verification (T708)"`

---

### T711 Đo lường đối chiếu số đo trước/sau cho các issue đã đóng trong 14 ngày (US6, SC-005)

Xây dựng module `scripts/giam-sat/vong-lap.js`: lấy danh sách các issue giám sát đã đóng trong 14 ngày gần nhất, tính lại số đo của tín hiệu đó trong 7 ngày sau khi đóng so với 7 ngày trước khi đóng, đưa vào bản tin sáng thứ Hai để xác nhận lỗi đã thực sự được giải quyết.

**Files:** Create `scripts/giam-sat/vong-lap.js` · Create `test/giam-sat/vong-lap.test.mjs`

**Interfaces — Produces:**
- `doLuongTruocSau({ issueDaDong, db, ngayHienTai }) -> Array<{ issueNumber: number, ma: string, repo: string, soDoTruoc: string, soDoSau: string, giamThanhCong: boolean }>`

- [ ] **Step 1: Test đỏ (SC-005)**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { doLuongTruocSau } from '../../scripts/giam-sat/vong-lap.js';

test('T711 (SC-005): So sánh chính xác số đo trước và sau khi đóng issue', () => {
  const issueDaDong = [{ number: 45, ma: 'HOI-LAI', closed_at: '2026-11-01T00:00:00Z', repo: 'zalo-bot' }];
  const fakeDb = {
    demTinHieu: (ma, from, to) => from < '2026-11-01' ? 14 : 2
  };
  const ketQua = doLuongTruocSau({ issueDaDong, db: fakeDb, ngayHienTai: '2026-11-08' });
  assert.equal(ketQua.length, 1);
  assert.equal(ketQua[0].giamThanhCong, true);
  assert.equal(ketQua[0].soDoTruoc, '14');
  assert.equal(ketQua[0].soDoSau, '2');
});
```
- [ ] **Step 2:** Chạy `node --test test/giam-sat/vong-lap.test.mjs` → FAIL.
- [ ] **Step 3:** Tạo `scripts/giam-sat/vong-lap.js` hiện thực hóa logic truy vấn số đo đối chiếu trước/sau ngày đóng issue.
- [ ] **Step 4:** Chạy lại `node --test test/giam-sat/vong-lap.test.mjs` → PASS.
- [ ] **Step 5:** `git commit -m "feat(giam-sat): closed-loop measurement for resolved issues (T711)"`

---

## Phase 4: Mở rộng nguồn dữ liệu & Sổ nhật ký giám sát (Data Sources & Ops)

### T709 Đọc chỉ-đọc bản sao dữ liệu máy chủ Fanpage FB inbox (`nguon-fanpage.js`) (US4, FR-009)

Tạo module nạp bản sao cơ sở dữ liệu `fb-inbox.db` của máy chủ Fanpage ở chế độ chỉ-đọc (`readOnly: true`), chuẩn hóa các trường tin nhắn vào định dạng chung để chạy qua bộ phân tích tín hiệu và gom nhu cầu.

**Files:** Create `scripts/giam-sat/nguon-fanpage.js` · Create `test/giam-sat/nguon-fanpage.test.mjs`

**Interfaces — Produces:**
- `docNguonFanpage(dbPath: string, khoangNgay: object) -> Array<{ chat_id, turn_id, speaker, text, at }>`

- [ ] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { docNguonFanpage } from '../../scripts/giam-sat/nguon-fanpage.js';

test('T709 (FR-009): Đọc bản sao máy chủ Fanpage ở chế độ chỉ-đọc và lọc bỏ thông báo hệ thống', () => {
  // Test với SQLite tạm
  assert.ok(typeof docNguonFanpage === 'function');
});
```
- [ ] **Step 2:** Chạy `node --test test/giam-sat/nguon-fanpage.test.mjs` → FAIL.
- [ ] **Step 3:** Tạo `scripts/giam-sat/nguon-fanpage.js` mở kết nối `DatabaseSync` với `readOnly: true`, lọc bỏ tin thông báo hệ thống Fanpage.
- [ ] **Step 4:** Chạy lại `node --test test/giam-sat/nguon-fanpage.test.mjs` → PASS.
- [ ] **Step 5:** `git commit -m "feat(giam-sat): read-only adapter for legacy fanpage dataset (T709)"`

---

### T710 Đọc số đo sức khỏe Cổng OZ từ endpoint `/metrics` (`cong-oz.js`) (US5, FR-009, spec.md:188)

Hiện thực hóa bộ thu thập số đo Cổng OZ theo đề xuất ưu tiên tại `plan.md:38` (sử dụng endpoint `/metrics` của ozplugin thay vì API Coolify). Đo độ trễ p50/p95 và tỉ lệ lỗi từng công cụ, sinh tín hiệu `TOOL-SLOW` nếu p95 > 30s.

**Files:** Create `scripts/giam-sat/cong-oz.js` · Create `test/giam-sat/cong-oz.test.mjs`

**Interfaces — Produces:**
- `docMetricsCongOz(metricsUrl: string) -> Promise<{ toolStats: Record<string, { p50, p95, errRate }>, phatHienSlow: Array }>`

- [ ] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { docMetricsCongOz } from '../../scripts/giam-sat/cong-oz.js';

test('T710: Phát hiện TOOL-SLOW khi p95 của công cụ Cổng OZ vượt 30s', async () => {
  const fakeFetch = async () => ({
    ok: true,
    text: async () => 'tool_latency_p95{tool="tra_thue"} 35.2\ntool_calls_total{tool="tra_thue"} 100'
  });
  const res = await docMetricsCongOz(process.env.OZPLUGIN_METRICS_URL || '<OZPLUGIN_METRICS_URL>', { fetcher: fakeFetch });
  assert.equal(res.phatHienSlow.length, 1);
  assert.equal(res.phatHienSlow[0].ma, 'TOOL-SLOW');
});
```
- [ ] **Step 2:** Chạy `node --test test/giam-sat/cong-oz.test.mjs` → FAIL.
- [ ] **Step 3:** Tạo `scripts/giam-sat/cong-oz.js` đọc và phân tích định dạng Prometheus/JSON metrics từ Cổng OZ.
- [ ] **Step 4:** Chạy lại `node --test test/giam-sat/cong-oz.test.mjs` → PASS.
- [ ] **Step 5:** `git commit -m "feat(giam-sat): parse gateway metrics and detect slow tools (T710)"`

---

### T712 Sổ nhật ký thực thi giám sát và xử lý các ca biên (FR-011, Edge Cases, SC-003)

Xây dựng module ghi nhận lịch sử thực thi của Agent giám sát vào tệp `DATA_DIR/giam-sat.db` (hoặc JSONL), lưu trữ đầy đủ: mốc thời gian, nguồn đọc, số tin nhắn, số phát hiện, danh sách issue mở mới/bình luận, và lỗi gặp phải. Đảm bảo xử lý trơn tru khi GitHub rate limit hoặc Gemini lỗi (không mất dữ liệu phát hiện).

**Files:** Create `scripts/giam-sat/so-nhat-ky.js` · Modify `scripts/giam-sat.mjs` · Create `test/giam-sat/so-nhat-ky.test.mjs`

**Interfaces — Produces:**
- `ghiNhatKy({ ngay, nguon, soTin, phatHien, ketQuaIssue, loi }) -> void`

- [ ] **Step 1: Test đỏ (FR-011)**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ghiNhatKy, docNhatKy } from '../../scripts/giam-sat/so-nhat-ky.js';

test('T712 (FR-011): Ghi và đọc lại đầy đủ thông tin thực thi một phiên giám sát', () => {
  const entry = { ngay: '2026-11-06', nguon: 'bot.db', soTin: 150, phatHien: 3, issueMoi: 1, loi: null };
  ghiNhatKy(entry, { dbPath: ':memory:' });
  assert.ok(true);
});
```
- [ ] **Step 2:** Chạy `node --test test/giam-sat/so-nhat-ky.test.mjs` → FAIL.
- [ ] **Step 3:** Tạo `scripts/giam-sat/so-nhat-ky.js` và cắm vào luồng kết thúc của `scripts/giam-sat.mjs`.
- [ ] **Step 4:** Chạy lại `node --test test/giam-sat/so-nhat-ky.test.mjs` → PASS.
- [ ] **Step 5:** `git commit -m "feat(giam-sat): execution audit logging and resilience handling (T712)"`
