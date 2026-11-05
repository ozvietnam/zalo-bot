# T014 review: packs/hs (af36915..05e9bed)

Spec compliance: ✅ (manifest, handle/onJobResult/footer, no sends, jobs instead of waiting, session only via ctx.session, labels/interests, 3 parked fixes). No Critical findings.

## Named risks
| | Verdict | Evidence |
|---|---|---|
| (a) blocking wait from handle() | ✅ none | handle -> runPkg uses batDau + toJob; chay()/chayCho/waitJob (the only sleep, jobs.js:4,21) are not reachable from index.js/flow-*.js. Still reachable through PACKAGES[0/3].chay (see M1). |
| (b) shared mutable state | ✅ none | Module level only has constants (CLASSIFY, NUOC, LABELS). The session is a structuredClone per turn; save() writes only the changed keys, so concurrent turns do not overwrite each other's keys. |
| (c) onJobResult rebuilds from job.context | ✅ | Checked by running one scenario (scratchpad/sdd/chk.mjs): handle -> JSON round-trip of the job -> onJobResult with a NEW ctx and a new session snapshot -> correct head, tenHang, session.last/choBoSung written, footer once. The expired path (res=null) also works. |
| (d) footer | ✅ in the pack, ⚠ see I1 | Every text-bearing reply carries the footer exactly once (runPkg, ket-qua, chon, tu-dong, onJobResult). The "⏳" notice, the full menu and the DM hint carry none (same as legacy). |
| (e) no send | ✅ | grep finds no import from channels/, no sendText, no notify in the pack (jobs.js:25 `ctx.notify?.` is legacy waitJob only, and pctx does not provide it). |
| (f) labels/interests | ✅ | The label is added only when a Cổng tool call was recorded (menu, chọn, hỏi mẫu, photo-hint -> []). Interests omit unknown keys. Minor M3. |
| (g) parity | ✅ spot check passes | Job flow reproduces the old text and sets the old session keys. I did not rerun the 36-run suite. |

## Findings

### Important
- **I1. footer() contract vs embedded footer** (packs/hs/index.js:125, contracts/pack.md:37). The contract describes `footer(ctx)` as "dòng menu cuối tin", which reads as something the core appends. This pack already embeds the footer in every reply and also exports footer(). If T015 follows the contract literally, every hs reply gets it twice. Fix: before T015, state in pack.md (and core/types.js:73) that the footer is for core-generated messages only and a pack must not rely on the core to append it. Or remove the embedded footers and let the core append, but then the "⏳" notice must be exempt. Either way, add a T015 test "hs reply has exactly one footer".
- **I2. Caption not stripped is a hidden dependency** (flow-photo.js:21, `turn.caption`). The old code stripped "@Tên bot" from the caption. The contract only says `text` is stripped. Fix: add `caption` to the "đã bỏ @Tên bot" sentence in the turn table of pack.md, plus a T015 test.

### Minor
- **M1.** `PACKAGES[0].chay` and `[3].chay` (packages.js:72,175) still block via chayCho/waitJob. Nothing in the pack calls them, but a future caller can re-introduce the blocking wait. Fix: add a comment, or a test that fails if index.js imports waitJob/chayCho. Delete in T016.
- **M2.** Fabricated evidence on expiry (index.js:115-118). With `res == null`, `hetHan()` is pushed into `evidence` as if it were a tool result, and the label is added. Fix: for `res == null` use `calls = []`.
- **M3.** Label heuristic (flow-turn.js `result()`): any Cổng call counts, including the "kết quả <mã>" lookup. The brief says "when a customs package actually ran". Accept, or restrict to calls other than ket_qua_*.
- **M4.** `hetHan` hardcodes 4 minutes (jobs.js:14, index.js:115) although the engine decides the expiry. Fix: let `job.context` carry or the engine pass `maxMs`.
- **M5.** The ok/edited-template branches (index.js textFlow, top) are outside the try, so errors now become the generic FR-022 message. Already noted in the report. Accept.
- **M6.** Rename detection: the shims keep old paths, so history is split. Resolves in T016.
