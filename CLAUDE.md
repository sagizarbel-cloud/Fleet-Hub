# Fleet Hub

Bilingual (English/Hebrew, RTL) fleet-management web app, self-hosted on our own server.

- What to build: `docs/SPEC.md` (product spec — read the sections a phase names)
- Build order and acceptance criteria: `docs/PHASES.md`
- What's done and what's next: `docs/PROGRESS.md` (update at the end of every phase)
- How it fits together (server, auth, performance, deploy): `docs/ARCHITECTURE.md`

## Stack (confirmed in Phase 0; update here if it changes)

- pnpm monorepo
  - `apps/web` — React + TypeScript + Vite, Tailwind CSS, shadcn/ui, Motion, react-i18next, React Router, TanStack Query + Table + Virtual, Recharts, ExcelJS
  - `apps/api` — Node.js (LTS) + TypeScript + Fastify, Prisma, PostgreSQL
  - `packages/shared` — zod schemas and types shared by web and api
- Auth: email + password (argon2id), httpOnly session cookies, roles viewer / editor / admin, plus a `startCode:view` permission
- Files: stored under `UPLOAD_DIR` on a server volume; served only through authenticated API routes
- Dev: `docker compose -f docker-compose.dev.yml up -d` runs PostgreSQL; `pnpm dev` runs web + api
- Prod: Docker Compose (postgres, api, caddy serving the web build and proxying `/api`)

## Commands (keep this list accurate)

- First run: `pnpm install` · `pnpm env:init` (writes `.env` with fresh secrets) · `docker compose -f docker-compose.dev.yml up -d` · `pnpm db:migrate` · `pnpm db:seed`
- `pnpm dev` (web on :5173, api on :3001, `/api` proxied) · `pnpm build`
- `pnpm lint` · `pnpm format` · `pnpm typecheck` · `pnpm test` (Vitest; api tests use `DATABASE_URL_TEST`) · `pnpm e2e` (Playwright, against `pnpm dev` and the seeded dev DB)
- `pnpm db:migrate` · `pnpm db:seed` (wipes and reloads the fake fleet) · `pnpm db:reset`
- `pnpm i18n:check` (fails on any key without a Hebrew value; also the hidden `/i18n-check` page)
- `pnpm check:arm64` (static: arm64 Prisma engine + argon2 and sharp prebuilts) · `pnpm docker:arm64` (full: installs and loads the api in a linux/arm64 container; needs an ARM host or QEMU)
- Seed logins: `admin@`, `editor@`, `viewer@fleethub.test`, password `SEED_PASSWORD` from `.env`
- Screenshots: `SCREENSHOTS=1 pnpm --filter @fleet-hub/web exec playwright test screenshots` → `docs/screenshots/`

## How we work

- One phase per session. Start in plan mode: read CLAUDE.md, `docs/PROGRESS.md` and the SPEC sections the phase names, then write a plan with acceptance criteria and wait for approval.
- Stay inside the phase. Put ideas or out-of-scope findings under "Later" in `docs/PROGRESS.md` instead of building them.
- Ask before: adding a major dependency, a destructive migration, changing the stack, or touching the production server.
- A phase is done only when: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm i18n:check` pass; you have checked the changed screens in the browser preview in English and Hebrew, at desktop and phone widths; you have committed; and `docs/PROGRESS.md` is updated. Then stop and summarize in under 10 lines.
- Commits: small, conventional messages (`feat(web): …`, `fix(api): …`). Never commit `.env` or uploads.

## Rules that always apply

- i18n: no literal user-facing strings in JSX; every string is a key in `apps/web/src/i18n/en.json` and `he.json`. Hebrew terms follow the glossary in SPEC A9. System-generated text is built from translated templates at render time.
- RTL: logical CSS properties only (`ms/me`, `ps/pe`, `start/end`); wrap VINs, serials, license and part numbers in `<bdi dir="ltr">`.
- Motion: animate only transform and opacity; respect `prefers-reduced-motion`; the dashboard and vehicle detail share one persistent layout so the shared-element transition never unmounts.
- Data: every write that changes a vehicle also writes an Event (SPEC A7). Status is derived, with a logged manual override.
- Start codes: encrypted at rest (AES-256-GCM, key from `FLEET_CODE_KEY`), masked in the UI, revealed only via a permission-checked endpoint that writes an AuditLog entry, never returned in list endpoints, exports, search or logs.
- Validation: every API route validates input with the shared zod schemas and checks permissions.
- Seed and test data are fake. Never add real VINs, plates, start codes, names or locations to the repo.
- Secrets live in `.env` (gitignored); keep `.env.example` current.
