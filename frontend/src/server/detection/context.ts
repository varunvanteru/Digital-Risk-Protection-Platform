/** What the engine knows is genuinely the brand's (BrandContext in signals.py). */

export interface BrandContext {
  brandId: string;
  name: string;
  aliases: string[];
  domains: string[];
  description: string;
  logoRef: string | null;
  publisherIds: Set<string>; // developer IDs not tied to one store
  publisherNames: Set<string>; // normalised (official.normalizePublisher)
  allowlist: Set<string>; // "platform|identifier"
  publisherIdsByPlatform: Map<string, Set<string>>;
  officialNamespaces: Set<string>;
  officialIcons: string[];
  officialTitles: Set<string>; // normalised store titles of verified official apps
}

export function emptyContext(fields: Partial<BrandContext> & Pick<BrandContext, "brandId" | "name" | "aliases">): BrandContext {
  return {
    domains: [],
    description: "",
    logoRef: null,
    publisherIds: new Set(),
    publisherNames: new Set(),
    allowlist: new Set(),
    publisherIdsByPlatform: new Map(),
    officialNamespaces: new Set(),
    officialIcons: [],
    officialTitles: new Set(),
    ...fields,
  };
}

export const allowKey = (platform: string, identifier: string) => `${platform}|${identifier}`;

export function cores(ctx: BrandContext): string[] {
  return ctx.aliases.map((a) => a.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

export function publisherIdsFor(ctx: BrandContext, platform: string): Set<string> {
  return new Set([...(ctx.publisherIdsByPlatform.get(platform) ?? []), ...ctx.publisherIds]);
}

export function hasPublisherInfo(ctx: BrandContext, platform: string): boolean {
  return publisherIdsFor(ctx, platform).size > 0 || ctx.publisherNames.size > 0;
}
