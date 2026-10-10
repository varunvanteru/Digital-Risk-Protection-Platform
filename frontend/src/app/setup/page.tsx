"use client";

import clsx from "clsx";
import { ArrowLeft, Check, ImageUp, LoaderCircle, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PlatformLabel } from "@/components/marks";
import { SeverityBadge } from "@/components/badges";
import { Button, Card, CardHeader, Hint, Input, Label, Mono, PageHeader, Select, Tag, Textarea } from "@/components/ui";
import { handleDisplay } from "@/lib/format";
import { api, mediaUrl } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { Platform, Severity } from "@/lib/types";

type DraftAccount = { platform: Platform; handle: string; status: "official" | "partner" };
type DraftApp = { platform: Platform; packageId: string; name: string };
import { SOCIAL_PLATFORMS, validateBrandName, validateDomain, validateHandle, validatePackageId } from "@/lib/validation";

const STEPS = ["Brand identity", "Official assets", "Review"];

// Mirrors the severity bands in backend/app/detection/scoring.py.
const SCORE_BANDS: { range: string; severity: Severity; outcome: string }[] = [
  { range: "80–100", severity: "critical", outcome: "Flagged; takedown recommended" },
  { range: "60–79", severity: "high", outcome: "Flagged; review today" },
  { range: "40–59", severity: "medium", outcome: "Flagged as a look-alike" },
  { range: "0–39", severity: "low", outcome: "Not flagged; shown only as a mention" },
];

function ScoreGuide() {
  return (
    <Card>
      <CardHeader title="How results are scored" description="Every app or page found gets a risk score from 0 to 100" />
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-[12px] text-ink-3">
            <th className="h-8 px-4 text-left font-medium">Score</th>
            <th className="h-8 px-2 text-left font-medium">Severity</th>
            <th className="h-8 px-4 text-left font-medium">What happens</th>
          </tr>
        </thead>
        <tbody>
          {SCORE_BANDS.map((b) => (
            <tr key={b.severity} className="border-t border-line align-top">
              <td className="tabular whitespace-nowrap px-4 py-2.5 font-medium text-ink">{b.range}</td>
              <td className="px-2 py-2.5">
                <SeverityBadge severity={b.severity} />
              </td>
              <td className="px-4 py-2.5 text-ink-2">{b.outcome}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line px-4 py-3 text-[12.5px] leading-relaxed text-ink-3">
        Assets you add here are never scored. Apps with only one warning sign, or that say they are fan or third-party apps, are held at 39.
      </p>
    </Card>
  );
}

function TagInput({
  id,
  values,
  onChange,
  placeholder,
  validate,
  mono,
}: {
  id: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  validate?: (v: string) => string | null;
  mono?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function commit() {
    const v = draft.trim().replace(/,$/, "");
    if (!v) return;
    const err = validate?.(v) ?? (values.some((x) => x.toLowerCase() === v.toLowerCase()) ? "Already added" : null);
    if (err) return setError(err);
    onChange([...values, v]);
    setDraft("");
    setError(null);
  }

  return (
    <div>
      <div
        className={clsx(
          "flex min-h-8 flex-wrap items-center gap-1.5 rounded-md border bg-surface px-1.5 py-1 focus-within:border-accent",
          error ? "border-crit" : "border-line-strong",
        )}
      >
        {values.map((v) => (
          <span key={v} className={clsx("inline-flex h-6 items-center gap-1 rounded bg-surface-2 pl-2 pr-1 text-[12.5px] text-ink", mono && "font-mono text-[12px]")}>
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="rounded p-0.5 text-ink-3 hover:text-ink">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={commit}
          placeholder={values.length ? "" : placeholder}
          className={clsx("h-6 min-w-24 flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-ink-3", mono && "font-mono")}
        />
      </div>
      {error ? <Hint error>{error}</Hint> : <Hint>Press Enter to add</Hint>}
    </div>
  );
}

export default function SetupPage() {
  const router = useRouter();
  const { brand: current, setBrand, runScan, sources, refresh } = useStore();
  // /setup?new=1 registers another brand; /setup edits the active one.
  const [isNew, setIsNew] = useState(false);
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);

  const [name, setName] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<DraftAccount[]>([]);
  const [apps, setApps] = useState<DraftApp[]>([]);
  const [publisher, setPublisher] = useState("");
  const [publisherAliases, setPublisherAliases] = useState<string[]>([]);
  const [legalName, setLegalName] = useState("");

  const [accPlatform, setAccPlatform] = useState<Platform>("instagram");
  const [accHandle, setAccHandle] = useState("");
  const [accError, setAccError] = useState<string | null>(null);
  const [appStore, setAppStore] = useState<Platform>("google_play");
  const [appId, setAppId] = useState("");
  const [appError, setAppError] = useState<string | null>(null);

  function loadSaved() {
    setName(current.name);
    setAliases(current.aliases.filter((a) => a !== current.name));
    setKeywords(current.keywords);
    setDescription(current.description);
    setLogo(mediaUrl(current.logoUrl) ?? null);
    setLogoFile(null);
    setDomains(current.domains);
    setAccounts(current.accounts.map((a) => ({ platform: a.platform, handle: a.handle, status: a.status })));
    setApps(current.apps.map((a) => ({ platform: a.platform, packageId: a.packageId, name: a.name })));
    setPublisher(current.publishers[0]?.name ?? "");
    setPublisherAliases(current.publishers[0]?.aliases ?? []);
    setLegalName(current.legalName ?? "");
  }

  useEffect(() => {
    const fresh = new URLSearchParams(window.location.search).get("new") === "1";
    setIsNew(fresh);
    if (!fresh) loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errors1 = {
    name: validateBrandName(name),
    description: description.trim().length < 50 ? `Add at least 50 characters (${description.trim().length} so far)` : null,
    logo: null as string | null, // optional: the verified official app icon is used when no logo is uploaded
  };
  const errors2 = {
    assets: accounts.length + apps.length === 0 ? "Add at least one official account or app" : null,
    publisher: apps.length && !publisher.trim() ? "Required when apps are listed" : null,
  };
  const stepValid = step === 0 ? !Object.values(errors1).some(Boolean) : step === 1 ? !Object.values(errors2).some(Boolean) : true;

  function next() {
    if (!stepValid) return setShowErrors(true);
    setShowErrors(false);
    setStep((s) => s + 1);
  }

  function onLogo(file: File | undefined) {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) return setLogoError("Use a PNG or JPG file");
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (img.width < 64 || img.height < 64) {
        setLogoError(`Image is ${img.width}×${img.height} px. Use at least 64×64 px.`);
        URL.revokeObjectURL(url);
      } else {
        setLogo(url);
        setLogoFile(file);
        setLogoError(null);
      }
    };
    img.src = url;
  }

  function addAccount() {
    const { handle, error } = validateHandle(accPlatform, accHandle, accounts);
    if (error) return setAccError(error);
    setAccounts((a) => [
      ...a,
      { platform: accPlatform, handle, status: "official" },
    ]);
    setAccHandle("");
    setAccError(null);
  }

  function addApp() {
    const err = validatePackageId(appId);
    if (err) return setAppError(err);
    if (apps.some((a) => a.packageId === appId.trim())) return setAppError("This app is already in the profile");
    setApps((a) => [...a, { platform: appStore, name: name || appId, packageId: appId.trim() }]);
    setAppId("");
    setAppError(null);
  }

  async function finish() {
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        name: name.trim(),
        legalName: legalName.trim() || undefined,
        aliases,
        keywords,
        domains,
        description: description.trim(),
        publisher: publisher.trim() || undefined,
        publisherAliases,
        accounts,
        apps,
      };
      let saved = isNew ? await api.createBrand(body) : await api.saveBrand(body);
      if (logoFile) saved = await api.uploadLogo(logoFile);
      setBrand(saved);
      await refresh();
      await runScan();
      router.push("/");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save the profile");
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Setup wizard"
        title={isNew ? "Add a brand" : `Edit ${current.name}`}
        description="Tell us what is genuinely yours. Everything you add here is on the allowlist, verified against the stores, and never flagged."
        actions={
          step < 2 &&
          !isNew && (
            <Button variant="ghost" onClick={loadSaved}>
              Reset to saved
            </Button>
          )
        }
      />

      <ol className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-2 text-[13px]" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              aria-current={i === step ? "step" : undefined}
              className={clsx(
                "tabular flex size-5 items-center justify-center rounded-full text-[11px] font-medium",
                i < step ? "bg-accent text-accent-ink" : i === step ? "border border-accent text-ink" : "border border-line-strong text-ink-3",
              )}
            >
              {i < step ? <Check className="size-3" strokeWidth={3} /> : i + 1}
            </span>
            <span className={i === step ? "font-medium text-ink" : "text-ink-3"}>{s}</span>
            {i < STEPS.length - 1 && <span className="mx-2 h-px w-8 bg-line-strong" />}
          </li>
        ))}
      </ol>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,48rem)_minmax(20rem,26rem)]">
      <Card>
        <div className="space-y-5 px-5 py-5">
          {step === 0 && (
            <>
              <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
                <div className="space-y-5">
                  <div>
                    <Label htmlFor="name">Brand name</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ZentraPay" invalid={showErrors && !!errors1.name} />
                    {showErrors && errors1.name && <Hint error>{errors1.name}</Hint>}
                  </div>
                  <div>
                    <Label htmlFor="aliases">Other names people use</Label>
                    <TagInput id="aliases" values={aliases} onChange={setAliases} placeholder="Zentra, Zentra Pay" />
                  </div>
                  <div>
                    <Label htmlFor="legal-name">Legal company name (optional)</Label>
                    <Input id="legal-name" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="ZentraPay Technologies Pvt Ltd" />
                    <Hint>Recognised in any spelling: &ldquo;Pvt. Ltd.&rdquo;, &ldquo;Private Limited&rdquo; and capitals are normalised</Hint>
                  </div>
                </div>
                <div>
                  <Label>Official logo</Label>
                  <label
                    className={clsx(
                      "flex size-[108px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-[12px] text-ink-3 hover:bg-surface-2",
                      (showErrors && errors1.logo) || logoError ? "border-crit" : "border-line-strong",
                    )}
                  >
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logo} alt="Uploaded logo" className="size-16 rounded-md object-contain" />
                    ) : (
                      <>
                        <ImageUp className="size-5" />
                        PNG or JPG
                      </>
                    )}
                    <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => onLogo(e.target.files?.[0])} />
                  </label>
                  {(logoError || (showErrors && errors1.logo)) && <Hint error>{logoError ?? errors1.logo}</Hint>}
                </div>
              </div>
              <div>
                <Label htmlFor="keywords">Search keywords</Label>
                <TagInput id="keywords" values={keywords} onChange={setKeywords} placeholder="zentra, zpay" />
              </div>
              <div>
                <Label htmlFor="description">Official description</Label>
                <Textarea
                  id="description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Paste the description from your official app listing"
                  className={showErrors && errors1.description ? "border-crit" : undefined}
                />
                {showErrors && errors1.description ? (
                  <Hint error>{errors1.description}</Hint>
                ) : (
                  <Hint>Used to catch copied bios and app descriptions</Hint>
                )}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <section>
                <h2 className="text-[13.5px] font-semibold">Social accounts</h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-[150px_1fr_auto]">
                  <Select aria-label="Platform" value={accPlatform} onChange={(e) => { setAccPlatform(e.target.value as Platform); setAccError(null); }}>
                    {SOCIAL_PLATFORMS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                  <Input
                    aria-label="Handle"
                    value={accHandle}
                    onChange={(e) => { setAccHandle(e.target.value); setAccError(null); }}
                    onKeyDown={(e) => e.key === "Enter" && addAccount()}
                    placeholder="@handle"
                    className="font-mono"
                    invalid={!!accError}
                  />
                  <Button onClick={addAccount}>
                    <Plus />
                    Add
                  </Button>
                </div>
                {accError && <Hint error>{accError}</Hint>}
                {accounts.length > 0 && (
                  <ul className="mt-3 divide-y divide-line rounded-md border border-line">
                    {accounts.map((a) => (
                      <li key={`${a.platform}:${a.handle}`} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="flex items-center gap-3">
                          <PlatformLabel platform={a.platform} />
                          <Mono className="text-ink">{handleDisplay(a.platform, a.handle)}</Mono>
                          {a.status === "partner" && <Tag>Partner</Tag>}
                        </span>
                        <button aria-label="Remove" onClick={() => setAccounts((l) => l.filter((x) => x !== a))} className="rounded p-1 text-ink-3 hover:text-ink">
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="border-t border-line pt-5">
                <h2 className="text-[13.5px] font-semibold">Mobile apps</h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-[150px_1fr_auto]">
                  <Select aria-label="Store" value={appStore} onChange={(e) => setAppStore(e.target.value as Platform)}>
                    <option value="google_play">Google Play</option>
                    <option value="app_store">App Store</option>
                  </Select>
                  <Input
                    aria-label="Package or App Store ID"
                    value={appId}
                    onChange={(e) => { setAppId(e.target.value); setAppError(null); }}
                    onKeyDown={(e) => e.key === "Enter" && addApp()}
                    placeholder={appStore === "google_play" ? "com.brand.app" : "id1234567890"}
                    className="font-mono"
                    invalid={!!appError}
                  />
                  <Button onClick={addApp}>
                    <Plus />
                    Add
                  </Button>
                </div>
                {appError && <Hint error>{appError}</Hint>}
                {apps.length > 0 && (
                  <ul className="mt-3 divide-y divide-line rounded-md border border-line">
                    {apps.map((a) => (
                      <li key={a.packageId} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="flex items-center gap-3">
                          <PlatformLabel platform={a.platform} />
                          <Mono className="text-ink">{a.packageId}</Mono>
                        </span>
                        <button aria-label="Remove" onClick={() => setApps((l) => l.filter((x) => x.packageId !== a.packageId))} className="rounded p-1 text-ink-3 hover:text-ink">
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4">
                  <Label htmlFor="publisher">Official publisher name</Label>
                  <Input id="publisher" value={publisher} onChange={(e) => setPublisher(e.target.value)} placeholder="ZentraPay Technologies Pvt Ltd" invalid={showErrors && !!errors2.publisher} />
                  {showErrors && errors2.publisher ? (
                    <Hint error>{errors2.publisher}</Hint>
                  ) : (
                    <Hint>Each app is then checked on its store; its developer account identifies your other official apps automatically</Hint>
                  )}
                </div>
                <div className="mt-4">
                  <Label htmlFor="publisher-aliases">Other publisher spellings (optional)</Label>
                  <TagInput id="publisher-aliases" values={publisherAliases} onChange={setPublisherAliases} placeholder="ZentraPay, ZENTRAPAY TECHNOLOGIES" />
                </div>
              </section>

              <section className="border-t border-line pt-5">
                <Label htmlFor="domains">Official domains</Label>
                <TagInput id="domains" values={domains} onChange={setDomains} placeholder="zentrapay.com" validate={validateDomain} mono />
              </section>

              {showErrors && errors2.assets && <Hint error>{errors2.assets}</Hint>}
            </>
          )}

          {step === 2 && (
            <div className="space-y-4 text-[13px]">
              <div className="flex items-center gap-4">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="" className="size-12 rounded-md object-contain" />
                ) : null}
                <div>
                  <div className="text-[16px] font-semibold">{name}</div>
                  <div className="text-ink-3">{[...aliases, ...keywords].join(" · ")}</div>
                </div>
              </div>
              <dl className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4 [&>div]:bg-surface [&>div]:px-3 [&>div]:py-2.5">
                {[
                  ["Social accounts", accounts.length],
                  ["Apps", apps.length],
                  ["Domains", domains.length],
                  ["Allowlisted in total", accounts.length + apps.length],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-[12px] text-ink-3">{k}</dt>
                    <dd className="tabular mt-0.5 text-[18px] font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="leading-relaxed text-ink-2">
                The scan searches {sources.length} sources for <span className="font-medium text-ink">{name}</span> and its aliases, skips the{" "}
                {accounts.length + apps.length} assets above, and scores everything else. It usually takes under a minute.
              </p>
            </div>
          )}
        </div>

        {saveError && (
          <p className="border-t border-line bg-crit-bg px-5 py-2.5 text-[13px] text-crit" role="alert">
            {saveError}
          </p>
        )}
        <footer className="flex items-center justify-between border-t border-line px-5 py-3">
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0 || saving}>
            <ArrowLeft />
            Back
          </Button>
          {step < 2 ? (
            <Button variant="primary" onClick={next}>
              Continue
            </Button>
          ) : (
            <Button variant="primary" onClick={finish} disabled={saving}>
              {saving && <LoaderCircle className="animate-spin" />}
              {saving ? "Saving" : "Save and run scan"}
            </Button>
          )}
        </footer>
      </Card>
      <aside className="xl:sticky xl:top-4">
        <ScoreGuide />
      </aside>
      </div>
    </>
  );
}
