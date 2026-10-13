# BL-09 template test results (FDY-175)

Run date: 2026-10-13. All six counts are inside range.

| Template | Entity (Library Draft record) | Evidence | Pages | Range | Pass |
|---|---|---|---|---|---|
| Standard | **The Power Reckoning** — `recMlmb655VUUXSFl` (#15); Theater The Power Reckoning; Sectors Power Architecture, Grid & Regulatory | 37 sources (Signals + artifacts), 13 Aug–12 Oct 2026 | **10** | 8–10 | ✅ |
| Standard | **The Thermal-Power Convergence Play** — `reccr6TZtcuXnfnXo` (#17); Theater The Rack Revolution; Sectors Cooling & Water Technology, Power Architecture | 30 sources, 8 Sep–12 Oct 2026 | **9** | 8–10 | ✅ |
| Standard | **Capital Flow Through the AI Infrastructure Ecosystem** — `recKq11RTVqlIbglN` (#14); Theater The Capital Concentration; Sector M&A & Capital Markets | 27 sources, 1 Jul–12 Oct 2026 | **9** | 8–10 | ✅ |
| Profile | **CoreWeave** — `recIXg6yYr6MNIJGm` (#4); companies `cmp_115f2b3f0dc7f35f` | 10 sources incl. SEC 8-K exhibit | **2** | 2 | ✅ |
| Profile | **Nebius** — `recWbMesu1DhjGCgN` (#5); companies `cmp_fe1704f586646f14` | 11 sources | **2** | 2 | ✅ |
| Profile | **Schneider Electric** — `rec8vPBEouiW1nr8h` (#8); companies `cmp_7db0849ddbf577d5` | 11 sources | **2** | 2 | ✅ |

Published samples (private artifacts):

- Standard — The Power Reckoning: https://claude.ai/artifact/HFxnDeB3AMWwC3GqRFo5SP
- Profile — CoreWeave: https://claude.ai/artifact/T7m98HMAu3a6EHP5ciDFSd

## Method

1. **Data.** Each sample is one JSON file in `docs/templates/samples/data/`. The `record` block
   maps the Airtable Draft row onto the BL-03 `briefings` columns (`public.briefings` does not
   exist in production yet). Facts were read from Supabase `ycadmmngkdhvpcsrcuaq` with SELECT only
   (`signals`, `artifacts`, `companies`, `faraday_domains`, `faraday_subdomains`) and from the
   Airtable Library with read-only list calls. Gamma was not used; the Draft rows' Gamma URLs were
   not opened.
2. **Render.** `node scripts/templates/render.mjs` builds `docs/templates/samples/<slug>.html`,
   then prints each page with Playwright 1.56.1 driving Chromium build 1194 at
   `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (no `playwright install`).
3. **PDF settings.** `page.pdf({ format: 'Letter', printBackground: true })`. No margin override is
   passed, so margins are the default for the call and the template's own `@page` rule applies
   (`size: Letter; margin: 0.7in 0.75in 0.75in`). The page is loaded with
   `waitUntil: 'networkidle'`, and every face in use (Source Serif 4, IBM Plex Sans, IBM Plex Mono
   from Google Fonts) is awaited through `document.fonts.load` and `document.fonts.ready` before
   printing.
4. **Count.** Pages are counted from the PDF's `/Type /Page` objects and cross-checked with
   `pdftotext` page breaks. Two consecutive full runs returned identical counts.
5. **PDFs** are written to `$TMPDIR/bl09-pdf/` and are not committed.

## Source verification

All 107 distinct publisher URLs printed across the six samples were checked against production
with one read-only query: every URL exists in `public.artifacts.source_url` or
`public.signals.source_url`. Five match after normalisation only: three `blog.se.com` URLs printed
without their `utm_*` tracking parameters, and two `rtoinsider.com` URLs recorded protocol-relative
(`//www…`) and printed with `https:`.

Items dropped during curation: Signals mis-tagged to the Threads in scope (ABF substrates,
geothermal PPA, co-packaged optics, chip smuggling, MLCC supply), a Wikipedia summary, and one
report whose description of the Google–Constellation deal conflicted with three others. Where two
sources disagree on a figure that was kept (Schneider–PTC: $23.7 billion vs $22.6 billion), both
are printed with attribution.

## Fitting to range

- The Power Reckoning first rendered at 14 pages. It reached 10 by letting Threads after the first
  flow instead of each forcing a page, setting the source list in two columns, shortening the method
  note, and merging two Virginia merger entries into one entry with both citations. One glance-table
  row (TeraWulf) was removed; the fact is still in the Thread section. No sourced Signal was dropped.
- CoreWeave first rendered at 3 pages. Two Signals (after-hours share move, Spectrum-6 early
  deployer) were removed to meet the Profile limit of 8 Signals, and the compact Signal styles were
  tightened. Schneider Electric first rendered at 3 pages; its two PTC entries were merged and one
  summary sentence was removed.
- No sample was padded. Under-length was never the problem: every Standard subject had more
  sourced Signals than the budget holds.

## Open items for review

- **Profiles and Faraday's Take.** Brand Bible §06 puts a Take on every Briefing; the Profile rule
  in this ticket (sourced facts only) omits it. Needs Myke's call.
- **CTA.** No sample carries a call-to-action. Adding one waits for Myke's approval of `profile.md`.
- **`source_refs` shape.** `standard.md` §1 proposes an element shape for BL-03's open `jsonb`.
- **Primary-article re-fetch.** Sample sentences restate Faraday's recorded Signal framing and
  artifact summaries; the publisher articles were not re-fetched for this pass.
