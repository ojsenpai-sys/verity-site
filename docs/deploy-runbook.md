# VERITY Deploy Runbook

## Git worktree deployment

`deploy.sh`, `veritysite.key`, `vp_ask2.bat`, and `.env.local` are all
gitignored (local, machine-specific files). `git worktree add` only
checks out tracked files, so a newly created deploy worktree starts
**without** any of them.

When creating a new deploy worktree, copy these in manually before
building:

```
deploy.sh
veritysite.key
vp_ask2.bat
.env.local
```

If `.env.local` is missing or incomplete when `bash deploy.sh` is run,
`next build` still exits 0 — it only prints a warning
(`Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY`)
and continues. Because `NEXT_PUBLIC_*` values are inlined into the
client JS bundle at build time, a build run without them ships a
browser bundle with those values baked in as empty strings — server
rendering and `curl` checks still return HTTP 200 (server code reads
`process.env` at runtime from the VPS's `ecosystem.config.js`), but
every page crashes in the browser once client-side code tries to
create a Supabase client (`@supabase/ssr: Your project's URL and API
key are required...`). This happened in production on 2026-09-14.

The enforcement lives in `package.json`, not in `deploy.sh`:
`npm run build` has a `prebuild` script
(`node scripts/check-build-env.mjs`) that npm always runs before
`build`, per npm's standard pre/post script lifecycle. If
`NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` cannot be
resolved (missing, empty, or whitespace-only), `check-build-env.mjs`
exits 1 and `next build` never starts — this is true for `deploy.sh`,
a developer running `npm run build` by hand, a worktree, or CI,
because it is enforced by the committed `package.json` itself rather
than by any local/gitignored script. `check-build-env.mjs` resolves
env the same way `next build` does internally (via `@next/env`'s
`loadEnvConfig`), so there is no separate resolution logic to drift
out of sync.

`deploy.sh` additionally calls `scripts/check-build-env.mjs` directly
as its very first step, before touching SSH — this is redundant with
the `prebuild` lifecycle (defense-in-depth only) and remains local to
each machine since `deploy.sh` itself is gitignored. The `prebuild`
script in `package.json` is the source of truth; do not rely on
`deploy.sh`'s copy as the primary protection.

Deploying without a correctly populated `.env.local` is no longer
possible; the worktree-copy step above is still required, but
forgetting it now fails loudly (in both `npm run build` and
`deploy.sh`) instead of shipping a broken build.

## Production deployment completion criteria

**HTTP 200 alone is NOT sufficient to declare a browser application
healthy.** A deploy is considered complete only when all of the
following pass:

1. Required build env preflight PASS (`scripts/check-build-env.mjs`)
2. Build PASS (`npm run build` exits 0)
3. `BUILD_ID` matches between local build and VPS
4. Static/server file counts match between local build and VPS
5. PM2 process `online`, no restart-loop
6. HTTP smoke PASS (curl on public routes)
7. Browser render PASS (page actually paints visible content, not a
   blank shell or an interstitial error page)
8. Console fatal error count = 0
9. Network fatal failure count = 0
10. Representative user interaction PASS (e.g. a click, a form, a
    navigation — not just a static screenshot)

Items 1-6 are scriptable and should run on every deploy. Items 7-10
require opening the site in an actual browser (Claude in Chrome or a
human) — this was the gap that let the 2026-09-14 incident ship
undetected despite every curl-based check passing.
