# Progress

## Status

- Current phase: 3 — Vehicle detail (built; waiting for Sagi's review in the PR)
- Last completed phase: 2 — Vehicle drawings, dashboard and the selection transition

## Phase log

<!-- One entry per finished phase: date, what shipped, anything deferred. Newest first. -->

### Phase 3 — 2026-10-26

- Shipped: industrial colours (black/grey dark, medium grey light, machine yellow and red accents). Vehicle page: Serial / VIN / License in mono numerals with click to copy; pinned vitals with a "Customize vitals" picker (add, remove, reorder, reset) saved per user; masked start code with a permission-checked, rate-limited, audited reveal that hides itself after 30 s; Side | Isometric choice saved per user; four callout lines on the side drawing (numbered dots plus a list on phones); activity sidebar with filters, scroll paging and paging back to a linked older event; assigned items table with Assign / Remove (editors and admins, each writes Events); ten record cards with counts that open into panels (?panel=, Back and Esc close); Prev / Next buttons and arrow keys (mirrored in Hebrew) and jump-to-vehicle search.
- API: `GET /api/vehicles/:serial`, `POST /api/vehicles/:serial/start-code/reveal`, `GET|PUT /api/me/preferences`, `GET /api/items/unassigned`, `POST /api/items/:id/assign|remove`; dashboard tiles carry the plate for the jump search.
- Tests: 40 api tests (start code absent from page, list, dashboard, events and logs; 403 with no audit for admins without the permission; one audit row per reveal; preferences follow the user to a new session; item moves write Events on both vehicles; fuel economy maths), 26 Playwright tests (copy, reveal, viewer denied, vitals persist, callouts, panel Back/Esc, prev/next in EN and HE, jump, paging back to an old event). Screenshots in `docs/screenshots/phase-3/`.
- Deferred: record tables, forms and export (Phase 4); setting a start code and the status override (Phase 7).

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
- Price quotes (2026-10-26, from Sagi): every user, viewers included, can add quotes. Levels: standard (creator + admins, default), public (everyone), admins only (sensitive). Only admins change the level; admins see all. Enforced server-side in Phase 6 (SPEC 5.6). Defaults to confirm with Sagi: new quotes start standard; a creator loses sight of their quote once it's admins-only; public quotes are read-only for non-creators.
- Pinned to well-established majors (TypeScript 5.9, Vite 7, Vitest 3, ESLint 9, Prisma 6): newer majors exist but are fresh; upgrade deliberately later.
- Login rate limit keyed by IP + email: 20–30 users may share one office IP, so a per-IP limit would lock out everyone at once.
- Phase 2 (2026-10-26, from Sagi): ripple uses fade + shrink (no blur); phones stack KPIs, then the grid, then the timeline; SVG stroke animation (draw-in) is allowed and will be revisited.
- Quote visibility field added in Phase 2 (`Quote.visibility`, default STANDARD) so the timeline already hides QUOTE_LINKED events for quotes a user can't see. `Quote.createdById` stays optional until Phase 6 adds the quote screens.
- Second visual style (top photo crossfading to a side photo) comes with uploads in Phase 7, using Sagi's own or dealer-permitted photos only, never manufacturer-site photos. `HeroVisual` is the slot that will take the photos; vehicles without photos keep the drawing.
- Transition budget measured in the page on the production build: about 1.15 s from click until every animation has finished (the e2e test checks stage-mount to settled ≤ 1.1 s on the dev server).
- `packages/shared` is marked side-effect free, so the web bundle only takes the enums it uses (zod stays on the server for now): dashboard JS is 234 KB gzipped.
- Isometric view (2026-10-26, Sagi: the CSS-tilted flat layers didn't look good): each type now also has a small 3D model (boxes, extruded profiles, wheels) projected to an isometric SVG with shaded faces. The transition still tilts the flat top view with CSS 3D (SPEC 5.2 step 3) and hands over to the 3D drawing at the end of the tilt. Pickup side profile shortened.
- Drawings (2026-10-26, Sagi): the real fleet is pickups, 30-tonne class excavators, 20-tonne class wheel loaders and one equipment trailer, and no backhoe. These were drawn first, and `trailer` (an enclosed, caravan-like box trailer) was added as a vehicle type (SPEC A4, glossary נגרר ציוד). Types are modelled once in 3D (metres); their top and side views are generated from the model, except the pickup's, which are hand-drawn. Excavator top views use the arm folded so grid tiles stay readable; the isometric and side views show it extended.
- The Side | Isometric toggle on the vehicle page is in Phase 2 (it decides the last step of the transition); the rest of the vehicle page is Phase 3.
- Colours (2026-10-26, from Sagi): dark theme black and dark grey; light theme a medium-dark grey page with light grey panels; accents machine yellow and red. "Has issues" moved from amber to orange so it never reads as the yellow accent; red stays for "Inoperable". Yellow is too light for text on light grey, so accent text uses a deep ochre (`--fh-accent-ink`).
- Callouts (2026-10-26, from Sagi): engine hours (odometer on road vehicles), VIN, last location, last fuel. The list is one array in `apps/web/src/vehicle/callouts.ts`; any vehicle value can be a callout. A callout with no value (fuel on a trailer) is left out.
- Drawing names (2026-10-26, Sagi saw a compressor drawing under "Backhoe loader"): each drawing now names the type it shows (`represents`), and the registry files it under that name only, so a drawing can't appear under another type. The compressor got its own type (`compressor`, מדחס נייד). Types without a drawing of their own (the backhoe loader) show the generic "other" drawing, a plain crate. The `/drawings` page labels each drawing with the type name users see. The seed has no backhoes any more: two Caterpillar 966 / 330 class machines replace them, and OT-991 became the compressor CP-991.
- Prev / Next order comes from the dashboard tiles already in memory (grid order: type, then serial), so no neighbours endpoint was needed. Navigating replaces the history entry, so Back still leaves the vehicle pages in one step.
- Record panels show the latest events of that kind until Phase 4 brings the full tables.
- Admins need the separate "view start codes" permission to reveal a code; the admin role alone isn't enough.
- API is bundled with esbuild (workspace code inlined, npm packages external) so `packages/shared` stays plain TypeScript with no build step.

## Later

<!-- Ideas and out-of-scope findings, to revisit after Phase 9. -->

- Auto-fill receipt date, vendor and total from the photo (SPEC 5.5)
- Installable PWA (home-screen icon on phones)
- Email delivery for password resets (SMTP)
- Upgrade to newer majors (TypeScript 7, Vite 8, Prisma 7+, ESLint 10) once they settle
