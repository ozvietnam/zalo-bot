# T015 report: core/engine.js

**Status:** DONE. Commit `f34e805 feat(core): engine turn pipeline`, on branch 001-nen-tang-chung, not pushed.
Two of my test edits (gate-decide +6, store +2) went into the controller's `b171792` by accident. The controller confirmed this; history was not rewritten.

## Interface as implemented

```js
// core/engine.js
createEngine({ config, store, channel, mcp, vision, registry, gate, now, log, advance? })
  -> { process(update) -> Promise<{handled|skipped, turnId, pack?}>, drain() -> Promise<void>, tools() -> Promise<Set|null> }
export sessionKeyOf(u, group), NON_TEXT_TEXT, RATE_LIMIT_TEXT, GENERIC_ERROR_TEXT
// config: sessionTtlMs (7_200_000), rateLimitPerMin (10), allowUsers, staffUsers (Set|array), botNames
// advance(ms): optional, virtual clock only; drain() jumps to store.jobs.nextDue() instead of stopping

// core/engine-compat.js
createBot({ zalo, mcp, vision, log, rateLimitPerMin, allowUsers, botNames, sessionTtlMs, pollMs })
  -> { handleUpdate(raw), tools, drain, PACKAGES, engine, store }
LEGACY_RULES = { capChatDay: 1e9, capAllDay: 1e9, similarity: 2, quietHours: false }

// core/engine-ctx.js:  createToolCache, auditedMcp, sessionApi {get,set,touch}, buildCtx
// core/engine-jobs.js: jobRow, pollDueJobs (inline T015 poller; T021 -> core/jobs.js)
// core/mention.js:     stripMention, isGroup (moved from lib/bot.js)
```

`process` order: parse if there is no `updateKey` → `no-chat` → dedupe (inbox.get / insertIgnore; a done or failed row means `duplicate`) → `chats.upsertSeen` → ALLOW → non-text check → rate limit → strip mention from text and caption (empty after strip → `skipped:'empty'`) → audit `inbound` (sha1 plus 500 redacted chars) → session touch → read the last message, then write the customer's message to `messages` → closer rule → buildCtx → `registry.pick` → audit `route` → typing (fire and forget) → `pack.handle` → `gate.send` per reply (`r:<chat>:<turn>:<i>`, evidence = pack evidence + text + caption) → `jobs.add` (+6 s / +30 min) → audit `outbound` → `inbox.markDone`. Any error after the turn is built sends `GENERIC_ERROR_TEXT + footer` (the picked pack's footer, else the hs footer), writes a redacted audit `error`, and calls `markFailed`.

`drain()` loops `pollDueJobs` + `gate.sweep()` until a pass does no work. With `advance`, it then jumps the clock to the next due job. A guard stops it after 10,000 loops.

## Parity: lib/bot.js → new location

| lib/bot.js behavior | Now |
|---|---|
| `isGroup`, `stripMention` | `core/mention.js` (engine strips both text **and caption**) |
| `dedupe(messageId)` (in-memory) | `store.inbox` with key = updateKey (sha1 when there is no message_id) in `engine.process` |
| ALLOW_USERS (user or chat) | `engine.process`, `config.allowUsers` |
| non-text: reply in 1-1, skip in groups | `engine.process` → `NON_TEXT_TEXT` via gate (kind notice) |
| rate limit per minute, same text, silent in groups | `engine.limited`, in-memory, injected clock |
| `sessionOf` TTL 2 h, sliding | `sessionApi.touch()` each turn + `store.sessions` TTL |
| session key `chat` / `chat:user` | `sessionKeyOf` in engine.js |
| `@userName\n` prefix in groups | `addressOf` in engine.js (replies **and** job results; userName kept in the job context) |
| `sendChatAction typing` | `channel.typing` before `pack.handle` |
| `tools()` 10-min cache, null on error | `createToolCache` (engine-ctx.js) |
| photo / text / menu / route / packages | `packs/hs` (T014) |
| footer appended to every reply | pack embeds its own footer; core appends `pack.footer` only to the generic error |
| generic error "Cổng … lỗi tạm thời (msg)" | `GENERIC_ERROR_TEXT` **without the raw message** (constitution IX) + footer |
| in-turn `waitJob` with `pollMs` | `jobs` table + `pollDueJobs` + `drain()`; backoff 6→12→24→48→60 s; expiry at 30 min → `onJobResult(job,null)` |
| `notify` (⏳) then final reply | ⏳ is reply 0 of the turn; the result is `job_result` with `j:<chat>:<maLuot>` |

## Edits to test/test.mjs (all of them)
1. `import { createBot, stripMention, isGroup } from '../lib/bot.js'` → `import { createBot } from '../core/engine-compat.js'` + `import { stripMention, isGroup } from '../core/mention.js'`.
2. `await bot.drain();` after the `d1` handleUpdate (gói 1 background job test).
3. `await bot.drain();` after the `r2` handleUpdate (CAN_DU_KIEN test).

These are the only edits. Without the two `drain()` lines, the suite fails at the gói 1 test (`TypeError: Cannot read properties of undefined (reading '1')`).

## Other edits
- `core/gate-decide.js`: `DEFAULT_RULES.quietHours: true`; rule 3b is skipped when `rules.quietHours === false`. Test in gate-decide.test.mjs (landed in b171792).
- `core/store/queue.js`: `jobs.nextDue()` (MIN next_poll_at of waiting jobs). Test in store.test.mjs (landed in b171792).
- `channels/zalo-bot.js`: `parse` is now a top-level export; the `createChannel` behavior is unchanged. The compat channel reuses it.
- `package.json`: added `--disable-warning=ExperimentalWarning` to `node test/test.mjs`. test.mjs now loads node:sqlite through the engine, and without the flag the output was not pristine.
- `plan.md`: added the new files and why they exist (AGENTS.md rule).

## TDD
RED, before engine.js existed:
```
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/claude/zalo-bot/core/engine.js'
not ok 1 - test/core/engine.test.mjs
not ok 7 - 3b rules.quietHours=false tắt giờ yên ...   AssertionError
not ok 37 - jobs                                       TypeError (nextDue)
# pass 41  # fail 3
```
GREEN, full `npm test` (exit 0, no warnings or stray logs):
```
# tests 136
# pass 136
# fail 0
21 test đạt
```
`npm run eval`: fails with MODULE_NOT_FOUND because `eval/run.mjs` does not exist yet (later task). This happened before T015 too.

engine.test.mjs, 13 tests:
- the brief's 5 cases
- "ok" during choXacNhanAnh still reaches the pack
- footer appears exactly once (gói 2 chọn, "0" tự động, generic error)
- mention stripped from text and caption
- session TTL, group `chat:user` key, `@tên` prefix, typing
- inbox dedupe, including a row the server already wrote as pending
- non-text: reply in 1-1, silent in groups
- ctx: messages / history / customer / tools / audit `tool`
- drain: 6 s / 12 s backoff, `j:` idem, expiry

## Files
New: `core/engine.js` (154 lines), `core/engine-ctx.js` (75), `core/engine-jobs.js` (73), `core/engine-compat.js` (38), `core/mention.js` (19), `test/core/engine.test.mjs`.
Modified: `core/gate-decide.js`, `core/store/queue.js`, `channels/zalo-bot.js`, `package.json`, `test/test.mjs`, `specs/001-nen-tang-chung/plan.md`.
Not touched: `server.js`, `lib/bot.js`.

## Places keyed by chatId (for T037 → conv_id)
- `sessionKeyOf` (engine.js): already `chat:user` in groups, which is the future convId value.
- Outbox idem keys: `r:${chatId}:${turnId}:${i}` (engine.js `reply`) and `j:${chatId}:${maLuot}` (engine-jobs.js).
- `gate.send({ chatId })`, so gate facts (cap, similar, hasOpenJob, chatState) are per chat.
- `store.messages.add/recent(chatId)`: the inbound write, `ctx.history`, and **the closer rule's "last message is from the bot"**. In a group, that check sees other users' turns.
- `store.customers.get(chatId)` (ctx.customer).
- `jobs.chat_id` (jobRow) plus `jobs.openFor(chatId)` inside the gate.
- Audit `chat_id` on all rows. `chats.upsertSeen(chatId)` stays at room level, which is correct.
- The rate limit is keyed by `userId || chatId`, so it is already per person.

## Concerns
1. **Generic error text differs from lib/bot.js.** The raw `(e.message)` is dropped, as required by constitution IX and the brief's test. The hs pack's own `textFlow` catch still echoes `String(e.message).slice(0,120)` to the customer (e.g. "MCP lỗi HTTP 502"), and the legacy test only checks `/lỗi tạm thời/`. Recommend fixing this in the hs pack (separate task).
2. **Expired job text says "4 phút".** The hs `hetHan(maLuot)` default text says "Chưa có kết quả sau 4 phút", but the core TTL is 30 min. This is pack wording, for T021.
3. Core-authored NON_TEXT and RATE_LIMIT texts carry **no footer**, as in lib/bot.js. Only the generic error gets one. The footer-once test covers pack replies and the generic error.
4. The closer audit uses `type: 'outbound'` with `data.skipped = 'closer'`, because the data-model audit enum has no `skipped` type.
5. `pollDueJobs`: a transient callTool or gate error reschedules with backoff. A missing `onJobResult`, or an error after expiry, sets the job to `failed` with no customer message. That case is not tested; T021 owns it.
6. The rate limit and non-text checks happen before the inbound audit and the `messages` write, so rate-limited and non-text turns leave no `messages` row (same as legacy: no processing).
7. `createBot` ignores `pollMs`; the virtual clock (Date.now + offset) replaces it. Legacy turns use real time plus the offset, so they work at any hour (quiet hours are off).

---

# Fix round 1 (review T015-review.md): commit `45af857`

## Rulings → what changed
| # | Item | Change | Test (written RED first) |
|---|---|---|---|
| 1 | C1 in-flight duplicates | inbox gets status `processing` and a `claimed_at` column. `store.inbox.claim(key, at)` = `UPDATE … SET status='processing', claimed_at=? WHERE update_key=? AND status='pending'` → `changes===1`. The engine runs insert-if-absent + claim inside one `store.tx`, and only the caller that gets true runs the pack. Recovery of stale `processing` rows is left for T020. | store: `inbox.claim …`; engine: `cùng updateKey hai lượt chạy song song …` (Promise.all → handle 1×, 1 reply, 1 job, 1 khach message) |
| 2 | I1 raw errors (hs) | `index.js` text and photo catches now send fixed sentences, and `e.message` goes only to `ctx.log`. `packages.js:137,218` catches return `{ok:false, loi:'CONG_KHONG_TRA_LOI'}`; the raw detail is already in the core's audit `tool` row, redacted. `render.js renderError` prints the fixed `LOI_CONG` sentence; only `thongBaoKhach` (text the pack writes itself, set by `hetHan`) is shown verbatim, and `loi`/`thongBao` only select the fixed hint lines (account, points, refund). M5: `ctx.log` is now `redactedLog(log)` in buildCtx, so the pack's log lines are masked without the pack importing core. | hs: 3 tests (generic text without 502, log has the detail; photo / gói 2 thủ tục / gói 5 / Cổng ok:false without ECONNREFUSED, IP, HTTP 404; expiry text) |
| 3 | I3 concurrent drain | `drain()` has a `draining` guard, so a second call returns at once. `store.jobs.claim(id)` = `waiting → polling` before each poll, then back to `waiting` (still DANG_XU_LY or a transient error) or `done`/`expired`/`failed`. `jobs.openFor` counts `polling` as debt, so job_result still passes gate rule 3a. | store: `jobs.claim …`; engine: `hai drain() chồng nhau …` (poll 1×, onJobResult 1×) |
| 4 | I4 compat test-only | `git mv core/engine-compat.js test/helpers/legacy-bot.mjs`. I took the "move" option, so NODE_ENV is not needed and `package.json` is unchanged. plan.md is updated. | engine: `createBot cũ chỉ cho test …` (core file absent, helper present, server.js does not reference it) |
| 5 | I2 error idem | generic error uses `r:<chat>:<turn>:err` | engine: `câu báo lỗi chung có khoá riêng …` (reply 0 sent + job without resultTool → customer gets both) |

## Minor items
| Item | Status |
|---|---|
| M1 pre-pack steps outside try | **Fixed.** Everything from the inbound audit to the closer rule is now inside the try. Inside the catch, the error audit, the generic reply and `markFailed` each have their own try, so a broken db still sends the generic reply. Test: `lỗi trước khi gọi gói …`. The steps before the turn exists (upsertSeen, allow, rate limit) are still outside; a throw there leaves the row `processing`, and T020 recovery handles it. |
| M5 unredacted pack logs | **Fixed** with `redactedLog` (see 2). Test: `no-chat … ctx.log đã che bí mật`. |
| M6 no-chat turnId | **Fixed:** returns `{ skipped:'no-chat', turnId:null }`. Same test. |
| M7 "4 phút" | **Fixed:** `onJobResult` calls `hetHan(maLuot, 30 min)`. Test: `việc nền hết hạn …`. |
| M8 closer audit type | **Documented** in data-model.md (audit `type` row). |
| M2 room-level closer in groups | Deferred to T037 (conv_id); already on its list. |
| M3 failed jobs tell nobody | Deferred to T021 (needs the onAlert/ticket hook from handoff). |
| M4 phone numbers in redact | Not done. A VN phone pattern (`0\d{9}`) collides with 10-digit HS codes (e.g. `0101210000`), so the T005/redact owner needs to choose the shape. Over 5 minutes. |

## Edits to test files (beyond the new tests)
- `test/test.mjs`:
  - import `createBot` from `./helpers/legacy-bot.mjs` instead of `../core/engine-compat.js`;
  - in the render test, `/Hệ thống tra cứu HS gặp lỗi/` → `/Cổng tra cứu gặp lỗi/`, and doesNotMatch extended to `/EN:|HTTP 404/`;
  - "Cổng mất kết nối" test: added `assert.doesNotMatch(zalo.sent[1][1], /MCP lỗi HTTP 502/)`.
- `packs/hs/test/hs.test.mjs`: the "Cổng lỗi" test asserted the old parenthetical `(MCP lỗi HTTP 502)`. It now asserts the fixed sentence, that 502 is absent, and that the log has the detail.
- Also modified: `core/store/schema.js` (`inbox.claimed_at`), `data-model.md` (inbox/jobs statuses, closer audit).

## Real output
RED (before the fix; engine + store + hs test files):
```
not ok 12 - Cổng lỗi → câu báo lỗi tạm thời + menu, không ném, không kèm lỗi gốc (Hiến pháp IX)
not ok 13 - lỗi gốc không lọt ra khách: ảnh lỗi, thủ tục lỗi (gói 2), gói 5 lỗi, kết quả Cổng ok:false
not ok 14 - việc nền hết hạn: câu "30 phút" + cách hỏi lại "kết quả <mã lượt>" vẫn hiện
not ok 28 - cùng updateKey hai lượt chạy song song → gói chạy đúng 1 lần, 1 bộ trả lời, 1 việc nền (inbox.claim)
not ok 29 - câu báo lỗi chung có khoá riêng r:<chat>:<turn>:err → vẫn tới khách khi reply 0 đã gửi
not ok 30 - lỗi trước khi gọi gói (ghi messages hỏng) → vẫn câu báo chung + inbox failed, không treo pending
not ok 31 - hai drain() chồng nhau → hỏi Cổng 1 lần, onJobResult 1 lần
not ok 32 - createBot cũ chỉ cho test: nằm ở test/helpers, lõi và server.js không dùng
not ok 33 - no-chat vẫn trả turnId (null); ctx.log đã che bí mật
not ok 36 - inbox.claim: pending → processing đúng một lần (claimed_at), pending() bỏ dòng processing
not ok 37 - jobs.claim: waiting → polling đúng một lần; polling vẫn là nợ (openFor), không due
# pass 43
# fail 11
```
GREEN, full `npm test` (exit 0, no warnings or stray logs):
```
883:# tests 146
885:# pass 146
886:# fail 0
913:21 test đạt
```
Reviewer probes re-run against 45af857:
```
(b) results [{"handled":"p","pack":"p","turnId":"X"},{"skipped":"duplicate","turnId":"X"}] handle runs 1 mcp start calls 1 sent [ '⏳ chờ L1' ] jobs waiting yes
(d) polls 1 onJobResult calls 1 sent [ '⏳', 'Xong ok' ]
(d2) onJobResult calls 1 sent [ '⏳', 'Hết hạn' ]
(err) result {"handled":"error","turnId":"E"} sent [
  'phần 1',
  '⚠️ Cổng tra cứu OZ đang lỗi tạm thời. Bạn thử lại sau ít phút nhé.\n\nMENU'
]
sent [ '⏳ chờ', 'Kết quả L1' ] msgs khach 1
```

## New concerns
1. `renderError` now hides **every** Cổng `thongBao`, including useful ones such as "mã không tồn tại". This is per the ruling. If the Cổng guarantees customer-safe text, it should send it as a separate field the pack can whitelist (like `thongBaoKhach`).
2. `render.js:164` (`top.thongBao` when the classify state is `LOI`) and `:199` still print Cổng text. These were outside the ruling's lines; same decision needed.
3. Stuck states: `processing` inbox rows and `polling` job rows are left behind if the process dies mid-step, or if `buildCtx` throws in the poller before its try. T020 and T021 must recover both (5-min rule).
4. Docs commit `90141c8` (controller) landed between my two commits. It touched no files of mine.

---

# Fix round 2 (Cổng business messages): commit `1d4ea55`

## Rule as implemented (`packs/hs/render.js`)
- `businessText(s)`: drops the ` | EN:` tail, then returns the text only if `findLeak(t)` is null **and** `SYS_TEXT` does not match. Otherwise it returns null.
  - `SYS_TEXT` matches `HTTP `, `MCP `, `JSON-RPC`, `ECONN*`/`ETIMEDOUT`/`ENOTFOUND`/`EAI_AGAIN`/`EPIPE`, `fetch failed`, `socket hang up`, `at x (`, and `file.(m)js|cjs|ts|py:<line>`.
- `renderError(r)` shows:
  - `thongBaoKhach` (text the pack writes itself) verbatim;
  - else, if `!r.transport`: `businessText(thongBao || text)`;
  - else: the fixed `LOI_CONG` sentence.
  - The account, points and refund hint lines are unchanged.
- Line 164 (classify `trangThai: 'LOI'`) and line 199 (no result) use `businessText(top.thongBao) || <fixed default>`.
- Transport errors:
  - exceptions caught in `packages.js:137,218` return `{ ok:false, loi:'CONG_KHONG_TRA_LOI', transport:true }`, so the customer always gets the fixed sentence;
  - in `index.js`, thrown errors in the text and photo flows already send fixed sentences (round 1);
  - JSON-RPC errors throw in the MCP client, so they take the same path.
  The detail goes to the core's redacted audit `tool` row and to `ctx.log`.
- `ERR` fixture (`… gặp lỗi (HTTP 404)`): it contains `HTTP `, so it stays hidden. The existing round-1 assertions still hold, and no legacy test changed in this round.
- Deviation: `packs/hs/render.js` imports `findLeak` from `core/redact.js`, breaking the "packs import only core/types.js" rule. I recorded the reason in plan.md: one leak detector shared with the gate, not a drifting copy.

## Test (new, `packs/hs/test/hs.test.mjs`)
`lỗi nghiệp vụ của Cổng … vẫn hiện; lỗi truyền tải và chữ lộ nội bộ thì ẩn`:
- shown: `ok:false` with "Mã 99999999 không tồn tại trong biểu thuế";
- hidden: a thrown "MCP lỗi HTTP 502" (the reply uses the fixed sentence instead);
- hidden: `ok:false` with ".../app/core/x.js:12:3";
- classify LOI with a business text is shown, while classify LOI with "MCP lỗi HTTP 500 at handler (/app/x.js:1:2)" is hidden;
- `XONG` with "fetch failed ECONNREFUSED 10.0.0.7:3000" is hidden.

## Real output
RED:
```
87:not ok 15 - lỗi nghiệp vụ của Cổng (gọi thành công, ok:false) vẫn hiện; lỗi truyền tải và chữ lộ nội bộ thì ẩn
123:    TestContext.<anonymous> (file:///home/claude/zalo-bot/packs/hs/test/hs.test.mjs:203:10)
130:# pass 14
131:# fail 1
```
GREEN, full `npm test` (exit 0):
```
889:# tests 147
891:# pass 147
892:# fail 0
919:21 test đạt
```

## Concerns
- `SYS_TEXT` is a heuristic. A business sentence that really contains "HTTP " (e.g. a document title) would be hidden. That fails safe.
- Successful results rendered by `renderGeneric` (e.g. a `text` field on `ok:true`) are business content and are not filtered here; the gate's `findLeak` still applies at send time.
