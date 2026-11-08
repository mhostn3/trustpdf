#!/usr/bin/env bash
#
# TrustPDF deploy script. Copy to ~/trustpdf.sh on the server and run:
#
#   sudo ~/trustpdf.sh            # pull main, install packages, test, collectstatic, restart, verify
#   sudo ~/trustpdf.sh --no-pull  # redeploy what is already checked out
#
# Every step is checked. On the first failure the script prints what went
# wrong (including the last service log lines when relevant) and stops.
# If the site does not answer 200 after the restart, the previous commit
# is restored and the service restarted again.
#
# Layout (same as the original trustpdf.sh):
#   app user  : trustpdf
#   project   : /home/trustpdf/project
#   venv      : /home/trustpdf/project/.venv
#   repo      : /home/trustpdf/project/trustpdf          (.env lives here)
#   manage.py : /home/trustpdf/project/trustpdf/trustpdf
#   service   : trustpdf (systemd, gunicorn)

set -u

APP_USER="trustpdf"
PROJECT_DIR="/home/${APP_USER}/project"
VENV_DIR="${PROJECT_DIR}/.venv"
REPO_DIR="${PROJECT_DIR}/trustpdf"
MANAGE_DIR="${REPO_DIR}/trustpdf"
SERVICE="trustpdf"
BRANCH="main"
SITE_URL="https://www.trustpdf.net"
CHECK_PATHS="/ /tools/merge-pdf/ /tools/split-pdf/ /privacy/ /sitemap.xml /static/css/custom.css"

PULL=1
[[ "${1:-}" == "--no-pull" ]] && PULL=0

STEP=0
step() { STEP=$((STEP + 1)); printf '\n\033[1;34m[%d] %s\033[0m\n' "$STEP" "$*"; }
ok()   { printf '\033[1;32m    OK: %s\033[0m\n' "$*"; }
fail() {
  printf '\n\033[1;31mFAILED at step %d: %s\033[0m\n' "$STEP" "$*" >&2
  exit 1
}

# Run a command as the app user, inside the venv, in the manage.py directory.
as_app() {
  sudo -u "$APP_USER" -H bash -c "set -euo pipefail; cd '$MANAGE_DIR'; source '$VENV_DIR/bin/activate'; $*"
}

service_logs() {
  echo "---- last 40 lines of 'journalctl -u $SERVICE' ----" >&2
  journalctl -u "$SERVICE" -n 40 --no-pager >&2 || true
}

health_check() {
  local path url code all_ok=1
  for path in $CHECK_PATHS; do
    url="${SITE_URL}${path}"
    code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$url" 2>/dev/null || echo "000")
    if [[ "$code" == "200" ]]; then
      ok "$code $url"
    else
      printf '\033[1;31m    FAIL: %s %s\033[0m\n' "$code" "$url" >&2
      all_ok=0
    fi
  done
  [[ $all_ok -eq 1 ]]
}

restart_and_check() {
  step "Restarting $SERVICE"
  systemctl restart "$SERVICE" || { service_logs; return 1; }
  sleep 3
  if ! systemctl is-active --quiet "$SERVICE"; then
    service_logs
    return 1
  fi
  ok "$SERVICE is active"

  step "Checking the live site"
  health_check
}

# ------------------------------------------------------------------ #

echo "TrustPDF deploy, $(date '+%Y-%m-%d %H:%M:%S')"

step "Preflight"
[[ $EUID -eq 0 ]] || fail "run with sudo: sudo ~/trustpdf.sh"
id "$APP_USER" >/dev/null 2>&1 || fail "user $APP_USER does not exist"
[[ -d "$REPO_DIR/.git" ]] || fail "$REPO_DIR is not a git repository"
[[ -x "$VENV_DIR/bin/python" ]] || fail "virtualenv not found at $VENV_DIR"
[[ -f "$REPO_DIR/.env" ]] || fail "$REPO_DIR/.env is missing (see .env.example)"
[[ -f "$MANAGE_DIR/manage.py" ]] || fail "manage.py not found in $MANAGE_DIR"
systemctl cat "$SERVICE" >/dev/null 2>&1 || fail "systemd service '$SERVICE' not found"
command -v curl >/dev/null || fail "curl is not installed (apt install curl)"
ok "paths, user, venv, .env and service are in place"

PREVIOUS_COMMIT=$(as_app "git rev-parse HEAD") || fail "could not read current commit"
ok "current commit $PREVIOUS_COMMIT"

if [[ $PULL -eq 1 ]]; then
  step "Pulling latest $BRANCH from GitHub"
  as_app "git fetch --prune origin" || fail "git fetch failed (network or GitHub access?)"
  as_app "git checkout -q '$BRANCH'" || fail "could not switch to branch $BRANCH (local changes?)"
  as_app "git pull --ff-only origin '$BRANCH'" || fail "git pull failed (local commits diverged? try: git status)"
fi
NEW_COMMIT=$(as_app "git rev-parse HEAD") || fail "could not read new commit"
ok "deploying commit $NEW_COMMIT ($(as_app "git log -1 --format=%s"))"

step "Installing / upgrading Python packages"
as_app "pip install --quiet --upgrade pip" || fail "pip self-upgrade failed"
as_app "pip install --quiet --upgrade -r '$REPO_DIR/requirements.txt'" || fail "pip install -r requirements.txt failed"
as_app "python -c 'import django, whitenoise, environ, gunicorn'" || fail "a required package does not import after install"
ok "$(as_app "python -c 'import django, whitenoise; print(\"Django\", django.get_version(), \"/ WhiteNoise\", whitenoise.__version__)'")"

step "Django configuration check (manage.py check --deploy)"
as_app "python manage.py check --deploy --fail-level ERROR" || fail "Django check failed; fix .env or settings before deploying"
ok "settings load and pass the deployment checks"

step "Running the test suite"
as_app "python manage.py test --noinput -v 1" || fail "tests failed; nothing was deployed"
ok "all tests passed"

step "Collecting static files"
as_app "python manage.py collectstatic --noinput --clear -v 0" || fail "collectstatic failed"
STATIC_ROOT=$(as_app "DJANGO_SETTINGS_MODULE=trustpdf.settings python -c 'import django; django.setup(); from django.conf import settings; print(settings.STATIC_ROOT)'") || fail "could not read STATIC_ROOT"
[[ -f "$STATIC_ROOT/staticfiles.json" ]] || fail "static manifest not found in $STATIC_ROOT"
ok "static files collected to $STATIC_ROOT"

if restart_and_check; then
  printf '\n\033[1;32mDeploy finished: %s is live.\033[0m\n' "$NEW_COMMIT"
  exit 0
fi

# ------------------------------------------------------------------ #
printf '\n\033[1;31mDeploy failed. Rolling back to %s ...\033[0m\n' "$PREVIOUS_COMMIT" >&2
STEP=90
step "Rollback: checking out $PREVIOUS_COMMIT"
as_app "git checkout -q '$PREVIOUS_COMMIT'" || fail "rollback checkout failed"
as_app "pip install --quiet -r '$REPO_DIR/requirements.txt'" || fail "rollback pip install failed"
as_app "python manage.py collectstatic --noinput --clear -v 0" || fail "rollback collectstatic failed"
if restart_and_check; then
  printf '\n\033[1;33mRolled back to %s. The repo is left at that commit (detached); fix the problem, then run the deploy again.\033[0m\n' "$PREVIOUS_COMMIT" >&2
  exit 1
fi
fail "rollback did not bring the site back either. Check: journalctl -u $SERVICE -n 100 and the nginx error log"
