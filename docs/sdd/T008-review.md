# T008 review: gate.decide()

## Part 1: Spec compliance
- Row order 1,2,3a,3b,4,5,6,7,8 and reasons match send-gate.md: ✅
- Controller rulings (defaults, throws without time, proactive definition, free kinds skip 2-6 and 8, leak skips only staff_relay, similar to 2 decimals, moneyCheck only when set, deep-walk evidence, first missing amount): ✅
- Risk (a) tax rates and HS codes under moneyCheck: ✅ behaviour. Checked with node: "0%, 10%, 8413.70.90" gives send/ok.
- Risk (b) direct reply during quiet hours (2 min after the customer message, 23:30 VN) gives send: ✅
- Risk (c) proactive with no open job is rejected (job_result and notice 2h old, both at 10:00 VN, outside quiet hours): ✅
- Risk (d) every brief case has a test: ✅ with deviations. The brief lists 13 lines, not 11. Two tests do not use the exact values: see M1 and I1.
- Overall: ✅ with the findings below. No Critical findings.

## Part 2: Findings
- **Important I1**: test/core/gate-decide.test.mjs (tests '8 money ...') has no test for risk (a). Nothing proves that "0%", "10%" or "8413.70.90" pass with `pack.moneyCheck:true`, so a later change to `extractMoney` could break it unnoticed. Fix: add a test with `text: 'Thuế 0%, VAT 10%, mã 8413.70.90'`, `pack:{moneyCheck:true}`, `evidence:[]`, expecting send/ok.
- **Minor M1**: test/core/gate-decide.test.mjs, test '6 similar': the regex is `/^similar:\d\.\d\d$/`. The brief requires `/^similar:0\.\d+$/`. Fix: use the brief's regex or an exact `similar:0.83`.
- **Minor M2**: core/gate.js:36-37. A numeric string in evidence adds both `Number(s.replace(',','.'))` and the dot-stripped value, so "1.5" also whitelists 15. This is only a lenient false negative in the money check, not a reject. Fix: add the decimal reading only when the string has exactly one separator followed by a number of digits other than 3.
- **Minor M3**: core/gate.js:61 uses `msg.now` as a time fallback. The contract only lists `facts.now`. This is harmless and tested. Optionally drop it, or note it in the contract.
