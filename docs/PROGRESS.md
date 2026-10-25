# Progress

## Status

- Current phase: 1 — Foundation (not started)
- Last completed phase: 0 — Kickoff and plan

## Phase log

<!-- One entry per finished phase: date, what shipped, anything deferred. Newest first. -->

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

## Later

<!-- Ideas and out-of-scope findings, to revisit after Phase 9. -->

- Auto-fill receipt date, vendor and total from the photo (SPEC 5.5)
- Installable PWA (home-screen icon on phones)
- Email delivery for password resets (SMTP)
