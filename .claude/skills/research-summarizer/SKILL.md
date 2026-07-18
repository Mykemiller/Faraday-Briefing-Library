---
name: research-summarizer
description: >-
  Turns raw Faraday crawl artifacts into one citation-backed Briefing Library brief
  in Faraday's editorial voice ("The Economist meets a private intelligence firm").
  Use when Myke or an editor asks to "draft a brief", "summarize the crawl", "turn
  the Automation Registry output into a briefing", "produce a pilot brief", or
  "write this up in Faraday voice" from artifacts collected by the Automation
  Registry (Airtable tbl1ef6FgxUc3Uevg) and landed in the Supabase `artifacts`
  table. Draft-only: it produces the manuscript, it never publishes.
license: Proprietary — Faraday Intelligence
metadata:
  vendored_from: "Founder / Meta — Top 100 Claude Skills catalog · research-summarizer"
  validity: "100 · pass"
  adapted_by: "Faraday Briefing Library content pipeline"
  status: pilot
---

# research-summarizer

Vendored from the **Founder / Meta** "Top 100 Claude Skills" catalog entry
`research-summarizer` (validity **100 · pass**) and adapted to the Faraday
Briefing Library content pipeline. The generic skill summarizes a corpus into a
report; this adaptation binds it to Faraday's sources, Faraday's brand voice, and
Faraday's publish guardrails so its output is a Briefing Library manuscript, not a
generic summary.

**What it does:** takes an existing Automation Registry crawl output and produces
**one** Briefing Library brief — a hypothesis, an evidence body, a Faraday-voiced
"Take", and a sourced methodology slide — with **zero fabricated data** and every
claim traceable to a crawled source URL.

**What it does not do:** it does not publish, does not touch the token gate, does
not flip feature flags, does not write to `library_catalog_cache` or the live
`Briefing Library` table. It stops at a reviewable draft. Publishing is Myke's.

---

## When to use

Trigger when the ask is to convert crawled intelligence into subscriber-facing
editorial:

- "Draft a brief from the [crawler / domain] crawl."
- "Summarize this week's Grid & Regulatory signals into a briefing."
- "Produce a pilot brief from the Automation Registry."
- "Write this up in Faraday's voice, citation-backed."

Do **not** use it to publish a brief, price a brief, wire the Gamma export, or
change any gate. Those are separate, human-gated steps (see Deploy-gate checklist
in the repo `CLAUDE.md`).

---

## Sources (the only inputs — never invent one)

| Layer | Where | Use |
|---|---|---|
| Crawler registry (SOR for *what runs*) | Airtable **Automation Registry** `appxfti7VuoHYUeu6 / tbl1ef6FgxUc3Uevg` | Resolve `AUTO-###` → crawler name, cadence, source type, domains |
| **Crawl output (the raw material)** | Supabase **`artifacts`** table, project `ycadmmngkdhvpcsrcuaq` | The real signals: `source_url`, `published_at`, `raw_content`, `signal_envelope`, `ifs_domains` |
| Editorial mirror | Airtable **Automation Entries** `tblWHtK0TMk374Bi0` | Human-readable crawl notes; **note:** many rows are crawler *specs*, not payloads — do not mistake a spec for a signal |
| Voice authority | Notion **Brand Bible 4.0** `33489a0c-1680-8133-8515-e1fc777b6c43` | Voice, personas, domain-name mapping, "What Faraday Never Says" |

The **`artifacts`** table is the hot path. Everything a brief asserts must come
from a row there (or a source it explicitly cites). If a fact is not in the
crawl, it does not go in the brief.

### Pulling a clean cluster

```sql
-- 1. Find rich, coherent clusters by crawler
select auto_id, count(*) n, count(distinct source_url) urls,
       min(published_at)::date lo, max(published_at)::date hi
from artifacts
where raw_content is not null and length(raw_content) > 300 and source_url is not null
group by auto_id order by n desc;

-- 2. Pull a de-duplicated, recent window for the chosen theme
--    (one row per URL — enrichment can emit several title variants per source)
select distinct on (source_url)
       auto_id, published_at::date pub, source_url, ifs_domains, raw_content
from artifacts
where auto_id in (:autos) and published_at >= :since and length(raw_content) > 300
order by source_url, published_at desc;
```

Always `distinct on (source_url)` — the enrichment pass writes multiple
`signal_envelope` variants per source, and counting them twice inflates a trend.

---

## Process

1. **Frame the question.** One brief = one thesis. Pick a theme where the cluster
   is coherent and *recent* (a tight publish window reads as intelligence; a
   two-year smear reads as a literature review). Prefer a theme that supports a
   declarative, forward-looking call.
2. **Assemble evidence.** Pull the de-duplicated cluster. Keep a working table of
   `claim → figure → source_url → date`. This table becomes the methodology slide.
3. **Verify every number.** Read the `raw_content`, not just the title. Confirm
   the actor, the figure, the date, the jurisdiction. **Zero fabrication** is the
   hard gate: if you cannot point to the row, cut the sentence.
4. **Resolve source conflicts explicitly.** When two crawled sources disagree
   (a wire mis-attributes a statistic, two reports use different fiscal years),
   prefer the **primary source**, state which you took, and footnote the
   discrepancy in methodology. Do not average conflicting numbers. Do not pick the
   more dramatic one.
5. **Classify.** Map the cluster to its IDF domain(s). Lead persona follows domain
   ownership (below).
6. **Draft in Faraday voice** (next section) into the brief structure (below).
7. **Self-check against the Brand Bible** "What Faraday Never Says" list and the
   domain-code rule, then hand off for review. **Stop before publishing.**

---

## Faraday brand voice (bound to Brand Bible 4.0)

Aspiration: **The Economist meets a private intelligence firm** — authoritative,
opinionated, visually disciplined; the prose serves the intelligence.

- **Confident and spare.** Hemingway, not Dickens. Every word earns its place.
- **Lead with the insight, not the setup.** Open on the point. Never "In today's
  fast-paced world…", never "According to a recent report…".
- **Have a view.** Faraday concludes. Neutral language that says nothing is a bug.
- **Declarative, not hedged.** "Arizona paused the exemption" — not "Arizona may
  be considering a pause." If a claim is uncertain, say *why*, with a source.
- **Named actors, named filings, named figures.** "Arizona's HB 4168/SB 1861",
  not "a recent legislative action." Specificity is the whole product.
- **Conviction in language, never in numbers.** Express the call as "Faraday's
  read is…" / "the move the market hasn't priced in yet." Never surface an
  internal conviction score.
- **Own the non-consensus position** when the evidence supports it.

**Never write:** "Empowering", "Leveraging", "Unlocking potential",
"cutting-edge", "best-in-class", "revolutionary", "In today's fast-paced world",
"We're excited to announce", "Great question", "Certainly!".

**Subscriber-facing domain rule (locked policy):** never print an internal domain
code (`D3`, `D7.2`, `T1`) in a brief. Always the plain-language name — D3 → "Grid
& Regulatory", D11 → "Sustainability", D7.2 → "Direct Liquid Cooling", T-codes →
the theme name (e.g. "The Power Constraint").

### Personas / byline

Faraday Intelligence is anchored by two analysts. Byline the lead by domain:

- **Gilbert Faraday** — the empiricist. Owns the observable, documentable domains
  (Power Architecture, **Grid & Regulatory**, Cooling & Water Technology, People &
  Signals, Hyperscaler Activity). Names the source, names the filing, builds to the
  conclusion. Lead him where **evidence governs**.
- **Mach Eigen** — the theorist. Owns the structural, forward-projecting call.
  Identifies the structural dynamic, then the conclusion; fast, precise, urgent
  from the math. Lead him where **models govern**.

Domain ownership is a default, not a wall — both contribute to every brief. A
policy/permitting brief is Gilbert-led with a Mach structural forward call.

---

## Brief structure (Briefing Library manuscript)

Mirror the storefront's preview contract from the repo `CLAUDE.md` /
`src/config/constants.ts` (`PREVIEW_SLIDE_MAX = 3`):

| Slide | Contents | Preview-safe? |
|---|---|---|
| **1 — Hypothesis opener** | The thesis in 1–2 sentences + the strongest supporting figure | ✅ shown in preview |
| **2…n — Body** | The evidence, one movement per slide, every claim sourced | ✅ slide 2 only |
| **Faraday's Take** | The opinionated forward call (Velocity-Play voice) | ❌ **never** in preview |
| **Sources & methodology** | Claim → source URL → date table; conflict-resolution notes | ❌ **never** in preview |

The preview must **never** expose "Faraday's Take" or "Sources & methodology"
(L10 of the repo `CLAUDE.md`). The opener + one body slide are the teaser; the
Take is the paywalled payoff.

Front-matter every draft with: title, byline (lead persona), plain-language
domain(s), the source crawlers (`AUTO-###`), the evidence window, and a
`status: DRAFT — awaiting Myke review` line.

---

## Guardrails (hard stops)

- **Zero fabricated data.** No figure, actor, date, or quote that isn't in a
  crawled source. When in doubt, cut it.
- **Draft-only.** Produce a reviewable manuscript file. Do **not** publish, do
  **not** insert into `library_catalog_cache` or the `Briefing Library` table, do
  **not** call the Gamma export, do **not** touch pricing/meter/flags. Commerce
  and subscriber-live remain gated on `commerceOn` / `subscriberLive` and Myke's
  sign-off (FAR-16, FAR-46, FAR-132, FAR-56).
- **STOP before the live library.** Publishing is a human, Myke-gated step.
- **Cite or cut.** Every brief ships with its methodology table. A brief without
  traceable sources is not a Faraday brief.

## Output

Write the manuscript to `pilot-briefs/<date>-<slug>.md` (or the path the editor
names), then report the draft and a short "Myke actions" list (what to approve).
Never mark a brief as published — that word belongs to Myke.
