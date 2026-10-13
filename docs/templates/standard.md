# Standard template — Briefing Library V2 (BL-09 / FDY-175)

**Tier:** Standard · **Page target:** 8–10 pages (Brand Bible V2 §05) · **Artifact type:** Docs
**Used for:** Sector Briefings (Domain), Thread Briefings (Sub-Domain), Jurisdiction and
Academy-adjacent Briefings (Brand Bible V2 §03, §05).
**Byline:** Gilbert for empirical Briefings (§06).
**Status of this file:** draft for review. Nothing in it is approved copy.

Public vocabulary throughout: **Theater** (Theme) › **Sector** (Domain) › **Thread** (Sub-Domain),
with **Signal** for a dated event. Internal taxonomy counts never appear in subscriber copy.

## 1. Inputs

A Standard Briefing is drafted from one `public.briefings` row (BL-03 migration
`20261013120000_bl03_briefings_canonical.sql`) plus the records its `source_refs` point at.

| `briefings` column | Used for |
|---|---|
| `title` | Cover headline |
| `tier` = `standard` | Selects this template |
| `page_target` | Shown on the cover; the render check fails outside 8–10 |
| `status` | Shown on the cover; anything other than `published` prints "not signed off" |
| `sector_id` → `faraday_domains.domain_code` | Sector label on the cover |
| `thread_id` → `faraday_subdomains.subdomain_code` | Thread label (Thread Briefings) |
| `theme_tags` | Theater label |
| `source_refs` | The only evidence the template may print (see §4) |
| `airtable_record_id`, `version` | Record line on the cover |

Until `briefings` is applied to production and populated, the samples use the Draft rows of the
Airtable Briefing Library (`appxfti7VuoHYUeu6` / `tbl4kbby85nx6Z891`) mapped onto these columns.
Each sample's data file carries a `record` block in exactly this shape.

### `source_refs` shape

BL-03 types `source_refs` as `jsonb` and requires it to be non-empty when `status = 'published'`,
but leaves the element shape open. This template reads an array of objects:

```json
[
  {
    "n": 1,
    "kind": "signal",          // signal | artifact | company | institution | briefing_record
    "id": "a3a542f9-…",        // public.signals.id, public.artifacts.artifact_id, companies.company_uid …
    "url": "https://…",        // the publisher URL recorded on that row
    "publisher": "W.Media",
    "published_at": "2026-10-12",
    "title": "Google and Constellation sign nuclear power deal to add 890 MW to PJM grid"
  }
]
```

`n` is the citation number printed in the text. The samples store this list as `sources`
(with `ref` holding `kind` + short id) in `docs/templates/samples/data/*.json`. Proposed for BL-03
follow-up; not yet a schema constraint.

## 2. Section list

| # | Section | Content | Budget |
|---|---|---|---|
| 1 | **Cover** | Eyebrow (Library · Sector Briefing), tier line (tier, Theater, Sector), headline, double rule, one-paragraph thesis, byline, evidence window, status, record line (Threads covered, number of Signals cited, record id, date prepared) | 1 page, forced |
| 2 | **The argument** | Hypothesis-led opening (§06): 3–4 paragraphs stating what the record shows, every factual sentence cited. **At a glance** table: 6–8 figures, each with its date and citation | 1 page, starts a new page |
| 3 | **Thread sections** | 3–5 sections, one per Thread in scope. Each: Thread code + name, one-sentence intro, then 4–13 dated Signal entries (date · publisher · short headline · one or two sourced sentences). The first Thread starts a page; the rest flow | 4–5 pages |
| 4 | **Signal register** | Table of named parties that appear in the cited Signals, with their role as reported and the citations. Followed by **Faraday's Take** | ≤ 1 page, starts a new page |
| 5 | **Sources & methodology** | Always the final page (§06). Source rule, selection method, limits and status; then the numbered source list (publisher · date · title · URL · Faraday record id), two columns | 1–2 pages, starts a new page |

Typical total: 1 + 1 + 4–5 + 1 + 1–2 = **8–10 pages**.

## 3. Page budget rules

- The render check (`scripts/templates/render.mjs`) prints the page count. A Standard outside
  8–10 pages does not ship.
- **Over 10:** cut the weakest Signals first (least specific, least sourced), then merge two
  related entries into one with both citations. Never shrink type below the template sizes.
- **Under 8:** add Signals or a Thread from the record. **Never pad.** If the sourced record for
  the subject cannot fill 8 pages, the subject is not a Standard: choose a richer subject, widen
  the evidence window, or produce a Profile instead.
- Headings and Thread intros never end a page alone (`break-after: avoid`); Signal entries,
  table rows and the Take never split across pages.

## 4. Source rule

1. Every factual sentence carries a numbered citation to an entry in `source_refs`.
2. A citation must resolve to a real Faraday record (`public.signals`, `public.artifacts`,
   `public.companies`, `public.institutions`) that records the publisher URL, or to a primary URL
   held on the Briefing record. The sample check confirmed all 107 distinct URLs printed across the six samples against
   `public.artifacts` / `public.signals` (see `test-results.md`).
3. Sentences restate what the record says. Where a recorded summary is truncated, only its
   complete clauses are used. Nothing is added from model memory, the retired Gamma decks, or
   any other unrecorded source.
4. Where two sources disagree on a figure, print both with attribution, or drop the item. Never
   reconcile silently.
5. Vendor blogs, sponsored posts and market-research releases are labelled as such in the
   publisher field and quoted as the vendor's own statement.
6. **Faraday's Take** is the one place for opinion. It may only reason over cited items (and
   cites them); it introduces no new facts.
7. Status prints on the cover and the final page until Myke signs off (§07). A Standard is never
   published without sign-off.

## 5. Visual rules

Paper-white ground; Faraday forest for headings and the upper rule, gold for the lower rule and
eyebrows (Brand Bible §06 double-rule signature). Cream is reserved for the Faraday's Take callout
(forest/gold double left rule, italic serif). Source Serif 4 for text, IBM Plex Sans for labels
and tables, IBM Plex Mono for record ids and URLs. US Letter, margins set by the template's
`@page` rule (0.7 in top, 0.75 in sides and bottom).

## 6. Files

- Renderer: `scripts/templates/render.mjs`
- Sample data: `docs/templates/samples/data/standard-*.json`
- Rendered samples: `docs/templates/samples/standard-*.html` (PDFs are generated, never committed)
- Page counts: `docs/templates/test-results.md`
