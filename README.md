# IMPOSTR: Digital Risk Protection for Social & App Monitoring

IMPOSTR finds fake social-media profiles, fake brand pages, scam accounts and look-alike mobile apps that impersonate a brand. It scores each one from 0 to 100 and explains every flag in plain words. The brand's own accounts and apps are recognised first and are never flagged.

Built for the ByteXL HackXlerate hackathon, Kampus.VC challenge: **Digital Risk Protection: Social & App Monitoring**.

## Submission

| Deliverable | Where |
| --- | --- |
| Working prototype | **https://impostr.live**, live and open to everyone (no login) |
| Demo video (6 min) | In the app: **https://impostr.live/how-to-use** (plays first). File: [`frontend/public/help/impostr-demo.mp4`](frontend/public/help/impostr-demo.mp4) |
| Architecture diagram | In the app under How to use → **Architecture**, and below: [`docs/architecture.png`](docs/architecture.png) |
| Step-by-step guide | How to use tab: 25 slides with screenshots of every feature |

**Try it in two minutes:** open https://impostr.live, wait a few seconds for the first scan, then open **Detections** and click the top row. In **Quick check**, search `PhonePe` (a real brand, searched live on Google Play and the App Store), then `Paytm` (an unregistered brand, which IMPOSTR offers to register from its real store apps).

## How it meets the challenge

| Criterion | What IMPOSTR does |
| --- | --- |
| **Brand Profile** (15%) | Three-step **Setup Brand Profile**: name, aliases, official logo, description, keywords, official social accounts, official apps, publisher and domains. Each official app is **validated on its store** (developer ID, store title, icon), and the profile drives every check: names for look-alike matching, the logo for image matching, the description for copied text, and the allowlist before any scoring. |
| **Social Media Monitoring** (30%) | Impersonation accounts, fake brand pages and scam profiles across 16 social and messaging platforms. Each is detected by look-alike name, copied logo (including mirrored and recoloured copies), copied bio, "official / helpline" claims and scam behaviour (OTP or fee requests, lures, moving to WhatsApp, new accounts). **Official accounts are never flagged.** |
| **App Store Monitoring** (30%) | Google Play and the App Store are **searched live**. It catches similar names, copied icons, a **different developer or publisher** (including fakes that copy the company name under another developer account) and resembling descriptions. The brand's official apps and their sibling apps are recognised by app ID, verified developer account and publisher, so **official apps are never flagged**. |
| **User Experience** (15%) | Setup in three steps, or register a brand straight from a search. Detections give plain-language reasons, a score breakdown and evidence checks, with actions to confirm, request a takedown, mark a false positive or mark official. **Unavailable sources are handled gracefully:** each source has its own timeout and retries, falls back to cached results, and otherwise shows as Down while the scan completes (try **Simulate outage** on Sources). Works on any phone and installs as an app. |
| **Look-alike names** (bonus) | Character swaps, missing or doubled letters, look-alike characters (`0`→`o`, `3`→`e`, Cyrillic letters), added words (`zentrapay_support_india`) and spacing changes (`zentra.pay`). It avoids over-flagging: ordinary words, other companies' names and openly labelled fan, news or third-party pages stay Low. |

**Measured accuracy** (Accuracy tab, recomputed live): 82 hand-labelled cases, including 11 held out from rule-writing. All **82 of 82 are correct**: precision 100%, recall 100%, and **0 of 19 official assets flagged**.

## Architecture

![IMPOSTR architecture](docs/architecture.png)

The pipeline is allowlist-first, in `frontend/src/server/services/scan.ts` and `services/search.ts`:

1. **Validate the profile.** Each official app is looked up on its store. Its developer account ID, store title and icon become a verified identity, cached for 24 hours.
2. **Collect candidates** from 20 sources in parallel, each with a 10-second timeout and 2 retries. A failed live store falls back to its last good results (shown as Cached). Any other failed source is shown as Down, and the scan carries on.
3. **Gate 1: exclude official assets before any scoring** (`detection/official.ts`):
   - **L1:** the exact official ID or handle.
   - **L2:** an official URL.
   - **L3:** a verified developer account.
   - **L4:** the official publisher name plus supporting details, with no contradicting developer ID.
   - **L5:** the same app on the other store.

   Anything official is reported with risk 0 and is never scored.
4. **Detection logic** for everything else:
   - **Signals:** look-alike name (`detection/lookalike.ts`), logo perceptual hash with a mirror check and colour histogram (`images.ts`), description similarity, claims, scam behaviour and publisher (`text.ts`, `signals.ts`).
   - **Score:** the signals are weighted and fixed boosts added, giving 0 to 100 (`scoring.ts`).
   - **Cap at 39:** a single strong signal on its own, or an openly labelled fan, news or third-party page, is held at 39.
5. **Gate 2:** the allowlist is re-checked in the database just before a detection is saved.

No brand is hard-coded: brands are data, and the same rules apply to every brand.

**Storage** (MySQL / MariaDB, 9 tables, created automatically on first start):

| Tables | What they hold |
| --- | --- |
| `brands`, `official_assets`, `publishers` | The brand profile and allowlist |
| `detections`, `detection_events` | Scored detections and their status history |
| `scans`, `sources`, `source_cache` | Scan runs, source health, and the last good live results |
| `media_files` | Logos and icons |

**Sources:**

| Source | Mode |
| --- | --- |
| Google Play | Live (`google-play-scraper`) |
| Apple App Store | Live (iTunes Search API) |
| 16 social platforms (Instagram, Facebook, WhatsApp, X, Threads, LinkedIn, Telegram, Snapchat, YouTube, ShareChat, Moj, Josh, Pinterest, Reddit, Quora, Discord), APK mirror sites, store snapshot | Curated sample data: these platforms have no open search API. Results are tagged **SAMPLE** in the app. |

**Private workspaces.** There are no accounts. Each browser gets its own workspace through an HTTP-only cookie, starting with two demo brands: **ZentraPay**, a fictional payments app, and **PhonePe**. Anything a visitor registers, scans or marks is visible only in their own browser.

## Tech stack

| Part | Where | Stack |
| --- | --- | --- |
| Web app and API | `frontend/` (screens in `src/app`, engine in `src/server`, served at `/api`) | Next.js 15, React 19, TypeScript, Tailwind CSS, sharp, mysql2 |
| Database | Hostinger MariaDB (MySQL 8 locally) | |
| Reference engine | `backend/` | Python 3.11, FastAPI. Gives the same result on every labelled case. |
| Hosting | Hostinger Node.js app, auto-deployed from this repo's `main` branch | |

## Run locally

```bash
cd frontend
npm install
# frontend/.env.local (not committed):
#   MYSQL_HOST=localhost  MYSQL_PORT=3306  MYSQL_USER=root  MYSQL_PASSWORD=...  MYSQL_DB=brandshield
npm run dev                       # http://localhost:3000
```

On first start the app creates the database tables, seeds the demo brands and runs a scan. Deployment steps are in [`DEPLOY.md`](DEPLOY.md).

## Tests

```bash
cd frontend && npm test           # 110 tests (Vitest)
cd backend && python -m pytest -q # 104 tests (Python reference engine)
```

The tests cover:
- engine unit tests and allowlist-first regression tests;
- connector parsing on recorded store responses;
- end-to-end API tests against MySQL;
- a parity check, `frontend/scripts/parity.ts`, which runs all 82 labelled cases through both engines and compares every row.

## Security

No credentials are stored in the repository. The database settings come from environment variables (hPanel on Hostinger, `.env.local` locally), and `.env` files are ignored by git.
