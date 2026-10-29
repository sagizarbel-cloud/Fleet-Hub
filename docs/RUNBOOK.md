# Fleet Hub — Runbook

How to install, run and update Fleet Hub on our server. Written for whoever operates the server; no Node.js or knowledge of the code is needed.

## What runs

Three Docker containers, defined in `deploy/docker-compose.prod.yml`:

| Container | What it does | Data (Docker volume) |
| --- | --- | --- |
| `caddy` | Serves the web app over HTTPS, gets and renews the Let's Encrypt certificate, redirects HTTP to HTTPS, passes `/api/*` to the api | `caddy_data` (certificates), `caddy_config` |
| `api` | The application server. Applies database migrations on every start | `uploads` (photos, receipts, documents) |
| `postgres` | PostgreSQL 16 database | `pgdata` |

Only `caddy` is reachable from outside (ports 80 and 443). Settings and secrets live in `deploy/.env`, which is never committed.

**The data lives in the `pgdata` and `uploads` volumes. Never run `docker compose down -v`, `docker volume rm` or `docker system prune --volumes` on this server.** Automated backups come in Phase 10; until then see [Manual backup](#manual-backup).

## Requirements

- Ubuntu 22.04 or 24.04 on arm64 (x86-64 works the same).
- At least 2 GB of RAM, plus 2 GB of swap for building (see [Build runs out of memory](#build-runs-out-of-memory)); 10 GB of free disk.
- A DNS **A record** for the site's domain pointing at the server's public IP (and an AAAA record if the server has public IPv6).
- **Inbound** TCP 80 and 443 (and UDP 443 for HTTP/3) open from the internet: router port forwarding and any firewall. Port 80 must stay open: Let's Encrypt uses it to issue and renew the certificate.
- **Outbound** HTTPS to: github.com, Docker Hub (registry-1.docker.io, production.cloudflare.docker.com), registry.npmjs.org, binaries.prisma.sh, deb.debian.org, acme-v02.api.letsencrypt.org.
- Nothing else listening on ports 80 or 443 (check with `sudo ss -ltnp | grep -E ':(80|443) '`).

## 1. Install Docker

Check first; skip this step if both commands print a version (Compose must be v2):

```sh
docker version
docker compose version
```

Otherwise install Docker Engine and the Compose plugin from Docker's own apt repository:

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl git openssl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"   # then log out and back in
```

Docker starts on boot by default, and the containers restart with it.

If the server uses `ufw`, open the web ports:

```sh
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
```

## 2. Get the code

If the GitHub repository is private, give the server a read-only deploy key:

```sh
ssh-keygen -t ed25519 -N '' -C fleet-hub-server -f ~/.ssh/fleet_hub_deploy
cat ~/.ssh/fleet_hub_deploy.pub
```

Add that public key in GitHub under the repository's **Settings → Deploy keys** (leave "Allow write access" off), then:

```sh
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/fleet_hub_deploy
  IdentitiesOnly yes
EOF
sudo mkdir -p /opt/fleet-hub && sudo chown "$USER" /opt/fleet-hub
git clone git@github.com:sagizarbel-cloud/fleet-hub.git /opt/fleet-hub
```

## 3. Configure

```sh
cd /opt/fleet-hub
deploy/init-env.sh fleet.example.com     # the site's domain, without https://
```

This writes `deploy/.env` (readable by its owner only) with the domain and fresh random secrets. Every value is explained in `deploy/.env.example`.

Keep a copy of `deploy/.env` somewhere safe outside the server (a password manager). `FLEET_CODE_KEY` matters most: without it the stored vehicle start codes can't be read. Changing `SESSION_SECRET` only signs everyone out.

## 4. Start

All `docker compose` commands below run from the `deploy/` folder (`deploy/.env` points Compose at the production file):

```sh
cd /opt/fleet-hub/deploy
docker compose up -d --build
```

The first build takes about 5–15 minutes on an ARM server. Then check:

```sh
docker compose ps              # api and postgres "healthy", caddy "Up"
docker compose logs caddy | grep -i certificate   # "certificate obtained successfully"
```

The database starts empty: the api creates every table on its first start. The vehicle types, fluids and receipt categories are added in the next step; departments and locations are added by an admin under **Settings**.

## 5. Create the first admin

```sh
docker compose exec api node dist/create-admin.js --email admin@example.com --name "First Last"
```

It prints a one-time link (valid 24 hours) to send to that person, for example by WhatsApp. They open it, choose a password and sign in. The admin then adds everyone else under **Settings → Users**, which gives the same kind of link for each new user.

Run the same command again with the same email to get a new link (e.g. the first one expired, or the only admin lost their password). Once another admin exists the command refuses; from then on admins reset passwords from **Settings → Users**.

## 6. Smoke test

From any computer with `curl` (inside or outside the office):

```sh
deploy/smoke.sh fleet.example.com
```

It checks the HTTP→HTTPS redirect, the certificate, the web app and its caching, the api and its database, and that a wrong password is refused. After the admin has chosen a password, add a real sign-in check:

```sh
SMOKE_EMAIL=admin@example.com SMOKE_PASSWORD='…' deploy/smoke.sh fleet.example.com
```

Finally, open the site on a phone using mobile data (not the office Wi-Fi) to confirm it is reachable from outside.

## Everyday operations

Run from `/opt/fleet-hub/deploy`.

| Task | Command |
| --- | --- |
| Status | `docker compose ps` |
| Logs (follow) | `docker compose logs -f api` (or `caddy`, `postgres`) |
| Logs (last hour) | `docker compose logs --since 1h api` |
| Stop everything | `docker compose stop` |
| Start again | `docker compose start` |
| Restart the api | `docker compose restart api` |
| Remove the containers (data stays) | `docker compose down` |

Logs rotate on their own (5 files of 10 MB per container).

### Update to a new version

```sh
cd /opt/fleet-hub
git pull
cd deploy
docker compose up -d --build
docker image prune -f
./smoke.sh fleet.example.com
```

The api applies any new database migrations as it starts. Users stay signed in.

### Roll back

```sh
cd /opt/fleet-hub
git log --oneline -10            # find the last good commit
git checkout <commit>
cd deploy && docker compose up -d --build
```

Migrations only move forward, so a rollback keeps the newer database tables. Go back to the latest code with `git checkout main && git pull`.

### Manual backup

Until Phase 10 sets up automated backups, copy the database and the uploads before risky work (e.g. an update):

```sh
cd /opt/fleet-hub/deploy
mkdir -p ~/fleet-hub-backups
docker compose exec -T postgres pg_dump -U fleethub -Fc fleethub > ~/fleet-hub-backups/db-$(date +%F).dump
docker compose exec -T api tar -C /data -cz uploads > ~/fleet-hub-backups/uploads-$(date +%F).tar.gz
```

## Troubleshooting

### No certificate / the browser warns about the site

`docker compose logs caddy` says why. Usually:
- The domain's A record doesn't point at this server yet (`dig +short fleet.example.com` must print the server's public IP).
- Port 80 or 443 isn't reachable from the internet (router forwarding, cloud firewall, `ufw`).
- Too many failed attempts: Let's Encrypt rate-limits for about an hour. Fix the cause, then `docker compose restart caddy`.

### The site loads but says it can't reach the server (502 on `/api`)

The api isn't healthy: `docker compose ps` and `docker compose logs --tail 100 api`. A bad `deploy/.env` value (e.g. an empty secret) is named in the log.

### Port 80 or 443 already in use

Another web server is running: `sudo ss -ltnp | grep -E ':(80|443) '`. Stop and disable it (e.g. `sudo systemctl disable --now nginx`), or talk to the app owner before changing ports.

### Build runs out of memory

Add 2 GB of swap, then build again:

```sh
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Ports 80 and 443 can't be opened at all

Put Cloudflare Tunnel or Tailscale in front of the server; the app doesn't change. With Cloudflare Tunnel, point the tunnel at `http://localhost:80` and change the first site line of `deploy/Caddyfile` from `{$DOMAIN} {` to `http://{$DOMAIN} {`, so Caddy serves plain HTTP behind the tunnel and Cloudflare provides HTTPS. Keep `DOMAIN` as the bare domain. Ask the app owner before doing this.
