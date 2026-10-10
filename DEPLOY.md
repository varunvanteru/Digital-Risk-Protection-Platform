# Deploying to impostr.live

```
 Browser ──► https://impostr.live          Hostinger (Node.js app: Next.js website)
    │
    └──────► https://api.impostr.live      Render (free: FastAPI detection engine)
                     │
                     └──► MySQL             Hostinger (database, remote access)
```

Hostinger web hosting runs Node.js apps but not Python servers, so the API runs on
Render. It stays on your domain (`api.impostr.live`) and uses the Hostinger database.

Secrets (the MySQL password) are typed into the Hostinger and Render dashboards only.
They are never committed and never part of the website upload.

## 1. Website on Hostinger

1. Build the upload on your computer:
   `backend\.venv\Scripts\python scripts\package_frontend.py` → `dist\impostr-frontend.zip`
2. hPanel → **Websites** → **Add website** → **Node.js Apps** → **Upload files** → choose the zip.
3. Domain: **impostr.live**.
4. Build settings:

   | Setting | Value |
   |---|---|
   | Framework | Next.js (or Other) |
   | Node.js version | 20 or 22 |
   | Install / build command | `npm install` / `npm run build` |
   | Start command / entry file | `npm start` / `server.js` |

5. Deploy. The site opens but shows "Starting the server" until steps 2–4 are done.

## 2. Database on Hostinger

1. hPanel → **Databases** → **Management** → create a database and a user with a strong
   password. Note the full names (e.g. `u123456789_impostr` for both).
2. **Databases** → **Remote MySQL** → add **Any host** for that database. Render has no fixed
   outgoing IP address, so a specific IP cannot be used.
3. Note the **MySQL host** shown on that page (e.g. `srv1234.hstgr.io` or an IP address).

The API creates its tables and loads the demo brands on first start.

## 3. API on Render

1. Sign in at render.com with GitHub → **New** → **Blueprint** → select this repository.
   Render reads `render.yaml`.
2. Fill in the values from step 2: `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DB`.
   Then click **Apply**.
3. When the deploy finishes, open `https://impostr-api.onrender.com/api/health`. It should
   return `"status": "ok"`.
4. Service → **Settings** → **Custom Domains** → add `api.impostr.live`. Render shows the
   CNAME target.

## 4. DNS on Hostinger

hPanel → **Domains** → impostr.live → **DNS / Nameservers** → add a record:

| Type | Name | Points to | TTL |
|---|---|---|---|
| CNAME | `api` | `impostr-api.onrender.com` | 3600 |

Back in Render, click **Verify**. Render issues the HTTPS certificate in a few minutes.

## 5. Keep the API awake (optional, recommended before a demo)

Render's free tier sleeps after 15 minutes without traffic; the next visit waits up to a
minute while it starts (the website shows "Starting the server"). A cron job on Hostinger
keeps it awake. One always-on free service fits Render's 750 free hours a month.

hPanel → **Advanced** → **Cron Jobs** → every 10 minutes:

```
curl -fsS https://api.impostr.live/api/health > /dev/null
```

## 6. Check

- `https://api.impostr.live/api/health` shows `"status": "ok"` and the database name.
- `https://impostr.live` shows the Overview for ZentraPay after the first scan.
- **Sources**: Google Play and App Store are *live*; the rest are labelled *simulated*.
- **Quick check** → `PhonePe` → official apps marked Official; nothing official flagged.
- **Accuracy** → precision 1.00, 0 official assets flagged.

## Updating

- **API:** push to `main`; Render redeploys automatically.
- **Website:** run `scripts/package_frontend.py` again and upload the new zip in hPanel.

Uploaded logos are also stored in MySQL (`media_files`), so they survive API restarts on
Render's temporary disk.
