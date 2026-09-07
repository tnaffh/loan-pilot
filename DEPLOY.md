# Deploying LoanPilot

The runbook for the self-hosted stack lives in
**[`deploy/README.md`](deploy/README.md)**: three Docker containers behind Plesk nginx on
the droplet The-Moon (`209.38.142.182`), the host's PostgreSQL 16, and DigitalOcean
Spaces for documents, deployed by GitHub Actions from a green `main`.

**Production is still on GCP until the cutover.** Until then,
[`docs/DEPLOYMENT-GCP.md`](docs/DEPLOYMENT-GCP.md) describes what is actually running.
