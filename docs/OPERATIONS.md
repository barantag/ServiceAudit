# ServiceAudit Pilot Operations and Recovery

This runbook is the minimum operating package for a controlled,
single-organization pilot. PostgreSQL is the only durable application state.
The uploaded Excel and CSV objects are not retained, so a database backup is also the
backup of imported raw-row evidence, finding reviews, and organization data.

These are pilot targets, not a contractual SLA:

- recovery point objective (RPO): 24 hours;
- recovery time objective (RTO): 4 hours;
- one nightly backup and one additional backup before every migration/release;
- at least 7 daily and 4 weekly recovery points;
- encrypted off-host copies, protected in transit and at rest;
- a restore drill before pilot launch and periodically thereafter.

## Create and verify a backup

Choose a host directory outside the repository, PostgreSQL data volume, and
container-engine storage. Do not use `/var/lib/docker`, `/var/lib/containers`,
or the `postgres-data` volume. From the checked-out release directory run:

```sh
SERVICEAUDIT_BACKUP_DIR=/srv/serviceaudit/backups \
  sh scripts/backup-production.sh .env.production
```

The script:

1. validates the production Compose configuration and PostgreSQL readiness;
2. runs a read-only, custom-format `pg_dump` inside the production PostgreSQL
   container without placing a password on the command line;
3. writes a unique UTC-timestamped `.dump` with restrictive file permissions;
4. proves that `pg_restore --list` can read the archive;
5. writes a `.sha256` checksum alongside it.

An incomplete or unreadable dump fails the command and is removed. Existing
backups are never overwritten. A successful local dump is not sufficient:
copy the dump and checksum to an encrypted off-host destination, verify the
checksum there, and record backup success and age in the operator log.

A simple host cron entry is enough for the pilot; use the host's protected
service account and log destination:

```cron
15 2 * * * cd /opt/serviceaudit && SERVICEAUDIT_BACKUP_DIR=/srv/serviceaudit/backups /bin/sh scripts/backup-production.sh /opt/serviceaudit/.env.production >>/var/log/serviceaudit-backup.log 2>&1
```

Retention deletion is deliberately not automated by the repository. Configure
the approved backup destination to retain at least 7 daily and 4 weekly
recovery points, and remove a recovery point only after its off-host copy and a
newer verified backup exist.

## Verify with an isolated restore drill

First verify the sidecar checksum, then restore the archive into a disposable
PostgreSQL container:

```sh
cd /opt/serviceaudit
sha256sum --check /srv/serviceaudit/backups/ServiceAudit-postgres-<timestamp>.dump.sha256
SERVICEAUDIT_CONTAINER_CLI=docker \
  node scripts/restore-drill.mjs /srv/serviceaudit/backups/ServiceAudit-postgres-<timestamp>.dump
```

The drill validates the archive, creates a uniquely named PostgreSQL 17
container with no published ports and a temporary in-memory data directory,
restores with `--exit-on-error`, and verifies these public tables:

- `organizations`
- `imports`
- `service_records`
- `warranties`
- `finding_reviews`

It then removes only the uniquely named container it created. It never connects
to or changes the active database. A failed cleanup is reported as a drill
failure and must be handled before the drill is considered complete.

Record the drill date, backup timestamp, operator, elapsed time, and result. A
successful list check is not a replacement for the periodic full restore drill.
Local project verification exercises the same flow against a read-only dump of
the development container, without changing it:

```powershell
node .\scripts\verify-pilot-operations.mjs --restore-drill
```

## Real recovery decision

There is intentionally no in-place production restore script. Never pipe a dump
into the active production project. A real recovery may discard data newer than
the chosen recovery point and therefore requires an explicit incident decision.

For recovery, stop application writes, preserve the failed environment, select
and checksum a recovery point, and create a new Compose project name so Docker
creates a separate PostgreSQL volume. Restore only into that confirmed-empty
database, validate tables and business counts, then deliberately switch the
application configuration after review. Example project naming:

```sh
docker compose -p serviceaudit-recovery-20260912 \
  --env-file .env.production -f compose.production.yml up -d postgres

docker compose -p serviceaudit-recovery-20260912 \
  --env-file .env.production -f compose.production.yml exec -T postgres \
  sh -c 'pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-owner --no-privileges --exit-on-error' \
  < /srv/serviceaudit/backups/ServiceAudit-postgres-<timestamp>.dump
```

Before any cutover, prove that this is the recovery project—not the active
project—and compare organization, import, service-record, warranty, and review
counts. Keep the old volume intact until the recovery is accepted. Database
restore and application rollback are separate decisions.

## Release and update checklist

1. Start from a reviewed Git commit/tag and record the current and target
   `SERVICEAUDIT_IMAGE_TAG` plus a protected copy of `.env.production`.
2. Run `./scripts/qa.ps1` on the exact source revision.
3. Create, verify, and copy a pre-release backup off-host.
4. Build or pull the immutable app and migrator images for the target tag.
5. Start PostgreSQL only and run the one-off migrator explicitly. Migrations
   never run during application startup.
6. Recreate the app and Caddy services without removing volumes.
7. Confirm `docker compose ps`, `/api/health`, and the read-only production
   smoke test.
8. Inspect app, PostgreSQL, and Caddy logs and record the release result.

Use the exact commands in [DEPLOYMENT.md](DEPLOYMENT.md). Do not proceed after a
failed migration, health check, smoke check, or backup.

## Application and configuration rollback

For an application-only problem, restore the previous immutable
`SERVICEAUDIT_IMAGE_TAG`, restore the reviewed previous configuration if it
changed, recreate `app` and `caddy`, and repeat health, smoke, and log checks.

Rolling back an image does **not** roll back PostgreSQL schema changes. Do not
run reverse migrations automatically. If the older app is incompatible with a
forward migration, stop and choose either a reviewed forward fix or a separate
database recovery using the pre-release backup. Database recovery can lose all
writes after the selected backup and requires an explicit operator decision.

## Pilot monitoring checklist

| Check | Starting cadence | Operator attention trigger |
| --- | --- | --- |
| `/api/health` through Caddy | Every 5 minutes | Non-200, database not connected, or repeated latency |
| App/PostgreSQL/Caddy container status | Every 5 minutes | Restart loop, unhealthy, stopped, or OOM state |
| Host disk and database-volume growth | Daily | Less than 20% free, unexpected growth, or backup volume filling |
| Host CPU and memory | Daily and during incidents | Sustained saturation, swap pressure, or OOM events |
| Application error logs | Daily | Repeated 5xx, import failures, configuration failures |
| PostgreSQL logs/readiness | Daily | Connection failures, recovery messages, corruption, disk errors |
| Caddy logs/certificate state | Daily | TLS renewal errors, repeated upstream failures, unusual 4xx/5xx surge |
| Backup job result and backup age | After every run | Failed job, invalid checksum/list check, or newest backup older than 24 hours |
| External uptime check, if internet-facing | Every 5 minutes | Two consecutive failures from outside the host |

The initial thresholds are operational prompts, not an SLA. Escalate immediately
for lost database connectivity, disk exhaustion risk, repeated restore/backup
failure, suspected unauthorized access, or evidence-integrity concerns.

## Logs and sensitive data

Use bounded log reads during normal operation:

```sh
docker compose --env-file .env.production -f compose.production.yml logs --tail 200 app
docker compose --env-file .env.production -f compose.production.yml logs --tail 200 postgres
docker compose --env-file .env.production -f compose.production.yml logs --tail 200 caddy
```

Do not log or paste database passwords, `.env.production`, Basic Authorization
headers, imported raw row contents, uploaded data, or customer-sensitive review
notes into tickets or shared channels. Share only the minimum redacted evidence.

## Known production dependency finding

As of 2026-09-12, `npm audit --omit=dev` reports 2 moderate findings through
`exceljs` and its `uuid <11.1.1` dependency (`GHSA-w5hq-g745-h8pq`). The offered
forced remediation downgrades ExcelJS to a breaking version. It remains an open
follow-up: do not use `npm audit fix --force`, do not claim it is resolved, and
reassess when a compatible upstream dependency path is available.
