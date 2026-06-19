#!/usr/bin/env bash
#
# Front the LoanPilot Cloud Run services with a Global External Application Load
# Balancer + serverless NEGs + a Google-managed SSL cert. Use this instead of
# Cloud Run domain mappings in regions that don't support them (e.g. africa-south1).
#
# Idempotent. Run after the services are deployed:
#   PROJECT_ID=raccoons-loan-pilot REGION=africa-south1 ./deploy/gcp/setup-lb.sh
#
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-africa-south1}"
ROOT_DOMAIN="${ROOT_DOMAIN:-raccoonsfinance.com}"

# host -> Cloud Run service
APEX="${ROOT_DOMAIN}"
WWW="www.${ROOT_DOMAIN}"
PILOT="pilot.${ROOT_DOMAIN}"
API="api.${ROOT_DOMAIN}"

gcloud config set project "${PROJECT_ID}" >/dev/null
gcloud services enable compute.googleapis.com >/dev/null

exists() { eval "$1" >/dev/null 2>&1; }

echo "==> Reserve a global static IP (loanpilot-ip)"
exists "gcloud compute addresses describe loanpilot-ip --global" || \
  gcloud compute addresses create loanpilot-ip --global --ip-version=IPV4
LB_IP="$(gcloud compute addresses describe loanpilot-ip --global --format='value(address)')"

# --- Serverless NEGs (one per service, regional) -----------------------------
declare -A SVC=( [api]=loanpilot-api [web]=loanpilot-web [dashboard]=loanpilot-dashboard )
for key in "${!SVC[@]}"; do
  neg="loanpilot-${key}-neg"
  echo "==> Serverless NEG ${neg} -> ${SVC[$key]}"
  exists "gcloud compute network-endpoint-groups describe ${neg} --region=${REGION}" || \
    gcloud compute network-endpoint-groups create "${neg}" \
      --region="${REGION}" --network-endpoint-type=serverless \
      --cloud-run-service="${SVC[$key]}"

  be="loanpilot-${key}-be"
  echo "==> Backend service ${be}"
  exists "gcloud compute backend-services describe ${be} --global" || \
    gcloud compute backend-services create "${be}" \
      --global --load-balancing-scheme=EXTERNAL_MANAGED
  # add-backend is idempotent-ish; ignore "already exists"
  gcloud compute backend-services add-backend "${be}" --global \
    --network-endpoint-group="${neg}" --network-endpoint-group-region="${REGION}" 2>/dev/null || true
done

# --- URL map: host-based routing (web is the default backend) -----------------
echo "==> URL map loanpilot-urlmap"
exists "gcloud compute url-maps describe loanpilot-urlmap --global" || \
  gcloud compute url-maps create loanpilot-urlmap \
    --global --default-service=loanpilot-web-be
gcloud compute url-maps add-path-matcher loanpilot-urlmap --global \
  --path-matcher-name=api --default-service=loanpilot-api-be \
  --new-hosts="${API}" 2>/dev/null || true
gcloud compute url-maps add-path-matcher loanpilot-urlmap --global \
  --path-matcher-name=pilot --default-service=loanpilot-dashboard-be \
  --new-hosts="${PILOT}" 2>/dev/null || true

# --- Managed SSL cert covering all four hosts --------------------------------
echo "==> Managed SSL certificate loanpilot-cert"
exists "gcloud compute ssl-certificates describe loanpilot-cert --global" || \
  gcloud compute ssl-certificates create loanpilot-cert --global \
    --domains="${APEX},${WWW},${PILOT},${API}"

# --- HTTPS proxy + forwarding rule (443) -------------------------------------
echo "==> HTTPS target proxy + forwarding rule"
exists "gcloud compute target-https-proxies describe loanpilot-https-proxy --global" || \
  gcloud compute target-https-proxies create loanpilot-https-proxy \
    --global --url-map=loanpilot-urlmap --ssl-certificates=loanpilot-cert
exists "gcloud compute forwarding-rules describe loanpilot-https-fr --global" || \
  gcloud compute forwarding-rules create loanpilot-https-fr \
    --global --target-https-proxy=loanpilot-https-proxy \
    --address=loanpilot-ip --ports=443 --load-balancing-scheme=EXTERNAL_MANAGED

# --- HTTP -> HTTPS redirect (80) ---------------------------------------------
echo "==> HTTP->HTTPS redirect"
if ! exists "gcloud compute url-maps describe loanpilot-redirect --global"; then
  cat > /tmp/loanpilot-redirect.yaml <<'EOF'
name: loanpilot-redirect
defaultUrlRedirect:
  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
  httpsRedirect: true
EOF
  gcloud compute url-maps import loanpilot-redirect --global \
    --source=/tmp/loanpilot-redirect.yaml --quiet
fi
exists "gcloud compute target-http-proxies describe loanpilot-http-proxy --global" || \
  gcloud compute target-http-proxies create loanpilot-http-proxy \
    --global --url-map=loanpilot-redirect
exists "gcloud compute forwarding-rules describe loanpilot-http-fr --global" || \
  gcloud compute forwarding-rules create loanpilot-http-fr \
    --global --target-http-proxy=loanpilot-http-proxy \
    --address=loanpilot-ip --ports=80 --load-balancing-scheme=EXTERNAL_MANAGED

cat <<EOF

==> Load balancer ready. Static IP: ${LB_IP}

Add these DNS records at your domain host (LEAVE THE MX RECORDS UNTOUCHED):

  ${APEX}.       A   ${LB_IP}
  ${WWW}.        A   ${LB_IP}
  ${API}.        A   ${LB_IP}
  ${PILOT}.      A   ${LB_IP}

The Google-managed certificate provisions automatically once those records
resolve to ${LB_IP} (typically 15–60 min). Watch it with:

  gcloud compute ssl-certificates describe loanpilot-cert --global \\
    --format='value(managed.status, managed.domainStatus)'

When it reads ACTIVE, browse https://${APEX} and https://${PILOT}.
EOF
