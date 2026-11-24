#!/usr/bin/env bash
# Run the test suite locally, the same checks the GitHub workflow runs,
# without spending GitHub Actions minutes.
#
#   scripts/test.sh          # Django check + unit tests (fast, run before every push)
#   scripts/test.sh --e2e    # also the browser smoke test (needs node + playwright + pillow)
#
# To run it automatically before every `git push`:
#   git config core.hooksPath scripts/githooks
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/trustpdf"

# Throwaway settings so the checks run without a real .env.
export SECRET_KEY="${SECRET_KEY:-local-test-only-not-a-real-key-0123456789-abcdefghijklmnopqrstuvwxyz}"
export ALLOWED_HOSTS="${ALLOWED_HOSTS:-localhost,127.0.0.1}"

echo "==> Django deployment check"
python manage.py check --deploy --fail-level WARNING

echo "==> Django tests"
python manage.py test --noinput

if [ "${1:-}" = "--e2e" ]; then
  echo "==> Browser smoke test"
  PORT=8765
  python "$ROOT/tests/e2e/make_fixtures.py"
  DEBUG=True ANALYTICS_ENABLED=False python manage.py migrate --noinput -v 0
  DEBUG=True ANALYTICS_ENABLED=False python manage.py runserver "127.0.0.1:$PORT" > /tmp/trustpdf-e2e-server.log 2>&1 &
  SERVER_PID=$!
  trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
  for _ in $(seq 1 30); do curl -fsS -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 1; done
  (cd "$ROOT" && BASE_URL="http://127.0.0.1:$PORT" node tests/e2e/smoke.js)
fi

echo "==> All good"
