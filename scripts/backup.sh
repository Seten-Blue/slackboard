#!/usr/bin/env bash
#
# Backup de SlackBoard: base de datos MongoDB + archivos de uploads.
# Guarda un .tar.gz con fecha en BACKUP_ROOT y conserva las ultimas KEEP copias.
#
# Uso:
#   scripts/backup.sh                 # backup manual
#   KEEP=20 scripts/backup.sh         # conservar 20 backups
#   SMOKE_TEST=1 scripts/backup.sh    # solo verificar que todo funciona
#
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-$PROJECT_DIR/backups}"
KEEP="${KEEP:-15}"
MONGO_CONTAINER="${MONGO_CONTAINER:-slackboard-mongo}"
MONGO_ADMIN_USER="${MONGO_ADMIN_USER:-admin}"
MONGO_ADMIN_PASS="${MONGO_ADMIN_PASS:-admin123}"
MONGO_DB="${MONGO_DB:-slackboard}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-slackboard_backend-uploads}"
INCLUDE_ENV="${INCLUDE_ENV:-0}"
SMOKE_TEST="${SMOKE_TEST:-0}"

STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_ROOT/$STAMP"
ARCHIVE="$DEST.tar.gz"
MONGO_URI="mongodb://$MONGO_ADMIN_USER:$MONGO_ADMIN_PASS@localhost:27017/$MONGO_DB?authSource=admin"

mkdir -p "$BACKUP_ROOT" "$DEST"

log() { echo "[backup] $*"; }

# 1) Dump de MongoDB
log "Dump de MongoDB ($MONGO_DB)..."
docker exec "$MONGO_CONTAINER" rm -rf /tmp/slackboard-dump >/dev/null 2>&1 || true
docker exec "$MONGO_CONTAINER" mongodump --uri="$MONGO_URI" --out=/tmp/slackboard-dump --quiet
docker cp "$MONGO_CONTAINER:/tmp/slackboard-dump" "$DEST/mongo-dump"
docker exec "$MONGO_CONTAINER" rm -rf /tmp/slackboard-dump >/dev/null 2>&1 || true
log "Dump OK: $DEST/mongo-dump"

# 2) Volumen de uploads
log "Copiando volumen de uploads ($UPLOADS_VOLUME)..."
docker run --rm \
  -v "$UPLOADS_VOLUME:/uploads:ro" \
  -v "$DEST:/backup" \
  alpine tar czf /backup/uploads.tar.gz -C /uploads . >/dev/null 2>&1
log "Uploads OK: $DEST/uploads.tar.gz"

# 3) Opcional: .env para poder restaurar credenciales
if [ "$INCLUDE_ENV" = "1" ] && [ -f "$PROJECT_DIR/backend/.env" ]; then
  cp "$PROJECT_DIR/backend/.env" "$DEST/backend.env"
  log ".env incluido en el backup."
fi

# 4) Empaquetar todo el respaldo
log "Empaquetando en $ARCHIVE..."
tar czf "$ARCHIVE" -C "$BACKUP_ROOT" "$STAMP"
rm -rf "$DEST"
log "Backup creado: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

# 5) Podar backups viejos
if [ "$SMOKE_TEST" != "1" ]; then
  ls -1t "$BACKUP_ROOT"/*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r OLD; do
    log "Eliminando backup viejo: $(basename "$OLD")"
    rm -f "$OLD"
  done
else
  rm -f "$ARCHIVE"
  log "SMOKE_TEST=1: no se conserva el backup, solo se verifico el flujo."
fi

log "Listo."