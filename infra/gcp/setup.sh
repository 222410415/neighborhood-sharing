#!/usr/bin/env bash
# One-time Google Cloud setup for the project that already hosts Firebase
# (Authentication + Firestore). Safe to run again: existing resources are kept.
#
#   PROJECT_ID=<project-id> REGION=me-central1 bash infra/gcp/setup.sh
#
# Needs: gcloud CLI, signed in as a project owner (`gcloud auth login`).
# Creates: required APIs, an Artifact Registry repository, three service
# accounts with least-privilege roles. It never creates or prints secrets.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-me-central1}"
REPO="${REPO:-neighborhood}"

# Applies to this script only: the machine's default gcloud project stays as it is.
export CLOUDSDK_CORE_PROJECT="$PROJECT_ID"

echo "Google account: $(gcloud config get-value account 2>/dev/null)"
echo "Project:        $PROJECT_ID"
echo "Region:         $REGION"
read -r -p "Is this the right account and project? Type yes to continue: " ANSWER
[ "$ANSWER" = "yes" ] || { echo "Stopped. Nothing was changed."; exit 1; }

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

echo "== Enabling APIs"
gcloud services enable \
  run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
  secretmanager.googleapis.com firestore.googleapis.com identitytoolkit.googleapis.com \
  iam.googleapis.com

echo "== Artifact Registry repository: $REPO ($REGION)"
gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" \
    --description="Neighborhood Sharing images"

create_sa() {
  gcloud iam service-accounts describe "$1@$PROJECT_ID.iam.gserviceaccount.com" >/dev/null 2>&1 || \
    gcloud iam service-accounts create "$1" --display-name="$2"
}
grant() {
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$1" --role="$2" \
    --condition=None >/dev/null
  echo "   $2 -> $1"
}

API_SA="neighborhood-api@$PROJECT_ID.iam.gserviceaccount.com"
WEB_SA="neighborhood-web@$PROJECT_ID.iam.gserviceaccount.com"
DEPLOY_SA="neighborhood-deployer@$PROJECT_ID.iam.gserviceaccount.com"

echo "== Service accounts"
create_sa neighborhood-api "Neighborhood API (Cloud Run runtime)"
create_sa neighborhood-web "Neighborhood web (Cloud Run runtime)"
create_sa neighborhood-deployer "Neighborhood deployer (Cloud Build)"

echo "== Roles"
# API: read/write Firestore, read Firebase Auth users (email verification status).
grant "$API_SA" roles/datastore.user
grant "$API_SA" roles/firebaseauth.viewer
# Deployer: build, push and deploy.
grant "$DEPLOY_SA" roles/run.admin
grant "$DEPLOY_SA" roles/artifactregistry.writer
grant "$DEPLOY_SA" roles/logging.logWriter
grant "$DEPLOY_SA" roles/secretmanager.viewer
for SA in "$API_SA" "$WEB_SA"; do
  gcloud iam service-accounts add-iam-policy-binding "$SA" \
    --member="serviceAccount:$DEPLOY_SA" --role=roles/iam.serviceAccountUser >/dev/null
  echo "   roles/iam.serviceAccountUser on $SA -> $DEPLOY_SA"
done

echo "== Optional secrets (values are entered by you, never by this script)"
for SECRET in openai-api-key sweep-secret; do
  if gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    gcloud secrets add-iam-policy-binding "$SECRET" --member="serviceAccount:$API_SA" \
      --role=roles/secretmanager.secretAccessor >/dev/null
    echo "   $SECRET: API can read it"
  else
    echo "   $SECRET: not created (optional). See docs/deployment.md, then run this script again."
  fi
done

echo "Done. Project $PROJECT_ID ($PROJECT_NUMBER), region $REGION. Next: bash infra/gcp/deploy.sh"
