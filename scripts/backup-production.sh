#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
compose_file="$repository_root/compose.production.yml"
environment_file=${1:-"$repository_root/.env.production"}
container_cli=${SERVICEAUDIT_CONTAINER_CLI:-docker}
backup_directory=${SERVICEAUDIT_BACKUP_DIR:-}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

case "$container_cli" in
  docker|podman) ;;
  *) fail "SERVICEAUDIT_CONTAINER_CLI must be docker or podman." ;;
esac

[ -n "$backup_directory" ] || fail "SERVICEAUDIT_BACKUP_DIR is required and must point outside container data volumes."
[ -f "$environment_file" ] || fail "Production environment file not found: $environment_file"
command -v "$container_cli" >/dev/null 2>&1 || fail "$container_cli is not available on PATH."

mkdir -p "$backup_directory"
backup_directory=$(CDPATH= cd -- "$backup_directory" && pwd)
[ -w "$backup_directory" ] || fail "Backup directory is not writable: $backup_directory"

case "$backup_directory" in
  /var/lib/docker/*|/var/lib/containers/*)
    fail "Backup directory must not be inside container engine storage."
    ;;
esac

compose() {
  "$container_cli" compose \
    --env-file "$environment_file" \
    --file "$compose_file" \
    "$@"
}

compose config --quiet >/dev/null
compose exec -T postgres pg_isready >/dev/null || fail "Production PostgreSQL is not ready."

umask 077
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
partial_file=$(mktemp "$backup_directory/.ServiceAudit-postgres-$timestamp-XXXXXX.dump.partial")
partial_name=$(basename "$partial_file" .partial)
backup_file="$backup_directory/${partial_name#.}"
checksum_file="$backup_file.sha256"

cleanup_incomplete_backup() {
  rm -f -- "$partial_file"
  if [ ! -s "$backup_file" ]; then
    rm -f -- "$backup_file" "$checksum_file"
  fi
}
trap cleanup_incomplete_backup 0 HUP INT TERM

printf 'Creating PostgreSQL custom-format backup...\n'
if ! compose exec -T postgres sh -c \
  'exec pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --compress=6 --no-owner --no-privileges' \
  > "$partial_file"; then
  fail "pg_dump failed. No usable backup was produced."
fi

[ -s "$partial_file" ] || fail "pg_dump produced an empty backup."

if ! compose exec -T postgres pg_restore --list < "$partial_file" >/dev/null; then
  fail "pg_restore could not read the generated backup archive."
fi

mv -- "$partial_file" "$backup_file"
sha256sum "$backup_file" > "$checksum_file"
trap - 0 HUP INT TERM

printf 'Backup verified: %s\n' "$backup_file"
printf 'Checksum written: %s\n' "$checksum_file"
printf 'Copy both files to an encrypted off-host location.\n'
