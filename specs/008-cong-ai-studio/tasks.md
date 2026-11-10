---
description: "Danh sách việc spec 008: khuôn spec-kit, mỗi việc viết theo writing-plans của Superpowers (TDD, tệp chính xác, giao diện, lệnh kiểm)"
---

# Tasks: Cổng AI Studio, addon Chrome và hàng đợi dùng chung (008)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` hoặc
> `superpowers:executing-plans` để làm từng việc. Mỗi việc theo `superpowers:test-driven-development`:
> test đỏ → chạy thấy đỏ → code tối thiểu → chạy thấy xanh → commit. Trước khi báo xong dùng
> `superpowers:verification-before-completion`. Bước dùng checkbox (`- [ ]`).

**Goal:** Xây dựng cổng AI Studio bao gồm hàng đợi công việc bền vững trên VPS (SQLite), addon Chrome MV3 điều khiển tab AI Studio với nhịp thao tác như người và cơ chế dự phòng API đa tầng (Gemini API, MiniMax 9Router), phục vụ soạn nháp CSKH (Spec 003) và xử lý việc lô với chi phí gần như 0 đồng mà vẫn bảo đảm an toàn dữ liệu và tuân thủ Hiến pháp.

**Architecture:** 
- **Tầng hàng đợi (VPS):** Hàng đợi SQLite độc lập (`gateway/queue-db.js`, `gateway/server.js`) hỗ trợ ưu tiên việc (`khach` > `nhan-vien` > `lo`), thuê việc nguyên tử có hạn 120s (`lease`), gia hạn nhịp tim (`heartbeat`), đệm kết quả trùng lặp 10 phút.
- **Tầng Addon điều khiển (Chrome MV3):** Addon trên máy chuyên dụng điều khiển nhóm tab AI Studio (`addon/driver.js`, `addon/tab-pool.js`) theo bộ chọn có phiên bản (`addon/selectors.json`), thao tác tự nhiên có độ trễ ngẫu nhiên 300–1.500 ms, lấy kết quả qua clipboard, phát hiện rate limit và session expired.
- **Tầng Não CSKH & Ẩn danh (Bot Gateway):** Lớp giao tiếp `gateway/cskh-brain.js` tích hợp vào bot, ẩn danh dữ liệu khách hai chiều (`gateway/anonymizer.js`), cơ chế hủy kết quả muộn (Late Response Drop) bảo đảm SC-002, và kiểm soát an toàn qua `gate.send` kèm `moneyCheck`.
- **Tầng Giám sát & Đo lường:** Endpoint `GET /metrics` (`gateway/metrics.js`) theo dõi p95 thời gian chờ, thời gian xử lý tab W, tỉ lệ chuyển dự phòng; cảnh báo khi tỉ lệ dự phòng > 30%/giờ; bộ đo kiểm tự động SC-001..SC-004 trên môi trường mock tĩnh.

**Tech Stack:** Node.js ≥ 22.13 ESM, `node:sqlite`, `node:test`, `node:crypto`, `fetch`, Chrome Extension Manifest V3. Không thêm runtime dependency vào `package.json`.

**Spec:** `specs/008-cong-ai-studio/spec.md`.

---

## Global Constraints

- Không thêm runtime dependency ngoài thư viện chuẩn Node.js vào `package.json`.
- Mỗi tệp mã nguồn mới dưới 300 dòng (Hiến pháp VI).
- Mọi tin nhắn gửi ra khách hàng bắt buộc phải qua đúng một hàm `gate.send()` của Spec 001 (Hiến pháp I). Nháp AI Studio chỉ là gợi ý, bot quyết định gửi.
- Khi phòng ở trạng thái `human`, bot phải im hoàn toàn: không trả lời, không gọi não AI, không soạn nháp (Hiến pháp II).
- Số tiền trong nháp phải có căn cứ trong dữ kiện hoặc công cụ tra cứu (`moneyCheck: true`, Hiến pháp III).
- Tuyệt đối không dùng nhiều tài khoản Google để lách hạn mức của cùng một luồng việc (FR-009). Mỗi profile gắn một tài khoản duy nhất.
- Addon tuyệt đối không tự động đăng nhập khi phiên Google hết hạn (FR-009); chỉ dừng nhận việc và gửi cảnh báo nhân viên.
- Thao tác trên giao diện AI Studio phải có độ trễ ngẫu nhiên 300–1.500 ms mô phỏng người dùng thật (FR-010).
- Dữ liệu khách hàng phải được ẩn danh trước khi đưa vào hàng đợi AI Studio (FR-007, Hiến pháp IX).
- Số điện thoại giả trong test chỉ dùng duy nhất số mẫu `0912345678`.
- Khóa bí mật giả trong test chỉ dùng chuỗi ngắn `sk-gia-loi-goc`.
- `npm test` chạy 100% nội bộ không cần kết nối mạng thật (dùng mock/fake cho Google AI Studio và external API).

---

## Bảng đối chiếu yêu cầu (Traceability Matrix)

Bảng đối chiếu toàn bộ 10 Yêu cầu Chức năng (FR-001..FR-010), 4 User Stories (US1..US4) và 4 Tiêu chí Thành công (SC-001..SC-004) của `specs/008-cong-ai-studio/spec.md` với các nhiệm vụ thực thi T801..T812:

| Mã yêu cầu | Phân loại | Tóm tắt nội dung đặc tả | Nhiệm vụ thực thi | Tệp phụ trách chính |
|---|---|---|---|---|
| **US1** | User Story | Hàng đợi có ưu tiên và hạn chờ: việc khách đi trước việc lô, fallback khi hết hạn 45s, cache 10 phút | **T801, T802, T803** | `gateway/queue-db.js`, `gateway/queue-manager.js`, `gateway/server.js` |
| **US2** | User Story | Addon điều khiển nhiều tab AI Studio: thao tác như người, bắt timeout 120s, rate limit nghỉ 15p, kiểm tra schema JSON | **T804, T805, T806, T807** | `addon/manifest.json`, `addon/tab-pool.js`, `addon/driver.js`, `addon/detector.js` |
| **US3** | User Story | Não CSKH cắm vào bot: ẩn danh SĐT/tên khách, hoàn nguyên khi nhận nháp, áp `moneyCheck`, chặn kết quả muộn | **T808, T809, T810** | `gateway/anonymizer.js`, `gateway/cskh-brain.js`, `gateway/cskh-integration.js` |
| **US4** | User Story | Giám sát vận hành cổng: endpoint `/metrics` đo tab, p95 chờ, W, rate limit, fallback; cảnh báo khi fallback > 30% | **T811, T812** | `gateway/metrics.js`, `test/gateway/sc-do.test.mjs` |
| **FR-001** | Chức năng | Hàng đợi SQLite trên VPS: API tạo việc, xem việc, thuê việc (long-poll), trả kết quả, nhịp tim | **T801, T803, T811** | `gateway/queue-db.js`, `gateway/server.js`, `gateway/metrics.js` |
| **FR-002** | Chức năng | Phân loại việc `kind` (`khach`, `nhan-vien`, `lo`), ưu tiên, hạn chờ, schema JSON, fallback chain | **T802** | `gateway/queue-manager.js` |
| **FR-003** | Chức năng | Thuê việc nguyên tử (atomic lease), hạn 120s, gia hạn bằng nhịp tim, tự thu hồi khi hết hạn | **T801, T803** | `gateway/queue-db.js`, `gateway/server.js` |
| **FR-004** | Chức năng | Addon Chrome MV3, chỉ chạy trên `aistudio.google.com`, xác thực token riêng, không đọc trang khác | **T803, T804, T806** | `addon/manifest.json`, `gateway/server.js`, `addon/driver.js` |
| **FR-005** | Chức năng | Addon quản lý nhóm tab (3..MAX_TABS), mỗi việc mở một new chat riêng biệt chống lẫn ngữ cảnh | **T805** | `addon/tab-pool.js` |
| **FR-006** | Chức năng | Bộ chọn phần tử DOM nằm trong tệp cấu hình có phiên bản (`selectors.json`), sửa không cần sửa code | **T804, T807** | `addon/selectors.json`, `addon/detector.js` |
| **FR-007** | Chức năng | Dữ liệu khách phải được ẩn danh trước khi vào hàng đợi và hoàn nguyên khi nhận kết quả nháp | **T808** | `gateway/anonymizer.js` |
| **FR-008** | Chức năng | Quá hạn 45s, sai khuôn 2 lần hoặc rate limit chuyển dự phòng (Gemini API -> MiniMax 9Router); bỏ kết quả muộn | **T807, T809** | `addon/detector.js`, `gateway/cskh-brain.js` |
| **FR-009** | Chức năng | MUST NOT dùng nhiều tài khoản Google để lách hạn mức, MUST NOT tự động đăng nhập | **T805, T807** | `addon/tab-pool.js`, `addon/detector.js` |
| **FR-010** | Chức năng | Nhịp thao tác có độ trễ giống người (300–1.500 ms ngẫu nhiên), mỗi tab tối đa 1 việc cùng lúc | **T806** | `addon/driver.js` |
| **SC-001** | Thành công | Nháp cho khách: p95 thời gian từ lúc gửi tới lúc có nháp (kể cả dự phòng) < 50 giây | **T809, T812** | `gateway/cskh-brain.js`, `test/gateway/sc-do.test.mjs` |
| **SC-002** | Thành công | 0 lần khách nhận hai câu cho cùng một tin (kết quả muộn bị drop hoàn toàn) | **T809, T812** | `gateway/cskh-brain.js`, `test/gateway/sc-do.test.mjs` |
| **SC-003** | Thành công | Tỉ lệ việc chạy qua addon thành công (không dự phòng) ≥ 80% trong tuần đầu chạy thật | **T811, T812** | `gateway/metrics.js`, `test/gateway/sc-do.test.mjs` |
| **SC-004** | Thành công | Google đổi giao diện thì sửa xong trong ≤ 30 phút, chỉ bằng tệp cấu hình bộ chọn `selectors.json` | **T804, T812** | `addon/selectors.json`, `test/gateway/sc-do.test.mjs` |

---

## Phase 1: Hàng đợi SQLite VPS (Queue Infrastructure)

### T801 [P] Cơ sở dữ liệu hàng đợi SQLite bền vững và cơ chế thuê nguyên tử (`gateway/queue-db.js`) (FR-001, FR-003, US1)

Hiện thực hóa tầng lưu trữ cơ sở dữ liệu hàng đợi SQLite trên VPS sử dụng `node:sqlite` (`DatabaseSync`). Thiết lập bảng `gateway_jobs` lưu trữ trạng thái việc và bảng `gateway_cache` lưu trữ đệm kết quả. Cung cấp hàm thuê việc nguyên tử (`leaseJob`) bằng SQL transaction với `RETURNING`, cơ chế gia hạn nhịp tim (`heartbeatJob`), và thu hồi các lượt thuê quá hạn 120s (`reclaimExpiredLeases`).

**Files:** Create `gateway/queue-db.js` · Create `test/gateway/queue-db.test.mjs`

**Interfaces — Produces:**
```js
export function createQueueDb(dbPathOrInstance) -> {
  init() -> void,
  createJob({ id, kind, priority, prompt, systemInstruction, schemaJson, timeoutMs }) -> object,
  getJob(id) -> object | null,
  leaseJob(tabId) -> object | null,
  heartbeatJob(id, tabId, extendSeconds?: number) -> boolean,
  completeJob(id, tabId, resultText) -> boolean,
  failJob(id, tabId, errorReason) -> boolean,
  reclaimExpiredLeases() -> number,
  close() -> void
}
```

- [x] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createQueueDb } from '../../gateway/queue-db.js';

test('T801: createQueueDb khởi tạo bảng và thực hiện thuê việc nguyên tử (atomic lease)', () => {
  const db = new DatabaseSync(':memory:');
  const q = createQueueDb(db);
  q.init();

  q.createJob({ id: 'job-1', kind: 'khach', priority: 0, prompt: 'Chào bot', timeoutMs: 45000 });
  q.createJob({ id: 'job-2', kind: 'lo', priority: 9, prompt: 'Việc lô', timeoutMs: 3600000 });

  const leased = q.leaseJob('tab-alpha');
  assert.equal(leased?.id, 'job-1', 'Việc khách (priority 0) phải được thuê trước việc lô');
  assert.equal(leased?.status, 'leased');
  assert.equal(leased?.assigned_tab, 'tab-alpha');

  const secondLease = q.leaseJob('tab-beta');
  assert.equal(secondLease?.id, 'job-2', 'Tab tiếp theo nhận việc lô còn lại');
});

test('T801: reclaimExpiredLeases thu hồi việc bị treo quá 120s về trạng thái queued', () => {
  const db = new DatabaseSync(':memory:');
  const q = createQueueDb(db);
  q.init();

  q.createJob({ id: 'job-timeout', kind: 'khach', priority: 0, prompt: 'Gấp', timeoutMs: 45000 });
  const leased = q.leaseJob('tab-dead');
  assert.ok(leased);

  // Giả lập mốc lease_expires_at trong quá khứ
  db.exec("UPDATE gateway_jobs SET lease_expires_at = datetime('now', '-5 seconds') WHERE id = 'job-timeout'");

  const reclaimedCount = q.reclaimExpiredLeases();
  assert.equal(reclaimedCount, 1, 'Phải thu hồi đúng 1 việc quá hạn thuê');

  const job = q.getJob('job-timeout');
  assert.equal(job.status, 'queued', 'Việc thu hồi phải quay về trạng thái queued');
  assert.equal(job.assigned_tab, null);
});
```
- [x] **Step 2:** Chạy `node --test test/gateway/queue-db.test.mjs` → FAIL (chưa có tệp `gateway/queue-db.js`).
- [x] **Step 3:** Tạo `gateway/queue-db.js` với các bảng `gateway_jobs`, `gateway_cache`, câu lệnh `BEGIN IMMEDIATE TRANSACTION` khi lease, truy vấn `ORDER BY priority ASC, created_at ASC`, hỗ trợ `heartbeatJob` và `reclaimExpiredLeases`.
- [x] **Step 4:** Chạy lại `node --test test/gateway/queue-db.test.mjs` → PASS.
- [x] **Step 5:** `git commit -m "feat(gateway): implement persistent sqlite queue database with atomic lease (T801)"`

---

### T802 [P] Xếp hàng ưu tiên, hạn chờ và đệm kết quả trùng lặp (`gateway/queue-manager.js`) (FR-002, US1)

Hiện thực hóa bộ quản lý logic hàng đợi `gateway/queue-manager.js`: phân bổ mức ưu tiên chuẩn (`khach`: 0, `nhan-vien`: 1, `lo`: 9), thiết lập hạn chờ tương ứng (`khach`: 45s, `nhan-vien`: 60s, `lo`: 3600s), kiểm tra bộ đệm kết quả trùng lặp (Cache Deduplication) theo băm SHA-256 của nội dung trong 10 phút. Nếu gặp yêu cầu giống hệt đã có trong cache, trả ngay kết quả mà không cần đẩy vào tab AI Studio.

**Files:** Create `gateway/queue-manager.js` · Create `test/gateway/queue-manager.test.mjs`

**Interfaces — Produces:**
```js
export function createQueueManager({ queueDb, cacheTtlMs = 600000 }) -> {
  enqueue({ kind, prompt, systemInstruction, schemaJson, forceRefresh }) -> { jobId, cached: boolean, result?: string },
  getJobStatus(jobId) -> { status, result, error, isExpired: boolean },
  computePromptHash(systemInstruction, prompt, schemaJson) -> string
}
```

- [ ] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createQueueDb } from '../../gateway/queue-db.js';
import { createQueueManager } from '../../gateway/queue-manager.js';

test('T802: Đẩy 300 việc lô, sau đó đẩy 1 việc khách -> việc khách luôn có độ ưu tiên 0', () => {
  const db = new DatabaseSync(':memory:');
  const qDb = createQueueDb(db);
  qDb.init();
  const manager = createQueueManager({ queueDb: qDb });

  for (let i = 0; i < 300; i++) {
    manager.enqueue({ kind: 'lo', prompt: `Lô hàng ${i}` });
  }
  const khachJob = manager.enqueue({ kind: 'khach', prompt: 'Hỏi giá cước' });

  const leased = qDb.leaseJob('tab-1');
  assert.equal(leased?.id, khachJob.jobId, 'Việc khách phải được tab thuê trước 300 việc lô');
});

test('T802: Hai yêu cầu giống hệt nhau trong 10 phút -> trả lại kết quả đệm, không xếp hàng lại', () => {
  const db = new DatabaseSync(':memory:');
  const qDb = createQueueDb(db);
  qDb.init();
  const manager = createQueueManager({ queueDb: qDb });

  const req1 = manager.enqueue({ kind: 'khach', prompt: 'Mã HS khẩu trang y tế' });
  qDb.completeJob(req1.jobId, 'tab-1', 'Mã HS: 6307.90.90');

  const req2 = manager.enqueue({ kind: 'khach', prompt: 'Mã HS khẩu trang y tế' });
  assert.equal(req2.cached, true, 'Yêu cầu thứ hai phải nhận kết quả từ cache');
  assert.equal(req2.result, 'Mã HS: 6307.90.90');
});
```
- [ ] **Step 2:** Chạy `node --test test/gateway/queue-manager.test.mjs` → FAIL.
- [ ] **Step 3:** Viết mã `gateway/queue-manager.js` tính băm SHA-256 nội dung qua `node:crypto`, tra cứu cache 10 phút trước khi gọi `queueDb.createJob`, gán priority/timeout theo kind.
- [ ] **Step 4:** Chạy lại `node --test test/gateway/queue-manager.test.mjs` → PASS.
- [ ] **Step 5:** `git commit -m "feat(gateway): implement priority scheduling, timeouts, and 10min deduplication cache (T802)"`

---

### T803 [P] REST API hàng đợi trên VPS xác thực Bearer token (`gateway/server.js`) (FR-001, FR-003, FR-004, US1)

Hiện thực hóa máy chủ HTTP REST API Node.js thuần (`node:http`) trên VPS lắng nghe các lệnh từ Addon Chrome và Bot Zalo. Hỗ trợ xác thực bảo mật bằng Bearer token (`Authorization: Bearer <GATEWAY_TOKEN>`) sử dụng so sánh an toàn `timingSafeEqual`. Cung cấp các endpoint: `POST /api/jobs` (tạo việc), `GET /api/jobs/:id` (xem trạng thái), `POST /api/jobs/lease` (long-polling chờ việc tối đa 30s), `POST /api/jobs/:id/complete` (trả kết quả), `POST /api/jobs/:id/heartbeat` (nhịp tim), `POST /api/jobs/:id/fail` (báo lỗi).

**Files:** Create `gateway/server.js` · Create `test/gateway/server.test.mjs`

**Interfaces — Produces:**
```js
export function createGatewayServer({ queueManager, queueDb, token, port }) -> {
  listen() -> Promise<{ port: number, close: () => Promise<void> }>,
  handleRequest(req, res) -> Promise<void>
}
```

- [ ] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createQueueDb } from '../../gateway/queue-db.js';
import { createQueueManager } from '../../gateway/queue-manager.js';
import { createGatewayServer } from '../../gateway/server.js';

test('T803: REST API từ chối request không có hoặc sai Bearer token với HTTP 401/403', async () => {
  const db = new DatabaseSync(':memory:');
  const qDb = createQueueDb(db);
  qDb.init();
  const manager = createQueueManager({ queueDb: qDb });
  const server = createGatewayServer({ queueManager: manager, queueDb: qDb, token: 'sk-gia-loi-goc' });
  const { port, close } = await server.listen();

  try {
    const resNoAuth = await fetch(`http://127.0.0.1:${port}/api/jobs/lease`, { method: 'POST' });
    assert.equal(resNoAuth.status, 401);

    const resWrongAuth = await fetch(`http://127.0.0.1:${port}/api/jobs/lease`, {
      method: 'POST',
      headers: { Authorization: 'Bearer sai-token' }
    });
    assert.equal(resWrongAuth.status, 403);
  } finally {
    await close();
  }
});

test('T803: REST API cho phép tạo việc và thuê việc thành công với token hợp lệ', async () => {
  const db = new DatabaseSync(':memory:');
  const qDb = createQueueDb(db);
  qDb.init();
  const manager = createQueueManager({ queueDb: qDb });
  const server = createGatewayServer({ queueManager: manager, queueDb: qDb, token: 'sk-gia-loi-goc' });
  const { port, close } = await server.listen();

  try {
    const authHeaders = { Authorization: 'Bearer sk-gia-loi-goc', 'Content-Type': 'application/json' };
    const createRes = await fetch(`http://127.0.0.1:${port}/api/jobs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ kind: 'khach', prompt: 'Tính thuế NK thép' })
    });
    assert.equal(createRes.status, 201);
    const { jobId } = await createRes.json();
    assert.ok(jobId);

    const leaseRes = await fetch(`http://127.0.0.1:${port}/api/jobs/lease`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ tabId: 'tab-101' })
    });
    assert.equal(leaseRes.status, 200);
    const jobData = await leaseRes.json();
    assert.equal(jobData.id, jobId);
  } finally {
    await close();
  }
});
```
- [ ] **Step 2:** Chạy `node --test test/gateway/server.test.mjs` → FAIL.
- [ ] **Step 3:** Hiện thực hóa `gateway/server.js` xử lý routing URL HTTP, gom body Buffer, xác thực HMAC/`timingSafeEqual`, long-poll đợi có việc trong hàng đợi.
- [ ] **Step 4:** Chạy lại `node --test test/gateway/server.test.mjs` → PASS.
- [ ] **Step 5:** `git commit -m "feat(gateway): implement REST API with bearer auth and long-poll leasing (T803)"`

---

## Phase 2: Addon MV3 điều khiển tab AI Studio (Chrome Extension)

### T804 [P] Cấu hình Extension Manifest V3 và bộ chọn DOM có phiên bản (`addon/manifest.json`, `addon/selectors.json`) (FR-004, FR-006, SC-004, US2)

Thiết lập cấu trúc Addon Chrome Manifest V3 tuân thủ quyền hạn tối thiểu: chỉ cấp `host_permissions` cho `https://aistudio.google.com/*` và URL gateway của VPS. Tách toàn bộ các bộ chọn DOM (CSS selectors) ra tệp cấu hình có phiên bản `addon/selectors.json` (ô nhập prompt, system instructions, nút Run, vùng kết quả, nút Copy, banner rate limit, form login). Đảm bảo khi Google thay đổi UI, nhân viên chỉ cần sửa `selectors.json` trong ≤ 30 phút mà không cần can thiệp logic điều khiển.

**Files:** Create `addon/manifest.json` · Create `addon/selectors.json` · Create `test/gateway/selectors-schema.test.mjs`

**Interfaces — Produces:**
`addon/selectors.json`:
```json
{
  "version": "1.0.0",
  "updated_at": "2026-11-10",
  "selectors": {
    "inputPrompt": "textarea[aria-label*=\"Prompt\"], div[contenteditable=\"true\"]",
    "systemInstruction": "textarea[aria-label*=\"System instructions\"]",
    "runButton": "button[aria-label*=\"Run\"], button.run-button",
    "responseContainer": "div.model-response-text, ms-response-root",
    "loadingSpinner": "mat-progress-spinner, [aria-label*=\"Loading\"]",
    "copyButton": "button[aria-label*=\"Copy response\"], button[aria-label*=\"Sao chép\"]",
    "rateLimitBanner": "div:has-text(\"Quota exceeded\"), div:has-text(\"Resource exhausted\")",
    "loginIndicator": "form[action*=\"accounts.google.com\"], a[href*=\"accounts.google.com\"]"
  }
}
```

- [ ] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

test('T804: manifest.json tuân thủ Manifest V3 và quyền hạn tối thiểu', () => {
  assert.ok(existsSync('addon/manifest.json'), 'manifest.json phải tồn tại');
  const manifest = JSON.parse(readFileSync('addon/manifest.json', 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.host_permissions.some(p => p.includes('aistudio.google.com')));
  assert.equal(manifest.host_permissions.some(p => p.includes('*://*/*')), false, 'Không được xin quyền toàn mạng');
});

test('T804: selectors.json có đầy đủ các trường thiết yếu và phiên bản', () => {
  assert.ok(existsSync('addon/selectors.json'), 'selectors.json phải tồn tại');
  const config = JSON.parse(readFileSync('addon/selectors.json', 'utf8'));
  assert.ok(config.version, 'Phải có trường version');
  const s = config.selectors;
  assert.ok(s.inputPrompt && s.runButton && s.responseContainer && s.copyButton && s.rateLimitBanner && s.loginIndicator);
});
```
- [ ] **Step 2:** Chạy `node --test test/gateway/selectors-schema.test.mjs` → FAIL.
- [ ] **Step 3:** Tạo `addon/manifest.json` và `addon/selectors.json` với đầy đủ các bộ chọn DOM và metadata phiên bản.
- [ ] **Step 4:** Chạy lại `node --test test/gateway/selectors-schema.test.mjs` → PASS.
- [ ] **Step 5:** `git commit -m "feat(addon): create manifest v3 and versioned DOM selectors configuration (T804)"`

---

### T805 [P] Điều phối vòng đời tab và phiên làm việc độc lập (`addon/tab-pool.js`) (FR-005, FR-009, US2)

Hiện thực hóa bộ quản lý pool tab trong background service worker (`addon/tab-pool.js`): duy trì mặc định 3 tab Chrome mở URL `https://aistudio.google.com/prompts/new_chat`. Mở rộng tự động tối đa tới `MAX_TABS = 8` khi có việc chờ lâu hơn 15s; tự động thu hồi đóng bớt tab khi tab rảnh rỗi liên tục 10 phút. Bảo đảm tính cô lập phiên (Session Isolation): mỗi việc khi hoàn tất phải khởi tạo một cuộc trò chuyện mới (new chat), tuyệt đối không gửi việc tiếp theo vào cùng một luồng trò chuyện cũ để tránh nhiễm bẩn ngữ cảnh (context bleed). Tuân thủ nguyên tắc 1 tài khoản duy nhất (FR-009).

**Files:** Create `addon/tab-pool.js` · Create `test/gateway/tab-pool.test.mjs`

**Interfaces — Produces:**
```js
export function createTabPool({ chromeTabsApi, minTabs = 3, maxTabs = 8, idleCloseMs = 600000 }) -> {
  initPool() -> Promise<void>,
  acquireTab(jobId) -> Promise<{ tabId: number, sessionKey: string }>,
  releaseTab(tabId, { resetSession = true }) -> Promise<void>,
  scaleUpIfNeeded(queuePendingCount: number) -> Promise<number>,
  closeIdleTabs() -> Promise<number>,
  getActiveTabCount() -> number
}
```

- [x] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTabPool } from '../../addon/tab-pool.js';

test('T805: Tab pool khởi tạo 3 tab mặc định và phân bổ tab độc lập cho từng việc', async () => {
  const fakeTabs = [];
  let tabIdCounter = 1;
  const fakeChromeTabsApi = {
    create: async ({ url }) => { const t = { id: tabIdCounter++, url }; fakeTabs.push(t); return t; },
    remove: async (id) => { const idx = fakeTabs.findIndex(t => t.id === id); if (idx >= 0) fakeTabs.splice(idx, 1); },
    update: async (id, props) => ({ id, ...props })
  };

  const pool = createTabPool({ chromeTabsApi: fakeChromeTabsApi, minTabs: 3, maxTabs: 8 });
  await pool.initPool();
  assert.equal(pool.getActiveTabCount(), 3);

  const tab1 = await pool.acquireTab('job-a');
  const tab2 = await pool.acquireTab('job-b');
  assert.notEqual(tab1.tabId, tab2.tabId, 'Hai việc phải nhận hai tab khác nhau');

  await pool.releaseTab(tab1.tabId, { resetSession: true });
  assert.equal(pool.getActiveTabCount(), 3);
});
```
- [x] **Step 2:** Chạy `node --test test/gateway/tab-pool.test.mjs` → FAIL.
- [x] **Step 3:** Tạo `addon/tab-pool.js` quản lý danh sách tab theo ID, trạng thái `idle`/`busy`, điều hướng tab về `new_chat` khi release, scale tự động theo ngưỡng.
- [x] **Step 4:** Chạy lại `node --test test/gateway/tab-pool.test.mjs` → PASS.
- [x] **Step 5:** `git commit -m "feat(addon): implement tab pool lifecycle and session isolation (T805)"`

---

### T806 [P] Tự động hóa thao tác người dùng với nhịp trễ ngẫu nhiên và sao chép Clipboard (`addon/driver.js`) (FR-004, FR-010, US2)

Hiện thực hóa module driver điều khiển DOM (`addon/driver.js`): mô phỏng nhịp thao tác của con người với độ trễ ngẫu nhiên 300–1.500 ms giữa các hành động gõ phím/dán dữ liệu và bấm nút Run. Focus và điền nội dung vào ô nhập prompt và system instructions theo cách kích hoạt đầy đủ các sự kiện bàn phím của UI. Lấy nội dung kết quả hoàn chỉnh bằng cách kích hoạt nút Copy của AI Studio và đọc clipboard để bảo toàn định dạng Markdown, thụt lề và bảng dữ liệu. Thiết lập timeout 120s: nếu sau 120s không có kết quả hoàn tất, tự động tải lại tab và báo hủy việc.

**Files:** Create `addon/driver.js` · Create `test/gateway/driver-simulation.test.mjs`

**Interfaces — Produces:**
```js
export function createAiStudioDriver({ domDocument, clipboardApi, selectors, minDelayMs = 300, maxDelayMs = 1500 }) -> {
  executeJob({ systemInstruction, prompt, timeoutMs = 120000 }) -> Promise<{ ok: boolean, resultText?: string, error?: string }>,
  simulateHumanInput(element, text) -> Promise<void>,
  clickRunButton() -> Promise<void>,
  extractResultViaCopy() -> Promise<string>
}
```

- [ ] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiStudioDriver } from '../../addon/driver.js';

test('T806: Driver điền nội dung, bấm Run và trích xuất kết quả với nhịp trễ người dùng', async () => {
  let clickCount = 0;
  let copiedText = 'Bản nháp gợi ý từ AI Studio: Mã HS 8415.10.10';
  const fakeDoc = {
    querySelector: (sel) => {
      if (sel.includes('Prompt')) return { focus() {}, value: '', dispatchEvent() {} };
      if (sel.includes('Run')) return { disabled: false, click() { clickCount++; } };
      if (sel.includes('Copy')) return { click() {} };
      if (sel.includes('Loading')) return null;
      return null;
    }
  };
  const fakeClipboard = {
    readText: async () => copiedText
  };

  const selectors = {
    inputPrompt: 'textarea.prompt',
    runButton: 'button.run',
    copyButton: 'button.copy',
    loadingSpinner: '.loading'
  };

  const driver = createAiStudioDriver({
    domDocument: fakeDoc,
    clipboardApi: fakeClipboard,
    selectors,
    minDelayMs: 10,
    maxDelayMs: 20
  });

  const res = await driver.executeJob({ prompt: 'Tra mã điều hòa' });
  assert.equal(res.ok, true);
  assert.equal(res.resultText, copiedText);
  assert.equal(clickCount, 1, 'Nút Run phải được bấm đúng 1 lần');
});
```
- [ ] **Step 2:** Chạy `node --test test/gateway/driver-simulation.test.mjs` → FAIL.
- [ ] **Step 3:** Viết mã `addon/driver.js` với các hàm `sleepRandom(min, max)`, mô phỏng focus/input event, poll trạng thái spinner biến mất, kích hoạt click nút copy và đọc clipboard.
- [ ] **Step 4:** Chạy lại `node --test test/gateway/driver-simulation.test.mjs` → PASS.
- [ ] **Step 5:** `git commit -m "feat(addon): implement human-like driver simulation and clipboard copy extraction (T806)"`

---

### T807 [P] Bắt ngoại lệ giao diện, Rate Limit và kiểm định Schema (`addon/detector.js`, `gateway/schema-validator.js`) (FR-006, FR-008, FR-009, US2)

Hiện thực hóa bộ giám sát trạng thái giao diện AI Studio và xác thực khuôn đầu ra:
1. Phát hiện Rate Limit: Nhận diện các thông báo "Quota exceeded" hoặc "Resource exhausted" trên giao diện -> đánh dấu tab nghỉ 15 phút, gửi API báo `rate_limited` để hàng đợi chuyển việc sang dự phòng.
2. Phát hiện Đăng xuất (Session Expired): Nhận diện chuyển hướng tới form đăng nhập Google (`accounts.google.com`) -> dừng nhận việc toàn bộ addon, kích hoạt cờ cảnh báo nhân viên; tuyệt đối KHÔNG tự ý nhập mật khẩu (FR-009).
3. Kiểm tra Schema JSON: Module `validateSchema(jsonText, schema)` kiểm tra cấu trúc JSON nếu việc yêu cầu schema. Nếu kết quả trả về sai định dạng, cho phép tab thử lại 1 lần trên cuộc trò chuyện mới; nếu vẫn sai lần 2 -> chuyển sang chuỗi dự phòng.

**Files:** Create `addon/detector.js` · Create `gateway/schema-validator.js` · Create `test/gateway/detector-schema.test.mjs`

**Interfaces — Produces:**
```js
export function detectUiState(domDocument, selectors) -> {
  isRateLimited: boolean,
  isLoggedOut: boolean,
  isErrorBanner: boolean,
  errorMessage?: string
}

export function validateResultSchema(resultText, schemaObject) -> {
  valid: boolean,
  parsedJson?: object,
  error?: string
}
```

- [ ] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectUiState } from '../../addon/detector.js';
import { validateResultSchema } from '../../gateway/schema-validator.js';

test('T807: detectUiState phát hiện chính xác banner rate limit và trang đăng xuất Google', () => {
  const docRateLimit = {
    querySelector: (sel) => sel.includes('Quota') ? { textContent: 'Quota exceeded for today' } : null
  };
  const state1 = detectUiState(docRateLimit, { rateLimitBanner: 'div:has-text("Quota")' });
  assert.equal(state1.isRateLimited, true);

  const docLogout = {
    querySelector: (sel) => sel.includes('accounts.google') ? { href: 'https://accounts.google.com/signin' } : null
  };
  const state2 = detectUiState(docLogout, { loginIndicator: 'a[href*="accounts.google"]' });
  assert.equal(state2.isLoggedOut, true);
});

test('T807: validateResultSchema kiểm tra cấu trúc JSON theo schema yêu cầu', () => {
  const schema = { required: ['ma_hs', 'thue_suat'] };
  const validJson = JSON.stringify({ ma_hs: '0101.21.00', thue_suat: 5 });
  const invalidJson = JSON.stringify({ ma_hs: '0101.21.00' }); // thiếu thue_suat

  assert.equal(validateResultSchema(validJson, schema).valid, true);
  assert.equal(validateResultSchema(invalidJson, schema).valid, false);
  assert.equal(validateResultSchema('Không phải JSON', schema).valid, false);
});
```
- [ ] **Step 2:** Chạy `node --test test/gateway/detector-schema.test.mjs` → FAIL.
- [ ] **Step 3:** Tạo `addon/detector.js` phân tích DOM theo selector, và `gateway/schema-validator.js` parse JSON an toàn, kiểm tra các trường bắt buộc (`required`).
- [ ] **Step 4:** Chạy lại `node --test test/gateway/detector-schema.test.mjs` → PASS.
- [ ] **Step 5:** `git commit -m "feat(gateway): implement ui state detector and json schema validation (T807)"`

---

## Phase 3: Não CSKH & ẩn danh (Customer Brain & Anonymization)

### T808 [P] Ẩn danh hai chiều và bảo vệ dữ liệu khách hàng (`gateway/anonymizer.js`) (FR-007, US3, Hiến pháp IX)

Hiện thực hóa bộ xử lý ẩn danh dữ liệu khách hàng trước khi đưa vào hàng đợi AI Studio và hoàn nguyên dữ liệu sau khi nhận kết quả nháp. Sử dụng chung ngữ pháp phát hiện số điện thoại chuẩn của repo để che số điện thoại khách hàng, thay thế tên khách bằng "Khách" (hoặc "Khách A", "Khách B" trong nhóm), che token bí mật (`sk-gia-loi-goc`), che số tài khoản ngân hàng. Lưu bảng ánh xạ danh tính tạm thời trong phiên để khôi phục tên gọi tự nhiên của khách trước khi đưa câu trả lời vào cửa gửi.

**Files:** Create `gateway/anonymizer.js` · Create `test/gateway/anonymizer.test.mjs`

**Interfaces — Produces:**
```js
export function anonymizePrompt({ text, customerName, convId }) -> {
  anonymizedText: string,
  anonymizeMap: Map<string, string>
}

export function deanonymizeDraft(draftText, anonymizeMap) -> string
```

- [ ] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { anonymizePrompt, deanonymizeDraft } from '../../gateway/anonymizer.js';

test('T808: Ẩn danh số điện thoại và thay tên khách thành "Khách" trước khi gửi', () => {
  const raw = 'Anh Thắng ơi, khách Nguyễn Văn A số 0912345678 hỏi thủ tục nhập xe nâng';
  const { anonymizedText, anonymizeMap } = anonymizePrompt({
    text: raw,
    customerName: 'Nguyễn Văn A',
    convId: 'conv-101'
  });

  assert.equal(anonymizedText.includes('Nguyễn Văn A'), false, 'Tên khách thật không được xuất hiện');
  assert.equal(anonymizedText.includes('0912345678'), false, 'Số điện thoại thật không được xuất hiện');
  assert.ok(anonymizedText.includes('Khách'));
  assert.ok(anonymizedText.includes('[SĐT]'));

  const draftFromAi = 'Dạ em chào [TEN_KHACH], thủ tục nhập xe nâng bao gồm đăng kiểm...';
  const finalDraft = deanonymizeDraft(draftFromAi, anonymizeMap);
  assert.equal(finalDraft, 'Dạ em chào Nguyễn Văn A, thủ tục nhập xe nâng bao gồm đăng kiểm...');
});
```
- [ ] **Step 2:** Chạy `node --test test/gateway/anonymizer.test.mjs` → FAIL.
- [ ] **Step 3:** Tạo `gateway/anonymizer.js` sử dụng regex chuẩn phát hiện SĐT Việt Nam, thay thế token/STK, quản lý placeholder `[TEN_KHACH]`, và hàm thay thế ngược.
- [ ] **Step 4:** Chạy lại `node --test test/gateway/anonymizer.test.mjs` → PASS.
- [ ] **Step 5:** `git commit -m "feat(gateway): implement bidirectional customer data anonymization (T808)"`

---

### T809 [P] Bộ điều phối não CSKH, chuỗi dự phòng đa tầng và cơ chế chặn tin muộn (`gateway/cskh-brain.js`) (FR-008, SC-001, SC-002, US3)

Hiện thực hóa bộ điều phối não CSKH `gateway/cskh-brain.js`: cung cấp hàm `draft(conv, request)` cho bot Zalo. Gửi yêu cầu vào hàng đợi với hạn chờ 45s (`kind: 'khach'`). Nếu quá 45s hoặc addon báo lỗi/rate limit, lập tức chuyển chuỗi dự phòng: Gemini API qua API Key -> MiniMax qua 9Router. Cơ chế then chốt Late Response Drop (SC-002): gắn cờ trạng thái `dispatched` khi đã phản hồi khách; mọi kết quả do tab AI Studio trả về muộn sau mốc 45s đều bị hủy bỏ lập tức và ghi log audit `drop-late-draft`, bảo đảm tuyệt đối khách không bao giờ nhận 2 câu trả lời cho cùng một tin.

**Files:** Create `gateway/cskh-brain.js` · Create `test/gateway/cskh-brain.test.mjs`

**Interfaces — Produces:**
```js
export function createCskhBrain({ queueManager, fallbackGeminiApi, fallbackMiniMaxApi, timeoutMs = 45000 }) -> {
  draft(conv, promptText) -> Promise<{ text: string, source: 'addon' | 'fallback_gemini' | 'fallback_minimax', lateDropped?: boolean }>,
  handleLateResponse(jobId, resultText) -> boolean
}
```

- [ ] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCskhBrain } from '../../gateway/cskh-brain.js';

test('T809: Tab trả kết quả sau 10s -> nhận nháp từ addon', async () => {
  const fakeManager = {
    enqueue: () => ({ jobId: 'job-fast', cached: false }),
    pollResult: async () => ({ status: 'completed', result: 'Nháp từ AI Studio' })
  };
  const brain = createCskhBrain({ queueManager: fakeManager, timeoutMs: 45000 });
  const res = await brain.draft({ convId: 'c1' }, 'Hỏi cước biển');
  assert.equal(res.source, 'addon');
  assert.equal(res.text, 'Nháp từ AI Studio');
});

test('T809 (SC-002): Tab im lặng quá 45s -> chuyển dự phòng, kết quả muộn sau đó bị bỏ', async () => {
  const fakeManager = {
    enqueue: () => ({ jobId: 'job-slow', cached: false }),
    pollResult: async () => new Promise(r => setTimeout(() => r({ status: 'timeout' }), 50))
  };
  const fakeGemini = async () => 'Nháp từ Gemini API dự phòng';

  const brain = createCskhBrain({
    queueManager: fakeManager,
    fallbackGeminiApi: fakeGemini,
    timeoutMs: 40 // giả lập timeout ngắn
  });

  const res = await brain.draft({ convId: 'c1' }, 'Hỏi cước gấp');
  assert.equal(res.source, 'fallback_gemini');
  assert.equal(res.text, 'Nháp từ Gemini API dự phòng');

  // Tab AI Studio trả kết quả muộn sau khi fallback đã gửi
  const dropResult = brain.handleLateResponse('job-slow', 'Kết quả muộn từ AI Studio');
  assert.equal(dropResult, true, 'Kết quả muộn phải bị drop thành công');
});
```
- [ ] **Step 2:** Chạy `node --test test/gateway/cskh-brain.test.mjs` → FAIL.
- [ ] **Step 3:** Tạo `gateway/cskh-brain.js` quản lý vòng đời yêu cầu với `Promise.race`, chuyển chuỗi fallback khi timeout, lưu trữ danh sách `activeDraftRequests` để chặn triệt để kết quả muộn.
- [ ] **Step 4:** Chạy lại `node --test test/gateway/cskh-brain.test.mjs` → PASS.
- [ ] **Step 5:** `git commit -m "feat(gateway): implement cskh brain router with multi-tier fallback and late response drop (T809)"`

---

### T810 [P] Kiểm soát an toàn cửa gửi `gate.send` và kiểm tra tiền `moneyCheck` (`gateway/cskh-integration.js`) (US3, Hiến pháp I, II, III)

Hiện thực hóa lớp tích hợp giữa nháp gợi ý từ Cổng AI Studio và quy trình phát ngôn của bot Zalo:
1. Hiến pháp I: Mọi câu trả lời gợi ý từ AI Studio bắt buộc phải đi qua hàm `gate.send()` của Spec 001. Cổng AI Studio không bao giờ được gửi tin trực tiếp ra kênh chat.
2. Hiến pháp II: Kiểm tra trạng thái máy phòng `stateOf(convId)`. Nếu phòng ở trạng thái `human`, bot im lặng 100%, không gửi yêu cầu tới AI Studio, không tạo nháp.
3. Hiến pháp III: Áp dụng cờ `moneyCheck: true`. Nếu nháp CSKH xuất hiện con số tiền (báo giá, cước vận chuyển, phí hải quan), cửa gửi sẽ đối chiếu với chứng cứ trong ngữ cảnh (`evidence`). Nếu con số không có căn cứ, cửa gửi lập tức từ chối gửi (`reject: money`).

**Files:** Create `gateway/cskh-integration.js` · Create `test/gateway/cskh-integration.test.mjs`

**Interfaces — Produces:**
```js
export function createCskhIntegration({ brain, gate, handoff }) -> {
  handleCustomerMessage({ convId, text, evidence }) -> Promise<{ sent: boolean, reason?: string }>
}
```

- [ ] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCskhIntegration } from '../../gateway/cskh-integration.js';

test('T810: Phòng human -> bot im lặng 100%, không gọi não CSKH (Hiến pháp II)', async () => {
  let brainCalled = false;
  const fakeBrain = { draft: async () => { brainCalled = true; return { text: 'Nháp' }; } };
  const fakeHandoff = { stateOf: () => 'human' };
  const fakeGate = { send: async () => ({ decision: 'send' }) };

  const integration = createCskhIntegration({ brain: fakeBrain, handoff: fakeHandoff, gate: fakeGate });
  const res = await integration.handleCustomerMessage({ convId: 'c1', text: 'Alo tư vấn' });

  assert.equal(res.sent, false);
  assert.equal(res.reason, 'room-human');
  assert.equal(brainCalled, false, 'Không được gọi não khi phòng do nhân viên phụ trách');
});

test('T810: Nháp có số tiền không căn cứ -> gate từ chối gửi (Hiến pháp III, moneyCheck)', async () => {
  const fakeBrain = { draft: async () => ({ text: 'Giá cước trọn gói là 5.000.000 VNĐ nhé' }) };
  const fakeHandoff = { stateOf: () => 'bot' };
  let gateDecision = null;
  const fakeGate = {
    send: async ({ text, moneyCheck, evidence }) => {
      // Giả lập gate kiểm tra số tiền
      if (moneyCheck && text.includes('5.000.000') && !evidence?.includes('5.000.000')) {
        gateDecision = 'reject: money';
        return { decision: 'reject', reason: 'money' };
      }
      return { decision: 'send' };
    }
  };

  const integration = createCskhIntegration({ brain: fakeBrain, handoff: fakeHandoff, gate: fakeGate });
  const res = await integration.handleCustomerMessage({ convId: 'c2', text: 'Báo giá cho anh', evidence: 'Chưa có báo giá' });

  assert.equal(res.sent, false);
  assert.equal(gateDecision, 'reject: money');
});
```
- [ ] **Step 2:** Chạy `node --test test/gateway/cskh-integration.test.mjs` → FAIL.
- [ ] **Step 3:** Tạo `gateway/cskh-integration.js` liên kết luồng kiểm tra phòng `stateOf`, gọi não draft, và chuyển qua `gate.send` kèm tham số `moneyCheck: true`.
- [ ] **Step 4:** Chạy lại `node --test test/gateway/cskh-integration.test.mjs` → PASS.
- [ ] **Step 5:** `git commit -m "feat(gateway): integrate gate.send one-door policy and moneyCheck validation (T810)"`

---

## Phase 4: Giám sát metrics & đo lường SC (Observability & Verification)

### T811 [P] Endpoint `/metrics` và cảnh báo tỉ lệ dự phòng quá ngưỡng (`gateway/metrics.js`) (FR-001, US4, SC-003)

Hiện thực hóa endpoint `/metrics` (`gateway/metrics.js`) cung cấp số liệu vận hành theo thời gian thực:
- `active_tabs`: Số lượng tab đang kết nối và trạng thái chi tiết.
- `queued_jobs`: Số lượng công việc đang xếp hàng phân bổ theo loại (`khach`, `nhan-vien`, `lo`).
- `waiting_time_p95_seconds`: Thời gian chờ trong hàng đợi phân vị p95.
- `w_processing_time_p50_seconds`, `w_processing_time_p95_seconds`: Thời gian xử lý thực tế của AI Studio (W).
- `rate_limit_events_total`: Tổng số lượt giao diện AI Studio bị chạm hạn mức.
- `fallback_rate`: Tỉ lệ chuyển sang API dự phòng trong 1 giờ gần nhất.
Cơ chế cảnh báo: Nếu `fallback_rate` vượt quá ngưỡng 30% trong 1 giờ, tự động sinh cảnh báo để đưa vào bản tin nhân viên.

**Files:** Create `gateway/metrics.js` · Create `test/gateway/metrics.test.mjs`

**Interfaces — Produces:**
```js
export function createGatewayMetricsCollector({ queueDb }) -> {
  recordJobMetric({ kind, durationMs, waitingMs, source, isRateLimited }) -> void,
  getMetricsReport() -> {
    activeTabs: number,
    queuedJobs: { khach: number, nhanVien: number, lo: number },
    waitingTimeP95: number,
    processingTimeW: { p50: number, p95: number },
    rateLimitCount: number,
    fallbackRate1h: number,
    alertHighFallback: boolean
  },
  toPrometheusFormat() -> string
}
```

- [ ] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGatewayMetricsCollector } from '../../gateway/metrics.js';

test('T811: getMetricsReport tính toán chính xác p95, W và cảnh báo khi fallback > 30%', () => {
  const metrics = createGatewayMetricsCollector({ queueDb: {} });

  // Ghi nhận 10 lượt: 4 lượt fallback, 6 lượt addon (fallback rate = 40% > 30%)
  for (let i = 0; i < 6; i++) {
    metrics.recordJobMetric({ kind: 'khach', durationMs: 20000, waitingMs: 2000, source: 'addon' });
  }
  for (let i = 0; i < 4; i++) {
    metrics.recordJobMetric({ kind: 'khach', durationMs: 46000, waitingMs: 45000, source: 'fallback_gemini' });
  }

  const report = metrics.getMetricsReport();
  assert.equal(report.fallbackRate1h, 0.4);
  assert.equal(report.alertHighFallback, true, 'Phải kích hoạt cảnh báo khi tỉ lệ fallback > 30%');
  assert.ok(report.processingTimeW.p50 > 0);
  assert.ok(report.waitingTimeP95 > 0);
});
```
- [ ] **Step 2:** Chạy `node --test test/gateway/metrics.test.mjs` → FAIL.
- [ ] **Step 3:** Tạo `gateway/metrics.js` lưu trữ cửa sổ trượt 1 giờ các bản ghi đo lường, tính toán phân vị p50/p95, và xuất định dạng JSON/Prometheus.
- [ ] **Step 4:** Chạy lại `node --test test/gateway/metrics.test.mjs` → PASS.
- [ ] **Step 5:** `git commit -m "feat(gateway): implement metrics endpoint and fallback rate alerting (T811)"`

---

### T812 [P] Bộ kiểm thử độc lập và công cụ đo lường 4 tiêu chí thành công SC-001..SC-004 (`test/gateway/sc-do.test.mjs`, `scripts/do-sc-008.mjs`) (SC-001..SC-004, US1..US4)

Xây dựng bộ kiểm thử tích hợp độc lập và script CLI đo lường tự động 4 tiêu chí thành công của Spec 008 trên môi trường giả lập tĩnh (`test/fixtures/mock-ai-studio.html`):
1. **SC-001**: Đo thời gian từ lúc gửi yêu cầu khách đến khi có nháp hoàn chỉnh (bao gồm cả trường hợp phải chuyển API dự phòng); xác minh p95 < 50 giây trên 50 mẫu test.
2. **SC-002**: Giả lập kịch bản tab trả kết quả muộn (sau 46–60s khi fallback đã giao); xác minh 100% kết quả muộn bị drop, 0 lần khách nhận hai câu trả lời.
3. **SC-003**: Chạy batch kiểm thử 100 việc hỗn hợp; xác minh tỉ lệ công việc hoàn thành qua addon AI Studio đạt ≥ 80%.
4. **SC-004**: Giả lập Google thay đổi CSS selector trên giao diện; cập nhật `addon/selectors.json` và kiểm tra hệ thống hoạt động trở lại bình thường trong ≤ 30 phút.

**Files:** Create `scripts/do-sc-008.mjs` · Create `test/gateway/sc-do.test.mjs` · Create `test/fixtures/mock-ai-studio.html`

**Interfaces — Produces:**
```js
export async function chayDoLuongSc008({ sampleCount = 50 }) -> {
  sc001_p95_seconds: number,
  sc001_pass: boolean,
  sc002_duplicate_count: number,
  sc002_pass: boolean,
  sc003_addon_rate: number,
  sc003_pass: boolean,
  sc004_config_adapt_pass: boolean
}
```

- [ ] **Step 1: Test đỏ**
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { chayDoLuongSc008 } from '../../scripts/do-sc-008.mjs';

test('T812: Đo lường và xác nhận 4 tiêu chí thành công SC-001..SC-004', async () => {
  const result = await chayDoLuongSc008({ sampleCount: 20 });

  assert.equal(result.sc001_pass, true, `SC-001: p95 (${result.sc001_p95_seconds}s) phải < 50s`);
  assert.equal(result.sc002_pass, true, `SC-002: Số tin trùng (${result.sc002_duplicate_count}) phải bằng 0`);
  assert.equal(result.sc003_pass, true, `SC-003: Tỉ lệ addon (${result.sc003_addon_rate * 100}%) phải >= 80%`);
  assert.equal(result.sc004_config_adapt_pass, true, 'SC-004: Thay đổi selector phải phục hồi hệ thống');
});
```
- [ ] **Step 2:** Chạy `node --test test/gateway/sc-do.test.mjs` → FAIL.
- [ ] **Step 3:** Tạo `test/fixtures/mock-ai-studio.html`, tạo script `scripts/do-sc-008.mjs` thực hiện 4 kịch bản kiểm thử đo lường các chỉ số SC.
- [ ] **Step 4:** Chạy lại `node --test test/gateway/sc-do.test.mjs` → PASS.
- [ ] **Step 5:** `git commit -m "feat(gateway): implement automated verification suite for SC-001 to SC-004 (T812)"`
