# Build phases

Eleven phases (0–10), one Claude Code session each. Opus plans (plan mode), Sonnet builds.

## How to run a phase (for Sagi)

1. Open Claude Code in the `fleet-hub` folder (desktop app Code tab, or `claude` in a terminal).
2. First time only: run `/model opusplan` — Opus plans in plan mode, Sonnet executes.
3. Switch to plan mode (Shift+Tab in the terminal, or the mode picker in the desktop app).
4. Paste the phase prompt below. Read the plan, push back or approve.
5. Approve to leave plan mode; Sonnet builds and verifies.
6. Check the result in the preview, then run `/clear` before the next phase.
7. Run `/usage` now and then; if a phase eats most of a 5-hour window, split it.

Effort: keep the default (medium). Use `/effort high` only while debugging a stubborn problem, such as the transition in Phase 2.

---

## Phase 0 — Kickoff and plan (no app code)

Goal: agree on the architecture and environment before writing code.

Acceptance criteria:
- Claude has asked about the server and we have answers recorded in `docs/PROGRESS.md` → Decisions.
- `docs/ARCHITECTURE.md` exists: folder layout, data flow, auth model, file storage, deployment sketch (one page).
- Each later phase below has concrete, testable acceptance criteria (refine them if needed).
- Repo initialized: git, `.gitignore`, `.env.example`, empty workspace packages. Nothing else.

Prompt:

```
We're starting Fleet Hub. Read CLAUDE.md, docs/SPEC.md, docs/PHASES.md and docs/PROGRESS.md.
This is Phase 0: plan only, no app code.
1. Ask me what you need about the target server before committing to the stack in CLAUDE.md: OS, Docker availability, CPU/RAM/disk, domain and HTTPS vs internal network only, how many users, backup location, and anything else that changes the design.
2. Then propose docs/ARCHITECTURE.md (one page) and any changes to the stack or phase plan, with reasons.
3. After I approve: write ARCHITECTURE.md, record decisions in PROGRESS.md, refine acceptance criteria in PHASES.md, and initialize the repo skeleton (git, .gitignore, .env.example, empty workspaces). Commit and stop.
```

---

## Phase 1 — Foundation

SPEC: A2, A3, A7, A8, A9.

Acceptance criteria:
- `pnpm dev` starts web and api against the dev database; all commands in CLAUDE.md exist and pass.
- Prisma schema covers every entity in A7; `pnpm db:seed` loads the fake fleet from A2.
- Login works; roles and the `startCode:view` permission exist (UI for managing users comes in Phase 7).
- App shell: top bar, navigation to six empty areas, language toggle (instant EN/HE switch with full RTL mirroring), theme toggle (dark default, light).
- Design tokens for colors, status colors, type (self-hosted IBM Plex fonts), spacing and motion.
- i18n wired with the glossary; lint rule against literal strings; `pnpm i18n:check` and the `/i18n-check` page work.
- Vitest runs for api and web; one Playwright smoke test logs in and switches language.
- The api image builds for `linux/arm64` (`docker buildx build --platform linux/arm64`); every native dependency has an arm64 build.
- Event table indexed on `(vehicleId, occurredAt)`; list endpoints are cursor-paginated from the start.

Prompt:

```
Phase 1 — Foundation. Read CLAUDE.md, docs/PROGRESS.md, docs/PHASES.md (Phase 1) and SPEC A2, A3, A7, A8, A9.
Plan the work against the Phase 1 acceptance criteria and wait for my approval.
```

---

## Phase 2 — Vehicle drawings, dashboard and the selection transition

SPEC: A4, 5.1, 5.2.

Acceptance criteria:
- SVG library: all 11 types, top-down and side views, named part groups, status tint, isometric presentation.
- Dashboard with KPI strip, day-grouped timeline with filters, fleet grid grouped by type, hover cards, event-to-tile linking line.
- The selection transition and its reverse match 5.2, stay under 1.2 s, are interruptible, and work in RTL and with reduced motion.
- Playwright screenshots of dashboard and transition end state saved for EN and HE at desktop and phone widths.
- Dashboard loads from one summary endpoint; its JS is under 300 KB gzipped (route-level code splitting).

Prompt:

```
Phase 2 — Vehicle drawings, dashboard and the selection transition. Read CLAUDE.md, docs/PROGRESS.md, docs/PHASES.md (Phase 2) and SPEC A4, 5.1, 5.2. If docs/sketch.jpeg exists, look at it for drawing style.
Plan against the Phase 2 acceptance criteria and wait for my approval. Build the drawings first and show me one type in both views before doing the rest.
```

---

## Phase 3 — Vehicle detail

SPEC: 5.3, A6, A7 (start code).

Acceptance criteria:
- Header with SN / VIN / License in mono numerals (copy on click), pinned vitals and a per-user "Customize vitals" picker.
- Side | Isometric toggle (remembered), self-drawing side profile with callout lines.
- Activity sidebar with type filters; assigned items table; record cards with counts (panels open, contents come in Phase 4).
- Start code: encrypted storage, masked chip, permission-checked reveal endpoint, AuditLog entry per reveal, absent from list responses (with a test proving it).
- Prev/next and jump-to-vehicle navigation.

Prompt:

```
Phase 3 — Vehicle detail. Read CLAUDE.md, docs/PROGRESS.md, docs/PHASES.md (Phase 3) and SPEC 5.3, A6, A7.
Plan against the Phase 3 acceptance criteria and wait for my approval.
```

---

## Phase 4 — Records, forms and exports

SPEC: 5.3 (record list), A7, A8 (Excel).

Acceptance criteria:
- API and UI for every record type in 5.3: list, add, edit, delete with Undo, attachments.
- Every write creates an Event and recomputes derived status; tests cover the status rules in A7.
- Fuel chart in km/L or L/engine-hour with sudden-drop flag.
- Excel export per panel, in the active language, RTL sheet for Hebrew, never including start codes.

Prompt:

```
Phase 4 — Records, forms and exports. Read CLAUDE.md, docs/PROGRESS.md, docs/PHASES.md (Phase 4) and SPEC 5.3, A7, A8.
Plan against the Phase 4 acceptance criteria and wait for my approval.
```

---

## Phase 5 — Fleet table

SPEC: 5.4.

Acceptance criteria:
- Virtualized table with sticky first column, category column groups with dropdowns, expandable rows.
- Search, filters, sort, group by type/department, saved views per user.
- Row click enters the vehicle through the shared transition.
- Current-view and full-fleet multi-sheet Excel exports.

Prompt:

```
Phase 5 — Fleet table. Read CLAUDE.md, docs/PROGRESS.md, docs/PHASES.md (Phase 5) and SPEC 5.4.
Plan against the Phase 5 acceptance criteria and wait for my approval.
```

---

## Phase 6 — Receipts, quotes and equipment

SPEC: 5.5, 5.6, 5.7.

Acceptance criteria:
- Receipt uploads (multi-file, camera on mobile, size/type limits), serial tags, grid/table views, totals, export; receipts show in each vehicle's Documents tab.
- Quotes with line items, status flow, multi-vehicle assignment picker, side-by-side comparison, export.
- Quote visibility (SPEC 5.6), enforced in the API queries:
  - Any role, viewer included, can create a quote; `Quote.createdById` is required; `Quote.visibility` is STANDARD (default), PUBLIC or ADMINS.
  - One shared visibility filter is used by every route that returns quotes or quote counts: list, detail, a vehicle's Quotes tab and count, comparison, search, Excel export and the vehicle timeline's QUOTE_LINKED events. Admins see all; non-admins see their own STANDARD quotes plus all PUBLIC quotes.
  - Only admins can change visibility (403 for others). Edit and delete: the creator while the quote is visible to them, or an admin. A quote the user can't see returns 404 on read, edit and delete.
  - API tests cover each route with two non-admin users and one admin, across all three levels, including a non-admin's own quote that an admin set to ADMINS.
- Equipment catalog with assignment history; assign from vehicle page and by drag onto a tile.

Prompt:

```
Phase 6 — Receipts, quotes and equipment. Read CLAUDE.md, docs/PROGRESS.md, docs/PHASES.md (Phase 6) and SPEC 5.5, 5.6, 5.7.
Plan against the Phase 6 acceptance criteria and wait for my approval.
```

---

## Phase 7 — Add/edit vehicle, settings and quality bar

SPEC: 5.8, 5.9, A10, plus password reset and Excel import from docs/ARCHITECTURE.md.

Acceptance criteria:
- Add/edit stepper with VIN and Israeli plate validation; new tile animates into the grid.
- Settings: bilingual lookup lists, default vitals, users and roles (admin only).
- Everything in A10, including login rate limiting and security headers.
- Password reset: admin generates a one-time link (24 h, single use) to share by WhatsApp; users can change their own password; used and expired tokens are rejected (tests).
- Excel import (admin only): upload .xlsx, choose sheet, map columns (mapping saved), dry-run preview with per-row errors, then commit. Imported records write Events marked "imported". Tested against Sagi's sample sheets with fake values.

Prompt:

```
Phase 7 — Add/edit vehicle, settings and quality bar. Read CLAUDE.md, docs/PROGRESS.md, docs/ARCHITECTURE.md, docs/PHASES.md (Phase 7) and SPEC 5.8, 5.9, A10.
Plan against the Phase 7 acceptance criteria and wait for my approval.
```

---

## Phase 8 — Translation audit and motion polish

SPEC: A8, 5.2.

Acceptance criteria:
- Every screen, dialog, toast, empty state, chart and export checked in Hebrew; `pnpm i18n:check` clean; no RTL layout bugs at desktop or phone widths.
- All transitions smooth (no jank, jumps or flicker), interruptible, and correct with reduced motion.
- Updated Playwright screenshots for EN and HE.

Prompt:

```
Phase 8 — Translation audit and motion polish. Read CLAUDE.md, docs/PROGRESS.md, docs/PHASES.md (Phase 8) and SPEC A8, 5.2.
Plan the audit, then fix what you find. Wait for my approval of the plan first.
```

---

## Phase 9 — Deploy to our server

Acceptance criteria:
- Docker Engine + Compose v2 verified or installed on the Ubuntu ARM64 server (ask before touching the server).
- Production Docker Compose (postgres, api, caddy) with volumes for data and uploads; `.env` documented; images built for arm64.
- HTTPS on our domain via Caddy (automatic Let's Encrypt); HTTP redirects to HTTPS; reachable from phones off the office network.
- `docs/RUNBOOK.md` covers start, stop, update, logs and creating the first admin.
- Smoke test passes against the deployed app; seed data replaced by an empty fleet plus an admin user.

Prompt:

```
Phase 9 — Deploy. Read CLAUDE.md, docs/PROGRESS.md, docs/ARCHITECTURE.md and docs/PHASES.md (Phase 9).
Plan the deployment for our server as decided in Phase 0 and wait for my approval. Ask before running anything on the server.
```

---

## Phase 10 — Backups and restore

Deferred from Phase 0: backup location still to be decided.

Acceptance criteria:
- Backup location agreed with Sagi and recorded in `docs/PROGRESS.md` → Decisions (second disk, network share and/or off-site copy).
- Nightly automated backup of the database (`pg_dump`) and the uploads volume, with retention (e.g. 14 daily copies).
- A restore was actually performed onto a fresh database and checked; the steps are in `docs/RUNBOOK.md`.
- A failed backup is noticed (log plus a visible alert or status line for admins).

Prompt:

```
Phase 10 — Backups and restore. Read CLAUDE.md, docs/PROGRESS.md, docs/ARCHITECTURE.md, docs/RUNBOOK.md and docs/PHASES.md (Phase 10).
Ask me where backups should go, then plan backups and a restore test and wait for my approval. Ask before running anything on the server.
```
