# Cycle — project brief for Claude Code

Context handoff from a prior chat session. This is a private period-tracking
PWA Enoch is building as a birthday gift for his girlfriend. Read this
before making changes so decisions already made don't get re-litigated.

## Goal

A cycle-prediction app for two people (Enoch + girlfriend), private, no
app store, no third-party backend. Given as a birthday gift.

## Key decisions already made (don't re-open without reason)

- **Built custom instead of Lovable.** Lovable would default to a
  Lovable/Supabase-hosted backend for something this privacy-sensitive
  (menstrual health data). Enoch already has the AWS/Terraform skills to
  self-host, so this is a hand-built stack he fully owns and controls.
- **PWA, not a native app / App Store listing.** Installed via "Add to
  Home Screen" on iOS Safari / Android Chrome. Keeps it off any app store
  and out of any review process — just a URL only the two of them know.
- **Synced between both phones**, not local-only. Both of them can log a
  date; both see the same predictions. This is why there's a backend at
  all instead of pure client-side storage.
- **Auth is a single shared passcode**, checked by the Lambda, sent as an
  `x-passcode` header, saved in the phone's localStorage after first
  entry. Deliberately lightweight — appropriate for two known people, not
  meant to be enterprise-grade. If it ever needs hardening, Cognito is the
  natural next step (Enoch's already used it on a separate project).
- **All prediction math is client-side** (`frontend/js/cycle.js`). The
  backend is dumb storage only (raw date strings in DynamoDB) — this
  keeps the logic in one place and the backend trivial.
- **Historical dates never go into git.** They're seeded via
  `backend/scripts/seed-dates.mjs` reading from a gitignored
  `dates.local.json`, or typed into the app's History tab directly. Never
  hardcode real dates into any tracked file.

## Architecture

```
frontend/          Static PWA — HTML/CSS/vanilla JS, no framework
  js/cycle.js       Pure prediction logic (cycle length, next period,
                    fertile window, variance) — unit-testable in isolation
  js/api.js         Fetch wrapper, sends x-passcode header
  js/app.js         DOM wiring: Today / Calendar / History tabs
  js/config.js      API_BASE_URL + PERIOD_LENGTH_DAYS — set after deploy
  manifest.json + service-worker.js   installability + offline shell
  icons/            generated via icons/generate_icons.py (Pillow)

backend/
  lambda/index.mjs   Single Lambda: GET/POST /logs, DELETE /logs/{date}
  terraform/         DynamoDB (on-demand) + Lambda + API Gateway HTTP API
                      + S3/CloudFront static hosting, all in one apply
  scripts/seed-dates.mjs   Bulk-loads historical dates via the API
```

Data flow: phone → API Gateway → Lambda → DynamoDB (raw dates only) →
Lambda → phone → `cycle.js` computes predictions on-device.

## Status

Scaffolded and built in the prior session. `cycle.js` logic was sanity
tested against sample dates and passed. All JS files pass `node --check`.
Terraform config was hand-reviewed (terraform itself wasn't available to
run `validate`/`plan` in that session's sandbox — do that here before
`apply`).

**Not yet done:**
- `terraform apply` has not actually been run against Enoch's AWS account
- `frontend/js/config.js` still has the placeholder `API_BASE_URL`
- Real historical dates haven't been seeded yet
- Nothing has been installed on either phone yet
- No git repo exists yet for this project

## Next steps (likely what Enoch wants help with here)

1. `git init` this project (a `.gitignore` is already in place —
   excludes tfvars, terraform state, node_modules, build output, and
   `dates.local.json`)
2. Walk through `README.md` to actually deploy: `npm install` the Lambda
   deps, set `terraform.tfvars` with a passcode, `terraform apply`, wire
   `config.js` to the real API URL, sync `frontend/` to S3, invalidate
   CloudFront
3. Seed her real historical dates via `backend/scripts/seed-dates.mjs`
4. Install on both phones via "Add to Home Screen" and test the full
   flow (log a date on one phone, confirm it shows on the other)
5. Optional later: custom domain, Cognito-based auth if the shared
   passcode ever feels insufficient

## Working style notes

Enoch is a DevOps engineer (AWS-focused, Terraform/Kubernetes/CI-CD
daily) — comfortable with infra detail, no need to over-explain AWS or
Terraform basics. When presenting code changes, show only what's added or
modified rather than reprinting full files. Keep acronyms unexpanded
(AWS, PWA, etc. are fine as-is).
