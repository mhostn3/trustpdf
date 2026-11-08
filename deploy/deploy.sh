#!/usr/bin/env bash
#
# Deploy TrustPDF on the production server.
#
#   sudo ./deploy.sh            # deploy the current branch's latest commit
#   sudo ./deploy.sh --no-pull  # skip git pull (redeploy what is checked out)
#
# Steps: pull the latest code, install/upgrade Python packages, run the
# Django checks and tests, collect static files, restart the service, and
# verify that the site answers 200 on the homepage and a tool page.
# If the health check fails, the previous commit is restored and the
# service restarted again.
#
# Adjust the variables below (or export them before running) to match the
# server. Defaults match the layout: /home/trustpdf/project/{.venv,trustpdf}.

set -euo pipefail

APP_USER="${APP_USER:-trustpdf}"
PROJECT_DIR="${PROJECT_DIR:-/home/${APP_USER}/project}"
REPO_DIR="${REPO_DIR:-${PROJECT_DIR}/trustpdf}"
VENV_DIR="${VENV_DIR:-${PROJECT_DIR}/.venv}"
MANAGE_DIR="${MANAGE_DIR:-${REPO_DIR}/trustpdf}"
SERVICE="${SERVICE:-trustpdf}"
BRANCH="${BRANCH:-main}"
HEALTH_URLS="${HEALTH_URLS:-https://www.trustpdf.net/ https://www.trustpdf.net/tools/merge-pdf/ https://www.trustpdf.net/sitemap.xml}"
LOG_FILE="${LOG_FILE:-/var/log/trustpdf-deploy.log}"

PULL=1
[[ "${1:-}" == "--no-pull" ]] && PULL=0

log() { printf '%s [deploy] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_FILE" >&2; }
die() { log "ERROR: $*"; exit 1; }

[[ $EUID -eq 0 ]] || die "run with sudo (needs systemctl and sudo -u ${APP_USER})"
touch "$LOG_FILE" 2>/dev/null || LOG_FILE=/dev/null

as_app() {
  # Run a command as the app user inside the venv, in the manage.py directory.
  sudo -u "$APP_USER" -H bash -c "set -euo pipefail; cd '$MANAGE_DIR'; source '$VENV_DIR/bin/activate'; $*"
}

health_check() {
  local url code ok=1
  for url in $HEALTH_URLS; do
    code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -L "$url" || echo "000")
    if [[ "$code" == "200" ]]; then
      log "OK   $code $url"
    else
      log "FAIL $code $url"
      ok=0
    fi
  done
  [[ $ok -eq 1 ]]
}

log "=== Deploy started by $(logname 2>/dev/null || echo root) ==="

PREVIOUS_COMMIT=$(as_app "cd '$REPO_DIR' && git rev-parse HEAD")
log "Current commit: $PREVIOUS_COMMIT"

if [[ $PULL -eq 1 ]]; then
  log "Pulling latest $BRANCH..."
  as_app "cd '$REPO_DIR' && git fetch --prune origin && git checkout -q '$BRANCH' && git pull --ff-only origin '$BRANCH'"
fi
NEW_COMMIT=$(as_app "cd '$REPO_DIR' && git rev-parse HEAD")
log "Deploying commit: $NEW_COMMIT"

log "Installing / upgrading Python packages..."
as_app "pip install --quiet --upgrade pip && pip install --quiet --upgrade -r '$REPO_DIR/requirements.txt'"

log "Running Django checks and tests..."
as_app "python manage.py check --deploy --fail-level ERROR"
as_app "python manage.py test --noinput -v 1"

log "Collecting static files..."
as_app "python manage.py collectstatic --noinput --clear -v 0"

log "Restarting $SERVICE..."
systemctl restart "$SERVICE"
sleep 3
systemctl is-active --quiet "$SERVICE" || { journalctl -u "$SERVICE" -n 30 --no-pager >&2; die "$SERVICE failed to start"; }

log "Health check..."
if health_check; then
  log "=== Deploy finished: $NEW_COMMIT is live ==="
  exit 0
fi

log "Health check failed. Rolling back to $PREVIOUS_COMMIT..."
as_app "cd '$REPO_DIR' && git checkout -q '$PREVIOUS_COMMIT'"
as_app "pip install --quiet -r '$REPO_DIR/requirements.txt'"
as_app "python manage.py collectstatic --noinput --clear -v 0"
systemctl restart "$SERVICE"
sleep 3
if health_check; then
  die "Rolled back to $PREVIOUS_COMMIT; the branch is left detached at that commit. Fix the problem and deploy again."
fi
die "Rollback also failed. Check: journalctl -u $SERVICE -n 100"
