import type { Briefing } from "./model";
import { inferState } from "./model";

/**
 * LOCAL DESIGN FIXTURES. Not real briefings.
 *
 * Production has zero published rows today, so the populated layout cannot be reviewed on the
 * preview. These samples exist only so a reviewer can see the populated layout on a local
 * machine (`STOREFRONT_FIXTURES=1 npm run dev`, or `=empty` for the zero-row state). They are refused on Vercel and in any
 * production build, and every page that shows them carries a "Sample data" banner.
 */
export function fixturesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const mode = env.STOREFRONT_FIXTURES;
  return (mode === "1" || mode === "empty") && env.VERCEL !== "1" && env.NODE_ENV !== "production";
}

/** `STOREFRONT_FIXTURES=empty` previews the zero-published state (what production shows today). */
export function fixtureRows(env: Record<string, string | undefined> = process.env): Briefing[] {
  return env.STOREFRONT_FIXTURES === "empty" ? [] : FIXTURES;
}

const base = {
  contents: [] as string[],
  themes: [] as string[],
  entityId: null as string | null,
  version: 1,
  lastRefreshed: null as string | null,
};

const src = (n: number, title: string) => ({
  n,
  title,
  publisher: "Sample Publisher",
  date: "2026-10-12",
  url: "https://example.com/sample",
});

const make = (b: Omit<Briefing, "state" | keyof typeof base> & Partial<typeof base>): Briefing => ({
  ...base,
  ...b,
  state: inferState(b.title),
});

export const FIXTURES: Briefing[] = [
  make({
    id: "00000000-0000-4000-8000-000000000001",
    title: "Sample — The Power Architecture of the Buildout",
    tier: "deep",
    typeLabel: "Theater Briefing",
    byline: "Mach",
    hypothesis:
      "Sample text. Interconnection, not land or capital, is now the binding constraint on new capacity, and the jurisdictions that clear queues fastest will set the pace of the next cycle.",
    contents: ["The argument", "At a glance", "Interconnection queues", "Large-load tariffs", "Signal register", "Sources & methodology"],
    sources: [src(1, "Sample source one"), src(2, "Sample source two"), src(3, "Sample source three")],
    pageTarget: 12,
    publishedAt: "2026-11-04T15:00:00Z",
    lastRefreshed: "2026-11-06T15:00:00Z",
  }),
  make({
    id: "00000000-0000-4000-8000-000000000002",
    title: "Sample — Loudoun County, VA",
    tier: "standard",
    typeLabel: "Jurisdiction Briefing",
    byline: "Gilbert",
    hypothesis: "Sample text. A mature market whose next constraint is transmission, not entitlement.",
    contents: ["The argument", "Permitting", "Power", "Sources & methodology"],
    sources: [src(1, "Sample source one")],
    pageTarget: 9,
    publishedAt: "2026-10-28T15:00:00Z",
  }),
  make({
    id: "00000000-0000-4000-8000-000000000003",
    title: "Sample — Texas Large-Load Interconnection",
    tier: "standard",
    typeLabel: "Sector Briefing",
    byline: "Gilbert",
    hypothesis: "Sample text. Senate Bill-style large-load rules move cost and curtailment risk onto the data center.",
    contents: ["The argument", "At a glance", "Sources & methodology"],
    sources: [src(1, "Sample source one"), src(2, "Sample source two")],
    pageTarget: 8,
    publishedAt: "2026-10-21T15:00:00Z",
  }),
  make({
    id: "00000000-0000-4000-8000-000000000004",
    title: "Sample — Company Profile",
    tier: "profile",
    typeLabel: "Company Briefing",
    byline: null,
    hypothesis: null,
    entityId: "cmp_471d41bfea8b0180",
    sources: [src(1, "Sample source one")],
    pageTarget: 2,
    publishedAt: "2026-10-14T15:00:00Z",
  }),
];
