# Local development guide

Production deployment (Google Cloud Run) is described in `docs/deployment.md`.

The local stack runs in Docker and uses the **real Firebase project**
(Authentication and Firestore). There are no emulators. Everything you do
locally, including the scripted checks, writes real data; clean test data with
`scripts/admin/reset-demo-data.mjs` (below).

## Prerequisites

- Docker Desktop running.
- The Firebase service-account key JSON on this Mac, **outside** this folder
  (Firebase console -> Project settings -> Service accounts -> Generate new
  private key). Never commit, upload or paste it.
- `.env` in this folder (copy `.env.example`):

| Variable | Value |
| --- | --- |
| `FIREBASE_PROJECT_ID` | `neighborhood-sharing` (must match the key and the web config) |
| `FIREBASE_KEY_FILE` | absolute path to the key JSON; Docker mounts it read-only into the api and tools containers |
| `OPENAI_API_KEY` | optional; without it the AI fallbacks run |
| `OPENAI_MODEL` | `gpt-6-luna` |

The browser signs in with the project's public web config, the default in
`apps/web/src/lib/firebase-client.ts`.

## Images and services

| Image | Role |
| --- | --- |
| `api` | NestJS API on http://127.0.0.1:3001 (`/v1/*`) |
| `web` | Next.js site on http://127.0.0.1:3000 (forwards `/api/*` to the API) |
| `tools` | One-off commands: seeds, roles, lint, tests, checks, evaluation. Not a running service |

## Start and stop

```sh
docker compose up -d --build --wait     # api + web
docker compose stop                     # stop (data lives in Firebase, nothing is lost)
```

For day-to-day work, the dev overlay picks up source edits without rebuilding
(after editing `packages/contracts/src`, run `docker compose restart api`):

```sh
docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait
```

Health: `curl http://127.0.0.1:3001/v1/health/live` and `/v1/health/ready`
(dependencies report `cloud`).

## Seed the real project (idempotent; run in this order)

The tools container mounts `scripts/`, `seed-data/`, `tests/`
and `reports/`, and the key, so no extra flags are needed.

```sh
# Reference data, 3 demo members (Auth + profiles), 48 listings, 48 images
docker compose run --rm tools npx tsx scripts/seed/demo-data.ts
# Booking settings and owner blocks on demo listings
docker compose run --rm tools node scripts/seed/booking-settings.mjs
# 12 policies (version 1.0, approved, imported as published) and 24 passages
docker compose run --rm tools node scripts/seed/policies.mjs
# Reviewer role for the Jawharah demo persona (demo accounts only)
docker compose run --rm tools node scripts/admin/grant-role.mjs --email jawharah@neighborhood-demo.test --role reviewer
# Admin role (needed to publish approved policies)
docker compose run --rm tools node scripts/admin/grant-role.mjs --email jawharah@neighborhood-demo.test --role admin
```

Run `seed/booking-settings.mjs` again after `seed/demo-data.ts`, which rewrites the demo
listings. The Cordless Drill Kit is left without booking settings on purpose: in
the demonstration Leen sets its availability herself.

Demo accounts (fictional personas, password from `SEED_USER_PASSWORD`, default below):
- hanadi@neighborhood-demo.test / DemoPass123!
- leen@neighborhood-demo.test / DemoPass123!
- jawharah@neighborhood-demo.test / DemoPass123!

| Collection | Count | Notes |
| --- | --- | --- |
| regions / cities / neighborhoods / categories | 13 / 17 / 12 / 8 | Saudi reference data, Riyadh neighborhoods |
| users | 3 | Hanadi, Leen, Jawharah |
| listings | 48 | 44 published, 2 draft, 2 paused |
| media | 48 | 45 openly licensed photos (credits: `seed-data/PHOTO_CREDITS.md`) and 3 team-supplied images with no recorded licence; Base64 JPEG in separate documents |
| policies / policyChunks | 12 / 24 | Version 1.0, approved by the project team on 4 Nov 2026, published |

## Checks

```sh
# Lint and typecheck (contracts first)
docker compose run --rm tools sh -c "pnpm --filter @neighborhood/contracts build && pnpm lint && pnpm typecheck"
# Unit tests (booking rules, AI suggestion validation, policy retrieval)
docker compose run --rm tools sh -c "pnpm --filter @neighborhood/api test:unit"
# API integration suite (health, reference data; Jest + NestJS 12 ES modules)
docker compose run --rm -e NODE_OPTIONS=--experimental-vm-modules tools sh -c "pnpm --filter @neighborhood/contracts build && pnpm --filter @neighborhood/api test:api"
# Functional checks F-1..F-72 (needs the seeds and the reviewer role above).
# Waits for real time twice (about 1-2 minutes); creates test data in Firebase.
docker compose run --rm tools node tests/functional/functional-check.mjs
```

Browser checks (Playwright in the web container's network, so 127.0.0.1:3000
works; the browser signs in against Firebase Auth over the internet):

```sh
WEB_ID="$(docker compose ps -q web)"
docker run --rm --network "container:$WEB_ID" -v "$PWD/tests/e2e:/e2e:ro" mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -c "mkdir -p /t && cp -r /e2e/. /t && cd /t && npm init -y >/dev/null && npm i --no-save @playwright/test@1.63.0 >/dev/null && npx playwright test --config playwright.config.ts --reporter=list"
```

Warm the pages first on a freshly started dev server (open `/`,
`/items/itm_laser-level`, `/bookings`, `/messages` once), because the first
request compiles each page.

Without Docker (dependencies installed with `pnpm install --prefer-offline --ignore-scripts`):
`pnpm lint`, `pnpm typecheck`, `pnpm test:unit`,
`pnpm --filter @neighborhood/api build`, `pnpm --filter @neighborhood/web build`.

## Clean test data

```sh
# Dry run: lists the test-created records it would delete
docker compose run --rm tools node scripts/admin/reset-demo-data.mjs
# Delete them (seeded data, policies and the audit trail are kept)
docker compose run --rm tools node scripts/admin/reset-demo-data.mjs --apply --yes
```

Options: `--include-legacy` (Weeks 10-11 leftover test titles on Hanadi's
account), `--include-demo-checks` (simulated verification checks). Run it after
every functional check run and before recording or presenting.

## AI (optional)

Without a key everything works with the fallbacks. With `OPENAI_API_KEY` set in
`.env`, restart the API: `docker compose up -d api`. The local stack sets
`AI_TEST_HOOKS=true` so the functional checks can select an AI stub per request
(header `x-ai-test-scenario`); the API refuses these hooks when
`NODE_ENV=production`.

## Quality tooling (writes to reports/)

```sh
# Policy assistant over the 48 dataset questions -> reports/policy-assistant-<date>.json/.csv
docker compose run --rm tools node scripts/quality/evaluate-policy-assistant.mjs
node scripts/quality/summarize-policy-evaluation.mjs reports/policy-assistant-<date>.csv   # after manual scoring
# Response times -> reports/performance-<date>.json
docker compose run --rm tools node scripts/quality/measure-performance.mjs
```

## Optional sweep

Expiry and overdue are applied whenever a booking or calendar is read or changed.
To also run them in bulk, set `SWEEP_SECRET` for the API and call:

```sh
curl -X POST -H "x-sweep-secret: $SWEEP_SECRET" http://127.0.0.1:3001/v1/internal/sweep
```

## Demonstration scenarios

### Borrowing and lending

1. Leen (`leen@neighborhood-demo.test`): avatar menu → My listings → Cordless Drill Kit → Availability.
   Choose "Review each request", first and last bookable day, Save.
2. Hanadi: open the Cordless Drill Kit, pick two days on the calendar, see the quote
   (rental fee and refundable deposit separate, marked Simulated), add a message,
   Request to book.
3. Jawharah: request overlapping dates for the same item.
4. Leen: the Activity link shows the unread count; accept Hanadi's request on its card.
   Accepting Jawharah's request now fails because the dates are taken.
5. Hanadi: Activity → the booking → Confirm and pay (simulated). Status: Confirmed.
6. Leen and Hanadi: propose and acknowledge the pickup arrangement; exchange messages.
7. Leen: Record collection condition (checklist, optional photo). Hanadi: review and
   agree. Status: In use.
8. Hanadi: Return the item (return condition record), which reports the return.
   Status: Return reported.
9. Leen: Confirm receipt and release deposit. Status: Completed; the simulated deposit
   refund appears in Payments.

### Trust, community and AI

1. Hanadi borrows from Leen (borrowing flow above); after receipt both use "Review ..."
   on the booking page; the reviews appear on `/members/<uid>`.
2. A second exchange: Leen opens "Report a problem" (damage) on the booking.
   Jawharah (reviewer) opens Account menu -> Review workspace, assigns the case,
   reads the condition records, resolves with a partial allocation (the form
   shows "Balanced").
3. Hanadi saves an item that is booked, sets alert dates on Saved items; when the
   booking is cancelled she gets one "A saved item is available" notification.
4. Hanadi posts a community request for a camping tent; Leen offers her listing;
   Hanadi chooses it and lands on the item page with dates filled in.
5. The item page shows "You might also need" (AI-assisted, with the AI note) or
   "Similar items" (no key).
6. Hanadi asks on Policies: "What happens to my deposit if the item comes back
   damaged?"; the answer cites the deposit and dispute policies (version 1.0).
