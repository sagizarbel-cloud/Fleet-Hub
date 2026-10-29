#!/bin/sh
# Smoke test of a deployed Fleet Hub, from any machine with curl.
# Usage: deploy/smoke.sh fleet.example.com
# Optional: SMOKE_EMAIL and SMOKE_PASSWORD (a real account) also check signing in and the dashboard.
# Local test only: SMOKE_INSECURE=1 accepts a self-signed certificate.
set -u
domain="${1:?Usage: deploy/smoke.sh <domain>}"
base="https://$domain"
tls=""
[ "${SMOKE_INSECURE:-}" = 1 ] && tls="-k"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
failed=0
pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; failed=1; }
# curl wrapper: prints the status code; headers and body go to files in $tmp.
req() { curl -s $tls -o "$tmp/body" -D "$tmp/head" -w '%{http_code}' "$@"; }
header() { grep -i "^$1:" "$tmp/head" | head -n 1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'; }

# 1. HTTP redirects to HTTPS
code="$(req "http://$domain/")"
case "$code" in
  301|302|307|308) case "$(header location)" in https://*) pass "HTTP redirects to HTTPS ($code)";; *) fail "HTTP redirect goes to $(header location)";; esac;;
  *) fail "HTTP answered $code instead of redirecting";;
esac

# 2. HTTPS with a valid certificate (curl checks it unless SMOKE_INSECURE=1)
code="$(req "$base/")"
if [ "$code" = 200 ] && grep -q '<div id="root"' "$tmp/body"; then
  pass "app page loads over HTTPS"
else
  fail "app page: HTTP $code (certificate or DNS problem if 000)"
fi
[ -n "$(header strict-transport-security)" ] && pass "HSTS header set" || fail "no HSTS header"
case "$(header cache-control)" in *no-cache*) pass "app page is not cached";; *) fail "app page Cache-Control: $(header cache-control)";; esac

# 3. A hashed asset is cached for a year and compressed
asset="$(grep -o '/assets/[^"]*\.js' "$tmp/body" | head -n 1)"
if [ -n "$asset" ]; then
  code="$(req -H 'Accept-Encoding: gzip, zstd' "$base$asset")"
  [ "$code" = 200 ] && case "$(header cache-control)" in *immutable*) true;; *) false;; esac \
    && pass "assets cached as immutable" || fail "asset $asset: HTTP $code, Cache-Control $(header cache-control)"
  [ -n "$(header content-encoding)" ] && pass "assets compressed ($(header content-encoding))" || fail "assets not compressed"
else
  fail "no script asset found in the app page"
fi

# 4. Deep links fall back to the app
code="$(req "$base/vehicles/does-not-exist")"
[ "$code" = 200 ] && pass "deep links open the app" || fail "deep link: HTTP $code"

# 5. The api and its database
code="$(req "$base/api/health")"
[ "$code" = 200 ] && grep -q '"ok":true' "$tmp/body" && pass "api and database healthy" || fail "api health: HTTP $code"
code="$(req "$base/api/auth/me")"
[ "$code" = 401 ] && pass "api asks for sign-in" || fail "api /auth/me without a session: HTTP $code"
code="$(req -H "Origin: $base" -H 'Content-Type: application/json' \
  -d '{"email":"smoke-test@invalid.test","password":"not-the-password"}' "$base/api/auth/login")"
[ "$code" = 401 ] && pass "wrong password is refused" || fail "login with a wrong password: HTTP $code"

# 6. Optional: a real sign-in
if [ -n "${SMOKE_EMAIL:-}" ] && [ -n "${SMOKE_PASSWORD:-}" ]; then
  json() { printf '%s' "$1" | sed 's/[\\"]/\\&/g'; }
  body="$(printf '{"email":"%s","password":"%s"}' "$(json "$SMOKE_EMAIL")" "$(json "$SMOKE_PASSWORD")")"
  code="$(req -c "$tmp/jar" -H "Origin: $base" -H 'Content-Type: application/json' -d "$body" "$base/api/auth/login")"
  if [ "$code" = 200 ] && grep -qi 'secure' "$tmp/head"; then pass "signs in (secure cookie)"; else fail "sign-in: HTTP $code"; fi
  code="$(req -b "$tmp/jar" "$base/api/dashboard")"
  [ "$code" = 200 ] && pass "dashboard data loads" || fail "dashboard: HTTP $code"
  req -b "$tmp/jar" -H "Origin: $base" -X POST "$base/api/auth/logout" > /dev/null
else
  echo "skip  sign-in check (set SMOKE_EMAIL and SMOKE_PASSWORD to include it)"
fi

[ "$failed" = 0 ] && echo "Smoke test passed." || echo "Smoke test FAILED."
exit "$failed"
