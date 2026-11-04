#!/usr/bin/env bash
# Puts Firebase Hosting in front of the web service, giving it the project's free
# address (https://<project-id>.web.app). Safe to run again: it publishes a new release.
#
#   PROJECT_ID=<project-id> REGION=me-central1 bash infra/gcp/hosting.sh
#
# Needs gcloud signed in as a project owner. Uses the Hosting REST API, so no
# Firebase CLI or extra sign-in is needed. The access token is never printed.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-me-central1}"
SITE="${SITE:-$PROJECT_ID}"
WEB_SERVICE="${WEB_SERVICE:-neighborhood-web}"
API="https://firebasehosting.googleapis.com/v1beta1"
export CLOUDSDK_CORE_PROJECT="$PROJECT_ID"

echo "Google account: $(gcloud config get-value account 2>/dev/null)"
echo "Project:        $PROJECT_ID"
echo "Site:           https://$SITE.web.app -> $WEB_SERVICE ($REGION)"
read -r -p "Publish this address? Type yes to continue: " ANSWER
[ "$ANSWER" = "yes" ] || { echo "Stopped. Nothing was changed."; exit 1; }

gcloud services enable firebasehosting.googleapis.com
TOKEN="$(gcloud auth print-access-token)"

call() {
  curl -sS --fail-with-body -X "$1" "$2" \
    -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJECT_ID" \
    -H "Content-Type: application/json" ${3:+-d "$3"}
}
field() { python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }

echo "== Site"
if ! call GET "$API/projects/$PROJECT_ID/sites/$SITE" >/dev/null 2>&1; then
  call POST "$API/projects/$PROJECT_ID/sites?siteId=$SITE" '{}' >/dev/null
  echo "   created $SITE"
fi

echo "== Version"
BODY="{\"config\":{\"rewrites\":[{\"glob\":\"**\",\"run\":{\"serviceId\":\"$WEB_SERVICE\",\"region\":\"$REGION\"}}]}}"
VERSION="$(call POST "$API/sites/$SITE/versions" "$BODY" | field name)"
call PATCH "$API/$VERSION?update_mask=status" '{"status":"FINALIZED"}' >/dev/null

echo "== Release"
call POST "$API/sites/$SITE/releases?versionName=$VERSION" '{"message":"Route all traffic to Cloud Run"}' >/dev/null
echo "Done: https://$SITE.web.app"
