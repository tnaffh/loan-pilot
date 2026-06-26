#!/usr/bin/env bash
#
# One-time GCP bootstrap for LoanPilot (Cloud Run + Cloud SQL + GCS + Cloud Build).
# Idempotent: safe to re-run. Creates the project's infrastructure and prints the
# substitution values to feed into deploy/gcp/cloudbuild.yaml.
#
# Prerequisites: gcloud CLI authenticated (`gcloud auth login`) with Owner/Editor
# on the target project, and billing enabled.
#
# Usage:
#   PROJECT_ID=my-proj REGION=africa-south1 ./deploy/gcp/setup.sh
#
set -euo pipefail

# --- Config (override via env) ----------------------------------------------
PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-africa-south1}"
# ENTERPRISE edition supports the cost-effective shared-core/db-custom-* tiers
# (ENTERPRISE_PLUS only allows db-perf-optimized-N-* which start at 2 vCPU).
DB_EDITION="${DB_EDITION:-ENTERPRISE}"
# Cheap default: shared-core, ~1.7GB RAM (≈US$25/mo). Cheapest is db-f1-micro
# (0.6GB, risks OOM under migrations/import). Scale up later with db-custom-1-3840.
DB_TIER="${DB_TIER:-db-g1-small}"
DB_INSTANCE="${DB_INSTANCE:-loanpilot-db}"
DB_NAME="${DB_NAME:-loanpilot}"
DB_USER="${DB_USER:-loanpilot}"
AR_REPO="${AR_REPO:-loanpilot}"
BUCKET="${BUCKET:-${PROJECT_ID}-loanpilot-documents}"
RUNTIME_SA="loanpilot-api@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOYER_SA="loanpilot-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

echo "==> Project ${PROJECT_ID} / region ${REGION}"
gcloud config set project "${PROJECT_ID}" >/dev/null

# --- 1. Enable APIs ----------------------------------------------------------
echo "==> Enabling APIs"
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  compute.googleapis.com

# --- 2. Artifact Registry ----------------------------------------------------
echo "==> Artifact Registry repo ${AR_REPO}"
gcloud artifacts repositories describe "${AR_REPO}" --location="${REGION}" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "${AR_REPO}" \
    --repository-format=docker --location="${REGION}" \
    --description="LoanPilot container images"

# --- 3. Cloud SQL (PostgreSQL 16) -------------------------------------------
echo "==> Cloud SQL instance ${DB_INSTANCE}"
if ! gcloud sql instances describe "${DB_INSTANCE}" >/dev/null 2>&1; then
  gcloud sql instances create "${DB_INSTANCE}" \
    --database-version=POSTGRES_16 --edition="${DB_EDITION}" --tier="${DB_TIER}" --region="${REGION}" \
    --storage-auto-increase --availability-type=ZONAL
fi

# An instance created in a prior run may still be provisioning; the database/user
# calls fail unless it's RUNNABLE, so wait for it.
echo -n "    waiting for ${DB_INSTANCE} to be RUNNABLE"
until [ "$(gcloud sql instances describe "${DB_INSTANCE}" --format='value(state)' 2>/dev/null)" = "RUNNABLE" ]; do
  echo -n "."
  sleep 10
done
echo " ready"

gcloud sql databases describe "${DB_NAME}" --instance="${DB_INSTANCE}" >/dev/null 2>&1 || \
  gcloud sql databases create "${DB_NAME}" --instance="${DB_INSTANCE}"

# Create the app DB user with a generated password (printed once, then stored as a secret).
if ! gcloud sql users list --instance="${DB_INSTANCE}" --format="value(name)" | grep -qx "${DB_USER}"; then
  DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
  gcloud sql users create "${DB_USER}" --instance="${DB_INSTANCE}" --password="${DB_PASSWORD}"
  echo "    created DB user ${DB_USER}"
else
  echo "    DB user ${DB_USER} exists — reusing; set DB_PASSWORD to rotate the db-url secret"
  DB_PASSWORD="${DB_PASSWORD:-}"
fi

INSTANCE_CONNECTION_NAME="$(gcloud sql instances describe "${DB_INSTANCE}" --format='value(connectionName)')"

# --- 4. GCS bucket (private) -------------------------------------------------
echo "==> GCS bucket gs://${BUCKET}"
gcloud storage buckets describe "gs://${BUCKET}" >/dev/null 2>&1 || \
  gcloud storage buckets create "gs://${BUCKET}" \
    --location="${REGION}" --uniform-bucket-level-access --public-access-prevention

# --- 5. Service accounts + IAM ----------------------------------------------
echo "==> Service accounts"
gcloud iam service-accounts describe "${RUNTIME_SA}" >/dev/null 2>&1 || \
  gcloud iam service-accounts create loanpilot-api --display-name="LoanPilot API runtime"
gcloud iam service-accounts describe "${DEPLOYER_SA}" >/dev/null 2>&1 || \
  gcloud iam service-accounts create loanpilot-deployer --display-name="LoanPilot deployer"

# IAM is eventually consistent: a freshly created SA can be rejected by
# add-iam-policy-binding for a few seconds ("does not exist"). Retry through it.
retry() {
  local n=0
  until "$@"; do
    n=$((n + 1))
    if [ "${n}" -ge 8 ]; then echo "  ! gave up after ${n} attempts: $*" >&2; return 1; fi
    sleep 5
  done
}

echo -n "    waiting for service accounts to propagate"
until gcloud iam service-accounts describe "${RUNTIME_SA}" >/dev/null 2>&1 \
   && gcloud iam service-accounts describe "${DEPLOYER_SA}" >/dev/null 2>&1; do
  echo -n "."
  sleep 3
done
echo " ready"

echo "==> IAM bindings"
# Runtime SA: Cloud SQL client, read secrets, read/write the documents bucket (keyless GCS).
retry gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SA}" --role="roles/cloudsql.client" --condition=None -q >/dev/null
retry gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SA}" --role="roles/secretmanager.secretAccessor" --condition=None -q >/dev/null
retry gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${RUNTIME_SA}" --role="roles/storage.objectAdmin" >/dev/null
# Let the runtime SA sign GCS V4 download URLs as itself. With keyless ADC the
# Storage client signs via the IAM SignBlob API, which needs serviceAccountTokenCreator
# ON ITSELF — without it, fetching any record that has documents fails with
# "iam.serviceAccounts.signBlob denied".
retry gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}" \
  --member="serviceAccount:${RUNTIME_SA}" --role="roles/iam.serviceAccountTokenCreator" -q >/dev/null

# Deployer SA (the Cloud Build runner): build, push, deploy, run the migrate job,
# write build logs, and read the source-staging bucket.
for ROLE in roles/run.admin roles/artifactregistry.writer roles/cloudsql.client \
            roles/secretmanager.secretAccessor roles/iam.serviceAccountUser \
            roles/logging.logWriter roles/storage.admin; do
  retry gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${DEPLOYER_SA}" --role="${ROLE}" --condition=None -q >/dev/null
done

# --- 6. Secret Manager -------------------------------------------------------
echo "==> Secrets"
ensure_secret() { gcloud secrets describe "$1" >/dev/null 2>&1 || gcloud secrets create "$1" --replication-policy=automatic; }
ensure_secret loanpilot-jwt-secret
ensure_secret loanpilot-db-url
# Auth/email secrets — set their values manually (see docs/DEPLOYMENT-GCP.md):
#   printf '%s' "<google client secret>" | gcloud secrets versions add loanpilot-google-client-secret --data-file=-
#   printf '%s' "<resend api key>"       | gcloud secrets versions add loanpilot-resend-key --data-file=-
ensure_secret loanpilot-google-client-secret
ensure_secret loanpilot-resend-key

# Seed jwt-secret with a strong random value if it has no versions yet.
if [ -z "$(gcloud secrets versions list loanpilot-jwt-secret --format='value(name)' 2>/dev/null)" ]; then
  openssl rand -base64 48 | gcloud secrets versions add loanpilot-jwt-secret --data-file=-
  echo "    seeded loanpilot-jwt-secret"
fi

# Seed db-url only when we just created the user (have the password).
if [ -n "${DB_PASSWORD}" ]; then
  DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${INSTANCE_CONNECTION_NAME}&schema=public"
  printf '%s' "${DB_URL}" | gcloud secrets versions add loanpilot-db-url --data-file=-
  echo "    seeded loanpilot-db-url"
fi

# --- Done: print the cloudbuild substitutions --------------------------------
cat <<EOF

==> Bootstrap complete. Cloud Build substitutions:

  _REGION=${REGION}
  _REPO=${AR_REPO}
  _RUNTIME_SA=${RUNTIME_SA}
  _INSTANCE=${INSTANCE_CONNECTION_NAME}
  _BUCKET=${BUCKET}
  _API_DOMAIN=api.raccoonsfinance.com

Next:
  1. Confirm secret values: gcloud secrets versions access latest --secret=loanpilot-db-url
  2. Run the pipeline (as the deployer SA, with a project-owned logs bucket):
       gcloud builds submit --config deploy/gcp/cloudbuild.yaml \\
         --service-account=projects/${PROJECT_ID}/serviceAccounts/${DEPLOYER_SA} \\
         --default-buckets-behavior=regional-user-owned-bucket \\
         --substitutions=_REGION=${REGION},_REPO=${AR_REPO},_RUNTIME_SA=${RUNTIME_SA},_INSTANCE=${INSTANCE_CONNECTION_NAME},_BUCKET=${BUCKET},_API_DOMAIN=api.raccoonsfinance.com
  3. Map domains (see docs/DEPLOYMENT-GCP.md).
EOF
