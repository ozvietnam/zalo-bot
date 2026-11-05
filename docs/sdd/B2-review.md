# Review B2: T009 + T010 (`createGate().send()` / `sweep()`), diff 1b926e6..4e2f700

Verdict: **Do not merge yet.** The happy path is solid: 81/81 tests pass and test/test.mjs prints "21 test đạt". However, two named risks are real Critical defects that ship un-checked money amounts and lose customer messages, and a third Critical defect means retries ignore human takeover. All findings below were reproduced with `node -e`-style scripts against the real store (script: `scratchpad/sdd/chk.mjs`).

## Part 1: Spec compliance

| Item | Result | Note |
|---|---|---|
| Luật 1: outbox row written before channel call, UNIQUE idem | ✅ | gate.js:99-107. Test "status queued tại lúc gửi" is valid |
| Luật 2: split into 2,000-char parts, `parts_sent` after each part, then `sent` | ✅ | gate.js:59-64 |
| Luật 3: failed means no in-turn retry; sweep retries at most 3 times at 1/5/15 min, resuming from `parts_sent` | ❌ | Only **2** retries happen (at +1 and +6 min). The 15-minute step never runs (see I-1). Resume from `parts_sent` ✅ |
| Luật 4: defer is re-decided with fresh facts when `now ≥ not_before` | ❌ | Re-decided with **degraded** facts and msg: no pack/evidence/inReplyToAt, `hasOpenJob` forced true. Rows 3a and 8 are effectively disabled (C-1) |
| Luật 5: gate never edits text | ✅ | Only splitText trims at cut points. `messages` stores the original `o.text` |
| Luật 6: one `gate` audit row per decision | ✅ | Includes the duplicate path and the sweep re-decide |
| Brief T009 tests (6) | ✅ | All present, plus extras |
| Brief T010 tests | ⚠️ | Present, but the retry test encodes the wrong 1/5 schedule instead of 1/5/15 |
| Review Focus #2: "chết giữa hai phần: khởi động lại chỉ gửi phần còn thiếu" | ❌ | A real crash leaves `queued`, which is never resumed (C-2). Only channel *errors* are covered |
| Constitution I (single gate) | ✅ | Only gate.js calls `channel.sendText` |
| Constitution II (người trước máy) | ❌ | A `failed` retry sends into a `human` room (C-3) |
| Constitution III (money via moneyCheck) | ❌ | Bypassed via defer (C-1) |
| Constitution VII (sai thì dừng, idempotent restart) | ❌ | A stale `queued` row is silently lost, with no alert (C-2) |
| Constitution IX (secrets) | ✅ | Error messages pass through `redact` in audit and log. Covered by a test |
| File size / no deps | ✅ | gate.js 150 lines, gate-decide.js 114 lines |

## Part 2: Findings

### Named risks: verdicts

| # | Real defect? | Verdict |
|---|---|---|
| (a) money | **YES, Critical** | A night-time `job_result` "Thuế 12.345.000đ" with `moneyCheck:true` and `evidence:[]` is deferred at row 3b, then at 07:00 it is **sent**, reason `ok`. Row 8 never ran at first send, because decide stops at the first failing row. On sweep, `pack` is absent, so row 8 is skipped again. Report concern #2 says "it already passed at send", which is false. |
| (a) proactive-no-debt | **YES, Important** | A direct `reply` deferred by `cap:chat` (customer silent, no job) is sent the next morning. That is proactive by the contract's definition (>10 min since `inReplyToAt`), but gate.js:119 forces `hasOpenJob:true`. Forcing it is defensible for `job_result` (the deferred row *is* the debt). For a cap-deferred reply it is an unrecorded product choice. |
| (b) crash leaves `queued` | **YES, Critical** | `due()` (queue.js:38) never selects `queued`, and gate.js has no recovery. Customer impact: the reply silently disappears. With a crash mid-split, the customer keeps a truncated part 1 forever. No alert fires (violates VII). Confirmed: a stale queued row gives `sweep() = 0` a day later. |
| (c) concurrent same idemKey | **No** | `facts → hasIdem → insert` is fully synchronous (node:sqlite) before the first `await`, so the second call sees `idemExists`. Across processes, UNIQUE plus the `DUPLICATE_IDEM` catch covers it. The test confirms exactly one channel call. |
| (d) staff_relay loses speaker_id | **YES, Important** | Confirmed: after a retry, messages has `['nhan-vien', null]`. The audit trail of which staff member spoke is lost (IV, FR-024). |
| (e) multi-part resume, messages once | **No (for channel errors)** | Parts 2..n only, and `messages.add` runs once inside `tx` with `status=sent`. Two caveats: a crash breaks it (b), and a DB error after a successful `sendText` is misread as a channel error, so that part is re-sent (M-2). |
| (f) 3rd failure: one alert, then stop | **Partly** | One alert and no further retries ✅. But the 3rd failure is only the 2nd *retry*. See I-1. |
| (g) cap: midnight, then 07:00 | **Works, not sane** | Two hops and two gate audit rows per message. Worse, rows still over `cap:all` at the 07:00 burst are re-deferred and `signal()` re-fires `onAlert`/`onTicket` **once per row per sweep**, which is an alert storm. Those rows then wait another full day. See I-3. |

### Critical

**C-1: A deferred message skips moneyCheck (row 8) and loses proactive context.** gate.js:118-119.
The sweep re-decide rebuilds `m` without `pack`, `evidence` or `inReplyToAt`. Any `job_result` or `notice` with an amount, deferred by quiet hours or cap, ships unchecked (III).
*Minimal fix:*
- Add an outbox column `ctx TEXT` (JSON), and record it in data-model.md and plan.md.
- At insert, when the decision is `defer` (or always), write `{ moneyCheck, known: [...evidenceNumbers(msg.evidence)], inReplyToAt, debt: hasOpenJob, staffId }`.
- Store only the **number set**, not the raw evidence. That avoids copying customer text or PII into outbox.
- In `sweepRow`, rebuild `m.pack = { moneyCheck }`, `m.evidence = known`, and `m.inReplyToAt`.
- Pass `hasOpenJob: ctx.debt || fresh openFor` instead of a blanket `true`.
- Clear `ctx` when the row reaches a terminal status.
- Add regression test: a night `job_result` with an un-evidenced amount gives `rejected money:*` at 07:00, plus `onTicket`.

**C-2: A crash between insert and the last part leaves `queued` forever.** gate.js:110, queue.js:38-39.
*Minimal fix:* the constitution allows one process, so recover **at startup**, not with a time-based pick inside sweep. A time-based pick would double-send when a slow `sendText` is still in flight.
- Add `gate.recover()`, called once before the first sweep.
- It does `UPDATE outbox SET status='failed', next_retry_at=now WHERE status='queued'` and writes an audit `error` row `{reason:'crash-recovery', parts_sent}`.
- The normal retry path then resumes from `parts_sent`.
- Accept at-least-once for the single part that was in flight at the crash, and document it.
- Per VII, call `onAlert(chat, 'crash-recovery')` when `parts_sent > 0`, so staff know a partial message went out.
- Alternative if you want it inside sweep: keep an in-memory `inFlight` Set of ids, and pick up `queued` rows not in the set.
- Add a test that inserts a `queued` row with `parts_sent:1`, runs `recover()` then `sweep()`, and checks parts 2..n.

**C-3: A `failed` retry ignores human takeover and quiet hours.** gate.js:116.
`deliver(o.id)` runs without re-checking room state. Reproduced: a reply fails, staff claims the room, and at +1 min the bot sends into the `human` room. That violates II, which is non-negotiable. A `job_result` that failed at 22:58 is likewise retried at 23:03, inside quiet hours.
*Fix:* before `deliver` for a `failed` row whose kind is not free, read `store.chats.get(chat_id)?.state`. If it is `human` or `blocked`, update the row to `rejected` with reason `chat-<state>` and write a `gate` audit row. If the message is proactive and `isQuietHours`, set it to `deferred` with `not_before = nextMorning`. Add a test.

### Important

**I-1: The retry schedule is 1/5, not 1/5/15.** gate.js:68-72, queue.js:39.
The first send failure already sets `attempts=1`, so `attempts<3` allows only 2 retries. Reproduced: retries at +1 and +6 min, and `RETRY_MIN[2]` is never used. Luật 3 and data-model define `attempts` as the "số lần thử gửi lại" (retry count).
*Fix:* in deliver, pass `{ retry }`. The first failure keeps `attempts=0` with wait `RETRY_MIN[0]`. On retry, `attempts+1` with wait `RETRY_MIN[attempts]`. Alert when `attempts>=3`. Update the test to +1, +5, +15, then stop.

**I-2: staff_relay `speaker_id` is lost on retry.** gate.js:81, 116.
*Fix:* read `staffId` from `ctx` (C-1), as `deliver(o.id, { staffId: ctx?.staffId })`.

**I-3: Cap defer timing, plus repeated signals.** gate.js:38, 121.
*Fix:*
- For `cap:*`, set `not_before` to 07:00 VN of the next VN day (`vnDayStartUtc(now)+DAY+7h`), as one hop.
- In `sweepRow`, call `signal()` only when the reason changed (`d.reason !== o.reason`), so a re-defer never re-alerts.

**I-4: The proactive-no-debt choice for cap-deferred replies is undocumented** (gate.js:117-119).
Either reject those replies on sweep (strict 3a), or record the decision "the deferred row counts as debt" in the contract. Do not leave it implicit.

### Minor

- **M-1** gate.js:59-64: empty or whitespace text gives `splitText → []`. Status becomes `sent` and a `messages` row is written, but the channel received nothing (reproduced). That is a false "đã gửi" (IV). Reject it or `drop` with reason `empty`.
- **M-2** gate.js:63-66: `outbox.update` sits inside the same `try` as `sendText`. A DB error after a successful send is recorded as a channel failure, so that part is re-sent. Move the `try` around `sendText` only.
- **M-3** gate.js:76-84: a throw from `store.tx`/`messages.add` escapes, so `send()` throws despite its "never throws" contract. The row then stays `queued` (C-2).
- **M-4** gate.js:59: resume re-splits with the current `channel.maxText`. If that changes between attempts, parts misalign. Persist the part count, or always split at a fixed 2000.
- **M-5** gate.js:5: `nextMorning` is imported but unused.
- **M-6** Report note 6: `npm run eval` fails with MODULE_NOT_FOUND. AGENTS.md requires both commands to be green before a PR. This is pre-existing, but the PR must not claim "xong" until it is fixed.
