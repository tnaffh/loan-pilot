# Deploying LoanPilot

Production runs on the Plesk droplet **The-Moon** (`209.38.142.182`, DigitalOcean `sfo3`)
alongside sendhub, city-pilot and smartcity — three Docker containers behind Plesk nginx,
using the host's own PostgreSQL 16 and DigitalOcean Spaces for documents.

```
                        Plesk nginx :443 (Let's Encrypt)
raccoonsfinance.com ─┐
www.raccoonsfinance ─┴─▶ 127.0.0.1:3000  web        (marketing + apply)
pilot.raccoonsfinance ──▶ 127.0.0.1:3001  dashboard  (lender portal)
api.raccoonsfinance  ───▶ 127.0.0.1:4000  api        (NestJS)
                                            ├─ unix socket /var/run/postgresql → host PG 16
                                            ├─ DO Spaces sfo3 (10-min presigned URLs)
                                            └─ Resend (HTTPS out)
```

## Deploying

- **Automatic:** merge to `main`. CI runs first; only when it goes green does `deploy`
  build the three images, push them to GHCR tagged with the commit SHA, write the
  production `.env` to the server from Secret Manager, take a pre-deploy database dump,
  and roll the containers.
- **Manual:** run the `deploy` workflow from the Actions tab (`workflow_dispatch`).
- **Rollback:** see below — it is a one-line edit, not a rebuild.

Nothing is ever built on the server. The point is that a SHA-tagged image is what makes
rollback a one-line change rather than a rebuild — plus the server needs no git checkout,
no toolchain, and no build-cache churn on a box that also serves 19 production vhosts.

## Server layout

| Piece | Where |
| --- | --- |
| Stack definition | `/root/loanpilot/docker-compose.yml` (shipped by CI) |
| Env file | `/root/loanpilot/.env` — root-owned, `chmod 600`, **outside every vhost docroot** |
| Backup script | `/root/loanpilot/scripts/pg-backup.sh` |
| Dumps | `/root/loanpilot-backups/`, 7 days local, mirrored to Spaces |
| Database | host PostgreSQL 16, role + db `loanpilot`, socket `/var/run/postgresql` |
| Documents | DO Spaces `raccoonsfinance-loanpilot` (sfo3, private), key `loanpilot-app` |
| nginx | `deploy/nginx/*.conf` → `/var/www/vhosts/system/<host>/conf/vhost_nginx.conf` |
| Images | `ghcr.io/tnaffh/loan-pilot/{api,web,dashboard}:<git-sha>` |
| Logs | `docker compose logs -f api`, capped at 3 × 10 MB per container |

The server holds **no git checkout** — only the compose file, the env file and the backup
script.

## Secrets

GCP Secret Manager in project `raccoons-loan-pilot` is the source of truth — after the
migration that project holds nothing but secrets. GitHub Actions reaches it through
Workload Identity Federation (pool `github`, provider `github-oidc`, service account
`loanpilot-deploy@`), so there is no long-lived key in GitHub or on the droplet. The
provider carries an attribute condition pinning it to `tnaffh/loan-pilot`, so no other
repository can mint a token for that account. Same arrangement as sendhub and city-pilot.

| Secret | Contents |
| --- | --- |
| `loanpilot-production-env` | the whole production `.env` |
| `loanpilot-deploy-ssh-key` | the CI SSH private key |
| `loanpilot-ghcr-token` | a `read:packages` PAT so the server can pull |

CI overwrites `/root/loanpilot/.env` on **every** deploy, so never edit the server copy —
edit the secret:

```bash
gcloud secrets versions access latest --secret=loanpilot-production-env \
  --project=raccoons-loan-pilot > .env.production
# edit .env.production, then
gcloud secrets versions add loanpilot-production-env \
  --project=raccoons-loan-pilot --data-file=.env.production
```

`IMAGE_TAG` is the exception — the pipeline owns it, so a deploy never means editing the
secret. See `deploy/.env.example` for every variable and what it does.

## Rollback

Images are tagged with immutable commit SHAs, which is what replaces Cloud Run's revision
rollback:

```bash
cd /root/loanpilot
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=<previous-sha>/' .env
docker compose up -d
```

About 20 seconds. Never deploy `:latest`, and don't `docker image prune -a` — the deploy
only reaps images older than 14 days precisely so the previous ones are still there.

**An image rollback does not undo a migration, and Prisma has no `migrate down`.** So:

- Migrations must stay backward-compatible for at least one release (expand → deploy →
  contract). Rolling the image back must be safe against the newer schema.
- Every deploy takes a `pre-deploy` dump first, and aborts if that dump fails. To undo a
  schema change, restore it:
  ```bash
  pg_restore -h /var/run/postgresql -U loanpilot -d loanpilot --clean --if-exists \
    /root/loanpilot-backups/loanpilot-pre-deploy-<stamp>.dump
  ```

## Database

```bash
psql -h /var/run/postgresql -U loanpilot -d loanpilot          # needs ~/.pgpass
docker compose exec api pnpm exec prisma migrate status
```

Postgres listens on `127.0.0.1` only and its `pg_hba.conf` allows nothing from the Docker
bridge; the container reaches it purely through the mounted socket directory, authorised
by one scoped line:

```
local   loanpilot   loanpilot   scram-sha-256   # above the catch-all `local all all peer`
```

That line is why `sendhub` and `city_pilot` stay unreachable from any container on the
box, and why the change needed only `SELECT pg_reload_conf();` rather than a restart.

`pg_dump` and `psql` cannot be handed `DATABASE_URL` — it carries Prisma-only query
params (`connection_limit`, `pool_timeout`, `schema`) that libpq rejects outright. Use
explicit flags plus `~/.pgpass` (`chmod 600`), as `scripts/pg-backup.sh` does.

`/root/.pgpass` needs **both** spellings of the host, because libpq presents a
default-socket connection as `localhost` rather than as the socket directory:

```
localhost:5432:loanpilot:loanpilot:<pw>
/var/run/postgresql:5432:loanpilot:loanpilot:<pw>
```

## Backups

`scripts/pg-backup.sh` dumps, verifies the archive by reading its table of contents back,
uploads to Spaces and prunes local copies older than 7 days.

Uploads go to `raccoonsfinance-loanpilot-backups` via the `spaces` rclone remote in
`/root/.config/rclone/rclone.conf`, using the bucket-scoped `loanpilot-backup` key (the
app's own key deliberately cannot write here). That remote **must** carry
`no_check_bucket = true`: rclone probes for a bucket by attempting to create it, and a
bucket-scoped key gets a 403 on `CreateBucket`, which otherwise fails every upload.

It runs before every deploy and nightly from root's crontab:

```
15 2 * * * /root/loanpilot/scripts/pg-backup.sh nightly >> /var/log/loanpilot-backup.log 2>&1
```

This is the loan book's **only** backup — the Cloud SQL instance it replaced was running
with `backupConfiguration.enabled: false`, so nothing was being backed up before it
either. DigitalOcean droplet snapshots are not a substitute: restoring one rolls back 19
unrelated domains and MariaDB along with us. Test a restore into a scratch database
periodically; a backup you have never restored is a hypothesis.

## Gotchas

- **`NEXT_PUBLIC_*` is baked at image build time.** Changing an API or site URL means
  rebuilding the web and dashboard images, not editing `.env`. The values live in
  `.github/workflows/deploy.yml`.
- **Bind container ports to `127.0.0.1` only.** Docker publishes via `nat/PREROUTING` and
  filters in `DOCKER-USER`, bypassing the host's `INPUT` chain entirely — a `0.0.0.0`
  bind would put the API on the public internet past Plesk and past `INPUT DROP`. Verify
  from off-box with `nmap -p 3000,3001,4000,5432 209.38.142.182`.
- **`S3_PUBLIC_URL` must stay blank.** Setting it makes the API hand out permanent,
  unsigned, public links to every borrower ID copy, payslip and bank statement.
- **`S3_FORCE_PATH_STYLE=false` for Spaces.** Path-style breaks *presigned* URLs
  specifically: SigV4 signs host and path together, the endpoint redirects between styles
  and drops the signed query string, and the browser lands on `SignatureDoesNotMatch`
  with nothing logged. Documents fail to open; no health check notices.
- **Missing `RESEND_API_KEY` fails silently** — the API logs emails instead of sending
  them and never errors. After any env change, send a real invite.
- **`DASHBOARD_URL` has a localhost default.** Omit it and every invite link, password
  reset and post-Google-login redirect points at `http://localhost:3001`.
- **The nginx snippets are the only files Plesk preserves** across
  `plesk sbin httpdmng --reconfigure-domain <host>`. Everything else in the generated
  vhost is regenerated.
- **Back up the DNS zone before any Plesk domain operation.** Creating a subdomain writes
  DNS records, and this zone carries the Google Workspace `MX`, Google SPF/DKIM and the
  Resend records for `send.raccoonsfinance.com`. A zone rebuild wiped these once and put
  company mail in spam.
  ```bash
  plesk bin dns --info raccoonsfinance.com > /root/zone-$(date +%F).txt
  ```
- **A stale socket mount** (if `/run` is remounted or `postgresql-common` reinstalled)
  leaves the container up but unable to connect. Recover with
  `docker compose up -d --force-recreate`. The healthcheck reads the response *body*
  rather than the status code so this actually gets noticed.

## Local development (unchanged)

```bash
pnpm install
pnpm db:up        # local Postgres on :5544
pnpm dev          # api :4000, web :3000, dashboard :3001
```

Documents default to `STORAGE_DRIVER=local` — no Spaces needed. See
[`apps/api/.env.example`](../apps/api/.env.example).
