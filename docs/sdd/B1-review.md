# B1 review (T002, T003, T004, T005, T007), base 9744ec9, head 44ede2b

Method: read the brief, report, diff, send-gate.md and data-model.md. Ran focused `node -e` checks (below). The checkout was not modified.

## Part 1: Spec compliance

| Task | Verdict |
|---|---|
| T002 fakes | ✅ |
| T003 time | ✅ |
| T004 redact | ✅ for the brief's literal asserts and the row-7 pattern list; the pattern behaves as a defect in practice (see C1) |
| T005 config | ❌ SESSION_TTL_MS default contradicts data-model.md |
| T007 text | ✅ with ruling deviations noted |

### T002
- Missing: none. Matches the Interfaces section, including `failOn(chatId,text,n)`, `maxText 2000`, `calls`, `advance(ms|'10m'|'2h')` and `set`.
- Extra: `capabilities` contents, and `d` as an extra unit. Harmless.
- Misunderstood: none.
- Minor: `fakeMcp` throws for an unscripted tool. This is reasonable. `listTools` returns `{name}` only.

### T003
- Missing: none. The five exports are present. The file never uses local-TZ getters. It uses `getTime()+7h` and `getUTC*`, which is correct for the ruling "independent of local TZ".
- nextMorning follows the ruling: next 07:00 VN strictly after the instant. Tests cover both TZs, the boundary at 07:00 exactly, and 02:00 VN the same night.
- Extra: `vnHour` is exported. It is useful and not harmful.
- Misunderstood: none.
- Note: `process.env.TZ` set at runtime has limited effect in Node. The test is only a weak guard, but the implementation is correct by construction.

### T004
- Test asserts all pass. Row 7 patterns are all present: `/home/`, `/opt/`, `C:\`, stack `at x (file:line)`, a ≥32-character base64/hex string, `Bearer `, and BANNED_PATTERNS.
- Missing: none against the brief.
- Misunderstood: none in the spec sense. The literal row 7 pattern, copied faithfully, is unsafe at the false-positive level. See C1 below.

### T005
- ❌ Misunderstood: `sessionTtlMs` defaults to 1_800_000 (30 min). data-model.md:44 states "SESSION_TTL_MS (mặc định 2 giờ)", so the default must be 7_200_000. `.env.example:43` repeats the wrong value and says "30 phút".
- Extra: the `sessionTtlMs` key is not in the brief's key list. It is justified by the Step-3 `.env.example` list and by data-model, so keep it with the correct default.
- Missing: none. All listed keys are present. `companyPhones` is a Set of normalized 0xxxxxxxxx, per the ruling. `.env.example` has all 8 vars.
- `Object.isFrozen`, the ZALO_MODE and CAP_CHAT_DAY throws, and the banned-pattern test all pass.

### T007
- All brief asserts pass. `splitText` is identical in behaviour to lib/zalo.js, verified by diff (only the default `max` differs: the literal 2000 instead of the constant).
- Ruling for extractMoney: k=×1000, tr/triệu=×1e6, % excluded. Implemented.
- Ruling for isCloser: short closing words/emoji, false if digits. Implemented.
- Deviation: the contract (send-gate.md:39) requires a ≥4-digit number and includes `%`. The implementation drops both. The `%` drop is per ruling. The ≥4-digit drop is forced by the brief's own `800k` and `¥108`. The contract text needs an update (the implementer flagged this).
- Extra: `splitText`, `normVi` exports, per ruling.

## Part 2: Findings

### Critical

**C1. `findLeak` 'secret' rule false-positives on the company's own URLs.** `core/redact.js:6,134` (`[A-Za-z0-9+/_-]{32,}`).
- Measured: `findLeak('Xem https://uythacnhapkhau.com/huong-dan-nhap-khau-hang-tu-trung-quoc-ve-viet-nam')` returns `secret`. `https://thutucxuatnhapkhau.com/thu-tuc-hai-quan-nhap-khau-hang-hoa/` also returns `secret`. Any hyphenated slug of ≥32 characters triggers it.
- Taobao short links (`s.click.taobao.com/t?e=m%3D2…`), alicdn image URLs and long shop paths also return `secret`.
- Plain item.taobao.com and detail.1688.com URLs return null, and so do HS codes like `8413.70.90`.
- Effect: the gate rule is `reject` plus alert on every customer reply that carries a company article link (both sites have hundreds of articles). The bot would go silent on its main content, and staff would receive false alerts.
- Fix, in `redact.js`:
  - Exclude URLs before the secret test: `text.replace(/https?:\/\/\S+/gi, ' ')`, then test the remaining text.
  - Require real secret shape for a URL's own tokens: ≥32 characters with at least one digit AND one letter and no 3+ hyphen-separated lowercase words. A simpler rule is to drop `-` and `/` from the class: `[A-Za-z0-9+_]{32,}`.
  - Keep the hex and base64 tests. Optionally also scan URL query values only.
- Same issue in `redact()` (`LONG_TOKEN`, lines 7 and 141): logs mangle `https://x.***`. This is cosmetic only. Apply the same fix.
- Add tests with a company slug, a Taobao link and an alicdn link, all expecting `null`.
- Note: the contract row 7 wording "chuỗi ≥ 32 ký tự base64/hex" is itself loose. Tighten it in send-gate.md to "không nằm trong URL" or similar.

### Important

**I1. SESSION_TTL_MS default is 30 minutes, spec says 2 hours.** `core/config.js:115`, `.env.example:42-43`. Fix: set the default to `7_200_000`, change the comment to "mặc định 7200000 = 2 giờ", and add a config test asserting the default.

**I2. extractMoney mis-joins adjacent quantity and price.** `core/text.js:180` (the `\s\d{3}` thousands-space group).
- `extractMoney('mua 3 250.000đ')` returns `[3250000]` (should be 250000).
- `'lấy 2 800k'` returns `[2800000]`. The same tokenization appears when a quantity is followed by a space and a 3-digit price.
- Effect: money check (row 8) can reject legit text, or pass a wrong figure.
- Fix: allow the space-thousands group only when the first group is 1-3 digits AND the preceding char is not a digit/word boundary issue (cannot disambiguate fully). A safer fix is to restrict space-grouping to cases where the leading group is ≥2 digits and the unit follows, or to emit both candidates (joined and last-group-only) and let the gate accept a match on either. Document the ambiguity.

**I3. "đồng" matches as a unit in "3 đồng ý".** `core/text.js:181` (unit `đồng` followed by whitespace passes the `(?![\p{L}\p{N}])` guard). `extractMoney('có 3 đồng ý')` returns `[3]`. It then enters the money check; with `moneyCheck` on, a spurious number could reject. Fix: for `đồng` require that the next token is not `ý` or `thời` etc., or require ≥4 digits (or a ".", ",") for `đồng`/`đ`. Low-risk option: drop `đồng` bare unit when number <1000 and unit ∈ {đ, đồng}.

**I4. Stack regex matches time-of-day.** `core/redact.js:133`, second alternative `\bat\s+[^\s()]+:\d+:\d+`. `findLeak('Họp at 9:30:00')` returns `stack`. English "at hh:mm:ss" in customer messages is rare, but it would hit job logs quoted to customers. Fix: require a path-like token (`/` or `.js|.mjs|.ts`) before `:line:col`.

**I5. Contract not updated.** send-gate.md:39 still says ≥4 digits and includes `%`. The implementer noted it, but nobody owns the edit. Fix: edit line 39 to match the rulings (no `%`; any digits count; list `k=×1000`, `tr/triệu=×10^6`). Otherwise T-gate implementers will conflict with `extractMoney`.

### Minor

- **M1.** `core/redact.js:132` PATH requires a leading delimiter, so `/home/` in prose after a space triggers (`'tại thư mục /home/'` returns `path`). A website path like `"…/home/…"` after a letter does not trigger, which is fine. A Vietnamese reply that says "trang /home/" is vanishingly rare. No change needed; note only.
- **M2.** `extractMoney('1k5')` returns `[1000]` (should be 1500). Rare. Add `(\d+)k(\d)` handling if wanted.
- **M3.** `core/config.js:96-118` freezes the object but not the Sets (`allowUsers`, `staffUsers`, `companyPhones` stay mutable). Acceptable; mention if "Readonly" matters.
- **M4.** `Number()` accepts `'0x10'` and `'1e3'` as ints. Cosmetic.
- **M5.** `BANNED_PATTERNS` always compiled with `i`; separator `;` means patterns cannot contain `;`. Documented in `.env.example`; fine.
- **M6.** `loadConfig({})` throws without `ZALO_BOT_TOKEN`. The brief's test implies this is fine; later tasks must pass a token in tests (flagged by implementer).
- **M7.** `test/core/time.test.mjs`: changing `process.env.TZ` mid-process may not affect Node on all platforms, so the loop is a weak regression guard. Implementation is TZ-free by design.
- **M8.** `core/text.js` isCloser: `'dạ em cảm ơn anh'` returns false and `'cám ơn anh'` is asserted false. This is intentional (stricter than "short closing words"), but it means polite two-clause closers still get a bot reply. Confirm with the controller if wanted.
- **M9.** Sizes: all files <300 lines (largest 81). No new dependencies. No `package.json` change.

## ⚠️ Cannot verify
- The implementer's red-then-green claims (git history shows the 5 commits but not test order).
- `npm test` / `npm run eval` output ("21 test đạt"). Not re-run, per task scope (focused checks only).
- Whether `process.env.TZ` assignment inside the test actually changes the Date TZ on the CI/Coolify Node version.
- The behaviour of `splitText` relative to lib/zalo.js beyond reading both (the code is identical by inspection).
- Real production URL mix (how many reply links carry long slugs); sampled from known site structure, not from data.

## Counts
Critical 1, Important 5, Minor 9.
