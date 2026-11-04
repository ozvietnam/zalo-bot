# B3 review (T011, T012, T013), range c352158..af36915

Verified by running: `npm test` (21 legacy tests green), channel and registry tests (13/13 pass), shim export check.

## Verdict
| Task | Spec | Quality | Result |
|---|---|---|---|
| T011 core/types.js | Matches pack.md and channel.md (Update, Turn, Ctx, Job, PackResult, Pack) | Pure JSDoc, 76 lines | ✅ |
| T012 channels/zalo-bot.js + shim | All controller rulings met | See findings | ✅ |
| T013 core/registry.js | All rulings met | See findings | ✅ |

No Critical findings. Nothing blocks the gate.

## Named risks
- (a) JSON.stringify key order: the key is stable for byte-identical retries, because the same sender serializes the same way and the server parses then re-stringifies. It is NOT canonical. I confirmed that the same content with a different key order gives a different key (`false`). Zalo has no documented reordering, so this is Minor.
- (b) Missing header or header array: a missing header or missing `req` returns false. A header array `['s']` is coerced to 's' by `safeEqual` (`String()`) and returns true. Node's http never produces arrays for `x-*` headers (duplicates are joined with ", " and then fail). Practical risk is nil, and it is Minor.
- (c) loadPacks: `readdir` names cannot traverse. `dir` comes from config, not from users. Symlinked pack directories are skipped silently, because `Dirent.isDirectory()` is false for a symlink. A symlinked `index.js` is followed. Importing runs arbitrary code by design, so the pack dir must be trusted. Minor.
- (d) Legacy tests: 21/21 green. The shim re-exports everything the old module had (ZALO_MAX_TEXT, createZaloClient, splitText, parseUpdate, safeEqual) and adds createChannel, which is additive. `test/test.mjs` now imports `channels/` directly, so the shim is only exercised by `server.js` and `scripts/set-webhook.mjs`. I confirmed the shim loads and exports the right names.

## Findings
| Sev | Where | Issue | Fix |
|---|---|---|---|
| Minor | channels/zalo-bot.js:36 | updateKey hashes `JSON.stringify(raw)`, which is key-order sensitive | Use a small canonical stringify (sorted keys) before sha1, or keep as-is and document |
| Minor | channels/zalo-bot.js:44, 131-138 | `safeEqual` coerces arrays via `String()`. `x.length !== y.length` returns early, which leaks length only (acceptable) | In verifyWebhook, require `typeof h === 'string'` |
| Minor | channels/zalo-bot.js:81-85 vs 39 | The legacy `createZaloClient.sendText` still splits (kept on purpose). Two sendText behaviours coexist until T016 | Add a TODO(T016) comment. Do not let new code call the client's sendText |
| Minor | core/registry.js:165-166 | Validates id and handle, but not `match` (a function), the id regex `a-z0-9-`, or id equal to dir name. A pack without `match` makes `pick` throw a TypeError at runtime | Add `typeof pack.match !== 'function'` and `/^[a-z0-9-]+$/` checks |
| Minor | core/registry.js:161 | Symlinked pack dirs skipped silently | Use `ent.isDirectory() \|\| ent.isSymbolicLink()`, or document it |
| Minor | core/registry.js:160 | Dedup and validation happen after `import`, so a broken pack's top-level code has already run | Acceptable (trusted dir); note in the pack.md loader section |
| Minor | test/core/channel.test.mjs | No test for the header-array case or for key-order. Test for `updateKey` equality only covers a deep clone | Add one case each if (a) or (b) is tightened |
