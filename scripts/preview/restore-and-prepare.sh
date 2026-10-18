#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker/preview/compose.yml"
PREVIEW_ENV_FILE="$ROOT_DIR/docker/preview/.env"

SOURCE_DB_CONTAINER="${SOURCE_DB_CONTAINER:-splitpro-db}"
SOURCE_APP_CONTAINER="${SOURCE_APP_CONTAINER:-splitpro}"
PREVIEW_DB_CONTAINER="${PREVIEW_DB_CONTAINER:-splitpro-preview-db}"
PREVIEW_UPLOADS_VOLUME="${PREVIEW_UPLOADS_VOLUME:-split-pro-preview-uploads}"

if [[ ! -f "$PREVIEW_ENV_FILE" ]]; then
  echo 'Missing docker/preview/.env. Copy .env.example and set preview credentials first.' >&2
  exit 1
fi

if [[ "$SOURCE_DB_CONTAINER" == "$PREVIEW_DB_CONTAINER" ]]; then
  echo 'Source and preview database containers must be different.' >&2
  exit 1
fi

if [[ "${CONFIRM_PREVIEW_RESTORE:-}" != 'yes' ]]; then
  echo 'Set CONFIRM_PREVIEW_RESTORE=yes to replace the preview database with a fresh production snapshot.' >&2
  exit 1
fi

docker volume create "$PREVIEW_UPLOADS_VOLUME" >/dev/null
if ! docker run --rm -v "$PREVIEW_UPLOADS_VOLUME:/target" alpine:3.21 \
  sh -c 'test -z "$(find /target -mindepth 1 -maxdepth 1 -print -quit)"'; then
  echo 'Preview uploads volume is not empty; refusing to overlay a fresh copy.' >&2
  exit 1
fi

CRON_LAUNCH_ACTIVE_JOBS=off docker compose --env-file "$PREVIEW_ENV_FILE" \
  -f "$COMPOSE_FILE" up -d postgres

for attempt in $(seq 1 60); do
  if [[ "$(docker inspect --format '{{.State.Health.Status}}' "$PREVIEW_DB_CONTAINER" 2>/dev/null || true)" == 'healthy' ]]; then
    break
  fi
  if [[ "$attempt" == '60' ]]; then
    echo 'Preview PostgreSQL did not become healthy.' >&2
    exit 1
  fi
  sleep 2
done

SOURCE_POSTGRES_USER="$(docker exec "$SOURCE_DB_CONTAINER" printenv POSTGRES_USER)"
SOURCE_POSTGRES_DB="$(docker exec "$SOURCE_DB_CONTAINER" printenv POSTGRES_DB)"
PREVIEW_POSTGRES_USER="$(docker exec "$PREVIEW_DB_CONTAINER" printenv POSTGRES_USER)"
PREVIEW_POSTGRES_DB="$(docker exec "$PREVIEW_DB_CONTAINER" printenv POSTGRES_DB)"
SOURCE_DB_ID="$(docker inspect --format '{{.Id}}' "$SOURCE_DB_CONTAINER")"
PREVIEW_DB_ID="$(docker inspect --format '{{.Id}}' "$PREVIEW_DB_CONTAINER")"

if [[ "$SOURCE_DB_ID" == "$PREVIEW_DB_ID" || "$SOURCE_POSTGRES_DB" == "$PREVIEW_POSTGRES_DB" ]]; then
  echo 'Source and preview database targets must be distinct.' >&2
  exit 1
fi

echo 'Streaming production database snapshot into the isolated preview database.'
set -o pipefail
docker exec "$SOURCE_DB_CONTAINER" pg_dump \
  --username "$SOURCE_POSTGRES_USER" \
  --dbname "$SOURCE_POSTGRES_DB" \
  --format=custom \
  --no-owner \
  --no-acl |
  docker exec -i "$PREVIEW_DB_CONTAINER" pg_restore \
    --username "$PREVIEW_POSTGRES_USER" \
    --dbname "$PREVIEW_POSTGRES_DB" \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl

echo 'Removing copied authentication tokens, external bank credentials, push subscriptions, and active cron jobs.'
docker exec -i "$PREVIEW_DB_CONTAINER" psql \
  --username "$PREVIEW_POSTGRES_USER" \
  --dbname "$PREVIEW_POSTGRES_DB" \
  --set ON_ERROR_STOP=1 < "$SCRIPT_DIR/prepare-copy.sql"

CRON_LAUNCH_ACTIVE_JOBS=on docker compose --env-file "$PREVIEW_ENV_FILE" \
  -f "$COMPOSE_FILE" up -d --force-recreate postgres

for attempt in $(seq 1 60); do
  if [[ "$(docker inspect --format '{{.State.Health.Status}}' "$PREVIEW_DB_CONTAINER" 2>/dev/null || true)" == 'healthy' ]]; then
    break
  fi
  if [[ "$attempt" == '60' ]]; then
    echo 'Preview PostgreSQL did not become healthy after the sanitized restore.' >&2
    exit 1
  fi
  sleep 2
done

echo 'Copying production uploads directly into the preview uploads volume.'
docker exec "$SOURCE_APP_CONTAINER" tar -C /app/uploads -cf - . |
  docker run --rm -i -v "$PREVIEW_UPLOADS_VOLUME:/target" alpine:3.21 \
    sh -c 'tar -C /target -xf - && chown -R 1000:1000 /target'

docker compose --env-file "$PREVIEW_ENV_FILE" -f "$COMPOSE_FILE" up -d --build app

printf 'Preview snapshot restore completed at %s UTC.\n' "$(date -u '+%Y-%m-%d %H:%M:%S')"
