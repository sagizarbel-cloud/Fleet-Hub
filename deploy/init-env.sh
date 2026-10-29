#!/bin/sh
# Writes deploy/.env with the domain and fresh random secrets. Never overwrites an existing one.
# Usage: deploy/init-env.sh fleet.example.com
set -eu
cd "$(dirname "$0")"
domain="${1:-}"
if [ -z "$domain" ]; then echo "Usage: deploy/init-env.sh <domain>" >&2; exit 2; fi
if [ -e .env ]; then echo "deploy/.env already exists, leaving it alone." >&2; exit 1; fi
umask 077
sed -e "s|^DOMAIN=\$|DOMAIN=$domain|" \
    -e "s|^POSTGRES_PASSWORD=\$|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" \
    -e "s|^SESSION_SECRET=\$|SESSION_SECRET=$(openssl rand -base64 32)|" \
    -e "s|^FLEET_CODE_KEY=\$|FLEET_CODE_KEY=$(openssl rand -base64 32)|" \
    .env.example > .env
echo "Wrote deploy/.env for $domain (readable by you only)."
