# Airtable Briefing Library → `public.briefings` field map (BL-04 / FDY-170)

Source: Airtable base `appxfti7VuoHYUeu6`, table `tbl4kbby85nx6Z891` ("Briefing Library").
Target: `public.briefings` as defined by BL-03 (`supabase/migrations/20261013120000_bl03_briefings_canonical.sql`).
Read read-only on 2026-10-13 with the Airtable MCP (`list_tables_for_base` for names and types,
`list_records_for_table` for all 436 records in one page; `totalRecordCount` = 436).
This issue absorbs **FDY-160** (briefing type, byline, hypothesis, contents) and **FDY-162**
(repoint links off the retired IDF registries and Tracking Companies).

## Baseline check

| Item | Ticket baseline | Observed 2026-10-13 | |
|---|---:|---:|---|
| Records | 436 | 436 | match |
| Draft | 79 | 79 | match |
| Coming Soon | 357 | 357 | match |
| Live | 0 | 0 | match |
| Retired | 0 | 0 | match |
| Fields | 14 | 14 | match |
| Linked-record fields | 4 | 4 | match |

## The 14 fields

| # | Field | ID | Type | Populated | `briefings` column | Rule / reason |
|---|---|---|---|---:|---|---|
| 1 | Briefing Title | `fldim88BwzzAKTnyn` | singleLineText | 436 | `title` | Copied, leading/trailing whitespace trimmed (one record, `recQUIazoZVLifdSa`, has a trailing space). |
| 2 | Briefing Id | `fldyf4v88gMJ5C9Ow` | autoNumber | 436 | — **dropped** | Airtable row counter. `airtable_record_id` is the migration trail. See gap G7 if the number must survive. |
| 3 | Briefing description | `fldzCX0KJ0sfrGmcd` | multilineText | 436 | — **no column (gap G1)** | 416 are the boilerplate "Placeholder — briefing forthcoming…"; the 20 others are real abstracts. Not loaded. |
| 4 | Status | `fldyhqKdqOibnhGgp` | singleSelect | 436 | `status` | Live→`published`, Draft→`draft`, Coming Soon→`planned`, Retired→`retired`. Any other value stops the load. |
| 5 | Gamma URL | `fld1CaAL2JCVA0piy` | url | 19 | — **no column (gap G2)** | Rendered deck link. Not loaded. |
| 6 | Gamma ID | `fldg4RhWybQGXFwjA` | singleLineText | 19 | — **no column (gap G2)** | Gamma file id. Not loaded. |
| 7 | Attachments | `fldjZLGWyJDTHN64R` | multipleAttachments | **0** | — (gap G5) | No record carries an attachment, so there is nothing to upload. Inventory: `attachments-inventory.csv` (header only). |
| 8 | Download counter | `fld2FLPk7QnqHaSAJ` | number | 0 | — **dropped** | Empty on all rows. Downloads are counted by the commerce path (`library_checkout`), not the catalog record. |
| 9 | Canonical flag | `fldwZcgAavE0InHni` | singleLineText | 435 | — **no column (gap G6)** | `Placeholder` 416, `Yes` 19, blank 1. Placeholder status is already carried by `status='planned'` for the 357 Coming Soon rows; 59 Drafts are also flagged Placeholder (BL-07 "stubs"). |
| 10 | Go live Date | `flddONEuVoj4stpz6` | date | 0 | `published_at` | Set only when status maps to `published` (00:00 UTC). Empty on all rows, so `published_at` is NULL everywhere. |
| 11 | IDF Domain | `fld3SAvJO9NCxm7gQ` | multipleRecordLinks → IDF Domain Registry `tbltFtmWgBYPuRLSc` (retired) | 18 | `sector_id` → `faraday_domains.domain_code` | Resolved through the retired registry's own **Domain ID** field (`fldljR88WnQlnzj0g`, e.g. `D2`), which equals `faraday_domains.domain_code`. A key join, not a name match. |
| 12 | IDF Subdomain | `fldjtSjtK8l1N6Dqs` | multipleRecordLinks → IDF Sub-Domain Registry `tbla7rtRY9AaeoWhu` (retired) | 59 | `thread_id` → `faraday_subdomains.subdomain_code` | The retired registry has **no code field**, so the key is the name: (1) exact normalised name = `display_name`; else (2) BL-07's hand-reviewed title match for that briefing record, accepted only if the linked registry name equals the title's sub-domain part. |
| 13 | Tracking Companies | `fldcjHEEy3SUclWqY` | multipleRecordLinks → Tracking Companies `tbluDYoK8Nj2DGQ0r` (retired) | 365 | `company_id` → `companies.company_uid` | Key join on `companies.airtable_record_id` (358 production rows carry one). |
| 14 | IDF Theme | `fldC9T9Dm59g2qRHn` | multipleRecordLinks → IDF Theme Registry `tbl9BRMxHm5fL8oy5` (retired) | 14 | `theme_tags` (text[] of `faraday_themes.theme_code`) | The retired registry has no code field: exact name match to `faraday_themes.name`. |

Not sourced from Airtable, so loaded as their defaults: `tier` NULL, `page_target` NULL,
`source_refs` NULL, `institution_id` NULL (no Airtable field links an institution), `version` 1.

## FDY-162: repointing the four retired link fields

The four link targets (IDF Domain, Sub-Domain and Theme Registries; Tracking Companies) were retired
by IDF 5.0 on 2026-08-26. The loader never writes back to them; it reads each linked record id
and resolves it to the canonical Supabase key above, so `briefings` depends only on
`faraday_domains`, `faraday_subdomains`, `faraday_themes` and `companies`. The Airtable link fields
themselves are left untouched (Airtable is read-only for this issue), which matches FDY-162's
recommended option (keep links, stop depending on them).

Resolution results (436 records):

| Link | Records with a link | Resolved into the column | Unresolved | Resolved but not storable |
|---|---:|---:|---:|---:|
| Tracking Companies → `company_id` | 365 | 358 (key join) | 6 (no `companies` row) | 1 record, 2 companies (Williams vs. Enbridge) |
| IDF Subdomain → `thread_id` | 59 | 58 (45 exact name, 13 BL-07 reviewed) | 1 (Jurisdiction Posture Intelligence (JPS) — Jurisdiction Watch scope) | 0 |
| IDF Domain → `sector_id` | 18 | 6 (Domain ID) | 0 | 12 records with 2 domains each |
| IDF Theme → `theme_tags` | 14 | 11 (exact name) | 3 links to "The Rack Revolution" (no `faraday_themes` row) | 0 |

Every unresolved or unstorable link is a row in `unmatched-links.csv` (36 rows). "The Rack
Revolution" was **not** mapped to `T-002 The Thermal Reckoning`: the names differ, and no record
says one replaced the other. `EQT — The Capital Allocation Engine…` (`recc8hUIzF49p1p9I`) has an
empty Tracking Companies link; BL-07 matched it to EQT by name, but this loader resolves links
only, so its `company_id` stays NULL.

## FDY-160: briefing type, byline, hypothesis, contents

The Airtable table has **none** of the five fields FDY-160 needs ("Briefing Type", "Byline",
"Hypothesis", "Contents", "Last Refreshed" — confirmed absent from the 14 fields above), and
**BL-03's `briefings` has no column for any of them either**. Nothing was inferred: the loader
does not derive a type from IDF placement or a byline from type (FDY-160 decision 3: an empty type
is not inferred). `tier` (deep/standard/profile) is a length tier, not the briefing type.

## Schema gaps (proposed columns — no migration added in BL-04)

| Gap | Needed by | Proposed column |
|---|---|---|
| G1 | Briefing description (20 real abstracts) | `description text` |
| G2 | Gamma URL / Gamma ID (19 rows) | `gamma_id text`, `gamma_url text` |
| G3 | FDY-160 briefing type | `briefing_type text check (briefing_type in ('theater','sector','thread'))` (FDY-157 names). The Brand Bible V2 "Public Coverage Vocabulary" section also names a "Company Briefing" shelf; whether `company` is a fourth value is Myke's call. |
| G4 | FDY-160 byline, hypothesis, contents, last refreshed | `byline text check (byline in ('Gilbert','Mach'))`, `hypothesis text`, `contents text[]` (one item per line), `last_refreshed date` |
| G5 | FDY-170 step 4 attachments | `attachment_paths text[]` (Storage paths in private bucket `briefing-attachments`) and `licence_flag text` (NULL unless the source states one). Moot today: 0 attachments. |
| G6 | Canonical flag | `is_placeholder boolean` if the Placeholder distinction must survive for Drafts; otherwise drop. |
| G7 | Airtable Briefing Id | `legacy_briefing_number int` only if anything outside Airtable cites it. |
| G8 | Multi-valued links (12 records with 2 domains, 1 with 2 companies) | `sector_ids text[]` / `company_ids text[]`, or a child table. BL-03 deliberately added no linkage table, so the loader leaves these NULL and lists them. |

The loader reads all these values (`unmappedValues` in `resolveRecord`) but writes none of them.
Once Myke approves columns, adding them to `BriefingRow` and `UPSERT_SQL` is the only change needed.
