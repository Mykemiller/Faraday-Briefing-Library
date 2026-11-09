import type { Briefing } from "./model";
import { TYPE_META } from "./model";

/**
 * LOCAL DESIGN FIXTURES. Not real briefings.
 *
 * Production has zero published rows today, so the populated layout cannot be reviewed against
 * live data. These samples exist only so a reviewer can see the populated layout — one of each
 * of the five public briefing types, a US state and a country jurisdiction — locally
 * (`STOREFRONT_FIXTURES=1 npm run dev`, or `=empty` for the zero-row state) or on a Vercel
 * PREVIEW deployment that sets `STOREFRONT_FIXTURES=1` for its branch. They are refused on every
 * production build (Vercel `VERCEL_ENV=production`, or `NODE_ENV=production` off Vercel), and
 * every page that shows them carries a "Sample data" banner.
 */
export function fixturesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const mode = env.STOREFRONT_FIXTURES;
  if (mode !== "1" && mode !== "empty") return false;
  if (env.VERCEL === "1") return env.VERCEL_ENV === "preview"; // never the production target
  return env.NODE_ENV !== "production";
}

/** `STOREFRONT_FIXTURES=empty` previews the zero-published state (what production shows today). */
export function fixtureRows(env: Record<string, string | undefined> = process.env): Briefing[] {
  return env.STOREFRONT_FIXTURES === "empty" ? [] : FIXTURES;
}

const base = {
  contents: [] as string[],
  themes: [] as string[],
  entityId: null as string | null,
  jurisdiction: null as string | null,
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

const make = (b: Omit<Briefing, "typeLabel" | keyof typeof base> & Partial<typeof base>): Briefing => ({
  ...base,
  ...b,
  typeLabel: b.type ? TYPE_META[b.type].label : null,
});

export const FIXTURES: Briefing[] = [
  make({
    id: "00000000-0000-4000-8000-000000000001",
    title: "Sample — The Power Architecture of the Buildout",
    tier: "deep",
    type: "theater",
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
    title: "Sample — Virginia",
    tier: "standard",
    type: "jurisdiction",
    jurisdiction: "US-VA",
    byline: "Gilbert",
    hypothesis: "Sample text. A mature market whose next constraint is transmission, not entitlement.",
    contents: ["The argument", "Permitting", "Power", "Sources & methodology"],
    sources: [src(1, "Sample source one")],
    pageTarget: 9,
    publishedAt: "2026-10-28T15:00:00Z",
  }),
  make({
    id: "00000000-0000-4000-8000-000000000003",
    title: "Sample — Grid & Regulatory",
    tier: "standard",
    type: "sector",
    byline: "Gilbert",
    hypothesis: "Sample text. Large-load rules are moving cost and curtailment risk onto the data center.",
    contents: ["The argument", "At a glance", "Sources & methodology"],
    sources: [src(1, "Sample source one"), src(2, "Sample source two")],
    pageTarget: 8,
    publishedAt: "2026-10-21T15:00:00Z",
  }),
  make({
    id: "00000000-0000-4000-8000-000000000004",
    title: "Sample — Company Profile",
    tier: "profile",
    type: "company",
    byline: null,
    hypothesis: null,
    entityId: "cmp_471d41bfea8b0180",
    sources: [src(1, "Sample source one")],
    pageTarget: 2,
    publishedAt: "2026-10-14T15:00:00Z",
  }),
  make({
    id: "00000000-0000-4000-8000-000000000005",
    title: "Sample — Interconnection Queue & Grid Access",
    tier: "standard",
    type: "thread",
    byline: "Gilbert",
    hypothesis: "Sample text. The queue is the market: who gets a position, and when, decides who builds.",
    contents: ["The argument", "Queue reform", "Signal register", "Sources & methodology"],
    sources: [src(1, "Sample source one"), src(2, "Sample source two")],
    pageTarget: 8,
    publishedAt: "2026-10-09T15:00:00Z",
  }),
  make({
    id: "00000000-0000-4000-8000-000000000006",
    title: "Sample — Germany",
    tier: "standard",
    type: "jurisdiction",
    jurisdiction: "DE",
    byline: "Gilbert",
    hypothesis: "Sample text. Grid fees and the energy-efficiency act set the terms for every new campus.",
    contents: ["The argument", "Energy Efficiency Act", "Grid connection", "Sources & methodology"],
    sources: [src(1, "Sample source one")],
    pageTarget: 9,
    publishedAt: "2026-10-02T15:00:00Z",
  }),
];
