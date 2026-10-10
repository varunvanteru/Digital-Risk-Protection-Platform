/** Database rows to the JSON shapes the frontend uses (camelCase, ISO dates in UTC). Port of serializers.py. */

import { bool, js } from "./db";
import { scoreDetection } from "./detection/scoring";
import type { Asset, Brand } from "./repo";
import { iso } from "./util";

const assetOut = (a: Asset) => ({
  id: a.id, platform: a.platform, handle: a.handle, canonicalId: a.canonicalId,
  displayName: a.displayName, status: a.status, verified: a.verified,
});

const appOut = (a: Asset) => ({
  id: a.id, platform: a.platform, name: a.displayName, packageId: a.handle, publisher: a.publisher || "",
  publisherId: a.publisherId || "", storeTitle: a.storeTitle, iconUrl: a.iconUrl, validatedAt: iso(a.validatedAt),
  validationStatus: a.validationStatus, validationNote: a.validationNote,
});

export function brandOut(b: Brand) {
  return {
    id: b.id,
    name: b.name,
    aliases: [b.name, ...b.aliases.filter((a) => a !== b.name)],
    keywords: b.keywords,
    domains: b.domains,
    description: b.description,
    logoUrl: b.logoPath,
    legalName: b.legalName,
    isActive: b.isActive,
    publishers: b.publishers.map((p) => ({ name: p.name, id: p.publisherId, aliases: p.aliases ?? [] })),
    accounts: b.assets.filter((a) => a.kind === "social").map(assetOut),
    apps: b.assets.filter((a) => a.kind === "app").map(appOut),
    updatedAt: iso(b.updatedAt),
  };
}

export const brandSummary = (b: Brand) => ({
  id: b.id,
  name: b.name,
  logoUrl: b.logoPath,
  isActive: b.isActive,
  accounts: b.assets.filter((a) => a.kind === "social").length,
  apps: b.assets.filter((a) => a.kind === "app").length,
});

/* eslint-disable @typescript-eslint/no-explicit-any */
export function detectionOut(d: any) {
  const signals = js<Record<string, number>>(d.signals, {});
  const bd = scoreDetection(d.channel, signals, bool(d.lookalike_domain), d.context_label, Number(d.feedback_penalty));
  return {
    id: d.id,
    sourceId: d.source_id,
    channel: d.channel,
    platform: d.platform,
    cls: d.cls,
    displayName: d.display_name,
    handle: d.handle,
    url: d.url,
    mark: d.mark,
    iconUrl: d.icon_url,
    bio: d.bio,
    audience: d.audience,
    createdAt: iso(d.created_on),
    publisher: d.publisher,
    publisherId: d.publisher_id,
    links: js(d.links, []),
    firstSeen: iso(d.first_seen),
    lastSeen: iso(d.last_seen),
    scanId: d.scan_id,
    signals,
    reasons: js(d.reasons, []),
    lookalikeDomain: bool(d.lookalike_domain),
    contextLabel: d.context_label,
    status: d.status,
    verdict: bd.severity === "critical" || bd.severity === "high" ? "SUSPICIOUS" : bd.severity === "medium" ? "LOOKALIKE" : "MENTION",
    checks: js(d.checks, {}),
    breakdown: bd,
  };
}

export function sourceOut(s: any) {
  return {
    id: s.id,
    name: s.name,
    platform: s.platform,
    channel: s.channel,
    mode: s.mode,
    health: s.health,
    lastSuccess: iso(s.last_success),
    latencyMs: s.latency_ms,
    itemsLastScan: s.items_last_scan,
    note: s.note,
    simulateOutage: bool(s.simulate_outage),
    // live | cached | simulated | down. Datasets are always reported as simulated, never live.
    state: s.state || (s.health === "unavailable" ? "down" : s.mode !== "live" ? "simulated" : "live"),
  };
}

export function scanOut(s: any) {
  if (!s) return null;
  const st = js<Record<string, any>>(s.source_status, {});
  return {
    id: s.id,
    status: s.status,
    startedAt: iso(s.started_at),
    finishedAt: iso(s.finished_at),
    candidates: s.candidates,
    officialSkipped: s.official_skipped,
    officialFlagged: s.official_flagged,
    newDetections: s.new_detections,
    sources: st.sources ?? {},
    possiblyOfficial: st.possiblyOfficial ?? [],
    officialFound: st.officialFound ?? [],
    validation: st.validation ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
