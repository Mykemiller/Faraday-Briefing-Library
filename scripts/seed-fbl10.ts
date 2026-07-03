/**
 * FBL 1.0 shelf seed — inserts the designed catalog (design_handoff_briefing_library/
 * briefings-data.js) into library_catalog_cache so the deployed preview shows the full shelf.
 *
 * Rows are marked with the id prefix `seed-` so the Airtable sync spares them (see the prune
 * in src/lib/sync.ts) until FAR-213 fills the real catalog and supersedes them.
 *
 * Run (service role — server-side only):
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/seed-fbl10.ts
 */
import { createClient } from "@supabase/supabase-js";

type SeedType = "theater" | "sector" | "thread" | "keyplayer";

interface Seed {
  id: string;
  type: SeedType;
  theater?: string; // Theater display name → themes[0]
  sector?: string; // Sector display name → domains[0]
  thread?: string; // Thread name → subdomains[0]
  title: string;
  byline: "Gilbert" | "Mach";
  updated: string; // 'June 2026' | 'May 2026' | '' (soon)
  status: "live" | "soon";
  abstract: string;
  hypothesis: string;
  contents: string[];
}

const T = {
  power: "The Power Reckoning",
  inference: "The Inference Economy",
  capital: "The Capital Concentration",
} as const;

export const SEEDS: Seed[] = [
  // ——— Theater Briefings ———
  { id: "b-t-power", type: "theater", theater: T.power, title: "The Power Reckoning", byline: "Mach", updated: "June 2026", status: "live",
    abstract: "The buildout has collided with the grid. Faraday’s thesis: generation, not silicon, sets the pace of the AI economy through 2029 — and the winners are already contracting around it.",
    hypothesis: "Power availability — not chip supply — is the binding constraint on AI capacity through 2029. Operators who secured firm generation before 2026 hold an advantage the market has not priced.",
    contents: ["The thesis in one page", "Where the constraint actually binds", "The contracting playbook", "Sectors & Threads in this Theater", "Faraday’s Read"] },
  { id: "b-t-inference", type: "theater", theater: T.inference, title: "The Inference Economy", byline: "Mach", updated: "June 2026", status: "live",
    abstract: "Training built the boom; inference pays for it. How the shift from training to serving reorders density, siting, and the economics of every rack.",
    hypothesis: "Inference workloads invert the siting logic of the training era: latency and power price beat campus scale. The next wave of builds looks nothing like the last one.",
    contents: ["The inversion, stated plainly", "Latency vs. scale economics", "Who is positioned for the flip", "Sectors & Threads in this Theater", "Faraday’s Read"] },
  { id: "b-t-capital", type: "theater", theater: T.capital, title: "The Capital Concentration", byline: "Mach", updated: "May 2026", status: "live",
    abstract: "A trillion-dollar buildout financed by a surprisingly short list of balance sheets. Where the capital stack is concentrating, and what breaks if it stops.",
    hypothesis: "The buildout’s financing has concentrated into fewer than a dozen decisive balance sheets. Concentration is the systemic risk — and the opportunity map.",
    contents: ["The short list", "Debt is doing the quiet work", "Stress scenarios", "Sectors & Threads in this Theater", "Faraday’s Read"] },

  // ——— Sector Briefings ———
  { id: "b-s-power-arch", type: "sector", theater: T.power, sector: "Power Architecture", title: "Power Architecture", byline: "Gilbert", updated: "June 2026", status: "live",
    abstract: "From the substation to the rack: how power delivery architecture became a competitive weapon, and the design choices separating leaders from the queue.",
    hypothesis: "Power architecture decisions made at design time now determine a facility’s economic life. Retrofit costs make early HVDC and medium-voltage choices effectively irreversible.",
    contents: ["State of the Sector", "The architecture decisions that matter", "Key companies", "Threads Faraday follows here", "Faraday’s Read"] },
  { id: "b-s-grid", type: "sector", theater: T.power, sector: "Grid & Regulatory", title: "Grid & Regulatory", byline: "Gilbert", updated: "June 2026", status: "live",
    abstract: "Interconnection queues, ratepayer politics, and the regulatory proceedings quietly deciding where the next gigawatt lands.",
    hypothesis: "Regulatory posture has become a siting input as decisive as land and fiber. Jurisdictions are diverging fast — and the divergence is measurable.",
    contents: ["State of the Sector", "The proceedings that matter now", "Key companies & agencies", "Threads Faraday follows here", "Faraday’s Read"] },
  { id: "b-s-cooling", type: "sector", theater: T.power, sector: "Cooling & Water", title: "Cooling & Water", byline: "Gilbert", updated: "June 2026", status: "live",
    abstract: "Liquid is no longer optional. The cooling transition, the water politics underneath it, and the suppliers positioned for both.",
    hypothesis: "The liquid cooling transition is complete at the design level — every new AI hall assumes it. The competition has moved to serviceability and water accounting.",
    contents: ["State of the Sector", "The transition, by the numbers", "Key companies", "Threads Faraday follows here", "Faraday’s Read"] },
  { id: "b-s-chips", type: "sector", theater: T.inference, sector: "Chips & Density", title: "Chips & Density", byline: "Gilbert", updated: "June 2026", status: "live",
    abstract: "Accelerator roadmaps, rack density economics, and the packaging constraints shaping what a data hall must become.",
    hypothesis: "Rack density is rising faster than facility design cycles can absorb. The gap between announced silicon and deployable halls is the industry’s most underpriced tension.",
    contents: ["State of the Sector", "Roadmaps vs. reality", "Key companies", "Threads Faraday follows here", "Faraday’s Read"] },
  { id: "b-s-orch", type: "sector", theater: T.inference, sector: "Orchestration & Control Plane", title: "Orchestration & Control Plane", byline: "Gilbert", updated: "May 2026", status: "live",
    abstract: "The software layer that decides which watts do work. Schedulers, telemetry, and the control plane land-grab.",
    hypothesis: "Control-plane software is consolidating toward two dominant patterns. Whoever owns the scheduler owns the margin.",
    contents: ["State of the Sector", "The consolidation pattern", "Key companies", "Threads Faraday follows here", "Faraday’s Read"] },
  { id: "b-s-network", type: "sector", theater: T.inference, sector: "Networking & Interconnect", title: "Networking & Interconnect", byline: "Gilbert", updated: "May 2026", status: "live",
    abstract: "Optics, backbones, and the interconnect buildout racing to keep clusters coherent.",
    hypothesis: "Optical interconnect capacity — not compute — is the quiet bottleneck in multi-site training. The backbone contracts signed this year reveal who saw it early.",
    contents: ["State of the Sector", "The bottleneck, mapped", "Key companies", "Threads Faraday follows here", "Faraday’s Read"] },
  { id: "b-s-ma", type: "sector", theater: T.capital, sector: "M&A & Capital Markets", title: "M&A & Capital Markets", byline: "Gilbert", updated: "June 2026", status: "live",
    abstract: "Take-privates, infrastructure funds, and the debt structures financing the buildout — who is buying, who is exiting, and at what multiple.",
    hypothesis: "Data center M&A has entered its consolidation act: platform premiums are compressing while single-asset prices hold. The arbitrage window is closing.",
    contents: ["State of the Sector", "The deal ledger", "Key companies & funds", "Threads Faraday follows here", "Faraday’s Read"] },
  { id: "b-s-hyper", type: "sector", theater: T.capital, sector: "Hyperscaler Activity", title: "Hyperscaler Activity", byline: "Gilbert", updated: "June 2026", status: "live",
    abstract: "Capex signals, self-build versus lease, and what the quarterly filings actually say about the pace of the buildout.",
    hypothesis: "Hyperscaler capex guidance has decoupled from lease commitments — the self-build share is rising faster than disclosed. Colocation demand models built on 2024 ratios are wrong.",
    contents: ["State of the Sector", "Reading the filings", "Key companies", "Threads Faraday follows here", "Faraday’s Read"] },
  { id: "b-s-entrants", type: "sector", theater: T.capital, sector: "New Entrants", title: "New Entrants", byline: "Gilbert", updated: "May 2026", status: "live",
    abstract: "Neoclouds, sovereign builds, and the challengers converting GPU access into durable platforms — or not.",
    hypothesis: "The neocloud field will bifurcate within 18 months: a handful become durable platforms; the rest become asset sales. The dividing line is power tenure, not GPU count.",
    contents: ["State of the Sector", "The bifurcation test", "Key companies", "Threads Faraday follows here", "Faraday’s Read"] },

  // ——— Thread Briefings ———
  { id: "b-th-dlc", type: "thread", theater: T.power, sector: "Cooling & Water", thread: "Direct Liquid Cooling", title: "Direct Liquid Cooling", byline: "Gilbert", updated: "June 2026", status: "live",
    abstract: "The Thread Faraday has followed longest: DLC’s march from exotic to default, Signal by Signal.",
    hypothesis: "DLC is now the default for AI halls; the remaining competition is over serviceability standards and who sets them.",
    contents: ["The Thread so far", "Recent Signals", "The standards fight", "Faraday’s Read"] },
  { id: "b-th-hvdc", type: "thread", theater: T.power, sector: "Power Architecture", thread: "HVDC", title: "HVDC", byline: "Gilbert", updated: "June 2026", status: "live",
    abstract: "High-voltage DC distribution moves from white paper to purchase order. Who is shipping, who is piloting, who is watching.",
    hypothesis: "HVDC inside the facility crosses from pilot to specification in 2027 — driven by density, not efficiency.",
    contents: ["The Thread so far", "Recent Signals", "Pilot-to-spec timeline", "Faraday’s Read"] },
  { id: "b-th-queues", type: "thread", theater: T.power, sector: "Grid & Regulatory", thread: "Interconnection Queues", title: "Interconnection Queues", byline: "Gilbert", updated: "June 2026", status: "live",
    abstract: "The queue is the market. What the latest cluster-study reforms actually change, and where load is quietly jumping the line.",
    hypothesis: "Queue reform is redistributing advantage, not reducing wait times. Co-located generation is the only reliable line-jump.",
    contents: ["The Thread so far", "Recent Signals", "Reform scorecard", "Faraday’s Read"] },
  { id: "b-th-neoclouds", type: "thread", theater: T.capital, sector: "New Entrants", thread: "Neoclouds", title: "Neoclouds", byline: "Gilbert", updated: "May 2026", status: "live",
    abstract: "GPU-first challengers, their contracts, their creditors, and the tenure of their power.",
    hypothesis: "Neocloud creditworthiness now trades on power tenure. The debt market figured this out before the equity market did.",
    contents: ["The Thread so far", "Recent Signals", "The tenure table", "Faraday’s Read"] },
  { id: "b-th-optical", type: "thread", theater: T.inference, sector: "Networking & Interconnect", thread: "Optical Interconnect", title: "Optical Interconnect", byline: "Gilbert", updated: "May 2026", status: "live",
    abstract: "Co-packaged optics, pluggable roadmaps, and the supply chain behind cluster coherence.",
    hypothesis: "Co-packaged optics arrives a full cycle earlier than consensus expects — the thermal math forces it.",
    contents: ["The Thread so far", "Recent Signals", "Supply chain map", "Faraday’s Read"] },

  // ——— Key Player Briefings ———
  { id: "b-kp-vertiv", type: "keyplayer", title: "Vertiv", byline: "Gilbert", updated: "June 2026", status: "live",
    abstract: "The thermal-and-power pure play at the center of the liquid transition. Position, backlog, and the acquisition Faraday expects next.",
    hypothesis: "Vertiv’s services attach rate — not its equipment backlog — is the number that decides its next re-rating.",
    contents: ["Company profile", "Strategic positioning", "Capital & operational posture", "Velocity Play hypothesis", "Faraday’s Read"] },
  { id: "b-kp-schneider", type: "keyplayer", title: "Schneider Electric", byline: "Gilbert", updated: "June 2026", status: "live",
    abstract: "From switchgear to software: the quiet consolidator of the electrical room, and the moves that telegraph its next play.",
    hypothesis: "Schneider acquires a liquid cooling company within 24 months. The Motivair pattern was the rehearsal.",
    contents: ["Company profile", "Strategic positioning", "Capital & operational posture", "Velocity Play hypothesis", "Faraday’s Read"] },
  { id: "b-kp-eaton", type: "keyplayer", title: "Eaton", byline: "Gilbert", updated: "June 2026", status: "live",
    abstract: "Power management at buildout scale. The Boyd acquisition, the data center mix shift, and what the order book says.",
    hypothesis: "Eaton’s data center revenue mix crosses a threshold in 2027 that forces a segment restatement — and a re-rating.",
    contents: ["Company profile", "Strategic positioning", "Capital & operational posture", "Velocity Play hypothesis", "Faraday’s Read"] },
  { id: "b-kp-coreweave", type: "keyplayer", title: "CoreWeave", byline: "Gilbert", updated: "June 2026", status: "live",
    abstract: "The neocloud that graduated. Contract structure, debt stack, and whether the model survives contact with inference economics.",
    hypothesis: "CoreWeave’s moat is its contracted power pipeline, not its GPU fleet. The market still prices the wrong asset.",
    contents: ["Company profile", "Strategic positioning", "Capital & operational posture", "Velocity Play hypothesis", "Faraday’s Read"] },
  { id: "b-kp-equinix", type: "keyplayer", title: "Equinix", byline: "Gilbert", updated: "May 2026", status: "live",
    abstract: "The interconnection incumbent navigating an AI cycle built for someone else’s product. The xScale bet, examined.",
    hypothesis: "Equinix’s retail interconnection franchise is insulated from the AI cycle — but xScale’s returns depend on a leasing market that is thinning.",
    contents: ["Company profile", "Strategic positioning", "Capital & operational posture", "Velocity Play hypothesis", "Faraday’s Read"] },
  { id: "b-kp-digital", type: "keyplayer", title: "Digital Realty", byline: "Gilbert", updated: "May 2026", status: "live",
    abstract: "Scale, land banks, and the funding machine. How the largest landlord in the sector is positioned for the density era.",
    hypothesis: "Digital Realty’s land-and-power bank is worth more than its developed portfolio implies — the JV structures are how it gets monetized.",
    contents: ["Company profile", "Strategic positioning", "Capital & operational posture", "Velocity Play hypothesis", "Faraday’s Read"] },
  { id: "b-kp-nvidia", type: "keyplayer", title: "NVIDIA", byline: "Gilbert", updated: "June 2026", status: "live",
    abstract: "The company that sets everyone else’s roadmap. Allocation politics, the systems pivot, and the customer-turned-competitor question.",
    hypothesis: "NVIDIA’s move down the stack into systems and power reference designs is a margin defense, not an expansion — and it reshapes the vendor map either way.",
    contents: ["Company profile", "Strategic positioning", "Capital & operational posture", "Velocity Play hypothesis", "Faraday’s Read"] },
  { id: "b-kp-microsoft", type: "keyplayer", title: "Microsoft", byline: "Gilbert", updated: "June 2026", status: "live",
    abstract: "The most legible hyperscaler. Lease pullbacks, self-build acceleration, and what Redmond’s siting choices reveal about the demand curve.",
    hypothesis: "Microsoft’s 2026 lease rationalization is a mix shift, not a demand signal — but the colocation market is trading it as demand.",
    contents: ["Company profile", "Strategic positioning", "Capital & operational posture", "Velocity Play hypothesis", "Faraday’s Read"] },

  // ——— Coming Soon (representative placeholders) ———
  { id: "b-cs-1", type: "thread", theater: T.power, sector: "Power Architecture", thread: "On-Site Generation", title: "On-Site Generation", byline: "Gilbert", updated: "", status: "soon",
    abstract: "Gas turbines, fuel cells, and small modular hopes: the behind-the-fence generation Thread.", hypothesis: "", contents: [] },
  { id: "b-cs-2", type: "thread", theater: T.inference, sector: "Chips & Density", thread: "Advanced Packaging", title: "Advanced Packaging", byline: "Gilbert", updated: "", status: "soon",
    abstract: "CoWoS capacity, substrate politics, and the packaging step that gates every roadmap.", hypothesis: "", contents: [] },
  { id: "b-cs-3", type: "keyplayer", title: "Vantage Data Centers", byline: "Gilbert", updated: "", status: "soon",
    abstract: "The private hyperscale developer and its capital machine.", hypothesis: "", contents: [] },
  { id: "b-cs-4", type: "keyplayer", title: "GE Vernova", byline: "Gilbert", updated: "", status: "soon",
    abstract: "Turbines, grid gear, and the order book of the power reckoning.", hypothesis: "", contents: [] },
  { id: "b-cs-5", type: "thread", theater: T.capital, sector: "M&A & Capital Markets", thread: "Infrastructure Funds", title: "Infrastructure Funds", byline: "Gilbert", updated: "", status: "soon",
    abstract: "The permanent-capital vehicles reshaping who owns the buildout.", hypothesis: "", contents: [] },
  { id: "b-cs-6", type: "sector", theater: T.power, sector: "Grid & Regulatory", title: "Jurisdiction Watch: ERCOT", byline: "Gilbert", updated: "", status: "soon",
    abstract: "The Texas grid, large-load rules, and the jurisdiction moving fastest.", hypothesis: "", contents: [] },
];

const MONTHS: Record<string, string> = {
  January: "01", February: "02", March: "03", April: "04", May: "05", June: "06",
  July: "07", August: "08", September: "09", October: "10", November: "11", December: "12",
};

function goLiveDate(updated: string): string | null {
  const [month, year] = updated.split(" ");
  if (!month || !year || !MONTHS[month]) return null;
  return `${year}-${MONTHS[month]}-01`;
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export function toSeedRow(s: Seed) {
  return {
    id: `seed-${s.id}`,
    slug: `${slugify(s.title) || "briefing"}-${s.id.replace(/^b-/, "")}`,
    briefing_title: s.title,
    briefing_description: s.abstract,
    status: s.status === "live" ? "Available" : "Coming Soon",
    canonical_flag: "Placeholder", // seed rows — superseded by the Airtable sync (FAR-213)
    gamma_url: null,
    gamma_id: null,
    themes: s.theater ? [s.theater] : [],
    domains: s.sector ? [s.sector] : [],
    subdomains: s.thread ? [s.thread] : [],
    companies: s.type === "keyplayer" ? [s.title] : [],
    briefing_type: s.type,
    byline: s.byline,
    hypothesis: s.hypothesis,
    contents: s.contents,
    download_count: 0,
    go_live_date: goLiveDate(s.updated),
    preview_slides: null,
    synced_at: new Date().toISOString(),
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const rows = SEEDS.map(toSeedRow);
  const { error } = await sb.from("library_catalog_cache").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`seed upsert failed: ${error.message}`);
  console.log(`Seeded ${rows.length} FBL 1.0 rows (id prefix 'seed-').`);
}

// Only run when executed directly (the row mapper is imported by tests).
if (process.argv[1] && process.argv[1].endsWith("seed-fbl10.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
