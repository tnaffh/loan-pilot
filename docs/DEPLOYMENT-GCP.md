# Deploying LoanPilot to GCP

LoanPilot runs as **three Cloud Run services** (api, web, dashboard) backed by
**Cloud SQL** (PostgreSQL) and **Google Cloud Storage** (documents). Images are
built and deployed by **Cloud Build**; secrets live in **Secret Manager**.

```
raccoonsfinance.com / www  ─▶ loanpilot-web        (marketing + apply)
pilot.raccoonsfinance.com  ─▶ loanpilot-dashboard  (lender portal)
api.raccoonsfinance.com    ─▶ loanpilot-api ─┬─ Cloud SQL (Postgres, Unix socket)
                                             ├─ GCS bucket (documents, keyless via runtime SA)
                                             └─ Secret Manager (JWT_SECRET, DATABASE_URL)
```

The front-end bundles bake `NEXT_PUBLIC_API_URL` **at image-build time**, so the
API's public host (`api.raccoonsfinance.com`) is fixed up front — there is no
deploy-order chicken-and-egg.

## Prerequisites

- `gcloud` CLI authenticated with Owner/Editor on the target project; billing enabled.
- Docker (only if you want to build images locally; Cloud Build does it otherwise).
- Access to DNS for `raccoonsfinance.com`. **The domain already runs Google
  Workspace email — you will only ADD subdomain records and must NEVER touch the
  `MX` records** (or the SPF/DKIM/DMARC `TXT` records).

## 1. One-time bootstrap

```bash
PROJECT_ID=your-project REGION=africa-south1 ./deploy/gcp/setup.sh
```

This is idempotent and creates: the Artifact Registry repo, a Cloud SQL Postgres 16
instance + `loanpilot` database/user, a **private** GCS bucket, the `loanpilot-api`
(runtime) and `loanpilot-deployer` service accounts with IAM, and the
`loanpilot-jwt-secret` / `loanpilot-db-url` secrets (auto-seeded). It prints the
Cloud Build substitution values — keep them.

Verify the DB URL secret looks right (Unix-socket form):

```bash
gcloud secrets versions access latest --secret=loanpilot-db-url
# postgresql://loanpilot:...@localhost/loanpilot?host=/cloudsql/PROJECT:REGION:loanpilot-db&schema=public
```

## 2. First deploy

```bash
gcloud builds submit --config deploy/gcp/cloudbuild.yaml \
  --service-account=projects/PROJECT/serviceAccounts/loanpilot-deployer@PROJECT.iam.gserviceaccount.com \
  --default-buckets-behavior=regional-user-owned-bucket \
  --substitutions=_REGION=africa-south1,_REPO=loanpilot,\
_RUNTIME_SA=loanpilot-api@PROJECT.iam.gserviceaccount.com,\
_INSTANCE=PROJECT:africa-south1:loanpilot-db,\
_BUCKET=PROJECT-loanpilot-documents,\
_API_DOMAIN=api.raccoonsfinance.com
```

> Running the build **as `loanpilot-deployer`** (with a project-owned logs bucket)
> avoids relying on the default Cloud Build SA, which on new projects lacks the
> Cloud Run / act-as permissions. A Cloud Build *trigger* (Phase 6) can set this
> SA directly instead of passing the flags.

The pipeline builds + pushes the three images, runs `prisma migrate deploy` as a
**Cloud Run Job** (`loanpilot-migrate`) against Cloud SQL, then deploys the api,
web and dashboard services.

### 2a. Allow public access (Workspace orgs only)

If your org enforces **Domain Restricted Sharing** (the default in Google
Workspace orgs), `--allow-unauthenticated` is silently blocked and the services
return `403 Forbidden`. Confirm with
`gcloud run services add-iam-policy-binding loanpilot-api --region=$REGION --member=allUsers --role=roles/run.invoker`
— a `FAILED_PRECONDITION: ... does not belong to a permitted customer` means DRS.

Override DRS **for this project only** (needs `roles/orgpolicy.policyAdmin`,
grantable at the org level by an org admin; enable `orgpolicy.googleapis.com` first):

```bash
cat > /tmp/drs-policy.yaml <<'EOF'
name: projects/PROJECT/policies/iam.allowedPolicyMemberDomains
spec:
  rules:
    - allowAll: true
EOF
gcloud org-policies set-policy /tmp/drs-policy.yaml

# then make the three services public
for SVC in loanpilot-api loanpilot-web loanpilot-dashboard; do
  gcloud run services add-iam-policy-binding "$SVC" --region=$REGION \
    --member=allUsers --role=roles/run.invoker
done
```

`allUsers → run.invoker` only allows reaching the services; the API still enforces
its own JWT auth. Scope the override to this dedicated project, not the org.

## 3. Map the custom domains

**`africa-south1` does not support Cloud Run domain mappings** (the create call
returns `501 UNIMPLEMENTED`). Use the **Global External Application Load Balancer**
instead — it works in every region, gives one static IP for all hosts, and
provisions a Google-managed cert:

```bash
PROJECT_ID=raccoons-loan-pilot REGION=africa-south1 ./deploy/gcp/setup-lb.sh
```

It creates a static IP, a serverless NEG + backend per service, a host-routing
URL map (`api.`→api, `pilot.`→dashboard, apex/`www`→web), a managed SSL cert for
all four hosts, and an HTTP→HTTPS redirect — then prints the IP and the DNS
records. Add these at your DNS host, **leaving the existing MX / TXT records
untouched** (all four are `A` records to the single LB IP):

| Host | Type | Value |
| --- | --- | --- |
| `raccoonsfinance.com` (apex) | A | the LB IP |
| `www` | A | the LB IP |
| `pilot` | A | the LB IP |
| `api` | A | the LB IP |

The managed cert provisions automatically once those records resolve to the LB
IP (15–60 min). Watch it:
`gcloud compute ssl-certificates describe loanpilot-cert --global --format='value(managed.status)'`.

> In regions that **do** support domain mappings, the simpler alternative is
> `gcloud beta run domain-mappings create --service=… --domain=… --region=…`
> per host (apex gets A/AAAA, subdomains get a `CNAME` to `ghs.googlehosted.com.`).
> Either way, never touch the MX records. To harden later, set the Cloud Run
> services' ingress to internal-and-cloud-load-balancing so only the LB reaches them.

## 4. Smoke test

```bash
curl https://api.raccoonsfinance.com/api/health      # {"status":"ok","database":"up",...}
```

- Open `https://raccoonsfinance.com` → submit an application with a document
  upload → the object should land in the GCS bucket and its (V4 signed) URL open.
- Open `https://pilot.raccoonsfinance.com` → log in (seeded admin
  `admin@raccoons.na` / `password123` if you seeded; **change this**) → confirm
  the dashboard loads data (CORS from the api subdomain passes).

## 5. Load the real register (optional, once)

The migrate job only applies schema. To import the Raccoons register, run the
import as a one-off job using the same API image:

```bash
gcloud run jobs deploy loanpilot-import \
  --image $REGION-docker.pkg.dev/$PROJECT/loanpilot/api:latest \
  --region $REGION --service-account $RUNTIME_SA \
  --set-cloudsql-instances $INSTANCE \
  --set-secrets DATABASE_URL=loanpilot-db-url:latest \
  --command pnpm --args "run,db:import" --task-timeout 900s
gcloud run jobs execute loanpilot-import --region $REGION --wait
```

(Use `--args "run,db:seed"` for the demo seed instead.)

## 5a. Auth: Google sign-in + Resend email

Staff sign in with email/password or **Google** (invite-only + domain-locked); invite
and password-reset emails go out via **Resend**. Password login works without any of
this — set it up when you want Google + email.

**Resend**
1. In Resend, **verify `raccoonsfinance.com`** (adds SPF/DKIM on a sending subdomain
   like `send.raccoonsfinance.com` — it does **not** touch your apex `MX`).
2. Create an API key and store it:
   ```bash
   printf '%s' "<resend-api-key>" | gcloud secrets versions add loanpilot-resend-key --data-file=-
   ```

**Google OAuth**
1. APIs & Services → **OAuth consent screen** → *Internal* (your Workspace org).
2. **Credentials → Create OAuth client → Web application**:
   - Authorized redirect URI: `https://api.raccoonsfinance.com/api/auth/google/callback`
   - Authorized JavaScript origin: `https://pilot.raccoonsfinance.com`
3. Store the client secret, and pass the client ID as a build substitution:
   ```bash
   printf '%s' "<google-client-secret>" | gcloud secrets versions add loanpilot-google-client-secret --data-file=-
   # then redeploy with _GOOGLE_CLIENT_ID set (see step 6 / the substitutions)
   ```

> The `cloudbuild.yaml` API deploy wires `GOOGLE_CLIENT_SECRET` and `RESEND_API_KEY`
> from Secret Manager, so **both secrets must have at least one version before the next
> deploy** (a placeholder is fine for the Google secret until you enable it — Google
> login stays off while `_GOOGLE_CLIENT_ID` is empty). `setup.sh` creates the empty
> secret containers for you.

After setting the values, redeploy (step 2 / the trigger) with
`--substitutions=…,_GOOGLE_CLIENT_ID=<client-id>`; verify by clicking **Continue with
Google** on `https://pilot.raccoonsfinance.com/login` and by inviting a user from the
**Users** admin page.

## 6. Continuous deployment (Cloud Build trigger)

Point a trigger at this config so pushes to `main` redeploy:

```bash
gcloud builds triggers create github \
  --name=loanpilot-deploy --repo-name=loan-pilot --repo-owner=YOUR_GH_ORG \
  --branch-pattern='^main$' --build-config=deploy/gcp/cloudbuild.yaml \
  --substitutions=_RUNTIME_SA=...,_INSTANCE=...,_BUCKET=...
```

The existing GitHub Actions workflow (`.github/workflows/ci.yml`) stays the PR
gate (lint/typecheck/test/build); Cloud Build owns build + deploy.

## Operations

- **Rollback:** `gcloud run services update-traffic loanpilot-api --region $REGION --to-revisions=PREVIOUS=100`
- **Logs:** `gcloud run services logs read loanpilot-api --region $REGION`
- **Rotate JWT secret:** add a new `loanpilot-jwt-secret` version, then redeploy
  the api service (existing 7-day tokens become invalid).
- **Rotate DB password:** `gcloud sql users set-password`, add a new
  `loanpilot-db-url` version, redeploy api + re-run the migrate job if needed.

## Configuration reference

See `deploy/gcp/.env.gcp.example` for every env var and which are plain vs secrets.
Key points:

- `JWT_SECRET` and `DATABASE_URL` come from Secret Manager.
- Storage is **keyless**: `STORAGE_DRIVER=gcs` + `GCS_BUCKET`; the API authenticates
  to GCS as its runtime service account (no access keys). For local dev use
  `STORAGE_DRIVER=local`, or `gcloud auth application-default login` to test `gcs`.
- `UPLOAD_DIR=/tmp/uploads` is required on Cloud Run (read-only working directory).
