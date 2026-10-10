# BrandShield: Digital Risk Protection

Finds social-media profiles, brand pages and mobile apps that impersonate a registered brand, scores each one 0 to 100, and explains every flag. Official assets are allowlisted by ID and are never flagged.

Built for the Bytexl hackathon (Kampus.VC problem statement: Social & App Monitoring).

## Architecture

| Part | Stack | Port |
| --- | --- | --- |
| Frontend | Next.js 15, TypeScript, Tailwind | 3100 (prod) / 3000 (dev) |
| Backend | FastAPI, SQLAlchemy, Python 3.11 | 8100 |
| Database | MySQL 8, schema `brandshield` (created automatically) | 3306 |

**Scan pipeline** (`backend/app/services/scan.py`): each source is fetched with a timeout and retries, then:

1. Gate 1 drops allowlisted IDs and apps from an official developer ID.
2. Signals are computed: look-alike name, logo similarity (pHash on real pixels, mirror-aware), description similarity, impersonation claims, scam behaviour or app risk context, publisher mismatch.
3. Gate 2 re-checks the allowlist in the database, then the detection is stored.

A failing source is recorded and skipped; the scan always finishes.

**Sources**

| Source | Mode |
| --- | --- |
| Google Play | Live (`google-play-scraper`) |
| Apple App Store | Live (iTunes Search API) |
| Instagram, X, Facebook, Telegram | Curated dataset (no open APIs) |
| APK mirror sites | Curated dataset |
| Store snapshot (demo brand) | Curated dataset; the demo brand ZentraPay is fictional, so live stores have no fakes of it |

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

Set `NEXT_PUBLIC_API_URL` if the API runs elsewhere.

## Tests

```bash
cd backend
.venv\Scripts\python -m pytest -q
```

38 tests: engine unit tests, connector parsing on recorded store responses, and end-to-end API tests against MySQL. The API tests use a separate `brandshield_test` schema, dropped afterwards.

## Networks that inspect HTTPS

Some campus and corporate firewalls (for example FortiGate) re-sign HTTPS with their own certificate. The live store sources then fail with a certificate error and show as Unavailable. Get the firewall's CA certificate (PEM) from your network admin and set `CA_BUNDLE=path\to\ca.pem` in `backend/.env`. Certificate verification is never turned off.
