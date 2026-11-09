# Architecture decisions

Decision log kept during development (D-01 onwards). Earlier entries mention
the development history (sprints, Render, emulators); D-31 and D-32 describe
the delivered setup.

## D-01: Tech stack interpretation

**Date:** 25 September 2026
**Status:** Accepted (confirmed by project owner)

The academic report (Chapter 1, Section 1.9.1) lists Next.js + TypeScript as the
primary framework, PostgreSQL as the proposed database, and optional Python/FastAPI.
The Sprint 1 implementation plan reinterprets the stack as **NestJS (backend) +
Next.js (frontend) + Cloud Firestore + Firebase Auth**. The project owner confirmed
the Sprint 1 plan interpretation as authoritative on 25 September 2026.

Rationale: Firestore + Firebase Auth provide an emulator-backed development
environment that avoids a separate database server while supporting the real
data-access patterns (server-side authorization, typed repositories, transactions)
the project needs. Gemini remains the chosen future AI provider but is deferred.

## D-02: Pinned versions

Resolved once in Phase 01 to prevent every phase from installing its own preference.

| Concern | Version | Notes |
| --- | --- | --- |
| Node.js | 24.21.0 LTS | Docker `node:24.21.0-bookworm-slim` |
| pnpm | 12.6.0 | Via corepack; pinned in `packageManager` field |
| Next.js | 16.3.6 | App Router |
| React | 19.3.0 | |
| NestJS | 12.1.0 | Common, Core, Platform-Express, Config, Swagger |
| TypeScript | 5.9.3 | TS 7 is not supported by ts-jest (<7 constraint) |
| Zod | 4.6.5 | Shared contracts; server-validated |
| Jest | 30.5.2 | Unit + API tests |
| ts-jest | 29.4.13 | TS 5.x compatible |
| Playwright | 1.63.0 | E2e skeleton |
| Tailwind CSS | 4.3.3 | Via @tailwindcss/postcss |
| Pino | 10.3.1 | Structured, redacted logging |
| firebase-tools | 15.31.0 | Emulator image |
| firebase-admin | 14.5.0 | NestJS Admin SDK (Phase 02) |
| Sharp | 0.35.4 | Image processing (Phase 05) |
| OpenJDK | 21 | Emulator image JRE (trixie-slim base; firebase-tools 15.31 requires Java 21+)

## D-03: Module system

- **API (NestJS):** CommonJS — `module: "CommonJS"`, `moduleResolution: "Node"`.
  NestJS decorators and metadata are most stable under CommonJS.
- **Web (Next.js):** ESNext/bundler — Next.js manages module resolution internally.
- **Shared packages:** CommonJS — importable by both consumers without ESM/CJS conflicts.

## D-04: Docker-first workflow

No host Node.js or pnpm installation required. All development, testing, and
seeding runs inside Docker containers:

- `docker compose up --build` — starts web, API, and emulators
- `docker compose run --rm tools pnpm <cmd>` — runs any pnpm script in the tools container

Services bind to `127.0.0.1` only. Container-internal addresses (`http://api:3001`,
`emulators:8080/9099`) are separate from browser-reachable `127.0.0.1` addresses.

## D-05: Sprint 1 scope boundaries

**Included:** foundation, Docker, auth, profiles, reference data, seed import,
listing lifecycle, image pipeline, public discovery, search, access controls, tests.

**Excluded (no fake buttons):** bookings, payments, chat, favorites, community
requests, condition reports, reviews, disputes, maps/radius, live Gemini, production hosting.

## D-06: Emulator data persistence

Emulator data persists via `--import /data --export-on-exit /data` on a named
Docker volume (`emulator-data`). This is tested at the Phase 01 gate — a mounted
volume alone does not guarantee persistence.

## D-07: Sprint 2 scope

**Date:** 3 November 2026
**Status:** Implemented in code; not yet run in Docker (see `docs/Sprint_2_Summary.md`)

**Included:** booking settings and owner unavailable periods, public availability,
server quote, booking requests (approval and instant), accept/decline, simulated
confirmation, cancellation, expiry, bookings workspace, messaging, in-app
notifications, pickup/return arrangements, condition records with private
photos, overdue, return, owner receipt, issue reporting into `disputed`,
production Dockerfiles and a Render blueprint.

**Excluded (no buttons shown):** reviews, dispute resolution and administration,
reports, favorites and alerts, community requests, Gemini, verification checks,
date/distance filters on Explore, real payments, email/push, extensions, Arabic UI.

## D-08: One calendar guard per listing, buffered writes, lazy system transitions

Every command that affects a listing's calendar runs in
`CalendarGuardService.withListingCalendar(listingId, fn)`. The transaction reads
`calendarControls/{listingId}`, all live `availabilityBlocks` of the listing and
the bookings behind every live reservation, and always rewrites the guard, so
competing commands contend on one document. Writes are collected in a
`WriteBuffer` and applied at the end, which satisfies Firestore's
"all reads before writes" rule and coalesces repeated writes to one document.

Expiry and overdue are applied lazily on every read and command (and by the
optional `POST /v1/internal/sweep`), because free hosting has no reliable
scheduler. When a command is refused because its booking just expired, the
expiry is still committed and the 409 is returned afterwards.

The guard's `blockingBookingId` is derived from the real states of the loaded
bookings in every transaction (overdue, return pending, disputed), so it cannot
stay stale and a second unresolved booking keeps the item on hold.

## D-09: Idempotency through deterministic document ids

- Booking id = hash of borrower UID + `clientRequestId`; a repeat returns the same booking.
- Events `{bookingId}_{sequence}`; booking notifications derived from booking, sequence and recipient.
- Payments `pay_{bookingId}_{component}_{operation}`; deposits keyed by booking id.
- Messages derived from conversation, sender and `clientMessageId`.
- One unread message notification per conversation and recipient, refreshed in place.
- Condition reports `cr_{bookingId}_{stage}` (one per stage in Sprint 2).
- Owner blocks derived from listing, owner and `clientRequestId`.

## D-10: Simulated money

Payments and deposits are records only, always `mode: "simulated"`, and every
money figure in the interface carries a visible "Simulated" label. Payment
records are written when the borrower confirms (rental collect, deposit collect)
and refunded in full on cancellation before collection. The deposit document is
created at confirmation (status `held`), refunded on owner receipt (`settled`),
and set to `under_review` when an issue is reported. `compensationHalalas` stays 0
until dispute resolution exists. Zero-total bookings create no payment or
deposit records. These are draft demonstration rules pending team approval.

## D-11: Revisions and immutability

The booking `revision` increases only on status changes, so arrangement updates
and condition records do not make the other member's page stale. Arrangements
carry their own revision; a change clears the acknowledgement and needs the
other member to acknowledge again. Condition records are immutable; Sprint 2
allows one record per stage (no superseding versions). The borrower may change a
recorded disagreement to agreement; both answers stay in the timeline.

## D-12: Request rules

- Pending requests do not reserve dates; several pending requests may overlap.
- A request is refused if its dates overlap a live block, or while the item is on hold.
- Accepting rechecks availability inside the guard and is refused (409) if the
  dates were taken or the listing is no longer published.
- The quote fingerprint covers the listing revision, terms and dates, so any
  listing change after the quote requires the borrower to review a new quote.
- A borrower needs a completed profile and cannot request their own item.
- Collection can be recorded any time after confirmation; overdue starts at the
  agreed return time.

## D-13: Queries without composite indexes

All new queries use equality filters (`where a == x [and b == y]` or
`array-contains`) and sort bounded results in memory. Message polling with a
cursor reads only the conversation document unless a newer message exists. The
unread badge uses a count aggregation with a fallback. Recorded as a limitation:
conversations and notification lists read all of a member's documents.

## D-14: Public owner field and media purpose

Public item details return `ownerId` and an `isOwner` flag (from an optional
bearer token) instead of `ownerUid`. Media documents gain `purpose`
(`listing` or `condition`) and `parentType`/`parentId`; condition photos are
served only through `GET /v1/me/bookings/:id/media/:mediaId` to the two
participants. Listing photo detach now only affects photos of that listing.

## D-15: Deployment configuration

Two Docker images (`infra/docker/api.prod.Dockerfile`, `infra/docker/web.prod.Dockerfile`)
and a `render.yaml` blueprint for two free Render web services. The API reads the
service account from `FIREBASE_SERVICE_ACCOUNT_BASE64` (or `_JSON`, or a key file
path), entered by the team as a secret; it is never logged or committed. The web
image receives the API origin and public Firebase config as build arguments.
Deployment needs the team's accounts (plan gates G2/G3); see `docs/deployment.md`.

## D-16: No package changes in Sprint 2

No npm packages were added and no `package.json` changed, so Docker images do not
reinstall dependencies. The Sprint 2 seed is run with `node scripts/seed-sprint2.mjs`
rather than a new package script.

## D-17: Differences from the plan and design baseline

- Extra booking timestamps: `expiredAt`, `overdueAt`, `disputedAt`; `conversationId` on the booking.
- Arrangement objects also store `proposedByUid` and `proposedAt`.
- Conversations also store `createdByUid` (an enquiry with no messages is shown
  only to the member who opened it) and `lastMessageId` (cheap polling).
- Reservation blocks store `holdExpiresAt` while the booking is accepted.
- Event ids pad the sequence (`{bookingId}_0001`) so they sort as text.
- Deposit status `pending` is defined but unused (the deposit record starts at confirmation).
- Condition overall values add `damaged` to the listing condition scale.

## D-18: Sprint 3 scope

**Date:** 3 November 2026
**Status:** Implemented in code; not yet run in Docker (see `docs/Sprint_3_Summary.md`)

Included: roles and audit trail, reviews and public profiles, reports, dispute
cases with resolution by an authorised reviewer, verification (email plus
labelled demonstration checks), profile photo and preferences, favorites with
availability alerts, community requests and offers, Explore date and price
filters, AI-assisted related items, policy pages and the policy assistant,
condition-record corrections, demo data reset, rate limits, evaluation tooling.
Not included (future work): distance search, real payments, real identity
checks, email/push notifications, scheduler beyond the sweep endpoint, full
Arabic interface, booking extensions, native apps.

## D-19: Reviewer role and conflict of interest

`roleAssignments/{uid}` holds `reviewer`/`admin`; granted only by
`scripts/grant-role.mjs` (fictional @neighborhood-demo.test accounts only) and
read by `RolesGuard` on every privileged request. The plan assigns the reviewer
role to the Jawharah demo persona (gate G6; not granted automatically). A
reviewer cannot take, read the evidence of, or resolve a case or report they are
part of (409, case stays waiting). Policy publishing needs the `admin` role.

## D-20: Audit trail

Every privileged write (assign, close, resolve, hide, verification decision,
policy publish, role change) writes one `auditEvents` document in the same
transaction; every reviewer read of private evidence (dispute evidence,
evidence photos, reported private messages) writes one after the read. Events
hold ids, the action, a reason and a bounded summary; never message text,
addresses or image data.

## D-21: Disputes

One case per booking (`dsp_{bookingId}`). The Sprint 2 `report-issue` route now
opens a case. During use the booking becomes `disputed`, the item is held and
the deposit goes under review; after completion (within the 14-day draft
window) it is a complaint that moves no money. Resolution requires
refund + compensation = held deposit, writes simulated `refund` and
`compensation` payment records, settles the deposit, completes the booking and
notifies both members, all in one calendar-guard transaction. `lost` and
`needs_repair` keep the item on hold (`calendarControls.itemHold`) and pause the
listing until the owner republishes it. Participants see the reviewer's decision
as "authorised reviewer"; the reviewer's identity is in the audit trail.

## D-22: Reviews and reputation

Participants of a completed booking review each other once within 14 days
(draft). Reviews are about the person. Moderation hides a review with a reason;
it never edits the rating. Reputation (count and average) is computed from
visible reviews on read. Members may hide review texts on their profile; the
rating summary stays visible.

## D-23: Verification labels

Only two public labels exist: "Email verified" (from Firebase) and
"Demo check (simulated)". Demonstration checks collect no documents, are
decided by a reviewer and never read as identity verification. The legacy
profile field `verificationStatus` is not shown.

## D-24: Favorites alerts

Saving never reserves. The calendar guard records released intervals and,
after commit, calls registered listeners; favorites with alerts on and desired
dates overlapping a release get at most one alert per `availabilityRevision`,
only if the dates are bookable at that moment.

## D-25: Community requests

Requests show title, category, neighborhood and dates only. Offers must
reference the owner's own published listing. Choosing an offer returns the item
page with dates prefilled; nothing is reserved. A booking created with
`requestOfferId` marks the request fulfilled in the same transaction (even if
the owner later declines; the requester can post again).

## D-26: Catalogue queries

Explore filters that are equalities run in Firestore (status, category,
neighborhood, lending mode); search, price range and date availability are
applied to batches in memory. Results follow document id order with a stable
cursor (newest-first would need a composite index; one is prepared in
`infra/firebase/firestore.indexes.json`). Each request scans at most 240
documents and reports `scanLimitReached` instead of claiming there are no more
matches. This closes Weeks 10-11 limitation 3 at demonstration scale.

## D-27: AI design

Gemini is called with `fetch` (no SDK), model from `GEMINI_MODEL`, key from
`GEMINI_API_KEY` (entered by the team), JSON schema output, 8-second timeout and
one retry. Without a key, or on any failure, suggestions fall back to
same-category items labelled "Similar items" and the policy assistant shows the
matching policy text. Only public listing fields and policy passages are sent.
Model output is validated: unknown ids are discarded, citations must be among
the retrieved policies, and text that exposes configuration is replaced by the
extractive answer. Development-only test hooks (`AI_TEST_HOOKS=true`, refused
when `NODE_ENV=production`) select a stub per request so fallback and
validation can be checked without a key.

## D-28: Policy assistant

Keyword and topic retrieval (English and Arabic normalisation) over the policy
versions in force, or the booking's agreed versions (`termsSnapshot.policyVersionIds`,
recorded at request time). Instruction-override questions receive a fixed
boundary answer and never reach the model; requests for actions are answered
with what the assistant cannot do. Answers based on drafts carry a draft notice.
Questions and answers are not stored; `POLICY_ASSISTANT_DIAGNOSTICS=true`
records only policy ids, latency and outcome.

## D-29: Remaining limitations closed

- Media: `widthPx`/`heightPx` now store the real resized main dimensions; the
  thumbnail and original sizes are stored separately; the media contract matches
  the stored fields (limitation 4).
- Jest: the API integration suite runs with
  `NODE_OPTIONS=--experimental-vm-modules` (Node 24 and Jest 30 load NestJS 12's
  ES modules that way); no package change (limitation 5).
- Condition records: corrections are new versions (`supersedesId`), the latest
  version is used everywhere and earlier versions stay readable.

## D-30: Sprint 3 differences from the plan

- `POST /me/bookings/:id/review` and the public profile routes are as planned;
  additionally `GET /members/:uid/photo` serves the optional profile photo.
- Reviewer workspace adds `GET /admin/reports/:id`, report and dispute evidence
  photo routes, `POST /admin/verification/:id/decide` and `GET /admin/audit`.
- Correction route: `POST /me/bookings/:id/condition/{stage}/correct`.
- Report categories, dispute issues and item outcomes are fixed enums (see contracts).
- Distance search is not implemented (no sourced neighborhood geometry).

## D-31: Local stack uses the real Firebase project (4 November 2026)

At the user's request the Firebase emulators were removed. The local Docker
stack (api, web, tools) uses the real project `neighborhood-sharing`, the same
as the hosted services.

- The service-account key stays outside the repository; `FIREBASE_KEY_FILE` in
  `.env` names it and Docker mounts it read-only at
  `/run/secrets/firebase-key.json` (never copied into an image).
- Seeding: `seed-demo-cloud.ts`, then `seed-sprint2.mjs`, `seed-sprint3.mjs`,
  `grant-role.mjs`; scripts share `scripts/lib/firebase-admin.mjs`.
- Removed: emulator image and entrypoint, emulator-only seeds
  (`seed-references.mjs`, `seed-demo.ts`, `cleanup-stale-media.mjs`), the
  browser-test auth proxy, and the integration test that created Auth users.
- Consequence: scripted checks write real data, so `reset-demo.mjs` runs after
  them; Firestore free-tier quotas apply; checks sign in with the public web API key.

## D-32: Production on Google Cloud Run (client delivery)

The product is delivered with an industry-standard layout (`apps/web`,
`apps/api`, `packages/contracts`, `infra/`, `scripts/`, `seed-data/`) and is
deployed to Google Cloud, replacing the earlier Render preparation.

- Two Cloud Run services built by Cloud Build and stored in Artifact Registry
  (`infra/gcp/cloudbuild.yaml`); one-time setup in `infra/gcp/setup.sh`.
- The API runs as its own service account with least privilege
  (`roles/datastore.user`, `roles/firebaseauth.viewer`) and uses Application
  Default Credentials; no key file in production.
- Optional secrets (OpenAI key, sweep secret) in Secret Manager.
- API limited to one instance so the in-memory rate limits stay consistent.

## D-33: Openly licensed demo photos

46 of the 48 demonstration listings use real, openly licensed photos from
Wikimedia Commons and Flickr (CC0, public domain, CC BY, CC BY-SA), cropped or
framed to 4:3 at 1600x1200 with metadata removed (`seed-data/assets/photos/`).
Each credit is stored in `seed-data/collections/assets.json`, saved on the media
document by the seed,;
`seed-data/PHOTO_CREDITS.md` lists all. Presentation Clicker and Backdrop Stand
keep a text placeholder. Photo media ids are `media_photo_<listingId>`.

## D-34: Policies approved (version 1.0)

The project team approved all 12 policies on 4 November 2026. In the seed data
they are version 1.0 with status "approved"; `scripts/seed/policies.mjs`
imports approved policies as published (audit event per policy, actor
`seed:approved-dataset`) and anything unapproved as a draft. Later versions are
published through the admin policy page or `scripts/admin/publish-policies.mjs`
(same changes as the publish endpoint, audited). The policy assistant shows a
draft notice only when a cited policy is still a draft, and the evaluation
script checks for it only in that case.

## D-35: AI provider is OpenAI

Earlier entries mention Gemini, the provider used during development. The
product uses OpenAI: `AiClient` (`apps/api/src/modules/ai/ai.client.ts`) calls
Chat Completions with `fetch`, and the pure `openai-format.ts` builds the
request and reads the answer. Settings: `OPENAI_API_KEY` (Secret Manager
`openai-api-key` on Google Cloud), `OPENAI_MODEL` (default `gpt-6-luna`),
`OPENAI_BASE_URL`. Answers use Structured Outputs with `strict: true`,
`reasoning_effort: "none"` to stay inside the 8-second timeout, and
`max_completion_tokens`. Without a key or credit, the fallbacks run.

## D-36: Photo credit line removed from the website (4 November 2026)

At the user's request the "Photo: author, licence" line was removed from the item
page, with the API field that fed it. Credits stay in `assets.json`, on the media
documents and in `PHOTO_CREDITS.md`. Known consequence: 40 of the 46 photos are CC BY
or CC BY-SA and need visible attribution, so public use needs a credits page or
replacement photos (the 6 CC0 and public domain photos do not).

Decision on 4 November 2026: the user chose not to add a credits page. The site goes
online without visible credits for those 40 photos, with that licence risk accepted.

## D-37: Browser caching for public listing photos (4 November 2026)

Public listing photos were `no-store`, so every return to Explore downloaded them
again (about 0.24 seconds and two Firestore reads each). The user chose a 1-hour
browser cache: `Cache-Control: private, max-age=3600` on `GET /media/:id` only.
Media ids are never reused. Trade-off accepted: someone who already saw a photo may
see it from their own browser for up to 1 hour after a listing is paused; all new
requests are still checked and refused at once (MAN-18). MAN-14 was changed with the
user's approval and now also requires owner media to stay `no-store`.

Explore also keeps the first page per filter set in memory while the tab is open and
refreshes it in the background, and `ImageFrame` skips the fade for images the
browser already has.

## D-38: Calm Tech interface

The interface uses the "Calm Tech" design: Sora and DM Sans, one teal accent, frosted
glass only on the navigation layer. One what, where, when search leads to simple cards;
`RangeCalendar` handles booking dates (default times 17:00, or 09:00 to 17:00 for a same-day
pick) and dates carry from search to the item page. `/activity` gathers what needs the
member, messages and updates from existing APIs, with Accept and Decline on the card.
Phones use a tab bar and a fixed booking bar. An Arabic interface and language switch are
future work; Arabic item text sits behind "Read in Arabic".

## D-39: Team-supplied images for the last two listings (4 November 2026)

Presentation Clicker and Backdrop Stand had no suitable open photo, so the user supplied
two images and asked to use them. They replace the text placeholders in the real project
and the seed data. Their source and licence are not recorded, so `credit` says "Not
recorded" rather than inventing one. Known consequence: the rights must be confirmed, or
the images replaced, before public use. `replace-demo-photos.mjs` gained `--only` so that
the other listings are not rewritten.

The same day the user also replaced the Air Fryer, Camera Tripod and Cleaning Brush Kit photos with supplied images, on the same terms. That leaves 43 openly licensed photos, of which 37 need a visible credit (D-36 said 40 of 46).

## D-40: Photos are optional for publishing (8 November 2026)

The user decided that a listing can be published without a photo. The API no
longer refuses to publish a listing with no images; cards and the item page show
the category illustration instead. Members can still add up to 3 photos on the
create and edit pages. Functional check MAN-07, which expected the refusal, now
checks that a listing without a photo publishes (on a separate listing, archived
afterwards). This changes the earlier rule (Week 9 design baseline) that a
listing needs a photo before it goes public.

## D-41: Pickup and return reminders without a scheduler (9 November 2026)

The requirement "the workflow supports ... reminders" was not covered. Reminders
are now in-app notifications: a pickup reminder to both members when a confirmed
booking's pickup is within 24 hours (`BOOKING_CONFIG.reminderLeadHours`), and a
return reminder to both when an active booking's return time is within 24 hours.
Free hosting has no scheduler, so, like expiry and overdue, reminders are created
lazily: when a member opens notifications, when the badge polls (at most once a
minute per member), and by `POST /v1/internal/sweep` if `SWEEP_SECRET` is set.
Each reminder has a fixed id per booking, kind and member and is written with
`create()`, so it is sent once. Reminders do not change the booking. Consequence:
a reminder appears the next time the member uses the app, not at an exact time;
there are still no push or email notifications. Functional check F-73.

## D-42: Moderation decisions with real effects (9 November 2026)

Before this change a reviewer closed a report with an outcome label only; nothing
happened to the listing or the member, and the reported member was never told.
The team asked for graded actions. The reporter still chooses the type and gives
a description and optional photos; the reviewer, not the reporter, judges
severity (the queue shows a suggested severity per type: unsafe and fraud high,
harassment and inappropriate medium, misleading, spam and other low). The
assigned reviewer records one decision with a note (`POST /v1/admin/reports/:id/decide`):

- invalid: closed; the reporter sees the note; nothing else changes.
- low, warn: the reported member is told what to fix; nothing is removed.
- medium, take down: a listing is archived with `moderationStatus: "removed"`
  and its pending, accepted and confirmed bookings are cancelled in the
  calendar transaction (simulated payments refunded); the owner cannot edit or
  republish it. A message is replaced by a placeholder; a review is hidden.
  Not offered for member reports.
- high, suspend: `users/{uid}.accountStatus = "suspended"`; the Firebase Auth
  account is disabled and its refresh tokens revoked; the auth guard refuses
  every protected route with 403 `account_suspended` (active status cached 30 s
  per instance, suspension never cached); the public profile returns 404; the
  member's published listings are paused with `suspensionHold` and their
  upcoming bookings are cancelled. Bookings already handed over stay open; the
  other member can report an issue. A reviewer or admin cannot be suspended
  until an admin removes the role.

Effects run first and are safe to repeat, then the report is closed in one
transaction with the notifications and the audit event. The reporter sees the
outcome, not the note addressed to the reported member. The reviewer sees how
many earlier reports about the same member were upheld; strikes are shown, not
applied automatically. Admins only (`GET /v1/admin/moderation`,
`POST /v1/admin/listings/:id/restore`, `POST /v1/admin/members/:uid/reinstate`)
can restore a removed listing (as paused) and lift a suspension (listings held
by it are published again). Consequence: no appeal flow and no email to the
member; there is no admin account until the team grants the admin role with
`scripts/grant-role.mjs --role admin`. Functional checks F-74..F-77 (F-77 needs
the admin role and is skipped without it).

## D-43: One privileged role, "admin" (9 November 2026)

The team decided that two privileged roles (reviewer and admin) add nothing for
this project, since admin only added restoring listings, lifting suspensions and
publishing policies. There is now one role, `admin`, which does everything the
reviewer did plus those actions. All user-facing wording says "admin" (Admin
workspace, "removed by an admin"). For existing data: a stored role assignment
of `"reviewer"` is read as admin (Jawharah needs no data change), and
`scripts/grant-role.mjs` writes only `admin` and drops the old value. Stored
field names are unchanged (`assignedReviewerUid`, dispute statements with
`byRole: "reviewer"`) to avoid migrating saved data; they are displayed as
"Admin". Conflict-of-interest rules are unchanged: an admin involved in a
report or case cannot handle it. An admin cannot be suspended until the role is
revoked.
