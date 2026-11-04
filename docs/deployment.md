# Deployment guide: Google Cloud

Target: one Google Cloud project that holds Firebase (Authentication and
Cloud Firestore) and two **Cloud Run** services:

| Service | Image | Purpose |
| --- | --- | --- |
| `neighborhood-api` | `infra/docker/api.Dockerfile` | NestJS API (`/v1/*`) |
| `neighborhood-web` | `infra/docker/web.Dockerfile` | Next.js site; forwards `/api/*` to the API |

Images are built by **Cloud Build** and stored in **Artifact Registry**.
Optional secrets live in **Secret Manager**. No service-account key is used in
production: the API runs as its own service account.

```
Browser ──> neighborhood-web (Cloud Run) ──/api/*──> neighborhood-api (Cloud Run)
   │                                                     │
   └── Firebase Authentication (sign-in)                 ├── Cloud Firestore
                                                         └── Firebase Auth (token check)
```

## 0. Prerequisites

- Google Cloud project with billing enabled (Cloud Run, Cloud Build and
  Artifact Registry need it; small workloads usually stay within the free
  tiers, but check current pricing for your region).
- Firebase added to the same project: Authentication with **Email/Password**
  enabled, Firestore database created (Native mode).
- On the deploying machine: `gcloud` CLI, Node.js 24 and pnpm 12 for the seed scripts,
  optionally the Firebase CLI (`npx firebase-tools`). Sign in with the Google account
  that owns the project: `gcloud auth login`. Check it with `gcloud auth list`. The
  scripts show the account and project and ask you to type yes. They never change
  the machine's default gcloud project.
- Region: the scripts default to `me-central1`. Choose a region close to your
  users where Cloud Run is available, ideally the same as Firestore.

## 1. One-time setup

If this machine also uses gcloud for other work, keep this project in its own profile
and set it in the terminal you deploy from:

```sh
gcloud config configurations create neighborhood --no-activate
export CLOUDSDK_ACTIVE_CONFIG_NAME=neighborhood
gcloud config set project <project-id>
gcloud auth login <owner-account>
```

```sh
PROJECT_ID=<project-id> REGION=me-central1 bash infra/gcp/setup.sh
```

It enables the APIs, creates the Artifact Registry repository `neighborhood`
and three service accounts:

| Service account | Roles | Used by |
| --- | --- | --- |
| `neighborhood-api` | `roles/datastore.user`, `roles/firebaseauth.viewer` | API at runtime |
| `neighborhood-web` | none | web at runtime |
| `neighborhood-deployer` | `run.admin`, `artifactregistry.writer`, `logging.logWriter`, `secretmanager.viewer`, read access to the build source bucket, act as the two runtime accounts | Cloud Build |

### Optional secrets (enter the values yourself)

```sh
# OpenAI API key for AI suggestions and the policy assistant (without it, fallbacks run)
read -rs OPENAI_KEY   # paste the key and press Enter; nothing is shown
printf %s "$OPENAI_KEY" | gcloud secrets create openai-api-key --project <project-id> --replication-policy=automatic --data-file=-
unset OPENAI_KEY
# Secret for the bulk expiry endpoint (POST /v1/internal/sweep)
openssl rand -hex 24 | gcloud secrets create sweep-secret --project <project-id> --replication-policy=automatic --data-file=-
```

Run `infra/gcp/setup.sh` again afterwards so the API may read them.

## 2. Firestore rules and indexes

```sh
cd infra/firebase
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project <project-id>
```

`firestore.rules` deny all browser access; the API is the only path to data.
The queries use equality filters only, so the indexes file is optional.

## 3. Web configuration

The browser needs the project's public Firebase web config (not secret). The
defaults are in `apps/web/src/lib/firebase-client.ts`; for another project,
edit those defaults or pass the `NEXT_PUBLIC_FIREBASE_*` build arguments in
`infra/gcp/cloudbuild.yaml` (`build-web` step).

## 4. Deploy

```sh
PROJECT_ID=<project-id> REGION=me-central1 bash infra/gcp/deploy.sh
```

The pipeline builds and deploys the API, attaches existing secrets, reads the
API URL, builds the web image against it and deploys the web service. It prints
both URLs. Run it again for every release.

Then, in the Firebase console: Authentication -> Settings -> Authorized domains
-> add the web host (`neighborhood-web-....run.app`, or your own domain).

### Public address

Cloud Run's address cannot be renamed. Firebase Hosting gives the site the project's free
address, `https://<project-id>.web.app`, and forwards visitors to the web service:

```sh
PROJECT_ID=<project-id> REGION=me-central1 bash infra/gcp/hosting.sh
```

Run it once. After that, `deploy.sh` publishes a new Hosting release on every deploy,
which clears Firebase's page cache. A custom domain is added in the Firebase console
(Hosting -> Add custom domain), because Cloud Run's own domain mapping does not cover
`me-central1`.

## 5. Seed data (first deployment only)

Skip this section when the project already holds the data. The seeds are safe to
repeat, and a policy that already has a published version is left alone.

Using your own Google login (no key file):

```sh
gcloud auth application-default login
export FIREBASE_PROJECT_ID=<project-id>
pnpm install --frozen-lockfile --ignore-scripts
pnpm seed:demo          # reference data, demo members, listings, images
pnpm seed:bookings      # booking settings on demo listings
pnpm seed:policies      # 12 policies, version 1.0, published (approved by the project team)
node scripts/admin/grant-role.mjs --email jawharah@neighborhood-demo.test --role reviewer
```

Demo accounts are fictional personas for demonstration. For a real launch,
skip `seed:demo` and create reviewer and admin roles for real staff accounts
(the grant script only accepts demo addresses by design; extend it consciously).

## 6. Check

```sh
curl https://<api-url>/v1/health/live
curl https://<api-url>/v1/health/ready     # dependencies report "cloud"
```

Open the web URL, sign in, browse, request an item. Optional scripted checks
against the deployed API (they create test data; remove it afterwards):

```sh
API_URL=https://<api-url>/v1 FIREBASE_WEB_API_KEY=<public web api key> pnpm test:functional
FIREBASE_PROJECT_ID=<project-id> node scripts/admin/reset-demo-data.mjs              # dry run
FIREBASE_PROJECT_ID=<project-id> node scripts/admin/reset-demo-data.mjs --apply --yes
```

Checks F-63..F-65 report SKIP on a deployed API by design (their AI test hooks
are disabled in production).

## 7. Optional

- **Custom domain:** Cloud Run domain mapping or a load balancer; then add the
  domain to Firebase authorized domains.
- **Scheduled sweep:** Cloud Scheduler job calling
  `POST https://<api-url>/v1/internal/sweep` with header `x-sweep-secret` daily.
  Without it, expiry and overdue are still applied whenever data is read.
- **Minimum instances:** `--min-instances=1` on the web service removes the
  cold start (costs more).

## 8. Operating notes

- Logs: Cloud Run -> service -> Logs (structured JSON, no secrets or message text).
- The API runs with at most one instance because rate limits are kept in
  memory; raising `--max-instances` needs a shared store first.
- Payments and deposits are simulated; no real money, cards or bank details.
- Rollback: Cloud Run -> service -> Revisions -> route traffic to an earlier revision.
