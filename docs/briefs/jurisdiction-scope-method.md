# Jurisdiction scope: selection method (BL2-02 / FDY-278)

`jurisdiction-scope.csv` ranks all 52 US state-level jurisdictions and the 145 non-US
countries that carry any signal in the Faraday Supabase and proposes **25 states + 15
countries** (`in_scope = true`) as Standard-tier (9 pp) jurisdiction briefings for the
Briefing Library V2.0 regeneration. Founder decision recorded in FDY-278: both lists are in
scope even though states and counties are Jurisdiction Watch territory; jurisdiction
briefs cite the JW tables as sources and never fork their data.

Every input was read **read-only** from Supabase project `ycadmmngkdhvpcsrcuaq` on
**2026-11-09 between 01:17 and 01:26 CT**. Nothing was written to Supabase, Airtable or
Jurisdiction Watch. The 12-month window is 2025-11-09 → 2026-11-09; the 90-day window is
2026-08-11 → 2026-11-09.

## Result

**States (25):** VA, TX, OH, GA, WA, CA, IL, AZ, NJ, MI, NY, PA, NC, IN, TN, KY, UT, IA, FL,
MN, WI, OK, KS, AL, NM.

**Countries (15):** CN, JP, GB, CA, IN, AU, SG, DE, FR, NL, KR, BR, AE, SE, IE.

Closest cuts, for Myke's eye: **Oregon** (rank 26) has the 4th-largest MW footprint
(8,097 MW) but only 7 regulatory items and 3 signals; **Italy** (rank 16) tied with Ireland
on score and lost on signal volume. **No country was replaced under the 6-signal floor** —
the thinnest selected country (Netherlands) has 44 sourced signals.

## Scoring

Each list is scored exactly as the ticket specifies: three components, each turned into a
competition rank (`rank()`, 1 = best, ties share a rank), and **score = the sum of the three
ranks** (lower is better). The final `rank` column is a strict ordering of score with
documented tie-breaks. `in_scope` is the top 25 (states) and top 15 (countries).

### States

| Component | CSV metric | Definition | Tables |
|---|---|---|---|
| 1 | `mw_planned_plus_operating` | Σ `capacity_unspecified_basis_mw` over `dc_facility_current` rows with `country_code='US'`, lifecycle `operational` (operating) plus `construction`/`permitted`/`announced` (planned). Rows with lifecycle `unknown` are excluded (3,405 MW nationally, reported per state in the reason). State = `jurisdictions.state_abbr` via `jurisdiction_id`; fallback parses `subdivision_code` when it is `XX` or `US-XX`. | `dc_facility_current`, `jurisdictions` |
| 2 | `legislative_regulatory_items_12m` | Count of items in the JW regulatory ingest tables dated in the last 12 months: LegiScan bills (`coalesce(last_action_date,status_date)`), PUC dockets (`filed_date`, all dockets, DC-relevant flag noted), Moratorium Nation local instruments (`date_enacted_iso`), NCSL moratorium bills (all 16, the tracker is a current-session page), opposition events (`event_date`). | `ref_legiscan_bills`, `puc_dockets`, `moratorium_nation_inventory`, `ncsl_moratorium_bills`, `opposition_signals`, `jurisdictions` (state FIPS and state_abbr) |
| 3 | `signals_90d` | Count of `signals` fired in the last 90 days whose artifact title (`artifacts.signal_envelope->>'title'`) or `signals.framing` names the state (word-boundary match on the state name). "West Virginia" is removed before matching "Virginia"; "Washington D.C." and "Washington Post" are removed before matching "Washington". | `signals`, `artifacts` |

Tie-break on equal score: higher MW total, then more facilities, then state code. Ties
that occurred: VA/TX (5), WA/CA (29), MI/NY (44), NC/IN (51), TN/KY (52), UT/IA (56),
MN/WI (62), KS/AL (74), OR/NV/CO (77), MD/MO (78), SC/NE/AR (88). None of these straddles
the cut at rank 25/26 (NM 76 vs OR 77).

### Countries

The candidate universe is the 192 `jurisdictions` rows with `level='country'` other than
the US (the domestic pipeline scores the US; sanctioned countries have no row by design).
Only the 145 with at least one facility, company or signal are written to the CSV.

| Component | CSV metric | Definition | Tables |
|---|---|---|---|
| 1 | `hyperscale_operator_facilities` | Count of `dc_facility_current` rows in the country whose `operator_parent`/`operator` matches a hyperscale operator (Amazon/AWS, Microsoft/Azure, Google/Alphabet, Meta/Facebook, Oracle, Alibaba, Tencent, Huawei, Apple, Baidu, ByteDance, IBM Cloud). Ties broken by total facility count. **Deviation:** the ticket asks for hyperscale *capacity*; `dc_facilities` carries MW on exactly one non-US row (75 MW, Finland), so capacity cannot be summed outside the US and a facility count is the honest proxy. | `dc_facility_current` |
| 2 | `policy_regulatory_signals_12m` | Distinct artifacts linked to the country through `artifact_jurisdictions` and published in the last 12 months whose `ifs_domains` include a policy/regulatory domain (**D3** Grid & Regulatory, **D15** Sovereign AI & Geopolitics, **D18** Community Opposition & Regulatory Risk, **D19** Tax, Incentives & Fiscal Policy), plus `signals` in the last 12 months that name the country (title or framing, with aliases such as UK/Britain, UAE/Dubai, Korea, Dutch, Saudi) and carry one of those domains in `domain_tags`. | `artifact_jurisdictions`, `artifacts`, `signals`, `faraday_domains` (domain names), `jurisdictions` |
| 3 | `companies_domiciled` | Count of `companies` rows with `pillar_status='company'` whose `domicile_country` (fallback `hq_country`) is the country. `hq_country` alone is populated on only 319 of 6,804 companies; `domicile_country` on 5,018, so domicile is the primary field. | `companies` |

`sourced_signals_12m` (countries only) = distinct linked artifacts in 12 months (any
domain) + name-matching signals in 12 months. It is the "sourced signals" count behind the
ticket's **≥ 6 rule**: a country in the raw top 15 with fewer than 6 is dropped and the
next ranked eligible country promoted, with both marked in `reason`. This did not fire.

Tie-break on equal score: more sourced signals, then more facilities, then country code.
Ties that occurred: KR/BR (41), **IE/IT (59, the cut)**, ES/TW (68), FI/CH (80).

## Data limits worth knowing before the briefs are written

- **`artifact_jurisdictions` was last resolved on 2026-08-01** (one batch). Country
  artifact counts therefore cover 2025-11-09 → 2026-08-01, about nine of the twelve
  months, and the state-level links in that table were not used (0 rows in the 90-day
  window). The text match on `signals` covers the full window for both lists.
- **PUC dockets exist for TX and VA only** (the FAR-353 pilot states), so component 2
  carries 224 (VA) and 248 (TX) dockets no other state can have. Both states rank 1–2 on MW
  regardless, so the top of the list does not depend on it.
- **LegiScan has 0 Texas bills with action in the window.** Texas sits at 293 regulatory
  items without them.
- **`dc_facilities` lifecycle is `unknown` on 16,423 of 18,217 rows** and MW is populated
  on 1,336 US rows only, all through `capacity_unspecified_basis` observations. State MW
  totals are therefore a lower bound; the facility count per state is in the reason text.
- **Country-name text matching is approximate.** "Georgia" the country is matched only on
  "Republic of Georgia"/"Tbilisi" so it does not absorb the US state; demonyms are included
  for the 25 largest markets. Numbers are counts of mentions in Faraday's own signal stream,
  not an external measure of market size.
- **Companies' domicile is 74% populated** (5,018 of 6,804). The remaining 1,786 rows do
  not count toward any country.
- Hyperscale operator matching is on free-text operator names and will miss hyperscale
  campuses recorded under a colocation landlord or a project SPV.

## Reproducing

The two ranking queries are plain SQL over the tables above (CTEs: facilities → state or
country, regulatory union, signal text match, `rank()` per component, `row_number()` for
the final order, `string_agg` to CSV). They are deterministic for a given run date; rerun
with the same cutoff to reproduce the file byte for byte, or with a later cutoff to refresh
the lists before a BL2-03 run.
