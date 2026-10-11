"use client";

import { BookOpen, Building2, Check, CircleAlert, CircleX, Fingerprint, LoaderCircle, Plus, RefreshCw, ShieldCheck, Smartphone, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { BrandMark, PlatformLabel } from "@/components/marks";
import { Button, ButtonLink, Card, CardHeader, Hint, Input, KeyValue, Label, Mono, Orb, PageHeader, Select, StepOrb, Tag } from "@/components/ui";
import { api, mediaUrl } from "@/lib/api";
import { formatDateTime, handleDisplay } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { OfficialApp, Platform } from "@/lib/types";
import { SOCIAL_PLATFORMS, validateHandle } from "@/lib/validation";

function AddAccount() {
  const { brand, setBrand, refresh } = useStore();
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [value, setValue] = useState("");
  const [kind, setKind] = useState<"official" | "partner">("official");
  const [touched, setTouched] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const { handle, error: clientError } = validateHandle(platform, value, brand.accounts);
  const error = serverError ?? clientError;
  const spec = SOCIAL_PLATFORMS.find((p) => p.value === platform)!;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (clientError) return;
    setSaving(true);
    try {
      setBrand(await api.addAccount({ platform, handle, status: kind }));
      await refresh(); // an allowlisted account drops out of detections
      setAdded(handleDisplay(platform, handle));
      setValue("");
      setTouched(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Could not add the account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="border-t border-line bg-surface-2/40 px-4 py-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-[150px_1fr_130px_auto] sm:items-start">
        <div>
          <Label htmlFor="add-platform">Platform</Label>
          <Select id="add-platform" value={platform} onChange={(e) => { setPlatform(e.target.value as Platform); setServerError(null); }}>
            {SOCIAL_PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="add-handle">Handle</Label>
          <Input
            id="add-handle"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setAdded(null);
              setServerError(null);
            }}
            onBlur={() => value && setTouched(true)}
            placeholder={platform === "facebook" ? "zentrapay" : "@zentrapay"}
            invalid={touched && !!error}
            className="font-mono"
            aria-describedby="add-handle-hint"
          />
          <div id="add-handle-hint">
            {touched && error ? <Hint error>{error}</Hint> : <Hint>{spec.rule}</Hint>}
          </div>
        </div>
        <div>
          <Label htmlFor="add-kind">Type</Label>
          <Select id="add-kind" value={kind} onChange={(e) => setKind(e.target.value as "official" | "partner")}>
            <option value="official">Official</option>
            <option value="partner">Partner</option>
          </Select>
        </div>
        <div className="sm:pt-[22px]">
          <Button type="submit" variant="primary" className="w-full sm:w-auto" disabled={saving}>
            {saving ? <LoaderCircle className="animate-spin" /> : <Plus />}
            Add to allowlist
          </Button>
        </div>
      </div>
      {added && (
        <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-ok" role="status">
          <Check className="size-3.5" />
          {added} added. It will be skipped from the next scan onwards.
        </p>
      )}
    </form>
  );
}

export default function BrandPage() {
  const { brand, setBrand, refresh, lastScan } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const possiblyOfficial = (lastScan?.possiblyOfficial ?? []).filter((p) => !brand.apps.some((a) => a.packageId === p.packageId));

  async function run(key: string, fn: () => Promise<typeof brand>) {
    setBusy(key);
    setError(null);
    try {
      setBrand(await fn());
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Allowlist"
        title="Brand profile"
        description="Your legitimate assets. Every detector compares against this profile, and everything listed here is on the allowlist, so it is never flagged."
        actions={<ButtonLink href="/setup">Edit in Setup</ButtonLink>}
      />

      {error && (
        <p className="mb-4 rounded-md border border-line bg-crit-bg px-3 py-2 text-[13px] text-crit" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader icon={<Fingerprint />} title="Identity" description={`Last updated ${formatDateTime(brand.updatedAt)}`} />
            <div className="flex flex-col gap-6 px-4 py-4 sm:flex-row">
              <div className="flex shrink-0 flex-col items-center gap-2">
                <BrandMark size={72} src={mediaUrl(brand.logoUrl)} />
                <span className="text-[11.5px] text-ink-3">Official logo</span>
              </div>
              <div className="min-w-0 flex-1">
                <KeyValue
                  items={[
                    { k: "Brand name", v: <span className="font-medium">{brand.name}</span> },
                    ...(brand.legalName ? [{ k: "Legal name", v: brand.legalName }] : []),
                    { k: "Aliases", v: <div className="flex flex-wrap gap-1.5">{brand.aliases.map((a) => <Tag key={a}>{a}</Tag>)}</div> },
                    { k: "Search keywords", v: <div className="flex flex-wrap gap-1.5">{brand.keywords.map((a) => <Tag key={a}>{a}</Tag>)}</div> },
                    { k: "Official domains", v: <div className="flex flex-wrap gap-x-3 gap-y-1">{brand.domains.map((d) => <Mono key={d}>{d}</Mono>)}</div> },
                    { k: "Description", v: <span className="leading-relaxed text-ink-2">{brand.description}</span> },
                  ]}
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader icon={<Users />} title="Official social accounts" description={`${brand.accounts.length} accounts on the allowlist`} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead className="border-b border-line bg-surface-2/50 text-[12px] text-ink-3">
                  <tr>
                    <th className="h-9 px-4 text-left font-medium">Platform</th>
                    <th className="h-9 px-4 text-left font-medium">Handle</th>
                    <th className="h-9 px-4 text-left font-medium">Canonical ID</th>
                    <th className="h-9 px-4 text-left font-medium">Type</th>
                    <th className="h-9 w-12 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {brand.accounts.map((a) => (
                    <tr key={a.canonicalId} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5">
                        <PlatformLabel platform={a.platform} />
                      </td>
                      <td className="px-4 py-2.5">
                        <Mono className="text-ink">{handleDisplay(a.platform, a.handle)}</Mono>
                        {a.verified && <span className="ml-2 text-[11.5px] text-ink-3">Verified</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <Mono className="text-ink-3">{a.canonicalId}</Mono>
                      </td>
                      <td className="px-4 py-2.5 text-ink-2">{a.status === "official" ? "Official" : "Partner"}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          aria-label={`Remove ${a.handle}`}
                          disabled={busy !== null}
                          onClick={() => run(`rm-${a.id}`, () => api.removeAccount(a.id))}
                          className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-crit disabled:opacity-50"
                        >
                          {busy === `rm-${a.id}` ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AddAccount />
          </Card>

          <Card id="apps">
            <CardHeader
              icon={<Smartphone />}
              title="Official apps"
              description="Validated on each store. The developer account behind them identifies official variants; names alone never do."
              actions={
                <Button size="sm" onClick={() => run("validate", async () => (await api.validateBrand()).brand)} disabled={busy !== null}>
                  {busy === "validate" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                  Validate now
                </Button>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead className="border-b border-line bg-surface-2/50 text-[12px] text-ink-3">
                  <tr>
                    <th className="h-9 px-4 text-left font-medium">Store</th>
                    <th className="h-9 px-4 text-left font-medium">App</th>
                    <th className="h-9 px-4 text-left font-medium">Package / ID</th>
                    <th className="h-9 px-4 text-left font-medium">Publisher</th>
                    <th className="h-9 px-4 text-left font-medium">Store check</th>
                  </tr>
                </thead>
                <tbody>
                  {brand.apps.map((a) => (
                    <tr key={a.packageId} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5">
                        <PlatformLabel platform={a.platform} />
                      </td>
                      <td className="px-4 py-2.5 text-ink">{a.name}</td>
                      <td className="px-4 py-2.5">
                        <Mono>{a.packageId}</Mono>
                      </td>
                      <td className="px-4 py-2.5 text-ink-2">
                        {a.publisher}
                        {a.publisherId && <div className="font-mono text-[11px] text-ink-3">developer {a.publisherId}</div>}
                      </td>
                      <td className="px-4 py-2.5">
                        <ValidationBadge app={a} />
                      </td>
                    </tr>
                  ))}
                  {possiblyOfficial.map((a) => (
                    <tr key={a.packageId} className="bg-surface-2/50">
                      <td className="px-4 py-2.5">
                        <PlatformLabel platform={a.platform} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-ink">{a.name}</div>
                        <div className="text-[12px] text-ink-3">{a.status === "LIKELY_OFFICIAL" ? "Likely official (publisher matches)" : "Verified official (same developer account)"}, not in profile. Not flagged.</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Mono>{a.packageId}</Mono>
                      </td>
                      <td className="px-4 py-2.5">
                        <Button
                          size="sm"
                          disabled={busy !== null}
                          onClick={() =>
                            run(`app-${a.packageId}`, () =>
                              api.addApp({ platform: a.platform, packageId: a.packageId, name: a.name, publisher: a.publisher, publisherId: a.publisherId }),
                            )
                          }
                        >
                          {busy === `app-${a.packageId}` ? <LoaderCircle className="animate-spin" /> : <Plus />}
                          Add
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader icon={<Building2 />} title="Official publishers" />
            <ul className="px-4 py-3 text-[13px]">
              {brand.publishers.map((p) => (
                <li key={p.name}>
                  <div className="text-ink">{p.name}</div>
                  {p.aliases.length > 0 && <div className="text-[12px] text-ink-3">Also: {p.aliases.join(", ")}</div>}
                  {p.id && <Mono className="text-ink-3">dev id {p.id}</Mono>}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader icon={<BookOpen />} title="How this profile is used" />
            <ul className="space-y-3.5 px-4 py-4 text-[12.5px] leading-relaxed text-ink-2">
              {[
                ["Name and aliases", "Reference for look-alike name matching"],
                ["Keywords", "Search queries sent to each source"],
                ["Logo", "Compared with avatars and app icons"],
                ["Description", "Compared with bios and app descriptions"],
                ["Accounts, apps, publishers", "Allowlist, checked by ID before scoring and before alerting"],
                ["Domains", "Links to other or look-alike domains raise the score"],
              ].map(([k, v], i) => (
                <li key={k} className="flex items-start gap-3">
                  <StepOrb n={i + 1} size="sm" />
                  <span className="pt-0.5">
                    <span className="font-medium text-ink">{k}</span>
                    <br />
                    {v}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="flex items-center gap-3 px-4 py-3 text-[12.5px] text-ink-2">
            <Orb size="sm" tone="ok">
              <ShieldCheck />
            </Orb>
            <p>
              <span className="font-medium text-ink">{lastScan?.officialFlagged ?? 0} official assets flagged</span> in the last scan. Every asset above is
              also planted in the test data to prove it.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}

function ValidationBadge({ app }: { app: OfficialApp }) {
  if (app.validationStatus === "verified") {
    return (
      <div className="text-[12px]">
        <span className="inline-flex items-center gap-1 font-medium text-ok">
          <Check className="size-3.5" /> Verified
        </span>
        {app.storeTitle && <div className="max-w-[220px] truncate text-ink-3">{app.storeTitle}</div>}
        {app.validatedAt && <div className="text-ink-3">{formatDateTime(app.validatedAt)}</div>}
      </div>
    );
  }
  if (app.validationStatus === "not_found") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-crit" title={app.validationNote ?? undefined}>
        <CircleX className="size-3.5" /> Not on the store
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-high" title={app.validationNote ?? undefined}>
      <CircleAlert className="size-3.5" /> {app.validationStatus === "unavailable" ? "Store unreachable" : "Not checked yet"}
    </span>
  );
}