# Progress

## Status

- Current phase: 2 — Vehicle drawings, dashboard and the selection transition (not started)
- Last completed phase: 1 — Foundation

## Phase log

<!-- One entry per finished phase: date, what shipped, anything deferred. Newest first. -->

### Phase 1 — 2026-10-25

- Shipped: pnpm workspace tooling (ESLint with the literal-string ban, Prettier, TS), dev Postgres compose, `env:init`.
- Shared: enums, derived-status rules (tested), zod schemas, AES-256-GCM start-code helpers (tested).
- API: Prisma schema for every A7 entity (plus UserPreference and PasswordResetToken for later phases), fake seed (16 vehicles, 10/4/2, ~720 events, items, receipts, quotes), argon2id login with DB sessions (30-day sliding), login rate limit per IP + email, Origin check, helmet, role and start-code permission guards, lookups, cursor-paginated vehicle list that never selects start codes.
- Web: app shell with top bar and six empty areas, login page, EN/HE toggle with RTL mirroring (remembered), dark/light theme (dark default), design tokens, self-hosted IBM Plex, `/i18n-check` page.
- Tests: 33 Vitest tests (shared, api, web) and 5 Playwright tests. Screenshots in `docs/screenshots/phase-1/`.
- ARM: `pnpm check:arm64` passes (arm64 Prisma engine is an AArch64 binary; argon2 ships an arm64 prebuilt). `pnpm docker:arm64` could not run in the cloud build environment (no arm64 emulation there); run it on the server or any ARM machine.
- Deferred: production Dockerfiles (Phase 9).

### Phase 0 — 2026-10-25

- Shipped: docs/ARCHITECTURE.md, decisions below, refined PHASES.md (new Phase 10), repo skeleton (pnpm workspaces, .gitignore, .env.example).
- Deferred: backup location (Phase 10); Docker on the server not yet confirmed (Phase 9).

## Decisions

<!-- Stack or design decisions with a one-line reason. -->

- Server is Ubuntu on ARM64: all images and native modules must have arm64 builds; Phase 1 checks the api builds for arm64.
- Docker on the server is unconfirmed: Phase 9 verifies or installs Docker Engine + Compose v2.
- Public domain with HTTPS via Caddy: users connect from phones outside the office network.
- 20–30 users, plan for heavy use: cursor pagination, indexes, code splitting, thumbnails, perf budgets (ARCHITECTURE → Performance).
- Data isn't highly sensitive: keep the security basics in A10, no extra hardening.
- Password reset by admin-generated one-time link shared over WhatsApp: no SMTP server available. Email can be added later.
- Excel import page added to Phase 7: Sagi has existing Excel sheets.
- Backups moved to a new Phase 10: location to be decided later.
- Stack in CLAUDE.md unchanged.
- Pinned to well-established majors (TypeScript 5.9, Vite 7, Vitest 3, ESLint 9, Prisma 6): newer majors exist but are fresh; upgrade deliberately later.
- Login rate limit keyed by IP + email: 20–30 users may share one office IP, so a per-IP limit would lock out everyone at once.
- API is bundled with esbuild (workspace code inlined, npm packages external) so `packages/shared` stays plain TypeScript with no build step.

## Later

<!-- Ideas and out-of-scope findings, to revisit after Phase 9. -->

- Auto-fill receipt date, vendor and total from the photo (SPEC 5.5)
- Installable PWA (home-screen icon on phones)
- Email delivery for password resets (SMTP)
- Upgrade to newer majors (TypeScript 7, Vite 8, Prisma 7+, ESLint 10) once they settle
