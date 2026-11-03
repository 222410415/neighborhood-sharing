#!/usr/bin/env bash
# Builds and deploys the API and the web app to Cloud Run with Cloud Build.
#
#   PROJECT_ID=<project-id> REGION=me-central1 bash infra/gcp/deploy.sh
#
# Run from any folder; the repository root is uploaded (see .gcloudignore).
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-me-central1}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

gcloud builds submit "$ROOT" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --config="$ROOT/infra/gcp/cloudbuild.yaml" \
  --service-account="projects/$PROJECT_ID/serviceAccounts/neighborhood-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --substitutions="_REGION=$REGION"

echo
echo "API: $(gcloud run services describe neighborhood-api --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')"
echo "Web: $(gcloud run services describe neighborhood-web --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')"
