# Architecture

## Overview

The Neighborhood Sharing and Rental Platform is a pnpm monorepo with a NestJS backend API and a Next.js frontend, backed by Firebase Auth and Cloud Firestore. Production runs on Google Cloud Run (API and web as two services) in the same Google Cloud project as Firebase; local development uses Docker Compose against the same kind of real Firebase project (no emulators).

```
Browser
  ├── Firebase Auth SDK → Firebase Authentication (real project)
  │     └── onAuthStateChanged → AuthProvider → useAuth
  └── Next.js (127.0.0.1:3000)
        ├── /api/* → rewrites to NestJS /v1/* (server-side)
        └── API client (apiFetch)
              ├── getIdToken() from Firebase user → cached with expiry
              ├── Attaches Bearer token to authenticated requests
              ├── 401 → force token refresh → one retry
              └── → NestJS /v1 API (127.0.0.1:3001)
                    ├── AuthGuard verifies Firebase ID token
                    ├── Firestore Admin SDK → Cloud Firestore (service-account key)
                    └── Sharp image processing → Base64 in Firestore media documents
```

## Stack

| Concern | Technology | Version |
| --- | --- | --- |
| Runtime | Node.js | 24.21.0 |
| Package manager | pnpm | 12.6.0 |
| Frontend | Next.js (App Router) | 16.3.6 |
| Backend | NestJS (Express adapter) | 12.1.0 |
| Language | TypeScript | 5.9.3 |
| Auth | Firebase Authentication | 12.19.0 (client), 14.5.0 (admin) |
| Database | Cloud Firestore (via Admin SDK) | — |
| Image processing | Sharp | 0.35.4 |
| UI | Tailwind CSS, Lucide icons | 4.3.3, 1.48.0 |
| Testing | Jest, Playwright | 30.5.2, 1.63.0 |

## Monorepo structure

```
apps/
  web/                    Next.js app (App Router)
    src/app/              routes (pages and layouts only)
    src/features/<name>/  feature API calls, hooks and feature components
    src/components/       shared ui/ controls and layout/
    src/lib/              Firebase client, fetch wrapper, formatting
  api/                    NestJS API
    src/modules/<name>/   feature modules (controller, service, repository)
    src/common/           guards, validation, errors, logging, repositories
    test/                 unit and integration tests
packages/
  contracts/              shared Zod schemas, DTOs and pure booking rules
infra/
  docker/                 production Dockerfiles (api, web); dev/ for local images
  firebase/               firestore.rules, firestore.indexes.json, firebase.json
  gcp/                    Cloud Build pipeline, setup and deploy scripts
scripts/
  seed/                   demo data, booking settings, policies
  admin/                  role grants, demo data reset
  quality/                policy assistant evaluation, response-time measurement
  lib/                    shared Firebase Admin start-up
seed-data/                seed collections (JSON) and placeholder images
tests/
  functional/             scripted API checks
  e2e/                    Playwright browser checks
docs/                     documentation
```

## API surface

### Public (no auth)
| Method | Path | Purpose |
| --- | --- | --- |
| GET | /v1/health/live | Process liveness |
| GET | /v1/health/ready | Readiness; Firebase dependencies report `cloud` |
| GET | /v1/reference-data | Regions, cities, neighborhoods, categories |
| GET | /v1/listings | Published catalogue (filters, search, pagination) |
| GET | /v1/listings/:id | Published listing detail |
| GET | /v1/media/:id | Public media (listing images only; parent listing published) |
| GET | /v1/listings/:id/availability?from&to | Busy intervals and bookable window (no reasons) |
| POST | /v1/listings/:id/quote | Server quote and availability; optional token marks own item |
| POST | /v1/internal/sweep | Bulk expiry/overdue; needs `x-sweep-secret`, disabled unless `SWEEP_SECRET` is set |

### Authenticated
| Method | Path | Purpose |
| --- | --- | --- |
| GET | /v1/me | Profile or setupNeeded state |
| PUT | /v1/me/profile | Create profile (repeatable) |
| PATCH | /v1/me/profile | Update profile (allowlisted) |
| GET | /v1/me/listings | Owner inventory (with status filter) |
| GET | /v1/me/listings/:id | Owner edit record |
| POST | /v1/me/listings | Create draft (with dedup) |
| PATCH | /v1/me/listings/:id | Edit content (allowlisted + revision) |
| POST | /v1/me/listings/:id/publish | Publish draft/paused |
| POST | /v1/me/listings/:id/pause | Pause published |
| POST | /v1/me/listings/:id/archive | Archive (soft, terminal) |
| POST | /v1/me/listings/:id/media | Attach media (transactional) |
| DELETE | /v1/me/listings/:id/media/:mediaId | Detach media |
| POST | /v1/me/media | Upload image (multipart) |
| GET | /v1/me/media/:id | Owner read (private) |
| DELETE | /v1/me/media/:id | Delete unattached |

### Authenticated, exchange workflow (participants only; anyone else gets 404)
| Method | Path | Purpose |
| --- | --- | --- |
| PATCH | /v1/me/listings/:id/booking-settings | Booking mode and bookable window (`expectedRevision`) |
| GET | /v1/me/listings/:id/blocks | Owner blocks (with private notes) and reservations |
| POST | /v1/me/listings/:id/blocks | Add an unavailable period (refused over a live reservation) |
| DELETE | /v1/me/listings/:id/blocks/:blockId | Remove an unavailable period |
| POST | /v1/me/bookings | Request (approval) or book (instant); `clientRequestId`, `quoteFingerprint` |
| GET | /v1/me/bookings?role=borrower\|owner&status= | Borrowing / Lending lists with available commands |
| GET | /v1/me/bookings/:id | Detail: terms, events, payments, deposit, arrangements, condition records |
| POST | /v1/me/bookings/:id/{accept,decline,confirm,cancel} | Decisions (`expectedRevision`) |
| PUT | /v1/me/bookings/:id/arrangements/{pickup,return} | Propose pickup/return details (private) |
| POST | /v1/me/bookings/:id/arrangements/{pickup,return}/acknowledge | Other member acknowledges |
| POST | /v1/me/bookings/:id/condition/{collection,return} | Submit a condition record (immutable) |
| POST | /v1/me/bookings/:id/condition/collection/acknowledge | Borrower agrees (active) or disagrees |
| POST | /v1/me/bookings/:id/{report-return,confirm-receipt,report-issue} | Return, completion, issue |
| GET | /v1/me/bookings/:id/media/:mediaId?variant= | Condition photo |
| POST | /v1/me/conversations | Find or create (listing enquiry or booking) |
| GET | /v1/me/conversations | List with unread markers |
| GET | /v1/me/conversations/:id | One conversation |
| GET | /v1/me/conversations/:id/messages?after= | Poll with a cursor |
| POST | /v1/me/conversations/:id/messages | Send (`clientMessageId`) |
| POST | /v1/me/conversations/:id/read | Mark read |
| GET | /v1/me/notifications | Own notifications, newest first |
| GET | /v1/me/notifications/unread-count | Bell badge |
| POST | /v1/me/notifications/:id/read, /v1/me/notifications/read-all | Mark read |

`POST /v1/me/media` accepts an optional `purpose` field (`listing` or `condition`).

## Security model

- Firebase ID tokens verified server-side via Admin SDK
- Browser never touches Firestore directly (default-deny rules)
- Public endpoints use explicit allowlisted response fields
- Owner-only endpoints check `ownerUid` from token, not from request body
- Revision-based optimistic concurrency prevents stale edits
- Media access follows current listing visibility
- `Cache-Control: no-store` on all media responses
- Security headers: nosniff, DENY frame, referrer-policy, permissions-policy
- Payments and deposits are simulated records only (`mode: "simulated"`)
- Booking, conversation and condition-photo routes return 404 to non-participants
- Pickup/return details, messages and condition photos are participant-only;
  public availability shows busy intervals only (no reasons, notes or members)
- Notification previews never contain a location, a message body or an email
- Every calendar-affecting command runs in one Firestore transaction through the
  `calendarControls/{listingId}` guard; no external calls inside transactions

## Firestore collections

| Collection | Document key | Access |
| --- | --- | --- |
| users | Auth UID | Owner only |
| regions | Source ID | Public read |
| cities | Source ID | Public read |
| neighborhoods | Source ID | Public read |
| categories | Source ID | Public read |
| listings | UUID / source ID | Public (published) / Owner (all) |
| media | UUID | Listing images public while parent published; condition photos participants only |
| seedManifests | Version | Tool only |
| calendarControls | Listing ID | API only (concurrency guard) |
| availabilityBlocks | `res_{bookingId}` / `blk_*` | Public busy intervals only; notes owner only |
| bookings | `bkg_*` (from borrower + clientRequestId) | Participants |
| bookingEvents | `{bookingId}_{sequence}` | Participants (timeline) |
| bookingPrivateDetails | Booking ID | Participants (arrangements) |
| payments | `pay_{bookingId}_{component}_{operation}` | Participants (simulated) |
| deposits | Booking ID | Participants (simulated) |
| conditionReports | `cr_{bookingId}_{stage}` | Participants |
| conversations | `{contextType}_{contextId}_{uidA}_{uidB}` | Participants |
| messages | `msg_*` | Participants |
| notifications | `ntf_*` | Recipient |

## Exchange workflow modules

```
apps/api/src/modules/
  exchange/       CalendarGuardService (guard transaction, lazy expiry/overdue),
                  BookingEventWriter (state + event + notifications), WriteBuffer,
                  deterministic ids, conversation document builders, MemberDirectory
  bookings/       AvailabilityService, QuoteService, BookingCommandRunner,
                  BookingService (create, accept, decline, confirm, cancel, sweep),
                  HandoverService (arrangements, condition, return, receipt, issue),
                  BookingQueryService (lists, detail)
  messaging/      ConversationService (find/create, list, poll, send, read)
  notifications/  NotificationService (list, unread count, mark read)
packages/contracts/src/booking/booking-rules.ts   pure rules (unit tested)
```

Command flow: controller (Zod body) → `BookingCommandRunner.run` → guard
transaction → re-read booking → apply due expiry/overdue → check role, state and
`expectedRevision` → command writes (booking, event, notifications, blocks,
payments) buffered → guard rewritten → commit.

## Firebase and hosting configuration

- One Google Cloud project holds Firebase Authentication, Cloud Firestore and
  the two Cloud Run services (`neighborhood-api`, `neighborhood-web`).
- API on Cloud Run: Admin SDK with the service's own identity
  (`neighborhood-api` service account: Firestore user, Firebase Auth viewer); no
  key file. Locally: a key file named by `FIREBASE_KEY_FILE` in `.env`, mounted
  read-only. Other hosts: `FIREBASE_SERVICE_ACCOUNT_BASE64`.
- Web on Cloud Run: forwards `/api/*` to the API URL fixed at build time; the
  browser uses the public web config in `apps/web/src/lib/firebase-client.ts`.
- Secrets (optional OpenAI key, sweep secret) live in Secret Manager.
- `firestore.rules` deny all browser access; the API is the only path to data.

## Trust, community and AI modules

### Modules

```
apps/api/src/modules/
  roles/          RolesService, RolesGuard (+ RequireRoles), AuditService, GET /me/roles (global)
  reviews/        ReviewService, MemberProfileService (public profile, reviews, photo)
  trust/          ReportService, DisputeService (participant routes)
  admin/          AdminController: reviewer workspace (all routes behind RolesGuard)
  verification/   VerificationService (email from Firebase, demonstration checks)
  community/      FavoriteService (+ availability alerts), RequestService (requests, offers)
  ai/             AiClient (OpenAI Chat Completions via fetch, strict schema, timeout, retry), SuggestionService, pure prompt builder
  policies/       PolicyService (versions, publish), AssistantService, pure retrieval and prompt
common/rate-limit/  RateLimitGuard (in-memory, per member or client address)
```

The calendar guard gained a persistent item hold (`itemHold`, set by lost or
needs-repair dispute outcomes, cleared when the owner republishes) and
release listeners called after commit (used for favorites alerts).

### API (all under /v1)

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | /me/roles | member | Own roles |
| POST | /me/bookings/:id/review | participant of a completed booking | Review the other member once |
| GET | /members/:uid/profile, /members/:uid/reviews, /members/:uid/photo | public | Safe profile, visible reviews, photo |
| POST, GET | /me/reports | member | Report a listing, message, review or member; own reports |
| POST | /me/bookings/:id/dispute | participant | Open a case (exchange or complaint) |
| GET | /me/disputes/:id; POST /me/disputes/:id/statement | participant | Case view, statements |
| POST | /me/bookings/:id/condition/:stage/correct | author of the record | Correction as a new version |
| GET | /admin/queue?type=reports\|disputes\|verification | reviewer | Queues with conflict flags |
| GET, POST | /admin/reports/:id; /admin/reports/:id/{assign,close}; /admin/reports/:id/media/:mediaId | reviewer (assigned) | Report handling (audited) |
| GET, POST | /admin/disputes/:id/evidence; /admin/disputes/:id/{assign,resolve}; /admin/disputes/:id/media/:mediaId | reviewer (assigned, not a participant) | Case handling (audited) |
| POST | /admin/reviews/:id/hide | reviewer | Hide a review with a reason |
| POST | /admin/verification/:id/decide | reviewer | Decide a demonstration check |
| POST | /admin/policies/:id/publish | admin | Record team approval of a policy version |
| GET | /admin/audit?entityType&entityId | reviewer | Audit events of one entity |
| GET | /me/verification; POST /me/verification/email/sync; POST /me/verification/demo-check | member | Verification status and checks |
| GET, PUT, DELETE | /me/favorites, /me/favorites/:listingId | member | Saved items and alert settings |
| GET | /requests, /requests/:id | public | Open community requests, request with offers |
| GET, POST, PATCH | /me/requests, /me/requests/:id, /me/requests/:id/close | member (author) | Own requests |
| POST | /me/requests/:id/offers; /me/requests/:id/offers/:offerId/{select,withdraw} | owner / author | Offers |
| GET | /listings?from&to&minRate&maxRate | public | Date and price filters, honest continuation |
| GET | /listings/:id/suggestions?from&to | public (optional token) | Related items, `source` ai or category |
| GET | /policies, /policies/:key | public | Policy versions in force |
| POST | /policies/ask | member | Policy assistant |

### Collections

| Collection | Key | Access |
| --- | --- | --- |
| roleAssignments | uid | Script/admin only |
| auditEvents | aud_* | Reviewers (read through /admin/audit) |
| reviews | {bookingId}_{authorUid} | Public when visible |
| reports | rpt_* | Reporter and assigned reviewer |
| disputes | dsp_{bookingId} | Participants and assigned reviewer |
| verificationChecks | vc_{uid}_{type} | Subject; reviewers for demo checks; public labels only |
| favorites | {uid}_{listingId} | Owner of the favorite |
| requestPosts | req_* | Public (open requests, safe fields) |
| requestOffers | {requestId}_{listingId} | Public with the request |
| policies | {policyKey}_{version} | Public |
| policyChunks | dataset ids | API only (retrieval) |
| assistantDiagnostics | diag_* | Only when diagnostics are enabled; no question text |

### Security notes

- Reviewer access is checked on the server for every admin route; members get 403.
- Reviewer reads of private evidence are case-scoped (assigned reviewer, no
  conflict of interest) and audited.
- Report and profile photos are separate media purposes; report photos are seen
  only by the assigned reviewer, condition photos only by participants and the
  assigned reviewer.
- AI receives public listing fields and policy passages only; no member data.
- Rate limits return 429 with Retry-After on bookings, messages, reports,
  requests, offers, AI suggestions and policy questions.
