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
| `YOUTUBE_API_KEY` | YouTube Data API v3 key (Google Cloud console) |
| `BRAVE_SEARCH_API_KEY` | Brave Search API key: web search for the social platforms |
| `SERPER_API_KEY` | Serper.dev key: used when Brave is out of credit or fails |
| `ADMIN_PASSWORD` | leave unset for the judging demo (see below) |

Then **Deployments** → **Redeploy**, so the app starts with them. A source whose key is
missing is shown as **Not connected** and returns nothing; the rest of the app still works.
At least one of the two web-search keys is needed for Instagram, Facebook, X, LinkedIn,
Threads, Pinterest, Quora, Snapchat, ShareChat, WhatsApp, Moj, Josh and Discord.

Every visitor works in their own private workspace (Continue as demo, or an account),
so nothing anyone does there needs a password: editing brands, confirming threats,
takedown letters, scans. `ADMIN_PASSWORD` only guards **Pause source / Resume source**,
because sources are shared by every workspace. Leave it unset so judges can try
everything; a paused source then stays paused for everyone until someone resumes it.

## 3. App (already connected)

hPanel → **Websites** → **Add website** → **Node.js web app** → **Import Git repository**
→ this repository, branch `main`, **root directory `frontend`**, framework preset
**Next.js**, Node.js 20 or 22. Domain: impostr.live.

## 4. Check

- `https://impostr.live/api/health` shows `"status": "ok"`, the database name and the
  MariaDB version.
- `https://impostr.live` → **Continue as demo** shows the Overview for PhonePe, with its logo,
  and "No scan yet". Press **Run scan**: results appear in about a minute.
- **Sources**: all 17 sources are *Live* (or *Cached* if a source failed this scan). A
  *Not connected* source means its API key is missing in step 2.
- **Quick check** → `PhonePe` → official apps and accounts marked Verified official; nothing
  official flagged.
- **Accuracy** → 31 of 31 PhonePe cases correct, precision and recall 1.00, 0 of 8 official assets flagged.

The first start after updating from the sample-data version removes the old sample data
once and leaves every existing workspace with the current demo brands, PhonePe, SBI and Airtel (the old
Paytm and ZentraPay demo copies are removed; brands a visitor added are kept).

Search results are shared by all workspaces for 12 hours, so many visitors searching the
same brand use the API quotas once. Brave's free credits reset monthly; Serper's free
credits are a one-time allowance; YouTube allows 10,000 units a day (a search costs 100).

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
