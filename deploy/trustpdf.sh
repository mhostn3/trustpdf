#!/usr/bin/env bash
#
# TrustPDF deploy script. Copy to ~/trustpdf.sh on the server and run:
#
#   sudo ~/trustpdf.sh            # pull main, install pinned packages, test, migrate, collectstatic, restart, verify
#   sudo ~/trustpdf.sh --no-pull  # redeploy what is already checked out
#
# Every step is checked. On the first failure the script prints what went
# wrong (including the last service log lines when relevant) and stops.
# If the site does not answer 200 after the restart, the previous commit
# is restored and the service restarted again.
#
# Python packages are installed from requirements.txt, which pins every package
# (and its dependencies) to an exact version with checksums. A deploy therefore
# installs exactly what was tested, never a newer release. To update packages,
# regenerate the file on your computer (see README, "Updating Python packages").
#
# Install once on the server (the repo copy is then always the latest after a pull):
#   sudo ln -sf /home/trustpdf/project/trustpdf/deploy/trustpdf.sh ~/trustpdf.sh
#
# Layout (same as the original trustpdf.sh):
#   app user  : trustpdf
#   project   : /home/trustpdf/project
#   venv      : /home/trustpdf/project/.venv
#   repo      : /home/trustpdf/project/trustpdf          (.env lives here)
#   manage.py : /home/trustpdf/project/trustpdf/trustpdf
#   service   : trustpdf (systemd, gunicorn)

set -u

# The whole script is wrapped in a block so bash parses it completely before
# running anything. Without this, `git pull` replacing this very file mid-run
# (it lives in the repo) could make bash execute a mix of old and new lines.
{

APP_USER="trustpdf"
PROJECT_DIR="/home/${APP_USER}/project"
VENV_DIR="${PROJECT_DIR}/.venv"
REPO_DIR="${PROJECT_DIR}/trustpdf"
MANAGE_DIR="${REPO_DIR}/trustpdf"
SERVICE="trustpdf"
BRANCH="main"
SITE_URL="https://www.trustpdf.net"
CHECK_PATHS="/ /tools/merge-pdf/ /tools/split-pdf/ /tools/compress-pdf/ /privacy/ /sitemap.xml /robots.txt /llms.txt /sw.js /static/css/custom.css /analytics/ignore/"

PULL=1
[[ "${1:-}" == "--no-pull" ]] && PULL=0

STEP=0
step() { STEP=$((STEP + 1)); printf '\n\033[1;34m[%d] %s\033[0m\n' "$STEP" "$*"; }
ok()   { printf '\033[1;32m    OK: %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m    WARN: %s\033[0m\n' "$*"; }
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

# The security headers the site promises. A missing one does not roll the deploy
# back (the site works), but it is printed in yellow so it cannot be overlooked.
header_check() {
  local headers csp
  headers=$(curl -sS -D - -o /dev/null --max-time 20 "${SITE_URL}/" 2>/dev/null | tr -d '\r') || { warn "could not read the response headers"; return 0; }
  csp=$(grep -i '^content-security-policy:' <<<"$headers" || true)
  if [[ -z "$csp" ]]; then warn "no Content-Security-Policy header on /"
  elif grep -q "unsafe-inline" <<<"$csp"; then warn "the Content-Security-Policy of / allows 'unsafe-inline'"
  elif ! grep -q "connect-src 'self'" <<<"$csp"; then warn "connect-src is not limited to this site"
  else ok "Content-Security-Policy: scripts can talk to this site only, no inline code"; fi
  if grep -qi '^permissions-policy:' <<<"$headers"; then ok "Permissions-Policy is set"; else warn "no Permissions-Policy header on /"; fi
  if grep -qi '^strict-transport-security:' <<<"$headers"; then ok "HSTS is set"; else warn "no Strict-Transport-Security header on /"; fi
  if grep -qi '^set-cookie:' <<<"$headers"; then warn "the home page sets a cookie; it must not"; else ok "the home page sets no cookie"; fi
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
  health_check || return 1
  header_check
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
as_app "python -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'" || fail "the virtualenv needs Python 3.10 or newer (Django 5.2)"
ok "paths, user, venv, .env and service are in place"
if ! grep -Eq '^ADMIN_PATH=.+' "$REPO_DIR/.env" || grep -Eq '^ADMIN_PATH=(admin|change-me.*)$' "$REPO_DIR/.env"; then
  printf '\033[1;33m    WARN: ADMIN_PATH is not set to a secret value in .env; the admin and analytics dashboard are at /admin/\033[0m\n'
fi

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

step "Installing the pinned Python packages (exact versions, checksums verified)"
as_app "pip install --quiet --require-hashes -r '$REPO_DIR/requirements.txt'" || fail "pip install failed: a package did not match requirements.txt (regenerate it, see README) or the network is down"
as_app "pip check" || fail "installed packages have conflicting requirements (pip check)"
as_app "python -c 'import django, whitenoise, environ, gunicorn, axes, maxminddb, requests'" || fail "a required package does not import after install"
ok "$(as_app "python -c 'import django, importlib.metadata as m; print(\"Django\", django.get_version(), \"/ WhiteNoise\", m.version(\"whitenoise\"))'")"

step "Django configuration check (manage.py check --deploy)"
as_app "python manage.py check --deploy --fail-level ERROR" || fail "Django check failed; fix .env or settings before deploying"
ok "settings load and pass the deployment checks"

step "Running the test suite"
as_app "python manage.py test --noinput -v 1" || fail "tests failed; nothing was deployed"
ok "all tests passed"

step "Applying database migrations (analytics, staff login)"
as_app "python manage.py migrate --noinput -v 1" || fail "migrate failed; check the database file and its permissions"
ok "database is up to date"

step "Analytics: GeoIP database (monthly) and events older than 13 months"
if out=$(as_app "python manage.py update_geoip --if-older 30" 2>&1); then ok "$out"; else printf '\033[1;33m    WARN (deploy continues, locations stay empty or use the old file): %s\033[0m\n' "$out"; fi
if out=$(as_app "python manage.py analytics_prune" 2>&1); then ok "$out"; else printf '\033[1;33m    WARN: %s\033[0m\n' "$out"; fi

step "Collecting static files"
as_app "python manage.py collectstatic --noinput --clear -v 0" || fail "collectstatic failed"
STATIC_ROOT=$(as_app "DJANGO_SETTINGS_MODULE=trustpdf.settings python -c 'import django; django.setup(); from django.conf import settings; print(settings.STATIC_ROOT)'") || fail "could not read STATIC_ROOT"
[[ -f "$STATIC_ROOT/staticfiles.json" ]] || fail "static manifest not found in $STATIC_ROOT"
ok "static files collected to $STATIC_ROOT"

if restart_and_check; then
  step "Notifying search engines (IndexNow; skipped when INDEXNOW_KEY is not set)"
  if out=$(as_app "python manage.py indexnow" 2>&1); then ok "$out"; else printf '\033[1;33m    WARN (deploy is fine): %s\033[0m\n' "$out"; fi
  printf '\n\033[1;32mDeploy finished: %s is live.\033[0m\n' "$NEW_COMMIT"
  exit 0
fi

# ------------------------------------------------------------------ #
printf '\n\033[1;31mDeploy failed. Rolling back to %s ...\033[0m\n' "$PREVIOUS_COMMIT" >&2
STEP=90
step "Rollback: checking out $PREVIOUS_COMMIT"
as_app "git checkout -q '$PREVIOUS_COMMIT'" || fail "rollback checkout failed"
as_app "pip install --quiet -r '$REPO_DIR/requirements.txt'" || fail "rollback pip install failed"
warn "database migrations are not rolled back. They only ever add to the statistics database, and the older code runs fine with them."
as_app "python manage.py collectstatic --noinput --clear -v 0" || fail "rollback collectstatic failed"
if restart_and_check; then
  printf '\n\033[1;33mRolled back to %s. The repo is left at that commit (detached); fix the problem, then run the deploy again.\033[0m\n' "$PREVIOUS_COMMIT" >&2
  exit 1
fi
fail "rollback did not bring the site back either. Check: journalctl -u $SERVICE -n 100 and the nginx error log"

exit 1
}
