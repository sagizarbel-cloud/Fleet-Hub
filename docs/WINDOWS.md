# Fleet Hub on a Windows laptop

A stand-in until the site runs on the company server: one zip that installs the whole site on
one Windows 10/11 (64-bit) computer, for the user who runs it. No Docker, no admin rights and
no internet needed on the laptop.

## Building the zip

```bash
YARD_PLAY=on pnpm package:windows     # → build/windows/FleetHub-Windows.zip (~165 MB)
```

It builds web and api, installs the api's npm packages for win32-x64 (argon2, sharp, the
Prisma Windows engines), and adds Node 22 (`node.exe` from nodejs.org) and PostgreSQL 16
(the `@embedded-postgres/windows-x64` build). The `Windows package` workflow builds it and
tries it on a clean Windows machine (install, set password, sign in, stop, start, back up,
install again) whenever the Windows files change.

The zip holds `Fleet Hub setup/`: `Install Fleet Hub.cmd`, `Read me.txt` and
`fleethub-files.zip` (the site, unpacked by the installer with Windows' own `tar`).

## On the laptop

1. Extract the zip, double-click `Install Fleet Hub.cmd` ("More info" → "Run anyway" if
   SmartScreen asks).
2. Type the first admin's email and name. The browser opens the one-time page to choose the
   password (the same link `create-admin` prints on the server).
3. Afterwards: the **Fleet Hub** desktop icon starts it (if needed) and opens
   <http://localhost:3001>. It also starts quietly at Windows sign-in. Start menu → Fleet Hub has
   **Stop Fleet Hub** and **Back up Fleet Hub**.

Installing a newer zip the same way replaces the site and keeps every bit of data; database
migrations run on each start (forward only).

If the Microsoft Visual C++ Runtime is missing (rare: most PCs have it), the installer opens
Microsoft's `vc_redist.x64.exe` download and stops; run that, then the installer again.

## Where things are

`%LOCALAPPDATA%\FleetHub\`

| Folder | What |
| --- | --- |
| `app\` | the api (`app\api\dist\server.js`) and the web build (`app\web`), served together on port 3001 (`WEB_DIR`) |
| `runtime\` | `node\node.exe`, `pgsql\` |
| `tools\` | `install.ps1`, `start.ps1`, `stop.ps1`, `backup.ps1`, `restore.ps1`, `common.ps1` |
| `data\pgdata` | the PostgreSQL database (port 54329, 127.0.0.1 only, password auth) |
| `data\uploads` | photos, receipts and other files |
| `data\fleethub.env` | settings and secrets made at install (`SESSION_SECRET`, `FLEET_CODE_KEY`, the database password). Losing `FLEET_CODE_KEY` makes stored start codes unreadable |
| `data\logs` | `site.log`, `site-errors.log`, `postgres.log`, `migrate.log` |

Only this computer can open the site (both the site and the database listen on 127.0.0.1).

## Backups and restore

**Back up Fleet Hub** stops the site for a moment and zips `pgdata`, `uploads` and
`fleethub.env` into `Documents\Fleet Hub backups\fleethub-<date>.zip`. Keep a copy off the laptop.

To restore one (it first moves the current data aside to `data-before-restore-<time>`):

```powershell
powershell -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\FleetHub\tools\restore.ps1" -Backup "<path to the backup zip>"
```

A backup restores on the same laptop setup. Moving the data to the Linux server later needs a
`pg_dump` from the laptop's database (not included in this build); see PROGRESS "Later".

## Removing it

Stop Fleet Hub, then delete `%LOCALAPPDATA%\FleetHub`, the desktop icon, Start menu → Fleet Hub
and `shell:startup\Fleet Hub.lnk`. Deleting the folder deletes the data: back up first.
