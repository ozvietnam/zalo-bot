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
- Giờ yên `[23:00, 07:00)` giờ VN. Trần mặc định `CAP_CHAT_DAY=8`, `CAP_ALL_DAY=300`. Ngưỡng trùng `0.8`, so với `4` tin gần nhất; cửa sổ chống trùng **tách theo loại tin**: `60 giây` cho tin **trả lời trực tiếp** (còn mốc tin khách trong `10 phút`), `15 phút` cho tin **chủ động** (issue #55).
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
`outbox.{insert(msg)->id /*throws 'DUPLICATE_IDEM'*/, update(id, patch), hasIdem(key)->boolean, recentBotMsgs(convId, sinceIso, limit)->[{text, at}], countSent(chatId|null, sinceIso)->number, due(nowIso)->row[]}` ·
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
expect({ recentBotTexts: ['Dạ mã 8413.70.90 ạ'] }) → { decision: 'drop', reason: /^similar:0\.\d+$/ }   // chuỗi trần = không có mốc → coi như trong cửa sổ (T039)
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

- [x] **Step 1: Test đỏ**: db có 2 dòng `pending` (khác phòng) + 1 `done` → `recover()` trả 2, kênh nhận đúng 2 câu trả lời; chạy `recover()` lần nữa → 0 và kênh không nhận thêm.
  Thêm `test/core/stress.test.mjs` cho SC-001: 1.000 update giả (100 phòng, 10 % gửi lại cùng `message_id`), ép "khởi động lại" 3 lần (đóng engine, mở lại cùng tệp db, `recover()`) → mỗi `updateKey` có đúng một bộ tin ra; không `updateKey` nào thiếu tin ra.
- [x] **Step 2:** FAIL · **Step 3:** lúc khởi động gọi **`gate.recover()` trước** (đưa outbox `queued` → `failed` để bộ quét gửi tiếp phần còn thiếu; review B2 N-1), rồi `engine.recover()` đọc `inbox.pending()` theo `received_at`, đẩy qua `queue`. Test thêm: outbox có 1 dòng `queued` `parts_sent=1` → sau khởi động + sweep, kênh nhận đúng các phần còn thiếu. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(core): recover pending inbox on boot"`

> **Đã làm (ghi nhận 2026-11-07).** `engine.recover()` ở `core/engine.js:187` (trả `Promise<number>`), thêm
> `inbox.requeueProcessing()` ở `core/store/queue.js:35`, nối ở `server.js:82` + `server.js:83` (`gate.recover()`
> trước, rồi `engine.recover()`). Test: `test/core/recover.test.mjs` (17 test) + `test/core/stress.test.mjs` (SC-001).
>
> **Mốc giờ của lượt phát lại — quyết định về HÀNH VI, không chỉ là chi tiết kỹ thuật.**
> Lượt phát lại mang mốc khách nhắn **thật** (`inbox.received_at`) qua `process(u, { replayedAt })`
> (`core/engine.js:71`), không đóng dấu `now()`. Bản đầu đóng dấu `now()` và đó là lỗi chặn merge: cửa
> coi mọi tin phát lại là "trả lời trực tiếp" (`core/gate-decide.js:36-40`) nên **bỏ qua giờ yên** —
> khách nhắn 22:50 VN, bot lên lại 01:00 VN thì nhắn khách lúc 1 giờ sáng (vi phạm "Ràng buộc kỹ thuật"
> của hiến pháp, FR-005, và Điều II đúng dạng sự cố #4 ở `research.md:13`). Khe này mở ra khi thời gian
> khởi động lại vượt `directReplyMs` = 10 phút: crash-loop có backoff, VPS sập đêm, deploy kẹt.
>
> Giữ mốc thật thì sinh ra căng thẳng ngược: tin cũ thành "tin chủ động" và bị
> `reject proactive-no-debt`, khách **không nhận được trả lời** — ngược SC-001 ("số tin mất = 0"), mà
> đường reject đó cũng không mở phiếu (`signal()` ở `core/gate.js:67` chỉ báo với `leak:`/`money:`/`cap:`).
> **Chốt:** tin khách **chưa ai trả lời** là một **món nợ với khách**, khác hẳn ca FR-015 (khách im mà
> máy tự nhắn — sự cố #5). Nên `reply()` khai `debt: true` cho lượt phát lại (`core/engine.js:60`) và cửa
> nhận cờ đó vào `hasOpenJob` (`core/gate.js:124`), dùng đúng vốn từ `ctx.debt` đã có khi quét
> (`core/gate.js:168`). Kết quả: ban ngày trả lời ngay; trong giờ yên **hoãn tới 07:00** rồi giao —
> không nhắn đêm, cũng không mất tin. Khoá bằng 4 test ở `test/core/recover.test.mjs:241` và chốt
> "không tin CŨ nào bay trong giờ yên" ở `test/core/stress.test.mjs:183`.
>
> Điều IV (bản ghi đúng sự thật): lượt phát lại ghi `messages.at` = lúc khách nhắn thật
> (`core/engine.js:129`), `convs/chats.last_inbound_at` cũng vậy; dòng audit giữ `at` = lúc **ghi sổ**
> (đúng sự thật) và mang thêm `receivedAt` + `replayed` để tra lại được (`core/engine.js:123`). Thứ tự
> `messages` còn là đầu vào luật "chào kết" (`core/engine.js:131`), nên ghi sai mốc là sai cả luật đó.
>
> **Ba điểm lệch so với chữ đặc tả, đều có lý do:**
> 1. `data-model.md:18` ghi "`processing` quá 5 phút coi như `pending`". Code **không chờ 5 phút**: lúc khởi
>    động mọi dòng `processing` đều mồ côi (hiến pháp cho một tiến trình, một tệp db), nên trả về `pending`
>    ngay. Chờ 5 phút sẽ **mất tin** khi container khởi động lại trong vòng 5 phút → phá SC-001.
>    Nếu có hai tiến trình chồng nhau thì idempotency của cửa (`r:<conv>:<turn>:<i>`) vẫn chặn tin trùng.
> 2. `recover()` còn nhặt cả dòng `processing`, không chỉ `inbox.pending()` như Step 3 ghi — vì dòng
>    `processing` mới là dòng chết **giữa lượt**, đúng ca mà T020 sinh ra để chữa.
> 3. Thêm luật: dòng `raw` không dựng lại được Update (JSON hỏng, kênh không hiểu, thiếu `chatId`,
>    `updateKey` lệch khoá đã lưu) → `markFailed`. Không có luật này thì `recover()` nhặt lại dòng hỏng
>    **mãi mãi** ở mọi lần khởi động. `updateKey` lệch đáng ngại nhất: `process()` sẽ ghi một dòng inbox
>    **khác** và dòng cũ treo lại — đã khoá bằng test dùng `channels/zalo-bot.js` thật, cả ca có và không có
>    `message_id` (`updateKey = sha1(raw)`).
>
> Cùng PR: `eval/run.mjs:85` cho bước `restart` gọi `gate.recover()` + `engine.recover()` như `server.js`,
> trước đó bước này chỉ mở lại db nên eval không còn giống đường thật.
>
> **Bộ chặn tốc độ không áp cho lượt phát lại (`core/engine.js:108`) — lỗ do chính bản vá này mở ra.**
> `limited()` (`core/engine.js:41-48`) là cửa sổ 60 giây theo `now()` trong bộ nhớ. Đường thường không bao
> giờ gộp nhiều giờ lưu lượng vào một cửa sổ đó, nhưng `recover()` chạy **cả tồn đọng ở cùng một mốc
> `now()`**: từ tin thứ `rateLimitPerMin`+1 (mặc định 11) của **cùng một người** trở đi, mọi lượt bị coi là
> "gửi quá nhanh". Hậu quả đã tái hiện với 14 tin rải trên 2 giờ (ca VPS sập đêm): 10 lượt được trả lời,
> lượt 11 nhận câu "Bạn gửi hơi nhanh…", lượt 12–14 bị cửa `drop similar:1.00` vì trùng chính câu đó, mà
> **cả 14 dòng inbox vẫn `markDone`** → 4 câu hỏi thật mất vĩnh viễn. Phá SC-001 và FR-016, tức đúng phần
> cốt lõi của T020. Thêm một hệ quả về Điều VIII: câu "gửi hơi nhanh" sinh ra lúc phát lại cũng mang
> `debt: true`, nên trong giờ yên nó được **hoãn tới 07:00 rồi giao** — khách nhận một câu vô nghĩa sáng
> hôm sau thay cho câu trả lời.
> **Chốt:** lượt phát lại **không đo và cũng không ghi vào** cửa sổ 60 giây. Không ghi là có chủ ý: nếu ghi
> thì tin **mới** vào ngay sau `recover()` sẽ bị chặn oan. Bộ chặn giữ nguyên tác dụng trên đường thường —
> khoá bằng chốt chặn ngược ở `test/core/recover.test.mjs:339` (khách spam thật 11 tin trong một phút sau
> khi recover xong → vẫn nhận đúng một câu nhắc).
>
> **`recover()` chỉ đếm lượt CHẠY ĐƯỢC (`core/engine.js:208`).** Trước đó `n++` nằm **trước** `try`, nên
> trả cả dòng mà `runTask` ném lỗi và không xử lý được — lệch chữ interface của T020
> (dòng 358: "số tin `pending` **đã xử lý**"), khai khống theo Điều VIII, và che mất ca "nhặt lại mãi mà
> không lượt nào xong". Test `test/core/recover.test.mjs:136` nay chốt 1 chứ không phải 2.
>
> **Kiểm đã chạy:** `npm test` 350/350 xanh · `npm run eval` 7/7 · `node scripts/kiem-wiki.mjs --nghiem` ĐẠT.

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

- [x] **Step 1: Test đỏ**
```js
for (const s of ['cho em gặp nhân viên', 'gọi lại cho anh', 'có ai trực không', 'muốn nói chuyện với người thật', 'tư vấn viên đâu'])
  assert.equal(wantsHuman(s), true);
for (const s of ['Mày là người hay là AI đấy', 'bạn là bot à', 'đây là máy trả lời tự động hả'])
  assert.equal(asksIfBot(s), true);
for (const s of ['máy bơm nước ly tâm 1.5HP', 'nhân viên văn phòng dùng máy in này', '8413.70.90'])
  { assert.equal(wantsHuman(s), false); assert.equal(asksIfBot(s), false); }
assert.match(REPLY_IS_BOT, /trợ lý tự động của OZ/);
```
- [x] **Step 2:** FAIL · **Step 3:** regex trên `normVi`. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(core): human-request and is-bot intents"`

> Khi làm (07/11) ghi lại những điều phát hiện lúc viết regex, để T026 không phải dò lại:
> (1) `normVi` bỏ dấu nên nhiều cặp từ trùng nhau: "gói" (đóng gói hàng) ↔ "gọi" (gọi điện),
> "bột" ↔ "bot", "máy" ↔ "mày", và — nguy nhất vì gặp hằng ngày — tiểu từ lịch sự **"ạ" ↔ "à"** hỏi.
> Né bằng ba lớp (`core/intents.js:6-19`): hệ từ "là/phải"; chủ ngữ (gọi thẳng bot "bạn/mày là bot"
> thì đủ, chủ ngữ chỉ định "cái này/đây" trỏ vào hàng cũng được nên buộc thêm tiểu từ hỏi cuối câu);
> và kiểm dấu thanh trên **bản gốc** trước khi chuẩn hoá (`core/intents.js:30` cho "ạ"/"à",
> `core/intents.js:113` cho "gói"/"gọi"). Thiếu lớp thứ ba thì "dạ cái này là máy ạ" — câu tả hàng
> thường ngày — bị nhận là hỏi danh tính, và ở T026 bot sẽ trả lời "em là trợ lý tự động" thay vì
> phân loại hàng. Giới hạn còn lại: khách gõ **không dấu** "goi lai cho em" thì hai nghĩa trùng hoàn
> toàn, luật chọn nghĩa "gọi lại" (mở phiếu cho nhân viên còn hơn bỏ lời khách).
> (2) Tiểu từ hỏi phải ở **cuối câu**, và trong "có phải X không" thì X phải là **vị ngữ** của "phải".
> Nếu chỉ cần từ khoá xuất hiện gần đó thì các câu nghiệp vụ rất thường gặp bị nhận sai:
> "cái này là máy không chịu thuế", "có phải máy này chịu thuế không", "có phải máy không chịu thuế" (`core/intents.js:39`,
> `core/intents.js:166`).
> (3) `wantsHuman` và `asksIfBot` loại trừ nhau ở mệnh đề "người hay máy": mệnh đề đó là lời hỏi danh
> tính, nếu để cả hai cùng `true` thì T026 sẽ chuyển phòng sang `human` ngay khi khách mới chỉ hỏi bot
> là người hay máy — trái mô tả của T026 ở `tasks.md:448` ("phòng vẫn bot"). Nhưng chỉ loại **riêng
> mệnh đề đó**, không thoát sớm trên cả câu: "hay" tiếng Việt còn nghĩa "thường hay", nên
> "máy hay bị lỗi, cho em gặp nhân viên với" vẫn phải là lời xin gặp người (`core/intents.js:47`,
> `core/intents.js:120`). Hướng bỏ sót lời khách nặng hơn hướng mở phiếu thừa: bỏ sót là trái FR-014.
> (4) Chủ ngữ **ngôi thứ nhất** ("em/anh/chị/mình") phải nằm cùng nhóm với chủ ngữ chỉ định, tức là
> buộc có tiểu từ hỏi. Khách dùng chính các từ đó để tả hàng của mình ("hàng của anh là máy ạ",
> "lô của em là bột"), nên nếu cho nhóm này khỏi cần tiểu từ thì nó **đi vòng qua** đúng lớp "ạ"/"à"
> ở (1) (`core/intents.js:148-149`). Hai cặp dấu nữa cùng loại: "chị" ↔ **"chỉ"** ("hàng này chỉ là
> máy") và "đó" chỉ định/nhấn mạnh ("cái này là máy đó ạ") — "đó" vì vậy không tính là tiểu từ hỏi
> (`core/intents.js:154`). (5) Lời xin gặp người **gián tiếp** (xin số, xin nối, "có ai hỗ trợ không")
> cũng nhận, theo đúng nguyên tắc ở (3) (`core/intents.js:78`, `core/intents.js:83`); nhưng "nối" và
> "số" **trần** thì không, vì trùng "nội/nơi/nói" và vì "số nhân viên" là đếm người còn "số máy" trong
> tờ khai là số khung của hàng.

### T024 [US2] Phiếu vào nhóm nhân viên + gộp tin

**Files:** Modify `core/handoff.js` · Create `core/handoff-ticket.js`, `test/core/handoff-ticket.test.mjs`

- [x] **Step 1: Test đỏ**: `open` → nhóm `STAFF_CHAT_ID` nhận một tin `kind:'ticket'` có `P<id>`, tên khách, 5 tin gần nhất; phòng đã có phiếu `open` thì không mở phiếu thứ hai; khách nhắn 4 tin trong 3 phút → nhóm nhận thêm đúng 1 tin gộp lúc ≥ 5 phút; không có `STAFF_CHAT_ID` → phiếu chỉ vào db, không lỗi.
- [x] **Step 2:** FAIL · **Step 3:** viết; gộp bằng `tickets.last_forward_at`. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(handoff): staff tickets with coalesced forwarding"`

> Khi làm (08/11) đã lệch bảy chỗ so với dòng Interfaces của T022 (`tasks.md:396`), ghi lý do tại đây:
> (1) `open(convId, reason, { chatId })` / `forward(convId)` nhận **`convId`**, không nhận `turn`: cửa gửi
> gọi `onTicket(convId, reason)` (`core/gate.js:68`) chứ không đưa lượt nào, và mọi khoá đã sang
> `conv_id` từ T037. Trong `open`, `chat_id` của phiếu **đọc từ `convs`** (`core/handoff-ticket.js:118`): trong
> nhóm `convId` là `g1:B` còn nơi gửi tin là `g1`, lấy nhầm thì phiếu ghi `chat_id = convId` và T025 trả
> lời vào một phòng không tồn tại. Hai test nhóm khoá chỗ này (gọi thẳng và qua `cap:chat` của cửa).
> (2) `createHandoff` **nhận `gate`** từ việc này (ghi chú (3) của T022 đã hẹn trước): phiếu là tin ra nên
> phải qua cửa duy nhất (Điều I). `server.js` dựng `handoff` sau `gate` và callback đọc biến lúc chạy.
> (3) Thêm `flushDue()` + bộ quét 5 giây trong `server.js`: **tin cuối** trong cửa sổ gộp không có lượt
> khách nào sau nó để đẩy đi, nên thiếu bộ quét thì tin đó không bao giờ tới nhóm nhân viên.
> (4) Thêm `Store.messages.khachSince(convId, sinceIso, limit)` và `Store.tickets.dueForward(beforeIso)`:
> gộp tin cần "tin khách sau mốc gộp cuối" và "phiếu đã hết cửa sổ". `khachSince` dùng `at > ?` nghiêm
> ngặt — tin đúng bằng mốc đã nằm trong phiếu trước, lấy lại là gửi trùng.
> (5) Thêm `vnStamp` vào `core/time.js`: phiếu hiển thị giờ VN cho người đọc, và phải không phụ thuộc
> TZ của máy (test chạy qua `UTC`, `Asia/Tokyo`, `America/New_York`). (Bản đầu thêm cả `vnClock` nhưng
> không chỗ nào trong mã gọi — mã chết, trái Điều VI; người soát bắt, đã bỏ.)
> (6) `open` **không đổi** trạng thái phòng. Cửa mở phiếu cả khi `cap:chat` (hoãn vì trần tin/ngày) — lúc
> đó bot vẫn được trả lời khách, chuyển sang `human` ở đây sẽ làm bot im sai. Chuyển phòng là việc của
> T026 (ý "gặp người") và T025 (`/nhan`, `/tl`).
> (7) Tệp mới `core/handoff-ticket.js` (ghi cả vào `plan.md:84`): gộp vào `core/handoff.js` thì tệp lên
> 320 dòng, quá hạn 300 của Điều VI (nay 272 dòng sau vòng soát 4). Hai trách nhiệm cũng khác nhau — trạng thái phòng KHÔNG gửi tin
> (ghi chú (3) của T022), phiếu thì gửi qua cửa. `createHandoff` vẫn là cửa vào duy nhất, chuyển tiếp
> `open`/`forward`/`flushDue` ra ngoài nên người gọi không thấy thay đổi gì.
> Che lời khách: `redact` + `findLeak` chạy **từng dòng** (`core/handoff-ticket.js:55`). Để cửa dò trên cả phiếu
> thì một dòng bẩn làm mất cả cái phiếu — Điều IX chặn được nhưng nhân viên không biết khách đang chờ
> (trái Điều II). Mọi khoảng trắng trong lời khách gộp về một dấu cách để khách không gõ được dòng
> "Lý do: …" giả vào phiếu.
>
> Người soát (08/11) trả về hai lỗi chặn thuộc **Điều VII** ("mọi bước gửi đều idempotent"), đã sửa kèm
> test đỏ cho từng lỗi, không sửa test cũ để cho qua:
> (a) **Thiếu cờ chống chạy chồng.** `server.js:99` gọi `flushDue()` trong `setInterval` 5 giây mà không
> nối await, còn `channel.sendText` chờ tới 40 giây (`channels/zalo-bot.js:73`). Mốc gộp chỉ dời sau khi
> cửa trả về, nên nhịp sau đọc lại **mốc cũ** và gộp lại đúng những tin đó: nhóm nhân viên nhận hai tin
> giống hệt. Khoá idem của tin gộp có mốc giờ nên mỗi lần một khoá, và `kind:'ticket'` thuộc
> NEVER_PROACTIVE nên lưới Jaccard của cửa cũng bị bỏ qua — không có lưới nào đỡ. Thêm hai cờ:
> `core/handoff-ticket.js:174` theo từng phiếu và `core/handoff-ticket.js:251` cho cả lượt quét, cùng
> cách với `gate.sweep` (`core/gate.js:178`) và `engine.drain` (`core/engine.js:153`). Hai cờ này chỉ
> bao ca chồng nhịp TRONG một tiến trình; ca tiến trình chết giữa lúc gửi là lỗ khác, thấy ở (c) dưới.
> (b) **Dời mốc gộp vô điều kiện** kể cả khi `guiPhieu` bắt lỗi: phần tin khách trong cửa sổ đó **mất
> hẳn** (`khachSince` lấy `at > mốc`), không ai thấy, không cảnh báo. Nay `guiPhieu` trả `{ xong, sent }`
> và `forward` chỉ dời mốc khi `xong` (`core/handoff-ticket.js:239`) — phân biệt với ca "chưa cấu hình
> nhóm" (cũng `sent === null` nhưng là đường hợp lệ, vẫn phải dời mốc, không thì bộ quét đọc lại cùng tin
> mỗi 5 giây). Mỗi cờ và nhánh đã được kiểm bằng cách tắt riêng từng cái: tắt cái nào thì đúng test của
> cái đó đỏ.
>
> Vòng soát 2 (08/11) trả về **cùng cơ chế mất tin, đường vào khác**: một tin gộp chỉ chở 20 tin
> (`FORWARD_MAX`) nhưng mốc vẫn dời tới GIỜ HIỆN TẠI, nên tin thứ 21 trở đi bị `khachSince` (`at > mốc`)
> loại vĩnh viễn — khách nhắn 30 tin sau khi bot nghỉ 3 giờ thì 10 tin không bao giờ tới nhóm, không
> cảnh báo. Nhánh này trước đó **không có test nào khoá**, dù gộp tin là phần cốt lõi của FR-012. Nay
> việc chọn tin và mốc mới tính cùng một chỗ (`cat` ở `core/handoff-ticket.js:155`): chưa tràn thì mốc là
> giờ hiện tại (giữ nhịp một tin nhóm / phiếu / 5 phút), tràn thì mốc chỉ dời tới **tin cuối được chở**,
> phiếu đến hạn ngay và nhịp quét sau chở tiếp phần dư.
> Thêm một ca mà bản vá một dòng chưa bao: `at` **không duy nhất** — khách bấm gửi liên tiếp thì nhiều
> tin trùng milli giây, nếu tin thứ 20 trùng mốc với tin bị cắt thì dời mốc tới đó loại luôn những tin
> cùng mốc. Vì vậy bỏ cả nhóm trùng mốc với tin đầu tiên bị cắt sang lần sau. Riêng ca hơn 20 tin trong
> CÙNG một milli giây thì không mốc nào tách được: chở 20 tin và **ghi log** để người vận hành thấy
> (`core/handoff-ticket.js:163`), không bỏ tin trong im lặng; cách chữa gốc là mốc theo `messages.id`,
> ghi ở `.van-phong/ghi-chu.md`. Engine xử lượt theo hàng chờ từng phòng nên ca này thực tế không xảy ra.
> Kèm theo, hai khẳng định sai trong lời bình đã sửa: phần dư quá 20 tin **không** phải "flushDue sẽ
> chuyển sau" một cách vô điều kiện (trước khi vá thì bị bỏ hẳn), và tiêu đề tin gộp nay ghi "còn nữa,
> gửi tiếp sau" cho đúng việc thật sự xảy ra. Ba nhánh mới cũng kiểm bằng cách đột biến riêng từng cái.
>
> Vòng soát 3 (08/11) trả về **một lỗi chặn Điều VII mà hai vòng trước bỏ sót**, cộng hai điểm ghi điểm
> đã sửa luôn:
> (c) **Tin gộp không idempotent qua KHỞI ĐỘNG LẠI.** Khoá idem lấy mốc MỚI (`nowIso()`) nên mỗi lần một
> khoá, còn mốc gộp chỉ dời ở bước cuối sau khi `channel.sendText` chờ tới 40 giây. Tiến trình chết trong
> khe đó thì nhịp quét của tiến trình mới đọc lại mốc cũ, gộp đúng những tin đó, và `kind:'ticket'` thuộc
> NEVER_PROACTIVE (`core/gate-decide.js:18`) nên cả lưới Jaccard cũng bỏ qua → nhóm nhận hai tin giống
> hệt. Hai cờ `dangGui`/`dangQuet` **chỉ sống trong một tiến trình** nên không bao được ca này — đúng ca
> Điều VII gọi tên (`.specify/memory/constitution.md:42`). Nay khoá tính từ **mốc gộp cũ** — thứ duy
> nhất giống nhau giữa lần gửi đầu và lần chạy lại — và khoá idem bền trong `outbox.idem_key`
> (UNIQUE, `core/store/schema.js:23`) nên sống qua khởi động lại. Vòng soát 4 cho thấy chỉ chặn gửi
> trùng là chưa đủ: khoá nay phủ **cả khoảng tin đã chở** và lần chạy lại đọc dòng outbox cũ chứ không
> gọi lại cửa, xem (f). Có test dựng đúng ca đó (cho `tickets.update` ném, rồi `gate.recover()` +
> `flushDue()`); trước đó **không test nào** khoá nhánh này.
> (d) Mốc mặc định khi `last_forward_at` NULL nay là `opened_at`, không phải chuỗi rỗng
> (`core/handoff-ticket.js:195`): `tickets.dueForward` cố tình coi NULL là đến hạn ngay
> (`core/store/state.js:66`), nên phiếu dựng tay (T025) sẽ quét cả lịch sử khách và gộp lại cả tin từ
> trước lúc mở phiếu.
> (e) Bộ đếm trần tin/ngày nay **không đếm tin nội bộ** `ticket` và `digest` (`core/store/queue.js:58`),
> cho cùng phạm vi với `CAPPED` của cửa (`core/gate-decide.js:106`): phiếu đi vào nhóm nhân viên, khách
> không nhận, nên không được trừ vào `CAP_ALL_DAY`. `staff_relay` vẫn đếm vì lời nhân viên tới chính
> khách. Hai test của T011/T037 dùng `kind:'ticket'` làm đồ chèn để chạm trần — fixture không thực tế,
> đã đổi sang `notice`, không đổi một khẳng định nào.
>
> Vòng soát 4 (08/11) trả về **vẫn cơ chế mất tin của (b) và vòng 2, vào bằng cửa thứ ba**, cộng một
> điểm ghi điểm:
> (f) **`guiPhieu` coi `drop`/`reject` của cửa là thành công**, nên `forward` dời mốc gộp dù không có gì
> đi ra. Hai đường thật: cửa `reject` vì lộ/tiền, hoặc cửa `drop` vì trùng nội dung — tin đó **không bao
> giờ** đi ra, mà mốc đã dời thì `khachSince` (`at > mốc`, `core/store/records.js:43`) loại vĩnh viễn
> phần tin khách trong cửa sổ đó, lại thêm không log. Nặng hơn: trên đường khởi động lại ở (c), cửa bỏ
> tin bằng `duplicate-idem` là **cố ý**, nhưng tập tin chở lại được tính lại lúc gửi, nên mọi tin khách
> đến giữa lúc chết và lúc quét lại cũng mất — TIN A tới nhóm trước khi chết, TIN B nhắn sau 30 giây thì
> soTin=2, mốc dời tới giờ hiện tại, TIN B không bao giờ tới nhóm.
> Lời bình ở (b) khẳng định "chỉ dời mốc khi cửa nhận tin", nhưng mã chỉ phân biệt "cửa **ném**" với
> "còn lại" — **khẳng định quá so với mã**. Nay vá hai lớp: `guiPhieu` chỉ trả `xong` khi
> `decision === 'send'` (hoặc `duplicate-idem`, là đường hợp lệ nghĩa là đúng tin này đã đi ra lần
> trước) và **ghi log** khi cửa bỏ phiếu (`core/handoff-ticket.js:104`); còn khoá idem của tin gộp nay
> phủ **đúng khoảng tin đã chở**: `p:<id>:f:<mốc cũ>:t:<mốc mới>`. Vì khoá chứa cả mốc mới, `forward`
> đọc dòng outbox của tiến trình trước bằng tiền tố (`core/handoff-ticket.js:219`) và dời mốc tới **đúng
> chỗ lần đó đã chở**, không tới giờ hiện tại, cũng không gửi lại; nhịp quét sau chở phần tin mới. Nếu
> chỉ kiểm `decision === 'send'` mà giữ khoá cũ thì mốc không bao giờ dời được và `dueForward` trả phiếu
> đó mãi — nên phải làm cả hai.
> (g) Để làm được (f) cần một hàm đọc mới `outbox.lastSentByIdemPrefix` (`core/store/queue.js:87`): dòng
> `decision = 'send'` mới nhất theo tiền tố khoá idem (`_`/`%` của LIKE được escape; dòng cửa đã bỏ
> không tính là đã làm). Có test tại chỗ định nghĩa (`test/core/store.test.mjs:169`) và ba test ca thật:
> khách nhắn tiếp sau khi chết (TIN B phải tới nhóm, TIN A không gửi hai lần), cửa trả `reject`, cửa trả
> `drop` — mỗi ca kiểm mốc **không** dời, có log, tin khách còn nguyên cho nhịp sau. Bốn đột biến, mỗi
> cái làm đỏ đúng test của nó.

### T025 [US2] Lệnh nhân viên

**Files:** Modify `core/handoff.js` · Create `test/core/handoff-cmd.test.mjs`

- [x] **Step 1: Test đỏ**
```js
test('/tl P3 Dạ em đây ạ → khách nhận đúng "Dạ em đây ạ" (kind staff_relay), phòng sang human', …)
test('/nhan P3 hai người → người đầu được, người sau nhận "P3 đã có <tên> nhận"', …)
test('/tra-bot P3 → phòng về bot, phiếu closed; bot không trả lời bù tin cũ', …)
test('/chan P3 → blocked; /cho → danh sách phiếu open + phút chờ', …)
test('lệnh từ người không thuộc STAFF_USERS hoặc ngoài STAFF_CHAT_ID → bỏ qua, audit staff-cmd:denied', …)
```
- [x] **Step 2:** FAIL · **Step 3:** viết. · **Step 4:** PASS · **Step 5:** `git commit -m "feat(handoff): staff commands"`

### T026 [US2] Cắm handoff vào engine

**Files:** Modify `core/engine.js` · Create `test/core/engine-handoff.test.mjs`

- [x] **Step 1: Test đỏ**
```js
test('phòng human: 10 tin khách → kênh nhận 0 tin tới khách, mcp.calls.length === 0, nhóm nhận 1 phiếu + ≤ 2 tin gộp', …)
test('"cho em gặp nhân viên" → khách nhận REPLY_HANDOFF, phòng human, phiếu mở', …)
test('"bạn là người hay máy" → khách nhận REPLY_IS_BOT, phòng vẫn bot', …)
test('nhóm khách: /tl vào conv g1:B gửi vào nhóm với @tên của B; chỉ conv B sang human, A vẫn được bot trả lời; /chan-nhom chặn cả nhóm', …)
test('gói trả handoff:{reason} → phòng human, phiếu mở với reason của gói', …)
```
- [x] **Step 2:** FAIL · **Step 3:** trong `process`: lệnh nhân viên → `handoff.command`; `stateOf ≠ bot` → `handoff.forward` rồi dừng; `asksIfBot` / `wantsHuman` trước `registry.pick`. · **Step 4:** `npm test` PASS · **Step 5:** `git commit -m "feat(core): human-first routing in engine"`

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

- [x] **Step 1: Test đỏ**
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
- [x] **Step 2:** FAIL · **Step 3:** SĐT: chuỗi 10 số bắt đầu `0[35789]` sau khi bỏ `.`/`-`/khoảng trắng, hoặc `+84`/`84` + 9 số; số liền khối 10 số mà khách đang ở gói hs thì không coi là SĐT nếu trùng định dạng mã HS (`firstHs8` khớp). · **Step 4:** PASS · **Step 5:** `git commit -m "feat(core): customer profile and rule-based labels"`

### T035 [US7] Cắm hồ sơ vào engine, phiếu và ctx gói

**Files:** Modify `core/engine.js`, `core/handoff.js`, `packs/hs/index.js` · Create `test/core/engine-customers.test.mjs`

- [x] **Step 1: Test đỏ**: khách dùng gói hs với "máy bơm ly tâm 1.5HP" → hồ sơ có nhãn `tra-cuu-hs`, interest `máy bơm ly tâm 1.5HP` kèm mã HS của lượt; khách xin người → nhãn `xin-nguoi` và phiếu trong nhóm có `summary()`; gói đọc được `ctx.history(5)` (5 tin, cũ → mới) và `ctx.customer.labels`; phòng `human` vẫn `touch` hồ sơ (đếm lượt) nhưng không gọi gói. Thêm 2 test nữa: mã HS về ở `onJobResult` (đường thật của gói 1) vẫn vào hồ sơ và KHÔNG đếm thêm lượt; hồ sơ trong phiếu che TỪNG DÒNG.
- [x] **Step 2:** FAIL (4 test đầu đỏ: `ctx.customer` null, hồ sơ không có nhãn) · **Step 3:** `engine` gọi `customers.touch(turn)` mỗi lượt (sau lệnh nhân viên + ALLOW, TRƯỚC nhánh phòng, nên phòng `human` vẫn đếm lượt và phiếu in `summary()` của chính lượt này), áp `labels`/`interests` từ kết quả gói qua `ganKetQua`; `core/handoff.js` dựng bản `createCustomers` riêng để phiếu mới kèm `summary()`. · **Step 4:** `npm test` 616/616 PASS, `npm run eval` 9/9, `kiem-wiki --nghiem` ĐẠT · **Step 5:** `git commit -m "feat(core): customer profile in engine, tickets and pack ctx"`
- Tệp ngoài danh sách **Files** ở trên, lý do ghi tại đây theo AGENTS.md: `packs/hs/index.js` KHÔNG cần sửa (`packs/hs/flow-turn.js` đã trả `labels`/`interests` từ T034); `core/engine-handoff.js` nhận `ganNhan` để gắn `xin-nguoi` TRƯỚC khi mở phiếu (gắn sau thì phiếu không in được lý do nó tồn tại); `core/handoff-ticket.js` thêm phần hồ sơ vào phiếu mới và che TỪNG DÒNG (trước đó dòng `Khách:` chỉ `redact`, một tên bẩn làm che CẢ phiếu — nhân viên không biết có khách chờ, trái Điều II); `core/jobs.js` thêm móc `ghiHoSo` vì gói 1 trả mã HS ở `onJobResult`, không phải trong lượt; `test/core/engine.test.mjs` đổi một khẳng định `ctx.customer === null` thành hồ sơ của lượt này (hành vi đổi có chủ đích, đã ghi lý do trong test).

### T036 [US7] Lệnh hồ sơ cho nhân viên + sao lưu

**Files:** Modify `core/handoff.js` · Create `core/backup.js`, `test/core/handoff-hoso.test.mjs`, `test/core/backup.test.mjs`

- [x] **Step 1: Test đỏ**: `/ho-so P1` → nhóm nhận hồ sơ + 20 tin gần nhất (giờ VN); `/gan P1 khoa-hoc` và `/go P1 khoa-hoc`; `/ghi P1 khách hẹn thứ 6` → `note`; `/xoa-du-lieu P1` → `messages` và `customers` của phòng = 0 dòng, audit có `erase` với người xoá, không có nội dung tin; `backup.run(now)` lúc 03:00 VN tạo `backup/bot-2026-11-05.db` mở được bằng `openStore`, chạy lại cùng ngày không tạo bản hai, giữ đúng 7 bản mới nhất.
- [x] **Step 2:** FAIL (`test/core/backup.test.mjs` không nạp được vì chưa có `core/backup.js`; `s.messages.deleteConv is not a function`; 19/22 test hồ sơ đỏ) · **Step 3:** viết; `backup` dùng `db.exec("VACUUM INTO '<path>'")`, bộ quét gọi mỗi phút, chạy khi `vnHour = 3` và `meta.last_backup_at` khác ngày. · **Step 4:** PASS — `npm test` 649/649, `npm run eval` 9/9, `node scripts/kiem-wiki.mjs --nghiem` → "wiki: ĐẠT (16 trang)" · **Step 5:** `git commit -m "feat(core): staff profile commands and daily backup"`
- Lệch so với **Files** và **Step 1/Step 3** ở trên, lý do ghi tại đây theo AGENTS.md:
  - Tệp mới ngoài danh sách: `core/handoff-hoso.js` (năm lệnh hồ sơ), `core/handoff-dong.js` (soạn dòng), `core/handoff-dich.js` (tra đích `P<n>`/`conv_id`). Lý do: `core/handoff.js` và `core/handoff-ticket.js` **đều đang 299 dòng**, sát trần 300 của Điều VI, nên không thể nhồi thêm; mà `/ho-so` phải dùng **đúng** luật che từng dòng của phiếu và **đúng** cách tra đích của `/tl`/`/nhan` — chép lại thì hai bản lệch nhau ở lần sửa sau. Tách xong: `core/handoff.js` 297 dòng, `core/handoff-ticket.js` 273 dòng (42 test cũ của phiếu vẫn xanh, không đổi hành vi).
  - Sửa thêm `core/store/records.js` + `test/core/store.test.mjs`: thêm `messages.deleteConv(convId)`. `messages.deleteChat` xoá theo `chat_id` nên trong nhóm nó xoá luôn tin của người ngồi cạnh — không dùng được cho `/xoa-du-lieu` (FR-030). `deleteChat` giữ lại cho việc dọn cả phòng.
  - Sửa thêm `core/store.js`: thêm `store.vacuumInto(path)` — store không mở `db` thô ra ngoài, nên đây là **một** đường duy nhất cho `core/backup.js` thay vì đưa handle db đi khắp nơi.
  - Sửa thêm `server.js` + `test/core/one-gate.test.mjs`: nối `createBackup` vào bộ quét nền. **Khác Step 3**: bộ quét gọi mỗi **5 giây** (nhịp đã có) chứ không thêm đồng hồ mỗi phút — `run()` tự bỏ qua khi chưa tới 03:00 giờ VN hoặc hôm nay đã sao, nên thêm đồng hồ thứ hai chỉ là thêm chỗ sai. Trần dòng `server.js` trong test nới 120 → 125 (một bộ phận nền = 3 dòng nối dây), lý do ghi trong chính test đó.
  - **Khác Step 3** ở cách gọi VACUUM: dùng `db.prepare('VACUUM INTO ?').run(path)` chứ **không** `db.exec("VACUUM INTO '<path>'")`. Nối đường dẫn vào chuỗi SQL thì một dấu nháy trong tên tệp thành câu SQL khác hẳn; tham số buộc không có lỗ đó.
  - **Khác Step 1** ở phạm vi xoá: xoá theo **người** (`conv_id`), không phải "của phòng". Trong nhóm, `/xoa-du-lieu` của một người không được xoá dữ liệu của người khác — đã khoá bằng test nhóm hai người A/B. `inbox`/`outbox` khoá theo `update_key`/`chat_id` nên không xoá theo người được; giữ nguyên (ghi ở `.van-phong/ghi-chu.md`).

---

## Phase 7: User Story 5: Vận hành nhìn thấy được (P2)

### T027 [US5] `/health` và `/metrics`

**Files:** Create `core/ops.js`, `test/core/ops.test.mjs` · Modify `server.js`

**Interfaces — Produces:** `health() -> {ok, db, mcp:{tools}, zalo, staff, inboxPending}` · `metrics(sinceIso) -> {turns, gate:{send,drop,defer,reject,byReason}, tickets:{open}, jobs:{waiting}}`

- [x] **Step 1: Test đỏ**: sau 3 lượt (1 send, 1 drop similar, 1 reject leak) → `metrics().gate.byReason` có `similar`, `leak:path`; db đóng → `health().ok === false` và HTTP 503.
- [x] **Step 2:** FAIL (viết test đỏ trước, thấy đỏ rồi mới viết code).
- [x] **Step 3:** tệp mới `core/ops.js` — `createOps` trả `{health, metrics}`; `health()` đo db bằng `store.ping()`, hỏi Cổng OZ và Zalo **song song** với mốc chặn 2,5 s (để `/health` luôn nằm trong 5 s của `HEALTHCHECK`), `ok` chỉ phụ thuộc db; `metrics()` đếm bằng SQL: `turns` đếm từ bảng `inbox` (lý do: `audit` ghi bản ghi `inbound` **sau** các nhánh chặn sớm của lõi nên bỏ sót lượt mà bot đã gửi tin), quyết định cửa đếm từ `outbox` (một tin = một dòng, quyết định cuối) cộng bù hai lý do chặn sớm không tạo dòng outbox (`empty`, `duplicate-idem`) từ `audit`; thêm index `received_at` cho `inbox`, `created_at` cho `outbox`, `(type, at)` cho `audit`.
- [x] **Step 4:** PASS — `npm test` 448/448, `npm run eval` 9/9, `node scripts/kiem-wiki.mjs --nghiem` → "wiki: ĐẠT (16 trang)".
- [ ] **Step 5:** `git commit -m "feat(ops): health and metrics"`

### T028 [US5] Bản tin gộp 08:00 và 17:00 giờ VN

**Files:** Modify `core/ops.js` · Create `test/core/digest.test.mjs`

- [x] **Step 1: Test đỏ**: đồng hồ giả chạy từ 07:59 tới 08:01 VN, sweep mỗi phút → nhóm nhận đúng 1 tin `kind:'digest'` (idem `d:2026-11-05:08`); có số lượt, lỗi, tin bị chặn theo lý do, phiếu chờ > 15 phút; khởi động lại lúc 08:00:30 không gửi lần hai.
- [x] **Step 2:** FAIL
- [x] **Step 3:** viết; idem bảo đảm một lần.
- [x] **Step 4:** PASS
- [x] **Step 5:** `git commit -m "feat(ops): twice-daily staff digest"`

### T029 [US5] [P] `npm run audit`

**Files:** Create `scripts/audit.mjs`, `test/core/audit-cli.test.mjs`

- [x] **Step 1: Test đỏ**: chạy `node scripts/audit.mjs --db <tmp> --turn m1` (child_process) → stdout có các dòng `inbound`, `route hs`, `gate send ok`, `outbound` theo giờ VN; `--chat c1 --limit 5` in ≤ 5 lượt.
- [x] **Step 2:** FAIL
- [x] **Step 3:** viết.
- [x] **Step 4:** PASS
- [x] **Step 5:** `git commit -m "feat(ops): audit CLI"`

---

## Phase 8: User Story 6: Kiểm trước khi bật (P3)

### T030 [US6] `eval/run.mjs` + 9 kịch bản

**Files:** Create `eval/run.mjs`, `eval/README.md`, `eval/fixtures/{retry-webhook,double-tap,human-room,silent-customer,leak,is-bot,restart-mid-job,quiet-hours,ho-so-khach}.jsonl`

Định dạng một dòng fixture:
`{"step":"in","update":{…}} | {"step":"mcp","tool":"phan_loai_hs","returns":[…]} | {"step":"advance","by":"10m"} | {"step":"restart"} | {"step":"staff","text":"/nhan P1"} | {"step":"expect","sentTo":"c1","count":1,"match":"8413"}`

> Làm một phần ngày 06/11/2026 (nhánh `009-agent-tra-cuu`, theo yêu cầu chủ repo để mở được PR): bộ chạy + 7 kịch bản
> cho tính năng đã có (`retry-webhook`, `double-tap`, `silent-customer`, `leak`, `restart-mid-job`, `quiet-hours`, `cong-ai-ban`).
> Còn `human-room`, `is-bot`, `ho-so-khach` chờ T022–T026, T033–T036 — xem `eval/README.md`.

- [x] **Step 1: Test đỏ**: `node eval/run.mjs` với thư mục rỗng → in `eval: 0/0` và thoát 0; với fixture cố ý sai (`count: 2` cho `retry-webhook`) → thoát 1 và in tên kịch bản.
- [x] **Step 2:** FAIL · **Step 3:** `run.mjs` dựng engine thật trên `:memory:` (restart = đóng engine, mở lại cùng tệp tạm) với `fakeChannel`, `fakeMcp`, `fakeClock`; viết 9 fixture: 8 cái ứng với các dòng trong `research.md` §1 (#1, #2, #4, #5, #7, #9, #11, #12) và `ho-so-khach` (US7). · **Step 4:** `npm run eval` → `eval: 9/9` (thực tế 12/12 kịch bản đạt) · **Step 5:** `git commit -m "feat(eval): replay runner and incident fixtures"`

### T031 [US6] [P] CI

**Files:** Create `.github/workflows/ci.yml`

- [ ] **Step 1:** workflow `node-version: 22`, chạy `npm test` rồi `npm run eval` cho mọi PR và push lên `main`.
- [ ] **Step 2:** đẩy nhánh, CI xanh trên PR. · **Step 3:** `git commit -m "ci: test and eval gate"`

---

## Phase 9: Polish

### T032 Tài liệu và kiểm tay

**Files:** Modify `README.md`, `.env.example` · Verify `specs/001-nen-tang-chung/quickstart.md`

- [x] **Step 1:** README: mô hình lõi / gói / kênh; lệnh nhân viên; biến môi trường mới; cách thêm gói (trỏ `contracts/pack.md`).
- [x] **Step 2:** Chạy đủ `quickstart.md` mục 1–6 trên máy thật, ghi kết quả vào mô tả PR.
- [ ] **Step 3:** `git commit -m "docs: core platform usage"`

---

## Phase 10: Nới luật chống trùng (issue #55)

### T039 [US1] Cửa sổ chống trùng tách theo loại tin

**Files:** Modify `core/gate-decide.js`, `core/gate.js`, `core/store/queue.js`, `core/jobs.js` · Modify `test/core/gate-decide.test.mjs`, `test/core/gate-send.test.mjs`, `test/core/store.test.mjs`, `test/core/conv.test.mjs`, `test/core/engine.test.mjs`

**Interfaces — Produces:** `DEFAULT_RULES.dupDirectMs = 60_000` và `DEFAULT_RULES.dupWindowMs = 900_000` · hàm riêng `isDirectReply(msg, nowMs, rules)` (không phải `isProactive` của bước 3a) trong `core/gate-decide.js` · `Store.outbox.recentBotMsgs(convId, sinceIso, limit) -> [{ text, at }]` (thay `recentBotTexts` → `string[]`) · `job_result` mang `inReplyToAt` = mốc tin khách của lượt (`context.receivedAt` của dòng `jobs`)

- [x] **Step 1: Test đỏ**: `test/core/gate-decide.test.mjs` — trùng chữ sau 20 giây (trả lời trực tiếp) → `drop similar`; trùng chữ sau 3 phút (trả lời trực tiếp) → `send`; tin chủ động trùng sau 3 phút → `drop`; tin chủ động trùng sau 16 phút → `send`; chuỗi trần không mốc → `drop` (tương thích ngược); mốc không đọc được (`null`/`'hom qua'`/`undefined`) → `drop`; `job_result` có mốc tin khách 3 phút → `send`; `job_result` không mốc → `drop`; `job_result` có mốc nhưng không nợ việc nền → `reject proactive-no-debt`; `job_result` có mốc, có nợ, trong giờ yên → `defer quiet-hours`; hai câu khác nhau trong 20 giây → `send`. `test/core/gate-send.test.mjs` — khách bấm gửi hai lần trong 20 giây → chỉ 1 tin ra; khách hỏi lại sau 3 phút → 2 tin ra; ba mã khác nhau liên tiếp → 3 tin ra; tin chủ động giống tin vừa gửi trong 15 phút → `drop`. `test/core/store.test.mjs` + `test/core/conv.test.mjs` — `recentBotMsgs` trả `[{ text, at }]`. `test/core/engine.test.mjs` — khách hỏi lại đúng câu sau 3 phút trên đường việc nền → nhận kết quả thứ hai.
- [x] **Step 2:** FAIL (bản cũ bỏ tin trùng trong 15 phút bất kể loại tin → khách hỏi lại không được trả lời).
- [x] **Step 3:** `core/gate-decide.js` thêm `dupDirectMs`/`dupWindowMs` và hàm `isDirectReply`; bước chống trùng chọn cửa sổ theo `isDirectReply` (60 giây cho trả lời trực tiếp, 15 phút cho chủ động), tin không có mốc đọc được thì coi như trong cửa sổ; `core/store/queue.js` đổi `recentBotTexts` → `recentBotMsgs` (kèm `sent_at`); `core/gate.js` đọc theo cửa sổ dài 15 phút rồi `decide` tự lọc; `core/engine-jobs.js` ghi `receivedAt` vào `context` của dòng `jobs` và truyền `inReplyToAt` khi gửi `job_result` (dòng cũ không có → `null`). `job_result` vẫn luôn chịu luật `proactive-no-debt` và luật giờ yên như trước.
- [x] **Step 4:** PASS — `npm test` xanh.
- [ ] **Step 5:** `git commit -m "feat(gate): split duplicate window by message kind"`

---

## Dependencies & Execution Order

- T001 → T002 → (T003, T004, T005, T007 song song) → T006 → T008 → T009 → T010
- T011 → T012 → T013 → T014 → T015 → T016 → T017
- T018 cần T016; T019 song song; T020 cần T018 + T019; T021 cần T015
- T022 → T023 (song song được) → T024 → T025 → T026 (cần T015)
- T033 cần T026; T034 song song; T035 cần T033 + T034; T036 cần T035
- T027 → T028; T029 song song; T030 cần T026 + T021 + T035; T031 sau T030
- T032 cuối cùng
- T039 đánh số sau T038; đã code xong 07/11/2026 (issue #55), chờ commit

**MVP an toàn để bật lại cho khách** = xong Phase 1–6b (T001–T026, T033–T036): cửa gửi, gói hs trên lõi, bền vững, người cầm phòng, lịch sử và hồ sơ khách.

**Thứ tự chạy thật**: T001–T015 → **T037–T038** → T016–T026 → T033–T036 → T027–T032 (số hiệu T033–T036 thêm sau buổi hỏi đáp 04/11, nên đứng sau T032 trong bảng số).
