---
description: "Danh sách việc spec 001: khuôn spec-kit, mỗi việc viết theo writing-plans của Superpowers (TDD, tệp chính xác, giao diện, lệnh kiểm)"
---

# Tasks: Nền tảng dùng chung (001)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (khuyên dùng) hoặc
> `superpowers:executing-plans` để làm từng việc. Mỗi việc theo `superpowers:test-driven-development`:
> test đỏ → chạy thấy đỏ → code tối thiểu → chạy thấy xanh → commit. Trước khi báo xong dùng
> `superpowers:verification-before-completion`. Bước dùng checkbox (`- [ ]`).

**Goal:** Tách `lib/bot.js` thành lõi `core/` có cửa gửi duy nhất, người cầm phòng, lưu bền SQLite, audit và eval; chuyển 7 gói hải quan sang `packs/hs/` mà không đổi hành vi.

**Architecture:** Webhook ghi `inbox` rồi trả 200 → hàng đợi theo phòng → `engine` kiểm trạng thái phòng → `registry` chọn gói → gói trả `replies/jobs/handoff` → `gate` quyết định và gửi → `audit`. Việc nền và tin hoãn do bộ quét chạy mỗi 5 giây.

**Tech Stack:** Node ≥ 22.13 ESM, `node:sqlite`, `node:test`, không dependency.

**Spec:** `specs/001-nen-tang-chung/spec.md` · contract trong `contracts/` · bảng trong `data-model.md`

## Global Constraints

- Không thêm dependency vào `package.json`.
- Mỗi tệp < 300 dòng; tệp `store` vượt thì tách `core/store/<bảng>.js`.
- Thời gian lưu `new Date().toISOString()`; giờ VN tính bằng cộng 7 giờ trên UTC, **không** dùng giờ địa phương của máy.
- Giờ yên `[23:00, 07:00)` giờ VN. Trần mặc định `CAP_CHAT_DAY=8`, `CAP_ALL_DAY=300`. Ngưỡng trùng `0.8`, cửa sổ `15 phút`, so với `4` tin gần nhất.
- "Trả lời trực tiếp" = tin ra trong `10 phút` kể từ tin khách.
- Chỉ `core/gate.js` được gọi `channel.sendText`.
- `npm test` không dùng mạng. 21 test trong `test/test.mjs` phải xanh từ T014 trở đi.
- Commit message tiếng Anh dạng `feat(core): …`, `test(core): …`, `refactor(hs): …`.

## Review Focus

1. **Update không có `message_id`** (sự kiện ảnh, sticker): `updateKey = sha1(JSON raw)`, hai bản gửi lại vẫn trùng khoá. Test ở T012.
2. **Tin dài bị chia, chết giữa hai phần**: khởi động lại chỉ gửi phần còn thiếu (`parts_sent`). Test ở T009.
3. **Nhóm nghìn người**: mọi thứ theo `conv_id` (người), không theo nhóm; tên trùng phải phân biệt. Test ở T037, T038, T026.
4. **Số tiền tiếng Việt nhiều dạng**: `25.650đ`, `25,650 đ`, `mua 3 250.000đ` (ra 250000), `1,5 triệu`, `800k`, `¥108`. Test ở T007.
5. **Máy chủ chạy giờ UTC** (Coolify): giờ yên và bản tin vẫn đúng giờ VN. Test ở T003 với `process.env.TZ='UTC'` và `'Asia/Tokyo'`.

---

## Phase 1: Setup

### T001 Bộ chạy test, scripts, Docker

**Files:** Modify `package.json`, `Dockerfile`, `.gitignore` · Create `test/core/smoke.test.mjs`

- [ ] **Step 1: Test đỏ**
```js
test('node:sqlite có sẵn và ghi được', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec('create table t(a)'); db.prepare('insert into t values (?)').run(1);
  assert.equal(db.prepare('select count(*) c from t').get().c, 1);
});
```
- [ ] **Step 2:** `node --test test/core/` → FAIL (chưa có tệp / chưa có script)
- [ ] **Step 3:** `package.json`: `engines.node ">=22.13"`; scripts `test = "node --disable-warning=ExperimentalWarning --test test/core/ packs/ && node test/test.mjs"`, `dev = "node --env-file=.env --disable-warning=ExperimentalWarning server.js"`, `start = "node --disable-warning=ExperimentalWarning server.js"`, `eval = "node --disable-warning=ExperimentalWarning eval/run.mjs"`, `audit = "node scripts/audit.mjs"`. Dockerfile: `COPY core channels packs eval ./…`, `ENV DATA_DIR=/app/data`, `VOLUME /app/data`, tạo thư mục với quyền `node`. `.gitignore` thêm `data/`.
- [ ] **Step 4:** `npm test` → PASS (smoke + 21 test cũ)
- [ ] **Step 5:** `git commit -m "chore: node:test runner, data volume, scripts"`

### T002 [P] Đồ giả dùng chung cho test

**Files:** Create `test/helpers/fakes.mjs`, `test/core/fakes.test.mjs`

**Interfaces — Produces:**
- `fakeChannel({ failOn?: (chatId, text, n) => boolean }) -> { name, maxText: 2000, sent: Array<{chatId,text}>, sendText, typing, getMe, parse, verifyWebhook, capabilities }`
- `fakeMcp(script: Record<string, (args, n) => object>) -> { calls: Array<{name,args}>, callTool, listTools }`
- `fakeClock(iso) -> { now(): Date, advance(ms|'10m'|'2h'): void, set(iso) }`

- [ ] **Step 1: Test đỏ**: `fakeClock('2026-11-04T00:00:00Z').advance('10m')` → `now().toISOString() === '2026-11-04T00:10:00.000Z'`; `fakeMcp({tra_thue: () => ({ok:true})}).callTool('tra_thue', {})` ghi `calls.length === 1`.
- [ ] **Step 2:** `node --test test/core/fakes.test.mjs` → FAIL
- [ ] **Step 3:** Viết `fakes.mjs` theo Interfaces.
- [ ] **Step 4:** PASS · **Step 5:** `git commit -m "test: shared fakes"`

---

## Phase 2: Foundational (chặn mọi user story)

### T003 [P] `core/time.js`

**Files:** Create `core/time.js`, `test/core/time.test.mjs`

**Interfaces — Produces:** `vnHour(d: Date) -> number` · `isQuietHours(d: Date, start=23, end=7) -> boolean` · `nextMorning(d: Date, hour=7) -> string /*ISO UTC*/` · `vnDateKey(d) -> 'YYYY-MM-DD'` · `vnDayStartUtc(d) -> string`

- [ ] **Step 1: Test đỏ**
```js
for (const tz of ['UTC', 'Asia/Tokyo']) {
  process.env.TZ = tz;
  assert.equal(isQuietHours(new Date('2026-11-04T16:30:00Z')), true);   // 23:30 VN
  assert.equal(isQuietHours(new Date('2026-11-04T00:30:00Z')), false);  // 07:30 VN
  assert.equal(isQuietHours(new Date('2026-11-03T23:59:00Z')), true);   // 06:59 VN
  assert.equal(nextMorning(new Date('2026-11-04T16:30:00Z')), '2026-11-05T00:00:00.000Z');
  assert.equal(nextMorning(new Date('2026-11-04T19:00:00Z')), '2026-11-05T00:00:00.000Z'); // 02:00 VN cùng đêm
  assert.equal(vnDateKey(new Date('2026-11-04T17:30:00Z')), '2026-11-05');
}
```
- [ ] **Step 2:** FAIL · **Step 3:** cộng 7 giờ trên `getTime()`, đọc bằng `getUTCHours()`. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(core): VN time helpers"`

### T004 [P] `core/redact.js`

**Files:** Create `core/redact.js`, `test/core/redact.test.mjs`

**Interfaces — Produces:** `redact(s: string) -> string` · `findLeak(s: string, banned?: RegExp[]) -> null | 'path'|'stack'|'secret'|'banned'`

- [ ] **Step 1: Test đỏ**
```js
assert.equal(redact('Authorization: Bearer abcDEF123456789012345678901234567890'), 'Authorization: Bearer ***');
assert.match(redact('https://bot-api.zaloplatforms.com/bot1234:AAbbCC-dd/sendMessage'), /bot\*\*\*\/sendMessage/);
assert.equal(findLeak('xem @/home/oz/.hermes/cache/scratch/a.txt'), 'path');
assert.equal(findLeak('at handle (/app/core/engine.js:12:5)'), 'stack');
assert.equal(findLeak('Dạ mã 8413.70.90, thuế 0%'), null);
assert.equal(findLeak('gọi 0985559918', [/0985\D?559\D?918/]), 'banned');
```
- [ ] **Step 2:** FAIL · **Step 3:** regex theo `contracts/send-gate.md` dòng 7. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(core): redact and leak detection"`

### T005 [P] `core/config.js`

**Files:** Create `core/config.js`, `test/core/config.test.mjs` · Modify `.env.example`

**Interfaces — Produces:** `loadConfig(env = process.env) -> Readonly<Config>` với các khoá `zaloToken, mode, port, webhookPath, webhookSecret, mcpUrl, mcpToken, mcpAuthHeader, geminiKey, geminiModel, rateLimitPerMin, allowUsers:Set, staffUsers:Set, staffChatId, dataDir, companyPhones:Set, capChatDay, capAllDay, bannedPatterns:RegExp[], botNames:string[]`

- [ ] **Step 1: Test đỏ**: env tối thiểu `{ ZALO_BOT_TOKEN: 'x' }` → `mode === 'webhook'`, `capChatDay === 8`, `capAllDay === 300`, `Object.isFrozen(cfg)`; `ZALO_MODE='abc'` → throw `/ZALO_MODE/`; `CAP_CHAT_DAY='-1'` → throw; `BANNED_PATTERNS='0985\\D?559'` → `bannedPatterns[0].test('0985 559') === true`.
- [ ] **Step 2:** FAIL · **Step 3:** viết; thêm vào `.env.example`: `STAFF_USERS`, `STAFF_CHAT_ID`, `DATA_DIR`, `CAP_CHAT_DAY`, `CAP_ALL_DAY`, `BANNED_PATTERNS`, `SESSION_TTL_MS`, `COMPANY_PHONES`. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(core): validated config"`

### T006 `core/store.js`

**Files:** Create `core/store.js` (+ `core/store/*.js` nếu > 300 dòng), `test/core/store.test.mjs`

**Interfaces — Produces:** `openStore(path = ':memory:') -> Store`, `Store` có:
`inbox.{insertIgnore(row)->boolean, get(key)->row|null, pending()->row[], markDone(key, at), markFailed(key, err, at)}` ·
`chats.{get(id)->row|null, upsertSeen(id, kind, title, at), setState(id, state, by, reason, at)}` ·
`sessions.{get(key, ttlMs, now)->object, set(key, data, now)}` ·
`outbox.{insert(msg)->id /*throws 'DUPLICATE_IDEM'*/, update(id, patch), hasIdem(key)->boolean, recentBotTexts(chatId, sinceIso, limit)->string[], countSent(chatId|null, sinceIso)->number, due(nowIso)->row[]}` ·
`jobs.{add(job)->id|null, due(nowIso)->row[], update(id, patch)}` ·
`tickets.{openFor(chatId)->row|null, open(chatId, reason, at)->row, update(id, patch), list(status)->row[]}` ·
`audit.{add(rec), byTurn(turnId)->row[], byChat(chatId, limit)->row[], prune(beforeIso)}` ·
`messages.{add(row)->id, recent(chatId, n)->row[], deleteChat(chatId)->number}` ·
`customers.{get(chatId)->row|null, upsert(chatId, patch, at), deleteChat(chatId)}` ·
`meta.{get(k), set(k, v)}` · `tx(fn)` · `close()`

- [ ] **Step 1: Test đỏ**
```js
const s = openStore(); assert.equal(s.meta.get('schema_version'), '1');
openStore(file).close(); assert.equal(openStore(file).meta.get('schema_version'), '1'); // migrate lặp không lỗi
assert.equal(s.inbox.insertIgnore({ update_key: 'm1', chat_id: 'c', raw: '{}', status: 'pending', received_at: T }), true);
assert.equal(s.inbox.insertIgnore({ update_key: 'm1', chat_id: 'c', raw: '{}', status: 'pending', received_at: T }), false);
s.outbox.insert({ idem_key: 'r:c:m1:0', chat_id: 'c', kind: 'reply', text: 'a', decision: 'send', status: 'queued', created_at: T });
assert.throws(() => s.outbox.insert({ idem_key: 'r:c:m1:0', /* … */ }), /DUPLICATE_IDEM/);
assert.equal(s.jobs.add({ pack: 'hs', ma_luot: 'L1', /* … */ }) !== null, true);
assert.equal(s.jobs.add({ pack: 'hs', ma_luot: 'L1', /* … */ }), null);       // UNIQUE(pack, ma_luot)
assert.equal(s.chats.get('c2'), null);
```
- [ ] **Step 2:** FAIL · **Step 3:** lược đồ đúng `data-model.md`; `PRAGMA journal_mode=WAL; busy_timeout=5000`; mọi câu SQL dùng `prepare` + tham số. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(core): sqlite store and schema v1"`

### T007 [P] `core/text.js`

**Files:** Create `core/text.js`, `test/core/text.test.mjs`

**Interfaces — Produces:** `normVi(s) -> string` (thường, bỏ dấu, `đ→d`, gộp khoảng trắng) · `jaccard(a, b) -> number` (tập từ của `normVi`) · `extractMoney(s) -> number[]` · `isCloser(s) -> boolean`

- [ ] **Step 1: Test đỏ**
```js
assert.ok(jaccard('Dạ anh gửi giúp em ảnh sản phẩm ạ', 'dạ anh gửi giúp em ảnh sản phẩm') >= 0.8);
assert.ok(jaccard('Mã 8413.70.90 thuế 0%', 'Anh cần tra mã khác không ạ') < 0.3);
assert.deepEqual(extractMoney('Cước 25.650đ/kg, tổng 1,5 triệu'), [25650, 1500000]);
assert.deepEqual(extractMoney('25,650 đ · 800k · ¥108'), [25650, 800000, 108]);
assert.deepEqual(extractMoney('mua 3 250.000đ'), [250000]);
assert.deepEqual(extractMoney('mã 8413.70.90, 1,5 tấn'), []);   // không có đơn vị tiền
assert.equal(isCloser('ok ạ'), true); assert.equal(isCloser('👍'), true); assert.equal(isCloser('ok mã 8413'), false);
```
- [ ] **Step 2:** FAIL · **Step 3:** viết. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(core): vi text normalize, jaccard, money extraction"`

---

## Phase 3: User Story 1: Không gửi trùng, không gửi sai (P1) 🎯

**Independent Test:** `node --test test/core/gate*.test.mjs` + kịch bản eval `retry-webhook`, `double-tap`, `leak` (T030).

### T008 [US1] `gate.decide()`: hàm thuần

**Files:** Create `core/gate.js`, `test/core/gate-decide.test.mjs`

**Interfaces — Consumes:** `isQuietHours`, `nextMorning` (T003) · `findLeak` (T004) · `jaccard`, `extractMoney` (T007)
**Produces:** `decide(msg, facts, rules) -> { decision, reason, notBefore? }` theo đúng bảng 8 dòng trong `contracts/send-gate.md`

- [ ] **Step 1: Test đỏ**: mỗi dòng của bảng một test, cùng một `msg` gốc `{ kind:'reply', text:'Dạ mã 8413.70.90', inReplyToAt: NOW }` và `facts` mặc định `{ chatState:'bot', hasOpenJob:false, … }`:
```js
expect({ idemExists: true }) → { decision: 'drop', reason: 'duplicate-idem' }
expect({ chatState: 'human' }) → { decision: 'reject', reason: 'chat-human' }
expect({ chatState: 'human' }, { kind: 'staff_relay' }) → 'send'
expect({}, { kind: 'job_result' }) → { decision: 'reject', reason: 'proactive-no-debt' }
expect({}, { kind: 'notice', inReplyToAt: NOW_MINUS_2H }) → { decision: 'reject', reason: 'proactive-no-debt' }   // khách im thì máy im
expect({ hasOpenJob: true, now: '2026-11-04T16:30:00Z' }, { kind: 'job_result' }) → { decision: 'defer', reason: 'quiet-hours', notBefore: '2026-11-05T00:00:00.000Z' }
expect({ now: '2026-11-04T16:30:00Z' }, { kind: 'reply', inReplyToAt: '2026-11-04T16:28:00Z' }) → 'send'   // trả lời trực tiếp trong giờ yên
expect({ sentTodayChat: 8 }) → { decision: 'defer', reason: 'cap:chat' }
expect({ sentTodayAll: 300 }) → { decision: 'defer', reason: 'cap:all' }
expect({ recentBotTexts: ['Dạ mã 8413.70.90 ạ'] }) → { decision: 'drop', reason: /^similar:0\.\d+$/ }
expect({}, { text: 'xem /home/oz/a.log' }) → { decision: 'reject', reason: 'leak:path' }
expect({}, { text: 'Cước 27.000đ/kg', pack: { moneyCheck: true }, evidence: [{ donGia: 25650 }] }) → { decision: 'reject', reason: 'money:27000' }
expect({}, { text: 'Cước 25.650đ/kg', pack: { moneyCheck: true }, evidence: [{ donGia: 25650 }] }) → 'send'
```
- [ ] **Step 2:** FAIL · **Step 3:** kiểm theo thứ tự bảng, trượt đầu tiên thì trả. Số trong `evidence` lấy bằng duyệt sâu mọi giá trị số và chuỗi (`extractMoney` + `Number`). · **Step 4:** PASS · **Step 5:** `git commit -m "feat(gate): pure send decision"`

### T009 [US1] `gate.send()`: thi hành, chia phần, idempotent

**Files:** Modify `core/gate.js` · Create `test/core/gate-send.test.mjs`

**Interfaces — Consumes:** `Store.outbox`, `Store.chats`, `Store.audit` (T006) · `channel.sendText` (contract kênh)
**Produces:** `createGate({ store, channel, rules, now, onAlert, onTicket }) -> { send(msg) -> Promise<{id, decision, reason, status}>, sweep() -> Promise<number> }`

- [ ] **Step 1: Test đỏ**
```js
test('ghi outbox trước khi gọi kênh', …)        // channel.sendText đọc store: dòng đã có status 'queued'
test('hai send cùng idemKey song song → kênh nhận 1 lần', …)   // Promise.all([send(m), send(m)]) → sent.length === 1
test('tin 4.500 ký tự → 3 phần; kênh lỗi phần 2 → status failed, parts_sent 1', …)
test('sweep sau lỗi → gửi tiếp phần 2 và 3, không gửi lại phần 1', …)   // sent = [p1, p2, p3]
test('reject leak → onAlert gọi 1 lần, không có gì tới kênh', …)
test('cap:chat → onTicket(chatId, "cap")', …)
```
- [ ] **Step 2:** FAIL · **Step 3:** `send`: đọc facts → `decide` → `outbox.insert` (bắt `DUPLICATE_IDEM` → trả `drop`) → nếu `send`: chia bằng `splitText` (chuyển từ `lib/zalo.js` sang `core/text.js`) → gửi từ `parts_sent` → cập nhật. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(gate): idempotent send with part resume"`

### T010 [US1] `gate.sweep()`: tin hoãn và thử lại

**Files:** Modify `core/gate.js`, `test/core/gate-send.test.mjs`

- [ ] **Step 1: Test đỏ**: tin `defer` `notBefore=07:00` → sweep lúc 06:59 không gửi, 07:00 gửi; phòng sang `human` trước 07:00 → sweep chuyển `rejected: chat-human`; tin `failed` thử lại 3 lần ở +1, +5, +15 phút sau lần lỗi thứ 1, 2, 3 (chạy lại `decide` đầy đủ mỗi lần), lỗi thứ 4 thì dừng ở `attempts=4`, `onAlert` một lần; tin `cap:chat`/`cap:all` hoãn thẳng tới 07:00 VN sau nửa đêm VN kế tiếp.
- [ ] **Step 2:** FAIL · **Step 3:** `outbox.due(now)` → chạy lại `decide` với facts mới (bỏ qua bước idem vì là chính dòng đó). · **Step 4:** PASS · **Step 5:** `git commit -m "feat(gate): sweep deferred and failed messages"`

---

## Phase 4: User Story 4: Gói cắm vào lõi (P2, làm sớm vì US2/US3 cắm vào engine)

### T011 [US4] `core/types.js`

**Files:** Create `core/types.js` (chỉ JSDoc `@typedef Pack, Turn, Ctx, Update, PackResult, Job` đúng `contracts/`)
- [ ] **Step 1:** Viết typedef. **Step 2:** `node --check core/types.js` → OK. **Step 3:** `git commit -m "docs(core): shared typedefs"`

### T012 [US4] `channels/zalo-bot.js`

**Files:** `git mv lib/zalo.js channels/zalo-bot.js` · Modify `test/test.mjs` (đường import) · Create `test/core/channel.test.mjs`

**Interfaces — Produces:** `createChannel({ token, baseUrl?, fetchImpl?, secret }) -> Channel` theo `contracts/channel.md`; `parse(raw).updateKey`

- [ ] **Step 1: Test đỏ**: `parse({ result: { event_name: 'message.image.received', message: { chat: { id: 1 }, photo_url: 'u' } } }).updateKey` bằng nhau qua 2 lần gọi và có 40 ký tự hex; có `message_id: 9` thì `updateKey === '9'`; `verifyWebhook({ headers: { 'x-bot-api-secret-token': 's' } })` với `secret: 's'` → true, sai → false.
- [ ] **Step 2:** FAIL · **Step 3:** thêm `updateKey`, `verifyWebhook`, `typing`, `capabilities: { detectsHumanReplies: false }`; `sendText` chỉ gửi một phần (việc chia chuyển cho gate). · **Step 4:** `npm test` PASS (21 test cũ) · **Step 5:** `git commit -m "refactor: zalo client becomes channel adapter"`

### T013 [US4] `core/registry.js`

**Files:** Create `core/registry.js`, `test/core/registry.test.mjs`

**Interfaces — Produces:** `loadPacks(dir = 'packs') -> Promise<Pack[]>` · `createRegistry(packs) -> { available(tools: Set|null, turn) -> Pack[], pick(turn, ctx) -> Pack|null }`

- [ ] **Step 1: Test đỏ**: hai gói giả `a` (priority 5, match true) và `b` (priority 10, `audience:'staff'`, match true): `pick({isStaff:false})` → `a`; `pick({isStaff:true})` → `b`; gói `requiresTools:['x']` với `tools = new Set(['y'])` không có trong `available`; `tools = null` (Cổng chưa trả) thì vẫn có (giữ hành vi hiện tại).
- [ ] **Step 2:** FAIL · **Step 3:** `loadPacks` dùng `fs.readdir` + `import(pathToFileURL(…/index.js))`, kiểm `id` duy nhất. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(core): pack registry"`

### T014 [US4] Chuyển 7 gói hải quan sang `packs/hs/`

**Files:** `git mv lib/{packages,router,render,input,format,vision}.js packs/hs/` · Create `packs/hs/index.js`, `packs/hs/test/hs.test.mjs` · Modify `packs/hs/packages.js` (bỏ vòng chờ trong `waitJob`)

**Interfaces — Consumes:** `Ctx` (T011) · **Produces:** `default Pack` với `id:'hs'`, `priority: 0`, `audience:'public'`, `moneyCheck:false`, `requiresTools: []` (giữ "gói chỉ hiện khi Cổng có công cụ" ở mức từng gói con trong `availablePackages`)

- [ ] **Step 1: Test đỏ**
```js
test('phan_loai_hs trả DANG_XU_LY → handle trả jobs [{maLuot, resultTool:"ket_qua_phan_loai"}] và 1 câu "⏳"', …)
test('onJobResult(job, {trangThai:"XONG", ...}) → reply có mã HS gợi ý (dùng renderClassify như cũ)', …)
test('mã 8 số → gói 2, kết quả có thuế suất từ Cổng (giữ nguyên test cũ "gói 2")', …)
```
- [ ] **Step 2:** FAIL · **Step 3:** `index.js` gói `route()` + `PACKAGES` hiện có; `waitJob` thành `toJob(r, resultTool)` trả `{ job }` thay vì vòng `while`. Phiên đọc/ghi qua `ctx.session`. · **Step 4:** `npm test` PASS · **Step 5:** `git commit -m "refactor(hs): move customs packages into packs/hs"`

### T015 [US4] `core/engine.js`: một lượt

**Files:** Create `core/engine.js`, `test/core/engine.test.mjs` · Modify `test/test.mjs` (dùng `createBot` mới; thêm `await bot.drain()` ở test việc nền)

**Interfaces — Consumes:** `Store` (T006), `createGate` (T009), `createRegistry` (T013), `Channel` (T012)
**Produces:** `createEngine({ config, store, channel, mcp, vision, registry, gate, now, log }) -> { process(update) -> Promise<{handled|skipped, turnId}>, drain() -> Promise<void> }` · `createBot(opts)` giữ chữ ký hiện tại cho test cũ (dựng engine với `openStore(':memory:')`).

- [ ] **Step 1: Test đỏ**
```js
test('mỗi lượt ghi audit inbound → route → outbound với cùng turnId', …)
test('gói trả 2 replies → idemKey r:<chat>:<turn>:0 và :1', …)
test('isCloser("cảm ơn ạ") sau khi bot vừa trả lời → không gửi gì, audit skipped:closer', …)
test('gói ném lỗi → khách nhận câu báo chung không chứa nội dung lỗi; audit error đã redact', …)
test('ALLOW_USERS và rate limit 10/phút giữ như cũ', …)
```
- [ ] **Step 2:** FAIL · **Step 3:** `process`: `chats.upsertSeen` → (US2 cắm vào đây) → `registry.pick` → `pack.handle` → `gate.send` từng reply với `footer` của gói nối cuối như hiện nay → `jobs.add` → `inbox.markDone`. `drain()` chạy `jobs.tick` + `gate.sweep` tới khi không còn việc đến hạn (cho test). · **Step 4:** `npm test` PASS · **Step 5:** `git commit -m "feat(core): engine turn pipeline"`

### T037 [US8] Cuộc trò chuyện riêng trong nhóm: chuyển khoá sang `conv_id`

**Files:** Modify `core/store/*.js` (schema v1: thêm `convs`, cột `conv_id`), `core/gate.js`, `core/gate-decide.js`, `core/engine*.js`, `core/queue.js` nếu đã có · Create `test/core/conv.test.mjs`

**Interfaces — Produces:** `convIdOf(update) -> string` (`chat_id` hoặc `chat_id:user_id` khi nhóm) trong `core/conv.js` · `Store.convs.{get, upsertSeen, setState}` · mọi `msg` gửi qua cửa có `convId`; facts của cửa (`chatState`, `recentBotTexts`, `sentTodayChat`, `hasOpenJob`) tính theo `convId`; thêm fact `sentTodayGroup` + luật `cap:group` (`CAP_GROUP_DAY=200`) và `chatState` cấp nhóm (`blocked` ở `chats` chặn mọi conv của nhóm)

- [x] **Step 1: Test đỏ**: nhóm `g1`, A và B: A chạm trần 8 tin → B vẫn gửi được; 30 người gửi cùng câu "8413.70.90" trong 5 phút → 30 tin ra (không `similar`); `convs.setState('g1:B','human')` → tin cho A `send`, cho B `reject chat-human`; `chats` `g1` `blocked` → cả A và B `reject chat-blocked`; idemKey dạng `r:<convId>:<turn>:<i>`; nhóm chạm `CAP_GROUP_DAY` → `defer cap:group`.
- [ ] **Step 2:** FAIL · **Step 3:** sửa lược đồ v1 (chưa có db thật), thêm cột + chỉ mục `(conv_id, …)`, đổi truy vấn; engine tính `convId`, khoá phiên = `convId` (thay `chat:user` hiện tại, cùng giá trị). · **Step 4:** `npm test` PASS · **Step 5:** `git commit -m "feat(core): per-person conversations in group chats"`

### T038 [US8] Gắn đúng tên trong nhóm, tách người trùng tên, hàng đợi theo người

**Files:** Modify `core/engine*.js`, `core/queue.js` (nếu đã có; chưa có thì ghi chú cho T019) · Create `test/core/group-tag.test.mjs`

- [x] **Step 1: Test đỏ**: trong nhóm, mọi reply bắt đầu `@<tên>\n`; A và C trùng tên `Nguyễn Văn A` (user_id `...7f`, `...2c`) đều từng nhắn trong nhóm → tên gắn là `@Nguyễn Văn A ·7f` và `@Nguyễn Văn A ·2c`; tên không trùng thì không có hậu tố; fixture 3 người xen kẽ 12 tin (US8 Independent Test) → mỗi người chỉ nhận câu của mình; việc nền của A không chặn B (hàng đợi khoá `convId`).
- [ ] **Step 2:** FAIL · **Step 3:** danh sách tên đã thấy trong nhóm lấy từ `convs` theo `chat_id`; nếu kênh có `capabilities.replyTo` thì gửi kèm `reply_to` (chưa có tài liệu chính thức cho Zalo Bot Platform ở nhóm, mặc định `false`). · **Step 4:** PASS · **Step 5:** `git commit -m "feat(core): unambiguous name tags in group chats"`

### T016 [US4] Nối `server.js`, xoá `lib/`, khoá "một cửa gửi"

**Files:** Modify `server.js` · Delete `lib/bot.js` (và `lib/`) · Create `test/core/one-gate.test.mjs`

- [x] **Step 1: Test đỏ**
```js
test('chỉ core/gate.js gọi sendText', async () => {
  const hits = await grepFiles(['core', 'packs', 'server.js'], /\.sendText\(/);   // đọc tệp bằng fs
  assert.deepEqual(hits.map((h) => h.file), ['core/gate.js']);
});
```
- [x] Thêm (review B2): `gate.send({text: undefined})` trả `reject: empty`, không ném lỗi.
- [x] **Step 2:** FAIL (server.js cũ còn gọi) · **Step 3:** `server.js` chỉ nối dây (< 120 dòng); bộ quét `setInterval(5000)` gọi `jobs.tick` + `gate.sweep`, có cờ chống chạy chồng. · **Step 4:** `npm test` PASS · **Step 5:** `git commit -m "refactor: server wiring on core, remove lib/"`

### T017 [US4] Gói mẫu `packs/echo/` (nhân viên)

**Files:** Create `packs/echo/index.js`, `packs/echo/test/echo.test.mjs`

- [x] **Step 1: Test đỏ**: nhân viên gõ `/echo xin chào` → reply `xin chào`; khách gõ `/echo xin chào` → gói không được chọn.
- [x] **Step 2:** FAIL · **Step 3:** viết gói `audience:'staff'`, `priority: 100`, `match: t => /^\/echo\b/.test(t.text)`. · **Step 4:** PASS và `git diff --stat main -- core/` không có dòng nào do việc này · **Step 5:** `git commit -m "feat(echo): sample staff pack"`

---

## Phase 5: User Story 3: Không mất việc khi khởi động lại (P1)

### T018 [US3] Webhook ghi `inbox` trước khi trả 200

**Files:** Modify `server.js` · Create `test/core/webhook.test.mjs`

- [x] **Step 1: Test đỏ** (HTTP thật, cổng 0): POST đúng secret → 200 và `inbox` có 1 dòng `pending`; POST lại cùng update → 200, vẫn 1 dòng; secret sai → 403; `store.inbox.insertIgnore` ném lỗi → 503; 50 POST đồng thời → p95 < 200 ms.
- [x] **Step 2:** FAIL · **Step 3:** handler: `verifyWebhook` → `parse` → `insertIgnore` → trả 200 → `queue.run(chatId, () => engine.process(update))` nếu vừa chèn mới. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(server): inbox-first webhook ack"`

### T019 [US3] [P] `core/queue.js`

> Ghi chú từ T038: khoá hàng đợi phải là `convId` (theo người), KHÔNG phải `chatId` (theo phòng) — đối chiếu T038 (`tasks.md:298`) và FR-030 (`spec.md:240`).

**Files:** Create `core/queue.js`, `test/core/queue.test.mjs`

**Interfaces — Produces:** `createQueue() -> { run(key, fn) -> Promise, size() -> number }`

- [x] **Step 1: Test đỏ**: cùng key, `fn1` chờ 50 ms rồi ghi `1`, `fn2` ghi `2` → thứ tự `[1, 2]`; khác key chạy song song (tổng < 80 ms); `fn1` ném lỗi thì `fn2` vẫn chạy; xong hết thì `size() === 0` (không rò bộ nhớ).
- [x] **Step 2:** FAIL · **Step 3:** `Map<key, Promise>` nối chuỗi, xoá key khi chuỗi rỗng. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(core): per-chat serial queue"`

> **Đã làm (ghi nhận 2026-11-07).** Tạo `core/queue.js` (`createQueue()` → `{ run, size }`) và `test/core/queue.test.mjs` (7 test); nối vào `server.js` qua `runTask: (key, fn) => queue.run(key, fn)`. Khoá là `convId` (theo người), xem ghi chú T038 ở đầu mục này — nên commit thật là `feat(core): per-conversation serial queue`, **khác** chữ `per-chat` ở Step 5.
>
> **Hai điểm lệch so với chữ đặc tả, đều có lý do:**
> 1. Step 1 ghi "khác key chạy song song (tổng < 80 ms)". Test đo bằng **số lượt chạy đồng thời** (`maxDong === 2`) thay vì đo đồng hồ. Lý do: đo thật cho thấy ngưỡng 80 ms đỏ **11/12 lần** khi máy tải nặng (có lần đo 99 ms) → CI đỏ ngẫu nhiên. Cách đo mới không bao giờ đỏ vì chậm máy mà vẫn bắt được hàng đợi tuần tự toàn cục.
> 2. Thêm test bảo vệ điều kiện dọn khoá `chuoi.get(key) === duoi`. Lý do: bỏ điều kiện này thì lượt thứ 3 cùng khoá **chạy chồng** lượt thứ 2 — phá đúng thứ T019 sinh ra; QA đã tái hiện được.
>
> **Kiểm đã chạy:** `npm test` 332/332 xanh · `npm run eval` 7/7 · `node scripts/kiem-wiki.mjs --nghiem` ĐẠT.

### T020 [US3] Khôi phục khi khởi động

**Files:** Modify `core/engine.js`, `server.js` · Create `test/core/recover.test.mjs`

**Interfaces — Produces:** `engine.recover() -> Promise<number>` (số tin `pending` đã xử lý)

- [ ] **Step 1: Test đỏ**: db có 2 dòng `pending` (khác phòng) + 1 `done` → `recover()` trả 2, kênh nhận đúng 2 câu trả lời; chạy `recover()` lần nữa → 0 và kênh không nhận thêm.
  Thêm `test/core/stress.test.mjs` cho SC-001: 1.000 update giả (100 phòng, 10 % gửi lại cùng `message_id`), ép "khởi động lại" 3 lần (đóng engine, mở lại cùng tệp db, `recover()`) → mỗi `updateKey` có đúng một bộ tin ra; không `updateKey` nào thiếu tin ra.
- [ ] **Step 2:** FAIL · **Step 3:** lúc khởi động gọi **`gate.recover()` trước** (đưa outbox `queued` → `failed` để bộ quét gửi tiếp phần còn thiếu; review B2 N-1), rồi `engine.recover()` đọc `inbox.pending()` theo `received_at`, đẩy qua `queue`. Test thêm: outbox có 1 dòng `queued` `parts_sent=1` → sau khởi động + sweep, kênh nhận đúng các phần còn thiếu. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(core): recover pending inbox on boot"`

### T021 [US3] `core/jobs.js`: việc nền bền

**Files:** Create `core/jobs.js`, `test/core/jobs.test.mjs`

**Interfaces — Consumes:** `Store.jobs`, `createGate`, `registry` · **Produces:** `createJobs({ store, mcp, registry, gate, now }) -> { add(chatId, sessionKey, pack, job), tick() -> Promise<number> }`

> Khi làm (07/11) đã lệch hai chỗ so với dòng trên, ghi lý do tại đây:
> (1) `add(turn, sessionKey, pack, job)` nhận cả `turn` thay vì `chatId`, vì T037/T038 (làm sau dòng này) chuyển
> mọi khoá sang `conv_id` theo người và bắt tin ra trong nhóm gắn `@tên` — `chatId` một mình thì mất `convId`,
> `isGroup`, `userName`, `userId`. Cùng lý do với ghi chú T019 ở `tasks.md:337`.
> (2) Thêm `recover()`: `jobs.due` chỉ lấy dòng `waiting`, nên tiến trình chết lúc đang hỏi Cổng để lại dòng
> `polling` treo vĩnh viễn → khách không bao giờ nhận kết quả đã hứa (trái Điều II, Điều VII). `recover()` chạy
> một lần lúc khởi động, cùng khuôn `gate.recover()`.

- [x] **Step 1: Test đỏ**
```js
test('DANG_XU_LY 2 lần rồi XONG → khách nhận 1 tin job_result, idem j:<chat>:<maLuot>', …)
test('khởi động lại giữa chừng (createJobs mới trên cùng db) → vẫn giao đúng 1 lần', …)
test('xong lúc 23:30 VN → outbox defer tới 07:00, gửi đúng 1 lần sau sweep 07:00', …)
test('quá 30 phút → expired, khách nhận câu "gõ: kết quả <maLuot>"', …)
test('hỏi lại theo nhịp 6 s, 12 s, 24 s… tối đa 60 s', …)
```
- [x] **Step 2:** FAIL · **Step 3:** `tick`: `jobs.due(now)` → `mcp.callTool(result_tool, {maLuot})` → còn chạy thì dời `next_poll_at`; xong thì `pack.onJobResult` → `gate.send({kind:'job_result', idemKey:'j:…'})` → `status=done`. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(core): durable background jobs"`

---

## Phase 6: User Story 2: Người cầm phòng, bot im (P1)

### T022 [US2] `core/handoff.js`: trạng thái phòng

**Files:** Create `core/handoff.js`, `test/core/handoff-state.test.mjs`

**Interfaces — Produces:** `createHandoff({ store, gate, config, now }) -> { stateOf(chatId), toHuman(chatId, by, reason), toBot(chatId, by), block(chatId, by), open(chatId, reason, turn), forward(chatId, turn), command(turn) }`

> Khi làm (07/11) đã lệch bốn chỗ so với dòng trên, ghi lý do tại đây:
> (1) Khoá là `convId` (người), không phải `chatId`: T037/T038 (làm trước việc này) chuyển mọi khoá sang
> `conv_id`, và cửa gửi đọc trạng thái theo `conv_id` (`core/gate.js:24`). Cùng lý do với ghi chú T019, T021.
> (2) Trạng thái ghi vào **`Store.convs`**, không phải `Store.chats` như Step 3 viết. Cửa gửi đọc `chats`
> cho chat 1-1 (`core/gate.js:27`) nhưng `chats` **không có đường về**: ghi `human` vào `chats` thì
> `/tra-bot` (T025) và tự về đều không mở lại được phòng. `chats.state` chỉ còn giữ `blocked` cấp nhóm
> (FR-032, `data-model.md:40`). `Store.audit` giữ nguyên.
> (3) Chưa nhận `gate`: T022 không gửi tin nào (tự về "chỉ đổi trạng thái phòng" — Điều II). `gate` vào
> ở T024 (phiếu) và T025 (lệnh `/tl`), cùng với `open`/`forward`/`command` — ba hàm đó thuộc hai việc sau.
> (4) Thêm `touch(convId, by)`: bộ đếm khoảng lặng phải tính lại khi **lệnh nhân viên chạm vào phòng**
> mà không sinh tin nào (ví dụ `/nhan` trên phòng đã `human`); không có hàm này thì phòng đang được
> nhân viên theo dõi vẫn tự về sau 2 giờ.

- [x] **Step 1: Test đỏ**: `toHuman` rồi `toBot` → mỗi lần một audit `state-change`; phòng `human` tự trở về `bot` sau khoảng lặng lâu (mặc định khoảng 2 giờ) và ghi audit `state-change` lý do `idle-timeout`, `state_by = 'system'` (test: `advance('1h')` vẫn `human`; `advance('2h')` thì `bot` và không có tin nào gửi ra); `block` rồi khách nhắn → `stateOf === 'blocked'`. Thêm: ngưỡng riêng `HUMAN_IDLE_MS`; bộ đếm tính lại theo tin khách / tin nhân viên / `touch`; tin bot không phá khoảng lặng; phiếu không liên quan (phiếu mở vẫn tự về, đóng phiếu không về ngay); `blocked` không tự về; không ghi `human` vào `chats`; sự cố #4 (`research.md:13`) — sau tin nhân viên, lặng 45 phút thì 22 tin bot vẫn bị cửa chặn `chat-human`.
- [x] **Step 2:** FAIL · **Step 3:** viết trên `Store.convs` + `Store.audit` (xem ghi chú (2) ở trên). · **Step 4:** PASS · **Step 5:** `git commit -m "feat(handoff): chat state machine"`

### T023 [US2] [P] Nhận ý "gặp người" và "người hay máy"

**Files:** Create `core/intents.js`, `test/core/intents.test.mjs`

**Interfaces — Produces:** `wantsHuman(text) -> boolean` · `asksIfBot(text) -> boolean` · hằng `REPLY_HANDOFF`, `REPLY_IS_BOT`

- [ ] **Step 1: Test đỏ**
```js
for (const s of ['cho em gặp nhân viên', 'gọi lại cho anh', 'có ai trực không', 'muốn nói chuyện với người thật', 'tư vấn viên đâu'])
  assert.equal(wantsHuman(s), true);
for (const s of ['Mày là người hay là AI đấy', 'bạn là bot à', 'đây là máy trả lời tự động hả'])
  assert.equal(asksIfBot(s), true);
for (const s of ['máy bơm nước ly tâm 1.5HP', 'nhân viên văn phòng dùng máy in này', '8413.70.90'])
  { assert.equal(wantsHuman(s), false); assert.equal(asksIfBot(s), false); }
assert.match(REPLY_IS_BOT, /trợ lý tự động của OZ/);
```
- [ ] **Step 2:** FAIL · **Step 3:** regex trên `normVi`. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(core): human-request and is-bot intents"`

### T024 [US2] Phiếu vào nhóm nhân viên + gộp tin

**Files:** Modify `core/handoff.js` · Create `test/core/handoff-ticket.test.mjs`

- [ ] **Step 1: Test đỏ**: `open` → nhóm `STAFF_CHAT_ID` nhận một tin `kind:'ticket'` có `P<id>`, tên khách, 5 tin gần nhất; phòng đã có phiếu `open` thì không mở phiếu thứ hai; khách nhắn 4 tin trong 3 phút → nhóm nhận thêm đúng 1 tin gộp lúc ≥ 5 phút; không có `STAFF_CHAT_ID` → phiếu chỉ vào db, không lỗi.
- [ ] **Step 2:** FAIL · **Step 3:** viết; gộp bằng `tickets.last_forward_at`. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(handoff): staff tickets with coalesced forwarding"`

### T025 [US2] Lệnh nhân viên

**Files:** Modify `core/handoff.js` · Create `test/core/handoff-cmd.test.mjs`

- [ ] **Step 1: Test đỏ**
```js
test('/tl P3 Dạ em đây ạ → khách nhận đúng "Dạ em đây ạ" (kind staff_relay), phòng sang human', …)
test('/nhan P3 hai người → người đầu được, người sau nhận "P3 đã có <tên> nhận"', …)
test('/tra-bot P3 → phòng về bot, phiếu closed; bot không trả lời bù tin cũ', …)
test('/chan P3 → blocked; /cho → danh sách phiếu open + phút chờ', …)
test('lệnh từ người không thuộc STAFF_USERS hoặc ngoài STAFF_CHAT_ID → bỏ qua, audit staff-cmd:denied', …)
```
- [ ] **Step 2:** FAIL · **Step 3:** viết. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(handoff): staff commands"`

### T026 [US2] Cắm handoff vào engine

**Files:** Modify `core/engine.js` · Create `test/core/engine-handoff.test.mjs`

- [ ] **Step 1: Test đỏ**
```js
test('phòng human: 10 tin khách → kênh nhận 0 tin tới khách, mcp.calls.length === 0, nhóm nhận 1 phiếu + ≤ 2 tin gộp', …)
test('"cho em gặp nhân viên" → khách nhận REPLY_HANDOFF, phòng human, phiếu mở', …)
test('"bạn là người hay máy" → khách nhận REPLY_IS_BOT, phòng vẫn bot', …)
test('nhóm khách: /tl vào conv g1:B gửi vào nhóm với @tên của B; chỉ conv B sang human, A vẫn được bot trả lời; /chan-nhom chặn cả nhóm', …)
test('gói trả handoff:{reason} → phòng human, phiếu mở với reason của gói', …)
```
- [ ] **Step 2:** FAIL · **Step 3:** trong `process`: lệnh nhân viên → `handoff.command`; `stateOf ≠ bot` → `handoff.forward` rồi dừng; `asksIfBot` / `wantsHuman` trước `registry.pick`. · **Step 4:** `npm test` PASS · **Step 5:** `git commit -m "feat(core): human-first routing in engine"`

---

## Phase 6b: User Story 7: Lịch sử hội thoại và hồ sơ khách (P2)

**Independent Test:** kịch bản eval `ho-so-khach` (T030) + `node --test test/core/customers*.test.mjs`.

### T033 [US7] Ghi mọi tin vào `messages`

**Files:** Modify `core/engine.js`, `core/gate.js` · Create `test/core/messages.test.mjs`

**Interfaces — Consumes:** `Store.messages` (T006) · **Produces:** tin khách ghi ở `engine.process` (`speaker:'khach'`); tin bot/nhân viên ghi ở `gate.send` **chỉ khi** `status = sent` (`speaker:'bot'|'nhan-vien'`, `outbox_id`)

- [ ] **Step 1: Test đỏ**: hội thoại 3 tin khách → bot trả 3 câu → `messages.recent(c, 10)` có 6 dòng xen kẽ đúng thứ tự; tin bị cửa `drop`/`reject` **không** có trong `messages`; `/tl` ghi `speaker:'nhan-vien'`, `speaker_id` là nhân viên; ảnh ghi `[ảnh] <url>`.
- [ ] **Step 2:** FAIL · **Step 3:** viết. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(core): persist full chat transcript"`

### T034 [US7] [P] `core/customers.js`: hồ sơ và nhãn tự động

**Files:** Create `core/customers.js`, `test/core/customers.test.mjs`

**Interfaces — Consumes:** `Store.customers` (T006), `normVi` (T007), `config.companyPhones` (T005)
**Produces:** `extractPhone(text, companyPhones) -> string|null` · `createCustomers({ store, config, now }) -> { touch(turn), addLabels(chatId, labels, source), removeLabel(chatId, label, by), addInterests(chatId, items), setNote(chatId, text, by), summary(chatId) -> string, erase(chatId) }`

- [ ] **Step 1: Test đỏ**
```js
assert.equal(extractPhone('số em 0912 345 678 nhé', new Set()), '0912345678');
assert.equal(extractPhone('+84 912.345.678', new Set()), '0912345678');
assert.equal(extractPhone('gọi 0916366669', new Set(['0916366669'])), null);   // số của OZ khách dán lại
assert.equal(extractPhone('mã 8413709090', new Set()), null);                  // mã HS 10 số không phải SĐT
// nhãn
c.addLabels('c1', ['khoa-hoc'], 'staff:u9'); c.removeLabel('c1', 'khoa-hoc', 'auto') // → vẫn còn (máy không gỡ nhãn nhân viên)
c.addLabels('c1', ['tra-cuu-hs'], 'auto'); c.addLabels('c1', ['tra-cuu-hs'], 'auto') // → chỉ 1 mục
// interests giữ 20 mục mới nhất; summary() có tên, SĐT, nhãn, 3 món gần nhất, số lượt
```
- [ ] **Step 2:** FAIL · **Step 3:** SĐT: chuỗi 10 số bắt đầu `0[35789]` sau khi bỏ `.`/`-`/khoảng trắng, hoặc `+84`/`84` + 9 số; số liền khối 10 số mà khách đang ở gói hs thì không coi là SĐT nếu trùng định dạng mã HS (`firstHs8` khớp). · **Step 4:** PASS · **Step 5:** `git commit -m "feat(core): customer profile and rule-based labels"`

### T035 [US7] Cắm hồ sơ vào engine, phiếu và ctx gói

**Files:** Modify `core/engine.js`, `core/handoff.js`, `packs/hs/index.js` · Create `test/core/engine-customers.test.mjs`

- [ ] **Step 1: Test đỏ**: khách dùng gói hs với "máy bơm ly tâm 1.5HP" → hồ sơ có nhãn `tra-cuu-hs`, interest `máy bơm ly tâm 1.5HP` kèm mã HS của lượt; khách xin người → nhãn `xin-nguoi` và phiếu trong nhóm có `summary()`; gói đọc được `ctx.history(5)` (5 tin, cũ → mới) và `ctx.customer.labels`; phòng `human` vẫn `touch` hồ sơ (đếm lượt) nhưng không gọi gói.
- [ ] **Step 2:** FAIL · **Step 3:** `engine` gọi `customers.touch(turn)` mỗi lượt, áp `labels`/`interests` từ kết quả gói; gói hs trả `labels:['tra-cuu-hs']` + `interests`. · **Step 4:** `npm test` PASS · **Step 5:** `git commit -m "feat(core): customer profile in engine, tickets and pack ctx"`

### T036 [US7] Lệnh hồ sơ cho nhân viên + sao lưu

**Files:** Modify `core/handoff.js` · Create `core/backup.js`, `test/core/handoff-hoso.test.mjs`, `test/core/backup.test.mjs`

- [ ] **Step 1: Test đỏ**: `/ho-so P1` → nhóm nhận hồ sơ + 20 tin gần nhất (giờ VN); `/gan P1 khoa-hoc` và `/go P1 khoa-hoc`; `/ghi P1 khách hẹn thứ 6` → `note`; `/xoa-du-lieu P1` → `messages` và `customers` của phòng = 0 dòng, audit có `erase` với người xoá, không có nội dung tin; `backup.run(now)` lúc 03:00 VN tạo `backup/bot-2026-11-05.db` mở được bằng `openStore`, chạy lại cùng ngày không tạo bản hai, giữ đúng 7 bản mới nhất.
- [ ] **Step 2:** FAIL · **Step 3:** viết; `backup` dùng `db.exec("VACUUM INTO '<path>'")`, bộ quét gọi mỗi phút, chạy khi `vnHour = 3` và `meta.last_backup_at` khác ngày. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(core): staff profile commands and daily backup"`

---

## Phase 7: User Story 5: Vận hành nhìn thấy được (P2)

### T027 [US5] `/health` và `/metrics`

**Files:** Create `core/ops.js`, `test/core/ops.test.mjs` · Modify `server.js`

**Interfaces — Produces:** `health() -> {ok, db, mcp:{tools}, zalo, staff, inboxPending}` · `metrics(sinceIso) -> {turns, gate:{send,drop,defer,reject,byReason}, tickets:{open}, jobs:{waiting}}`

- [ ] **Step 1: Test đỏ**: sau 3 lượt (1 send, 1 drop similar, 1 reject leak) → `metrics().gate.byReason` có `similar`, `leak:path`; db đóng → `health().ok === false` và HTTP 503.
- [ ] **Step 2:** FAIL · **Step 3:** đếm từ `outbox`/`audit` bằng SQL. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(ops): health and metrics"`

### T028 [US5] Bản tin gộp 08:00 và 17:00 giờ VN

**Files:** Modify `core/ops.js` · Create `test/core/digest.test.mjs`

- [ ] **Step 1: Test đỏ**: đồng hồ giả chạy từ 07:59 tới 08:01 VN, sweep mỗi phút → nhóm nhận đúng 1 tin `kind:'digest'` (idem `d:2026-11-05:08`); có số lượt, lỗi, tin bị chặn theo lý do, phiếu chờ > 15 phút; khởi động lại lúc 08:00:30 không gửi lần hai.
- [ ] **Step 2:** FAIL · **Step 3:** viết; idem bảo đảm một lần. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(ops): twice-daily staff digest"`

### T029 [US5] [P] `npm run audit`

**Files:** Create `scripts/audit.mjs`, `test/core/audit-cli.test.mjs`

- [ ] **Step 1: Test đỏ**: chạy `node scripts/audit.mjs --db <tmp> --turn m1` (child_process) → stdout có các dòng `inbound`, `route hs`, `gate send ok`, `outbound` theo giờ VN; `--chat c1 --limit 5` in ≤ 5 lượt.
- [ ] **Step 2:** FAIL · **Step 3:** viết. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(ops): audit CLI"`

---

## Phase 8: User Story 6: Kiểm trước khi bật (P3)

### T030 [US6] `eval/run.mjs` + 9 kịch bản

**Files:** Create `eval/run.mjs`, `eval/README.md`, `eval/fixtures/{retry-webhook,double-tap,human-room,silent-customer,leak,is-bot,restart-mid-job,quiet-hours,ho-so-khach}.jsonl`

Định dạng một dòng fixture:
`{"step":"in","update":{…}} | {"step":"mcp","tool":"phan_loai_hs","returns":[…]} | {"step":"advance","by":"10m"} | {"step":"restart"} | {"step":"staff","text":"/nhan P1"} | {"step":"expect","sentTo":"c1","count":1,"match":"8413"}`

> Làm một phần ngày 06/11/2026 (nhánh `009-agent-tra-cuu`, theo yêu cầu chủ repo để mở được PR): bộ chạy + 7 kịch bản
> cho tính năng đã có (`retry-webhook`, `double-tap`, `silent-customer`, `leak`, `restart-mid-job`, `quiet-hours`, `cong-ai-ban`).
> Còn `human-room`, `is-bot`, `ho-so-khach` chờ T022–T026, T033–T036 — xem `eval/README.md`.

- [ ] **Step 1: Test đỏ**: `node eval/run.mjs` với thư mục rỗng → in `eval: 0/0` và thoát 0; với fixture cố ý sai (`count: 2` cho `retry-webhook`) → thoát 1 và in tên kịch bản.
- [ ] **Step 2:** FAIL · **Step 3:** `run.mjs` dựng engine thật trên `:memory:` (restart = đóng engine, mở lại cùng tệp tạm) với `fakeChannel`, `fakeMcp`, `fakeClock`; viết 9 fixture: 8 cái ứng với các dòng trong `research.md` §1 (#1, #2, #4, #5, #7, #9, #11, #12) và `ho-so-khach` (US7). · **Step 4:** `npm run eval` → `eval: 9/9` · **Step 5:** `git commit -m "feat(eval): replay runner and incident fixtures"`

### T031 [US6] [P] CI

**Files:** Create `.github/workflows/ci.yml`

- [ ] **Step 1:** workflow `node-version: 22`, chạy `npm test` rồi `npm run eval` cho mọi PR và push lên `main`.
- [ ] **Step 2:** đẩy nhánh, CI xanh trên PR. · **Step 3:** `git commit -m "ci: test and eval gate"`

---

## Phase 9: Polish

### T032 Tài liệu và kiểm tay

**Files:** Modify `README.md`, `.env.example` · Verify `specs/001-nen-tang-chung/quickstart.md`

- [ ] **Step 1:** README: mô hình lõi / gói / kênh; lệnh nhân viên; biến môi trường mới; cách thêm gói (trỏ `contracts/pack.md`).
- [ ] **Step 2:** Chạy đủ `quickstart.md` mục 1–6 trên máy thật, ghi kết quả vào mô tả PR.
- [ ] **Step 3:** `git commit -m "docs: core platform usage"`

---

## Dependencies & Execution Order

- T001 → T002 → (T003, T004, T005, T007 song song) → T006 → T008 → T009 → T010
- T011 → T012 → T013 → T014 → T015 → T016 → T017
- T018 cần T016; T019 song song; T020 cần T018 + T019; T021 cần T015
- T022 → T023 (song song được) → T024 → T025 → T026 (cần T015)
- T033 cần T026; T034 song song; T035 cần T033 + T034; T036 cần T035
- T027 → T028; T029 song song; T030 cần T026 + T021 + T035; T031 sau T030
- T032 cuối cùng

**MVP an toàn để bật lại cho khách** = xong Phase 1–6b (T001–T026, T033–T036): cửa gửi, gói hs trên lõi, bền vững, người cầm phòng, lịch sử và hồ sơ khách.

**Thứ tự chạy thật**: T001–T015 → **T037–T038** → T016–T026 → T033–T036 → T027–T032 (số hiệu T033–T036 thêm sau buổi hỏi đáp 04/11, nên đứng sau T032 trong bảng số).
