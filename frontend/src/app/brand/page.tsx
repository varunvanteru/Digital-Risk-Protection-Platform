"use client";

import { Check, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { BrandMark, PlatformLabel } from "@/components/marks";
import { Button, ButtonLink, Card, CardHeader, Hint, Input, KeyValue, Label, Mono, PageHeader, Select, Tag } from "@/components/ui";
import { formatDateTime, handleDisplay } from "@/lib/format";
import { POSSIBLY_OFFICIAL } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import type { Platform } from "@/lib/types";
import { SOCIAL_PLATFORMS, validateHandle } from "@/lib/validation";

function AddAccount() {
  const { brand, addOfficialAccount } = useStore();
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [value, setValue] = useState("");
  const [kind, setKind] = useState<"official" | "partner">("official");
  const [touched, setTouched] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  const { handle, error } = validateHandle(platform, value, brand.accounts);
  const spec = SOCIAL_PLATFORMS.find((p) => p.value === platform)!;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (error) return;
    addOfficialAccount({
      platform,
      handle,
      canonicalId: `${platform}:${handle.toLowerCase()}`,
      displayName: brand.name,
      status: kind,
      verified: false,
    });
    setAdded(handleDisplay(platform, handle));
    setValue("");
    setTouched(false);
  }

  return (
    <form onSubmit={submit} className="border-t border-line bg-surface-2/40 px-4 py-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-[150px_1fr_130px_auto] sm:items-start">
        <div>
          <Label htmlFor="add-platform">Platform</Label>
          <Select id="add-platform" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
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
          <Button type="submit" variant="primary" className="w-full sm:w-auto">
            <Plus />
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
  const { brand, removeOfficialAccount } = useStore();

  return (
    <>
      <PageHeader
        title="Brand profile"
        description="Your legitimate assets. Every detector compares against this profile, and everything listed here is on the allowlist, so it is never flagged."
        actions={<ButtonLink href="/setup">Edit in wizard</ButtonLink>}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="Identity" description={`Last updated ${formatDateTime(brand.updatedAt)}`} />
            <div className="flex flex-col gap-6 px-4 py-4 sm:flex-row">
              <div className="flex shrink-0 flex-col items-center gap-2">
                <BrandMark size={72} />
                <span className="text-[11.5px] text-ink-3">Official logo</span>
              </div>
              <div className="min-w-0 flex-1">
                <KeyValue
                  items={[
                    { k: "Brand name", v: <span className="font-medium">{brand.name}</span> },
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
            <CardHeader title="Official social accounts" description={`${brand.accounts.length} accounts on the allowlist`} />
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
                          onClick={() => removeOfficialAccount(a.canonicalId)}
                          className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-crit"
                        >
                          <Trash2 className="size-3.5" />
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
            <CardHeader title="Official apps" description="Matched by package ID and developer ID, never by name" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead className="border-b border-line bg-surface-2/50 text-[12px] text-ink-3">
                  <tr>
                    <th className="h-9 px-4 text-left font-medium">Store</th>
                    <th className="h-9 px-4 text-left font-medium">App</th>
                    <th className="h-9 px-4 text-left font-medium">Package / ID</th>
                    <th className="h-9 px-4 text-left font-medium">Publisher</th>
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
                      <td className="px-4 py-2.5 text-ink-2">{a.publisher}</td>
                    </tr>
                  ))}
                  {POSSIBLY_OFFICIAL.map((a) => (
                    <tr key={a.packageId} className="bg-surface-2/50">
                      <td className="px-4 py-2.5">
                        <PlatformLabel platform={a.platform} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-ink">{a.name}</div>
                        <div className="text-[12px] text-ink-3">Same developer ID, not in profile. Not flagged.</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Mono>{a.packageId}</Mono>
                      </td>
                      <td className="px-4 py-2.5">
                        <Button size="sm">
                          <Plus />
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
            <CardHeader title="Official publishers" />
            <ul className="px-4 py-3 text-[13px]">
              {brand.publishers.map((p) => (
                <li key={p.id}>
                  <div className="text-ink">{p.name}</div>
                  <Mono className="text-ink-3">dev id {p.id}</Mono>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="How this profile is used" />
            <ul className="space-y-3 px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
              {[
                ["Name and aliases", "Reference for look-alike name matching"],
                ["Keywords", "Search queries sent to each source"],
                ["Logo", "Compared with avatars and app icons"],
                ["Description", "Compared with bios and app descriptions"],
                ["Accounts, apps, publishers", "Allowlist, checked by ID before scoring and before alerting"],
                ["Domains", "Links to other or look-alike domains raise the score"],
              ].map(([k, v]) => (
                <li key={k}>
                  <span className="font-medium text-ink">{k}</span>
                  <br />
                  {v}
                </li>
              ))}
            </ul>
          </Card>

          <div className="flex gap-2.5 rounded-lg border border-line bg-surface px-4 py-3 text-[12.5px] text-ink-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" />
            <p>
              <span className="font-medium text-ink">0 official assets flagged</span> in the last scan. Every asset above is
              also planted in the test data to prove it.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
