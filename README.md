# BrandShield: Digital Risk Protection

Finds social-media profiles, brand pages and mobile apps that impersonate a registered brand, scores each one 0 to 100, and explains every flag. Official assets are allowlisted by ID and are never flagged.

Built for the Bytexl hackathon (Kampus.VC problem statement: Social & App Monitoring).

## What's in this version

The frontend prototype (`frontend/`), running on a demo dataset for the fictional brand **ZentraPay**:

| Page | What it shows |
| --- | --- |
| Overview | Open detections by severity, new detections per day, per-source health, items needing attention |
| Detections | Filterable, sortable list across social and app sources |
| Detection detail | Reasons, side-by-side comparison with the official asset, score breakdown, analyst actions |
| Quick check | Live look-alike name analysis (homoglyphs, swaps, added words, spacing) with over-flagging guards |
| Brand profile | Official accounts, apps, publishers and domains, with validated add/remove |
| Sources | Source health, and a simulated outage to show graceful degradation |
| Setup wizard | 3-step brand onboarding with validation |

Scoring (`frontend/src/lib/scoring.ts`) and look-alike detection (`frontend/src/lib/lookalike.ts`) are real implementations of the design doc, not hard-coded values.

## Run locally

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

## Next

- FastAPI backend with the detection engine, live Google Play and App Store connectors, and logo similarity (pHash + CLIP)
- Database for brands, scans, candidates and detections
