# Entity universe: selection method (BL-07 / FDY-173)

`entity-universe.csv` proposes **347 briefings** for the Briefing Library V2, for Myke's review.
It also lists the **357 Airtable "Coming Soon" placeholders**. Those rows are not briefings
and are not counted. Nothing was written to Supabase or Airtable. Every input was read
read-only on 2026-10-13.

## Totals

| Entity type | Deep | Standard | Profile | Total |
|---|---:|---:|---:|---:|
| theme | 7 | | | 7 |
| domain | | 23 | | 23 |
| subdomain | | 117 | | 117 |
| company | 45 | 15 | 90 | 150 |
| institution | | | 50 | 50 |
| facility | | | | 0 |
| **Total** | **52** | **155** | **140** | **347** |

Page targets follow Brand Bible V2 §05: Deep 12, Standard 9, Profile 2. That gives 2,299 pages in all.

**Why themes, domains and sub-domains are included.** The ticket's company (120–160),
institution (40–60) and facility counts add up to at most 220. The minimum is 250. The Brand
Bible says the Library carries a briefing for each of the 7 Themes (Deep), 23 Domains (Standard)
and 117 Sub-Domains (Standard). So the IDF registry pool is counted as briefings at those tiers.
This also fills the Standard tier, which the ticket sets at about 150. If Myke would rather
treat the registry as tagging axes only, removing those 147 rows leaves 200. That is below the
floor, so more companies would be needed.

**Jurisdictions:** none. Jurisdiction Briefs stay on Jurisdiction Watch.
**Facilities:** none. No Airtable Briefing Library Draft names or links to a `dc_facilities` row.
All 79 Drafts are company, theme/topic or sub-domain records.

## Count checks (requested vs observed)

| Object | Ticket | Observed | Note |
|---|---:|---:|---|
| `faraday_themes` | 7 | 7 (all active) | match |
| `faraday_domains` | 23 | 23 (all active) | match |
| `faraday_subdomains` | 117 | **118** rows, 117 active | `D14.6 Site Certification & Readiness` is inactive and excluded |
| `companies` | ~7,688 | **8,189** rows | 6,804 with `pillar_status='company'`, 1,383 `relocated_jurisdiction`, 2 `disputed`. `tracking_companies` has 7,824. None of these is 7,688 |
| `institutions` | 176 | **183** (all `status='active'`, all with ≥1 `institution_domain_tags` row) | mismatch +7. `confidence_band`: 176 CF0 + 7 CF2, which may be where "176" came from |
| Airtable Coming Soon | 357 | **357** | match. 436 records total = 357 Coming Soon + 79 Draft, 0 Live |

## Inputs (read-only)

- Supabase project `ycadmmngkdhvpcsrcuaq`: `companies`, `company_domain_tags`,
  `company_signal_rollup`, `v_dc_facility_operator_party`, `institutions`,
  `institution_domain_tags`, `institution_sources`, `institution_aliases`, `faraday_themes`,
  `faraday_domains`, `faraday_subdomains`.
- Airtable base `appxfti7VuoHYUeu6`, table `tbl4kbby85nx6Z891` (Briefing Library): all 436
  records. Fields read: Briefing Title, Briefing Id, Status, Canonical flag, IDF Domain,
  IDF Subdomain, Tracking Companies, IDF Theme.

## Companies (150)

1. **Candidate pool:** the 358 companies with `airtable_record_id` set. These are the
   Airtable Tracking Companies, and they are exactly the 358 rows with a
   `player_classification`. Added to them is **EQT** (`cmp_5d801282d504a17b`): it has an
   Airtable Draft whose Tracking Companies link is empty, and it was matched on its exact
   canonical name. A candidate must have a primary `company_domain_tags` row on an active
   sub-domain, so that `sector`/`thread`/`theme` are real registry codes. 225 qualify.
   Eight alias or duplicate records were dropped in favour of their higher-signal twin:
   Castrol (BP), Crusoe Energy, Talen Energy / Susquehanna Nuclear, Digital Realty /
   PlatformDIGITAL, NTT / RagingWire, Motivair (by Schneider Electric), Schneider Electric
   IT (UK/EMEA) and run:ai (NVIDIA). **217 candidates** remain.
2. **Base score** (sector importance) =
   `ln(1+artifact_count) + 0.5·ln(1+mentions_90d) + 0.5·ln(1+facilities operated)
   + player weight + 0.1·tag count`. Player weights: Major Player 2.0, Investor/PE 1.5,
   Utility/Grid 1.5, Emerging 1.0, Standards/Regulatory Body 1.0, Watchlist 0.3, none 0.5.
3. **Selection:** the top 150 by base score **+3.0 if the company has an Airtable Draft**.
   This applies the ticket's "prefer companies with a Draft": all 10 company Drafts are
   selected (Schneider Electric, CoreWeave, Iron Mountain, Nebius, EdgeConneX, Accenture,
   Carrier Global, Enbridge, Williams Companies, EQT).
4. **Tier:** the 150 selected companies are re-ranked by base score alone, so the Draft
   bonus affects inclusion but not tier. Ranks 1–45 are Deep, 46–60 Standard and 61–150
   Profile.
5. `sector` = the domain of the primary sub-domain. `thread` = the primary sub-domain.
   `theme` = the first entry of that sub-domain's `theme_tags`.

```sql
with pool as (select * from companies where pillar_status='company' and airtable_record_id is not null),
tags as (select company_uid, jsonb_agg(jsonb_build_object('sd',subdomain_code,'p',is_primary)) tags
         from company_domain_tags group by 1),
f as (select company_uid, count(distinct facility_id) nf
      from v_dc_facility_operator_party where company_uid is not null group by 1)
select p.company_uid, p.airtable_record_id, p.canonical_name, p.player_classification,
       t.tags, r.artifact_count, r.mentions_90d, f.nf
from pool p left join tags t using (company_uid)
left join company_signal_rollup r using (company_uid) left join f using (company_uid);
```

## Institutions (50, Profile only)

Every institution has at least one `institution_domain_tags` row with `is_primary`.
Score = archetype weight + 0.4·tag count + 0.3·`institution_sources` rows. Archetype
weights: regulator 2.0, standards_body 1.8, research_institute 1.6, commercial_analyst 1.4,
industry_media 1.0, legislature 1.0. The top 50 are taken. Ties at the cut (score 2.90)
are broken alphabetically, so SEMI and Structure Research are in and TeleGeography is out.
Reviewers should look at the cut line.

```sql
select i.institution_uid, i.canonical_name, i.archetype_band, t.tags, s.ns
from institutions i
left join (select institution_uid, jsonb_agg(jsonb_build_object('sd',subdomain_code,'p',is_primary)) tags
           from institution_domain_tags group by 1) t using (institution_uid)
left join (select institution_uid, count(*) ns from institution_sources group by 1) s using (institution_uid);
```

## Themes, domains, sub-domains (147)

These come from `faraday_themes`, `faraday_domains` and `faraday_subdomains`, active rows only.
A domain's `theme` is the most frequent theme tag across its sub-domains. Airtable Drafts are
attached as follows:

- `The Power Reckoning` (recMlmb655VUUXSFl, plus an empty duplicate recQUIazoZVLifdSa) is the
  T-001 theme briefing, so it is marked `airtable_draft`.
- The 59 Drafts flagged `Canonical flag = Placeholder` and titled "Coming Soon — <sub-domain>"
  were name-matched to sub-domain codes. 56 were matched automatically: normalised name,
  difflib ratio ≥ 0.6, each pair checked by hand. 2 were set by hand: "Site Selection Criteria &
  Market Scoring" → D14.1 and "Behind-the-Meter Generation (BYOP/BYOG)" → D2.2. One was left
  unmatched on purpose: "Jurisdiction Posture Intelligence (JPS)", which belongs to Jurisdiction
  Watch. These 58 rows are marked `airtable_draft_stub`.
- The nine topic Drafts that are not entities are not separate rows. They are counted in the
  reason of the theme or domain they are tagged to. Examples: "8 Structural Shifts…", "Five
  Lurking Consolidation Waves", "What McKinsey Got Wrong".

## `source_status` values

| Value | Meaning | Rows |
|---|---|---:|
| `airtable_draft` | Airtable Draft with `Canonical flag = Yes` already covers this entity | 11 |
| `airtable_draft_stub` | Airtable Draft record exists but is a "Coming Soon" placeholder stub | 58 |
| `proposed_replaces_coming_soon` | New briefing. The company currently has an Airtable Coming Soon placeholder | 137 |
| `proposed` | New briefing with no Airtable record | 141 |
| `coming_soon` | Airtable Coming Soon placeholder. **Not a briefing.** | 357 |

The 357 `coming_soon` rows: 351 map to a `company_uid` through
`companies.airtable_record_id` and keep `entity_type='company'`. Their tier and page_target
are blank, and their reason says whether a proposed briefing row supersedes them (145 do).
The other 6 link Tracking Company records with no `companies.airtable_record_id` match. They
use `entity_type='airtable_placeholder'` and the Airtable record id. A company with both a
proposed row and a placeholder therefore appears twice: count real briefings with
`source_status <> 'coming_soon'`.

## Data issues for review

- Some primary sub-domain tags look wrong for sector: TSMC → D17.1 (construction labour),
  Accenture → D2.5 (nuclear offtake), Digital Realty Trust → D19.5 (tax-driven deal
  structuring), Switch → D3.2 (state moratorium). These are the tags in
  `company_domain_tags` and were used as found. Retagging belongs upstream.
- `Google / Alphabet` (cmp_2931ec6494bb700e) has no `company_signal_rollup` row, so it scores
  low and is not selected. `Google DeepMind` (cmp_2a566e4ec25cf707, 574 artifacts) carries the
  Google signal and is a Deep row. These may be an alias split.
- 134 of the 358 tracked companies have no primary domain tag. They could not be considered
  without inventing sector codes.
- The term "Key Player" is retired and does not appear in the CSV.
