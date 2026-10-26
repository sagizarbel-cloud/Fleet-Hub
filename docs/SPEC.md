# Fleet Hub — Product Spec

Source of truth for what Fleet Hub does and looks like. Build order and acceptance criteria live in `docs/PHASES.md`; engineering conventions live in `CLAUDE.md`.

## A1. Goal

Fleet Hub is a bilingual English/Hebrew fleet-management web app for a mixed fleet of heavy engineering equipment (excavators, loaders, tractors) and road vehicles (trucks, pickups, vans). It is self-hosted on our own server.

Priorities, in order:

1. A fluid, visually impressive interface built around animated vehicle drawings and seamless transitions.
2. Complete record-keeping: everything ever done to a vehicle appears in its history.
3. Full Hebrew support with a mirrored right-to-left layout, where at least 95% of on-screen words are translated.

## A2. Tech stack and data

Self-hosted; no third-party backend services. Details and commands are in `CLAUDE.md`.

- Front end: React + TypeScript + Vite + Tailwind CSS + shadcn/ui, lucide-react icons.
- Motion (formerly Framer Motion) for all animation: shared-element layout transitions (layoutId, LayoutGroup), AnimatePresence, springs.
- react-i18next for translations; React Router with a URL per vehicle (`/vehicles/:serial`), so deep links and the browser Back button work.
- TanStack Table with row virtualization, TanStack Query for data fetching, Recharts for charts, ExcelJS for .xlsx export.
- Back end: Node.js + TypeScript + Fastify + Prisma + PostgreSQL. Uploaded files are stored on a server volume and served only through authenticated API routes.
- Deployment: Docker Compose on our server (PostgreSQL, API, and a Caddy container serving the built front end and proxying `/api`).
- Seed data (fake, never real): 16 vehicles across all types (about 10 green, 4 amber, 2 red), each with 6 months of history, assigned items, receipts and quotes. Include pickups such as Toyota Hilux and Mitsubishi Triton with fake start codes, Israeli-format license numbers (7 or 8 digits) and valid-looking 17-character VINs.

## A3. Visual design

Dark "control room" meets technical blueprint: calm and precise, with motion doing the impressing.

- Near-black navy background, glass panels with fine borders, one cyan accent for interactive elements. Include a light theme.
- Type: IBM Plex Sans (English), IBM Plex Sans Hebrew (Hebrew), and IBM Plex Mono with tabular figures for all IDs and numbers. Self-host the font files.
- Status colors, used everywhere: green = operational, yellow (amber) = has issues, red = inoperable. Always pair the color with an icon and a label (check, warning, cross) so status reads without color.
- Motion: springs for movement, ease-out for fades; animate only transform and opacity to hold 60 fps. Respect prefers-reduced-motion with simple crossfades.
- No stock photos, emoji or placeholder text.

## A4. Vehicle drawings

Animated SVG line drawings are the centerpiece of the UI.

- Build an SVG library in a technical-sketch style: 2 px rounded strokes, simple geometric shapes, consistent scale.
- Types: tracked excavator, wheeled excavator, backhoe loader, wheel loader, skid-steer, tractor, forklift, truck, pickup, van/car, and a generic "other".
- Each type gets a top-down drawing (fleet grid) and a side profile (detail view). Split every drawing into named groups (body, cab, wheels/tracks, boom/arm, bucket/bed) so parts tint and animate separately.
- Isometric view: tilt the top-down drawing with CSS 3D (rotateX about 55–60°, rotateZ −45°) and lift its part layers to different heights with translateZ, for a layered, pseudo-3D blueprint look.
- Status tint: stroke in the status color, a light (about 15%) status fill and a soft glow beneath. Red vehicles pulse gently.
- When the detail view opens, the side profile draws itself (stroke-dash animation), then callout leader lines extend from it to the Serial, VIN and License numbers.
- Users can upload a custom image or SVG per vehicle to replace the default drawing (sanitize uploaded SVGs).
- `docs/sketch.jpeg` (if present) is the original whiteboard sketch: match its drawing style; this spec wins on any conflict.

## A5. Screens

Six areas, reached from a top bar: Dashboard, Fleet table, Receipts, Quotes, Equipment and Settings.

- Top bar: app name, global search (serial, VIN, license or item), navigation, language toggle, theme toggle, user menu, and a "+ Add" menu (vehicle, receipt, quote, item).
- A login page precedes everything; see A7 for roles.

### 5.1 Dashboard (home)

Recent history and the whole fleet, side by side.

- Layout: a Recent History panel (about 40% width) next to the Fleet Grid (about 60%). In Hebrew the layout mirrors.
- KPI strip at the top of Recent History: vehicles per status (large colored numbers), items due within 30 days (services, annual tests, insurance), open malfunctions, and spend this month.
- Timeline below it: fleet-wide events grouped by day, with filter chips per event type. Each event shows an icon, a vehicle serial chip, a one-line description and the time.
- Linking: hovering an event draws an animated curved line to its vehicle tile; hovering a tile highlights its events. Clicking an event opens that vehicle, scrolled to the event.
- Fleet Grid: small top-down tiles tinted by status, grouped by type in collapsible sections. Each tile shows the serial number and status icon.
- Hovering a tile lifts it and shows a quick card: location, next service, open issues.
- A "+" tile opens Add Vehicle. Filters: status, type, department.

### 5.2 Selection transition

Clicking a tile morphs the dashboard into that vehicle's page in one continuous motion of at most 1.2 s, interruptible at any point.

1. The other tiles fade, shrink and blur out in a ripple spreading from the clicked tile; the history panel slides off to its edge.
2. The clicked vehicle (shared layoutId) flies to center stage and scales up.
3. It tilts from top-down into the isometric view. If the user's default is side view, it then morphs into the side profile, which draws itself.
4. Detail panels arrive staggered: vitals header from the top (numbers count up), activity sidebar from the side, record buttons rising from the bottom.
5. Back (button, Esc or swipe) plays the exact reverse and returns the vehicle to its grid slot.

Keep the dashboard and detail view in one persistent layout, so route changes never unmount the shared vehicle element.

### 5.3 Vehicle detail

Everything about one vehicle on one page, with the drawing at its center.

- Header: type, make/model and status pill. Then Serial No., VIN/Chassis No. and License No. in medium-large mono numerals (click to copy), and a row of pinned vitals (A6) with a "Customize vitals" picker saved per user. Vehicles with a start code also show a masked code chip here (see A7).
- Hero: the drawing, with a Side | Isometric toggle that is remembered.
- Activity sidebar: this vehicle's timeline (movements, services, malfunctions and accidents, fluids, fuel, items added or removed, documents, status changes), with type filters.
- Assigned items table: Item | Model | Spec | Serial | Assigned since, with Assign and Remove.
- Record buttons: icon cards with counts (e.g., "Malfunctions · 2 open"). Each expands with a shared-element animation into a full table panel with add/edit, sort, filter, attachments and Excel export:
  - Service history
  - Malfunctions & accidents
  - Fluid additions (engine oil, hydraulic oil, coolant, brake fluid, AdBlue, grease)
  - Fuel & economy: log plus chart, in km/L for road vehicles and liters per engine hour for equipment; flag sudden drops
  - Movements (location changes)
  - Inspections & compliance (annual test, insurance, certified-inspector safety checks)
  - Ownership & warranty (purchase date, supplier, price, warranty terms and expiry)
  - Documents & receipts
  - Quotes
  - Notes
- Prev/Next arrows and arrow keys slide to the neighboring vehicle; a dropdown jumps to any vehicle.

### 5.4 Fleet table

A consolidated table of all vehicles, or of one category, with every field available.

- One row per vehicle; a sticky first column with status icon, mini top-down drawing and serial.
- Columns grouped into categories: Identity, Status & Readiness, Usage, Maintenance, Compliance, Ownership & Warranty, Equipment, Costs. Each group has a dropdown to expand, collapse or pick its columns.
- Rows expand inline to show detail per category: latest services, open malfunctions, assigned items.
- Search, filters, sort, group by type or department, and saved views.
- Clicking a vehicle jumps to its detail view through the same transition.
- Export to Excel: the current view, or the whole fleet as a multi-sheet workbook.

### 5.5 Receipts

One hub for every receipt and invoice, each tagged with its vehicle's serial number.

- Multi-file upload of photos and PDFs; camera capture on mobile.
- Fields: vehicle serial tag, date, vendor, amount (₪), category (fuel, service, parts, tools, tires, inspection, insurance, other), and an optional link to a specific record such as a service.
- Thumbnail grid or table view; filter by vehicle, category, date and amount; totals per vehicle and per month; Excel export.
- Receipts also appear in each vehicle's Documents tab.
- Later (not in scope now): auto-fill date, vendor and total from the photo.

### 5.6 Price quotes

A dedicated area for quotes on vehicle parts and tools, assignable to vehicles.

- Quote fields: supplier, date, valid until, status (Requested → Received → Approved → Ordered, or Rejected), attached PDF.
- Line items: part or tool, part no./model, condition (in stock / new / needs replacement), quantity, unit price, total.
- "+ Assign vehicle" opens a picker with mini drawings. A quote can link to several vehicles and appears in their Quotes tab.
- Compare quotes for the same part side by side; Excel export.
- Visibility (enforced by the API, not only hidden in the UI):
  - Every signed-in user, viewers included, can add a quote.
  - Admins see every quote. Everyone else sees only the quotes they created, everywhere quotes appear: the Quotes area, a vehicle's Quotes tab and its count, comparisons, search, Excel exports and the activity timeline ("quote linked" events).
  - A non-admin can edit or delete only their own quotes; admins can edit or delete any.
  - Asking for someone else's quote by id returns "not found", so its existence isn't revealed.

### 5.7 Equipment & tools

Attachable items are tracked like vehicles, with full assignment history.

- Catalog: buckets, hydraulic breakers, concrete crushers, generators, equipment boxes, adapters and so on, each with model, spec, serial and current vehicle.
- History of which vehicle held each item, and when.
- Assign from the vehicle page, or drag an item onto a vehicle tile.

### 5.8 Add / edit vehicle

A short stepper; the new tile animates into the grid on save.

- Steps: Type → Identity (serial, VIN/chassis, license, make, model, year, start code if any) → Assignment (department, location, operator) → Compliance dates → Ownership & warranty → Photo or drawing.
- Validation: 17-character VIN for road vehicles (free text for equipment PINs); Israeli license formats (7 or 8 digits).

### 5.9 Settings

- Editable lists in both languages: departments, locations, vehicle types, fluid types, receipt categories.
- Default vitals, language and theme.
- Users and roles (admin only).

## A6. Vitals options

The vehicle header always shows Serial No., VIN/Chassis No. and License No.; users pin more vitals from the lists below.

Shown by default:

- Status and readiness level (%)
- Odometer (km) / engine hours
- Next service due (km, hours or date, whichever comes first)
- Annual test expiry, as a countdown
- Current location
- Department

Available in the picker:

- Insurance expiry
- Certified-inspector safety check expiry
- Assigned operator / driver
- Make, model, year
- Open malfunctions
- Fuel economy, last 30 days
- Maintenance cost, year to date
- Purchase date / warranty expiry
- Last activity

## A7. Data model and security

One unified Event log feeds every timeline and activity feed.

- Event: type, vehicle, date, user, parameters, and a link to the source record.
- Vehicle: every identity, status, usage, compliance and ownership field above.
- Start code: some vehicles need a PIN to start, mainly pickups such as Toyota Hilux and Mitsubishi Triton, not excavators or loaders. Store a per-vehicle "has start code" flag (on by default for pickups) and the code itself, encrypted at rest. Show it masked; only users with the "view start codes" permission can reveal it, and every reveal is written to an audit log. Never include it in exports, search, logs, API list responses or the fleet table.
- Records: ServiceRecord, Malfunction (severity, open / in progress / resolved, downtime, cost, accident flag), FluidAddition, FuelEntry, Movement, Inspection.
- Items: Item and ItemAssignment (history of which vehicle held it).
- Money: Document/Receipt (tagged to one or more vehicles), Quote (with its creator, required) and QuoteLine, Supplier. Quote visibility follows 5.6.
- Lookups: Department, Location, VehicleType, FluidType, ReceiptCategory, each with English and Hebrew names.
- Users: User, Role (viewer / editor / admin), permission flags (including "view start codes"), Session, AuditLog.
- Any record can carry file attachments, such as an inspection's invoice or certificate.
- Saving a record writes an Event and refreshes the vehicle's vitals.
- Status is derived: a critical open malfunction, or an expired annual test or insurance, makes a vehicle red; any other open malfunction makes it amber; otherwise green. A manual override is allowed and logged.

## A8. Bilingual and RTL (hard requirements)

Switching to Hebrew must translate at least 95% of on-screen words and mirror the whole layout.

- Every user-facing string goes through i18n keys: labels, buttons, menus, statuses, event and vehicle types, units, placeholders, validation, toasts, empty states, tooltips, chart labels, aria-labels, page titles and Excel headers. No hardcoded text in components.
- System-generated text (event descriptions, alerts) is built at render time from translated templates plus parameters, never stored as English sentences.
- Only user-entered text, brand/model names and codes (VIN, serial, license and part numbers) stay as entered.
- Enforce it: a lint rule rejecting literal strings in JSX (eslint-plugin-i18next), an `i18n:check` script that fails on any key missing a Hebrew value, and a hidden `/i18n-check` page listing them.
- Language toggle (EN / Hebrew) in the top bar, remembered between visits. Switching is instant, with a short crossfade and no reload.
- RTL: set the html dir and lang attributes and use logical properties (ms/me, ps/pe, start/end) so everything mirrors, including directional icons.
- Wrap VINs, serials, license and part numbers and other mixed letter-number strings in `<bdi dir="ltr">`, so they never reorder inside Hebrew text.
- Format with Intl: dates as DD/MM/YYYY, relative times, ₪ amounts, km and liters.
- Excel exports use the active language; Hebrew exports set the sheet to right-to-left.
- Use the glossary in A9 for Hebrew terms.

## A9. Hebrew glossary

Use these Hebrew terms consistently across the UI, messages and exports.

| English | Hebrew |
| --- | --- |
| Fleet | צי רכב |
| Dashboard | לוח בקרה |
| Vehicle | כלי |
| Serial No. | מספר סידורי |
| VIN / Chassis No. | מספר שילדה |
| License No. | מספר רישוי |
| Operational / Has issues / Inoperable | תקין / עם תקלות / מושבת |
| Readiness level | רמת כשירות |
| Current location | מיקום נוכחי |
| Location change | שינוי מיקום |
| Department | מחלקה |
| Start code | קוד התנעה |
| Odometer / Engine hours | קילומטראז׳ / שעות מנוע |
| Next service | טיפול הבא |
| Annual test | טסט שנתי |
| Insurance | ביטוח |
| Certified-inspector check | בדיקת בודק מוסמך |
| Service history | היסטוריית טיפולים |
| Malfunctions / Accidents | תקלות / תאונות |
| Fluid additions | מילוי נוזלים |
| Fuel economy | צריכת דלק |
| Assigned items | פריטים משויכים |
| Accessories / Work tools | אביזרים / כלי עבודה |
| Item / Model / Spec | פריט / דגם / מפרט |
| Ownership / Warranty | בעלות / אחריות |
| Purchase date | תאריך רכישה |
| Documents / Receipts / Invoices | מסמכים / קבלות / חשבוניות |
| Price quotes / Spare parts | הצעות מחיר / חלקי חילוף |
| In stock / New / Needs replacement | קיים במלאי / חדש / דרוש להחלפה |
| Notes | הערות |
| Recent activity | פעילות אחרונה |
| Fleet table | טבלה מרוכזת |
| Export to Excel | ייצוא לאקסל |
| Add vehicle | הוספת כלי |
| Side view / Isometric view | מבט צד / תצוגה איזומטרית |
| Excavator / Tracked excavator / Wheeled excavator / Backhoe loader | מחפר / מחפר זחלי / מחפר גלגלי / מחפרון |
| Wheel loader / Skid-steer / Tractor / Forklift | שופל / בובקט / טרקטור / מלגזה |
| Truck / Pickup / Van / Car | משאית / טנדר / מסחרית / רכב פרטי |
| Hydraulic breaker / Concrete crusher | פטיש חציבה / מרסק בטון |
| Generator / Bucket / Equipment box | גנרטור / כף / ארגז ציוד |

## A10. Quality bar

The app must stay smooth, usable and forgiving at real fleet scale.

- Desktop-first but fully usable on tablet and phone: the grid reflows, the detail view stacks, tables scroll with a sticky first column.
- Keyboard: arrows move between vehicles, Esc goes back, focus is always visible.
- Skeleton loaders, empty states with a clear next action, toasts with Undo for deletes, and confirmation before destructive actions.
- Smooth with 200+ vehicles and thousands of records: virtualized tables, lazy-loaded panels, paginated API lists.
- Security basics: validate every API input with zod, check permissions on every route, rate-limit login, set secure cookie and header defaults.
