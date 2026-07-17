#!/bin/bash
# Database backup script with retry logic and JSON logging
# Requirements: 34.1, 34.2, 34.3, 34.4, 34.5

set -o pipefail

BACKUP_DIR="/backups"
STATUS_FILE="${BACKUP_DIR}/backup-status.json"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
FILENAME="backup_$(date -u +"%Y-%m-%d_%H-%M-%S").sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${FILENAME}"

write_status() {
  local success="$1"
  local size_bytes="$2"
  local error_msg="$3"
  local filename="$4"

  if [ "$success" = "true" ]; then
    cat > "${STATUS_FILE}" <<EOF
{
  "last_backup": {
    "timestamp": "${TIMESTAMP}",
    "success": true,
    "size_bytes": ${size_bytes},
    "filename": "${filename}"
  }
}
EOF
  else
    cat > "${STATUS_FILE}" <<EOF
{
  "last_backup": {
    "timestamp": "${TIMESTAMP}",
    "success": false,
    "error": "${error_msg}"
  }
}
EOF
  fi
}

log_json() {
  local level="$1"
  local message="$2"
  local extra="$3"
  echo "{\"timestamp\":\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",\"level\":\"${level}\",\"message\":\"${message}\"${extra}}"
}

perform_backup() {
  log_json "info" "Starting pg_dump backup" ",\"filename\":\"${FILENAME}\""

  PGPASSWORD="${DB_PASSWORD}" pg_dump \
    -h "${DB_HOST:-postgres}" \
    -p "${DB_PORT:-5432}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --no-owner \
    --no-privileges \
    2>/tmp/pg_dump_error | gzip > "${BACKUP_PATH}"

  local exit_code=${PIPESTATUS[0]}

  if [ $exit_code -ne 0 ]; then
    local error_msg
    error_msg=$(cat /tmp/pg_dump_error 2>/dev/null | tr '"' "'" | tr '\n' ' ')
    rm -f "${BACKUP_PATH}"
    log_json "error" "pg_dump failed" ",\"error\":\"${error_msg}\""
    return 1
  fi

  # Verify the backup file exists and has content
  if [ ! -s "${BACKUP_PATH}" ]; then
    rm -f "${BACKUP_PATH}"
    log_json "error" "Backup file is empty"
    return 1
  fi

  return 0
}

cleanup_old_backups() {
  log_json "info" "Cleaning up backups older than ${RETENTION_DAYS} days"
  find "${BACKUP_DIR}" -name "backup_*.sql.gz" -type f -mtime "+${RETENTION_DAYS}" -delete
}

# Main execution
mkdir -p "${BACKUP_DIR}"

# First attempt
if perform_backup; then
  SIZE_BYTES=$(stat -c %s "${BACKUP_PATH}" 2>/dev/null || stat -f %z "${BACKUP_PATH}" 2>/dev/null)
  write_status "true" "${SIZE_BYTES}" "" "${FILENAME}"
  log_json "info" "Backup completed successfully" ",\"filename\":\"${FILENAME}\",\"size_bytes\":${SIZE_BYTES}"
  cleanup_old_backups
  exit 0
fi

# Retry once after 5 minutes (Requirement 34.4)
log_json "warn" "First backup attempt failed, retrying in 5 minutes"
sleep 300

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
FILENAME="backup_$(date -u +"%Y-%m-%d_%H-%M-%S").sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${FILENAME}"

if perform_backup; then
  SIZE_BYTES=$(stat -c %s "${BACKUP_PATH}" 2>/dev/null || stat -f %z "${BACKUP_PATH}" 2>/dev/null)
  write_status "true" "${SIZE_BYTES}" "" "${FILENAME}"
  log_json "info" "Backup completed successfully on retry" ",\"filename\":\"${FILENAME}\",\"size_bytes\":${SIZE_BYTES}"
  cleanup_old_backups
  exit 0
fi

# Both attempts failed
ERROR_MSG=$(cat /tmp/pg_dump_error 2>/dev/null | tr '"' "'" | tr '\n' ' ')
write_status "false" "" "pg_dump failed after retry: ${ERROR_MSG}" ""
log_json "error" "Backup failed after retry" ",\"error\":\"${ERROR_MSG}\""
exit 1
