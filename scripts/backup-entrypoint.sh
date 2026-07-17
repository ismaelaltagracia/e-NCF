#!/bin/bash
# Backup container entrypoint
# Sets up cron with configurable schedule and runs in foreground

set -e

BACKUP_SCHEDULE="${BACKUP_SCHEDULE:-0 2 * * *}"

# Export environment variables so cron jobs can access them
printenv | grep -E "^(DB_|BACKUP_|PATH=)" > /etc/environment

# Create the cron job script wrapper that sources environment
cat > /usr/local/bin/run-backup.sh <<'WRAPPER'
#!/bin/bash
# Source environment variables for cron context
set -a
source /etc/environment
set +a
exec /scripts/backup.sh
WRAPPER
chmod +x /usr/local/bin/run-backup.sh

# Ensure backup directory exists
mkdir -p /backups

# Set up crontab with the configured schedule
echo "${BACKUP_SCHEDULE} /usr/local/bin/run-backup.sh >> /var/log/backup-cron.log 2>&1" | crontab -

echo "{\"timestamp\":\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",\"level\":\"info\",\"message\":\"Backup cron configured\",\"schedule\":\"${BACKUP_SCHEDULE}\"}"

# Run cron in foreground
exec crond -f -l 2
