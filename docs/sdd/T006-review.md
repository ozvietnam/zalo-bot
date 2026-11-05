# T006 review: core/store.js (b7cb56f..3946521)

Verified: `node --test test/core/store.test.mjs` gives 12 pass, 0 fail. Largest file is 63 lines (limit 300). No new dependency. Every SQL statement uses parameters.

## Spec compliance: ❌ (one spec rule missing, otherwise matches)

Schema check against data-model.md: all 10 tables, every column, the UNIQUE(idem_key), UNIQUE(pack, ma_luot) and all 9 indexes match. The extra outbox columns `attempts` and `next_retry_at` are documented in data-model.md and plan.md in the same diff. All controller rulings are met, including WAL (skipped for :memory:), busy_timeout, foreign_keys, BEGIN IMMEDIATE, the sessions.get fallback and JSON parsing.

- Missing: "one open ticket per chat" (tickets.chat_id row of data-model.md; named risk c). Nothing enforces it. `tickets.open()` inserts unconditionally, and there is no partial unique index. I confirmed that opening two tickets for chat 'c' returned ids 1 and 2.
- Extra: none.
- Misunderstood: none.

## Findings

### Critical
None.

### Important
1. **Second open ticket is possible** (risk c). `core/store/state.js:296-300` and `core/store/schema.js:237`.
   - Fix: add `CREATE UNIQUE INDEX IF NOT EXISTS ux_tickets_open ON tickets (chat_id) WHERE status IN ('open','claimed')`.
   - Fix: add the index to the data-model "Chỉ mục" section.
   - Fix: make `open()` run inside `tx`, return the existing `openFor` row if there is one, or catch the UNIQUE error.
   - Add a test.
2. **Internal wall clock** (risk b). `core/store/queue.js:15-16`: `markDone` and `markFailed` call `new Date().toISOString()`. These are the only two clock reads in the store, and they will break fake-clock tests.
   - Fix: change the signatures to `markDone(key, at)` and `markFailed(key, err, at)`.
   - This changes the interface in T006-brief.md, so tell the controller. The callers (T012 and others) will pass the clock's `at`.

### Minor
3. **`INSERT OR IGNORE` hides NOT NULL violations.** `queue.js:7` (inbox) and `queue.js:56` (jobs).
   - I confirmed `jobs.add({... result_tool: null ...})` returns null, and `inbox.insertIgnore({chat_id: null ...})` returns false. A malformed row is silently reported as a duplicate, and the job or message is lost.
   - Fix: use plain `INSERT ... ON CONFLICT (pack, ma_luot) DO NOTHING` and `ON CONFLICT (update_key) DO NOTHING`. Other constraint errors then throw.
2. **`sessions.get` with an unparseable `now` or `updated_at`** (`state.js:284`). `NaN > ttl` is false, so an expired session is returned as live. I confirmed this with `now = 'garbage'`.
   - Fix: use `!(age <= ttlMs)` so the NaN case returns `{}`.
3. **`outbox.due` treats failed rows with NULL `next_retry_at` as due immediately** (`queue.js:98`). The ruling says "next retry time has passed". This is defensible but it should be a stated decision. Add a test, or note it in data-model.md.
4. **`outbox.insert` catches duplicates by regexing the error message** (`queue.js:105`). It depends on SQLite's wording, "UNIQUE constraint failed: outbox.idem_key". The current Node build passes the test. Fix: also check `e.errcode === 2067` (SQLITE_CONSTRAINT_UNIQUE), if node:sqlite exposes it.
5. **data-model.md mentions `core/store.js#migrate()` and `#prune()`.** The code puts migrate in `store/schema.js` and prune on `audit.prune`. Update the doc wording.

## Named risks
- (a) Idem race: OK. The UNIQUE(idem_key) constraint plus the synchronous node:sqlite driver means two same-process sends cannot both insert. The second gets DUPLICATE_IDEM. `hasIdem` is only a pre-check, so the gate must rely on the throw.
- (b) Clock: finding 2 above. Every other function takes `at` or `now` as a parameter.
- (c) One open ticket per chat: finding 1 above.
- (d) Column-name injection: OK. `patchRow` checks every key against a fixed whitelist (`allowed`) before building the SQL, and values are bound. The test `'status=1;--'` is rejected. `chat_id`, `idem_key` and `id` are not patchable.
