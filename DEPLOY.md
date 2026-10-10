# Deploying to impostr.live

Everything runs on Hostinger, as one Node.js app:

```
 Browser ──► https://impostr.live           Hostinger Node.js app (frontend/)
                ├─ website pages             Next.js
                ├─ /api/...                  detection engine and REST API (src/server)
                └─ /media/...                logos and avatars, stored in MySQL
                        │
                        └──► MySQL           Hostinger database (MariaDB 11)
```

The app deploys from GitHub: every push to `main` rebuilds and restarts it.
The database password lives only in hPanel's environment variables. It is never
committed.

## 1. Database (once)

1. hPanel → **Websites** → impostr.live → **Databases** → **Management**: create a
   database and user (e.g. `u807314952_impostr`) with a strong password.
2. **Databases** → **Remote MySQL**: add **Any host** for that database. Note the
   **MySQL hostname** shown at the top (e.g. `srv637.hstgr.io`).

The app creates its tables and loads the demo brands on first start.

## 2. Environment variables (once)

hPanel → **Websites** → impostr.live → **Environment variables** → add:

| Name | Value |
|---|---|
| `MYSQL_HOST` | the MySQL hostname from step 1 (e.g. `srv637.hstgr.io`) |
| `MYSQL_PORT` | `3306` |
| `MYSQL_USER` | the database user |
| `MYSQL_PASSWORD` | the database password |
| `MYSQL_DB` | the database name |
| `ADMIN_PASSWORD` | a password for changes (recommended on the public site) |

Then **Deployments** → **Redeploy**, so the app starts with them.

With `ADMIN_PASSWORD` set, anyone can browse, run Quick check, run scans and switch
the active brand, but editing brands, changing a detection's status or simulating an
outage asks for the password once per browser. Without it, everything is open.

## 3. App (already connected)

hPanel → **Websites** → **Add website** → **Node.js web app** → **Import Git repository**
→ this repository, branch `main`, **root directory `frontend`**, framework preset
**Next.js**, Node.js 20 or 22. Domain: impostr.live.

## 4. Check

- `https://impostr.live/api/health` shows `"status": "ok"`, the database name and the
  MariaDB version.
- `https://impostr.live` shows the Overview for ZentraPay after the first scan (a minute).
- **Sources**: Google Play and App Store are *live*; the rest are labelled *simulated*.
- **Quick check** → `PhonePe` → official apps marked Official; nothing official flagged.
- **Accuracy** → precision 1.00, 0 official assets flagged.

If `/api/health` returns 503, the database settings are wrong or Remote MySQL is not
allowed: check step 1 and 2, then Redeploy. `MYSQL_HOST=localhost` is an alternative
if Hostinger runs the app on the same server as the database.

## Updating

Push to `main` (after review). Hostinger pulls, installs, builds and restarts.

Without GitHub: `python scripts/package_frontend.py` builds `dist/impostr-frontend.zip`
(no secrets, no `node_modules`) for a manual upload.

## Moving existing data

Logos written by the Python reference engine (`backend/media`) can be copied into a
database with `npx tsx scripts/import-media.ts ../backend/media` (from `frontend/`,
with that database's settings in `frontend/.env.local`).
