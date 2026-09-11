#!/usr/bin/env bash
#
# Restaura un backup de SlackBoard (base MongoDB + uploads).
#
# Uso:
#   scripts/restore-backup.sh backups/20260910-162801.tar.gz
#
# Advertencia: sobrescribe la base de datos y el volumen de uploads actuales.
#
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE="${1:-}"

if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "Uso: $0 <archivo-de-backup.tar.gz>"
  echo "Busca el backup mas reciente con: ls -1t $PROJECT_DIR/backups/*.tar.gz"
  exit 1
fi

MONGO_CONTAINER="${MONGO_CONTAINER:-slackboard-mongo}"
MONGO_ADMIN_USER="${MONGO_ADMIN_USER:-admin}"
MONGO_ADMIN_PASS="${MONGO_ADMIN_PASS:-admin123}"
MONGO_DB="${MONGO_DB:-slackboard}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-slackboard_backend-uploads}"
MONGO_URI="mongodb://$MONGO_ADMIN_USER:$MONGO_ADMIN_PASS@localhost:27017/$MONGO_DB?authSource=admin"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "[restore] Extrayendo $ARCHIVE..."
tar xzf "$ARCHIVE" -C "$WORK"

DUMP_DIR="$(find "$WORK" -type d -name mongo-dump | head -1)"
if [ -z "$DUMP_DIR" ]; then
  echo "[restore] ERROR: el backup no contiene mongo-dump"
  exit 1
fi

echo "[restore] Restaurando MongoDB ($MONGO_DB)..."
docker exec "$MONGO_CONTAINER" rm -rf /tmp/restore-dump >/dev/null 2>&1 || true
docker cp "$DUMP_DIR" "$MONGO_CONTAINER:/tmp/restore-dump"
docker exec "$MONGO_CONTAINER" mongorestore --uri="$MONGO_URI" --drop /tmp/restore-dump --quiet
docker exec "$MONGO_CONTAINER" rm -rf /tmp/restore-dump >/dev/null 2>&1 || true
echo "[restore] MongoDB restaurado."

UPLOADS_TAR="$(find "$WORK" -name uploads.tar.gz | head -1)"
if [ -n "$UPLOADS_TAR" ]; then
  echo "[restore] Restaurando volumen de uploads ($UPLOADS_VOLUME)..."
  mkdir -p "$WORK/uploads-restore"
  tar xzf "$UPLOADS_TAR" -C "$WORK/uploads-restore"
  docker run --rm \
    -v "$UPLOADS_VOLUME:/uploads" \
    -v "$WORK/uploads-restore:/from:ro" \
    alpine sh -c 'rm -rf /uploads/* /uploads/.* 2>/dev/null || true; cp -a /from/. /uploads/'
  echo "[restore] Uploads restaurados: $(docker run --rm -v "$UPLOADS_VOLUME:/uploads" alpine ls -1 /uploads | wc -l) archivo(s)"
fi

echo "[restore] Listo. Reinicia el backend si es necesario: docker compose restart backend"