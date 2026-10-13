# Deep brief template (BL-08)

**Linear:** FDY-174 (BL-08), Briefing Library V2 program
**Tier:** Deep, **10–15 printed pages** (Brand Bible V2 §03, §05)
**Used for:** Theater Briefings and Thought Forge commissions (Brand Bible V2 §05 table; both still marked **[V2 — confirm]** there)
**Artifact type:** Docs, published as a Claude artifact (HTML) and exported to PDF
**Sample:** [`deep-sample.md`](./deep-sample.md) (manuscript) and [`deep-sample.html`](./deep-sample.html) (rendered page)

This file specifies what a Deep brief contains, how its pages are budgeted, and how every
sourced claim maps to a `source_refs` entry on the `briefings` row (BL-03 schema,
`supabase/migrations/20261013120000_bl03_briefings_canonical.sql`). It does not change the
schema and does not publish anything.

---

## 1. Section list

A Deep brief has exactly these parts, in this order. Each part after the cover starts on a new
page (`break-before: page`), which is what makes the page budget enforceable.

| # | Part | Required | What it holds |
|---|---|---|---|
| 1 | **Cover** | yes | Title, one-sentence deck, tier label ("Deep brief"), coverage line (Theater › Sector › Thread), byline, evidence window, status stamp, sign-off line. No body text. |
| 2 | **Summary** | yes | The thesis in the first paragraph (the reader knows within 30 seconds what Faraday thinks — Brand Bible §06), then 4–6 numbered findings, each carrying at least one source marker. A short "What to watch" list closes the page. |
| 3 | **Body sections** | yes, 4–7 | Each section opens with a one-sentence claim as its heading deck, then the evidence. Sections may carry one evidence table or figure, and every number in it is sourced. Sections are separated by the forest-over-gold double rule. |
| 4 | **Signals to watch** | yes | Dated forward calendar: each row is a date or window, the event, and the source that states it. Only events a source names with a date belong here. |
| 5 | **Faraday's Take** | yes | The opinion page. Warm cream panel, forest/gold double left rule, italic serif (Brand Bible §06). It may argue; it may not introduce a new factual claim. Any fact it leans on must already appear, sourced, in the body. |
| 6 | **Sources & methodology** | yes, always last | Numbered source list matching `source_refs` one-to-one, followed by the method note (corpus, evidence window, what was excluded and why). |

Public vocabulary on every page: **Theater / Sector / Thread / Signal** (IDF 5.0 §02). Internal
IDs (`D3`, `D3.5`) may appear on the Sources page as metadata, never in body copy. Do not use
the term "Key Player".

## 2. Page budget

Budget is measured on the exported PDF: US Letter, the page margins set by the template's
`@page` rule (0.75 in), body type 10.5 pt serif. Target 12 pages; the hard range is 10–15.

| Part | Pages | Notes |
|---|---|---|
| Cover | 1 | Always exactly one. |
| Summary | 1 | Must fit on one page. If it does not, the findings are too long. |
| Body sections | 6–10 | 4–7 sections at about 1–1.5 pages each. One section over 2 pages should be split. |
| Signals to watch | 0.5–1 | May share a page with the last body section only if it fits whole. |
| Faraday's Take | 1 | Always its own page, 250–400 words. |
| Sources & methodology | 1–2 | Grows with the source count; never cut to save pages. |
| **Total** | **10–15** | Under 10: add a sourced section or the brief belongs in the Standard tier. Over 15: cut body, never sources. |

Word guide: about 4,000–6,000 words in total, of which body sections are 3,000–4,500.

**Measurement rule.** Page count is recorded from the PDF, not estimated. The reference command
(Playwright + the pre-installed Chromium, Letter, no margin overrides so the CSS `@page` rule
applies) is below. A brief whose measured count falls outside 10–15 does not go to QA.

```sh
# Markdown manuscript -> HTML page (the file published as the artifact)
node scripts/deep-brief/build.mjs docs/templates/deep-sample.md docs/templates/deep-sample.html
# HTML -> Letter PDF + page count (PDFs are not committed)
PLAYWRIGHT_PATH=/opt/node-tools/node_modules/playwright \
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  node scripts/deep-brief/pdf.cjs docs/templates/deep-sample.html /tmp/deep-sample.pdf
pdfinfo /tmp/deep-sample.pdf | grep Pages   # cross-check
```

Measured for the sample on 2026-10-13: **12 pages**, US Letter (612 × 792 pt), Google Fonts
loaded (Spectral, Source Serif 4, IBM Plex Sans Condensed). If the fonts fail to load, the
fallback stack sets wider and the count can rise; re-measure with fonts loaded.

## 3. Source-reference rule

**Every factual claim carries a source marker, and every marker resolves to one entry in
`briefings.source_refs`.** A claim with no source is removed, not softened (no "reportedly",
no "experts say"). Opinion and inference are allowed only where they are visibly opinion: in
Faraday's Take, or as a sentence that starts from sourced facts and says it is Faraday's
reading.

### 3.1 What counts as a source

In order of preference:

1. A primary document (agency order, regulator release, statute, filing, company release).
2. A Supabase `artifacts` row whose body (`body_text`, else `raw_content`) the author actually
   read. The row's `source_url` is the citation; `artifact_id` is recorded for audit.
3. A link held on the Draft's own Library record.

A source is cited for what it says, at the date it says it. If a source attributes a figure to a
third party (for example a newspaper citing a poll), the brief says so and cites the source it
read, not the third party.

### 3.2 `source_refs` shape

BL-03 stores `source_refs` as `jsonb` and only requires it to be non-empty when
`status = 'published'`. Its test (T2) inserts `[{"url": …, "title": …}]`. The Deep template keeps
that shape and adds optional keys, so a Deep brief's array is still valid against BL-03:

```json
[
  {
    "ref": "S1",                       // marker used in the text: [S1]
    "url": "https://…",                // required (BL-03 T2 shape)
    "title": "…",                      // required (BL-03 T2 shape)
    "publisher": "…",                  // optional
    "published_at": "2026-06-18",      // optional, ISO date the source states
    "artifact_id": "uuid",             // optional, Supabase artifacts.artifact_id read
    "used_in": ["summary", "s1", "s3"] // optional, sections citing it
  }
]
```

Rules:

- `ref` values are `S1`, `S2`, … in order of first appearance and are never reused.
- `url` and `title` are required on every entry.
- Every `[Sn]` marker in the text has an entry; every entry is cited at least once.
  The Sources page lists exactly the `source_refs` array.
- `artifact_id` is filled whenever the claim was read from an `artifacts` row.

### 3.3 QA checks before sign-off

1. Count markers in the text and entries in `source_refs`; the sets match.
2. Every number in the body appears in its cited source.
3. Faraday's Take introduces no fact absent from the body.
4. Measured PDF pages are 10–15.
5. Myke signs every Deep brief (DEC-IDF-26 proposal, `docs/idf/DEC-IDF-25-27.md`).

## 4. Rendering

- Author the brief as Markdown (manuscript of record), render to a single HTML page using the
  Brand Bible tokens (forest, gold, cream), publish as a Claude artifact, export to PDF.
- Print CSS: `@page { size: Letter; margin: 0.75in }`; `break-before: page` on the Summary,
  each body section group, Faraday's Take and Sources; `break-inside: avoid` on tables, the Take
  panel and list items.
- Gamma is not used (retired V1 pipeline).
