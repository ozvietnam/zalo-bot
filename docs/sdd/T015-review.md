# T015 review: core/engine.js (+ engine-ctx, engine-jobs, engine-compat, mention)

Scope: diff 52ebb90..f34e805 plus the test edits swept into b171792 (gate-decide +6, store +2).
I verified this read-only: I read the code, ran `npm test` (136/136 pass, 21 legacy tests pass), and ran two throwaway probe scripts
in the scratchpad (`probe/probe.mjs`, `probe/probe2.mjs`) to check risks (b), (d) and the error path empirically.

## Part 1: spec compliance ❌ (one item missing; everything else matches)

| Requirement | Result |
|---|---|
| `createEngine({config,store,channel,mcp,vision,registry,gate,now,log}) -> {process, drain}` | ✅ (plus optional `advance` and `tools`; reasonable additions) |
| `createBot(opts)` keeps the legacy signature on `openStore(':memory:')` | ✅ `core/engine-compat.js:27` |
| Order: upsertSeen → pick → handle → gate.send per reply → jobs.add → inbox.markDone | ✅ `core/engine.js:69-124` |
| Footer: the pack embeds its own; core adds it only to the generic error (controller ruling, 52ebb90) | ✅ |
| `drain()` = jobs tick + gate.sweep until no work is due | ✅ `core/engine.js:141-151` |
| The brief's 5 tests (audit chain, `r:<chat>:<turn>:i`, closer, generic error with redacted audit, ALLOW + rate limit) | ✅ `test/core/engine.test.mjs:46-125` |
| test.mjs edits limited to the import swap + 2× `await bot.drain()` | ✅ |
| Files under 300 lines, no new dependency, ISO UTC times, commit message | ✅ |
| Constitution I: only `core/gate.js` calls `channel.sendText` | ✅ (grep: only gate.js:64; the compat channel only wraps it) |
| Constitution VII + the controller's dedupe requirement "same updateKey twice → one set of replies, **including while the first is in flight**" | ❌ See C1 |
| Constitution IX: API errors reach the customer only as the generic sentence | ✅ inside the engine. ❌ on the customer path through the hs pack (I1, from T014, not introduced here) |

## Named risks: verdicts

| # | Risk | Real? | Evidence |
|---|---|---|---|
| a | Every outbound text goes through gate.send | **No, safe.** NON_TEXT, RATE_LIMIT, the generic error, pack replies and job results all go through `reply()`/`gate.send` (`engine.js:47-52,76,80,131`; `engine-jobs.js:52`). `typing` is not text. | grep |
| b | Dedupe while in flight | **Real.** `engine.js:63`: `row.status === 'pending'` counts as fresh, so two concurrent calls with the same key both run `pack.handle`. The probe showed handle ran 2×, the MCP start tool was called 2× (two paid runs), two customer rows were written to `messages`, and **2 job results reached the customer** ("Kết quả L1", "Kết quả L2"). The gate's idem key only deduplicates the turn's own `r:` replies. | probe2 |
| c | Raw error text reaches the customer | **Engine: no** (`engine.js:131` sends a fixed sentence; the audit is redacted). **hs pack: yes, confirmed**, see I1. | code + `test.mjs` checks only `/lỗi tạm thời/` |
| d | Concurrent drain() | **Partly real.** The customer receives exactly one message (outbox UNIQUE idem `j:<chat>:<maLuot>`). Side effects are **not** idempotent: two concurrent drains each called `callTool` and `onJobResult` 2× (both on completion and on expiry). Sequential expiry is delivered exactly once. The ctx shape is identical (`buildCtx` is used for both handle and onJobResult; the session key is `row.session_key`). See I3. | probe (d), (d2) |
| e | Closer vs. photo-confirm "ok" | **Ordering is correct.** `touch()` → `session.get().choXacNhanAnh` exempts the turn before `registry.pick` (`engine.js:93-100`); covered by the test at engine.test.mjs:78. | code + test |
| f | TTL / group session key / history order | **Matches lib/bot.js.** 2 h sliding window through `touch()` on every processed turn (`engine-ctx.js:56-59`) = `sessionOf`. Key is `chat` or `chat:user` (`engine.js:20`) = `lib/bot.js:123`. `messages.recent` returns oldest → newest (`records.js` outer `ORDER BY at, id`). | code |
| g | Audit `tool` | **Safe.** Args are `redact(json(args)).slice(0,500)`; the result is stored only as `sha1` + a 500-character redacted `head`; errors are redacted (`engine-ctx.js:33-42`). | code |
| h | `quietHours:false` leaking into production | **Not today** (only `test/test.mjs` imports engine-compat; `server.js` still uses `lib/bot.js`; `DEFAULT_RULES.quietHours` is true). **Latent trap**: engine-compat's `createBot` has exactly the signature of `lib/bot.js`, so a one-line import swap in server.js during T016 would ship quiet hours off, caps at 1e9, the similarity check off, and an in-memory store. See I4. | grep |

## Part 2: findings

### Critical

**C1. In-flight duplicate updates run the pack twice.** `core/engine.js:62-65`
A `pending` row means "the server pre-wrote it", but the engine never claims it, so a second concurrent `process()` with the same key also counts as fresh.
Effects: duplicate paid MCP runs, duplicate `messages` rows, two jobs → **two job_result messages to the customer**, and the session is mutated twice.
Plan.md's `queue.run(chatId, …)` would serialize this per chat later, but that queue does not exist yet, and the engine is the documented dedupe point.
Fix (one of these):
- keep an in-memory `const inflight = new Set()`: `if (inflight.has(key)) return { skipped: 'duplicate', turnId: key }; inflight.add(key)`, and delete it in a `finally`; or
- claim the row atomically: `UPDATE inbox SET status='processing' WHERE update_key=? AND status='pending'` (changes === 1 means it is ours). This also gives restart recovery a clear state.

Add the test `Promise.all([process(u), process(u)])` → `handle` called once and `jobs` has one row.

### Important

**I1. The hs pack still sends raw error text to customers (constitution IX: "không kèm thông báo lỗi gốc").** Confirmed:
- `packs/hs/index.js:75`: `⚠️ Cổng tra cứu OZ đang lỗi tạm thời (${String(e.message).slice(0,120)})…` → for example "MCP lỗi HTTP 502", ECONNREFUSED host:port, or a fetch failure URL.
- `packs/hs/index.js:101`: `⚠️ Chưa đọc được ảnh (${String(e.message).slice(0,120)})…`
- `packs/hs/packages.js:137` and `:218`: `.catch((e) => ({ ok: false, thongBao: e.message }))` → `thongBao` is printed to the customer by `packs/hs/render.js:85`.
The gate's `findLeak` only catches paths, stack traces and token shapes, so "HTTP 502" and "ECONNREFUSED 10.x.x.x:3000" get through.
Where to fix: in the pack (T014 owns it; do it as a `refactor(hs)` follow-up before T016 wires server.js). Drop the parenthetical, use a fixed `thongBao: 'Cổng chưa trả lời mục này'`, and log the redacted `e.message` only.
Optional defense in depth: give the production gate `bannedPatterns` such as `/lỗi HTTP \d{3}|ECONN\w+|ETIMEDOUT|fetch failed/i`.
Also tighten the legacy test (`test.mjs` "Cổng mất kết nối") to assert that the reply does **not** contain the fake error string.

**I2. The generic error reuses idem index 0, so it is silently dropped once reply 0 has been sent.** `core/engine.js:131`
The probe showed that a pack returned the ⏳ reply and then `jobs.add` threw: the customer got only "phần 1", the generic error was dropped as `duplicate-idem`, the inbox was marked failed, and the promised result never comes (violates II/VIII: a promise with no job record).
Fix: give the error message its own idem key, `r:${chatId}:${turnId}:err` (add an `idemKey` override to `reply()`). Add a test where a pack returns a reply plus an invalid job.

**I3. `pollDueJobs` has no claim or reentrancy guard.** `core/engine-jobs.js:27-71`
Two overlapping `drain()` calls (a T021 timer plus a manual drain, or two ticks) each poll the same rows and call `onJobResult` twice. Customer output is protected by the gate idem key; MCP calls, audits and session writes (`xong()` sets `session.last` and `choBoSung`) are doubled.
Fix: add a `draining` flag in `drain()` like `gate.sweep` (`gate.js:145-148`), or claim each row with `UPDATE jobs SET status='polling' WHERE id=? AND status='waiting'` before the call. Add a test with `Promise.all([drain(), drain()])` → onJobResult called once.

**I4. engine-compat's `createBot` is an API-compatible drop-in with production-unsafe defaults.** `core/engine-compat.js:12,27-38`
`LEGACY_RULES` turns off quiet hours, caps and the similarity check, and the store is `:memory:`.
Fix: make it test-only. Either move it to `test/helpers/legacy-bot.mjs`, or throw when `process.env.NODE_ENV === 'production'`. Also add an assertion (in test or lint) that `server.js` does not import `engine-compat`.

### Minor

- **M1. Pre-pack steps are outside the try.** `core/engine.js:84-100`: an error in stripMention, audit, session or messages throws out of `process`, the inbox stays `pending`, and the customer gets no reply. Startup replay (T019) would retry it, possibly in a loop. Either wrap these steps in the same try/catch (generic error + `markFailed`), or document the replay behavior.
- **M2. The closer rule looks at room-level `messages`.** `core/engine.js:94`: in a group, user B's "ok ạ" counts as "right after the bot" because of user A's turn. This is already listed for T037 (conv_id). Keep it on the T037 checklist.
- **M3. Failures after expiry, or a missing `onJobResult`, mark the job `failed` and nobody is told.** `core/engine-jobs.js:65`: this is a promised result with no message (VII "báo nhân viên"). Add an `onAlert`/ticket hook in T021.
- **M4. The inbound audit `head` is `redact()`-ed, but redact does not mask phone numbers** (`core/redact.js`). Constitution IX lists personal phone numbers for logs. Add a phone shape to redact (T005 owner) or trim `head` to fewer characters.
- **M5. hs pack logs use unredacted `e.message`.** `packs/hs/index.js:74,100`: wrap them in `redact()` (fold this into I1).
- **M6. `'no-chat'` returns no `turnId`.** `core/engine.js:59`: the interface says `{handled|skipped, turnId}`. Return `turnId: null` for a consistent shape.
- **M7. Expired-job wording says "4 phút" while the core TTL is 30 min** (implementer concern 2). Fix the hs `hetHan` text in T021.
- **M8. The closer audit uses `type:'outbound'` with `data.skipped`** (no `skipped` value exists in the audit enum). This is acceptable; note it in data-model.md so T029 metrics do not count it as a send.

## Verdict
The engine has the right structure and passes every brief test. **Fix C1 before merge.** I2 and I3 are small fixes in the same files and should go in this task. I1 and I4 must land before T016 connects server.js to the engine.
