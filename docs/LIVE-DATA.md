# Live data: connecting vehicles

Fleet Hub shows every vehicle's **current fuel level** on the dashboard. A level comes from one of two places:

- **Manual**: an editor reads the gauge and sets it (pencil on the dashboard's _Current fuel_ panel). It is logged in the vehicle's timeline.
- **Live**: a connected vehicle, or the telematics provider's server, posts readings to Fleet Hub. Open dashboards update within a second, without reloading.

The telematics system isn't chosen yet, so Fleet Hub takes one small, provider-agnostic format. Whatever system is picked, a short adapter on its side (or its "webhook" / "data forwarding" feature) maps its data to the format below. Fuel and engine hours are the live values so far; the format leaves room for more later.

## 1. Create a connection (admin)

_Settings → Live data → Add connection_. Choose one:

| Kind                                   | Use it for                                                      | Readings name the vehicle?                                  |
| -------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| **One vehicle**                        | A tracker or gateway box installed in that vehicle              | No (may, but it must be that vehicle)                       |
| **Many vehicles** (gateway)            | The telematics provider's server, posting for the whole fleet   | Yes: `serial` (Fleet Hub's vehicle number) or `vin`          |

Fleet Hub shows the connection's **token once**. Copy it into the tracker or the provider's settings. Only a hash of it is stored; if it is lost, press _New token_ (the old one stops working at once). _Turn off_ stops a connection; its past readings stay. Creating, re-keying and turning off are written to the audit log.

Tokens look like `fhl_` followed by 43 characters. Treat them like passwords.

## 2. Send readings

```
POST https://<your-domain>/api/telematics/v1/readings
Authorization: Bearer fhl_…
Content-Type: application/json
```

Body: an object with a `readings` array (up to 500), a bare array, or a single reading.

```json
{
  "readings": [
    { "serial": "EX-101", "at": "2026-11-15T18:02:11Z", "fuelLevelPct": 62.5 },
    { "vin": "1HGBH41JXMN109186", "at": "2026-11-15T18:02:09+02:00", "fuelLiters": 310 }
  ]
}
```

A tracker on a one-vehicle connection can send just:

```json
{ "fuelLevelPct": 62.5 }
```

### Fields of a reading

| Field          | Type                         | Required                               | Notes                                                                                 |
| -------------- | ---------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
| `serial`       | string                       | gateway: this or `vin`                 | Fleet Hub's vehicle number, as on the dashboard (e.g. `EX-101`).                       |
| `vin`          | string                       | gateway: this or `serial`              | Case doesn't matter.                                                                  |
| `at`           | ISO 8601 date-time with zone | no (default: when it arrives)          | When the vehicle measured it. Up to 5 minutes ahead of the server clock is accepted.  |
| `fuelLevelPct` | number 0–100                 | this or `fuelLiters`, or both          | Percent of the tank. Rounded to one decimal.                                          |
| `fuelLiters`   | number ≥ 0                   | this or `fuelLevelPct`, or both        | Litres in the tank.                                                                   |
| `engineHours`  | number ≥ 0                   | no (but a reading needs at least one of the three values) | The engine's hour meter. Updates the vehicle's engine hours live (vehicle page vitals, callouts, next service). Rounded to whole hours; a value lower than the current one is ignored, since hour meters only count up. Added 2026-11-22. |

Any other field is ignored, so a provider can pass its own data along.

### Answer

- `200` with `{ "accepted": 2, "ignored": [] }`: done. Each reading is checked on its own; problems are listed by position and the rest are kept:
  ```json
  { "accepted": 1, "ignored": [{ "index": 1, "reason": "vehicle_not_found" }] }
  ```
  Reasons: `vehicle_not_found`, `vehicle_missing` (a gateway reading without `serial` or `vin`), `vehicle_mismatch` (a one-vehicle connection naming another vehicle), `no_fuel_tank` (fuel for a vehicle without a tank, e.g. a trailer, with no `engineHours` either), `future_time`, `noData` (no fuel field and no `engineHours`), or `<field>:<problem>` such as `fuelLevelPct:too_big`.
- `422`: every reading was ignored (same body as above).
- `400`: the body isn't one of the three shapes, or has more than 500 readings.
- `401` `{ "error": "bad_token" }`: missing, wrong or turned-off token.
- `429`: more than 120 requests a minute on one connection. Batch readings instead.

A reading older than the vehicle's current level is kept in the history but doesn't replace it, so late or out-of-order deliveries are safe to send. Retrying the same reading after a network error is harmless.

### How often

Once a minute per vehicle is plenty for fuel. A live level is shown as **Live** for 15 minutes; after that it turns **Stale** (the vehicle stopped reporting) until the next reading. Send a reading at least every 10 minutes while the engine runs, and one when it stops.

### Try it

```bash
curl -sS https://<your-domain>/api/telematics/v1/readings \
  -H "Authorization: Bearer $FLEET_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"serial":"EX-101","fuelLevelPct":55}'
```

In development, `pnpm fuel:simulate [serial …]` makes a connection called _Simulator (dev)_ and posts falling fuel levels for a few vehicles every 5 seconds, so the panel can be watched updating.

## 3. How it works inside

- Readings go to `FuelLevelReading` (history) and, when newest, to `FuelLevel` (one row per vehicle: what the panel shows). Live history older than 90 days is pruned; manual readings stay.
- Live readings don't go into the vehicle timeline (a vehicle may report every minute); manual ones do, as "Fuel level set to N%".
- Open dashboards hold a server-sent events stream (`GET /api/fuel/stream`, signed-in users only). Each new current level is pushed as `event: level` with `{ serial, pct, liters, at, source }`. The browser reconnects by itself and reloads the list after a drop. The stream checks every 5 minutes that its session is still valid.
- The stream fans out inside the one api process. Running more than one api container would need Postgres `LISTEN/NOTIFY` in `apps/api/src/lib/live-fuel.ts`.
- Caddy flushes event streams as they come. Not yet checked on the server: that the site's `encode zstd gzip` doesn't hold them back. After deploy, open the dashboard, post a reading with `curl` (above) and watch the row change at once; if it only changes on reload, exclude `/api/fuel/stream` from `encode` in the Caddyfile. Behind another proxy (nginx), turn buffering off for that path (the api also sends `X-Accel-Buffering: no`).
- The ingest route needs no cookie and no `Origin`; it is reached only with a connection token, and the token's hash is the rate-limit key.

## Constants

In `packages/shared/src/live-fuel.ts`: live window 15 min (`FUEL_LIVE_MAX_AGE_MIN`), low fuel at or below 20% (`FUEL_LOW_PCT`), 90 days of live history (`FUEL_HISTORY_DAYS`), 5 min of clock drift (`FUEL_MAX_FUTURE_MIN`), 500 readings per request (`FUEL_MAX_BATCH`). Types without a tank: `trailer` (`NO_FUEL_TYPES`).
