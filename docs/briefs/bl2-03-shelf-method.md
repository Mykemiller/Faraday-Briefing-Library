# BL2-03 — tier and type every briefing; build the 467-row target shelf (FDY-279)

**Release 46-26-v01 · Briefing Library project · PR opened 2026-11-09 CT. The migration is NOT applied.**
Founder decision 4 (2026-11-09): the merged PR is the approval to apply; the Myke-present session that
merges it applies `supabase/migrations/20261109150000_bl2_03_tier_and_type.sql`, re-runs the §Verify
queries below, posts the counts as a Linear comment and writes one status-log line per lane.

Everything in this document was read **read-only** from Supabase project `ycadmmngkdhvpcsrcuaq`
on 2026-11-09 between 04:10 and 05:10 CT. The only writes made anywhere were two **self-rolling-back
dry runs** of the migration itself (see §5). The migration file is generated —
`node scripts/bl2-03/build-migration.mjs` — from three inputs and must never be hand-edited:

| Input | Role |
|---|---|
| `docs/briefs/entity-universe.csv` (BL-07) | the 347 tiered rows and the Airtable record ids their `reason` text cites; the 357 placeholders are not briefings |
| `docs/briefs/jurisdiction-scope.csv` (BL2-02) | states ranked 1–30 (Founder raised the 25 → 30; ranks 26–30 carry `in_scope=false` and are taken anyway) and the 15 `in_scope=true` countries |
| `scripts/bl2-03/pinned.json` | the ranked fill pool, the 27-row re-link map, the 3-row universe id remap and the lane quotas — read live 2026-11-09, pinned so the apply is deterministic and reviewable |

## 1. Target shelf (Founder-approved 2026-11-09)

| Type | `briefing_type` | Tier | Rows | Pages each |
|---|---|---|---:|---:|
| Theaters (themes) | `theater` | Deep | 7 | 12 |
| Domains | `sector` | Standard | 23 | 9 |
| Sub-domains | `thread` | Standard | 117 | 9 |
| Companies | `company` + `company_id` | Deep 45 · Standard 15 · Profile 165 | 225 | 12 / 9 / 2 |
| Institutions | `company` + `institution_id` | Profile | 50 | 2 |
| US states | `jurisdiction` (`US-XX`) | Standard | 30 | 9 |
| Countries | `jurisdiction` (ISO-2) | Standard | 15 | 9 |
| **Total** | | | **467** | |

The issue title still says "462-row shelf"; that is the pre-raise figure (25 states). The body table,
which the Founder approved, sums to 467, and the verification gate asserts 467.

## 2. What the migration does (one plpgsql block, every step set-based and idempotent)

0. **Preconditions.** BL2-01 applied (`briefing_lanes` exists, the five-type CHECK carries
   `jurisdiction`); no `published` rows; no temp residue. Then a pre-apply snapshot of every `briefings`
   row into `public.cc_bl203_briefings_pre` (RLS on, anon/authenticated revoked) — the rollback source.
1. **Pinned data** into temp tables. The three universe company ids that no longer exist in `companies`
   are remapped to their approved alias (§3.2); if two universe rows then name one company the lower
   tier collapses into the higher. Every active universe key is asserted against its registry.
2. **Re-link** the 27 planned rows whose `company_id` was NULL (the 21 links the 2026-11-06 registry
   refresh could not keep plus the 6 `no_registry_row` placeholders) by exact `companies.canonical_name`
   or **approved** `company_aliases.alias_raw` match. Every one resolved to exactly one live company;
   nothing is guessed. Sidecar: `docs/briefs/relinked-placeholders.csv`.
3. **Claim** one existing row per target entity, in this order: (a) the Airtable record id the universe
   row cites; (b) `company_id`; (c) `institution_id`, else the institution's linked `company_uid`;
   (d) registry key — but only rows an earlier run already typed, so a re-run is idempotent without
   repurposing untyped topic drafts; (e) `jurisdiction_id`; (f) fill companies by `company_id`.
   A record id cited by two universe rows (`recuyFtQu8Dud7Jes`, "Williams vs. Enbridge") claims neither.
   Ties: draft before planned, populated before empty, then `airtable_record_id`. One row ↔ one entity.
4. **Write** `tier`, `briefing_type`, `page_target`, `sector_id`, `thread_id`, `theme_tags` and the
   entity key on every claimed row. "Coming Soon — …" titles are replaced by the title format; real
   titles stay.
5. **Retire** every planned/draft row that claimed nothing (`status = 'retired'`; nothing is deleted).
   Sidecar: `docs/briefs/retired-placeholders.csv`.
6. **Insert** every entity no row carries, as `status = 'planned'`.
7. **Lane quotas:** theaters 2 · domains 6 · subdomains 15 · companies 25 · institutions 10 · states 6 ·
   countries 4.
8. **Verify** (raises and rolls back on any miss): counts by type × tier × status over planned+draft
   equal §1; 467 live rows; 0 non-retired rows with `tier` or `briefing_type` NULL; 0 published; one
   live row per entity key; every row's keys fit its type.

Title formats: theater → theme name · domain → `<name>: <short_desc>` · sub-domain →
`<name>: <parent domain short_desc>` · company / institution → `canonical_name` · jurisdiction →
`<Name> — Data Center Regulatory Landscape`.

## 3. Findings that changed the plan (all encoded in the migration)

### 3.1 Companies cap at 225 — placeholders beyond it retire
The prompt's step 2 would make every placeholder with a live company a Profile, and its step 3 would
then top companies up to 225. 330 placeholders already carry a live `company_id`, so step 2 alone
would put companies at ~480 and the verification gate could never pass. The only reading that
satisfies the Founder table is: BL-07's 150 universe companies keep their tiers; the remaining
75-ish Profile slots go to the top of the fill pool by `company_signal_rollup.mentions_30d`
(a placeholder row is reused when the company has one); every other placeholder retires with reason
`below_company_cut`. Retirement is a status flip and is reversible. **198 rows** take this path.

### 3.2 Three universe company ids no longer exist
Between the 2026-10-13 and 2026-11-06 snapshots `companies` lost three ids the universe names.
Each has an approved alias to a live row, so the universe row is remapped rather than dropped:

| Universe row | Old uid | Live uid (approved alias) | Effect |
|---|---|---|---|
| iMasons (Profile) | `cmp_2a3074b199bef915` | `cmp_0aef057334dc7e25` | company brief kept; institution `rb_01ced24541dc51a0` is a separate universe row |
| QTS Realty (Profile) | `cmp_f9613ad86c3c44d9` | `cmp_fa7f62de2e37d0a4` (QTS Realty Trust) | kept; the "QTS Realty Trust" placeholder is the superseded duplicate |
| Aligned Energy (Profile) | `cmp_a7c245701cf56e5f` | `cmp_c934dcac36290be5` (Aligned Data Centers) | **collapses** into the Deep Aligned Data Centers row |

So the universe contributes 149 companies and the fill takes **76**, not 75. Deep 45 and Standard 15
are untouched.

### 3.3 Fill pool: alias twins excluded
Ranking every live company with a primary tag by `mentions_30d` puts eight alias twins of universe
companies in the top 80 — Microsoft (vs Microsoft Azure), Google (vs Google DeepMind), Digital Realty
(vs Digital Realty Trust), QTS Realty Trust, Goldman Sachs (vs Goldman Sachs Alternatives), NTT (vs
NTT Global Data Centers), Siemens Energy (vs Siemens), Tencent (vs Tencent Cloud). A second brief for
the same operator under a sibling uid is not what "225 companies" means, so a word-prefix name match
against the universe excludes them (`pinned.json → fill_excluded_alias_collisions`). Companies that
are the linked `company_uid` of a universe **institution** are also excluded from the fill.

The pool is pinned at 80 ranked rows (snapshot `company_signal_rollup.refreshed_at` 2026-11-09 03:35
UTC) so the apply does not drift with the daily signal refresh. Rows 1–76 are taken.

### 3.4 Sub-domains have no registry description
`faraday_subdomains` carries `display_name` and `theme_tags` only; the Airtable sub-domain registry
snapshot has names only. The `<name>: <one-line>` format therefore borrows the **parent domain's**
`short_desc` (e.g. "GPU Architecture & Roadmap: GPU generations cause every downstream consequence").
Flagged in Questions for Myke; a sub-domain `short_desc` column is a registry follow-on.

### 3.5 Twelve real drafts have no single entity
Eleven Airtable Drafts are topic essays or comparisons ("8 Structural Shifts…", "Capital Flow…",
"Williams vs. Enbridge…", the empty duplicate of "The Power Reckoning", …) and one is the
"Jurisdiction Posture Intelligence (JPS)" stub whose sub-domain belongs to Jurisdiction Watch. The
first dry run showed the registry-key fallback silently adopting three of them as the D3 and D4
domain briefs and the T-004 theater brief — with their essay titles. That is an editorial call, so
the fallback now applies only to rows an earlier run already typed, and all twelve retire with
reason `draft_no_single_entity` / `no_resolvable_link`. Their content is untouched; see Q3.

### 3.6 Jurisdiction briefs' placement
Jurisdiction rows have no universe placement. They are filed under **D3 Grid & Regulatory** with
theme **T-001 The Power Reckoning** (D3's dominant theme in BL-07). Default, flagged (Q5).

## 4. Pre-apply state (read 2026-11-09)

| Measure | Value |
|---|---:|
| `briefings` rows | 436 (79 draft · 357 planned · 0 published · 0 retired) |
| rows with `tier` | 0 |
| rows with `briefing_type` | 0 |
| planned rows with `company_id` NULL | 27 |
| `briefing_lanes.daily_quota` | 0 on all seven lanes |
| `companies` | 6,750 (6,748 `pillar_status='company'`, 2 `disputed`) — the universe's 358-company pool shrank by 21 since 2026-10-13 |
| `institutions` | 183; all 50 universe institutions present |

## 5. Dry-run report (prod, rolled back, 2026-11-09 ≈ 05:00 CT)

The migration is a single `DO` block with a constant `v_dry_run`. The dry-run copy sets it `true`,
which makes the block `RAISE` after §8 so the whole transaction rolls back with the verification
report in the message. Run twice (the second to page the decision list past the client's message
cap); both verified identically. Zero residue confirmed afterwards: 436 rows, 0 retired, 0 tiered,
27 unlinked, no snapshot table, lanes at 0, no migration history row.

```
relinked=27 updated=211 retired=225 inserted=256 fill_taken=76
company/company    · deep     · expected 45  · actual 45  (planned 40, draft 5)
company/company    · profile  · expected 165 · actual 165 (planned 162, draft 3)
company/company    · standard · expected 15  · actual 15  (planned 15, draft 0)
company/institution· profile  · expected 50  · actual 50  (planned 50, draft 0)
jurisdiction/country · standard · expected 15 · actual 15 (planned 15, draft 0)
jurisdiction/state   · standard · expected 30 · actual 30 (planned 30, draft 0)
sector  · standard · expected 23  · actual 23  (planned 23, draft 0)
theater · deep     · expected 7   · actual 7   (planned 6, draft 1)
thread  · standard · expected 117 · actual 117 (planned 59, draft 58)
live rows (planned+draft) = 467 (expected 467)
non-retired rows with tier NULL = 0 (expected 0)
published rows = 0 (expected 0)
duplicate live entity keys = 0 (expected 0)
lanes: companies=25 countries=4 domains=6 institutions=10 states=6 subdomains=15 theaters=2
claims by via: airtable_record_id=203, company_id=5, fill:company_id=3
inserts by type: company=123, jurisdiction=45, sector=23, theater=6, thread=59
```

Retired, by reason (`docs/briefs/retired-placeholders.csv`, 225 rows):

| reason_code | Rows | Meaning |
|---|---:|---|
| `below_company_cut` | 198 | live company, outside the 225 (not in the universe, below fill rank 76) |
| `superseded_duplicate_row` | 15 | another row already carries the company (Accenture, Carrier, Castrol (BP), CoreWeave, Crusoe Energy, Iron Mountain, Motivair, Nebius, NTT ×2, QTS Realty Trust, Schneider ×2, Talen, Aligned Energy) |
| `draft_no_single_entity` | 11 | topic/comparison drafts + the empty Power Reckoning duplicate (§3.5) |
| `no_resolvable_link` | 1 | the JPS stub |

Of the 27 re-linked rows, 6 become the company's briefing, 8 are superseded by a sibling row for the
same company and 13 fall below the cut (`docs/briefs/relinked-placeholders.csv`). Unresolved: 0.

After apply, 467 live rows = 211 existing rows re-typed (203 by cited record id, 5 by company id,
3 placeholders reused by fill companies) + 256 inserted. Of the 79 Drafts, 67 keep their content and
titles on the shelf (10 company briefs, The Power Reckoning, 56 sub-domain stubs); 12 retire.

## 6. Verify after apply

```sql
select briefing_type, tier, status, count(*) from briefings
 where status in ('planned','draft') group by 1,2,3 order by 1,2,3;
select count(*) from briefings where status <> 'retired' and tier is null;        -- 0
select count(*) from briefings where status = 'published';                        -- 0
select count(*) from briefings where status in ('planned','draft');               -- 467
select count(*) from briefings where status = 'retired';                          -- 225
select lane, daily_quota from briefing_lanes order by lane;                       -- 25 4 6 10 6 15 2
select count(*) from cc_bl203_briefings_pre;                                      -- 436
```

Expected type × tier over planned+draft: theater/deep 7 · sector/standard 23 · thread/standard 117 ·
company/deep 45 · company/standard 15 · company/profile 215 (165 companies + 50 institutions) ·
jurisdiction/standard 45.

## 7. Rollback

```sql
update briefings b set
  title = p.title, tier = p.tier, status = p.status, page_target = p.page_target,
  sector_id = p.sector_id, thread_id = p.thread_id, theme_tags = p.theme_tags,
  institution_id = p.institution_id, company_id = p.company_id, jurisdiction_id = p.jurisdiction_id,
  briefing_type = p.briefing_type
from cc_bl203_briefings_pre p where p.id = b.id;
-- the 256 inserted rows are the ones with airtable_record_id is null and created_at >= the apply time;
-- retire or remove them in a Myke-present session (removal is a destructive statement by the house rule).
update briefing_lanes set daily_quota = 0;
```

## 8. Questions for Myke

1. **462 vs 467.** The issue title says 462 (25 states); the approved table says 467 (30 states). The
   migration asserts 467. Default: 467.
2. **Companies hard-capped at 225.** 198 placeholders with live companies retire as `below_company_cut`
   rather than becoming Profiles (§3.1). Default: as shipped (status flip, reversible; re-admit any by
   setting status back and giving it tier/type).
3. **Twelve real drafts retire** (§3.5) rather than being adopted as the D3/D4 domain or T-004 theater
   briefs. Default: retire; alternative: name which draft becomes which registry brief.
4. **Sub-domain titles borrow the parent domain's `short_desc`** because the registry has no sub-domain
   description (§3.4). Default: as shipped; follow-on: add `faraday_subdomains.short_desc`.
5. **Jurisdiction briefs filed under D3 / T-001** (§3.6). Default: as shipped.
6. **Eight alias twins excluded from the fill** (§3.3). Default: excluded.
7. **Three universe ids remapped**, Aligned Energy collapsing into Aligned Data Centers, so the fill
   takes 76 (§3.2). Default: as shipped.
8. **Ready to apply** on merge; the applying session also posts the §6 counts to FDY-279 and one
   status-log line per lane.

## 9. Not done here

- The migration is not applied; `library_catalog_cache` is not re-synced (the sync will pick up the
  467 planned/draft rows as Coming Soon and drop the retired ones on its next run).
- No generation, no `briefings_versions` rows, no cron. The lane runner (BL2-04) now has quotas but
  still needs BL2-05's generator.
- `cc_bl203_briefings_pre` should be removed in a Myke-present session once the shelf has settled.
- Branch note: the issue named `brief/bl2-03-shelf`; this session's harness pins its work to
  `claude/exciting-fermi-agv6ng`, so the PR comes from that branch (the BL2-04 precedent).
