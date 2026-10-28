# Fleet Hub — Architecture

Approved in Phase 0 (2026-10-25). Update this page when a decision changes.

## Environment

- Server: **Ubuntu Linux on ARM64**. Docker Engine + Compose v2 are not confirmed yet; Phase 9 verifies or installs them.
- Users: 20–30 accounts, from laptops, office PCs and phones. Design for heavy use and keep the app lean (see Performance).
- Access: public **domain** pointed at the server, ports 80/443 open, Caddy obtains Let's Encrypt certificates automatically. Fallback if ports can't be opened: Cloudflare Tunnel or Tailscale in front of Caddy; the app doesn't change.
- ARM: every image and native module must have arm64 builds. Chosen ones do: `node:22-bookworm-slim`, `postgres:16`, `caddy:2`, Prisma engines (`linux-arm64-openssl-3.0.x`), `@node-rs/argon2`, `sharp`. Images are built on the server or with `docker buildx --platform linux/arm64`.

## Folder layout

```
fleet-hub/
  apps/web/          React + Vite SPA (UI, i18n, drawings, motion)
  apps/api/          Fastify + Prisma (REST under /api, auth, files, import/export)
    prisma/          schema, migrations, seed
  packages/shared/   zod schemas + TS types used by both
  deploy/            docker-compose.prod.yml, Caddyfile (Phase 9)
  docs/              SPEC, PHASES, PROGRESS, ARCHITECTURE, RUNBOOK
  docker-compose.dev.yml   Postgres for local dev (Phase 1)
```

## Data flow

Browser → Caddy (HTTPS, compressed static web build, proxies `/api/*`) → Fastify API → Prisma → PostgreSQL.
Uploads go `multipart` to the API, which checks type and size and writes them to `UPLOAD_DIR` (a Docker volume). Files are streamed back only by authenticated routes, never served by Caddy directly.
Every vehicle-changing write runs in one DB transaction: record + Event + recomputed status (SPEC A7).

## Auth and security (sensible basics; data is not highly sensitive)

- Email + password, argon2id hashes. Server-side sessions in Postgres, `httpOnly; Secure; SameSite=Lax` cookie, 30-day sliding expiry so phone users stay logged in.
- Roles viewer / editor / admin + `startCode:view` permission, checked on every route; zod validation on every input.
- Login rate limit, Origin check on writes (CSRF), security headers via `@fastify/helmet`.
- **Password reset without email:** an admin clicks "Reset password" on a user and gets a one-time link (valid 24 h, single use) to send by WhatsApp. Users can change their own password. Turning a user off ends their sessions; users are never deleted. The link page is `/reset/:token`; only a hash of the token is stored. Email delivery (`SMTP_*` in `.env`) can be added later without changing the token flow.
- Start codes: AES-256-GCM with `FLEET_CODE_KEY`, audited reveal, never in lists, exports, search or logs.

## Performance

- API: paginated lists (cursor-based), indexes on `Event(vehicleId, occurredAt)` and every foreign key, select only needed columns, no N+1 queries (one query per list).
- Dashboard: one summary endpoint for KPIs + grid tiles, so the home page loads in a couple of requests.
- Web: route-level code splitting (Recharts, ExcelJS and the table load only where used), hashed assets with long cache headers, gzip/zstd from Caddy, TanStack Query caching, virtualized tables.
- Files: images resized on upload with `sharp`; grids load thumbnails, originals on demand.
- Budgets checked from Phase 2 on: dashboard JS under 300 KB gzipped, API p95 under 200 ms on seed data.

## Excel import

Admin-only **Import** page (`/settings/import`): upload .xlsx → pick sheet → pick a target (vehicles, the seven record types or equipment) → match columns to fields (guessed from English or Hebrew headers; the matching is saved per header set in `ImportMapping`) → dry run with per-row results → import.

- The browser reads the workbook with ExcelJS and sends rows as JSON (`POST /api/import/:target/preview` and `/commit`, at most 5,000 rows); the file itself is never uploaded or stored.
- Rows match by serial (vehicles and records); equipment by its serial, or by name and model when it has none. A re-import only writes the cells the sheet fills, and a value equal to the stored one is not a change, so importing the same sheet twice changes nothing.
- Hand-kept sheets: the header row is the first row with about as many text cells as the fullest top row (so a title above it is passed over; the user can pick another row). A record's vehicle is found by its serial written loosely ("ex 102"), its plate or its VIN. Numbers may carry units ("20 ל'", "₪ 1,250"), dates a time; choices and list values match loosely or by the one name they contain ("שמן מנוע 15W40" is engine oil). A totals row ("סה״כ") under the data is skipped.
- Made-up sample sheets in that shape live in `docs/samples/` (`pnpm samples` rewrites them); a web test checks each one's headers are found and its must-have columns matched.
- Each commit is one `ImportRun`; the events it writes point to it and show an "Imported" badge on the timeline. Vehicles first, then history records.

## Deployment

Production compose: `postgres` (volume `pgdata`), `api` (volume `uploads`), `caddy` (volume `caddy_data`). Config only in `.env`. Backups are designed in Phase 10.
