# ServiceAudit Pilot Deployment Foundation

This runbook describes the single-server deployment foundation for one
ServiceAudit organization. It does not deploy a remote environment. The
application request/security boundaries described below are required, but they
do not replace the remaining backup, recovery, monitoring, and real-environment
readiness work.

## Architecture

External HTTP/HTTPS traffic reaches only Caddy. Caddy terminates TLS, requires
HTTP Basic Auth, and proxies to the Next.js application on the private Compose
network. The application reaches PostgreSQL on a separate internal network.
Neither port 3000 nor port 5432 is published on the host.

The deployment uses:

- `runner`: the non-root, standalone Next.js runtime image;
- `migrator`: a non-root, one-off image containing production dependencies and
  the checked-in `drizzle/` migrations;
- `postgres`: the private database with the `postgres-data` named volume;
- `caddy`: the only public ingress, publishing ports 80 and 443.

Basic Auth is only a pilot access gate. It must only be used over HTTPS and it
does not provide application-level user identity or review attribution.

## Request and browser security boundaries

- Every state-changing API route validates the browser request source against
  `SERVICEAUDIT_PUBLIC_ORIGIN` before reading its body. Keep this value equal to
  the exact external HTTPS origin configured in `PILOT_HOSTNAME`.
- Missing or invalid `SERVICEAUDIT_PUBLIC_ORIGIN` fails write requests closed in
  production. Organization scope still comes only from the server-side
  `SERVICEAUDIT_ORGANIZATION_ID`.
- JSON bodies are limited to 16 KiB. Import requests are limited to 11 MiB,
  uploaded Excel or CSV files to 10 MiB, and imported data to 25,000 rows per file. No
  data is silently truncated and an exceeded limit creates no import rows.
- Caddy applies a coarse 12 MB request-body ceiling before the request reaches
  Next.js. Application checks remain authoritative for file and row limits.
- Next.js and Caddy set practical anti-framing, MIME-sniffing, referrer, and
  browser capability headers. Caddy adds HSTS on HTTPS. A restrictive CSP is
  deliberately deferred until its effect on Next.js can be tested in the pilot
  environment.

## Prerequisites

- A Linux host with Docker Engine and Docker Compose v2
- A pilot hostname whose DNS points to the host
- Inbound TCP 80 and 443 (and optional UDP 443) available to Caddy
- No public exposure of PostgreSQL
- An existing pilot organization UUID
- A reviewed, off-host backup location

Local development may continue to use the existing Podman workflow. This file
is the one documented production Compose path.

## Production environment

Copy the tracked template to an ignored production file:

```sh
cp .env.production.example .env.production
chmod 600 .env.production
```

Replace every placeholder. In particular:

- `PILOT_HOSTNAME` is a hostname only, without a scheme.
- `SERVICEAUDIT_PUBLIC_ORIGIN` is the HTTPS origin for the same hostname.
- `SERVICEAUDIT_IMAGE_TAG` should be the full deployed Git commit SHA.
- `SERVICEAUDIT_ORGANIZATION_ID` must identify an existing organization row.
- `POSTGRES_PASSWORD` and the password in `DATABASE_URL` must match. URL-encode
  reserved characters in `DATABASE_URL`.
- `DATABASE_URL` must use `postgres` as its host inside Compose.

Generate the Caddy password hash interactively:

```sh
docker run --rm -it caddy:2-alpine caddy hash-password
```

Put the resulting hash in `PILOT_BASIC_AUTH_PASSWORD_HASH`. Keep it in single
quotes in `.env.production` so Compose treats dollar signs literally. Never put
the plaintext password or a real hash in the repository.

## Build the immutable images

Run the full project QA gate before building a release. Then build both targets
using the same source commit:

```sh
docker compose --env-file .env.production -f compose.production.yml build app migrator
```

The application image contains the standalone Next.js server, public files, and
static assets. It does not contain the source tree or development dependencies.
The separate migrator image contains runtime database dependencies and the
checked-in migrations, but not Drizzle Kit.

## First start and explicit migrations

Start only PostgreSQL first:

```sh
docker compose --env-file .env.production -f compose.production.yml up -d postgres
```

Apply pending checked-in migrations deliberately:

```sh
docker compose --env-file .env.production -f compose.production.yml --profile operations run --rm migrator
```

The migrator exits non-zero on failure. Do not start a new application version
after a failed migration. Migrations never run automatically during application
startup, and this workflow never runs schema push/reset commands.

For a new empty database, provision the pilot organization as a separate,
deliberate operational step or restore the approved pilot database. This
foundation intentionally does not seed or reset business data.

Start the application and ingress after migrations succeed:

```sh
docker compose --env-file .env.production -f compose.production.yml up -d app caddy
```

## Health and smoke checks

Inspect container health and recent logs:

```sh
docker compose --env-file .env.production -f compose.production.yml ps
docker compose --env-file .env.production -f compose.production.yml logs --tail 100 app postgres caddy
```

Run the read-only HTTP smoke check from a trusted operator machine. Supply the
plaintext Basic Auth password only in that process environment; do not save it
in the repository:

```sh
SERVICEAUDIT_SMOKE_BASE_URL=https://serviceaudit-pilot.example.com \
SERVICEAUDIT_SMOKE_AUTH_USERNAME=pilot-user \
SERVICEAUDIT_SMOKE_AUTH_PASSWORD='temporary-shell-value' \
npm run smoke:production
```

The smoke check verifies `/api/health`, `/`, `/findings`, `/imports`, and
`/warranties/new`. It performs no writes and expects the health response to be
`{"status":"ok","database":"connected"}`.

## Restart and stop

Restart a single service without touching database storage:

```sh
docker compose --env-file .env.production -f compose.production.yml restart app
```

Stop the stack while retaining named volumes:

```sh
docker compose --env-file .env.production -f compose.production.yml down
```

Never use `down --volumes` for a pilot environment; that removes persisted
database and certificate data.

## Update and redeploy

1. Check out the reviewed Git commit and set its full SHA as
   `SERVICEAUDIT_IMAGE_TAG`.
2. Run `./scripts/qa.ps1` on the release candidate.
3. Create and verify an off-host database backup.
4. Build the `app` and `migrator` images.
5. Start PostgreSQL and run the one-off migrator.
6. Recreate `app` and `caddy` with `up -d app caddy`.
7. Check health, logs, and the read-only smoke test.

## Backup basics

The `postgres-data` volume provides persistence across container recreation; it
is not a backup. Create and verify a timestamped custom-format backup before
every release and on the nightly schedule:

```sh
SERVICEAUDIT_BACKUP_DIR=/srv/serviceaudit/backups \
  sh scripts/backup-production.sh .env.production
```

The full retention policy, isolated restore drill, real recovery safeguards,
release/rollback procedure, monitoring checklist, and log guidance are in
[OPERATIONS.md](OPERATIONS.md). Never test restore by overwriting the active
pilot database.

## Rollback guidance

Keep the previous application image tag. For an application-only failure,
restore the previous `SERVICEAUDIT_IMAGE_TAG`, recreate `app`, and repeat health
and smoke checks. Do not automatically reverse database migrations. If a schema
change is not backward compatible, stop and choose a reviewed forward fix or a
deliberate restore from the pre-migration backup.

Follow the decision points in [OPERATIONS.md](OPERATIONS.md). An application
image rollback never implies that the database schema was rolled back.

## Known limitations

- This foundation has no application login, user roles, or review attribution.
- Proxy Basic Auth is a controlled-pilot gate, not application authentication.
- The repository provides backup and restore-drill procedures, but scheduling,
  encrypted off-host storage, monitoring automation, and a real remote
  environment must still be provisioned and operated by the pilot owner.
- The exact uploaded Excel or CSV bytes are not retained by the current product.
- Same-origin validation is a browser request boundary, not user authentication
  or authorization. Pilot access still depends on HTTPS and the Caddy access
  gate until a separately designed identity model exists.
