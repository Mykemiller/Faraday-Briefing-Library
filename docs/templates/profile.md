# Profile template — Briefing Library V2 (BL-09 / FDY-175)

**Tier:** Profile · **Page target:** exactly 2 pages (Brand Bible V2 §05) · **Artifact type:** Docs
**Used for:** Company Briefings (§03.4); the same layout serves an institution.
**Status of this file:** draft for review. Nothing in it is approved copy.

A Profile is an entity overview made of **sourced facts only**.

- **No call-to-action.** Nothing invites the reader to buy, subscribe, book or contact. A CTA may be
  added only after Myke approves this file, and then only as a separately reviewed change.
- **No Faraday's Take, no forecast, no rating.** Brand Bible §06 puts a Take on every Briefing;
  the Profile rule (sourced facts only) overrides it. **Flag for Myke:** confirm that Profiles are
  exempt from the §06 Take, or say where a Take would go.
- The `companies.faraday_read` field is internal analysis, not a sourced fact, and is not printed.

Public vocabulary: **Theater** › **Sector** › **Thread**, **Signal**. Internal classification labels are never printed: the
`companies.player_classification` value (for example "Major Player") is internal and is not printed.

## 1. Inputs

One `public.briefings` row with `tier = 'profile'` and a `company_id` (→ `companies.company_uid`)
or `institution_id` (→ `institutions.institution_uid`), plus its `source_refs` (shape in
`standard.md` §1).

| Source | Fields printed |
|---|---|
| `companies` row | company type, ownership, ticker, headquarters, website, `nvidia_dsx_partner` when true, `company_uid` |
| `briefings` row (Airtable Draft row until BL-03 is populated) | Theater (`theme_tags`), Sectors, record id, status |
| `source_refs` → `artifacts` / `signals` | Every dated Signal |

Identity fields are cited to the companies row, and Theater/Sector to the Briefing record, so every
printed value has a numbered source.

## 2. Section list

| Page | Section | Content |
|---|---|---|
| 1 | **Header** | Eyebrow (Library · Company Briefing), entity name, tier/status/record line, double rule |
| 1 | **Identity card** (left column) | 6–7 label/value pairs, each cited |
| 1 | **What the record shows** (right column) | Two or three sentences restating the most material sourced facts, cited. No adjectives the sources do not use. |
| 1 | **Dated Signals** (right column) | **Up to 8** entries, newest first: date · publisher · short headline · one or two sourced sentences |
| 2 | **Sources & method** | Method note (source rule, limits, status), then the numbered source list (publisher · date · title · URL · Faraday record id), two columns. Final page, always. |

## 3. Page budget rules

- Exactly two pages. Page 1 holds all facts; page 2 holds the sources. The render check fails a
  Profile at any other count.
- **Over:** reduce to the 8 most material Signals, or merge two entries about the same event into
  one with both citations. Do not shrink type below the template sizes.
- **Under (page 1 visibly short):** add Signals from the record. If fewer than 6 sourced Signals
  exist for the entity, flag the Profile as thin rather than padding it.

## 4. Source rule

1. Every printed fact carries a numbered citation that resolves to a Faraday record
   (`companies`, `institutions`, `artifacts`, `signals`) or the Briefing record.
2. Sentences restate the recorded summary; truncated summaries contribute only complete clauses.
3. Reported, planned or unconfirmed items say so ("reportedly", "plans", "letter of intent").
4. Where sources disagree on a figure, print both with attribution.
5. Status prints until Myke signs off (§07).

## 5. Visual rules

As `standard.md` §5, with a two-column first page (identity card 2.1 in, Signals beside it) that
stacks to one column below 560 px.

## 6. Files

- Renderer: `scripts/templates/render.mjs`
- Sample data: `docs/templates/samples/data/profile-*.json`
- Rendered samples: `docs/templates/samples/profile-*.html` (PDFs are generated, never committed)
- Page counts: `docs/templates/test-results.md`
