# Neighborhood Sharing and Rental Platform

A web application where neighbors in Saudi Arabia lend or rent occasionally
needed items (tools, ladders, projectors, camping gear) for free or for a daily
fee in SAR, with a separate refundable deposit. Payments and deposits are
**simulated**.

Features: accounts and profiles, listings with photos, discovery with search,
category, neighborhood, date and price filters, availability and booking
requests, simulated payment, pickup and return arrangements, condition records,
messaging, in-app notifications, reviews and public profiles, content reports,
dispute cases with a reviewer workspace and audit trail, saved items with
availability alerts, community requests and offers, related-item suggestions
(AI-assisted with Gemini when configured) and a policy assistant that cites its
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

## Quick start (local)

1. Copy `.env.example` to `.env`; set `FIREBASE_KEY_FILE` to a service-account
   key kept outside this folder.
2. `docker compose up -d --build --wait`
3. Seed once: see `docs/development.md`.
4. Open http://127.0.0.1:3000

## Deploy to Google Cloud

`PROJECT_ID=<id> bash infra/gcp/setup.sh`, then `PROJECT_ID=<id> bash infra/gcp/deploy.sh`.
Full guide: `docs/deployment.md`.

## Checks

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build
```

Functional and browser checks run against a running stack (`docs/development.md`).
