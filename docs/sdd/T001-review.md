# T001 review (base fa0a54c, head 174f950)

## Part 1: Spec compliance: ✅

Checked against the brief plus the controller rulings.

| Requirement | Result |
|---|---|
| `engines.node ">=22.13"` | OK (package.json) |
| scripts `dev`, `start`, `eval`, `audit` | OK. `webhook:*` kept. |
| `test` script per ruling (globs, then `&& node test/test.mjs`) | OK, identical to the ruled string |
| Dockerfile: `COPY . .`, `ENV DATA_DIR=/app/data`, `/app/data` owned by node, `VOLUME`, HEALTHCHECK, `USER node`, CMD with warning flag | OK. `VOLUME` comes after the `chown`, so the ownership carries over. |
| `.dockerignore` excludes .git, node_modules, data, .env, .superpowers | OK |
| `.gitignore` adds `data/` and `.superpowers/` | OK |
| `test/core/smoke.test.mjs` matches the brief's test | OK |
| No dependency added | OK |
| Commit message `chore: node:test runner, data volume, scripts` | OK per the diff header |

- Missing: none.
- Extra: none. Only `.dockerignore` and `.superpowers/` go beyond the brief, and the ruling asked for both.
- Misunderstood: none. The `eval` and `audit` scripts point at files that do not exist yet, which the ruling allows.

## Part 2: Quality

### Important (1)
1. `.dockerignore:4`: only `.env` is excluded, but `.gitignore` also ignores `.env.*` (keeping `.env.example`). With `COPY . .`, a local `.env.production` or `.env.local` would be baked into the image, which breaks the "no tokens" rule. The ruling lists `.env`, but the intent is secrets-free images.
   Fix: add `.env.*` and `!.env.example`. Also add `*.log`, `bot.log`, `*.bak`, `*.new`, `ban-cu/` and `zalo-hs-bot/` to match `.gitignore`.

### Minor (3)
1. `Dockerfile:3-5`: `COPY . .` runs as root, so the source tree is root-owned. That is fine for a read-only app and the data dir is chowned. Optionally use `COPY --chown=node:node . .` for consistency.
2. `package.json:6-8`: `engines` was reformatted from one line to three lines, which adds churn without changing meaning. Keep it on one line (`"engines": { "node": ">=22.13" }`) to keep the diff minimal.
3. `test/core/smoke.test.mjs:7`: the `DatabaseSync` handle is never closed. Add `db.close()` at the end of the test. This is harmless in an in-memory test, but it is a good habit and avoids leaks if the file is copied.

### ⚠️ Cannot verify from diff
- The Docker image build and run were not done, as the implementer admits. Two points in particular:
  - If Coolify mounts a bind mount instead of a named volume at `/app/data`, it will be root-owned and `USER node` cannot write to it. A named volume inherits the chown.
  - `node:22-alpine` floats. node:sqlite is unflagged from 22.13, so any current 22.x works, but pinning is worth considering later.
- The Co-Authored-By and Claude-Session commit trailers are not visible in the diff header, only the subject.
- Behaviour of the quoted globs when `packs/` is absent was reported working by the implementer and not re-run here. The doubt is low, since Node 22 expands the globs itself.
