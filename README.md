# Fleet-Hub

Fleet manager for heavy duty machinery: a bilingual English/Hebrew web app for vehicle history and maintenance, self-hosted on our own server.

- Product spec: [docs/SPEC.md](docs/SPEC.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Build phases: [docs/PHASES.md](docs/PHASES.md) · progress: [docs/PROGRESS.md](docs/PROGRESS.md)

Status: Phase 1 (foundation) done. See [docs/PROGRESS.md](docs/PROGRESS.md).

## Run it locally

Needs Node 22+, pnpm 9 (`corepack enable`) and Docker.

```sh
pnpm install
pnpm env:init                                   # writes .env with fresh secrets
docker compose -f docker-compose.dev.yml up -d  # PostgreSQL
pnpm db:migrate && pnpm db:seed                 # schema + fake fleet
pnpm dev                                        # http://localhost:5173
```

Sign in as `admin@fleethub.test` with the `SEED_PASSWORD` from `.env` (default `fleethub-dev`). All seed data is fake.
