# Neighborhood Sharing and Rental Platform

A web application where neighbors in Saudi Arabia lend or rent occasionally
needed items (tools, ladders, projectors, camping gear) for free or for a daily
fee in SAR, with a separate refundable deposit. Payments and deposits are
**simulated**.

Features: accounts and profiles, listings with photos, discovery with search,
category, neighborhood, date and price filters, availability and booking
requests, simulated payment, pickup and return arrangements, condition records,
messaging, an Activity hub with in-app notifications, reviews and public profiles, content reports,
dispute cases and report moderation (warn, take down, suspend) in an admin workspace with an audit trail, saved items with
availability alerts, community requests and offers, related-item suggestions
(AI-assisted with OpenAI when configured) and a policy assistant that cites its
sources.

## Stack

Next.js 16 (React 19, Tailwind 4) - NestJS 12 - Firebase Authentication and
Cloud Firestore - Zod contracts shared by both apps - pnpm workspace - Docker -
Google Cloud Run.

## Project structure

```
apps/web            Next.js app: src/app (routes), src/features/<name>, src/components, src/lib
apps/api            NestJS API: src/modules/<name>, src/common, test/
packages/contracts  shared Zod schemas, DTOs and booking rules
infra/docker        production Dockerfiles (dev/ for local images)
infra/firebase      Firestore rules and indexes
infra/gcp           Cloud Build pipeline, setup and deploy scripts
scripts/            seed/, admin/, quality/
seed-data/          demo and reference data
tests/              functional API checks, Playwright browser checks
docs/               architecture, deployment, development, design system, decisions
```

## Run with Docker

Needs Docker Desktop (or Docker Engine with Compose v2) and an internet
connection. The first build downloads dependencies and takes several minutes.
The app uses a real Firebase project (Authentication and Firestore); there is
no offline database.

1. Get a Firebase service-account key (JSON) for the project from the team, or
   from Firebase console -> Project settings -> Service accounts. Keep it
   outside this folder and never share or commit it.
2. Create the settings file and point it at the key:
   ```sh
   cp .env.example .env
   # edit .env: FIREBASE_KEY_FILE=/absolute/path/to/key.json
   ```
3. Start the API (port 3001) and the website (port 3000):
   ```sh
   docker compose up -d --build --wait
   ```
4. Open http://127.0.0.1:3000 and sign in with a demo account, for example
   `hanadi@neighborhood-demo.test` / `DemoPass123!` (also `leen@...` and
   `jawharah@...`; Jawharah is the admin).
5. Stop it with `docker compose down`.

The project `neighborhood-sharing` is already seeded. For a new, empty Firebase
project, set `FIREBASE_PROJECT_ID` in `.env`, put that project's web config in
`apps/web/src/lib/firebase-client.ts`, then seed it once (see
`docs/development.md`, "Seed the real project"):
```sh
docker compose run --rm tools npx tsx scripts/seed/demo-data.ts
docker compose run --rm tools node scripts/seed/booking-settings.mjs
docker compose run --rm tools node scripts/seed/policies.mjs
docker compose run --rm tools node scripts/admin/grant-role.mjs --email jawharah@neighborhood-demo.test --role admin
```

AI features are optional: add `OPENAI_API_KEY` to `.env` to turn them on.
Without it, suggestions and the policy assistant use built-in fallbacks.

## Deploy to Google Cloud

`PROJECT_ID=<id> bash infra/gcp/setup.sh`, `PROJECT_ID=<id> bash infra/gcp/deploy.sh`, then `PROJECT_ID=<id> bash infra/gcp/hosting.sh` for the `.web.app` address.
Full guide: `docs/deployment.md`.

## Checks

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build
```

Functional and browser checks run against a running stack (`docs/development.md`).
