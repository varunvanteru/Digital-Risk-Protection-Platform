# BrandShield: Digital Risk Protection

Finds social-media profiles, brand pages and mobile apps that impersonate a registered brand, scores each one 0 to 100, and explains every flag. Official assets are allowlisted by ID and are never flagged.

Built for the Bytexl hackathon (Kampus.VC problem statement: Social & App Monitoring).

## Architecture

| Part | Stack | Port |
| --- | --- | --- |
| Frontend | Next.js 15, TypeScript, Tailwind | 3100 (prod) / 3000 (dev) |
| Backend | FastAPI, SQLAlchemy, Python 3.11 | 8100 |
| Database | MySQL 8, schema `brandshield` (created automatically) | 3306 |

**Detection pipeline (allowlist-first)** — `backend/app/services/scan.py`, `services/search.py`:

1. **Validate official assets.** Each official app in the brand profile is looked up on its store (Google Play detail, App Store lookup); its developer account ID, store title, publisher and icon are recorded (cached 24 h).
2. **Build the allowlist and verified identities:** official IDs/handles, developer account IDs per store, normalised publisher names (`PhonePe Pvt. Ltd.` = `PHONEPE PRIVATE LIMITED` = `PhonePe`), package namespaces, official icons.
3. **Collect candidates** from every source. Live stores fall back to their last good results when down, labelled CACHED; curated datasets are labelled SIMULATED.
4. **Official-asset verification before any scoring** (`detection/official.py`):
   - L1 exact official ID / handle, L2 official URL → OFFICIAL
   - L3 published by a verified official developer account → OFFICIAL (finds official variants)
   - L4 official publisher name + supporting metadata, with no contradicting developer ID and no scam signals → LIKELY_OFFICIAL
   Official candidates stop here: risk 0, never scored.
5. **Risk signals and scoring** for everything else: look-alike name, icon (pHash, mirror-aware), description, impersonation claims, scam behaviour, publisher mismatch (only when an official publisher is on record: unknown is not a mismatch). Status: SUSPICIOUS / LOOKALIKE / MENTION.
6. **Gate 2** re-checks the allowlist before saving. No brand-specific code anywhere: brands are data.

**Accuracy** (`GET /api/accuracy`, Accuracy page): a labelled set of 71 cases (`backend/data/labelled_cases.json`) run through the same engine. Current result: 0 of 18 official assets flagged, precision 1.00, recall 0.925.

**Sources**

| Source | Mode |
| --- | --- |
| Google Play | Live (`google-play-scraper`) |
| Apple App Store | Live (iTunes Search API) |
| 16 social platforms (Instagram, Facebook, WhatsApp, X, Threads, LinkedIn, Telegram, Snapchat, YouTube, ShareChat, Moj, Josh, Pinterest, Reddit, Quora, Discord) | Simulated: curated dataset (no open search APIs) |
| APK mirror sites | Simulated: curated dataset |
| Store snapshot (simulated) | Simulated: curated store fakes for the demo brands (ZentraPay is fictional; PhonePe fakes are made up) |

## Run locally

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows
pip install -r requirements.txt
copy .env.example .env            # then set MYSQL_PASSWORD
python -m uvicorn app.main:app --port 8100
```

On first start it creates the database and tables, seeds the demo brand, and runs a scan.

Frontend:

```bash
cd frontend
npm install
npm run dev                       # http://localhost:3000, API defaults to http://localhost:8100
```

Production builds use `frontend/.env.production` (`https://api.impostr.live`). For local runs, create `frontend/.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:8100`; it overrides the production value and is not committed.

## Deploy

Live at **https://impostr.live**: website on Hostinger (Node.js), API on Render, MySQL on Hostinger. Step-by-step in [DEPLOY.md](DEPLOY.md).

## Tests

```bash
cd backend
.venv\Scripts\python -m pytest -q
```

101 tests: allowlist-first regression tests, engine unit tests, connector parsing on recorded store responses, and end-to-end API tests against MySQL. The API tests use a separate `brandshield_test` schema, dropped afterwards.

## Networks that inspect HTTPS

Some campus and corporate firewalls (for example FortiGate) re-sign HTTPS with their own certificate. The live store sources then fail with a certificate error and show as Unavailable. Get the firewall's CA certificate (PEM) from your network admin and set `CA_BUNDLE=path\to\ca.pem` in `backend/.env`. Certificate verification is never turned off.
