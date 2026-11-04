# SDD ledger — plan: specs/001-nen-tang-chung/tasks.md
Repo: /home/claude/zalo-bot · branch 001-nen-tang-chung · base cfab892
Spec: specs/001-nen-tang-chung/spec.md (+ contracts/, data-model.md)
Run order: T001–T026 → T033–T036 → T027–T032
## Preflight rulings
- Ruling: npm test = `node --disable-warning=ExperimentalWarning --test "test/core/**/*.test.mjs" "packs/**/*.test.mjs" && node test/test.mjs` (globs, not dirs) — dirs may not exist yet — cheap to change.
- Ruling: T009 moves splitText into core/text.js; lib/zalo.js re-imports it until T012 — keeps 21 old tests green.
- Ruling: briefs carry Global Constraints + Review Focus appended.
T001: dispatched impl (sonnet), BASE fa0a54c
Task T001: complete (commits fa0a54c..9744ec9, review: 1 Important + 3 Minor fixed in round 1, scoped re-review by controller on 4-line diff)
- Parked: Coolify must use a named volume for /app/data (bind mount would be root-owned) — note for T032 README.
- Ruling: batch T002+T003+T004+T005+T007 (small independent pure modules, same shape) into one implementer dispatch + one review — saves ~8 dispatches — cost if wrong: a larger review diff.
B1 (T002,T003,T004,T005,T007): dispatched impl (sonnet), BASE 9744ec9
B1 review: 1 Critical (findLeak flags OZ URLs), 5 Important, 9 Minor → fix round 1 sent. Rulings: strip URLs before secret test; space never thousands sep (25 650đ → [650] accepted limitation); SESSION_TTL 7200000.
Task B1 (T002,T003,T004,T005,T007): complete (commits 9744ec9..b7cb56f, 2 fix rounds; round-2 single finding verified by controller node -e; 9 Minor parked with reasons in B1-report.md)
T006: dispatched impl (sonnet), BASE b7cb56f
Task T006: complete (commits b7cb56f..79d359b, 1 fix round; scoped re-check by controller: tests 35/35, ticket uniqueness + NOT NULL verified; extra inbox.get(key) accepted)
T008: dispatched impl (sonnet), BASE 79d359b. Ruling: staff_relay exempt from leak check (human text) but logged; ticket/digest never proactive.
Task T008: complete (commits 79d359b..1b926e6, 1 fix round, controller verified npm test 57/57 + 21)
B2 (T009,T010): batched (same file, sequential). BASE 1b926e6
B2 impl done (750ac82,4e2f700); review dispatched on opus (risky core path). Self-declared concerns: defer bypasses moneyCheck on sweep; orphan queued rows.
B2 review (opus): 3 Critical (deferred bypasses moneyCheck; orphan queued; failed retry skips room state), 3 Important, 6 Minor → fix round 1 sent with rulings: outbox.ctx JSON, full re-decide on sweep, gate.recover() at boot, retries 1/5/15 (attempts<=3), cap→next 07:00 VN, signal on reason change, empty→reject.
Task B2 (T009,T010): complete (commits 1b926e6..cde215f, 2 fix rounds; opus re-review: 3 Critical + 4 Important fixed; mergeable)
- Parked → T020: wire gate.recover() at boot (N-1). Parked → T016: send({text:undefined}) → reject empty. M-4 (maxText change misalign) accepted low risk. plan.md ctx mention → T032 docs.
- Ruling: batch T011+T012+T013 (types, channel adapter, registry).
B3 (T011,T012,T013): dispatched impl (sonnet), BASE c352158
Task B3 (T011,T012,T013): complete (commits c352158..af36915, review clean: 0 Crit/Imp, 7 Minor)
- Parked → T014: loadPacks must require match() function + id format /^[a-z0-9-]+$/; channel updateKey use sorted-key stringify; verifyWebhook require string header. Parked → T016: legacy createZaloClient split removal.
T014: dispatched impl (opus — behavior-parity migration), BASE af36915
T014 impl done 72a2daa,05e9bed; 36-run differential parity old vs new = exact
Task T014: complete (commits af36915..05e9bed, review ✅ 0 Crit; I1/I2 contract wording fixed by controller in docs commit; Minors M1-M6 parked)
- Carry → T015: (1) engine must NOT append footer to pack replies, but uses pack.footer() for core-authored texts; test exactly one footer. (2) strip @mention from caption too. (3) job expiry 30 min vs pack's hardcoded "4 phút" text → T021 align. (4) generic error on photo-confirm failure accepted. (6) engine owns session TTL 2h, per-person group session key, typing, dedupe, rate-limit message — the 21 old tests depend on them.
T015: dispatched impl (opus), BASE 52ebb90. Ruling: inline job poller in engine (T021 extracts); messages khach write moved forward from T033; legacy createBot uses quietHours=false rule flag.
US8 added 17:54 (anh): conv_id model; T037-T038 run after T015, before T016.
Ruling/lesson: controller docs commits during an active implementer MUST stage explicit paths (git add specs/ docs/), never -A — 5c US8 commit swept 2 WIP test files of T015 (harmless, told implementer).
T015 review (opus): ❌ 1 Critical (in-flight dedupe: pending row processed twice → double paid MCP + double job result), 5 Important (hs pack leaks raw error; concurrent drain double-poll; compat createBot prod trap; generic error idem :0), 8 Minor → fix round 1 sent.
Task T015: complete (commits 52ebb90..1d4ea55, 2 fix rounds; opus re-review: C1 + I1–I4 fixed, 0 new Crit/Imp)
- Parked → T021: N1 polling job counts as debt forever past expires_at. → T020: N2 processing rows after early throw; stale processing >5 min → pending. N3 second drain returns early (accepted). N4: schema v1 still unreleased; add rule in T016 "no prod db yet; first deploy freezes v1, later changes need migration+version bump".
- Ruling: `npm run eval` red until T030 creates eval/run.mjs — waiver recorded; PR stays draft until T030.
T037: dispatched impl (opus), BASE 1d4ea55
