/**
 * Accuracy on the labelled test set (data/labelled_cases.json). Port of evaluation.py.
 *
 * Every case goes through the same evaluate() used by scans and Quick check:
 * official verification first, then signals and scoring. Brand profiles come from
 * the labelled file, not the database, so results are reproducible.
 *
 * A case counts as FLAGGED when it is not excluded as official and scores Medium
 * or above (>= 40). Positive class = fake.
 */

import fs from "node:fs";
import path from "node:path";
import { settings } from "./config";
import { candidate, type Candidate } from "./connectors/base";
import { SocialDataset, StoreDataset } from "./connectors/datasets";
import { DEMO_LOGO } from "./demoAssets";
import { allowKey, emptyContext, type BrandContext } from "./detection/context";
import { normalizePublisher, packageNamespace } from "./detection/official";
import { evaluate, excluded } from "./detection/signals";
import { CONNECTORS } from "./services/scan";
import { pyRound, unique } from "./util";

const FLAG_SEVERITIES = new Set(["critical", "high", "medium"]);

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Brand context from a labelled-file profile (also used by the tests). */
export function context(b: any): BrandContext {
  const byPlatform = new Map<string, Set<string>>();
  for (const a of b.apps) {
    if (a.publisherId) {
      if (!byPlatform.has(a.platform)) byPlatform.set(a.platform, new Set());
      byPlatform.get(a.platform)!.add(a.publisherId);
    }
  }
  const names = new Set<string>(b.publishers.map((p: any) => normalizePublisher(p.name)));
  for (const p of b.publishers) for (const x of p.aliases ?? []) names.add(normalizePublisher(x));
  for (const a of b.apps) names.add(normalizePublisher(a.publisher));
  names.delete("");
  return emptyContext({
    brandId: `eval_${b.name.toLowerCase()}`,
    name: b.name,
    aliases: unique([b.name, ...b.aliases]),
    domains: b.domains,
    description: b.description,
    logoRef: b.logo === "demo" ? `/media/${DEMO_LOGO}` : null,
    publisherNames: names,
    allowlist: new Set([
      ...b.apps.map((a: any) => allowKey(a.platform, a.id.toLowerCase())),
      ...b.accounts.map((s: any) => allowKey(s.platform, s.handle.toLowerCase())),
    ]),
    publisherIdsByPlatform: byPlatform,
    officialNamespaces: new Set(
      b.apps.filter((a: any) => a.platform === "google_play").map((a: any) => packageNamespace(a.id)).filter(Boolean),
    ),
  });
}

function inlineCandidate(c: any): Candidate {
  return candidate({
    sourceId: "eval",
    channel: c.channel,
    platform: c.platform,
    identifier: c.handle.toLowerCase(),
    handle: c.handle,
    displayName: c.display_name,
    url: "",
    bio: c.bio ?? "",
    audience: c.audience ?? 0,
    createdOn: c.created_at ?? null,
    publisher: c.publisher ?? null,
    publisherId: c.publisher_id ?? null,
    links: c.links ?? [],
    privacyUrl: c.privacy_url ?? null,
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** All curated rows a search for the brand returns, keyed "platform:identifier". */
async function datasetCandidates(keywords: string[]): Promise<Map<string, Candidate>> {
  const out = new Map<string, Candidate>();
  for (const conn of Object.values(CONNECTORS)) {
    if (conn instanceof SocialDataset || conn instanceof StoreDataset) {
      for (const c of await conn.fetch(keywords)) out.set(`${c.platform}:${c.identifier}`, c);
    }
  }
  return out;
}

export async function runEvaluation() {
  const data = JSON.parse(fs.readFileSync(path.join(settings.dataDir, "labelled_cases.json"), "utf8"));
  const today: string = data.today;
  const profiles: Record<string, unknown> = Object.fromEntries(data.brands.map((b: { name: string }) => [b.name, b]));
  const contexts = new Map(Object.entries(profiles).map(([name, b]) => [name, context(b)]));

  // brand, label, group, candidate (null = search did not return it)
  const items: [string, string, string, Candidate | null][] = [];
  const labels = data.dataset_labels;
  const brandProfile = profiles[labels.brand] as { keywords: string[] };
  const found = await datasetCandidates([...brandProfile.keywords, labels.brand]);
  for (const label of ["official", "fake", "mention", "unrelated"]) {
    for (const key of labels[label]) items.push([labels.brand, label, `Curated dataset: ${label}`, found.get(key) ?? null]);
  }
  for (const c of data.cases) items.push([c.brand, c.label, c.group, inlineCandidate(c)]);

  const rows: Record<string, unknown>[] = [];
  let tp = 0, fp = 0, fn = 0, tn = 0;
  let officialTested = 0, officialRecognised = 0, officialFlagged = 0;
  for (const [brand, label, group, cand] of items) {
    const ctx = contexts.get(brand)!;
    let outcome: string, status: string, score: number, severity: string | null, reason: string, isExcluded: boolean;
    let platform = "-", name = "-", handle = "-";
    if (cand === null) {
      // The platform search never surfaced it, so it cannot be flagged.
      [outcome, status, score, severity, reason, isExcluded] = ["NOT RETURNED", "UNRELATED", 0, null, "Not returned by the search", false];
    } else {
      const ev = await evaluate(cand, ctx, today);
      isExcluded = excluded(ev);
      [platform, name, handle, status, reason] = [cand.platform, cand.displayName, cand.handle, ev.status, ev.reasons[0] ?? ""];
      if (isExcluded) {
        [outcome, score, severity] = [ev.status, 0, null];
      } else {
        [score, severity] = [ev.breakdown!.score, ev.breakdown!.severity];
        outcome = FLAG_SEVERITIES.has(severity) ? "FLAGGED" : "NOT FLAGGED";
      }
    }
    const flagged = outcome === "FLAGGED";
    const fake = label === "fake";
    if (fake && flagged) tp++;
    else if (fake) fn++;
    else if (flagged) fp++;
    else tn++;
    if (label === "official") {
      officialTested++;
      if (isExcluded) officialRecognised++;
      if (flagged) officialFlagged++;
    }
    rows.push({
      brand, label, group, platform, name, handle, outcome, status, score, severity,
      correct: (fake && flagged) || (!fake && !flagged), reason,
    });
  }
  const precision = tp + fp ? tp / (tp + fp) : 1.0;
  const recall = tp + fn ? tp / (tp + fn) : 1.0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0.0;
  const byBrand: Record<string, { cases: number; correct: number }> = {};
  for (const b of contexts.keys()) {
    const rs = rows.filter((r) => r.brand === b);
    byBrand[b] = { cases: rs.length, correct: rs.filter((r) => r.correct).length };
  }
  return {
    cases: rows.length,
    truePositives: tp, falsePositives: fp, falseNegatives: fn, trueNegatives: tn,
    precision: pyRound(precision, 3), recall: pyRound(recall, 3), f1: pyRound(f1, 3),
    officialTested, officialRecognised, officialFlagged,
    mentionsFlagged: rows.filter((r) => (r.label === "mention" || r.label === "unrelated") && r.outcome === "FLAGGED").length,
    byBrand,
    rows,
    definition: "Flagged = not verified official and risk score >= 40 (Medium or above). Positive class = fake.",
  };
}
